/**
 * SSO & Active Directory Routes
 *
 * Supports three provider types:
 *   • entra   — Microsoft Entra ID (Azure AD) via OIDC
 *   • oidc    — Generic OpenID Connect (authorization code flow)
 *   • saml    — Generic SAML 2.0
 *   • ldap    — LDAP / Active Directory (config + manual sync trigger)
 *
 * Admin endpoints (require auth + admin role):
 *   GET    /auth/sso/config        — return sanitised config for tenant
 *   PUT    /auth/sso/config        — save/update config (encrypts secrets)
 *   POST   /auth/sso/test          — dry-run connection test
 *   POST   /auth/ldap/sync         — trigger immediate LDAP sync
 *   GET    /auth/sso/audit-log     — recent SSO/LDAP audit events
 *
 * Public / browser-initiated endpoints:
 *   GET    /auth/sso/check         — returns { enabled, orgName, providerType }
 *   GET    /auth/sso/login         — initiates OIDC/SAML redirect
 *   GET    /auth/sso/callback      — OIDC authorization code callback
 *   POST   /auth/sso/callback/saml — SAML ACS (assertion consumer service)
 *   GET    /auth/sso/metadata      — SAML SP metadata XML
 */

import { Router } from "express";
import { db } from "../lib/db";
import { sql } from "drizzle-orm";
import { requireAuth, requireRole, signToken } from "../lib/auth";
import type { JwtPayload } from "../lib/auth";
import { encryptToken, decryptToken } from "../lib/token-encryption";
import { syncLdapUsers, testLdapConnection } from "../services/ldap-sync";
import { SAML } from "@node-saml/node-saml";
import * as crypto from "crypto";

const router = Router();

// ── In-process test-success tracker ──────────────────────────────────────────
// Maps tenantId → SHA-256 fingerprint of the SSO config that last passed
// /auth/sso/test.  The guard only allows localLoginEnabled=false when the
// pending config's fingerprint matches the stored one, so any change to an
// auth-relevant field (issuerUrl, clientId, secret, cert, etc.) invalidates
// the prior successful test and requires a re-test before disabling local login.
// Ephemeral by design — the guard is a UX safety net, not a security control.
const testedSuccessfullyFingerprints = new Map<number, string>();

// ── Config fingerprinting ─────────────────────────────────────────────────────

/**
 * Auth-relevant fields used to fingerprint an SSO config.
 * Non-auth fields (orgName, defaultRole, syncIntervalHours, …) are excluded so
 * cosmetic saves don't invalidate a prior successful test.
 */
export interface ConfigFingerprintInput {
  provider_type: string;
  issuer_url?: string | null;
  client_id?: string | null;
  /** Pass the raw encrypted value stored in DB, or a sentinel when a new
   *  plaintext secret is being submitted (since the ciphertext is nonce-based
   *  and will differ on every encryption even for the same plaintext). */
  encrypted_client_secret?: string | null;
  saml_entry_point?: string | null;
  saml_cert?: string | null;
  ldap_host?: string | null;
  ldap_bind_dn?: string | null;
  encrypted_ldap_bind_password?: string | null;
  /** LDAP transport settings — changing these can break connectivity just as
   *  much as changing the host/credentials, so they are auth-critical. */
  ldap_port?: number | null;
  ldap_use_tls?: boolean | null;
}

/**
 * Compute a stable fingerprint of auth-relevant SSO config fields.
 * Two configs are considered equivalent for the guard iff their fingerprints
 * match, meaning a successful test on config A is still valid when saving
 * config B only if A and B are fingerprint-equal.
 */
export function computeConfigFingerprint(fields: ConfigFingerprintInput): string {
  return crypto.createHash("sha256").update(JSON.stringify({
    pt: fields.provider_type,
    iu: fields.issuer_url ?? null,
    ci: fields.client_id ?? null,
    ecs: fields.encrypted_client_secret ?? null,
    se: fields.saml_entry_point ?? null,
    sc: fields.saml_cert ?? null,
    lh: fields.ldap_host ?? null,
    lb: fields.ldap_bind_dn ?? null,
    elp: fields.encrypted_ldap_bind_password ?? null,
    lp: fields.ldap_port ?? null,
    lt: fields.ldap_use_tls ?? null,
  })).digest("hex");
}

/** Extract fingerprint input from a stored SsoRow. */
function ssoRowFingerprint(row: SsoRow): string {
  return computeConfigFingerprint({
    provider_type: row.provider_type,
    issuer_url: row.issuer_url,
    client_id: row.client_id,
    encrypted_client_secret: row.encrypted_client_secret,
    saml_entry_point: row.saml_entry_point,
    saml_cert: row.saml_cert,
    ldap_host: row.ldap_host,
    ldap_bind_dn: row.ldap_bind_dn,
    encrypted_ldap_bind_password: row.encrypted_ldap_bind_password,
    ldap_port: row.ldap_port,
    ldap_use_tls: row.ldap_use_tls,
  });
}

/** Record a successful test for the given row.  Called by the POST /auth/sso/test handler. */
function recordSuccessForRow(tenantId: number, row: SsoRow): void {
  testedSuccessfullyFingerprints.set(tenantId, ssoRowFingerprint(row));
}

/**
 * Testing seam — injects a success fingerprint without going through the HTTP
 * layer.  Never import or call this in production code.
 */
export function _testOnly_setSuccessFingerprint(tenantId: number, fingerprint: string): void {
  testedSuccessfullyFingerprints.set(tenantId, fingerprint);
}

// ── SSO config field validation ───────────────────────────────────────────────

export interface SsoConfigValidationBody {
  providerType?: string;
  issuerUrl?: string;
  clientId?: string;
  clientSecret?: string;
  samlEntryPoint?: string;
  samlCert?: string;
  ldapHost?: string;
  ldapBindDn?: string;
  ldapBindPassword?: string;
  localLoginEnabled?: boolean;
  enabled?: boolean;
}

export interface SsoExistingSecrets {
  hasClientSecret: boolean;
  hasLdapPassword: boolean;
}

export type SsoValidationResult =
  | { ok: true }
  | { ok: false; field: string; error: string };

/**
 * Validate that all required fields for the chosen provider type are present.
 * Pass `existing` so that already-encrypted secrets aren't considered missing
 * when the caller hasn't re-submitted them (i.e. "keep existing" pattern).
 */
export function validateSsoConfigFields(
  body: SsoConfigValidationBody,
  existing?: SsoExistingSecrets,
): SsoValidationResult {
  const pt = (body.providerType ?? "oidc").toLowerCase();

  if (pt === "entra" || pt === "oidc") {
    if (!body.issuerUrl?.trim()) {
      return { ok: false, field: "issuerUrl", error: "issuerUrl is required for OIDC / Entra ID providers" };
    }
    if (!body.clientId?.trim()) {
      return { ok: false, field: "clientId", error: "clientId is required for OIDC / Entra ID providers" };
    }
    const hasSecret = !!body.clientSecret?.trim() || !!existing?.hasClientSecret;
    if (!hasSecret) {
      return { ok: false, field: "clientSecret", error: "clientSecret is required for OIDC / Entra ID providers" };
    }
  }

  if (pt === "saml") {
    if (!body.samlEntryPoint?.trim()) {
      return { ok: false, field: "samlEntryPoint", error: "samlEntryPoint is required for SAML providers" };
    }
    if (!body.samlCert?.trim()) {
      return { ok: false, field: "samlCert", error: "samlCert (IdP certificate PEM) is required for SAML providers" };
    }
  }

  if (pt === "ldap") {
    if (!body.ldapHost?.trim()) {
      return { ok: false, field: "ldapHost", error: "ldapHost is required for LDAP providers" };
    }
    if (!body.ldapBindDn?.trim()) {
      return { ok: false, field: "ldapBindDn", error: "ldapBindDn is required for LDAP providers" };
    }
    const hasPw = !!body.ldapBindPassword?.trim() || !!existing?.hasLdapPassword;
    if (!hasPw) {
      return { ok: false, field: "ldapBindPassword", error: "ldapBindPassword is required for LDAP providers" };
    }
  }

  return { ok: true };
}

/**
 * Returns true when disabling local login is permitted for this tenant.
 *
 * When `pendingFingerprint` is supplied (always the case in the PUT handler),
 * the stored success fingerprint must match it — i.e. the config being saved
 * must be fingerprint-identical to the config that was successfully tested.
 * Any change to an auth-relevant field (issuerUrl, clientId, secret, cert …)
 * produces a different fingerprint and forces a re-test.
 *
 * When called without `pendingFingerprint` (unit tests or legacy callers),
 * only the existence of a stored success is checked.
 */
export function canDisableLocalLogin(tenantId: number, pendingFingerprint?: string): boolean {
  const stored = testedSuccessfullyFingerprints.get(tenantId);
  if (!stored) return false;
  if (pendingFingerprint === undefined) return true;
  return stored === pendingFingerprint;
}

// ── In-process OIDC state store (state → {tenantId, nonce, expiresAt}) ─────────
// Protects against login CSRF/session confusion.  Entries expire after 10 minutes.

interface OidcStateEntry { tenantId: number; nonce: string; expiresAt: number; redirectUri: string; dryRun?: boolean; }
const oidcStateStore = new Map<string, OidcStateEntry>();

function storeOidcState(state: string, tenantId: number, nonce: string, redirectUri: string, dryRun?: boolean) {
  oidcStateStore.set(state, { tenantId, nonce, expiresAt: Date.now() + 10 * 60 * 1000, redirectUri, dryRun });
  // Prune expired entries opportunistically
  for (const [k, v] of oidcStateStore.entries()) {
    if (v.expiresAt < Date.now()) oidcStateStore.delete(k);
  }
}

// ── Dry-run helper ────────────────────────────────────────────────────────────
// Returns a self-contained HTML page that posts a structured message to the
// opener window (the Settings panel) and then closes itself automatically.
// Used by the "Test sign-in" flow so admins can verify the full OIDC/SAML
// round-trip without provisioning a real user session.

/**
 * Escape a JSON string so it is safe to embed verbatim inside a <script> block.
 *
 * JSON.stringify() does NOT escape `<`, `>`, or `&`, so an attacker-controlled
 * string value containing `</script>` would close the script tag and allow
 * arbitrary HTML injection.  We defensively Unicode-escape those three
 * characters so the resulting JSON is structurally identical but cannot break
 * out of the script context regardless of what IdP claims contain.
 */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003C")
    .replace(/>/g, "\\u003E")
    .replace(/&/g, "\\u0026");
}

function dryRunHtmlPage(ok: boolean, data: Record<string, unknown>, errorCode?: string): string {
  // Build the payload object; jsonForScript ensures no value can break out
  // of the enclosing <script> block regardless of IdP-controlled claim content.
  const safePayload = jsonForScript({
    type: "sso_dryrun_result",
    ok,
    ...data,
    error: errorCode ?? null,
  });
  // Keep the <p> text entirely static — no user-controlled content in HTML.
  const icon = ok ? "&#x2705;" : "&#x274C;";
  const msg  = ok ? "SSO test complete" : "SSO test failed";
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>SSO Test</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center;
           justify-content: center; height: 100vh; margin: 0;
           background: #0f172a; color: #e2e8f0; flex-direction: column; gap: 12px; }
    p { font-size: 16px; font-weight: 600; }
    small { font-size: 12px; color: #94a3b8; }
  </style>
</head>
<body>
  <p>${icon} ${msg}</p>
  <small>This window will close automatically&#x2026;</small>
  <script>
    (function () {
      var payload = ${safePayload};
      try {
        // Target the opener's exact origin — prevents other windows from
        // receiving the postMessage (belt-and-suspenders alongside the
        // frontend's evt.origin check).
        if (window.opener) window.opener.postMessage(payload, window.location.origin);
      } catch (e) {}
      setTimeout(function () { window.close(); }, 1800);
    })();
  </script>
</body>
</html>`;
}

function consumeOidcState(state: string): OidcStateEntry | null {
  const entry = oidcStateStore.get(state);
  if (!entry) return null;
  oidcStateStore.delete(state);
  if (entry.expiresAt < Date.now()) return null;
  return entry;
}

/**
 * Read the dryRun flag from the state store WITHOUT consuming the entry.
 * Used in early-failure branches where we haven't yet validated the full
 * state → this lets us decide whether to return dry-run HTML or a redirect
 * even before the entry is consumed.
 */
function peekDryRun(state: string | undefined): boolean {
  if (!state) return false;
  const entry = oidcStateStore.get(state);
  if (!entry || entry.expiresAt < Date.now()) return false;
  return !!entry.dryRun;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

type AuthReq = typeof import("express").request & { user: JwtPayload };

function getUser(req: Parameters<typeof requireAuth>[0]): JwtPayload {
  return (req as unknown as AuthReq).user;
}

const ADMIN_ROLES = ["super_admin", "tenant_admin", "admin", "ciso"] as const;

async function getSsoConfig(tenantId: number) {
  const rows = await db.execute(sql`
    SELECT * FROM sso_configurations WHERE tenant_id = ${tenantId} LIMIT 1
  `);
  return rows.rows[0] as SsoRow | undefined;
}

interface SsoRow {
  id: number;
  tenant_id: number;
  provider_type: string;
  org_name: string | null;
  issuer_url: string | null;
  client_id: string | null;
  encrypted_client_secret: string | null;
  saml_entry_point: string | null;
  saml_cert: string | null;
  encrypted_saml_private_key: string | null;
  ldap_host: string | null;
  ldap_port: number | null;
  ldap_bind_dn: string | null;
  encrypted_ldap_bind_password: string | null;
  ldap_search_base: string | null;
  ldap_search_filter: string | null;
  ldap_use_tls: boolean;
  group_role_mappings: Record<string, string>;
  default_role: string;
  enabled: boolean;
  local_login_enabled: boolean;
  sync_interval_hours: number | null;
  last_sync: string | null;
  created_at: string;
  updated_at: string;
}

function sanitizeConfig(row: SsoRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    providerType: row.provider_type,
    orgName: row.org_name,
    issuerUrl: row.issuer_url,
    clientId: row.client_id,
    hasClientSecret: !!row.encrypted_client_secret,
    samlEntryPoint: row.saml_entry_point,
    samlCert: row.saml_cert,
    hasSamlPrivateKey: !!row.encrypted_saml_private_key,
    ldapHost: row.ldap_host,
    ldapPort: row.ldap_port,
    ldapBindDn: row.ldap_bind_dn,
    hasLdapPassword: !!row.encrypted_ldap_bind_password,
    ldapSearchBase: row.ldap_search_base,
    ldapSearchFilter: row.ldap_search_filter,
    ldapUseTls: row.ldap_use_tls,
    groupRoleMappings: row.group_role_mappings ?? {},
    defaultRole: row.default_role ?? "compliance_analyst",
    enabled: row.enabled,
    localLoginEnabled: row.local_login_enabled ?? true,
    syncIntervalHours: row.sync_interval_hours ?? 6,
    lastSync: row.last_sync,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function emitSsoAudit(tenantId: number, eventType: string, actor: string, targetEmail: string, detail: unknown) {
  try {
    await db.execute(sql`
      INSERT INTO sso_audit_log (tenant_id, event_type, actor, target_email, detail, created_at)
      VALUES (${tenantId}, ${eventType}, ${actor}, ${targetEmail}, ${JSON.stringify(detail)}, NOW())
    `);
  } catch {
    // non-fatal
  }
}

async function provisionOrUpdateUser(tenantId: number, claims: {
  email: string;
  name: string;
  groups?: string[];
}, groupRoleMappings: Record<string, string>, defaultRole: string, provider: string) {
  const email = claims.email.toLowerCase().trim();
  const role = claims.groups?.length
    ? (Object.entries(groupRoleMappings).find(([g]) =>
        claims.groups!.some(ug => ug.toLowerCase().includes(g.toLowerCase()))
      )?.[1] ?? defaultRole)
    : defaultRole;

  // Always scope lookups to this tenant to prevent cross-tenant identity pollution
  const existing = await db.execute(sql`
    SELECT id, role, name FROM users
    WHERE email = ${email} AND tenant_id = ${tenantId}
    LIMIT 1
  `);

  let userId: number;
  let isNew = false;

  if (existing.rows.length === 0) {
    // Reject if this email exists for a DIFFERENT tenant — prevents cross-tenant mutation
    const crossTenant = await db.execute(sql`
      SELECT id FROM users WHERE email = ${email} AND tenant_id != ${tenantId} LIMIT 1
    `);
    if (crossTenant.rows.length > 0) {
      throw new Error(`SSO provisioning conflict: ${email} is registered under a different organisation`);
    }

    // The users table has a global UNIQUE constraint on email (not scoped to tenant_id).
    // We've already verified no cross-tenant conflict exists above, so ON CONFLICT (email)
    // DO NOTHING is safe here.  The RETURNING clause will be empty only on a race-condition
    // duplicate insert, which we handle by re-fetching.
    const inserted = await db.execute(sql`
      INSERT INTO users (tenant_id, email, name, password_hash, role, mfa_enabled, created_at)
      VALUES (${tenantId}, ${email}, ${claims.name}, 'sso-managed-no-local-auth', ${role}, false, NOW())
      ON CONFLICT (email) DO NOTHING
      RETURNING id, role
    `);
    if (inserted.rows.length === 0) {
      // Race condition: another request inserted between our SELECT and INSERT — re-fetch
      const refetched = await db.execute(sql`
        SELECT id, role FROM users WHERE email = ${email} AND tenant_id = ${tenantId} LIMIT 1
      `);
      const row = refetched.rows[0] as { id: number; role: string };
      userId = row.id;
    } else {
      userId = (inserted.rows[0] as { id: number }).id;
      isNew = true;
      await emitSsoAudit(tenantId, "sso_user_provisioned", provider, email, { role, provider });
    }
  } else {
    const row = existing.rows[0] as { id: number; role: string; name: string };
    userId = row.id;
    if (row.role !== role || row.name !== claims.name) {
      await db.execute(sql`
        UPDATE users SET role = ${role}, name = ${claims.name}, last_login = NOW(), updated_at = NOW()
        WHERE id = ${userId} AND tenant_id = ${tenantId}
      `);
      await emitSsoAudit(tenantId, "sso_user_updated", provider, email, { oldRole: row.role, newRole: role });
    } else {
      await db.execute(sql`UPDATE users SET last_login = NOW() WHERE id = ${userId} AND tenant_id = ${tenantId}`);
    }
  }

  await emitSsoAudit(tenantId, "sso_login", provider, email, { isNew, role });

  return { userId, email, role, tenantId };
}

// ── Protocol helper ────────────────────────────────────────────────────────────
// In Replit (and most reverse-proxy setups) the Express app sees HTTP internally
// while the user-facing URL is HTTPS.  Trust proxy is already set to 1 so
// req.protocol reflects X-Forwarded-Proto, but we also defensively check the
// header directly so the redirect_uri we send to the IdP is always HTTPS when
// the request arrived over HTTPS (Entra rejects http:// redirect URIs).

function getBaseUrl(req: import("express").Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim()
    ?? req.protocol;
  const host = (req.headers["x-forwarded-host"] as string | undefined)?.split(",")[0]?.trim()
    ?? req.get("host")!;
  return `${proto}://${host}`;
}

// ── OIDC Discovery & Token Exchange (manual, no heavy deps) ───────────────────

// ── SSO error classifier ───────────────────────────────────────────────────────
// Maps a caught error to a stable, human-readable error code that the frontend
// can decode into a friendly message.  Order matters: more specific checks first.

export function classifySsoError(err: unknown, phase: "discovery" | "token_exchange" | "userinfo" | "provisioning" | "generic"): string {
  const e = err as { name?: string; code?: string; cause?: { code?: string }; message?: string } | null;
  const name = e?.name ?? "";
  const code = e?.code ?? e?.cause?.code ?? "";
  const msg  = e?.message ?? "";

  // AbortSignal.timeout() throws a DOMException named "TimeoutError" in Node 18+
  // Undici (Node's built-in fetch) can also throw UND_ERR_CONNECT_TIMEOUT / ETIMEDOUT
  const isTimeout =
    name === "TimeoutError" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "ETIMEDOUT" ||
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    msg.includes("fetch failed") ||
    msg.includes("timed out");

  if (isTimeout) {
    if (phase === "discovery")       return "discovery_timeout";
    if (phase === "token_exchange")  return "token_exchange_timeout";
    return "idp_unreachable";
  }

  // Provisioning conflict — cross-tenant email collision
  if (phase === "provisioning" || msg.includes("SSO provisioning conflict")) {
    return "provisioning_conflict";
  }

  // Token exchange was rejected by the IdP (non-timeout HTTP error, e.g.
  // invalid_client / invalid_grant / 400 / 401) — distinct from a timeout.
  if (phase === "token_exchange") {
    return "token_exchange_rejected";
  }

  return phase === "generic" ? "sso_error" : "sso_callback_failed";
}

async function discoverOidc(issuerUrl: string) {
  const url = issuerUrl.replace(/\/$/, "") + "/.well-known/openid-configuration";
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status}`);
  return res.json() as Promise<{
    authorization_endpoint: string;
    token_endpoint: string;
    userinfo_endpoint: string;
    jwks_uri: string;
  }>;
}

async function exchangeOidcCode(tokenEndpoint: string, code: string, redirectUri: string, clientId: string, clientSecret: string) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });
  const res = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${txt}`);
  }
  return res.json() as Promise<{ access_token: string; id_token?: string; error?: string }>;
}

async function fetchOidcUserInfo(userinfoEndpoint: string, accessToken: string) {
  const res = await fetch(userinfoEndpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`UserInfo fetch failed: ${res.status}`);
  return res.json() as Promise<{ email?: string; name?: string; preferred_username?: string; groups?: string[] }>;
}

// ── Public: check if SSO is configured ────────────────────────────────────────
// Accepts ?tenantId=<n> OR ?domain=<hostname>.
// Domain lookup matches against the org_name or issuer_url domain stored in the config.

router.get("/auth/sso/check", async (req, res) => {
  try {
    let cfg: SsoRow | undefined;

    if (req.query["tenantId"]) {
      const tenantId = parseInt(String(req.query["tenantId"]), 10);
      if (!isNaN(tenantId)) cfg = await getSsoConfig(tenantId);
    } else if (req.query["domain"]) {
      // Resolve tenant by matching the request domain against org_name or issuer_url
      const domain = String(req.query["domain"]).toLowerCase().replace(/^www\./, "");
      const rows = await db.execute(sql`
        SELECT * FROM sso_configurations
        WHERE enabled = true
          AND (
            LOWER(org_name) LIKE ${"%" + domain + "%"}
            OR LOWER(issuer_url) LIKE ${"%" + domain + "%"}
            OR LOWER(ldap_host) LIKE ${"%" + domain + "%"}
          )
        LIMIT 1
      `);
      cfg = rows.rows[0] as SsoRow | undefined;
    }

    if (!cfg || !cfg.enabled) {
      res.json({ enabled: false });
      return;
    }
    res.json({
      enabled: true,
      tenantId: cfg.tenant_id,
      orgName: cfg.org_name,
      providerType: cfg.provider_type,
      localLoginEnabled: cfg.local_login_enabled ?? true,
    });
  } catch {
    res.json({ enabled: false });
  }
});

// ── Admin: GET /auth/sso/config ────────────────────────────────────────────────

router.get("/auth/sso/config", requireAuth, requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const { tenantId } = getUser(req as Parameters<typeof requireAuth>[0]);
    const cfg = await getSsoConfig(tenantId);
    if (!cfg) {
      res.json(null);
      return;
    }
    res.json(sanitizeConfig(cfg));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin: PUT /auth/sso/config ────────────────────────────────────────────────

router.put("/auth/sso/config", requireAuth, requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const { tenantId, email } = getUser(req as Parameters<typeof requireAuth>[0]);
    const b = req.body as {
      providerType?: string;
      orgName?: string;
      issuerUrl?: string;
      clientId?: string;
      clientSecret?: string;
      samlEntryPoint?: string;
      samlCert?: string;
      samlPrivateKey?: string;
      ldapHost?: string;
      ldapPort?: number;
      ldapBindDn?: string;
      ldapBindPassword?: string;
      ldapSearchBase?: string;
      ldapSearchFilter?: string;
      ldapUseTls?: boolean;
      groupRoleMappings?: Record<string, string>;
      defaultRole?: string;
      enabled?: boolean;
      localLoginEnabled?: boolean;
      syncIntervalHours?: number;
    };

    const existing = await getSsoConfig(tenantId);

    // ── Required-field validation ─────────────────────────────────────────────
    // Only validate when the caller is explicitly enabling SSO or setting fields
    // that belong to a specific provider (i.e. not a pure toggle-only save).
    const isEnabling = b.enabled === true || (existing?.enabled && b.enabled !== false);
    if (isEnabling || b.providerType || b.issuerUrl || b.clientId || b.samlEntryPoint || b.samlCert || b.ldapHost) {
      const providerType = b.providerType ?? existing?.provider_type ?? "oidc";
      const validBody = { ...b, providerType };
      const existingSecrets: SsoExistingSecrets = {
        hasClientSecret: !!existing?.encrypted_client_secret,
        hasLdapPassword: !!existing?.encrypted_ldap_bind_password,
      };
      const vr = validateSsoConfigFields(validBody, existingSecrets);
      if (!vr.ok) {
        res.status(400).json({ error: vr.error, field: vr.field });
        return;
      }
    }

    // ── localLoginEnabled=false guard ─────────────────────────────────────────
    // Disabling (or keeping disabled) local login is only permitted when a
    // successful /auth/sso/test has been run for the exact config being saved.
    //
    // Guard fires in two cases:
    //   (a) The request explicitly sets localLoginEnabled: false.
    //   (b) local_login_enabled is already false in the DB AND the request
    //       includes auth-relevant field mutations (issuerUrl / clientId /
    //       secret / samlEntryPoint / samlCert / ldap fields).
    //       — Protects against the bypass path where an admin changes the IdP
    //         without explicitly mentioning localLoginEnabled.
    //   Non-auth field saves (orgName, defaultRole, …) while local login is
    //   already disabled pass through so admins can still manage cosmetic config.
    const authFieldsInRequest = !!(
      b.providerType !== undefined || b.issuerUrl !== undefined || b.clientId !== undefined ||
      b.clientSecret !== undefined || b.samlEntryPoint !== undefined || b.samlCert !== undefined ||
      b.ldapHost !== undefined || b.ldapBindDn !== undefined || b.ldapBindPassword !== undefined ||
      b.ldapPort !== undefined || b.ldapUseTls !== undefined
    );
    const resultingLocalLoginDisabled =
      b.localLoginEnabled === false ||
      (b.localLoginEnabled === undefined && existing?.local_login_enabled === false);

    if (resultingLocalLoginDisabled && (b.localLoginEnabled === false || authFieldsInRequest)) {
      const pendingFp = computeConfigFingerprint({
        provider_type: b.providerType ?? existing?.provider_type ?? "oidc",
        issuer_url: b.issuerUrl ?? existing?.issuer_url ?? null,
        client_id: b.clientId ?? existing?.client_id ?? null,
        // Use a fixed sentinel when a new secret is submitted, because the
        // actual ciphertext (nonce-based AES-GCM) will differ on every encryption
        // and can't be predicted before the save.  The sentinel ensures the pending
        // fingerprint differs from any stored success fingerprint, forcing re-test.
        encrypted_client_secret: b.clientSecret !== undefined
          ? "__new_secret_sentinel__"
          : (existing?.encrypted_client_secret ?? null),
        saml_entry_point: b.samlEntryPoint ?? existing?.saml_entry_point ?? null,
        saml_cert: b.samlCert ?? existing?.saml_cert ?? null,
        ldap_host: b.ldapHost ?? existing?.ldap_host ?? null,
        ldap_bind_dn: b.ldapBindDn ?? existing?.ldap_bind_dn ?? null,
        encrypted_ldap_bind_password: b.ldapBindPassword !== undefined
          ? "__new_secret_sentinel__"
          : (existing?.encrypted_ldap_bind_password ?? null),
        ldap_port: b.ldapPort ?? existing?.ldap_port ?? null,
        ldap_use_tls: b.ldapUseTls ?? existing?.ldap_use_tls ?? null,
      });
      if (!canDisableLocalLogin(tenantId, pendingFp)) {
        res.status(400).json({
          error: "Cannot disable local login without a successful connection test for this exact configuration. Run 'Test Connection' and confirm it passes, then save.",
          field: "localLoginEnabled",
        });
        return;
      }
    }

    const encSecret = b.clientSecret
      ? encryptToken(b.clientSecret)
      : (existing?.encrypted_client_secret ?? null);

    const encLdapPw = b.ldapBindPassword
      ? encryptToken(b.ldapBindPassword)
      : (existing?.encrypted_ldap_bind_password ?? null);

    const encSamlKey = b.samlPrivateKey
      ? encryptToken(b.samlPrivateKey)
      : (existing?.encrypted_saml_private_key ?? null);

    if (existing) {
      await db.execute(sql`
        UPDATE sso_configurations SET
          provider_type              = ${b.providerType ?? existing.provider_type},
          org_name                   = ${b.orgName ?? existing.org_name},
          issuer_url                 = ${b.issuerUrl ?? existing.issuer_url},
          client_id                  = ${b.clientId ?? existing.client_id},
          encrypted_client_secret    = ${encSecret},
          saml_entry_point           = ${b.samlEntryPoint ?? existing.saml_entry_point},
          saml_cert                  = ${b.samlCert ?? existing.saml_cert},
          encrypted_saml_private_key = ${encSamlKey},
          ldap_host                  = ${b.ldapHost ?? existing.ldap_host},
          ldap_port                  = ${b.ldapPort ?? existing.ldap_port},
          ldap_bind_dn               = ${b.ldapBindDn ?? existing.ldap_bind_dn},
          encrypted_ldap_bind_password = ${encLdapPw},
          ldap_search_base           = ${b.ldapSearchBase ?? existing.ldap_search_base},
          ldap_search_filter         = ${b.ldapSearchFilter ?? existing.ldap_search_filter},
          ldap_use_tls               = ${b.ldapUseTls ?? existing.ldap_use_tls},
          group_role_mappings        = ${JSON.stringify(b.groupRoleMappings ?? existing.group_role_mappings ?? {})}::jsonb,
          default_role               = ${b.defaultRole ?? existing.default_role ?? "compliance_analyst"},
          enabled                    = ${b.enabled ?? existing.enabled},
          local_login_enabled        = ${b.localLoginEnabled ?? existing.local_login_enabled ?? true},
          sync_interval_hours        = ${b.syncIntervalHours ?? existing.sync_interval_hours ?? 6},
          updated_at                 = NOW()
        WHERE tenant_id = ${tenantId}
      `);
    } else {
      await db.execute(sql`
        INSERT INTO sso_configurations (
          tenant_id, provider_type, org_name, issuer_url, client_id, encrypted_client_secret,
          saml_entry_point, saml_cert, encrypted_saml_private_key,
          ldap_host, ldap_port, ldap_bind_dn, encrypted_ldap_bind_password,
          ldap_search_base, ldap_search_filter, ldap_use_tls,
          group_role_mappings, default_role, enabled, local_login_enabled,
          sync_interval_hours, created_at, updated_at
        ) VALUES (
          ${tenantId}, ${b.providerType ?? "oidc"}, ${b.orgName ?? null}, ${b.issuerUrl ?? null},
          ${b.clientId ?? null}, ${encSecret},
          ${b.samlEntryPoint ?? null}, ${b.samlCert ?? null}, ${encSamlKey},
          ${b.ldapHost ?? null}, ${b.ldapPort ?? null}, ${b.ldapBindDn ?? null}, ${encLdapPw},
          ${b.ldapSearchBase ?? null}, ${b.ldapSearchFilter ?? null}, ${b.ldapUseTls ?? false},
          ${JSON.stringify(b.groupRoleMappings ?? {})}::jsonb,
          ${b.defaultRole ?? "compliance_analyst"},
          ${b.enabled ?? false}, ${b.localLoginEnabled ?? true},
          ${b.syncIntervalHours ?? 6}, NOW(), NOW()
        )
      `);
    }

    const detail: Record<string, unknown> = { providerType: b.providerType };
    if (b.clientSecret !== undefined) detail["clientSecret"] = "[REDACTED]";
    if (b.ldapBindPassword !== undefined) detail["ldapBindPassword"] = "[REDACTED]";
    await emitSsoAudit(tenantId, "sso_config_updated", email, "", detail);

    const updated = await getSsoConfig(tenantId);
    res.json(updated ? sanitizeConfig(updated) : null);
  } catch (err) {
    console.error("[SSO] PUT /auth/sso/config error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin: POST /auth/sso/test ─────────────────────────────────────────────────

router.post("/auth/sso/test", requireAuth, requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const { tenantId } = getUser(req as Parameters<typeof requireAuth>[0]);
    const cfg = await getSsoConfig(tenantId);
    if (!cfg) {
      res.status(404).json({ error: "No SSO configuration found. Save a configuration first." });
      return;
    }

    const steps: Array<{ label: string; ok: boolean; detail?: string }> = [];

    if (cfg.provider_type === "ldap") {
      if (!cfg.ldap_host || !cfg.ldap_bind_dn || !cfg.encrypted_ldap_bind_password) {
        res.json({ ok: false, steps: [{ label: "Configuration check", ok: false, detail: "ldapHost, ldapBindDn, and ldapBindPassword are required" }] });
        return;
      }
      // Wrap testLdapConnection in a try-catch: the LDAP library may throw on
      // connection failure rather than returning a structured result.  We always
      // want to return { ok, steps } — never a bare 500 — from this endpoint.
      try {
        const result = await testLdapConnection({
          tenantId,
          ldapHost: cfg.ldap_host,
          ldapPort: cfg.ldap_port ?? undefined,
          ldapBindDn: cfg.ldap_bind_dn,
          ldapBindPasswordEnc: cfg.encrypted_ldap_bind_password,
          ldapSearchBase: cfg.ldap_search_base ?? "",
          useTls: cfg.ldap_use_tls,
        });
        // Record fingerprint of the tested config so the guard knows exactly which
        // config version was validated (not just that some test passed).
        if (result.ok) recordSuccessForRow(tenantId, cfg);
        res.json(result);
      } catch (ldapErr) {
        // Connection attempt threw — return a structured failure step so the
        // caller always gets { ok: false, steps: [{ label, ok:false, detail }] }.
        res.json({ ok: false, steps: [{ label: "LDAP connection test", ok: false, detail: String(ldapErr) }] });
      }
      return;
    }

    if (cfg.provider_type === "oidc" || cfg.provider_type === "entra") {
      steps.push({ label: "Configuration check", ok: !!(cfg.issuer_url && cfg.client_id && cfg.encrypted_client_secret) });
      if (!cfg.issuer_url || !cfg.client_id || !cfg.encrypted_client_secret) {
        steps[0]!.detail = "issuerUrl, clientId, and clientSecret are required";
        res.json({ ok: false, steps });
        return;
      }

      try {
        const meta = await discoverOidc(cfg.issuer_url);
        steps.push({ label: "OIDC Discovery (.well-known/openid-configuration)", ok: true, detail: `Found authorization_endpoint: ${meta.authorization_endpoint}` });
      } catch (err) {
        steps.push({ label: "OIDC Discovery (.well-known/openid-configuration)", ok: false, detail: String(err) });
        res.json({ ok: false, steps });
        return;
      }

      steps.push({ label: "Client credentials validation", ok: true, detail: "Client ID is present; secret is encrypted. Full validation requires a live redirect." });
      const oidcOk = steps.every(s => s.ok);
      if (oidcOk) recordSuccessForRow(tenantId, cfg);
      res.json({ ok: oidcOk, steps });
      return;
    }

    if (cfg.provider_type === "saml") {
      steps.push({ label: "Configuration check", ok: !!(cfg.saml_entry_point && cfg.saml_cert) });
      if (!cfg.saml_entry_point || !cfg.saml_cert) {
        steps[0]!.detail = "samlEntryPoint and samlCert are required";
        res.json({ ok: false, steps });
        return;
      }
      try {
        const testSaml = new SAML({
          entryPoint: cfg.saml_entry_point,
          cert: cfg.saml_cert,
          issuer: `grc-platform-tenant-${tenantId}`,
          callbackUrl: "",
          wantAuthnResponseSigned: true,
          validateInResponseTo: "ifPresent",
        });
        const loginUrl = await testSaml.getAuthorizeUrlAsync("", "", {});
        steps.push({ label: "SAML SP metadata generation", ok: true });
        steps.push({ label: "SAML login URL construction", ok: true, detail: `Login URL starts with: ${loginUrl.slice(0, 80)}…` });
      } catch (err) {
        steps.push({ label: "SAML configuration validation", ok: false, detail: String(err) });
      }
      const samlOk = steps.every(s => s.ok);
      if (samlOk) recordSuccessForRow(tenantId, cfg);
      res.json({ ok: samlOk, steps });
      return;
    }

    res.json({ ok: false, steps: [{ label: "Unknown provider type", ok: false }] });
  } catch (err) {
    console.error("[SSO] POST /auth/sso/test error:", err);
    res.status(500).json({ error: String(err) });
  }
});

// ── Admin: GET /auth/sso/audit-log ────────────────────────────────────────────

router.get("/auth/sso/audit-log", requireAuth, requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const { tenantId } = getUser(req as Parameters<typeof requireAuth>[0]);
    const limit = Math.min(parseInt(String(req.query["limit"] ?? "50"), 10), 200);
    const rows = await db.execute(sql`
      SELECT * FROM sso_audit_log
      WHERE tenant_id = ${tenantId}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);
    res.json(rows.rows);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin: POST /auth/ldap/sync ───────────────────────────────────────────────

router.post("/auth/ldap/sync", requireAuth, requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const { tenantId, email } = getUser(req as Parameters<typeof requireAuth>[0]);
    const cfg = await getSsoConfig(tenantId);
    if (!cfg || (cfg.provider_type !== "ldap" && cfg.provider_type !== "entra")) {
      res.status(400).json({ error: "LDAP is not configured for this tenant" });
      return;
    }
    if (!cfg.ldap_host || !cfg.ldap_bind_dn || !cfg.encrypted_ldap_bind_password) {
      res.status(400).json({ error: "Incomplete LDAP configuration — host, bind DN, and password are required" });
      return;
    }

    await emitSsoAudit(tenantId, "ldap_sync_triggered", email, "", { trigger: "manual" });

    const result = await syncLdapUsers({
      tenantId,
      ldapHost: cfg.ldap_host,
      ldapPort: cfg.ldap_port ?? undefined,
      ldapBindDn: cfg.ldap_bind_dn,
      ldapBindPasswordEnc: cfg.encrypted_ldap_bind_password,
      ldapSearchBase: cfg.ldap_search_base ?? "",
      ldapSearchFilter: cfg.ldap_search_filter ?? undefined,
      groupRoleMappings: (cfg.group_role_mappings as Record<string, string>) ?? {},
      defaultRole: cfg.default_role ?? "compliance_analyst",
      useTls: cfg.ldap_use_tls,
    });

    res.json(result);
  } catch (err) {
    console.error("[SSO] POST /auth/ldap/sync error:", err);
    res.status(500).json({ error: String(err) });
  }
});

// ── Public: GET /auth/sso/login ───────────────────────────────────────────────

router.get("/auth/sso/login", async (req, res) => {
  try {
    const tenantId = parseInt(String(req.query["tenantId"] ?? "1"), 10);
    const cfg = await getSsoConfig(tenantId);

    if (!cfg || !cfg.enabled) {
      res.redirect(`/grc-platform/login?error=sso_not_configured`);
      return;
    }

    const baseCallbackUrl = `${getBaseUrl(req)}/api/auth/sso/callback`;

    if (cfg.provider_type === "saml") {
      if (!cfg.saml_entry_point || !cfg.saml_cert) {
        res.redirect(`/grc-platform/login?error=sso_misconfigured`);
        return;
      }
      // Embed tenantId in RelayState so the ACS callback can resolve the correct config.
      const samlRelayState = `${tenantId}:${crypto.randomBytes(12).toString("hex")}`;
      const saml = new SAML({
        entryPoint: cfg.saml_entry_point,
        cert: cfg.saml_cert,
        issuer: `grc-platform-tenant-${tenantId}`,
        callbackUrl: `${baseCallbackUrl}/saml`,
        wantAuthnResponseSigned: true,
        validateInResponseTo: "ifPresent",
      });
      const loginUrl = await saml.getAuthorizeUrlAsync(samlRelayState, "", {});
      res.redirect(loginUrl);
      return;
    }

    if (cfg.provider_type === "oidc" || cfg.provider_type === "entra") {
      if (!cfg.issuer_url || !cfg.client_id) {
        res.redirect(`/grc-platform/login?error=sso_misconfigured`);
        return;
      }
      const meta = await discoverOidc(cfg.issuer_url);
      const stateToken = crypto.randomBytes(16).toString("hex");
      const nonce = crypto.randomBytes(16).toString("hex");

      // Persist state → {tenantId, nonce, redirectUri} so the callback uses
      // the exact same redirect_uri string (IdPs validate this strictly).
      storeOidcState(stateToken, tenantId, nonce, baseCallbackUrl);

      // Bind state to this browser session via an HttpOnly cookie.
      // The callback will reject any request whose cookie doesn't match the
      // state parameter — preventing CSRF / login-flow injection attacks.
      res.cookie("__oidc_state", stateToken, {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 10 * 60 * 1000, // 10 minutes — matches OidcStateEntry TTL
        path: "/api/auth/sso/callback",
      });

      // Entra ID: include the groups claim by requesting offline_access or just
      // openid profile email. Groups are returned in the token only when the app
      // registration has "groupMembershipClaims": "All" or "SecurityGroup".
      const scope = "openid profile email";

      const params = new URLSearchParams({
        response_type: "code",
        client_id: cfg.client_id,
        redirect_uri: baseCallbackUrl,
        scope,
        state: stateToken,
        nonce,
      });

      res.redirect(`${meta.authorization_endpoint}?${params.toString()}`);
      return;
    }

    res.redirect(`/grc-platform/login?error=unsupported_provider`);
  } catch (err) {
    console.error("[SSO] GET /auth/sso/login error:", err);
    res.redirect(`/grc-platform/login?error=sso_error`);
  }
});

// ── Public: GET /auth/sso/initiate/:tenantId ──────────────────────────────────
// Canonical "one-click SSO" entry point with tenantId as a path parameter.
// The redirect_uri registered in the IdP (e.g. Azure App Registration) must be
// set to:  https://<host>/api/auth/sso/callback/oidc
// This is the path that Login.tsx links to.

router.get("/auth/sso/initiate/:tenantId", async (req, res) => {
  const dryRun = req.query["dryRun"] === "true";

  try {
    const tenantId = parseInt(req.params["tenantId"] ?? "1", 10);
    if (isNaN(tenantId)) {
      if (dryRun) { res.send(dryRunHtmlPage(false, {}, "invalid_tenant")); return; }
      res.redirect(`/grc-platform/login?error=invalid_tenant`);
      return;
    }

    const cfg = await getSsoConfig(tenantId);

    // In dry-run mode we allow testing even when SSO is disabled — admins
    // need to be able to verify the config before flipping the enable toggle.
    if (!cfg || (!dryRun && !cfg.enabled)) {
      if (dryRun) { res.send(dryRunHtmlPage(false, {}, "sso_not_configured")); return; }
      res.redirect(`/grc-platform/login?error=sso_not_configured`);
      return;
    }

    const baseUrl = getBaseUrl(req);

    if (cfg.provider_type === "saml") {
      if (!cfg.saml_entry_point || !cfg.saml_cert) {
        if (dryRun) { res.send(dryRunHtmlPage(false, {}, "sso_misconfigured")); return; }
        res.redirect(`/grc-platform/login?error=sso_misconfigured`);
        return;
      }
      // Encode dryRun flag in the RelayState suffix so the ACS callback can
      // detect it without a separate server-side store.
      const samlRelayState = `${tenantId}:${crypto.randomBytes(12).toString("hex")}${dryRun ? ":dryRun" : ""}`;
      const saml = new SAML({
        entryPoint: cfg.saml_entry_point,
        cert: cfg.saml_cert,
        issuer: `grc-platform-tenant-${tenantId}`,
        callbackUrl: `${baseUrl}/api/auth/sso/callback/saml`,
        wantAuthnResponseSigned: true,
        validateInResponseTo: "ifPresent",
      });
      const loginUrl = await saml.getAuthorizeUrlAsync(samlRelayState, "", {});
      res.redirect(loginUrl);
      return;
    }

    if (cfg.provider_type === "oidc" || cfg.provider_type === "entra") {
      if (!cfg.issuer_url || !cfg.client_id) {
        if (dryRun) { res.send(dryRunHtmlPage(false, {}, "sso_misconfigured")); return; }
        res.redirect(`/grc-platform/login?error=sso_misconfigured`);
        return;
      }

      const meta = await discoverOidc(cfg.issuer_url);
      const stateToken = crypto.randomBytes(16).toString("hex");
      const nonce = crypto.randomBytes(16).toString("hex");

      // Dedicated OIDC callback path — easier to register in IdP portals
      const oidcCallbackUrl = `${baseUrl}/api/auth/sso/callback/oidc`;

      storeOidcState(stateToken, tenantId, nonce, oidcCallbackUrl, dryRun);

      res.cookie("__oidc_state", stateToken, {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 10 * 60 * 1000,
        path: "/api/auth/sso/callback",
      });

      const params = new URLSearchParams({
        response_type: "code",
        client_id: cfg.client_id,
        redirect_uri: oidcCallbackUrl,
        scope: "openid profile email",
        state: stateToken,
        nonce,
      });

      res.redirect(`${meta.authorization_endpoint}?${params.toString()}`);
      return;
    }

    if (dryRun) { res.send(dryRunHtmlPage(false, {}, "unsupported_provider")); return; }
    res.redirect(`/grc-platform/login?error=unsupported_provider`);
  } catch (err) {
    console.error("[SSO] GET /auth/sso/initiate/:tenantId error:", err);
    const code = classifySsoError(err, "discovery");
    if (dryRun) { res.send(dryRunHtmlPage(false, {}, code)); return; }
    res.redirect(`/grc-platform/login?error=${code}`);
  }
});

// ── Public: GET /auth/sso/callback (OIDC) ────────────────────────────────────

router.get("/auth/sso/callback", async (req, res) => {
  try {
    const { code, state, error: oidcError } = req.query as Record<string, string>;

    if (oidcError) {
      res.redirect(`/grc-platform/login?error=${encodeURIComponent(oidcError)}`);
      return;
    }

    if (!code || !state) {
      res.redirect(`/grc-platform/login?error=missing_code`);
      return;
    }

    // Best-effort CSRF cookie check.
    // If the cookie is present it MUST match the state param — a mismatch is a
    // genuine CSRF signal and we reject immediately.  If the cookie is absent
    // the browser likely blocked it as a third-party cookie (Safari ITP /
    // Firefox strict mode); the server-side state store is the authoritative
    // gate, so we allow the flow to continue and record the gap in the audit log.
    const cookieState = (req.cookies as Record<string, string>)["__oidc_state"];
    const cookieAbsent = !cookieState;
    if (cookieState && cookieState !== state) {
      res.redirect(`/grc-platform/login?error=invalid_state`);
      return;
    }
    if (cookieState) {
      // Clear the cookie immediately — it is single-use
      res.clearCookie("__oidc_state", { path: "/api/auth/sso/callback" });
    }

    // Validate state against server-side store — rejects replayed/forged requests
    const stateEntry = consumeOidcState(state);
    if (!stateEntry) {
      res.redirect(`/grc-platform/login?error=invalid_state`);
      return;
    }

    if (cookieAbsent) {
      console.warn(
        "[SSO] __oidc_state cookie absent (tenantId=%d) — browser likely blocked it (Safari ITP / Firefox strict mode); server-side state matched, proceeding",
        stateEntry.tenantId,
      );
      void emitSsoAudit(stateEntry.tenantId, "sso_cookie_absent", "system", "", {
        note: "CSRF cookie was absent; server-side state store validated the request. Browser may be blocking third-party cookies.",
      });
    }

    const tenantId = stateEntry.tenantId;
    const cfg = await getSsoConfig(tenantId);

    if (!cfg || !cfg.enabled || !cfg.issuer_url || !cfg.client_id || !cfg.encrypted_client_secret) {
      res.redirect(`/grc-platform/login?error=sso_not_configured`);
      return;
    }

    const meta = await discoverOidc(cfg.issuer_url);
    const clientSecret = decryptToken(cfg.encrypted_client_secret);
    // Use the exact redirect_uri that was sent to the IdP during initiation —
    // IdPs (especially Entra) perform a strict string comparison.
    const callbackRedirectUri = stateEntry.redirectUri;

    const tokens = await exchangeOidcCode(meta.token_endpoint, code, callbackRedirectUri, cfg.client_id, clientSecret);
    if (tokens.error) {
      res.redirect(`/grc-platform/login?error=${encodeURIComponent(tokens.error)}`);
      return;
    }

    const userInfo = await fetchOidcUserInfo(meta.userinfo_endpoint, tokens.access_token);
    const email = userInfo.email ?? userInfo.preferred_username;
    if (!email) {
      res.redirect(`/grc-platform/login?error=no_email_claim`);
      return;
    }

    const { userId, role } = await provisionOrUpdateUser(
      tenantId,
      { email, name: userInfo.name ?? email, groups: userInfo.groups },
      (cfg.group_role_mappings as Record<string, string>) ?? {},
      cfg.default_role ?? "compliance_analyst",
      cfg.provider_type,
    );

    const jwtToken = signToken({ userId, tenantId, role, email });
    res.redirect(`/grc-platform/sso-callback?token=${encodeURIComponent(jwtToken)}`);
  } catch (err) {
    console.error("[SSO] GET /auth/sso/callback error:", err);
    const msg = (err as { message?: string })?.message ?? "";
    let code: string;
    if (msg.includes("SSO provisioning conflict")) {
      code = "provisioning_conflict";
    } else if (msg.includes("OIDC discovery failed") || msg.includes("discovery")) {
      code = classifySsoError(err, "discovery");
    } else if (msg.includes("Token exchange failed")) {
      code = classifySsoError(err, "token_exchange");
    } else {
      code = classifySsoError(err, "generic");
    }
    res.redirect(`/grc-platform/login?error=${code}`);
  }
});

// ── Public: GET /auth/sso/callback/oidc ───────────────────────────────────────
// Dedicated OIDC callback path used by /auth/sso/initiate/:tenantId.
// Register THIS URL in your Azure App Registration / IdP as the redirect URI:
//   https://<host>/api/auth/sso/callback/oidc
// The handler is identical to /auth/sso/callback but uses the /oidc path so
// the two protocols (OIDC vs SAML) have distinct, registerable callback URLs.
// When the originating request had ?dryRun=true, provisioning is skipped and
// the response is a self-closing HTML page that postMessages the result back
// to the Settings panel popup opener.

router.get("/auth/sso/callback/oidc", async (req, res) => {
  // Capture query params before try so they're accessible in catch.
  const { code, state, error: oidcError } = req.query as Record<string, string>;

  // `isDryRun` is set as soon as we can determine the flag from either the
  // state store (pre-consumption via peekDryRun) or from the consumed entry.
  // Hoisting it here ensures the catch block can always test it, even after
  // consumeOidcState() has removed the entry from the store.
  let isDryRun = peekDryRun(state);

  try {
    if (oidcError) {
      // The IdP returned an error (e.g. access_denied, login_required).
      if (isDryRun) { res.send(dryRunHtmlPage(false, {}, oidcError)); return; }
      res.redirect(`/grc-platform/login?error=${encodeURIComponent(oidcError)}`);
      return;
    }

    if (!code || !state) {
      if (isDryRun) { res.send(dryRunHtmlPage(false, {}, "missing_code")); return; }
      res.redirect(`/grc-platform/login?error=missing_code`);
      return;
    }

    // Best-effort CSRF cookie check (see /auth/sso/callback for full rationale).
    // Reject only when the cookie is present but wrong; absent cookie means the
    // browser blocked it as a third-party cookie — the server-side state store
    // is the authoritative gate in that case.
    const cookieState = (req.cookies as Record<string, string>)["__oidc_state"];
    const cookieAbsent = !cookieState;
    if (cookieState && cookieState !== state) {
      if (isDryRun) { res.send(dryRunHtmlPage(false, {}, "invalid_state")); return; }
      res.redirect(`/grc-platform/login?error=invalid_state`);
      return;
    }
    if (cookieState) {
      res.clearCookie("__oidc_state", { path: "/api/auth/sso/callback" });
    }

    const stateEntry = consumeOidcState(state);
    if (!stateEntry) {
      if (isDryRun) { res.send(dryRunHtmlPage(false, {}, "invalid_state")); return; }
      res.redirect(`/grc-platform/login?error=invalid_state`);
      return;
    }

    if (cookieAbsent) {
      console.warn(
        "[SSO] __oidc_state cookie absent (tenantId=%d, dryRun=%s) — browser likely blocked it (Safari ITP / Firefox strict mode); server-side state matched, proceeding",
        stateEntry.tenantId,
        String(!!stateEntry.dryRun),
      );
      void emitSsoAudit(stateEntry.tenantId, "sso_cookie_absent", "system", "", {
        note: "CSRF cookie was absent; server-side state store validated the request. Browser may be blocking third-party cookies.",
        dryRun: !!stateEntry.dryRun,
      });
    }

    // Re-assign from the authoritative consumed entry (peekDryRun may have
    // missed a just-stored entry in an unlikely timing edge case).
    isDryRun = stateEntry.dryRun ?? false;
    const { tenantId, dryRun } = stateEntry;
    const cfg = await getSsoConfig(tenantId);

    // In dry-run mode we don't require the SSO config to be enabled yet
    if (!cfg || (!dryRun && !cfg.enabled) || !cfg.issuer_url || !cfg.client_id || !cfg.encrypted_client_secret) {
      if (dryRun) { res.send(dryRunHtmlPage(false, {}, "sso_not_configured")); return; }
      res.redirect(`/grc-platform/login?error=sso_not_configured`);
      return;
    }

    const meta = await discoverOidc(cfg.issuer_url);
    const clientSecret = decryptToken(cfg.encrypted_client_secret);
    // Use the exact redirect_uri that was sent to the IdP during initiation
    const callbackRedirectUri = stateEntry.redirectUri;

    const tokens = await exchangeOidcCode(meta.token_endpoint, code, callbackRedirectUri, cfg.client_id, clientSecret);
    if (tokens.error) {
      if (dryRun) { res.send(dryRunHtmlPage(false, {}, tokens.error)); return; }
      res.redirect(`/grc-platform/login?error=${encodeURIComponent(tokens.error)}`);
      return;
    }

    const userInfo = await fetchOidcUserInfo(meta.userinfo_endpoint, tokens.access_token);
    const email = userInfo.email ?? userInfo.preferred_username;
    if (!email) {
      if (dryRun) { res.send(dryRunHtmlPage(false, {}, "no_email_claim")); return; }
      res.redirect(`/grc-platform/login?error=no_email_claim`);
      return;
    }

    // ── Dry-run: skip provisioning, return diagnostic HTML ────────────────────
    if (dryRun) {
      const mappings = (cfg.group_role_mappings as Record<string, string>) ?? {};
      const defaultRole = cfg.default_role ?? "compliance_analyst";
      const projectedRole = userInfo.groups?.length
        ? (Object.entries(mappings).find(([g]) =>
            userInfo.groups!.some(ug => ug.toLowerCase().includes(g.toLowerCase()))
          )?.[1] ?? defaultRole)
        : defaultRole;

      res.send(dryRunHtmlPage(true, {
        email,
        name: userInfo.name ?? email,
        role: projectedRole,
        provider: cfg.provider_type,
        groups: userInfo.groups ?? [],
      }));
      return;
    }

    const { userId, role } = await provisionOrUpdateUser(
      tenantId,
      { email, name: userInfo.name ?? email, groups: userInfo.groups },
      (cfg.group_role_mappings as Record<string, string>) ?? {},
      cfg.default_role ?? "compliance_analyst",
      cfg.provider_type,
    );

    const jwtToken = signToken({ userId, tenantId, role, email });
    res.redirect(`/grc-platform/sso-callback?token=${encodeURIComponent(jwtToken)}`);
  } catch (err) {
    console.error("[SSO] GET /auth/sso/callback/oidc error:", err);
    const errMsg = (err as { message?: string })?.message ?? "";
    let errCode: string;
    if (errMsg.includes("SSO provisioning conflict")) {
      errCode = "provisioning_conflict";
    } else if (errMsg.includes("OIDC discovery failed") || errMsg.includes("discovery")) {
      errCode = classifySsoError(err, "discovery");
    } else if (errMsg.includes("Token exchange failed")) {
      errCode = classifySsoError(err, "token_exchange");
    } else {
      errCode = classifySsoError(err, "generic");
    }
    // isDryRun was set before consumeOidcState() so it remains valid here
    // regardless of whether the state entry has since been removed from the store.
    if (isDryRun) { res.send(dryRunHtmlPage(false, {}, errCode)); return; }
    res.redirect(`/grc-platform/login?error=${errCode}`);
  }
});

// ── Public: POST /auth/sso/callback/saml (SAML ACS) ──────────────────────────

router.post("/auth/sso/callback/saml", async (req, res) => {
  // Parse dryRun and relayState BEFORE the try block so they remain in scope
  // inside the catch handler — variables declared inside try are not accessible
  // in catch when an exception is thrown before the declaration is reached.
  const samlResponse = (req.body as Record<string, string>)["SAMLResponse"];
  const relayState = (req.body as Record<string, string>)["RelayState"] ?? "";
  // RelayState format: "${tenantId}:${random}[:dryRun]"
  const relayParts = relayState.split(":");
  const dryRun = relayParts[relayParts.length - 1] === "dryRun";
  const tenantId = parseInt(relayParts[0] ?? "1", 10);

  try {
    if (!samlResponse) {
      if (dryRun) { res.send(dryRunHtmlPage(false, {}, "no_saml_response")); return; }
      res.redirect(`/grc-platform/login?error=no_saml_response`);
      return;
    }
    const cfg = await getSsoConfig(tenantId);

    // In dry-run mode allow even if SSO is not yet enabled
    if (!cfg || (!dryRun && !cfg.enabled) || !cfg.saml_entry_point || !cfg.saml_cert) {
      if (dryRun) { res.send(dryRunHtmlPage(false, {}, "sso_not_configured")); return; }
      res.redirect(`/grc-platform/login?error=sso_not_configured`);
      return;
    }

    const baseCallbackUrl = `${req.protocol}://${req.get("host")}/api/auth/sso/callback/saml`;
    const saml = new SAML({
      entryPoint: cfg.saml_entry_point,
      cert: cfg.saml_cert,
      issuer: `grc-platform-tenant-${tenantId}`,
      callbackUrl: baseCallbackUrl,
      wantAuthnResponseSigned: true,
      validateInResponseTo: "ifPresent",
    });

    const result = await saml.validatePostResponseAsync(req.body as Record<string, string>);
    const profile = result.profile;

    if (!profile?.nameID) {
      if (dryRun) { res.send(dryRunHtmlPage(false, {}, "invalid_saml_assertion")); return; }
      res.redirect(`/grc-platform/login?error=invalid_saml_assertion`);
      return;
    }

    const email = (profile.email as string | undefined) ?? profile.nameID;
    const name = (profile.displayName as string | undefined) ?? (profile.firstName as string | undefined) ?? email;
    const groups = (profile.memberOf as string[] | undefined) ?? [];

    // ── Dry-run: skip provisioning, return diagnostic HTML ────────────────────
    if (dryRun) {
      const mappings = (cfg.group_role_mappings as Record<string, string>) ?? {};
      const defaultRole = cfg.default_role ?? "compliance_analyst";
      const projectedRole = groups.length
        ? (Object.entries(mappings).find(([g]) =>
            groups.some(ug => ug.toLowerCase().includes(g.toLowerCase()))
          )?.[1] ?? defaultRole)
        : defaultRole;
      res.send(dryRunHtmlPage(true, { email, name, role: projectedRole, provider: "saml", groups }));
      return;
    }

    const { userId, role } = await provisionOrUpdateUser(
      tenantId,
      { email, name, groups },
      (cfg.group_role_mappings as Record<string, string>) ?? {},
      cfg.default_role ?? "compliance_analyst",
      "saml",
    );

    const jwtToken = signToken({ userId, tenantId, role, email });
    res.redirect(`/grc-platform/sso-callback?token=${encodeURIComponent(jwtToken)}`);
  } catch (err) {
    console.error("[SSO] POST /auth/sso/callback/saml error:", err);
    // If this was a dry-run request, return dry-run HTML instead of redirecting —
    // even on assertion validation failure — so the popup always closes properly.
    if (dryRun) { res.send(dryRunHtmlPage(false, {}, "saml_validation_failed")); return; }
    res.redirect(`/grc-platform/login?error=saml_validation_failed`);
  }
});

// ── Public: GET /auth/sso/metadata (SAML SP metadata) ────────────────────────

router.get("/auth/sso/metadata/:tenantId", async (req, res) => {
  try {
    const tenantId = parseInt(req.params["tenantId"] ?? "1", 10);
    const cfg = await getSsoConfig(tenantId);

    if (!cfg || cfg.provider_type !== "saml") {
      res.status(404).json({ error: "SAML not configured" });
      return;
    }

    const baseUrl = `${req.protocol}://${req.get("host")}/api`;
    const saml = new SAML({
      entryPoint: cfg.saml_entry_point ?? "",
      cert: cfg.saml_cert ?? "",
      issuer: `grc-platform-tenant-${tenantId}`,
      callbackUrl: `${baseUrl}/auth/sso/callback/saml`,
      wantAuthnResponseSigned: true,
      validateInResponseTo: "ifPresent",
    });

    const metadata = saml.generateServiceProviderMetadata(null, null);
    res.set("Content-Type", "text/xml");
    res.send(metadata);
  } catch {
    res.status(500).json({ error: "Failed to generate SAML metadata" });
  }
});

export default router;
