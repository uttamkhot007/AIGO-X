-- SLA Records: per-tenant service-level agreement tracking
CREATE TABLE IF NOT EXISTS "sla_records" (
  "id"          serial PRIMARY KEY NOT NULL,
  "tenant_id"   integer NOT NULL,
  "sla_id"      text NOT NULL,
  "service"     text NOT NULL,
  "target"       real DEFAULT 99.9 NOT NULL,
  "current"      real DEFAULT 0 NOT NULL,
  "window"       text DEFAULT '30d' NOT NULL,
  "breached"    integer DEFAULT 0 NOT NULL,
  "p1_response" text DEFAULT '1h' NOT NULL,
  "p2_response" text DEFAULT '4h' NOT NULL,
  "status"      text DEFAULT 'met' NOT NULL,
  "created_at"  timestamp DEFAULT now() NOT NULL,
  "updated_at"  timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "sla_tenant_sla_id_uniq" UNIQUE ("tenant_id", "sla_id")
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sla_records"
    ADD CONSTRAINT "sla_records_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sla_records_tenant_idx" ON "sla_records" ("tenant_id");
