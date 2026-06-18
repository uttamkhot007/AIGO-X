import { Router } from "express";
import { or, ilike, eq, and } from "drizzle-orm";
import { db } from "../lib/db";
import { requireAuth } from "../lib/auth";
import type { JwtPayload } from "../lib/auth";
import type { Request } from "express";
import {
  grcPoliciesTable,
  governanceProcessesTable,
  governanceProceduresTable,
  risksTable,
  riskTreatmentsTable,
  riskVendorsTable,
  ticketsTable,
  grcAssetsTable,
  peopleTable,
  auditProgramsTable,
  auditFindingsTable,
  auditEvidenceRequestsTable,
  questionnairesTable,
  controlsTable,
  dsarsTable,
  saasAppsTable,
  findingsTable,
  cloudResourcesTable,
  cloudFindingsTable,
  dataStoresTable,
  ropaRecordsTable,
} from "@workspace/db";

const router = Router();
type AuthReq = Request & { user: JwtPayload };

export interface SearchResult {
  uid:      string;
  name:     string;
  status:   string;
  sub:      string | null;
  location: string;
  type:     string;
  icon:     string;
  route:    string;
}

router.get("/search", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const tid = Number(tenantId);
    const q = String(req.query["q"] ?? "").trim();

    if (q.length < 2) {
      res.json({ results: {}, total: 0, query: q });
      return;
    }

    const pat = `%${q}%`;

    const [
      policies,
      processes,
      procedures,
      controls,
      risks,
      riskTreatments,
      riskVendors,
      tickets,
      assets,
      people,
      audits,
      auditFindings,
      auditEvidenceReqs,
      questionnaires,
      dsars,
      saasApps,
      secFindings,
      cloudResources,
      cloudFindings,
      dataStores,
      ropaRecords,
    ] = await Promise.all([
      // ── GovOps: Policies ───────────────────────────────────────────────────
      db.select({ uid: grcPoliciesTable.policyId, name: grcPoliciesTable.title, status: grcPoliciesTable.status, sub: grcPoliciesTable.type })
        .from(grcPoliciesTable)
        .where(and(eq(grcPoliciesTable.tenantId, tid), or(ilike(grcPoliciesTable.policyId, pat), ilike(grcPoliciesTable.title, pat), ilike(grcPoliciesTable.type, pat), ilike(grcPoliciesTable.owner, pat))))
        .limit(8),

      // ── GovOps: Processes ──────────────────────────────────────────────────
      db.select({ uid: governanceProcessesTable.processId, name: governanceProcessesTable.name, status: governanceProcessesTable.status, sub: governanceProcessesTable.category })
        .from(governanceProcessesTable)
        .where(and(eq(governanceProcessesTable.tenantId, tid), or(ilike(governanceProcessesTable.processId, pat), ilike(governanceProcessesTable.name, pat), ilike(governanceProcessesTable.category, pat), ilike(governanceProcessesTable.owner, pat))))
        .limit(6),

      // ── GovOps: Procedures ─────────────────────────────────────────────────
      db.select({ uid: governanceProceduresTable.procedureId, name: governanceProceduresTable.name, status: governanceProceduresTable.status, sub: governanceProceduresTable.process })
        .from(governanceProceduresTable)
        .where(and(eq(governanceProceduresTable.tenantId, tid), or(ilike(governanceProceduresTable.procedureId, pat), ilike(governanceProceduresTable.name, pat), ilike(governanceProceduresTable.owner, pat))))
        .limit(6),

      // ── GovOps: Controls ──────────────────────────────────────────────────
      db.select({ uid: controlsTable.controlId, name: controlsTable.name, status: controlsTable.status, sub: controlsTable.framework })
        .from(controlsTable)
        .where(and(eq(controlsTable.tenantId, tid), or(ilike(controlsTable.controlId, pat), ilike(controlsTable.name, pat), ilike(controlsTable.framework, pat), ilike(controlsTable.domain, pat))))
        .limit(6),

      // ── RiskOps: Risk Register ─────────────────────────────────────────────
      db.select({ uid: risksTable.riskId, name: risksTable.name, status: risksTable.status, sub: risksTable.severity })
        .from(risksTable)
        .where(and(eq(risksTable.tenantId, tid), or(ilike(risksTable.riskId, pat), ilike(risksTable.name, pat), ilike(risksTable.category, pat), ilike(risksTable.owner, pat))))
        .limit(6),

      // ── RiskOps: Treatments ────────────────────────────────────────────────
      db.select({ uid: riskTreatmentsTable.treatmentId, name: riskTreatmentsTable.name, status: riskTreatmentsTable.status, sub: riskTreatmentsTable.type })
        .from(riskTreatmentsTable)
        .where(and(eq(riskTreatmentsTable.tenantId, tid), or(ilike(riskTreatmentsTable.treatmentId, pat), ilike(riskTreatmentsTable.name, pat), ilike(riskTreatmentsTable.riskId, pat), ilike(riskTreatmentsTable.owner, pat))))
        .limit(5),

      // ── RiskOps: TPRM Vendors ──────────────────────────────────────────────
      db.select({ uid: riskVendorsTable.vendorId, name: riskVendorsTable.name, status: riskVendorsTable.status, sub: riskVendorsTable.category })
        .from(riskVendorsTable)
        .where(and(eq(riskVendorsTable.tenantId, tid), or(ilike(riskVendorsTable.vendorId, pat), ilike(riskVendorsTable.name, pat), ilike(riskVendorsTable.category, pat), ilike(riskVendorsTable.contact, pat))))
        .limit(5),

      // ── Service Desk: Tickets ──────────────────────────────────────────────
      db.select({ uid: ticketsTable.ticketId, name: ticketsTable.title, status: ticketsTable.status, sub: ticketsTable.priority })
        .from(ticketsTable)
        .where(and(eq(ticketsTable.tenantId, tid), or(ilike(ticketsTable.ticketId, pat), ilike(ticketsTable.title, pat), ilike(ticketsTable.category, pat), ilike(ticketsTable.assignee, pat))))
        .limit(6),

      // ── Security: Assets (CAASM) ───────────────────────────────────────────
      db.select({ uid: grcAssetsTable.assetId, name: grcAssetsTable.hostname, status: grcAssetsTable.risk, sub: grcAssetsTable.category })
        .from(grcAssetsTable)
        .where(and(eq(grcAssetsTable.tenantId, tid), or(ilike(grcAssetsTable.assetId, pat), ilike(grcAssetsTable.hostname, pat), ilike(grcAssetsTable.category, pat), ilike(grcAssetsTable.ip, pat), ilike(grcAssetsTable.dept, pat))))
        .limit(6),

      // ── PeopleOps: People ──────────────────────────────────────────────────
      db.select({ uid: peopleTable.employeeId, name: peopleTable.name, status: peopleTable.status, sub: peopleTable.dept })
        .from(peopleTable)
        .where(and(eq(peopleTable.tenantId, tid), or(ilike(peopleTable.employeeId, pat), ilike(peopleTable.name, pat), ilike(peopleTable.email, pat), ilike(peopleTable.dept, pat), ilike(peopleTable.role, pat))))
        .limit(6),

      // ── ComplianceOps: Audit Programs ──────────────────────────────────────
      db.select({ uid: auditProgramsTable.programId, name: auditProgramsTable.name, status: auditProgramsTable.status, sub: auditProgramsTable.framework })
        .from(auditProgramsTable)
        .where(and(eq(auditProgramsTable.tenantId, tid), or(ilike(auditProgramsTable.programId, pat), ilike(auditProgramsTable.name, pat), ilike(auditProgramsTable.framework, pat), ilike(auditProgramsTable.auditor, pat))))
        .limit(5),

      // ── ComplianceOps: Audit Findings ──────────────────────────────────────
      db.select({ uid: auditFindingsTable.findingId, name: auditFindingsTable.title, status: auditFindingsTable.status, sub: auditFindingsTable.severity })
        .from(auditFindingsTable)
        .where(and(eq(auditFindingsTable.tenantId, tid), or(ilike(auditFindingsTable.findingId, pat), ilike(auditFindingsTable.title, pat), ilike(auditFindingsTable.category, pat), ilike(auditFindingsTable.owner, pat))))
        .limit(5),

      // ── ComplianceOps: Evidence Requests ───────────────────────────────────
      db.select({ uid: auditEvidenceRequestsTable.requestId, name: auditEvidenceRequestsTable.description, status: auditEvidenceRequestsTable.status, sub: auditEvidenceRequestsTable.control })
        .from(auditEvidenceRequestsTable)
        .where(and(eq(auditEvidenceRequestsTable.tenantId, tid), or(ilike(auditEvidenceRequestsTable.requestId, pat), ilike(auditEvidenceRequestsTable.description, pat), ilike(auditEvidenceRequestsTable.control, pat), ilike(auditEvidenceRequestsTable.requestedFrom, pat))))
        .limit(4),

      // ── Questionnaires ─────────────────────────────────────────────────────
      db.select({ uid: questionnairesTable.qId, name: questionnairesTable.name, status: questionnairesTable.status, sub: questionnairesTable.type })
        .from(questionnairesTable)
        .where(and(eq(questionnairesTable.tenantId, tid), or(ilike(questionnairesTable.qId, pat), ilike(questionnairesTable.name, pat), ilike(questionnairesTable.type, pat), ilike(questionnairesTable.recipient, pat))))
        .limit(5),

      // ── PrivacyOps: DSARs ──────────────────────────────────────────────────
      db.select({ uid: dsarsTable.dsarId, name: dsarsTable.subject, status: dsarsTable.status, sub: dsarsTable.type })
        .from(dsarsTable)
        .where(and(eq(dsarsTable.tenantId, tid), or(ilike(dsarsTable.dsarId, pat), ilike(dsarsTable.subject, pat), ilike(dsarsTable.type, pat))))
        .limit(5),

      // ── Security: SaaS Apps (SSPM) ─────────────────────────────────────────
      db.select({ uid: saasAppsTable.appId, name: saasAppsTable.name, status: saasAppsTable.risk, sub: saasAppsTable.category })
        .from(saasAppsTable)
        .where(and(eq(saasAppsTable.tenantId, tid), or(ilike(saasAppsTable.appId, pat), ilike(saasAppsTable.name, pat), ilike(saasAppsTable.category, pat))))
        .limit(5),

      // ── Security: Security Findings ────────────────────────────────────────
      db.select({ uid: findingsTable.findingId, name: findingsTable.title, status: findingsTable.status, sub: findingsTable.severity })
        .from(findingsTable)
        .where(and(eq(findingsTable.tenantId, tid), or(ilike(findingsTable.findingId, pat), ilike(findingsTable.title, pat), ilike(findingsTable.resource, pat))))
        .limit(5),

      // ── CloudOps: Cloud Resources (CSPM) ───────────────────────────────────
      db.select({ uid: cloudResourcesTable.resourceId, name: cloudResourcesTable.name, status: cloudResourcesTable.status, sub: cloudResourcesTable.provider })
        .from(cloudResourcesTable)
        .where(and(eq(cloudResourcesTable.tenantId, tid), or(ilike(cloudResourcesTable.resourceId, pat), ilike(cloudResourcesTable.name, pat), ilike(cloudResourcesTable.provider, pat), ilike(cloudResourcesTable.service, pat), ilike(cloudResourcesTable.region, pat))))
        .limit(5),

      // ── CloudOps: Cloud Findings ───────────────────────────────────────────
      db.select({ uid: cloudFindingsTable.findingId, name: cloudFindingsTable.title, status: cloudFindingsTable.status, sub: cloudFindingsTable.severity })
        .from(cloudFindingsTable)
        .where(and(eq(cloudFindingsTable.tenantId, tid), or(ilike(cloudFindingsTable.findingId, pat), ilike(cloudFindingsTable.title, pat), ilike(cloudFindingsTable.rule, pat))))
        .limit(5),

      // ── DataOps: Data Stores (DSPM) ────────────────────────────────────────
      db.select({ uid: dataStoresTable.storeId, name: dataStoresTable.name, status: dataStoresTable.riskScore, sub: dataStoresTable.platform })
        .from(dataStoresTable)
        .where(and(eq(dataStoresTable.tenantId, tid), or(ilike(dataStoresTable.storeId, pat), ilike(dataStoresTable.name, pat), ilike(dataStoresTable.platform, pat), ilike(dataStoresTable.classification, pat))))
        .limit(4),

      // ── PrivacyOps: RoPA Records ───────────────────────────────────────────
      db.select({ uid: ropaRecordsTable.ropaId, name: ropaRecordsTable.process, status: ropaRecordsTable.status, sub: ropaRecordsTable.legalBasis })
        .from(ropaRecordsTable)
        .where(and(eq(ropaRecordsTable.tenantId, tid), or(ilike(ropaRecordsTable.ropaId, pat), ilike(ropaRecordsTable.process, pat), ilike(ropaRecordsTable.controller, pat), ilike(ropaRecordsTable.purpose, pat))))
        .limit(4),
    ]);

    const results: Record<string, SearchResult[]> = {};

    function add(
      key:      string,
      rows:     { uid: string; name: string; status: string; sub: string | null }[],
      type:     string,
      icon:     string,
      location: string,
      routeFn:  (uid: string) => string,
    ) {
      if (rows.length > 0) {
        results[key] = rows.map(r => ({ ...r, type, icon, location, route: routeFn(r.uid) }));
      }
    }

    // ── Governance ─────────────────────────────────────────────────────────────
    add("Policies",                 policies,                             "Policy",           "◉",  "GovOps · Policies",                   uid => `/govops/policies/${uid}`);
    // Policies also appear in PeopleOps (policy acknowledgment) and ComplianceOps (governance controls)
    add("Policy Acknowledgment",    policies.slice(0, 5),                 "Policy",           "◉",  "PeopleOps · Policy ACK",              _   => `/peopleops`);
    add("Governance Documents",     policies.filter(p => p.status !== "draft").slice(0, 4), "Policy", "◉", "ComplianceOps · Governance",  _   => `/complianceops`);

    add("Processes",                processes,                            "Process",          "⚙",  "GovOps · Processes",                  uid => `/govops/processes/${uid}`);
    // Processes also appear in Audit context
    add("Audit Processes",          processes.slice(0, 3),                "Process",          "⚙",  "ComplianceOps · Audit Programs",      _   => `/complianceops`);

    add("Procedures",               procedures,                           "Procedure",        "◫",  "GovOps · Procedures",                 uid => `/govops/procedures/${uid}`);

    add("Controls",                 controls,                             "Control",          "◆",  "GovOps · Controls",                   uid => `/govops/controls/${uid}`);
    // Controls also appear directly in ComplianceOps framework view
    add("Compliance Controls",      controls.slice(0, 5),                 "Control",          "◆",  "ComplianceOps · Framework Controls",  uid => `/complianceops/controls/${uid}`);

    // ── Risk ───────────────────────────────────────────────────────────────────
    add("Risks",                    risks,                                "Risk",             "◈",  "RiskOps · Register",                  uid => `/riskops/risks/${uid}`);
    // Risks also appear in the Risk Heat Map and in Risk Appetite context
    add("Risk Heat Map",            risks.slice(0, 4),                    "Risk",             "◈",  "RiskOps · Heat Map",                  _   => `/riskops`);
    add("Risk Treatments",          riskTreatments,                       "Treatment",        "⟳",  "RiskOps · Treatments",                _   => `/riskops`);
    add("Vendors",                  riskVendors,                          "Vendor",           "◑",  "RiskOps · TPRM",                      uid => `/riskops/vendors/${uid}`);

    // ── Service Desk ───────────────────────────────────────────────────────────
    add("Tickets",                  tickets,                              "Ticket",           "◧",  "Service Desk · Tickets",              _   => `/service-desk`);

    // ── Security ───────────────────────────────────────────────────────────────
    add("Assets",                   assets,                               "Asset",            "□",  "Security · Assets (CAASM)",           _   => `/assetops`);
    add("SaaS Apps",                saasApps,                             "SaaS",             "◩",  "Security · SaaS Apps (SSPM)",         _   => `/secops`);
    add("Security Findings",        secFindings,                          "Security Finding", "◬",  "Security · Findings",                 _   => `/secops`);
    add("Cloud Resources",          cloudResources,                       "Cloud Resource",   "☁",  "CloudOps · Resources (CSPM)",         _   => `/cloudops`);
    add("Cloud Findings",           cloudFindings,                        "Cloud Finding",    "⚡", "CloudOps · Findings (CSPM)",          _   => `/cloudops`);
    // Security findings also surface in the Compliance audit trail
    add("Compliance Findings",      secFindings.slice(0, 3),              "Security Finding", "◬",  "ComplianceOps · Audit Findings",      _   => `/complianceops`);

    // ── PeopleOps ──────────────────────────────────────────────────────────────
    add("People",                   people,                               "Person",           "◯",  "PeopleOps · Directory",               _   => `/peopleops`);
    // People also appear in Service Desk (ticket assignees) and Risk (owners)
    add("Ticket Assignees",         people.slice(0, 3),                   "Person",           "◯",  "Service Desk · Assignees",            _   => `/service-desk`);

    // ── ComplianceOps ──────────────────────────────────────────────────────────
    add("Audit Programs",           audits,                               "Audit",            "◎",  "ComplianceOps · Audit Programs",      _   => `/complianceops`);
    add("Audit Findings",           auditFindings,                        "Audit Finding",    "⚑",  "ComplianceOps · Audit Findings",      _   => `/complianceops`);
    // Audit findings also appear in risk context
    add("Risk Findings",            auditFindings.slice(0, 3),            "Audit Finding",    "⚑",  "RiskOps · Findings",                  _   => `/riskops`);
    add("Evidence Requests",        auditEvidenceReqs,                    "Evidence Request", "📋", "ComplianceOps · Evidence",            _   => `/evidence-engine`);
    add("Questionnaires",           questionnaires,                       "Questionnaire",    "◐",  "ComplianceOps · Questionnaires",      _   => `/questionnaires`);

    // ── PrivacyOps ─────────────────────────────────────────────────────────────
    add("DSARs",                    dsars,                                "DSAR",             "◑",  "PrivacyOps · DSARs",                  _   => `/privacyops`);
    add("RoPA Records",             ropaRecords,                          "RoPA",             "◐",  "PrivacyOps · RoPA",                   _   => `/privacyops`);

    // ── DataOps ────────────────────────────────────────────────────────────────
    add("Data Stores",              dataStores,                           "Data Store",       "◫",  "DataOps · Data Stores (DSPM)",        _   => `/dataops`);

    const total = Object.values(results).reduce((s, arr) => s + arr.length, 0);
    res.json({ results, total, query: q });
  } catch (err) {
    console.error("[search] error:", err);
    res.status(500).json({ error: "Search failed" });
  }
});

export default router;
