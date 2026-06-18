/**
 * ensureSchema — idempotent schema-fixer that runs on every server startup.
 *
 * Guarantees that every table required for GRC data to load exists in the
 * database.  This covers two categories:
 *
 * 1. Tables in migrations 0006-0016 that may not have been applied to legacy
 *    databases (framework_library, browser_checks, trust_center_*, etc.)
 * 2. Columns added to existing tables after initial creation (agent_records,
 *    browser_checks alert columns).
 *
 * Every statement uses CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
 * so it is fully safe to run against databases that already have some or all
 * of these objects.  This runs as a belt-and-suspenders fallback AFTER the
 * Drizzle migrator — it catches any tables the migrator may have skipped due
 * to bootstrap/timestamp ordering issues.
 */

import { db } from "./db";
import { sql } from "drizzle-orm";

type Statement = { label: string; ddl: string };

const STATEMENTS: Statement[] = [
  // ── framework_library (migration 0006) ────────────────────────────────────
  // Powers the list_frameworks MCP tool and all compliance framework UI.
  {
    label: "CREATE framework_library",
    ddl: `CREATE TABLE IF NOT EXISTS framework_library (
      id            SERIAL PRIMARY KEY,
      short_code    TEXT NOT NULL UNIQUE,
      name          TEXT NOT NULL,
      version       TEXT NOT NULL DEFAULT '1.0',
      category      TEXT NOT NULL,
      region        TEXT NOT NULL DEFAULT 'Global',
      industry      TEXT,
      description   TEXT,
      controls_count INTEGER NOT NULL DEFAULT 0,
      is_active     BOOLEAN NOT NULL DEFAULT true,
      is_beta       BOOLEAN NOT NULL DEFAULT false,
      released_at   TEXT,
      created_at    TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
  },

  // ── framework_library_controls (migration 0006) ───────────────────────────
  {
    label: "CREATE framework_library_controls",
    ddl: `CREATE TABLE IF NOT EXISTS framework_library_controls (
      id               SERIAL PRIMARY KEY,
      framework_id     INTEGER NOT NULL REFERENCES framework_library(id) ON DELETE CASCADE,
      control_ref      TEXT NOT NULL,
      domain           TEXT NOT NULL,
      title            TEXT NOT NULL,
      description      TEXT,
      requirement_text TEXT,
      crosswalk_refs   JSONB NOT NULL DEFAULT '[]',
      created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(framework_id, control_ref)
    )`,
  },

  // ── tenant_frameworks (migration 0006) ────────────────────────────────────
  // Powers get_compliance_score and framework assignment UI.
  {
    label: "CREATE tenant_frameworks",
    ddl: `CREATE TABLE IF NOT EXISTS tenant_frameworks (
      id           SERIAL PRIMARY KEY,
      tenant_id    INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      framework_id INTEGER NOT NULL REFERENCES framework_library(id),
      assigned_at  TIMESTAMP NOT NULL DEFAULT NOW(),
      assigned_by  TEXT NOT NULL DEFAULT 'system',
      status       TEXT NOT NULL DEFAULT 'active',
      UNIQUE(tenant_id, framework_id)
    )`,
  },

  // ── browser_checks (migration 0007) ───────────────────────────────────────
  {
    label: "CREATE browser_checks",
    ddl: `CREATE TABLE IF NOT EXISTS browser_checks (
      id            SERIAL PRIMARY KEY,
      tenant_id     INTEGER NOT NULL REFERENCES tenants(id),
      check_id      TEXT NOT NULL,
      control_id    INTEGER NOT NULL REFERENCES compliance_controls(id),
      control_ref   TEXT NOT NULL,
      name          TEXT NOT NULL,
      url           TEXT NOT NULL,
      instruction   TEXT NOT NULL,
      template_id   TEXT,
      schedule_cron TEXT NOT NULL DEFAULT '0 8 * * *',
      enabled       BOOLEAN NOT NULL DEFAULT true,
      last_run_at   TIMESTAMP,
      last_status   TEXT,
      last_error    TEXT,
      created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT browser_checks_tenant_check_id_uniq UNIQUE (tenant_id, check_id)
    )`,
  },

  // ── browser_check_runs (migration 0007) ───────────────────────────────────
  {
    label: "CREATE browser_check_runs",
    ddl: `CREATE TABLE IF NOT EXISTS browser_check_runs (
      id           SERIAL PRIMARY KEY,
      tenant_id    INTEGER NOT NULL REFERENCES tenants(id),
      run_id       TEXT NOT NULL,
      check_id     TEXT NOT NULL,
      control_ref  TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'pending',
      screenshot_url TEXT,
      verdict      TEXT,
      error_message TEXT,
      duration_ms  INTEGER,
      triggered_by TEXT NOT NULL DEFAULT 'scheduled',
      created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT browser_check_runs_tenant_run_id_uniq UNIQUE (tenant_id, run_id)
    )`,
  },

  // ── evidence_artifacts: columns added in migration 0007 ───────────────────
  {
    label: "ALTER evidence_artifacts ADD screenshot_url",
    ddl: `ALTER TABLE evidence_artifacts ADD COLUMN IF NOT EXISTS screenshot_url TEXT`,
  },
  {
    label: "ALTER evidence_artifacts ADD verification_type",
    ddl: `ALTER TABLE evidence_artifacts ADD COLUMN IF NOT EXISTS verification_type TEXT`,
  },

  // ── browser_check_alert_settings ──────────────────────────────────────────
  {
    label: "CREATE browser_check_alert_settings",
    ddl: `CREATE TABLE IF NOT EXISTS browser_check_alert_settings (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL UNIQUE REFERENCES tenants(id),
      enabled BOOLEAN NOT NULL DEFAULT false,
      slack_webhook_url TEXT,
      email_recipients JSONB NOT NULL DEFAULT '[]',
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
  },

  // ── browser_check_alert_history ───────────────────────────────────────────
  {
    label: "CREATE browser_check_alert_history",
    ddl: `CREATE TABLE IF NOT EXISTS browser_check_alert_history (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id),
      run_id TEXT NOT NULL,
      check_id TEXT NOT NULL,
      check_name TEXT NOT NULL,
      url TEXT NOT NULL,
      verdict TEXT NOT NULL,
      control_ref TEXT NOT NULL,
      screenshot_url TEXT,
      channel TEXT NOT NULL,
      destination TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      sent_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
  },

  // ── evidence_alert_settings ───────────────────────────────────────────────
  {
    label: "CREATE evidence_alert_settings",
    ddl: `CREATE TABLE IF NOT EXISTS evidence_alert_settings (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL UNIQUE REFERENCES tenants(id),
      enabled BOOLEAN NOT NULL DEFAULT false,
      alert_on_failed BOOLEAN NOT NULL DEFAULT true,
      alert_on_stale BOOLEAN NOT NULL DEFAULT false,
      min_failed_count INTEGER NOT NULL DEFAULT 1,
      slack_webhook_url TEXT,
      email_recipients JSONB NOT NULL DEFAULT '[]',
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
  },

  // ── evidence_alert_history ────────────────────────────────────────────────
  {
    label: "CREATE evidence_alert_history",
    ddl: `CREATE TABLE IF NOT EXISTS evidence_alert_history (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id),
      run_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      destination TEXT NOT NULL,
      failed_count INTEGER NOT NULL DEFAULT 0,
      stale_count INTEGER NOT NULL DEFAULT 0,
      failed_controls JSONB NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      sent_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
  },

  // ── trust_center_configs ──────────────────────────────────────────────────
  {
    label: "CREATE trust_center_configs",
    ddl: `CREATE TABLE IF NOT EXISTS trust_center_configs (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL UNIQUE REFERENCES tenants(id),
      slug TEXT NOT NULL UNIQUE,
      published BOOLEAN NOT NULL DEFAULT false,
      display_name TEXT NOT NULL DEFAULT '',
      tagline TEXT NOT NULL DEFAULT '',
      accent_color TEXT NOT NULL DEFAULT '#1E3A5F',
      logo_url TEXT,
      custom_domain TEXT,
      custom_domain_status TEXT NOT NULL DEFAULT 'unverified',
      visible_sections JSONB NOT NULL DEFAULT '{"grcScore":true,"frameworks":true,"controls":true,"evidence":true,"certifications":true,"aiQa":true}',
      certifications JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
  },

  // ── trust_center_access_requests ──────────────────────────────────────────
  {
    label: "CREATE trust_center_access_requests",
    ddl: `CREATE TABLE IF NOT EXISTS trust_center_access_requests (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      message TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
  },

  // ── mcp_audit_log ─────────────────────────────────────────────────────────
  {
    label: "CREATE mcp_audit_log",
    ddl: `CREATE TABLE IF NOT EXISTS mcp_audit_log (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id),
      token_id INTEGER REFERENCES mcp_tokens(id) ON DELETE SET NULL,
      tool_name TEXT NOT NULL,
      called_at TIMESTAMP NOT NULL DEFAULT NOW(),
      duration_ms INTEGER,
      success BOOLEAN NOT NULL DEFAULT true,
      error_msg TEXT
    )`,
  },

  // ── agent_refresh_tokens ──────────────────────────────────────────────────
  {
    label: "CREATE agent_refresh_tokens",
    ddl: `CREATE TABLE IF NOT EXISTS agent_refresh_tokens (
      token TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      tenant_id INTEGER NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
  },

  // ── sla_records ───────────────────────────────────────────────────────────
  {
    label: "CREATE sla_records",
    ddl: `CREATE TABLE IF NOT EXISTS sla_records (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      sla_id TEXT NOT NULL,
      service TEXT NOT NULL,
      target REAL NOT NULL DEFAULT 99.9,
      current REAL NOT NULL DEFAULT 0,
      "window" TEXT NOT NULL DEFAULT '30d',
      breached INTEGER NOT NULL DEFAULT 0,
      p1_response TEXT NOT NULL DEFAULT '1h',
      p2_response TEXT NOT NULL DEFAULT '4h',
      status TEXT NOT NULL DEFAULT 'met',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT sla_tenant_sla_id_uniq UNIQUE (tenant_id, sla_id)
    )`,
  },

  // ── agent_records: add hmac_secret and public_key columns ─────────────────
  {
    label: "ALTER agent_records ADD hmac_secret",
    ddl: `ALTER TABLE agent_records ADD COLUMN IF NOT EXISTS hmac_secret TEXT NOT NULL DEFAULT ''`,
  },
  {
    label: "ALTER agent_records ADD public_key",
    ddl: `ALTER TABLE agent_records ADD COLUMN IF NOT EXISTS public_key TEXT`,
  },

  // ── browser_checks: add alert columns added in migration 0011 ─────────────
  {
    label: "ALTER browser_checks ADD alert_slack_webhook_url",
    ddl: `ALTER TABLE browser_checks ADD COLUMN IF NOT EXISTS alert_slack_webhook_url TEXT`,
  },
  {
    label: "ALTER browser_checks ADD alert_email_recipients",
    ddl: `ALTER TABLE browser_checks ADD COLUMN IF NOT EXISTS alert_email_recipients JSONB`,
  },

  // ── trust_center_configs: notification_email added in migration 0017 ───────
  {
    label: "ALTER trust_center_configs ADD notification_email",
    ddl: `ALTER TABLE trust_center_configs ADD COLUMN IF NOT EXISTS notification_email TEXT`,
  },

  // ── DSPM Access Events ───────────────────────────────────────────────────────
  {
    label: "CREATE dspm_access_events",
    ddl: `CREATE TABLE IF NOT EXISTS dspm_access_events (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      event_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL DEFAULT '',
      user_role TEXT NOT NULL DEFAULT '',
      user_dept TEXT NOT NULL DEFAULT '',
      store_id TEXT NOT NULL,
      store_name TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL DEFAULT 'READ',
      data_types JSONB NOT NULL DEFAULT '[]',
      sensitivity TEXT NOT NULL DEFAULT 'Internal',
      record_count INTEGER NOT NULL DEFAULT 0,
      src_ip TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      anomalous BOOLEAN NOT NULL DEFAULT FALSE,
      risk_level TEXT NOT NULL DEFAULT 'Low',
      risk_annotation TEXT NOT NULL DEFAULT '',
      occurred_at TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT dspm_access_evt_uniq UNIQUE (tenant_id, event_id)
    )`,
  },

  // ── DSPM Over-Access Alerts ──────────────────────────────────────────────────
  {
    label: "CREATE dspm_over_access_alerts",
    ddl: `CREATE TABLE IF NOT EXISTS dspm_over_access_alerts (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      alert_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL DEFAULT '',
      store_id TEXT NOT NULL,
      store_name TEXT NOT NULL DEFAULT '',
      sensitivity TEXT NOT NULL DEFAULT 'Confidential',
      alert_type TEXT NOT NULL DEFAULT 'Unusual Access Pattern',
      description TEXT NOT NULL DEFAULT '',
      access_count INTEGER NOT NULL DEFAULT 0,
      baseline_count INTEGER NOT NULL DEFAULT 0,
      severity TEXT NOT NULL DEFAULT 'High',
      status TEXT NOT NULL DEFAULT 'open',
      detected_at TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT dspm_over_access_alert_uniq UNIQUE (tenant_id, alert_id)
    )`,
  },

  // ── DSR Connectors ───────────────────────────────────────────────────────────
  {
    label: "CREATE dsr_connectors",
    ddl: `CREATE TABLE IF NOT EXISTS dsr_connectors (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      connector_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'database',
      icon TEXT NOT NULL DEFAULT '🗄',
      status TEXT NOT NULL DEFAULT 'connected',
      subject_count INTEGER NOT NULL DEFAULT 0,
      last_scan TEXT NOT NULL DEFAULT '',
      avg_fulfill_days REAL NOT NULL DEFAULT 2.5,
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT dsr_connector_uniq UNIQUE (tenant_id, connector_id)
    )`,
  },

  // ── service_changes ───────────────────────────────────────────────────────────
  {
    label: "CREATE service_changes",
    ddl: `CREATE TABLE IF NOT EXISTS service_changes (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      change_id TEXT NOT NULL,
      title TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'Normal',
      impact TEXT NOT NULL DEFAULT 'Medium',
      risk TEXT NOT NULL DEFAULT 'Medium',
      approver TEXT NOT NULL DEFAULT '',
      scheduled TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT svc_chg_tenant_id_uniq UNIQUE (tenant_id, change_id)
    )`,
  },

  // ── service_problems ──────────────────────────────────────────────────────────
  {
    label: "CREATE service_problems",
    ddl: `CREATE TABLE IF NOT EXISTS service_problems (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      problem_id TEXT NOT NULL,
      title TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'P3',
      affected TEXT NOT NULL DEFAULT '',
      root_cause TEXT NOT NULL DEFAULT '',
      workarounds INTEGER NOT NULL DEFAULT 0,
      changes INTEGER NOT NULL DEFAULT 0,
      incidents INTEGER NOT NULL DEFAULT 0,
      age TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'investigating',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT svc_prb_tenant_id_uniq UNIQUE (tenant_id, problem_id)
    )`,
  },

  // ── cmdb_items ────────────────────────────────────────────────────────────────
  {
    label: "CREATE cmdb_items",
    ddl: `CREATE TABLE IF NOT EXISTS cmdb_items (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      ci_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'Application',
      env TEXT NOT NULL DEFAULT 'Production',
      owner TEXT NOT NULL DEFAULT '',
      version TEXT NOT NULL DEFAULT '',
      criticality TEXT NOT NULL DEFAULT 'Medium',
      vulnerabilities INTEGER NOT NULL DEFAULT 0,
      patch TEXT NOT NULL DEFAULT 'Current',
      status TEXT NOT NULL DEFAULT 'operational',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT cmdb_tenant_ci_id_uniq UNIQUE (tenant_id, ci_id)
    )`,
  },

  // ── kb_articles ───────────────────────────────────────────────────────────────
  {
    label: "CREATE kb_articles",
    ddl: `CREATE TABLE IF NOT EXISTS kb_articles (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id),
      article_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT NOT NULL,
      tags TEXT,
      views INTEGER NOT NULL DEFAULT 0,
      helpful INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT kb_articles_tenant_article_id_uniq UNIQUE (tenant_id, article_id)
    )`,
  },

  // ── KB Articles — add module/framework columns ────────────────────────────────
  {
    label: "ALTER kb_articles add module",
    ddl: `ALTER TABLE kb_articles ADD COLUMN IF NOT EXISTS module TEXT`,
  },
  {
    label: "ALTER kb_articles add framework",
    ddl: `ALTER TABLE kb_articles ADD COLUMN IF NOT EXISTS framework TEXT`,
  },

  // ── IoT Devices ────────────────────────────────────────────────────────────────
  {
    label: "CREATE iot_devices",
    ddl: `CREATE TABLE IF NOT EXISTS iot_devices (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      device_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT '',
      manufacturer TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      firmware TEXT NOT NULL DEFAULT '',
      fw_date TEXT NOT NULL DEFAULT '',
      ip TEXT NOT NULL DEFAULT '',
      segment TEXT NOT NULL DEFAULT '',
      risk TEXT NOT NULL DEFAULT 'Medium',
      status TEXT NOT NULL DEFAULT 'online',
      last_seen TEXT NOT NULL DEFAULT '',
      open_ports TEXT NOT NULL DEFAULT '[]',
      protocols TEXT NOT NULL DEFAULT '[]',
      cves TEXT NOT NULL DEFAULT '[]',
      comm_peers TEXT NOT NULL DEFAULT '[]',
      isolation_action TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      confidence TEXT NOT NULL DEFAULT 'High',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT iot_dev_tenant_device_id_uniq UNIQUE (tenant_id, device_id)
    )`,
  },

  // ── OT Discovery ───────────────────────────────────────────────────────────────
  {
    label: "CREATE ot_discovery",
    ddl: `CREATE TABLE IF NOT EXISTS ot_discovery (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      discovery_id TEXT NOT NULL,
      ip TEXT NOT NULL DEFAULT '',
      hostname TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT '',
      confidence TEXT NOT NULL DEFAULT 'Medium',
      first_seen TEXT NOT NULL DEFAULT '',
      open_ports TEXT NOT NULL DEFAULT '[]',
      action TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT ot_disc_tenant_disc_id_uniq UNIQUE (tenant_id, discovery_id)
    )`,
  },

  // ── OT Protocols ───────────────────────────────────────────────────────────────
  {
    label: "CREATE ot_protocols",
    ddl: `CREATE TABLE IF NOT EXISTS ot_protocols (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      protocol_id TEXT NOT NULL,
      name TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 0,
      devices INTEGER NOT NULL DEFAULT 0,
      exposure TEXT NOT NULL DEFAULT 'Medium',
      encrypted BOOLEAN NOT NULL DEFAULT FALSE,
      description TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT ot_proto_tenant_proto_id_uniq UNIQUE (tenant_id, protocol_id)
    )`,
  },

  // ── CI Dependencies ────────────────────────────────────────────────────────────
  {
    label: "CREATE ci_dependencies",
    ddl: `CREATE TABLE IF NOT EXISTS ci_dependencies (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      edge_id TEXT NOT NULL,
      source_ci TEXT NOT NULL,
      target_ci TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT ci_dep_tenant_edge_uniq UNIQUE (tenant_id, edge_id)
    )`,
  },

  // ── CI Change Links ────────────────────────────────────────────────────────────
  {
    label: "CREATE ci_change_links",
    ddl: `CREATE TABLE IF NOT EXISTS ci_change_links (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      ci_id TEXT NOT NULL,
      change_id TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT ci_chg_link_uniq UNIQUE (tenant_id, ci_id, change_id)
    )`,
  },

  // ── DSR Pipeline Stores ──────────────────────────────────────────────────────
  {
    label: "CREATE dsr_pipeline_stores",
    ddl: `CREATE TABLE IF NOT EXISTS dsr_pipeline_stores (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      dsar_id TEXT NOT NULL,
      connector_id TEXT NOT NULL,
      connector_name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      records_found INTEGER NOT NULL DEFAULT 0,
      actioned_at TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT dsr_pipeline_store_uniq UNIQUE (tenant_id, dsar_id, connector_id)
    )`,
  },

  // ── Tenant Embed Tokens ───────────────────────────────────────────────────────
  // One unique token per tenant for the browser-embeddable JS package.
  {
    label: "CREATE tenant_embed_tokens",
    ddl: `CREATE TABLE IF NOT EXISTS tenant_embed_tokens (
      id           SERIAL PRIMARY KEY,
      tenant_id    INTEGER NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
      token        TEXT NOT NULL UNIQUE,
      label        TEXT NOT NULL DEFAULT 'Primary',
      last_used_at TIMESTAMP,
      beacon_count INTEGER NOT NULL DEFAULT 0,
      created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
  },
];

export async function ensureSchema(): Promise<void> {
  console.log("[ensureSchema] Running idempotent schema checks…");
  let fixed = 0;

  for (const { label, ddl } of STATEMENTS) {
    try {
      await db.execute(sql.raw(ddl));
      fixed++;
    } catch (err: unknown) {
      // Unwrap Drizzle _DrizzleQueryError to get the underlying PG error message
      const cause = (err as { cause?: unknown })?.cause;
      const pgMsg = cause instanceof Error ? cause.message : "";
      const topMsg = err instanceof Error ? err.message : String(err);
      const fullMsg = pgMsg || topMsg;
      // "already exists" errors are expected and harmless on re-runs
      if (!fullMsg.includes("already exists") && !fullMsg.includes("duplicate column") && !topMsg.includes("already exists")) {
        console.error(`[ensureSchema] WARN: ${label} —`, fullMsg || topMsg);
      }
    }
  }

  console.log(`[ensureSchema] Done (${fixed}/${STATEMENTS.length} statements applied)`);
}
