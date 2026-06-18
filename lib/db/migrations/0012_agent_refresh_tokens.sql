-- Agent refresh tokens: persists agent session refresh tokens across server restarts
CREATE TABLE IF NOT EXISTS "agent_refresh_tokens" (
  "token"      text PRIMARY KEY NOT NULL,
  "agent_id"   text NOT NULL,
  "tenant_id"  integer NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_refresh_tokens_agent_id_idx" ON "agent_refresh_tokens" ("agent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_refresh_tokens_expires_at_idx" ON "agent_refresh_tokens" ("expires_at");
