CREATE TABLE IF NOT EXISTS "tenant_module_licenses" (
  "tenant_id"     integer PRIMARY KEY REFERENCES "tenants"("id") ON DELETE CASCADE,
  "plan"          text NOT NULL DEFAULT 'starter',
  "seats"         integer NOT NULL DEFAULT 10,
  "modules"       jsonb NOT NULL DEFAULT '{}',
  "framework_ids" jsonb NOT NULL DEFAULT '[]',
  "expires_at"    text,
  "updated_at"    timestamp NOT NULL DEFAULT now()
);
