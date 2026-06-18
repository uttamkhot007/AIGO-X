-- Evidence Alert Settings: per-tenant notification preferences
CREATE TABLE IF NOT EXISTS "evidence_alert_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"alert_on_failed" boolean DEFAULT true NOT NULL,
	"alert_on_stale" boolean DEFAULT false NOT NULL,
	"min_failed_count" integer DEFAULT 1 NOT NULL,
	"slack_webhook_url" text,
	"email_recipients" jsonb DEFAULT '[]' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_alert_settings_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence_alert_settings" ADD CONSTRAINT "evidence_alert_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- Evidence Alert History: delivery log per alert sent
CREATE TABLE IF NOT EXISTS "evidence_alert_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"run_id" text NOT NULL,
	"channel" text NOT NULL,
	"destination" text NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"stale_count" integer DEFAULT 0 NOT NULL,
	"failed_controls" jsonb DEFAULT '[]' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence_alert_history" ADD CONSTRAINT "evidence_alert_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
