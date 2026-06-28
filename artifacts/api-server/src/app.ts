import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { globalLimiter } from "./middlewares/rate-limit";

const app: Express = express();

// Trust reverse proxy so X-Forwarded-For is used for client IP
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

// QC-211-019: Helmet sets a baseline of security headers at the app layer so they
// apply even if nginx is bypassed (direct service access, mobile API). Previously
// headers relied solely on nginx. COOP/CORP harden against spectre-style attacks.
app.use(
  helmet({
    contentSecurityPolicy: false, // the API returns JSON, not HTML; CSP belongs on the SPA/nginx
    crossOriginEmbedderPolicy: false, // would break some third-party JSON integrations
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: { policy: "same-site" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  }),
);

// QC-211-019: CORS is now an allowlist, not reflective. `origin: true` reflected
// ANY origin with credentials, widening credential-based attack surface. Allowed
// origins come from AIGO_ALLOWED_ORIGINS (comma-separated, e.g.
// "https://app.example.com,chrome-extension://<id>"). Unset = same-origin only.
const allowedOrigins = (process.env["AIGO_ALLOWED_ORIGINS"] ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
// Always allow any *.replit.dev / *.replit.app origin (dev preview proxy + deployed app).
// Expo Go adds an extra ".expo" subdomain segment (e.g. <id>.expo.pike.replit.dev), so
// we match any depth of subdomains under replit.dev / replit.app — both are Replit-controlled.
const REPLIT_ORIGIN_RE = /^https?:\/\/[a-zA-Z0-9._-]+\.replit\.(dev|app)(:\d+)?$/;
app.use(
  cors({
    origin(origin, cb) {
      // Allow same-origin / server-to-server (no Origin header), allowlisted origins,
      // and any Replit preview domain (dynamic per session — can't be hardcoded).
      // Also allow browser-extension origins — the AIGO-X browser agent beacons from
      // chrome-extension:// and moz-extension:// URIs. The beacon route enforces its
      // own API-key auth, so permitting the origin here is safe.
      const isExtension = /^(chrome|moz|safari-web)-extension:\/\//i.test(origin ?? "");
      if (!origin || allowedOrigins.includes(origin) || REPLIT_ORIGIN_RE.test(origin) || isExtension) {
        return cb(null, true);
      }
      return cb(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  }),
);

app.use(cookieParser());
// 10MB limit — the curated CCF seed import is ~2MB; default 100KB rejects it.
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", globalLimiter);
app.use("/api", router);

// ── 404 handler — unknown routes ──────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

// ── Global error handler — isolates module failures ───────────────────────────
// Catches any unhandled error thrown inside a route handler.
// One failing module returns a structured error instead of crashing the server.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : "Internal server error";
  const status  = (err as { status?: number; statusCode?: number }).status
                ?? (err as { status?: number; statusCode?: number }).statusCode
                ?? 500;
  logger.error({ err, method: req.method, url: req.url }, "[global-error-handler]");
  if (!res.headersSent) {
    res.status(status).json({ error: message });
  }
});

export default app;
