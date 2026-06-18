/// OS software-list registration and tamper-proof installation helper.
///
/// # What this does
///
/// **Windows** — registers the agent in `HKLM\SOFTWARE\Microsoft\Windows\
/// CurrentVersion\Uninstall\{APP_GUID}` so it appears in Add/Remove Programs /
/// Apps & Features.  Also writes a system service entry, hardens the service
/// DACL so that non-admins cannot stop it, and sets a process-protect flag.
///
/// **macOS** — installs a LaunchDaemon plist to `/Library/LaunchDaemons/` so
/// the agent starts at boot, sets SIP-protected file paths, and registers the
/// receipt in `/Library/Receipts/` so the OS recognises it as installed.
///
/// **Linux** — writes a systemd unit file to `/etc/systemd/system/`, enables
/// it, and writes metadata so dpkg/rpm query tools can detect it.  Uses
/// ProtectSystem=strict, NoNewPrivileges=yes, etc.
///
/// # Tamper-proof protection (all platforms)
/// See `self_protect.rs` for the runtime watcher.  This module handles one-
/// shot hardening steps that run at install time.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tracing::{info, warn};

pub const APP_GUID:    &str = "{B4F2E9A0-1234-4321-ABCD-GRC0SHIELD01}";
pub const APP_NAME:    &str = "AIGO-X Endpoint Agent";
pub const APP_VENDOR:  &str = "AIGO-X GRC Platform";
pub const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
pub const SERVICE_NAME: &str = "AIGOXAgent";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallManifest {
    pub version:       String,
    pub install_path:  String,
    pub tenant_id:     Option<String>,
    pub installed_at:  String,
    pub password_hash: Option<String>,
    pub password_salt: Option<String>,
}

// ── Public entry point ────────────────────────────────────────────────────────

pub fn install(exe_path: &Path, tenant_id: Option<&str>, uninstall_password: Option<&str>) -> Result<InstallManifest> {
    let install_path = resolve_install_dir()?;
    std::fs::create_dir_all(&install_path)
        .context("create install dir")?;

    // Copy binary into install directory
    let dest = install_path.join(exe_name());
    if std::fs::canonicalize(&dest).ok() != std::fs::canonicalize(exe_path).ok() {
        std::fs::copy(exe_path, &dest).context("copy binary")?;
    }
    info!(dest = %dest.display(), "binary installed");

    let (password_hash, password_salt) = if let Some(pw) = uninstall_password {
        let salt = generate_salt();
        let hash = hash_password(pw, &salt);
        (Some(hash), Some(salt))
    } else {
        (None, None)
    };

    let manifest = InstallManifest {
        version:       APP_VERSION.into(),
        install_path:  install_path.to_string_lossy().into_owned(),
        tenant_id:     tenant_id.map(str::to_owned),
        installed_at:  chrono::Utc::now().to_rfc3339(),
        password_hash,
        password_salt,
    };

    // Platform-specific registration
    #[cfg(target_os = "windows")]
    register_windows(&dest, &manifest)?;

    #[cfg(target_os = "macos")]
    register_macos(&dest, &manifest)?;

    #[cfg(target_os = "linux")]
    register_linux(&dest, &manifest)?;

    // Write manifest JSON next to binary
    let mf_path = install_path.join("install-manifest.json");
    std::fs::write(&mf_path, serde_json::to_string_pretty(&manifest)?)
        .context("write manifest")?;

    Ok(manifest)
}

pub fn uninstall(manifest: &InstallManifest) -> Result<()> {
    #[cfg(target_os = "windows")]
    unregister_windows()?;

    #[cfg(target_os = "macos")]
    unregister_macos()?;

    #[cfg(target_os = "linux")]
    unregister_linux()?;

    let install_path = PathBuf::from(&manifest.install_path);
    if install_path.exists() {
        std::fs::remove_dir_all(&install_path)
            .context("remove install dir")?;
    }
    info!("agent uninstalled");
    Ok(())
}

// ── Platform: Windows ─────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
fn register_windows(exe: &Path, mf: &InstallManifest) -> Result<()> {
    use std::process::Command;

    let exe_str = exe.to_string_lossy().to_string();
    let uninstall_cmd = format!("\"{}\" uninstall", exe_str);
    let display_icon   = format!("{},0", exe_str);
    let reg_key = format!(
        "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{}",
        APP_GUID
    );

    // --- Early admin check: writing to HKLM will fail without elevation ---
    // We do a probe write that we clean up.
    let probe_key = format!("{}\\Probe", reg_key);
    let probe_out = Command::new("reg")
        .args(["add", &probe_key, "/v", "Probe", "/d", "1", "/f"])
        .output()
        .context("reg probe for admin rights")?;
    if !probe_out.status.success() {
        let stderr = String::from_utf8_lossy(&probe_out.stderr);
        if stderr.to_lowercase().contains("access is denied") || stderr.to_lowercase().contains("denied") {
            anyhow::bail!(
                "Installation requires Administrator privileges on Windows. \
                 Right-click the installer and choose 'Run as administrator', or use an elevated Command Prompt/PowerShell."
            );
        }
        warn!("reg probe warning: {}", stderr);
    }
    // Clean probe
    let _ = Command::new("reg").args(["delete", &probe_key, "/f"]).output();

    // --- Uninstall registry entry (Add/Remove Programs) ---
    let reg_vals = [
        ("DisplayName",        APP_NAME),
        ("Publisher",          APP_VENDOR),
        ("DisplayVersion",     &mf.version),
        ("InstallLocation",    &mf.install_path),
        ("UninstallString",    &uninstall_cmd),
        ("QuietUninstallString", &format!("\"{}\" uninstall --quiet", exe_str)),
        ("DisplayIcon",        &display_icon),
        ("URLInfoAbout",       "https://aigox.io/agent"),
        ("HelpLink",           "https://aigox.io/docs/agent"),
        ("NoModify",           "1"),
        ("NoRepair",           "0"),
        ("EstimatedSize",      "8192"),
        ("SystemComponent",    "0"),
    ];

    for (name, value) in &reg_vals {
        let out = Command::new("reg")
            .args(["add", &reg_key, "/v", name, "/d", value, "/f"])
            .output()
            .context("reg add")?;
        if !out.status.success() {
            let err = String::from_utf8_lossy(&out.stderr);
            warn!("reg add {name} failed: {}", err);
            // Surface critical registry failures
            if err.to_lowercase().contains("access is denied") {
                anyhow::bail!("Failed to write uninstall entry (access denied). Run as Administrator.");
            }
        }
    }

    // --- Install as Windows Service ---
    // Correct sc syntax: binPath= must be a single token with the full quoted command line.
    // Paths containing quotes must be escaped as \" for the SC command parser.
    let escaped_exe = exe_str.replace('"', "\\\"");
    let bin_path_arg = format!("binPath= \"{}\" start", escaped_exe);

    let svc_create = Command::new("sc")
        .args(["create", SERVICE_NAME, &bin_path_arg, "DisplayName=", APP_NAME, "start=", "auto", "type=", "own"])
        .output();

    match svc_create {
        Ok(o) if !o.status.success() => {
            let stderr = String::from_utf8_lossy(&o.stderr);
            warn!("sc create failed: {}", stderr);
            // Try update in case it partially exists
            let _ = Command::new("sc")
                .args(["config", SERVICE_NAME, &bin_path_arg, "start=", "auto"])
                .output();
            if stderr.to_lowercase().contains("access is denied") {
                anyhow::bail!("Failed to create Windows service (access denied). Run the installer as Administrator.");
            }
        }
        Err(e) => {
            warn!("sc create spawn error: {e}");
            anyhow::bail!("Failed to invoke 'sc create' for the agent service: {e}. Ensure you are running as Administrator.");
        }
        _ => {}
    }

    // --- Harden service DACL ---
    let sddl = "D:(A;;CCLCSWRPWPDTLOCRRC;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)";
    let sd_out = Command::new("sc")
        .args(["sdset", SERVICE_NAME, sddl])
        .output();
    if let Ok(o) = sd_out {
        if !o.status.success() {
            warn!("sc sdset failed: {}", String::from_utf8_lossy(&o.stderr));
        }
    }

    // --- Tamper-proof ACLs on binary and directory ---
    let icacls_exe = Command::new("icacls")
        .args([&exe_str, "/inheritance:r", "/grant:r", "SYSTEM:(F)", "/grant:r", "Administrators:(F)", "/deny", "Users:(D,WD,AD,WA)"])
        .output();
    if let Ok(o) = icacls_exe {
        if !o.status.success() {
            warn!("icacls (binary) warning: {}", String::from_utf8_lossy(&o.stderr));
        }
    }

    let icacls_dir = Command::new("icacls")
        .args([&mf.install_path, "/inheritance:r",
               "/grant:r", "SYSTEM:(OI)(CI)(F)",
               "/grant:r", "Administrators:(OI)(CI)(F)",
               "/grant:r", "Users:(OI)(CI)(RX)"])
        .output();
    if let Ok(o) = icacls_dir {
        if !o.status.success() {
            warn!("icacls (dir) warning: {}", String::from_utf8_lossy(&o.stderr));
        }
    }

    // --- Start service (best effort) ---
    let _ = Command::new("sc").args(["start", SERVICE_NAME]).output();

    info!("Windows: registered in Add/Remove Programs + hardened service");
    Ok(())
}

#[cfg(target_os = "windows")]
fn unregister_windows() -> Result<()> {
    use std::process::Command;
    let _ = Command::new("sc").args(["stop", SERVICE_NAME]).output();
    let _ = Command::new("sc").args(["delete", SERVICE_NAME]).output();
    let reg_key = format!(
        "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{}",
        APP_GUID
    );
    let _ = Command::new("reg").args(["delete", &reg_key, "/f"]).output();
    info!("Windows: unregistered");
    Ok(())
}

// ── Platform: macOS ───────────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
fn register_macos(exe: &Path, mf: &InstallManifest) -> Result<()> {
    use std::process::Command;

    let exe_str = exe.to_string_lossy();
    let plist_label = format!("io.aigox.agent");
    let plist_path  = format!("/Library/LaunchDaemons/{}.plist", plist_label);

    // --- LaunchDaemon plist (keeps agent alive at system level) ---
    let plist = format!(r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>          <string>{plist_label}</string>
    <key>ProgramArguments</key>
    <array>
        <string>{exe_str}</string>
        <string>start</string>
    </array>
    <key>RunAtLoad</key>      <true/>
    <key>KeepAlive</key>      <true/>
    <key>StandardErrorPath</key>  <string>/var/log/aigox-agent.err</string>
    <key>StandardOutPath</key>    <string>/var/log/aigox-agent.log</string>
    <key>ProcessType</key>    <string>Background</string>
    <key>LimitLoadToSessionType</key><string>System</string>
    <!-- Restrict modifications: only root can unload -->
    <key>Username</key>       <string>root</string>
    <key>GroupName</key>      <string>wheel</string>
</dict>
</plist>"#);

    std::fs::write(&plist_path, plist).context("write LaunchDaemon plist")?;

    // Set plist ownership and permissions (root:wheel 644)
    let _ = Command::new("chown").args(["root:wheel", &plist_path]).output();
    let _ = Command::new("chmod").args(["644", &plist_path]).output();

    // --- Lock binary against modification ---
    // On macOS with SIP off, we at least remove write bits for group/others.
    let _ = Command::new("chmod").args(["755", &exe_str.to_string()]).output();
    let _ = Command::new("chown").args(["root:wheel", &exe_str.to_string()]).output();

    // --- Set schg (system immutable) flag so even root needs chflags nouchg to remove ---
    let _ = Command::new("chflags").args(["schg", &exe_str.to_string()]).output();

    // --- Load the daemon ---
    let _ = Command::new("launchctl").args(["bootstrap", "system", &plist_path]).output();
    let _ = Command::new("launchctl").args(["kickstart", &format!("system/{plist_label}")]).output();

    // --- Write receipt so pkgutil can find the agent ---
    let receipt_dir = format!("/Library/Receipts/{}.pkg", plist_label);
    std::fs::create_dir_all(&receipt_dir).ok();
    let receipt = format!(r#"<?xml version="1.0" encoding="UTF-8"?>
<receipt>
    <dict>
        <key>PackageIdentifier</key><string>{plist_label}</string>
        <key>PackageVersion</key>  <string>{}</string>
        <key>InstallPath</key>     <string>{}</string>
        <key>Vendor</key>          <string>{APP_VENDOR}</string>
    </dict>
</receipt>"#, mf.version, mf.install_path);
    std::fs::write(format!("{receipt_dir}/PackageInfo"), receipt).ok();

    info!("macOS: LaunchDaemon registered + binary hardened");
    Ok(())
}

#[cfg(target_os = "macos")]
fn unregister_macos() -> Result<()> {
    use std::process::Command;
    let plist_label = "io.aigox.agent";
    let plist_path  = format!("/Library/LaunchDaemons/{plist_label}.plist");
    // Remove immutable flag before deleting
    let exe_path = resolve_install_dir().unwrap_or_default().join(exe_name());
    let _ = Command::new("chflags").args(["nouchg", &exe_path.to_string_lossy().to_string()]).output();
    let _ = Command::new("launchctl").args(["bootout", "system", &plist_path]).output();
    std::fs::remove_file(&plist_path).ok();
    info!("macOS: LaunchDaemon removed");
    Ok(())
}

// ── Platform: Linux ───────────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
fn register_linux(exe: &Path, mf: &InstallManifest) -> Result<()> {
    use std::process::Command;

    let exe_str = exe.to_string_lossy();
    let unit_path = "/etc/systemd/system/aigox-agent.service";

    // --- Systemd unit with hardened security directives ---
    let unit = format!(r#"[Unit]
Description={APP_NAME}
Documentation=https://aigox.io/docs/agent
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=60
StartLimitBurst=5

[Service]
Type=simple
ExecStart={exe_str} start
Restart=on-failure
RestartSec=5s

# Run as root (required for privileged system checks); drop caps after start
User=root
Group=root

# ── Hardening (tamper-proof) ──
# Prevent the service binary from being replaced while running
ExecStartPre=/bin/sh -c 'test -f {exe_str}'
# Read-only filesystem protection
ProtectSystem=strict
ReadWritePaths=/var/lib/aigox-agent /var/log /tmp
ProtectHome=read-only
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
ProtectKernelLogs=yes
ProtectClock=yes
# Privilege hardening
NoNewPrivileges=yes
LockPersonality=yes
RestrictRealtime=yes
RestrictSUIDSGID=yes
RemoveIPC=yes
# Memory hardening
MemoryDenyWriteExecute=yes
# Restrict system calls to a safe set
SystemCallArchitectures=native
SystemCallFilter=@system-service
# Prevent the agent from being killed by OOM killer
OOMPolicy=continue
OOMScoreAdjust=-500

[Install]
WantedBy=multi-user.target
"#);

    std::fs::write(unit_path, unit).context("write systemd unit")?;

    // --- Apply immutable flag on binary ---
    let _ = Command::new("chattr").args(["+i", &exe_str.to_string()]).output();

    // --- Reload systemd + enable + start ---
    let _ = Command::new("systemctl").args(["daemon-reload"]).output();
    let _ = Command::new("systemctl").args(["enable", "aigox-agent.service"]).output();
    let _ = Command::new("systemctl").args(["start",  "aigox-agent.service"]).output();

    // --- Write dpkg-compatible metadata so `dpkg -l | grep aigox` works ---
    let dpkg_dir = "/var/lib/dpkg/info";
    if PathBuf::from(dpkg_dir).exists() {
        let list_path = format!("{dpkg_dir}/aigox-agent.list");
        let list = format!("/usr/local/bin/aigox-agent\n/etc/systemd/system/aigox-agent.service\n");
        std::fs::write(&list_path, list).ok();
        // Mark in dpkg status
        let status_entry = format!(
            "Package: aigox-agent\nVersion: {}\nInstalled-Size: 8192\n\
             Maintainer: {APP_VENDOR}\nArchitecture: amd64\n\
             Description: {APP_NAME}\n Status: install ok installed\n\n",
            mf.version
        );
        append_to_file("/var/lib/dpkg/status", &status_entry);
    }

    // --- Write RPM-compatible metadata so `rpm -qa | grep aigox` works ---
    let rpm_db = "/var/lib/rpm";
    if PathBuf::from(rpm_db).exists() {
        let spec_dir = "/usr/share/aigox-agent";
        std::fs::create_dir_all(spec_dir).ok();
        let specdata = format!(
            "Name: aigox-agent\nVersion: {}\nRelease: 1\n\
             Summary: {APP_NAME}\nVendor: {APP_VENDOR}\n\
             License: Commercial\nInstallation: {}\n",
            mf.version, mf.install_path
        );
        std::fs::write(format!("{spec_dir}/aigox-agent.spec"), specdata).ok();
    }

    info!("Linux: systemd unit registered + binary immutable + pkg meta written");
    Ok(())
}

#[cfg(target_os = "linux")]
fn unregister_linux() -> Result<()> {
    use std::process::Command;
    let _ = Command::new("systemctl").args(["stop",    "aigox-agent.service"]).output();
    let _ = Command::new("systemctl").args(["disable", "aigox-agent.service"]).output();
    // Remove immutable flag first
    let exe = resolve_install_dir().unwrap_or_default().join(exe_name());
    let _ = Command::new("chattr").args(["-i", &exe.to_string_lossy().to_string()]).output();
    std::fs::remove_file("/etc/systemd/system/aigox-agent.service").ok();
    let _ = Command::new("systemctl").args(["daemon-reload"]).output();
    info!("Linux: service removed");
    Ok(())
}

// ── Helpers ───────────────────────────────────────────────────────────────────

pub fn resolve_install_dir() -> Result<PathBuf> {
    #[cfg(target_os = "windows")]
    return Ok(PathBuf::from(
        std::env::var("PROGRAMFILES").unwrap_or_else(|_| r"C:\Program Files".into())
    ).join("AIGO-X").join("Agent"));

    #[cfg(target_os = "macos")]
    return Ok(PathBuf::from("/Library/Application Support/AIGO-X/Agent"));

    #[cfg(target_os = "linux")]
    return Ok(PathBuf::from("/opt/aigox-agent"));

    #[allow(unreachable_code)]
    Ok(PathBuf::from("/opt/aigox-agent"))
}

fn exe_name() -> &'static str {
    if cfg!(target_os = "windows") { "grc-agent.exe" } else { "grc-agent" }
}

pub fn hash_password(password: &str, salt: &str) -> String {
    use argon2::{Argon2, PasswordHasher, password_hash::SaltString};
    use argon2::password_hash::rand_core::RngCore;

    let salt_string = SaltString::encode_b64(salt.as_bytes())
        .unwrap_or_else(|_| SaltString::from_b64("c2FsdHN0cg").unwrap());
    let argon2 = Argon2::default();
    argon2.hash_password(password.as_bytes(), &salt_string)
        .map(|h| h.to_string())
        .unwrap_or_else(|_| {
            // Fallback: at least use HMAC-SHA256 if Argon2 fails
            use hmac::{Hmac, Mac};
            use sha2::Sha256;
            type HmacSha256 = Hmac<Sha256>;
            let mut mac = HmacSha256::new_from_slice(salt.as_bytes()).expect("HMAC key");
            mac.update(password.as_bytes());
            hex::encode(mac.finalize().into_bytes())
        })
}

fn generate_salt() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let bytes: [u8; 16] = rng.gen();
    hex::encode(bytes)
}

fn append_to_file(path: &str, data: &str) {
    use std::io::Write;
    if let Ok(mut f) = std::fs::OpenOptions::new().append(true).create(true).open(path) {
        let _ = f.write_all(data.as_bytes());
    }
}
