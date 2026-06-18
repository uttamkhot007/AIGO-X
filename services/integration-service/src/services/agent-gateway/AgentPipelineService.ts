import { db } from "@workspace/service-kit";
import { findingsTable, controlsTable, ticketsTable } from "@workspace/db";
import { randomUUID, verify as cryptoVerify, createPublicKey, createHmac, timingSafeEqual } from "crypto";
import { caasmService } from "../caasm/index.js";
import type {
  PushRequest,
  ComplyOpsPayload,
  AssetOpsPayload,
  DataOpsPayload,
  SecOpsPayload,
  ServiceOpsPayload,
} from "./agentPayloadSchemas.js";

let _seq = Date.now();
const nextId = (prefix: string) => `${prefix}-${++_seq}`;

export interface IngestResult {
  controls: number;
  assets: number;
  findings: number;
  tickets: number;
  warnings: string[];
}

export interface AgentCryptoCtx {
  hmacSecret: string;
  publicKey?: string;
}

// Ed25519 SPKI DER prefix (12 bytes) for 32-byte raw public keys
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

// Rust agent sends pubkey and signature as lowercase hex strings.
// Uses one-shot crypto.verify(null, ...) — correct for Ed25519 (no streaming digest).
function verifyEd25519(payloadStr: string, sigHex: string, pubKeyHex: string): boolean {
  try {
    const rawPubKey = Buffer.from(pubKeyHex, "hex");
    if (rawPubKey.length !== 32) throw new Error("Invalid Ed25519 public key length");
    const spki = Buffer.concat([ED25519_SPKI_PREFIX, rawPubKey]);
    const key = createPublicKey({ key: spki, format: "der", type: "spki" });
    const sigBuf = Buffer.from(sigHex, "hex");
    return cryptoVerify(null, Buffer.from(payloadStr), key, sigBuf);
  } catch {
    return false;
  }
}

// Produce deterministic canonical JSON (sorted keys, no whitespace) matching the Rust agent
function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonicalJson).join(",") + "]";
  const sorted = Object.keys(obj as Record<string, unknown>).sort();
  return "{" + sorted.map(k => JSON.stringify(k) + ":" + canonicalJson((obj as Record<string, unknown>)[k])).join(",") + "}";
}

// Rust agent derives HMAC using the hmac_secret string as plain UTF-8 bytes (not hex-decoded)
function verifyHmac(payload: unknown, sig: string, secret: string): boolean {
  try {
    const canonical = canonicalJson(payload);
    const expected = createHmac("sha256", secret).update(canonical).digest("hex");
    const expectedBuf = Buffer.from(expected, "hex");
    const sigBuf = Buffer.from(sig, "hex");
    if (expectedBuf.length !== sigBuf.length) return false;
    return timingSafeEqual(expectedBuf, sigBuf);
  } catch {
    return false;
  }
}

async function processComplyOps(agentId: string, tenantId: number, payload: ComplyOpsPayload): Promise<Partial<IngestResult>> {
  let controls = 0;
  const findings = payload.policy_findings ?? [];
  const DUE = (days = 30) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };

  for (const f of findings) {
    const status = f.status === "pass" ? "implemented" : f.status === "fail" ? "not-started" : "in-review";
    await db.insert(controlsTable).values({
      tenantId,
      controlId: `AGTC-${agentId.slice(-4)}-${f.id}`.slice(0, 40),
      framework: f.framework || "CIS Benchmark",
      domain: "Endpoint Compliance",
      name: `[Agent: ${agentId}] ${f.name}`,
      status,
      owner: "agent@aigo-x.io",
      evidence: f.status === "pass" ? 1 : 0,
      dueDate: DUE(30),
    }).onConflictDoNothing();
    controls++;
  }

  return { controls, findings: 0, assets: 0, tickets: 0 };
}

async function processAssetOps(agentId: string, tenantId: number, payload: AssetOpsPayload): Promise<Partial<IngestResult>> {
  let findings = 0;
  const softwareList = payload.software ?? [];
  const hw = payload.hardware;

  // Persist hardware asset into CAASM store (asset inventory) + a findings record for auditability
  if (hw) {
    const model = [hw.manufacturer, hw.model].filter(Boolean).join(" ") || hw.cpu;

    // Primary: create a CAASM asset so it surfaces in Settings → Assets
    caasmService.createAsset(String(tenantId), {
      hostname:       `agent-${agentId.slice(-8)}`,
      category:       "Server",
      confidence:     "High",
      os:             hw.cpu,
      ip:             "0.0.0.0",
      manufacturer:   hw.manufacturer ?? "Unknown",
      risk:           "Low",
      managed:        true,
      dept:           "IT Ops",
      tags:           ["aigo-agent", `agent:${agentId}`, "endpoint"],
      antivirus:      "N/A",
      agentVersion:   "unknown",
      lastSeen:       new Date().toISOString().slice(0, 10),
      exposureScore:  0,
      vulnCount:      0,
      critVulns:      0,
      serialNumber:   hw.serial,
      environment:    "Corporate",
      dataSensitivity:"Internal",
    });

    // Secondary: findings record for CSPM/audit trail
    await db.insert(findingsTable).values({
      tenantId,
      findingId: nextId("AGTH"),
      cloud: "SoftInv-Agent",
      severity: "Low",
      title: `[Agent ${agentId}] HW: ${model} — RAM:${hw.ram_gb}GB Disk:${hw.disk_gb}GB`,
      resource: `agent:${agentId}:hardware:${hw.serial ?? hw.model ?? hw.cpu}`,
      status: "open",
    }).onConflictDoNothing();
    findings++;
  }

  // Persist all software entries — severity driven by CVE count
  for (const sw of softwareList) {
    const severity = sw.cve_count >= 5 ? "Critical" : sw.cve_count >= 3 ? "High" : sw.cve_count >= 1 ? "Medium" : "Low";
    const cveNote = sw.cve_count > 0 ? ` — ${sw.cve_count} CVE(s)` : "";
    await db.insert(findingsTable).values({
      tenantId,
      findingId: nextId("AGTS"),
      cloud: "SoftInv-Agent",
      severity,
      title: `[Agent ${agentId}] ${sw.name} ${sw.version} (${sw.vendor})${cveNote}`,
      resource: `agent:${agentId}:software:${sw.name}`,
      status: sw.cve_count > 0 ? "open" : "resolved",
    }).onConflictDoNothing();
    findings++;
  }

  return { findings, controls: 0, assets: softwareList.length + (hw ? 1 : 0), tickets: 0 };
}

async function processDataOps(agentId: string, tenantId: number, payload: DataOpsPayload): Promise<Partial<IngestResult>> {
  let findings = 0;
  const stores = payload.stores ?? [];

  for (const store of stores) {
    const hasHighRisk = store.risk_level === "Critical" || store.risk_level === "High";
    const hasSensitive = store.classifications && store.classifications.length > 0;
    if (hasHighRisk || hasSensitive) {
      await db.insert(findingsTable).values({
        tenantId,
        findingId: nextId("AGTD"),
        cloud: "DSPM-Agent",
        severity: store.risk_level === "Critical" ? "Critical" : store.risk_level === "High" ? "High" : "Medium",
        title: `[Agent ${agentId}] Sensitive data store: ${store.path} [${(store.classifications ?? []).join(", ") || "Unclassified"}]`,
        resource: `agent:${agentId}:data:${store.path}`,
        status: "open",
      }).onConflictDoNothing();
      findings++;
    }
  }

  return { findings, controls: 0, assets: 0, tickets: 0 };
}

async function processSecOps(agentId: string, tenantId: number, payload: SecOpsPayload): Promise<Partial<IngestResult>> {
  let findings = 0;
  const controls = payload.controls ?? [];
  const cves = payload.cves ?? [];
  const benchmarkName = payload.benchmark_name || "CIS Benchmark";

  for (const ctrl of controls) {
    if (ctrl.status === "fail") {
      await db.insert(findingsTable).values({
        tenantId,
        findingId: nextId("AGTB"),
        cloud: "CIS-Agent",
        severity: ctrl.severity || "Medium",
        title: `[Agent ${agentId}] ${benchmarkName}: ${ctrl.title} — FAILED`,
        resource: `agent:${agentId}:benchmark:${ctrl.id}`,
        status: "open",
      }).onConflictDoNothing();
      findings++;
    }
  }

  for (const cve of cves) {
    await db.insert(findingsTable).values({
      tenantId,
      findingId: nextId("AGTV"),
      cloud: "CVE-Agent",
      severity: cve.severity || (cve.cvss >= 9 ? "Critical" : cve.cvss >= 7 ? "High" : cve.cvss >= 4 ? "Medium" : "Low"),
      title: `[Agent ${agentId}] ${cve.id}: ${cve.package}${cve.fixed_version ? ` (fix: ${cve.fixed_version})` : ""}`,
      resource: `agent:${agentId}:cve:${cve.id}`,
      status: "open",
    }).onConflictDoNothing();
    findings++;
  }

  return { findings, controls: 0, assets: 0, tickets: 0 };
}

async function processServiceOps(agentId: string, tenantId: number, payload: ServiceOpsPayload): Promise<Partial<IngestResult>> {
  let tickets = 0;
  const incidents = payload.incidents ?? [];
  const changes = payload.change_requests ?? [];

  for (const inc of incidents) {
    await db.insert(ticketsTable).values({
      tenantId,
      ticketId: nextId("AGTI"),
      priority: inc.severity,
      title: `[Agent ${agentId}] ${inc.type}: ${inc.description}`,
      category: "Incident",
      assignee: "soc@aigo-x.io",
      status: "open",
      sla: inc.severity === "Critical" ? "4h" : "24h",
      aiSeverity: inc.severity,
      aiCategory: "Incident",
      aiConfidence: 0.85,
    }).onConflictDoNothing();
    tickets++;
  }

  for (const cr of changes) {
    await db.insert(ticketsTable).values({
      tenantId,
      ticketId: nextId("AGTI"),
      priority: cr.risk,
      title: `[Agent ${agentId}] Change: ${cr.title}`,
      category: "Change",
      assignee: "itops@aigo-x.io",
      status: "open",
      sla: "72h",
      aiSeverity: cr.risk,
      aiCategory: "Change",
      aiConfidence: 0.80,
    }).onConflictDoNothing();
    tickets++;
  }

  return { tickets, controls: 0, assets: 0, findings: 0 };
}

export async function processPush(
  agentId: string,
  tenantId: number,
  request: PushRequest,
  crypto: AgentCryptoCtx,
): Promise<IngestResult> {
  const result: IngestResult = { controls: 0, assets: 0, findings: 0, tickets: 0, warnings: [] };

  // Verify HMAC signature when present — canonical JSON of payload, UTF-8 secret bytes
  if (request.payload_signature) {
    const valid = verifyHmac(request.payload, request.payload_signature, crypto.hmacSecret);
    if (!valid) {
      throw new Error("HMAC signature verification failed — payload rejected");
    }
  }

  // Verify Ed25519 signature when present — require registered public key, hex-encoded sig
  if (request.ed25519_signature) {
    if (!crypto.publicKey) {
      throw new Error("Ed25519 signature present but no public key registered for this agent");
    }
    const canonical = canonicalJson(request.payload);
    const valid = verifyEd25519(canonical, request.ed25519_signature, crypto.publicKey);
    if (!valid) {
      throw new Error("Ed25519 signature verification failed — payload rejected");
    }
  }

  const rt = (request.result_type ?? "").toLowerCase();
  const payload = request.payload as Record<string, unknown>;

  // Route to the correct module processor — propagate DB errors (no silent swallowing)
  let partial: Partial<IngestResult> = {};

  if (rt === "complyops" || rt === "compliance") {
    partial = await processComplyOps(agentId, tenantId, payload as ComplyOpsPayload);
  } else if (rt === "assetops" || rt === "inventory") {
    partial = await processAssetOps(agentId, tenantId, payload as AssetOpsPayload);
  } else if (rt === "dataops" || rt === "dspm") {
    partial = await processDataOps(agentId, tenantId, payload as DataOpsPayload);
  } else if (rt === "secops" || rt === "hardening" || rt === "vulnerability") {
    partial = await processSecOps(agentId, tenantId, payload as SecOpsPayload);
  } else if (rt === "serviceops" || rt === "threat" || rt === "incident") {
    partial = await processServiceOps(agentId, tenantId, payload as ServiceOpsPayload);
  } else {
    throw new Error(`Unknown result_type: "${rt}" — no handler registered`);
  }

  result.controls += partial.controls ?? 0;
  result.assets += partial.assets ?? 0;
  result.findings += partial.findings ?? 0;
  result.tickets += partial.tickets ?? 0;

  return result;
}
