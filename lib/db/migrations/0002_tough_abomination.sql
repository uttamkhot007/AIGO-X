CREATE TABLE "risk_score_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"risk_id" text NOT NULL,
	"risk_name" text NOT NULL,
	"prev_score" real NOT NULL,
	"new_score" real NOT NULL,
	"prev_severity" text NOT NULL,
	"new_severity" text NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"rationale" text,
	"scored_by" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "risks" ADD COLUMN "ai_score_source" text;--> statement-breakpoint
ALTER TABLE "risks" ADD COLUMN "ai_scored_at" timestamp;--> statement-breakpoint
ALTER TABLE "risk_score_history" ADD CONSTRAINT "risk_score_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;