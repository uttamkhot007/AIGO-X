import { Router } from "express";
import risksRouter from "./risks.js";
import riskmapRouter from "./riskmap.js";
import dbModulesRouter from "./db-modules.js";
import dashboardRouter from "./dashboard.js";

const router = Router();

router.use(riskmapRouter);
router.use(risksRouter);
router.use(dashboardRouter);
// db-modules mounted at /db-modules so gateway prefix /api/db-modules routes here correctly.
// All raw CRUD DB-module routes become /api/db-modules/<path> — e.g. /api/db-modules/audit/programs
router.use("/db-modules", dbModulesRouter);

export default router;
