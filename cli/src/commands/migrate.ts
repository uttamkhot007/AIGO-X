import type { Command } from "commander";
import { apiRequest } from "../api.js";
import { success, error, info, spinner, printJson, isJsonMode } from "../output.js";

interface MigrateResult {
  status: string;
  applied?: number;
  message?: string;
}

export function registerMigrate(program: Command): void {
  const migrate = program
    .command("migrate")
    .description("Database migration operations");

  migrate
    .command("run")
    .description("Run all pending DB migrations")
    .option("--dry-run", "Show what would be applied without executing")
    .action(async (opts: { dryRun?: boolean }) => {
      const spin = spinner(opts.dryRun ? "Checking pending migrations…" : "Running DB migrations…");
      try {
        const result = await apiRequest<MigrateResult>("/api/admin/migrate", {
          method: "POST",
          body: { dryRun: opts.dryRun ?? false },
        });
        spin.succeed(result.message ?? "Migrations complete");
        if (isJsonMode()) { printJson(result); return; }
        if (typeof result.applied === "number") {
          info(`Applied: ${result.applied} migration(s)`);
        }
      } catch (err) {
        spin.fail("Migration failed");
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("404")) {
          error("Admin migrate endpoint not found on gateway.");
          info("To run migrations manually, SSH to the server and run:");
          info("  docker compose exec postgres psql -U grc_user -d dufense_grc < lib/db/migrations/*.sql");
        } else {
          error(msg);
        }
        process.exit(1);
      }
    });

  migrate
    .command("status")
    .description("Show migration status")
    .action(async () => {
      const spin = spinner("Checking migration status…");
      try {
        const result = await apiRequest<MigrateResult>("/api/admin/migrate/status");
        spin.succeed("Status retrieved");
        if (isJsonMode()) { printJson(result); return; }
        info(`Status: ${result.status}`);
        if (result.message) info(result.message);
      } catch (err) {
        spin.fail("Failed");
        error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
