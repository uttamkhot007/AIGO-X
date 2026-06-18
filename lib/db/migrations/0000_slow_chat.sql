CREATE TABLE "ad_connector_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"server_url" text,
	"entra_tenant_id" text,
	"domain" text,
	"sync_enabled" boolean DEFAULT false NOT NULL,
	"last_sync" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ad_connector_config_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "agent_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"agent_id" text NOT NULL,
	"hostname" text NOT NULL,
	"platform" text DEFAULT 'linux' NOT NULL,
	"version" text DEFAULT '2.4.1' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_seen" timestamp DEFAULT now() NOT NULL,
	"ip" text DEFAULT '' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"health" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"telemetry" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enrolled_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agent_records_tenant_agent_id_uniq" UNIQUE("tenant_id","agent_id")
);
--> statement-breakpoint
CREATE TABLE "ai_engine_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"api_key" text DEFAULT '' NOT NULL,
	"base_url" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_tested_at" timestamp,
	"last_test_ok" boolean,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_relationships" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"relation_id" text NOT NULL,
	"source_id" text NOT NULL,
	"target_id" text NOT NULL,
	"type" text NOT NULL,
	"label" text NOT NULL,
	"strength" real DEFAULT 1 NOT NULL,
	"discovered_by" text DEFAULT 'Manual' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attestation_depts" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"dept" text NOT NULL,
	"contact" text DEFAULT '' NOT NULL,
	"total_policies" integer DEFAULT 0 NOT NULL,
	"acknowledged" integer DEFAULT 0 NOT NULL,
	"overdue" integer DEFAULT 0 NOT NULL,
	"last_activity" text DEFAULT '' NOT NULL,
	"color" text DEFAULT '#1E3A5F' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "attestation_depts_tenant_dept_uniq" UNIQUE("tenant_id","dept")
);
--> statement-breakpoint
CREATE TABLE "audit_evidence_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"request_id" text NOT NULL,
	"audit_id" text NOT NULL,
	"control" text NOT NULL,
	"description" text NOT NULL,
	"requested_from" text NOT NULL,
	"due_date" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"type" text DEFAULT 'Document' NOT NULL,
	"title" text,
	"submitted_at" text,
	"rejection_reason" text,
	"collected_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "audit_evidence_requests_tenant_req_uniq" UNIQUE("tenant_id","request_id")
);
--> statement-breakpoint
CREATE TABLE "audit_evidence" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"evidence_id" text NOT NULL,
	"control" text NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'Document' NOT NULL,
	"uploaded" text,
	"by" text,
	"size" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_findings" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"finding_id" text NOT NULL,
	"audit_id" text NOT NULL,
	"title" text NOT NULL,
	"control" text NOT NULL,
	"severity" text DEFAULT 'Medium' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"owner" text DEFAULT '' NOT NULL,
	"due_date" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"recommendation" text,
	"category" text,
	"evidence_required" boolean DEFAULT false NOT NULL,
	"responses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "audit_findings_tenant_finding_id_uniq" UNIQUE("tenant_id","finding_id")
);
--> statement-breakpoint
CREATE TABLE "audit_programs" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"program_id" text NOT NULL,
	"name" text NOT NULL,
	"framework" text NOT NULL,
	"type" text DEFAULT 'Internal' NOT NULL,
	"auditor" text NOT NULL,
	"lead" text DEFAULT '' NOT NULL,
	"scheduled" text DEFAULT '' NOT NULL,
	"start_date" text DEFAULT '' NOT NULL,
	"end_date" text DEFAULT '' NOT NULL,
	"current_phase" text DEFAULT 'initiation' NOT NULL,
	"phase_progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"scope" text DEFAULT '' NOT NULL,
	"findings" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "audit_programs_tenant_program_id_uniq" UNIQUE("tenant_id","program_id")
);
--> statement-breakpoint
CREATE TABLE "cloud_findings" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"finding_id" text NOT NULL,
	"resource_id" text NOT NULL,
	"provider" text NOT NULL,
	"severity" text NOT NULL,
	"rule" text NOT NULL,
	"title" text NOT NULL,
	"remediation" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cloud_findings_tenant_finding_id_uniq" UNIQUE("tenant_id","finding_id")
);
--> statement-breakpoint
CREATE TABLE "cloud_resources" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"resource_id" text NOT NULL,
	"provider" text NOT NULL,
	"service" text NOT NULL,
	"region" text NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"risk" text DEFAULT 'Low' NOT NULL,
	"compliance_pct" real DEFAULT 100 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"resource_type" text NOT NULL,
	"tags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cloud_resources_tenant_resource_id_uniq" UNIQUE("tenant_id","resource_id")
);
--> statement-breakpoint
CREATE TABLE "compliance_gaps" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"framework" text NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"implemented" integer DEFAULT 0 NOT NULL,
	"partial" integer DEFAULT 0 NOT NULL,
	"not_started" integer DEFAULT 0 NOT NULL,
	"pct" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "compliance_gaps_tenant_framework_uniq" UNIQUE("tenant_id","framework")
);
--> statement-breakpoint
CREATE TABLE "compliance_maturity" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"domain" text NOT NULL,
	"score" integer DEFAULT 1 NOT NULL,
	"prev" integer DEFAULT 1 NOT NULL,
	"target" integer DEFAULT 5 NOT NULL,
	"controls" integer DEFAULT 0 NOT NULL,
	"implemented" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "compliance_maturity_tenant_domain_uniq" UNIQUE("tenant_id","domain")
);
--> statement-breakpoint
CREATE TABLE "consent_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"channel" text NOT NULL,
	"granted" integer DEFAULT 0 NOT NULL,
	"declined" integer DEFAULT 0 NOT NULL,
	"withdrawn" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "consent_records_tenant_channel_uniq" UNIQUE("tenant_id","channel")
);
--> statement-breakpoint
CREATE TABLE "compliance_controls" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"control_id" text NOT NULL,
	"framework" text NOT NULL,
	"domain" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'not-started' NOT NULL,
	"owner" text NOT NULL,
	"evidence" integer DEFAULT 0 NOT NULL,
	"due_date" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"title" text NOT NULL,
	"context" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_findings_dspm" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"finding_id" text NOT NULL,
	"store_id" text NOT NULL,
	"type" text NOT NULL,
	"severity" text DEFAULT 'Medium' NOT NULL,
	"field" text DEFAULT '' NOT NULL,
	"violated_policy" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "data_findings_dspm_tenant_finding_uniq" UNIQUE("tenant_id","finding_id")
);
--> statement-breakpoint
CREATE TABLE "data_stores" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"store_id" text NOT NULL,
	"name" text NOT NULL,
	"platform" text NOT NULL,
	"classification" text DEFAULT 'Internal' NOT NULL,
	"size_tb" real DEFAULT 0 NOT NULL,
	"record_count" integer DEFAULT 0 NOT NULL,
	"pii_fields" integer DEFAULT 0 NOT NULL,
	"retention_days" integer DEFAULT 365 NOT NULL,
	"encryption_status" text DEFAULT 'encrypted' NOT NULL,
	"access_control" text DEFAULT 'rbac' NOT NULL,
	"risk_score" text DEFAULT 'Low' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "data_stores_tenant_store_id_uniq" UNIQUE("tenant_id","store_id")
);
--> statement-breakpoint
CREATE TABLE "dpias" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"dpia_id" text NOT NULL,
	"name" text NOT NULL,
	"risk" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"owner" text NOT NULL,
	"updated" text NOT NULL,
	CONSTRAINT "dpias_tenant_dpia_id_uniq" UNIQUE("tenant_id","dpia_id")
);
--> statement-breakpoint
CREATE TABLE "dsars" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"dsar_id" text NOT NULL,
	"type" text NOT NULL,
	"subject" text NOT NULL,
	"received" text NOT NULL,
	"due" text NOT NULL,
	"status" text DEFAULT 'in-progress' NOT NULL,
	"days_left" integer,
	CONSTRAINT "dsars_tenant_dsar_id_uniq" UNIQUE("tenant_id","dsar_id")
);
--> statement-breakpoint
CREATE TABLE "evidence_engine_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"run_id" text NOT NULL,
	"duration" text DEFAULT '0s' NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"passed" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"warnings" integer DEFAULT 0 NOT NULL,
	"triggered_by" text DEFAULT 'Scheduled' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_engine_runs_tenant_run_id_uniq" UNIQUE("tenant_id","run_id")
);
--> statement-breakpoint
CREATE TABLE "security_findings" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"finding_id" text NOT NULL,
	"cloud" text NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"resource" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	CONSTRAINT "security_findings_tenant_finding_id_uniq" UNIQUE("tenant_id","finding_id")
);
--> statement-breakpoint
CREATE TABLE "firewall_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"rule_id" text NOT NULL,
	"zone_id" text NOT NULL,
	"name" text NOT NULL,
	"src" text NOT NULL,
	"dst" text NOT NULL,
	"port" text NOT NULL,
	"action" text DEFAULT 'allow' NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"last_hit" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "firewall_rules_tenant_rule_id_uniq" UNIQUE("tenant_id","rule_id")
);
--> statement-breakpoint
CREATE TABLE "governance_controls_library" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"control_id" text NOT NULL,
	"ref" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"type" text DEFAULT 'technical' NOT NULL,
	"frameworks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"policies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"effectiveness" integer DEFAULT 0 NOT NULL,
	"owner" text NOT NULL,
	"last_tested" text,
	"next_test" text,
	"description" text DEFAULT '' NOT NULL,
	"deficiencies" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gov_controls_lib_tenant_control_uniq" UNIQUE("tenant_id","control_id")
);
--> statement-breakpoint
CREATE TABLE "governance_procedures" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"procedure_id" text NOT NULL,
	"name" text NOT NULL,
	"process" text DEFAULT '' NOT NULL,
	"owner" text NOT NULL,
	"version" text DEFAULT '1.0' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"pages" integer DEFAULT 0 NOT NULL,
	"risk_score" integer DEFAULT 0 NOT NULL,
	"last_tested" text DEFAULT '—' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ai_insights" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"impact" text DEFAULT 'Medium' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "governance_procedures_tenant_proc_uniq" UNIQUE("tenant_id","procedure_id")
);
--> statement-breakpoint
CREATE TABLE "governance_processes" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"process_id" text NOT NULL,
	"name" text NOT NULL,
	"owner" text NOT NULL,
	"category" text NOT NULL,
	"steps" integer DEFAULT 0 NOT NULL,
	"linked" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"maturity" text DEFAULT 'Initial' NOT NULL,
	"risk_score" integer DEFAULT 0 NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"kpis" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ai_insights" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"impact" text DEFAULT 'Medium' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "governance_processes_tenant_process_uniq" UNIQUE("tenant_id","process_id")
);
--> statement-breakpoint
CREATE TABLE "grc_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"asset_id" text NOT NULL,
	"hostname" text NOT NULL,
	"category" text DEFAULT 'Unknown' NOT NULL,
	"confidence" text DEFAULT 'High' NOT NULL,
	"os" text DEFAULT '' NOT NULL,
	"ip" text DEFAULT '' NOT NULL,
	"mac" text,
	"manufacturer" text DEFAULT '' NOT NULL,
	"risk" text DEFAULT 'Medium' NOT NULL,
	"managed" boolean DEFAULT true NOT NULL,
	"dept" text DEFAULT '' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"antivirus" text DEFAULT '' NOT NULL,
	"agent_version" text DEFAULT '' NOT NULL,
	"last_seen" text NOT NULL,
	"exposure_score" real DEFAULT 0 NOT NULL,
	"vuln_count" integer DEFAULT 0 NOT NULL,
	"crit_vulns" integer DEFAULT 0 NOT NULL,
	"location" text,
	"serial_number" text,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"timeline" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "grc_assets_tenant_asset_id_uniq" UNIQUE("tenant_id","asset_id")
);
--> statement-breakpoint
CREATE TABLE "grc_policies" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"policy_id" text NOT NULL,
	"title" text NOT NULL,
	"type" text DEFAULT 'Security' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" text DEFAULT '1.0' NOT NULL,
	"owner" text NOT NULL,
	"dept" text DEFAULT '' NOT NULL,
	"effective_date" text NOT NULL,
	"review_date" text NOT NULL,
	"attached_controls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"risk_score" integer DEFAULT 0 NOT NULL,
	"content" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "grc_policies_tenant_policy_id_uniq" UNIQUE("tenant_id","policy_id")
);
--> statement-breakpoint
CREATE TABLE "integration_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"connection_id" text NOT NULL,
	"connector_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"assets_ingested" integer DEFAULT 0 NOT NULL,
	"events_ingested" integer DEFAULT 0 NOT NULL,
	"last_sync" timestamp,
	"error_count" integer DEFAULT 0 NOT NULL,
	"token_data" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "integration_connections_tenant_conn_uniq" UNIQUE("tenant_id","connection_id")
);
--> statement-breakpoint
CREATE TABLE "kb_articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"article_id" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"category" text NOT NULL,
	"tags" text,
	"views" integer DEFAULT 0 NOT NULL,
	"helpful" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "kb_articles_tenant_article_id_uniq" UNIQUE("tenant_id","article_id")
);
--> statement-breakpoint
CREATE TABLE "mcp_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "network_zones" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"zone_id" text NOT NULL,
	"name" text NOT NULL,
	"classification" text DEFAULT 'Internal' NOT NULL,
	"subnet" text NOT NULL,
	"inbound_policy" text DEFAULT 'allow' NOT NULL,
	"outbound_policy" text DEFAULT 'allow' NOT NULL,
	"device_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "network_zones_tenant_zone_id_uniq" UNIQUE("tenant_id","zone_id")
);
--> statement-breakpoint
CREATE TABLE "onboarding_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"current_stage" integer DEFAULT 1 NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"stages_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_sessions_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"employee_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"dept" text NOT NULL,
	"role" text NOT NULL,
	"manager" text,
	"location" text,
	"status" text DEFAULT 'active' NOT NULL,
	"risk_score" integer DEFAULT 0 NOT NULL,
	"mfa_enabled" boolean DEFAULT false NOT NULL,
	"last_login" text,
	"alerts" integer DEFAULT 0 NOT NULL,
	"join_date" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "people_tenant_employee_id_uniq" UNIQUE("tenant_id","employee_id")
);
--> statement-breakpoint
CREATE TABLE "policy_attestations" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"policy_id" text NOT NULL,
	"user_id" integer,
	"dept" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questionnaires" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"q_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"recipient" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"due_date" text DEFAULT '' NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "questionnaires_tenant_q_id_uniq" UNIQUE("tenant_id","q_id")
);
--> statement-breakpoint
CREATE TABLE "risk_appetite" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"domain" text NOT NULL,
	"appetite" text DEFAULT 'Medium' NOT NULL,
	"threshold" real DEFAULT 5 NOT NULL,
	"current" real DEFAULT 0 NOT NULL,
	"breached" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "risk_appetite_tenant_domain_uniq" UNIQUE("tenant_id","domain")
);
--> statement-breakpoint
CREATE TABLE "risk_cascades" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"parent_id" text NOT NULL,
	"child_id" text NOT NULL,
	"relationship" text DEFAULT 'triggers' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "risk_cascades_tenant_parent_child_uniq" UNIQUE("tenant_id","parent_id","child_id")
);
--> statement-breakpoint
CREATE TABLE "risk_treatments" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"treatment_id" text NOT NULL,
	"risk_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'Mitigate' NOT NULL,
	"owner" text NOT NULL,
	"due_date" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"priority" text DEFAULT 'Medium' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "risk_treatments_tenant_id_uniq" UNIQUE("tenant_id","treatment_id")
);
--> statement-breakpoint
CREATE TABLE "risk_vendors" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"vendor_id" text NOT NULL,
	"name" text NOT NULL,
	"tier" integer DEFAULT 3 NOT NULL,
	"category" text NOT NULL,
	"contact" text DEFAULT '' NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_assessed" text,
	"next_due" text NOT NULL,
	"critical" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "risk_vendors_tenant_id_uniq" UNIQUE("tenant_id","vendor_id")
);
--> statement-breakpoint
CREATE TABLE "risks" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"risk_id" text NOT NULL,
	"severity" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"score" real DEFAULT 0 NOT NULL,
	"owner" text NOT NULL,
	"owner_full" text NOT NULL,
	"trend" text DEFAULT 'flat' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "risks_tenant_risk_id_uniq" UNIQUE("tenant_id","risk_id")
);
--> statement-breakpoint
CREATE TABLE "ropa_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"ropa_id" text NOT NULL,
	"process" text NOT NULL,
	"controller" text NOT NULL,
	"purpose" text NOT NULL,
	"legal_basis" text NOT NULL,
	"categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"retention_days" integer DEFAULT 365 NOT NULL,
	"transfers_outside" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"risk_level" text DEFAULT 'Low' NOT NULL,
	"last_reviewed" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ropa_records_tenant_ropa_id_uniq" UNIQUE("tenant_id","ropa_id")
);
--> statement-breakpoint
CREATE TABLE "saas_apps" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"app_id" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"risk" text DEFAULT 'Low' NOT NULL,
	"users_connected" integer DEFAULT 0 NOT NULL,
	"scope_risk" text DEFAULT 'Low' NOT NULL,
	"data_access" text DEFAULT '' NOT NULL,
	"reviewed_at" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "saas_apps_tenant_app_id_uniq" UNIQUE("tenant_id","app_id")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"domain" text,
	"plan" text DEFAULT 'enterprise' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"seats" integer DEFAULT 50 NOT NULL,
	"license_expiry" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "ticket_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"ticket_id" text NOT NULL,
	"author" text NOT NULL,
	"content" text NOT NULL,
	"type" text DEFAULT 'comment' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"ticket_id" text NOT NULL,
	"priority" text NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"assignee" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"sla" text NOT NULL,
	"ai_severity" text,
	"ai_category" text,
	"ai_confidence" real,
	"resolution" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	CONSTRAINT "tickets_tenant_ticket_id_uniq" UNIQUE("tenant_id","ticket_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'analyst' NOT NULL,
	"mfa_enabled" boolean DEFAULT false NOT NULL,
	"mfa_secret" text,
	"last_login" timestamp,
	"avatar" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "webhooks_cfg" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"webhook_id" text NOT NULL,
	"direction" text DEFAULT 'outbound' NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"signing_secret" text DEFAULT '' NOT NULL,
	"event_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ad_connector_config" ADD CONSTRAINT "ad_connector_config_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_records" ADD CONSTRAINT "agent_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_engine_configs" ADD CONSTRAINT "ai_engine_configs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_relationships" ADD CONSTRAINT "asset_relationships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attestation_depts" ADD CONSTRAINT "attestation_depts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_evidence_requests" ADD CONSTRAINT "audit_evidence_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_evidence" ADD CONSTRAINT "audit_evidence_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_programs" ADD CONSTRAINT "audit_programs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_findings" ADD CONSTRAINT "cloud_findings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_resources" ADD CONSTRAINT "cloud_resources_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_gaps" ADD CONSTRAINT "compliance_gaps_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_maturity" ADD CONSTRAINT "compliance_maturity_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_controls" ADD CONSTRAINT "compliance_controls_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_findings_dspm" ADD CONSTRAINT "data_findings_dspm_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_stores" ADD CONSTRAINT "data_stores_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dpias" ADD CONSTRAINT "dpias_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dsars" ADD CONSTRAINT "dsars_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_engine_runs" ADD CONSTRAINT "evidence_engine_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_findings" ADD CONSTRAINT "security_findings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "firewall_rules" ADD CONSTRAINT "firewall_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_controls_library" ADD CONSTRAINT "governance_controls_library_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_procedures" ADD CONSTRAINT "governance_procedures_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_processes" ADD CONSTRAINT "governance_processes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grc_assets" ADD CONSTRAINT "grc_assets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grc_policies" ADD CONSTRAINT "grc_policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_articles" ADD CONSTRAINT "kb_articles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_tokens" ADD CONSTRAINT "mcp_tokens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_tokens" ADD CONSTRAINT "mcp_tokens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_zones" ADD CONSTRAINT "network_zones_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_sessions" ADD CONSTRAINT "onboarding_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_attestations" ADD CONSTRAINT "policy_attestations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_attestations" ADD CONSTRAINT "policy_attestations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaires" ADD CONSTRAINT "questionnaires_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_appetite" ADD CONSTRAINT "risk_appetite_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_cascades" ADD CONSTRAINT "risk_cascades_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_treatments" ADD CONSTRAINT "risk_treatments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_vendors" ADD CONSTRAINT "risk_vendors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risks" ADD CONSTRAINT "risks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ropa_records" ADD CONSTRAINT "ropa_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_apps" ADD CONSTRAINT "saas_apps_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks_cfg" ADD CONSTRAINT "webhooks_cfg_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;