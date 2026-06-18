use anyhow::Result;
use serde::{Deserialize, Serialize};
use sysinfo::{Disks, Networks, System};
use tracing::warn;

// ── Inventory ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Inventory {
    pub hostname: String,
    pub platform: String,
    pub arch: String,
    pub collected_at: String,
    pub hardware: HardwareInfo,
    pub os: OsInfo,
    pub users: Vec<UserInfo>,
    pub services: Vec<ServiceInfo>,
    pub open_ports: Vec<u16>,
    // ── Encryption ───────────────────────────────────────────────────────────
    /// "enabled" | "disabled" | "partial" | "unknown"
    pub encryption_status: String,
    /// Detailed per-volume encryption info (empty on platforms that don't expose it).
    pub encryption_volumes: Vec<EncryptionVolumeInfo>,
    // ── Network ──────────────────────────────────────────────────────────────
    pub firewall_enabled: Option<bool>,
    pub tls_version: Option<String>,
    pub ip_addresses: Vec<String>,
    pub mac_addresses: Vec<String>,
    // ── Endpoint security ────────────────────────────────────────────────────
    pub antivirus_enabled: Option<bool>,
    pub antivirus_up_to_date: Option<bool>,
    pub audit_logging_enabled: Option<bool>,
    pub auto_update_enabled: Option<bool>,
    pub secure_boot_enabled: Option<bool>,
    // ── Access control ───────────────────────────────────────────────────────
    pub screen_lock_enabled: Option<bool>,
    /// Idle timeout in seconds before the screen locks. None if unknown.
    pub screen_lock_timeout_secs: Option<u32>,
    pub guest_account_disabled: Option<bool>,
    // ── Password policy ──────────────────────────────────────────────────────
    /// Minimum required password length. None if policy is unset or unreadable.
    pub password_min_length: Option<u32>,
    /// Maximum password age in days before expiry is enforced.
    pub password_max_age_days: Option<u32>,
    /// Whether the OS/domain enforces password complexity rules.
    pub password_complexity_enabled: Option<bool>,
    /// Minimum number of character classes required (uppercase/lowercase/digit/special).
    pub password_min_classes: Option<u32>,
    // ── SSH (Linux/macOS) ────────────────────────────────────────────────────
    pub ssh_root_login_disabled: Option<bool>,
    pub password_auth_disabled: Option<bool>,
    // ── Windows-specific ─────────────────────────────────────────────────────
    pub remote_registry_disabled: Option<bool>,
    pub uac_enabled: Option<bool>,
    // Richer Windows data for dedicated AGENT-WIN-* checks (parity with Mac)
    pub defender_real_time_protection: Option<bool>,
    pub defender_signature_age_days: Option<u32>,
    pub firewall_all_profiles_enabled: Option<bool>,
    // ── macOS platform security ──────────────────────────────────────────────
    pub sip_enabled: Option<bool>,
    pub gatekeeper_enabled: Option<bool>,
    // ── Resource usage ───────────────────────────────────────────────────────
    /// Current RAM usage as a percentage of total RAM.
    pub memory_usage_pct: Option<f32>,
    /// Average CPU usage across all cores (percentage).
    pub cpu_usage_pct: Option<f32>,
    // ── Software inventory & patches ─────────────────────────────────────────
    pub software_inventory: Vec<SoftwareItem>,
    pub patch_status: Vec<PatchItem>,
    // ── Security integrations (Phase 3) ──────────────────────────────────────
    pub edr_detected: Option<bool>,
    pub edr_products: Vec<String>,
    pub event_logging_enabled: Option<bool>,
    pub ntp_synced: Option<bool>,
    pub fim_status: Option<String>,
    pub fim_violations: Vec<String>,
    // ── Azure AD / Entra ID identity ─────────────────────────────────────────
    pub azure_ad_device_id: Option<String>,
    pub azure_ad_registered: Option<bool>,
    pub azure_ad_compliant: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct HardwareInfo {
    pub cpu: String,
    pub ram_gb: f64,
    pub disk_gb: f64,
    pub serial_number: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct OsInfo {
    pub name: String,
    pub version: String,
    pub patch_level: Option<String>,
    pub eol_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserInfo {
    pub name: String,
    pub is_admin: bool,
    pub password_expired: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceInfo {
    pub name: String,
    pub status: String,
    pub start_type: String,
}

/// Per-volume disk encryption detail.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptionVolumeInfo {
    /// Volume path (e.g. "/" or "C:").
    pub path: String,
    /// "enabled" | "disabled" | "unknown"
    pub status: String,
    /// Encryption method where detectable (e.g. "LUKS2", "FileVault 2", "BitLocker").
    pub method: Option<String>,
}

// ── Software Inventory ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoftwareItem {
    pub name: String,
    pub version: String,
    pub publisher: Option<String>,
    pub install_date: Option<String>,
    pub source: String,
    pub cpe_identifier: Option<String>,
}

/// Generate a CPE 2.3 URI from software metadata.
/// Format: cpe:2.3:a:{vendor}:{product}:{version}:*:*:*:*:*:*:*
fn generate_cpe(name: &str, version: &str, publisher: Option<&str>) -> Option<String> {
    if version.is_empty() || version == "unknown" {
        return None;
    }
    
    let vendor = publisher.map(|p| normalize_cpe_part(p))
        .or_else(|| Some(normalize_cpe_part(name)))
        .unwrap_or_default();
    
    let product = normalize_cpe_part(name);
    let ver = version.replace(' ', "_");
    
    // Skip common non-applicables
    if vendor.is_empty() || product.is_empty() {
        return None;
    }
    
    Some(format!("cpe:2.3:a:{}:{}:{}:*:*:*:*:*:*:*", vendor, product, ver))
}

fn normalize_cpe_part(s: &str) -> String {
    s.to_lowercase()
        .replace(' ', "_")
        .replace("/", "_")
        .replace("\\", "_")
        .replace("(", "")
        .replace(")", "")
        .replace("&", "and")
        .replace("+", "plus")
        .replace("-", "_")
        .replace(".", "_")
        .replace("__", "_")
        .trim_matches('_')
        .to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatchItem {
    pub name: String,
    pub current_version: Option<String>,
    pub available_version: Option<String>,
    pub severity: Option<String>,
    pub install_date: Option<String>,
    pub status: String,
}

// ── Collected platform posture (replaces the unwieldy 13-element tuple) ────────

#[derive(Debug, Default)]
struct PlatformPosture {
    encryption_status: String,
    encryption_volumes: Vec<EncryptionVolumeInfo>,
    firewall_enabled: Option<bool>,
    antivirus_enabled: Option<bool>,
    antivirus_up_to_date: Option<bool>,
    audit_logging_enabled: Option<bool>,
    ssh_root_login_disabled: Option<bool>,
    password_auth_disabled: Option<bool>,
    screen_lock_enabled: Option<bool>,
    screen_lock_timeout_secs: Option<u32>,
    auto_update_enabled: Option<bool>,
    guest_account_disabled: Option<bool>,
    remote_registry_disabled: Option<bool>,
    uac_enabled: Option<bool>,
    secure_boot_enabled: Option<bool>,
    // Password policy
    password_min_length: Option<u32>,
    password_max_age_days: Option<u32>,
    password_complexity_enabled: Option<bool>,
    password_min_classes: Option<u32>,
    sip_enabled: Option<bool>,
    gatekeeper_enabled: Option<bool>,
    // Windows richer posture for dedicated checks (Phase 2 parity)
    defender_real_time_protection: Option<bool>,
    defender_signature_age_days: Option<u32>,
    firewall_all_profiles_enabled: Option<bool>,
}

// ── Main collection entry point ───────────────────────────────────────────────

pub async fn collect() -> Result<Inventory> {
    let mut sys = System::new_all();
    sys.refresh_all();

    let hostname = hostname::get()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    let platform = std::env::consts::OS.to_string();
    let arch = std::env::consts::ARCH.to_string();
    let collected_at = chrono::Utc::now().to_rfc3339();

    let hardware = collect_hardware(&sys);
    let os = collect_os(&sys);
    let ip_addresses = collect_ip_addresses();
    let mac_addresses = collect_mac_addresses(&sys);

    // ── Resource usage ────────────────────────────────────────────────────
    let memory_usage_pct = {
        let used  = sys.used_memory();
        let total = sys.total_memory();
        if total > 0 { Some((used as f32 / total as f32) * 100.0) } else { None }
    };
    let cpu_usage_pct = {
        let cpus = sys.cpus();
        if !cpus.is_empty() {
            Some(cpus.iter().map(|c| c.cpu_usage()).sum::<f32>() / cpus.len() as f32)
        } else {
            None
        }
    };

    // ── Azure AD / Entra ID identity ──────────────────────────────────────
    let azure_ad_device_id = std::env::var("GRC_AZURE_DEVICE_ID").ok()
        .or_else(detect_azure_ad_device_id_platform);
    let azure_ad_registered = azure_ad_device_id.as_ref().map(|_| true);
    let azure_ad_compliant  = detect_azure_ad_compliance();

    let open_ports = collect_open_ports().await;

    let posture = collect_platform_posture();

    // ── Phase 3: Security integrations ────────────────────────────────────
    let (edr_detected, edr_products) = detect_edr(&sys);
    let event_logging_enabled = detect_event_logging();
    let ntp_synced = detect_ntp_sync();
    let (fim_status, fim_violations) = check_fim_baseline();

    Ok(Inventory {
        hostname,
        platform,
        arch,
        collected_at,
        hardware,
        os,
        users: collect_users(),
        services: collect_services(&sys),
        open_ports,
        software_inventory: collect_software_inventory(),
        patch_status: collect_patch_status(),
        edr_detected: Some(edr_detected),
        edr_products,
        event_logging_enabled,
        ntp_synced,
        fim_status: Some(fim_status),
        fim_violations,
        encryption_status: posture.encryption_status,
        encryption_volumes: posture.encryption_volumes,
        firewall_enabled: posture.firewall_enabled,
        antivirus_enabled: posture.antivirus_enabled,
        antivirus_up_to_date: posture.antivirus_up_to_date,
        audit_logging_enabled: posture.audit_logging_enabled,
        ssh_root_login_disabled: posture.ssh_root_login_disabled,
        password_auth_disabled: posture.password_auth_disabled,
        screen_lock_enabled: posture.screen_lock_enabled,
        screen_lock_timeout_secs: posture.screen_lock_timeout_secs,
        auto_update_enabled: posture.auto_update_enabled,
        guest_account_disabled: posture.guest_account_disabled,
        remote_registry_disabled: posture.remote_registry_disabled,
        uac_enabled: posture.uac_enabled,
        secure_boot_enabled: posture.secure_boot_enabled,
        password_min_length: posture.password_min_length,
        password_max_age_days: posture.password_max_age_days,
        password_complexity_enabled: posture.password_complexity_enabled,
        password_min_classes: posture.password_min_classes,
        sip_enabled: posture.sip_enabled,
        gatekeeper_enabled: posture.gatekeeper_enabled,
        defender_real_time_protection: posture.defender_real_time_protection,
        defender_signature_age_days: posture.defender_signature_age_days,
        firewall_all_profiles_enabled: posture.firewall_all_profiles_enabled,
        tls_version: detect_tls_version(),
        ip_addresses,
        mac_addresses,
        memory_usage_pct,
        cpu_usage_pct,
        azure_ad_device_id,
        azure_ad_registered,
        azure_ad_compliant,
    })
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

fn collect_hardware(sys: &System) -> HardwareInfo {
    let cpu = sys.cpus().first().map(|c| c.brand().to_string()).unwrap_or_default();
    let ram_gb = sys.total_memory() as f64 / (1024.0 * 1024.0 * 1024.0);

    let disks = Disks::new_with_refreshed_list();
    let disk_gb = disks.iter().map(|d| d.total_space()).sum::<u64>() as f64
        / (1024.0 * 1024.0 * 1024.0);

    HardwareInfo {
        cpu,
        ram_gb: (ram_gb * 10.0).round() / 10.0,
        disk_gb: (disk_gb * 10.0).round() / 10.0,
        serial_number: collect_serial_number(),
    }
}

fn collect_serial_number() -> Option<String> {
    collect_serial_number_platform()
}

#[cfg(target_os = "linux")]
fn collect_serial_number_platform() -> Option<String> {
    use std::process::Command;
    // Try DMI first (works on most x86_64 systems)
    if let Ok(out) = Command::new("cat").arg("/sys/class/dmi/id/product_serial").output() {
        let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !s.is_empty() && s != "To be filled by O.E.M." && s != "Not Specified" {
            return Some(s);
        }
    }
    if let Ok(out) = Command::new("dmidecode").args(["-s", "system-serial-number"]).output() {
        let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !s.is_empty() && s != "To be filled by O.E.M." && s != "Not Specified" {
            return Some(s);
        }
    }
    None
}

#[cfg(target_os = "macos")]
fn collect_serial_number_platform() -> Option<String> {
    use std::process::Command;
    // ioreg is the most reliable on macOS
    if let Ok(out) = Command::new("sh")
        .args(["-c", "ioreg -l | grep IOPlatformSerialNumber"])
        .output()
    {
        let s = String::from_utf8_lossy(&out.stdout);
        for line in s.lines() {
            if let Some(pos) = line.find("IOPlatformSerialNumber") {
                let rest = &line[pos..];
                if let Some(q1) = rest.find('"') {
                    let after = &rest[q1 + 1..];
                    if let Some(q2) = after.find('"') {
                        let serial = &after[..q2];
                        if !serial.is_empty() && serial != "System Serial#" {
                            return Some(serial.to_string());
                        }
                    }
                }
            }
        }
    }
    // Fallback: system_profiler
    if let Ok(out) = Command::new("system_profiler").args(["SPHardwareDataType"]).output() {
        let s = String::from_utf8_lossy(&out.stdout);
        for line in s.lines() {
            if line.contains("Serial Number") {
                if let Some(val) = line.splitn(2, ':').nth(1) {
                    let serial = val.trim().to_string();
                    if !serial.is_empty() && serial != "System Serial#" {
                        return Some(serial);
                    }
                }
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn collect_serial_number_platform() -> Option<String> {
    use std::process::Command;
    if let Ok(out) = Command::new("wmic")
        .args(["bios", "get", "serialnumber", "/value"])
        .output()
    {
        let s = String::from_utf8_lossy(&out.stdout);
        for line in s.lines() {
            if let Some(pos) = line.find('=') {
                let serial = line[pos + 1..].trim().to_string();
                if !serial.is_empty() && serial != "To be filled by O.E.M." {
                    return Some(serial);
                }
            }
        }
    }
    // Fallback: PowerShell
    if let Ok(out) = Command::new("powershell")
        .args(["-Command", "(Get-WmiObject Win32_BIOS).SerialNumber"])
        .output()
    {
        let serial = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !serial.is_empty() && serial != "To be filled by O.E.M." {
            return Some(serial);
        }
    }
    None
}

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
fn collect_serial_number_platform() -> Option<String> { None }

fn collect_mac_addresses(_sys: &System) -> Vec<String> {
    let mut macs = vec![];
    let networks = Networks::new_with_refreshed_list();
    for (name, network) in &networks {
        // Skip loopback and virtual interfaces
        if name.starts_with("lo") || name.starts_with("docker")
            || name.starts_with("veth") || name.starts_with("br-")
            || name.starts_with("vmnet") || name == "en0" && name.starts_with("utun")
        {
            continue;
        }
        let mac = network.mac_address().to_string();
        if !mac.is_empty() && mac != "00:00:00:00:00:00" && !macs.contains(&mac) {
            macs.push(mac);
        }
    }
    macs
}

fn collect_os(sys: &System) -> OsInfo {
    let name = System::name().unwrap_or_else(|| std::env::consts::OS.into());
    let version = System::os_version().unwrap_or_default();
    let eol_date = lookup_eol_date(&name, &version);
    OsInfo {
        name,
        version,
        patch_level: System::kernel_version(),
        eol_date,
    }
}

/// Static EOL lookup for common operating systems.
/// Returns ISO-8601 date string (YYYY-MM-DD) if EOL is known.
fn lookup_eol_date(os_name: &str, version: &str) -> Option<String> {
    let os_lower = os_name.to_lowercase();
    let ver_lower = version.to_lowercase();

    // Windows
    if os_lower.contains("windows") {
        if ver_lower.starts_with("7") { return Some("2020-01-14".into()); }
        if ver_lower.starts_with("8") { return Some("2023-01-10".into()); }
        if ver_lower.starts_with("10") {
            // Windows 10 EOL depends on specific version; main EOL is Oct 2025
            return Some("2025-10-14".into());
        }
        if ver_lower.starts_with("11") { return Some("2027-10-10".into()); }
    }

    // macOS
    if os_lower.contains("macos") || os_lower.contains("darwin") || os_lower.contains("os x") {
        if ver_lower.starts_with("10.15") { return Some("2022-09-12".into()); }
        if ver_lower.starts_with("11") { return Some("2023-09-26".into()); }
        if ver_lower.starts_with("12") { return Some("2024-10-25".into()); }
        if ver_lower.starts_with("13") { return Some("2025-10-01".into()); }
        if ver_lower.starts_with("14") { return Some("2026-10-01".into()); }
        if ver_lower.starts_with("15") { return Some("2027-10-01".into()); }
    }

    // Ubuntu
    if os_lower.contains("ubuntu") {
        if ver_lower.starts_with("18.04") { return Some("2023-05-31".into()); }
        if ver_lower.starts_with("20.04") { return Some("2025-04-02".into()); }
        if ver_lower.starts_with("22.04") { return Some("2027-04-01".into()); }
        if ver_lower.starts_with("24.04") { return Some("2029-04-01".into()); }
    }

    // Debian
    if os_lower.contains("debian") {
        if ver_lower.starts_with("10") { return Some("2024-06-30".into()); }
        if ver_lower.starts_with("11") { return Some("2026-08-14".into()); }
        if ver_lower.starts_with("12") { return Some("2028-06-10".into()); }
    }

    // RHEL / CentOS / Rocky / Alma
    if os_lower.contains("rhel") || os_lower.contains("centos") || os_lower.contains("rocky") || os_lower.contains("alma") {
        if ver_lower.starts_with("7") { return Some("2024-06-30".into()); }
        if ver_lower.starts_with("8") { return Some("2029-05-31".into()); }
        if ver_lower.starts_with("9") { return Some("2032-05-31".into()); }
    }

    None
}

fn collect_ip_addresses() -> Vec<String> {
    let mut ips = vec![];

    // Primary: enumerate all network interfaces using getifaddrs (Unix)
    // or GetAdaptersAddresses (Windows). This works in air-gapped networks
    // where UDP probes to public DNS would fail.
    match local_ip_address::list_afinet_netifas() {
        Ok(interfaces) => {
            for (_name, ip) in interfaces {
                if is_loopback_or_link_local(&ip) {
                    continue;
                }
                let ip_str = ip.to_string();
                if !ips.contains(&ip_str) {
                    ips.push(ip_str);
                }
            }
        }
        Err(_e) => {
            tracing::debug!("Interface enumeration failed, falling back to UDP probe");
        }
    }

    // Fallback: use UDP probe for default gateway detection only when
    // interface enumeration yields no addresses.
    if ips.is_empty() {
        if let Some(ip) = probe_default_ip_via_udp() {
            ips.push(ip);
        }
    }

    ips
}

/// Return true if the IP is loopback or link-local (APIPA / IPv6 LLA).
fn is_loopback_or_link_local(ip: &std::net::IpAddr) -> bool {
    match ip {
        std::net::IpAddr::V4(ipv4) => ipv4.is_loopback() || ipv4.is_link_local(),
        std::net::IpAddr::V6(ipv6) => {
            ipv6.is_loopback() || (ipv6.segments()[0] & 0xffc0) == 0xfe80
        }
    }
}

/// Fallback: use UDP probes to well-known public DNS to discover the
/// local IP of the default outbound interface. This will fail in
/// air-gapped networks but can provide a useful default when interface
/// enumeration is unavailable.
fn probe_default_ip_via_udp() -> Option<String> {
    for target in &["8.8.8.8:80", "1.1.1.1:80"] {
        if let Ok(sock) = std::net::UdpSocket::bind("0.0.0.0:0") {
            if sock.connect(target).is_ok() {
                if let Ok(addr) = sock.local_addr() {
                    let ip = addr.ip();
                    if !ip.is_loopback() {
                        return Some(ip.to_string());
                    }
                }
            }
        }
    }
    if let Ok(sock) = std::net::UdpSocket::bind("[::]:0") {
        if sock.connect("[2001:4860:4860::8888]:80").is_ok() {
            if let Ok(addr) = sock.local_addr() {
                let ip = addr.ip();
                if !ip.is_loopback() {
                    return Some(ip.to_string());
                }
            }
        }
    }
    None
}

// ── TLS version detection ──────────────────────────────────────────────────────

use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::LazyLock;

/// Cache for TLS version lookups: "host:port" → detected version.
static TLS_VERSION_CACHE: LazyLock<Mutex<HashMap<String, Option<String>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Dummy certificate verifier that accepts any certificate.
/// Used because we only need the negotiated TLS version, not security validation.
struct NoCertificateVerification;

impl rustls::client::ServerCertVerifier for NoCertificateVerification {
    fn verify_server_cert(
        &self,
        _end_entity: &rustls::Certificate,
        _intermediates: &[rustls::Certificate],
        _server_name: &rustls::ServerName,
        _scts: &mut dyn Iterator<Item = &[u8]>,
        _ocsp_response: &[u8],
        _now: std::time::SystemTime,
    ) -> Result<rustls::client::ServerCertVerified, rustls::Error> {
        Ok(rustls::client::ServerCertVerified::assertion())
    }
}

/// Detect the actual TLS version supported by the system by attempting
/// an HTTPS connection to a well-known endpoint and extracting the
/// negotiated version from the TLS handshake.
fn detect_tls_version() -> Option<String> {
    let targets = &[
        ("1.1.1.1", 443),
        ("8.8.8.8", 443),
    ];

    for &(host, port) in targets {
        if let Some(v) = detect_tls_version_for_host(host, port) {
            return Some(v);
        }
    }

    None
}

/// Perform a real TLS handshake against `host:port` and return the
/// negotiated protocol version (e.g. "TLS 1.3").  Results are cached
/// per host so repeated calls avoid extra handshakes.
///
/// Non-TLS ports or unreachable hosts gracefully return `None`.
pub(crate) fn detect_tls_version_for_host(host: &str, port: u16) -> Option<String> {
    let cache_key = format!("{}:{}", host, port);

    // 1. Check cache
    {
        let cache = TLS_VERSION_CACHE.lock().ok()?;
        if let Some(cached) = cache.get(&cache_key) {
            return cached.clone();
        }
    }

    // 2. Perform handshake
    let result = try_detect_tls_version_for_host(host, port);

    // 3. Store in cache
    if let Ok(mut cache) = TLS_VERSION_CACHE.lock() {
        cache.insert(cache_key, result.clone());
    }

    result
}

fn try_detect_tls_version_for_host(host: &str, port: u16) -> Option<String> {
    use std::io::Write;
    use std::net::TcpStream;
    use std::sync::Arc;
    use std::time::Duration;

    use rustls::{ClientConfig, ClientConnection, ProtocolVersion, ServerName, StreamOwned};

    let config = ClientConfig::builder()
        .with_safe_defaults()
        .with_custom_certificate_verifier(Arc::new(NoCertificateVerification))
        .with_no_client_auth();

    let server_name = if let Ok(ip) = host.parse::<std::net::IpAddr>() {
        ServerName::IpAddress(ip)
    } else {
        ServerName::try_from(host).ok()?
    };

    let conn = ClientConnection::new(Arc::new(config), server_name).ok()?;
    let stream = TcpStream::connect((host, port)).ok()?;
    stream.set_read_timeout(Some(Duration::from_secs(5))).ok()?;
    stream.set_write_timeout(Some(Duration::from_secs(5))).ok()?;

    let mut tls_stream = StreamOwned::new(conn, stream);

    // Trigger TLS handshake (an empty write queues the ClientHello).
    tls_stream.write_all(b"").ok()?;
    tls_stream.flush().ok()?;

    tls_stream.conn.protocol_version().map(|v| match v {
        ProtocolVersion::TLSv1_3 => "TLS 1.3".into(),
        ProtocolVersion::TLSv1_2 => "TLS 1.2".into(),
        ProtocolVersion::TLSv1_1 => "TLS 1.1".into(),
        ProtocolVersion::TLSv1_0 => "TLS 1.0".into(),
        other => format!("{:?}", other),
    })
}

fn collect_users() -> Vec<UserInfo> {
    collect_users_platform()
}

fn collect_services(sys: &System) -> Vec<ServiceInfo> {
    collect_services_platform(sys)
}

#[cfg(target_os = "linux")]
fn collect_services_platform(_sys: &System) -> Vec<ServiceInfo> {
    use std::process::Command;
    let mut services = vec![];
    // Try systemd first
    if let Ok(out) = Command::new("systemctl")
        .args(["list-units", "--type=service", "--state=running", "--no-pager", "--no-legend"])
        .output()
    {
        let s = String::from_utf8_lossy(&out.stdout);
        for line in s.lines().take(50) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 4 {
                let name = parts[0].trim_end_matches(".service").to_string();
                let status = parts[3].to_lowercase();
                services.push(ServiceInfo {
                    name,
                    status,
                    start_type: "static".into(),
                });
            }
        }
        if !services.is_empty() {
            return services;
        }
    }
    // Fallback: /etc/init.d/ for SysV init systems
    if let Ok(entries) = std::fs::read_dir("/etc/init.d") {
        for entry in entries.filter_map(|e| e.ok()).take(30) {
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() {
                    if let Some(name) = entry.file_name().to_str() {
                        services.push(ServiceInfo {
                            name: name.to_string(),
                            status: "unknown".into(),
                            start_type: "unknown".into(),
                        });
                    }
                }
            }
        }
    }
    services
}

#[cfg(target_os = "macos")]
fn collect_services_platform(_sys: &System) -> Vec<ServiceInfo> {
    use std::process::Command;
    let mut services = vec![];
    // launchctl list gives daemon/agent services on macOS
    if let Ok(out) = Command::new("launchctl").args(["list"]).output() {
        let s = String::from_utf8_lossy(&out.stdout);
        for line in s.lines().skip(1).take(50) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 3 {
                let pid = parts[0];
                let status = if pid != "-" { "running" } else { "stopped" };
                let name = parts[2].to_string();
                services.push(ServiceInfo {
                    name,
                    status: status.into(),
                    start_type: "automatic".into(),
                });
            }
        }
    }
    services
}

#[cfg(target_os = "windows")]
fn collect_services_platform(_sys: &System) -> Vec<ServiceInfo> {
    use std::process::Command;
    let mut services = vec![];
    // Use sc query for broad compatibility
    if let Ok(out) = Command::new("sc").args(["query", "type=", "service", "state=all"]).output() {
        let s = String::from_utf8_lossy(&out.stdout);
        let mut current_name = None;
        let mut current_state = None;
        for line in s.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("SERVICE_NAME:") {
                if let (Some(name), Some(state)) = (current_name.take(), current_state.take()) {
                    services.push(ServiceInfo {
                        name,
                        status: state,
                        start_type: "automatic".into(),
                    });
                }
                current_name = trimmed.splitn(2, ':').nth(1).map(|s| s.trim().to_string());
            }
            if trimmed.starts_with("STATE") {
                if let Some(val) = trimmed.splitn(2, ':').nth(1) {
                    let state_num = val.trim().split_whitespace().next().unwrap_or("");
                    current_state = Some(match state_num {
                        "1" => "stopped".into(),
                        "2" => "start_pending".into(),
                        "3" => "stop_pending".into(),
                        "4" => "running".into(),
                        "5" => "continue_pending".into(),
                        "6" => "pause_pending".into(),
                        "7" => "paused".into(),
                        _ => "unknown".into(),
                    });
                }
            }
        }
        if let (Some(name), Some(state)) = (current_name, current_state) {
            services.push(ServiceInfo { name, status: state, start_type: "automatic".into() });
        }
    }
    services.into_iter().take(50).collect()
}

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
fn collect_services_platform(_sys: &System) -> Vec<ServiceInfo> { vec![] }

async fn collect_open_ports() -> Vec<u16> {
    collect_open_ports_platform()
}

// ── Azure AD identity helpers ─────────────────────────────────────────────────

fn detect_azure_ad_device_id_platform() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        if let Ok(out) = Command::new("dsregcmd").arg("/status").output() {
            let s = String::from_utf8_lossy(&out.stdout);
            for line in s.lines() {
                if line.trim_start().starts_with("DeviceId") {
                    if let Some(val) = line.splitn(2, ':').nth(1) {
                        let v = val.trim().to_string();
                        if !v.is_empty() { return Some(v); }
                    }
                }
            }
        }
    }
    None
}

fn detect_azure_ad_compliance() -> Option<bool> {
    if let Ok(v) = std::env::var("GRC_AZURE_COMPLIANT") {
        return Some(v.eq_ignore_ascii_case("true") || v == "1");
    }
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        if let Ok(out) = Command::new("dsregcmd").arg("/status").output() {
            let s = String::from_utf8_lossy(&out.stdout).to_lowercase();
            for line in s.lines() {
                if line.trim_start().starts_with("iscompliant") {
                    return Some(line.contains("yes"));
                }
            }
        }
    }
    None
}

// ═══════════════════════════════════════════════════════════════════════════════
// Platform-specific collection — Linux
// ═══════════════════════════════════════════════════════════════════════════════

#[cfg(target_os = "linux")]
fn collect_platform_posture() -> PlatformPosture {
    let (encryption_status, encryption_volumes) = detect_linux_encryption();
    let firewall   = detect_linux_firewall();
    let audit_log  = detect_linux_auditd();
    let auto_upd   = detect_linux_auto_update();
    let (ssh_root, ssh_pwd) = detect_linux_ssh();
    let sec_boot   = detect_linux_secure_boot();
    let (lock_en, lock_timeout) = detect_linux_screen_lock();
    let (pwd_min, pwd_max_age, pwd_complexity, pwd_classes) = detect_linux_password_policy();
    let antivirus  = detect_linux_antivirus();

    PlatformPosture {
        encryption_status,
        encryption_volumes,
        firewall_enabled: firewall,
        audit_logging_enabled: audit_log,
        auto_update_enabled: auto_upd,
        ssh_root_login_disabled: ssh_root,
        password_auth_disabled: ssh_pwd,
        secure_boot_enabled: sec_boot,
        screen_lock_enabled: lock_en,
        screen_lock_timeout_secs: lock_timeout,
        password_min_length: pwd_min,
        password_max_age_days: pwd_max_age,
        password_complexity_enabled: pwd_complexity,
        password_min_classes: pwd_classes,
        antivirus_enabled: antivirus,
        ..Default::default()
    }
}

#[cfg(target_os = "linux")]
fn detect_linux_antivirus() -> Option<bool> {
    use std::process::Command;
    let av_services = ["clamav-daemon", "freshclam", "sophosav", "bitdefender-scanner",
                       "esets_daemon", "avast", "comodo-cavd"];
    for svc in &av_services {
        if let Ok(out) = Command::new("systemctl").args(["is-active", svc]).output() {
            if out.status.success() {
                return Some(true);
            }
        }
    }
    // Fallback: check for known AV processes
    if let Ok(out) = Command::new("pgrep").args(["-c", "clamav|sophos|esets|avast|bitdefender"]).output() {
        let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if let Ok(n) = s.parse::<i32>() {
            if n > 0 { return Some(true); }
        }
    }
    Some(false)
}

#[cfg(target_os = "linux")]
fn detect_linux_encryption() -> (String, Vec<EncryptionVolumeInfo>) {
    use std::process::Command;
    let mut volumes = vec![];

    // Check for LUKS via lsblk
    if let Ok(out) = Command::new("lsblk").args(["-o", "NAME,TYPE,MOUNTPOINT", "--json"]).output() {
        let s = String::from_utf8_lossy(&out.stdout);
        if s.contains("crypt") {
            volumes.push(EncryptionVolumeInfo {
                path: "/".into(),
                status: "enabled".into(),
                method: Some("LUKS".into()),
            });
            return ("enabled".into(), volumes);
        }
    }
    // Legacy lsblk fallback
    if let Ok(out) = Command::new("lsblk").args(["-o", "TYPE"]).output() {
        if String::from_utf8_lossy(&out.stdout).contains("crypt") {
            volumes.push(EncryptionVolumeInfo {
                path: "/".into(),
                status: "enabled".into(),
                method: Some("LUKS".into()),
            });
            return ("enabled".into(), volumes);
        }
    }
    // crypttab
    if std::path::Path::new("/etc/crypttab").exists() {
        if let Ok(c) = std::fs::read_to_string("/etc/crypttab") {
            if !c.trim().is_empty() {
                volumes.push(EncryptionVolumeInfo {
                    path: "/".into(),
                    status: "enabled".into(),
                    method: Some("LUKS".into()),
                });
                return ("enabled".into(), volumes);
            }
        }
    }
    volumes.push(EncryptionVolumeInfo { path: "/".into(), status: "unknown".into(), method: None });
    ("unknown".into(), volumes)
}

#[cfg(target_os = "linux")]
fn detect_linux_firewall() -> Option<bool> {
    use std::process::Command;
    // ufw status
    if let Ok(out) = Command::new("ufw").arg("status").output() {
        let s = String::from_utf8_lossy(&out.stdout);
        if s.contains("active") { return Some(true); }
        if s.contains("inactive") { return Some(false); }
    }
    // firewalld
    if let Ok(out) = Command::new("firewall-cmd").arg("--state").output() {
        if out.status.success() { return Some(true); }
    }
    // iptables — any non-empty ruleset
    if let Ok(out) = Command::new("iptables").args(["-L", "-n"]).output() {
        let s = String::from_utf8_lossy(&out.stdout);
        let non_trivial = s.lines()
            .filter(|l| !l.starts_with("Chain") && !l.starts_with("target") && !l.is_empty())
            .count();
        if non_trivial > 0 { return Some(true); }
    }
    None
}

#[cfg(target_os = "linux")]
fn detect_linux_auditd() -> Option<bool> {
    use std::process::Command;
    if let Ok(out) = Command::new("systemctl").args(["is-active", "auditd"]).output() {
        return Some(out.status.success());
    }
    None
}

#[cfg(target_os = "linux")]
fn detect_linux_auto_update() -> Option<bool> {
    use std::process::Command;
    if let Ok(out) = Command::new("systemctl").args(["is-active", "unattended-upgrades"]).output() {
        if out.status.success() { return Some(true); }
    }
    if std::path::Path::new("/etc/cron.daily/apt-compat").exists()
        || std::path::Path::new("/etc/cron.daily/yum-daily.cron").exists()
    {
        return Some(true);
    }
    Some(false)
}

#[cfg(target_os = "linux")]
fn detect_linux_ssh() -> (Option<bool>, Option<bool>) {
    let content = std::fs::read_to_string("/etc/ssh/sshd_config").unwrap_or_default();
    let root_login_disabled = Some(
        content.lines().any(|l| l.trim_start().starts_with("PermitRootLogin")
            && l.to_lowercase().contains("no")),
    );
    let password_auth_disabled = Some(
        content.lines().any(|l| l.trim_start().starts_with("PasswordAuthentication")
            && l.to_lowercase().contains("no")),
    );
    (root_login_disabled, password_auth_disabled)
}

#[cfg(target_os = "linux")]
fn detect_linux_secure_boot() -> Option<bool> {
    if let Ok(content) = std::fs::read_to_string(
        "/sys/firmware/efi/efivars/SecureBoot-8be4df61-93ca-11d2-aa0d-00e098032b8c"
    ) {
        return Some(!content.is_empty());
    }
    if let Ok(out) = std::process::Command::new("mokutil").arg("--sb-state").output() {
        let s = String::from_utf8_lossy(&out.stdout);
        return Some(s.to_lowercase().contains("enabled"));
    }
    None
}

/// Returns (screen_lock_enabled, screen_lock_timeout_secs).
/// Checks GNOME, KDE, and the xscreensaver timeout.
#[cfg(target_os = "linux")]
fn detect_linux_screen_lock() -> (Option<bool>, Option<u32>) {
    use std::process::Command;

    // GNOME: gsettings get org.gnome.desktop.screensaver lock-enabled
    if let Ok(out) = Command::new("gsettings")
        .args(["get", "org.gnome.desktop.screensaver", "lock-enabled"])
        .output()
    {
        let s = String::from_utf8_lossy(&out.stdout).trim().to_lowercase();
        if !s.is_empty() {
            let enabled = s == "true";
            // GNOME: idle-activation-enabled + lock-delay
            let timeout = Command::new("gsettings")
                .args(["get", "org.gnome.desktop.session", "idle-delay"])
                .output()
                .ok()
                .and_then(|o| {
                    let raw = String::from_utf8_lossy(&o.stdout).trim().to_string();
                    // Output is like "uint32 600"
                    raw.split_whitespace().last()
                        .and_then(|n| n.parse::<u32>().ok())
                });
            return (Some(enabled), timeout);
        }
    }

    // KDE: kscreenlocker
    if std::path::Path::new("/usr/bin/kscreenlocker").exists()
        || std::path::Path::new("/usr/bin/kscreenlocker_greet").exists()
    {
        return (Some(true), Some(300));
    }

    // xscreensaver timeout
    if let Ok(content) = std::fs::read_to_string(
        &format!("{}/.xscreensaver", std::env::var("HOME").unwrap_or_default())
    ) {
        for line in content.lines() {
            if line.trim_start().starts_with("timeout:") {
                // format: "0:10:00"
                if let Some(val) = line.split(':').nth(1) {
                    if let Ok(mins) = val.trim().parse::<u32>() {
                        return (Some(true), Some(mins * 60));
                    }
                }
            }
        }
    }

    (None, None)
}

/// Read password policy from /etc/security/pwquality.conf and /etc/login.defs.
/// Returns (min_length, max_age_days, complexity_enabled, min_classes).
#[cfg(target_os = "linux")]
fn detect_linux_password_policy() -> (Option<u32>, Option<u32>, Option<bool>, Option<u32>) {
    let mut min_length: Option<u32> = None;
    let mut min_classes: Option<u32> = None;
    let mut complexity = false;

    // pwquality.conf (used by PAM pam_pwquality)
    if let Ok(content) = std::fs::read_to_string("/etc/security/pwquality.conf") {
        for line in content.lines() {
            let line = line.trim();
            if line.starts_with('#') || line.is_empty() { continue; }
            if let Some(rest) = line.strip_prefix("minlen") {
                if let Some(val) = rest.split('=').nth(1) {
                    min_length = val.trim().parse().ok();
                }
            }
            if let Some(rest) = line.strip_prefix("minclass") {
                if let Some(val) = rest.split('=').nth(1) {
                    if let Ok(n) = val.trim().parse::<u32>() {
                        min_classes = Some(n);
                        complexity = n >= 3;
                    }
                }
            }
            // lcredit/ucredit/dcredit/ocredit < 0 means that class is required
            for prefix in &["lcredit", "ucredit", "dcredit", "ocredit"] {
                if line.starts_with(prefix) {
                    if let Some(val) = line.split('=').nth(1) {
                        if let Ok(n) = val.trim().parse::<i32>() {
                            if n < 0 { complexity = true; }
                        }
                    }
                }
            }
        }
    }

    // /etc/login.defs (PASS_MAX_DAYS, PASS_MIN_LEN fallback)
    let mut max_age: Option<u32> = None;
    if let Ok(content) = std::fs::read_to_string("/etc/login.defs") {
        for line in content.lines() {
            let line = line.trim();
            if line.starts_with('#') || line.is_empty() { continue; }
            let parts: Vec<&str> = line.splitn(2, char::is_whitespace).collect();
            if parts.len() < 2 { continue; }
            match parts[0] {
                "PASS_MAX_DAYS" => max_age = parts[1].trim().parse().ok(),
                "PASS_MIN_LEN"  => {
                    if min_length.is_none() {
                        min_length = parts[1].trim().parse().ok();
                    }
                }
                _ => {}
            }
        }
    }

    let complexity_opt = if min_length.is_some() || complexity {
        Some(complexity)
    } else {
        None
    };

    (min_length, max_age, complexity_opt, min_classes)
}

#[cfg(target_os = "linux")]
fn collect_users_platform() -> Vec<UserInfo> {
    use std::process::Command;
    let content = std::fs::read_to_string("/etc/passwd").unwrap_or_default();
    content.lines()
        .filter_map(|line| {
            let parts: Vec<&str> = line.split(':').collect();
            if parts.len() >= 4 {
                let uid: u32 = parts[2].parse().unwrap_or(9999);
                let name = parts[0].to_string();
                if uid == 0 || (uid >= 1000 && !name.starts_with("nobody")) {
                    let pwd_expired = check_linux_password_expired(&name);
                    let is_admin = uid == 0 || is_linux_admin(&name);
                    return Some(UserInfo {
                        name,
                        is_admin,
                        password_expired: pwd_expired,
                    });
                }
            }
            None
        })
        .collect()
}

#[cfg(target_os = "linux")]
fn is_linux_admin(name: &str) -> bool {
    use std::process::Command;
    if let Ok(out) = Command::new("groups").arg(name).output() {
        let s = String::from_utf8_lossy(&out.stdout);
        return s.contains("sudo") || s.contains("wheel") || s.contains("admin");
    }
    false
}

#[cfg(target_os = "linux")]
fn check_linux_password_expired(name: &str) -> bool {
    use std::process::Command;
    if let Ok(out) = Command::new("chage").args(["-l", name]).output() {
        let s = String::from_utf8_lossy(&out.stdout);
        for line in s.lines() {
            let lower = line.to_lowercase();
            if lower.contains("password expires") {
                if let Some(val) = line.split(':').nth(1) {
                    let v = val.trim().to_lowercase();
                    return v != "never" && v != "password must be changed";
                }
            }
        }
    }
    false
}

#[cfg(target_os = "linux")]
fn collect_open_ports_platform() -> Vec<u16> {
    let content = std::fs::read_to_string("/proc/net/tcp").unwrap_or_default();
    let mut ports = vec![];
    for line in content.lines().skip(1) {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 4 && parts[3] == "0A" {
            if let Some(local) = parts.get(1) {
                if let Some(port_hex) = local.split(':').nth(1) {
                    if let Ok(port) = u16::from_str_radix(port_hex, 16) {
                        ports.push(port);
                    }
                }
            }
        }
    }
    ports.sort();
    ports.dedup();
    ports
}

// ═══════════════════════════════════════════════════════════════════════════════
// Platform-specific collection — macOS
// ═══════════════════════════════════════════════════════════════════════════════

#[cfg(target_os = "macos")]
fn collect_platform_posture() -> PlatformPosture {
    let (encryption_status, encryption_volumes) = detect_macos_encryption();
    let firewall     = detect_macos_firewall();
    let auto_upd     = detect_macos_auto_update();
    let guest_dis    = detect_macos_guest_account();
    let sec_boot     = detect_macos_secure_boot();
    let (lock_en, lock_timeout) = detect_macos_screen_lock();
    let (pwd_min, pwd_max_age, pwd_complexity, pwd_classes) = detect_macos_password_policy();
    let sip          = detect_macos_sip();
    let gatekeeper   = detect_macos_gatekeeper();
    let antivirus    = detect_macos_antivirus();

    PlatformPosture {
        encryption_status,
        encryption_volumes,
        firewall_enabled: firewall,
        auto_update_enabled: auto_upd,
        guest_account_disabled: guest_dis,
        secure_boot_enabled: sec_boot,
        screen_lock_enabled: lock_en,
        screen_lock_timeout_secs: lock_timeout,
        password_min_length: pwd_min,
        password_max_age_days: pwd_max_age,
        password_complexity_enabled: pwd_complexity,
        password_min_classes: pwd_classes,
        sip_enabled: sip,
        gatekeeper_enabled: gatekeeper,
        antivirus_enabled: antivirus,
        ..Default::default()
    }
}

#[cfg(target_os = "macos")]
fn detect_macos_antivirus() -> Option<bool> {
    use std::process::Command;
    // Check XProtect (built-in malware detection)
    if let Ok(out) = Command::new("system_profiler").args(["SPInstallHistoryDataType"]).output() {
        let s = String::from_utf8_lossy(&out.stdout).to_lowercase();
        if s.contains("xprotect") || s.contains("mrt") || s.contains("gatekeeper") {
            return Some(true);
        }
    }
    // Check for common third-party AV processes
    let av_processes = ["sophos", "eset", "kaspersky", "norton", "mcafee", "bitdefender",
                        "avast", "avg", "clamxav", "malwarebytes"];
    if let Ok(out) = Command::new("ps").args(["-axc"]).output() {
        let s = String::from_utf8_lossy(&out.stdout).to_lowercase();
        for av in &av_processes {
            if s.contains(av) { return Some(true); }
        }
    }
    Some(false)
}

#[cfg(target_os = "macos")]
fn detect_macos_encryption() -> (String, Vec<EncryptionVolumeInfo>) {
    use std::process::Command;
    let mut volumes = vec![];
    if let Ok(out) = Command::new("fdesetup").arg("status").output() {
        let s = String::from_utf8_lossy(&out.stdout).to_lowercase();
        if s.contains("on") {
            volumes.push(EncryptionVolumeInfo {
                path: "/".into(),
                status: "enabled".into(),
                method: Some("FileVault 2".into()),
            });
            return ("enabled".into(), volumes);
        }
        if s.contains("off") {
            volumes.push(EncryptionVolumeInfo {
                path: "/".into(),
                status: "disabled".into(),
                method: None,
            });
            return ("disabled".into(), volumes);
        }
    }
    volumes.push(EncryptionVolumeInfo { path: "/".into(), status: "unknown".into(), method: None });
    ("unknown".into(), volumes)
}

#[cfg(target_os = "macos")]
fn detect_macos_firewall() -> Option<bool> {
    use std::process::Command;
    if let Ok(out) = Command::new("defaults")
        .args(["read", "/Library/Preferences/com.apple.alf", "globalstate"])
        .output()
    {
        let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
        return Some(s == "1" || s == "2");
    }
    None
}

/// Returns (screen_lock_enabled, timeout_secs).
/// Reads the screensaver idle time from com.apple.screensaver (currentHost domain).
#[cfg(target_os = "macos")]
fn detect_macos_screen_lock() -> (Option<bool>, Option<u32>) {
    use std::process::Command;

    // askForPassword: 1 = screen lock enabled
    let lock_on = Command::new("defaults")
        .args(["-currentHost", "read", "com.apple.screensaver", "askForPassword"])
        .output()
        .ok()
        .and_then(|o| {
            let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
            s.parse::<u32>().ok().map(|n| n == 1)
        });

    // idleTime in seconds (the screensaver activation delay)
    let timeout = Command::new("defaults")
        .args(["-currentHost", "read", "com.apple.screensaver", "idleTime"])
        .output()
        .ok()
        .and_then(|o| {
            String::from_utf8_lossy(&o.stdout)
                .trim()
                .parse::<u32>()
                .ok()
        });

    (lock_on, timeout)
}

#[cfg(target_os = "macos")]
fn detect_macos_auto_update() -> Option<bool> {
    use std::process::Command;
    if let Ok(out) = Command::new("defaults")
        .args(["read", "/Library/Preferences/com.apple.SoftwareUpdate", "AutomaticCheckEnabled"])
        .output()
    {
        return Some(String::from_utf8_lossy(&out.stdout).trim() == "1");
    }
    None
}

#[cfg(target_os = "macos")]
fn detect_macos_guest_account() -> Option<bool> {
    use std::process::Command;
    if let Ok(out) = Command::new("defaults")
        .args(["read", "/Library/Preferences/com.apple.loginwindow", "GuestEnabled"])
        .output()
    {
        return Some(String::from_utf8_lossy(&out.stdout).trim() == "0");
    }
    None
}

#[cfg(target_os = "macos")]
fn detect_macos_secure_boot() -> Option<bool> { None }

#[cfg(target_os = "macos")]
fn detect_macos_sip() -> Option<bool> {
    use std::process::Command;
    if let Ok(out) = Command::new("csrutil").arg("status").output() {
        let s = String::from_utf8_lossy(&out.stdout).to_lowercase();
        if s.contains("enabled") {
            return Some(true);
        }
        if s.contains("disabled") {
            return Some(false);
        }
    }
    None
}

#[cfg(target_os = "macos")]
fn detect_macos_gatekeeper() -> Option<bool> {
    use std::process::Command;
    if let Ok(out) = Command::new("spctl").arg("--status").output() {
        let s = String::from_utf8_lossy(&out.stdout).to_lowercase();
        if s.contains("assessments enabled") {
            return Some(true);
        }
        if s.contains("assessments disabled") {
            return Some(false);
        }
    }
    None
}

/// macOS password policy via `pwpolicy -getaccountpolicies`.
/// Returns (min_length, max_age_days, complexity_enabled, min_classes).
#[cfg(target_os = "macos")]
fn detect_macos_password_policy() -> (Option<u32>, Option<u32>, Option<bool>, Option<u32>) {
    use std::process::Command;
    if let Ok(out) = Command::new("pwpolicy")
        .args(["-getaccountpolicies"])
        .output()
    {
        let s = String::from_utf8_lossy(&out.stdout);
        let min_length = extract_xml_int(&s, "minChars");
        let max_age = extract_xml_int(&s, "maxMinutesUntilChangePassword")
            .map(|mins| mins / (60 * 24)); // minutes → days
        let complexity = s.contains("requiresAlpha") || s.contains("requiresMixedCase");
        let min_classes: Option<u32> = if complexity { Some(2) } else { None };
        return (min_length, max_age, Some(complexity), min_classes);
    }
    (None, None, None, None)
}

#[cfg(target_os = "macos")]
fn extract_xml_int(xml: &str, key: &str) -> Option<u32> {
    // Looks for patterns like: <key>minChars</key><integer>12</integer>
    let key_tag = format!("<key>{key}</key>");
    let pos = xml.find(&key_tag)?;
    let rest = &xml[pos + key_tag.len()..];
    let start = rest.find("<integer>")? + "<integer>".len();
    let end = rest[start..].find("</integer>")?;
    rest[start..start + end].trim().parse().ok()
}

#[cfg(target_os = "macos")]
fn collect_users_platform() -> Vec<UserInfo> {
    use std::process::Command;
    use std::collections::HashSet;

    // Build admin set from the admin group
    let mut admins: HashSet<String> = HashSet::new();
    if let Ok(out) = Command::new("dscl")
        .args([".", "read", "/Groups/admin", "GroupMembership"])
        .output()
    {
        let s = String::from_utf8_lossy(&out.stdout);
        for line in s.lines() {
            if line.trim_start().starts_with("GroupMembership") {
                if let Some(val) = line.splitn(2, ':').nth(1) {
                    for name in val.split_whitespace() {
                        admins.insert(name.trim().to_string());
                    }
                }
            }
        }
    }

    if let Ok(out) = Command::new("dscl").args([".", "list", "/Users"]).output() {
        return String::from_utf8_lossy(&out.stdout)
            .lines()
            .filter(|l| !l.starts_with('_'))
            .map(|name| {
                let name_str = name.trim().to_string();
                let pwd_expired = check_macos_password_expired(&name_str);
                UserInfo {
                    is_admin: admins.contains(&name_str),
                    name: name_str,
                    password_expired: pwd_expired,
                }
            })
            .collect();
    }
    vec![]
}

#[cfg(target_os = "macos")]
fn check_macos_password_expired(name: &str) -> bool {
    use std::process::Command;
    if let Ok(out) = Command::new("dscl").args([".", "read", &format!("/Users/{}", name), "accountPolicyData"]).output() {
        let s = String::from_utf8_lossy(&out.stdout);
        // If accountPolicyData exists, check for password policy enforcement
        // A simple heuristic: if the user has policy data, we assume managed
        return s.contains("policy");
    }
    false
}

#[cfg(target_os = "macos")]
fn collect_open_ports_platform() -> Vec<u16> {
    use std::process::Command;
    if let Ok(out) = Command::new("netstat").args(["-an", "-p", "tcp"]).output() {
        let mut ports = vec![];
        for line in String::from_utf8_lossy(&out.stdout).lines() {
            if line.contains("LISTEN") {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if let Some(addr) = parts.get(3) {
                    if let Some(p) = addr.rsplit('.').next() {
                        if let Ok(port) = p.parse::<u16>() {
                            ports.push(port);
                        }
                    }
                }
            }
        }
        ports.sort();
        ports.dedup();
        return ports;
    }
    vec![]
}

// ═══════════════════════════════════════════════════════════════════════════════
// Platform-specific collection — Windows
// ═══════════════════════════════════════════════════════════════════════════════

#[cfg(target_os = "windows")]
fn collect_platform_posture() -> PlatformPosture {
    let (encryption_status, encryption_volumes) = detect_windows_encryption();
    let firewall     = detect_windows_firewall();
    let antivirus    = detect_windows_antivirus();
    let screen_lock  = detect_windows_screen_lock();
    let lock_timeout = detect_windows_screen_lock_timeout();
    let auto_upd     = detect_windows_auto_update();
    let guest_dis    = detect_windows_guest_account();
    let remote_reg   = detect_windows_remote_registry();
    let uac          = detect_windows_uac();
    let sec_boot     = detect_windows_secure_boot();
    let (pwd_min, pwd_max_age, pwd_complexity, pwd_classes) = detect_windows_password_policy();
    let defender_rtp  = detect_windows_defender_rtp();
    let defender_sig  = detect_windows_defender_signature_age_days();
    let fw_all        = detect_windows_firewall_all_profiles();

    PlatformPosture {
        encryption_status,
        encryption_volumes,
        firewall_enabled: firewall,
        antivirus_enabled: antivirus,
        screen_lock_enabled: screen_lock,
        screen_lock_timeout_secs: lock_timeout,
        auto_update_enabled: auto_upd,
        guest_account_disabled: guest_dis,
        remote_registry_disabled: remote_reg,
        uac_enabled: uac,
        secure_boot_enabled: sec_boot,
        password_min_length: pwd_min,
        password_max_age_days: pwd_max_age,
        password_complexity_enabled: pwd_complexity,
        password_min_classes: pwd_classes,
        defender_real_time_protection: defender_rtp,
        defender_signature_age_days: defender_sig,
        firewall_all_profiles_enabled: fw_all,
        ..Default::default()
    }
}

#[cfg(target_os = "windows")]
fn detect_windows_encryption() -> (String, Vec<EncryptionVolumeInfo>) {
    use std::process::Command;
    let mut volumes = vec![];
    if let Ok(out) = Command::new("manage-bde").args(["-status"]).output() {
        let s = String::from_utf8_lossy(&out.stdout);
        // Parse per-volume status
        let mut current_vol = "C:".to_string();
        let mut enc_on = false;
        for line in s.lines() {
            let l = line.trim().to_lowercase();
            if l.starts_with("volume") && l.contains(':') {
                if let Some(v) = line.split_whitespace().find(|p| p.contains(':')) {
                    current_vol = v.to_uppercase();
                }
            }
            if l.contains("protection on")  { enc_on = true; }
            if l.contains("percentage encrypted") && enc_on {
                volumes.push(EncryptionVolumeInfo {
                    path: current_vol.clone(),
                    status: "enabled".into(),
                    method: Some("BitLocker".into()),
                });
            }
        }
        if !volumes.is_empty() {
            return ("enabled".into(), volumes);
        }
        if s.to_lowercase().contains("protection off") {
            volumes.push(EncryptionVolumeInfo { path: "C:".into(), status: "disabled".into(), method: None });
            return ("disabled".into(), volumes);
        }
    }
    volumes.push(EncryptionVolumeInfo { path: "C:".into(), status: "unknown".into(), method: None });
    ("unknown".into(), volumes)
}

#[cfg(target_os = "windows")]
fn detect_windows_firewall() -> Option<bool> {
    use std::process::Command;
    if let Ok(out) = Command::new("netsh")
        .args(["advfirewall", "show", "allprofiles", "state"])
        .output()
    {
        let s = String::from_utf8_lossy(&out.stdout);
        return Some(s.to_lowercase().contains("on"));
    }
    None
}

#[cfg(target_os = "windows")]
fn detect_windows_antivirus() -> Option<bool> {
    use std::process::Command;
    if let Ok(out) = Command::new("powershell")
        .args(["-Command", "Get-MpComputerStatus | Select-Object -ExpandProperty AntivirusEnabled"])
        .output()
    {
        let s = String::from_utf8_lossy(&out.stdout).trim().to_lowercase();
        return Some(s == "true");
    }
    None
}

#[cfg(target_os = "windows")]
fn detect_windows_screen_lock() -> Option<bool> {
    // Check registry ScreenSaveActive
    use std::process::Command;
    if let Ok(out) = Command::new("reg")
        .args(["query", r"HKCU\Control Panel\Desktop", "/v", "ScreenSaveActive"])
        .output()
    {
        let s = String::from_utf8_lossy(&out.stdout);
        return Some(s.contains("0x1") || s.contains("    1"));
    }
    None
}

#[cfg(target_os = "windows")]
fn detect_windows_screen_lock_timeout() -> Option<u32> {
    use std::process::Command;
    if let Ok(out) = Command::new("reg")
        .args(["query", r"HKCU\Control Panel\Desktop", "/v", "ScreenSaveTimeOut"])
        .output()
    {
        let s = String::from_utf8_lossy(&out.stdout);
        for line in s.lines() {
            if line.contains("ScreenSaveTimeOut") {
                // "    ScreenSaveTimeOut    REG_SZ    900"
                if let Some(val) = line.split_whitespace().last() {
                    return val.parse().ok();
                }
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn detect_windows_auto_update() -> Option<bool> {
    use std::process::Command;
    if let Ok(out) = Command::new("powershell")
        .args(["-Command",
            "(New-Object -ComObject Microsoft.Update.AutoUpdate).Settings.NotificationLevel"])
        .output()
    {
        let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
        return Some(s != "1");
    }
    None
}

#[cfg(target_os = "windows")]
fn detect_windows_guest_account() -> Option<bool> {
    use std::process::Command;
    if let Ok(out) = Command::new("net").args(["user", "guest"]).output() {
        let s = String::from_utf8_lossy(&out.stdout).to_lowercase();
        return Some(s.contains("account active") && s.contains("no"));
    }
    None
}

#[cfg(target_os = "windows")]
fn detect_windows_remote_registry() -> Option<bool> {
    use std::process::Command;
    if let Ok(out) = Command::new("sc").args(["query", "RemoteRegistry"]).output() {
        let s = String::from_utf8_lossy(&out.stdout).to_lowercase();
        return Some(s.contains("stopped"));
    }
    None
}

#[cfg(target_os = "windows")]
fn detect_windows_uac() -> Option<bool> {
    use std::process::Command;
    // EnableLUA = 1 means UAC is enabled
    if let Ok(out) = Command::new("reg")
        .args([
            "query",
            r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System",
            "/v",
            "EnableLUA",
        ])
        .output()
    {
        let s = String::from_utf8_lossy(&out.stdout).to_lowercase();
        if s.contains("enablelua") {
            // Look for 0x1 (enabled) or 0x0 (disabled)
            return Some(s.contains("0x1") || s.contains(" 1 "));
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn detect_windows_secure_boot() -> Option<bool> {
    use std::process::Command;
    if let Ok(out) = Command::new("powershell")
        .args(["-Command", "Confirm-SecureBootUEFI"])
        .output()
    {
        let s = String::from_utf8_lossy(&out.stdout).trim().to_lowercase();
        return Some(s == "true");
    }
    None
}

/// Read Windows password policy via `net accounts`.
/// Returns (min_length, max_age_days, complexity_enabled, min_classes).
#[cfg(target_os = "windows")]
fn detect_windows_password_policy() -> (Option<u32>, Option<u32>, Option<bool>, Option<u32>) {
    use std::process::Command;

    let mut min_length: Option<u32> = None;
    let mut max_age: Option<u32> = None;

    if let Ok(out) = Command::new("net").arg("accounts").output() {
        let s = String::from_utf8_lossy(&out.stdout).to_lowercase();
        for line in s.lines() {
            let line = line.trim();
            if line.starts_with("minimum password length") {
                if let Some(val) = line.split_whitespace().last() {
                    min_length = val.parse().ok();
                }
            }
            if line.starts_with("maximum password age") {
                if let Some(val) = line.split_whitespace().last() {
                    max_age = val.parse().ok();
                }
            }
        }
    }

    // Check complexity via secedit / registry
    let complexity = Command::new("powershell")
        .args(["-Command",
            r"(Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Services\Netlogon\Parameters' -Name RequireStrongKey -ErrorAction SilentlyContinue).RequireStrongKey"])
        .output()
        .ok()
        .and_then(|o| {
            let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
            s.parse::<u32>().ok().map(|n| n == 1)
        });

    let min_classes = complexity.map(|c| if c { 4u32 } else { 1 });

    (min_length, max_age, complexity, min_classes)
}

/// Windows Defender real-time protection status (for AGENT-WIN-004)
#[cfg(target_os = "windows")]
fn detect_windows_defender_rtp() -> Option<bool> {
    use std::process::Command;
    if let Ok(out) = Command::new("powershell")
        .args(["-Command", "Get-MpComputerStatus | Select-Object -ExpandProperty RealTimeProtectionEnabled"])
        .output()
    {
        let s = String::from_utf8_lossy(&out.stdout).trim().to_lowercase();
        return Some(s == "true");
    }
    None
}

/// Defender signature age in days (fresh < 7 days is good for AGENT-WIN-004)
#[cfg(target_os = "windows")]
fn detect_windows_defender_signature_age_days() -> Option<u32> {
    use std::process::Command;
    if let Ok(out) = Command::new("powershell")
        .args(["-Command", "(Get-MpComputerStatus).AntivirusSignatureAge"])
        .output()
    {
        let s = String::from_utf8_lossy(&out.stdout).trim();
        return s.parse::<u32>().ok();
    }
    None
}

/// True only if Domain + Private + Public firewall profiles are all enabled (AGENT-WIN-003)
#[cfg(target_os = "windows")]
fn detect_windows_firewall_all_profiles() -> Option<bool> {
    use std::process::Command;
    // Use PowerShell for structured, locale-independent output instead of fragile netsh text parsing.
    if let Ok(out) = Command::new("powershell")
        .args([
            "-Command",
            "Get-NetFirewallProfile | Select-Object Name,Enabled | ConvertTo-Json -Compress",
        ])
        .output()
    {
        let s = String::from_utf8_lossy(&out.stdout);
        // Parse either a single object or an array of objects
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&s) {
            let profiles: Vec<&serde_json::Value> = val.as_array()
                .map(|a| a.iter().collect())
                .unwrap_or_else(|| vec![&val]);
            let all_on = profiles.iter().all(|p| {
                p.get("Enabled").and_then(|v| v.as_bool()).unwrap_or(false)
            });
            let has_three = profiles.len() >= 3;
            return Some(all_on && has_three);
        }
    }
    // Fallback: netsh with whitespace-normalized parsing (locale-dependent but safer than exact spacing)
    if let Ok(out) = Command::new("netsh")
        .args(["advfirewall", "show", "allprofiles", "state"])
        .output()
    {
        let s = String::from_utf8_lossy(&out.stdout).to_lowercase();
        // Normalize whitespace and look for "state on" pattern
        let normalized: String = s.split_whitespace().collect::<Vec<_>>().join(" ");
        let on_count = normalized.matches("state on").count();
        return Some(on_count >= 3);
    }
    None
}

#[cfg(target_os = "windows")]
fn collect_users_platform() -> Vec<UserInfo> {
    use std::process::Command;
    use std::collections::HashSet;

    // Build admin set from the Administrators local group
    let mut admins: HashSet<String> = HashSet::new();
    if let Ok(out) = Command::new("net").args(["localgroup", "administrators"]).output() {
        let s = String::from_utf8_lossy(&out.stdout);
        let mut in_members = false;
        for line in s.lines() {
            let trimmed = line.trim();
            if trimmed.to_lowercase().starts_with("members") || trimmed == "----------" {
                in_members = true;
                continue;
            }
            if in_members && trimmed.starts_with("The command completed successfully") {
                break;
            }
            if in_members && !trimmed.is_empty() {
                admins.insert(trimmed.to_string());
            }
        }
    }

    if let Ok(out) = Command::new("net").arg("user").output() {
        return String::from_utf8_lossy(&out.stdout)
            .lines()
            .skip(4)
            .flat_map(|l| l.split_whitespace())
            .filter(|s| !s.is_empty())
            .map(|name| {
                let name_str = name.to_string();
                let pwd_expired = check_windows_password_expired(&name_str);
                UserInfo {
                    is_admin: admins.contains(&name_str),
                    name: name_str,
                    password_expired: pwd_expired,
                }
            })
            .collect();
    }
    vec![]
}

#[cfg(target_os = "windows")]
fn check_windows_password_expired(name: &str) -> bool {
    use std::process::Command;
    if let Ok(out) = Command::new("net").args(["user", name]).output() {
        let s = String::from_utf8_lossy(&out.stdout).to_lowercase();
        if let Some(idx) = s.find("password expires") {
            let after = &s[idx..];
            if let Some(line) = after.lines().next() {
                if let Some(val) = line.splitn(2, ':').nth(1) {
                    let v = val.trim();
                    return v != "never";
                }
            }
        }
    }
    false
}

#[cfg(target_os = "windows")]
fn collect_open_ports_platform() -> Vec<u16> {
    use std::process::Command;
    if let Ok(out) = Command::new("netstat").args(["-an"]).output() {
        let mut ports = vec![];
        for line in String::from_utf8_lossy(&out.stdout).lines() {
            if line.contains("LISTENING") {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if let Some(addr) = parts.get(1) {
                    if let Some(p) = addr.rsplit(':').next() {
                        if let Ok(port) = p.parse::<u16>() {
                            ports.push(port);
                        }
                    }
                }
            }
        }
        ports.sort();
        ports.dedup();
        return ports;
    }
    vec![]
}

// ═══════════════════════════════════════════════════════════════════════════════
// Software inventory collection
// ═══════════════════════════════════════════════════════════════════════════════

fn collect_software_inventory() -> Vec<SoftwareItem> {
    collect_software_inventory_platform()
}

fn collect_patch_status() -> Vec<PatchItem> {
    collect_patch_status_platform()
}

#[cfg(target_os = "linux")]
fn collect_software_inventory_platform() -> Vec<SoftwareItem> {
    use std::process::Command;
    let mut software = vec![];

    // Try dpkg first (Debian/Ubuntu)
    if let Ok(out) = Command::new("dpkg-query")
        .args(["-W", "-f=${Package}\t${Version}\t${Maintainer}\n"])
        .output()
    {
        let s = String::from_utf8_lossy(&out.stdout);
        for line in s.lines().take(200) {
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() >= 2 {
                let name = parts[0].to_string();
                let version = parts[1].to_string();
                software.push(SoftwareItem {
                    name: name.clone(),
                    version: version.clone(),
                    publisher: parts.get(2).map(|s| s.to_string()).filter(|s| !s.is_empty()),
                    install_date: None,
                    source: "dpkg".into(),
                    cpe_identifier: generate_cpe(&name, &version, parts.get(2).copied()),
                });
            }
        }
        if !software.is_empty() {
            return software;
        }
    }

    // Fallback: rpm (RHEL/CentOS/Fedora)
    if let Ok(out) = Command::new("rpm")
        .args(["-qa", "--queryformat", "%{NAME}\t%{VERSION}-%{RELEASE}\t%{VENDOR}\n"])
        .output()
    {
        let s = String::from_utf8_lossy(&out.stdout);
        for line in s.lines().take(200) {
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() >= 2 {
                let name = parts[0].to_string();
                let version = parts[1].to_string();
                software.push(SoftwareItem {
                    name: name.clone(),
                    version: version.clone(),
                    publisher: parts.get(2).map(|s| s.to_string()).filter(|s| !s.is_empty() && s != "(none)"),
                    install_date: None,
                    source: "rpm".into(),
                    cpe_identifier: generate_cpe(&name, &version, parts.get(2).copied()),
                });
            }
        }
    }

    software
}

#[cfg(target_os = "linux")]
fn collect_patch_status_platform() -> Vec<PatchItem> {
    use std::process::Command;
    let mut patches = vec![];

    // Try apt (Debian/Ubuntu)
    if let Ok(out) = Command::new("apt")
        .args(["list", "--upgradable"])
        .output()
    {
        let s = String::from_utf8_lossy(&out.stdout);
        for line in s.lines().skip(1).take(100) {
            if line.contains("/") {
                let parts: Vec<&str> = line.split('/').collect();
                if let Some(pkg) = parts.first() {
                    let name = pkg.trim().to_string();
                    let avail = line.split_whitespace().nth(1).map(|s| s.to_string());
                    patches.push(PatchItem {
                        name,
                        current_version: None,
                        available_version: avail,
                        severity: None,
                        install_date: None,
                        status: "missing".into(),
                    });
                }
            }
        }
        if !patches.is_empty() {
            return patches;
        }
    }

    // Fallback: dnf/yum (RHEL/CentOS/Fedora)
    if let Ok(out) = Command::new("dnf").args(["check-update", "-q"]).output() {
        let s = String::from_utf8_lossy(&out.stdout);
        for line in s.lines().take(100) {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with("Last metadata") {
                continue;
            }
            let parts: Vec<&str> = trimmed.split_whitespace().collect();
            if parts.len() >= 2 {
                patches.push(PatchItem {
                    name: parts[0].to_string(),
                    current_version: None,
                    available_version: Some(parts[1].to_string()),
                    severity: None,
                    install_date: None,
                    status: "missing".into(),
                });
            }
        }
    }

    patches
}

#[cfg(target_os = "macos")]
fn collect_software_inventory_platform() -> Vec<SoftwareItem> {
    use std::process::Command;
    let mut software = vec![];

    // macOS pkgutil — system packages
    if let Ok(out) = Command::new("pkgutil").args(["--pkgs"]).output() {
        let s = String::from_utf8_lossy(&out.stdout);
        for pkg_id in s.lines().take(100) {
            let pkg_id = pkg_id.trim();
            if pkg_id.is_empty() { continue; }
            let version = Command::new("pkgutil")
                .args(["--pkg-info", pkg_id])
                .output()
                .ok()
                .and_then(|o| {
                    let info = String::from_utf8_lossy(&o.stdout);
                    info.lines()
                        .find(|l| l.starts_with("version:"))
                        .and_then(|l| l.splitn(2, ':').nth(1))
                        .map(|v| v.trim().to_string())
                });
            let name = pkg_id.to_string();
            let ver = version.clone().unwrap_or_else(|| "unknown".into());
            software.push(SoftwareItem {
                name: name.clone(),
                version: ver.clone(),
                publisher: None,
                install_date: None,
                source: "pkgutil".into(),
                cpe_identifier: generate_cpe(&name, &ver, None),
            });
        }
    }

    // Homebrew packages
    if let Ok(out) = Command::new("brew").args(["list", "--versions"]).output() {
        let s = String::from_utf8_lossy(&out.stdout);
        for line in s.lines().take(100) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                let name = parts[0].to_string();
                let version = parts[1].to_string();
                software.push(SoftwareItem {
                    name: name.clone(),
                    version: version.clone(),
                    publisher: Some("Homebrew".into()),
                    install_date: None,
                    source: "brew".into(),
                    cpe_identifier: generate_cpe(&name, &version, Some("homebrew")),
                });
            }
        }
    }

    // system_profiler SPApplicationsDataType — user + system apps (much better coverage for Mac)
    if let Ok(out) = Command::new("system_profiler")
        .args(["SPApplicationsDataType", "-json"])
        .output()
    {
        if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&out.stdout) {
            if let Some(apps) = json.get("SPApplicationsDataType").and_then(|v| v.as_array()) {
                for app in apps.iter().take(200) {
                    let name = app.get("_name").and_then(|v| v.as_str()).unwrap_or("Unknown App").to_string();
                    let version = app.get("version").and_then(|v| v.as_str()).unwrap_or("unknown").to_string();
                    let publisher = app.get("obtained_from").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let path = app.get("path").and_then(|v| v.as_str()).unwrap_or("").to_string();

                    // Only add if it looks like a real app
                    if !name.is_empty() && name != "Unknown App" {
                        let cpe = generate_cpe(&name, &version, publisher.as_deref());
                        software.push(SoftwareItem {
                            name: name.clone(),
                            version: version.clone(),
                            publisher,
                            install_date: None,
                            source: if path.contains("/Applications") { "system_profiler" } else { "other" }.into(),
                            cpe_identifier: cpe,
                        });
                    }
                }
            }
        }
    }

    software
}

#[cfg(target_os = "macos")]
fn collect_patch_status_platform() -> Vec<PatchItem> {
    use std::process::Command;
    let mut patches = vec![];

    // Preferred: softwareupdate --list (works on modern macOS)
    if let Ok(out) = Command::new("softwareupdate").args(["--list"]).output() {
        let s = String::from_utf8_lossy(&out.stdout);
        for line in s.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with('*') || trimmed.contains("Label:") {
                let name = trimmed
                    .trim_start_matches('*')
                    .trim_start_matches("Label:")
                    .trim()
                    .to_string();
                if !name.is_empty() && !patches.iter().any(|p: &PatchItem| p.name == name) {
                    patches.push(PatchItem {
                        name,
                        current_version: None,
                        available_version: None,
                        severity: Some("recommended".into()),
                        install_date: None,
                        status: "missing".into(),
                    });
                }
            }
        }
    }

    // Fallback to older flag if above returned nothing
    if patches.is_empty() {
        if let Ok(out) = Command::new("softwareupdate").args(["-l", "--no-scan"]).output() {
            let s = String::from_utf8_lossy(&out.stdout);
            for line in s.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with('*') || trimmed.starts_with("Label:") {
                    let name = trimmed.trim_start_matches('*').trim_start_matches("Label:").trim().to_string();
                    if !name.is_empty() && !patches.iter().any(|p| p.name == name) {
                        patches.push(PatchItem {
                            name,
                            current_version: None,
                            available_version: None,
                            severity: None,
                            install_date: None,
                            status: "missing".into(),
                        });
                    }
                }
            }
        }
    }

    patches
}

#[cfg(target_os = "windows")]
fn collect_software_inventory_platform() -> Vec<SoftwareItem> {
    use std::process::Command;
    let mut software = vec![];

    // 64-bit registry
    if let Ok(out) = Command::new("powershell")
        .args([
            "-Command",
            r"Get-ItemProperty HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\* |
             Select-Object DisplayName, DisplayVersion, Publisher, InstallDate |
             ConvertTo-Json -Compress"
        ])
        .output()
    {
        let s = String::from_utf8_lossy(&out.stdout);
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&s) {
            if let Some(arr) = json.as_array() {
                for item in arr.iter().take(200) {
                    if let Some(name) = item.get("DisplayName").and_then(|v| v.as_str()) {
                        if !name.is_empty() {
                            let version = item.get("DisplayVersion").and_then(|v| v.as_str()).unwrap_or("").to_string();
                            let publisher = item.get("Publisher").and_then(|v| v.as_str()).filter(|s| !s.is_empty()).map(|s| s.to_string());
                            let name_str = name.to_string();
                            software.push(SoftwareItem {
                                name: name_str.clone(),
                                version: version.clone(),
                                publisher: publisher.clone(),
                                install_date: item.get("InstallDate").and_then(|v| v.as_str()).filter(|s| !s.is_empty()).map(|s| s.to_string()),
                                source: "windows_registry".into(),
                                cpe_identifier: generate_cpe(&name_str, &version, publisher.as_deref()),
                            });
                        }
                    }
                }
            }
        }
    }

    // 32-bit registry (WoW64)
    if let Ok(out) = Command::new("powershell")
        .args([
            "-Command",
            r"Get-ItemProperty HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\* |
             Select-Object DisplayName, DisplayVersion, Publisher, InstallDate |
             ConvertTo-Json -Compress"
        ])
        .output()
    {
        let s = String::from_utf8_lossy(&out.stdout);
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&s) {
            if let Some(arr) = json.as_array() {
                for item in arr.iter().take(200) {
                    if let Some(name) = item.get("DisplayName").and_then(|v| v.as_str()) {
                        if !name.is_empty() && !software.iter().any(|s| s.name == name) {
                            let version = item.get("DisplayVersion").and_then(|v| v.as_str()).unwrap_or("").to_string();
                            let publisher = item.get("Publisher").and_then(|v| v.as_str()).filter(|s| !s.is_empty()).map(|s| s.to_string());
                            let name_str = name.to_string();
                            software.push(SoftwareItem {
                                name: name_str.clone(),
                                version: version.clone(),
                                publisher: publisher.clone(),
                                install_date: item.get("InstallDate").and_then(|v| v.as_str()).filter(|s| !s.is_empty()).map(|s| s.to_string()),
                                source: "windows_registry_wow64".into(),
                                cpe_identifier: generate_cpe(&name_str, &version, publisher.as_deref()),
                            });
                        }
                    }
                }
            }
        }
    }

    software
}

#[cfg(target_os = "windows")]
fn collect_patch_status_platform() -> Vec<PatchItem> {
    use std::process::Command;
    let mut patches = vec![];

    // Installed hotfixes
    if let Ok(out) = Command::new("powershell")
        .args([
            "-Command",
            r"Get-HotFix | Select-Object HotFixID, InstalledOn, Description | ConvertTo-Json -Compress"
        ])
        .output()
    {
        let s = String::from_utf8_lossy(&out.stdout);
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&s) {
            let items = if json.is_array() {
                json.as_array().unwrap_or(&vec![]).clone()
            } else {
                vec![json]
            };
            for item in items.iter().take(100) {
                if let Some(name) = item.get("HotFixID").and_then(|v| v.as_str()) {
                    patches.push(PatchItem {
                        name: name.to_string(),
                        current_version: None,
                        available_version: None,
                        severity: item.get("Description").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        install_date: item.get("InstalledOn").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        status: "installed".into(),
                    });
                }
            }
        }
    }

    patches
}

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
fn collect_software_inventory_platform() -> Vec<SoftwareItem> { vec![] }

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
fn collect_patch_status_platform() -> Vec<PatchItem> { vec![] }

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 3: Security integrations
// ═══════════════════════════════════════════════════════════════════════════════

// ── EDR Detection ──────────────────────────────────────────────────────────────

fn detect_edr(sys: &System) -> (bool, Vec<String>) {
    let known_edr_processes: &[&str] = &[
        // CrowdStrike
        "falcon-sensor", "falcon_sensor", "csagent", "csfalconcontainer",
        // SentinelOne
        "sentinelagent", "sentinelone", "s1-agent", "s1agent",
        // Carbon Black
        "cb.exe", "carbonblack", "repux", "repwmi",
        // Microsoft Defender
        "msmpeng", "mssecfl", "smartscreen", "windefend",
        // Sophos
        "sophosav", "sophoshealth", "sophosssp", "sophoscleanup",
        // McAfee
        "mcshield", "mcapexe", "mfeann", "mfemms",
        // Trend Micro
        "tmlisten", "tmntsrv", "tmproxy", "pccntmon",
        // Symantec / Broadcom
        "ccsvchst", "rtvscan", "symantec", "sepagent",
        // Palo Alto Cortex / Traps
        "cyserver", "cytray", "cortex-xdr",
        // Kaspersky
        "avp", "klnagent", "kaspersky",
        // Elastic / Endgame
        "elastic-endpoint", "elastic_agent", "endgame",
        // Tanium
        "taniumclient", "tanium",
        // OSQuery (often used for EDR)
        "osqueryd",
    ];

    let mut found = vec![];
    for proc in sys.processes().values() {
        let name = proc.name().to_lowercase();
        for &edr in known_edr_processes {
            if name.contains(edr) {
                let clean = proc.name().to_string();
                if !found.contains(&clean) {
                    found.push(clean);
                }
                break;
            }
        }
    }

    (!found.is_empty(), found)
}

// ── Event Logging Detection ────────────────────────────────────────────────────

fn detect_event_logging() -> Option<bool> {
    detect_event_logging_platform()
}

#[cfg(target_os = "linux")]
fn detect_event_logging_platform() -> Option<bool> {
    use std::process::Command;
    // Check if auditd or rsyslog is running
    if let Ok(out) = Command::new("systemctl")
        .args(["is-active", "auditd", "rsyslog", "syslog"])
        .output()
    {
        let s = String::from_utf8_lossy(&out.stdout);
        return Some(s.contains("active"));
    }
    // Fallback: check if auditd process exists
    if let Ok(out) = Command::new("pgrep").args(["-c", "auditd|rsyslogd|syslogd"]).output() {
        let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
        return s.parse::<i32>().ok().map(|n| n > 0);
    }
    None
}

#[cfg(target_os = "macos")]
fn detect_event_logging_platform() -> Option<bool> {
    use std::process::Command;
    // Check unified logging is available (always on in modern macOS, but verify)
    if let Ok(out) = Command::new("log").args(["show", "--last", "1m"]).output() {
        return Some(out.status.success());
    }
    None
}

#[cfg(target_os = "windows")]
fn detect_event_logging_platform() -> Option<bool> {
    use std::process::Command;
    if let Ok(out) = Command::new("sc").args(["query", "EventLog"]).output() {
        let s = String::from_utf8_lossy(&out.stdout).to_lowercase();
        return Some(s.contains("running"));
    }
    None
}

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
fn detect_event_logging_platform() -> Option<bool> { None }

// ── NTP Sync Detection ─────────────────────────────────────────────────────────

fn detect_ntp_sync() -> Option<bool> {
    detect_ntp_sync_platform()
}

#[cfg(target_os = "linux")]
fn detect_ntp_sync_platform() -> Option<bool> {
    use std::process::Command;
    // Try timedatectl first (systemd)
    if let Ok(out) = Command::new("timedatectl").output() {
        let s = String::from_utf8_lossy(&out.stdout).to_lowercase();
        if s.contains("ntp enabled: yes") || s.contains("ntp synchronized: yes") {
            return Some(true);
        }
        if s.contains("ntp enabled: no") || s.contains("ntp synchronized: no") {
            return Some(false);
        }
    }
    // Try chronyc
    if let Ok(out) = Command::new("chronyc").args(["tracking"]).output() {
        let s = String::from_utf8_lossy(&out.stdout).to_lowercase();
        if s.contains("reference id") {
            // chronyc works, check if synced
            return Some(!s.contains("not synchronized") && !s.contains("unsynchronised"));
        }
    }
    // Try ntpstat
    if let Ok(out) = Command::new("ntpstat").output() {
        let s = String::from_utf8_lossy(&out.stdout).to_lowercase();
        return Some(s.contains("synchronised") || s.contains("synchronized"));
    }
    None
}

#[cfg(target_os = "macos")]
fn detect_ntp_sync_platform() -> Option<bool> {
    use std::process::Command;
    if let Ok(out) = Command::new("systemsetup").args(["-getusingnetworktime"]).output() {
        let s = String::from_utf8_lossy(&out.stdout).to_lowercase();
        return Some(s.contains("on"));
    }
    // Fallback: sntp
    if let Ok(out) = Command::new("sntp").args(["-c", "pool.ntp.org"]).output() {
        return Some(out.status.success());
    }
    None
}

#[cfg(target_os = "windows")]
fn detect_ntp_sync_platform() -> Option<bool> {
    use std::process::Command;
    if let Ok(out) = Command::new("w32tm").args(["/query", "/status"]).output() {
        let s = String::from_utf8_lossy(&out.stdout).to_lowercase();
        if s.contains("source:") && !s.contains("local cmos clock") && !s.contains("unspecified") {
            return Some(true);
        }
        if s.contains("the service has not been started") {
            return Some(false);
        }
    }
    None
}

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
fn detect_ntp_sync_platform() -> Option<bool> { None }

// ── File Integrity Monitoring (FIM) ────────────────────────────────────────────

fn fim_baseline_path() -> std::path::PathBuf {
    let mut p = dirs::data_local_dir().unwrap_or_else(|| std::path::PathBuf::from("/tmp"));
    p.push("grc-agent");
    p.push("fim-baseline.json");
    p
}

fn fim_critical_files() -> Vec<&'static str> {
    #[cfg(target_os = "linux")]
    {
        vec![
            "/etc/passwd",
            "/etc/shadow",
            "/etc/group",
            "/etc/sudoers",
            "/etc/ssh/sshd_config",
            "/etc/pam.d/common-auth",
            "/etc/crontab",
        ]
    }
    #[cfg(target_os = "macos")]
    {
        vec![
            "/etc/passwd",
            "/etc/sudoers",
            "/etc/ssh/sshd_config",
            "/etc/pam.d/login",
            "/etc/authorization",
        ]
    }
    #[cfg(target_os = "windows")]
    {
        vec![
            r"C:\Windows\System32\drivers\etc\hosts",
            r"C:\Windows\System32\config\SAM",
        ]
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        vec![]
    }
}

fn sha256_file(path: &str) -> Option<String> {
    use std::io::Read;
    use sha2::{Sha256, Digest};
    let mut file = std::fs::File::open(path).ok()?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 8192];
    loop {
        let n = file.read(&mut buf).ok()?;
        if n == 0 { break; }
        hasher.update(&buf[..n]);
    }
    Some(format!("{:x}", hasher.finalize()))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct FimBaseline {
    created_at: String,
    files: std::collections::HashMap<String, String>,
}

fn check_fim_baseline() -> (String, Vec<String>) {
    let files = fim_critical_files();
    if files.is_empty() {
        return ("unsupported".into(), vec![]);
    }

    // Compute current hashes
    let mut current = std::collections::HashMap::new();
    for &path in &files {
        if let Some(hash) = sha256_file(path) {
            current.insert(path.to_string(), hash);
        }
    }

    let baseline_path = fim_baseline_path();

    // Load existing baseline
    let baseline: Option<FimBaseline> = std::fs::read_to_string(&baseline_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok());

    let mut violations = vec![];

    if let Some(base) = baseline {
        // Compare against baseline
        for (path, hash) in &current {
            if let Some(expected) = base.files.get(path) {
                if expected != hash {
                    violations.push(format!("{path}: hash mismatch"));
                }
            }
        }
        let status = if violations.is_empty() { "clean".into() } else { "violation".into() };
        (status, violations)
    } else {
        // First run: create baseline
        let new_baseline = FimBaseline {
            created_at: chrono::Utc::now().to_rfc3339(),
            files: current,
        };
        if let Some(parent) = baseline_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string_pretty(&new_baseline) {
            let _ = std::fs::write(&baseline_path, json);
        }
        ("baseline_created".into(), vec![])
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Fallback (unknown OS)
// ═══════════════════════════════════════════════════════════════════════════════

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
fn collect_platform_posture() -> PlatformPosture {
    PlatformPosture {
        encryption_status: "unknown".into(),
        ..Default::default()
    }
}

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
fn collect_users_platform() -> Vec<UserInfo> { vec![] }

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
fn collect_open_ports_platform() -> Vec<u16> { vec![] }
