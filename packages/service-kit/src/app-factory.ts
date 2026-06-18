import express, { type Express, type Router } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { logger } from "./logger.js";
import { globalLimiter } from "./rate-limit.js";

/**
 * Creates a standard Express app for a GRC microservice.
 * Every service gets a built-in /api/healthz endpoint so the Docker
 * and K8s health checks work without any extra route setup.
 */
export function createServiceApp(router: Router): Express {
  const app = express();

  app.set("trust proxy", 1);

  app.use(
    pinoHttp({
      logger,
      serializers: {
        req(req) {
          return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
        },
        res(res) {
          return { statusCode: res.statusCode };
        },
      },
    }),
  );

  app.use(cors({ origin: true, credentials: true }));
  app.use(cookieParser());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Built-in health endpoint — required by Docker HEALTHCHECK and K8s probes
  app.get("/api/healthz", (_req, res) => {
    res.json({
      status: "healthy",
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  app.use("/api", globalLimiter);
  app.use("/api", router);

  return app;
}
