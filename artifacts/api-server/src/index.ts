/**
 * @deprecated artifacts/api-server — MONOLITH (local development only)
 *
 * This monolithic API server has been replaced by 10 domain microservices + an
 * API gateway for all production deployments.  See MIGRATION.md for the new
 * architecture and docker compose -f deploy/docker-compose.multi.yml for the
 * canonical production entry point.
 *
 * This file is kept ONLY for Replit local development convenience (the
 * `artifacts/api-server: API Server` workflow). Do NOT deploy this directly.
 */

import app from "./app";
import { logger } from "./lib/logger";
import { eventBus } from "./lib/event-bus";
import { registry } from "./lib/service-registry";
import { startEvidenceScheduler } from "./services/evidence-scheduler";
import { startBriefingScheduler } from "./services/briefing-scheduler";
import { startBrowserCheckCronRegistry } from "./services/BrowserCheckCronRegistry";
import { initOrchestration } from "./lib/orchestration";
import { ensureSchema } from "./lib/ensureSchema";
import { runMigrations } from "./lib/migrate";

if (process.env["NODE_ENV"] === "production") {
  console.warn(
    "[DEPRECATED] artifacts/api-server is not for production use. " +
    "Use deploy/docker-compose.multi.yml (microservices + gateway) instead. " +
    "See artifacts/api-server/MIGRATION.md for details.",
  );
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Run Drizzle migrations first (authoritative path — applies any pending .sql files)
try {
  await runMigrations();
} catch (err) {
  logger.error({ err }, "[migrate] Migration run failed — falling back to ensureSchema");
}

// ensureSchema is a belt-and-suspenders fallback for columns/tables not covered by migrations
try {
  await ensureSchema();
} catch (err) {
  logger.error({ err }, "[ensureSchema] Schema check failed — continuing with existing schema");
}

// Initialise event bus (non-blocking — upgrades to Redis Streams if REDIS_URL is set)
void eventBus.init();

// Start cross-module orchestration (event-driven workflows)
initOrchestration();

// Start automated evidence collection scheduler (daily at 02:00 UTC by default)
startEvidenceScheduler();

// Start AI briefing scheduler (hourly check for due schedules)
startBriefingScheduler();

// Start per-check browser verification cron registry (each check fires on its own schedule)
startBrowserCheckCronRegistry();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Start periodic health polling after server is accepting requests
  registry.startHealthPolling(port, 30_000);
});
