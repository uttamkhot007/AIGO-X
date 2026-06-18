use thiserror::Error;

#[derive(Debug, Error)]
pub enum AgentError {
    #[error("configuration error: {0}")]
    Config(String),

    #[error("registration failed: {0}")]
    Registration(String),

    #[error("heartbeat failed: {0}")]
    Heartbeat(String),

    #[error("push failed: {0}")]
    Push(String),

    #[error("offline store error: {0}")]
    Store(String),

    #[error("collection error: {0}")]
    Collection(String),

    #[error("vault error: {0}")]
    Vault(String),

    #[error("encryption error: {0}")]
    Encryption(String),

    #[error("http error: {status} — {body}")]
    Http { status: u16, body: String },

    #[error(transparent)]
    Other(#[from] anyhow::Error),
}

pub type Result<T> = std::result::Result<T, AgentError>;
