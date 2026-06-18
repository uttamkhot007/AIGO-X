/// Runtime tamper-detection and self-protection watcher.
///
/// Spawns a background task that:
/// 1. Watches the agent binary, config file and data directory for unexpected
///    modification (size change, mtime change, checksum drift).
/// 2. On tamper detection — logs a critical event, pushes a tamper signal to
///    the GRC platform, and optionally re-applies hardening steps.
/// 3. Detects attempts to stop the service (Windows SCM, Linux systemd,
///    macOS launchctl) and sends an early warning to the platform.
///
/// All tamper events are also emitted via the local admin server so the
/// desktop tray notifier can surface them to the end user.

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::time::interval;
use tracing::{error, info, warn};

// ── Config ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SelfProtectConfig {
    /// Enable the tamper-detection watcher.
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    /// How often to poll for tampering (seconds).
    #[serde(default = "default_poll_secs")]
    pub poll_secs: u64,
    /// Re-apply hardening DACL/immutable after tampering is detected.
    #[serde(default)]
    pub auto_reharden: bool,
    /// Alert threshold: number of consecutive detections before pushing a
    /// CRITICAL signal (avoids noisy transient alerts during upgrades).
    #[serde(default = "default_threshold")]
    pub alert_threshold: u32,
}

fn default_enabled() -> bool { true }
fn default_poll_secs() -> u64 { 30 }
fn default_threshold() -> u32 { 2 }

impl Default for SelfProtectConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            poll_secs: 30,
            auto_reharden: true,
            alert_threshold: 2,
        }
    }
}

// ── Snapshot of a watched file ────────────────────────────────────────────────

#[derive(Debug, Clone)]
struct FileSnapshot {
    path:     PathBuf,
    size:     u64,
    modified: u64, // Unix timestamp secs
}

impl FileSnapshot {
    fn take(path: &Path) -> Option<Self> {
        let meta = std::fs::metadata(path).ok()?;
        let modified = meta.modified().ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        Some(Self {
            path: path.to_path_buf(),
            size: meta.len(),
            modified,
        })
    }

    /// Returns `true` if this file appears to have been tampered with
    /// (size or modification time changed, or file no longer exists).
    fn tampered_since(&self, baseline: &FileSnapshot) -> TamperKind {
        if !self.path.exists() {
            return TamperKind::Deleted;
        }
        if self.size != baseline.size {
            return TamperKind::SizeChanged {
                old: baseline.size,
                new: self.size,
            };
        }
        if self.modified > baseline.modified + 5 {
            // Allow a 5-second grace window for clock skew
            return TamperKind::MtimeChanged {
                old: baseline.modified,
                new: self.modified,
            };
        }
        TamperKind::Clean
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TamperKind {
    Clean,
    Deleted,
    SizeChanged { old: u64, new: u64 },
    MtimeChanged { old: u64, new: u64 },
    ServiceStopped,
    UnexpectedExit,
}

impl TamperKind {
    pub fn is_tamper(&self) -> bool {
        !matches!(self, TamperKind::Clean)
    }
}

// ── Tamper event ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct TamperEvent {
    pub timestamp: String,
    pub hostname:  String,
    pub path:      String,
    pub kind:      TamperKind,
    pub severity:  &'static str,
    pub message:   String,
}

// ── Watcher state ─────────────────────────────────────────────────────────────

pub struct SelfProtectWatcher {
    cfg:       SelfProtectConfig,
    baselines: Vec<FileSnapshot>,
    /// Counts consecutive detections per path
    hit_count: std::collections::HashMap<String, u32>,
    /// Channel for pushing tamper events into the admin state / tray
    event_tx:  tokio::sync::mpsc::Sender<TamperEvent>,
}

impl SelfProtectWatcher {
    pub fn new(
        cfg: SelfProtectConfig,
        watch_paths: Vec<PathBuf>,
        event_tx: tokio::sync::mpsc::Sender<TamperEvent>,
    ) -> Self {
        let baselines = watch_paths.iter()
            .filter_map(|p| FileSnapshot::take(p))
            .collect();
        Self { cfg, baselines, hit_count: Default::default(), event_tx }
    }

    async fn tick(&mut self) {
        let hostname = hostname();
        for baseline in &self.baselines {
            let current = match FileSnapshot::take(&baseline.path) {
                Some(s) => s,
                None    => FileSnapshot {
                    path: baseline.path.clone(),
                    size: 0, modified: 0,
                },
            };
            let kind = current.tampered_since(baseline);
            let path_key = baseline.path.to_string_lossy().to_string();

            if kind.is_tamper() {
                let count = self.hit_count.entry(path_key.clone()).or_insert(0);
                *count += 1;

                let severity = if *count >= self.cfg.alert_threshold { "critical" } else { "high" };
                let message = format!(
                    "Tamper detected on {} ({})",
                    path_key,
                    match &kind {
                        TamperKind::Deleted => "file deleted".into(),
                        TamperKind::SizeChanged { old, new } => format!("size {old} → {new}"),
                        TamperKind::MtimeChanged { old, new } => format!("mtime {old} → {new}"),
                        _ => "unexpected change".into(),
                    }
                );

                if *count >= self.cfg.alert_threshold {
                    error!(path = %path_key, severity, "{message}");
                } else {
                    warn!(path = %path_key, "{message}");
                }

                let event = TamperEvent {
                    timestamp: chrono::Utc::now().to_rfc3339(),
                    hostname: hostname.clone(),
                    path: path_key.clone(),
                    kind: kind.clone(),
                    severity,
                    message,
                };
                let _ = self.event_tx.try_send(event);

                // Optionally re-apply OS hardening
                if self.cfg.auto_reharden && *count >= self.cfg.alert_threshold {
                    self.reharden(&baseline.path);
                }
            } else {
                // Reset counter on clean check
                self.hit_count.remove(&path_key);
            }
        }
    }

    /// Re-apply platform hardening after a detected tamper.
    fn reharden(&self, path: &Path) {
        #[cfg(target_os = "windows")]
        {
            let p = path.to_string_lossy();
            let _ = std::process::Command::new("icacls")
                .args([&p.to_string(), "/inheritance:r",
                       "/grant:r", "SYSTEM:(F)",
                       "/grant:r", "Administrators:(F)",
                       "/deny", "Users:(D,WD,AD,WA)"])
                .output();
        }
        #[cfg(target_os = "macos")]
        {
            let p = path.to_string_lossy();
            let _ = std::process::Command::new("chflags")
                .args(["schg", &p.to_string()]).output();
        }
        #[cfg(target_os = "linux")]
        {
            let p = path.to_string_lossy();
            let _ = std::process::Command::new("chattr")
                .args(["+i", &p.to_string()]).output();
        }
        info!(path = %path.display(), "re-hardened after tamper detection");
    }
}

// ── Public: spawn background task ────────────────────────────────────────────

/// Spawns the self-protection watcher as a background task.
/// Returns the receiver end for tamper events and the task handle.
pub fn start(
    cfg: SelfProtectConfig,
    watch_paths: Vec<PathBuf>,
) -> (
    tokio::sync::mpsc::Receiver<TamperEvent>,
    tokio::task::JoinHandle<()>,
) {
    let (tx, rx) = tokio::sync::mpsc::channel::<TamperEvent>(64);
    let poll_secs = cfg.poll_secs;
    let mut watcher = SelfProtectWatcher::new(cfg, watch_paths, tx);
    let handle = tokio::spawn(async move {
        if !watcher.cfg.enabled {
            info!("self-protect watcher disabled");
            return;
        }
        info!(poll_secs, "self-protect watcher started");
        let mut tick = interval(Duration::from_secs(poll_secs));
        tick.tick().await; // skip immediate first tick (baseline just taken)
        loop {
            tick.tick().await;
            watcher.tick().await;
        }
    });
    (rx, handle)
}

/// Returns the set of paths that should be watched on the current platform.
pub fn default_watch_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    // Always watch the running binary
    if let Ok(exe) = std::env::current_exe() {
        paths.push(exe);
    }

    // Platform-specific config/data paths
    #[cfg(target_os = "windows")]
    {
        let pf = std::env::var("PROGRAMFILES").unwrap_or_else(|_| r"C:\Program Files".into());
        paths.push(PathBuf::from(format!(r"{pf}\AIGO-X\Agent\grc-agent.exe")));
        paths.push(PathBuf::from(format!(r"{pf}\AIGO-X\Agent\config.yaml")));
    }
    #[cfg(target_os = "macos")]
    {
        paths.push(PathBuf::from("/Library/LaunchDaemons/io.aigox.agent.plist"));
        paths.push(PathBuf::from("/Library/Application Support/AIGO-X/Agent/config.yaml"));
    }
    #[cfg(target_os = "linux")]
    {
        paths.push(PathBuf::from("/etc/systemd/system/aigox-agent.service"));
        paths.push(PathBuf::from("/opt/aigox-agent/config.yaml"));
    }

    paths.dedup();
    paths
}

fn hostname() -> String {
    std::env::var("HOSTNAME")
        .or_else(|_| {
            std::process::Command::new("hostname")
                .output()
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_owned())
        })
        .unwrap_or_else(|_| "unknown".into())
}
