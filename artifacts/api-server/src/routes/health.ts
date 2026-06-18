import { Router, type IRouter } from "express";
import { registry } from "../lib/service-registry";

const router: IRouter = Router();

/**
 * GET /api/healthz
 *
 * Aggregated platform health endpoint.
 * Returns the overall status derived from all registered services,
 * plus per-service detail, uptime, and timestamp.
 */
router.get("/healthz", (_req, res) => {
  const services = registry.getAll();
  const overall = registry.overallStatus();

  res.status(overall === "offline" ? 503 : 200).json({
    status: overall,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    services: services.map(s => ({
      name: s.name,
      path: s.path,
      status: s.status,
      version: s.version,
      lastChecked: s.lastChecked.toISOString(),
    })),
  });
});

export default router;
