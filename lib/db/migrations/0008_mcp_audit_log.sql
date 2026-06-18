-- MCP Audit Log: per-tool-call audit trail for compliance traceability
-- Records every tool call made via the MCP server (POST /api/mcp tools/call)
-- including which token was used, how long it took, and whether it succeeded.

CREATE TABLE IF NOT EXISTS "mcp_audit_log" (
  "id"          serial PRIMARY KEY NOT NULL,
  "tenant_id"   integer NOT NULL,
  "token_id"    integer,
  "tool_name"   text NOT NULL,
  "called_at"   timestamp DEFAULT now() NOT NULL,
  "duration_ms" integer,
  "success"     boolean DEFAULT true NOT NULL,
  "error_msg"   text
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "mcp_audit_log"
    ADD CONSTRAINT "mcp_audit_log_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "mcp_audit_log"
    ADD CONSTRAINT "mcp_audit_log_token_id_mcp_tokens_id_fk"
    FOREIGN KEY ("token_id") REFERENCES "public"."mcp_tokens"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "mcp_audit_log_tenant_idx"    ON "mcp_audit_log" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_audit_log_called_at_idx" ON "mcp_audit_log" ("called_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_audit_log_token_id_idx"  ON "mcp_audit_log" ("token_id");
