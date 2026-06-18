import { Router } from "express";
import publicStatsRouter from "./public-stats.js";
import trustCenterRouter from "./trust-center.js";
import portalsRouter from "./portals.js";
import questionnairesRouter from "./questionnaires.js";

const router = Router();

router.use(publicStatsRouter);
router.use(trustCenterRouter);
router.use(portalsRouter);
router.use(questionnairesRouter);

export default router;
