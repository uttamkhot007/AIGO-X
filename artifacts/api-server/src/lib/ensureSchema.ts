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

  // ── AD Alert Rules — new columns for real-time dispatch ───────────────────────
  // slack_webhook_url: per-rule Slack/webhook URL for alert delivery
  // last_triggered_at: stamped when a change-feed event matches this rule
  {
    label: "ADD ad_alert_rules.slack_webhook_url",
    ddl: `ALTER TABLE ad_alert_rules ADD COLUMN IF NOT EXISTS slack_webhook_url TEXT`,
  },
  {
    label: "ADD ad_alert_rules.last_triggered_at",
    ddl: `ALTER TABLE ad_alert_rules ADD COLUMN IF NOT EXISTS last_triggered_at TIMESTAMP`,
  },

  // ── Privacy Score History ─────────────────────────────────────────────────────
  // Persisted on every /privacy/score computation so auditors can review the
  // full score timeline. The trend array in /privacy/score is drawn from here.
  {
    label: "CREATE privacy_score_history",
    ddl: `CREATE TABLE IF NOT EXISTS privacy_score_history (
      id           SERIAL PRIMARY KEY,
      tenant_id    INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      score        INTEGER NOT NULL,
      sub_scores   JSONB NOT NULL DEFAULT '{}',
      insights     JSONB NOT NULL DEFAULT '[]',
      computed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
  },
  {
    label: "CREATE INDEX privacy_score_history_tenant_computed",
    ddl: `CREATE INDEX IF NOT EXISTS privacy_score_history_tenant_computed_idx
          ON privacy_score_history (tenant_id, computed_at DESC)`,
  },
  {
    label: "CREATE TABLE privacy_rescore_schedules",
    ddl: `CREATE TABLE IF NOT EXISTS privacy_rescore_schedules (
      id             SERIAL PRIMARY KEY,
      tenant_id      INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      frequency      TEXT NOT NULL DEFAULT 'weekly',
      hour           INTEGER NOT NULL DEFAULT 8,
      day_of_week    INTEGER DEFAULT 1,
      day_of_month   INTEGER DEFAULT 1,
      active         BOOLEAN NOT NULL DEFAULT TRUE,
      next_run_at    TIMESTAMPTZ NOT NULL,
      last_run_at    TIMESTAMPTZ,
      last_score     INTEGER,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT privacy_rescore_schedules_tenant_uniq UNIQUE (tenant_id)
    )`,
  },
  {
    label: "ADD COLUMN cron_expr to privacy_rescore_schedules if missing",
    ddl: `ALTER TABLE privacy_rescore_schedules ADD COLUMN IF NOT EXISTS cron_expr TEXT NOT NULL DEFAULT '0 8 * * 1'`,
  },
  {
    label: "ADD UNIQUE CONSTRAINT privacy_rescore_schedules_tenant_uniq if missing",
    ddl: `DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name = 'privacy_rescore_schedules'
            AND constraint_name = 'privacy_rescore_schedules_tenant_uniq'
        ) THEN
          ALTER TABLE privacy_rescore_schedules
            ADD CONSTRAINT privacy_rescore_schedules_tenant_uniq UNIQUE (tenant_id);
        END IF;
      END $$`,
  },

  // ── sspm_finding_actions ──────────────────────────────────────────────────
  // Persists dismiss / assign / ticket-created actions for SSPM findings per tenant.
  {
    label: "CREATE sspm_finding_actions",
    ddl: `CREATE TABLE IF NOT EXISTS sspm_finding_actions (
      id           SERIAL PRIMARY KEY,
      tenant_id    INTEGER NOT NULL,
      finding_id   TEXT    NOT NULL,
      finding_type TEXT    NOT NULL DEFAULT 'exposure',
      status       TEXT    NOT NULL DEFAULT 'open',
      assignee     TEXT,
      actioned_by  TEXT,
      ticket_ref   TEXT,
      ticket_url   TEXT,
      notes        TEXT,
      history      JSONB   NOT NULL DEFAULT '[]',
      created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, finding_id)
    )`,
  },
  {
    label: "ALTER sspm_finding_actions ADD actioned_by",
    ddl: `ALTER TABLE sspm_finding_actions ADD COLUMN IF NOT EXISTS actioned_by TEXT`,
  },
  {
    label: "ALTER sspm_finding_actions ADD history",
    ddl: `ALTER TABLE sspm_finding_actions ADD COLUMN IF NOT EXISTS history JSONB NOT NULL DEFAULT '[]'`,
  },

  // ── vendor_evidences ─────────────────────────────────────────────────────
  {
    label: "CREATE vendor_evidences",
    ddl: `CREATE TABLE IF NOT EXISTS vendor_evidences (
      id            SERIAL PRIMARY KEY,
      tenant_id     INTEGER NOT NULL,
      vendor_name   TEXT    NOT NULL DEFAULT '',
      vendor_email  TEXT    NOT NULL DEFAULT '',
      file_name     TEXT    NOT NULL,
      file_size     INTEGER NOT NULL DEFAULT 0,
      file_type     TEXT    NOT NULL DEFAULT 'application/octet-stream',
      description   TEXT    NOT NULL DEFAULT '',
      control_ref   TEXT    NOT NULL DEFAULT '',
      framework     TEXT    NOT NULL DEFAULT '',
      status        TEXT    NOT NULL DEFAULT 'pending',
      review_notes  TEXT,
      reviewed_by   TEXT,
      reviewed_at   TIMESTAMPTZ,
      uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
  },

  // ── employee_trainings ───────────────────────────────────────────────────
  {
    label: "CREATE employee_trainings",
    ddl: `CREATE TABLE IF NOT EXISTS employee_trainings (
      id            SERIAL PRIMARY KEY,
      tenant_id     INTEGER NOT NULL,
      title         TEXT    NOT NULL,
      description   TEXT    NOT NULL DEFAULT '',
      content_url   TEXT    NOT NULL DEFAULT '',
      content_type  TEXT    NOT NULL DEFAULT 'link',
      assigned_by   TEXT    NOT NULL DEFAULT '',
      due_date      DATE,
      is_active     BOOLEAN NOT NULL DEFAULT TRUE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
  },

  // ── training_completions ─────────────────────────────────────────────────
  {
    label: "CREATE training_completions",
    ddl: `CREATE TABLE IF NOT EXISTS training_completions (
      id              SERIAL PRIMARY KEY,
      training_id     INTEGER NOT NULL,
      tenant_id       INTEGER NOT NULL,
      employee_email  TEXT    NOT NULL,
      completed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (training_id, employee_email)
    )`,
  },

  // ── vendor_profiles ───────────────────────────────────────────────────────
  {
    label: "CREATE vendor_profiles",
    ddl: `CREATE TABLE IF NOT EXISTS vendor_profiles (
      id               SERIAL PRIMARY KEY,
      tenant_id        INTEGER NOT NULL,
      vendor_email     TEXT    NOT NULL,
      company_name     TEXT    NOT NULL DEFAULT '',
      industry         TEXT    NOT NULL DEFAULT '',
      company_size     TEXT    NOT NULL DEFAULT '',
      website          TEXT    NOT NULL DEFAULT '',
      address_street   TEXT    NOT NULL DEFAULT '',
      address_city     TEXT    NOT NULL DEFAULT '',
      address_country  TEXT    NOT NULL DEFAULT '',
      contact_name     TEXT    NOT NULL DEFAULT '',
      contact_email    TEXT    NOT NULL DEFAULT '',
      contact_phone    TEXT    NOT NULL DEFAULT '',
      description      TEXT    NOT NULL DEFAULT '',
      certifications   TEXT    NOT NULL DEFAULT '[]',
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, vendor_email)
    )`,
  },

  // ── vendor_intel ──────────────────────────────────────────────────────────
  {
    label: "CREATE vendor_intel",
    ddl: `CREATE TABLE IF NOT EXISTS vendor_intel (
      id              SERIAL PRIMARY KEY,
      tenant_id       INTEGER NOT NULL,
      domain          TEXT    NOT NULL,
      spf_record      TEXT,
      spf_valid       BOOLEAN NOT NULL DEFAULT FALSE,
      dmarc_record    TEXT,
      dmarc_policy    TEXT    NOT NULL DEFAULT 'none',
      dmarc_valid     BOOLEAN NOT NULL DEFAULT FALSE,
      dkim_valid      BOOLEAN NOT NULL DEFAULT FALSE,
      mx_records      TEXT    NOT NULL DEFAULT '[]',
      breach_count    INTEGER NOT NULL DEFAULT 0,
      dark_web_hits   INTEGER NOT NULL DEFAULT 0,
      surface_score   INTEGER NOT NULL DEFAULT 0,
      risk_score      INTEGER NOT NULL DEFAULT 50,
      risk_factors    TEXT    NOT NULL DEFAULT '[]',
      deviations      TEXT    NOT NULL DEFAULT '[]',
      last_scanned    TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
  },

  // ── vendor_policies ────────────────────────────────────────────────────────
  {
    label: "CREATE vendor_policies",
    ddl: `CREATE TABLE IF NOT EXISTS vendor_policies (
      id              SERIAL PRIMARY KEY,
      tenant_id       INTEGER NOT NULL,
      title           TEXT    NOT NULL,
      description     TEXT    NOT NULL DEFAULT '',
      version         TEXT    NOT NULL DEFAULT '1.0',
      category        TEXT    NOT NULL DEFAULT 'general',
      content         TEXT    NOT NULL DEFAULT '',
      is_mandatory    BOOLEAN NOT NULL DEFAULT TRUE,
      is_active       BOOLEAN NOT NULL DEFAULT TRUE,
      effective_date  DATE,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
  },

  // ── vendor_policy_acks ─────────────────────────────────────────────────────
  {
    label: "CREATE vendor_policy_acks",
    ddl: `CREATE TABLE IF NOT EXISTS vendor_policy_acks (
      id            SERIAL PRIMARY KEY,
      policy_id     INTEGER NOT NULL,
      tenant_id     INTEGER NOT NULL,
      vendor_email  TEXT    NOT NULL,
      acked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (policy_id, vendor_email)
    )`,
  },

  // ── vendor_contracts ────────────────────────────────────────────────────────
  {
    label: "CREATE vendor_contracts",
    ddl: `CREATE TABLE IF NOT EXISTS vendor_contracts (
      id               SERIAL PRIMARY KEY,
      tenant_id        INTEGER NOT NULL,
      title            TEXT    NOT NULL,
      contract_type    TEXT    NOT NULL DEFAULT 'msa',
      description      TEXT    NOT NULL DEFAULT '',
      version          TEXT    NOT NULL DEFAULT '1.0',
      content_summary  TEXT    NOT NULL DEFAULT '',
      effective_date   DATE,
      expiry_date      DATE,
      is_mandatory     BOOLEAN NOT NULL DEFAULT TRUE,
      is_active        BOOLEAN NOT NULL DEFAULT TRUE,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
  },

  // ── vendor_contract_sigs ────────────────────────────────────────────────────
  {
    label: "CREATE vendor_contract_sigs",
    ddl: `CREATE TABLE IF NOT EXISTS vendor_contract_sigs (
      id              SERIAL PRIMARY KEY,
      contract_id     INTEGER NOT NULL,
      tenant_id       INTEGER NOT NULL,
      vendor_email    TEXT    NOT NULL,
      vendor_name     TEXT    NOT NULL DEFAULT '',
      signed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      signature_text  TEXT    NOT NULL DEFAULT '',
      UNIQUE (contract_id, vendor_email)
    )`,
  },

  // ── vendor_reports ────────────────────────────────────────────────────────
  {
    label: "CREATE vendor_reports",
    ddl: `CREATE TABLE IF NOT EXISTS vendor_reports (
      id               SERIAL PRIMARY KEY,
      tenant_id        INTEGER NOT NULL,
      vendor_email     TEXT    NOT NULL,
      vendor_name      TEXT    NOT NULL DEFAULT '',
      report_title     TEXT    NOT NULL,
      report_type      TEXT    NOT NULL DEFAULT 'audit',
      auditor_name     TEXT    NOT NULL DEFAULT '',
      period_from      DATE,
      period_to        DATE,
      report_date      DATE,
      framework        TEXT    NOT NULL DEFAULT '',
      scope            TEXT    NOT NULL DEFAULT '',
      findings_high    INTEGER NOT NULL DEFAULT 0,
      findings_medium  INTEGER NOT NULL DEFAULT 0,
      findings_low     INTEGER NOT NULL DEFAULT 0,
      findings_info    INTEGER NOT NULL DEFAULT 0,
      summary          TEXT    NOT NULL DEFAULT '',
      file_name        TEXT    NOT NULL DEFAULT '',
      status           TEXT    NOT NULL DEFAULT 'pending',
      assessment_notes TEXT,
      assessed_by      TEXT,
      assessed_at      TIMESTAMPTZ,
      uploaded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
  },
  // ── Risk review cycle (Loop 3) ──────────────────────────────────────────────
  // next_review_at + overdue are DERIVED in queries — never stored. These two
  // columns exist on risksTable (lib/db schema) but no Drizzle migration ships
  // them yet; ensureSchema is the documented self-healing fallback. Once a
  // `drizzle-kit generate` run produces the matching migration, this block
  // becomes redundant (the ADD COLUMN IF NOT EXISTS makes it a no-op there).
  {
    label: "ALTER risks ADD last_review_at",
    ddl: `ALTER TABLE risks ADD COLUMN IF NOT EXISTS last_review_at TIMESTAMPTZ`,
  },
  {
    label: "ALTER risks ADD review_frequency",
    ddl: `ALTER TABLE risks ADD COLUMN IF NOT EXISTS review_frequency TEXT NOT NULL DEFAULT 'annual'`,
  },
  // Backfill pre-existing risks: derive cadence from severity, seed last review.
  // Idempotent — the WHERE guard means re-runs touch nothing once populated.
  {
    label: "BACKFILL risks review cols from severity",
    ddl: `UPDATE risks SET
            last_review_at   = COALESCE(last_review_at, created_at),
            review_frequency = CASE
              WHEN severity = 'Critical' THEN 'quarterly'
              WHEN severity = 'High'     THEN 'semi-annual'
              ELSE 'annual'
            END
          WHERE last_review_at IS NULL`,
  },

  // ── ASRY CIA risk-scoring columns (lib/db schema lines 70-79) ───────────────
  // These 10 columns exist on risksTable in the db schema but were never
  // shipped as a Drizzle migration, so legacy databases SELECT * against them
  // and 500 (db.select().from(risksTable) expands every declared column).
  // Self-healing here matches the existing pattern above. All nullable so
  // pre-existing rows keep working until scored. ADD COLUMN IF NOT EXISTS
  // makes this a no-op on already-migrated databases.
  {
    label: "ALTER risks ADD c_val",
    ddl: `ALTER TABLE risks ADD COLUMN IF NOT EXISTS c_val INTEGER`,
  },
  {
    label: "ALTER risks ADD i_val",
    ddl: `ALTER TABLE risks ADD COLUMN IF NOT EXISTS i_val INTEGER`,
  },
  {
    label: "ALTER risks ADD a_val",
    ddl: `ALTER TABLE risks ADD COLUMN IF NOT EXISTS a_val INTEGER`,
  },
  {
    label: "ALTER risks ADD probability",
    ddl: `ALTER TABLE risks ADD COLUMN IF NOT EXISTS probability INTEGER`,
  },
  {
    label: "ALTER risks ADD impact_val",
    ddl: `ALTER TABLE risks ADD COLUMN IF NOT EXISTS impact_val INTEGER`,
  },
  {
    label: "ALTER risks ADD residual_probability",
    ddl: `ALTER TABLE risks ADD COLUMN IF NOT EXISTS residual_probability INTEGER`,
  },
  {
    label: "ALTER risks ADD residual_impact",
    ddl: `ALTER TABLE risks ADD COLUMN IF NOT EXISTS residual_impact INTEGER`,
  },
  {
    label: "ALTER risks ADD cia_score",
    ddl: `ALTER TABLE risks ADD COLUMN IF NOT EXISTS cia_score INTEGER`,
  },
  {
    label: "ALTER risks ADD inherent_score",
    ddl: `ALTER TABLE risks ADD COLUMN IF NOT EXISTS inherent_score INTEGER`,
  },
  {
    label: "ALTER risks ADD residual_score_val",
    ddl: `ALTER TABLE risks ADD COLUMN IF NOT EXISTS residual_score_val INTEGER`,
  },

  // ── ISMS onboarding (migrations 0032-0034) ─────────────────────────────────
  // Tenant org profile, risk methodology, and data-classification scheme —
  // populated on ISMS Setup completion. Belt-and-suspenders in case the
  // Drizzle migrator skips these on legacy databases.
  {
    label: "CREATE org_profile",
    ddl: `CREATE TABLE IF NOT EXISTS org_profile (
      id            SERIAL PRIMARY KEY,
      tenant_id     INTEGER NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
      org_name      TEXT, legal_entity TEXT, industry TEXT, employee_count TEXT,
      site_count    TEXT, locations TEXT, departments TEXT,
      ciso_name     TEXT, isms_manager TEXT, data_owner TEXT, timezone TEXT,
      updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
  },
  {
    label: "CREATE risk_methodology",
    ddl: `CREATE TABLE IF NOT EXISTS risk_methodology (
      id                  SERIAL PRIMARY KEY,
      tenant_id           INTEGER NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
      risk_appetite       TEXT,
      acceptance_threshold INTEGER,
      assessment_frequency TEXT,
      impact_financial     TEXT, impact_reputational TEXT,
      impact_legal         TEXT, impact_operational TEXT,
      likelihood_scale     TEXT,
      updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
  },
  {
    label: "CREATE data_classification_levels",
    ddl: `CREATE TABLE IF NOT EXISTS data_classification_levels (
      id        SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      level     TEXT NOT NULL,
      rank      INTEGER NOT NULL,
      UNIQUE(tenant_id, level)
    )`,
  },
  {
    label: "CREATE data_types",
    ddl: `CREATE TABLE IF NOT EXISTS data_types (
      id        SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name      TEXT NOT NULL,
      UNIQUE(tenant_id, name)
    )`,
  },

  // ── Unify control tables (migration 0035) ──────────────────────────────────
  // governance_controls_library becomes the single control implementation table.
  // Add the columns it lacked (migrated from compliance_controls) + the
  // enrichment columns licensing.ts was silently dropping + a scalar framework.
  {
    label: "ALTER governance_controls_library ADD implementation cols",
    ddl: `ALTER TABLE governance_controls_library
      ADD COLUMN IF NOT EXISTS evidence             INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS due_date             TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS linked_risk_ids      JSONB NOT NULL DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS training_coverage    INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS attestation_coverage INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_evidence_source TEXT`,
  },
  {
    label: "ALTER governance_controls_library ADD enrichment cols",
    ddl: `ALTER TABLE governance_controls_library
      ADD COLUMN IF NOT EXISTS control_nature     TEXT,
      ADD COLUMN IF NOT EXISTS risk_score         INTEGER,
      ADD COLUMN IF NOT EXISTS impact             TEXT,
      ADD COLUMN IF NOT EXISTS guidance_steps     JSONB NOT NULL DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS applicable_devices JSONB NOT NULL DEFAULT '[]'`,
  },
  {
    label: "ALTER governance_controls_library ADD framework col",
    ddl: `ALTER TABLE governance_controls_library
      ADD COLUMN IF NOT EXISTS framework TEXT NOT NULL DEFAULT ''`,
  },
  {
    label: "Widen governance_controls_library unique to (tenant, framework, control)",
    ddl: `ALTER TABLE governance_controls_library
      DROP CONSTRAINT IF EXISTS gov_controls_lib_tenant_control_uniq;
      ALTER TABLE governance_controls_library
      DROP CONSTRAINT IF EXISTS gov_controls_lib_tenant_fw_control_uniq;
      ALTER TABLE governance_controls_library
      ADD CONSTRAINT gov_controls_lib_tenant_fw_control_uniq UNIQUE (tenant_id, framework, control_id)`,
  },

  // ── risk_kri + risk_kri_readings tables ────────────────────────────────────
  // These tables were missing from migrations (runner aborted on 0031 conflict).
  {
    label: "CREATE risk_kri",
    ddl: `CREATE TABLE IF NOT EXISTS risk_kri (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      kri_id TEXT NOT NULL,
      risk_id INTEGER,
      name TEXT NOT NULL,
      domain TEXT,
      source_system TEXT,
      formula TEXT,
      threshold_warn NUMERIC,
      threshold_breach NUMERIC,
      current_value NUMERIC,
      status TEXT DEFAULT 'within',
      owner TEXT,
      last_measured_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, kri_id)
    )`,
  },
  {
    label: "CREATE risk_kri_readings",
    ddl: `CREATE TABLE IF NOT EXISTS risk_kri_readings (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      kri_id INTEGER NOT NULL,
      value NUMERIC NOT NULL,
      breached BOOLEAN DEFAULT false,
      measured_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
  },
  // ── evidence_artifacts FK fix ───────────────────────────────────────────────
  // The /evidence/summary endpoint joins evidence_artifacts.control_id against
  // governance_controls_library.id. The original FK pointed to compliance_controls
  // which caused FK violations when inserting evidence for governance controls.
  {
    label: "DROP evidence_artifacts FK to compliance_controls",
    ddl: `ALTER TABLE evidence_artifacts DROP CONSTRAINT IF EXISTS evidence_artifacts_control_id_compliance_controls_id_fk`,
  },
  // ── Common control implementation fields (migration 0037) ─────────────────
  // Makes a CCF common control a fully-editable record (Drata/Vanta-style),
  // mirroring governance_controls_library so the CCF detail page can edit owner,
  // implementation status, effectiveness, test cadence and deficiencies directly.
  // The migration runner aborts early on the pre-existing 0031 "risk_kri already
  // exists" error, so this self-healing block is what actually lands the columns.
  {
    label: "ALTER common_controls ADD implementation cols",
    ddl: `ALTER TABLE common_controls
      ADD COLUMN IF NOT EXISTS owner         TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS status        TEXT NOT NULL DEFAULT 'not-started',
      ADD COLUMN IF NOT EXISTS effectiveness INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS due_date      TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS last_tested   TEXT,
      ADD COLUMN IF NOT EXISTS next_test     TEXT,
      ADD COLUMN IF NOT EXISTS deficiencies  TEXT`,
  },

  // ── incident_erms — persists ERMS impact assessment + escalation ack ────────
  // Replaces the in-memory ermsDataMap (ERMS fields + escalation ack fields).
  // Composite PK (tenant_id, incident_id) enforces tenant isolation.
  {
    label: "CREATE incident_erms",
    ddl: `CREATE TABLE IF NOT EXISTS incident_erms (
      tenant_id                     INTEGER NOT NULL DEFAULT 1,
      incident_id                   TEXT    NOT NULL,
      basel_event_type              TEXT,
      financial_impact              NUMERIC NOT NULL DEFAULT 0,
      operational_impact            NUMERIC NOT NULL DEFAULT 1,
      reputational_impact           NUMERIC NOT NULL DEFAULT 1,
      regulatory_impact             NUMERIC NOT NULL DEFAULT 1,
      erms_severity                 TEXT    NOT NULL DEFAULT 'VeryLow',
      escalation_acknowledged_by    TEXT,
      escalation_acknowledged_user_id TEXT,
      escalation_acknowledged_email TEXT,
      escalation_acknowledged_at    TEXT,
      escalation_notes              TEXT    NOT NULL DEFAULT '',
      updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, incident_id)
    )`,
  },
  // Migrate existing incident_erms tables created with single-column PK
  { label: "DROP incident_erms old PK", ddl: `ALTER TABLE incident_erms DROP CONSTRAINT IF EXISTS incident_erms_pkey` },
  { label: "ADD incident_erms composite PK", ddl: `ALTER TABLE incident_erms ADD PRIMARY KEY (tenant_id, incident_id)` },

  // ── incident_ild — persists Internal Loss Data (gross/net loss) ─────────────
  // Replaces the ILD fields stored in the in-memory ermsDataMap.
  {
    label: "CREATE incident_ild",
    ddl: `CREATE TABLE IF NOT EXISTS incident_ild (
      tenant_id        INTEGER NOT NULL DEFAULT 1,
      incident_id      TEXT    NOT NULL,
      gross_loss       NUMERIC NOT NULL DEFAULT 0,
      recovery_amount  NUMERIC NOT NULL DEFAULT 0,
      net_loss         NUMERIC NOT NULL DEFAULT 0,
      currency         TEXT    NOT NULL DEFAULT 'USD',
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, incident_id)
    )`,
  },
  { label: "DROP incident_ild old PK", ddl: `ALTER TABLE incident_ild DROP CONSTRAINT IF EXISTS incident_ild_pkey` },
  { label: "ADD incident_ild composite PK", ddl: `ALTER TABLE incident_ild ADD PRIMARY KEY (tenant_id, incident_id)` },

  // ── incident_corrective_actions — replaces correctiveActionsMap ─────────────
  // tenant_id is part of a unique constraint so CA ids are scoped per tenant.
  {
    label: "CREATE incident_corrective_actions",
    ddl: `CREATE TABLE IF NOT EXISTS incident_corrective_actions (
      id           TEXT    NOT NULL,
      incident_id  TEXT    NOT NULL,
      tenant_id    INTEGER NOT NULL DEFAULT 1,
      title        TEXT    NOT NULL,
      assignee     TEXT    NOT NULL DEFAULT 'Unassigned',
      due_date     TEXT,
      type         TEXT    NOT NULL DEFAULT 'Corrective',
      status       TEXT    NOT NULL DEFAULT 'open',
      evidence_url TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ,
      PRIMARY KEY (tenant_id, id)
    )`,
  },
  { label: "DROP incident_corrective_actions old PK", ddl: `ALTER TABLE incident_corrective_actions DROP CONSTRAINT IF EXISTS incident_corrective_actions_pkey` },
  { label: "ADD incident_corrective_actions composite PK", ddl: `ALTER TABLE incident_corrective_actions ADD PRIMARY KEY (tenant_id, id)` },

  // ── incident_risk_links — replaces incidentRiskLinksMap ─────────────────────
  {
    label: "CREATE incident_risk_links",
    ddl: `CREATE TABLE IF NOT EXISTS incident_risk_links (
      tenant_id   INTEGER NOT NULL DEFAULT 1,
      incident_id TEXT    NOT NULL,
      risk_id     TEXT    NOT NULL,
      linked_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, incident_id, risk_id)
    )`,
  },
  { label: "DROP incident_risk_links old PK", ddl: `ALTER TABLE incident_risk_links DROP CONSTRAINT IF EXISTS incident_risk_links_pkey` },
  { label: "ADD incident_risk_links composite PK", ddl: `ALTER TABLE incident_risk_links ADD PRIMARY KEY (tenant_id, incident_id, risk_id)` },

  // ── incident_merges — replaces mergedIncidentsMap ───────────────────────────
  {
    label: "CREATE incident_merges",
    ddl: `CREATE TABLE IF NOT EXISTS incident_merges (
      tenant_id    INTEGER NOT NULL DEFAULT 1,
      master_id    TEXT    NOT NULL,
      duplicate_id TEXT    NOT NULL,
      merged_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, master_id, duplicate_id)
    )`,
  },
  { label: "DROP incident_merges old PK", ddl: `ALTER TABLE incident_merges DROP CONSTRAINT IF EXISTS incident_merges_pkey` },
  { label: "ADD incident_merges composite PK", ddl: `ALTER TABLE incident_merges ADD PRIMARY KEY (tenant_id, master_id, duplicate_id)` },

  // ── incidents — persists core incident records replacing SEED_INCIDENTS ──────
  // Each tenant gets their own rows; demo incidents are seeded once on startup.
  // All mutable state (status, timeline, timestamps) is stored here so it
  // survives server restarts.  Overlay tables (incident_erms, incident_ild,
  // incident_corrective_actions, incident_risk_links, incident_merges) remain
  // separate for their respective domains.
  {
    label: "CREATE incidents",
    ddl: `CREATE TABLE IF NOT EXISTS incidents (
      tenant_id        INTEGER NOT NULL DEFAULT 1,
      incident_id      TEXT    NOT NULL,
      title            TEXT    NOT NULL,
      priority         TEXT    NOT NULL DEFAULT 'P3 - Medium',
      status           TEXT    NOT NULL DEFAULT 'open',
      type             TEXT    NOT NULL DEFAULT '',
      region_flag      TEXT    NOT NULL DEFAULT '🌐',
      region           TEXT    NOT NULL DEFAULT 'Global',
      tags             JSONB   NOT NULL DEFAULT '[]',
      description      TEXT    NOT NULL DEFAULT '',
      impact           TEXT    NOT NULL DEFAULT '',
      root_cause       TEXT    NOT NULL DEFAULT '',
      affected_systems JSONB   NOT NULL DEFAULT '[]',
      owner            TEXT    NOT NULL DEFAULT '',
      reporter         TEXT    NOT NULL DEFAULT '',
      started          TEXT    NOT NULL DEFAULT '',
      detected         TEXT,
      contained        TEXT,
      resolved         TEXT,
      mttr             TEXT    NOT NULL DEFAULT 'In progress',
      mttd             TEXT    NOT NULL DEFAULT '',
      users_affected   INTEGER NOT NULL DEFAULT 0,
      escalation_level INTEGER NOT NULL DEFAULT 1,
      data_breach      BOOLEAN NOT NULL DEFAULT false,
      notify_pending   BOOLEAN NOT NULL DEFAULT false,
      sla_at_risk      BOOLEAN NOT NULL DEFAULT false,
      ai_insights      JSONB   NOT NULL DEFAULT '[]',
      timeline         JSONB   NOT NULL DEFAULT '[]',
      merged_into_id   TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, incident_id)
    )`,
  },

  // ── SSPM Score Snapshots ──────────────────────────────────────────────────
  {
    label: "CREATE sspm_score_snapshots",
    ddl: `CREATE TABLE IF NOT EXISTS sspm_score_snapshots (
      id           SERIAL PRIMARY KEY,
      tenant_id    INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      app_id       TEXT    NOT NULL,
      score        INTEGER NOT NULL,
      breakdown    JSONB   NOT NULL DEFAULT '{}',
      snapshot_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, app_id, snapshot_at)
    )`,
  },
  {
    label: "CREATE sspm_score_snapshots index",
    ddl: `CREATE INDEX IF NOT EXISTS sspm_score_snapshots_tenant_app_idx
      ON sspm_score_snapshots (tenant_id, app_id, snapshot_at DESC)`,
  },

  // ── ResilienceOps — BCP / BCDR / BIA tables ───────────────────────────────
  {
    label: "CREATE bcp_plans",
    ddl: `CREATE TABLE IF NOT EXISTS bcp_plans (
      id           SERIAL PRIMARY KEY,
      tenant_id    INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      plan_id      TEXT NOT NULL,
      name         TEXT NOT NULL,
      scope        TEXT NOT NULL DEFAULT 'departmental',
      owner        TEXT NOT NULL DEFAULT '',
      department   TEXT NOT NULL DEFAULT '',
      version      TEXT NOT NULL DEFAULT '1.0',
      last_review  TEXT NOT NULL DEFAULT '',
      status       TEXT NOT NULL DEFAULT 'Draft',
      linked_assets JSONB NOT NULL DEFAULT '[]',
      linked_dr    TEXT NOT NULL DEFAULT '',
      notes        TEXT NOT NULL DEFAULT '',
      created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT bcp_plans_tenant_plan_id_uniq UNIQUE (tenant_id, plan_id)
    )`,
  },
  {
    label: "CREATE bia_entries",
    ddl: `CREATE TABLE IF NOT EXISTS bia_entries (
      id              SERIAL PRIMARY KEY,
      tenant_id       INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      entry_id        TEXT NOT NULL,
      process_name    TEXT NOT NULL,
      department      TEXT NOT NULL DEFAULT '',
      owner           TEXT NOT NULL DEFAULT '',
      mtpd            TEXT NOT NULL DEFAULT '',
      rto             TEXT NOT NULL DEFAULT '',
      rpo             TEXT NOT NULL DEFAULT '',
      min_staff       INTEGER NOT NULL DEFAULT 0,
      criticality     TEXT NOT NULL DEFAULT 'Medium',
      financial_impact TEXT NOT NULL DEFAULT 'Medium',
      operational_impact TEXT NOT NULL DEFAULT 'Medium',
      legal_impact    TEXT NOT NULL DEFAULT 'Low',
      reputational_impact TEXT NOT NULL DEFAULT 'Low',
      dependencies    JSONB NOT NULL DEFAULT '[]',
      notes           TEXT NOT NULL DEFAULT '',
      created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT bia_entries_tenant_entry_id_uniq UNIQUE (tenant_id, entry_id)
    )`,
  },
  {
    label: "ALTER bia_entries ADD min_systems",
    ddl: `ALTER TABLE bia_entries ADD COLUMN IF NOT EXISTS min_systems INTEGER NOT NULL DEFAULT 0`,
  },
  {
    label: "ALTER bia_entries ADD work_arrangement",
    ddl: `ALTER TABLE bia_entries ADD COLUMN IF NOT EXISTS work_arrangement TEXT NOT NULL DEFAULT 'Office/Remote'`,
  },
  {
    label: "ALTER bia_entries ADD mor_notes",
    ddl: `ALTER TABLE bia_entries ADD COLUMN IF NOT EXISTS mor_notes TEXT NOT NULL DEFAULT ''`,
  },
  {
    label: "CREATE bcp_tests",
    ddl: `CREATE TABLE IF NOT EXISTS bcp_tests (
      id              SERIAL PRIMARY KEY,
      tenant_id       INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      test_id         TEXT NOT NULL,
      plan_id         TEXT NOT NULL DEFAULT '',
      plan_name       TEXT NOT NULL DEFAULT '',
      test_type       TEXT NOT NULL DEFAULT 'Tabletop',
      scheduled_date  TEXT NOT NULL DEFAULT '',
      completed_date  TEXT NOT NULL DEFAULT '',
      outcome         TEXT NOT NULL DEFAULT 'pending',
      actual_rto      TEXT NOT NULL DEFAULT '',
      target_rto      TEXT NOT NULL DEFAULT '',
      participants    JSONB NOT NULL DEFAULT '[]',
      findings        TEXT NOT NULL DEFAULT '',
      actions         JSONB NOT NULL DEFAULT '[]',
      conducted_by    TEXT NOT NULL DEFAULT '',
      created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT bcp_tests_tenant_test_id_uniq UNIQUE (tenant_id, test_id)
    )`,
  },
  {
    label: "CREATE dr_links",
    ddl: `CREATE TABLE IF NOT EXISTS dr_links (
      id              SERIAL PRIMARY KEY,
      tenant_id       INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      link_id         TEXT NOT NULL,
      bcp_plan_id     TEXT NOT NULL DEFAULT '',
      bcp_plan_name   TEXT NOT NULL DEFAULT '',
      dr_plan_name    TEXT NOT NULL DEFAULT '',
      target_rto      TEXT NOT NULL DEFAULT '',
      target_rpo      TEXT NOT NULL DEFAULT '',
      actual_rto      TEXT NOT NULL DEFAULT '',
      actual_rpo      TEXT NOT NULL DEFAULT '',
      rag_status      TEXT NOT NULL DEFAULT 'Green',
      last_tested     TEXT NOT NULL DEFAULT '',
      owner           TEXT NOT NULL DEFAULT '',
      notes           TEXT NOT NULL DEFAULT '',
      created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT dr_links_tenant_link_id_uniq UNIQUE (tenant_id, link_id)
    )`,
  },
  // ── Financial Risk (Task #272) ──────────────────────────────────────────
  {
    label: "CREATE financial_instruments",
    ddl: `CREATE TABLE IF NOT EXISTS financial_instruments (
      id                 SERIAL PRIMARY KEY,
      tenant_id          INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      instrument_id      TEXT NOT NULL,
      counterparty       TEXT NOT NULL DEFAULT '',
      instrument_type    TEXT NOT NULL DEFAULT 'Loan',
      outstanding_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
      currency           TEXT NOT NULL DEFAULT 'USD',
      stage              INTEGER NOT NULL DEFAULT 1,
      pd_pct             NUMERIC(8,4) NOT NULL DEFAULT 0,
      lgd_pct            NUMERIC(8,4) NOT NULL DEFAULT 0,
      ead                NUMERIC(18,2) NOT NULL DEFAULT 0,
      ecl_12m            NUMERIC(18,2) NOT NULL DEFAULT 0,
      ecl_lifetime       NUMERIC(18,2) NOT NULL DEFAULT 0,
      days_past_due      INTEGER NOT NULL DEFAULT 0,
      watchlist          BOOLEAN NOT NULL DEFAULT FALSE,
      maturity_date      TEXT NOT NULL DEFAULT '',
      notes              TEXT NOT NULL DEFAULT '',
      created_at         TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT financial_instruments_tenant_id_uniq UNIQUE (tenant_id, instrument_id)
    )`,
  },
  {
    label: "CREATE reserve_portfolios",
    ddl: `CREATE TABLE IF NOT EXISTS reserve_portfolios (
      id           SERIAL PRIMARY KEY,
      tenant_id    INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      portfolio_id TEXT NOT NULL,
      bucket       TEXT NOT NULL DEFAULT 'Working Capital',
      balance      NUMERIC(18,2) NOT NULL DEFAULT 0,
      target       NUMERIC(18,2) NOT NULL DEFAULT 0,
      currency     TEXT NOT NULL DEFAULT 'USD',
      as_of_date   TEXT NOT NULL DEFAULT '',
      notes        TEXT NOT NULL DEFAULT '',
      created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT reserve_portfolios_tenant_id_uniq UNIQUE (tenant_id, portfolio_id)
    )`,
  },
  {
    label: "CREATE collateral_items",
    ddl: `CREATE TABLE IF NOT EXISTS collateral_items (
      id                SERIAL PRIMARY KEY,
      tenant_id         INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      collateral_id     TEXT NOT NULL,
      instrument_id     TEXT NOT NULL DEFAULT '',
      counterparty      TEXT NOT NULL DEFAULT '',
      security_type     TEXT NOT NULL DEFAULT 'Property',
      valuation_date    TEXT NOT NULL DEFAULT '',
      current_value     NUMERIC(18,2) NOT NULL DEFAULT 0,
      haircut_pct       NUMERIC(8,4) NOT NULL DEFAULT 0,
      adjusted_value    NUMERIC(18,2) NOT NULL DEFAULT 0,
      margin_threshold  NUMERIC(18,2) NOT NULL DEFAULT 0,
      currency          TEXT NOT NULL DEFAULT 'USD',
      notes             TEXT NOT NULL DEFAULT '',
      created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT collateral_items_tenant_id_uniq UNIQUE (tenant_id, collateral_id)
    )`,
  },
  {
    label: "CREATE market_risk_metrics",
    ddl: `CREATE TABLE IF NOT EXISTS market_risk_metrics (
      id            SERIAL PRIMARY KEY,
      tenant_id     INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      metric_id     TEXT NOT NULL,
      metric_type   TEXT NOT NULL DEFAULT 'HQLA',
      label         TEXT NOT NULL DEFAULT '',
      current_value NUMERIC(18,4) NOT NULL DEFAULT 0,
      threshold     NUMERIC(18,4) NOT NULL DEFAULT 0,
      unit          TEXT NOT NULL DEFAULT '',
      currency      TEXT NOT NULL DEFAULT '',
      as_of_date    TEXT NOT NULL DEFAULT '',
      notes         TEXT NOT NULL DEFAULT '',
      created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT market_risk_metrics_tenant_id_uniq UNIQUE (tenant_id, metric_id)
    )`,
  },
  // ── Project Risk (Task #273) ────────────────────────────────────────────
  {
    label: "CREATE project_register",
    ddl: `CREATE TABLE IF NOT EXISTS project_register (
      id           SERIAL PRIMARY KEY,
      tenant_id    INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      project_id   TEXT NOT NULL,
      name         TEXT NOT NULL DEFAULT '',
      directorate  TEXT NOT NULL DEFAULT '',
      objectives   TEXT NOT NULL DEFAULT '',
      budget       NUMERIC(18,2) NOT NULL DEFAULT 0,
      currency     TEXT NOT NULL DEFAULT 'USD',
      phase        TEXT NOT NULL DEFAULT 'Initiation',
      status       TEXT NOT NULL DEFAULT 'On Track',
      owner        TEXT NOT NULL DEFAULT '',
      start_date   TEXT NOT NULL DEFAULT '',
      end_date     TEXT NOT NULL DEFAULT '',
      kris         JSONB NOT NULL DEFAULT '[]',
      notes        TEXT NOT NULL DEFAULT '',
      created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT project_register_tenant_id_uniq UNIQUE (tenant_id, project_id)
    )`,
  },
  {
    label: "CREATE project_risks",
    ddl: `CREATE TABLE IF NOT EXISTS project_risks (
      id                  SERIAL PRIMARY KEY,
      tenant_id           INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      risk_id             TEXT NOT NULL,
      project_id          TEXT NOT NULL DEFAULT '',
      description         TEXT NOT NULL DEFAULT '',
      root_cause          TEXT NOT NULL DEFAULT '',
      phases_affected     JSONB NOT NULL DEFAULT '[]',
      likelihood          INTEGER NOT NULL DEFAULT 3,
      impact              INTEGER NOT NULL DEFAULT 3,
      inherent_score      INTEGER NOT NULL DEFAULT 9,
      mitigation          TEXT NOT NULL DEFAULT '',
      residual_likelihood INTEGER NOT NULL DEFAULT 2,
      residual_impact     INTEGER NOT NULL DEFAULT 2,
      residual_score      INTEGER NOT NULL DEFAULT 4,
      owner               TEXT NOT NULL DEFAULT '',
      due_date            TEXT NOT NULL DEFAULT '',
      kri                 TEXT NOT NULL DEFAULT '',
      kri_threshold       TEXT NOT NULL DEFAULT '',
      kri_value           TEXT NOT NULL DEFAULT '',
      status              TEXT NOT NULL DEFAULT 'Open',
      created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT project_risks_tenant_id_uniq UNIQUE (tenant_id, risk_id)
    )`,
  },
  {
    label: "ALTER project_register ADD pct_complete",
    ddl: `ALTER TABLE project_register ADD COLUMN IF NOT EXISTS pct_complete INTEGER NOT NULL DEFAULT 0`,
  },
  {
    label: "CREATE project_milestones",
    ddl: `CREATE TABLE IF NOT EXISTS project_milestones (
      id              SERIAL PRIMARY KEY,
      tenant_id       INTEGER NOT NULL,
      project_id      TEXT NOT NULL DEFAULT '',
      name            TEXT NOT NULL DEFAULT '',
      start_date      TEXT NOT NULL DEFAULT '',
      end_date        TEXT NOT NULL DEFAULT '',
      status          TEXT NOT NULL DEFAULT 'On Track',
      owner           TEXT NOT NULL DEFAULT '',
      completion_pct  INTEGER NOT NULL DEFAULT 0,
      notes           TEXT NOT NULL DEFAULT '',
      created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
  },
  {
    label: "CREATE project_resources",
    ddl: `CREATE TABLE IF NOT EXISTS project_resources (
      id              SERIAL PRIMARY KEY,
      tenant_id       INTEGER NOT NULL,
      project_id      TEXT NOT NULL DEFAULT '',
      name            TEXT NOT NULL DEFAULT '',
      role            TEXT NOT NULL DEFAULT '',
      allocated_hours NUMERIC NOT NULL DEFAULT 0,
      actual_hours    NUMERIC NOT NULL DEFAULT 0,
      rate_per_hour   NUMERIC NOT NULL DEFAULT 0,
      currency        TEXT NOT NULL DEFAULT 'USD',
      notes           TEXT NOT NULL DEFAULT '',
      created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
  },
  {
    label: "CREATE project_budget_items",
    ddl: `CREATE TABLE IF NOT EXISTS project_budget_items (
      id              SERIAL PRIMARY KEY,
      tenant_id       INTEGER NOT NULL,
      project_id      TEXT NOT NULL DEFAULT '',
      category        TEXT NOT NULL DEFAULT 'Labour',
      description     TEXT NOT NULL DEFAULT '',
      planned_cost    NUMERIC NOT NULL DEFAULT 0,
      actual_cost     NUMERIC NOT NULL DEFAULT 0,
      period          TEXT NOT NULL DEFAULT '',
      currency        TEXT NOT NULL DEFAULT 'USD',
      created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
  },
  {
    label: "CREATE pm_integrations",
    ddl: `CREATE TABLE IF NOT EXISTS pm_integrations (
      id              SERIAL PRIMARY KEY,
      tenant_id       INTEGER NOT NULL,
      tool            TEXT NOT NULL DEFAULT '',
      status          TEXT NOT NULL DEFAULT 'Not Connected',
      imported_count  INTEGER NOT NULL DEFAULT 0,
      last_synced_at  TEXT NOT NULL DEFAULT '',
      notes           TEXT NOT NULL DEFAULT '',
      created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT pm_integrations_tenant_tool_uniq UNIQUE (tenant_id, tool)
    )`,
  },

  // ── ResilienceOps — BIA extended fields ─────────────────────────────────
  { label: "ALTER bia_entries — customer_impact",
    ddl: `ALTER TABLE bia_entries ADD COLUMN IF NOT EXISTS customer_impact TEXT NOT NULL DEFAULT 'Medium'` },
  { label: "ALTER bia_entries — mbco",
    ddl: `ALTER TABLE bia_entries ADD COLUMN IF NOT EXISTS mbco TEXT NOT NULL DEFAULT ''` },
  { label: "ALTER bia_entries — supporting_apps",
    ddl: `ALTER TABLE bia_entries ADD COLUMN IF NOT EXISTS supporting_apps TEXT NOT NULL DEFAULT ''` },
  { label: "ALTER bia_entries — supporting_vendors",
    ddl: `ALTER TABLE bia_entries ADD COLUMN IF NOT EXISTS supporting_vendors TEXT NOT NULL DEFAULT ''` },
  { label: "ALTER bia_entries — key_people",
    ddl: `ALTER TABLE bia_entries ADD COLUMN IF NOT EXISTS key_people TEXT NOT NULL DEFAULT ''` },
  { label: "ALTER bia_entries — recovery_priority",
    ddl: `ALTER TABLE bia_entries ADD COLUMN IF NOT EXISTS recovery_priority TEXT NOT NULL DEFAULT 'Medium'` },
  { label: "ALTER bia_entries — recovery_strategy",
    ddl: `ALTER TABLE bia_entries ADD COLUMN IF NOT EXISTS recovery_strategy TEXT NOT NULL DEFAULT ''` },

  // ── ResilienceOps — Crisis Management ───────────────────────────────────
  { label: "CREATE crisis_events",
    ddl: `CREATE TABLE IF NOT EXISTS crisis_events (
      id            SERIAL PRIMARY KEY,
      tenant_id     INTEGER NOT NULL,
      event_id      TEXT NOT NULL DEFAULT '',
      title         TEXT NOT NULL DEFAULT '',
      crisis_type   TEXT NOT NULL DEFAULT '',
      severity      TEXT NOT NULL DEFAULT 'High',
      status        TEXT NOT NULL DEFAULT 'Active',
      trigger_desc  TEXT NOT NULL DEFAULT '',
      activated_at  TEXT NOT NULL DEFAULT '',
      resolved_at   TEXT NOT NULL DEFAULT '',
      lead          TEXT NOT NULL DEFAULT '',
      affected      TEXT NOT NULL DEFAULT '',
      decisions_log TEXT NOT NULL DEFAULT '',
      notes         TEXT NOT NULL DEFAULT '',
      created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT crisis_events_uniq UNIQUE (tenant_id, event_id)
    )` },

  { label: "CREATE crisis_contacts",
    ddl: `CREATE TABLE IF NOT EXISTS crisis_contacts (
      id             SERIAL PRIMARY KEY,
      tenant_id      INTEGER NOT NULL,
      name           TEXT NOT NULL DEFAULT '',
      role           TEXT NOT NULL DEFAULT '',
      department     TEXT NOT NULL DEFAULT '',
      phone          TEXT NOT NULL DEFAULT '',
      email          TEXT NOT NULL DEFAULT '',
      backup_contact TEXT NOT NULL DEFAULT '',
      priority       INTEGER NOT NULL DEFAULT 1,
      notes          TEXT NOT NULL DEFAULT '',
      created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMP NOT NULL DEFAULT NOW()
    )` },

  // ── ResilienceOps — Recovery Strategies ─────────────────────────────────
  { label: "CREATE recovery_strategies",
    ddl: `CREATE TABLE IF NOT EXISTS recovery_strategies (
      id                   SERIAL PRIMARY KEY,
      tenant_id            INTEGER NOT NULL,
      strategy_id          TEXT NOT NULL DEFAULT '',
      name                 TEXT NOT NULL DEFAULT '',
      strategy_type        TEXT NOT NULL DEFAULT '',
      description          TEXT NOT NULL DEFAULT '',
      applies_to           TEXT NOT NULL DEFAULT '',
      estimated_cost       TEXT NOT NULL DEFAULT '',
      implementation_time  TEXT NOT NULL DEFAULT '',
      status               TEXT NOT NULL DEFAULT 'Defined',
      owner                TEXT NOT NULL DEFAULT '',
      dependencies         TEXT NOT NULL DEFAULT '',
      last_reviewed        TEXT NOT NULL DEFAULT '',
      notes                TEXT NOT NULL DEFAULT '',
      created_at           TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at           TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT recovery_strategies_uniq UNIQUE (tenant_id, strategy_id)
    )` },

  // ── ResilienceOps — Third-Party / Vendor Continuity ─────────────────────
  { label: "CREATE vendor_continuity",
    ddl: `CREATE TABLE IF NOT EXISTS vendor_continuity (
      id              SERIAL PRIMARY KEY,
      tenant_id       INTEGER NOT NULL,
      assessment_id   TEXT NOT NULL DEFAULT '',
      vendor_name     TEXT NOT NULL DEFAULT '',
      service         TEXT NOT NULL DEFAULT '',
      criticality     TEXT NOT NULL DEFAULT 'High',
      has_bcp         BOOLEAN NOT NULL DEFAULT false,
      bcp_tested      BOOLEAN NOT NULL DEFAULT false,
      last_test_date  TEXT NOT NULL DEFAULT '',
      rto             TEXT NOT NULL DEFAULT '',
      rpo             TEXT NOT NULL DEFAULT '',
      sla_terms       TEXT NOT NULL DEFAULT '',
      last_assessment TEXT NOT NULL DEFAULT '',
      next_review     TEXT NOT NULL DEFAULT '',
      status          TEXT NOT NULL DEFAULT 'Not Assessed',
      findings        TEXT NOT NULL DEFAULT '',
      owner           TEXT NOT NULL DEFAULT '',
      notes           TEXT NOT NULL DEFAULT '',
      created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT vendor_continuity_uniq UNIQUE (tenant_id, assessment_id)
    )` },

  // ── Strategic Risk module tables ──────────────────────────────────────────
  { label: "CREATE strategic_objectives", ddl: `CREATE TABLE IF NOT EXISTS strategic_objectives (
      id            SERIAL PRIMARY KEY,
      tenant_id     INTEGER NOT NULL,
      obj_id        TEXT NOT NULL,
      title         TEXT NOT NULL,
      description   TEXT NOT NULL DEFAULT '',
      pillar        TEXT NOT NULL DEFAULT 'Growth',
      owner         TEXT NOT NULL DEFAULT '',
      status        TEXT NOT NULL DEFAULT 'active',
      kpi_linkage   TEXT NOT NULL DEFAULT '',
      kri_linkage   TEXT NOT NULL DEFAULT '',
      version       INTEGER NOT NULL DEFAULT 1,
      review_date   TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(tenant_id, obj_id)
  )` },
  { label: "ALTER strategic_objectives add kri_linkage", ddl: `ALTER TABLE strategic_objectives ADD COLUMN IF NOT EXISTS kri_linkage TEXT NOT NULL DEFAULT ''` },
  { label: "CREATE strategic_risks", ddl: `CREATE TABLE IF NOT EXISTS strategic_risks (
      id              SERIAL PRIMARY KEY,
      tenant_id       INTEGER NOT NULL,
      risk_id         TEXT NOT NULL,
      objective_id    TEXT,
      title           TEXT NOT NULL,
      description     TEXT NOT NULL DEFAULT '',
      risk_type       TEXT NOT NULL DEFAULT 'Macroeconomic',
      likelihood      INTEGER NOT NULL DEFAULT 3,
      impact          INTEGER NOT NULL DEFAULT 3,
      inherent_score  INTEGER GENERATED ALWAYS AS (likelihood * impact) STORED,
      control_factor  REAL NOT NULL DEFAULT 0.0,
      residual_score  REAL GENERATED ALWAYS AS (likelihood * impact * (1 - control_factor)) STORED,
      formula_locked  BOOLEAN NOT NULL DEFAULT TRUE,
      owner           TEXT NOT NULL DEFAULT '',
      status          TEXT NOT NULL DEFAULT 'open',
      appetite_status TEXT NOT NULL DEFAULT 'withinAppetite',
      qualitative_desc TEXT NOT NULL DEFAULT '',
      financial_impact REAL NOT NULL DEFAULT 0,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(tenant_id, risk_id)
  )` },
  { label: "ALTER strategic_risks add formula_locked", ddl: `ALTER TABLE strategic_risks ADD COLUMN IF NOT EXISTS formula_locked BOOLEAN NOT NULL DEFAULT TRUE` },
  { label: "CREATE strategic_kris", ddl: `CREATE TABLE IF NOT EXISTS strategic_kris (
      id            SERIAL PRIMARY KEY,
      tenant_id     INTEGER NOT NULL,
      kri_id        TEXT NOT NULL,
      name          TEXT NOT NULL,
      category      TEXT NOT NULL DEFAULT 'Macroeconomic',
      unit          TEXT NOT NULL DEFAULT '%',
      current_value REAL NOT NULL DEFAULT 0,
      warning_threshold REAL NOT NULL DEFAULT 0,
      breach_threshold  REAL NOT NULL DEFAULT 0,
      trend_direction   TEXT NOT NULL DEFAULT 'stable',
      status            TEXT NOT NULL DEFAULT 'ok',
      linked_risk_ids   TEXT NOT NULL DEFAULT '',
      readings          JSONB NOT NULL DEFAULT '[]',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(tenant_id, kri_id)
  )` },
  { label: "CREATE strategic_scenarios", ddl: `CREATE TABLE IF NOT EXISTS strategic_scenarios (
      id            SERIAL PRIMARY KEY,
      tenant_id     INTEGER NOT NULL,
      scenario_id   TEXT NOT NULL,
      name          TEXT NOT NULL,
      scenario_type TEXT NOT NULL DEFAULT 'Adverse',
      description   TEXT NOT NULL DEFAULT '',
      parameters    JSONB NOT NULL DEFAULT '[]',
      last_result   JSONB,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(tenant_id, scenario_id)
  )` },
  { label: "CREATE strategic_escalations", ddl: `CREATE TABLE IF NOT EXISTS strategic_escalations (
      id              SERIAL PRIMARY KEY,
      tenant_id       INTEGER NOT NULL,
      escalation_id   TEXT NOT NULL,
      risk_id         TEXT NOT NULL,
      risk_title      TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'open',
      triggered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at     TIMESTAMPTZ,
      resolution_note TEXT,
      escalation_chain TEXT NOT NULL DEFAULT '',
      evidence        TEXT NOT NULL DEFAULT '',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(tenant_id, escalation_id)
  )` },
  { label: "CREATE kri_breach_log", ddl: `CREATE TABLE IF NOT EXISTS kri_breach_log (
      id              SERIAL PRIMARY KEY,
      tenant_id       INTEGER NOT NULL,
      kri_id          TEXT NOT NULL,
      risk_id         TEXT NOT NULL,
      event_type      TEXT NOT NULL DEFAULT 'breach',
      old_cf          REAL,
      new_cf          REAL,
      old_residual    REAL,
      new_residual    REAL,
      old_status      TEXT,
      new_status      TEXT,
      fired_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )` },
  { label: "CREATE strategic_appetite_config", ddl: `CREATE TABLE IF NOT EXISTS strategic_appetite_config (
      id          SERIAL PRIMARY KEY,
      tenant_id   INTEGER NOT NULL,
      category    TEXT NOT NULL,
      appetite_statement TEXT NOT NULL DEFAULT '',
      appetite_threshold  REAL NOT NULL DEFAULT 6,
      tolerance_threshold REAL NOT NULL DEFAULT 9,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(tenant_id, category)
  )` },

  // ── sso_configurations ─────────────────────────────────────────────────────
  { label: "CREATE sso_configurations", ddl: `CREATE TABLE IF NOT EXISTS sso_configurations (
      id                           SERIAL PRIMARY KEY,
      tenant_id                    INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      provider_type                TEXT NOT NULL DEFAULT 'oidc',
      org_name                     TEXT,
      issuer_url                   TEXT,
      client_id                    TEXT,
      encrypted_client_secret      TEXT,
      saml_entry_point             TEXT,
      saml_cert                    TEXT,
      encrypted_saml_private_key   TEXT,
      ldap_host                    TEXT,
      ldap_port                    INTEGER,
      ldap_bind_dn                 TEXT,
      encrypted_ldap_bind_password TEXT,
      ldap_search_base             TEXT,
      ldap_search_filter           TEXT,
      ldap_use_tls                 BOOLEAN NOT NULL DEFAULT false,
      group_role_mappings          JSONB NOT NULL DEFAULT '{}',
      default_role                 TEXT NOT NULL DEFAULT 'compliance_analyst',
      enabled                      BOOLEAN NOT NULL DEFAULT false,
      local_login_enabled          BOOLEAN NOT NULL DEFAULT true,
      last_sync                    TIMESTAMPTZ,
      created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(tenant_id)
  )` },

  // ── sso_audit_log ──────────────────────────────────────────────────────────
  { label: "CREATE sso_audit_log", ddl: `CREATE TABLE IF NOT EXISTS sso_audit_log (
      id           SERIAL PRIMARY KEY,
      tenant_id    INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      event_type   TEXT NOT NULL,
      actor        TEXT NOT NULL DEFAULT '',
      target_email TEXT NOT NULL DEFAULT '',
      detail       JSONB NOT NULL DEFAULT '{}',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )` },

  // ── users updated_at column (needed for ldap sync updates) ─────────────────
  { label: "ADD users.updated_at", ddl: `ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()` },

  // ── sso_configurations: per-tenant LDAP sync cadence ─────────────────────
  { label: "ADD sso_configurations.sync_interval_hours", ddl: `ALTER TABLE sso_configurations ADD COLUMN IF NOT EXISTS sync_interval_hours INTEGER NOT NULL DEFAULT 6` },

  // ── smtp_settings (Task 285 — SMTP email delivery) ────────────────────────
  { label: "CREATE smtp_settings", ddl: `CREATE TABLE IF NOT EXISTS smtp_settings (
    id                SERIAL PRIMARY KEY,
    tenant_id         INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    host              TEXT NOT NULL DEFAULT '',
    port              INTEGER NOT NULL DEFAULT 587,
    secure            BOOLEAN NOT NULL DEFAULT false,
    from_address      TEXT NOT NULL DEFAULT '',
    username          TEXT,
    encrypted_password TEXT,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id)
  )` },

  // ── scheduled_reports (Task 285 — report scheduling) ─────────────────────
  { label: "CREATE scheduled_reports", ddl: `CREATE TABLE IF NOT EXISTS scheduled_reports (
    id               SERIAL PRIMARY KEY,
    tenant_id        INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    report_type      TEXT NOT NULL,
    template_id      TEXT,
    cron_expression  TEXT NOT NULL DEFAULT '0 8 * * 1',
    frequency_label  TEXT NOT NULL DEFAULT 'Weekly',
    recipient_emails JSONB NOT NULL DEFAULT '[]',
    format           TEXT NOT NULL DEFAULT 'CSV',
    filters          JSONB NOT NULL DEFAULT '{}',
    enabled          BOOLEAN NOT NULL DEFAULT true,
    last_run_at      TIMESTAMPTZ,
    next_run_at      TIMESTAMPTZ,
    last_status      TEXT,
    created_by       TEXT NOT NULL DEFAULT 'admin',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )` },

  // ── report_audit_log (Task 285 — FR-560 report access audit) ─────────────
  { label: "CREATE report_audit_log", ddl: `CREATE TABLE IF NOT EXISTS report_audit_log (
    id               SERIAL PRIMARY KEY,
    tenant_id        INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_email       TEXT NOT NULL,
    report_type      TEXT NOT NULL,
    format           TEXT NOT NULL DEFAULT 'CSV',
    filters          JSONB NOT NULL DEFAULT '{}',
    recipient_emails JSONB NOT NULL DEFAULT '[]',
    is_scheduled     BOOLEAN NOT NULL DEFAULT false,
    generated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )` },

  // ── incidents: notification_phase column (Task 285 — FR-465) ─────────────
  { label: "ADD incidents.notification_phase", ddl: `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS notification_phase TEXT` },
  { label: "ADD incidents.phases_sent", ddl: `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS phases_sent JSONB NOT NULL DEFAULT '[]'` },

  // ── PeopleOps: persistent training assignments ─────────────────────────
  { label: "CREATE training_assignments", ddl: `CREATE TABLE IF NOT EXISTS training_assignments (
    id           SERIAL PRIMARY KEY,
    tenant_id    INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    course       TEXT NOT NULL,
    assignee     TEXT NOT NULL,
    due_date     DATE,
    status       TEXT NOT NULL DEFAULT 'assigned',
    assigned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
  )` },

  // ── PeopleOps: persistent user invites ────────────────────────────────
  { label: "CREATE people_invites", ddl: `CREATE TABLE IF NOT EXISTS people_invites (
    id          SERIAL PRIMARY KEY,
    tenant_id   INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email       TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'analyst',
    invited_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status      TEXT NOT NULL DEFAULT 'pending',
    UNIQUE(tenant_id, email)
  )` },
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
