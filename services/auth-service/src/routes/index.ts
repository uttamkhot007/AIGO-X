import { Router } from "express";
import authRouter from "./auth.js";
import usersRouter from "./users.js";
import tenantsRouter from "./tenants.js";
import { authLimiter } from "@workspace/service-kit";

const router = Router();

router.use(authLimiter, authRouter);
router.use(tenantsRouter);
router.use(usersRouter);

export default router;
