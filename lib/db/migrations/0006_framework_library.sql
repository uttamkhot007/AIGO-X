-- Framework Library: master catalog of compliance frameworks
CREATE TABLE IF NOT EXISTS framework_library (
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
);

-- Framework Library Controls: master control definitions per framework
CREATE TABLE IF NOT EXISTS framework_library_controls (
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
);

-- Tenant Framework Activations: tracks which frameworks are assigned to each tenant
CREATE TABLE IF NOT EXISTS tenant_frameworks (
  id          SERIAL PRIMARY KEY,
  tenant_id   INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  framework_id INTEGER NOT NULL REFERENCES framework_library(id),
  assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
  assigned_by TEXT NOT NULL DEFAULT 'system',
  status      TEXT NOT NULL DEFAULT 'active',
  UNIQUE(tenant_id, framework_id)
);
