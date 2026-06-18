/// Offline SQLite store with AES-256-GCM encryption for sensitive payload blobs.
///
/// The encryption key is provided by the caller (derived from a device-bound key
/// via HKDF-SHA256).  Each buffered payload is individually encrypted with a
/// random 96-bit nonce prepended to the ciphertext.
///
/// Schema:
///   agent_meta        — key/value pairs (e.g. agent_id)
///   buffered_payloads — offline queue (encrypted JSON blobs)
use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use anyhow::{bail, Context, Result};
use rand::RngCore;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::Duration;
use tracing::{info, warn};

const NONCE_LEN: usize = 12;

fn encrypt(key_bytes: &[u8; 32], plaintext: &[u8]) -> Result<Vec<u8>> {
    let key = Key::<Aes256Gcm>::from_slice(key_bytes);
    let cipher = Aes256Gcm::new(key);
    let mut nonce_bytes = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| anyhow::anyhow!("AES-GCM encrypt: {e}"))?;
    let mut out = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

fn decrypt(key_bytes: &[u8; 32], blob: &[u8]) -> Result<Vec<u8>> {
    if blob.len() < NONCE_LEN {
        bail!("encrypted blob too short");
    }
    let (nonce_bytes, ciphertext) = blob.split_at(NONCE_LEN);
    let key = Key::<Aes256Gcm>::from_slice(key_bytes);
    let cipher = Aes256Gcm::new(key);
    let nonce = Nonce::from_slice(nonce_bytes);
    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| anyhow::anyhow!("AES-GCM decrypt: {e}"))
}

#[derive(Debug)]
pub struct OfflineStore {
    conn: Connection,
    key: [u8; 32],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BufferedPayload {
    pub id: i64,
    pub agent_id: String,
    pub payload: serde_json::Value,
    pub created_at: String,
}

impl OfflineStore {
    /// Open (or create) the offline SQLite store.
    /// `sqlite_key` must be a 32-byte AES-256 key (e.g. derived from the device-bound
    /// key via HKDF-SHA256).
    pub fn open(path: Option<&str>, sqlite_key: [u8; 32]) -> Result<Self> {
        let db_path = match path {
            Some(p) => p.to_string(),
            None => default_path(),
        };

        if let Some(parent) = Path::new(&db_path).parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("create store dir {}", parent.display()))?;
        }

        let conn = Connection::open(&db_path)
            .with_context(|| format!("open sqlite at {db_path}"))?;

        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;")
            .context("configure sqlite pragmas")?;

        migrate(&conn)?;
        info!(path = %db_path, "offline store opened (AES-256-GCM encrypted payloads)");

        Ok(Self { conn, key: sqlite_key })
    }

    pub fn get_agent_id(&self) -> Result<Option<String>> {
        let result = self.conn.query_row(
            "SELECT value FROM agent_meta WHERE key = 'agent_id'",
            [],
            |row| row.get(0),
        );
        match result {
            Ok(val) => Ok(Some(val)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e).context("get_agent_id"),
        }
    }

    pub fn set_agent_id(&self, id: &str) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO agent_meta (key, value) VALUES ('agent_id', ?1)",
            params![id],
        ).context("set_agent_id")?;
        Ok(())
    }

    /// Serialize and AES-256-GCM encrypt the payload before persisting.
    pub fn buffer_payload(&self, agent_id: &str, payload: &serde_json::Value) -> Result<()> {
        let raw = serde_json::to_vec(payload).context("serialize payload")?;
        let blob = encrypt(&self.key, &raw).context("encrypt payload")?;
        let now = chrono::Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO buffered_payloads (agent_id, payload_enc, created_at) VALUES (?1, ?2, ?3)",
            params![agent_id, blob, now],
        ).context("buffer_payload")?;
        Ok(())
    }

    /// Read and decrypt buffered payloads; silently skips any blobs that fail to decrypt.
    pub fn get_buffered_payloads(&self) -> Result<Vec<BufferedPayload>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, agent_id, payload_enc, created_at \
             FROM buffered_payloads ORDER BY id ASC LIMIT 20",
        ).context("prepare get_buffered_payloads")?;

        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Vec<u8>>(2)?,
                row.get::<_, String>(3)?,
            ))
        }).context("query buffered_payloads")?;

        let mut result = vec![];
        for row in rows {
            let (id, agent_id, blob, created_at) = row.context("read row")?;
            match decrypt(&self.key, &blob) {
                Ok(plain) => {
                    if let Ok(payload) = serde_json::from_slice::<serde_json::Value>(&plain) {
                        result.push(BufferedPayload { id, agent_id, payload, created_at });
                    }
                }
                Err(e) => {
                    warn!(id, "failed to decrypt buffered payload — skipping: {e}");
                }
            }
        }
        Ok(result)
    }

    pub fn delete_buffered_payload(&self, id: i64) -> Result<()> {
        self.conn.execute(
            "DELETE FROM buffered_payloads WHERE id = ?1",
            params![id],
        ).context("delete_buffered_payload")?;
        Ok(())
    }

    pub fn prune_old(&self, max_age: Duration) -> Result<usize> {
        let cutoff = chrono::Utc::now()
            .checked_sub_signed(
                chrono::Duration::from_std(max_age).unwrap_or(chrono::Duration::days(7)),
            )
            .unwrap_or_else(chrono::Utc::now)
            .to_rfc3339();
        let deleted = self.conn.execute(
            "DELETE FROM buffered_payloads WHERE created_at < ?1",
            params![cutoff],
        ).context("prune_old")?;
        if deleted > 0 {
            info!(deleted, "pruned old buffered payloads");
        }
        Ok(deleted)
    }
}

fn migrate(conn: &Connection) -> Result<()> {
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS agent_meta (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS buffered_payloads (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id    TEXT    NOT NULL,
            payload_enc BLOB    NOT NULL,
            created_at  TEXT    NOT NULL
        );
    ").context("migrate offline store")?;
    Ok(())
}

fn default_path() -> String {
    #[cfg(target_os = "windows")]
    {
        let pd = std::env::var("PROGRAMDATA").unwrap_or_else(|_| "C:\\ProgramData".into());
        format!("{pd}\\GRCAgent\\cache.db")
    }
    #[cfg(not(target_os = "windows"))]
    {
        "/var/lib/grc-agent/cache.db".into()
    }
}
