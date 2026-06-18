import type { Command } from "commander";
import { apiRequest } from "../api.js";
import { success, error, info, warn, spinner, printJson, isJsonMode } from "../output.js";

const KNOWN_SERVICES = [
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
  "gateway",
];

interface RotateResult {
  status: string;
  service: string;
  rotatedAt?: string;
  message?: string;
}

export function registerSecrets(program: Command): void {
  const secrets = program
    .command("secrets")
    .description("Secret management operations");

  secrets
    .command("rotate")
    .description("Rotate secrets for a service (triggers rolling restart)")
    .requiredOption("--service <service>", `Service name (${KNOWN_SERVICES.join(", ")})`)
    .option("--all", "Rotate secrets for all services")
    .option("--force", "Skip confirmation")
    .action(async (opts: { service: string; all?: boolean; force?: boolean }) => {
      const services = opts.all ? KNOWN_SERVICES : [opts.service];

      if (!opts.all && !KNOWN_SERVICES.includes(opts.service)) {
        warn(`Unknown service: ${opts.service}`);
        info(`Known services: ${KNOWN_SERVICES.join(", ")}`);
      }

      if (!opts.force) {
        const { createInterface } = await import("node:readline");
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const what = opts.all ? "ALL services" : opts.service;
        const answer = await new Promise<string>(resolve =>
          rl.question(
            `\x1b[33m⚠\x1b[0m  Rotate secrets for ${what}? Active sessions will be invalidated. Type "yes": `,
            resolve
          )
        );
        rl.close();
        if (answer.trim().toLowerCase() !== "yes") {
          info("Cancelled");
          return;
        }
      }

      const results: RotateResult[] = [];
      for (const svc of services) {
        const spin = spinner(`Rotating secrets for ${svc}…`);
        try {
          const result = await apiRequest<RotateResult>("/api/admin/secrets/rotate", {
            method: "POST",
            body: { service: svc },
          });
          spin.succeed(`${svc}: ${result.status}`);
          results.push(result);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          spin.fail(`${svc}: failed`);
          if (msg.includes("404")) {
            info("  Admin secrets endpoint not yet available. Rotate manually:");
            info(`  docker compose exec ${svc} node scripts/rotate-secrets.js`);
          } else {
            error(`  ${msg}`);
          }
          results.push({ status: "error", service: svc, message: msg });
        }
      }

      if (isJsonMode()) printJson(results);
    });

  secrets
    .command("list")
    .description("List secret metadata for a service (names only, no values)")
    .requiredOption("--service <service>", "Service name")
    .action(async (opts: { service: string }) => {
      const spin = spinner(`Fetching secrets for ${opts.service}…`);
      try {
        const result = await apiRequest<{ service: string; secrets: string[] }>(
          `/api/admin/secrets?service=${encodeURIComponent(opts.service)}`
        );
        spin.succeed("Secrets loaded");
        if (isJsonMode()) { printJson(result); return; }
        info(`Secrets for ${result.service}:`);
        for (const name of result.secrets) {
          console.log(`  • ${name}`);
        }
      } catch (err) {
        spin.fail("Failed");
        error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
