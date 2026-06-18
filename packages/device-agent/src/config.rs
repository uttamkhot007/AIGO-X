use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;

use crate::admin::AdminConfig;

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct Config {
    pub registration: RegistrationConfig,
    pub agent: AgentConfig,
    pub store: StoreConfig,
    #[serde(default)]
    pub vault: VaultConfig,
    #[serde(default)]
    pub offline: OfflineConfig,
    #[serde(default)]
    pub admin: AdminConfig,
    #[serde(default)]
    pub healing: HealingConfig,
    #[serde(default)]
    pub azure_ad: AzureAdConfig,
    #[serde(default)]
    pub remediation: RemediationConfig,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct RegistrationConfig {
    pub admin_panel_url: String,
    /// Legacy static tenant agent token (SEC-002 transition).
    /// New JWT flow uses this only as a bootstrap token for registration.
    pub agent_token: String,
    #[serde(default)]
    pub tenant_id: String,
    #[serde(default)]
    pub auto_register: bool,
    #[serde(default)]
    pub agent_id: Option<String>,
    /// Path to persisted mTLS client certificate (SEC-001).
    #[serde(default)]
    pub agent_cert_pem: Option<String>,
    /// Path to persisted mTLS client private key (SEC-001).
    #[serde(default)]
    pub agent_key_pem: Option<String>,
    /// Path to persisted Ed25519 private key (SEC-003).
    /// Defaults to `<data_dir>/grc-agent/ed25519.key`.
    #[serde(default)]
    pub ed25519_private_key_path: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct AgentConfig {
    #[serde(default = "default_name")]
    pub name: String,
    #[serde(default = "default_version")]
    pub version: String,
    #[serde(default = "default_heartbeat_interval")]
    pub heartbeat_interval: u64,
    #[serde(default = "default_collection_interval")]
    pub collection_interval: u64,
    #[serde(default)]
    pub environment: Option<String>,
    #[serde(default)]
    pub log_level: Option<String>,
    #[serde(default)]
    pub log_json: Option<bool>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct StoreConfig {
    pub path: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct VaultConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub address: Option<String>,
    #[serde(default)]
    pub role_id: Option<String>,
    #[serde(default)]
    pub secret_id: Option<String>,
    #[serde(default)]
    pub token: Option<String>,
    #[serde(default)]
    pub mount_path: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct OfflineConfig {
    #[serde(default)]
    pub encrypt: bool,
    #[serde(default)]
    pub max_buffered_payloads: Option<usize>,
    #[serde(default)]
    pub max_age_hours: Option<u64>,
}

/// Self-healing and resilience configuration.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct HealingConfig {
    /// Seconds before a stalled collection cycle is killed by the watchdog (default 300).
    #[serde(default = "default_watchdog_timeout_secs")]
    pub watchdog_timeout_secs: u64,

    /// Max retry attempts for push/checkin before buffering locally (default 3).
    #[serde(default = "default_max_push_retries")]
    pub max_push_retries: u32,

    /// Base backoff in seconds for push retries — doubles each attempt (default 2).
    #[serde(default = "default_backoff_base_secs")]
    pub backoff_base_secs: u64,

    /// Re-register with server when api_client component enters Failed state (default true).
    #[serde(default = "default_true")]
    pub auto_reregister: bool,

    /// Skip push when payload hash matches previous cycle — saves bandwidth (default true).
    #[serde(default = "default_true")]
    pub delta_push: bool,

    /// Halve collection interval when compliance score drops below this threshold (default 60).
    #[serde(default = "default_adaptive_score_threshold")]
    pub adaptive_score_threshold: u32,
}

impl Default for HealingConfig {
    fn default() -> Self {
        Self {
            watchdog_timeout_secs: default_watchdog_timeout_secs(),
            max_push_retries: default_max_push_retries(),
            backoff_base_secs: default_backoff_base_secs(),
            auto_reregister: true,
            delta_push: true,
            adaptive_score_threshold: default_adaptive_score_threshold(),
        }
    }
}

/// Azure AD / Microsoft Entra ID identity context for this endpoint.
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct AzureAdConfig {
    /// Enable Azure AD identity checks (AGENT-AZ-001/002). Auto-enabled if device_id is set.
    #[serde(default)]
    pub enabled: bool,

    /// Azure AD device object ID (set by MDM enrollment or GRC_AZURE_DEVICE_ID env var).
    #[serde(default)]
    pub device_id: Option<String>,

    /// Azure AD tenant ID (set by GRC_AZURE_TENANT_ID env var or MDM policy).
    #[serde(default)]
    pub tenant_id: Option<String>,
}

fn default_name() -> String { "grc-agent".into() }
fn default_version() -> String { env!("CARGO_PKG_VERSION").into() }
fn default_heartbeat_interval() -> u64 { 300 }
fn default_collection_interval() -> u64 { 900 }
fn default_watchdog_timeout_secs() -> u64 { 300 }
fn default_max_push_retries() -> u32 { 3 }
fn default_backoff_base_secs() -> u64 { 2 }
fn default_true() -> bool { true }
fn default_adaptive_score_threshold() -> u32 { 60 }

/// Remediation / self-healing configuration.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct RemediationConfig {
    /// Enable automatic remediation of safe, low-risk findings (default false).
    #[serde(default = "default_false")]
    pub auto_remediate: bool,

    /// Create backup files before modifying configuration (default true).
    #[serde(default = "default_true")]
    pub backup_before_fix: bool,

    /// Simulate remediation actions without making changes (default false).
    #[serde(default = "default_false")]
    pub dry_run_remediation: bool,
}

impl Default for RemediationConfig {
    fn default() -> Self {
        Self {
            auto_remediate: false,
            backup_before_fix: true,
            dry_run_remediation: false,
        }
    }
}

fn default_false() -> bool { false }

impl Config {
    pub fn load(path: Option<&str>) -> Result<Self> {
        let search_paths = Self::search_paths(path);

        let mut file_content: Option<String> = None;
        let mut used_path = String::new();

        for p in &search_paths {
            if Path::new(p).exists() {
                file_content = Some(
                    std::fs::read_to_string(p)
                        .with_context(|| format!("reading config {p}"))?,
                );
                used_path = p.clone();
                break;
            }
        }

        let mut cfg: Config = if let Some(content) = file_content {
            tracing::info!("loading config from {used_path}");
            serde_yaml::from_str(&content)
                .with_context(|| format!("parsing config {used_path}"))?
        } else {
            tracing::warn!("no config file found (searched {:?}); loading from environment only", search_paths);
            Config::default()
        };

        cfg.apply_env_overrides();
        cfg.apply_defaults();

        Ok(cfg)
    }

    fn search_paths(explicit: Option<&str>) -> Vec<String> {
        if let Some(p) = explicit {
            return vec![p.to_string()];
        }
        let mut paths = vec![];
        #[cfg(target_os = "windows")]
        {
            let pd = std::env::var("PROGRAMDATA").unwrap_or_default();
            let ad = std::env::var("APPDATA").unwrap_or_default();
            paths.push(format!("{pd}\\GRCAgent\\config.yaml"));
            paths.push(format!("{ad}\\GRCAgent\\config.yaml"));
        }
        #[cfg(not(target_os = "windows"))]
        {
            paths.push("/etc/grc-agent/config.yaml".into());
            if let Ok(home) = std::env::var("HOME") {
                paths.push(format!("{home}/.grc-agent/config.yaml"));
            }
        }
        paths.push("config.yaml".into());
        paths
    }

    fn apply_env_overrides(&mut self) {
        if let Ok(v) = std::env::var("GRC_AGENT_TOKEN") {
            self.registration.agent_token = v;
        }
        if let Ok(v) = std::env::var("GRC_PANEL_URL") {
            self.registration.admin_panel_url = v;
        }
        if let Ok(v) = std::env::var("GRC_TENANT_ID") {
            self.registration.tenant_id = v;
        }
        // SEC-001: mTLS certificate path overrides
        if let Ok(v) = std::env::var("GRC_AGENT_CERT_PEM") {
            self.registration.agent_cert_pem = Some(v);
        }
        if let Ok(v) = std::env::var("GRC_AGENT_KEY_PEM") {
            self.registration.agent_key_pem = Some(v);
        }
        // SEC-003: Ed25519 private key path override
        if let Ok(v) = std::env::var("GRC_ED25519_KEY_PATH") {
            self.registration.ed25519_private_key_path = Some(v);
        }
        // Vault env overrides
        if let Ok(v) = std::env::var("VAULT_ADDR") {
            self.vault.address = Some(v);
        }
        if let Ok(v) = std::env::var("VAULT_TOKEN") {
            self.vault.token = Some(v);
        }
        if let Ok(v) = std::env::var("VAULT_ROLE_ID") {
            self.vault.role_id = Some(v);
        }
        if let Ok(v) = std::env::var("VAULT_SECRET_ID") {
            self.vault.secret_id = Some(v);
        }
        // Azure AD identity overrides
        if let Ok(v) = std::env::var("GRC_AZURE_DEVICE_ID") {
            self.azure_ad.device_id = Some(v);
            self.azure_ad.enabled = true;
        }
        if let Ok(v) = std::env::var("GRC_AZURE_TENANT_ID") {
            self.azure_ad.tenant_id = Some(v);
        }
        // Healing overrides
        if let Ok(v) = std::env::var("GRC_WATCHDOG_TIMEOUT_SECS") {
            if let Ok(n) = v.parse() { self.healing.watchdog_timeout_secs = n; }
        }
        if let Ok(v) = std::env::var("GRC_MAX_PUSH_RETRIES") {
            if let Ok(n) = v.parse() { self.healing.max_push_retries = n; }
        }
        if let Ok("false" | "0") = std::env::var("GRC_DELTA_PUSH").as_deref() {
            self.healing.delta_push = false;
        }
        // Remediation env overrides
        if let Ok("true" | "1") = std::env::var("GRC_AUTO_REMEDIATE").as_deref() {
            self.remediation.auto_remediate = true;
        }
        if let Ok("false" | "0") = std::env::var("GRC_REMEDIATION_BACKUP").as_deref() {
            self.remediation.backup_before_fix = false;
        }
        if let Ok("true" | "1") = std::env::var("GRC_REMEDIATION_DRY_RUN").as_deref() {
            self.remediation.dry_run_remediation = true;
        }
    }

    fn apply_defaults(&mut self) {
        if self.agent.heartbeat_interval == 0 {
            self.agent.heartbeat_interval = 300;
        }
        if self.agent.collection_interval == 0 {
            self.agent.collection_interval = 900;
        }
        if self.agent.name.is_empty() {
            self.agent.name = "grc-agent".into();
        }
        if self.agent.version.is_empty() {
            self.agent.version = env!("CARGO_PKG_VERSION").into();
        }
        // If azure_ad device_id is set, ensure enabled flag matches
        if self.azure_ad.device_id.is_some() {
            self.azure_ad.enabled = true;
        }
    }
}
