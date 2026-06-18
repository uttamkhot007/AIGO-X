use serde::{Deserialize, Serialize};
use tracing::warn;

use crate::discovery::Inventory;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreatEvent {
    pub event_type: String,
    pub severity: ThreatSeverity,
    pub description: String,
    pub indicator: Option<String>,
    pub confidence: u8,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ThreatSeverity {
    Critical,
    High,
    Medium,
    Low,
    Info,
}

#[derive(Debug, Default)]
pub struct ThreatDetectionEngine {
    pub events: Vec<ThreatEvent>,
}

impl ThreatDetectionEngine {
    pub fn new() -> Self { Self::default() }

    /// Run behavioral analysis against the collected inventory.
    /// Returns detected threat events.
    pub fn analyze(&mut self, inv: &Inventory) -> Vec<ThreatEvent> {
        let mut events = vec![];

        // High-risk ports open — potential attack surface
        const HIGH_RISK: &[u16] = &[21, 23, 135, 445, 3389, 5900];
        let exposed: Vec<u16> = inv.open_ports.iter().copied()
            .filter(|p| HIGH_RISK.contains(p)).collect();
        if !exposed.is_empty() {
            events.push(ThreatEvent {
                event_type: "exposed_high_risk_port".into(),
                severity: ThreatSeverity::High,
                description: format!("High-risk ports exposed: {:?}", exposed),
                indicator: Some(exposed.iter().map(|p| p.to_string()).collect::<Vec<_>>().join(",")),
                confidence: 85,
                timestamp: chrono::Utc::now().to_rfc3339(),
            });
        }

        // No firewall detected
        if inv.firewall_enabled == Some(false) {
            events.push(ThreatEvent {
                event_type: "no_host_firewall".into(),
                severity: ThreatSeverity::High,
                description: "Host firewall is disabled — endpoint exposed to network threats".into(),
                indicator: None,
                confidence: 95,
                timestamp: chrono::Utc::now().to_rfc3339(),
            });
        }

        // Disk not encrypted
        if inv.encryption_status == "disabled" {
            events.push(ThreatEvent {
                event_type: "unencrypted_disk".into(),
                severity: ThreatSeverity::Medium,
                description: "Disk encryption is disabled — data at risk if device is lost or stolen".into(),
                indicator: None,
                confidence: 90,
                timestamp: chrono::Utc::now().to_rfc3339(),
            });
        }

        // SSH root login enabled (Linux)
        if inv.platform == "linux" && inv.ssh_root_login_disabled == Some(false) {
            events.push(ThreatEvent {
                event_type: "ssh_root_login_enabled".into(),
                severity: ThreatSeverity::High,
                description: "SSH root login is permitted — increases brute-force attack surface".into(),
                indicator: None,
                confidence: 95,
                timestamp: chrono::Utc::now().to_rfc3339(),
            });
        }

        // Excessive local admins
        let admin_count = inv.users.iter().filter(|u| u.is_admin).count();
        if admin_count > 2 {
            events.push(ThreatEvent {
                event_type: "excessive_local_admins".into(),
                severity: ThreatSeverity::Medium,
                description: format!("{admin_count} local administrator accounts detected"),
                indicator: None,
                confidence: 80,
                timestamp: chrono::Utc::now().to_rfc3339(),
            });
        }

        self.events.extend(events.clone());
        events
    }
}

#[derive(Debug, Default)]
pub struct SecurityManager {
    pub threat_engine: ThreatDetectionEngine,
}

impl SecurityManager {
    pub fn new() -> Self { Self::default() }

    pub fn scan(&mut self, inv: &Inventory) -> SecurityReport {
        let threats = self.threat_engine.analyze(inv);
        let critical = threats.iter().filter(|t| matches!(t.severity, ThreatSeverity::Critical)).count();
        let high = threats.iter().filter(|t| matches!(t.severity, ThreatSeverity::High)).count();
        SecurityReport { threats, critical_count: critical, high_count: high }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityReport {
    pub threats: Vec<ThreatEvent>,
    pub critical_count: usize,
    pub high_count: usize,
}
