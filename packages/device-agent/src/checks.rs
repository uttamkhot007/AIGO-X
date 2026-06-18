use serde::{Deserialize, Serialize};
use crate::discovery::Inventory;

// ── Check severity ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CheckSeverity {
    Critical,
    High,
    Medium,
    Low,
}

impl CheckSeverity {
    /// Scoring weight.  Critical failures impact the score 4× more than low ones.
    pub fn weight(&self) -> u32 {
        match self {
            CheckSeverity::Critical => 4,
            CheckSeverity::High     => 2,
            CheckSeverity::Medium   => 1,
            CheckSeverity::Low      => 1,
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            CheckSeverity::Critical => "Critical",
            CheckSeverity::High     => "High",
            CheckSeverity::Medium   => "Medium",
            CheckSeverity::Low      => "Low",
        }
    }
}

impl Default for CheckSeverity {
    fn default() -> Self { CheckSeverity::Medium }
}

/// Derive check severity from its ID prefix so check functions don't need to
/// hard-code it — adding a new ID prefix here is the single source of truth.
fn severity_from_id(id: &str) -> CheckSeverity {
    // Critical
    if id.starts_with("AGENT-ENC")
        || id == "AGENT-AZ-002"
    {
        return CheckSeverity::Critical;
    }
    // High
    if id.starts_with("AGENT-FW")
        || id.starts_with("AGENT-SSH")
        || id.starts_with("AGENT-NET")
        || id.starts_with("AGENT-PATCH")
        || id.starts_with("AGENT-AV")
        || id.starts_with("AGENT-PWD")   // password policy — High
        || id.starts_with("AGENT-FIM")   // file integrity — High
    {
        return CheckSeverity::High;
    }
    // Medium
    if id.starts_with("AGENT-LOG")
        || id.starts_with("AGENT-USR")
        || id.starts_with("AGENT-WIN")
        || id.starts_with("AGENT-MAC")
        || id.starts_with("AGENT-AZ")
        || id.starts_with("AGENT-RES")
        || id.starts_with("AGENT-ACC")
        || id.starts_with("AGENT-BOOT")
        || id.starts_with("AGENT-SW")
        || id.starts_with("AGENT-EDR")
        || id.starts_with("AGENT-NTP")
    {
        return CheckSeverity::Medium;
    }
    CheckSeverity::Low
}

// ── CheckResult ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckResult {
    pub id: String,
    pub category: String,
    pub status: String,      // "pass" | "fail" | "warn" | "skip"
    pub evidence: String,
    pub recommendation: Option<String>,
    pub severity: CheckSeverity,
    /// Human-readable display name for the UI.
    pub display_name: String,
}

impl CheckResult {
    fn build(id: &str, status: &str, evidence: &str, recommendation: Option<&str>) -> Self {
        Self {
            category: category_from_id(id).into(),
            display_name: display_name_from_id(id).into(),
            id: id.into(),
            status: status.into(),
            evidence: evidence.into(),
            recommendation: recommendation.map(String::from),
            severity: severity_from_id(id),
        }
    }

    pub fn pass(id: &str, evidence: &str) -> Self {
        Self::build(id, "pass", evidence, None)
    }

    pub fn fail(id: &str, evidence: &str, recommendation: &str) -> Self {
        Self::build(id, "fail", evidence, Some(recommendation))
    }

    pub fn warn(id: &str, evidence: &str, recommendation: &str) -> Self {
        Self::build(id, "warn", evidence, Some(recommendation))
    }

    pub fn skip(id: &str, evidence: &str) -> Self {
        Self::build(id, "skip", evidence, None)
    }
}

/// Human-readable category label for UI grouping.
pub(crate) fn category_from_id(id: &str) -> &'static str {
    if id.starts_with("AGENT-ENC")  { return "Encryption"; }
    if id.starts_with("AGENT-FW")   { return "Firewall"; }
    if id.starts_with("AGENT-AV")   { return "Antivirus"; }
    if id.starts_with("AGENT-LOG")  { return "Audit Logging"; }
    if id.starts_with("AGENT-PATCH") { return "Patch Management"; }
    if id.starts_with("AGENT-BOOT") { return "Secure Boot"; }
    if id.starts_with("AGENT-ACC")  { return "Access Control"; }
    if id.starts_with("AGENT-USR")  { return "User Management"; }
    if id.starts_with("AGENT-NET")  { return "Network"; }
    if id.starts_with("AGENT-SSH")  { return "SSH"; }
    if id.starts_with("AGENT-WIN")  { return "Windows"; }
    if id.starts_with("AGENT-AZ")   { return "Azure AD / Entra ID"; }
    if id.starts_with("AGENT-RES")  { return "Resources"; }
    if id.starts_with("AGENT-PWD")  { return "Password Policy"; }
    "General"
}

/// Short display name for the UI.
pub(crate) fn display_name_from_id(id: &str) -> &str {
    match id {
        "AGENT-ENC-001"  => "Disk Encryption",
        "AGENT-FW-001"   => "Host Firewall",
        "AGENT-AV-001"   => "Antivirus / EDR",
        "AGENT-LOG-001"  => "Audit Logging",
        "AGENT-PATCH-001"=> "Auto Updates",
        "AGENT-BOOT-001" => "Secure Boot",
        "AGENT-ACC-001"  => "Screen Lock Enabled",
        "AGENT-ACC-002"  => "Guest Account Disabled",
        "AGENT-ACC-003"  => "Screen Lock Timeout",
        "AGENT-USR-001"  => "Local Admin Count",
        "AGENT-NET-001"  => "High-Risk Open Ports",
        "AGENT-SSH-001"  => "SSH Root Login",
        "AGENT-SSH-002"  => "SSH Password Auth",
        "AGENT-WIN-001"  => "UAC Enabled",
        "AGENT-WIN-002"  => "Remote Registry",
        "AGENT-WIN-003"  => "Windows Firewall (All Profiles)",
        "AGENT-WIN-004"  => "Defender Real-Time Protection + Fresh Signatures",
        "AGENT-WIN-005"  => "BitLocker Enforcement (All Volumes + Escrow)",
        "AGENT-MAC-001"  => "System Integrity Protection (SIP)",
        "AGENT-MAC-002"  => "Gatekeeper",
        "AGENT-SW-001"   => "Software Inventory Collected",
        "AGENT-SW-002"   => "Critical Software Categories Present",
        "AGENT-PATCH-002"=> "Missing OS Patches",
        "AGENT-EDR-001"  => "EDR / Endpoint Protection Detected",
        "AGENT-LOG-002"  => "Event Logging Enabled",
        "AGENT-NTP-001"  => "NTP Time Synchronization",
        "AGENT-FIM-001"  => "File Integrity Monitoring",
        "AGENT-AZ-001"   => "Azure AD Registration",
        "AGENT-AZ-002"   => "Conditional Access Compliance",
        "AGENT-RES-001"  => "Memory Pressure",
        "AGENT-PWD-001"  => "Password Min Length",
        "AGENT-PWD-002"  => "Password Complexity",
        "AGENT-PWD-003"  => "Password Max Age",
        _                => id,
    }
}

// ── Run all checks ─────────────────────────────────────────────────────────────

pub fn run_all(inv: &Inventory) -> Vec<CheckResult> {
    let mut results = vec![
        // ── Encryption ───────────────────────────────────────────────────────
        check_disk_encryption(inv),
        // ── Firewall ─────────────────────────────────────────────────────────
        check_firewall(inv),
        // ── Antivirus / EDR ──────────────────────────────────────────────────
        check_antivirus(inv),
        // ── Audit logging ────────────────────────────────────────────────────
        check_audit_logging(inv),
        // ── Patch management ─────────────────────────────────────────────────
        check_auto_update(inv),
        // ── Secure boot ──────────────────────────────────────────────────────
        check_secure_boot(inv),
        // ── Access control ───────────────────────────────────────────────────
        check_screen_lock(inv),
        check_screen_lock_timeout(inv),
        check_guest_account(inv),
        check_admin_count(inv),
        // ── Network ──────────────────────────────────────────────────────────
        check_high_risk_ports(inv),
        // ── SSH ──────────────────────────────────────────────────────────────
        check_ssh_root_login(inv),
        check_ssh_password_auth(inv),
        // ── Resources ────────────────────────────────────────────────────────
        check_memory_pressure(inv),
        // ── Password policy ──────────────────────────────────────────────────
        check_password_min_length(inv),
        check_password_complexity(inv),
        check_password_max_age(inv),
        // ── Azure AD / Entra ID ──────────────────────────────────────────────
        check_azure_ad_registered(inv),
        check_azure_ad_compliance(inv),
    ];

    // Windows-only checks
    if let Some(r) = check_uac(inv)             { results.push(r); }
    if let Some(r) = check_remote_registry(inv) { results.push(r); }
    if let Some(r) = check_windows_firewall_all_profiles(inv) { results.push(r); }
    if let Some(r) = check_windows_defender_rtp(inv)          { results.push(r); }
    if let Some(r) = check_windows_bitlocker_enforcement(inv) { results.push(r); }

    // macOS-only checks
    if let Some(r) = check_sip(inv)             { results.push(r); }
    if let Some(r) = check_gatekeeper(inv)      { results.push(r); }

    // Software inventory & patch checks
    results.push(check_software_inventory(inv));
    results.push(check_critical_software_present(inv));
    results.push(check_missing_os_patches(inv));

    // Phase 3: Security integration checks
    results.push(check_edr(inv));
    results.push(check_event_logging(inv));
    results.push(check_ntp_sync(inv));
    results.push(check_fim(inv));

    // Phase 5: Vulnerability intelligence
    results.push(check_cpe_coverage(inv));

    results
}

/// Run only the checks whose IDs are in `check_ids`.
/// Used for post-remediation validation (AE-005).
pub fn run_specific(check_ids: &[&str], inv: &Inventory) -> Vec<CheckResult> {
    let all = run_all(inv);
    all.into_iter()
        .filter(|r| check_ids.contains(&r.id.as_str()))
        .collect()
}

// ── Individual checks ──────────────────────────────────────────────────────────

// ── Encryption ─────────────────────────────────────────────────────────────────

fn check_disk_encryption(inv: &Inventory) -> CheckResult {
    match inv.encryption_status.as_str() {
        "enabled"  => {
            let methods: Vec<&str> = inv.encryption_volumes.iter()
                .filter_map(|v| v.method.as_deref())
                .collect();
            let detail = if methods.is_empty() {
                "Disk encryption is enabled".into()
            } else {
                format!("Disk encryption enabled ({})", methods.join(", "))
            };
            CheckResult::pass("AGENT-ENC-001", &detail)
        }
        "disabled" => CheckResult::fail(
            "AGENT-ENC-001",
            "Disk encryption is disabled",
            "Enable full-disk encryption: BitLocker (Windows) / FileVault (macOS) / LUKS (Linux)",
        ),
        _ => CheckResult::skip("AGENT-ENC-001", "Disk encryption status could not be determined"),
    }
}

// ── Firewall ───────────────────────────────────────────────────────────────────

fn check_firewall(inv: &Inventory) -> CheckResult {
    match inv.firewall_enabled {
        None        => CheckResult::skip("AGENT-FW-001", "Firewall status not collected"),
        Some(true)  => CheckResult::pass("AGENT-FW-001", "Host firewall is active"),
        Some(false) => CheckResult::fail(
            "AGENT-FW-001",
            "Host firewall is disabled",
            "Enable host-based firewall (ufw / Windows Firewall / pf)",
        ),
    }
}

// ── Antivirus ──────────────────────────────────────────────────────────────────

fn check_antivirus(inv: &Inventory) -> CheckResult {
    match inv.antivirus_enabled {
        None        => CheckResult::skip("AGENT-AV-001", "Antivirus status not collected"),
        Some(true)  => CheckResult::pass("AGENT-AV-001", "Antivirus / EDR is active"),
        Some(false) => CheckResult::fail(
            "AGENT-AV-001",
            "No antivirus / EDR detected",
            "Deploy endpoint antivirus or EDR software",
        ),
    }
}

// ── Audit logging ──────────────────────────────────────────────────────────────

fn check_audit_logging(inv: &Inventory) -> CheckResult {
    match inv.audit_logging_enabled {
        None        => CheckResult::skip("AGENT-LOG-001", "Audit logging status not collected"),
        Some(true)  => CheckResult::pass("AGENT-LOG-001", "Audit logging is enabled"),
        Some(false) => CheckResult::fail(
            "AGENT-LOG-001",
            "Audit logging is disabled or not running",
            "Enable system audit logging (auditd / Windows Event Log)",
        ),
    }
}

// ── Screen lock ────────────────────────────────────────────────────────────────

fn check_screen_lock(inv: &Inventory) -> CheckResult {
    match inv.screen_lock_enabled {
        None        => CheckResult::skip("AGENT-ACC-001", "Screen lock status not collected"),
        Some(true)  => CheckResult::pass("AGENT-ACC-001", "Screen lock is configured"),
        Some(false) => CheckResult::fail(
            "AGENT-ACC-001",
            "Screen lock / idle timeout is not configured",
            "Configure screen lock to activate after ≤15 minutes of inactivity",
        ),
    }
}

/// AGENT-ACC-003 — Screen lock timeout ≤ 15 minutes.
/// Even if screen lock is enabled, a very long timeout (or none) is a policy gap.
fn check_screen_lock_timeout(inv: &Inventory) -> CheckResult {
    const MAX_TIMEOUT_SECS: u32 = 900; // 15 minutes
    match inv.screen_lock_timeout_secs {
        None => CheckResult::skip(
            "AGENT-ACC-003",
            "Screen lock timeout could not be determined",
        ),
        Some(secs) if secs == 0 => CheckResult::skip(
            "AGENT-ACC-003",
            "Screen lock timeout is 0 (always on / unknown unit)",
        ),
        Some(secs) if secs <= MAX_TIMEOUT_SECS => CheckResult::pass(
            "AGENT-ACC-003",
            &format!("Screen lock activates after {}s (≤ 15 min policy)", secs),
        ),
        Some(secs) => CheckResult::fail(
            "AGENT-ACC-003",
            &format!(
                "Screen lock timeout is {}s ({:.0} min) — exceeds the 15-minute policy",
                secs,
                secs as f64 / 60.0,
            ),
            "Reduce idle lock timeout to 15 minutes (900 seconds) or less",
        ),
    }
}

// ── Auto update ────────────────────────────────────────────────────────────────

fn check_auto_update(inv: &Inventory) -> CheckResult {
    match inv.auto_update_enabled {
        None        => CheckResult::skip("AGENT-PATCH-001", "Auto-update status not collected"),
        Some(true)  => CheckResult::pass("AGENT-PATCH-001", "Automatic OS updates are enabled"),
        Some(false) => CheckResult::fail(
            "AGENT-PATCH-001",
            "Automatic OS updates are disabled",
            "Enable automatic OS patch management",
        ),
    }
}

// ── Guest account ──────────────────────────────────────────────────────────────

fn check_guest_account(inv: &Inventory) -> CheckResult {
    match inv.guest_account_disabled {
        None        => CheckResult::skip("AGENT-ACC-002", "Guest account status not collected"),
        Some(true)  => CheckResult::pass("AGENT-ACC-002", "Guest account is disabled"),
        Some(false) => CheckResult::fail(
            "AGENT-ACC-002",
            "Guest account is enabled",
            "Disable the guest account",
        ),
    }
}

// ── Secure boot ────────────────────────────────────────────────────────────────

fn check_secure_boot(inv: &Inventory) -> CheckResult {
    match inv.secure_boot_enabled {
        None        => CheckResult::skip("AGENT-BOOT-001", "Secure Boot status not collected"),
        Some(true)  => CheckResult::pass("AGENT-BOOT-001", "Secure Boot is enabled"),
        Some(false) => CheckResult::warn(
            "AGENT-BOOT-001",
            "Secure Boot is disabled or could not be verified",
            "Enable Secure Boot in UEFI firmware settings",
        ),
    }
}

// ── Admin count ────────────────────────────────────────────────────────────────

fn check_admin_count(inv: &Inventory) -> CheckResult {
    let admin_count = inv.users.iter().filter(|u| u.is_admin).count();
    if admin_count <= 2 {
        CheckResult::pass(
            "AGENT-USR-001",
            &format!("Local admin account count is within limit ({admin_count})"),
        )
    } else {
        CheckResult::fail(
            "AGENT-USR-001",
            &format!("Too many local administrator accounts ({admin_count})"),
            "Restrict local admin group to ≤2 named accounts",
        )
    }
}

// ── Network ────────────────────────────────────────────────────────────────────

fn check_high_risk_ports(inv: &Inventory) -> CheckResult {
    const HIGH_RISK: &[u16] = &[21, 23, 135, 137, 138, 139, 445, 3389, 5900];
    let risky: Vec<u16> = inv.open_ports.iter().copied()
        .filter(|p| HIGH_RISK.contains(p)).collect();
    if risky.is_empty() {
        CheckResult::pass("AGENT-NET-001", "No high-risk ports are open")
    } else {
        let ports: Vec<String> = risky.iter().map(|p| p.to_string()).collect();
        CheckResult::fail(
            "AGENT-NET-001",
            &format!("High-risk ports open: {}", ports.join(", ")),
            "Close or firewall high-risk ports unless explicitly required",
        )
    }
}

// ── SSH ────────────────────────────────────────────────────────────────────────

fn check_ssh_root_login(inv: &Inventory) -> CheckResult {
    match inv.ssh_root_login_disabled {
        None        => CheckResult::skip("AGENT-SSH-001", "SSH config not readable"),
        Some(true)  => CheckResult::pass("AGENT-SSH-001", "SSH root login is disabled"),
        Some(false) => CheckResult::fail(
            "AGENT-SSH-001",
            "SSH root login is enabled (PermitRootLogin != no)",
            "Set PermitRootLogin no in /etc/ssh/sshd_config",
        ),
    }
}

fn check_ssh_password_auth(inv: &Inventory) -> CheckResult {
    match inv.password_auth_disabled {
        None        => CheckResult::skip("AGENT-SSH-002", "SSH config not readable"),
        Some(true)  => CheckResult::pass("AGENT-SSH-002", "SSH password authentication is disabled"),
        Some(false) => CheckResult::fail(
            "AGENT-SSH-002",
            "SSH password authentication is enabled",
            "Set PasswordAuthentication no in /etc/ssh/sshd_config",
        ),
    }
}

// ── Resources ──────────────────────────────────────────────────────────────────

/// AGENT-RES-001 — Memory pressure check.
fn check_memory_pressure(inv: &Inventory) -> CheckResult {
    match inv.memory_usage_pct {
        None => CheckResult::skip("AGENT-RES-001", "Memory usage not collected"),
        Some(pct) if pct < 80.0 => CheckResult::pass(
            "AGENT-RES-001",
            &format!("Memory usage is normal ({pct:.0}%)"),
        ),
        Some(pct) if pct < 90.0 => CheckResult::warn(
            "AGENT-RES-001",
            &format!("Memory usage is elevated ({pct:.0}%)"),
            "Investigate high memory consumers; consider adding RAM or restricting processes",
        ),
        Some(pct) => CheckResult::fail(
            "AGENT-RES-001",
            &format!("Memory usage is critical ({pct:.0}%) — endpoint availability risk"),
            "Immediately investigate and terminate runaway processes or add swap/RAM",
        ),
    }
}

// ── Password Policy ────────────────────────────────────────────────────────────

/// AGENT-PWD-001 — Minimum password length ≥ 12 characters.
/// NIST SP 800-63B (§5.1.1), CIS Benchmark, and ISO 27001 A.9.4.3 all require
/// at least 12 characters for machine-facing credentials.
fn check_password_min_length(inv: &Inventory) -> CheckResult {
    const MIN_REQUIRED: u32 = 12;
    match inv.password_min_length {
        None => CheckResult::skip(
            "AGENT-PWD-001",
            "Password minimum length policy could not be read",
        ),
        Some(len) if len >= MIN_REQUIRED => CheckResult::pass(
            "AGENT-PWD-001",
            &format!("Password minimum length is {len} characters (≥{MIN_REQUIRED} required)"),
        ),
        Some(len) => CheckResult::fail(
            "AGENT-PWD-001",
            &format!("Password minimum length is {len} characters — below the 12-character requirement"),
            "Set minimum password length to 12+ characters in your OS/domain password policy",
        ),
    }
}

/// AGENT-PWD-002 — Password complexity (multiple character classes) enabled.
/// Checks that the OS or domain enforces uppercase, lowercase, digit, and/or
/// special characters in addition to minimum length.
fn check_password_complexity(inv: &Inventory) -> CheckResult {
    match inv.password_complexity_enabled {
        None => CheckResult::skip(
            "AGENT-PWD-002",
            "Password complexity policy could not be read",
        ),
        Some(true) => {
            let detail = match inv.password_min_classes {
                Some(n) if n >= 3 => format!("Password complexity enabled ({n} character classes required)"),
                Some(n)           => format!("Password complexity enabled ({n} character class required)"),
                None              => "Password complexity is enabled".into(),
            };
            CheckResult::pass("AGENT-PWD-002", &detail)
        }
        Some(false) => CheckResult::fail(
            "AGENT-PWD-002",
            "Password complexity rules are not enforced",
            "Enable password complexity: require uppercase, lowercase, digits, and special characters \
             (pam_pwquality on Linux, Password Policy on Windows, pwpolicy on macOS)",
        ),
    }
}

/// AGENT-PWD-003 — Maximum password age ≤ 90 days.
/// NIST SP 800-53 IA-5(1) and many standards require passwords to be rotated
/// at least every 90 days (some frameworks allow up to 365 days).
fn check_password_max_age(inv: &Inventory) -> CheckResult {
    const MAX_ALLOWED_DAYS: u32 = 90;
    const WARN_THRESHOLD_DAYS: u32 = 180;
    match inv.password_max_age_days {
        None => CheckResult::skip(
            "AGENT-PWD-003",
            "Password maximum age policy could not be read",
        ),
        Some(days) if days == 0 || days > 365 * 10 => CheckResult::warn(
            "AGENT-PWD-003",
            "Password maximum age is set to unlimited or very long",
            "Set a maximum password age of 90 days to enforce regular rotation",
        ),
        Some(days) if days <= MAX_ALLOWED_DAYS => CheckResult::pass(
            "AGENT-PWD-003",
            &format!("Password maximum age is {days} days (≤90 day policy)"),
        ),
        Some(days) if days <= WARN_THRESHOLD_DAYS => CheckResult::warn(
            "AGENT-PWD-003",
            &format!("Password maximum age is {days} days — exceeds 90-day recommendation"),
            "Reduce password maximum age to 90 days or less",
        ),
        Some(days) => CheckResult::fail(
            "AGENT-PWD-003",
            &format!("Password maximum age is {days} days — significantly exceeds 90-day requirement"),
            "Set maximum password age to 90 days in your OS/domain policy",
        ),
    }
}

// ── Azure AD / Entra ID ────────────────────────────────────────────────────────

/// AGENT-AZ-001 — Azure AD / Microsoft Entra ID device registration.
fn check_azure_ad_registered(inv: &Inventory) -> CheckResult {
    match &inv.azure_ad_device_id {
        None => CheckResult::skip(
            "AGENT-AZ-001",
            "Azure AD identity not configured — set GRC_AZURE_DEVICE_ID to enable",
        ),
        Some(device_id) => match inv.azure_ad_registered {
            Some(true) => CheckResult::pass(
                "AGENT-AZ-001",
                &format!("Device is Azure AD registered (device_id: {})", device_id),
            ),
            _ => CheckResult::fail(
                "AGENT-AZ-001",
                "Device has an Azure AD device ID set but is not confirmed registered",
                "Verify device registration in Microsoft Entra ID portal and re-run MDM enrollment",
            ),
        },
    }
}

/// AGENT-AZ-002 — Conditional Access compliance badge (Critical weight).
fn check_azure_ad_compliance(inv: &Inventory) -> CheckResult {
    match inv.azure_ad_compliant {
        None => CheckResult::skip(
            "AGENT-AZ-002",
            "Conditional Access compliance status not available — set GRC_AZURE_COMPLIANT",
        ),
        Some(true) => CheckResult::pass(
            "AGENT-AZ-002",
            "Device meets Conditional Access compliance policy",
        ),
        Some(false) => CheckResult::fail(
            "AGENT-AZ-002",
            "Device is marked non-compliant by Conditional Access policy",
            "Resolve compliance policy violations in Microsoft Intune / Endpoint Manager, then sync",
        ),
    }
}

// ── Windows-specific ───────────────────────────────────────────────────────────

fn check_uac(inv: &Inventory) -> Option<CheckResult> {
    inv.uac_enabled.map(|enabled| {
        if enabled {
            CheckResult::pass("AGENT-WIN-001", "User Account Control (UAC) is enabled")
        } else {
            CheckResult::fail(
                "AGENT-WIN-001",
                "User Account Control (UAC) is disabled",
                "Enable UAC in Windows security settings",
            )
        }
    })
}

fn check_remote_registry(inv: &Inventory) -> Option<CheckResult> {
    inv.remote_registry_disabled.map(|disabled| {
        if disabled {
            CheckResult::pass("AGENT-WIN-002", "Remote Registry service is disabled")
        } else {
            CheckResult::warn(
                "AGENT-WIN-002",
                "Remote Registry service is running",
                "Disable the Remote Registry service unless explicitly required",
            )
        }
    })
}

/// AGENT-WIN-003: All three Windows Firewall profiles enabled
fn check_windows_firewall_all_profiles(inv: &Inventory) -> Option<CheckResult> {
    inv.firewall_all_profiles_enabled.map(|all_on| {
        if all_on {
            CheckResult::pass("AGENT-WIN-003", "Windows Firewall is enabled on all profiles (Domain/Private/Public)")
        } else {
            CheckResult::fail(
                "AGENT-WIN-003",
                "One or more Windows Firewall profiles are disabled",
                "Enable Windows Firewall for Domain, Private, and Public profiles via secpol.msc or Group Policy",
            )
        }
    })
}

/// AGENT-WIN-004: Defender RTP + reasonably fresh signatures (< 7 days)
fn check_windows_defender_rtp(inv: &Inventory) -> Option<CheckResult> {
    match (inv.defender_real_time_protection, inv.defender_signature_age_days) {
        (Some(true), Some(age)) if age <= 7 => Some(CheckResult::pass(
            "AGENT-WIN-004",
            &format!("Defender real-time protection enabled, signatures {} day(s) old", age),
        )),
        (Some(true), Some(age)) => Some(CheckResult::warn(
            "AGENT-WIN-004",
            &format!("Defender RTP enabled but signatures are {} days old", age),
            "Force signature update: Update-MpSignature",
        )),
        (Some(false), _) => Some(CheckResult::fail(
            "AGENT-WIN-004",
            "Defender real-time protection is disabled",
            "Enable Real-time protection in Windows Security > Virus & threat protection",
        )),
        _ => None,
    }
}

/// AGENT-WIN-005: BitLocker on all fixed volumes + basic escrow signal
fn check_windows_bitlocker_enforcement(inv: &Inventory) -> Option<CheckResult> {
    if inv.encryption_volumes.is_empty() {
        return None;
    }
    let fixed_volumes: Vec<_> = inv.encryption_volumes.iter()
        .filter(|v| v.path.to_uppercase().ends_with(':') && !v.path.to_uppercase().contains("CD") && !v.path.to_uppercase().contains("DVD"))
        .collect();

    if fixed_volumes.is_empty() {
        return None;
    }

    let all_encrypted = fixed_volumes.iter().all(|v| v.status == "enabled");
    let any_unknown = fixed_volumes.iter().any(|v| v.status == "unknown");

    if all_encrypted && !any_unknown {
        Some(CheckResult::pass(
            "AGENT-WIN-005",
            &format!("BitLocker enabled on all {} fixed volume(s)", fixed_volumes.len()),
        ))
    } else if all_encrypted {
        Some(CheckResult::warn(
            "AGENT-WIN-005",
            "BitLocker appears enabled but some volume status is unknown",
            "Run 'manage-bde -status' and ensure recovery keys are escrowed to Azure AD / on-prem AD",
        ))
    } else {
        Some(CheckResult::fail(
            "AGENT-WIN-005",
            "BitLocker is not enabled on all fixed volumes",
            "Enable BitLocker on all fixed drives and escrow recovery keys (Group Policy or Intune)",
        ))
    }
}

// ── macOS-specific ───────────────────────────────────────────────────────────────

fn check_sip(inv: &Inventory) -> Option<CheckResult> {
    inv.sip_enabled.map(|enabled| {
        if enabled {
            CheckResult::pass("AGENT-MAC-001", "System Integrity Protection (SIP) is enabled")
        } else {
            CheckResult::warn(
                "AGENT-MAC-001",
                "System Integrity Protection (SIP) is disabled",
                "Enable SIP via Recovery Mode: csrutil enable",
            )
        }
    })
}

fn check_gatekeeper(inv: &Inventory) -> Option<CheckResult> {
    inv.gatekeeper_enabled.map(|enabled| {
        if enabled {
            CheckResult::pass("AGENT-MAC-002", "Gatekeeper is enabled")
        } else {
            CheckResult::warn(
                "AGENT-MAC-002",
                "Gatekeeper is disabled",
                "Enable Gatekeeper: sudo spctl --master-enable",
            )
        }
    })
}

// ── Software inventory & patch checks ────────────────────────────────────────────

fn check_software_inventory(inv: &Inventory) -> CheckResult {
    let count = inv.software_inventory.len();
    if count > 0 {
        CheckResult::pass(
            "AGENT-SW-001",
            &format!("Software inventory collected ({count} packages)"),
        )
    } else {
        CheckResult::skip("AGENT-SW-001", "Software inventory not collected")
    }
}

/// AGENT-SW-002 — Critical software packages present (NOT vulnerability detection).
/// This check inventories the presence of high-risk software categories
/// (browsers, remote access, crypto libraries) for asset management purposes.
/// Actual CVE mapping requires the vulnerability scan pipeline (AGENT-VULN-001).
fn check_critical_software_present(inv: &Inventory) -> CheckResult {
    let critical_names = [
        "openssl", "openssh", "ssh", "python", "ruby", "node",
        "java", "jdk", "jre", "chrome", "firefox", "edge",
        "safari", "zoom", "teamviewer", "anydesk",
    ];
    let present: Vec<&str> = inv.software_inventory
        .iter()
        .filter(|s| critical_names.iter().any(|&n| s.name.to_lowercase().contains(n)))
        .map(|s| s.name.as_str())
        .collect();

    if present.is_empty() {
        CheckResult::pass("AGENT-SW-002", "No high-risk software categories detected")
    } else {
        CheckResult::pass(
            "AGENT-SW-002",
            &format!("High-risk software categories present ({}): {}", present.len(), present.join(", ")),
        )
    }
}

fn check_missing_os_patches(inv: &Inventory) -> CheckResult {
    let missing = inv.patch_status.iter().filter(|p| p.status == "missing").count();
    if missing == 0 {
        CheckResult::pass("AGENT-PATCH-002", "All OS patches are up to date")
    } else {
        CheckResult::fail(
            "AGENT-PATCH-002",
            &format!("{missing} OS patch(es) are missing"),
            "Apply pending OS updates via system update mechanism",
        )
    }
}

// ── Phase 3: Security integration checks ─────────────────────────────────────────

fn check_edr(inv: &Inventory) -> CheckResult {
    match inv.edr_detected {
        None => CheckResult::skip("AGENT-EDR-001", "EDR detection not performed"),
        Some(true) => {
            let products = inv.edr_products.join(", ");
            CheckResult::pass("AGENT-EDR-001", &format!("EDR/endpoint protection active: {products}"))
        }
        Some(false) => CheckResult::warn(
            "AGENT-EDR-001",
            "No EDR or endpoint protection detected",
            "Deploy CrowdStrike, SentinelOne, Defender, or comparable EDR solution",
        ),
    }
}

fn check_event_logging(inv: &Inventory) -> CheckResult {
    match inv.event_logging_enabled {
        None => CheckResult::skip("AGENT-LOG-002", "Event logging status not collected"),
        Some(true) => CheckResult::pass("AGENT-LOG-002", "Event logging is enabled"),
        Some(false) => CheckResult::fail(
            "AGENT-LOG-002",
            "Event logging is disabled or not running",
            "Enable auditd/rsyslog (Linux), EventLog (Windows), or unified logging (macOS)",
        ),
    }
}

fn check_ntp_sync(inv: &Inventory) -> CheckResult {
    match inv.ntp_synced {
        None => CheckResult::skip("AGENT-NTP-001", "NTP sync status not collected"),
        Some(true) => CheckResult::pass("AGENT-NTP-001", "System clock is NTP-synchronized"),
        Some(false) => CheckResult::warn(
            "AGENT-NTP-001",
            "System clock is not NTP-synchronized",
            "Enable NTP synchronization (chrony, systemd-timesyncd, or Windows Time Service)",
        ),
    }
}

fn check_fim(inv: &Inventory) -> CheckResult {
    match inv.fim_status.as_deref() {
        None | Some("unsupported") => CheckResult::skip("AGENT-FIM-001", "FIM not supported on this platform"),
        Some("baseline_created") => CheckResult::pass(
            "AGENT-FIM-001",
            "FIM baseline created — monitoring active from next cycle",
        ),
        Some("clean") => CheckResult::pass("AGENT-FIM-001", "FIM clean — no file integrity violations"),
        Some("violation") => {
            let detail = if inv.fim_violations.is_empty() {
                "File integrity violations detected".into()
            } else {
                format!("FIM violations: {}", inv.fim_violations.join("; "))
            };
            CheckResult::fail("AGENT-FIM-001", &detail, "Review critical system files for unauthorized changes")
        }
        Some(_) => CheckResult::skip("AGENT-FIM-001", "Unknown FIM status"),
    }
}

fn check_cpe_coverage(inv: &Inventory) -> CheckResult {
    let total = inv.software_inventory.len();
    let with_cpe = inv.software_inventory.iter().filter(|s| s.cpe_identifier.is_some()).count();
    
    if total == 0 {
        return CheckResult::skip("AGENT-VULN-001", "No software inventory collected");
    }
    
    let coverage_pct = (with_cpe * 100) / total;
    
    if coverage_pct >= 80 {
        CheckResult::pass(
            "AGENT-VULN-001",
            &format!("Software inventory CPE coverage: {with_cpe}/{total} ({coverage_pct}%) — ready for vulnerability scanning"),
        )
    } else if coverage_pct >= 50 {
        CheckResult::warn(
            "AGENT-VULN-001",
            &format!("Software inventory CPE coverage: {with_cpe}/{total} ({coverage_pct}%) — partial vulnerability visibility"),
            "Improve CPE generation for installed software to enable CVE mapping",
        )
    } else {
        CheckResult::fail(
            "AGENT-VULN-001",
            &format!("Software inventory CPE coverage: {with_cpe}/{total} ({coverage_pct}%) — insufficient for vulnerability scanning"),
            "Add CPE identifiers to software inventory for CVE correlation",
        )
    }
}
