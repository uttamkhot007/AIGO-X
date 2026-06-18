/**
 * AIGO-X Agent Push Smoke Test
 *
 * Runs a full end-to-end signed ComplyOps push against the agent gateway:
 *   1. Register an agent (enroll token → access_token + hmac_secret)
 *   2. Build a ComplyOps payload
 *   3. Compute HMAC-SHA256 over canonical JSON of the payload
 *   4. POST /v1/agent/push with the signature
 *   5. Assert HTTP 200 and a non-zero ingestion count
 *
 * Usage:
 *   AIGO_ENROLL_TOKEN=<token> BASE_URL=http://localhost:3001 tsx scripts/src/agent-smoke-test.ts
 *
 * Environment variables:
 *   AIGO_ENROLL_TOKEN  — required; the bootstrap enroll token configured on the API server
 *   BASE_URL           — optional; defaults to http://localhost:3001
 */

import { createHmac } from "crypto";

const BASE_URL = (process.env["BASE_URL"] ?? "http://localhost:8080").replace(/\/$/, "");
const ENROLL_TOKEN = process.env["AIGO_ENROLL_TOKEN"] ?? "";

if (!ENROLL_TOKEN) {
  console.error("ERROR: AIGO_ENROLL_TOKEN env var is required");
  process.exit(1);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonicalJson).join(",") + "]";
  const sorted = Object.keys(obj as Record<string, unknown>).sort();
  return (
    "{" +
    sorted
      .map((k) => JSON.stringify(k) + ":" + canonicalJson((obj as Record<string, unknown>)[k]))
      .join(",") +
    "}"
  );
}

function hmacSign(payload: unknown, secret: string): string {
  const canonical = canonicalJson(payload);
  return createHmac("sha256", secret).update(canonical).digest("hex");
}

async function post(path: string, body: unknown, token?: string): Promise<{ status: number; data: unknown }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`  ✗ FAIL — ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

// ── Step 1: Register agent ─────────────────────────────────────────────────────

console.log("\n[1] Registering agent...");
const regResult = await post(
  "/api/v1/agent/auth/register",
  {
    hostname: "smoke-test-host",
    os: "linux",
    arch: "x86_64",
    version: "1.0.0-smoke",
    tags: ["smoke-test"],
  },
  ENROLL_TOKEN,
);

assert(regResult.status === 201, `Registration returned HTTP ${regResult.status} (expected 201)`);

const reg = regResult.data as {
  agent_id: string;
  access_token: string;
  hmac_secret: string;
};

assert(typeof reg.agent_id === "string" && reg.agent_id.length > 0, `Got agent_id: ${reg.agent_id}`);
assert(typeof reg.access_token === "string" && reg.access_token.length > 0, "Got access_token");
assert(typeof reg.hmac_secret === "string" && reg.hmac_secret.length > 0, "Got hmac_secret");

console.log(`  → agent_id: ${reg.agent_id}`);

// ── Step 2: Build ComplyOps payload ───────────────────────────────────────────

const complyOpsPayload = {
  policy_findings: [
    { id: "CIS-1.1", name: "Ensure password expiry is set",      status: "pass", framework: "CIS Benchmark", severity: "Medium" },
    { id: "CIS-1.2", name: "Ensure MFA is enabled for all users", status: "fail", framework: "CIS Benchmark", severity: "High"   },
    { id: "CIS-2.1", name: "Ensure audit logging is enabled",     status: "pass", framework: "CIS Benchmark", severity: "High"   },
  ],
};

// ── Step 3: Compute HMAC-SHA256 signature ─────────────────────────────────────

console.log("\n[2] Signing payload with HMAC-SHA256...");
const signature = hmacSign(complyOpsPayload, reg.hmac_secret);
console.log(`  → canonical JSON length: ${canonicalJson(complyOpsPayload).length} bytes`);
console.log(`  → signature (hex): ${signature}`);

// ── Step 4: Send signed push ──────────────────────────────────────────────────

console.log("\n[3] Sending signed ComplyOps push...");
const pushResult = await post(
  "/api/v1/agent/push",
  {
    result_type: "complyops",
    payload: complyOpsPayload,
    payload_signature: signature,
    checks_run: 3,
    checks_passed: 2,
    checks_failed: 1,
    score: 67,
  },
  reg.access_token,
);

assert(pushResult.status === 200, `Push returned HTTP ${pushResult.status} (expected 200)`);

const push = pushResult.data as { ok: boolean; ingested: { controls: number } };
assert(push.ok === true, "Response body ok === true");
assert(typeof push.ingested === "object" && push.ingested !== null, "Response has ingested object");
assert(push.ingested.controls > 0, `Ingested ${push.ingested.controls} control(s) (expected > 0)`);

console.log(`  → ingested: ${JSON.stringify(push.ingested)}`);

// ── Step 5: Confirm unsigned push is rejected ─────────────────────────────────

console.log("\n[4] Confirming unsigned push is rejected (403)...");
const unsignedResult = await post(
  "/api/v1/agent/push",
  {
    result_type: "complyops",
    payload: complyOpsPayload,
    // intentionally omitting payload_signature
  },
  reg.access_token,
);

assert(unsignedResult.status === 403, `Unsigned push returned HTTP ${unsignedResult.status} (expected 403)`);

// ── Step 6: Confirm tampered signature is rejected ───────────────────────────

console.log("\n[5] Confirming tampered signature is rejected (403)...");
const badSig = signature.replace(/^./, signature[0] === "a" ? "b" : "a");
const tamperedResult = await post(
  "/api/v1/agent/push",
  {
    result_type: "complyops",
    payload: complyOpsPayload,
    payload_signature: badSig,
  },
  reg.access_token,
);

assert(tamperedResult.status === 403, `Tampered push returned HTTP ${tamperedResult.status} (expected 403)`);

// ── Done ──────────────────────────────────────────────────────────────────────

console.log("\n✅  All smoke test assertions passed.\n");
