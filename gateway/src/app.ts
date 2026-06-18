import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { logger, globalLimiter } from "@workspace/service-kit";
import { createProxyMiddleware } from "http-proxy-middleware";
import localRouter from "./routes/index.js";

const app = express();

app.set("trust proxy", 1);

app.use(pinoHttp({
  logger,
  serializers: {
    req(req) { return { id: req.id, method: req.method, url: req.url?.split("?")[0] }; },
    res(res) { return { statusCode: res.statusCode }; },
  },
}));

app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());

// ── Service URL map (env-injected so Docker/K8s works transparently) ──────────
const services = {
  auth:        process.env["AUTH_SERVICE_URL"]        ?? "http://auth-service:8001",
  risk:        process.env["RISK_SERVICE_URL"]        ?? "http://risk-service:8002",
  compliance:  process.env["COMPLIANCE_SERVICE_URL"]  ?? "http://compliance-service:8003",
  governance:  process.env["GOVERNANCE_SERVICE_URL"]  ?? "http://governance-service:8004",
  privacy:     process.env["PRIVACY_SERVICE_URL"]     ?? "http://privacy-service:8005",
  evidence:    process.env["EVIDENCE_SERVICE_URL"]    ?? "http://evidence-service:8006",
  secops:      process.env["SECOPS_SERVICE_URL"]      ?? "http://secops-service:8007",
  ai:          process.env["AI_SERVICE_URL"]          ?? "http://ai-service:8008",
  trust:       process.env["TRUST_SERVICE_URL"]       ?? "http://trust-service:8009",
  integration: process.env["INTEGRATION_SERVICE_URL"] ?? "http://integration-service:8010",
};

function proxy(target: string) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    on: {
      error(err, _req, res) {
        logger.error({ err, target }, "Proxy error");
        if (typeof (res as any).status === "function") {
          (res as any).status(502).json({ error: "Service temporarily unavailable" });
        }
      },
    },
  });
}

app.use("/api", globalLimiter);

// ── Local routes (served directly by gateway) ─────────────────────────────────
app.use("/api", express.json());
app.use("/api", express.urlencoded({ extended: true }));
app.use("/api", localRouter);

// ── Proxied routes ────────────────────────────────────────────────────────────
app.use(["/api/auth", "/api/users", "/api/tenants", "/api/roles"], proxy(services.auth));
app.use(["/api/risks", "/api/riskmap", "/api/dashboard", "/api/db-modules"], proxy(services.risk));
// /api/compliance covers all compliance + maturity routes (maturity routes are at /compliance/maturity)
// /api/admin/frameworks covers super-admin framework management (admin-frameworks.ts)
app.use(["/api/compliance", "/api/admin/frameworks"], proxy(services.compliance));
app.use(["/api/governance", "/api/audit", "/api/ad-auditor"], proxy(services.governance));
app.use(["/api/privacy", "/api/privacy-program", "/api/dsars", "/api/dpias"], proxy(services.privacy));
app.use(["/api/evidence", "/api/evidence-engine", "/api/evidence-alerts", "/api/browser-checks", "/api/browser-check-alerts"], proxy(services.evidence));
// DSPM belongs to SecOps (security posture domain), not Privacy
app.use(["/api/security", "/api/sspm", "/api/cspm", "/api/caasm", "/api/network-audit", "/api/dspm", "/api/saas-apps", "/api/cloud-resources", "/api/assets"], proxy(services.secops));
// /api/servicedesk covers /servicedesk/triage, /servicedesk/kb, /servicedesk/metrics, etc.
// (no hyphen — matches exact route prefix in ai-service/src/routes/servicedesk-ai.ts)
app.use(["/api/ai", "/api/ai-engines", "/api/servicedesk", "/api/tickets"], proxy(services.ai));
app.use(["/api/trust-center", "/api/portals", "/api/questionnaires", "/api/public"], proxy(services.trust));
// /api/search is a cross-domain aggregator owned by integration-service
// (moved out of gateway to keep the gateway free of domain DB access)
app.use(["/api/integration-hub", "/api/agent-gateway", "/api/mcp", "/api/onboarding", "/api/search"], proxy(services.integration));

export default app;
