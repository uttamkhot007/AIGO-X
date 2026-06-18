#![recursion_limit = "256"]

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use tracing::info;

mod admin;
mod agent;
mod checks;
mod client;
mod compliance;
mod config;
mod discovery;
mod error;
mod hardening;
mod installer;
mod offline;
mod recovery;
mod registration;
mod remediation;
mod scoring;
mod secrets;
mod security;
mod self_protect;
mod signing;
mod stability;
mod tray;
mod update_verification;
#[cfg(test)]
mod tests;

use crate::config::Config;
use crate::client::AgentClient;
use crate::offline::OfflineStore;
use crate::secrets::SecretsBackend;

const VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Parser)]
#[command(
    name = "grc-agent",
    version = VERSION,
    about = "AIGO-X Endpoint Agent",
    long_about = "AIGO-X endpoint agent: multi-tenant compliance monitoring, threat detection, \
                  endpoint hardening, automated remediation, and offline-first telemetry.\n\n\
                  Double-click to open the Setup Wizard, or run with a subcommand.\n\
                  Admin UI: http://127.0.0.1:7979/ (start with --admin-ui or enable in config)\n\n\
                  Publisher:  AIGO-X GRC Platform (aigox.io)\n\
                  Version:    {VERSION}",
)]
struct Cli {
    /// When no subcommand is given (e.g. double-click on Windows), the guided
    /// Setup Wizard launches automatically.
    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand)]
enum Commands {
    /// Start the agent daemon (collection loop + admin UI).
    Start {
        #[arg(short, long, help = "Path to config.yaml")]
        config: Option<String>,
        #[arg(long, help = "Dry-run mode: register and verify but do not persist or push")]
        dry_run: bool,
        #[arg(long, help = "Open the admin dashboard in your default browser on startup")]
        open_dashboard: bool,
    },
    /// Register this device with the GRC platform and print the agent ID.
    Register {
        #[arg(short, long, help = "Path to config.yaml")]
        config: Option<String>,
    },
    /// Run a single compliance check cycle and push results.
    Check {
        #[arg(short, long, help = "Path to config.yaml")]
        config: Option<String>,
    },
    /// Open the admin dashboard in the default browser.
    Dashboard {
        #[arg(short, long, help = "Path to config.yaml")]
        config: Option<String>,
    },
    /// Launch the guided Setup Wizard (same as double-clicking the installer).
    /// Opens a browser-based installer at http://localhost:7979/?mode=wizard
    Wizard {
        /// TCP port for the wizard HTTP server (default: 7979).
        #[arg(long, default_value_t = 7979)]
        port: u16,
    },
    /// Install the agent as a system service and register in OS software list.
    /// Requires administrator / root privileges.
    /// TIP: For a guided experience use 'wizard' or simply double-click the executable.
    Install {
        #[arg(short, long, help = "Path to config.yaml")]
        config: Option<String>,
        /// Uninstall password that protects future removal (optional; prompted if not given).
        #[arg(long, help = "Uninstall password for tamper-protection (min 8 chars)")]
        uninstall_password: Option<String>,
        /// Skip tamper-hardening steps (not recommended; for CI/test use only).
        #[arg(long, default_value_t = false)]
        no_harden: bool,
    },
    /// Uninstall the agent service and remove it from the OS software list.
    /// Requires administrator / root privileges and the correct uninstall password.
    Uninstall {
        #[arg(short, long, help = "Path to config.yaml")]
        config: Option<String>,
        /// Read uninstall password from file instead of prompting.
        #[arg(long, help = "Path to file containing uninstall password")]
        password_file: Option<String>,
        /// Skip password verification (emergency use only, requires root).
        #[arg(long, default_value_t = false)]
        force: bool,
    },
    /// Print version string.
    Version,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        // ── No subcommand: double-clicked or run without args ─────────────────
        // On Windows this is the most common case for end-users.  Launch the
        // browser-based Setup Wizard instead of showing a console help screen
        // that immediately closes.
        None => {
            cmd_wizard(7979).await?;
        }

        Some(Commands::Wizard { port }) => {
            cmd_wizard(port).await?;
        }

        Some(Commands::Start { config, dry_run, open_dashboard }) => {
            let cfg = Config::load(config.as_deref())?;
            init_tracing(&cfg);

            if open_dashboard {
                let port = cfg.admin.port;
                let notifier = tray::TrayNotifier::new(tray::TrayConfig {
                    admin_port: port,
                    ..Default::default()
                });
                notifier.open_dashboard();
            }

            crate::agent::run(cfg, dry_run).await?;
        }
        Some(Commands::Register { config }) => {
            let cfg = Config::load(config.as_deref())?;
            init_tracing(&cfg);
            cmd_register(cfg).await?;
        }
        Some(Commands::Check { config }) => {
            let cfg = Config::load(config.as_deref())?;
            init_tracing(&cfg);
            cmd_check(cfg).await?;
        }
        Some(Commands::Dashboard { config }) => {
            let cfg = Config::load(config.as_deref())?;
            let port = cfg.admin.port;
            let notifier = tray::TrayNotifier::new(tray::TrayConfig {
                admin_port: port,
                ..Default::default()
            });
            notifier.open_dashboard();
        }
        Some(Commands::Install { config, uninstall_password, no_harden }) => {
            let cfg = Config::load(config.as_deref())?;
            init_tracing(&cfg);
            info!("grc-agent {VERSION} — install");
            let exe = std::env::current_exe().context("get current exe path")?;
            let _manifest = installer::install(&exe, Some(&cfg.registration.tenant_id), uninstall_password.as_deref())?;
            println!("grc-agent {VERSION} installed successfully.");
            println!("  Start with: grc-agent start");
            println!("  Admin UI:   http://127.0.0.1:7979/");
            println!("  Run-time tamper-protection is active — monitor via admin dashboard.");
        }
        Some(Commands::Uninstall { config, password_file, force }) => {
            let cfg = Config::load(config.as_deref())?;
            init_tracing(&cfg);
            info!("grc-agent {VERSION} — uninstall");
            let install_dir = installer::resolve_install_dir().unwrap_or_default();
            let mf_path = install_dir.join("install-manifest.json");
            let manifest: installer::InstallManifest = serde_json::from_str(
                &std::fs::read_to_string(&mf_path).unwrap_or_default()
            ).context("read install manifest")?;

            if !force {
                if let (Some(ref stored_hash), Some(ref salt)) = (&manifest.password_hash, &manifest.password_salt) {
                    let password = read_uninstall_password(password_file.as_deref())?;
                    let computed_hash = installer::hash_password(&password, salt);
                    if computed_hash != *stored_hash {
                        anyhow::bail!("Invalid uninstall password");
                    }
                }
            }

            installer::uninstall(&manifest)?;
            println!("grc-agent uninstalled — service removed and software list entry cleared.");
        }
        Some(Commands::Version) => {
            println!("grc-agent {VERSION}");
        }
    }

    Ok(())
}

// ── Wizard mode ───────────────────────────────────────────────────────────────
// Starts the embedded HTTP server in wizard-only mode (no agent daemon), opens
// the browser to the Setup Wizard, and blocks until the wizard signals
// installation is complete (or the user closes the window / presses Ctrl-C).

async fn cmd_wizard(port: u16) -> Result<()> {
    // Minimal tracing for wizard mode (no config file needed yet)
    tracing_subscriber::fmt()
        .with_env_filter("grc_agent=info,warn")
        .init();

    info!("grc-agent {VERSION} — setup wizard mode (port {port})");

    let wizard_cfg = admin::AdminConfig {
        enabled: true,
        port,
        bind_address: "127.0.0.1".into(),
        ui_dist_path: None,
        notifications_enabled: false,
    };

    // Give the server a moment to bind before opening the browser
    let state = admin::start(&wizard_cfg).await;
    {
        let mut s = state.lock().unwrap();
        s.wizard_mode = true;
    }

    tokio::time::sleep(tokio::time::Duration::from_millis(400)).await;

    let url = format!("http://127.0.0.1:{port}/?mode=wizard");
    info!("Opening setup wizard at {url}");

    #[cfg(target_os = "windows")]
    let _ = std::process::Command::new("cmd")
        .args(["/C", "start", "", &url])
        .spawn();
    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("open").arg(&url).spawn();
    #[cfg(target_os = "linux")]
    let _ = std::process::Command::new("xdg-open").arg(&url).spawn();

    // Print a fallback message in case the browser didn't open
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("  AIGO-X Endpoint Agent — Setup Wizard");
    println!("  Open your browser to: {url}");
    println!("  Press Ctrl-C to exit without installing.");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Block until Ctrl-C or wizard sets the done flag
    loop {
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        let done = {
            let s = state.lock().unwrap();
            s.wizard_done
        };
        if done {
            info!("Wizard complete — agent installation finished. Exiting setup.");
            println!("\n✓ Installation complete. The AIGO-X agent is now running as a system service.");
            println!("  Admin UI: http://127.0.0.1:7979/");
            break;
        }
    }

    Ok(())
}

async fn cmd_register(cfg: Config) -> Result<()> {
    let secrets = SecretsBackend::from_config(&cfg.vault);
    let token = secrets.get_agent_token(&cfg.registration.agent_token).await;
    let client = AgentClient::new(&cfg, token)?;
    let resp = client.register().await?;
    println!("Registered with agent_id: {}", resp.agent_id);
    Ok(())
}

async fn cmd_check(cfg: Config) -> Result<()> {
    let secrets = SecretsBackend::from_config(&cfg.vault);
    let token = secrets.get_agent_token(&cfg.registration.agent_token).await;
    let device_key = secrets::get_or_create_device_key().ok();
    let sqlite_key = device_key.as_ref().map(secrets::derive_sqlite_key);
    let mut store = sqlite_key.and_then(|k| OfflineStore::open(cfg.store.path.as_deref(), k).ok());
    let client = AgentClient::new(&cfg, token)?;

    let agent_id = if let Some(ref mut s) = store {
        s.get_agent_id().ok().flatten()
    } else {
        None
    };

    let agent_id = match agent_id {
        Some(id) => id,
        None => {
            let resp = client.register().await?;
            if let Some(ref mut s) = store {
                let _ = s.set_agent_id(&resp.agent_id);
            }
            resp.agent_id
        }
    };

    let (payload, passed, failed, score) = build_push_payload().await?;
    client.push(&agent_id, payload, passed, failed, score).await?;
    info!("check cycle complete — score: {score}, passed: {passed}, failed: {failed}");
    Ok(())
}

async fn build_push_payload() -> Result<(serde_json::Value, u32, u32, u32)> {
    let inv = crate::discovery::collect().await?;
    let checks = crate::checks::run_all(&inv);
    let passed = checks.iter().filter(|c| c.status == "pass").count() as u32;
    let failed = checks.iter().filter(|c| c.status == "fail" || c.status == "warn").count() as u32;
    let total = checks.len() as u32;
    let score = if total > 0 { (passed * 100) / total } else { 0 };

    let hardening = crate::hardening::HardeningEngine::new().assess(&inv);
    let compliance = crate::compliance::ComplianceEngine::new().evaluate(&inv, &checks);
    let mut te = crate::security::ThreatDetectionEngine::new();
    let threats = te.analyze(&inv);
    let mut scoring = crate::scoring::ScoringEngine::new();
    let ep_score = scoring.calculate(&checks, Some(&hardening));

    let remediation_results: Vec<crate::remediation::RemediationResult> = vec![];
    let remediation_plan = crate::remediation::RemediationPlan {
        actions: vec![],
        auto_applicable: vec![],
        manual_required: vec![],
    };
    let payload = crate::agent::build_payload(&inv, &checks, &ep_score, &hardening, &compliance, &threats, &remediation_results, &remediation_plan, &[]);
    Ok((payload, passed, failed, score))
}

fn read_uninstall_password(password_file: Option<&str>) -> Result<String> {
    use std::io::{self, Read, IsTerminal};

    if let Some(path) = password_file {
        let pw = std::fs::read_to_string(path)
            .with_context(|| format!("read password from {path}"))?;
        return Ok(pw.trim_end().to_string());
    }

    if io::stdin().is_terminal() {
        rpassword::prompt_password("Uninstall password: ")
            .context("prompt for uninstall password")
    } else {
        let mut pw = String::new();
        io::stdin().read_to_string(&mut pw)
            .context("read password from stdin")?;
        Ok(pw.trim_end().to_string())
    }
}

fn init_tracing(cfg: &Config) {
    let level = cfg.agent.log_level.as_deref().unwrap_or("info");
    let filter = format!("grc_agent={level},warn");
    if cfg.agent.log_json.unwrap_or(false) {
        tracing_subscriber::fmt()
            .json()
            .with_env_filter(filter)
            .init();
    } else {
        tracing_subscriber::fmt()
            .with_env_filter(filter)
            .init();
    }
}
