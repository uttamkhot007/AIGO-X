import { Router } from "express";
import healthRouter from "./health.js";
import deploymentRouter from "./deployment.js";
import eventsRouter from "./events.js";

const router = Router();

// ── Service registry endpoint ─────────────────────────────────────────────────
router.get("/services", (_req, res) => {
  const services = [
    { name: "auth-service",        url: process.env["AUTH_SERVICE_URL"]        ?? "http://auth-service:8001",        path: "/api/auth" },
    { name: "risk-service",        url: process.env["RISK_SERVICE_URL"]        ?? "http://risk-service:8002",        path: "/api/risks" },
    { name: "compliance-service",  url: process.env["COMPLIANCE_SERVICE_URL"]  ?? "http://compliance-service:8003",  path: "/api/compliance" },
    { name: "governance-service",  url: process.env["GOVERNANCE_SERVICE_URL"]  ?? "http://governance-service:8004",  path: "/api/governance" },
    { name: "privacy-service",     url: process.env["PRIVACY_SERVICE_URL"]     ?? "http://privacy-service:8005",     path: "/api/privacy" },
    { name: "evidence-service",    url: process.env["EVIDENCE_SERVICE_URL"]    ?? "http://evidence-service:8006",    path: "/api/evidence" },
    { name: "secops-service",      url: process.env["SECOPS_SERVICE_URL"]      ?? "http://secops-service:8007",      path: "/api/security" },
    { name: "ai-service",          url: process.env["AI_SERVICE_URL"]          ?? "http://ai-service:8008",          path: "/api/ai" },
    { name: "trust-service",       url: process.env["TRUST_SERVICE_URL"]       ?? "http://trust-service:8009",       path: "/api/trust-center" },
    { name: "integration-service", url: process.env["INTEGRATION_SERVICE_URL"] ?? "http://integration-service:8010", path: "/api/integration-hub" },
  ];
  res.json(services.map(s => ({ ...s, version: "1.0.0", status: "registered" })));
});

// ── RBAC roles endpoint (static) ──────────────────────────────────────────────
router.get("/roles", (_req, res) => {
  res.json([
    { role: "super_admin", permissions: ["*"] },
    { role: "admin",       permissions: ["read", "write", "delete"] },
    { role: "ciso",        permissions: ["read", "write"] },
    { role: "analyst",     permissions: ["read"] },
    { role: "auditor",     permissions: ["read"] },
    { role: "viewer",      permissions: ["read"] },
  ]);
});

router.use(healthRouter);
// deployment.ts: gateway-local — reads ENV vars and probes service healthz endpoints
// to provide a unified ops dashboard. No domain DB writes; purely observability.
router.use(deploymentRouter);
// events.ts: gateway-local — SSE fan-out + short-lived presence store (TTL 35s).
// Must live in the gateway so a single persistent HTTP connection can receive events
// from any domain without per-service SSE multiplexing.
router.use(eventsRouter);

export default router;
