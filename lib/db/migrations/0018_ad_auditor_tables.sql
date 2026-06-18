-- AD Auditor: UEBA behaviour users
CREATE TABLE IF NOT EXISTS "ad_behaviour_users" (
  "id"               serial PRIMARY KEY,
  "tenant_id"        integer NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "username"         text NOT NULL,
  "display_name"     text NOT NULL DEFAULT '',
  "department"       text NOT NULL DEFAULT '',
  "risk_score"       integer NOT NULL DEFAULT 0,
  "risk_level"       text NOT NULL DEFAULT 'Low',
  "baseline_logins"  integer NOT NULL DEFAULT 0,
  "recent_logins"    integer NOT NULL DEFAULT 0,
  "anomaly_count"    integer NOT NULL DEFAULT 0,
  "last_anomaly"     text NOT NULL DEFAULT '',
  "anomaly_types"    jsonb NOT NULL DEFAULT '[]',
  "sparkline"        jsonb NOT NULL DEFAULT '[]',
  "peer_deviation"   integer NOT NULL DEFAULT 0,
  "created_at"       timestamp NOT NULL DEFAULT now(),
  "updated_at"       timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "ad_beh_user_tenant_username_uniq" UNIQUE ("tenant_id", "username")
);

-- AD Auditor: UEBA behaviour events
CREATE TABLE IF NOT EXISTS "ad_behaviour_events" (
  "id"          serial PRIMARY KEY,
  "tenant_id"   integer NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "username"    text NOT NULL,
  "event_type"  text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "severity"    text NOT NULL DEFAULT 'Medium',
  "occurred_at" text NOT NULL DEFAULT '',
  "src_ip"      text NOT NULL DEFAULT '',
  "location"    text NOT NULL DEFAULT '',
  "detail"      jsonb NOT NULL DEFAULT '{}',
  "created_at"  timestamp NOT NULL DEFAULT now()
);

-- AD Auditor: Real-time change feed
CREATE TABLE IF NOT EXISTS "ad_change_feed" (
  "id"          serial PRIMARY KEY,
  "tenant_id"   integer NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "change_id"   text NOT NULL,
  "object_type" text NOT NULL DEFAULT 'User',
  "object_name" text NOT NULL DEFAULT '',
  "object_dn"   text NOT NULL DEFAULT '',
  "change_type" text NOT NULL DEFAULT 'Modified',
  "field_name"  text NOT NULL DEFAULT '',
  "old_value"   text NOT NULL DEFAULT '',
  "new_value"   text NOT NULL DEFAULT '',
  "changed_by"  text NOT NULL DEFAULT '',
  "severity"    text NOT NULL DEFAULT 'Low',
  "risk_note"   text NOT NULL DEFAULT '',
  "occurred_at" text NOT NULL DEFAULT '',
  "created_at"  timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "ad_change_tenant_change_id_uniq" UNIQUE ("tenant_id", "change_id")
);

-- AD Auditor: Alert rules
CREATE TABLE IF NOT EXISTS "ad_alert_rules" (
  "id"          serial PRIMARY KEY,
  "tenant_id"   integer NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "rule_id"     text NOT NULL,
  "name"        text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "condition"   text NOT NULL DEFAULT '',
  "severity"    text NOT NULL DEFAULT 'High',
  "enabled"     boolean NOT NULL DEFAULT true,
  "channel"     text NOT NULL DEFAULT 'email',
  "created_at"  timestamp NOT NULL DEFAULT now(),
  "updated_at"  timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "ad_alert_rule_tenant_rule_id_uniq" UNIQUE ("tenant_id", "rule_id")
);
