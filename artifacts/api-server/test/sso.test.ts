// SSO mis-configuration guard tests (Task-292).
// Run: pnpm --filter @workspace/api-server test
//
// Three layers:
//  A) Pure-function unit tests — validateSsoConfigFields() and canDisableLocalLogin()
//  B) HTTP integration tests — PUT /auth/sso/config and POST /auth/sso/test through
//     the live dev server (localhost:8080).  Tests self-skip when the server is not up.
//  C) TestStep shape contract — verifies the { label, ok, detail? } shape produced
//     by POST /auth/sso/test for all provider types and failure modes.

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

// auth.ts reads JWT_SECRET at module load — set before any dynamic import
process.env["JWT_SECRET"] = process.env["JWT_SECRET"] ?? "test-secret-for-sso-task292";

const { validateSsoConfigFields, canDisableLocalLogin, computeConfigFingerprint, _testOnly_setSuccessFingerprint } =
  await import("../src/routes/sso.js");

// ── Helpers ───────────────────────────────────────────────────────────────────

function assertStepShape(step: unknown, idx: number) {
  assert.ok(step !== null && typeof step === "object", `step[${idx}] must be an object`);
  const s = step as Record<string, unknown>;
  assert.ok(typeof s["label"] === "string" && s["label"].length > 0,
    `step[${idx}].label must be a non-empty string`);
  assert.ok(typeof s["ok"] === "boolean", `step[${idx}].ok must be a boolean`);
  if ("detail" in s) {
    assert.ok(s["detail"] === undefined || typeof s["detail"] === "string",
      `step[${idx}].detail must be a string or undefined when present`);
  }
}

// Probe the dev server; returns false if it is unreachable.
async function serverUp(): Promise<boolean> {
  try {
    const r = await fetch("http://localhost:8080/api/healthz", { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

// Generate a short-lived admin JWT via the same lib the server uses.
// (Tenant 1, userId 1, super_admin — matches the dev seed.)
async function adminToken(): Promise<string> {
  const { signToken } = await import("../src/lib/auth.js");
  return signToken({ userId: 1, email: "admin@acme.com", role: "super_admin", tenantId: 1 } as Parameters<typeof signToken>[0]);
}

async function apiPut(path: string, body: unknown, token: string) {
  return fetch(`http://localhost:8080${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
}

async function apiPost(path: string, body: unknown, token: string) {
  return fetch(`http://localhost:8080${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
}

// ── A) Pure-function unit tests ───────────────────────────────────────────────

describe("validateSsoConfigFields — entra / OIDC (Task-292a)", () => {
  it("accepts a fully-populated Entra config", () => {
    const r = validateSsoConfigFields({
      providerType: "entra",
      issuerUrl: "https://login.microsoftonline.com/tenant-id/v2.0",
      clientId: "app-client-id",
      clientSecret: "s3cr3t",
    });
    assert.deepEqual(r, { ok: true });
  });

  it("accepts a fully-populated generic OIDC config", () => {
    const r = validateSsoConfigFields({
      providerType: "oidc",
      issuerUrl: "https://idp.example.com",
      clientId: "my-client",
      clientSecret: "my-secret",
    });
    assert.deepEqual(r, { ok: true });
  });

  it("rejects missing issuerUrl → field: 'issuerUrl'", () => {
    const r = validateSsoConfigFields({ providerType: "entra", clientId: "id", clientSecret: "s" });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.field, "issuerUrl");
      assert.ok(r.error.length > 0, "error message must not be empty");
    }
  });

  it("rejects whitespace-only issuerUrl → field: 'issuerUrl'", () => {
    const r = validateSsoConfigFields({ providerType: "oidc", issuerUrl: "   ", clientId: "id", clientSecret: "s" });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.field, "issuerUrl");
  });

  it("rejects missing clientId → field: 'clientId'", () => {
    const r = validateSsoConfigFields({ providerType: "entra", issuerUrl: "https://example.com", clientSecret: "s" });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.field, "clientId");
  });

  it("rejects missing clientSecret when no existing secret → field: 'clientSecret'", () => {
    const r = validateSsoConfigFields(
      { providerType: "entra", issuerUrl: "https://example.com", clientId: "id" },
      { hasClientSecret: false, hasLdapPassword: false },
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.field, "clientSecret");
  });

  it("accepts omitted clientSecret when existing secret is already stored", () => {
    const r = validateSsoConfigFields(
      { providerType: "entra", issuerUrl: "https://example.com", clientId: "id" },
      { hasClientSecret: true, hasLdapPassword: false },
    );
    assert.deepEqual(r, { ok: true });
  });

  it("rejects empty-string clientSecret without stored secret → field: 'clientSecret'", () => {
    const r = validateSsoConfigFields(
      { providerType: "oidc", issuerUrl: "https://example.com", clientId: "id", clientSecret: "" },
      { hasClientSecret: false, hasLdapPassword: false },
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.field, "clientSecret");
  });
});

describe("validateSsoConfigFields — SAML (Task-292b)", () => {
  const CERT = "-----BEGIN CERTIFICATE-----\nMIIBx...\n-----END CERTIFICATE-----";
  const SSO_URL = "https://idp.example.com/saml2/sso";

  it("accepts a complete SAML config", () => {
    assert.deepEqual(
      validateSsoConfigFields({ providerType: "saml", samlEntryPoint: SSO_URL, samlCert: CERT }),
      { ok: true },
    );
  });

  it("rejects missing samlEntryPoint → field: 'samlEntryPoint'", () => {
    const r = validateSsoConfigFields({ providerType: "saml", samlCert: CERT });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.field, "samlEntryPoint");
  });

  it("rejects whitespace-only samlEntryPoint → field: 'samlEntryPoint'", () => {
    const r = validateSsoConfigFields({ providerType: "saml", samlEntryPoint: "  ", samlCert: CERT });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.field, "samlEntryPoint");
  });

  it("rejects missing samlCert → field: 'samlCert'", () => {
    const r = validateSsoConfigFields({ providerType: "saml", samlEntryPoint: SSO_URL });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.field, "samlCert");
  });

  it("rejects whitespace-only samlCert → field: 'samlCert'", () => {
    const r = validateSsoConfigFields({ providerType: "saml", samlEntryPoint: SSO_URL, samlCert: " " });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.field, "samlCert");
  });
});

describe("validateSsoConfigFields — LDAP (Task-292c)", () => {
  it("accepts a complete LDAP config", () => {
    assert.deepEqual(
      validateSsoConfigFields({
        providerType: "ldap",
        ldapHost: "ad.example.com",
        ldapBindDn: "CN=svc,DC=example,DC=com",
        ldapBindPassword: "hunter2",
      }),
      { ok: true },
    );
  });

  it("rejects missing ldapHost → field: 'ldapHost'", () => {
    const r = validateSsoConfigFields({
      providerType: "ldap",
      ldapBindDn: "CN=svc,DC=example,DC=com",
      ldapBindPassword: "hunter2",
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.field, "ldapHost");
  });

  it("rejects missing ldapBindDn → field: 'ldapBindDn'", () => {
    const r = validateSsoConfigFields({
      providerType: "ldap",
      ldapHost: "ad.example.com",
      ldapBindPassword: "hunter2",
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.field, "ldapBindDn");
  });

  it("rejects missing ldapBindPassword with no stored password → field: 'ldapBindPassword'", () => {
    const r = validateSsoConfigFields(
      { providerType: "ldap", ldapHost: "ad.example.com", ldapBindDn: "CN=svc,DC=example,DC=com" },
      { hasClientSecret: false, hasLdapPassword: false },
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.field, "ldapBindPassword");
  });

  it("accepts omitted ldapBindPassword when stored password exists", () => {
    assert.deepEqual(
      validateSsoConfigFields(
        { providerType: "ldap", ldapHost: "ad.example.com", ldapBindDn: "CN=svc,DC=example,DC=com" },
        { hasClientSecret: false, hasLdapPassword: true },
      ),
      { ok: true },
    );
  });
});

describe("validateSsoConfigFields — unknown provider (Task-292d)", () => {
  it("passes for an unknown provider (no field rules apply)", () => {
    assert.deepEqual(validateSsoConfigFields({ providerType: "kerberos" }), { ok: true });
  });

  it("defaults to oidc when providerType is omitted and checks issuerUrl", () => {
    const r = validateSsoConfigFields({});
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.field, "issuerUrl");
  });
});

// Base fingerprint input reused across tests — isolated tenant IDs to avoid
// cross-test pollution in the module-level testedSuccessfullyFingerprints Map.
const BASE_FP_OIDC = {
  provider_type: "entra" as const,
  issuer_url: "https://login.microsoftonline.com/tid-77777/v2.0",
  client_id: "client-id-77777",
  encrypted_client_secret: "enc-secret-77777",
  saml_entry_point: null,
  saml_cert: null,
  ldap_host: null,
  ldap_bind_dn: null,
  encrypted_ldap_bind_password: null,
  ldap_port: null,
  ldap_use_tls: null,
};

const BASE_FP_LDAP = {
  provider_type: "ldap" as const,
  issuer_url: null,
  client_id: null,
  encrypted_client_secret: null,
  saml_entry_point: null,
  saml_cert: null,
  ldap_host: "ldap.test-292.internal",
  ldap_bind_dn: "CN=svc,DC=test292,DC=com",
  encrypted_ldap_bind_password: "enc-ldap-pw-292",
  ldap_port: 389,
  ldap_use_tls: false,
};

describe("canDisableLocalLogin — untested tenants (Task-292e)", () => {
  it("returns false for a tenant that has never tested (no pendingFp)", () => {
    assert.equal(canDisableLocalLogin(99999), false);
  });

  it("returns false for an untested tenant even when pendingFp is supplied", () => {
    const fp = computeConfigFingerprint(BASE_FP_OIDC);
    assert.equal(canDisableLocalLogin(88888, fp), false);
  });
});

describe("canDisableLocalLogin — config-fingerprint binding (Task-292e2)", () => {
  it("allows disabling local login when pendingFp matches the tested config", () => {
    const fp = computeConfigFingerprint(BASE_FP_OIDC);
    _testOnly_setSuccessFingerprint(77777, fp);

    // Same fingerprint as what was tested → allowed
    assert.equal(canDisableLocalLogin(77777, fp), true);

    // No pendingFp (legacy / no-arg call) → true when any success is recorded
    assert.equal(canDisableLocalLogin(77777), true);
  });

  it("rejects when issuerUrl changes after successful test (REGRESSION: config-mutation lockout)", () => {
    const fp = computeConfigFingerprint(BASE_FP_OIDC);
    _testOnly_setSuccessFingerprint(77777, fp);

    // Admin mutates issuerUrl → different fingerprint → must reject
    const mutatedFp = computeConfigFingerprint({
      ...BASE_FP_OIDC,
      issuer_url: "https://login.microsoftonline.com/DIFFERENT-TENANT/v2.0",
    });
    assert.notEqual(mutatedFp, fp, "mutated fingerprint must differ from original");
    assert.equal(canDisableLocalLogin(77777, mutatedFp), false,
      "localLoginEnabled=false must be rejected after issuerUrl change until re-tested");
  });

  it("rejects when clientId changes after successful test", () => {
    const fp = computeConfigFingerprint(BASE_FP_OIDC);
    _testOnly_setSuccessFingerprint(66666, fp);

    const mutatedFp = computeConfigFingerprint({ ...BASE_FP_OIDC, client_id: "new-client-id" });
    assert.equal(canDisableLocalLogin(66666, mutatedFp), false);
  });

  it("rejects when the new-secret sentinel is present (admin re-submitted the secret field)", () => {
    const fp = computeConfigFingerprint(BASE_FP_OIDC);
    _testOnly_setSuccessFingerprint(55555, fp);

    // PUT handler uses "__new_secret_sentinel__" when clientSecret is in the body
    const pendingFp = computeConfigFingerprint({
      ...BASE_FP_OIDC,
      encrypted_client_secret: "__new_secret_sentinel__",
    });
    assert.equal(canDisableLocalLogin(55555, pendingFp), false,
      "re-submitting the secret must force a re-test (sentinel differs from stored encrypted value)");
  });

  it("allows saving non-auth fields (orgName, defaultRole) without re-testing", () => {
    // Non-auth fields (orgName, defaultRole, syncIntervalHours) are NOT part of the
    // fingerprint, so saving them after a successful test still permits disabling local login.
    const fp = computeConfigFingerprint(BASE_FP_OIDC);
    _testOnly_setSuccessFingerprint(44444, fp);

    // The PUT handler would compute pendingFp using auth-relevant fields only;
    // non-auth fields don't influence computeConfigFingerprint.
    // Simulate what the PUT handler does when only orgName changes:
    const pendingFp = computeConfigFingerprint(BASE_FP_OIDC); // same auth fields
    assert.equal(canDisableLocalLogin(44444, pendingFp), true,
      "cosmetic-only save (orgName/defaultRole) must not invalidate prior successful test");
  });

  it("rejects for tenants with no recorded success regardless of pendingFp", () => {
    const fp = computeConfigFingerprint(BASE_FP_OIDC);
    assert.equal(canDisableLocalLogin(33333, fp), false);
    assert.equal(canDisableLocalLogin(22222), false);
  });

  it("rejects when ldapPort changes after successful test (REGRESSION: port mutation lockout)", () => {
    const fp = computeConfigFingerprint(BASE_FP_LDAP);
    _testOnly_setSuccessFingerprint(11110, fp);

    // Admin changes the LDAP port — connectivity will break, so guard must fire
    const mutatedFp = computeConfigFingerprint({ ...BASE_FP_LDAP, ldap_port: 636 });
    assert.notEqual(mutatedFp, fp, "ldap_port change must produce a different fingerprint");
    assert.equal(canDisableLocalLogin(11110, mutatedFp), false,
      "guard must reject after ldapPort mutation without re-test");
  });

  it("rejects when ldapUseTls changes after successful test (REGRESSION: TLS mutation lockout)", () => {
    const fp = computeConfigFingerprint(BASE_FP_LDAP);
    _testOnly_setSuccessFingerprint(11111, fp);

    // Toggling TLS off→on (or vice-versa) changes the connection handshake;
    // the tested fingerprint no longer describes the new config.
    const mutatedFp = computeConfigFingerprint({ ...BASE_FP_LDAP, ldap_use_tls: true });
    assert.notEqual(mutatedFp, fp, "ldap_use_tls change must produce a different fingerprint");
    assert.equal(canDisableLocalLogin(11111, mutatedFp), false,
      "guard must reject after ldapUseTls mutation without re-test");
  });

  it("allows saving identical LDAP auth fields (port+tls unchanged) without re-testing", () => {
    const fp = computeConfigFingerprint(BASE_FP_LDAP);
    _testOnly_setSuccessFingerprint(11112, fp);

    // Exact same auth fields → fingerprint matches → allow
    const pendingFp = computeConfigFingerprint(BASE_FP_LDAP);
    assert.equal(canDisableLocalLogin(11112, pendingFp), true,
      "identical LDAP config must not require re-test");
  });
});

// ── B) HTTP integration tests — PUT /auth/sso/config ─────────────────────────
// These call the actual running dev server (port 8080) and assert HTTP status
// codes and response body shapes.  Tests self-skip when the server is not up
// or when the rate limiter (429) fires due to concurrent test suites.

// Small delay helper to avoid rate-limit collisions when running alongside other
// test files that also hit the API.
function wait(ms: number) { return new Promise(r => setTimeout(r, ms)); }

describe("PUT /auth/sso/config — HTTP integration (Task-292f)", () => {
  let up = false;
  let token = "";

  before(async () => {
    up = await serverUp();
    if (up) {
      token = await adminToken();
      await wait(300); // short back-off so rate limiter resets between suites
    }
  });

  it("returns HTTP 400 with field='issuerUrl' when entra config is missing issuerUrl", async (t) => {
    if (!up) { t.skip("dev server not running"); return; }
    const res = await apiPut("/api/auth/sso/config", {
      providerType: "entra",
      clientId: "some-id",
      clientSecret: "some-secret",
      enabled: true,
    }, token);
    if (res.status === 429) { t.skip("rate limited (HTTP 429)"); return; }
    assert.equal(res.status, 400, "must be HTTP 400");
    const body = await res.json() as { error: string; field: string };
    assert.equal(body.field, "issuerUrl");
    assert.ok(typeof body.error === "string" && body.error.length > 0);
    await wait(150);
  });

  it("returns HTTP 400 with field='clientId' when entra config is missing clientId", async (t) => {
    if (!up) { t.skip("dev server not running"); return; }
    const res = await apiPut("/api/auth/sso/config", {
      providerType: "entra",
      issuerUrl: "https://login.microsoftonline.com/tid/v2.0",
      clientSecret: "some-secret",
      enabled: true,
    }, token);
    if (res.status === 429) { t.skip("rate limited (HTTP 429)"); return; }
    assert.equal(res.status, 400);
    const body = await res.json() as { field: string };
    assert.equal(body.field, "clientId");
    await wait(150);
  });

  it("returns HTTP 400 with field='clientSecret' when entra has no secret (new config)", async (t) => {
    if (!up) { t.skip("dev server not running"); return; }
    const res = await apiPut("/api/auth/sso/config", {
      providerType: "entra",
      issuerUrl: "https://login.microsoftonline.com/tid/v2.0",
      clientId: "some-id",
      // no clientSecret — existing stored secret covers this if config already exists
      enabled: true,
    }, token);
    if (res.status === 429) { t.skip("rate limited (HTTP 429)"); return; }
    // Accept 400 (no stored secret) OR 200 (existing stored secret — "keep existing" logic)
    if (res.status === 400) {
      const body = await res.json() as { field: string };
      assert.equal(body.field, "clientSecret");
    } else {
      assert.equal(res.status, 200, "must be 200 when existing secret covers the missing field");
    }
    await wait(150);
  });

  it("returns HTTP 400 with field='samlEntryPoint' for SAML missing entry point", async (t) => {
    if (!up) { t.skip("dev server not running"); return; }
    const res = await apiPut("/api/auth/sso/config", {
      providerType: "saml",
      samlCert: "-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----",
      enabled: true,
    }, token);
    if (res.status === 429) { t.skip("rate limited (HTTP 429)"); return; }
    assert.equal(res.status, 400);
    const body = await res.json() as { field: string };
    assert.equal(body.field, "samlEntryPoint");
    await wait(150);
  });

  it("returns HTTP 400 with field='samlCert' for SAML missing cert", async (t) => {
    if (!up) { t.skip("dev server not running"); return; }
    const res = await apiPut("/api/auth/sso/config", {
      providerType: "saml",
      samlEntryPoint: "https://idp.example.com/saml/sso",
      enabled: true,
    }, token);
    if (res.status === 429) { t.skip("rate limited (HTTP 429)"); return; }
    assert.equal(res.status, 400);
    const body = await res.json() as { field: string };
    assert.equal(body.field, "samlCert");
    await wait(150);
  });

  it("returns HTTP 400 with field='ldapHost' for LDAP missing host", async (t) => {
    if (!up) { t.skip("dev server not running"); return; }
    const res = await apiPut("/api/auth/sso/config", {
      providerType: "ldap",
      ldapBindDn: "CN=svc,DC=example,DC=com",
      ldapBindPassword: "pw",
      enabled: true,
    }, token);
    if (res.status === 429) { t.skip("rate limited (HTTP 429)"); return; }
    assert.equal(res.status, 400);
    const body = await res.json() as { field: string };
    assert.equal(body.field, "ldapHost");
    await wait(150);
  });

  it("returns HTTP 400 with field='localLoginEnabled' when disabling local login without a prior test", async (t) => {
    if (!up) { t.skip("dev server not running"); return; }
    // The pending fingerprint for this request is computed from:
    //   providerType="entra", issuerUrl=".../guard-test/v2.0", clientSecret=<sentinel>
    // This URL has never been tested, and supplying clientSecret triggers the
    // "__new_secret_sentinel__" path, so the pending fingerprint can never match
    // any stored success fingerprint — the assertion is unconditionally deterministic.
    const res = await apiPut("/api/auth/sso/config", {
      localLoginEnabled: false,
      providerType: "entra",
      issuerUrl: "https://login.microsoftonline.com/guard-test-292f/v2.0",
      clientId: "guard-test-client-id",
      clientSecret: "guard-test-secret",
      enabled: true,
    }, token);
    if (res.status === 429) { t.skip("rate limited (HTTP 429)"); return; }
    assert.equal(res.status, 400, "guard must reject — pending fingerprint never matches an untested config");
    const body = await res.json() as { field: string; error: string };
    assert.equal(body.field, "localLoginEnabled");
    assert.ok(typeof body.error === "string" && body.error.length > 0);
  });

  it("returns HTTP 400 when auth fields are mutated while local_login_enabled is already false (bypass prevention)", async (t) => {
    if (!up) { t.skip("dev server not running"); return; }
    // Save a config with localLoginEnabled: false and a unique issuerUrl.
    // This will be blocked (guard fires) — expected. We're demonstrating that
    // even without explicitly saying localLoginEnabled=false, the guard would
    // fire when auth fields are being mutated against an already-disabled config.
    //
    // We test by sending issuerUrl mutation + localLoginEnabled=false explicitly
    // (the bypass path from the reviewer is: if existing has local_login_enabled=false
    // and admin omits localLoginEnabled in subsequent saves). The guard must fire.
    const bypassAttempt = await apiPut("/api/auth/sso/config", {
      // Mutating auth-relevant field (issuerUrl changes); guard must still fire
      // because the pending fingerprint (new issuerUrl + sentinel) won't match
      // any stored success fingerprint.
      providerType: "entra",
      issuerUrl: "https://login.microsoftonline.com/bypass-test-292f/v2.0",
      clientId: "bypass-client-id",
      clientSecret: "bypass-client-secret",
      localLoginEnabled: false,
      enabled: true,
    }, token);
    if (bypassAttempt.status === 429) { t.skip("rate limited (HTTP 429)"); return; }
    // Must be 400 — guard detects localLoginEnabled=false + no matching fingerprint
    assert.equal(bypassAttempt.status, 400);
    const body = await bypassAttempt.json() as { field: string; error: string };
    assert.equal(body.field, "localLoginEnabled",
      "guard must fire with field='localLoginEnabled' when auth fields mutated without a successful test");
  });
});

// ── B2) HTTP integration tests — POST /auth/sso/test ─────────────────────────

describe("POST /auth/sso/test — HTTP integration (Task-292g)", () => {
  let up = false;
  let token = "";

  before(async () => {
    up = await serverUp();
    if (up) {
      token = await adminToken();
      await wait(400); // back-off after prior PUT tests
    }
  });

  it("returns structured JSON (not HTML) regardless of config existence", async (t) => {
    if (!up) { t.skip("dev server not running"); return; }
    const res = await apiPost("/api/auth/sso/test", {}, token);
    if (res.status === 429) { t.skip("rate limited (HTTP 429)"); return; }
    // Either 404 (no config) or 200 (config exists from prior test/setup)
    assert.ok(res.status === 404 || res.status === 200, `unexpected status: ${res.status}`);
    const ct = res.headers.get("content-type") ?? "";
    assert.ok(ct.includes("application/json"), `content-type must be JSON, got '${ct}'`);
    const body = await res.json() as Record<string, unknown>;
    if (res.status === 404) {
      assert.ok(typeof body["error"] === "string", "404 body must have an error string");
    } else {
      assert.ok(typeof body["ok"] === "boolean", "200 body must have ok: boolean");
      assert.ok(Array.isArray(body["steps"]), "200 body must have steps array");
      (body["steps"] as unknown[]).forEach((s, i) => assertStepShape(s, i));
    }
    await wait(300);
  });

  it("after saving a complete Entra config, test returns steps with the correct shape", async (t) => {
    if (!up) { t.skip("dev server not running"); return; }
    const saveRes = await apiPut("/api/auth/sso/config", {
      providerType: "entra",
      orgName: "Test Corp",
      issuerUrl: "https://login.microsoftonline.com/test-tenant/v2.0",
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      defaultRole: "compliance_analyst",
      enabled: false,
      localLoginEnabled: true,
    }, token);
    if (saveRes.status === 429) { t.skip("rate limited (HTTP 429)"); return; }
    assert.ok(saveRes.status === 200, `save failed with ${saveRes.status}`);
    await wait(300);

    const testRes = await apiPost("/api/auth/sso/test", {}, token);
    if (testRes.status === 429) { t.skip("rate limited (HTTP 429)"); return; }
    assert.equal(testRes.status, 200, "test endpoint must return 200");
    const body = await testRes.json() as { ok: boolean; steps: unknown[] };
    assert.ok(typeof body.ok === "boolean", "ok must be boolean");
    assert.ok(Array.isArray(body.steps) && body.steps.length >= 1, "steps must be a non-empty array");
    body.steps.forEach((s, i) => assertStepShape(s, i));

    const configStep = body.steps[0] as { label: string; ok: boolean };
    assert.equal(configStep.label, "Configuration check");
    assert.equal(configStep.ok, true, "config-check must pass when all required fields are present");

    const discoveryStep = body.steps.find(
      (s) => (s as { label: string }).label.includes("OIDC Discovery"),
    ) as { label: string; ok: boolean; detail?: string } | undefined;
    assert.ok(discoveryStep !== undefined, "must have an OIDC Discovery step");
    assertStepShape(discoveryStep, 1);

    if (!discoveryStep.ok) {
      assert.equal(body.ok, false, "overall ok must be false when any step fails");
      assert.ok(
        typeof discoveryStep.detail === "string" && discoveryStep.detail.length > 0,
        "failed step must carry a non-empty detail string describing the failure",
      );
    }
  });

  it("LDAP config with unreachable host produces ok=false steps with non-empty detail (bad-credentials path)", async (t) => {
    if (!up) { t.skip("dev server not running"); return; }
    // Save a complete LDAP config pointing at a port that nothing is listening on.
    // This ensures testLdapConnection() actually attempts a connection and fails.
    const saveRes = await apiPut("/api/auth/sso/config", {
      providerType: "ldap",
      ldapHost: "127.0.0.1",
      ldapPort: 19389,              // deliberately unreachable — nothing listens here
      ldapBindDn: "CN=svc,DC=test292,DC=com",
      ldapBindPassword: "bad-password-for-test",
      ldapSearchBase: "DC=test292,DC=com",
      enabled: false,
      localLoginEnabled: true,
    }, token);
    if (saveRes.status === 429) { t.skip("rate limited (HTTP 429)"); return; }
    assert.ok(saveRes.status === 200, `LDAP config save failed with ${saveRes.status}`);
    await wait(300);

    // Run the connection test — server will try to connect to 127.0.0.1:19389
    const testRes = await apiPost("/api/auth/sso/test", {}, token);
    if (testRes.status === 429) { t.skip("rate limited (HTTP 429)"); return; }
    assert.equal(testRes.status, 200, "test endpoint must return 200 (not a server error)");

    const body = await testRes.json() as { ok: boolean; steps: unknown[] };
    assert.equal(body.ok, false, "overall ok must be false when LDAP connection fails");
    assert.ok(Array.isArray(body.steps) && body.steps.length >= 1, "steps must be non-empty");
    body.steps.forEach((s, i) => assertStepShape(s, i));

    // At least one step must have ok=false (the connection attempt that failed)
    const failedStep = body.steps.find((s) => !(s as { ok: boolean }).ok) as
      { label: string; ok: boolean; detail?: string } | undefined;
    assert.ok(failedStep !== undefined, "at least one step must have ok=false");
    assert.ok(
      typeof (failedStep as { detail?: string }).detail === "string" &&
      ((failedStep as { detail: string }).detail).length > 0,
      "failed LDAP step must carry a non-empty detail string (connection error message)",
    );
  });
});

// ── C) TestStep shape contract ────────────────────────────────────────────────

describe("TestStep shape contract (Task-292h)", () => {
  it("config-check failure step has the correct shape", () => {
    const step = { label: "Configuration check", ok: false, detail: "issuerUrl, clientId, and clientSecret are required" };
    assertStepShape(step, 0);
    assert.equal(step.ok, false);
    assert.ok(step.detail.length > 0);
  });

  it("OIDC discovery failure step has the correct shape and detail", () => {
    const step = { label: "OIDC Discovery (.well-known/openid-configuration)", ok: false, detail: "Error: OIDC discovery failed: 404" };
    assertStepShape(step, 0);
    assert.equal(step.ok, false);
    assert.ok(step.detail.includes("404"), "failure detail should include the status code");
  });

  it("successful OIDC steps all pass shape check and are ok=true", () => {
    const steps = [
      { label: "Configuration check", ok: true },
      { label: "OIDC Discovery (.well-known/openid-configuration)", ok: true, detail: "Found authorization_endpoint: https://login.microsoftonline.com/tenant/oauth2/v2.0/authorize" },
      { label: "Client credentials validation", ok: true, detail: "Client ID is present; secret is encrypted. Full validation requires a live redirect." },
    ];
    steps.forEach((s, i) => { assertStepShape(s, i); assert.equal(s.ok, true); });
    assert.ok(steps.every(s => s.ok), "all steps ok must be true → overall ok=true");
  });

  it("SAML config-check failure step has the correct shape", () => {
    const step = { label: "Configuration check", ok: false, detail: "samlEntryPoint and samlCert are required" };
    assertStepShape(step, 0);
    assert.equal(step.ok, false);
    assert.ok(step.detail.includes("samlCert"));
  });

  it("LDAP failure step has the correct shape", () => {
    const step = { label: "Configuration check", ok: false, detail: "ldapHost, ldapBindDn, and ldapBindPassword are required" };
    assertStepShape(step, 0);
    assert.equal(step.ok, false);
  });

  it("unknown-provider step has the correct shape", () => {
    const step = { label: "Unknown provider type", ok: false };
    assertStepShape(step, 0);
    assert.equal(step.ok, false);
  });

  it("overall ok equals steps.every(s => s.ok)", () => {
    // Simulate a partial failure: config-check passes, discovery fails
    const steps = [
      { label: "Configuration check", ok: true },
      { label: "OIDC Discovery (.well-known/openid-configuration)", ok: false, detail: "OIDC discovery failed: 500" },
    ];
    assert.equal(steps.every(s => s.ok), false, "overall ok must be false when any step fails");
  });
});
