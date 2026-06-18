use anyhow::{bail, Context, Result};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

use crate::config::VaultConfig;

#[derive(Debug, Clone)]
pub enum SecretsBackend {
    Vault(VaultBackend),
    Env(EnvBackend),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Secret {
    pub key: String,
    pub value: String,
    pub version: Option<u32>,
}

impl SecretsBackend {
    /// Build a backend from config — falls back to Env when Vault is disabled or
    /// address is absent, so simple deployments work with no Vault server.
    pub fn from_config(cfg: &VaultConfig) -> Self {
        if cfg.enabled && cfg.address.is_some() {
            info!("secrets backend: Vault ({})", cfg.address.as_deref().unwrap_or(""));
            SecretsBackend::Vault(VaultBackend::from_config(cfg))
        } else {
            warn!("Vault not configured — falling back to environment variable secrets backend");
            SecretsBackend::Env(EnvBackend::new("GRC_SECRET_"))
        }
    }

    pub async fn get_secret(&self, key: &str) -> Result<Option<String>> {
        match self {
            SecretsBackend::Vault(v) => v.get_secret(key).await,
            SecretsBackend::Env(e) => Ok(e.get_secret(key)),
        }
    }

    pub async fn get_agent_token(&self, fallback: &str) -> String {
        match self.get_secret("agent_token").await {
            Ok(Some(v)) => v,
            _ => fallback.to_string(),
        }
    }
}

// ── Vault Backend ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct VaultBackend {
    address: String,
    mount_path: String,
    auth: VaultAuth,
}

#[derive(Debug, Clone)]
enum VaultAuth {
    Token(String),
    AppRole { role_id: String, secret_id: String },
}

impl VaultBackend {
    fn from_config(cfg: &VaultConfig) -> Self {
        let auth = if let Some(token) = &cfg.token {
            VaultAuth::Token(token.clone())
        } else if let (Some(role_id), Some(secret_id)) = (&cfg.role_id, &cfg.secret_id) {
            VaultAuth::AppRole {
                role_id: role_id.clone(),
                secret_id: secret_id.clone(),
            }
        } else {
            VaultAuth::Token(String::new())
        };

        Self {
            address: cfg.address.clone().unwrap_or_default(),
            mount_path: cfg.mount_path.clone().unwrap_or_else(|| "secret".into()),
            auth,
        }
    }

    async fn vault_token(&self) -> Result<String> {
        match &self.auth {
            VaultAuth::Token(t) => Ok(t.clone()),
            VaultAuth::AppRole { role_id, secret_id } => {
                self.approle_login(role_id, secret_id).await
            }
        }
    }

    async fn approle_login(&self, role_id: &str, secret_id: &str) -> Result<String> {
        let client = reqwest::Client::new();
        let url = format!("{}/v1/auth/approle/login", self.address);
        let body = serde_json::json!({
            "role_id":   role_id,
            "secret_id": secret_id,
        });

        let resp = client.post(&url).json(&body).send().await?;
        if !resp.status().is_success() {
            bail!("Vault AppRole login failed: {}", resp.status());
        }

        let data: serde_json::Value = resp.json().await?;
        data["auth"]["client_token"]
            .as_str()
            .map(|s| s.to_string())
            .ok_or_else(|| anyhow::anyhow!("no client_token in Vault login response"))
    }

    pub async fn get_secret(&self, key: &str) -> Result<Option<String>> {
        let token = self.vault_token().await?;
        let url = format!("{}/v1/{}/data/{}", self.address, self.mount_path, key);
        let client = reqwest::Client::new();

        let resp = client
            .get(&url)
            .header("X-Vault-Token", &token)
            .send()
            .await?;

        if resp.status().as_u16() == 404 {
            return Ok(None);
        }
        if !resp.status().is_success() {
            bail!("Vault GET secret failed: {}", resp.status());
        }

        let data: serde_json::Value = resp.json().await?;
        let value = data["data"]["data"]["value"]
            .as_str()
            .map(|s| s.to_string());
        Ok(value)
    }
}

// ── Environment Backend ───────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct EnvBackend {
    prefix: String,
}

impl EnvBackend {
    pub fn new(prefix: &str) -> Self {
        Self { prefix: prefix.to_uppercase() }
    }

    pub fn get_secret(&self, key: &str) -> Option<String> {
        let env_key = format!("{}{}", self.prefix, key.to_uppercase().replace('-', "_"));
        std::env::var(&env_key).ok()
    }
}

// ── Device-Bound Key Management (SEC-005) ────────────────────────────────────

const DEVICE_KEY_SERVICE: &str = "grc-shield-agent";
const DEVICE_KEY_ACCOUNT: &str = "device-bound-key";

/// Generate a new 256-bit random key.
fn generate_device_key() -> [u8; 32] {
    let mut key = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut key);
    key
}

/// Retrieve the device-bound key from secure storage, or generate and store a new one.
///
/// Priority:
/// 1. Platform secure storage (Keychain / Credential Manager / secret-service)
/// 2. Fallback file with restrictive permissions (0o600 on Unix)
pub fn get_or_create_device_key() -> Result<[u8; 32]> {
    match get_device_key_from_keyring() {
        Ok(key) => return Ok(key),
        Err(e) => {
            warn!("keyring unavailable ({}), trying fallback file storage", e);
        }
    }
    get_or_create_device_key_from_file(&fallback_key_path())
}

fn get_device_key_from_keyring() -> Result<[u8; 32]> {
    let entry = keyring::Entry::new(DEVICE_KEY_SERVICE, DEVICE_KEY_ACCOUNT)
        .map_err(|e| anyhow::anyhow!("keyring entry creation failed: {e}"))?;

    match entry.get_password() {
        Ok(hex_key) => {
            let mut key = [0u8; 32];
            let bytes = hex::decode(&hex_key)
                .map_err(|e| anyhow::anyhow!("invalid hex in keyring: {e}"))?;
            if bytes.len() != 32 {
                bail!("keyring stored key length mismatch: expected 32, got {}", bytes.len());
            }
            key.copy_from_slice(&bytes);
            Ok(key)
        }
        Err(keyring::Error::NoEntry) => {
            let key = generate_device_key();
            let hex_key = hex::encode(key);
            entry.set_password(&hex_key)
                .map_err(|e| anyhow::anyhow!("keyring set_password failed: {e}"))?;
            info!("generated new device-bound key and stored in platform keyring");
            Ok(key)
        }
        Err(e) => {
            bail!("keyring get_password failed: {e}")
        }
    }
}

fn fallback_key_path() -> std::path::PathBuf {
    #[cfg(target_os = "windows")]
    {
        let pd = std::env::var("PROGRAMDATA").unwrap_or_else(|_| "C:\\ProgramData".into());
        std::path::PathBuf::from(format!("{pd}\\GRCAgent\\.device_key"))
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::path::PathBuf::from("/var/lib/grc-agent/.device_key")
    }
}

fn get_or_create_device_key_from_file(path: &std::path::Path) -> Result<[u8; 32]> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("create fallback key dir {}", parent.display()))?;
    }

    if path.exists() {
        let hex_key = std::fs::read_to_string(path)
            .with_context(|| format!("read fallback key {}", path.display()))?;
        let mut key = [0u8; 32];
        let bytes = hex::decode(hex_key.trim())
            .map_err(|e| anyhow::anyhow!("invalid hex in fallback key file: {e}"))?;
        if bytes.len() != 32 {
            bail!("fallback key file length mismatch: expected 32, got {}", bytes.len());
        }
        key.copy_from_slice(&bytes);
        return Ok(key);
    }

    let key = generate_device_key();
    let hex_key = hex::encode(key);

    #[cfg(unix)]
    {
        use std::io::Write;
        use std::os::unix::fs::OpenOptionsExt;
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(path)
            .with_context(|| format!("create fallback key file {}", path.display()))?;
        file.write_all(hex_key.as_bytes())
            .with_context(|| format!("write fallback key file {}", path.display()))?;
    }
    #[cfg(not(unix))]
    {
        std::fs::write(path, &hex_key)
            .with_context(|| format!("write fallback key file {}", path.display()))?;
    }

    info!("generated new device-bound key and stored in fallback file");
    Ok(key)
}

/// Derive the SQLite encryption key from the device-bound key using HKDF-SHA256.
pub fn derive_sqlite_key(device_key: &[u8; 32]) -> [u8; 32] {
    use hkdf::Hkdf;
    use sha2::Sha256;

    let hkdf = Hkdf::<Sha256>::new(Some(b"grc-agent-sqlite-v1"), device_key);
    let mut okm = [0u8; 32];
    // This expansion should never fail with these parameters.
    hkdf.expand(b"offline-store-aes256gcm", &mut okm)
        .expect("HKDF expand failed");
    okm
}

// ── Per-Agent HMAC Secret (CQ-004 / AE-001) ─────────────────────────────────

const HMAC_SECRET_SERVICE: &str = "grc-shield-agent";
const HMAC_SECRET_ACCOUNT: &str = "hmac-secret";

fn store_hmac_secret_in_keyring(secret: &str) -> Result<()> {
    let entry = keyring::Entry::new(HMAC_SECRET_SERVICE, HMAC_SECRET_ACCOUNT)
        .map_err(|e| anyhow::anyhow!("keyring entry creation failed: {e}"))?;
    entry.set_password(secret)
        .map_err(|e| anyhow::anyhow!("keyring set_password failed: {e}"))?;
    info!("stored hmac secret in platform keyring");
    Ok(())
}

fn get_hmac_secret_from_keyring() -> Result<Option<String>> {
    let entry = keyring::Entry::new(HMAC_SECRET_SERVICE, HMAC_SECRET_ACCOUNT)
        .map_err(|e| anyhow::anyhow!("keyring entry creation failed: {e}"))?;
    match entry.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => bail!("keyring get_password failed: {e}"),
    }
}

fn hmac_secret_fallback_path() -> std::path::PathBuf {
    #[cfg(target_os = "windows")]
    {
        let pd = std::env::var("PROGRAMDATA").unwrap_or_else(|_| "C:\\ProgramData".into());
        std::path::PathBuf::from(format!("{pd}\\GRCAgent\\.hmac_secret"))
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::path::PathBuf::from("/var/lib/grc-agent/.hmac_secret")
    }
}

fn store_hmac_secret_in_file(secret: &str) -> Result<()> {
    let path = hmac_secret_fallback_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("create hmac secret dir {}", parent.display()))?;
    }
    #[cfg(unix)]
    {
        use std::io::Write;
        use std::os::unix::fs::OpenOptionsExt;
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(&path)
            .with_context(|| format!("create hmac secret file {}", path.display()))?;
        file.write_all(secret.as_bytes())
            .with_context(|| format!("write hmac secret file {}", path.display()))?;
    }
    #[cfg(not(unix))]
    {
        std::fs::write(&path, secret)
            .with_context(|| format!("write hmac secret file {}", path.display()))?;
    }
    info!("stored hmac secret in fallback file");
    Ok(())
}

fn get_hmac_secret_from_file() -> Result<Option<String>> {
    let path = hmac_secret_fallback_path();
    if !path.exists() {
        return Ok(None);
    }
    let secret = std::fs::read_to_string(&path)
        .with_context(|| format!("read hmac secret file {}", path.display()))?;
    Ok(Some(secret.trim().to_string()))
}

/// Store the HMAC secret — tries keyring first, falls back to file.
pub fn store_hmac_secret(secret: &str) -> Result<()> {
    match store_hmac_secret_in_keyring(secret) {
        Ok(()) => return Ok(()),
        Err(e) => warn!("keyring store failed ({}), trying fallback file storage", e),
    }
    store_hmac_secret_in_file(secret)
}

/// Retrieve the stored HMAC secret — tries keyring first, falls back to file.
pub fn get_hmac_secret() -> Result<Option<String>> {
    match get_hmac_secret_from_keyring() {
        Ok(Some(secret)) => return Ok(Some(secret)),
        Ok(None) => {}
        Err(e) => warn!("keyring retrieve failed ({}), trying fallback file storage", e),
    }
    get_hmac_secret_from_file()
}

// ── Refresh Token Storage (SEC-002) ─────────────────────────────────────────

const REFRESH_TOKEN_SERVICE: &str = "grc-shield-agent";
const REFRESH_TOKEN_ACCOUNT: &str = "refresh-token";

fn store_refresh_token_in_keyring(token: &str) -> Result<()> {
    let entry = keyring::Entry::new(REFRESH_TOKEN_SERVICE, REFRESH_TOKEN_ACCOUNT)
        .map_err(|e| anyhow::anyhow!("keyring entry creation failed: {e}"))?;
    entry.set_password(token)
        .map_err(|e| anyhow::anyhow!("keyring set_password failed: {e}"))?;
    info!("stored refresh token in platform keyring");
    Ok(())
}

fn get_refresh_token_from_keyring() -> Result<Option<String>> {
    let entry = keyring::Entry::new(REFRESH_TOKEN_SERVICE, REFRESH_TOKEN_ACCOUNT)
        .map_err(|e| anyhow::anyhow!("keyring entry creation failed: {e}"))?;
    match entry.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => bail!("keyring get_password failed: {e}"),
    }
}

fn refresh_token_fallback_path() -> std::path::PathBuf {
    #[cfg(target_os = "windows")]
    {
        let pd = std::env::var("PROGRAMDATA").unwrap_or_else(|_| "C:\\ProgramData".into());
        std::path::PathBuf::from(format!("{pd}\\GRCAgent\\.refresh_token"))
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::path::PathBuf::from("/var/lib/grc-agent/.refresh_token")
    }
}

fn store_refresh_token_in_file(token: &str) -> Result<()> {
    let path = refresh_token_fallback_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("create refresh token dir {}", parent.display()))?;
    }
    #[cfg(unix)]
    {
        use std::io::Write;
        use std::os::unix::fs::OpenOptionsExt;
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(&path)
            .with_context(|| format!("create refresh token file {}", path.display()))?;
        file.write_all(token.as_bytes())
            .with_context(|| format!("write refresh token file {}", path.display()))?;
    }
    #[cfg(not(unix))]
    {
        std::fs::write(&path, token)
            .with_context(|| format!("write refresh token file {}", path.display()))?;
    }
    info!("stored refresh token in fallback file");
    Ok(())
}

fn get_refresh_token_from_file() -> Result<Option<String>> {
    let path = refresh_token_fallback_path();
    if !path.exists() {
        return Ok(None);
    }
    let token = std::fs::read_to_string(&path)
        .with_context(|| format!("read refresh token file {}", path.display()))?;
    Ok(Some(token.trim().to_string()))
}

/// Store the refresh token — tries keyring first, falls back to file.
pub fn store_refresh_token(token: &str) -> Result<()> {
    match store_refresh_token_in_keyring(token) {
        Ok(()) => return Ok(()),
        Err(e) => warn!("keyring store failed ({}), trying fallback file storage", e),
    }
    store_refresh_token_in_file(token)
}

/// Retrieve the stored refresh token — tries keyring first, falls back to file.
pub fn get_refresh_token() -> Result<Option<String>> {
    match get_refresh_token_from_keyring() {
        Ok(Some(token)) => return Ok(Some(token)),
        Ok(None) => {}
        Err(e) => warn!("keyring retrieve failed ({}), trying fallback file storage", e),
    }
    get_refresh_token_from_file()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_device_key_generation_and_retrieval() {
        let tmpdir = std::env::temp_dir().join(format!("grc-agent-test-{}", std::process::id()));
        std::fs::create_dir_all(&tmpdir).unwrap();
        let tmpkey = tmpdir.join(".device_key");

        // First call should generate a new key
        let key1 = get_or_create_device_key_from_file(&tmpkey).unwrap();
        assert_eq!(key1.len(), 32);

        // Second call should retrieve the same key
        let key2 = get_or_create_device_key_from_file(&tmpkey).unwrap();
        assert_eq!(key1, key2);

        // Verify HKDF derivation is deterministic
        let derived1 = derive_sqlite_key(&key1);
        let derived2 = derive_sqlite_key(&key1);
        assert_eq!(derived1, derived2);

        // Verify different device keys produce different derived keys
        let key3 = generate_device_key();
        let derived3 = derive_sqlite_key(&key3);
        assert_ne!(derived1, derived3);

        // Verify the fallback file has restrictive permissions (Unix only)
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let meta = std::fs::metadata(&tmpkey).unwrap();
            let mode = meta.permissions().mode() & 0o777;
            assert_eq!(mode, 0o600, "fallback key file must have 0o600 permissions");
        }

        std::fs::remove_dir_all(&tmpdir).unwrap();
    }
}
