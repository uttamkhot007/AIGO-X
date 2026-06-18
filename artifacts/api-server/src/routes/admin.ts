import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth";
import { db } from "../lib/db";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import type { Request, Response } from "express";

const router = Router();
const isSuperAdmin = requireRole("super_admin");

// ── Path helpers ──────────────────────────────────────────────────────────────

// __dirname at runtime = artifacts/api-server/dist/
// so ../../.. resolves to the workspace root
const REPO_ROOT = path.resolve(__dirname, "../../..");
// Migrations are copied into dist/migrations/ by build.mjs (same folder migrate.ts uses)
const MIGRATIONS_FOLDER = path.join(__dirname, "migrations");
const JOURNAL_PATH = path.join(MIGRATIONS_FOLDER, "meta/_journal.json");
const BACKUP_SCRIPT = path.join(REPO_ROOT, "scripts/backup.sh");
const BACKUPS_DIR = path.join(REPO_ROOT, "backups");
// Store secrets inside .local/ which is writable and gitignored
const SECRETS_FILE = path.join(REPO_ROOT, ".local/admin-secrets.json");

// ── Migration helpers — aligned with src/lib/migrate.ts ──────────────────────
//
// The canonical tracking table is drizzle.__drizzle_migrations (schema-qualified).
// Bootstrap rows use hash = "__applied_<tag>__"; the Drizzle migrator uses the
// MAX(created_at) to decide which journal entries still need to run.

function getJournalEntries(): Array<{ idx: number; tag: string; when: number }> {
  try {
    const raw = fs.readFileSync(JOURNAL_PATH, "utf8");
    const journal = JSON.parse(raw) as { entries: Array<{ idx: number; tag: string; when: number }> };
    return journal.entries;
  } catch {
    return [];
  }
}

/** Returns the max created_at from drizzle.__drizzle_migrations, or -1 if empty / missing. */
async function getMaxAppliedWhen(): Promise<number> {
  try {
    const rows = await db.execute<{ max: string | null }>(
      sql`SELECT MAX(created_at) AS max FROM drizzle.__drizzle_migrations`
    );
    const val = rows.rows[0]?.max;
    return val != null ? Number(val) : -1;
  } catch {
    return -1;
  }
}

/** Returns pending journal entries (those with when > maxApplied). */
function getPendingEntries(
  entries: Array<{ idx: number; tag: string; when: number }>,
  maxApplied: number
): Array<{ idx: number; tag: string; when: number }> {
  return entries.filter((e) => e.when > maxApplied);
}

// ── GET /admin/migrate/status ─────────────────────────────────────────────────
// CLI reads: result.status, result.message

router.get("/admin/migrate/status", requireAuth, isSuperAdmin, async (_req, res) => {
  try {
    const entries = getJournalEntries();
    const maxApplied = await getMaxAppliedWhen();
    const pending = getPendingEntries(entries, maxApplied);
    const appliedCount = entries.length - pending.length;

    const status = pending.length === 0 ? "up-to-date" : "pending";
    const message =
      pending.length === 0
        ? `All ${entries.length} migration(s) are applied`
        : `${pending.length} migration(s) pending out of ${entries.length} total`;

    res.json({
      status,
      message,
      total: entries.length,
      applied: appliedCount,
      pending: pending.length,
      pendingMigrations: pending.map((e) => e.tag),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ status: "error", message });
  }
});

// ── POST /admin/migrate ───────────────────────────────────────────────────────
// CLI reads: result.status, result.applied (number), result.message
// Uses the canonical Drizzle migrator (same as src/lib/migrate.ts startup path).

router.post("/admin/migrate", requireAuth, isSuperAdmin, async (req, res) => {
  const dryRun = Boolean((req.body as { dryRun?: boolean })?.dryRun);

  try {
    const entries = getJournalEntries();
    const maxApplied = await getMaxAppliedWhen();
    const pending = getPendingEntries(entries, maxApplied);

    if (pending.length === 0) {
      res.json({ status: "ok", applied: 0, message: "No pending migrations" });
      return;
    }

    if (dryRun) {
      res.json({
        status: "ok",
        applied: 0,
        message: `Dry run: ${pending.length} migration(s) would be applied`,
        wouldApply: pending.map((e) => e.tag),
      });
      return;
    }

    const connectionString = process.env["DATABASE_URL"];
    if (!connectionString) throw new Error("DATABASE_URL is not set");

    const migrationDb = drizzle(connectionString);
    await migrate(migrationDb, { migrationsFolder: MIGRATIONS_FOLDER });

    // Verify how many were actually applied by re-checking
    const newMax = await getMaxAppliedWhen();
    const stillPending = getPendingEntries(entries, newMax);
    const appliedCount = pending.length - stillPending.length;

    res.json({
      status: "ok",
      applied: appliedCount,
      message: `Applied ${appliedCount} migration(s)`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ status: "error", applied: 0, message });
  }
});

// ── Backup helpers ────────────────────────────────────────────────────────────

interface BackupEntry {
  backupName: string;
  size: string;
  location: string;
  timestamp: string;
  tag: string;
}

function formatSize(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function listBackupFiles(limit: number): BackupEntry[] {
  if (!fs.existsSync(BACKUPS_DIR)) return [];

  const results: BackupEntry[] = [];

  const walk = (dir: string) => {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.name.endsWith(".tar.gz")) {
          const stat = fs.statSync(fullPath);
          const tagMatch = entry.name.match(/dufense-([^-]+)-/);
          results.push({
            backupName: entry.name,
            size: formatSize(stat.size),
            location: fullPath,
            timestamp: stat.mtime.toISOString(),
            tag: tagMatch ? tagMatch[1]! : "unknown",
          });
        }
      }
    } catch {
      // skip unreadable directories
    }
  };

  walk(BACKUPS_DIR);
  results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return results.slice(0, limit);
}

// ── GET /admin/backup ─────────────────────────────────────────────────────────
// CLI reads: result.backups (array of BackupResult with backupName, size, location)

router.get("/admin/backup", requireAuth, isSuperAdmin, (req, res) => {
  const limit = Math.min(parseInt((req.query["limit"] as string) || "20", 10), 100);
  const backups = listBackupFiles(limit);
  res.json({ count: backups.length, backups });
});

// ── POST /admin/backup ────────────────────────────────────────────────────────
// Streams progress via SSE (text/event-stream) as backup.sh runs.
// Each stdout/stderr line is emitted as { type: "log", line }.
// Final event is { type: "done", status, backupName?, size?, location? }.
// CLI uses apiRequest which reads SSE as text (fallback path) — backup completes
// and spin.succeed shows; detail fields are absent but no error is thrown.

router.post("/admin/backup", requireAuth, isSuperAdmin, (req: Request, res: Response) => {
  if (!fs.existsSync(BACKUP_SCRIPT)) {
    res.status(500).json({ status: "error", message: "backup.sh not found" });
    return;
  }

  const body = req.body as { tag?: string; includeRedis?: boolean } | undefined;
  const tag = body?.tag ?? "manual";
  const includeRedis = body?.includeRedis !== false;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendEvent = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    BACKUP_TAG: tag,
    BACKUP_REDIS: includeRedis ? "true" : "false",
  };

  const child = spawn("bash", [BACKUP_SCRIPT], { env, cwd: REPO_ROOT });

  child.stdout.on("data", (chunk: Buffer) => {
    for (const line of chunk.toString().split("\n").filter(Boolean)) {
      sendEvent({ type: "log", line });
    }
  });

  child.stderr.on("data", (chunk: Buffer) => {
    for (const line of chunk.toString().split("\n").filter(Boolean)) {
      sendEvent({ type: "log", level: "warn", line });
    }
  });

  child.on("close", (code) => {
    if (code === 0) {
      const latest = listBackupFiles(1)[0];
      sendEvent({
        type: "done",
        status: "ok",
        exitCode: code,
        backupName: latest?.backupName,
        size: latest?.size,
        location: latest?.location,
        timestamp: latest?.timestamp,
        message: "Backup complete",
      });
    } else {
      sendEvent({ type: "done", status: "error", exitCode: code, message: "Backup script failed" });
    }
    res.end();
  });

  child.on("error", (err) => {
    sendEvent({ type: "done", status: "error", message: err.message });
    res.end();
  });

  req.on("close", () => child.kill());
});

// ── Secrets helpers ───────────────────────────────────────────────────────────

interface SecretsStore {
  [service: string]: { [key: string]: string };
}

function readSecrets(): SecretsStore {
  try {
    if (!fs.existsSync(SECRETS_FILE)) return {};
    return JSON.parse(fs.readFileSync(SECRETS_FILE, "utf8")) as SecretsStore;
  } catch {
    return {};
  }
}

function writeSecrets(store: SecretsStore): void {
  const dir = path.dirname(SECRETS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SECRETS_FILE, JSON.stringify(store, null, 2), { mode: 0o600 });
}

function generateSecret(length = 64): string {
  const { randomBytes } = require("crypto") as typeof import("crypto");
  return randomBytes(length).toString("hex");
}

// ── GET /admin/secrets ────────────────────────────────────────────────────────
// CLI reads: result.service, result.secrets (array of key names)

router.get("/admin/secrets", requireAuth, isSuperAdmin, (req, res) => {
  const service = req.query["service"] as string | undefined;
  const store = readSecrets();

  if (service) {
    const secrets = Object.keys(store[service] ?? {});
    res.json({ service, secrets });
  } else {
    const services = Object.entries(store).map(([svc, keys]) => ({
      service: svc,
      secrets: Object.keys(keys),
    }));
    res.json({ services });
  }
});

// ── POST /admin/secrets/rotate ────────────────────────────────────────────────
// CLI sends: { service } only — rotates the canonical JWT signing secret
// CLI reads: result.status, result.service, result.rotatedAt, result.message
//
// Rotation strategy:
//  1. Generate a cryptographically random 64-byte hex secret
//  2. Persist to .local/admin-secrets.json (operator audit trail, 0o600)
//  3. Attempt to update .env at repo root so the new value is picked up on
//     the next docker compose up / service restart (best-effort, non-fatal)
//  Operator must restart the named service container for the new secret to
//  take effect in the running process.

const DEFAULT_ROTATE_KEY = "jwt_signing_secret";

/**
 * Maps the logical (service, key) pair to the environment variable name that the
 * service actually reads.
 *
 * JWT_SECRET is the shared signing secret consumed by every service; rotating it
 * for any service updates the shared key and requires all services to restart.
 * Other keys are scoped per-service: e.g. ("risk-service", "db_encryption_key")
 * → RISK_SERVICE_DB_ENCRYPTION_KEY.
 */
function toEnvVarName(service: string, key: string): string {
  if (key === "jwt_signing_secret" || key === "JWT_SECRET") return "JWT_SECRET";
  const svcPrefix = service.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const keyUpper = key.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  return `${svcPrefix}_${keyUpper}`;
}

/** Updates or inserts KEY=VALUE in a .env file. Non-fatal on failure. */
function updateDotEnv(envFile: string, envKey: string, envValue: string): boolean {
  try {
    let content = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
    const re = new RegExp(`^(${envKey}=.*)$`, "m");
    const line = `${envKey}=${envValue}`;
    if (re.test(content)) {
      content = content.replace(re, line);
    } else {
      content = content.endsWith("\n") || content === "" ? `${content}${line}\n` : `${content}\n${line}\n`;
    }
    fs.writeFileSync(envFile, content, { mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}

router.post("/admin/secrets/rotate", requireAuth, isSuperAdmin, (req, res) => {
  const { service, key } = req.body as { service?: string; key?: string };

  if (!service) {
    res.status(400).json({ status: "error", message: "'service' is required" });
    return;
  }

  const rotateKey = key ?? DEFAULT_ROTATE_KEY;
  const newSecret = generateSecret();

  // 1. Persist to secrets store
  const store = readSecrets();
  if (!store[service]) store[service] = {};
  store[service]![rotateKey] = newSecret;
  writeSecrets(store);

  // 2. Attempt .env update (best-effort)
  const envFile = path.join(REPO_ROOT, ".env");
  const envKey = toEnvVarName(service, rotateKey);
  const envUpdated = updateDotEnv(envFile, envKey, newSecret);

  const rotatedAt = new Date().toISOString();
  const envNote = envUpdated
    ? `${envKey} updated in .env — restart '${service}' to apply`
    : `Restart '${service}' and set ${envKey} to the new value to apply`;

  res.json({
    status: "ok",
    service,
    rotatedAt,
    envKey,
    envUpdated,
    message: `Secret '${rotateKey}' for service '${service}' has been rotated. ${envNote}.`,
  });
});

// ── GET /admin/logs/:service (SSE) ────────────────────────────────────────────
// CLI handles SSE stream via streamSSE(); emits { line } events
//
// Service names match the CLI KNOWN_SERVICES list (e.g. "auth-service").
// Container names in deploy/docker-compose.microservices.yml use the
// "dufense_<short>" scheme. We resolve the logical service name to the actual
// container name before calling docker logs.

/** Maps CLI / compose service names → Docker container_name in the default stack. */
const SERVICE_CONTAINER_MAP: Record<string, string> = {
  // Infrastructure
  "postgres":           "dufense_db",
  "redis":              "dufense_redis",
  // Microservices stack (docker-compose.microservices.yml)
  "auth-service":       "dufense_auth",
  "risk-service":       "dufense_risk",
  "compliance-service": "dufense_compliance",
  "governance-service": "dufense_governance",
  "privacy-service":    "dufense_privacy",
  "evidence-service":   "dufense_evidence",
  "secops-service":     "dufense_secops",
  "ai-service":         "dufense_ai",
  "trust-service":      "dufense_trust",
  "integration-service":"dufense_integration",
  "gateway":            "dufense_gateway",
  "web":                "dufense_web",
  "nginx":              "dufense_nginx",
  // Single-node stack (docker-compose.single.yml)
  "api":                "dufense_api",
};

router.get("/admin/logs/:service", requireAuth, isSuperAdmin, (req: Request, res: Response) => {
  const service = String(req.params["service"] ?? "");
  const tail = Math.min(parseInt((req.query["tail"] as string) || "100", 10), 1000);
  const follow = (req.query["follow"] as string) !== "false";
  const since = req.query["since"] as string | undefined;

  // Validate service name to prevent injection (alphanumeric, dashes, underscores only)
  if (!/^[\w-]{1,64}$/.test(service)) {
    res.status(400).json({ error: "Invalid service name" });
    return;
  }

  // Resolve logical service name → actual Docker container name.
  // Fall back to the raw service name so operators can also pass container
  // names directly (e.g., dufense_auth).
  const containerName = SERVICE_CONTAINER_MAP[service] ?? service;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendEvent = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const args = ["logs", containerName, `--tail=${tail}`];
  if (follow) args.push("--follow");
  if (since) args.push(`--since=${since}`);
  args.push("--timestamps");

  const child = spawn("docker", args);

  child.stdout.on("data", (chunk: Buffer) => {
    const lines = chunk.toString().split("\n").filter(Boolean);
    for (const line of lines) sendEvent({ type: "log", service, line });
  });

  child.stderr.on("data", (chunk: Buffer) => {
    const lines = chunk.toString().split("\n").filter(Boolean);
    for (const line of lines) sendEvent({ type: "log", service, line });
  });

  child.on("close", (code) => {
    sendEvent({ type: "done", exitCode: code });
    res.end();
  });

  child.on("error", (err) => {
    sendEvent({ type: "error", message: err.message });
    res.end();
  });

  req.on("close", () => child.kill());
});

export default router;
