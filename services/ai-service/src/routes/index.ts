import { Router } from "express";
import aiRouter from "./ai.js";
import aiEnginesRouter from "./ai-engines.js";
import serviceDeskAiRouter from "./servicedesk-ai.js";
import ticketsRouter from "./tickets.js";

const router = Router();

router.use(aiRouter);
router.use(aiEnginesRouter);
router.use(serviceDeskAiRouter);
router.use(ticketsRouter);

export default router;
