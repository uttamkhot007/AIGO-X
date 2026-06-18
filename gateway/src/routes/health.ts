import { Router, type IRouter } from "express";

const router: IRouter = Router();

/**
 * GET /api/healthz
 * Gateway-level health — returns healthy when the gateway itself is up.
 * For per-service status, call GET /api/services.
 */
router.get("/healthz", (_req, res) => {
  res.json({
    status: "healthy",
    service: "gateway",
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

export default router;
