import { Router } from "express";
import securityRouter from "./security.js";
import sspmRouter from "./sspm.js";
import cspmRouter from "./cspm.js";
import caasmRouter from "./caasm.js";
import networkAuditRouter from "./network-audit.js";
import dspmRouter from "./dspm.js";

const router = Router();

router.use(securityRouter);
router.use(sspmRouter);
router.use(cspmRouter);
router.use(caasmRouter);
router.use(networkAuditRouter);
// DSPM (Data Security Posture Management) lives in SecOps — it is a security posture domain
router.use(dspmRouter);

export default router;
