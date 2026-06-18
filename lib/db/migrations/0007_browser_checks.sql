-- Browser Check Definitions: per-control headless browser verification configs
CREATE TABLE IF NOT EXISTS "browser_checks" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" integer NOT NULL REFERENCES "tenants"("id"),
  "check_id" text NOT NULL,
  "control_id" integer NOT NULL REFERENCES "compliance_controls"("id"),
  "control_ref" text NOT NULL,
  "name" text NOT NULL,
  "url" text NOT NULL,
  "instruction" text NOT NULL,
  "template_id" text,
  "schedule_cron" text DEFAULT '0 8 * * *' NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "last_run_at" timestamp,
  "last_status" text,
  "last_error" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "browser_checks_tenant_check_id_uniq" UNIQUE ("tenant_id", "check_id")
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "browser_checks" ADD CONSTRAINT "browser_checks_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Browser Check Runs: execution history + screenshot references
CREATE TABLE IF NOT EXISTS "browser_check_runs" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" integer NOT NULL REFERENCES "tenants"("id"),
  "run_id" text NOT NULL,
  "check_id" text NOT NULL,
  "control_ref" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "screenshot_url" text,
  "verdict" text,
  "error_message" text,
  "duration_ms" integer,
  "triggered_by" text DEFAULT 'scheduled' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "browser_check_runs_tenant_run_id_uniq" UNIQUE ("tenant_id", "run_id")
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "browser_check_runs" ADD CONSTRAINT "browser_check_runs_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Add screenshot_url and verification_type columns to evidence_artifacts
ALTER TABLE "evidence_artifacts" ADD COLUMN IF NOT EXISTS "screenshot_url" text;
--> statement-breakpoint
ALTER TABLE "evidence_artifacts" ADD COLUMN IF NOT EXISTS "verification_type" text;
