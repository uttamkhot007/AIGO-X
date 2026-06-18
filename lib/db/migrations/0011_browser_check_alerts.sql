-- Browser Check Alert Settings: per-tenant notification preferences for browser check failures
CREATE TABLE IF NOT EXISTS "browser_check_alert_settings" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" integer NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "slack_webhook_url" text,
  "email_recipients" jsonb DEFAULT '[]' NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "browser_check_alert_settings_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "browser_check_alert_settings" ADD CONSTRAINT "browser_check_alert_settings_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Browser Check Alert History: per-delivery audit trail
CREATE TABLE IF NOT EXISTS "browser_check_alert_history" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" integer NOT NULL,
  "run_id" text NOT NULL,
  "check_id" text NOT NULL,
  "check_name" text NOT NULL,
  "url" text NOT NULL,
  "verdict" text NOT NULL,
  "control_ref" text NOT NULL,
  "screenshot_url" text,
  "channel" text NOT NULL,
  "destination" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "error" text,
  "sent_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "browser_check_alert_history" ADD CONSTRAINT "browser_check_alert_history_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Per-check alert destination overrides (optional: if set, used instead of global)
ALTER TABLE "browser_checks" ADD COLUMN IF NOT EXISTS "alert_slack_webhook_url" text;
--> statement-breakpoint
ALTER TABLE "browser_checks" ADD COLUMN IF NOT EXISTS "alert_email_recipients" jsonb;
