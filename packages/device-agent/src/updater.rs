//! Agent self-updater.
//!
//! Downloads the latest binary from the server and replaces the current
//! executable atomically.  On failure the old binary is never removed.

use anyhow::{bail, Context, Result};
use std::path::{Path, PathBuf};
use tracing::{error, info, warn};

use crate::client::AgentClient;
use crate::installer::{resolve_install_dir, InstallManifest};

/// Entry point used by both the `update` CLI subcommand and the auto-update
/// command triggered via heartbeat `pendingActions`.
pub async fn run_update(client: &AgentClient, _target_version: Option<String>) -> Result<()> {
    info!("starting agent self-update");

    // 1. Download new binary + signature
    let (bytes, signature) = client.download_update_with_signature().await.context("download update")?;
    info!(bytes = bytes.len(), signature_present = signature.is_some(), "update binary downloaded");

    // 2. Verify binary integrity / authenticity
    crate::update_verification::verify_update(&bytes, signature.as_deref())
        .context("update verification failed — aborting replacement")?;
    info!("update verification passed");

    // 2. Determine where the current binary lives
    let (target_path, manifest) = resolve_target_path()?;
    info!(target = %target_path.display(), "resolved install path");

    // 3. Write to a temporary file next to the target (same filesystem = atomic rename)
    let temp_path = target_path.with_extension("update.tmp");
    std::fs::write(&temp_path, &bytes)
        .with_context(|| format!("write temp binary to {}", temp_path.display()))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&temp_path)?.permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&temp_path, perms)?;
    }

    // 4. Platform-specific pre-replacement (remove immutable flags, stop service)
    let running_as_service = manifest.is_some();
    if running_as_service {
        pre_service_replacement(&target_path)?;
    }

    // 5. Atomic replacement
    let backup_path = target_path.with_extension("backup");
    if target_path.exists() {
        // Keep a backup briefly; remove it after successful rename
        let _ = std::fs::rename(&target_path, &backup_path);
    }

    match std::fs::rename(&temp_path, &target_path) {
        Ok(()) => {
            let _ = std::fs::remove_file(&backup_path); // best-effort cleanup
            info!("agent binary updated successfully");
        }
        Err(e) => {
            // Attempt to restore backup
            if backup_path.exists() {
                let _ = std::fs::rename(&backup_path, &target_path);
            }
            bail!("failed to replace binary: {e}");
        }
    }

    // 6. Post-replacement (restore immutable flags, restart service)
    if running_as_service {
        post_service_replacement(&target_path)?;
    }

    info!("update complete — agent will restart with new version on next start");
    Ok(())
}

/// Figure out the path of the binary we should overwrite.
/// Returns the path and, if found, the install manifest (indicates system install).
fn resolve_target_path() -> Result<(PathBuf, Option<InstallManifest>)> {
    // Try the install manifest first (system install)
    if let Some(install_dir) = resolve_install_dir().ok() {
        let manifest_path = install_dir.join("install-manifest.json");
        if manifest_path.exists() {
            let text = std::fs::read_to_string(&manifest_path)
                .with_context(|| format!("read {}", manifest_path.display()))?;
            let manifest: InstallManifest = serde_json::from_str(&text)
                .with_context(|| format!("parse {}", manifest_path.display()))?;
            let target = PathBuf::from(&manifest.install_path).join(exe_name());
            if target.exists() {
                return Ok((target, Some(manifest)));
            }
        }
    }

    // Fallback: the currently running executable
    let current = std::env::current_exe().context("get current exe path")?;
    Ok((current, None))
}

fn exe_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "grc-agent.exe"
    } else {
        "grc-agent"
    }
}

// ── Service management helpers ───────────────────────────────────────────────

#[cfg(target_os = "macos")]
fn pre_service_replacement(_target: &Path) -> Result<()> {
    // Remove immutable flag if present
    let _ = std::process::Command::new("chflags")
        .args(["nouchg", _target.to_str().unwrap_or("")])
        .output();
    // Stop LaunchDaemon
    let _ = std::process::Command::new("launchctl")
        .args(["unload", "/Library/LaunchDaemons/io.aigox.agent.plist"])
        .output();
    Ok(())
}

#[cfg(target_os = "linux")]
fn pre_service_replacement(_target: &Path) -> Result<()> {
    // Remove immutable flag if present
    let _ = std::process::Command::new("chattr")
        .args(["-i", _target.to_str().unwrap_or("")])
        .output();
    // Stop systemd service
    let _ = std::process::Command::new("systemctl")
        .args(["stop", "aigox-agent.service"])
        .output();
    Ok(())
}

#[cfg(target_os = "windows")]
fn pre_service_replacement(_target: &Path) -> Result<()> {
    let _ = std::process::Command::new("sc")
        .args(["stop", "AIGOXAgent"])
        .output();
    Ok(())
}

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
fn pre_service_replacement(_target: &Path) -> Result<()> {
    Ok(())
}

#[cfg(target_os = "macos")]
fn post_service_replacement(_target: &Path) -> Result<()> {
    // Restore immutable flag
    let _ = std::process::Command::new("chflags")
        .args(["schg", _target.to_str().unwrap_or("")])
        .output();
    // Reload and kickstart LaunchDaemon
    let _ = std::process::Command::new("launchctl")
        .args(["load", "/Library/LaunchDaemons/io.aigox.agent.plist"])
        .output();
    let _ = std::process::Command::new("launchctl")
        .args(["kickstart", "-k", "system/io.aigox.agent"])
        .output();
    Ok(())
}

#[cfg(target_os = "linux")]
fn post_service_replacement(_target: &Path) -> Result<()> {
    // Restore immutable flag
    let _ = std::process::Command::new("chattr")
        .args(["+i", _target.to_str().unwrap_or("")])
        .output();
    // Restart systemd service
    let _ = std::process::Command::new("systemctl")
        .args(["restart", "aigox-agent.service"])
        .output();
    Ok(())
}

#[cfg(target_os = "windows")]
fn post_service_replacement(_target: &Path) -> Result<()> {
    let _ = std::process::Command::new("sc")
        .args(["start", "AIGOXAgent"])
        .output();
    Ok(())
}

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
fn post_service_replacement(_target: &Path) -> Result<()> {
    Ok(())
}
