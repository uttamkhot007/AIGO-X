CREATE TABLE "briefing_delivery_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"schedule_id" integer,
	"channel" text NOT NULL,
	"destination" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"period" text NOT NULL,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "briefing_schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"frequency" text DEFAULT 'weekly' NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"destination" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"period" text DEFAULT 'this quarter' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp NOT NULL,
	"last_run_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "briefing_delivery_history" ADD CONSTRAINT "briefing_delivery_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefing_delivery_history" ADD CONSTRAINT "briefing_delivery_history_schedule_id_briefing_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."briefing_schedules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefing_schedules" ADD CONSTRAINT "briefing_schedules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;