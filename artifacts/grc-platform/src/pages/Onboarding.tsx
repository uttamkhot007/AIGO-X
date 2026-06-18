import { useState, useEffect, useCallback } from "react";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useLocation } from "wouter";

// ── Theme colors (CSS-variable driven) ─────────────────────────────────────
const NAV = "oklch(0.30 0.08 255)";
const EME = "oklch(0.42 0.15 162)";
const BG  = "var(--background)";
const RED = "#DC2626";

// ── Type helpers ────────────────────────────────────────────────────────────
type StageData = Record<string, unknown>;
type StageProps = { d: StageData; set: (k: string, v: unknown) => void };

function str(v: unknown): string  { return typeof v === "string" ? v : ""; }
function arr(v: unknown): string[] { return Array.isArray(v) ? (v as string[]) : []; }

// ── Stage metadata ─────────────────────────────────────────────────────────

const STAGES = [
  { n: 1,  icon: "🏢", title: "Organization Setup",
    sub: "Define your legal entity, sector, headcount, sites and key ISMS roles.",
    outputs: ["Organization profile", "User account stubs", "Initial role assignments"],
    modules: ["Dashboard", "Admin Portal"] },
  { n: 2,  icon: "🌐", title: "Context & Interested Parties",
    sub: "Identify products, customers, applicable regulations and supply-chain drivers.",
    outputs: ["Context document", "Interested parties register", "Compliance plan"],
    modules: ["ComplianceOps", "GovOps"] },
  { n: 3,  icon: "🗺", title: "Scope Definition",
    sub: "Set the geographic, process and technology boundaries of your ISMS.",
    outputs: ["Scope statement", "Scope diagram", "Boundary documentation"],
    modules: ["ComplianceOps", "Dashboard"] },
  { n: 4,  icon: "⚖️", title: "Risk Methodology & Criteria",
    sub: "Set your risk appetite, scoring scales, acceptance threshold and review cadence.",
    outputs: ["Risk methodology document", "Risk scoring matrix", "Criteria thresholds"],
    modules: ["RiskOps"] },
  { n: 5,  icon: "🗄", title: "Asset Inventory & Classification",
    sub: "List critical information assets, data types and your classification scheme.",
    outputs: ["Asset register", "Data classification policy", "Asset owner assignments"],
    modules: ["AssetOps", "DataOps"] },
  { n: 6,  icon: "⚠️", title: "Risk Assessment",
    sub: "Identify top threats, known vulnerabilities and existing control landscape.",
    outputs: ["Risk register (seeded)", "Risk heat map", "Control gap list"],
    modules: ["RiskOps"] },
  { n: 7,  icon: "📋", title: "SoA & Control Selection",
    sub: "Declare ISO 27001 Annex A domain applicability, status, owners and timelines.",
    outputs: ["Statement of Applicability", "Control register", "Implementation roadmap"],
    modules: ["ComplianceOps"] },
  { n: 8,  icon: "📜", title: "Policy Pack",
    sub: "Inventory existing policies, set approval workflow and review cadence.",
    outputs: ["ISMS policy", "15+ policy templates", "Approval workflow", "Policy calendar"],
    modules: ["GovOps"] },
  { n: 9,  icon: "🔧", title: "Control Implementation",
    sub: "Map your tools and evidence sources to controls; assess current maturity.",
    outputs: ["Control implementation tracker", "Evidence matrix", "Maturity report"],
    modules: ["ComplianceOps", "SecOps"] },
  { n: 10, icon: "🎓", title: "Awareness Program",
    sub: "Define training plan, delivery methods and completion tracking approach.",
    outputs: ["Training plan", "Content library outline", "Training schedule"],
    modules: ["GovOps"] },
  { n: 11, icon: "🔍", title: "Audit Program",
    sub: "Schedule internal audits, assign auditors and choose methodology.",
    outputs: ["Internal audit program", "Audit checklists", "Audit calendar"],
    modules: ["GovOps"] },
  { n: 12, icon: "📊", title: "Management Review Setup",
    sub: "Configure review participants, KPIs and agenda template.",
    outputs: ["Review agenda template", "KPI dashboard config", "Review schedule"],
    modules: ["Dashboard", "AnalyticsOps"] },
  { n: 13, icon: "🔄", title: "CAPA & Continual Improvement",
    sub: "Define nonconformity sources, CAPA workflow and effectiveness verification.",
    outputs: ["CAPA procedure", "Nonconformity register", "Improvement log"],
    modules: ["GovOps"] },
];

// ── Shared field primitives ─────────────────────────────────────────────────

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label style={{ display:"block", fontSize:12, fontWeight:600, color:NAV, marginBottom:4, letterSpacing:"0.03em" }}>
      {children}{required && <span style={{ color:RED }}> *</span>}
    </label>
  );
}
function Help({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize:11, color:"#6B7280", marginTop:3 }}>{children}</p>;
}
function Input({ value, onChange, placeholder, type = "text" }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width:"100%", boxSizing:"border-box", border:"1.5px solid rgba(255,255,255,0.1)", borderRadius:6, padding:"8px 10px", fontSize:13, color:"rgb(241,245,249)", background:"var(--card)", outline:"none", transition:"border 0.15s" }}
      onFocus={e => (e.target.style.borderColor = "#1E3A5F")}
      onBlur={e => (e.target.style.borderColor = "rgba(255,255,255,0.1)")} />
  );
}
function Textarea({ value, onChange, placeholder, rows = 3 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
      style={{ width:"100%", boxSizing:"border-box", border:"1.5px solid rgba(255,255,255,0.1)", borderRadius:6, padding:"8px 10px", fontSize:13, color:"rgb(241,245,249)", background:"var(--card)", resize:"vertical", outline:"none", transition:"border 0.15s", fontFamily:"inherit" }}
      onFocus={e => (e.target.style.borderColor = "#1E3A5F")}
      onBlur={e => (e.target.style.borderColor = "rgba(255,255,255,0.1)")} />
  );
}
function Select({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: string[]; placeholder?: string }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ width:"100%", boxSizing:"border-box", border:"1.5px solid rgba(255,255,255,0.1)", borderRadius:6, padding:"8px 10px", fontSize:13, color: value ? "#111827" : "#9CA3AF", background:"var(--card)", outline:"none" }}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
function CheckboxGroup({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (opt: string) => onChange(value.includes(opt) ? value.filter(x => x !== opt) : [...value, opt]);
  return (
    <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
      {options.map(opt => {
        const on = value.includes(opt);
        return (
          <button key={opt} onClick={() => toggle(opt)}
            style={{ fontSize:11, fontWeight:600, padding:"5px 10px", borderRadius:20, border: on ? `1.5px solid #065F46` : "1.5px solid rgba(255,255,255,0.1)", background: on ? "#ECFDF5" : "#fff", color: on ? "#065F46" : "#6B7280", cursor:"pointer", transition:"all 0.1s" }}>
            {on ? "✓ " : ""}{opt}
          </button>
        );
      })}
    </div>
  );
}
function RadioGroup({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
      {options.map(opt => {
        const on = value === opt;
        return (
          <button key={opt} onClick={() => onChange(opt)}
            style={{ fontSize:12, fontWeight:600, padding:"6px 14px", borderRadius:6, border: on ? `2px solid #1E3A5F` : "1.5px solid rgba(255,255,255,0.1)", background: on ? "#1E3A5F" : "#fff", color: on ? "#fff" : "var(--foreground)", cursor:"pointer", transition:"all 0.15s" }}>
            {opt}
          </button>
        );
      })}
    </div>
  );
}
function FieldRow({ children }: { children: React.ReactNode }) {
  return <div style={{ marginBottom:16 }}>{children}</div>;
}
function TwoCol({ children }: { children: React.ReactNode }) {
  return <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>{children}</div>;
}

// ── Per-stage forms ──────────────────────────────────────────────────────────

function S1({ d, set }: StageProps) {
  return (
    <>
      <TwoCol>
        <FieldRow><Label required>Organization Name</Label><Input value={str(d.orgName)} onChange={v => set("orgName", v)} placeholder="e.g. Acme Corporation Ltd" /></FieldRow>
        <FieldRow><Label required>Legal Entity Type</Label>
          <Select value={str(d.legalEntity)} onChange={v => set("legalEntity", v)} placeholder="Select type"
            options={["Ltd / Limited","GmbH","Inc / Incorporated","LLC","PLC","S.A.","B.V.","AG","Sole Trader","Partnership","Government Body","NGO / Non-profit","Other"]} />
        </FieldRow>
      </TwoCol>
      <TwoCol>
        <FieldRow><Label required>Primary Industry / Sector</Label>
          <Select value={str(d.industry)} onChange={v => set("industry", v)} placeholder="Select industry"
            options={["Financial Services","Healthcare & Life Sciences","Technology & Software","Manufacturing","Retail & E-commerce","Government & Public Sector","Energy & Utilities","Telecommunications","Professional Services","Education","Legal","Defence & Aerospace","Logistics & Transport","Media & Entertainment","Other"]} />
        </FieldRow>
        <FieldRow><Label required>Number of Employees</Label>
          <Select value={str(d.employeeCount)} onChange={v => set("employeeCount", v)} placeholder="Select range"
            options={["1–49","50–249","250–999","1,000–4,999","5,000–19,999","20,000+"]} />
        </FieldRow>
      </TwoCol>
      <TwoCol>
        <FieldRow><Label>Number of Sites / Offices</Label><Input type="number" value={str(d.siteCount)} onChange={v => set("siteCount", v)} placeholder="e.g. 3" /></FieldRow>
        <FieldRow><Label>Locations (cities/countries)</Label><Input value={str(d.locations)} onChange={v => set("locations", v)} placeholder="e.g. London, New York, Berlin" /></FieldRow>
      </TwoCol>
      <FieldRow><Label>Business Units / Departments in Scope</Label>
        <Textarea value={str(d.departments)} onChange={v => set("departments", v)} placeholder="e.g. IT, Finance, HR, Operations, Legal" rows={2} />
      </FieldRow>
      <TwoCol>
        <FieldRow><Label required>CISO / Security Lead</Label><Input value={str(d.cisoName)} onChange={v => set("cisoName", v)} placeholder="Full name" /></FieldRow>
        <FieldRow><Label>ISMS Manager</Label><Input value={str(d.ismsManager)} onChange={v => set("ismsManager", v)} placeholder="Full name" /></FieldRow>
      </TwoCol>
      <TwoCol>
        <FieldRow><Label>Data / Privacy Owner</Label><Input value={str(d.dataOwner)} onChange={v => set("dataOwner", v)} placeholder="Full name or TBD" /></FieldRow>
        <FieldRow><Label>Organisation Timezone</Label>
          <Select value={str(d.timezone)} onChange={v => set("timezone", v)} placeholder="Select timezone"
            options={["UTC","UTC+1 (CET)","UTC+2 (EET)","UTC-5 (EST)","UTC-6 (CST)","UTC-7 (MST)","UTC-8 (PST)","UTC+5:30 (IST)","UTC+8 (SGT/CST)","UTC+9 (JST)","UTC+10 (AEST)","Other"]} />
        </FieldRow>
      </TwoCol>
    </>
  );
}

function S2({ d, set }: StageProps) {
  return (
    <>
      <FieldRow><Label required>Core Products / Services</Label>
        <Textarea value={str(d.products)} onChange={v => set("products", v)} placeholder="List your main products or services, one per line" />
        <Help>These will seed the Context document and help the vCISO AI understand your business.</Help>
      </FieldRow>
      <FieldRow><Label>Customer Segments</Label>
        <CheckboxGroup value={arr(d.customerSegments)} onChange={v => set("customerSegments", v)}
          options={["Enterprise B2B","SMB","Consumer / B2C","Government","Healthcare Providers","Financial Institutions","Education","Non-profit"]} />
      </FieldRow>
      <FieldRow><Label required>Applicable Regulations & Frameworks</Label>
        <CheckboxGroup value={arr(d.regulations)} onChange={v => set("regulations", v)}
          options={["ISO 27001:2022","SOC 2 Type II","GDPR","HIPAA","PCI-DSS v4","NIS2","CCPA","NIST CSF 2.0","NIST 800-53","CIS Controls v8","FedRAMP","Cyber Essentials Plus","DORA","ISO 27017","ISO 27018","Other"]} />
        <Help>Selected frameworks will auto-populate the ComplianceOps module.</Help>
      </FieldRow>
      <FieldRow><Label>Key Suppliers & Partners</Label>
        <Textarea value={str(d.suppliers)} onChange={v => set("suppliers", v)} placeholder="List critical suppliers and partners, one per line" rows={2} />
      </FieldRow>
      <FieldRow><Label>Internal Business Drivers</Label>
        <CheckboxGroup value={arr(d.internalDrivers)} onChange={v => set("internalDrivers", v)}
          options={["Customer Contract Requirements","Regulatory Mandate","Cyber Insurance","Board / Executive Directive","M&A Due Diligence","IPO Readiness","Competitive Advantage","Partner Accreditation"]} />
      </FieldRow>
    </>
  );
}

function S3({ d, set }: StageProps) {
  return (
    <>
      <FieldRow><Label required>Sites / Locations In Scope</Label>
        <Textarea value={str(d.scopedSites)} onChange={v => set("scopedSites", v)} placeholder="List all sites included in the ISMS scope, one per line" rows={2} />
      </FieldRow>
      <FieldRow><Label required>Business Processes In Scope</Label>
        <Textarea value={str(d.businessProcesses)} onChange={v => set("businessProcesses", v)} placeholder="List key business processes covered by this ISMS" rows={3} />
      </FieldRow>
      <FieldRow><Label>Exclusions (with justification)</Label>
        <Textarea value={str(d.exclusions)} onChange={v => set("exclusions", v)} placeholder="e.g. Warehouse operations — physical security managed separately under ISO 45001" rows={2} />
        <Help>ISO 27001 requires documented justification for any exclusion.</Help>
      </FieldRow>
      <FieldRow><Label>Cloud Services & IT Systems In Scope</Label>
        <CheckboxGroup value={arr(d.cloudServices)} onChange={v => set("cloudServices", v)}
          options={["AWS","Microsoft Azure","Google Cloud","Microsoft 365","Salesforce","GitHub / GitLab","Slack","Zoom","Jira / Confluence","SAP","Workday","ServiceNow","HubSpot","Snowflake","Other SaaS"]} />
      </FieldRow>
      <FieldRow><Label>Scope Boundary Notes</Label>
        <Textarea value={str(d.boundaryNotes)} onChange={v => set("boundaryNotes", v)} placeholder="Additional notes on what is and isn't in scope" rows={2} />
      </FieldRow>
    </>
  );
}

function S4({ d, set }: StageProps) {
  return (
    <>
      <FieldRow><Label required>Risk Appetite</Label>
        <RadioGroup value={str(d.riskAppetite)} onChange={v => set("riskAppetite", v)}
          options={["Very Low","Low","Medium","High","Very High"]} />
        <Help>Sets the baseline for risk acceptance decisions across the platform.</Help>
      </FieldRow>
      <TwoCol>
        <FieldRow><Label required>Acceptance Threshold Score (1–25)</Label>
          <Input type="number" value={str(d.acceptanceThreshold)} onChange={v => set("acceptanceThreshold", v)} placeholder="e.g. 8" />
          <Help>Risks above this score require treatment.</Help>
        </FieldRow>
        <FieldRow><Label required>Assessment Frequency</Label>
          <Select value={str(d.assessmentFrequency)} onChange={v => set("assessmentFrequency", v)} placeholder="Select frequency"
            options={["Monthly","Quarterly","Semi-annual","Annual","Event-driven"]} />
        </FieldRow>
      </TwoCol>
      <FieldRow><Label>Impact Criteria — Financial</Label>
        <Input value={str(d.impactFinancial)} onChange={v => set("impactFinancial", v)} placeholder="e.g. 1=<£10k, 2=£10k–50k, 3=£50k–250k, 4=£250k–1m, 5=>£1m" />
      </FieldRow>
      <FieldRow><Label>Impact Criteria — Reputational</Label>
        <Input value={str(d.impactReputational)} onChange={v => set("impactReputational", v)} placeholder="e.g. 1=Internal only, 3=Press coverage, 5=Major brand damage" />
      </FieldRow>
      <FieldRow><Label>Impact Criteria — Legal / Regulatory</Label>
        <Input value={str(d.impactLegal)} onChange={v => set("impactLegal", v)} placeholder="e.g. 1=Minor breach, 3=Regulatory fine, 5=Criminal liability" />
      </FieldRow>
      <FieldRow><Label>Impact Criteria — Operational</Label>
        <Input value={str(d.impactOperational)} onChange={v => set("impactOperational", v)} placeholder="e.g. 1=<1h downtime, 3=<1day, 5=>1 week" />
      </FieldRow>
      <FieldRow><Label>Likelihood Scale Definitions (1–5)</Label>
        <Textarea value={str(d.likelihoodScale)} onChange={v => set("likelihoodScale", v)}
          placeholder="1=Rare (<1/5yr)  2=Unlikely (1/5yr)  3=Possible (1/yr)  4=Likely (quarterly)  5=Almost Certain (monthly)" rows={2} />
      </FieldRow>
    </>
  );
}

function S5({ d, set }: StageProps) {
  return (
    <>
      <FieldRow><Label required>Critical Information Asset Types</Label>
        <CheckboxGroup value={arr(d.assetTypes)} onChange={v => set("assetTypes", v)}
          options={["Databases","Servers / VMs","Laptops / Endpoints","Network Devices","Cloud Services","Web Applications","Source Code / IP","Documents / Records","API Keys / Secrets","People / HR Data","Customer Data","Third-party Integrations","Backup Media","IoT Devices"]} />
      </FieldRow>
      <FieldRow><Label required>Data Types Processed</Label>
        <CheckboxGroup value={arr(d.dataTypes)} onChange={v => set("dataTypes", v)}
          options={["Personally Identifiable Information (PII)","Financial Data","Health / Medical Data","Intellectual Property","Customer Data","Employee Data","Contract / Legal Data","Payment Card Data (PCI)","Biometric Data","Criminal Records","Children's Data"]} />
        <Help>Drives the Privacy and DataOps modules automatically.</Help>
      </FieldRow>
      <FieldRow><Label required>Data Classification Scheme</Label>
        <CheckboxGroup value={arr(d.classificationLevels)} onChange={v => set("classificationLevels", v)}
          options={["Public","Internal Use Only","Confidential","Strictly Confidential / Restricted","Top Secret"]} />
      </FieldRow>
      <FieldRow><Label>Asset Location / Processing Environments</Label>
        <CheckboxGroup value={arr(d.assetLocations)} onChange={v => set("assetLocations", v)}
          options={["On-premises Data Centre","Co-location Facility","Public Cloud (AWS/Azure/GCP)","SaaS Platforms","Employee Devices","Home / Remote Working","Third-party Premises","Mobile Devices"]} />
      </FieldRow>
      <FieldRow><Label>Data Asset Owners (name → asset type)</Label>
        <Textarea value={str(d.assetOwners)} onChange={v => set("assetOwners", v)} placeholder={"e.g.\nJane Smith → Customer Database\nIT Team → Cloud Infrastructure\nHR → Employee Records"} rows={3} />
      </FieldRow>
    </>
  );
}

function S6({ d, set }: StageProps) {
  return (
    <>
      <FieldRow><Label required>Top Threat Categories</Label>
        <CheckboxGroup value={arr(d.topThreats)} onChange={v => set("topThreats", v)}
          options={["Ransomware","Phishing","Insider Threat","DDoS","Supply Chain Attack","Data Breach","Cloud Misconfiguration","Credential Theft","Social Engineering","Physical Theft","Zero-day Exploit","Business Email Compromise","Nation-state Attack","Accidental Data Loss"]} />
        <Help>Selected threats will seed your Risk Register on completion.</Help>
      </FieldRow>
      <FieldRow><Label>Known Vulnerabilities / Weaknesses</Label>
        <Textarea value={str(d.vulnerabilities)} onChange={v => set("vulnerabilities", v)}
          placeholder="e.g. Legacy systems without patches, no MFA on admin accounts, weak vendor onboarding controls" rows={3} />
      </FieldRow>
      <FieldRow><Label>Existing Controls Currently In Place</Label>
        <Textarea value={str(d.existingControls)} onChange={v => set("existingControls", v)}
          placeholder="e.g. Firewall, AV/EDR on all endpoints, SSO via Okta, annual security awareness training, ISO 27001 certified since 2021" rows={3} />
      </FieldRow>
      <FieldRow><Label>Residual Risk Factors / Known Gaps</Label>
        <Textarea value={str(d.riskGaps)} onChange={v => set("riskGaps", v)}
          placeholder="e.g. No DLP solution, SIEM alerts not reviewed regularly, third-party access not reviewed annually" rows={2} />
      </FieldRow>
    </>
  );
}

const ANNEX_A_DOMAINS = [
  { id: "A.5", name: "Organisational Controls", controls: 37 },
  { id: "A.6", name: "People Controls",          controls: 8  },
  { id: "A.7", name: "Physical Controls",        controls: 14 },
  { id: "A.8", name: "Technological Controls",   controls: 34 },
];
const SOA_STATUS = ["Not Started","Planned","In Progress","Implemented","Not Applicable"];

type DomainRow = { id: string; applicable: boolean; status: string; owner: string; targetDate: string };

function S7({ d, set }: StageProps) {
  const defaultDomains: DomainRow[] = ANNEX_A_DOMAINS.map(a => ({ id: a.id, applicable: true, status: "Not Started", owner: "", targetDate: "" }));
  const domains: DomainRow[] = Array.isArray(d.controlDomains) ? (d.controlDomains as DomainRow[]) : defaultDomains;

  function updateDomain(idx: number, field: string, value: unknown) {
    const updated = domains.map((dom, i) => i === idx ? { ...dom, [field]: value } : dom);
    set("controlDomains", updated);
  }

  return (
    <>
      <p style={{ fontSize:12, color:"#6B7280", marginBottom:12 }}>
        ISO 27001:2022 Annex A has 4 control domains (93 controls total). Declare applicability and current status for each.
      </p>
      {ANNEX_A_DOMAINS.map((annex, i) => {
        const dom = domains[i] ?? { id: annex.id, applicable: true, status: "Not Started", owner: "", targetDate: "" };
        return (
          <div key={annex.id} style={{ background:"var(--card)", border:"1.5px solid rgba(255,255,255,0.1)", borderRadius:8, padding:14, marginBottom:10 }}>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:10 }}>
              <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"#1E3A5F", fontWeight:700, background:"#EFF6FF", border:"1px solid #BFDBFE", borderRadius:4, padding:"2px 8px" }}>{annex.id}</div>
              <div style={{ fontWeight:700, fontSize:14, color:"#1E3A5F", flex:1 }}>{annex.name}</div>
              <div style={{ fontSize:11, color:"#9CA3AF" }}>{annex.controls} controls</div>
              <button onClick={() => updateDomain(i, "applicable", !dom.applicable)}
                style={{ fontSize:11, fontWeight:700, padding:"4px 10px", borderRadius:4, cursor:"pointer", border: dom.applicable ? "1.5px solid #065F46" : "1.5px solid rgba(255,255,255,0.1)", background: dom.applicable ? "#ECFDF5" : "var(--border)", color: dom.applicable ? "#065F46" : "#9CA3AF" }}>
                {dom.applicable ? "✓ Applicable" : "Excluded"}
              </button>
            </div>
            {dom.applicable && (
              <div style={{ display:"grid", gridTemplateColumns:"1.5fr 1fr 1fr", gap:8 }}>
                <div><Label>Implementation Status</Label><Select value={dom.status} onChange={v => updateDomain(i, "status", v)} options={SOA_STATUS} /></div>
                <div><Label>Control Owner</Label><Input value={dom.owner} onChange={v => updateDomain(i, "owner", v)} placeholder="Name or team" /></div>
                <div><Label>Target Date</Label><Input type="date" value={dom.targetDate} onChange={v => updateDomain(i, "targetDate", v)} /></div>
              </div>
            )}
            {!dom.applicable && (
              <div><Label>Exclusion Justification</Label><Input value={dom.owner} onChange={v => updateDomain(i, "owner", v)} placeholder="Reason for exclusion (required by ISO 27001)" /></div>
            )}
          </div>
        );
      })}
    </>
  );
}

function S8({ d, set }: StageProps) {
  const POLICIES = [
    "Information Security Policy","Acceptable Use Policy","Access Control Policy",
    "Incident Response Policy","Business Continuity & DR Policy","Data Classification Policy",
    "Password & Authentication Policy","Remote Working Policy","BYOD Policy",
    "Vendor / Third-Party Management Policy","Change Management Policy","Physical Security Policy",
    "Network Security Policy","Cryptography Policy","Clear Desk / Screen Policy",
    "Secure Development Policy","Logging & Monitoring Policy","Data Retention & Disposal Policy",
  ];
  return (
    <>
      <FieldRow><Label>Existing Policies Already In Place</Label>
        <CheckboxGroup value={arr(d.existingPolicies)} onChange={v => set("existingPolicies", v)} options={POLICIES} />
        <Help>Unchecked policies will be generated as templates in GovOps.</Help>
      </FieldRow>
      <TwoCol>
        <FieldRow><Label required>Policy Approver Role</Label>
          <Select value={str(d.policyApprover)} onChange={v => set("policyApprover", v)} placeholder="Select approver"
            options={["CISO","CEO / Managing Director","CTO","Board of Directors","Risk Committee","IT Director","Compliance Manager"]} />
        </FieldRow>
        <FieldRow><Label required>Policy Review Cycle</Label>
          <Select value={str(d.reviewCycle)} onChange={v => set("reviewCycle", v)} placeholder="Select cycle"
            options={["Annually","Every 6 months","Quarterly","On major change","Event-driven"]} />
        </FieldRow>
      </TwoCol>
      <FieldRow><Label>Policy Distribution Method</Label>
        <CheckboxGroup value={arr(d.distributionMethod)} onChange={v => set("distributionMethod", v)}
          options={["Company Intranet / SharePoint","Email to all staff","LMS / e-Learning platform","Policy management tool","Printed / Physical","Manager briefing","New starter induction"]} />
      </FieldRow>
      <FieldRow><Label>Industry-specific Customisation Needs</Label>
        <Textarea value={str(d.customisationNotes)} onChange={v => set("customisationNotes", v)}
          placeholder="e.g. HIPAA-specific data handling clauses required for health data; PCI-DSS cardholder data clauses needed" rows={2} />
      </FieldRow>
    </>
  );
}

function S9({ d, set }: StageProps) {
  return (
    <>
      <p style={{ fontSize:12, color:"#6B7280", marginBottom:12 }}>Enter the tools your organisation currently uses. Leave blank if not deployed.</p>
      <TwoCol>
        <FieldRow><Label>SIEM / Log Management</Label><Input value={str(d.siem)} onChange={v => set("siem", v)} placeholder="e.g. Splunk, Microsoft Sentinel" /></FieldRow>
        <FieldRow><Label>IAM / SSO</Label><Input value={str(d.iam)} onChange={v => set("iam", v)} placeholder="e.g. Okta, Azure AD, JumpCloud" /></FieldRow>
        <FieldRow><Label>EDR / AV</Label><Input value={str(d.edr)} onChange={v => set("edr", v)} placeholder="e.g. CrowdStrike, Defender ATP" /></FieldRow>
        <FieldRow><Label>PAM (Privileged Access)</Label><Input value={str(d.pam)} onChange={v => set("pam", v)} placeholder="e.g. CyberArk, BeyondTrust, Delinea" /></FieldRow>
        <FieldRow><Label>Ticketing / ITSM</Label><Input value={str(d.ticketing)} onChange={v => set("ticketing", v)} placeholder="e.g. ServiceNow, Jira, Zendesk" /></FieldRow>
        <FieldRow><Label>MFA Solution</Label><Input value={str(d.mfa)} onChange={v => set("mfa", v)} placeholder="e.g. Duo, Microsoft Authenticator, Google" /></FieldRow>
        <FieldRow><Label>DLP</Label><Input value={str(d.dlp)} onChange={v => set("dlp", v)} placeholder="e.g. Forcepoint, Symantec, Microsoft Purview" /></FieldRow>
        <FieldRow><Label>Patch Management</Label><Input value={str(d.patchMgmt)} onChange={v => set("patchMgmt", v)} placeholder="e.g. WSUS, Ivanti, Automox" /></FieldRow>
        <FieldRow><Label>Backup / Recovery</Label><Input value={str(d.backup)} onChange={v => set("backup", v)} placeholder="e.g. Veeam, Acronis, AWS Backup" /></FieldRow>
        <FieldRow><Label>Cloud Security (CSPM)</Label><Input value={str(d.cloudSecurity)} onChange={v => set("cloudSecurity", v)} placeholder="e.g. Prisma Cloud, Wiz, Defender CSPM" /></FieldRow>
        <FieldRow><Label>Vulnerability Scanner</Label><Input value={str(d.vulnScanner)} onChange={v => set("vulnScanner", v)} placeholder="e.g. Qualys, Tenable, Rapid7" /></FieldRow>
        <FieldRow><Label>Email Security</Label><Input value={str(d.emailSec)} onChange={v => set("emailSec", v)} placeholder="e.g. Proofpoint, Mimecast, Defender" /></FieldRow>
      </TwoCol>
      <FieldRow><Label>Overall Control Maturity Assessment</Label>
        <RadioGroup value={str(d.overallMaturity)} onChange={v => set("overallMaturity", v)}
          options={["1 – Initial","2 – Developing","3 – Defined","4 – Managed","5 – Optimising"]} />
        <Help>1 = ad-hoc / undocumented. 5 = continuously measured and improved.</Help>
      </FieldRow>
    </>
  );
}

function S10({ d, set }: StageProps) {
  return (
    <>
      <FieldRow><Label>Current Security Training Programme</Label>
        <Textarea value={str(d.currentTraining)} onChange={v => set("currentTraining", v)}
          placeholder="Describe any existing training initiatives (e.g. annual CBT, phishing tests)" rows={2} />
      </FieldRow>
      <FieldRow><Label required>Roles Requiring Specialised Training</Label>
        <CheckboxGroup value={arr(d.specialisedRoles)} onChange={v => set("specialisedRoles", v)}
          options={["All Staff","CISO / Security Team","Developers / Engineers","Finance & Accounting","HR Team","Executive / Leadership","Customer-facing Roles","IT Administrators","Third-party Contractors","New Starters"]} />
      </FieldRow>
      <FieldRow><Label required>Training Delivery Methods</Label>
        <CheckboxGroup value={arr(d.trainingMethods)} onChange={v => set("trainingMethods", v)}
          options={["E-learning / CBT","Classroom / In-person","Phishing Simulations","Tabletop Exercises","Workshops","Lunch & Learn","Manager Briefings","Posters / Campaigns","Induction Training","Video Content"]} />
      </FieldRow>
      <TwoCol>
        <FieldRow><Label required>Training Frequency</Label>
          <Select value={str(d.frequency)} onChange={v => set("frequency", v)} placeholder="Select frequency"
            options={["Monthly","Quarterly","Every 6 months","Annually","Role-based / As needed"]} />
        </FieldRow>
        <FieldRow><Label>Completion Tracking Method</Label>
          <Select value={str(d.completionTracking)} onChange={v => set("completionTracking", v)} placeholder="Select method"
            options={["LMS (Learning Management System)","HR System","Email confirmation","Manager sign-off","Manual spreadsheet","No formal tracking"]} />
        </FieldRow>
      </TwoCol>
    </>
  );
}

function S11({ d, set }: StageProps) {
  return (
    <>
      <TwoCol>
        <FieldRow><Label required>Internal Audit Frequency</Label>
          <Select value={str(d.auditFrequency)} onChange={v => set("auditFrequency", v)} placeholder="Select frequency"
            options={["Annual (full ISMS)","Bi-annual","Quarterly (rolling)","Continuous (automated)"]} />
        </FieldRow>
        <FieldRow><Label required>Audit Methodology</Label>
          <Select value={str(d.methodology)} onChange={v => set("methodology", v)} placeholder="Select methodology"
            options={["Document Review","Interviews","Technical Testing","Observation","Sampling","Combined Approach"]} />
        </FieldRow>
      </TwoCol>
      <FieldRow><Label required>Audit Scope Areas</Label>
        <CheckboxGroup value={arr(d.auditScope)} onChange={v => set("auditScope", v)}
          options={["Full ISMS","Access Control & IAM","Risk Management","Incident Response","Physical & Environmental Security","Supplier Management","Change Management","Business Continuity","Data Protection / Privacy","Cloud Security","Network Security","Development Practices"]} />
      </FieldRow>
      <FieldRow><Label>Internal Auditor Names / Team</Label>
        <Textarea value={str(d.auditors)} onChange={v => set("auditors", v)}
          placeholder="e.g. Jane Smith (Lead Auditor), IT Risk Team, External: KPMG for annual review" rows={2} />
      </FieldRow>
      <FieldRow><Label>External Auditor / Certification Body</Label>
        <Input value={str(d.certBody)} onChange={v => set("certBody", v)} placeholder="e.g. BSI, DNV, Bureau Veritas, LRQA" />
      </FieldRow>
    </>
  );
}

function S12({ d, set }: StageProps) {
  return (
    <>
      <FieldRow><Label required>Management Review Participants</Label>
        <CheckboxGroup value={arr(d.reviewParticipants)} onChange={v => set("reviewParticipants", v)}
          options={["CISO","CEO / Managing Director","CTO / IT Director","CFO","Chief Risk Officer","DPO / Privacy Officer","Legal Counsel","HR Director","Operations Director","Department Heads","Board Audit Committee"]} />
      </FieldRow>
      <TwoCol>
        <FieldRow><Label required>Review Frequency</Label>
          <Select value={str(d.reviewFrequency)} onChange={v => set("reviewFrequency", v)} placeholder="Select frequency"
            options={["Quarterly","Semi-annual","Annual","Event-driven"]} />
        </FieldRow>
        <FieldRow><Label>First Review Target Date</Label>
          <Input type="date" value={str(d.firstReviewDate)} onChange={v => set("firstReviewDate", v)} />
        </FieldRow>
      </TwoCol>
      <FieldRow><Label required>KPIs to Track</Label>
        <CheckboxGroup value={arr(d.kpis)} onChange={v => set("kpis", v)}
          options={["Overall GRC Score","Risk Posture / Open Risks","Control Coverage %","Incident Count & Severity","Training Completion %","Audit Findings & CAPA Status","DSAR SLA Compliance %","Vulnerability Remediation Time","Supplier Risk Score","Policy Review Compliance","Change Management KPIs","Business Continuity Test Results"]} />
      </FieldRow>
      <FieldRow><Label>Additional Agenda Items</Label>
        <Textarea value={str(d.agendaItems)} onChange={v => set("agendaItems", v)}
          placeholder="e.g. Regulatory updates review, Security incidents summary, Budget review, Certification status" rows={2} />
      </FieldRow>
    </>
  );
}

function S13({ d, set }: StageProps) {
  return (
    <>
      <FieldRow><Label required>Nonconformity Identification Sources</Label>
        <CheckboxGroup value={arr(d.nonconformitySources)} onChange={v => set("nonconformitySources", v)}
          options={["Internal Audits","External / Certification Audits","Security Incidents","Risk Assessments","Management Reviews","Employee Reports / Near-misses","Customer Complaints","Supplier Issues","Regulatory Changes","Penetration Testing","Automated Monitoring"]} />
      </FieldRow>
      <FieldRow><Label required>CAPA Workflow Approach</Label>
        <RadioGroup value={str(d.capaWorkflow)} onChange={v => set("capaWorkflow", v)}
          options={["Simple (Identify → Action → Verify)","PDCA (Plan-Do-Check-Act)","8D Problem Solving","Root Cause Analysis (5-Why)","ISO 9001 NCR Process"]} />
      </FieldRow>
      <FieldRow><Label>Effectiveness Verification Criteria</Label>
        <Textarea value={str(d.effectivenessCriteria)} onChange={v => set("effectivenessCriteria", v)}
          placeholder="e.g. No recurrence within 12 months, evidence reviewed at next audit, KPI improvement documented" rows={2} />
      </FieldRow>
      <FieldRow><Label>Improvement Triggers</Label>
        <CheckboxGroup value={arr(d.improvementTriggers)} onChange={v => set("improvementTriggers", v)}
          options={["Audit Finding (major)","Audit Finding (minor)","Security Incident","Risk Score Increase","Regulatory Change","Technology Change","Management Direction","Customer Feedback","Benchmarking / Industry Comparison"]} />
      </FieldRow>
      <FieldRow><Label>Continual Improvement Owner</Label>
        <Input value={str(d.improvementOwner)} onChange={v => set("improvementOwner", v)} placeholder="e.g. CISO, Quality Manager, ISMS Manager" />
      </FieldRow>
    </>
  );
}

const STAGE_FORMS = [S1, S2, S3, S4, S5, S6, S7, S8, S9, S10, S11, S12, S13];

// ── Right panel: stage outputs ──────────────────────────────────────────────

function OutputsPanel({ stage, d }: { stage: typeof STAGES[0]; d: StageData }) {
  return (
    <div style={{ width:220, flexShrink:0, borderLeft:"1.5px solid rgba(255,255,255,0.1)", background:"var(--card)", padding:"20px 16px", display:"flex", flexDirection:"column", gap:16, overflowY:"auto" }}>
      <div>
        <div style={{ fontSize:10, fontWeight:800, letterSpacing:"0.1em", color:"#9CA3AF", textTransform:"uppercase", marginBottom:8 }}>Outputs Generated</div>
        {stage.outputs.map(o => (
          <div key={o} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
            <div style={{ width:6, height:6, borderRadius:"50%", background:"#065F46", flexShrink:0 }} />
            <span style={{ fontSize:11, color:"var(--foreground)", fontWeight:500 }}>{o}</span>
          </div>
        ))}
      </div>
      <div>
        <div style={{ fontSize:10, fontWeight:800, letterSpacing:"0.1em", color:"#9CA3AF", textTransform:"uppercase", marginBottom:8 }}>Feeds Into</div>
        {stage.modules.map(m => (
          <span key={m} style={{ display:"inline-block", background:"#EFF6FF", border:"1px solid #BFDBFE", borderRadius:10, padding:"2px 8px", fontSize:10, fontWeight:700, color:"#1D4ED8", marginRight:4, marginBottom:4 }}>{m}</span>
        ))}
      </div>
    </div>
  );
}

// ── Main Wizard Component ───────────────────────────────────────────────────

export default function Onboarding({ onComplete }: { onComplete?: () => void }) {
  const { data: session, isLoading, saveStage, complete } = useOnboarding();
  const [, navigate] = useLocation();

  const [current, setCurrent]     = useState(1);
  const [localData, setLocalData] = useState<Record<number, StageData>>({});
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);

  useEffect(() => {
    if (session) {
      setCurrent(Math.min(session.currentStage, 13));
      const sd = session.stagesData as Record<string, StageData>;
      const mapped: Record<number, StageData> = {};
      for (let i = 1; i <= 13; i++) {
        if (sd[`stage${i}`]) mapped[i] = sd[`stage${i}`] as StageData;
      }
      setLocalData(mapped);
    }
  }, [session]);

  const stageData = localData[current] ?? {};
  const setField  = useCallback((k: string, v: unknown) => {
    setLocalData(prev => ({ ...prev, [current]: { ...(prev[current] ?? {}), [k]: v } }));
    setSaved(false);
  }, [current]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveStage.mutateAsync({ stage: current, data: localData[current] ?? {} });
      setSaved(true);
    } finally { setSaving(false); }
  };

  const handleNext = async () => {
    setSaving(true);
    try {
      await saveStage.mutateAsync({ stage: current, data: localData[current] ?? {} });
      if (current < 13) { setCurrent(current + 1); setSaved(false); }
      else { await complete.mutateAsync(); onComplete?.(); navigate("/"); }
    } finally { setSaving(false); }
  };

  const handleBack = () => { if (current > 1) { setCurrent(current - 1); setSaved(false); } };

  const completedStages = session
    ? Object.keys((session.stagesData ?? {}) as object).map(k => parseInt(k.replace("stage", "")))
    : [];

  if (isLoading) {
    return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:400 }}>
        <div style={{ color:"#1E3A5F", fontSize:14 }}>Loading wizard…</div>
      </div>
    );
  }

  const meta      = STAGES[current - 1];
  const StageForm = STAGE_FORMS[current - 1];
  const pct       = Math.round((completedStages.length / 13) * 100);

  return (
    <div style={{ display:"flex", height:"100%", minHeight:600, background:"var(--background)", fontFamily:"'Plus Jakarta Sans',sans-serif" }}>

      {/* Left Rail */}
      <div style={{ width:220, background:"var(--card)", borderRight:"1.5px solid rgba(255,255,255,0.1)", display:"flex", flexDirection:"column", overflowY:"auto", flexShrink:0 }}>
        <div style={{ padding:"16px 14px 10px", borderBottom:"1px solid var(--border)" }}>
          <div style={{ fontSize:10, fontWeight:800, letterSpacing:"0.1em", color:"#1E3A5F", textTransform:"uppercase", marginBottom:4 }}>Setup Wizard</div>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <div style={{ flex:1, height:4, background:"rgba(255,255,255,0.1)", borderRadius:2, overflow:"hidden" }}>
              <div style={{ width:`${pct}%`, height:"100%", background:"#065F46", borderRadius:2, transition:"width 0.3s" }} />
            </div>
            <span style={{ fontSize:10, fontWeight:700, color:pct===100?"#065F46":"#1E3A5F" }}>{pct}%</span>
          </div>
        </div>
        <div style={{ flex:1, padding:"6px 0" }}>
          {STAGES.map((s) => {
            const done  = completedStages.includes(s.n);
            const isCurr = s.n === current;
            return (
              <button key={s.n} onClick={() => { if (done || s.n <= (session?.currentStage ?? 1)) setCurrent(s.n); }}
                style={{ display:"flex", alignItems:"center", gap:8, width:"100%", textAlign:"left", padding:"7px 14px", border:"none", cursor:(done || s.n <= (session?.currentStage ?? 1))?"pointer":"default", background:isCurr?"#EFF6FF":"transparent", borderLeft:isCurr?`3px solid #1E3A5F`:"3px solid transparent", transition:"all 0.1s" }}>
                <div style={{ width:20, height:20, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:9, fontWeight:800, background:done?"#065F46":isCurr?"#1E3A5F":"var(--border)", color:(done||isCurr)?"#fff":"#9CA3AF" }}>
                  {done ? "✓" : s.n}
                </div>
                <span style={{ fontSize:11, fontWeight:isCurr?700:500, color:isCurr?"#1E3A5F":done?"#065F46":"#6B7280" }}>{s.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Center form area */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        {/* Stage header */}
        <div style={{ padding:"20px 28px 16px", borderBottom:"1.5px solid rgba(255,255,255,0.1)", background:"var(--card)", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
            <span style={{ fontSize:22 }}>{meta.icon}</span>
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:"#9CA3AF", letterSpacing:"0.1em", textTransform:"uppercase" }}>Stage {current} of 13</div>
              <div style={{ fontSize:18, fontWeight:800, color:"#1E3A5F", letterSpacing:"-0.3px" }}>{meta.title}</div>
            </div>
          </div>
          <p style={{ fontSize:13, color:"#6B7280", margin:0 }}>{meta.sub}</p>
        </div>

        {/* Form scroll area */}
        <div style={{ flex:1, overflowY:"auto", padding:"24px 28px" }}>
          <StageForm d={stageData} set={setField} />
        </div>

        {/* Footer actions */}
        <div style={{ padding:"14px 28px", borderTop:"1.5px solid rgba(255,255,255,0.1)", background:"var(--card)", display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
          <button onClick={handleBack} disabled={current === 1}
            style={{ padding:"8px 18px", borderRadius:7, border:"1.5px solid rgba(255,255,255,0.1)", background:"var(--card)", fontSize:12, fontWeight:600, color:current===1?"#D1D5DB":"var(--foreground)", cursor:current===1?"not-allowed":"pointer", fontFamily:"inherit" }}>
            ← Back
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ padding:"8px 18px", borderRadius:7, border:"1.5px solid rgba(255,255,255,0.1)", background:saved?"#ECFDF5":"var(--card)", fontSize:12, fontWeight:600, color:saved?"#065F46":"var(--foreground)", cursor:"pointer", fontFamily:"inherit" }}>
            {saving ? "Saving…" : saved ? "✓ Saved" : "Save"}
          </button>
          <div style={{ flex:1 }} />
          <span style={{ fontSize:11, color:"#9CA3AF" }}>Stage {current} / 13</span>
          <button onClick={handleNext} disabled={saving}
            style={{ padding:"9px 22px", borderRadius:7, border:"none", background:"linear-gradient(135deg, #1E3A5F, #065F46)", fontSize:12, fontWeight:700, color:"#fff", cursor:saving?"not-allowed":"pointer", fontFamily:"inherit", boxShadow:"0 2px 8px rgba(30,58,95,0.25)", opacity:saving?0.7:1 }}>
            {current === 13 ? "Complete Setup 🎉" : "Next Stage →"}
          </button>
        </div>
      </div>

      {/* Right outputs panel */}
      <OutputsPanel stage={meta} d={stageData} />
    </div>
  );
}
