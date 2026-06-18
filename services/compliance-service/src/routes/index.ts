import { Router } from "express";
import complianceRouter from "./compliance.js";
import maturityRouter from "./maturity.js";
import adminFrameworksRouter, { seedFrameworkLibrary } from "./admin-frameworks.js";

const router = Router();

router.use(complianceRouter);
router.use(maturityRouter);
router.use(adminFrameworksRouter);

seedFrameworkLibrary().catch(console.error);

export default router;
