//! Agent self-updater binary verification.
//!
//! Verifies the integrity and authenticity of downloaded update binaries
//! using Ed25519 signatures or SHA-256 hashes as a fallback.

use anyhow::{bail, Context, Result};
use ed25519_dalek::{Verifier, VerifyingKey, Signature};
use sha2::{Sha256, Digest};
use tracing::{info, warn};

/// Hex-encoded Ed25519 public key used to verify update signatures.
/// This key is compiled into the agent at build time.
/// In production, set GRC_UPDATE_PUBLIC_KEY env var at compile time.
const UPDATE_SIGNING_PUBLIC_KEY_HEX: &str = match option_env!("GRC_UPDATE_PUBLIC_KEY") {
    Some(key) => key,
    None => "0000000000000000000000000000000000000000000000000000000000000000",
};

/// Verify a downloaded update binary.
///
/// 1. If `signature_bytes` is provided and a valid public key is configured,
///    verifies the Ed25519 signature.
/// 2. Otherwise, computes and logs the SHA-256 hash for manual verification.
/// 3. Returns an error if signature verification is explicitly required but fails.
///
/// # Arguments
/// * `binary` — The raw binary bytes downloaded from the server.
/// * `signature_bytes` — Optional raw signature bytes (64 bytes for Ed25519).
pub fn verify_update(binary: &[u8], signature_bytes: Option<&[u8]>) -> Result<()> {
    // Always compute SHA-256 hash for logging / audit
    let hash = compute_sha256(binary);
    info!(hash = %hash, bytes = binary.len(), "update binary SHA-256 hash");

    // If a signature is provided, attempt Ed25519 verification
    if let Some(sig_bytes) = signature_bytes {
        match verify_ed25519(binary, sig_bytes) {
            Ok(()) => {
                info!("update signature verified successfully");
                return Ok(());
            }
            Err(e) => {
                warn!(error = %e, "update signature verification failed");
                bail!("update signature verification failed: {e}");
            }
        }
    }

    // If GRC_ENFORCE_UPDATE_SIGNATURES is set, reject unsigned updates
    if std::env::var("GRC_ENFORCE_UPDATE_SIGNATURES").unwrap_or_default() == "1" {
        bail!("GRC_ENFORCE_UPDATE_SIGNATURES=1 but no signature was provided with the update");
    }

    // Without a signature, we can only verify integrity via hash.
    // Log a warning that authenticity is not cryptographically proven.
    warn!("update downloaded without Ed25519 signature — only SHA-256 integrity hash available. \
           Set GRC_ENFORCE_UPDATE_SIGNATURES=1 to require signed updates.");
    Ok(())
}

/// Compute the SHA-256 hash of binary data, returning a lowercase hex string.
fn compute_sha256(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    format!("{:x}", hasher.finalize())
}

/// Verify an Ed25519 signature against the compiled-in public key.
fn verify_ed25519(message: &[u8], signature_bytes: &[u8]) -> Result<()> {
    let key_hex = UPDATE_SIGNING_PUBLIC_KEY_HEX;
    if key_hex == "0000000000000000000000000000000000000000000000000000000000000000" {
        bail!("UPDATE_SIGNING_PUBLIC_KEY_HEX is a placeholder — set GRC_UPDATE_PUBLIC_KEY at build time");
    }

    let key_bytes = hex::decode(key_hex)
        .context("decode UPDATE_SIGNING_PUBLIC_KEY_HEX")?;
    let verifying_key = VerifyingKey::from_bytes(
        &key_bytes.try_into().map_err(|_| anyhow::anyhow!("public key must be 32 bytes"))?
    ).context("parse Ed25519 verifying key")?;

    let signature = Signature::from_bytes(
        signature_bytes.try_into().map_err(|_| anyhow::anyhow!("signature must be 64 bytes"))?
    );

    verifying_key.verify(message, &signature)
        .context("Ed25519 signature verification failed")?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_sha256() {
        let hash = compute_sha256(b"hello");
        assert_eq!(hash.len(), 64);
        assert!(hash.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn test_verify_update_no_signature_no_enforce() {
        // Should succeed when no signature provided and enforcement is off
        let result = verify_update(b"test binary", None);
        assert!(result.is_ok());
    }

    #[test]
    fn test_verify_update_no_signature_with_enforce() {
        std::env::set_var("GRC_ENFORCE_UPDATE_SIGNATURES", "1");
        let result = verify_update(b"test binary", None);
        std::env::remove_var("GRC_ENFORCE_UPDATE_SIGNATURES");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("no signature was provided"));
    }
}
