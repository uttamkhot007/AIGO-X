import { pgTable, serial, text, integer, real, boolean, timestamp, jsonb, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── Tenants ───────────────────────────────────────────────────────────────────

export const tenantsTable = pgTable("tenants", {
  id:             serial("id").primaryKey(),
  name:           text("name").notNull(),
  slug:           text("slug").notNull().unique(),
  domain:         text("domain"),
  plan:           text("plan").notNull().default("enterprise"),
  status:         text("status").notNull().default("active"),
  seats:          integer("seats").notNull().default(50),
  licenseExpiry:  text("license_expiry"),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
});

export const insertTenantSchema = createInsertSchema(tenantsTable).omit({ id: true, createdAt: true });
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type Tenant = typeof tenantsTable.$inferSelect;

// ── Users ─────────────────────────────────────────────────────────────────────

export const usersTable = pgTable("users", {
  id:           serial("id").primaryKey(),
  tenantId:     integer("tenant_id").notNull().references(() => tenantsTable.id),
  email:        text("email").notNull().unique(),
  name:         text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role:         text("role").notNull().default("analyst"),
  mfaEnabled:   boolean("mfa_enabled").notNull().default(false),
  mfaSecret:    text("mfa_secret"),
  lastLogin:    timestamp("last_login"),
  avatar:       text("avatar"),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, passwordHash: true }).extend({
  password: z.string().min(8),
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

// ── Risks ─────────────────────────────────────────────────────────────────────

export const risksTable = pgTable("risks", {
  id:             serial("id").primaryKey(),
  tenantId:       integer("tenant_id").notNull().references(() => tenantsTable.id),
  riskId:         text("risk_id").notNull(),
  severity:       text("severity").notNull(),
  name:           text("name").notNull(),
  category:       text("category").notNull(),
  description:    text("description"),
  score:          real("score").notNull().default(0),
  owner:          text("owner").notNull(),
  ownerFull:      text("owner_full").notNull(),
  trend:          text("trend").notNull().default("flat"),
  status:         text("status").notNull().default("open"),
  aiScoreSource:  text("ai_score_source"),
  aiScoredAt:     timestamp("ai_scored_at"),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
  updatedAt:      timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  unique("risks_tenant_risk_id_uniq").on(table.tenantId, table.riskId),
]);

export const insertRiskSchema = createInsertSchema(risksTable).omit({ id: true, tenantId: true, riskId: true, createdAt: true, updatedAt: true });
export type InsertRisk = z.infer<typeof insertRiskSchema>;
export type Risk = typeof risksTable.$inferSelect;

// ── Risk Score History (AI audit trail) ──────────────────────────────────────

export const riskScoreHistoryTable = pgTable("risk_score_history", {
  id:          serial("id").primaryKey(),
  tenantId:    integer("tenant_id").notNull().references(() => tenantsTable.id),
  riskId:      text("risk_id").notNull(),
  riskName:    text("risk_name").notNull(),
  prevScore:   real("prev_score").notNull(),
  newScore:    real("new_score").notNull(),
  prevSeverity: text("prev_severity").notNull(),
  newSeverity:  text("new_severity").notNull(),
  source:      text("source").notNull().default("manual"),
  rationale:   text("rationale"),
  scoredBy:    text("scored_by").notNull().default("system"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
});

export type RiskScoreHistory = typeof riskScoreHistoryTable.$inferSelect;

// ── Compliance Controls ────────────────────────────────────────────────────────

export const controlsTable = pgTable("compliance_controls", {
  id:        serial("id").primaryKey(),
  tenantId:  integer("tenant_id").notNull().references(() => tenantsTable.id),
  controlId: text("control_id").notNull(),
  framework: text("framework").notNull(),
  domain:    text("domain").notNull(),
  name:      text("name").notNull(),
  status:    text("status").notNull().default("not-started"),
  owner:     text("owner").notNull(),
  evidence:  integer("evidence").notNull().default(0),
  dueDate:   text("due_date").notNull(),
}, (table) => ({
  tenantControlUniq: unique("compliance_controls_tenant_control_uniq").on(table.tenantId, table.controlId),
}));

export const insertControlSchema = createInsertSchema(controlsTable).omit({ id: true, tenantId: true });
export type InsertControl = z.infer<typeof insertControlSchema>;
export type Control = typeof controlsTable.$inferSelect;

// ── Tickets ───────────────────────────────────────────────────────────────────

export const ticketsTable = pgTable("tickets", {
  id:         serial("id").primaryKey(),
  tenantId:   integer("tenant_id").notNull().references(() => tenantsTable.id),
  ticketId:   text("ticket_id").notNull(),
  priority:   text("priority").notNull(),
  title:      text("title").notNull(),
  category:   text("category").notNull(),
  assignee:   text("assignee").notNull(),
  status:     text("status").notNull().default("open"),
  sla:        text("sla").notNull(),
  aiSeverity: text("ai_severity"),
  aiCategory: text("ai_category"),
  aiConfidence: real("ai_confidence"),
  resolution: text("resolution"),
  createdAt:  timestamp("created_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
}, (table) => [
  unique("tickets_tenant_ticket_id_uniq").on(table.tenantId, table.ticketId),
]);

export const insertTicketSchema = createInsertSchema(ticketsTable).omit({ id: true, tenantId: true, ticketId: true, createdAt: true, resolvedAt: true });
export type InsertTicket = z.infer<typeof insertTicketSchema>;
export type Ticket = typeof ticketsTable.$inferSelect;

// ── DSARs ─────────────────────────────────────────────────────────────────────

export const dsarsTable = pgTable("dsars", {
  id:       serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id),
  dsarId:   text("dsar_id").notNull(),
  type:     text("type").notNull(),
  subject:  text("subject").notNull(),
  received: text("received").notNull(),
  due:      text("due").notNull(),
  status:   text("status").notNull().default("in-progress"),
  daysLeft: integer("days_left"),
}, (table) => [
  unique("dsars_tenant_dsar_id_uniq").on(table.tenantId, table.dsarId),
]);

export const insertDsarSchema = createInsertSchema(dsarsTable).omit({ id: true, tenantId: true, dsarId: true });
export type InsertDsar = z.infer<typeof insertDsarSchema>;
export type Dsar = typeof dsarsTable.$inferSelect;

// ── DPIAs ─────────────────────────────────────────────────────────────────────

export const dpiasTable = pgTable("dpias", {
  id:       serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id),
  dpiaId:   text("dpia_id").notNull(),
  name:     text("name").notNull(),
  risk:     text("risk").notNull(),
  status:   text("status").notNull().default("draft"),
  owner:    text("owner").notNull(),
  updated:  text("updated").notNull(),
}, (table) => [
  unique("dpias_tenant_dpia_id_uniq").on(table.tenantId, table.dpiaId),
]);

export const insertDpiaSchema = createInsertSchema(dpiasTable).omit({ id: true, tenantId: true, dpiaId: true });
export type InsertDpia = z.infer<typeof insertDpiaSchema>;
export type Dpia = typeof dpiasTable.$inferSelect;

// ── Security Findings ─────────────────────────────────────────────────────────

export const findingsTable = pgTable("security_findings", {
  id:        serial("id").primaryKey(),
  tenantId:  integer("tenant_id").notNull().references(() => tenantsTable.id),
  findingId: text("finding_id").notNull(),
  cloud:     text("cloud").notNull(),
  severity:  text("severity").notNull(),
  title:     text("title").notNull(),
  resource:  text("resource").notNull(),
  status:    text("status").notNull().default("open"),
}, (table) => [
  unique("security_findings_tenant_finding_id_uniq").on(table.tenantId, table.findingId),
]);

export const insertFindingSchema = createInsertSchema(findingsTable).omit({ id: true, tenantId: true, findingId: true });
export type InsertFinding = z.infer<typeof insertFindingSchema>;
export type Finding = typeof findingsTable.$inferSelect;

// ── AI Conversations ──────────────────────────────────────────────────────────

export const conversations = pgTable("conversations", {
  id:        serial("id").primaryKey(),
  tenantId:  integer("tenant_id").notNull().references(() => tenantsTable.id),
  title:     text("title").notNull(),
  context:   text("context"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertConversationSchema = createInsertSchema(conversations).omit({ id: true, createdAt: true });
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;

// ── AI Messages ───────────────────────────────────────────────────────────────

export const messages = pgTable("messages", {
  id:             serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role:           text("role").notNull(),
  content:        text("content").notNull(),
  createdAt:      timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

// ── KB Articles ───────────────────────────────────────────────────────────────

export const kbArticlesTable = pgTable("kb_articles", {
  id:        serial("id").primaryKey(),
  tenantId:  integer("tenant_id").notNull().references(() => tenantsTable.id),
  articleId: text("article_id").notNull(),
  title:     text("title").notNull(),
  content:   text("content").notNull(),
  category:  text("category").notNull(),
  tags:      text("tags"),
  module:    text("module"),
  framework: text("framework"),
  views:     integer("views").notNull().default(0),
  helpful:   integer("helpful").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  unique("kb_articles_tenant_article_id_uniq").on(table.tenantId, table.articleId),
]);

export const insertKbArticleSchema = createInsertSchema(kbArticlesTable).omit({ id: true, tenantId: true, articleId: true, createdAt: true, updatedAt: true });
export type KbArticle = typeof kbArticlesTable.$inferSelect;
export type InsertKbArticle = z.infer<typeof insertKbArticleSchema>;

// ── AD Connector Config ───────────────────────────────────────────────────────

export const adConnectorTable = pgTable("ad_connector_config", {
  id:          serial("id").primaryKey(),
  tenantId:    integer("tenant_id").notNull().references(() => tenantsTable.id).unique(),
  serverUrl:   text("server_url"),
  entraTenantId: text("entra_tenant_id"),
  domain:      text("domain"),
  syncEnabled: boolean("sync_enabled").notNull().default(false),
  lastSync:    timestamp("last_sync"),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
});

export const insertAdConnectorSchema = createInsertSchema(adConnectorTable).omit({ id: true, updatedAt: true } as any);
export type AdConnector = typeof adConnectorTable.$inferSelect;
export type InsertAdConnector = z.infer<typeof insertAdConnectorSchema>;

// ── Onboarding Sessions ───────────────────────────────────────────────────────

export const onboardingSessionsTable = pgTable("onboarding_sessions", {
  id:           serial("id").primaryKey(),
  tenantId:     integer("tenant_id").notNull().references(() => tenantsTable.id).unique(),
  currentStage: integer("current_stage").notNull().default(1),
  completed:    boolean("completed").notNull().default(false),
  stagesData:   jsonb("stages_data").notNull().default({}),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
  updatedAt:    timestamp("updated_at").notNull().defaultNow(),
});

export type OnboardingSession = typeof onboardingSessionsTable.$inferSelect;
export type OnboardingStagesData = Record<string, Record<string, unknown>>;

// ── GRC Assets (CAASM) ────────────────────────────────────────────────────────

export const grcAssetsTable = pgTable("grc_assets", {
  id:            serial("id").primaryKey(),
  tenantId:      integer("tenant_id").notNull().references(() => tenantsTable.id),
  assetId:       text("asset_id").notNull(),
  hostname:      text("hostname").notNull(),
  category:      text("category").notNull().default("Unknown"),
  confidence:    text("confidence").notNull().default("High"),
  os:            text("os").notNull().default(""),
  ip:            text("ip").notNull().default(""),
  mac:           text("mac"),
  manufacturer:  text("manufacturer").notNull().default(""),
  risk:          text("risk").notNull().default("Medium"),
  managed:       boolean("managed").notNull().default(true),
  dept:          text("dept").notNull().default(""),
  tags:          jsonb("tags").notNull().default([]),
  antivirus:     text("antivirus").notNull().default(""),
  agentVersion:  text("agent_version").notNull().default(""),
  lastSeen:      text("last_seen").notNull(),
  exposureScore: real("exposure_score").notNull().default(0),
  vulnCount:     integer("vuln_count").notNull().default(0),
  critVulns:     integer("crit_vulns").notNull().default(0),
  location:      text("location"),
  serialNumber:  text("serial_number"),
  sources:       jsonb("sources").notNull().default([]),
  timeline:      jsonb("timeline").notNull().default([]),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
  updatedAt:     timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  unique("grc_assets_tenant_asset_id_uniq").on(table.tenantId, table.assetId),
]);
export type GrcAsset = typeof grcAssetsTable.$inferSelect;

export const assetRelationshipsTable = pgTable("asset_relationships", {
  id:           serial("id").primaryKey(),
  tenantId:     integer("tenant_id").notNull().references(() => tenantsTable.id),
  relationId:   text("relation_id").notNull(),
  sourceId:     text("source_id").notNull(),
  targetId:     text("target_id").notNull(),
  type:         text("type").notNull(),
  label:        text("label").notNull(),
  strength:     real("strength").notNull().default(1),
  discoveredBy: text("discovered_by").notNull().default("Manual"),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
});
export type AssetRelationship = typeof assetRelationshipsTable.$inferSelect;

// ── Cloud Resources (CSPM) ────────────────────────────────────────────────────

export const cloudResourcesTable = pgTable("cloud_resources", {
  id:             serial("id").primaryKey(),
  tenantId:       integer("tenant_id").notNull().references(() => tenantsTable.id),
  resourceId:     text("resource_id").notNull(),
  provider:       text("provider").notNull(),
  service:        text("service").notNull(),
  region:         text("region").notNull(),
  accountId:      text("account_id").notNull(),
  name:           text("name").notNull(),
  risk:           text("risk").notNull().default("Low"),
  compliancePct:  real("compliance_pct").notNull().default(100),
  status:         text("status").notNull().default("active"),
  resourceType:   text("resource_type").notNull(),
  tags:           jsonb("tags").notNull().default({}),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
  updatedAt:      timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  unique("cloud_resources_tenant_resource_id_uniq").on(table.tenantId, table.resourceId),
]);
export type CloudResource = typeof cloudResourcesTable.$inferSelect;

export const cloudFindingsTable = pgTable("cloud_findings", {
  id:          serial("id").primaryKey(),
  tenantId:    integer("tenant_id").notNull().references(() => tenantsTable.id),
  findingId:   text("finding_id").notNull(),
  resourceId:  text("resource_id").notNull(),
  provider:    text("provider").notNull(),
  severity:    text("severity").notNull(),
  rule:        text("rule").notNull(),
  title:       text("title").notNull(),
  remediation: text("remediation").notNull().default(""),
  status:      text("status").notNull().default("open"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  unique("cloud_findings_tenant_finding_id_uniq").on(table.tenantId, table.findingId),
]);
export type CloudFinding = typeof cloudFindingsTable.$inferSelect;

// ── SaaS Apps (SSPM) ──────────────────────────────────────────────────────────

export const saasAppsTable = pgTable("saas_apps", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("tenant_id").notNull().references(() => tenantsTable.id),
  appId:           text("app_id").notNull(),
  name:            text("name").notNull(),
  category:        text("category").notNull(),
  risk:            text("risk").notNull().default("Low"),
  usersConnected:  integer("users_connected").notNull().default(0),
  scopeRisk:       text("scope_risk").notNull().default("Low"),
  dataAccess:      text("data_access").notNull().default(""),
  reviewedAt:      text("reviewed_at"),
  status:          text("status").notNull().default("active"),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  unique("saas_apps_tenant_app_id_uniq").on(table.tenantId, table.appId),
]);
export type SaasApp = typeof saasAppsTable.$inferSelect;

// ── GRC Policies (Governance) ─────────────────────────────────────────────────

export const grcPoliciesTable = pgTable("grc_policies", {
  id:               serial("id").primaryKey(),
  tenantId:         integer("tenant_id").notNull().references(() => tenantsTable.id),
  policyId:         text("policy_id").notNull(),
  title:            text("title").notNull(),
  type:             text("type").notNull().default("Security"),
  status:           text("status").notNull().default("draft"),
  version:          text("version").notNull().default("1.0"),
  owner:            text("owner").notNull(),
  dept:             text("dept").notNull().default(""),
  effectiveDate:    text("effective_date").notNull(),
  reviewDate:       text("review_date").notNull(),
  attachedControls: jsonb("attached_controls").notNull().default([]),
  riskScore:        integer("risk_score").notNull().default(0),
  content:          text("content"),
  tags:             jsonb("tags").notNull().default([]),
  createdAt:        timestamp("created_at").notNull().defaultNow(),
  updatedAt:        timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  unique("grc_policies_tenant_policy_id_uniq").on(table.tenantId, table.policyId),
]);
export type GrcPolicy = typeof grcPoliciesTable.$inferSelect;

export const policyAttestationsTable = pgTable("policy_attestations", {
  id:          serial("id").primaryKey(),
  tenantId:    integer("tenant_id").notNull().references(() => tenantsTable.id),
  policyId:    text("policy_id").notNull(),
  userId:      integer("user_id").references(() => usersTable.id),
  dept:        text("dept").notNull(),
  status:      text("status").notNull().default("pending"),
  completedAt: timestamp("completed_at"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
});
export type PolicyAttestation = typeof policyAttestationsTable.$inferSelect;

// ── Risk Appetite & Cascades ──────────────────────────────────────────────────

export const riskAppetiteTable = pgTable("risk_appetite", {
  id:        serial("id").primaryKey(),
  tenantId:  integer("tenant_id").notNull().references(() => tenantsTable.id),
  domain:    text("domain").notNull(),
  appetite:  text("appetite").notNull().default("Medium"),
  threshold: real("threshold").notNull().default(5),
  current:   real("current").notNull().default(0),
  breached:  boolean("breached").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  unique("risk_appetite_tenant_domain_uniq").on(table.tenantId, table.domain),
]);
export type RiskAppetite = typeof riskAppetiteTable.$inferSelect;

export const riskCascadesTable = pgTable("risk_cascades", {
  id:           serial("id").primaryKey(),
  tenantId:     integer("tenant_id").notNull().references(() => tenantsTable.id),
  parentId:     text("parent_id").notNull(),
  childId:      text("child_id").notNull(),
  relationship: text("relationship").notNull().default("triggers"),
  description:  text("description").notNull().default(""),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  unique("risk_cascades_tenant_parent_child_uniq").on(table.tenantId, table.parentId, table.childId),
]);
export type RiskCascade = typeof riskCascadesTable.$inferSelect;

export const riskTreatmentsTable = pgTable("risk_treatments", {
  id:          serial("id").primaryKey(),
  tenantId:    integer("tenant_id").notNull().references(() => tenantsTable.id),
  treatmentId: text("treatment_id").notNull(),
  riskId:      text("risk_id").notNull(),
  name:        text("name").notNull(),
  type:        text("type").notNull().default("Mitigate"),
  owner:       text("owner").notNull(),
  dueDate:     text("due_date").notNull(),
  status:      text("status").notNull().default("open"),
  priority:    text("priority").notNull().default("Medium"),
  notes:       text("notes"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  unique("risk_treatments_tenant_id_uniq").on(table.tenantId, table.treatmentId),
]);
export type RiskTreatment = typeof riskTreatmentsTable.$inferSelect;

export const riskVendorsTable = pgTable("risk_vendors", {
  id:           serial("id").primaryKey(),
  tenantId:     integer("tenant_id").notNull().references(() => tenantsTable.id),
  vendorId:     text("vendor_id").notNull(),
  name:         text("name").notNull(),
  tier:         integer("tier").notNull().default(3),
  category:     text("category").notNull(),
  contact:      text("contact").notNull().default(""),
  score:        integer("score").notNull().default(0),
  status:       text("status").notNull().default("pending"),
  lastAssessed: text("last_assessed"),
  nextDue:      text("next_due").notNull(),
  critical:     boolean("critical").notNull().default(false),
  notes:        text("notes"),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
  updatedAt:    timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  unique("risk_vendors_tenant_id_uniq").on(table.tenantId, table.vendorId),
]);
export type RiskVendor = typeof riskVendorsTable.$inferSelect;

// ── Compliance Maturity & Gaps ─────────────────────────────────────────────────

export const complianceMaturityHistoryTable = pgTable("compliance_maturity_history", {
  id:        serial("id").primaryKey(),
  tenantId:  integer("tenant_id").notNull().references(() => tenantsTable.id),
  domain:    text("domain").notNull(),
  score:     integer("score").notNull(),
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
});
export type ComplianceMaturityHistory = typeof complianceMaturityHistoryTable.$inferSelect;

export const complianceMaturityTable = pgTable("compliance_maturity", {
  id:          serial("id").primaryKey(),
  tenantId:    integer("tenant_id").notNull().references(() => tenantsTable.id),
  domain:      text("domain").notNull(),
  score:       integer("score").notNull().default(1),
  prev:        integer("prev").notNull().default(1),
  target:      integer("target").notNull().default(5),
  controls:    integer("controls").notNull().default(0),
  implemented: integer("implemented").notNull().default(0),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  unique("compliance_maturity_tenant_domain_uniq").on(table.tenantId, table.domain),
]);
export type ComplianceMaturity = typeof complianceMaturityTable.$inferSelect;

export const complianceGapsTable = pgTable("compliance_gaps", {
  id:          serial("id").primaryKey(),
  tenantId:    integer("tenant_id").notNull().references(() => tenantsTable.id),
  framework:   text("framework").notNull(),
  total:       integer("total").notNull().default(0),
  implemented: integer("implemented").notNull().default(0),
  partial:     integer("partial").notNull().default(0),
  notStarted:  integer("not_started").notNull().default(0),
  pct:         integer("pct").notNull().default(0),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  unique("compliance_gaps_tenant_framework_uniq").on(table.tenantId, table.framework),
]);
export type ComplianceGap = typeof complianceGapsTable.$inferSelect;

// ── Audit Programs & Evidence ──────────────────────────────────────────────────

export const auditProgramsTable = pgTable("audit_programs", {
  id:            serial("id").primaryKey(),
  tenantId:      integer("tenant_id").notNull().references(() => tenantsTable.id),
  programId:     text("program_id").notNull(),
  name:          text("name").notNull(),
  framework:     text("framework").notNull(),
  type:          text("type").notNull().default("Internal"),
  auditor:       text("auditor").notNull(),
  lead:          text("lead").notNull().default(""),
  scheduled:     text("scheduled").notNull().default(""),
  startDate:     text("start_date").notNull().default(""),
  endDate:       text("end_date").notNull().default(""),
  currentPhase:  text("current_phase").notNull().default("initiation"),
  phaseProgress: jsonb("phase_progress").notNull().default({}),
  status:        text("status").notNull().default("planned"),
  scope:         text("scope").notNull().default(""),
  findings:      integer("findings").notNull().default(0),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
  updatedAt:     timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  unique("audit_programs_tenant_program_id_uniq").on(table.tenantId, table.programId),
]);
export type AuditProgram = typeof auditProgramsTable.$inferSelect;

export const auditEvidenceTable = pgTable("audit_evidence", {
  id:        serial("id").primaryKey(),
  tenantId:  integer("tenant_id").notNull().references(() => tenantsTable.id),
  evidenceId: text("evidence_id").notNull(),
  control:   text("control").notNull(),
  name:      text("name").notNull(),
  type:      text("type").notNull().default("Document"),
  uploaded:  text("uploaded"),
  by:        text("by"),
  size:      text("size"),
  status:    text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  tenantEvidenceUniq: unique("audit_evidence_tenant_evidence_uniq").on(table.tenantId, table.evidenceId),
}));
export type AuditEvidence = typeof auditEvidenceTable.$inferSelect;

// ── Network Security ──────────────────────────────────────────────────────────

export const networkZonesTable = pgTable("network_zones", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("tenant_id").notNull().references(() => tenantsTable.id),
  zoneId:          text("zone_id").notNull(),
  name:            text("name").notNull(),
  classification:  text("classification").notNull().default("Internal"),
  subnet:          text("subnet").notNull(),
  inboundPolicy:   text("inbound_policy").notNull().default("allow"),
  outboundPolicy:  text("outbound_policy").notNull().default("allow"),
  deviceCount:     integer("device_count").notNull().default(0),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  unique("network_zones_tenant_zone_id_uniq").on(table.tenantId, table.zoneId),
]);
export type NetworkZone = typeof networkZonesTable.$inferSelect;

export const firewallRulesTable = pgTable("firewall_rules", {
  id:        serial("id").primaryKey(),
  tenantId:  integer("tenant_id").notNull().references(() => tenantsTable.id),
  ruleId:    text("rule_id").notNull(),
  zoneId:    text("zone_id").notNull(),
  name:      text("name").notNull(),
  src:       text("src").notNull(),
  dst:       text("dst").notNull(),
  port:      text("port").notNull(),
  action:    text("action").notNull().default("allow"),
  hits:      integer("hits").notNull().default(0),
  lastHit:   text("last_hit"),
  enabled:   boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  unique("firewall_rules_tenant_rule_id_uniq").on(table.tenantId, table.ruleId),
]);
export type FirewallRule = typeof firewallRulesTable.$inferSelect;

// ── Privacy / RoPA ─────────────────────────────────────────────────────────────

export const ropaRecordsTable = pgTable("ropa_records", {
  id:               serial("id").primaryKey(),
  tenantId:         integer("tenant_id").notNull().references(() => tenantsTable.id),
  ropaId:           text("ropa_id").notNull(),
  process:          text("process").notNull(),
  controller:       text("controller").notNull(),
  purpose:          text("purpose").notNull(),
  legalBasis:       text("legal_basis").notNull(),
  categories:       jsonb("categories").notNull().default([]),
  recipients:       jsonb("recipients").notNull().default([]),
  retentionDays:    integer("retention_days").notNull().default(365),
  transfersOutside: boolean("transfers_outside").notNull().default(false),
  status:           text("status").notNull().default("active"),
  riskLevel:        text("risk_level").notNull().default("Low"),
  lastReviewed:     text("last_reviewed"),
  createdAt:        timestamp("created_at").notNull().defaultNow(),
  updatedAt:        timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  unique("ropa_records_tenant_ropa_id_uniq").on(table.tenantId, table.ropaId),
]);
export type RopaRecord = typeof ropaRecordsTable.$inferSelect;

export const consentRecordsTable = pgTable("consent_records", {
  id:        serial("id").primaryKey(),
  tenantId:  integer("tenant_id").notNull().references(() => tenantsTable.id),
  channel:   text("channel").notNull(),
  granted:   integer("granted").notNull().default(0),
  declined:  integer("declined").notNull().default(0),
  withdrawn: integer("withdrawn").notNull().default(0),
  total:     integer("total").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  unique("consent_records_tenant_channel_uniq").on(table.tenantId, table.channel),
]);
export type ConsentRecord = typeof consentRecordsTable.$inferSelect;

// ── Data Stores (DSPM) ────────────────────────────────────────────────────────

export const dataStoresTable = pgTable("data_stores", {
  id:               serial("id").primaryKey(),
  tenantId:         integer("tenant_id").notNull().references(() => tenantsTable.id),
  storeId:          text("store_id").notNull(),
  name:             text("name").notNull(),
  platform:         text("platform").notNull(),
  classification:   text("classification").notNull().default("Internal"),
  sizeTb:           real("size_tb").notNull().default(0),
  recordCount:      integer("record_count").notNull().default(0),
  piiFields:        integer("pii_fields").notNull().default(0),
  retentionDays:    integer("retention_days").notNull().default(365),
  encryptionStatus: text("encryption_status").notNull().default("encrypted"),
  accessControl:    text("access_control").notNull().default("rbac"),
  riskScore:        text("risk_score").notNull().default("Low"),
  createdAt:        timestamp("created_at").notNull().defaultNow(),
  updatedAt:        timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  unique("data_stores_tenant_store_id_uniq").on(table.tenantId, table.storeId),
]);
export type DataStore = typeof dataStoresTable.$inferSelect;

export const dataFindingsDspmTable = pgTable("data_findings_dspm", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("tenant_id").notNull().references(() => tenantsTable.id),
  findingId:       text("finding_id").notNull(),
  storeId:         text("store_id").notNull(),
  type:            text("type").notNull(),
  severity:        text("severity").notNull().default("Medium"),
  field:           text("field").notNull().default(""),
  violatedPolicy:  text("violated_policy").notNull().default(""),
  status:          text("status").notNull().default("open"),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  unique("data_findings_dspm_tenant_finding_uniq").on(table.tenantId, table.findingId),
]);
export type DataFindingDspm = typeof dataFindingsDspmTable.$inferSelect;

// ── Agent Records ─────────────────────────────────────────────────────────────

export const agentRecordsTable = pgTable("agent_records", {
  id:         serial("id").primaryKey(),
  tenantId:   integer("tenant_id").notNull().references(() => tenantsTable.id),
  agentId:    text("agent_id").notNull(),
  hostname:   text("hostname").notNull(),
  platform:   text("platform").notNull().default("linux"),
  version:    text("version").notNull().default("2.4.1"),
  status:     text("status").notNull().default("active"),
  lastSeen:   timestamp("last_seen").notNull().defaultNow(),
  ip:         text("ip").notNull().default(""),
  tags:       jsonb("tags").notNull().default([]),
  health:     jsonb("health").notNull().default({}),
  policy:     jsonb("policy").notNull().default({}),
  telemetry:  jsonb("telemetry").notNull().default({}),
  hmacSecret: text("hmac_secret").notNull().default(""),
  publicKey:  text("public_key"),
  enrolledAt: timestamp("enrolled_at").notNull().defaultNow(),
  updatedAt:  timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  unique("agent_records_tenant_agent_id_uniq").on(table.tenantId, table.agentId),
]);
export type AgentDbRecord = typeof agentRecordsTable.$inferSelect;

// ── Integration Connections ───────────────────────────────────────────────────

export const integrationConnectionsTable = pgTable("integration_connections", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("tenant_id").notNull().references(() => tenantsTable.id),
  connectionId:    text("connection_id").notNull(),
  connectorId:     text("connector_id").notNull(),
  name:            text("name").notNull(),
  status:          text("status").notNull().default("active"),
  assetsIngested:  integer("assets_ingested").notNull().default(0),
  eventsIngested:  integer("events_ingested").notNull().default(0),
  lastSync:        timestamp("last_sync"),
  errorCount:      integer("error_count").notNull().default(0),
  tokenData:       text("token_data"),
  config:          jsonb("config").notNull().default({}),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  unique("integration_connections_tenant_conn_uniq").on(table.tenantId, table.connectionId),
]);
export type IntegrationConnection = typeof integrationConnectionsTable.$inferSelect;

export const webhooksCfgTable = pgTable("webhooks_cfg", {
  id:            serial("id").primaryKey(),
  tenantId:      integer("tenant_id").notNull().references(() => tenantsTable.id),
  webhookId:     text("webhook_id").notNull(),
  direction:     text("direction").notNull().default("outbound"),
  name:          text("name").notNull(),
  url:           text("url").notNull(),
  signingSecret: text("signing_secret").notNull().default(""),
  eventTypes:    jsonb("event_types").notNull().default([]),
  active:        boolean("active").notNull().default(true),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
  updatedAt:     timestamp("updated_at").notNull().defaultNow(),
});
export type WebhookCfg = typeof webhooksCfgTable.$inferSelect;

// ── People / HR Data ──────────────────────────────────────────────────────────

export const peopleTable = pgTable("people", {
  id:          serial("id").primaryKey(),
  tenantId:    integer("tenant_id").notNull().references(() => tenantsTable.id),
  employeeId:  text("employee_id").notNull(),
  name:        text("name").notNull(),
  email:       text("email").notNull(),
  dept:        text("dept").notNull(),
  role:        text("role").notNull(),
  manager:     text("manager"),
  location:    text("location"),
  status:      text("status").notNull().default("active"),
  riskScore:   integer("risk_score").notNull().default(0),
  mfaEnabled:  boolean("mfa_enabled").notNull().default(false),
  lastLogin:   text("last_login"),
  alerts:      integer("alerts").notNull().default(0),
  joinDate:    text("join_date").notNull(),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  unique("people_tenant_employee_id_uniq").on(table.tenantId, table.employeeId),
]);
export type Person = typeof peopleTable.$inferSelect;

// ── AI Engine Configs ─────────────────────────────────────────────────────────

export const aiEngineConfigsTable = pgTable("ai_engine_configs", {
  id:           serial("id").primaryKey(),
  tenantId:     integer("tenant_id").notNull().references(() => tenantsTable.id),
  name:         text("name").notNull(),
  provider:     text("provider").notNull(),
  model:        text("model").notNull().default(""),
  apiKey:       text("api_key").notNull().default(""),
  baseUrl:      text("base_url"),
  isDefault:    boolean("is_default").notNull().default(false),
  isActive:     boolean("is_active").notNull().default(true),
  config:       jsonb("config").notNull().default({}),
  lastTestedAt: timestamp("last_tested_at"),
  lastTestOk:   boolean("last_test_ok"),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
  updatedAt:    timestamp("updated_at").notNull().defaultNow(),
});
export type AiEngineConfig = typeof aiEngineConfigsTable.$inferSelect;

// ── MCP Tokens ────────────────────────────────────────────────────────────────

export const mcpTokensTable = pgTable("mcp_tokens", {
  id:          serial("id").primaryKey(),
  tenantId:    integer("tenant_id").notNull().references(() => tenantsTable.id),
  name:        text("name").notNull(),
  tokenHash:   text("token_hash").notNull().unique(),
  tokenPrefix: text("token_prefix").notNull(),
  scopes:      jsonb("scopes").notNull().default([]),
  lastUsedAt:  timestamp("last_used_at"),
  expiresAt:   timestamp("expires_at"),
  isActive:    boolean("is_active").notNull().default(true),
  createdBy:   integer("created_by").references(() => usersTable.id),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
});
export type McpToken = typeof mcpTokensTable.$inferSelect;

// ── Service Desk Enhancements ─────────────────────────────────────────────────
// (tickets already in ticketsTable — these are comments/attachments)

export const ticketCommentsTable = pgTable("ticket_comments", {
  id:        serial("id").primaryKey(),
  tenantId:  integer("tenant_id").notNull().references(() => tenantsTable.id),
  ticketId:  text("ticket_id").notNull(),
  author:    text("author").notNull(),
  content:   text("content").notNull(),
  type:      text("type").notNull().default("comment"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type TicketComment = typeof ticketCommentsTable.$inferSelect;

// ── Audit Findings ────────────────────────────────────────────────────────────

export const auditFindingsTable = pgTable("audit_findings", {
  id:               serial("id").primaryKey(),
  tenantId:         integer("tenant_id").notNull().references(() => tenantsTable.id),
  findingId:        text("finding_id").notNull(),
  auditId:          text("audit_id").notNull(),
  title:            text("title").notNull(),
  control:          text("control").notNull(),
  severity:         text("severity").notNull().default("Medium"),
  status:           text("status").notNull().default("open"),
  owner:            text("owner").notNull().default(""),
  dueDate:          text("due_date").notNull().default(""),
  description:      text("description").notNull().default(""),
  recommendation:   text("recommendation"),
  category:         text("category"),
  evidenceRequired: boolean("evidence_required").notNull().default(false),
  responses:        jsonb("responses").notNull().default([]),
  createdAt:        timestamp("created_at").notNull().defaultNow(),
  updatedAt:        timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  unique("audit_findings_tenant_finding_id_uniq").on(table.tenantId, table.findingId),
]);
export type AuditFinding = typeof auditFindingsTable.$inferSelect;

// ── Audit Evidence Requests ───────────────────────────────────────────────────

export const auditEvidenceRequestsTable = pgTable("audit_evidence_requests", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("tenant_id").notNull().references(() => tenantsTable.id),
  requestId:       text("request_id").notNull(),
  auditId:         text("audit_id").notNull(),
  control:         text("control").notNull(),
  description:     text("description").notNull(),
  requestedFrom:   text("requested_from").notNull(),
  dueDate:         text("due_date").notNull().default(""),
  status:          text("status").notNull().default("pending"),
  type:            text("type").notNull().default("Document"),
  title:           text("title"),
  submittedAt:     text("submitted_at"),
  rejectionReason: text("rejection_reason"),
  collectedBy:     text("collected_by"),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  unique("audit_evidence_requests_tenant_req_uniq").on(table.tenantId, table.requestId),
]);
export type AuditEvidenceRequest = typeof auditEvidenceRequestsTable.$inferSelect;

// ── Evidence Artifacts (per-control automated evidence) ───────────────────────

export const evidenceArtifactsTable = pgTable("evidence_artifacts", {
  id:               serial("id").primaryKey(),
  tenantId:         integer("tenant_id").notNull().references(() => tenantsTable.id),
  artifactId:       text("artifact_id").notNull(),
  controlId:        integer("control_id").notNull().references(() => controlsTable.id),
  controlRef:       text("control_ref").notNull(),
  sourceIntegration: text("source_integration").notNull(),
  status:           text("status").notNull().default("fresh"),
  rawPayload:       jsonb("raw_payload").notNull().default({}),
  summary:          text("summary").notNull().default(""),
  collectorVersion: text("collector_version").notNull().default("1.0"),
  runId:            text("run_id"),
  collectedAt:      timestamp("collected_at").notNull().defaultNow(),
  expiresAt:        timestamp("expires_at"),
  screenshotUrl:    text("screenshot_url"),
  verificationType: text("verification_type"),
}, (table) => [
  unique("evidence_artifacts_tenant_artifact_id_uniq").on(table.tenantId, table.artifactId),
]);
export type EvidenceArtifact = typeof evidenceArtifactsTable.$inferSelect;

// ── Evidence Engine Runs ──────────────────────────────────────────────────────

export const evidenceEngineRunsTable = pgTable("evidence_engine_runs", {
  id:          serial("id").primaryKey(),
  tenantId:    integer("tenant_id").notNull().references(() => tenantsTable.id),
  runId:       text("run_id").notNull(),
  duration:    text("duration").notNull().default("0s"),
  total:       integer("total").notNull().default(0),
  passed:      integer("passed").notNull().default(0),
  failed:      integer("failed").notNull().default(0),
  warnings:    integer("warnings").notNull().default(0),
  triggeredBy: text("triggered_by").notNull().default("Scheduled"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  unique("evidence_engine_runs_tenant_run_id_uniq").on(table.tenantId, table.runId),
]);
export type EvidenceEngineRun = typeof evidenceEngineRunsTable.$inferSelect;

// ── Questionnaires ────────────────────────────────────────────────────────────

export const questionnairesTable = pgTable("questionnaires", {
  id:        serial("id").primaryKey(),
  tenantId:  integer("tenant_id").notNull().references(() => tenantsTable.id),
  qId:       text("q_id").notNull(),
  name:      text("name").notNull(),
  type:      text("type").notNull(),
  recipient: text("recipient").notNull().default(""),
  status:    text("status").notNull().default("draft"), // draft | in_review | completed
  dueDate:   text("due_date").notNull().default(""),
  questions: jsonb("questions").notNull().default([]),  // kept for backward compat; normalized tables are canonical
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  unique("questionnaires_tenant_q_id_uniq").on(table.tenantId, table.qId),
]);
export type QuestionnaireRow = typeof questionnairesTable.$inferSelect;

// ── Questionnaire Questions (normalized) ──────────────────────────────────────

export const questionnaireQuestionsTable = pgTable("questionnaire_questions", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("tenant_id").notNull().references(() => tenantsTable.id),
  questionnaireId: text("questionnaire_id").notNull(),  // qId of parent questionnaire
  questionId:      text("question_id").notNull(),       // unique within (tenant, questionnaire)
  number:          text("number").notNull().default(""),
  category:        text("category").notNull().default("General"),
  question:        text("question").notNull(),
  source:          text("source"),
  orderIdx:        integer("order_idx").notNull().default(0),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  // Scoped to (tenant + questionnaire + question) — same template ID can appear in multiple questionnaires
  unique("questionnaire_questions_tenant_qqid_uniq").on(table.tenantId, table.questionnaireId, table.questionId),
]);
export type QuestionnaireQuestion = typeof questionnaireQuestionsTable.$inferSelect;

// ── Questionnaire Answers (normalized) ────────────────────────────────────────

export const questionnaireAnswersTable = pgTable("questionnaire_answers", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("tenant_id").notNull().references(() => tenantsTable.id),
  questionnaireId: text("questionnaire_id").notNull(),  // denormalized for efficient querying + isolation
  questionId:      text("question_id").notNull(),
  answer:          text("answer").notNull().default(""),
  confidence:      real("confidence"),                   // AI confidence 0.0–1.0; null for manual answers
  answerSource:    text("answer_source").notNull().default("manual"), // 'manual' | 'ai-draft'
  status:          text("status").notNull().default("unanswered"),    // 'unanswered' | 'ai-draft' | 'reviewed'
  reviewedBy:      text("reviewed_by"),
  reviewedAt:      timestamp("reviewed_at"),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  // Scoped to (tenant + questionnaire + question) — prevents cross-tenant and cross-questionnaire collisions
  unique("questionnaire_answers_tenant_qqid_uniq").on(table.tenantId, table.questionnaireId, table.questionId),
]);
export type QuestionnaireAnswer = typeof questionnaireAnswersTable.$inferSelect;

// ── Governance Processes ──────────────────────────────────────────────────────

export const governanceProcessesTable = pgTable("governance_processes", {
  id:          serial("id").primaryKey(),
  tenantId:    integer("tenant_id").notNull().references(() => tenantsTable.id),
  processId:   text("process_id").notNull(),
  name:        text("name").notNull(),
  owner:       text("owner").notNull(),
  category:    text("category").notNull(),
  steps:       integer("steps").notNull().default(0),
  linked:      text("linked").notNull().default(""),
  status:      text("status").notNull().default("active"),
  maturity:    text("maturity").notNull().default("Initial"),
  riskScore:   integer("risk_score").notNull().default(0),
  description: text("description").notNull().default(""),
  kpis:        jsonb("kpis").notNull().default([]),
  aiInsights:  jsonb("ai_insights").notNull().default([]),
  impact:      text("impact").notNull().default("Medium"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  unique("governance_processes_tenant_process_uniq").on(table.tenantId, table.processId),
]);
export type GovernanceProcess = typeof governanceProcessesTable.$inferSelect;

// ── Governance Procedures ─────────────────────────────────────────────────────

export const governanceProceduresTable = pgTable("governance_procedures", {
  id:          serial("id").primaryKey(),
  tenantId:    integer("tenant_id").notNull().references(() => tenantsTable.id),
  procedureId: text("procedure_id").notNull(),
  name:        text("name").notNull(),
  process:     text("process").notNull().default(""),
  owner:       text("owner").notNull(),
  version:     text("version").notNull().default("1.0"),
  status:      text("status").notNull().default("active"),
  pages:       integer("pages").notNull().default(0),
  riskScore:   integer("risk_score").notNull().default(0),
  lastTested:  text("last_tested").notNull().default("—"),
  description: text("description").notNull().default(""),
  steps:       jsonb("steps").notNull().default([]),
  aiInsights:  jsonb("ai_insights").notNull().default([]),
  impact:      text("impact").notNull().default("Medium"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  unique("governance_procedures_tenant_proc_uniq").on(table.tenantId, table.procedureId),
]);
export type GovernanceProcedure = typeof governanceProceduresTable.$inferSelect;

// ── Governance Controls Library ───────────────────────────────────────────────

export const governanceControlsLibraryTable = pgTable("governance_controls_library", {
  id:            serial("id").primaryKey(),
  tenantId:      integer("tenant_id").notNull().references(() => tenantsTable.id),
  controlId:     text("control_id").notNull(),
  ref:           text("ref").notNull(),
  name:          text("name").notNull(),
  category:      text("category").notNull(),
  type:          text("type").notNull().default("technical"),
  frameworks:    jsonb("frameworks").notNull().default([]),
  policies:      jsonb("policies").notNull().default([]),
  status:        text("status").notNull().default("planned"),
  effectiveness: integer("effectiveness").notNull().default(0),
  owner:         text("owner").notNull(),
  lastTested:    text("last_tested"),
  nextTest:      text("next_test"),
  description:   text("description").notNull().default(""),
  deficiencies:  text("deficiencies"),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
  updatedAt:     timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  unique("gov_controls_lib_tenant_control_uniq").on(table.tenantId, table.controlId),
]);
export type GovernanceControlsLibrary = typeof governanceControlsLibraryTable.$inferSelect;

// ── AI Briefing Schedules ─────────────────────────────────────────────────────

export const briefingSchedulesTable = pgTable("briefing_schedules", {
  id:          serial("id").primaryKey(),
  tenantId:    integer("tenant_id").notNull().references(() => tenantsTable.id),
  frequency:   text("frequency").notNull().default("weekly"),
  channel:     text("channel").notNull().default("email"),
  destination: text("destination").notNull(),
  label:       text("label").notNull().default(""),
  period:      text("period").notNull().default("this quarter"),
  active:      boolean("active").notNull().default(true),
  nextRunAt:   timestamp("next_run_at").notNull(),
  lastRunAt:   timestamp("last_run_at"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
});
export type BriefingSchedule = typeof briefingSchedulesTable.$inferSelect;

// ── AI Briefing Delivery History ──────────────────────────────────────────────

export const briefingDeliveryHistoryTable = pgTable("briefing_delivery_history", {
  id:          serial("id").primaryKey(),
  tenantId:    integer("tenant_id").notNull().references(() => tenantsTable.id),
  scheduleId:  integer("schedule_id").references(() => briefingSchedulesTable.id, { onDelete: "set null" }),
  channel:     text("channel").notNull(),
  destination: text("destination").notNull(),
  status:      text("status").notNull().default("pending"),
  error:       text("error"),
  period:      text("period").notNull(),
  sentAt:      timestamp("sent_at"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
});
export type BriefingDeliveryHistory = typeof briefingDeliveryHistoryTable.$inferSelect;

// ── Browser Check Definitions ─────────────────────────────────────────────────

export const browserChecksTable = pgTable("browser_checks", {
  id:            serial("id").primaryKey(),
  tenantId:      integer("tenant_id").notNull().references(() => tenantsTable.id),
  checkId:       text("check_id").notNull(),
  controlId:     integer("control_id").notNull().references(() => controlsTable.id),
  controlRef:    text("control_ref").notNull(),
  name:          text("name").notNull(),
  url:           text("url").notNull(),
  instruction:   text("instruction").notNull(),
  templateId:    text("template_id"),
  scheduleCron:  text("schedule_cron").notNull().default("0 8 * * *"),
  enabled:       boolean("enabled").notNull().default(true),
  lastRunAt:            timestamp("last_run_at"),
  lastStatus:           text("last_status"),
  lastError:            text("last_error"),
  alertSlackWebhookUrl: text("alert_slack_webhook_url"),
  alertEmailRecipients: jsonb("alert_email_recipients"),
  createdAt:            timestamp("created_at").notNull().defaultNow(),
  updatedAt:            timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  unique("browser_checks_tenant_check_id_uniq").on(table.tenantId, table.checkId),
]);
export type BrowserCheck = typeof browserChecksTable.$inferSelect;

// ── Browser Check Runs ────────────────────────────────────────────────────────

export const browserCheckRunsTable = pgTable("browser_check_runs", {
  id:            serial("id").primaryKey(),
  tenantId:      integer("tenant_id").notNull().references(() => tenantsTable.id),
  runId:         text("run_id").notNull(),
  checkId:       text("check_id").notNull(),
  controlRef:    text("control_ref").notNull(),
  status:        text("status").notNull().default("pending"),
  screenshotUrl: text("screenshot_url"),
  verdict:       text("verdict"),
  errorMessage:  text("error_message"),
  durationMs:    integer("duration_ms"),
  triggeredBy:   text("triggered_by").notNull().default("scheduled"),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  unique("browser_check_runs_tenant_run_id_uniq").on(table.tenantId, table.runId),
]);
export type BrowserCheckRun = typeof browserCheckRunsTable.$inferSelect;

// ── Browser Check Alert Settings ──────────────────────────────────────────────

export const browserCheckAlertSettingsTable = pgTable("browser_check_alert_settings", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("tenant_id").notNull().references(() => tenantsTable.id).unique(),
  enabled:         boolean("enabled").notNull().default(false),
  slackWebhookUrl: text("slack_webhook_url"),
  emailRecipients: jsonb("email_recipients").notNull().default([]),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
});
export type BrowserCheckAlertSettings = typeof browserCheckAlertSettingsTable.$inferSelect;

// ── Browser Check Alert History ───────────────────────────────────────────────

export const browserCheckAlertHistoryTable = pgTable("browser_check_alert_history", {
  id:            serial("id").primaryKey(),
  tenantId:      integer("tenant_id").notNull().references(() => tenantsTable.id),
  runId:         text("run_id").notNull(),
  checkId:       text("check_id").notNull(),
  checkName:     text("check_name").notNull(),
  url:           text("url").notNull(),
  verdict:       text("verdict").notNull(),
  controlRef:    text("control_ref").notNull(),
  screenshotUrl: text("screenshot_url"),
  channel:       text("channel").notNull(),
  destination:   text("destination").notNull(),
  status:        text("status").notNull().default("pending"),
  error:         text("error"),
  sentAt:        timestamp("sent_at"),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
});
export type BrowserCheckAlertHistory = typeof browserCheckAlertHistoryTable.$inferSelect;

// ── Evidence Alert Settings ───────────────────────────────────────────────────

export const evidenceAlertSettingsTable = pgTable("evidence_alert_settings", {
  id:               serial("id").primaryKey(),
  tenantId:         integer("tenant_id").notNull().references(() => tenantsTable.id).unique(),
  enabled:          boolean("enabled").notNull().default(false),
  alertOnFailed:    boolean("alert_on_failed").notNull().default(true),
  alertOnStale:     boolean("alert_on_stale").notNull().default(false),
  minFailedCount:   integer("min_failed_count").notNull().default(1),
  slackWebhookUrl:  text("slack_webhook_url"),
  emailRecipients:  jsonb("email_recipients").notNull().default([]),
  updatedAt:        timestamp("updated_at").notNull().defaultNow(),
});
export type EvidenceAlertSettings = typeof evidenceAlertSettingsTable.$inferSelect;

// ── Evidence Alert History ────────────────────────────────────────────────────

export const evidenceAlertHistoryTable = pgTable("evidence_alert_history", {
  id:             serial("id").primaryKey(),
  tenantId:       integer("tenant_id").notNull().references(() => tenantsTable.id),
  runId:          text("run_id").notNull(),
  channel:        text("channel").notNull(),
  destination:    text("destination").notNull(),
  failedCount:    integer("failed_count").notNull().default(0),
  staleCount:     integer("stale_count").notNull().default(0),
  failedControls: jsonb("failed_controls").notNull().default([]),
  status:         text("status").notNull().default("pending"),
  error:          text("error"),
  sentAt:         timestamp("sent_at"),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
});
export type EvidenceAlertHistory = typeof evidenceAlertHistoryTable.$inferSelect;

// ── Policy Attestation Departments ────────────────────────────────────────────

// ── Portal Hub ────────────────────────────────────────────────────────────────

export const portalConfigsTable = pgTable("portal_configs", {
  id:             serial("id").primaryKey(),
  tenantId:       integer("tenant_id").notNull().references(() => tenantsTable.id),
  portalType:     text("portal_type").notNull(),          // ciso | cro | chro | vendor | employee
  displayName:    text("display_name").notNull(),
  description:    text("description").notNull().default(""),
  accentColor:    text("accent_color").notNull().default("#3B82F6"),
  enabled:        boolean("enabled").notNull().default(false),
  widgetKeys:     jsonb("widget_keys").notNull().default([]),
  accessToken:    text("access_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
  updatedAt:      timestamp("updated_at").notNull().defaultNow(),
}, (t) => [unique("portal_configs_tenant_type_uniq").on(t.tenantId, t.portalType)]);
export type PortalConfig = typeof portalConfigsTable.$inferSelect;

export const portalAccessLogTable = pgTable("portal_access_log", {
  id:         serial("id").primaryKey(),
  portalId:   integer("portal_id").notNull().references(() => portalConfigsTable.id),
  ipHash:     text("ip_hash"),
  accessedAt: timestamp("accessed_at").notNull().defaultNow(),
});
export type PortalAccessLog = typeof portalAccessLogTable.$inferSelect;

export const attestationDeptsTable = pgTable("attestation_depts", {
  id:            serial("id").primaryKey(),
  tenantId:      integer("tenant_id").notNull().references(() => tenantsTable.id),
  dept:          text("dept").notNull(),
  contact:       text("contact").notNull().default(""),
  totalPolicies: integer("total_policies").notNull().default(0),
  acknowledged:  integer("acknowledged").notNull().default(0),
  overdue:       integer("overdue").notNull().default(0),
  lastActivity:  text("last_activity").notNull().default(""),
  color:         text("color").notNull().default("#1E3A5F"),
  updatedAt:     timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  unique("attestation_depts_tenant_dept_uniq").on(table.tenantId, table.dept),
]);
export type AttestationDept = typeof attestationDeptsTable.$inferSelect;

// ── Trust Center Configs ──────────────────────────────────────────────────────

export const trustCenterConfigsTable = pgTable("trust_center_configs", {
  id:                  serial("id").primaryKey(),
  tenantId:            integer("tenant_id").notNull().references(() => tenantsTable.id).unique(),
  slug:                text("slug").notNull().unique(),
  published:           boolean("published").notNull().default(false),
  displayName:         text("display_name").notNull().default(""),
  tagline:             text("tagline").notNull().default(""),
  accentColor:         text("accent_color").notNull().default("#1E3A5F"),
  logoUrl:             text("logo_url"),
  customDomain:        text("custom_domain"),
  customDomainStatus:  text("custom_domain_status").notNull().default("unverified"),
  visibleSections: jsonb("visible_sections").notNull().default({
    grcScore: true,
    frameworks: true,
    controls: true,
    evidence: true,
    certifications: true,
    aiQa: true,
  }),
  certifications:    jsonb("certifications").notNull().default([]),
  notificationEmail: text("notification_email"),
  createdAt:         timestamp("created_at").notNull().defaultNow(),
  updatedAt:         timestamp("updated_at").notNull().defaultNow(),
});
export type TrustCenterConfig = typeof trustCenterConfigsTable.$inferSelect;

// ── Trust Center Access Requests ──────────────────────────────────────────────

export const trustCenterAccessRequestsTable = pgTable("trust_center_access_requests", {
  id:        serial("id").primaryKey(),
  tenantId:  integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  name:      text("name").notNull(),
  email:     text("email").notNull(),
  message:   text("message"),
  status:    text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export type TrustCenterAccessRequest = typeof trustCenterAccessRequestsTable.$inferSelect;

// ── Framework Library (master catalog) ────────────────────────────────────────

export const frameworkLibraryTable = pgTable("framework_library", {
  id:            serial("id").primaryKey(),
  shortCode:     text("short_code").notNull().unique(),
  name:          text("name").notNull(),
  version:       text("version").notNull().default("1.0"),
  category:      text("category").notNull(),
  region:        text("region").notNull().default("Global"),
  industry:      text("industry"),
  description:   text("description"),
  controlsCount: integer("controls_count").notNull().default(0),
  isActive:      boolean("is_active").notNull().default(true),
  isBeta:        boolean("is_beta").notNull().default(false),
  releasedAt:    text("released_at"),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
});
export type FrameworkLibrary = typeof frameworkLibraryTable.$inferSelect;

// ── MCP Audit Log ─────────────────────────────────────────────────────────────

export const mcpAuditLogTable = pgTable("mcp_audit_log", {
  id:        serial("id").primaryKey(),
  tenantId:  integer("tenant_id").notNull().references(() => tenantsTable.id),
  tokenId:   integer("token_id").references(() => mcpTokensTable.id, { onDelete: "set null" }),
  toolName:  text("tool_name").notNull(),
  calledAt:  timestamp("called_at").notNull().defaultNow(),
  durationMs: integer("duration_ms"),
  success:   boolean("success").notNull().default(true),
  errorMsg:  text("error_msg"),
});
export type McpAuditLog = typeof mcpAuditLogTable.$inferSelect;

// ── Framework Library Controls (master control definitions) ───────────────────

export const frameworkLibraryControlsTable = pgTable("framework_library_controls", {
  id:              serial("id").primaryKey(),
  frameworkId:     integer("framework_id").notNull().references(() => frameworkLibraryTable.id, { onDelete: "cascade" }),
  controlRef:      text("control_ref").notNull(),
  domain:          text("domain").notNull(),
  title:           text("title").notNull(),
  description:     text("description"),
  requirementText: text("requirement_text"),
  crosswalkRefs:   jsonb("crosswalk_refs").notNull().default([]),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  unique("fw_lib_ctrl_fw_ref_uniq").on(t.frameworkId, t.controlRef),
]);
export type FrameworkLibraryControl = typeof frameworkLibraryControlsTable.$inferSelect;

// ── Tenant Framework Activations ──────────────────────────────────────────────

export const tenantFrameworksTable = pgTable("tenant_frameworks", {
  id:          serial("id").primaryKey(),
  tenantId:    integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  frameworkId: integer("framework_id").notNull().references(() => frameworkLibraryTable.id),
  assignedAt:  timestamp("assigned_at").notNull().defaultNow(),
  assignedBy:  text("assigned_by").notNull().default("system"),
  status:      text("status").notNull().default("active"),
}, (t) => [
  unique("tenant_fw_uniq").on(t.tenantId, t.frameworkId),
]);
export type TenantFramework = typeof tenantFrameworksTable.$inferSelect;

// ── Tenant Module Licenses ─────────────────────────────────────────────────────

export const tenantModuleLicensesTable = pgTable("tenant_module_licenses", {
  tenantId:     integer("tenant_id").primaryKey().references(() => tenantsTable.id, { onDelete: "cascade" }),
  plan:         text("plan").notNull().default("starter"),
  seats:        integer("seats").notNull().default(10),
  modules:      jsonb("modules").notNull().default({}),
  frameworkIds: integer("framework_ids").array().notNull().default([]),
  expiresAt:    text("expires_at"),
  updatedAt:    timestamp("updated_at").notNull().defaultNow(),
});
export type TenantModuleLicense = typeof tenantModuleLicensesTable.$inferSelect;

// ── Agent Refresh Tokens ───────────────────────────────────────────────────────

export const agentRefreshTokensTable = pgTable("agent_refresh_tokens", {
  token:     text("token").primaryKey(),
  agentId:   text("agent_id").notNull(),
  tenantId:  integer("tenant_id").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Service Changes ────────────────────────────────────────────────────────────

export const serviceChangesTable = pgTable("service_changes", {
  id:        serial("id").primaryKey(),
  tenantId:  integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  changeId:  text("change_id").notNull(),
  title:     text("title").notNull(),
  type:      text("type").notNull().default("Normal"),
  impact:    text("impact").notNull().default("Medium"),
  risk:      text("risk").notNull().default("Medium"),
  approver:  text("approver").notNull().default(""),
  scheduled: text("scheduled").notNull().default(""),
  status:    text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [unique("svc_chg_tenant_id_uniq").on(t.tenantId, t.changeId)]);
export type ServiceChange = typeof serviceChangesTable.$inferSelect;

// ── Service Problems ───────────────────────────────────────────────────────────

export const serviceProblemsTable = pgTable("service_problems", {
  id:          serial("id").primaryKey(),
  tenantId:    integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  problemId:   text("problem_id").notNull(),
  title:       text("title").notNull(),
  priority:    text("priority").notNull().default("P3"),
  affected:    text("affected").notNull().default(""),
  rootCause:   text("root_cause").notNull().default(""),
  workarounds: integer("workarounds").notNull().default(0),
  changes:     integer("changes").notNull().default(0),
  incidents:   integer("incidents").notNull().default(0),
  age:         text("age").notNull().default(""),
  status:      text("status").notNull().default("investigating"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
}, (t) => [unique("svc_prb_tenant_id_uniq").on(t.tenantId, t.problemId)]);
export type ServiceProblem = typeof serviceProblemsTable.$inferSelect;

// ── CMDB Items ─────────────────────────────────────────────────────────────────

export const cmdbItemsTable = pgTable("cmdb_items", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  ciId:            text("ci_id").notNull(),
  name:            text("name").notNull(),
  type:            text("type").notNull().default("Application"),
  env:             text("env").notNull().default("Production"),
  owner:           text("owner").notNull().default(""),
  version:         text("version").notNull().default(""),
  criticality:     text("criticality").notNull().default("Medium"),
  vulnerabilities: integer("vulnerabilities").notNull().default(0),
  patch:           text("patch").notNull().default("Current"),
  status:          text("status").notNull().default("operational"),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => [unique("cmdb_tenant_ci_id_uniq").on(t.tenantId, t.ciId)]);
export type CmdbItem = typeof cmdbItemsTable.$inferSelect;

// ── SLA Records ────────────────────────────────────────────────────────────────

export const slaRecordsTable = pgTable("sla_records", {
  id:         serial("id").primaryKey(),
  tenantId:   integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  slaId:      text("sla_id").notNull(),
  service:    text("service").notNull(),
  target:     real("target").notNull().default(99.9),
  current:    real("current").notNull().default(0),
  window:     text("window").notNull().default("30d"),
  breached:   integer("breached").notNull().default(0),
  p1Response: text("p1_response").notNull().default("1h"),
  p2Response: text("p2_response").notNull().default("4h"),
  status:     text("status").notNull().default("met"),
  createdAt:  timestamp("created_at").notNull().defaultNow(),
  updatedAt:  timestamp("updated_at").notNull().defaultNow(),
}, (t) => [unique("sla_tenant_sla_id_uniq").on(t.tenantId, t.slaId)]);
export type SlaRecord = typeof slaRecordsTable.$inferSelect;

// ── CSPM Drift Events ──────────────────────────────────────────────────────────

export const cspmDriftEventsTable = pgTable("cspm_drift_events", {
  id:           serial("id").primaryKey(),
  tenantId:     integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  driftId:      text("drift_id").notNull(),
  resourceId:   text("resource_id").notNull(),
  field:        text("field").notNull(),
  baseline:     text("baseline").notNull(),
  current:      text("current").notNull(),
  detectedAt:   text("detected_at").notNull(),
  acknowledged: boolean("acknowledged").notNull().default(false),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
  updatedAt:    timestamp("updated_at").notNull().defaultNow(),
}, (t) => [unique("cspm_drift_tenant_drift_id_uniq").on(t.tenantId, t.driftId)]);
export type CspmDriftEvent = typeof cspmDriftEventsTable.$inferSelect;

// ── DLP Policies ───────────────────────────────────────────────────────────────

export const dlpPoliciesTable = pgTable("dlp_policies", {
  id:         serial("id").primaryKey(),
  tenantId:   integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  policyId:   text("policy_id").notNull(),
  name:       text("name").notNull(),
  type:       text("type").notNull().default("Regex"),
  classifier: text("classifier").notNull().default(""),
  action:     text("action").notNull().default("Alert"),
  hitRate:    integer("hit_rate").notNull().default(0),
  fpRate:     integer("fp_rate").notNull().default(0),
  status:     text("status").notNull().default("active"),
  severity:   text("severity").notNull().default("High"),
  coverage:   text("coverage").notNull().default("All Stores"),
  createdAt:  timestamp("created_at").notNull().defaultNow(),
  updatedAt:  timestamp("updated_at").notNull().defaultNow(),
}, (t) => [unique("dlp_policy_tenant_policy_id_uniq").on(t.tenantId, t.policyId)]);
export type DlpPolicy = typeof dlpPoliciesTable.$inferSelect;

// ── Privacy Notices ────────────────────────────────────────────────────────────

export const privacyNoticesTable = pgTable("privacy_notices", {
  id:               serial("id").primaryKey(),
  tenantId:         integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  noticeId:         text("notice_id").notNull(),
  name:             text("name").notNull(),
  channel:          text("channel").notNull().default("Web"),
  version:          text("version").notNull().default("1.0"),
  status:           text("status").notNull().default("draft"),
  languages:        jsonb("languages").notNull().default([]),
  dpoApproved:      boolean("dpo_approved").notNull().default(false),
  readabilityScore: integer("readability_score").notNull().default(0),
  createdAt:        timestamp("created_at").notNull().defaultNow(),
  updatedAt:        timestamp("updated_at").notNull().defaultNow(),
}, (t) => [unique("privacy_notice_tenant_notice_id_uniq").on(t.tenantId, t.noticeId)]);
export type PrivacyNotice = typeof privacyNoticesTable.$inferSelect;

// ── DPA Records ────────────────────────────────────────────────────────────────

export const dpaRecordsTable = pgTable("dpa_records", {
  id:        serial("id").primaryKey(),
  tenantId:  integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  dpaId:     text("dpa_id").notNull(),
  vendor:    text("vendor").notNull(),
  country:   text("country").notNull().default(""),
  dataTypes: jsonb("data_types").notNull().default([]),
  purpose:   text("purpose").notNull().default(""),
  signed:    text("signed").notNull().default(""),
  expiry:    text("expiry").notNull().default(""),
  status:    text("status").notNull().default("active"),
  mechanism: text("mechanism").notNull().default("SCCs"),
  risk:      text("risk").notNull().default("Low"),
  dpo:       boolean("dpo").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [unique("dpa_tenant_dpa_id_uniq").on(t.tenantId, t.dpaId)]);
export type DpaRecord = typeof dpaRecordsTable.$inferSelect;

// ── AD Security Findings ───────────────────────────────────────────────────────

export const adFindingsTable = pgTable("ad_findings", {
  id:          serial("id").primaryKey(),
  tenantId:    integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  findingId:   text("finding_id").notNull(),
  category:    text("category").notNull(),
  finding:     text("finding").notNull(),
  severity:    text("severity").notNull().default("Medium"),
  affected:    integer("affected").notNull().default(0),
  status:      text("status").notNull().default("open"),
  remediation: text("remediation").notNull().default(""),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
}, (t) => [unique("ad_findings_tenant_finding_id_uniq").on(t.tenantId, t.findingId)]);
export type AdFinding = typeof adFindingsTable.$inferSelect;

// ── AD Privileged Accounts ─────────────────────────────────────────────────────

export const adPrivilegedAccountsTable = pgTable("ad_privileged_accounts", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  accountId:       text("account_id").notNull(),
  username:        text("username").notNull(),
  displayName:     text("display_name").notNull().default(""),
  type:            text("type").notNull().default("admin"),
  domain:          text("domain").notNull().default(""),
  groups:          jsonb("groups").notNull().default([]),
  lastLogin:       text("last_login").notNull().default(""),
  passwordAge:     integer("password_age").notNull().default(0),
  stale:           boolean("stale").notNull().default(false),
  risk:            text("risk").notNull().default("Medium"),
  escalationPaths: integer("escalation_paths").notNull().default(0),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => [unique("ad_priv_acct_tenant_account_id_uniq").on(t.tenantId, t.accountId)]);
export type AdPrivilegedAccount = typeof adPrivilegedAccountsTable.$inferSelect;

// ── AD GPO Findings ────────────────────────────────────────────────────────────

export const adGpoFindingsTable = pgTable("ad_gpo_findings", {
  id:             serial("id").primaryKey(),
  tenantId:       integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  gpoId:          text("gpo_id").notNull(),
  name:           text("name").notNull(),
  severity:       text("severity").notNull().default("Medium"),
  finding:        text("finding").notNull(),
  recommendation: text("recommendation").notNull().default(""),
  cis:            text("cis").notNull().default(""),
  status:         text("status").notNull().default("open"),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
  updatedAt:      timestamp("updated_at").notNull().defaultNow(),
}, (t) => [unique("ad_gpo_tenant_gpo_id_uniq").on(t.tenantId, t.gpoId)]);
export type AdGpoFinding = typeof adGpoFindingsTable.$inferSelect;

// ── AD Password Policy Domains ─────────────────────────────────────────────────

export const adPasswordDomainsTable = pgTable("ad_password_domains", {
  id:                   serial("id").primaryKey(),
  tenantId:             integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  domain:               text("domain").notNull(),
  minLength:            integer("min_length").notNull().default(8),
  complexity:           boolean("complexity").notNull().default(false),
  maxAge:               integer("max_age").notNull().default(90),
  lockoutThreshold:     integer("lockout_threshold").notNull().default(5),
  lockoutDuration:      integer("lockout_duration").notNull().default(30),
  reversibleEncryption: boolean("reversible_encryption").notNull().default(false),
  score:                integer("score").notNull().default(0),
  grade:                text("grade").notNull().default("F"),
  cisPass:              integer("cis_pass").notNull().default(0),
  cisFail:              integer("cis_fail").notNull().default(0),
  createdAt:            timestamp("created_at").notNull().defaultNow(),
  updatedAt:            timestamp("updated_at").notNull().defaultNow(),
}, (t) => [unique("ad_pwd_domain_tenant_domain_uniq").on(t.tenantId, t.domain)]);
export type AdPasswordDomain = typeof adPasswordDomainsTable.$inferSelect;

// ── Shadow Data Stores ─────────────────────────────────────────────────────────

export const shadowDataStoresTable = pgTable("shadow_data_stores", {
  id:             serial("id").primaryKey(),
  tenantId:       integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  storeId:        text("store_id").notNull(),
  name:           text("name").notNull(),
  method:         text("method").notNull().default(""),
  cloud:          text("cloud").notNull().default(""),
  region:         text("region").notNull().default(""),
  owner:          text("owner").notNull().default("Unknown"),
  estSensitivity: text("est_sensitivity").notNull().default("Medium"),
  estSize:        text("est_size").notNull().default(""),
  daysUnmanaged:  integer("days_unmanaged").notNull().default(0),
  action:         text("action").notNull().default("Register"),
  risk:           text("risk").notNull().default("Medium"),
  reason:         text("reason").notNull().default(""),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
  updatedAt:      timestamp("updated_at").notNull().defaultNow(),
}, (t) => [unique("shadow_store_tenant_store_id_uniq").on(t.tenantId, t.storeId)]);
export type ShadowDataStore = typeof shadowDataStoresTable.$inferSelect;

// ── Encryption Matrix ──────────────────────────────────────────────────────────

export const encryptionMatrixTable = pgTable("encryption_matrix", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  store:           text("store").notNull(),
  atRest:          boolean("at_rest").notNull().default(false),
  inTransit:       boolean("in_transit").notNull().default(false),
  keyMgmt:         text("key_mgmt").notNull().default("None"),
  keyAge:          integer("key_age"),
  rotationEnabled: boolean("rotation_enabled").notNull().default(false),
  certExpiry:      text("cert_expiry"),
  status:          text("status").notNull().default("critical"),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => [unique("enc_matrix_tenant_store_uniq").on(t.tenantId, t.store)]);
export type EncryptionMatrix = typeof encryptionMatrixTable.$inferSelect;

// ── Data Residency ─────────────────────────────────────────────────────────────

export const dataResidencyTable = pgTable("data_residency", {
  id:         serial("id").primaryKey(),
  tenantId:   integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  store:      text("store").notNull(),
  required:   text("required").notNull().default(""),
  actual:     text("actual").notNull().default(""),
  cloud:      text("cloud").notNull().default(""),
  status:     text("status").notNull().default("compliant"),
  regulation: text("regulation").notNull().default(""),
  violations: integer("violations").notNull().default(0),
  createdAt:  timestamp("created_at").notNull().defaultNow(),
  updatedAt:  timestamp("updated_at").notNull().defaultNow(),
}, (t) => [unique("data_residency_tenant_store_uniq").on(t.tenantId, t.store)]);
export type DataResidency = typeof dataResidencyTable.$inferSelect;

// ── AI Datasets ────────────────────────────────────────────────────────────────

export const aiDatasetsTable = pgTable("ai_datasets", {
  id:           serial("id").primaryKey(),
  tenantId:     integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  datasetId:    text("dataset_id").notNull(),
  name:         text("name").notNull(),
  purpose:      text("purpose").notNull().default(""),
  sensitivePII: boolean("sensitive_pii").notNull().default(false),
  sensitivePHI: boolean("sensitive_phi").notNull().default(false),
  recordCount:  integer("record_count").notNull().default(0),
  fields:       jsonb("fields").notNull().default([]),
  gdprArt22:    boolean("gdpr_art22").notNull().default(false),
  shadow:       boolean("shadow").notNull().default(false),
  status:       text("status").notNull().default("review"),
  dpoReviewed:  boolean("dpo_reviewed").notNull().default(false),
  auditDate:    text("audit_date"),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
  updatedAt:    timestamp("updated_at").notNull().defaultNow(),
}, (t) => [unique("ai_datasets_tenant_dataset_id_uniq").on(t.tenantId, t.datasetId)]);
export type AiDataset = typeof aiDatasetsTable.$inferSelect;
export type AgentRefreshToken = typeof agentRefreshTokensTable.$inferSelect;

// ── Activity Log ───────────────────────────────────────────────────────────────

export const activityLogTable = pgTable("activity_log", {
  id:         serial("id").primaryKey(),
  tenantId:   integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  type:       text("type").notNull(),
  action:     text("action").notNull(),
  entityId:   text("entity_id").notNull().default(""),
  entityName: text("entity_name").notNull().default(""),
  actor:      text("actor").notNull().default("System"),
  detail:     text("detail").notNull().default(""),
  severity:   text("severity"),
  createdAt:  timestamp("created_at").notNull().defaultNow(),
});
export type ActivityLog = typeof activityLogTable.$inferSelect;

// ── AD Behaviour / UEBA ────────────────────────────────────────────────────────

export const adBehaviourUsersTable = pgTable("ad_behaviour_users", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  username:        text("username").notNull(),
  displayName:     text("display_name").notNull().default(""),
  department:      text("department").notNull().default(""),
  riskScore:       integer("risk_score").notNull().default(0),
  riskLevel:       text("risk_level").notNull().default("Low"),
  baselineLogins:  integer("baseline_logins").notNull().default(0),
  recentLogins:    integer("recent_logins").notNull().default(0),
  anomalyCount:    integer("anomaly_count").notNull().default(0),
  lastAnomaly:     text("last_anomaly").notNull().default(""),
  anomalyTypes:    jsonb("anomaly_types").notNull().default([]),
  sparkline:       jsonb("sparkline").notNull().default([]),
  peerDeviation:   integer("peer_deviation").notNull().default(0),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => [unique("ad_beh_user_tenant_username_uniq").on(t.tenantId, t.username)]);
export type AdBehaviourUser = typeof adBehaviourUsersTable.$inferSelect;

export const adBehaviourEventsTable = pgTable("ad_behaviour_events", {
  id:          serial("id").primaryKey(),
  tenantId:    integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  username:    text("username").notNull(),
  eventType:   text("event_type").notNull(),
  description: text("description").notNull().default(""),
  severity:    text("severity").notNull().default("Medium"),
  occurredAt:  text("occurred_at").notNull().default(""),
  srcIp:       text("src_ip").notNull().default(""),
  location:    text("location").notNull().default(""),
  detail:      jsonb("detail").notNull().default({}),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
});
export type AdBehaviourEvent = typeof adBehaviourEventsTable.$inferSelect;

// ── AD Change Feed ─────────────────────────────────────────────────────────────

export const adChangeFeedTable = pgTable("ad_change_feed", {
  id:           serial("id").primaryKey(),
  tenantId:     integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  changeId:     text("change_id").notNull(),
  objectType:   text("object_type").notNull().default("User"),
  objectName:   text("object_name").notNull().default(""),
  objectDn:     text("object_dn").notNull().default(""),
  changeType:   text("change_type").notNull().default("Modified"),
  fieldName:    text("field_name").notNull().default(""),
  oldValue:     text("old_value").notNull().default(""),
  newValue:     text("new_value").notNull().default(""),
  changedBy:    text("changed_by").notNull().default(""),
  severity:     text("severity").notNull().default("Low"),
  riskNote:     text("risk_note").notNull().default(""),
  occurredAt:   text("occurred_at").notNull().default(""),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
}, (t) => [unique("ad_change_tenant_change_id_uniq").on(t.tenantId, t.changeId)]);
export type AdChangeFeedEntry = typeof adChangeFeedTable.$inferSelect;

// ── AD Alert Rules ─────────────────────────────────────────────────────────────

export const adAlertRulesTable = pgTable("ad_alert_rules", {
  id:          serial("id").primaryKey(),
  tenantId:    integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  ruleId:      text("rule_id").notNull(),
  name:        text("name").notNull(),
  description: text("description").notNull().default(""),
  condition:   text("condition").notNull().default(""),
  severity:    text("severity").notNull().default("High"),
  enabled:     boolean("enabled").notNull().default(true),
  channel:     text("channel").notNull().default("email"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
}, (t) => [unique("ad_alert_rule_tenant_rule_id_uniq").on(t.tenantId, t.ruleId)]);
export type AdAlertRule = typeof adAlertRulesTable.$inferSelect;

// ── DSPM Data Access Events ────────────────────────────────────────────────────

export const dspmAccessEventsTable = pgTable("dspm_access_events", {
  id:             serial("id").primaryKey(),
  tenantId:       integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  eventId:        text("event_id").notNull(),
  userId:         text("user_id").notNull(),
  userName:       text("user_name").notNull().default(""),
  userRole:       text("user_role").notNull().default(""),
  userDept:       text("user_dept").notNull().default(""),
  storeId:        text("store_id").notNull(),
  storeName:      text("store_name").notNull().default(""),
  action:         text("action").notNull().default("READ"),
  dataTypes:      jsonb("data_types").notNull().default([]),
  sensitivity:    text("sensitivity").notNull().default("Internal"),
  recordCount:    integer("record_count").notNull().default(0),
  srcIp:          text("src_ip").notNull().default(""),
  location:       text("location").notNull().default(""),
  anomalous:      boolean("anomalous").notNull().default(false),
  riskLevel:      text("risk_level").notNull().default("Low"),
  riskAnnotation: text("risk_annotation").notNull().default(""),
  occurredAt:     text("occurred_at").notNull().default(""),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
}, (t) => [unique("dspm_access_evt_uniq").on(t.tenantId, t.eventId)]);
export type DspmAccessEvent = typeof dspmAccessEventsTable.$inferSelect;

// ── DSPM Over-Access Alerts ────────────────────────────────────────────────────

export const dspmOverAccessAlertsTable = pgTable("dspm_over_access_alerts", {
  id:             serial("id").primaryKey(),
  tenantId:       integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  alertId:        text("alert_id").notNull(),
  userId:         text("user_id").notNull(),
  userName:       text("user_name").notNull().default(""),
  storeId:        text("store_id").notNull(),
  storeName:      text("store_name").notNull().default(""),
  sensitivity:    text("sensitivity").notNull().default("Confidential"),
  alertType:      text("alert_type").notNull().default("Unusual Access Pattern"),
  description:    text("description").notNull().default(""),
  accessCount:    integer("access_count").notNull().default(0),
  baselineCount:  integer("baseline_count").notNull().default(0),
  severity:       text("severity").notNull().default("High"),
  status:         text("status").notNull().default("open"),
  detectedAt:     text("detected_at").notNull().default(""),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
}, (t) => [unique("dspm_over_access_alert_uniq").on(t.tenantId, t.alertId)]);
export type DspmOverAccessAlert = typeof dspmOverAccessAlertsTable.$inferSelect;

// ── DSR Connectors ─────────────────────────────────────────────────────────────

export const dsrConnectorsTable = pgTable("dsr_connectors", {
  id:             serial("id").primaryKey(),
  tenantId:       integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  connectorId:    text("connector_id").notNull(),
  name:           text("name").notNull(),
  type:           text("type").notNull().default("database"),
  icon:           text("icon").notNull().default("🗄"),
  status:         text("status").notNull().default("connected"),
  subjectCount:   integer("subject_count").notNull().default(0),
  lastScan:       text("last_scan").notNull().default(""),
  avgFulfillDays: real("avg_fulfill_days").notNull().default(2.5),
  notes:          text("notes").notNull().default(""),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
}, (t) => [unique("dsr_connector_uniq").on(t.tenantId, t.connectorId)]);
export type DsrConnector = typeof dsrConnectorsTable.$inferSelect;

// ── DSR Pipeline Store Statuses ────────────────────────────────────────────────

export const dsrPipelineStoresTable = pgTable("dsr_pipeline_stores", {
  id:             serial("id").primaryKey(),
  tenantId:       integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  dsarId:         text("dsar_id").notNull(),
  connectorId:    text("connector_id").notNull(),
  connectorName:  text("connector_name").notNull().default(""),
  status:         text("status").notNull().default("pending"),
  recordsFound:   integer("records_found").notNull().default(0),
  actionedAt:     text("actioned_at").notNull().default(""),
  notes:          text("notes").notNull().default(""),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
}, (t) => [unique("dsr_pipeline_store_uniq").on(t.tenantId, t.dsarId, t.connectorId)]);
export type DsrPipelineStore = typeof dsrPipelineStoresTable.$inferSelect;

// ── Cloud Provider Integrations ───────────────────────────────────────────────

export const cloudIntegrationsTable = pgTable("cloud_integrations", {
  id:          serial("id").primaryKey(),
  tenantId:    integer("tenant_id").notNull().references(() => tenantsTable.id),
  provider:    text("provider").notNull(),
  accountId:   text("account_id").notNull().default(""),
  accountName: text("account_name").notNull().default(""),
  region:      text("region").notNull().default("us-east-1"),
  status:      text("status").notNull().default("connected"),
  connectedAt: timestamp("connected_at").notNull().defaultNow(),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
});
export type CloudIntegration = typeof cloudIntegrationsTable.$inferSelect;

// ── IoT Devices ────────────────────────────────────────────────────────────────

export const iotDevicesTable = pgTable("iot_devices", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  deviceId:        text("device_id").notNull(),
  name:            text("name").notNull(),
  type:            text("type").notNull().default(""),
  icon:            text("icon").notNull().default(""),
  manufacturer:    text("manufacturer").notNull().default(""),
  model:           text("model").notNull().default(""),
  firmware:        text("firmware").notNull().default(""),
  fwDate:          text("fw_date").notNull().default(""),
  ip:              text("ip").notNull().default(""),
  segment:         text("segment").notNull().default(""),
  risk:            text("risk").notNull().default("Medium"),
  status:          text("status").notNull().default("online"),
  lastSeen:        text("last_seen").notNull().default(""),
  openPorts:       text("open_ports").notNull().default("[]"),
  protocols:       text("protocols").notNull().default("[]"),
  cves:            text("cves").notNull().default("[]"),
  commPeers:       text("comm_peers").notNull().default("[]"),
  isolationAction: text("isolation_action").notNull().default(""),
  location:        text("location").notNull().default(""),
  confidence:      text("confidence").notNull().default("High"),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => [unique("iot_dev_tenant_device_id_uniq").on(t.tenantId, t.deviceId)]);
export type IotDevice = typeof iotDevicesTable.$inferSelect;

// ── OT Discovery ───────────────────────────────────────────────────────────────

export const otDiscoveryTable = pgTable("ot_discovery", {
  id:          serial("id").primaryKey(),
  tenantId:    integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  discoveryId: text("discovery_id").notNull(),
  ip:          text("ip").notNull().default(""),
  hostname:    text("hostname").notNull().default(""),
  type:        text("type").notNull().default(""),
  confidence:  text("confidence").notNull().default("Medium"),
  firstSeen:   text("first_seen").notNull().default(""),
  openPorts:   text("open_ports").notNull().default("[]"),
  action:      text("action").notNull().default(""),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
}, (t) => [unique("ot_disc_tenant_disc_id_uniq").on(t.tenantId, t.discoveryId)]);
export type OtDiscovery = typeof otDiscoveryTable.$inferSelect;

// ── OT Protocols ───────────────────────────────────────────────────────────────

export const otProtocolsTable = pgTable("ot_protocols", {
  id:          serial("id").primaryKey(),
  tenantId:    integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  protocolId:  text("protocol_id").notNull(),
  name:        text("name").notNull(),
  port:        integer("port").notNull().default(0),
  devices:     integer("devices").notNull().default(0),
  exposure:    text("exposure").notNull().default("Medium"),
  encrypted:   boolean("encrypted").notNull().default(false),
  description: text("description").notNull().default(""),
  action:      text("action").notNull().default(""),
  color:       text("color").notNull().default(""),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
}, (t) => [unique("ot_proto_tenant_proto_id_uniq").on(t.tenantId, t.protocolId)]);
export type OtProtocol = typeof otProtocolsTable.$inferSelect;

// ── CI Dependencies ────────────────────────────────────────────────────────────

export const ciDependenciesTable = pgTable("ci_dependencies", {
  id:        serial("id").primaryKey(),
  tenantId:  integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  edgeId:    text("edge_id").notNull(),
  sourceCi:  text("source_ci").notNull(),
  targetCi:  text("target_ci").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [unique("ci_dep_tenant_edge_uniq").on(t.tenantId, t.edgeId)]);
export type CiDependency = typeof ciDependenciesTable.$inferSelect;

// ── CI Change Links ────────────────────────────────────────────────────────────

export const ciChangeLinksTable = pgTable("ci_change_links", {
  id:        serial("id").primaryKey(),
  tenantId:  integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  ciId:      text("ci_id").notNull(),
  changeId:  text("change_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [unique("ci_chg_link_uniq").on(t.tenantId, t.ciId, t.changeId)]);
export type CiChangeLink = typeof ciChangeLinksTable.$inferSelect;

// ── AI Security Operations ─────────────────────────────────────────────────

export const aiModelsTable = pgTable("ai_models", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  modelId:         text("model_id").notNull(),
  name:            text("name").notNull(),
  type:            text("type").notNull().default("LLM"),
  provider:        text("provider").notNull().default(""),
  version:         text("version").notNull().default(""),
  deployment:      text("deployment").notNull().default("cloud"),
  environment:     text("environment").notNull().default("production"),
  status:          text("status").notNull().default("active"),
  riskScore:       integer("risk_score").notNull().default(0),
  dataClass:       text("data_class").notNull().default("internal"),
  owner:           text("owner").notNull().default(""),
  useCase:         text("use_case").notNull().default(""),
  lastScanned:     text("last_scanned").notNull().default(""),
  vulnerabilities: integer("vulnerabilities").notNull().default(0),
  approved:        text("approved").notNull().default("pending"),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => [unique("ai_models_tenant_model_uniq").on(t.tenantId, t.modelId)]);
export type AiModel = typeof aiModelsTable.$inferSelect;

export const aiThreatsTable = pgTable("ai_threats", {
  id:          serial("id").primaryKey(),
  tenantId:    integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  threatId:    text("threat_id").notNull(),
  type:        text("type").notNull(),
  severity:    text("severity").notNull().default("Medium"),
  status:      text("status").notNull().default("open"),
  modelId:     text("model_id").notNull().default(""),
  modelName:   text("model_name").notNull().default(""),
  description: text("description").notNull().default(""),
  source:      text("source").notNull().default(""),
  inputSample: text("input_sample").notNull().default(""),
  confidence:  integer("confidence").notNull().default(80),
  detectedAt:  text("detected_at").notNull().default(""),
  mitigatedAt: text("mitigated_at").notNull().default(""),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
}, (t) => [unique("ai_threats_tenant_threat_uniq").on(t.tenantId, t.threatId)]);
export type AiThreat = typeof aiThreatsTable.$inferSelect;

export const aiAppsTable = pgTable("ai_apps", {
  id:          serial("id").primaryKey(),
  tenantId:    integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  appId:       text("app_id").notNull(),
  name:        text("name").notNull(),
  category:    text("category").notNull().default("GenerativeAI"),
  vendor:      text("vendor").notNull().default(""),
  riskLevel:   text("risk_level").notNull().default("Medium"),
  dataClass:   text("data_class").notNull().default("internal"),
  approved:    text("approved").notNull().default("shadow"),
  userCount:   integer("user_count").notNull().default(0),
  deptCount:   integer("dept_count").notNull().default(0),
  dlpEvents:   integer("dlp_events").notNull().default(0),
  monthlyReqs: integer("monthly_reqs").notNull().default(0),
  dataShared:  text("data_shared").notNull().default(""),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
}, (t) => [unique("ai_apps_tenant_app_uniq").on(t.tenantId, t.appId)]);
export type AiApp = typeof aiAppsTable.$inferSelect;

// ── Tenant Embed Tokens ───────────────────────────────────────────────────────
// One token per tenant; token value is globally unique (UNIQUE constraint).
// Used to authenticate the browser-embeddable JS package sent to tenant websites.

export const embedTokensTable = pgTable("tenant_embed_tokens", {
  id:          serial("id").primaryKey(),
  tenantId:    integer("tenant_id").notNull().unique().references(() => tenantsTable.id, { onDelete: "cascade" }),
  token:       text("token").notNull().unique(),
  label:       text("label").notNull().default("Primary"),
  lastUsedAt:  timestamp("last_used_at"),
  beaconCount: integer("beacon_count").notNull().default(0),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
});
export type EmbedToken = typeof embedTokensTable.$inferSelect;

export const aiScansTable = pgTable("ai_scans", {
  id:        serial("id").primaryKey(),
  tenantId:  integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  scanId:    text("scan_id").notNull(),
  modelId:   text("model_id").notNull(),
  modelName: text("model_name").notNull().default(""),
  scanType:  text("scan_type").notNull().default("full"),
  result:    text("result").notNull().default("clean"),
  findings:  integer("findings").notNull().default(0),
  critical:  integer("critical").notNull().default(0),
  high:      integer("high").notNull().default(0),
  medium:    integer("medium").notNull().default(0),
  duration:  integer("duration").notNull().default(0),
  scannedAt: text("scanned_at").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [unique("ai_scans_tenant_scan_uniq").on(t.tenantId, t.scanId)]);
export type AiScan = typeof aiScansTable.$inferSelect;
