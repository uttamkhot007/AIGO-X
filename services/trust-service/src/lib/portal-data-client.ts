/**
 * portal-data-client.ts
 * 
 * Cross-domain data fetcher for the trust-center portal-data endpoint.
 *
 * The trust portal aggregates a summary view from multiple domains (risk,
 * compliance, secops, ai/tickets, governance). Instead of querying those
 * domains' DB tables directly, this module calls the upstream services via
 * HTTP using a short-lived internal service JWT for authorization.
 *
 * Each helper accepts tenantId and returns the data in the same shape
 * the portals route previously built with direct DB access.
 */

import { ServiceClient, ServiceClientError } from "@workspace/service-kit";
import { signServiceToken } from "@workspace/service-kit";

const riskClient        = new ServiceClient(process.env["RISK_SERVICE_URL"]        ?? "http://risk-service:8002");
const complianceClient  = new ServiceClient(process.env["COMPLIANCE_SERVICE_URL"]  ?? "http://compliance-service:8003");
const governanceClient  = new ServiceClient(process.env["GOVERNANCE_SERVICE_URL"]  ?? "http://governance-service:8004");
const secopsClient      = new ServiceClient(process.env["SECOPS_SERVICE_URL"]      ?? "http://secops-service:8007");
const aiClient          = new ServiceClient(process.env["AI_SERVICE_URL"]          ?? "http://ai-service:8008");
const evidenceClient    = new ServiceClient(process.env["EVIDENCE_SERVICE_URL"]    ?? "http://evidence-service:8006");

/** Build an Authorization header for service-to-service calls scoped to tenantId. */
function svcAuth(tenantId: number): string {
  return `Bearer ${signServiceToken(tenantId)}`;
}

/** Fetch top risks for a tenant from risk-service. Returns [] on error. */
export async function fetchRisks(tenantId: number): Promise<any[]> {
  try {
    const auth = svcAuth(tenantId);
    return await riskClient.get<any[]>("/api/risks?limit=50", auth);
  } catch (err) {
    if (err instanceof ServiceClientError && err.status === 404) return [];
    console.error("[portal-data-client] fetchRisks error:", err);
    return [];
  }
}

/** Fetch cloud security findings from secops-service. Returns [] on error. */
export async function fetchFindings(tenantId: number): Promise<any[]> {
  try {
    return await secopsClient.get<any[]>("/api/cspm/findings", svcAuth(tenantId));
  } catch (err) {
    if (err instanceof ServiceClientError && err.status === 404) return [];
    console.error("[portal-data-client] fetchFindings error:", err);
    return [];
  }
}

/** Fetch vendor risk list from risk-service. Returns [] on error. */
export async function fetchVendors(tenantId: number): Promise<any[]> {
  try {
    return await riskClient.get<any[]>("/api/risks/vendors", svcAuth(tenantId));
  } catch (err) {
    if (err instanceof ServiceClientError && err.status === 404) return [];
    console.error("[portal-data-client] fetchVendors error:", err);
    return [];
  }
}

/** Fetch risk appetite data from risk-service. Returns null on error. */
export async function fetchRiskAppetite(tenantId: number): Promise<any | null> {
  try {
    const rows = await riskClient.get<any[]>("/api/riskmap/appetite", svcAuth(tenantId));
    return Array.isArray(rows) ? (rows[0] ?? null) : null;
  } catch {
    return null;
  }
}

/** Fetch compliance controls from compliance-service. Returns [] on error. */
export async function fetchControls(tenantId: number): Promise<any[]> {
  try {
    return await complianceClient.get<any[]>("/api/compliance/controls", svcAuth(tenantId));
  } catch (err) {
    if (err instanceof ServiceClientError && err.status === 404) return [];
    console.error("[portal-data-client] fetchControls error:", err);
    return [];
  }
}

/** Fetch open tickets from ai-service. Returns [] on error. */
export async function fetchTickets(tenantId: number, since?: Date): Promise<any[]> {
  try {
    const url = since
      ? `/api/tickets?since=${since.toISOString()}`
      : "/api/tickets";
    return await aiClient.get<any[]>(url, svcAuth(tenantId));
  } catch (err) {
    if (err instanceof ServiceClientError && err.status === 404) return [];
    console.error("[portal-data-client] fetchTickets error:", err);
    return [];
  }
}

/** Fetch policy attestations from governance-service. Returns [] on error. */
export async function fetchAttestations(tenantId: number): Promise<any[]> {
  try {
    return await governanceClient.get<any[]>("/api/governance/attestations", svcAuth(tenantId));
  } catch (err) {
    if (err instanceof ServiceClientError && err.status === 404) return [];
    console.error("[portal-data-client] fetchAttestations error:", err);
    return [];
  }
}

/** Fetch a control from compliance-service for evidence upload linking. Returns null on error. */
export async function fetchFirstControl(tenantId: number): Promise<{ id: number; controlId: string } | null> {
  try {
    const rows = await complianceClient.get<any[]>("/api/compliance/controls?limit=1", svcAuth(tenantId));
    const row = Array.isArray(rows) ? rows[0] : null;
    return row ? { id: row.id, controlId: row.controlId ?? row.control_id ?? row.controlRef } : null;
  } catch {
    return null;
  }
}

/** Fetch evidence artifacts from evidence-service. Returns [] on error. */
export async function fetchEvidence(tenantId: number): Promise<any[]> {
  try {
    return await evidenceClient.get<any[]>("/api/evidence?limit=50", svcAuth(tenantId));
  } catch (err) {
    if (err instanceof ServiceClientError && err.status === 404) return [];
    console.error("[portal-data-client] fetchEvidence error:", err);
    return [];
  }
}
