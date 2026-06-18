import type { Command } from "commander";
import { requireConfig } from "../config.js";
import { error, info, warn } from "../output.js";

const KNOWN_SERVICES = [
  "gateway",
  "auth-service",
  "risk-service",
  "compliance-service",
  "governance-service",
  "privacy-service",
  "evidence-service",
  "secops-service",
  "ai-service",
  "trust-service",
  "integration-service",
  "web",
  "postgres",
  "redis",
  "nginx",
];

export function registerLogs(program: Command): void {
  program
    .command("logs")
    .description("Stream or fetch logs from a service")
    .requiredOption("--service <service>", `Service name (${KNOWN_SERVICES.join(", ")})`)
    .option("--tail <n>", "Number of lines to show", "100")
    .option("--follow", "Stream live logs (Ctrl+C to stop)", false)
    .option("--since <time>", "Show logs since timestamp (ISO) or duration (1h, 30m)")
    .action(async (opts: { service: string; tail: string; follow: boolean; since?: string }) => {
      const config = requireConfig();
      const base = config.url.replace(/\/$/, "");

      const params = new URLSearchParams({
        tail: opts.tail,
        follow: String(opts.follow),
        ...(opts.since ? { since: opts.since } : {}),
      });

      const url = `${base}/api/admin/logs/${encodeURIComponent(opts.service)}?${params}`;

      info(`Fetching logs for: ${opts.service} (tail=${opts.tail}${opts.follow ? ", follow" : ""})`);

      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${config.token}` },
          signal: opts.follow ? undefined : AbortSignal.timeout(30_000),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          if (res.status === 404) {
            error("Logs endpoint not available via API. Stream logs directly with Docker:");
            info(`  docker logs ${opts.service.replace("-service", "-service")} --tail ${opts.tail}${opts.follow ? " -f" : ""}`);
          } else {
            error(`HTTP ${res.status}: ${text}`);
          }
          process.exit(1);
        }

        const contentType = res.headers.get("content-type") ?? "";

        if (contentType.includes("text/event-stream") || opts.follow) {
          await streamSSE(res, opts.follow);
        } else {
          const text = await res.text();
          process.stdout.write(text);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("ECONNREFUSED") || msg.includes("Failed to fetch")) {
          error(`Cannot reach gateway: ${base}`);
          info("Try streaming Docker logs directly:");
          info(`  docker logs ${opts.service} --tail ${opts.tail}${opts.follow ? " -f" : ""}`);
        } else if (msg !== "This operation was aborted") {
          error(msg);
        }
        process.exit(1);
      }
    });
}

async function streamSSE(res: Response, follow: boolean): Promise<void> {
  if (!res.body) {
    error("Response body is not readable");
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  process.on("SIGINT", () => {
    reader.cancel().catch(() => {});
    process.stdout.write("\n");
    process.exit(0);
  });

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (data === "[DONE]") return;
        try {
          const parsed = JSON.parse(data) as { line?: string; message?: string };
          process.stdout.write((parsed.line ?? parsed.message ?? data) + "\n");
        } catch {
          process.stdout.write(data + "\n");
        }
      }
    }
  }
}
