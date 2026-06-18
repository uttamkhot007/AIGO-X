import { Router } from "express";
import privacyRouter from "./privacy.js";
import privacyProgramRouter from "./privacy-program.js";
// NOTE: DSPM (Data Security Posture Management) is owned by secops-service.
// Privacy-service owns: DSARs, DPIAs, and privacy program management.

const router = Router();

router.use(privacyRouter);
router.use(privacyProgramRouter);

export default router;
