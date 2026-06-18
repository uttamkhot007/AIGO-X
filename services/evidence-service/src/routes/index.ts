import { Router } from "express";
import evidenceRouter from "./evidence.js";
import evidenceEngineRouter from "./evidence-engine.js";
import evidenceAlertsRouter from "./evidence-alerts.js";
import browserChecksRouter from "./browser-checks.js";
import browserCheckAlertsRouter from "./browser-check-alerts.js";

const router = Router();

router.use(evidenceEngineRouter);
router.use(evidenceRouter);
router.use(evidenceAlertsRouter);
router.use(browserChecksRouter);
router.use(browserCheckAlertsRouter);

export default router;
