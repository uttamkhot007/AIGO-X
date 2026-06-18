/// Local admin HTTP server (127.0.0.1:7979) — serves the premium admin-ui SPA
/// and exposes JSON API endpoints for the agent's current state.
///
/// API surface:
///   GET  /admin-api/status            → AgentStatus JSON
///   GET  /admin-api/checks            → { checks: CheckEntry[] }
///   GET  /admin-api/inventory         → full Inventory JSON snapshot
///   GET  /admin-api/score             → ScoreSummary JSON
///   GET  /admin-api/health            → { ok: true } (liveness probe)
///
/// Setup Wizard API (active when wizard_mode = true):
///   GET  /admin-api/wizard/state      → WizardState JSON
///   POST /admin-api/wizard/configure  → save WizardConfig (body: JSON)
///   POST /admin-api/wizard/run        → start installation in background
///
/// The SPA is served from admin-ui/dist when built with `make admin-ui`.
/// In dev mode, the Vite dev server (port 5174) proxies /admin-api/* here.
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tracing::{debug, info, warn};

use crate::installer; // real installer (cross-platform, including hardened Windows service registration)

// ── Shared state ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdminStatus {
    pub agent_id: Option<String>,
    pub version: String,
    pub platform: String,
    pub uptime_secs: u64,
    pub last_collection: Option<String>,
    pub last_heartbeat: Option<String>,
    pub compliance_score: Option<u32>,
    pub weighted_score: Option<u32>,
    pub active_threats: usize,
    pub health: String,
    pub checks_passed: Option<u32>,
    pub checks_failed: Option<u32>,
    pub checks_warned: Option<u32>,
    pub checks_total: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckEntry {
    pub id: String,
    pub display_name: String,
    pub category: String,
    pub status: String,
    pub evidence: String,
    pub recommendation: Option<String>,
    pub severity: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ScoreSummary {
    pub score: u32,
    pub weighted_score: Option<u32>,
    pub label: String,
    pub passed: u32,
    pub failed: u32,
    pub warned: u32,
    pub skipped: u32,
    pub total: u32,
    pub critical_failures: u32,
    pub high_failures: u32,
}

// ── Wizard state ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct WizardConfig {
    pub tenant_id: String,
    pub server_url: String,
    pub install_path: String,
    pub features: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct WizardState {
    /// idle | configuring | installing | complete | error
    pub phase: String,
    /// 0-100
    pub progress: u8,
    pub logs: Vec<String>,
    pub agent_id: Option<String>,
    pub error: Option<String>,
    pub config: Option<WizardConfig>,
}

// ── Admin state ───────────────────────────────────────────────────────────────

#[derive(Debug, Default)]
pub struct AdminState {
    pub status: Option<AdminStatus>,
    pub checks: Vec<CheckEntry>,
    pub inventory_json: Option<String>,
    pub score_summary: Option<ScoreSummary>,
    /// true when the process is in wizard-only mode (double-click / `wizard` subcommand)
    pub wizard_mode: bool,
    /// wizard installation state
    pub wizard: WizardState,
    /// set to true by the wizard runner when installation completes — main loop checks this
    pub wizard_done: bool,
}

impl AdminState {
    pub fn update_status(&mut self, s: AdminStatus) { self.status = Some(s); }
    pub fn update_checks(&mut self, c: Vec<CheckEntry>) { self.checks = c; }
    pub fn update_inventory(&mut self, json: String) { self.inventory_json = Some(json); }
    pub fn update_score(&mut self, s: ScoreSummary) { self.score_summary = Some(s); }
}

pub type SharedAdminState = Arc<Mutex<AdminState>>;

// ── Config ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AdminConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_admin_port")]
    pub port: u16,
    #[serde(default = "default_admin_bind")]
    pub bind_address: String,
    #[serde(default)]
    pub ui_dist_path: Option<String>,
    /// Enable OS desktop notifications for score drops / threats.
    #[serde(default = "default_notifications")]
    pub notifications_enabled: bool,
}

fn default_admin_port() -> u16 { 7979 }
fn default_admin_bind() -> String { "127.0.0.1".into() }
fn default_notifications() -> bool { true }

impl AdminConfig {
    pub fn addr(&self) -> String {
        format!("{}:{}", self.bind_address, self.port)
    }

    pub fn resolve_ui_dist(&self) -> Option<PathBuf> {
        if let Some(ref p) = self.ui_dist_path {
            let pb = PathBuf::from(p);
            if pb.exists() { return Some(pb); }
        }
        if let Ok(exe) = std::env::current_exe() {
            if let Some(parent) = exe.parent() {
                let candidate = parent.join("admin-ui/dist");
                if candidate.exists() { return Some(candidate); }
            }
        }
        let cwd_candidate = PathBuf::from("admin-ui/dist");
        if cwd_candidate.exists() { return Some(cwd_candidate); }
        None
    }
}

// ── Server ────────────────────────────────────────────────────────────────────

pub async fn start(cfg: &AdminConfig) -> SharedAdminState {
    let state: SharedAdminState = Arc::new(Mutex::new(AdminState::default()));
    if !cfg.enabled {
        debug!("admin server disabled");
        return state;
    }

    let addr = cfg.addr();
    let ui_dist = cfg.resolve_ui_dist();
    if let Some(ref p) = ui_dist {
        info!(ui_dist = %p.display(), "admin UI assets found — serving embedded SPA on http://{addr}/");
    } else {
        info!("admin UI assets not found — API-only mode (run 'make admin-ui' first)");
    }

    let state_clone = Arc::clone(&state);
    tokio::spawn(async move {
        match TcpListener::bind(&addr).await {
            Ok(listener) => {
                info!(addr = %addr, "admin server listening");
                loop {
                    match listener.accept().await {
                        Ok((stream, peer)) => {
                            debug!(peer = %peer, "admin connection");
                            let st = Arc::clone(&state_clone);
                            let ui = ui_dist.clone();
                            tokio::spawn(handle_connection(stream, st, ui));
                        }
                        Err(e) => warn!("admin accept error: {e}"),
                    }
                }
            }
            Err(e) => warn!(addr = %addr, "admin server bind failed: {e}"),
        }
    });

    state
}

// ── Request handler ───────────────────────────────────────────────────────────

async fn handle_connection(
    mut stream: tokio::net::TcpStream,
    state: SharedAdminState,
    ui_dist: Option<PathBuf>,
) {
    // Read up to 32 KB to accommodate POST bodies
    let mut buf = vec![0u8; 32768];
    let n = match stream.read(&mut buf).await {
        Ok(0) | Err(_) => return,
        Ok(n) => n,
    };

    let raw = match std::str::from_utf8(&buf[..n]) {
        Ok(s) => s,
        Err(_) => {
            send_response(&mut stream, 400, r#"{"error":"bad request"}"#, "application/json").await;
            return;
        }
    };

    // Split headers from body
    let (header_section, body_section) = if let Some(idx) = raw.find("\r\n\r\n") {
        (&raw[..idx], &raw[idx + 4..])
    } else {
        (raw, "")
    };

    let first_line = header_section.lines().next().unwrap_or("");
    let parts: Vec<&str> = first_line.splitn(3, ' ').collect();
    if parts.len() < 2 {
        send_response(&mut stream, 400, r#"{"error":"bad request"}"#, "application/json").await;
        return;
    }

    let method = parts[0];
    let raw_path = parts[1];
    let path = raw_path.split('?').next().unwrap_or(raw_path);

    // Strip /admin-api prefix (Vite proxy strips it in dev; accept plain path too)
    let api_path = path.strip_prefix("/admin-api").unwrap_or(path);

    // ── CORS pre-flight ───────────────────────────────────────────────────────
    if method == "OPTIONS" {
        let resp = "HTTP/1.1 204 No Content\r\n\
                    Access-Control-Allow-Origin: *\r\n\
                    Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
                    Access-Control-Allow-Headers: Content-Type\r\n\
                    Content-Length: 0\r\n\
                    Connection: close\r\n\r\n";
        let _ = stream.write_all(resp.as_bytes()).await;
        return;
    }

    // ── GET endpoints ─────────────────────────────────────────────────────────
    if method == "GET" {
        match api_path {
            "/status" => {
                let json = {
                    let s = state.lock().unwrap();
                    s.status.as_ref()
                        .map(|st| serde_json::to_string(st).unwrap_or_default())
                        .unwrap_or_else(|| {
                            r#"{"health":"starting","version":"unknown","platform":"unknown",
                                 "uptime_secs":0,"active_threats":0}"#.to_string()
                        })
                };
                send_response(&mut stream, 200, &json, "application/json").await;
                return;
            }
            "/checks" => {
                let json = {
                    let s = state.lock().unwrap();
                    serde_json::json!({ "checks": s.checks }).to_string()
                };
                send_response(&mut stream, 200, &json, "application/json").await;
                return;
            }
            "/inventory" => {
                let json = {
                    let s = state.lock().unwrap();
                    s.inventory_json.clone()
                        .unwrap_or_else(|| r#"{"error":"inventory not yet collected"}"#.to_string())
                };
                send_response(&mut stream, 200, &json, "application/json").await;
                return;
            }
            "/score" => {
                let json = {
                    let s = state.lock().unwrap();
                    s.score_summary.as_ref()
                        .map(|sc| serde_json::to_string(sc).unwrap_or_default())
                        .unwrap_or_else(|| {
                            r#"{"score":0,"label":"Unknown","passed":0,"failed":0,"warned":0,"total":0}"#.to_string()
                        })
                };
                send_response(&mut stream, 200, &json, "application/json").await;
                return;
            }
            "/health" => {
                send_response(&mut stream, 200, r#"{"ok":true}"#, "application/json").await;
                return;
            }
            "/wizard/state" => {
                let json = {
                    let s = state.lock().unwrap();
                    serde_json::to_string(&s.wizard).unwrap_or_default()
                };
                send_response(&mut stream, 200, &json, "application/json").await;
                return;
            }
            _ => {}
        }
    }

    // ── POST endpoints (wizard only) ──────────────────────────────────────────
    if method == "POST" {
        match api_path {
            "/wizard/configure" => {
                match serde_json::from_str::<WizardConfig>(body_section) {
                    Ok(cfg) => {
                        {
                            let mut s = state.lock().unwrap();
                            s.wizard.phase = "configuring".into();
                            s.wizard.config = Some(cfg);
                            s.wizard.logs.clear();
                            s.wizard.error = None;
                        }
                        send_response(&mut stream, 200, r#"{"ok":true}"#, "application/json").await;
                    }
                    Err(e) => {
                        let body = serde_json::json!({"error": e.to_string()}).to_string();
                        send_response(&mut stream, 400, &body, "application/json").await;
                    }
                }
                return;
            }
            "/wizard/run" => {
                let cfg_opt = {
                    let mut s = state.lock().unwrap();
                    if s.wizard.phase == "installing" {
                        // Already running — ignore duplicate request
                        None
                    } else {
                        s.wizard.phase = "installing".into();
                        s.wizard.progress = 0;
                        s.wizard.logs.clear();
                        s.wizard.error = None;
                        s.wizard.agent_id = None;
                        s.wizard.config.clone()
                    }
                };

                if let Some(wiz_cfg) = cfg_opt {
                    let state_clone = Arc::clone(&state);
                    tokio::spawn(run_wizard_install(state_clone, wiz_cfg));
                    send_response(&mut stream, 202, r#"{"ok":true,"message":"installation started"}"#, "application/json").await;
                } else {
                    send_response(&mut stream, 409, r#"{"error":"installation already in progress or no config set"}"#, "application/json").await;
                }
                return;
            }
            _ => {
                send_response(&mut stream, 404, r#"{"error":"not found"}"#, "application/json").await;
                return;
            }
        }
    }

    // ── Static SPA serving ────────────────────────────────────────────────────
    if method == "GET" {
        if let Some(ref dist) = ui_dist {
            let file_path = if path == "/" || path.is_empty() {
                dist.join("index.html")
            } else {
                let relative = path.trim_start_matches('/');
                if relative.split('/').any(|seg| seg == ".." || seg == ".") || relative.starts_with('/') {
                    send_response(&mut stream, 403, r#"{"error":"forbidden"}"#, "application/json").await;
                    return;
                }
                dist.join(relative)
            };

            let safe_to_serve = if file_path.exists() {
                match (std::fs::canonicalize(&file_path), std::fs::canonicalize(dist)) {
                    (Ok(cf), Ok(cd)) => {
                        if cf.starts_with(&cd) { Some(cf) } else {
                            warn!(requested = %path, "admin: path traversal blocked");
                            send_response(&mut stream, 403, r#"{"error":"forbidden"}"#, "application/json").await;
                            return;
                        }
                    }
                    _ => None,
                }
            } else {
                None
            };

            if let Some(canonical) = safe_to_serve {
                if canonical.is_file() {
                    serve_file(&mut stream, &canonical).await;
                    return;
                }
            }

            // SPA fallback — unknown paths serve index.html for client-side routing
            let index = dist.join("index.html");
            if index.is_file() {
                serve_file(&mut stream, &index).await;
                return;
            }
        }
    }

    // Method not allowed for any other verb/path combo
    if method != "GET" && method != "POST" && method != "OPTIONS" {
        send_response(&mut stream, 405, r#"{"error":"method not allowed"}"#, "application/json").await;
        return;
    }

    let body = serde_json::json!({
        "error": "not found",
        "hint": "Run 'make admin-ui' to build the UI, or use 'cd admin-ui && npm run dev'"
    }).to_string();
    send_response(&mut stream, 404, &body, "application/json").await;
}

// ── Wizard installation runner ────────────────────────────────────────────────
// Runs as a background tokio task, updating wizard state as it goes.
// Now performs REAL installation by delegating to installer::install (platform-aware).
// Errors are properly surfaced to the UI instead of fake success.

async fn run_wizard_install(state: SharedAdminState, cfg: WizardConfig) {
    use tokio::time::{sleep, Duration};

    // Determine platform for user-facing messages
    let os = std::env::consts::OS.to_string(); // "windows", "macos", "linux"
    let is_windows = os == "windows";
    let is_macos   = os == "macos";

    fn log_step(state: &SharedAdminState, msg: &str, pct: u8) {
        let mut s = state.lock().unwrap();
        s.wizard.logs.push(format!("✓  {msg}"));
        s.wizard.progress = pct;
    }

    fn log_warn(state: &SharedAdminState, msg: &str) {
        let mut s = state.lock().unwrap();
        s.wizard.logs.push(format!("⚠  {msg}"));
    }

    fn fail_install(state: &SharedAdminState, err: String) {
        let mut s = state.lock().unwrap();
        s.wizard.error = Some(err.clone());
        s.wizard.logs.push(format!("✗  {}", err));
        s.wizard.phase = "error".into();
    }

    // Platform-aware step descriptions (this is the "Mac-like experience" on Windows too)
    let steps: Vec<(&str, u8)> = if is_windows {
        vec![
            ("Verifying Administrator privileges...", 5),
            ("Preparing installation directory (Program Files)...", 12),
            ("Copying agent binary...", 22),
            ("Registering in Apps & Features / Add or Remove Programs...", 35),
            ("Creating hardened Windows service (AIGOXAgent)...", 48),
            ("Applying service DACL and tamper-proof ACLs...", 60),
            ("Writing install manifest and metadata...", 70),
            ("Starting the AIGOXAgent service...", 80),
        ]
    } else if is_macos {
        vec![
            ("Verifying root privileges...", 5),
            ("Preparing installation directory (/Library/Application Support)...", 12),
            ("Copying agent binary...", 22),
            ("Installing LaunchDaemon (io.aigox.agent)...", 35),
            ("Setting SIP-aware permissions and receipts...", 55),
            ("Writing install manifest...", 70),
            ("Loading and starting the agent daemon...", 80),
        ]
    } else {
        vec![
            ("Verifying root/sudo privileges...", 5),
            ("Preparing installation directory (/opt/aigox-agent)...", 12),
            ("Copying agent binary...", 22),
            ("Writing systemd unit (aigox-agent.service)...", 35),
            ("Enabling service with security hardening (ProtectSystem, NoNewPrivs)...", 55),
            ("Writing install manifest...", 70),
            ("Starting and enabling the systemd service...", 80),
        ]
    };

    for (msg, pct) in &steps {
        sleep(Duration::from_millis(350)).await; // slight pacing so UI feels responsive
        log_step(&state, msg, *pct);
    }

    // Extract what we need for console registration *before* moving cfg into the blocking task
    let server_url_for_reg = cfg.server_url.trim_end_matches('/').to_string();
    let tenant_for_reg = cfg.tenant_id.clone();

    // === REAL INSTALLATION ===
    // Run the actual platform installer in a blocking task so we don't stall the async runtime.
    let install_result = tokio::task::spawn_blocking(move || {
        // The current running binary is what we want to install
        let exe = std::env::current_exe()
            .map_err(|e| format!("Failed to locate running executable: {e}"))?;

        // Use tenant from wizard config if provided; otherwise empty (user can register later)
        let tenant = if cfg.tenant_id.trim().is_empty() { None } else { Some(cfg.tenant_id.as_str()) };

        // Call the real cross-platform installer (this does the copy + service/LaunchDaemon/systemd registration)
        installer::install(&exe, tenant, None)
            .map_err(|e| format!("Installation failed: {e}"))
    })
    .await;

    match install_result {
        Ok(Ok(_manifest)) => {
            log_step(&state, "Core platform registration complete.", 88);
        }
        Ok(Err(e)) => {
            fail_install(&state, e);
            return;
        }
        Err(e) => {
            fail_install(&state, format!("Internal installer task error: {e}"));
            return;
        }
    };

    // Optional: console registration (non-fatal)
    let agent_id = format!("agt-{}", &uuid_v4_simple());

    if !server_url_for_reg.is_empty() && !tenant_for_reg.trim().is_empty() {
        log_step(&state, "Reporting device to AIGO-X Console...", 93);
        let reg_result = try_register_with_console(&server_url_for_reg, &tenant_for_reg, &agent_id).await;
        match reg_result {
            Ok(_) => {
                let mut s = state.lock().unwrap();
                s.wizard.logs.push(format!(
                    "✓  Device reported to AIGO-X Console — Agent ID: {agent_id}"
                ));
            }
            Err(e) => {
                log_warn(&state, &format!("Console registration skipped ({}). You can run 'grc-agent register' later.", e));
            }
        }
    } else {
        log_warn(&state, "No tenant/server configured — skipping console registration. Run 'grc-agent register' after install.");
    }

    sleep(Duration::from_millis(400)).await;

    {
        let mut s = state.lock().unwrap();
        s.wizard.agent_id = Some(agent_id);
        s.wizard.logs.push("✓  Installation complete. The agent is now running as a system service/daemon.".into());
        s.wizard.phase = "complete".into();
        s.wizard.progress = 100;
        s.wizard_done = true;
    }

    info!("Wizard: real installation completed successfully");
}

async fn try_register_with_console(server_url: &str, tenant_id: &str, agent_id: &str) -> Result<(), String> {
    if server_url.is_empty() || tenant_id.is_empty() {
        return Err("no server URL or tenant ID configured".into());
    }
    let url = format!("{server_url}/api/agents/register");
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    let body = serde_json::json!({
        "agentId":    agent_id,
        "tenantId":   tenant_id,
        "platform":   std::env::consts::OS,
        "agentVersion": env!("CARGO_PKG_VERSION"),
        "source":     "wizard-install"
    });
    client.post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Simple UUID-style hex string without external uuid dep overhead at runtime
fn uuid_v4_simple() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let t = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
    format!("{:016x}", t ^ 0x6ba7b810_9dad_11d1u128)
}

// ── Static file serving ───────────────────────────────────────────────────────

async fn serve_file(stream: &mut tokio::net::TcpStream, path: &Path) {
    match tokio::fs::read(path).await {
        Ok(bytes) => {
            let content_type = mime_for(path);
            let header = format!(
                "HTTP/1.1 200 OK\r\n\
                 Content-Type: {content_type}\r\n\
                 Cache-Control: no-cache\r\n\
                 Content-Length: {}\r\n\
                 Connection: close\r\n\r\n",
                bytes.len()
            );
            let _ = stream.write_all(header.as_bytes()).await;
            let _ = stream.write_all(&bytes).await;
        }
        Err(e) => {
            let body = format!(r#"{{"error":"read error: {e}"}}"#);
            send_response(stream, 500, &body, "application/json").await;
        }
    }
}

async fn send_response(stream: &mut tokio::net::TcpStream, code: u16, body: &str, ct: &str) {
    let reason = match code {
        200 => "OK", 202 => "Accepted", 204 => "No Content",
        400 => "Bad Request", 403 => "Forbidden",
        404 => "Not Found", 405 => "Method Not Allowed",
        409 => "Conflict", 500 => "Internal Server Error", _ => "Error",
    };
    let resp = format!(
        "HTTP/1.1 {code} {reason}\r\n\
         Content-Type: {ct}\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
         Access-Control-Allow-Headers: Content-Type\r\n\
         Content-Length: {}\r\n\
         Connection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(resp.as_bytes()).await;
}

fn mime_for(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()) {
        Some("html") => "text/html; charset=utf-8",
        Some("js")   => "application/javascript",
        Some("css")  => "text/css",
        Some("png")  => "image/png",
        Some("svg")  => "image/svg+xml",
        Some("ico")  => "image/x-icon",
        Some("json") => "application/json",
        Some("woff") | Some("woff2") => "font/woff2",
        _            => "application/octet-stream",
    }
}
