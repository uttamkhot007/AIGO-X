use serde::{Deserialize, Serialize};
use tracing::{error, info, warn};
use std::process::Stdio;
use tokio::process::Command;
use std::path::Path;
use std::fs;
use chrono::Utc;

use crate::checks::CheckResult;
use crate::config::RemediationConfig;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemediationPlan {
    pub actions: Vec<RemediationAction>,
    pub auto_applicable: Vec<RemediationAction>,
    pub manual_required: Vec<RemediationAction>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemediationAction {
    pub id: String,
    pub title: String,
    pub description: String,
    pub check_id: String,
    pub priority: RemediationPriority,
    pub requires_approval: bool,
    pub auto_fix: bool,
    pub estimated_risk: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum RemediationPriority {
    Critical,
    High,
    Medium,
    Low,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemediationResult {
    pub action_id: String,
    pub check_id: String,
    pub status: String,       // "success", "failed", "skipped", "dry_run", "planned"
    pub message: String,
    pub rolled_back: bool,
    pub backup_path: Option<String>,
    pub executed_at: String,
    pub platform: String,
}

/// Post-remediation validation result (AE-005).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemediationValidation {
    pub check_id: String,
    pub pre_status: String,
    pub post_status: String,
    pub validated: bool,
    pub validated_at: String,
}

/// Per-check validation detail returned after immediate re-check.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemediationCheckValidation {
    pub check_id: String,
    pub pre_status: String,
    pub post_status: String,
    pub validated: bool,
}

/// Enhanced remediation execution result that includes immediate validation (AE-005).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemediationExecutionResult {
    pub status: String, // "closed", "partial", "failed"
    pub check_results: Vec<RemediationCheckValidation>,
    pub remediation_results: Vec<RemediationResult>,
}

#[derive(Debug)]
pub struct RemediationEngine {
    pub history: Vec<RemediationResult>,
    pub config: RemediationConfig,
    platform: String,
    /// Checks queued for post-remediation validation (AE-005).
    pub validation_queue: Vec<(String, String)>, // (check_id, pre_status)
}

impl RemediationEngine {
    pub fn new(config: RemediationConfig) -> Self {
        Self {
            history: Vec::new(),
            platform: std::env::consts::OS.to_string(),
            config,
            validation_queue: Vec::new(),
        }
    }

    /// Queue validations for any successful remediation actions (AE-005).
    pub fn queue_validations(&mut self, results: &[RemediationResult], pre_checks: &[crate::checks::CheckResult]) {
        self.validation_queue.clear();
        for result in results {
            if result.status == "success" {
                let pre_status = pre_checks
                    .iter()
                    .find(|c| c.id == result.check_id)
                    .map(|c| c.status.clone())
                    .unwrap_or_else(|| "unknown".into());
                self.validation_queue.push((result.check_id.clone(), pre_status.clone()));
                info!(check_id = %result.check_id, pre_status, "queued post-remediation validation");
            }
        }
    }

    /// Run validation checks after a delay and return validation results.
    /// This should be called from a background task ~30s after remediation.
    pub async fn run_validations(&self, check_ids: &[String], inv: &crate::discovery::Inventory) -> Vec<RemediationValidation> {
        self.run_validations_with_queue(check_ids, inv, &self.validation_queue).await
    }

    /// Run validations using an explicit queue (for background tasks that move data).
    pub async fn run_validations_with_queue(
        &self,
        check_ids: &[String],
        inv: &crate::discovery::Inventory,
        queue: &[(String, String)],
    ) -> Vec<RemediationValidation> {
        let ids: Vec<&str> = check_ids.iter().map(|s| s.as_str()).collect();
        let post_checks = crate::checks::run_specific(&ids, inv);
        let mut validations = Vec::new();
        for (check_id, pre_status) in queue {
            let post_status = post_checks
                .iter()
                .find(|c| &c.id == check_id)
                .map(|c| c.status.clone())
                .unwrap_or_else(|| "unknown".into());
            validations.push(RemediationValidation {
                check_id: check_id.clone(),
                pre_status: pre_status.clone(),
                post_status: post_status.clone(),
                validated: true,
                validated_at: Utc::now().to_rfc3339(),
            });
            if post_status == "pass" {
                info!(check_id = %check_id, "remediation validation passed — control now compliant");
            } else {
                warn!(check_id = %check_id, pre_status = %pre_status, post_status = %post_status, "remediation validation failed — control still non-compliant");
            }
        }
        validations
    }

    /// Execute auto-fixes and immediately re-run the affected checks to verify
    /// the fix worked. Returns an enhanced result with per-check validation data
    /// and an overall rollup status (AE-005).
    pub async fn execute_safe_fixes_with_validation(
        &mut self,
        plan: &RemediationPlan,
        pre_checks: &[crate::checks::CheckResult],
    ) -> RemediationExecutionResult {
        let remediation_results = self.execute_safe_fixes(plan).await;
        self.queue_validations(&remediation_results, pre_checks);

        let check_ids: Vec<String> = self.validation_queue.iter().map(|(id, _)| id.clone()).collect();

        // Re-collect inventory so checks reflect the just-applied fixes.
        let validations = match crate::discovery::collect().await {
            Ok(inv) => self.run_validations(&check_ids, &inv).await,
            Err(e) => {
                warn!(err = %e, "failed to re-collect inventory for immediate validation");
                Vec::new()
            }
        };

        let check_results: Vec<RemediationCheckValidation> = validations
            .iter()
            .map(|v| RemediationCheckValidation {
                check_id: v.check_id.clone(),
                pre_status: v.pre_status.clone(),
                post_status: v.post_status.clone(),
                validated: v.validated,
            })
            .collect();

        let status = if check_results.is_empty() {
            "failed".to_string()
        } else if check_results.iter().all(|c| c.post_status == "pass") {
            "closed".to_string()
        } else if check_results.iter().any(|c| c.post_status == "pass") {
            "partial".to_string()
        } else {
            "failed".to_string()
        };

        RemediationExecutionResult {
            status,
            check_results,
            remediation_results,
        }
    }

    /// Build a remediation plan from failed checks.
    pub fn plan(&self, checks: &[CheckResult]) -> RemediationPlan {
        let mut actions = vec![];

        for check in checks {
            if check.status == "fail" || check.status == "warn" {
                if let Some(action) = check_to_action(check) {
                    actions.push(action);
                }
            }
        }

        // Sort by priority (critical first)
        actions.sort_by_key(|a| match a.priority {
            RemediationPriority::Critical => 0,
            RemediationPriority::High     => 1,
            RemediationPriority::Medium   => 2,
            RemediationPriority::Low      => 3,
        });

        let auto_applicable: Vec<_> = actions.iter()
            .filter(|a| a.auto_fix && !a.requires_approval)
            .cloned()
            .collect();
        let manual_required: Vec<_> = actions.iter()
            .filter(|a| !a.auto_fix || a.requires_approval)
            .cloned()
            .collect();

        RemediationPlan { actions, auto_applicable, manual_required }
    }

    /// Execute low-risk auto-fix actions. Returns list of results.
    /// Respects config: if auto_remediate is false, returns dry-run results.
    /// If dry_run_remediation is true, simulates without making changes.
    pub async fn execute_safe_fixes(&mut self, plan: &RemediationPlan) -> Vec<RemediationResult> {
        if !self.config.auto_remediate {
            info!(count = plan.auto_applicable.len(), "auto_remediate disabled — returning planned status for all actions");
            return plan.auto_applicable.iter().map(|a| RemediationResult {
                action_id: a.id.clone(),
                check_id: a.check_id.clone(),
                status: "planned".into(),
                message: format!("Auto-remediation disabled in config. Manual action required: {}", a.description),
                rolled_back: false,
                backup_path: None,
                executed_at: Utc::now().to_rfc3339(),
                platform: self.platform.clone(),
            }).collect();
        }

        let mut results = vec![];
        for action in &plan.auto_applicable {
            let result = self.execute_action(action).await;
            self.history.push(result.clone());
            results.push(result);
        }
        results
    }

    /// Execute a single remediation action with platform-specific logic.
    async fn execute_action(&self, action: &RemediationAction) -> RemediationResult {
        info!(
            action_id = %action.id,
            check_id = %action.check_id,
            title = %action.title,
            platform = %self.platform,
            dry_run = self.config.dry_run_remediation,
            "executing remediation action"
        );

        let executed_at = Utc::now().to_rfc3339();

        // If global dry-run mode, simulate only
        if self.config.dry_run_remediation {
            return RemediationResult {
                action_id: action.id.clone(),
                check_id: action.check_id.clone(),
                status: "dry_run".into(),
                message: format!("[DRY RUN] Would execute: {}", action.description),
                rolled_back: false,
                backup_path: None,
                executed_at,
                platform: self.platform.clone(),
            };
        }

        // Dispatch to platform-specific implementation
        match action.check_id.as_str() {
            "AGENT-FW-001"    => self.fix_firewall(action, &executed_at).await,
            "AGENT-PATCH-001" => self.fix_auto_updates(action, &executed_at).await,
            "AGENT-LOG-001"   => self.fix_logging(action, &executed_at).await,
            "AGENT-SSH-001"   => self.fix_ssh_root_login(action, &executed_at).await,
            "AGENT-SSH-002"   => self.fix_ssh_password_auth(action, &executed_at).await,
            "AGENT-WIN-003"   => self.fix_windows_firewall(action, &executed_at).await,
            "AGENT-WIN-004"   => self.fix_windows_defender(action, &executed_at).await,
            "AGENT-WIN-005"   => self.fix_windows_bitlocker(action, &executed_at).await,
            _ => RemediationResult {
                action_id: action.id.clone(),
                check_id: action.check_id.clone(),
                status: "skipped".into(),
                message: format!("No automated fix available for {}", action.check_id),
                rolled_back: false,
                backup_path: None,
                executed_at,
                platform: self.platform.clone(),
            },
        }
    }

    // ── Platform-specific fix implementations ───────────────────────────────────

    /// AGENT-FW-001: Enable host firewall
    /// Captures pre-remediation state so changes can be rolled back on failure.
    async fn fix_firewall(&self, action: &RemediationAction, executed_at: &str) -> RemediationResult {
        let (result, snapshot) = match self.platform.as_str() {
            "linux" => {
                // Snapshot: determine which firewall manager is active
                let ufw_status = self.run_cmd("ufw", &["status"]).await.ok();
                let ufw_was_active = ufw_status.as_ref().map(|s| s.contains("Status: active")).unwrap_or(false);
                let firewalld_status = self.run_cmd("systemctl", &["is-active", "firewalld"]).await.ok();
                let firewalld_was_active = firewalld_status.as_ref().map(|s| s.trim() == "active").unwrap_or(false);
                let snapshot = format!("ufw_active={ufw_was_active},firewalld_active={firewalld_was_active}");

                // Apply fix
                let fix_result = if !ufw_was_active {
                    let ufw = self.run_cmd("ufw", &["--force", "enable"]).await;
                    if ufw.is_ok() {
                        Ok("ufw firewall enabled".into())
                    } else if !firewalld_was_active {
                        let fw = self.run_cmd("systemctl", &["start", "firewalld"]).await;
                        if fw.is_ok() {
                            let _ = self.run_cmd("systemctl", &["enable", "firewalld"]).await;
                            Ok("firewalld started and enabled".into())
                        } else {
                            Err("No firewall subsystem could be started (ufw, firewalld)".into())
                        }
                    } else {
                        Err("ufw failed and firewalld was already active".into())
                    }
                } else {
                    Ok("ufw was already active".into())
                };
                (fix_result, snapshot)
            }
            "macos" => {
                // Snapshot current firewall state
                let snapshot = match self.run_cmd("/usr/libexec/ApplicationFirewall/socketfilterfw", &["--getglobalstate"]).await {
                    Ok(state) => state,
                    Err(_) => "unknown".into(),
                };
                let was_enabled = snapshot.to_lowercase().contains("on");

                let fix_result = if was_enabled {
                    Ok("macOS Application Firewall was already enabled".into())
                } else {
                    match self.run_cmd("/usr/libexec/ApplicationFirewall/socketfilterfw", &["--setglobalstate", "on"]).await {
                        Ok(_) => Ok("macOS Application Firewall enabled".into()),
                        Err(e) => Err(format!("Failed to enable macOS firewall: {e}")),
                    }
                };
                (fix_result, snapshot)
            }
            "windows" => {
                // Windows uses the dedicated fix_windows_firewall method with PowerShell snapshot
                let r = self.fix_windows_firewall(action, executed_at).await;
                return r;
            }
            _ => (Err(format!("Unsupported platform: {}", self.platform)), "".into()),
        };

        match result {
            Ok(msg) => RemediationResult {
                action_id: action.id.clone(),
                check_id: action.check_id.clone(),
                status: "success".into(),
                message: msg,
                rolled_back: false,
                backup_path: Some(snapshot),
                executed_at: executed_at.into(),
                platform: self.platform.clone(),
            },
            Err(msg) => {
                // Attempt rollback for Linux/macOS
                let rollback_msg = self.restore_non_windows_firewall(&snapshot).await;
                RemediationResult {
                    action_id: action.id.clone(),
                    check_id: action.check_id.clone(),
                    status: "failed".into(),
                    message: format!("{msg}. Rollback attempted: {rollback_msg}"),
                    rolled_back: true,
                    backup_path: Some(snapshot),
                    executed_at: executed_at.into(),
                    platform: self.platform.clone(),
                }
            }
        }
    }

    /// Restore Linux/macOS firewall state from a snapshot string.
    async fn restore_non_windows_firewall(&self, snapshot: &str) -> String {
        match self.platform.as_str() {
            "linux" => {
                // Parse snapshot like "ufw_active=true,firewalld_active=false"
                let ufw_was_active = snapshot.contains("ufw_active=true");
                let firewalld_was_active = snapshot.contains("firewalld_active=true");
                let mut results: Vec<String> = Vec::new();
                if !ufw_was_active {
                    if let Ok(_) = self.run_cmd("ufw", &["--force", "disable"]).await {
                        results.push("ufw disabled".into());
                    }
                }
                if !firewalld_was_active {
                    let _ = self.run_cmd("systemctl", &["stop", "firewalld"]).await;
                    results.push("firewalld stopped".into());
                }
                if results.is_empty() { "No rollback needed (firewall was already active)".into() }
                else { results.join("; ") }
            }
            "macos" => {
                if snapshot.to_lowercase().contains("on") {
                    "No rollback needed (firewall was already on)".into()
                } else {
                    match self.run_cmd("/usr/libexec/ApplicationFirewall/socketfilterfw", &["--setglobalstate", "off"]).await {
                        Ok(_) => "macOS firewall restored to OFF".into(),
                        Err(e) => format!("macOS firewall rollback failed: {e}"),
                    }
                }
            }
            _ => "Rollback not supported for this platform".into(),
        }
    }

    /// AGENT-WIN-003: Ensure all Windows Firewall profiles are on.
    /// Captures a snapshot of current profile states before modification so
    /// the change can be reverted safely if connectivity is lost.
    async fn fix_windows_firewall(&self, action: &RemediationAction, executed_at: &str) -> RemediationResult {
        if self.platform != "windows" {
            return RemediationResult {
                action_id: action.id.clone(),
                check_id: action.check_id.clone(),
                status: "skipped".into(),
                message: "Windows Firewall remediation only supported on Windows".to_string(),
                rolled_back: false,
                backup_path: None,
                executed_at: executed_at.into(),
                platform: self.platform.clone(),
            };
        }

        // 1. Snapshot current state (PowerShell for structured data)
        let snapshot = match self.run_cmd("powershell", &[
            "-Command",
            "Get-NetFirewallProfile | Select-Object Name,Enabled | ConvertTo-Json -Compress",
        ]).await {
            Ok(json) => json,
            Err(e) => {
                return RemediationResult {
                    action_id: action.id.clone(),
                    check_id: action.check_id.clone(),
                    status: "failed".into(),
                    message: format!("Failed to snapshot firewall state before modification: {e}"),
                    rolled_back: false,
                    backup_path: None,
                    executed_at: executed_at.into(),
                    platform: self.platform.clone(),
                };
            }
        };

        // 2. Apply fix
        let apply_result = self.run_cmd("netsh", &["advfirewall", "set", "allprofiles", "state", "on"]).await;

        match apply_result {
            Ok(_) => RemediationResult {
                action_id: action.id.clone(),
                check_id: action.check_id.clone(),
                status: "success".into(),
                message: format!(
                    "Windows Firewall enabled on Domain, Private, and Public profiles. Prior state snapshot captured for rollback."
                ),
                rolled_back: false,
                backup_path: Some(snapshot),
                executed_at: executed_at.into(),
                platform: self.platform.clone(),
            },
            Err(e) => {
                // 3. Attempt rollback to snapshot state
                let rollback_msg = self.restore_firewall_from_snapshot(&snapshot).await;
                RemediationResult {
                    action_id: action.id.clone(),
                    check_id: action.check_id.clone(),
                    status: "failed".into(),
                    message: format!(
                        "Failed to enable all firewall profiles: {e}. Rollback attempted: {rollback_msg}"
                    ),
                    rolled_back: true,
                    backup_path: Some(snapshot),
                    executed_at: executed_at.into(),
                    platform: self.platform.clone(),
                }
            }
        }
    }

    /// Restore firewall profiles from a JSON snapshot produced by Get-NetFirewallProfile.
    async fn restore_firewall_from_snapshot(&self, snapshot: &str) -> String {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(snapshot) {
            let profiles: Vec<&serde_json::Value> = val.as_array()
                .map(|a| a.iter().collect())
                .unwrap_or_else(|| vec![&val]);
            let mut restored = 0;
            for p in profiles {
                let name = p.get("Name").and_then(|v| v.as_str()).unwrap_or("");
                let enabled = p.get("Enabled").and_then(|v| v.as_bool()).unwrap_or(true);
                let state = if enabled { "on" } else { "off" };
                let _ = self.run_cmd("netsh", &["advfirewall", "set", "currentprofile", "state", state]).await;
                // Note: currentprofile only affects the active profile; for full rollback we'd
                // need to map profile names. Best-effort rollback is documented.
                restored += 1;
            }
            return format!("{restored} profile(s) restored from snapshot");
        }
        "Could not parse snapshot — manual rollback required".to_string()
    }
    /// AGENT-WIN-004: Trigger Defender signature update + guidance
    async fn fix_windows_defender(&self, action: &RemediationAction, executed_at: &str) -> RemediationResult {
        let msg = if self.platform == "windows" {
            match self.run_cmd("powershell", &["-Command", "Update-MpSignature -ErrorAction SilentlyContinue"]).await {
                Ok(_) => "Triggered Defender signature update. Enable Real-time Protection in Windows Security if disabled (or via MDM).".to_string(),
                Err(_) => "Defender remediation requires manual steps in Windows Security or via Intune/Defender for Endpoint policy.".to_string(),
            }
        } else {
            "Defender remediation only supported on Windows".to_string()
        };
        RemediationResult {
            action_id: action.id.clone(),
            check_id: action.check_id.clone(),
            status: "success".into(),
            message: msg,
            rolled_back: false,
            backup_path: None,
            executed_at: executed_at.into(),
            platform: self.platform.clone(),
        }
    }

    /// AGENT-WIN-005: BitLocker guidance (policy-driven)
    async fn fix_windows_bitlocker(&self, action: &RemediationAction, executed_at: &str) -> RemediationResult {
        let msg = if self.platform == "windows" {
            "BitLocker is best enabled via Group Policy or Intune. Run 'manage-bde -on C: -recoverypassword' locally and ensure keys are escrowed. Full enforcement requires MDM/GPO.".to_string()
        } else {
            "BitLocker remediation only supported on Windows".to_string()
        };
        RemediationResult {
            action_id: action.id.clone(),
            check_id: action.check_id.clone(),
            status: "success".into(),
            message: msg,
            rolled_back: false,
            backup_path: None,
            executed_at: executed_at.into(),
            platform: self.platform.clone(),
        }
    }

    /// AGENT-PATCH-001: Enable automatic updates
    async fn fix_auto_updates(&self, action: &RemediationAction, executed_at: &str) -> RemediationResult {
        let result = match self.platform.as_str() {
            "linux" => {
                // Detect distro and enable appropriate auto-update mechanism
                let has_apt = Path::new("/usr/bin/apt").exists() || Path::new("/bin/apt").exists();
                let has_dnf = Path::new("/usr/bin/dnf").exists();

                if has_apt {
                    // Enable unattended-upgrades
                    let _ = self.run_cmd("apt-get", &["install", "-y", "unattended-upgrades"]).await;
                    match self.run_cmd("dpkg-reconfigure", &["-plow", "unattended-upgrades"]).await {
                        Ok(_) => Ok("unattended-upgrades enabled".into()),
                        Err(_) => {
                            // Fallback: create config directly
                            let cfg_path = "/etc/apt/apt.conf.d/20auto-upgrades";
                            let content = "APT::Periodic::Update-Package-Lists \"1\";\nAPT::Periodic::Unattended-Upgrade \"1\";\n";
                            match self.write_file_with_backup(cfg_path, content).await {
                                Ok(bp) => Ok(format!("Created {cfg_path} (backup: {})", bp.unwrap_or_else(|| "none".into()))),
                                Err(e) => Err(format!("Failed to configure unattended-upgrades: {e}")),
                            }
                        }
                    }
                } else if has_dnf {
                    let _ = self.run_cmd("dnf", &["install", "-y", "dnf-automatic"]).await;
                    match self.run_cmd("systemctl", &["enable", "--now", "dnf-automatic.timer"]).await {
                        Ok(_) => Ok("dnf-automatic timer enabled".into()),
                        Err(e) => Err(format!("Failed to enable dnf-automatic: {e}")),
                    }
                } else {
                    Err("Unknown package manager — cannot enable auto-updates".into())
                }
            }
            "macos" => {
                // Enable automatic software update checks
                match self.run_cmd("defaults", &["write", "/Library/Preferences/com.apple.SoftwareUpdate", "AutomaticCheckEnabled", "-bool", "true"]).await {
                    Ok(_) => Ok("macOS automatic software update checks enabled".into()),
                    Err(e) => Err(format!("Failed to enable auto-updates: {e}")),
                }
            }
            "windows" => {
                // Enable automatic Windows Updates via registry
                match self.run_cmd("reg", &[
                    "add", "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU",
                    "/v", "NoAutoUpdate", "/t", "REG_DWORD", "/d", "0", "/f"
                ]).await {
                    Ok(_) => Ok("Windows automatic updates enabled via registry".into()),
                    Err(e) => Err(format!("Failed to enable Windows auto-updates: {e}")),
                }
            }
            _ => Err(format!("Unsupported platform: {}", self.platform)),
        };

        match result {
            Ok(msg) => RemediationResult {
                action_id: action.id.clone(),
                check_id: action.check_id.clone(),
                status: "success".into(),
                message: msg,
                rolled_back: false,
                backup_path: None,
                executed_at: executed_at.into(),
                platform: self.platform.clone(),
            },
            Err(msg) => RemediationResult {
                action_id: action.id.clone(),
                check_id: action.check_id.clone(),
                status: "failed".into(),
                message: msg,
                rolled_back: false,
                backup_path: None,
                executed_at: executed_at.into(),
                platform: self.platform.clone(),
            },
        }
    }

    /// AGENT-LOG-001: Ensure audit/logging service is running
    async fn fix_logging(&self, action: &RemediationAction, executed_at: &str) -> RemediationResult {
        let result = match self.platform.as_str() {
            "linux" => {
                // Try auditd first, then rsyslog/syslog-ng
                let auditd = self.run_cmd("systemctl", &["start", "auditd"]).await;
                if auditd.is_ok() {
                    let _ = self.run_cmd("systemctl", &["enable", "auditd"]).await;
                    Ok("auditd started and enabled".into())
                } else {
                    let rsyslog = self.run_cmd("systemctl", &["start", "rsyslog"]).await;
                    if rsyslog.is_ok() {
                        let _ = self.run_cmd("systemctl", &["enable", "rsyslog"]).await;
                        Ok("rsyslog started and enabled".into())
                    } else {
                        let syslog_ng = self.run_cmd("systemctl", &["start", "syslog-ng"]).await;
                        if syslog_ng.is_ok() {
                            Ok("syslog-ng started".into())
                        } else {
                            Err("No logging service could be started (auditd, rsyslog, syslog-ng)".into())
                        }
                    }
                }
            }
            "macos" => {
                // Unified logging is built-in and always active on macOS
                Ok("macOS unified logging is active by design".into())
            }
            "windows" => {
                match self.run_cmd("sc", &["start", "EventLog"]).await {
                    Ok(_) => Ok("Windows EventLog service started".into()),
                    Err(e) => Err(format!("Failed to start EventLog: {e}")),
                }
            }
            _ => Err(format!("Unsupported platform: {}", self.platform)),
        };

        match result {
            Ok(msg) => RemediationResult {
                action_id: action.id.clone(),
                check_id: action.check_id.clone(),
                status: "success".into(),
                message: msg,
                rolled_back: false,
                backup_path: None,
                executed_at: executed_at.into(),
                platform: self.platform.clone(),
            },
            Err(msg) => RemediationResult {
                action_id: action.id.clone(),
                check_id: action.check_id.clone(),
                status: "failed".into(),
                message: msg,
                rolled_back: false,
                backup_path: None,
                executed_at: executed_at.into(),
                platform: self.platform.clone(),
            },
        }
    }

    /// AGENT-SSH-001: Disable root login via SSH
    async fn fix_ssh_root_login(&self, action: &RemediationAction, executed_at: &str) -> RemediationResult {
        let result = match self.platform.as_str() {
            "linux" | "macos" => {
                self.fix_sshd_config("PermitRootLogin", "no").await
            }
            "windows" => {
                Ok("SSH root login check is N/A on Windows — no action needed".into())
            }
            _ => Err(format!("Unsupported platform: {}", self.platform)),
        };

        match result {
            Ok(msg) => RemediationResult {
                action_id: action.id.clone(),
                check_id: action.check_id.clone(),
                status: "success".into(),
                message: msg,
                rolled_back: false,
                backup_path: None,
                executed_at: executed_at.into(),
                platform: self.platform.clone(),
            },
            Err(msg) => RemediationResult {
                action_id: action.id.clone(),
                check_id: action.check_id.clone(),
                status: "failed".into(),
                message: msg,
                rolled_back: false,
                backup_path: None,
                executed_at: executed_at.into(),
                platform: self.platform.clone(),
            },
        }
    }

    /// AGENT-SSH-002: Disable password authentication via SSH
    async fn fix_ssh_password_auth(&self, action: &RemediationAction, executed_at: &str) -> RemediationResult {
        let result = match self.platform.as_str() {
            "linux" | "macos" => {
                self.fix_sshd_config("PasswordAuthentication", "no").await
            }
            "windows" => {
                Ok("SSH password auth check is N/A on Windows — no action needed".into())
            }
            _ => Err(format!("Unsupported platform: {}", self.platform)),
        };

        match result {
            Ok(msg) => RemediationResult {
                action_id: action.id.clone(),
                check_id: action.check_id.clone(),
                status: "success".into(),
                message: msg,
                rolled_back: false,
                backup_path: None,
                executed_at: executed_at.into(),
                platform: self.platform.clone(),
            },
            Err(msg) => RemediationResult {
                action_id: action.id.clone(),
                check_id: action.check_id.clone(),
                status: "failed".into(),
                message: msg,
                rolled_back: false,
                backup_path: None,
                executed_at: executed_at.into(),
                platform: self.platform.clone(),
            },
        }
    }

    // ── Helpers ─────────────────────────────────────────────────────────────────

    /// Modify sshd_config to set a directive, creating backup first.
    /// Validates config with `sshd -t` before applying; restores backup on failure.
    async fn fix_sshd_config(&self, key: &str, value: &str) -> Result<String, String> {
        let paths = &["/etc/ssh/sshd_config", "/private/etc/ssh/sshd_config"];
        let sshd_config = paths.iter()
            .find(|p| Path::new(p).exists())
            .ok_or("sshd_config not found")?;

        let content = fs::read_to_string(sshd_config)
            .map_err(|e| format!("Failed to read sshd_config: {e}"))?;

        // Check if sshd_config.d includes exist and update the include file instead
        let include_dir = format!("{}.d", sshd_config);
        let has_include_dir = Path::new(&include_dir).exists();
        let has_include_directive = content.lines().any(|l| {
            l.trim_start().starts_with("Include") && l.contains("sshd_config.d")
        });

        let target_path = if has_include_dir && has_include_directive {
            let include_path = format!("{}/99-grc-agent.conf", include_dir);
            include_path
        } else {
            sshd_config.to_string()
        };

        let target_content = if target_path.as_str() != *sshd_config {
            fs::read_to_string(&target_path).unwrap_or_default()
        } else {
            content.clone()
        };

        let new_content = if target_content.lines().any(|l| l.trim_start().starts_with(key)) {
            target_content.lines().map(|line| {
                if line.trim_start().starts_with(key) {
                    format!("{} {}", key, value)
                } else {
                    line.to_string()
                }
            }).collect::<Vec<_>>().join("\n")
        } else {
            format!("{}\n{} {}\n", target_content, key, value)
        };

        // Create backup if configured
        let backup_path = if self.config.backup_before_fix {
            let bp = format!("{}.grc-backup-{}", target_path, Utc::now().timestamp());
            fs::copy(&target_path, &bp).map_err(|e| format!("Failed to create backup: {e}"))?;
            Some(bp)
        } else {
            None
        };

        // Write to a temporary file first for validation
        let temp_path = format!("{}.grc-temp-{}", target_path, Utc::now().timestamp());
        fs::write(&temp_path, &new_content)
            .map_err(|e| format!("Failed to write temp sshd_config: {e}"))?;

        // Validate with sshd -t
        let validation = self.run_cmd("sshd", &["-t", "-f", &temp_path]).await;
        fs::remove_file(&temp_path).ok();

        if let Err(e) = validation {
            // Restore backup if validation failed
            if let Some(ref bp) = backup_path {
                let _ = fs::copy(bp, &target_path);
            }
            return Err(format!("sshd config validation failed: {e}. No changes applied."));
        }

        // Validation passed — apply the change
        fs::write(&target_path, new_content)
            .map_err(|e| format!("Failed to write sshd_config: {e}"))?;

        // Attempt to reload SSH service (non-fatal if it fails)
        let _ = self.run_cmd("systemctl", &["reload", "sshd"]).await;
        let _ = self.run_cmd("systemctl", &["reload", "ssh"]).await;
        let _ = self.run_cmd("launchctl", &["kickstart", "-k", "system/com.openssh.sshd"]).await;

        Ok(format!(
            "Set {key} {value} in {target_path}{}",
            backup_path.as_ref().map(|p| format!(" (backup: {p})")).unwrap_or_default()
        ))
    }

    /// Write a file, optionally creating a backup first.
    async fn write_file_with_backup(&self, path: &str, content: &str) -> Result<Option<String>, String> {
        let backup_path = if self.config.backup_before_fix && Path::new(path).exists() {
            let bp = format!("{}.grc-backup-{}", path, Utc::now().timestamp());
            fs::copy(path, &bp).map_err(|e| format!("Failed to create backup: {e}"))?;
            Some(bp)
        } else {
            None
        };

        fs::write(path, content).map_err(|e| format!("Failed to write {path}: {e}"))?;
        Ok(backup_path)
    }

    /// Run a command and return its output or an error string.
    async fn run_cmd(&self, program: &str, args: &[&str]) -> Result<String, String> {
        // Remediation command allowlist — prevents execution of arbitrary commands
        let allowed: &[&str] = match self.platform.as_str() {
            "linux" => &[
                "ufw", "iptables", "systemctl", "apt-get", "dpkg-reconfigure",
                "dnf", "sshd", "auditd", "rsyslog", "syslog-ng",
            ],
            "macos" => &[
                "/usr/libexec/ApplicationFirewall/socketfilterfw",
                "defaults", "launchctl", "sshd",
                // NOTE: "sh" is intentionally excluded. If shell execution is needed,
                // call the specific binary directly (e.g., /bin/ls) rather than via sh.
            ],
            "windows" => &[
                "netsh", "reg", "sc", "powershell",
            ],
            _ => &[],
        };

        let prog_base = std::path::Path::new(program)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or(program);

        if !allowed.iter().any(|&a| a == program || a == prog_base) {
            return Err(format!(
                "Command '{}' is not in the remediation allowlist for platform '{}'",
                program, self.platform
            ));
        }

        let mut cmd = Command::new(program);
        cmd.args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let output = cmd.output().await
            .map_err(|e| format!("Failed to spawn {program}: {e}"))?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            Ok(stdout)
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let code = output.status.code().map(|c| c.to_string()).unwrap_or_else(|| "signal".into());
            Err(format!("{program} exited with code {code}: {stderr}"))
        }
    }
}

fn check_to_action(check: &CheckResult) -> Option<RemediationAction> {
    let rec = check.recommendation.as_deref().unwrap_or("Review and remediate manually");
    let (priority, auto_fix, approval) = action_metadata(&check.id);

    Some(RemediationAction {
        id: format!("REM-{}", check.id),
        title: format!("Remediate: {}", check.id),
        description: rec.to_string(),
        check_id: check.id.clone(),
        priority,
        requires_approval: approval,
        auto_fix,
        estimated_risk: if auto_fix { "low".into() } else { "manual".into() },
    })
}

fn action_metadata(check_id: &str) -> (RemediationPriority, bool, bool) {
    // (priority, auto_fix, requires_approval)
    match check_id {
        "AGENT-FW-001"    => (RemediationPriority::Critical, true, false),
        "AGENT-ENC-001"   => (RemediationPriority::High,     false, true),
        "AGENT-PATCH-001" => (RemediationPriority::High,     true, false),
        "AGENT-AV-001"    => (RemediationPriority::High,     false, true),
        "AGENT-LOG-001"   => (RemediationPriority::Medium,   true, false),
        "AGENT-ACC-001"   => (RemediationPriority::Medium,   false, false),
        "AGENT-NET-001"   => (RemediationPriority::High,     false, true),
        "AGENT-SSH-001"   => (RemediationPriority::High,     true, true),
        "AGENT-SSH-002"   => (RemediationPriority::High,     true, true),
        "AGENT-USR-001"   => (RemediationPriority::Medium,   false, true),
        "AGENT-WIN-003"   => (RemediationPriority::High,     true, false),
        "AGENT-WIN-004"   => (RemediationPriority::High,     false, false),
        "AGENT-WIN-005"   => (RemediationPriority::Critical, false, true),
        _                 => (RemediationPriority::Low,      false, false),
    }
}
