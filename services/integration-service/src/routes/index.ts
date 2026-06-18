import { Router } from "express";
import integrationHubRouter from "./integration-hub.js";
import agentGatewayRouter from "./agent-gateway.js";
import mcpRouter from "./mcp.js";
import onboardingRouter from "./onboarding.js";
import searchRouter from "./search.js";

const router = Router();

// /api/search is a cross-domain aggregator — owned by integration-service
// because it fans out across all domain tables simultaneously.
// Gateway proxies /api/search here.
router.use(searchRouter);
router.use(integrationHubRouter);
router.use(agentGatewayRouter);
router.use(mcpRouter);
router.use(onboardingRouter);

export default router;
