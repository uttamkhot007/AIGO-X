import type { Command } from "commander";
import { apiRequest } from "../api.js";
import { success, error, info, spinner, printJson, isJsonMode } from "../output.js";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

interface BackupResult {
  status: string;
  backupName?: string;
  size?: string;
  location?: string;
  timestamp?: string;
  message?: string;
}

export function registerBackup(program: Command): void {
  const backup = program
    .command("backup")
    .description("Backup operations");

  backup
    .command("now")
    .description("Trigger an immediate backup (Postgres + Redis)")
    .option("--tag <tag>", "Backup tag (daily | weekly | manual)", "manual")
    .option("--redis", "Include Redis RDB snapshot", true)
    .option("--no-redis", "Skip Redis backup")
    .option("--local", "Force local execution via scripts/backup.sh instead of API")
    .action(async (opts: { tag: string; redis: boolean; local?: boolean }) => {
      if (opts.local) {
        await runLocalBackup(opts.tag, opts.redis);
        return;
      }

      const spin = spinner("Triggering backup via API…");
      try {
        const result = await apiRequest<BackupResult>("/api/admin/backup", {
          method: "POST",
          body: { tag: opts.tag, includeRedis: opts.redis },
        });
        spin.succeed("Backup complete");
        if (isJsonMode()) { printJson(result); return; }
        if (result.backupName) info(`Name:     ${result.backupName}`);
        if (result.size) info(`Size:     ${result.size}`);
        if (result.location) info(`Location: ${result.location}`);
      } catch (err) {
        spin.fail("API backup failed");
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("404") || msg.includes("connect")) {
          info("Falling back to local scripts/backup.sh…");
          await runLocalBackup(opts.tag, opts.redis);
        } else {
          error(msg);
          process.exit(1);
        }
      }
    });

  backup
    .command("list")
    .description("List recent backups")
    .option("--limit <n>", "Number of backups to show", "10")
    .action(async (opts: { limit: string }) => {
      const spin = spinner("Fetching backup list…");
      try {
        const result = await apiRequest<{ backups: BackupResult[] }>(
          `/api/admin/backup?limit=${opts.limit}`
        );
        spin.succeed("Backup list loaded");
        if (isJsonMode()) { printJson(result.backups); return; }
        if (result.backups.length === 0) { info("No backups found"); return; }
        for (const b of result.backups) {
          console.log(`  ${b.backupName ?? "—"}  ${b.size ?? ""}  ${b.location ?? ""}`);
        }
      } catch (err) {
        spin.fail("Failed");
        error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}

async function runLocalBackup(tag: string, includeRedis: boolean): Promise<void> {
  const scriptPaths = [
    join(process.cwd(), "scripts/backup.sh"),
    "/opt/dufense/scripts/backup.sh",
    join(import.meta.url.replace("file://", ""), "../../../scripts/backup.sh"),
  ];

  const script = scriptPaths.find(p => existsSync(p));
  if (!script) {
    error("Cannot find scripts/backup.sh. Run from the DuFense repo root or /opt/dufense.");
    process.exit(1);
  }

  const spin = spinner(`Running local backup (tag: ${tag})…`);
  try {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      BACKUP_TAG: tag,
      BACKUP_REDIS: includeRedis ? "true" : "false",
    };
    execSync(`bash "${script}"`, { stdio: "pipe", env });
    spin.succeed("Local backup complete");
    success(`Backup script: ${script}`);
  } catch (err) {
    spin.fail("Local backup failed");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
