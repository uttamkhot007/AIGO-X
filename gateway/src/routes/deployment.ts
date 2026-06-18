import { Router } from "express";
import { requireAuth, requireRole } from "@workspace/service-kit";

const router = Router();
const isSuperAdmin = requireRole("super_admin");

const SERVICE_URLS = () => [
  { name: "auth-service",        url: process.env["AUTH_SERVICE_URL"]        ?? "http://auth-service:8001" },
  { name: "risk-service",        url: process.env["RISK_SERVICE_URL"]        ?? "http://risk-service:8002" },
  { name: "compliance-service",  url: process.env["COMPLIANCE_SERVICE_URL"]  ?? "http://compliance-service:8003" },
  { name: "governance-service",  url: process.env["GOVERNANCE_SERVICE_URL"]  ?? "http://governance-service:8004" },
  { name: "privacy-service",     url: process.env["PRIVACY_SERVICE_URL"]     ?? "http://privacy-service:8005" },
  { name: "evidence-service",    url: process.env["EVIDENCE_SERVICE_URL"]    ?? "http://evidence-service:8006" },
  { name: "secops-service",      url: process.env["SECOPS_SERVICE_URL"]      ?? "http://secops-service:8007" },
  { name: "ai-service",          url: process.env["AI_SERVICE_URL"]          ?? "http://ai-service:8008" },
  { name: "trust-service",       url: process.env["TRUST_SERVICE_URL"]       ?? "http://trust-service:8009" },
  { name: "integration-service", url: process.env["INTEGRATION_SERVICE_URL"] ?? "http://integration-service:8010" },
];

function getDeploymentConfig() {
  return {
    deploymentType:  process.env["DEPLOYMENT_TYPE"]  ?? "cloud",
    tenantMode:      process.env["TENANT_MODE"]       ?? "multi",
    version:         process.env["APP_VERSION"]       ?? "1.0.0",
    environment:     process.env["NODE_ENV"]          ?? "development",
    configured:      !!process.env["DEPLOYMENT_TYPE"],
    features: {
      aiEnabled:     !!process.env["OPENAI_API_KEY"],
      mfaEnabled:    true,
      ssoEnabled:    !!process.env["SSO_ENABLED"],
      auditEnabled:  true,
    },
    db: {
      connected:     !!process.env["DATABASE_URL"],
      provider:      "postgresql",
    },
  };
}

// GET /deployment/config — public (setup wizard reads this before login)
router.get("/deployment/config", (_req, res) => {
  res.json(getDeploymentConfig());
});

// GET /deployment/services — super_admin: returns all service URLs and their registry status
router.get("/deployment/services", requireAuth, isSuperAdmin, async (_req, res) => {
  const services = SERVICE_URLS();

  // Probe each service health in parallel
  const probed = await Promise.allSettled(
    services.map(async (svc) => {
      const start = Date.now();
      try {
        const resp = await fetch(`${svc.url}/api/healthz`, { signal: AbortSignal.timeout(3000) });
        const latency = Date.now() - start;
        const body = resp.ok ? await resp.json() as Record<string, unknown> : {};
        return {
          name:    svc.name,
          url:     svc.url,
          status:  resp.ok ? "healthy" : "degraded",
          latency,
          version: (body["version"] as string | undefined) ?? "1.0.0",
        };
      } catch {
        return { name: svc.name, url: svc.url, status: "offline", latency: null, version: "unknown" };
      }
    }),
  );

  const results = probed.map((r) => r.status === "fulfilled" ? r.value : { status: "offline" });

  res.json({
    services: results,
    summary: {
      total:   results.length,
      healthy: results.filter(s => (s as any).status === "healthy").length,
      degraded: results.filter(s => (s as any).status === "degraded").length,
      down:    results.filter(s => (s as any).status === "offline").length,
    },
  });
});

// POST /deployment/generate-config
router.post("/deployment/generate-config", requireAuth, isSuperAdmin, (req, res) => {
  const { deploymentType, tenantMode, orgName, adminEmail, openaiKey, dbPassword, jwtSecret, encKey } =
    req.body as Record<string, string>;

  if (deploymentType !== "onprem") {
    res.status(400).json({ error: "Config generation is only for on-premises deployments" });
    return;
  }

  const safeOrg  = (orgName ?? "My Organization").replace(/[^a-zA-Z0-9 ]/g, "");
  const safeMode = tenantMode === "single" ? "single" : "multi";

  const envContent = [
    `# DuFense GRC Platform — On-Premises Configuration`,
    `# Generated: ${new Date().toISOString()}`,
    ``,
    `DEPLOYMENT_TYPE=onprem`,
    `TENANT_MODE=${safeMode}`,
    `APP_VERSION=1.0.0`,
    `NODE_ENV=production`,
    ``,
    `POSTGRES_USER=grc_user`,
    `POSTGRES_PASSWORD=${dbPassword ?? "CHANGE_ME_STRONG_PASSWORD"}`,
    `POSTGRES_DB=dufense_grc`,
    `DATABASE_URL=postgresql://grc_user:${dbPassword ?? "CHANGE_ME_STRONG_PASSWORD"}@postgres:5432/dufense_grc`,
    ``,
    `JWT_SECRET=${jwtSecret ?? "CHANGE_ME_AT_LEAST_64_CHARS_RANDOM_STRING"}`,
    `TOKEN_ENCRYPTION_KEY=${encKey ?? "CHANGE_ME_32_CHAR_HEX_KEY"}`,
    ``,
    `OPENAI_API_KEY=${openaiKey ?? ""}`,
    `WEB_PORT=443`,
    ...(safeMode === "single" ? [`ORG_NAME=${safeOrg}`, `ADMIN_EMAIL=${adminEmail ?? "admin@example.com"}`] : []),
  ].join("\n");

  const composeContent = buildComposeYaml(safeMode, safeOrg);
  res.json({ envContent, composeContent, tenantMode: safeMode });
});

function buildComposeYaml(mode: string, orgName: string): string {
  const singleTenantExtras = mode === "single" ? `\n      ORG_NAME: \${ORG_NAME}\n      ADMIN_EMAIL: \${ADMIN_EMAIL}` : "";
  return `# DuFense GRC Platform — Docker Compose (Microservices)
# Mode: ${mode === "single" ? "Single Tenant" : "Multi-Tenant"} | Org: ${orgName}
# Generated: ${new Date().toISOString()}
# Usage: docker compose -f docker-compose.microservices.yml up -d
# Full file at: deploy/docker-compose.microservices.yml
DEPLOYMENT_TYPE=onprem
TENANT_MODE=${mode}${singleTenantExtras}
`;
}

export default router;
