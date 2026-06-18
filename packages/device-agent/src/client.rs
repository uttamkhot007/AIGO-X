use anyhow::{bail, Context, Result};
use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tracing::{debug, info, warn};

use crate::config::Config;

// ── SEC-001: mTLS client certificate support ─────────────────────────────────

/// Placeholder for a custom server certificate verifier.
/// Currently skipped via `danger_accept_invalid_certs` while the mTLS rollout
/// is in progress.  After the grace period this will be replaced with a
/// `rustls::client::ServerCertVerifier` that pins the tenant CA.
pub struct ClientCertVerifier;

impl ClientCertVerifier {
    pub fn new() -> Self {
        Self
    }
}

// ── Request / response types ───────────────────────────────────────────────────

#[derive(Debug, Serialize)]
struct RegisterRequest {
    agent_id: Option<String>,
    name: String,
    version: String,
    platform: String,
    platform_version: Option<String>,
    architecture: String,
    hostname: String,
    ip_addresses: Vec<String>,
    mac_addresses: Vec<String>,
    capabilities: Vec<String>,
    /// Azure AD device object ID — populated when GRC_AZURE_DEVICE_ID is set.
    azure_ad_device_id: Option<String>,
    /// Azure AD tenant ID — populated when GRC_AZURE_TENANT_ID is set.
    azure_ad_tenant_id: Option<String>,
    /// SEC-003: Ed25519 public key for per-instance payload signing.
    ed25519_public_key: Option<String>,
    metadata: serde_json::Value,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RegisterResponse {
    pub agent_id: String,
    pub server_url: Option<String>,
    pub heartbeat_interval: Option<u64>,
    pub collection_interval: Option<u64>,
    #[serde(default)]
    pub commands: Vec<serde_json::Value>,
    pub hmac_secret: Option<String>,
    /// SEC-001: PEM-encoded mTLS client certificate
    #[serde(default)]
    pub client_certificate: Option<String>,
    /// SEC-001: PEM-encoded mTLS client private key
    #[serde(default)]
    pub client_private_key: Option<String>,
    /// SEC-002: JWT access token (15-minute expiry)
    #[serde(default)]
    pub access_token: Option<String>,
    /// SEC-002: Opaque refresh token (7-day expiry)
    #[serde(default)]
    pub refresh_token: Option<String>,
    /// SEC-002: Access token lifetime in seconds
    #[serde(default)]
    pub expires_in: Option<u64>,
}

#[derive(Debug, Serialize)]
struct CheckinRequest {
    agent_id: String,
    version: String,
    ip: Option<String>,
    /// SEC-003: Ed25519 signature of the canonical JSON body.
    ed25519_signature: Option<String>,
}

#[derive(Debug, Serialize)]
struct PushRequest {
    agent_id: String,
    result_type: String,
    payload: serde_json::Value,
    checks_run: u32,
    checks_passed: u32,
    checks_failed: u32,
    score: Option<u32>,
    payload_signature: Option<String>,
    /// SEC-003: Ed25519 signature of the canonical JSON payload.
    ed25519_signature: Option<String>,
}

#[derive(Debug, Serialize)]
struct RefreshRequest {
    refresh_token: String,
}

#[derive(Debug, Deserialize)]
struct RefreshResponse {
    access_token: String,
    refresh_token: String,
    expires_in: u64,
}

// ── TokenState ─────────────────────────────────────────────────────────────────

#[derive(Clone)]
struct TokenState {
    access_token: String,
    refresh_token: String,
    token_expires_at: Option<Instant>,
}

impl Default for TokenState {
    fn default() -> Self {
        Self {
            access_token: String::new(),
            refresh_token: String::new(),
            token_expires_at: None,
        }
    }
}

// ── AgentClient ────────────────────────────────────────────────────────────────

#[derive(Clone)]
pub struct AgentClient {
    http: Client,
    base_url: String,
    /// Bootstrap token from config/env — legacy static token or tenant provisioning token.
    bootstrap_token: String,
    cfg_name: String,
    cfg_version: String,
    /// Exponential-backoff settings from config.
    max_push_retries: u32,
    backoff_base_secs: u64,
    /// Cached Azure AD identity fields (read once from config/env at construction).
    azure_ad_device_id: Option<String>,
    azure_ad_tenant_id: Option<String>,
    /// Per-agent HMAC secret for payload integrity (CQ-004 / AE-001).
    hmac_secret: Arc<Mutex<Option<String>>>,
    /// SEC-002: mutable token state (access + refresh + expiry).
    token_state: Arc<Mutex<TokenState>>,
    /// SEC-003: per-instance Ed25519 signing keypair.
    signing_keypair: Arc<Mutex<Option<crate::signing::AgentKeypair>>>,
}

/// Map Rust std::env::consts values to the platform/arch strings expected by the server.
fn normalize_platform_arch(os: &str, arch: &str) -> (String, String) {
    let platform = match os {
        "macos" => "darwin",
        "windows" => "windows",
        "linux" => "linux",
        other => other,
    };
    let arch = match arch {
        "aarch64" => "arm64",
        "x86_64" => "amd64",
        other => other,
    };
    (platform.to_string(), arch.to_string())
}

impl AgentClient {
    /// Construct a client with an already-resolved `token`.
    /// The `token` is the value returned by `SecretsBackend::get_agent_token`
    /// so it may originate from HashiCorp Vault (AppRole), an env var, or the
    /// config file — whichever backend is configured.
    pub fn new(cfg: &Config, token: String) -> Result<Self> {
        if token.is_empty() {
            bail!("agent token is empty — set registration.agent_token in config or GRC_SECRET_AGENT_TOKEN env var");
        }
        if cfg.registration.admin_panel_url.is_empty() {
            bail!("admin_panel_url is required in config (registration.admin_panel_url)");
        }

        let mut builder = Client::builder()
            .timeout(Duration::from_secs(30))
            .user_agent(format!("grc-agent/{}-jwt", cfg.agent.version));

        // SEC-001: Load mTLS client identity if paths are configured
        if let (Some(cert_path), Some(key_path)) = (&cfg.registration.agent_cert_pem, &cfg.registration.agent_key_pem) {
            let cert = std::fs::read_to_string(cert_path)
                .with_context(|| format!("reading client cert {cert_path}"))?;
            let key = std::fs::read_to_string(key_path)
                .with_context(|| format!("reading client key {key_path}"))?;
            let identity = reqwest::Identity::from_pem(format!("{cert}{key}").as_bytes())
                .context("build tls identity from pem")?;
            builder = builder.identity(identity);
        }

        // SEC-001: Server certificate verification is mandatory.
        // Custom CA certs can be loaded via GRC_CA_CERT_PATH env var.
        if let Ok(ca_path) = std::env::var("GRC_CA_CERT_PATH") {
            let ca_cert = std::fs::read_to_string(&ca_path)
                .with_context(|| format!("reading CA cert {ca_path}"))?;
            let cert = reqwest::Certificate::from_pem(ca_cert.as_bytes())
                .context("parse CA cert")?;
            builder = builder.add_root_certificate(cert);
        }

        let http = builder.build().context("build http client")?;

        let hmac_secret = crate::secrets::get_hmac_secret().ok().flatten();

        // SEC-002: try to load an existing refresh token from secure storage.
        let refresh_token = crate::secrets::get_refresh_token().ok().flatten().unwrap_or_default();
        let token_state = TokenState {
            refresh_token,
            ..TokenState::default()
        };

        // SEC-003: load or generate Ed25519 signing keypair
        let signing_keypair = {
            let key_path = cfg.registration.ed25519_private_key_path.clone()
                .or_else(|| {
                    dirs::data_local_dir()
                        .map(|d| d.join("grc-agent").join("ed25519.key").to_string_lossy().to_string())
                });
            match key_path {
                Some(path) => match crate::signing::AgentKeypair::load_or_generate(&path) {
                    Ok(kp) => {
                        info!(path, pub_key = %kp.public_key_hex(), "[SEC-003] Ed25519 keypair ready");
                        Some(kp)
                    }
                    Err(e) => {
                        warn!(err = %e, "[SEC-003] failed to load/generate Ed25519 keypair — payload signing disabled");
                        None
                    }
                },
                None => {
                    warn!("[SEC-003] no data directory found for Ed25519 key — payload signing disabled");
                    None
                }
            }
        };

        Ok(Self {
            http,
            base_url: cfg.registration.admin_panel_url.trim_end_matches('/').to_string(),
            bootstrap_token: token,
            cfg_name: cfg.agent.name.clone(),
            cfg_version: cfg.agent.version.clone(),
            max_push_retries: cfg.healing.max_push_retries,
            backoff_base_secs: cfg.healing.backoff_base_secs,
            azure_ad_device_id: cfg.azure_ad.device_id.clone(),
            azure_ad_tenant_id: cfg.azure_ad.tenant_id.clone(),
            hmac_secret: Arc::new(Mutex::new(hmac_secret)),
            token_state: Arc::new(Mutex::new(token_state)),
            signing_keypair: Arc::new(Mutex::new(signing_keypair)),
        })
    }

    /// Build the Authorization header from the current access token, falling back
    /// to the bootstrap token when no JWT state is available (legacy transition).
    fn auth_header(&self) -> String {
        let guard = self.token_state.lock().unwrap();
        let token = if !guard.access_token.is_empty() {
            &guard.access_token
        } else {
            &self.bootstrap_token
        };
        format!("Bearer {}", token)
    }

    /// Set the HMAC secret (e.g. after registration or rotation).
    pub fn set_hmac_secret(&self, secret: String) {
        if let Ok(mut guard) = self.hmac_secret.lock() {
            *guard = Some(secret);
        }
    }

    /// Compute HMAC-SHA256 over a canonical JSON representation of the payload.
    fn compute_payload_signature(&self, payload: &serde_json::Value) -> Option<String> {
        let guard = self.hmac_secret.lock().ok()?;
        let secret = guard.as_ref().cloned()?;
        let canonical = canonical_json(payload);
        let sig = compute_hmac(&secret, &canonical);
        debug!(secret_prefix = %secret.get(..8).unwrap_or(""), "computed payload signature");
        Some(sig)
    }

    /// SEC-003: Compute Ed25519 signature over a canonical JSON representation.
    fn compute_ed25519_signature(&self, payload: &serde_json::Value) -> Option<String> {
        let guard = self.signing_keypair.lock().ok()?;
        let kp = guard.as_ref()?;
        let canonical = canonical_json(payload);
        let sig = kp.sign(canonical.as_bytes());
        debug!(pub_key_prefix = %kp.public_key_hex().get(..16).unwrap_or(""), "computed Ed25519 payload signature");
        Some(sig)
    }

    // ── SEC-002 token refresh ────────────────────────────────────────────────

    /// Ensure the access token is valid before making an authenticated request.
    /// If expired (or missing), exchanges the refresh token for a new pair.
    async fn ensure_valid_token(&self) -> Result<()> {
        let needs_refresh = {
            let guard = self.token_state.lock().unwrap();
            if guard.access_token.is_empty() {
                !guard.refresh_token.is_empty()
            } else if let Some(expires_at) = guard.token_expires_at {
                Instant::now() + Duration::from_secs(60) >= expires_at
            } else {
                false
            }
        };

        if needs_refresh {
            self.do_refresh_token().await?;
        }
        Ok(())
    }

    /// Call the server refresh endpoint with exponential backoff.
    async fn do_refresh_token(&self) -> Result<()> {
        let refresh_token = {
            let guard = self.token_state.lock().unwrap();
            if guard.refresh_token.is_empty() {
                bail!("no refresh token available");
            }
            guard.refresh_token.clone()
        };

        let url = format!("{}/api/agent/token/refresh", self.base_url);
        let body = RefreshRequest { refresh_token };
        let mut last_err: Option<anyhow::Error> = None;

        for attempt in 0..=self.max_push_retries {
            if attempt > 0 {
                let wait = Duration::from_secs(self.backoff_base_secs * 2u64.pow(attempt - 1));
                warn!(attempt, wait_secs = wait.as_secs(), "token refresh retry with backoff");
                tokio::time::sleep(wait).await;
            }

            let result = self.http
                .post(&url)
                .header("Authorization", format!("Bearer {}", self.bootstrap_token))
                .json(&body)
                .send()
                .await;

            match result {
                Err(e) => {
                    warn!(attempt, err = %e, "token refresh network error");
                    last_err = Some(e.into());
                    continue;
                }
                Ok(resp) => {
                    let status = resp.status();
                    if status.is_success() {
                        let data: RefreshResponse = resp.json().await.context("decode refresh response")?;
                        let expires_at = Instant::now() + Duration::from_secs(data.expires_in);
                        {
                            let mut guard = self.token_state.lock().unwrap();
                            guard.access_token = data.access_token;
                            guard.refresh_token = data.refresh_token.clone();
                            guard.token_expires_at = Some(expires_at);
                        }
                        if let Err(e) = crate::secrets::store_refresh_token(&data.refresh_token) {
                            warn!(err = %e, "failed to persist rotated refresh token");
                        }
                        info!("access token refreshed successfully");
                        return Ok(());
                    }
                    let body_text = resp.text().await.unwrap_or_default();
                    if status.is_client_error() {
                        bail!("token refresh rejected: {status}: {body_text}");
                    }
                    warn!(attempt, status = %status, "token refresh server error — will retry");
                    last_err = Some(anyhow::anyhow!("token refresh: server returned {status}: {body_text}"));
                }
            }
        }

        Err(last_err.unwrap_or_else(|| anyhow::anyhow!("token refresh: all retries exhausted")))
    }

    /// Detect a 401 with `X-Token-Expired` header and attempt a single refresh + retry.
    async fn retry_with_refresh<F, Fut>(
        &self,
        agent_id: &str,
        make_request: F,
    ) -> Result<reqwest::Response>
    where
        F: Fn() -> Fut,
        Fut: std::future::Future<Output = Result<reqwest::Response, reqwest::Error>>,
    {
        let resp = make_request().await.context("request failed")?;
        let status = resp.status();
        if status == StatusCode::UNAUTHORIZED {
            let expired = resp.headers().get("X-Token-Expired")
                .and_then(|v| v.to_str().ok())
                .map(|v| v.eq_ignore_ascii_case("true"))
                .unwrap_or(false);
            if expired {
                warn!(agent_id, "access token expired — refreshing");
                if let Err(e) = self.do_refresh_token().await {
                    warn!(agent_id, err = %e, "token refresh failed during retry");
                    // Return the original 401 response so caller can handle it
                    return Ok(resp);
                }
                // Retry the original request once with the new token
                let retry_resp = make_request().await.context("retry request failed")?;
                return Ok(retry_resp);
            }
        }
        Ok(resp)
    }

    // ── Registration ─────────────────────────────────────────────────────────

    /// Persist mTLS certificate and key to the local data directory.
    /// Returns the absolute paths to the cert and key files.
    fn persist_mtls_certs(&self, agent_id: &str, cert: &str, key: &str) -> Result<(String, String)> {
        let base = dirs::data_local_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("/tmp"))
            .join("grc-agent");
        std::fs::create_dir_all(&base).context("create grc-agent data dir")?;

        let cert_path = base.join(format!("{agent_id}.crt"));
        let key_path  = base.join(format!("{agent_id}.key"));

        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            let mut opts = std::fs::OpenOptions::new();
            opts.write(true).create(true).truncate(true).mode(0o600);
            opts.open(&cert_path)?.write_all(cert.as_bytes())?;
            opts.open(&key_path)?.write_all(key.as_bytes())?;
        }
        #[cfg(not(unix))]
        {
            std::fs::write(&cert_path, cert).context("write client cert")?;
            std::fs::write(&key_path, key).context("write client key")?;
            // Restrict ACLs to current user only on Windows
            let user = std::env::var("USERNAME").unwrap_or_else(|_| "CURRENT_USER".to_string());
            for (path, label) in [(&cert_path, "cert"), (&key_path, "key")] {
                match std::process::Command::new("icacls")
                    .arg(path)
                    .args(["/inheritance:r", "/grant:r", &format!("{}:(R)", user)])
                    .output()
                {
                    Ok(out) if out.status.success() => {
                        info!(path = %path.display(), "[SEC-001] Windows ACL restricted to owner on {}", label);
                    }
                    Ok(out) => {
                        let stderr = String::from_utf8_lossy(&out.stderr);
                        warn!(path = %path.display(), stderr = %stderr, "[SEC-001] icacls failed on {} — key file may be readable by other users", label);
                    }
                    Err(e) => {
                        warn!(path = %path.display(), err = %e, "[SEC-001] icacls command failed on {} — key file may be readable by other users", label);
                    }
                }
            }
        }

        let cert_path_str = cert_path.to_string_lossy().to_string();
        let key_path_str  = key_path.to_string_lossy().to_string();
        info!(cert_path = %cert_path_str, key_path = %key_path_str, "persisted mTLS client certificates");
        Ok((cert_path_str, key_path_str))
    }

    pub async fn register(&self) -> Result<RegisterResponse> {
        let hostname = hostname::get()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let platform     = std::env::consts::OS.to_string();
        let architecture = std::env::consts::ARCH.to_string();
        let ip_addresses = local_ip_addresses();
        let mac_addresses = local_mac_addresses();

        let mut capabilities = vec![
            "inventory".into(),
            "cis_checks".into(),
            "air_gap".into(),
            "threat_detection".into(),
            "hardening_assessment".into(),
            "compliance_scoring".into(),
            "automated_remediation".into(),
            "self_healing".into(),          // new v2.1: watchdog + recovery signals
            "adaptive_intervals".into(),    // new v2.1: score-driven collection cadence
            "delta_push".into(),            // new v2.1: hash-gated bandwidth reduction
        ];

        if self.azure_ad_device_id.is_some() {
            capabilities.push("azure_ad_identity".into());  // Task #913
        }

        // SEC-003: include Ed25519 public key in registration
        let ed25519_public_key = {
            let guard = self.signing_keypair.lock().unwrap();
            guard.as_ref().map(|kp| kp.public_key_hex())
        };

        let body = RegisterRequest {
            agent_id: None,
            name: self.cfg_name.clone(),
            version: self.cfg_version.clone(),
            platform: platform.clone(),
            platform_version: os_version(),
            architecture,
            hostname: hostname.clone(),
            ip_addresses,
            mac_addresses,
            capabilities,
            azure_ad_device_id: self.azure_ad_device_id.clone(),
            azure_ad_tenant_id: self.azure_ad_tenant_id.clone(),
            ed25519_public_key,
            metadata: serde_json::json!({ "agent_type": "rust", "agent_version": env!("CARGO_PKG_VERSION") }),
        };

        let url  = format!("{}/api/v1/agent/register", self.base_url);
        let resp = self.http
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.bootstrap_token))
            .json(&body)
            .send()
            .await
            .context("register request")?;

        let status = resp.status();
        if !status.is_success() {
            let body_text = resp.text().await.unwrap_or_default();
            bail!("register: server returned {status}: {body_text}");
        }

        let reg: RegisterResponse = resp.json().await.context("decode register response")?;

        // SEC-002: persist JWT tokens returned by the server
        if let (Some(access), Some(refresh), Some(expires_in)) =
            (&reg.access_token, &reg.refresh_token, reg.expires_in)
        {
            let expires_at = Instant::now() + Duration::from_secs(expires_in);
            {
                let mut guard = self.token_state.lock().unwrap();
                guard.access_token = access.clone();
                guard.refresh_token = refresh.clone();
                guard.token_expires_at = Some(expires_at);
            }
            if let Err(e) = crate::secrets::store_refresh_token(refresh) {
                warn!(err = %e, "failed to store refresh token after registration");
            }
            info!(agent_id = %reg.agent_id, "agent registered with JWT tokens");
        } else {
            info!(agent_id = %reg.agent_id, hostname = %hostname, "agent registered (legacy token mode)");
        }

        // SEC-001: Persist mTLS client certificates returned by server
        if let (Some(ref cert), Some(ref key)) = (reg.client_certificate.as_ref(), reg.client_private_key.as_ref()) {
            match self.persist_mtls_certs(&reg.agent_id, cert, key) {
                Ok((cert_path, key_path)) => {
                    info!(agent_id = %reg.agent_id, %cert_path, %key_path, "mTLS certificates persisted");
                }
                Err(e) => {
                    warn!(agent_id = %reg.agent_id, err = %e, "failed to persist mTLS certificates");
                }
            }
        }

        Ok(reg)
    }

    // ── Heartbeat / checkin (with retry) ─────────────────────────────────────

    pub async fn checkin(&self, agent_id: &str) -> Result<Vec<serde_json::Value>> {
        self.ensure_valid_token().await?;

        let mut body = CheckinRequest {
            agent_id: agent_id.to_string(),
            version: self.cfg_version.clone(),
            ip: local_ip_addresses().into_iter().next(),
            ed25519_signature: None,
        };

        // SEC-003: sign canonical JSON body with Ed25519
        body.ed25519_signature = self.compute_ed25519_signature(&serde_json::to_value(&body)?);

        let url = format!("{}/api/v1/agent/checkin", self.base_url);

        let max_retries = self.max_push_retries.min(2);  // checkin: max 2 retries
        let mut last_err: Option<anyhow::Error> = None;

        for attempt in 0..=max_retries {
            if attempt > 0 {
                let wait = Duration::from_secs(self.backoff_base_secs * 2u64.pow(attempt - 1));
                warn!(agent_id, attempt, wait_secs = wait.as_secs(), "checkin retry");
                tokio::time::sleep(wait).await;
            }

            let result = self.retry_with_refresh(agent_id, || async {
                let auth = self.auth_header();
                self.http
                    .post(&url)
                    .header("Authorization", auth)
                    .json(&body)
                    .send()
                    .await
            }).await;

            match result {
                Err(e) => { last_err = Some(e); continue; }
                Ok(resp) => {
                    let status = resp.status();
                    let body_text = resp.text().await.unwrap_or_default();
                    if status == StatusCode::OK {
                        // Server may rotate the HMAC secret during checkin
                        if let Ok(checkin_body) = serde_json::from_str::<CheckinResponse>(&body_text) {
                            if let Some(secret) = checkin_body.hmac_secret {
                                self.set_hmac_secret(secret.clone());
                                if let Err(e) = crate::secrets::store_hmac_secret(&secret) {
                                    warn!(err = %e, "failed to store rotated hmac secret");
                                }
                            }
                            info!(agent_id, "heartbeat accepted");
                            return Ok(checkin_body.pending_actions);
                        }
                        info!(agent_id, "heartbeat accepted (legacy response)");
                        return Ok(vec![]);
                    }
                    // 5xx → retry; 4xx → fail fast (bad token / unknown agent)
                    if status.is_client_error() {
                        bail!("checkin: server returned {status}: {body_text}");
                    }
                    last_err = Some(anyhow::anyhow!("checkin: server returned {status}: {body_text}"));
                }
            }
        }

        Err(last_err.unwrap_or_else(|| anyhow::anyhow!("checkin: all retries exhausted")))
    }

    /// Download the latest agent binary for the current platform.
    /// Returns the raw bytes of the binary on success.
    /// Platform/arch strings are normalized (e.g. macos→darwin, aarch64→arm64) for server compatibility.
    /// Uses auth_header() which falls back to bootstrap token (legacy/registration token).
    pub async fn download_update(&self) -> Result<Vec<u8>> {
        let (bytes, _sig) = self.download_update_with_signature().await?;
        Ok(bytes)
    }

    /// Download the latest agent binary AND its Ed25519 signature.
    /// Returns (binary_bytes, optional_signature_bytes).
    pub async fn download_update_with_signature(&self) -> Result<(Vec<u8>, Option<Vec<u8>>)> {
        self.ensure_valid_token().await?;
        let (platform, arch) = normalize_platform_arch(
            std::env::consts::OS,
            std::env::consts::ARCH,
        );
        let auth = self.auth_header();

        // Download binary
        let binary_url = format!("{}/api/v1/agent/download/{}/{}", self.base_url, platform, arch);
        let binary_resp = self.http
            .get(&binary_url)
            .header("Authorization", &auth)
            .send()
            .await
            .context("download update request failed")?;
        let status = binary_resp.status();
        if !status.is_success() {
            let text = binary_resp.text().await.unwrap_or_default();
            bail!("download update failed: {status} — {text}");
        }
        let binary_bytes = binary_resp.bytes().await.context("read update bytes")?;
        if binary_bytes.is_empty() {
            bail!("downloaded update binary is empty");
        }

        // Attempt to download signature (best-effort — may not exist yet)
        let sig_url = format!("{}/api/v1/agent/download/{}/{}/sig", self.base_url, platform, arch);
        let sig_resp = self.http
            .get(&sig_url)
            .header("Authorization", &auth)
            .send()
            .await;

        let signature = match sig_resp {
            Ok(r) if r.status().is_success() => {
                match r.bytes().await {
                    Ok(b) if !b.is_empty() => {
                        info!(len = b.len(), "downloaded update signature");
                        Some(b.to_vec())
                    }
                    _ => None,
                }
            }
            _ => None,
        };

        Ok((binary_bytes.to_vec(), signature))
    }

    // ── Compliance push (with retry + exponential backoff) ────────────────────

    /// Push a compliance payload to the server.
    /// Retries up to `cfg.healing.max_push_retries` times with exponential backoff
    /// before returning an error (the caller will buffer the payload locally).
    pub async fn push(
        &self,
        agent_id: &str,
        payload: serde_json::Value,
        checks_passed: u32,
        checks_failed: u32,
        score: u32,
    ) -> Result<()> {
        self.ensure_valid_token().await?;

        let checks_run = checks_passed + checks_failed;
        let payload_signature = self.compute_payload_signature(&payload);
        let ed25519_signature = self.compute_ed25519_signature(&payload);
        let body = PushRequest {
            agent_id: agent_id.to_string(),
            result_type: "compliance".into(),
            payload,
            checks_run,
            checks_passed,
            checks_failed,
            score: Some(score),
            payload_signature,
            ed25519_signature,
        };

        let url = format!("{}/api/v1/agent/push", self.base_url);
        let mut last_err: Option<anyhow::Error> = None;

        for attempt in 0..=self.max_push_retries {
            if attempt > 0 {
                let wait = Duration::from_secs(self.backoff_base_secs * 2u64.pow(attempt - 1));
                warn!(agent_id, attempt, wait_secs = wait.as_secs(), "push retry with backoff");
                tokio::time::sleep(wait).await;
            }

            let result = self.retry_with_refresh(agent_id, || async {
                let auth = self.auth_header();
                self.http
                    .post(&url)
                    .header("Authorization", auth)
                    .json(&body)
                    .send()
                    .await
            }).await;

            match result {
                Err(e) => {
                    warn!(agent_id, attempt, err = %e, "push network error");
                    last_err = Some(e);
                    continue;
                }
                Ok(resp) => {
                    let status = resp.status();
                    if status.is_success() {
                        info!(agent_id, score, checks_run, "push accepted");
                        return Ok(());
                    }
                    let body_text = resp.text().await.unwrap_or_default();
                    if status.is_client_error() {
                        // 4xx: don't retry (e.g. 401 Unauthorised, 400 Bad payload)
                        bail!("push: server returned {status}: {body_text}");
                    }
                    warn!(agent_id, attempt, status = %status, "push server error — will retry");
                    last_err = Some(anyhow::anyhow!("push: server returned {status}: {body_text}"));
                }
            }
        }

        Err(last_err.unwrap_or_else(|| anyhow::anyhow!("push: all retries exhausted")))
    }

    /// Push a remediation-validation payload to the server (AE-005).
    pub async fn push_validation(
        &self,
        agent_id: &str,
        payload: serde_json::Value,
    ) -> Result<()> {
        self.ensure_valid_token().await?;

        let payload_signature = self.compute_payload_signature(&payload);
        let ed25519_signature = self.compute_ed25519_signature(&payload);
        let body = PushRequest {
            agent_id: agent_id.to_string(),
            result_type: "validation".into(),
            payload,
            checks_run: 0,
            checks_passed: 0,
            checks_failed: 0,
            score: None,
            payload_signature,
            ed25519_signature,
        };

        let url = format!("{}/api/v1/agent/push", self.base_url);
        let mut last_err: Option<anyhow::Error> = None;

        for attempt in 0..=self.max_push_retries {
            if attempt > 0 {
                let wait = Duration::from_secs(self.backoff_base_secs * 2u64.pow(attempt - 1));
                warn!(agent_id, attempt, wait_secs = wait.as_secs(), "validation push retry with backoff");
                tokio::time::sleep(wait).await;
            }

            let result = self.retry_with_refresh(agent_id, || async {
                let auth = self.auth_header();
                self.http
                    .post(&url)
                    .header("Authorization", auth)
                    .json(&body)
                    .send()
                    .await
            }).await;

            match result {
                Err(e) => {
                    warn!(agent_id, attempt, err = %e, "validation push network error");
                    last_err = Some(e);
                    continue;
                }
                Ok(resp) => {
                    let status = resp.status();
                    if status.is_success() {
                        info!(agent_id, "validation push accepted");
                        return Ok(());
                    }
                    let body_text = resp.text().await.unwrap_or_default();
                    if status.is_client_error() {
                        bail!("validation push: server returned {status}: {body_text}");
                    }
                    warn!(agent_id, attempt, status = %status, "validation push server error — will retry");
                    last_err = Some(anyhow::anyhow!("validation push: server returned {status}: {body_text}"));
                }
            }
        }

        Err(last_err.unwrap_or_else(|| anyhow::anyhow!("validation push: all retries exhausted")))
    }
}

// ── Checkin response (server may rotate HMAC secret) ─────────────────────────

#[derive(Debug, Deserialize)]
struct CheckinResponse {
    #[serde(default)]
    pub hmac_secret: Option<String>,
    #[serde(default, rename = "pendingActions")]
    pub pending_actions: Vec<serde_json::Value>,
}

// ── HMAC helpers (CQ-004 / AE-001) ────────────────────────────────────────────

/// Recursively sort JSON object keys so serialization is deterministic.
fn canonical_json(value: &serde_json::Value) -> String {
    fn sort_keys(v: &serde_json::Value) -> serde_json::Value {
        match v {
            serde_json::Value::Object(map) => {
                let mut sorted = serde_json::Map::new();
                let mut keys: Vec<_> = map.keys().collect();
                keys.sort();
                for k in keys {
                    sorted.insert(k.clone(), sort_keys(&map[k]));
                }
                serde_json::Value::Object(sorted)
            }
            serde_json::Value::Array(arr) => {
                serde_json::Value::Array(arr.iter().map(sort_keys).collect())
            }
            other => other.clone(),
        }
    }
    serde_json::to_string(&sort_keys(value)).unwrap_or_default()
}

fn compute_hmac(secret: &str, message: &str) -> String {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;
    type HmacSha256 = Hmac<Sha256>;

    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
        .expect("HMAC can take key of any size");
    mac.update(message.as_bytes());
    let result = mac.finalize();
    hex::encode(result.into_bytes())
}

// ── Utilities ──────────────────────────────────────────────────────────────────

fn local_ip_addresses() -> Vec<String> {
    let mut ips = vec![];
    for target in &["8.8.8.8:80", "1.1.1.1:80"] {
        if let Ok(sock) = std::net::UdpSocket::bind("0.0.0.0:0") {
            if sock.connect(target).is_ok() {
                if let Ok(addr) = sock.local_addr() {
                    let ip = addr.ip().to_string();
                    if !ip.starts_with("127.") && !ip.starts_with("::1") && !ips.contains(&ip) {
                        ips.push(ip);
                    }
                }
            }
        }
    }
    ips
}

fn local_mac_addresses() -> Vec<String> {
    let mut macs = vec![];
    let networks = sysinfo::Networks::new_with_refreshed_list();
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

fn os_version() -> Option<String> {
    use sysinfo::System;
    let version = System::os_version();
    if version.as_deref().map(|s| s.is_empty()).unwrap_or(true) {
        None
    } else {
        version
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_canonical_json_deterministic() {
        let a = serde_json::json!({"z": 1, "a": 2, "b": {"d": 3, "c": 4}});
        let b = serde_json::json!({"a": 2, "b": {"c": 4, "d": 3}, "z": 1});
        assert_eq!(canonical_json(&a), canonical_json(&b));
    }

    #[test]
    fn test_hmac_computation() {
        let sig = compute_hmac("secret", "hello");
        assert_eq!(sig.len(), 64); // hex-encoded SHA-256
    }

    #[test]
    fn test_token_state_default() {
        let ts = TokenState::default();
        assert!(ts.access_token.is_empty());
        assert!(ts.refresh_token.is_empty());
        assert!(ts.token_expires_at.is_none());
    }

    #[test]
    fn test_persist_mtls_certs() {
        let tmp = std::env::temp_dir().join(format!("grc-test-{}", std::process::id()));
        std::env::set_var("GRC_AGENT_DATA_DIR", tmp.to_str().unwrap());

        let client = AgentClient {
            http: Client::new(),
            base_url: "https://example.com".into(),
            bootstrap_token: "test".into(),
            cfg_name: "test-agent".into(),
            cfg_version: "1.0.0".into(),
            max_push_retries: 3,
            backoff_base_secs: 2,
            azure_ad_device_id: None,
            azure_ad_tenant_id: None,
            hmac_secret: Arc::new(Mutex::new(None)),
            token_state: Arc::new(Mutex::new(TokenState::default())),
            signing_keypair: Arc::new(Mutex::new(None)),
        };

        let agent_id = "test-agent-42";
        let cert = "-----BEGIN CERTIFICATE-----\nFAKECERT\n-----END CERTIFICATE-----\n";
        let key = "-----BEGIN PRIVATE KEY-----\nFAKEKEY\n-----END PRIVATE KEY-----\n";

        let (cp, kp) = client.persist_mtls_certs(agent_id, cert, key).unwrap();
        assert!(std::path::Path::new(&cp).exists());
        assert!(std::path::Path::new(&kp).exists());
        assert_eq!(std::fs::read_to_string(&cp).unwrap(), cert);
        assert_eq!(std::fs::read_to_string(&kp).unwrap(), key);

        // Cleanup
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
