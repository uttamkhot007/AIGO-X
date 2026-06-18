/**
 * Authenticated symmetric encryption for OAuth/API token storage.
 *
 * Algorithm : AES-256-GCM (authenticated encryption with associated data).
 * Key source : TOKEN_ENCRYPTION_KEY env var — 64 hex chars (32 bytes).
 *              In production this MUST be set; absence throws at startup.
 *              In development a deterministic scrypt-derived key is used so
 *              the server starts without configuration (never use in prod).
 *
 * Blob format (base64-encoded binary):
 *   [ IV (12 bytes) | GCM auth-tag (16 bytes) | ciphertext (N bytes) ]
 *
 * Key rotation: store the new key in TOKEN_ENCRYPTION_KEY and add the old
 * key(s) to TOKEN_ENCRYPTION_KEY_PREV (comma-separated hex). decryptToken()
 * will try all previous keys before failing.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGO   = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function loadKey(hexEnvVar: string): Buffer | null {
  const val = process.env[hexEnvVar];
  if (val && /^[0-9a-fA-F]{64}$/.test(val)) return Buffer.from(val, "hex");
  return null;
}

function devFallbackKey(): Buffer {
  // Deterministic dev key — never suitable for production
  return scryptSync("dufense-dev-enc-key-not-for-prod", "dufense-dev-salt", 32);
}

const PRIMARY_KEY: Buffer = (() => {
  const k = loadKey("TOKEN_ENCRYPTION_KEY");
  if (k) return k;
  if (process.env["NODE_ENV"] === "production") {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY must be set in production — " +
      "provide a 64-character hex string (32 random bytes).",
    );
  }
  return devFallbackKey();
})();

const PREVIOUS_KEYS: Buffer[] = (() => {
  const raw = process.env["TOKEN_ENCRYPTION_KEY_PREV"] ?? "";
  return raw
    .split(",")
    .map(s => s.trim())
    .filter(s => /^[0-9a-fA-F]{64}$/.test(s))
    .map(s => Buffer.from(s, "hex"));
})();

function _encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

function _decrypt(blob: string, key: Buffer): string {
  const buf = Buffer.from(blob, "base64");
  if (buf.length < IV_LEN + TAG_LEN + 1) throw new Error("Token blob too short");
  const iv         = buf.subarray(0, IV_LEN);
  const tag        = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN + TAG_LEN);
  const decipher   = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/**
 * Encrypt a token payload string (e.g. JSON-serialised OAuth tokens).
 * Returns a base64 blob safe for database storage.
 */
export function encryptToken(plaintext: string): string {
  return _encrypt(plaintext, PRIMARY_KEY);
}

/**
 * Decrypt a blob produced by encryptToken().
 * Transparently tries previous keys to support zero-downtime key rotation.
 * Throws if the blob is corrupt or no matching key is found.
 */
export function decryptToken(blob: string): string {
  for (const key of [PRIMARY_KEY, ...PREVIOUS_KEYS]) {
    try {
      return _decrypt(blob, key);
    } catch {
      // try next key
    }
  }
  throw new Error("Token decryption failed — blob corrupt or no matching key");
}
