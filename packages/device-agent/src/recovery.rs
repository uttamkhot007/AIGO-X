use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};
use std::time::Duration;
use tracing::{error, info, warn};

// ── Healing signals (atomic flags checked by the main run loop) ───────────────

/// Shared flags that recovery actions set to tell the main loop what to do next.
/// All flags are Arc so `HealingSignals` can be cloned cheaply and sent across tasks.
#[derive(Debug, Clone, Default)]
pub struct HealingSignals {
    /// Main loop should re-register with the server on the next tick.
    pub force_reregister: Arc<AtomicBool>,
    /// Main loop should run a full collection cycle immediately (bypass the ticker).
    pub force_collect: Arc<AtomicBool>,
    /// Main loop should reopen the offline SQLite store (e.g., after a write error).
    pub force_store_reopen: Arc<AtomicBool>,
}

impl HealingSignals {
    pub fn new() -> Self { Self::default() }

    pub fn trigger_reregister(&self) {
        self.force_reregister.store(true, Ordering::SeqCst);
        warn!("[healing] force_reregister signalled");
    }

    pub fn trigger_collect(&self) {
        self.force_collect.store(true, Ordering::SeqCst);
        warn!("[healing] force_collect signalled");
    }

    pub fn trigger_store_reopen(&self) {
        self.force_store_reopen.store(true, Ordering::SeqCst);
        warn!("[healing] force_store_reopen signalled");
    }

    pub fn needs_reregister(&self) -> bool { self.force_reregister.load(Ordering::SeqCst) }
    pub fn needs_collect(&self) -> bool { self.force_collect.load(Ordering::SeqCst) }
    pub fn needs_store_reopen(&self) -> bool { self.force_store_reopen.load(Ordering::SeqCst) }

    pub fn clear_reregister(&self) { self.force_reregister.store(false, Ordering::SeqCst); }
    pub fn clear_collect(&self) { self.force_collect.store(false, Ordering::SeqCst); }
    pub fn clear_store_reopen(&self) { self.force_store_reopen.store(false, Ordering::SeqCst); }
}

// ── Component health tracking ─────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ComponentHealth {
    Healthy,
    Degraded,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthStatus {
    pub component: String,
    pub health: ComponentHealth,
    pub failure_count: u32,
    pub last_checked: String,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveryResult {
    pub component: String,
    pub strategy: String,
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Default)]
pub struct HealthMonitor {
    statuses: Arc<RwLock<HashMap<String, HealthStatus>>>,
}

impl HealthMonitor {
    pub fn new() -> Self { Self::default() }

    pub fn record_success(&self, component: &str) {
        let mut map = self.statuses.write().unwrap();
        let entry = map.entry(component.to_string()).or_insert_with(|| HealthStatus {
            component: component.to_string(),
            health: ComponentHealth::Healthy,
            failure_count: 0,
            last_checked: chrono::Utc::now().to_rfc3339(),
            message: None,
        });
        entry.health = ComponentHealth::Healthy;
        entry.failure_count = 0;
        entry.last_checked = chrono::Utc::now().to_rfc3339();
        entry.message = None;
    }

    pub fn record_failure(&self, component: &str, message: &str) {
        let mut map = self.statuses.write().unwrap();
        let entry = map.entry(component.to_string()).or_insert_with(|| HealthStatus {
            component: component.to_string(),
            health: ComponentHealth::Healthy,
            failure_count: 0,
            last_checked: chrono::Utc::now().to_rfc3339(),
            message: None,
        });
        entry.failure_count += 1;
        entry.last_checked = chrono::Utc::now().to_rfc3339();
        entry.message = Some(message.to_string());
        entry.health = if entry.failure_count >= 3 {
            ComponentHealth::Failed
        } else {
            ComponentHealth::Degraded
        };
        warn!(
            component,
            failures = entry.failure_count,
            message,
            "component health degraded"
        );
    }

    pub fn get_all(&self) -> Vec<HealthStatus> {
        self.statuses.read().unwrap().values().cloned().collect()
    }

    pub fn get_failed(&self) -> Vec<HealthStatus> {
        self.statuses
            .read()
            .unwrap()
            .values()
            .filter(|s| s.health == ComponentHealth::Failed)
            .cloned()
            .collect()
    }

    pub fn reset_component(&self, component: &str) {
        let mut map = self.statuses.write().unwrap();
        map.remove(component);
    }
}

// ── Auto-recovery manager ─────────────────────────────────────────────────────

#[derive(Debug)]
pub struct AutoRecoveryManager {
    pub monitor: HealthMonitor,
    pub signals: HealingSignals,
    pub recovery_history: Vec<RecoveryResult>,
    consecutive_failures: HashMap<String, u32>,
}

impl AutoRecoveryManager {
    pub fn new() -> Self {
        Self {
            monitor: HealthMonitor::new(),
            signals: HealingSignals::new(),
            recovery_history: Vec::new(),
            consecutive_failures: HashMap::new(),
        }
    }

    /// Check for failed components and fire healing actions.
    /// Call this after every collection cycle.
    pub async fn run_recovery_cycle(&mut self) {
        let failed = self.monitor.get_failed();
        if failed.is_empty() { return; }

        for status in failed {
            let result = self.attempt_recovery(&status.component).await;
            if result.success {
                self.monitor.record_success(&status.component);
                info!(
                    component = %status.component,
                    strategy  = %result.strategy,
                    "auto-recovery action queued"
                );
                self.consecutive_failures.remove(&status.component);
            } else {
                error!(
                    component = %status.component,
                    message   = %result.message,
                    "auto-recovery failed"
                );
                *self.consecutive_failures.entry(status.component.clone()).or_insert(0) += 1;
            }
            self.recovery_history.push(result);

            // Limit history size
            if self.recovery_history.len() > 200 {
                self.recovery_history.remove(0);
            }
        }
    }

    async fn attempt_recovery(&self, component: &str) -> RecoveryResult {
        let strategy = self.select_strategy(component);
        info!(component, strategy = %strategy, "attempting auto-recovery");

        // Apply exponential back-off before signalling — prevents storm if server is down
        let consecutive = self.consecutive_failures.get(component).copied().unwrap_or(0);
        if consecutive > 0 {
            let wait = Duration::from_secs(2u64.saturating_pow(consecutive.min(6)));
            info!(component, wait_secs = wait.as_secs(), "backoff before recovery action");
            tokio::time::sleep(wait).await;
        }

        let message = match strategy.as_str() {
            "reconnect" => {
                // Signal main loop to re-register with the server
                self.signals.trigger_reregister();
                "Re-registration signalled — will reconnect on next tick".to_string()
            }
            "restart" => {
                // Signal main loop to force an immediate collection cycle
                self.signals.trigger_collect();
                "Immediate collection cycle signalled".to_string()
            }
            "reload" => {
                // Signal main loop to reopen the offline store
                self.signals.trigger_store_reopen();
                "Offline store reopen signalled".to_string()
            }
            _ => {
                self.signals.trigger_collect();
                "Generic restart: immediate collection cycle signalled".to_string()
            }
        };

        RecoveryResult {
            component: component.to_string(),
            strategy,
            success: true,
            message,
        }
    }

    fn select_strategy(&self, component: &str) -> String {
        match component {
            "api_client"    => "reconnect".into(),
            "offline_store" => "reload".into(),
            "collection"    => "restart".into(),
            _               => "restart".into(),
        }
    }

    /// Snapshot of all component health statuses (for admin UI / telemetry).
    pub fn health_snapshot(&self) -> Vec<HealthStatus> {
        self.monitor.get_all()
    }
}

impl Default for AutoRecoveryManager {
    fn default() -> Self { Self::new() }
}
