import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import tenantsRouter from "./tenants";
import dashboardRouter from "./dashboard";
import risksRouter from "./risks";
import riskmapRouter from "./riskmap";
import complianceRouter from "./compliance";
import maturityRouter from "./maturity";
import governanceRouter from "./governance";
import auditRouter from "./audit";
import securityRouter from "./security";
import caasmRouter from "./caasm";
import cspmRouter from "./cspm";
import sspmRouter from "./sspm";
import networkAuditRouter from "./network-audit";
import privacyRouter from "./privacy";
import privacyProgramRouter from "./privacy-program";
import dspmRouter from "./dspm";
import ticketsRouter from "./tickets";
import aiRouter from "./ai";
import adAuditorRouter from "./ad-auditor";
import serviceDeskAiRouter from "./servicedesk-ai";
import onboardingRouter from "./onboarding";
import agentGatewayRouter from "./agent-gateway";
import integrationHubRouter from "./integration-hub";
import dbModulesRouter from "./db-modules";
import deploymentRouter from "./deployment";
import aiEnginesRouter from "./ai-engines";
import mcpRouter from "./mcp";
import evidenceEngineRouter from "./evidence-engine";
import evidenceRouter from "./evidence";
import evidenceAlertsRouter from "./evidence-alerts";
import browserChecksRouter from "./browser-checks";
import browserCheckAlertsRouter from "./browser-check-alerts";
import questionnairesRouter from "./questionnaires";
import searchRouter from "./search";
import eventsRouter from "./events";
import portalsRouter from "./portals";
import publicStatsRouter from "./public-stats";
import trustCenterRouter from "./trust-center";
import adminFrameworksRouter, { seedFrameworkLibrary } from "./admin-frameworks";
import licensingRouter, { seedTenantLicenses } from "./licensing";
import incidentsRouter from "./incidents";
import serviceOpsRouter from "./service-ops";
import privacyExtraRouter from "./privacy-extra";
import assetOpsRouter from "./asset-ops";
import cloudOpsRouter from "./cloudops";
import aiSecOpsRouter from "./aisecops";
import adminRouter from "./admin";
import embedTokensRouter from "./embed-tokens";
import browserExtPkgRouter from "./browser-extension-pkg";
import { registry } from "../lib/service-registry";
import { authLimiter } from "../middlewares/rate-limit";
import { ALL_ROLES, ROLE_PERMISSIONS } from "../services";

const router: IRouter = Router();

// Public (no-auth) endpoints — must be registered before any auth middleware
router.use(publicStatsRouter);
router.use(trustCenterRouter);

// Health
router.use(healthRouter);

// Service registry status — shows all microservice health
router.get("/services", (_req, res) => {
  res.json(registry.getAll().map((s) => ({
    name: s.name,
    path: s.path,
    status: s.status,
    version: s.version,
    lastChecked: s.lastChecked.toISOString(),
  })));
});

// Auth service (rate-limited)
router.use(authLimiter, authRouter);

// RBAC: expose role definitions for frontend
router.get("/roles", (_req, res) => {
  res.json(
    ALL_ROLES.map((role) => ({
      role,
      permissions: ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS] ?? [],
    }))
  );
});

// Tenant service
router.use(tenantsRouter);

// User service
router.use(usersRouter);

// Dashboard service
router.use(dashboardRouter);

// Risk service — riskmapRouter and dbModulesRouter first to prevent specific paths
// (/risks/heatmap, /risks/appetite, /risks/cascades, /risks/treatments, /risks/vendors)
// being captured by risksRouter's generic GET /risks/:id handler
router.use(riskmapRouter);
router.use(dbModulesRouter);
router.use(risksRouter);

// Compliance & maturity
router.use(complianceRouter);
router.use(maturityRouter);

// Governance service
router.use(governanceRouter);

// Audit service
router.use(auditRouter);

// Security service (legacy thin route — static assets + DB findings)
router.use(securityRouter);

// CAASM — cyber asset attack surface management
router.use(caasmRouter);

// CSPM — cloud security posture management
router.use(cspmRouter);

// SSPM — SaaS security posture management
router.use(sspmRouter);

// Network Audit — firewall rules, anomaly detection, zone matrix
router.use(networkAuditRouter);

// Privacy service (DSPM/DSAR/DPIA — DB-backed legacy)
router.use(privacyRouter);

// Privacy Program service (RoPA, DPIA workflow, Notices, DSAR SLA, Consent, DPA)
router.use(privacyProgramRouter);

// DSPM — data classification, lineage, heatmap, over-permission, reg obligations
router.use(dspmRouter);

// Service desk
router.use(ticketsRouter);

// AI vCISO + conversations
router.use(aiRouter);

// AD Auditor
router.use(adAuditorRouter);

// Service Desk AI (triage, KB, metrics, escalations)
router.use(serviceDeskAiRouter);

// Onboarding wizard
router.use(onboardingRouter);

// Agent Gateway — multi-platform agent management
router.use(agentGatewayRouter);

// Integration Hub — 100+ connector registry + pipeline metrics + webhooks
router.use(integrationHubRouter);

// DB-backed modules registered earlier (before risksRouter) to prevent route shadowing

// Deployment config — on-prem wizard support, service health summary
router.use(deploymentRouter);

// AI Engine configs + MCP token management
router.use(aiEnginesRouter);

// MCP Server — Model Context Protocol 2024-11-05
router.use(mcpRouter);

// Evidence Collection Engine (Vanta/Drata-style automated checks)
router.use(evidenceEngineRouter);

// Evidence Artifacts — per-control automated evidence (collect, history, manual upload)
router.use(evidenceRouter);

// Evidence Alert Settings & History — Slack/email notifications for failed controls
router.use(evidenceAlertsRouter);

// Browser Check Engine — headless verification + screenshots
router.use(browserChecksRouter);

// Browser Check Alert Settings & History — Slack/email notifications on fail/error
router.use(browserCheckAlertsRouter);

// Security Questionnaire Module (SIG Lite, CAIQ, VSA + AI auto-answer)
router.use(questionnairesRouter);

// Universal Search — cross-module record lookup by UID, name, keyword
router.use(searchRouter);

// Real-time SSE stream + presence tracking
router.use(eventsRouter);

// Portal Hub — external stakeholder portal management
router.use(portalsRouter);

// Framework Library — super admin catalog + tenant injection + tenant-scoped listing
router.use(adminFrameworksRouter);

// Licensing Engine — per-tenant module licenses, pricing plans, seat consumption
router.use(licensingRouter);

// Incidents — IR incident management
router.use(incidentsRouter);

// ServiceOps — changes, problems, CMDB, SLAs, KB articles
router.use(serviceOpsRouter);

// Privacy Extra — breaches, cookies, transfers, AI models, child apps, vendors, employee activities
router.use(privacyExtraRouter);

// AssetOps — data sources, attack surface
router.use(assetOpsRouter);

// CloudOps — CSPM, SSPM, CIEM, container security, runtime threats
router.use(cloudOpsRouter);

// AISecOps — AI model inventory, threat detection, AI access governance, posture
router.use(aiSecOpsRouter);

// Admin — gateway admin endpoints for CLI operators (migrate, backup, secrets, logs)
router.use(adminRouter);

// Embed Tokens — browser-embeddable JS package with per-tenant unique token
router.use(embedTokensRouter);

// Browser Extension Package — serve real loadable extension ZIP for Chrome/Edge/Firefox
router.use(browserExtPkgRouter);

// Seed framework library on startup (idempotent)
seedFrameworkLibrary().catch(console.error);

// Seed tenant licenses on startup (idempotent)
seedTenantLicenses().catch(console.error);

export default router;
