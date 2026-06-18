// @ts-nocheck
import { useState, useMemo } from "react";

const NAV = "#1E3A5F", EME = "#065F46", RED = "#DC2626", AMB = "#D97706", BLU = "#1D4ED8", PRP = "#7C3AED", CYN = "#0891B2";

const card = (extra: React.CSSProperties = {}): React.CSSProperties => ({
  background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12,
  boxShadow: "0 2px 8px rgba(0,0,0,0.05)", ...extra,
});

// ── Release Notes data ───────────────────────────────────────────────────────
const RELEASE_NOTES = [
  {
    version: "1.4.0",
    date: "June 15, 2026",
    type: "major",
    title: "Documentation Hub & Settings Overhaul",
    summary: "Introduced the Documentation tab under Settings with Release Notes, Admin Guide, and SOPs. All documentation auto-reflects platform changes.",
    changes: {
      new: [
        "Documentation tab under Settings with three sub-tabs: Release Notes, Admin Guide, SOPs",
        "12 built-in Standard Operating Procedures covering all major GRC workflows",
        "Admin Guide with module-by-module configuration reference",
        "Searchable Release Notes with version filtering and category tags",
      ],
      improved: [
        "Settings section navigation now includes a Documentation section (📄)",
        "ModuleHeader description updated to include Documentation",
      ],
      fixed: [],
    },
  },
  {
    version: "1.3.0",
    date: "June 15, 2026",
    type: "major",
    title: "Full PostgreSQL Persistence & Route Shadowing Fix",
    summary: "All 17 GRC API endpoints now return real DB data. Fixed critical route-shadowing bug where GET /risks/:id intercepted /risks/vendors and /risks/treatments.",
    changes: {
      new: [
        "DB-backed persistence for Risk Treatments (risk_treatments table — 7 rows)",
        "DB-backed persistence for Risk Vendors / TPRM (risk_vendors table — 7 rows)",
        "DB-backed persistence for Risk Appetite (risk_appetite table)",
        "DB-backed persistence for Risk Cascades (risk_cascades table)",
        "DB-backed persistence for Audit Plans & Findings (audit_programs, audit_findings tables)",
        "DB-backed persistence for Evidence Engine runs (evidence_engine_runs table)",
        "DB-backed persistence for Questionnaires (questionnaires table)",
        "DB-backed persistence for Governance Processes & Procedures",
        "Seed data populated across all tables (7–20 rows each)",
      ],
      improved: [
        "Route registration order: dbModulesRouter now registered before risksRouter to prevent shadowing",
        "All 17 GRC API endpoints verified returning HTTP 200",
      ],
      fixed: [
        "CRITICAL: GET /risks/vendors returning 500 — caused by route shadowing from risksRouter GET /risks/:id",
        "CRITICAL: GET /risks/treatments returning 500 — same root cause",
        "Removed duplicate dbModulesRouter registration in routes/index.ts",
      ],
    },
  },
  {
    version: "1.2.0",
    date: "June 14, 2026",
    type: "major",
    title: "Risk Register Templates & Sub-Navigation",
    summary: "Added 8 built-in compliance framework templates to the Risk Register, custom CSV upload, and a gallery with search/preview/export.",
    changes: {
      new: [
        "RiskRegisterTemplates.tsx — 8 built-in standards: ISO 27001, NIST SP 800-30, SOC 2, PCI DSS, GDPR, HIPAA, NIST CSF 2.0, COBIT 2019",
        "Custom CSV template upload with LocalStorage persistence (key: grc_custom_templates)",
        "Template gallery with search, preview, and export",
        "Risk Register sub-navigation: 📊 My Risk Register | 📋 Risk Register Templates",
        "Active template banner showing selected standard in My Risk Register view",
        "Export CSV respects active template column format",
      ],
      improved: [
        "RiskOps.tsx now ~1,084 lines; registerSubTab and activeTemplate state added",
      ],
      fixed: [
        "JSX fragment nesting in RiskOps.tsx — 3 opens matched by 3 closes; Vite build clean",
      ],
    },
  },
  {
    version: "1.1.0",
    date: "June 12, 2026",
    type: "minor",
    title: "Audit Programs Schema Augmentation",
    summary: "audit_programs table extended with lead, startDate, endDate, currentPhase, and phaseProgress columns to support full audit lifecycle tracking.",
    changes: {
      new: [
        "audit_programs.lead — assigned auditor name",
        "audit_programs.startDate / endDate — lifecycle window",
        "audit_programs.currentPhase — Planning | Fieldwork | Reporting | Closed",
        "audit_programs.phaseProgress — 0–100 integer",
      ],
      improved: [
        "Audit Plans tab now renders phase progress bars and lead assignment",
      ],
      fixed: [],
    },
  },
  {
    version: "1.0.0",
    date: "June 10, 2026",
    type: "major",
    title: "AIGO-X GRC Platform — Initial Release",
    summary: "First production-ready release of the AIGO-X GRC platform. Covers Risk, Governance, Compliance, Audit, Evidence Engine, Questionnaires, Privacy, Service Desk, and Analytics modules.",
    changes: {
      new: [
        "Risk module: Risk Register, Heatmap, Appetite, Cascades, TPRM Vendors, Treatments",
        "Governance module: Policies, Processes, Procedures, Controls Library",
        "Compliance module: Frameworks, Maturity, Gaps, Compliance Packs",
        "Audit module: Audit Programs, Findings, Evidence",
        "Evidence Engine: automated evidence collection runs with integrations",
        "Questionnaires: vendor/internal assessment questionnaires",
        "Privacy / DSAR module",
        "Service Desk integration",
        "Analytics & Reporting dashboard",
        "AI vCISO recommendation engine",
        "Settings: Org Profile, User Management, Agents, Assets, Integrations Hub",
        "Multi-tenant support (Acme Corp, Globex, Initech)",
        "PostgreSQL backend with Drizzle ORM",
        "JWT-based authentication (admin@acme.com / password123 for demo)",
      ],
      improved: [],
      fixed: [],
    },
  },
];

// ── Admin Guide data ─────────────────────────────────────────────────────────
const ADMIN_GUIDE_SECTIONS = [
  {
    id: "overview",
    icon: "🏢",
    title: "Platform Overview",
    content: [
      {
        heading: "What is AIGO-X GRC?",
        body: "AIGO-X GRC is an enterprise Governance, Risk & Compliance platform. It provides a single pane of glass across Risk Management, Governance, Compliance Frameworks, Audit Management, Evidence Collection, Vendor Management, and Privacy Operations — all backed by a PostgreSQL database and an AI vCISO assistant.",
      },
      {
        heading: "Architecture",
        body: "The platform consists of two services:\n• Frontend: React + Vite + TypeScript (artifacts/grc-platform), served at /grc-platform/\n• API Server: Express + Drizzle ORM + PostgreSQL (artifacts/api-server), served at /api/\n\nAll state is persisted in PostgreSQL. No in-memory stores remain after v1.3.0.",
      },
      {
        heading: "Authentication",
        body: "JWT-based authentication. Default admin credentials for demo:\n• Email: admin@acme.com\n• Password: password123\n\nTokens are stored in localStorage under key grc_token. Session expires after 8 hours.",
      },
      {
        heading: "Multi-Tenancy",
        body: "The platform supports multiple tenants. Tenant context is selected from the Org Profile switcher in Settings. Available demo tenants:\n• Tenant 1: Acme Corp (TEN-ACME-001) — acme.com\n• Tenant 2: Globex (TEN-GLOBEX-002) — globex.com\n• Tenant 3: Initech (TEN-INITECH-003) — initech.com",
      },
    ],
  },
  {
    id: "initial-setup",
    icon: "⚙️",
    title: "Initial Setup",
    content: [
      {
        heading: "1. Environment Variables",
        body: "Required environment variable:\n• DATABASE_URL — PostgreSQL connection string\n\nSet this in the Replit Secrets manager before starting the API server. Never hardcode credentials in source files.",
      },
      {
        heading: "2. Database Initialisation",
        body: "Run schema push (requires psql — do NOT use drizzle push as it requires a TTY):\n\n  psql \"$DATABASE_URL\" -f schema.sql\n\nOr use Drizzle from a TTY session:\n\n  pnpm --filter @workspace/api-server run db:push\n\nAll tables are created automatically on first run.",
      },
      {
        heading: "3. Seed Data",
        body: "Populate demo data:\n\n  pnpm --filter @workspace/api-server run seed\n\nThis inserts 7–20 rows per table across: risks, risk_treatments, risk_vendors, risk_appetite, risk_cascades, audit_programs, audit_findings, evidence_engine_runs, questionnaires, governance_processes, governance_procedures.",
      },
      {
        heading: "4. Starting the Platform",
        body: "Two workflows must be running:\n\n  Workflow 1: API Server\n  Command: pnpm --filter @workspace/api-server run dev\n  Port: 8080 (via PORT env var)\n\n  Workflow 2: Frontend\n  Command: pnpm --filter @workspace/grc-platform run dev\n  Port: assigned by Replit (reads PORT env var)\n\nBoth are pre-configured as Replit workflows.",
      },
      {
        heading: "5. Vite Proxy",
        body: "The Vite dev server proxies /api → http://localhost:8080. This is configured in vite.config.ts. In production, the reverse proxy handles routing.",
      },
    ],
  },
  {
    id: "user-management",
    icon: "👥",
    title: "User Management",
    content: [
      {
        heading: "Creating Users",
        body: "Navigate to Settings → User Management → Users → + Invite User.\nEnter name, email, department, and assign a role. An invitation email is sent automatically (SMTP must be configured).",
      },
      {
        heading: "Roles & Permissions",
        body: "Pre-built roles:\n• Super Admin — full access, all modules, all tenants\n• GRC Manager — all GRC modules, read-only Settings\n• Risk Analyst — Risk module write, all others read\n• Compliance Auditor — Compliance + Audit write\n• Read Only — view all, no write\n• CISO — all modules read/write, Settings read\n\nCustom roles can be created under Settings → Roles → + New Role.",
      },
      {
        heading: "MFA Enforcement",
        body: "MFA is strongly recommended for all admin-level accounts. Users without MFA are flagged with a ⚠ NO MFA badge in the Users list.\n\nEnforce MFA org-wide: Settings → Org Profile → Security → Require MFA for all users → Enable.",
      },
      {
        heading: "User Groups",
        body: "User Groups map teams to module access. Create groups under Settings → User Groups. Groups are used for bulk policy acknowledgement, audit assignment, and notification routing.",
      },
    ],
  },
  {
    id: "risk-module",
    icon: "🎯",
    title: "Risk Module",
    content: [
      {
        heading: "Risk Register",
        body: "The Risk Register is the central inventory of organisational risks. Each risk record contains: title, category, likelihood (1–5), impact (1–5), risk score (likelihood × impact × 4), owner, status, treatment strategy, and linked framework controls.\n\nRisk scores are colour-coded:\n• 80–100: Critical (Red)\n• 60–79: High (Amber)\n• 40–59: Medium (Blue)\n• 0–39: Low (Green)",
      },
      {
        heading: "Risk Register Templates",
        body: "8 built-in framework templates are available under Risk Register → 📋 Templates:\n• ISO 27001:2022 — 14 risk categories\n• NIST SP 800-30 — threat-based taxonomy\n• SOC 2 — trust service criteria risks\n• PCI DSS v4.0 — cardholder data environment risks\n• GDPR — privacy and data protection risks\n• HIPAA — healthcare data risks\n• NIST CSF 2.0 — cybersecurity function risks\n• COBIT 2019 — IT governance risks\n\nCustom templates can be uploaded via CSV. Stored in localStorage under grc_custom_templates.",
      },
      {
        heading: "Risk Appetite",
        body: "Configure risk appetite thresholds per risk category under Risk → Appetite. Each appetite entry defines: category, appetite level (Conservative / Moderate / Aggressive), max acceptable score, and owner.",
      },
      {
        heading: "Risk Heatmap",
        body: "The heatmap visualises all open risks on a 5×5 likelihood/impact matrix. Click any cell to drill into the risks in that quadrant.",
      },
      {
        heading: "Treatments",
        body: "Treatments are mitigating actions linked to specific risks. Each treatment has: type (Mitigate / Accept / Transfer / Avoid), owner, due date, status, and estimated cost reduction.",
      },
      {
        heading: "Risk Cascades",
        body: "Cascades model secondary risk effects — when Risk A triggers Risk B. Used for systemic risk analysis and scenario planning.",
      },
    ],
  },
  {
    id: "governance-module",
    icon: "📋",
    title: "Governance Module",
    content: [
      {
        heading: "Policies",
        body: "Policies are top-level governance documents. The platform ships with 17+ pre-built policy templates (Acceptable Use, BYOD, Change Management, Data Retention, etc.).\n\nPolicy lifecycle:\n  Draft → Review → Approved → Published → Archived\n\nPolicies have versioning, multilingual support, clause extraction, and stakeholder review workflows.",
      },
      {
        heading: "Processes",
        body: "Governance processes define repeatable operational workflows. Each process has a maturity level (Initial / Repeatable / Defined / Managed / Optimized) and maps to one or more framework controls.",
      },
      {
        heading: "Procedures",
        body: "Procedures are step-by-step instructions supporting processes. They include: owner, department, frequency, and a linked process reference.",
      },
      {
        heading: "Controls Library",
        body: "The Controls Library contains all mappable controls across frameworks. Controls can be marked Available, Applicable, or In Scope. Navigate using the Frameworks, Library, Available, and Applicable sub-tabs.",
      },
    ],
  },
  {
    id: "audit-module",
    icon: "🔍",
    title: "Audit Module",
    content: [
      {
        heading: "Audit Programs",
        body: "Audit Programs represent a named audit engagement. Key fields:\n• Lead — assigned auditor\n• startDate / endDate — audit window\n• currentPhase — Planning | Fieldwork | Reporting | Closed\n• phaseProgress — 0–100%\n• framework — mapped compliance standard\n• scope — assets/systems in scope",
      },
      {
        heading: "Audit Findings",
        body: "Findings are logged against an audit program. Severity levels: Critical, High, Medium, Low, Informational.\n\nEach finding includes: title, description, affected asset, recommended remediation, target closure date, and status (Open / In Progress / Closed).",
      },
      {
        heading: "Evidence",
        body: "Evidence items are attached to findings or programs. They link to Evidence Engine runs for automated collection. Manual evidence can be uploaded as files or URLs.",
      },
    ],
  },
  {
    id: "compliance-module",
    icon: "✅",
    title: "Compliance Module",
    content: [
      {
        heading: "Frameworks",
        body: "The platform supports 15+ compliance frameworks: ISO 27001, SOC 2, NIST CSF, PCI DSS, GDPR, HIPAA, COBIT 2019, NIST SP 800-53, CIS Controls, ISO 27701, ISO 42001, EU AI Act, CMMC 2.0, FedRAMP, and DORA.\n\nEach framework has a maturity score (0–100) and gap count.",
      },
      {
        heading: "Maturity Assessment",
        body: "Maturity is calculated by aggregating control scores across five levels: Initial (1), Repeatable (2), Defined (3), Managed (4), Optimised (5).\n\nNavigate to Compliance → Maturity to view overall and per-domain scores.",
      },
      {
        heading: "Gap Analysis",
        body: "Gaps represent controls that are Not Met or Partially Met. Each gap includes: control ID, description, current state, target state, priority, and recommended action.\n\nExport gaps as CSV for remediation project planning.",
      },
      {
        heading: "Compliance Packs",
        body: "Compliance Packs bundle framework requirements, controls, evidence templates, and gap reports into a single exportable package for audit submissions.",
      },
    ],
  },
  {
    id: "evidence-engine",
    icon: "⚡",
    title: "Evidence Engine",
    content: [
      {
        heading: "How It Works",
        body: "The Evidence Engine automates evidence collection from connected integrations. A run is triggered manually or on a schedule. Each run:\n1. Queries all configured integrations (AWS, Azure, CrowdStrike, etc.)\n2. Collects artefacts matching control evidence requirements\n3. Stores results in evidence_engine_runs table\n4. Links collected items to the relevant controls/findings",
      },
      {
        heading: "Integrations",
        body: "Evidence sources are configured under Settings → Integrations. Each connector (e.g., AWS Config, CrowdStrike Falcon, Microsoft 365) has a set of supported evidence types.\n\nLIVE adapters are marked with a purple LIVE badge in the marketplace.",
      },
      {
        heading: "Run Status",
        body: "Run statuses: Running | Completed | Partial | Failed.\n\nA Partial status means some integrations returned data and some did not. Check the run detail view for per-integration status.",
      },
    ],
  },
  {
    id: "questionnaires",
    icon: "📝",
    title: "Questionnaires",
    content: [
      {
        heading: "Vendor Assessments",
        body: "Send security questionnaires to third-party vendors to assess their GRC posture. Each questionnaire has: type (Vendor / Internal / Compliance / Risk), status (Draft / Sent / Completed / Overdue), and a scoring mechanism.",
      },
      {
        heading: "Creating a Questionnaire",
        body: "1. Navigate to Questionnaires → + New\n2. Select type and framework mapping\n3. Add questions (or import from template)\n4. Assign to a vendor or internal team\n5. Set due date and submit\n\nResponses are scored automatically. Below-threshold vendors are flagged for follow-up.",
      },
      {
        heading: "Scoring",
        body: "Questionnaire score = (answered_yes / total_questions) × 100. Scores below 60 are flagged as High Risk. Scores 60–79 are Medium Risk. 80+ are Low Risk.",
      },
    ],
  },
  {
    id: "agents",
    icon: "⬡",
    title: "Agent Management",
    content: [
      {
        heading: "What Are Agents?",
        body: "GRC Agents are lightweight collectors deployed on endpoints, servers, and cloud workloads. They stream telemetry (asset inventory, vulnerability data, configuration state) to the platform in real time.",
      },
      {
        heading: "Deploying an Agent",
        body: "1. Navigate to Settings → Agents → Download\n2. Select OS: Windows / Linux / macOS / Mobile / Cloud\n3. Download the installer package\n4. Run with your organisation's registration token\n5. Agent appears in the Agents → Policy list within 60 seconds",
      },
      {
        heading: "Agent Policy",
        body: "Agent policy controls:\n• Scan schedule (cron expression)\n• Reporting interval (default: 300s)\n• Data types collected (assets, vulnerabilities, events)\n• Max CPU % (default: 15%)\n\nPolicies are pushed to agents automatically within one reporting interval.",
      },
      {
        heading: "Agent Status",
        body: "• Online (green) — heartbeat received within 2× reporting interval\n• Warning (amber) — heartbeat delayed; partial data\n• Offline (red) — no heartbeat in 10+ minutes\n• Stale (red) — agent version outdated by 2+ major versions",
      },
    ],
  },
  {
    id: "integrations",
    icon: "⇌",
    title: "Integrations Hub",
    content: [
      {
        heading: "Connecting an Integration",
        body: "1. Navigate to Settings → Integrations → Marketplace\n2. Find the connector (search by name or category)\n3. Click + Connect\n4. Enter API credentials (API key, OAuth token, etc.)\n5. Test connection — should show CONNECTED status\n6. Map to GRC modules (Risk, Evidence, Compliance)",
      },
      {
        heading: "Webhook Management",
        body: "Inbound webhooks: receive events from external systems (PagerDuty alerts, GitHub PRs, Jira tickets).\nOutbound webhooks: push GRC events (new findings, policy approvals) to Slack, Teams, PagerDuty, etc.\n\nEach webhook has a signing secret for payload verification.",
      },
      {
        heading: "Pipeline Monitoring",
        body: "The Pipeline tab shows per-connector ingestion volume, p50/p95 latency, and error rates. Use this to identify connectors with degraded performance.",
      },
    ],
  },
];

// ── SOP data ─────────────────────────────────────────────────────────────────
const SOPS = [
  {
    id: "SOP-001",
    title: "Onboarding a New User",
    category: "User Management",
    icon: "👤",
    lastUpdated: "June 15, 2026",
    owner: "IT Admin",
    frequency: "As needed",
    steps: [
      { step: 1, title: "Verify Access Request", detail: "Confirm the access request has been approved by the requestor's manager. Check the approval email or IT ticketing system (e.g., Jira Service Desk SOP-007)." },
      { step: 2, title: "Create User Account", detail: "Navigate to Settings → User Management → Users → + Invite User. Enter full name, corporate email, department, and location." },
      { step: 3, title: "Assign Role", detail: "Assign the minimum required role based on job function:\n• Risk Analyst → Risk Analyst role\n• Compliance team → Compliance Auditor role\n• IT Admin → GRC Manager role\n• Security lead → CISO role\nAvoid Super Admin unless explicitly approved by CISO." },
      { step: 4, title: "Add to User Group", detail: "Add the user to their department's User Group (Settings → User Groups). This applies module-level notification routing and bulk policy assignment." },
      { step: 5, title: "MFA Enrolment", detail: "Send the MFA enrolment link via email. Confirm the user has completed MFA setup before marking onboarding complete. Users without MFA cannot access Audit or Compliance modules." },
      { step: 6, title: "Policy Acknowledgement", detail: "Assign the new hire policy pack (Acceptable Use, BYOD if applicable, Data Classification). User must acknowledge within 5 business days." },
      { step: 7, title: "Confirm & Close", detail: "Verify user appears in the Users list with status ACTIVE and MFA badge. Close the onboarding ticket in the service desk." },
    ],
  },
  {
    id: "SOP-002",
    title: "Risk Identification & Registration",
    category: "Risk Management",
    icon: "🎯",
    lastUpdated: "June 15, 2026",
    owner: "Risk Analyst",
    frequency: "Ongoing / Quarterly full review",
    steps: [
      { step: 1, title: "Identify the Risk", detail: "Risk identification can be triggered by: a security incident, threat intelligence feed, vendor notification, audit finding, or periodic review. Document the risk source and date identified." },
      { step: 2, title: "Select Framework Template", detail: "Navigate to Risk Register → 📋 Templates. Select the applicable framework template (e.g., ISO 27001 for information security risks, GDPR for privacy risks). Activate it to pre-populate risk categories." },
      { step: 3, title: "Create Risk Record", detail: "Click + New Risk. Populate:\n• Title — concise risk statement\n• Category — from active template categories\n• Likelihood (1–5) and Impact (1–5)\n• Risk Owner — responsible individual\n• Framework Mapping — link to relevant control IDs" },
      { step: 4, title: "Score & Classify", detail: "Risk Score = Likelihood × Impact × 4. Platform calculates automatically. Verify colour classification:\n• 80–100 → Critical (escalate to CISO within 24h)\n• 60–79 → High (risk committee review within 1 week)\n• 40–59 → Medium (treatment plan within 30 days)\n• 0–39 → Low (accept or monitor)" },
      { step: 5, title: "Check Risk Appetite", detail: "Compare score against configured appetite thresholds (Risk → Appetite tab). If score exceeds appetite for that category, a treatment is mandatory." },
      { step: 6, title: "Assign Treatment Strategy", detail: "Select treatment type:\n• Mitigate — implement a control to reduce score\n• Accept — document acceptance with sign-off\n• Transfer — insurance or contractual transfer\n• Avoid — eliminate the activity causing the risk\nCreate a Treatment record under Risk → Treatments." },
      { step: 7, title: "Review & Approve", detail: "Risk records require approval from the Risk Owner and CISO (or delegate) before status changes to Accepted/Treated. Log review notes in the risk record's comment thread." },
    ],
  },
  {
    id: "SOP-003",
    title: "Audit Program Execution",
    category: "Audit",
    icon: "🔍",
    lastUpdated: "June 15, 2026",
    owner: "Compliance Auditor",
    frequency: "Per audit schedule (typically quarterly or annually)",
    steps: [
      { step: 1, title: "Create Audit Program", detail: "Navigate to Audit → Plans → + New Program. Set:\n• Name (e.g., 'ISO 27001 Internal Audit Q2 2026')\n• Framework mapping\n• Lead auditor\n• Start and end dates\n• Scope (systems/assets in scope)" },
      { step: 2, title: "Planning Phase", detail: "currentPhase = Planning. Prepare the audit plan document, confirm stakeholder availability, and define the test procedures. Update phaseProgress to 100% when planning is complete." },
      { step: 3, title: "Fieldwork Phase", detail: "currentPhase = Fieldwork. Execute audit tests:\n1. Run Evidence Engine to auto-collect configuration evidence\n2. Conduct interviews with process owners\n3. Review policy documentation currency\n4. Perform technical spot-checks\nLog findings as you go (Audit → Findings → + New Finding)." },
      { step: 4, title: "Logging Findings", detail: "For each finding:\n• Assign severity: Critical / High / Medium / Low / Informational\n• Describe the observation and gap\n• Reference the control ID\n• Assign a remediation owner\n• Set target closure date (14 days for Critical, 30 for High, 60 for Medium)" },
      { step: 5, title: "Reporting Phase", detail: "currentPhase = Reporting. Compile the audit report:\n1. Export findings as CSV from Audit → Findings\n2. Summarise findings by severity and control domain\n3. Include management responses from remediation owners\n4. Issue draft report for management review (5-day response window)" },
      { step: 6, title: "Close Program", detail: "currentPhase = Closed. Set all findings to In Progress or Closed. Mark the program Closed. Schedule follow-up review for Critical/High findings at 30 days post-close." },
    ],
  },
  {
    id: "SOP-004",
    title: "Evidence Collection for Compliance",
    category: "Evidence Engine",
    icon: "⚡",
    lastUpdated: "June 15, 2026",
    owner: "GRC Manager",
    frequency: "Monthly automated / On-demand for audits",
    steps: [
      { step: 1, title: "Verify Integration Connectivity", detail: "Navigate to Settings → Integrations → Connected. Confirm all required evidence sources show CONNECTED status. Common sources: AWS Config, CrowdStrike Falcon, Microsoft 365, Okta, Qualys.\n\nFor any WARNING status, reauthorise the connector before running." },
      { step: 2, title: "Trigger Evidence Run", detail: "Navigate to Evidence Engine → + New Run. Select:\n• Run scope: Full (all controls) or Targeted (specific framework)\n• Date range for evidence\n• Associated audit program (optional)\nClick Launch Run." },
      { step: 3, title: "Monitor Run Progress", detail: "Run status transitions: Running → Completed / Partial / Failed.\nA Partial result means at least one integration returned data. Review the per-integration breakdown in the run detail view." },
      { step: 4, title: "Review Collected Evidence", detail: "For each collected artefact:\n• Verify it maps to the correct control\n• Check timestamp is within the audit evidence window\n• Flag any stale evidence (>90 days) for manual refresh" },
      { step: 5, title: "Attach to Audit/Finding", detail: "From the run result, select evidence items and attach to:\n• An audit program (bulk attachment)\n• Specific audit findings\n• Compliance framework controls\nUse the 'Attach to Finding' action in the evidence item row." },
      { step: 6, title: "Manual Evidence Upload", detail: "For evidence not collectable via integrations (signed forms, meeting minutes, screenshots):\n1. Navigate to the finding or control\n2. Click + Evidence → Upload File\n3. Add source description and date\n4. Mark as manually collected" },
    ],
  },
  {
    id: "SOP-005",
    title: "Vendor Risk Assessment (TPRM)",
    category: "Risk Management",
    icon: "🏭",
    lastUpdated: "June 15, 2026",
    owner: "Risk Analyst",
    frequency: "Annually / Before new vendor onboarding",
    steps: [
      { step: 1, title: "Initiate Vendor Assessment", detail: "When onboarding a new vendor or at annual review, navigate to Risk → Vendors → + New Vendor. Enter vendor name, category, tier (Critical / High / Medium / Low), and primary contact." },
      { step: 2, title: "Send Security Questionnaire", detail: "Navigate to Questionnaires → + New. Select type = Vendor. Link to the vendor record. Choose questionnaire template (SIG Lite for Tier 2–3, Full SIG for Tier 1).\nSet due date (30 days for Tier 1, 45 days for Tier 2–3)." },
      { step: 3, title: "Review Questionnaire Responses", detail: "Once the vendor submits, review score:\n• 80+ (Low Risk) — approve, schedule annual review\n• 60–79 (Medium Risk) — request remediation plan, re-assess in 6 months\n• <60 (High Risk) — escalate to CISO; may block onboarding" },
      { step: 4, title: "Review Vendor Contracts & Certifications", detail: "Request and verify:\n• SOC 2 Type II report (within last 12 months)\n• ISO 27001 certificate (current)\n• Penetration test summary (within last 12 months)\n• Data Processing Agreement (DPA) for GDPR-relevant vendors" },
      { step: 5, title: "Document Risk & Treatment", detail: "Create a Risk record under Risk Register linking to the vendor. If residual risk is High or Critical:\n• Document a Transfer treatment (contractual) or Mitigate treatment\n• Require vendor to provide evidence of remediation before go-live" },
      { step: 6, title: "Ongoing Monitoring", detail: "Set automated re-assessment cadence in the vendor record:\n• Critical vendors: quarterly questionnaire, annual full review\n• High vendors: bi-annual questionnaire\n• Medium/Low: annual questionnaire\nConfigure risk change alerts via Settings → Notifications." },
    ],
  },
  {
    id: "SOP-006",
    title: "Policy Review & Approval Cycle",
    category: "Governance",
    icon: "📋",
    lastUpdated: "June 15, 2026",
    owner: "GRC Manager",
    frequency: "Annually per policy / On trigger event",
    steps: [
      { step: 1, title: "Identify Policies Due for Review", detail: "Navigate to Governance → Policies. Filter by status = Active and sort by lastReviewed ascending. Policies not reviewed in 12+ months are overdue.\n\nReview is also triggered by: regulatory change, security incident, or major organisational change." },
      { step: 2, title: "Assign Review Owner", detail: "Assign the policy to its documented owner for review. If the owner has changed, update the policy record and notify the new owner." },
      { step: 3, title: "Draft Updates", detail: "Policy owner updates the document in the policy record's Content tab. All changes are tracked in the History tab with diff view. Bump the version number following semver convention (minor version for content changes, major for scope changes)." },
      { step: 4, title: "Stakeholder Review", detail: "Set policy status to In Review. Add reviewers from the relevant department heads. Each reviewer must approve or comment within the review window (default 5 business days)." },
      { step: 5, title: "CISO Approval", detail: "After all stakeholder approvals, route to CISO for final sign-off. CISO approval changes status to Approved." },
      { step: 6, title: "Publish & Distribute", detail: "Change status to Published. The policy is automatically distributed to:\n• All users assigned to the policy's user groups\n• Email notification with acknowledgement link\n• Slack #policy-updates channel (if webhook configured)\nUsers must acknowledge within 10 business days." },
      { step: 7, title: "Track Acknowledgements", detail: "Monitor acknowledgement rate in the policy record's Reviews tab. Chase users below 100% at 5 days, 3 days, and 1 day before deadline. Escalate non-acknowledgers to their manager." },
    ],
  },
  {
    id: "SOP-007",
    title: "DSAR Processing (Privacy)",
    category: "Privacy",
    icon: "🔐",
    lastUpdated: "June 15, 2026",
    owner: "Privacy Officer",
    frequency: "As received (GDPR: respond within 30 days)",
    steps: [
      { step: 1, title: "Receive & Log the DSAR", detail: "When a Data Subject Access Request is received (via email, web form, or post), log it in Privacy → DSARs → + New Request. Record:\n• Requestor name and contact details\n• Date received (SLA clock starts)\n• Type: Access / Rectification / Erasure / Portability / Restriction\n• Verification status (ID not yet verified)" },
      { step: 2, title: "Verify Identity", detail: "Request government-issued ID from the data subject if they are not a known authenticated user. Do not process until identity is verified. Verification must be completed within 5 business days to preserve SLA." },
      { step: 3, title: "Scope the Data Search", detail: "Search all data stores for records matching the subject:\n• PostgreSQL databases\n• File storage\n• Email archive\n• Third-party processors (notify them via DPA clause)\n\nDocument all data found and its location." },
      { step: 4, title: "Process the Request", detail: "Based on request type:\n• Access — compile data export, redact third-party data\n• Erasure — delete from all systems; verify deletion with processors\n• Rectification — update incorrect data; notify downstream systems\n• Portability — export in machine-readable format (CSV/JSON)\n• Restriction — flag records with processing restriction marker" },
      { step: 5, title: "Legal Review", detail: "If there are grounds to refuse (legitimate interest, legal obligation, public interest), route to Legal for review before responding. Document the legal basis for refusal." },
      { step: 6, title: "Respond to Data Subject", detail: "Send response within 30 calendar days of receipt (Day 0 = date received). Response must include:\n• Confirmation of action taken\n• Data package (for Access/Portability)\n• Explanation if any data was withheld\n• Right to complain to supervisory authority (ICO/DPA)" },
      { step: 7, title: "Close & Record", detail: "Mark DSAR status Closed in Privacy → DSARs. Record:\n• Date completed\n• Days taken (must be ≤30, or ≤90 with extension notice)\n• Data categories processed\n• Any processors notified\nRetain DSAR log for 3 years for regulatory demonstration." },
    ],
  },
  {
    id: "SOP-008",
    title: "Compliance Framework Onboarding",
    category: "Compliance",
    icon: "✅",
    lastUpdated: "June 15, 2026",
    owner: "Compliance Auditor",
    frequency: "When adopting a new framework",
    steps: [
      { step: 1, title: "Select Framework", detail: "Navigate to Compliance → Frameworks. Browse the 15+ available frameworks. Click the target framework to review its control domains and current gap count." },
      { step: 2, title: "Scope Assessment", detail: "Define what is in scope for this framework:\n• Systems and assets (from Settings → Assets)\n• Business processes\n• Locations / geographies\nDocument scoping decisions in a Scope Statement policy (create under Governance → Policies)." },
      { step: 3, title: "Baseline Gap Analysis", detail: "Navigate to Compliance → Gaps. Filter by the new framework. Review all Not Met and Partially Met controls. Export the gap list as CSV for a remediation project." },
      { step: 4, title: "Assign Control Owners", detail: "For each in-scope control, assign an owner responsible for evidence and remediation. Use the Controls Library (Governance → Controls → Applicable tab) to record assignments." },
      { step: 5, title: "Evidence Mapping", detail: "For each control, identify the evidence type required (configuration data, policy document, training record, audit log). Map to an Evidence Engine integration where possible to automate collection." },
      { step: 6, title: "Remediation Planning", detail: "Create Risk records for each significant gap. Assign treatments with target dates. A typical roadmap: P1 gaps (Critical controls) closed within 60 days, P2 (High) within 90 days, P3 within 180 days." },
      { step: 7, title: "Maturity Tracking", detail: "Re-run the maturity assessment monthly. Navigate to Compliance → Maturity. Track score improvement per domain. Target maturity level 3 (Defined) before any external audit, level 4 (Managed) for certification." },
    ],
  },
  {
    id: "SOP-009",
    title: "Security Incident → GRC Escalation",
    category: "Risk Management",
    icon: "🚨",
    lastUpdated: "June 15, 2026",
    owner: "CISO / SecOps Lead",
    frequency: "On security incident",
    steps: [
      { step: 1, title: "Incident Confirmed by SecOps", detail: "SecOps confirms an incident has met the severity threshold requiring GRC involvement (typically Severity 1 or 2). They notify the GRC Manager via the agreed channel (PagerDuty / Slack #incident-response)." },
      { step: 2, title: "Create Risk Record", detail: "GRC Manager creates a new Risk record in the Risk Register:\n• Title: [INCIDENT] <brief description>\n• Category: Security Incident\n• Likelihood: 5 (confirmed event)\n• Impact: assessed from incident severity\n• Owner: Incident Commander" },
      { step: 3, title: "Assess Compliance Impact", detail: "For each active framework in scope, assess whether the incident triggers a notification obligation:\n• GDPR/CCPA: personal data breach → regulator notification within 72 hours\n• HIPAA: PHI breach → HHS notification within 60 days\n• PCI DSS: card data compromise → immediate acquirer notification\n• DORA: ICT-related incident → regulator notification within 4 hours" },
      { step: 4, title: "Activate DSAR Triage", detail: "If personal data is involved, create a DSAR-equivalent record under Privacy → Data Breaches. This triggers the breach notification workflow (SOP-007 adapted for breaches)." },
      { step: 5, title: "Evidence Capture", detail: "Trigger an immediate Evidence Engine run scoped to affected systems. This captures pre-remediation configuration state, which may be required for regulatory investigations." },
      { step: 6, title: "Create Audit Finding", detail: "Once the incident is contained, log an Audit Finding against the relevant audit program (or create a new ad-hoc program). Severity = incident severity. Owner = Incident Commander." },
      { step: 7, title: "Post-Incident Review", detail: "Within 5 business days of closure:\n• Update the Risk record with final impact assessment\n• Document root cause and lessons learned\n• Create/update controls to prevent recurrence\n• Update Risk Appetite thresholds if breach indicates appetite miscalibration" },
    ],
  },
  {
    id: "SOP-010",
    title: "Integration Connector Troubleshooting",
    category: "Integrations",
    icon: "⇌",
    lastUpdated: "June 15, 2026",
    owner: "IT Admin",
    frequency: "On connector degradation alert",
    steps: [
      { step: 1, title: "Identify Degraded Connector", detail: "Navigate to Settings → Integrations → Connected. Connectors with WARNING or ERROR status are listed with status badges. Check the Pipeline tab for error rate and latency spikes." },
      { step: 2, title: "Check Delivery Logs", detail: "Navigate to Settings → Integrations → Pipeline → [connector] → Error Log. Review the last 10 failed deliveries. Note the error code and message." },
      { step: 3, title: "Common Error Codes", detail: "401 / 403 — API credential expired. Reauthorise the connector (+ Connect → re-enter credentials).\n429 — Rate limit exceeded. Reduce polling frequency in connector settings.\n500 / 503 — Source system outage. Check vendor status page.\n408 / Timeout — Network issue. Verify IP allowlist if the source is behind a firewall." },
      { step: 4, title: "Reauthorise Connector", detail: "If credentials have expired:\n1. Obtain new API token/key from the source system\n2. Navigate to Settings → Integrations → Connected → [connector] → Edit\n3. Replace the expired credential\n4. Click Test Connection — should return CONNECTED\n5. Trigger a manual sync to backfill missed data" },
      { step: 5, title: "Escalate if Unresolved", detail: "If the connector remains in ERROR after reauthorisation:\n1. Raise a support ticket with the connector vendor\n2. Note the impact on evidence collection coverage\n3. Document manual evidence collection workaround for affected controls\n4. Update the Evidence Engine run to mark affected artefacts as manually collected" },
    ],
  },
  {
    id: "SOP-011",
    title: "Periodic GRC Platform Health Check",
    category: "Administration",
    icon: "🩺",
    lastUpdated: "June 15, 2026",
    owner: "GRC Manager",
    frequency: "Monthly",
    steps: [
      { step: 1, title: "Check API Server Health", detail: "Verify both workflows are running (API Server + Frontend). Check API Server logs for any ERROR-level messages. Verify all 17 GRC API endpoints return 200:\n/api/risks, /api/risks/appetite, /api/risks/cascades, /api/risks/treatments, /api/risks/vendors, /api/risks/heatmap, /api/governance/policies, /api/governance/processes, /api/governance/procedures, /api/audit/plans, /api/audit/findings, /api/audit/evidence, /api/audit/summary, /api/evidence-engine/runs, /api/evidence-engine/integrations, /api/questionnaires, /api/compliance/maturity, /api/compliance/gaps." },
      { step: 2, title: "Review Agent Connectivity", detail: "Navigate to Settings → Agents → Policy. Count agents in each status:\n• All Online: ✅ healthy\n• Any Offline: investigate within 2h\n• Any Stale: schedule agent update\n\nAgent update package is available under Settings → Agents → Download." },
      { step: 3, title: "Review Integration Pipeline", detail: "Navigate to Settings → Integrations → Pipeline. For each active connector, verify:\n• Error rate < 1%\n• Latency p95 < 5,000ms\n• Volume trending normally (not suddenly zero)" },
      { step: 4, title: "Review Open Critical/High Risks", detail: "Navigate to Risk Register. Filter by score ≥ 60. Verify all High/Critical risks have:\n• A treatment record assigned\n• An owner\n• A target date within policy\n\nEscalate any risks with no treatment or overdue target dates." },
      { step: 5, title: "Review Overdue Audit Findings", detail: "Navigate to Audit → Findings. Filter by status = Open and targetDate < today. Each overdue Critical/High finding must have a documented extension justification or immediate closure plan." },
      { step: 6, title: "Review Compliance Maturity Trend", detail: "Navigate to Compliance → Maturity. Export current scores. Compare to last month. Any domain with a score decrease of >5 points requires investigation and a remediation note." },
      { step: 7, title: "Log Health Check Result", detail: "Create an Audit Finding of severity Informational against the monthly admin audit program with the outcome of this check. This creates a paper trail demonstrating ongoing platform governance." },
    ],
  },
  {
    id: "SOP-012",
    title: "New Framework Certification Preparation",
    category: "Compliance",
    icon: "🏆",
    lastUpdated: "June 15, 2026",
    owner: "Compliance Auditor",
    frequency: "Before external certification audit",
    steps: [
      { step: 1, title: "T-90 Days: Gap Baseline", detail: "Run SOP-008 (Framework Onboarding) to establish baseline gap count. Export the gap report as CSV. Assign all gaps to owners with 60-day remediation target." },
      { step: 2, title: "T-60 Days: Remediation Sprint", detail: "Weekly check-in with control owners on remediation progress. Critical gaps (blocking controls) must be resolved by T-45. Use Risk Register to track each gap as a risk treatment." },
      { step: 3, title: "T-45 Days: Internal Pre-Audit", detail: "Run SOP-003 (Audit Program Execution) as an internal pre-audit. Scope mirrors the planned external audit. Log all findings. Aim to close Critical and High findings before T-30." },
      { step: 4, title: "T-30 Days: Evidence Package", detail: "Trigger a full Evidence Engine run. Compile the evidence package:\n• One evidence item per in-scope control\n• Policy documents (current, approved versions)\n• Training completion records\n• Penetration test report (within 12 months)\nExport as a Compliance Pack (Compliance → Packs → + New Pack)." },
      { step: 5, title: "T-14 Days: Auditor Readiness Call", detail: "Schedule a readiness call with the certification body. Share the scope statement, control list, and any residual gaps with accepted risk documentation." },
      { step: 6, title: "During Audit: Evidence Requests", detail: "For each auditor evidence request:\n1. Retrieve from Evidence Engine or manual evidence store\n2. Verify timestamp is within the evidence window\n3. Deliver via the auditor's secure file transfer method\n4. Log each request in the audit program's finding list for traceability" },
      { step: 7, title: "Post-Audit: Close Observations", detail: "For any audit observations (minor non-conformances):\n• Create Risk records linked to each observation\n• Assign treatments with 30-day closure target\n• Submit Corrective Action Reports (CARs) to the certification body within the agreed timeline (typically 30–90 days)" },
    ],
  },
];

// ── Sub-components ────────────────────────────────────────────────────────────
function VersionBadge({ type }: { type: string }) {
  const color = type === "major" ? BLU : type === "minor" ? EME : AMB;
  const bg = type === "major" ? "rgba(29,78,216,0.1)" : type === "minor" ? "rgba(6,95,70,0.08)" : "rgba(217,119,6,0.1)";
  const border = type === "major" ? "#BFDBFE" : type === "minor" ? "#A7F3D0" : "#FDE68A";
  return (
    <span style={{ fontSize: 9, fontWeight: 800, color, background: bg, border: `1px solid ${border}`, borderRadius: 4, padding: "2px 7px", letterSpacing: "0.3px" }}>
      {type.toUpperCase()}
    </span>
  );
}

function CategoryBadge({ cat }: { cat: string }) {
  const colors: Record<string, { c: string; bg: string; bd: string }> = {
    "Risk Management": { c: RED, bg: "rgba(220,38,38,0.07)", bd: "#FECACA" },
    "Governance":      { c: PRP, bg: "rgba(124,58,237,0.07)", bd: "#DDD6FE" },
    "Compliance":      { c: EME, bg: "rgba(6,95,70,0.07)",  bd: "#A7F3D0" },
    "Audit":           { c: BLU, bg: "rgba(29,78,216,0.07)", bd: "#BFDBFE" },
    "Evidence Engine": { c: AMB, bg: "rgba(217,119,6,0.07)", bd: "#FDE68A" },
    "Integrations":    { c: CYN, bg: "rgba(8,145,178,0.07)", bd: "#A5F3FC" },
    "Privacy":         { c: "#8B5CF6", bg: "rgba(139,92,246,0.07)", bd: "#DDD6FE" },
    "User Management": { c: NAV, bg: "rgba(30,58,95,0.07)", bd: "#BFDBFE" },
    "Administration":  { c: "#6B7280", bg: "rgba(107,114,128,0.07)", bd: "#E5E7EB" },
  };
  const s = colors[cat] ?? { c: NAV, bg: "rgba(30,58,95,0.07)", bd: "#BFDBFE" };
  return (
    <span style={{ fontSize: 9, fontWeight: 700, color: s.c, background: s.bg, border: `1px solid ${s.bd}`, borderRadius: 4, padding: "2px 7px", whiteSpace: "nowrap" }}>
      {cat}
    </span>
  );
}

// ── Release Notes Tab ─────────────────────────────────────────────────────────
function ReleaseNotesTab() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const filtered = useMemo(() =>
    RELEASE_NOTES.filter(r =>
      (typeFilter === "all" || r.type === typeFilter) &&
      (!search || r.title.toLowerCase().includes(search.toLowerCase()) || r.version.includes(search))
    ), [search, typeFilter]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header strip */}
      <div style={card({ padding: "16px 20px", background: "linear-gradient(135deg,#EFF6FF,#F0FDF4)" })}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: NAV, marginBottom: 3 }}>📦 Release Notes</div>
            <div style={{ fontSize: 11, color: "#6B7280" }}>Full changelog for AIGO-X GRC Platform · Latest: v{RELEASE_NOTES[0].version} · {RELEASE_NOTES[0].date}</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search releases…"
              style={{ background: "white", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 12px", fontSize: 11, color: NAV, outline: "none", fontFamily: "inherit", width: 180 }}
            />
            {(["all", "major", "minor", "patch"] as const).map(t => (
              <button key={t} onClick={() => setTypeFilter(t)} style={{
                padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: "inherit",
                fontSize: 10, fontWeight: 700, transition: "all 0.15s",
                background: typeFilter === t ? NAV : "white",
                color: typeFilter === t ? "white" : "#6B7280",
              }}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Release cards */}
      {filtered.map(r => (
        <div key={r.version} style={card({ padding: "20px 24px" })}>
          {/* Version header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 20, fontWeight: 900, fontFamily: "'JetBrains Mono',monospace", color: NAV }}>v{r.version}</span>
              <VersionBadge type={r.type} />
            </div>
            <span style={{ fontSize: 11, color: "#9CA3AF", fontStyle: "italic" }}>{r.date}</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color: NAV, marginBottom: 6 }}>{r.title}</div>
          <div style={{ fontSize: 12, color: "#4B5563", lineHeight: 1.5, marginBottom: 16 }}>{r.summary}</div>

          <div style={{ display: "grid", gridTemplateColumns: r.changes.new.length && r.changes.improved.length && r.changes.fixed.length ? "1fr 1fr 1fr" : r.changes.new.length && (r.changes.improved.length || r.changes.fixed.length) ? "1fr 1fr" : "1fr", gap: 12 }}>
            {r.changes.new.length > 0 && (
              <div style={{ background: "rgba(6,95,70,0.04)", border: "1px solid #A7F3D0", borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: EME, letterSpacing: "0.6px", marginBottom: 8 }}>✦ NEW</div>
                {r.changes.new.map((c, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 5 }}>
                    <span style={{ color: EME, fontWeight: 700, fontSize: 11, flexShrink: 0, marginTop: 1 }}>+</span>
                    <span style={{ fontSize: 11, color: "#374151", lineHeight: 1.4 }}>{c}</span>
                  </div>
                ))}
              </div>
            )}
            {r.changes.improved.length > 0 && (
              <div style={{ background: "rgba(29,78,216,0.04)", border: "1px solid #BFDBFE", borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: BLU, letterSpacing: "0.6px", marginBottom: 8 }}>↑ IMPROVED</div>
                {r.changes.improved.map((c, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 5 }}>
                    <span style={{ color: BLU, fontWeight: 700, fontSize: 11, flexShrink: 0, marginTop: 1 }}>~</span>
                    <span style={{ fontSize: 11, color: "#374151", lineHeight: 1.4 }}>{c}</span>
                  </div>
                ))}
              </div>
            )}
            {r.changes.fixed.length > 0 && (
              <div style={{ background: "rgba(220,38,38,0.04)", border: "1px solid #FECACA", borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: RED, letterSpacing: "0.6px", marginBottom: 8 }}>✓ FIXED</div>
                {r.changes.fixed.map((c, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 5 }}>
                    <span style={{ color: RED, fontWeight: 700, fontSize: 11, flexShrink: 0, marginTop: 1 }}>✕</span>
                    <span style={{ fontSize: 11, color: "#374151", lineHeight: 1.4 }}>{c}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#9CA3AF", fontSize: 12 }}>No releases match your search.</div>
      )}
    </div>
  );
}

// ── Admin Guide Tab ───────────────────────────────────────────────────────────
function AdminGuideTab() {
  const [activeSection, setActiveSection] = useState("overview");
  const [search, setSearch] = useState("");

  const current = ADMIN_GUIDE_SECTIONS.find(s => s.id === activeSection) ?? ADMIN_GUIDE_SECTIONS[0];
  const filteredSections = useMemo(() =>
    ADMIN_GUIDE_SECTIONS.filter(s =>
      !search ||
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.content.some(c => c.heading.toLowerCase().includes(search.toLowerCase()) || c.body.toLowerCase().includes(search.toLowerCase()))
    ), [search]);

  return (
    <div style={{ display: "flex", gap: 16 }}>
      {/* Left nav */}
      <div style={{ width: 220, flexShrink: 0 }}>
        <div style={card({ padding: "14px 16px" })}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#9CA3AF", letterSpacing: "0.6px", marginBottom: 10 }}>ADMIN GUIDE</div>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search guide…"
            style={{ width: "100%", background: "var(--input)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px", fontSize: 10, color: NAV, outline: "none", fontFamily: "inherit", boxSizing: "border-box", marginBottom: 10 }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {filteredSections.map(s => (
              <button key={s.id} onClick={() => setActiveSection(s.id)} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 6, border: "none", cursor: "pointer",
                fontFamily: "inherit", fontSize: 11, fontWeight: 600, textAlign: "left",
                background: activeSection === s.id ? "rgba(59,130,246,0.1)" : "transparent",
                color: activeSection === s.id ? BLU : "#4B5563",
              }}>
                <span style={{ fontSize: 14 }}>{s.icon}</span>
                <span>{s.title}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={card({ padding: "20px 24px", background: "linear-gradient(135deg,#EFF6FF,#F0FDF4)" })}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 24 }}>{current.icon}</span>
            <div style={{ fontSize: 18, fontWeight: 800, color: NAV }}>{current.title}</div>
          </div>
          <div style={{ fontSize: 11, color: "#6B7280" }}>AIGO-X GRC Platform · Admin Reference · v1.4</div>
        </div>

        {current.content.map((section, i) => (
          <div key={i} style={card({ padding: "18px 22px" })}>
            <div style={{ fontSize: 13, fontWeight: 800, color: NAV, marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>{section.heading}</div>
            <div style={{ fontSize: section.body.includes("\n  ") ? 11 : 12, color: "#374151", lineHeight: 1.7, whiteSpace: "pre-wrap", fontFamily: section.body.includes("\n  ") ? "'JetBrains Mono',monospace" : "inherit" }}>
              {section.body}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── SOPs Tab ──────────────────────────────────────────────────────────────────
function SOPsTab() {
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("All");

  const categories = ["All", ...Array.from(new Set(SOPS.map(s => s.category)))];
  const filtered = useMemo(() =>
    SOPS.filter(s =>
      (catFilter === "All" || s.category === catFilter) &&
      (!search || s.title.toLowerCase().includes(search.toLowerCase()) || s.id.toLowerCase().includes(search.toLowerCase()))
    ), [catFilter, search]);

  const activeSOP = SOPS.find(s => s.id === selected);

  if (activeSOP) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <button onClick={() => setSelected(null)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: NAV, fontFamily: "inherit", fontSize: 12, fontWeight: 700, padding: "4px 0", width: "fit-content" }}>
          ← Back to SOPs
        </button>

        <div style={card({ padding: "20px 24px", background: "linear-gradient(135deg,#EFF6FF,#F0FDF4)" })}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 700, color: "#9CA3AF" }}>{activeSOP.id}</span>
                <CategoryBadge cat={activeSOP.category} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <span style={{ fontSize: 22 }}>{activeSOP.icon}</span>
                <div style={{ fontSize: 18, fontWeight: 800, color: NAV }}>{activeSOP.title}</div>
              </div>
              <div style={{ display: "flex", gap: 16, fontSize: 11, color: "#6B7280", marginTop: 6 }}>
                <span>👤 Owner: <strong style={{ color: NAV }}>{activeSOP.owner}</strong></span>
                <span>🔄 Frequency: <strong style={{ color: NAV }}>{activeSOP.frequency}</strong></span>
                <span>📅 Updated: <strong style={{ color: NAV }}>{activeSOP.lastUpdated}</strong></span>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 32, fontWeight: 900, fontFamily: "'JetBrains Mono',monospace", color: NAV, lineHeight: 1 }}>{activeSOP.steps.length}</div>
              <div style={{ fontSize: 10, color: "#9CA3AF" }}>Steps</div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {activeSOP.steps.map((step, i) => (
            <div key={i} style={card({ padding: "16px 20px" })}>
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: NAV, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "white", fontSize: 12, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace" }}>
                  {step.step}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: NAV, marginBottom: 6 }}>{step.title}</div>
                  <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{step.detail}</div>
                </div>
              </div>
              {i < activeSOP.steps.length - 1 && (
                <div style={{ marginLeft: 22, marginTop: 10, width: 1, height: 0, borderLeft: "2px dashed #E5E7EB" }} />
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={card({ padding: "16px 20px", background: "linear-gradient(135deg,#EFF6FF,#F0FDF4)" })}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: NAV, marginBottom: 3 }}>📚 Standard Operating Procedures</div>
            <div style={{ fontSize: 11, color: "#6B7280" }}>{SOPS.length} SOPs covering all major GRC workflows · Always current</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search SOPs…"
              style={{ background: "white", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 12px", fontSize: 11, color: NAV, outline: "none", fontFamily: "inherit", width: 180 }}
            />
          </div>
        </div>
        {/* Category pills */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 12 }}>
          {categories.map(cat => (
            <button key={cat} onClick={() => setCatFilter(cat)} style={{
              padding: "4px 12px", borderRadius: 6, border: `1px solid ${catFilter === cat ? NAV : "var(--border)"}`, cursor: "pointer",
              fontFamily: "inherit", fontSize: 10, fontWeight: 700,
              background: catFilter === cat ? NAV : "white",
              color: catFilter === cat ? "white" : "#6B7280",
            }}>{cat}</button>
          ))}
        </div>
      </div>

      {/* SOP cards grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: 12 }}>
        {filtered.map(sop => (
          <div key={sop.id} onClick={() => setSelected(sop.id)}
            style={card({ padding: "16px 20px", cursor: "pointer", transition: "border-color 0.15s" })}
            onMouseEnter={e => (e.currentTarget.style.borderColor = NAV)}
            onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 20 }}>{sop.icon}</span>
                <div>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "#9CA3AF" }}>{sop.id}</span>
                  <div style={{ fontSize: 13, fontWeight: 800, color: NAV, lineHeight: 1.2, marginTop: 1 }}>{sop.title}</div>
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
                <div style={{ fontSize: 18, fontWeight: 900, fontFamily: "'JetBrains Mono',monospace", color: NAV }}>{sop.steps.length}</div>
                <div style={{ fontSize: 9, color: "#9CA3AF" }}>steps</div>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <CategoryBadge cat={sop.category} />
              <span style={{ fontSize: 10, color: "#9CA3AF" }}>{sop.owner} · {sop.frequency}</span>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "40px 20px", color: "#9CA3AF", fontSize: 12 }}>No SOPs match your search.</div>
        )}
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function SettingsDocumentation({ subTab }: { subTab: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {subTab === "release-notes" && <ReleaseNotesTab />}
      {subTab === "admin-guide"   && <AdminGuideTab />}
      {subTab === "sops"          && <SOPsTab />}
    </div>
  );
}
