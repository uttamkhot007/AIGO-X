CREATE TABLE "evidence_artifacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"artifact_id" text NOT NULL,
	"control_id" integer NOT NULL,
	"control_ref" text NOT NULL,
	"source_integration" text NOT NULL,
	"status" text DEFAULT 'fresh' NOT NULL,
	"raw_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"collector_version" text DEFAULT '1.0' NOT NULL,
	"run_id" text,
	"collected_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	CONSTRAINT "evidence_artifacts_tenant_artifact_id_uniq" UNIQUE("tenant_id","artifact_id")
);
--> statement-breakpoint
CREATE TABLE "questionnaire_answers" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"questionnaire_id" text NOT NULL,
	"question_id" text NOT NULL,
	"answer" text DEFAULT '' NOT NULL,
	"confidence" real,
	"answer_source" text DEFAULT 'manual' NOT NULL,
	"status" text DEFAULT 'unanswered' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "questionnaire_answers_tenant_qqid_uniq" UNIQUE("tenant_id","questionnaire_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "questionnaire_questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"questionnaire_id" text NOT NULL,
	"question_id" text NOT NULL,
	"number" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'General' NOT NULL,
	"question" text NOT NULL,
	"source" text,
	"order_idx" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "questionnaire_questions_tenant_qqid_uniq" UNIQUE("tenant_id","questionnaire_id","question_id")
);
--> statement-breakpoint
ALTER TABLE "evidence_artifacts" ADD CONSTRAINT "evidence_artifacts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_artifacts" ADD CONSTRAINT "evidence_artifacts_control_id_compliance_controls_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."compliance_controls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_answers" ADD CONSTRAINT "questionnaire_answers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_questions" ADD CONSTRAINT "questionnaire_questions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;