/// Platform tray / notification integration for the AIGO-X endpoint agent.
///
/// Provides two capabilities without any additional crate dependencies:
///
///   1. **OS notifications** — uses the native notification subsystem on each
///      platform (notify-send on Linux, osascript on macOS, PowerShell
///      New-BurntToastNotification on Windows 10/11) to surface agent events
///      to the logged-in user even when the admin-ui is not open.
///
///   2. **Dashboard launcher** — opens http://127.0.0.1:<port>/ in the
///      system's default browser so the user can reach the premium admin UI
///      with one click (or one tray-menu selection in a future native tray).
///
/// # Native tray icon (future)
/// A full icon-in-the-system-tray requires an event loop and native APIs.
/// When `tray-icon` + `winit` are added as optional Cargo deps (feature `tray`),
/// the `run_native_tray` function below can be wired in place of the
/// `TrayNotifier` polling loop.
use std::sync::{Arc, Mutex};
use tracing::{debug, info, warn};

use crate::admin::{AdminState, SharedAdminState};

// ── TrayNotifier ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct TrayConfig {
    /// Port the admin HTTP server is listening on (default: 7979).
    pub admin_port: u16,
    /// Minimum score drop (percentage points) that triggers a notification.
    pub notify_score_drop_threshold: u32,
    /// Whether desktop notifications are enabled.
    pub notifications_enabled: bool,
}

impl Default for TrayConfig {
    fn default() -> Self {
        Self {
            admin_port: 7979,
            notify_score_drop_threshold: 10,
            notifications_enabled: true,
        }
    }
}

pub struct TrayNotifier {
    cfg: TrayConfig,
    last_score: Arc<Mutex<Option<u32>>>,
    last_health: Arc<Mutex<Option<String>>>,
}

impl TrayNotifier {
    pub fn new(cfg: TrayConfig) -> Self {
        Self {
            cfg,
            last_score: Arc::new(Mutex::new(None)),
            last_health: Arc::new(Mutex::new(None)),
        }
    }

    /// Open the admin-ui dashboard in the system's default browser.
    pub fn open_dashboard(&self) {
        let url = format!("http://127.0.0.1:{}/", self.cfg.admin_port);
        info!(url = %url, "opening agent dashboard in browser");
        open_in_browser(&url);
    }

    /// Notify the user of a significant compliance score change.
    /// Only fires when the score drops by >= `notify_score_drop_threshold` points.
    pub fn on_score_update(&self, new_score: u32) {
        let mut guard = self.last_score.lock().unwrap();
        let should_notify = match *guard {
            None => false,
            Some(prev) => {
                prev > new_score
                    && (prev - new_score) >= self.cfg.notify_score_drop_threshold
            }
        };
        let prev = *guard;
        *guard = Some(new_score);
        drop(guard);

        if should_notify && self.cfg.notifications_enabled {
            let prev_val = prev.unwrap_or(new_score);
            let label = score_label(new_score);
            self.send_notification(
                "AIGO-X Agent — Score Drop",
                &format!(
                    "Compliance score fell from {prev_val} → {new_score} ({label}). \
                     Open the dashboard to review failing checks.",
                ),
                NotifUrgency::High,
            );
        }
    }

    /// Notify the user when the agent transitions to/from a degraded/unhealthy state.
    pub fn on_health_update(&self, health: &str) {
        let mut guard = self.last_health.lock().unwrap();
        let prev = guard.clone();
        *guard = Some(health.to_string());
        drop(guard);

        if !self.cfg.notifications_enabled { return; }

        let transitioned_to_bad = matches!(prev.as_deref(), Some("healthy") | None)
            && (health == "degraded" || health == "unhealthy");
        let transitioned_to_good = matches!(prev.as_deref(), Some("degraded") | Some("unhealthy"))
            && health == "healthy";

        if transitioned_to_bad {
            self.send_notification(
                "AIGO-X Agent — Health Degraded",
                &format!("Agent health changed to '{health}'. Check the admin dashboard."),
                NotifUrgency::High,
            );
        } else if transitioned_to_good {
            self.send_notification(
                "AIGO-X Agent — Recovered",
                "Agent health is back to healthy.",
                NotifUrgency::Normal,
            );
        }
    }

    /// Notify the user of a detected threat.
    pub fn on_threat_detected(&self, threat: &str) {
        if !self.cfg.notifications_enabled { return; }
        self.send_notification(
            "AIGO-X Agent — Threat Detected",
            threat,
            NotifUrgency::Critical,
        );
    }

    /// Send a desktop notification using the platform's native mechanism.
    fn send_notification(&self, title: &str, body: &str, urgency: NotifUrgency) {
        debug!(title, body, "sending desktop notification");
        #[cfg(target_os = "linux")]
        send_linux_notification(title, body, urgency);
        #[cfg(target_os = "macos")]
        send_macos_notification(title, body);
        #[cfg(target_os = "windows")]
        send_windows_notification(title, body, urgency);
        #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
        {
            let _ = urgency;
            info!(title, body, "notification (unsupported platform — logged only)");
        }
    }
}

// ── Background monitoring loop ─────────────────────────────────────────────────

/// Start a background tokio task that watches the shared admin state and
/// fires notifications when score drops or health degrades.
pub fn start_monitor(notifier: Arc<TrayNotifier>, state: SharedAdminState) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(60));
        loop {
            interval.tick().await;
            let (score, health) = {
                let guard = state.lock().unwrap();
                let score = guard.status.as_ref().and_then(|s| s.compliance_score);
                let health = guard.status.as_ref().map(|s| s.health.clone());
                (score, health)
            };
            if let Some(s) = score {
                notifier.on_score_update(s);
            }
            if let Some(h) = health {
                notifier.on_health_update(&h);
            }
        }
    });
}

// ── Urgency ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy)]
pub enum NotifUrgency {
    Normal,
    High,
    Critical,
}

impl NotifUrgency {
    fn as_linux_str(self) -> &'static str {
        match self {
            NotifUrgency::Normal   => "normal",
            NotifUrgency::High     => "critical",
            NotifUrgency::Critical => "critical",
        }
    }
}

// ── Platform implementations ───────────────────────────────────────────────────

#[cfg(target_os = "linux")]
fn send_linux_notification(title: &str, body: &str, urgency: NotifUrgency) {
    use std::process::Command;
    // notify-send is available on most GNOME/KDE/XFCE desktops.
    // Fails silently if not installed or if running headless — that is fine.
    let result = Command::new("notify-send")
        .args([
            "--app-name=AIGO-X Agent",
            "--icon=security-high",
            &format!("--urgency={}", urgency.as_linux_str()),
            title,
            body,
        ])
        .output();
    if let Err(e) = result {
        debug!("notify-send unavailable: {e}");
    }
}

#[cfg(target_os = "macos")]
fn send_macos_notification(title: &str, body: &str) {
    use std::process::Command;
    // osascript is always present on macOS.
    let script = format!(
        r#"display notification "{body}" with title "{title}" subtitle "AIGO-X Agent""#,
        body = body.replace('"', "'"),
        title = title.replace('"', "'"),
    );
    let result = Command::new("osascript").args(["-e", &script]).output();
    if let Err(e) = result {
        debug!("osascript notification failed: {e}");
    }
}

#[cfg(target_os = "windows")]
fn send_windows_notification(title: &str, body: &str, _urgency: NotifUrgency) {
    use std::process::Command;
    // PowerShell — available on Windows 10/11. BurntToast is optional;
    // we fall back to a WScript.Shell popup if it's not installed.
    let script = format!(
        r#"
try {{
    Import-Module BurntToast -ErrorAction Stop
    New-BurntToastNotification -Text '{title}', '{body}' -AppLogo $null
}} catch {{
    $w = New-Object -ComObject WScript.Shell
    $w.Popup('{body}', 5, '{title}', 64) | Out-Null
}}
"#,
        title = title.replace('\'', ""),
        body = body.replace('\'', ""),
    );
    let result = Command::new("powershell")
        .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &script])
        .output();
    if let Err(e) = result {
        debug!("Windows notification failed: {e}");
    }
}

// ── Browser open ───────────────────────────────────────────────────────────────

fn open_in_browser(url: &str) {
    #[cfg(target_os = "linux")]
    let result = std::process::Command::new("xdg-open").arg(url).spawn();

    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg(url).spawn();

    #[cfg(target_os = "windows")]
    let result = std::process::Command::new("cmd")
        .args(["/c", "start", url])
        .spawn();

    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    let result: Result<_, std::io::Error> = Err(std::io::Error::new(
        std::io::ErrorKind::Unsupported, "unsupported platform",
    ));

    match result {
        Ok(_)  => info!(url, "browser launched"),
        Err(e) => warn!(url, error = %e, "failed to open browser"),
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

fn score_label(score: u32) -> &'static str {
    match score {
        90..=100 => "Excellent",
        75..=89  => "Good",
        60..=74  => "Fair",
        40..=59  => "Poor",
        _        => "Critical",
    }
}
