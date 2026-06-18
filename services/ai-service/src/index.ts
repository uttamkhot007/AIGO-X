import app from "./app.js";
import { logger, eventBus } from "@workspace/service-kit";
import { startBriefingScheduler } from "./services/briefing-scheduler.js";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT: "${rawPort}"`);

void eventBus.init();
startBriefingScheduler();

app.listen(port, (err) => {
  if (err) { logger.error({ err }, "Error listening"); process.exit(1); }
  logger.info({ port, service: "ai-service" }, "Service listening");
});
