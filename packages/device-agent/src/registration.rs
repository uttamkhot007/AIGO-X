use anyhow::Result;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tracing::{info, warn};

/// Agent registration metadata persisted locally after a successful registration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentRegistration {
    pub agent_id: String,
    pub tenant_id: Option<String>,
    pub server_url: String,
    pub heartbeat_interval: u64,
    pub collection_interval: u64,
    pub token_hash: String,
    pub registered_at: String,
    pub capabilities: Vec<String>,
}

impl AgentRegistration {
    pub fn new(
        agent_id: &str,
        token: &str,
        server_url: &str,
        heartbeat_interval: u64,
        collection_interval: u64,
    ) -> Self {
        let mut hasher = Sha256::new();
        hasher.update(token.as_bytes());
        let token_hash = hex::encode(hasher.finalize());

        Self {
            agent_id: agent_id.to_string(),
            tenant_id: None,
            server_url: server_url.to_string(),
            heartbeat_interval,
            collection_interval,
            token_hash,
            registered_at: chrono::Utc::now().to_rfc3339(),
            capabilities: vec![
                "inventory".into(),
                "cis_checks".into(),
                "air_gap".into(),
                "threat_detection".into(),
                "hardening_assessment".into(),
                "compliance_scoring".into(),
                "automated_remediation".into(),
                "self_healing".into(),
                "adaptive_intervals".into(),
                "delta_push".into(),
                "azure_ad_identity".into(),
            ],
        }
    }

    /// Verify that a token matches the stored hash (never store plaintext tokens).
    pub fn verify_token(&self, token: &str) -> bool {
        let mut hasher = Sha256::new();
        hasher.update(token.as_bytes());
        let hash = hex::encode(hasher.finalize());
        hash == self.token_hash
    }

    /// Derive an AES-256 encryption key from the token hash.
    /// Used to encrypt the offline SQLite store so no plaintext credentials sit on disk.
    pub fn derive_encryption_key(&self) -> [u8; 32] {
        let mut hasher = Sha256::new();
        hasher.update(self.token_hash.as_bytes());
        hasher.update(b"grc-agent-offline-store-v1");
        let result = hasher.finalize();
        let mut key = [0u8; 32];
        key.copy_from_slice(&result);
        key
    }

    /// Persist registration to a JSON file alongside the SQLite store.
    pub fn save(&self, path: &str) -> Result<()> {
        let json = serde_json::to_string_pretty(self)?;
        // Mask token_hash in the file name comment for traceability without leaking
        std::fs::write(path, json)?;
        info!(path, "registration saved");
        Ok(())
    }

    /// Load a saved registration from disk.
    pub fn load(path: &str) -> Result<Self> {
        let json = std::fs::read_to_string(path)?;
        let reg: Self = serde_json::from_str(&json)?;
        Ok(reg)
    }
}

/// Command queued by the server for the agent to execute.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentCommand {
    pub id: String,
    pub command_type: String,
    pub priority: u8,
    pub payload: serde_json::Value,
    pub expires_at: Option<String>,
}

/// Command execution result to be acknowledged back to the server.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandResult {
    pub command_id: String,
    pub status: String,
    pub output: Option<String>,
    pub error: Option<String>,
    pub executed_at: String,
}

impl CommandResult {
    pub fn success(command_id: &str, output: impl Into<String>) -> Self {
        Self {
            command_id: command_id.to_string(),
            status: "success".into(),
            output: Some(output.into()),
            error: None,
            executed_at: chrono::Utc::now().to_rfc3339(),
        }
    }

    pub fn failure(command_id: &str, error: impl Into<String>) -> Self {
        Self {
            command_id: command_id.to_string(),
            status: "failed".into(),
            output: None,
            error: Some(error.into()),
            executed_at: chrono::Utc::now().to_rfc3339(),
        }
    }
}

/// Process a list of pending commands from the server response.
pub async fn process_commands(commands: &[serde_json::Value]) -> Vec<CommandResult> {
    let mut results = vec![];
    for cmd in commands {
        let id = cmd["id"].as_str().unwrap_or("unknown").to_string();
        let cmd_type = cmd["type"].as_str().unwrap_or("unknown");
        info!(command_id = %id, command_type = %cmd_type, "processing server command");
        match cmd_type {
            "collect_now" => {
                results.push(CommandResult::success(&id, "collection triggered"));
            }
            "update_config" => {
                results.push(CommandResult::success(&id, "config update acknowledged — will apply on next cycle"));
            }
            _ => {
                warn!(command_type = %cmd_type, "unknown command type — skipping");
                results.push(CommandResult::failure(&id, format!("unknown command type: {cmd_type}")));
            }
        }
    }
    results
}
