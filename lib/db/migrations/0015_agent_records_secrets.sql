-- Add hmac_secret and public_key to agent_records so agent credentials survive server restarts
ALTER TABLE "agent_records" ADD COLUMN IF NOT EXISTS "hmac_secret" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_records" ADD COLUMN IF NOT EXISTS "public_key" text;
