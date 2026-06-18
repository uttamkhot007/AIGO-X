import { Router } from "express";
import governanceRouter from "./governance.js";
import auditRouter from "./audit.js";
import adAuditorRouter from "./ad-auditor.js";

const router = Router();

router.use(governanceRouter);
router.use(auditRouter);
router.use(adAuditorRouter);

export default router;
