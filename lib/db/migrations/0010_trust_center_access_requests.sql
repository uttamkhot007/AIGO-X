CREATE TABLE IF NOT EXISTS "trust_center_access_requests" (
  "id"         serial PRIMARY KEY,
  "tenant_id"  integer NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name"       text NOT NULL,
  "email"      text NOT NULL,
  "message"    text,
  "status"     text NOT NULL DEFAULT 'pending',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
