import type { Command } from "commander";
import { requireConfig } from "../config.js";
import { measureLatency } from "../api.js";
import { header, printTable, printJson, isJsonMode, info, success, warn } from "../output.js";
import chalk from "chalk";

interface GatewayHealth {
  status: string;
  service: string;
  uptime: number;
  timestamp: string;
}

interface ServiceHealth {
  name: string;
  url: string;
  status: "healthy" | "degraded" | "offline" | string;
  latency: number | null;
  version: string;
}

interface DeploymentServicesResponse {
  services: ServiceHealth[];
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    down: number;
  };
}

export function registerHealth(program: Command): void {
  program
    .command("health")
    .description("Check gateway health and probe all microservices")
    .option("--service <name>", "Filter to a specific service by name")
    .option("--timeout <ms>", "Per-service probe timeout in ms", "3000")
    .action(async (opts: { service?: string; timeout: string }) => {
      const config = requireConfig();
      const base = config.url.replace(/\/$/, "");

      if (!isJsonMode()) process.stdout.write("  Checking platform health…\n");

      // ── 1. Gateway liveness ───────────────────────────────────────────────
      const { ok: gwOk, ms: gwMs, body: gwBody } = await measureLatency(
        `${base}/api/healthz`,
        config.token,
      );

      if (!gwOk) {
        if (isJsonMode()) {
          printJson({ gateway: { status: "offline", url: base, latencyMs: gwMs }, services: [] });
        } else {
          console.log(chalk.red("✖") + `  Gateway offline (${gwMs}ms) — ${base}`);
        }
        process.exit(1);
      }

      const gw = gwBody as GatewayHealth;

      // ── 2. Per-service probe via /api/deployment/services ─────────────────
      let serviceData: DeploymentServicesResponse | null = null;
      try {
        const res = await fetch(`${base}/api/deployment/services`, {
          headers: { Authorization: `Bearer ${config.token}` },
          signal: AbortSignal.timeout(Number(opts.timeout) * 3 + 2000),
        });
        if (res.ok) {
          serviceData = await res.json() as DeploymentServicesResponse;
        }
      } catch {
        // degraded mode — gateway is up but service probe failed
      }

      // ── 3. Filter and render ──────────────────────────────────────────────
      const allServices: ServiceHealth[] = serviceData?.services ?? [];
      const services = opts.service
        ? allServices.filter(s => s.name.toLowerCase().includes(opts.service!.toLowerCase()))
        : allServices;

      if (isJsonMode()) {
        printJson({
          gateway: { status: gw.status, uptime: gw.uptime, latencyMs: gwMs },
          services,
          summary: serviceData?.summary ?? null,
        });
        return;
      }

      // ── Human output ──────────────────────────────────────────────────────
      const overallColor =
        gw.status === "healthy" ? chalk.green :
        gw.status === "degraded" ? chalk.yellow : chalk.red;

      header("Platform Health");
      console.log(`  Gateway:  ${overallColor(gw.status.toUpperCase())}  (${gwMs}ms)`);
      console.log(`  Uptime:   ${formatUptime(gw.uptime)}`);

      if (serviceData) {
        const { healthy, degraded, down } = serviceData.summary;
        console.log(
          `  Services: ${chalk.green(String(healthy))} healthy` +
          (degraded > 0 ? `, ${chalk.yellow(String(degraded))} degraded` : "") +
          (down > 0     ? `, ${chalk.red(String(down))} down`            : "")
        );
      }
      console.log("");

      if (services.length === 0 && !serviceData) {
        warn("Service probe endpoint unavailable (/api/deployment/services). Token may lack super_admin role.");
        info("Gateway itself is healthy. Re-run with a super_admin token to see per-service status.");
        return;
      }

      if (services.length === 0) {
        info("No services matched filter");
        return;
      }

      printTable(
        ["Service", "Status", "Latency", "Version"],
        services.map(s => [
          s.name,
          colorStatus(s.status),
          s.latency !== null ? `${s.latency}ms` : "—",
          s.version ?? "—",
        ])
      );

      const offline = services.filter(s => s.status === "offline" || s.status === "degraded");
      if (offline.length > 0) {
        console.log("");
        warn(`${offline.length} service(s) degraded/offline: ${offline.map(s => s.name).join(", ")}`);
        process.exit(1);
      } else {
        console.log("");
        success(`All ${services.length} service(s) healthy`);
      }
    });
}

function colorStatus(status: string): string {
  switch (status) {
    case "healthy":  return chalk.green(status);
    case "degraded": return chalk.yellow(status);
    case "offline":  return chalk.red(status);
    default:         return chalk.dim(status);
  }
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}
