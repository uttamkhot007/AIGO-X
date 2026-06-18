/**
 * runMigrations — applies all pending Drizzle SQL migrations at server startup.
 *
 * Uses drizzle-orm/node-postgres/migrator which tracks applied migrations in the
 * drizzle.__drizzle_migrations table. Every statement in the migration files is
 * idempotent (CREATE TABLE IF NOT EXISTS / ALTER TABLE ADD COLUMN IF NOT EXISTS)
 * so re-running is always safe.
 *
 * Bootstrap logic for existing databases:
 * If the tracking table is empty but the database already has a `tenants` table
 * (meaning migrations 0000-0015 were applied out-of-band), this function inserts
 * a sentinel record that tells the migrator those migrations are already applied.
 * Only genuinely new migrations (0016+) will be run against existing databases.
 *
 * Migration files live in lib/db/migrations/ and are bundled into dist/migrations/
 * by the copy step in build.mjs.
 */

import path from "path";
import { fileURLToPath } from "url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Timestamp of migration 0015_agent_records_secrets — the last migration applied
// out-of-band on existing databases. The Drizzle migrator uses this to determine
// which migrations still need to run (it only runs those with a higher timestamp).
const BOOTSTRAP_WHEN = 1750110000000n;

export async function runMigrations(): Promise<void> {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for migrations");
  }

  const db = drizzle(connectionString);
  const migrationsFolder = path.resolve(__dirname, "./migrations");

  // Bootstrap: if the tracking table exists but is empty AND the tenants table
  // already exists, the database was set up before the migration runner was wired in.
  // Insert a sentinel record so the migrator skips 0000-0015 and only runs 0016+.
  try {
    const tenantsExists = await db.execute<{ count: string }>(
      sql`SELECT COUNT(*) FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'tenants'`,
    );
    const hasTenants = Number(tenantsExists.rows[0]?.count ?? 0) > 0;

    if (hasTenants) {
      await db.execute(sql`CREATE SCHEMA IF NOT EXISTS drizzle`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
          id SERIAL PRIMARY KEY,
          hash TEXT NOT NULL,
          created_at BIGINT
        )
      `);
      const existing = await db.execute<{ count: string }>(
        sql`SELECT COUNT(*) FROM drizzle.__drizzle_migrations`,
      );
      const isEmpty = Number(existing.rows[0]?.count ?? 0) === 0;

      if (isEmpty) {
        // Mark all pre-existing migrations (0000-0015) as already applied.
        // Each row has the corrected monotonically-increasing when timestamp from _journal.json.
        // The Drizzle migrator queries DESC LIMIT 1, so it uses the highest timestamp (0015)
        // as the baseline and only applies migrations with when > 1750110000000 (i.e., 0016+).
        const applied = [
          { tag: "0000_slow_chat",                    when: 1749000000000 },
          { tag: "0001_wise_star_brand",              when: 1749100000000 },
          { tag: "0002_tough_abomination",            when: 1749200000000 },
          { tag: "0003_clean_carnage",                when: 1749300000000 },
          { tag: "0004_controls_unique",              when: 1750000000000 },
          { tag: "0005_evidence_alerts",              when: 1750010000000 },
          { tag: "0006_framework_library",            when: 1750020000000 },
          { tag: "0007_browser_checks",               when: 1750030000000 },
          { tag: "0008_mcp_audit_log",               when: 1750040000000 },
          { tag: "0009_trust_center_configs",         when: 1750050000000 },
          { tag: "0010_trust_center_access_requests", when: 1750060000000 },
          { tag: "0011_browser_check_alerts",         when: 1750070000000 },
          { tag: "0012_agent_refresh_tokens",         when: 1750080000000 },
          { tag: "0013_tenant_module_licenses",       when: 1750090000000 },
          { tag: "0014_tml_framework_ids_int_array",  when: 1750100000000 },
          { tag: "0015_agent_records_secrets",        when: 1750110000000 },
        ];
        for (const m of applied) {
          await db.execute(sql`
            INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
            VALUES (${`__applied_${m.tag}__`}, ${BigInt(m.when)})
          `);
        }
        console.log("[migrate] Bootstrapped migration tracking for existing database (0000-0015 marked as applied)");
      }
    }
  } catch (err) {
    console.warn("[migrate] Bootstrap check failed (non-fatal):", err instanceof Error ? err.message : err);
  }

  console.log("[migrate] Applying pending migrations from", migrationsFolder);
  await migrate(db, { migrationsFolder });
  console.log("[migrate] All migrations applied successfully");
}
