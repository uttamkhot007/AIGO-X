//! SEC-003: Ed25519 per-instance agent signing.
//!
//! Each agent instance generates a unique Ed25519 keypair on first registration.
//! The private key is persisted to disk with restrictive permissions (0o600).
//! The public key is sent to the server during registration and used to verify
//! all subsequent payload signatures (push, checkin, command results).

use anyhow::{Context, Result};
use ed25519_dalek::{Signer, SigningKey, VerifyingKey};
use rand::RngCore;
use std::io::Write;
use tracing::{info, warn};

/// Per-agent Ed25519 keypair for cryptographic payload signing.
pub struct AgentKeypair {
    signing_key: SigningKey,
}

impl AgentKeypair {
    /// Generate a new random Ed25519 keypair.
    pub fn generate() -> Self {
        let mut secret = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut secret);
        let signing_key = SigningKey::from_bytes(&secret);
        info!(pub_key = %hex::encode(signing_key.verifying_key().to_bytes()), "generated new Ed25519 agent keypair");
        Self { signing_key }
    }

    /// Load an existing keypair from a file, or generate and persist a new one.
    /// The private key file is created with 0o600 permissions on Unix.
    pub fn load_or_generate(path: &str) -> Result<Self> {
        if std::path::Path::new(path).exists() {
            let bytes = std::fs::read(path)
                .with_context(|| format!("reading Ed25519 private key from {path}"))?;
            if bytes.len() != 32 {
                anyhow::bail!("Ed25519 private key must be exactly 32 bytes, got {}", bytes.len());
            }
            let mut key_bytes = [0u8; 32];
            key_bytes.copy_from_slice(&bytes);
            let signing_key = SigningKey::from_bytes(&key_bytes);
            info!(path, pub_key = %hex::encode(signing_key.verifying_key().to_bytes()), "loaded existing Ed25519 agent keypair");
            return Ok(Self { signing_key });
        }

        let kp = Self::generate();
        kp.save(path)?;
        Ok(kp)
    }

    /// Persist the private key to disk with restrictive permissions.
    pub fn save(&self, path: &str) -> Result<()> {
        let dir = std::path::Path::new(path).parent()
            .context("Ed25519 key path has no parent directory")?;
        std::fs::create_dir_all(dir).context("create Ed25519 key directory")?;

        let bytes = self.signing_key.to_bytes();

        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            let mut opts = std::fs::OpenOptions::new();
            opts.write(true).create(true).truncate(true).mode(0o600);
            opts.open(path)?.write_all(&bytes)?;
        }
        #[cfg(not(unix))]
        {
            std::fs::write(path, &bytes).context("write Ed25519 private key")?;
            // Restrict ACLs to current user only on Windows
            let user = std::env::var("USERNAME").unwrap_or_else(|_| "CURRENT_USER".to_string());
            match std::process::Command::new("icacls")
                .arg(path)
                .args(["/inheritance:r", "/grant:r", &format!("{}:(R)", user)])
                .output()
            {
                Ok(out) if out.status.success() => {
                    info!(path, "[SEC-003] Windows ACL restricted to owner on Ed25519 key");
                }
                Ok(out) => {
                    let stderr = String::from_utf8_lossy(&out.stderr);
                    warn!(path, stderr = %stderr, "[SEC-003] icacls failed on Ed25519 key — file may be readable by other users");
                }
                Err(e) => {
                    warn!(path, err = %e, "[SEC-003] icacls command failed on Ed25519 key — file may be readable by other users");
                }
            }
        }

        info!(path, "persisted Ed25519 private key");
        Ok(())
    }

    /// Sign a message and return the signature as a lowercase hex string.
    pub fn sign(&self, message: &[u8]) -> String {
        let signature = self.signing_key.sign(message);
        hex::encode(signature.to_bytes())
    }

    /// Return the verifying (public) key as a 64-character hex string.
    pub fn public_key_hex(&self) -> String {
        hex::encode(self.signing_key.verifying_key().to_bytes())
    }

    /// Return the raw verifying key.
    pub fn verifying_key(&self) -> VerifyingKey {
        self.signing_key.verifying_key()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_keypair_generate_and_sign() {
        let kp = AgentKeypair::generate();
        let message = b"hello world";
        let sig = kp.sign(message);
        assert_eq!(sig.len(), 128); // 64 bytes hex-encoded

        // Verify with ed25519_dalek directly
        use ed25519_dalek::{Signature, Verifier};
        let sig_bytes = hex::decode(&sig).unwrap();
        let sig_arr: &[u8; 64] = sig_bytes.as_slice().try_into().unwrap();
        let signature = Signature::from_bytes(sig_arr);
        assert!(kp.verifying_key().verify(message, &signature).is_ok());
    }

    #[test]
    fn test_keypair_load_or_generate_persists() {
        let tmp = std::env::temp_dir().join(format!("grc-ed25519-test-{}", std::process::id()));
        let path = tmp.to_str().unwrap();

        // First call generates
        let kp1 = AgentKeypair::load_or_generate(path).unwrap();
        let pk1 = kp1.public_key_hex();

        // Second call loads
        let kp2 = AgentKeypair::load_or_generate(path).unwrap();
        let pk2 = kp2.public_key_hex();

        assert_eq!(pk1, pk2);

        // Cleanup
        let _ = std::fs::remove_file(path);
    }
}
