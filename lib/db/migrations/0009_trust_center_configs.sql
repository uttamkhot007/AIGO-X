-- Trust Center Configs: per-tenant public trust page configuration
-- Adds custom_domain and custom_domain_status for custom domain support

CREATE TABLE IF NOT EXISTS "trust_center_configs" (
  "id"                   serial PRIMARY KEY NOT NULL,
  "tenant_id"            integer NOT NULL UNIQUE,
  "slug"                 text NOT NULL UNIQUE,
  "published"            boolean NOT NULL DEFAULT false,
  "display_name"         text NOT NULL DEFAULT '',
  "tagline"              text NOT NULL DEFAULT '',
  "accent_color"         text NOT NULL DEFAULT '#1E3A5F',
  "logo_url"             text,
  "custom_domain"        text,
  "custom_domain_status" text NOT NULL DEFAULT 'unverified',
  "visible_sections"     jsonb NOT NULL DEFAULT '{"grcScore":true,"frameworks":true,"controls":true,"evidence":true,"certifications":true,"aiQa":true}',
  "certifications"       jsonb NOT NULL DEFAULT '[]',
  "created_at"           timestamp NOT NULL DEFAULT now(),
  "updated_at"           timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "trust_center_configs"
    ADD CONSTRAINT "trust_center_configs_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- For existing deployments where the table already exists, ensure the new columns are present
ALTER TABLE "trust_center_configs"
  ADD COLUMN IF NOT EXISTS "custom_domain"        text,
  ADD COLUMN IF NOT EXISTS "custom_domain_status" text NOT NULL DEFAULT 'unverified';
