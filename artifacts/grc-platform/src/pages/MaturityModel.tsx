// @ts-nocheck
import { useState, useMemo } from "react";
import { SubNav, ModuleHeader, Badge } from "@/components/SubNav";
import { useOrg } from "@/context/OrgContext";

// ── Design tokens ─────────────────────────────────────────────────────────────
const NAV = "#93C5FD";
const EME = "#34D399";
const AMB = "#FCD34D";
const RED = "#F87171";
const DIM_PEOPLE     = { key: "people",     label: "People",     color: "#93C5FD", bg: "rgba(147,197,253,0.12)", desc: "Staffing, skills, roles & awareness" };
const DIM_GOVERNANCE = { key: "governance", label: "Governance", color: "#34D399", bg: "rgba(52,211,153,0.12)",  desc: "Policies, processes & leadership" };
const DIM_CONTROLS   = { key: "controls",   label: "Controls",   color: "#F87171", bg: "rgba(248,113,113,0.12)", desc: "Technical implementation & automation" };
const DIMENSIONS = [DIM_PEOPLE, DIM_GOVERNANCE, DIM_CONTROLS];

// ── Maturity levels ───────────────────────────────────────────────────────────
const LEVELS = [
  { n: 1, label: "Initial",    short: "INI", color: "#DC2626", bg: "rgba(220,38,38,0.15)",
    people:     "Activities unstaffed or uncoordinated",
    governance: "No formal security program in place",
    controls:   "Despite security issues, no controls exist" },
  { n: 2, label: "Repeatable", short: "RPT", color: "#D97706", bg: "rgba(217,119,6,0.15)",
    people:     "Infosec leadership established, informal communication",
    governance: "Basic governance and risk management process, policies",
    controls:   "Some controls in development with limited documentation" },
  { n: 3, label: "Defined",    short: "DEF", color: "#EAB308", bg: "rgba(234,179,8,0.15)",
    people:     "Some roles and responsibilities established",
    governance: "Organization-wide processes and policies in place but minimal verification",
    controls:   "More controls documented and developed, but over-reliant on individual efforts" },
  { n: 4, label: "Managed",    short: "MGD", color: "#059669", bg: "rgba(5,150,105,0.15)",
    people:     "Increased resources and awareness, clearly defined roles and responsibilities",
    governance: "Formal infosec committees, verification and measurement processes",
    controls:   "Controls monitored, measured for compliance, but uneven levels of automation" },
  { n: 5, label: "Optimizing", short: "OPT", color: "#065F46", bg: "rgba(6,95,70,0.15)",
    people:     "Culture supports continuous improvement to security skills, process, technology",
    governance: "Processes more comprehensively implemented, risk-based and quantitatively understood",
    controls:   "Controls more comprehensively implemented, automated and subject to continuous improvement" },
];

function levelColor(n: number) { return LEVELS[n - 1]?.color ?? "#6B7280"; }
function levelLabel(n: number) { return LEVELS[n - 1]?.label ?? "—"; }
function levelBg(n: number)    { return LEVELS[n - 1]?.bg ?? "rgba(107,114,128,0.1)"; }

// ── Domain data ───────────────────────────────────────────────────────────────
// people/governance/controls: maturity level per dimension (1-5)
// totalControls: mapped controls  implemented: full evidence  partial: partial evidence
// implPct/partialPct derived in render  auditFindings: open audit items
const DOMAINS = [
  {
    id: "iam",   label: "Identity & Access",    icon: "🔑",
    people: 4, governance: 4, controls: 4,
    totalControls: 18, implemented: 16, partial: 1,
    auditFindings: 1,
    linkedControls: ["A.9.4.2", "CC6.1", "164.312.a"],
    finding: "3 privileged service accounts not enrolled in MFA — CIS 6.3 / SOC 2 CC6.1 violation",
    recommendation: "Enforce MFA via Okta for all privileged accounts; implement PAM (BeyondTrust/CyberArk)",
  },
  {
    id: "vuln",  label: "Vulnerability Mgmt",   icon: "🔍",
    people: 3, governance: 3, controls: 3,
    totalControls: 12, implemented: 9, partial: 2,
    auditFindings: 2,
    linkedControls: ["A.12.6.1", "NIS2-ART21"],
    finding: "CVE-2024-1234 CVSS 9.8 unpatched — deployment blocked by change freeze since May 2024",
    recommendation: "Establish emergency patch exception process; deploy WAF virtual patch within 24h",
  },
  {
    id: "ir",    label: "Incident Response",    icon: "🚨",
    people: 4, governance: 4, controls: 3,
    totalControls: 10, implemented: 9, partial: 1,
    auditFindings: 1,
    linkedControls: ["CC7.2", "NIS2-ART23"],
    finding: "NIS2 Art. 23 notification SOP v1.1 still in legal review — 72h reporting window at risk",
    recommendation: "Expedite SOP ratification; run IR tabletop exercise against NIS2 scenario",
  },
  {
    id: "data",  label: "Data Protection",      icon: "🗄️",
    people: 3, governance: 4, controls: 3,
    totalControls: 15, implemented: 10, partial: 3,
    auditFindings: 2,
    linkedControls: ["ART-30", "ART-32", "164.312.b"],
    finding: "EU personal data in US-hosted SaaS without SCCs — GDPR Art. 46 exposure",
    recommendation: "Execute SCCs / BCRs for all EU-data processors; audit data residency quarterly",
  },
  {
    id: "net",   label: "Network Security",     icon: "🌐",
    people: 3, governance: 3, controls: 3,
    totalControls: 14, implemented: 10, partial: 3,
    auditFindings: 0,
    linkedControls: ["NIS2-ART21", "164.312.a"],
    finding: "Network segmentation verified; no open critical findings — firewall rule review due Q3",
    recommendation: "Automate firewall rule review quarterly; deploy micro-segmentation for PCI CDE",
  },
  {
    id: "cloud", label: "Cloud Security",       icon: "☁️",
    people: 2, governance: 2, controls: 2,
    totalControls: 11, implemented: 6, partial: 2,
    auditFindings: 3,
    linkedControls: ["NIS2-ART21"],
    finding: "CSPM: 47 open misconfigs; cloud asset inventory 61% complete; SIEM forwarding absent",
    recommendation: "Enable CSPM auto-remediation; complete asset tagging; integrate CloudTrail → SIEM",
  },
  {
    id: "appsec",label: "Application Security", icon: "💻",
    people: 3, governance: 2, controls: 3,
    totalControls: 13, implemented: 8, partial: 3,
    auditFindings: 1,
    linkedControls: ["A.12.6.1"],
    finding: "SAST/DAST absent from 4 of 12 CI/CD pipelines; SBOM not generated for any service",
    recommendation: "Integrate Semgrep SAST and OWASP ZAP DAST in all pipelines; generate SBOM via Syft",
  },
  {
    id: "gov",   label: "Security Governance",  icon: "🏛️",
    people: 4, governance: 4, controls: 4,
    totalControls: 8, implemented: 7, partial: 1,
    auditFindings: 0,
    linkedControls: ["ART-30", "CC6.1"],
    finding: "Board reporting cadence established; ISMS scope reviewed Q1 2024 — no open gaps",
    recommendation: "Adopt FAIR model for quantitative risk reporting; automate board KPI dashboard",
  },
  {
    id: "bc",    label: "Business Continuity",  icon: "🔄",
    people: 3, governance: 3, controls: 3,
    totalControls: 9, implemented: 7, partial: 1,
    auditFindings: 0,
    linkedControls: ["164.312.b"],
    finding: "BCP/DR tested Q1 2024 — RTO objectives not formally per-service-tier documented",
    recommendation: "Document RTO/RPO per service tier; automate DR failover for Tier-1 workloads",
  },
  {
    id: "tprm",  label: "Third-Party Risk",     icon: "🤝",
    people: 3, governance: 3, controls: 2,
    totalControls: 11, implemented: 7, partial: 2,
    auditFindings: 2,
    linkedControls: ["ART-30"],
    finding: "DPA absent for Accenture (EU data); 3 critical vendors lack current security assessments",
    recommendation: "Complete DPAs for all EU-data processors within 30 days; automate vendor scoring",
  },
  {
    id: "aware", label: "Security Awareness",   icon: "🎓",
    people: 3, governance: 3, controls: 3,
    totalControls: 7, implemented: 5, partial: 1,
    auditFindings: 0,
    linkedControls: ["A.9.4.2"],
    finding: "Annual training: 94% completion; phishing click rate down from 18% → 9% YoY",
    recommendation: "Move to monthly micro-learning; add role-specific tracks for dev, finance, ops",
  },
  {
    id: "phys",  label: "Physical Security",    icon: "🏢",
    people: 4, governance: 4, controls: 4,
    totalControls: 6, implemented: 6, partial: 0,
    auditFindings: 0,
    linkedControls: ["CC6.1"],
    finding: "Badge + biometric access; CCTV 100% coverage; visitor logs maintained — fully compliant",
    recommendation: "Automate monthly access review reconciliation against HR joiners/movers/leavers",
  },
];

// Assessment questions (per domain × dimension)
const QUESTIONS: Record<string, Record<string, string[]>> = {
  people: {
    iam:    ["Are IAM roles formally defined with documented responsibilities?", "Does the org have a dedicated identity team or owner?", "Are users trained on access hygiene annually?"],
    vuln:   ["Is there a dedicated vulnerability management owner?", "Are security staff trained on CVSS scoring and prioritisation?", "Are SLAs defined for patch response per severity?"],
    ir:     ["Is an Incident Response team formally constituted?", "Are IR roles and escalation paths documented in a RACI?", "Do staff complete IR drills or tabletop exercises?"],
    data:   ["Is there a Data Protection Officer (DPO) appointed?", "Are data custodians identified per system?", "Is data classification training mandatory?"],
    net:    ["Is a network security owner or team designated?", "Are firewall admin responsibilities formally assigned?", "Is the team trained on network threat modelling?"],
    cloud:  ["Is cloud security responsibility formally owned?", "Does the team have cloud security certifications (AWS/Azure/GCP)?", "Are cloud security roles defined in the RACI?"],
    appsec: ["Is a secure SDLC champion or AppSec engineer assigned?", "Are developers trained on OWASP Top 10?", "Are security code review responsibilities defined?"],
    gov:    ["Is a CISO or equivalent role formally established?", "Does a security steering committee or board exist?", "Are security KPIs reported to executive leadership?"],
    bc:     ["Is a BCDR owner formally appointed?", "Are BCP roles and alternates documented?", "Has the BC team completed DR tabletop exercises this year?"],
    tprm:   ["Is third-party risk management formally owned?", "Are vendor security assessment responsibilities assigned?", "Is the team trained on supply-chain risk?"],
    aware:  ["Is a security awareness programme owner designated?", "Are role-specific training tracks defined (dev, finance, ops)?", "Are phishing simulation results reviewed by leadership?"],
    phys:   ["Are physical security responsibilities formally assigned?", "Is a facilities security owner designated?", "Are physical security incidents tracked and escalated?"],
  },
  governance: {
    iam:    ["Is there a formal Identity & Access Management policy?", "Is an access review process defined and recurring?", "Are privileged access management procedures documented?"],
    vuln:   ["Is a Vulnerability Management policy in place?", "Are patch management SLAs defined per severity tier?", "Is a formal exception/risk-acceptance process documented?"],
    ir:     ["Is a formal Incident Response Plan (IRP) documented and approved?", "Is the incident classification taxonomy defined?", "Are post-incident review (PIR) procedures mandated?"],
    data:   ["Is a Data Classification Policy approved and published?", "Are data retention and disposal procedures documented?", "Is a Record of Processing Activities (RoPA) maintained?"],
    net:    ["Is a Network Security Policy formally approved?", "Are firewall change management procedures documented?", "Is network segmentation architecture documented and reviewed?"],
    cloud:  ["Is a Cloud Security Policy in place?", "Are cloud resource provisioning guardrails defined?", "Is the Shared Responsibility Model documented per provider?"],
    appsec: ["Is a Secure SDLC policy documented?", "Are secure coding standards mandated for development teams?", "Is a software composition analysis (SCA) process defined?"],
    gov:    ["Is an Information Security Policy approved by the board?", "Is a formal risk governance framework adopted (ISO 31000 / NIST)?", "Are security objectives formally set and tracked?"],
    bc:     ["Is a Business Continuity Plan (BCP) documented and tested?", "Are RTO/RPO objectives defined per service tier?", "Is a crisis communication plan in place?"],
    tprm:   ["Is a Third-Party Risk Management policy approved?", "Are vendor onboarding security requirements defined?", "Are contracts reviewed for security and data processing clauses?"],
    aware:  ["Is a Security Awareness Training policy mandated?", "Is mandatory annual training completion tracked?", "Are phishing simulation programmes formally scheduled?"],
    phys:   ["Is a Physical Security Policy approved?", "Are visitor management procedures documented?", "Is a clear desk / clean screen policy enforced?"],
  },
  controls: {
    iam:    ["Is MFA enforced for all privileged and remote access?", "Is access provisioning automated (IGA/IAM tooling)?", "Are access reviews automated and completed quarterly?"],
    vuln:   ["Is continuous vulnerability scanning deployed across all assets?", "Are critical patches applied within SLA (e.g. 72h for Critical)?", "Is a SIEM integrated with vulnerability data for prioritisation?"],
    ir:     ["Is a SIEM/SOAR deployed for detection and automated response?", "Are incident response playbooks implemented in tooling?", "Is threat intelligence feed integrated into detection controls?"],
    data:   ["Is encryption at-rest and in-transit enforced for all sensitive data?", "Is a DLP solution deployed and tuned?", "Are data access logs collected and reviewed?"],
    net:    ["Are next-generation firewalls (NGFW) deployed and rule-reviewed?", "Is network traffic monitored with IDS/IPS?", "Is network segmentation technically enforced (VLANs/microseg)?"],
    cloud:  ["Is a Cloud Security Posture Management (CSPM) tool deployed?", "Are cloud-native security controls (SCPs, org policies) enforced?", "Are cloud workloads monitored in SIEM?"],
    appsec: ["Is SAST integrated into every CI/CD pipeline?", "Is DAST / penetration testing conducted at least annually?", "Are third-party dependencies scanned (SCA) on every build?"],
    gov:    ["Is a GRC platform used to track controls and evidence?", "Are compliance control statuses monitored continuously?", "Is audit evidence collected automatically via integrations?"],
    bc:     ["Are backup systems tested for restore at least quarterly?", "Is DR failover automated or partially automated?", "Are RTO/RPO metrics tracked in an operational dashboard?"],
    tprm:   ["Are vendor risk assessments automated or tooling-supported?", "Is continuous vendor monitoring in place (security ratings)?", "Are supply-chain software risks managed (SBOM)?"],
    aware:  ["Is security awareness training delivered via an LMS platform?", "Are phishing simulations automated and scheduled monthly?", "Is training completion tracked and reported automatically?"],
    phys:   ["Are physical access controls automated (badge + biometric)?", "Is CCTV coverage monitored with automated alerting?", "Are physical access logs reviewed automatically?"],
  },
};

// ── Helper: compute composite score ──────────────────────────────────────────
function composite(d: typeof DOMAINS[0]) {
  return Math.round(((d.people + d.governance + d.controls) / 3) * 10) / 10;
}

function overallScore(domains: typeof DOMAINS) {
  const sum = domains.reduce((a, d) => a + (d.people + d.governance + d.controls) / 3, 0);
  return Math.round((sum / domains.length) * 10) / 10;
}

// ── Heatmap cell ──────────────────────────────────────────────────────────────
function HeatCell({ score, dim, domainLabel, onClick }:
  { score: number; dim: typeof DIMENSIONS[0]; domainLabel: string; onClick: () => void }) {
  const lv = LEVELS[score - 1]!;
  return (
    <button
      onClick={onClick}
      title={`${domainLabel} — ${dim.label}: ${lv.label} (${score}/5)`}
      style={{
        width: "100%", minHeight: 48, border: "none", cursor: "pointer",
        borderRadius: 6, background: lv.bg,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
        transition: "transform .15s, box-shadow .15s",
        boxShadow: "0 0 0 1.5px " + lv.color + "44",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.07)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 0 2px " + lv.color; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 0 1.5px " + lv.color + "44"; }}
    >
      <span style={{ fontSize: 11, fontWeight: 700, color: lv.color }}>{lv.short}</span>
      <span style={{ fontSize: 9, color: "var(--muted-foreground)" }}>{score}/5</span>
    </button>
  );
}

// ── Score bar ─────────────────────────────────────────────────────────────────
function ScoreBar({ score, color, label }: { score: number; color: string; label: string }) {
  const pct = (score / 5) * 100;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 90, fontSize: 12, color: "var(--muted-foreground)", flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, height: 8, background: "var(--border)", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ width: pct + "%", height: "100%", background: color, borderRadius: 99, transition: "width .4s" }} />
      </div>
      <div style={{ width: 32, textAlign: "right", fontSize: 12, fontWeight: 700, color, flexShrink: 0 }}>{score.toFixed(1)}</div>
    </div>
  );
}

// ── Radar SVG ─────────────────────────────────────────────────────────────────
function RadarChart({ domains }: { domains: typeof DOMAINS }) {
  const data = domains.map(d => ({ label: d.label.replace(" & ", " &\n"), score: composite(d) }));
  const n = data.length;
  const cx = 180, cy = 165, r = 120;
  const angles = data.map((_, i) => (i / n) * 2 * Math.PI - Math.PI / 2);
  const toXY = (val: number, idx: number): [number, number] => {
    const a = angles[idx]!;
    return [cx + (val / 5) * r * Math.cos(a), cy + (val / 5) * r * Math.sin(a)];
  };
  const pts = data.map((d, i) => toXY(d.score, i));
  const poly = (p: [number, number][]) => p.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ") + " Z";
  return (
    <svg viewBox="0 0 360 330" style={{ width: "100%", maxWidth: 380 }}>
      {[1, 2, 3, 4, 5].map(ring => {
        const rp = angles.map(a => [cx + (ring / 5) * r * Math.cos(a), cy + (ring / 5) * r * Math.sin(a)] as [number, number]);
        return <polygon key={ring} points={rp.map(p => p.join(",")).join(" ")} fill="none" stroke="var(--border)" strokeWidth="1" />;
      })}
      {angles.map((a, i) => (
        <line key={i} x1={cx} y1={cy} x2={(cx + r * Math.cos(a)).toFixed(1)} y2={(cy + r * Math.sin(a)).toFixed(1)} stroke="var(--border)" strokeWidth="1" />
      ))}
      <path d={poly(pts)} fill={NAV + "22"} stroke={NAV} strokeWidth="2" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="5" fill={levelColor(Math.round(data[i]!.score))} stroke="white" strokeWidth="1.5" />
      ))}
      {data.map((d, i) => {
        const a = angles[i]!;
        const lx = cx + (r + 28) * Math.cos(a);
        const ly = cy + (r + 28) * Math.sin(a);
        const short = d.label.length > 14 ? d.label.slice(0, 14) + "…" : d.label;
        return (
          <text key={i} x={lx.toFixed(1)} y={ly.toFixed(1)} textAnchor="middle" dominantBaseline="middle"
            fontSize="8" fill="var(--foreground)" fontWeight="600">{short}</text>
        );
      })}
      {[1, 2, 3, 4, 5].map(ring => (
        <text key={ring} x={cx + 4} y={(cy - (ring / 5) * r + 3).toFixed(1)} fontSize="7" fill="var(--muted-foreground)">{ring}</text>
      ))}
    </svg>
  );
}

// ── Level Staircase (from image) ──────────────────────────────────────────────
function LevelStaircase() {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, padding: "16px 0 0" }}>
      {LEVELS.map((lv, idx) => (
        <div key={lv.n} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div style={{ height: 80 + idx * 36, background: lv.bg, border: "1.5px solid " + lv.color + "66", borderRadius: "6px 6px 0 0", padding: "8px 6px", display: "flex", flexDirection: "column", justifyContent: "flex-start", gap: 4 }}>
            <div style={{ fontWeight: 800, fontSize: 11, color: lv.color }}>{lv.n}. {lv.label}</div>
            <div style={{ fontSize: 9, color: "var(--muted-foreground)", lineHeight: 1.3 }}>{lv.people}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Gauge ─────────────────────────────────────────────────────────────────────
function Gauge({ score }: { score: number }) {
  const pct = (score / 5) * 180;
  const r = 70, cx = 90, cy = 90;
  const toPath = (deg: number) => {
    const a = (deg - 90) * (Math.PI / 180);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const describeArc = (start: number, end: number) => {
    const [sx, sy] = toPath(start), [ex, ey] = toPath(end);
    const large = end - start > 180 ? 1 : 0;
    return `M${sx.toFixed(1)},${sy.toFixed(1)} A${r},${r} 0 ${large},1 ${ex.toFixed(1)},${ey.toFixed(1)}`;
  };
  const color = levelColor(Math.round(score));
  return (
    <svg viewBox="0 0 180 100" style={{ width: "100%", maxWidth: 200 }}>
      <path d={describeArc(-180, 0)} fill="none" stroke="var(--border)" strokeWidth="12" strokeLinecap="round" />
      <path d={describeArc(-180, -180 + pct)} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" />
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize="22" fontWeight="800" fill={color}>{score.toFixed(1)}</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize="10" fill="var(--muted-foreground)">out of 5.0</text>
      <text x={cx} y={cy + 26} textAnchor="middle" fontSize="12" fontWeight="700" fill={color}>{levelLabel(Math.round(score))}</text>
    </svg>
  );
}

// ── Assessment wizard ─────────────────────────────────────────────────────────
function AssessmentWizard({ domains, onComplete }:
  { domains: typeof DOMAINS; onComplete: (overrides: Record<string, Record<string, number>>) => void }) {
  const [step, setStep] = useState(0);   // domain index
  const [dimStep, setDimStep] = useState(0); // 0=people 1=governance 2=controls
  const [answers, setAnswers] = useState<Record<string, Record<string, number[]>>>({}); // {domainId: {dim: [0|1|...]}}
  const [finished, setFinished] = useState(false);

  const domain = domains[step]!;
  const dimKey = DIMENSIONS[dimStep]!.key;
  const questions = QUESTIONS[dimKey]?.[domain.id] ?? [];
  const domainAnswers = answers[domain.id] ?? {};
  const dimAnswers: number[] = domainAnswers[dimKey] ?? Array(questions.length).fill(-1);

  const setAnswer = (qi: number, val: number) => {
    setAnswers(prev => ({
      ...prev,
      [domain.id]: {
        ...(prev[domain.id] ?? {}),
        [dimKey]: Object.assign([...((prev[domain.id] ?? {})[dimKey] ?? Array(questions.length).fill(-1))], { [qi]: val }),
      },
    }));
  };

  const canAdvanceDim = dimAnswers.every(a => a >= 0);

  const next = () => {
    if (dimStep < 2) { setDimStep(d => d + 1); return; }
    if (step < domains.length - 1) { setStep(s => s + 1); setDimStep(0); return; }
    // Compute overrides
    const overrides: Record<string, Record<string, number>> = {};
    for (const [dId, dims] of Object.entries(answers)) {
      overrides[dId] = {};
      for (const [dk, ans] of Object.entries(dims)) {
        const yes = (ans as number[]).filter(a => a === 1).length;
        const tot = (ans as number[]).length;
        const pct = tot === 0 ? 0 : yes / tot;
        overrides[dId]![dk] = Math.max(1, Math.ceil(pct * 5));
      }
    }
    onComplete(overrides);
    setFinished(true);
  };

  const prevStep = () => {
    if (dimStep > 0) { setDimStep(d => d - 1); return; }
    if (step > 0) { setStep(s => s - 1); setDimStep(2); }
  };

  const dim = DIMENSIONS[dimStep]!;
  const totalSteps = domains.length * 3;
  const currentStep = step * 3 + dimStep + 1;
  const progress = (currentStep / totalSteps) * 100;

  if (finished) {
    return (
      <div style={{ textAlign: "center", padding: "48px 24px" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
        <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 8 }}>Assessment Complete</div>
        <div style={{ color: "var(--muted-foreground)", marginBottom: 24 }}>Your maturity scores have been updated based on your responses. View the Heatmap and Outcomes tabs for detailed analysis.</div>
        <button onClick={() => { setStep(0); setDimStep(0); setAnswers({}); setFinished(false); }}
          style={{ padding: "8px 20px", borderRadius: 8, background: NAV, border: "none", cursor: "pointer", fontWeight: 600, color: "#0F172A" }}>
          Retake Assessment
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      {/* Progress */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12, color: "var(--muted-foreground)" }}>
          <span>Domain {step + 1}/{domains.length}: {domain.label}</span>
          <span>{currentStep}/{totalSteps} questions</span>
        </div>
        <div style={{ height: 6, background: "var(--border)", borderRadius: 99 }}>
          <div style={{ width: progress + "%", height: "100%", background: dim.color, borderRadius: 99, transition: "width .3s" }} />
        </div>
      </div>

      {/* Domain + dimension header */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        {DIMENSIONS.map((d, i) => (
          <div key={d.key} style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1.5px solid " + (i === dimStep ? d.color : "var(--border)"), background: i === dimStep ? d.bg : "transparent", transition: "all .2s" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: i === dimStep ? d.color : "var(--muted-foreground)" }}>{d.label}</div>
            <div style={{ fontSize: 9, color: "var(--muted-foreground)" }}>{d.desc}</div>
          </div>
        ))}
      </div>

      {/* Domain info */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", gap: 12, alignItems: "center" }}>
        <span style={{ fontSize: 24 }}>{domain.icon}</span>
        <div>
          <div style={{ fontWeight: 700 }}>{domain.label}</div>
          <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{dim.desc}</div>
        </div>
        {domain.auditFindings > 0 && (
          <div style={{ marginLeft: "auto", background: RED + "20", border: "1px solid " + RED + "66", borderRadius: 6, padding: "4px 10px", fontSize: 11, color: RED, fontWeight: 700 }}>
            {domain.auditFindings} open finding{domain.auditFindings > 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Questions */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
        {questions.map((q, qi) => (
          <div key={qi} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, lineHeight: 1.4 }}>{q}</div>
            <div style={{ display: "flex", gap: 8 }}>
              {[["✅ Yes", 1, EME], ["⚠️ Partial", 0.5, AMB], ["❌ No", 0, RED]].map(([lab, val, col]) => (
                <button key={String(val)}
                  onClick={() => setAnswer(qi, Number(val))}
                  style={{
                    flex: 1, padding: "8px 4px", borderRadius: 8, border: "1.5px solid " + (dimAnswers[qi] === Number(val) ? col : "var(--border)"),
                    background: dimAnswers[qi] === Number(val) ? col + "22" : "transparent",
                    cursor: "pointer", fontSize: 12, fontWeight: 600,
                    color: dimAnswers[qi] === Number(val) ? col as string : "var(--muted-foreground)",
                    transition: "all .15s",
                  }}>
                  {lab}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Navigation */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <button onClick={prevStep} disabled={step === 0 && dimStep === 0}
          style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", cursor: "pointer", fontWeight: 600, opacity: step === 0 && dimStep === 0 ? 0.4 : 1 }}>
          ← Back
        </button>
        <button onClick={next} disabled={!canAdvanceDim}
          style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: canAdvanceDim ? dim.color : "var(--border)", cursor: canAdvanceDim ? "pointer" : "not-allowed", fontWeight: 700, color: "#0F172A", opacity: canAdvanceDim ? 1 : 0.5 }}>
          {step === domains.length - 1 && dimStep === 2 ? "Complete Assessment →" : "Next →"}
        </button>
      </div>
    </div>
  );
}

// ── Outcomes & roadmap ────────────────────────────────────────────────────────
function OutcomesPanel({ domains }: { domains: typeof DOMAINS }) {
  const sorted = [...domains].sort((a, b) => composite(a) - composite(b));
  const critical = sorted.filter(d => composite(d) < 2.5);
  const improving = sorted.filter(d => composite(d) >= 2.5 && composite(d) < 3.5);
  const strong = sorted.filter(d => composite(d) >= 3.5);

  const roadmap = [
    { q: "Q3 2025", actions: critical.map(d => `Remediate ${d.label} — lift to Defined (Level 3)`).concat(["Deploy CSPM auto-remediation", "Complete vendor DPAs for all EU-data processors"]).slice(0, 3), color: RED },
    { q: "Q4 2025", actions: improving.filter((_, i) => i < 2).map(d => `Advance ${d.label} from Defined to Managed (Level 4)`).concat(["Implement PAM solution for privileged accounts"]).slice(0, 3), color: AMB },
    { q: "Q1 2026", actions: ["Integrate SAST/DAST across all 12 CI/CD pipelines", "Automate quarterly access reviews via IGA platform", "Deploy security ratings for top 20 critical vendors"].slice(0, 3), color: EME },
    { q: "Q2 2026", actions: ["Target Optimizing (Level 5) for IAM, Governance, Physical Security", "Implement FAIR-based quantitative risk reporting to board", "Complete ISO 27001 re-certification with zero major NCs"].slice(0, 3), color: NAV },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Summary bands */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {[
          { label: "Critical Priority", items: critical, color: RED, icon: "🔴" },
          { label: "Needs Improvement", items: improving, color: AMB, icon: "🟡" },
          { label: "Strong / Leading", items: strong, color: EME, icon: "🟢" },
        ].map(band => (
          <div key={band.label} style={{ background: "var(--card)", border: "1px solid " + band.color + "44", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: band.color }}>{band.icon} {band.label}</div>
            {band.items.length === 0
              ? <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>None at this level</div>
              : band.items.map(d => (
                <div key={d.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ fontSize: 12 }}>{d.icon} {d.label}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: levelColor(Math.round(composite(d))) }}>{composite(d).toFixed(1)}</div>
                </div>
              ))}
          </div>
        ))}
      </div>

      {/* Finding-based gap table */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 14 }}>
          Gap Analysis — Extracted from Audits & Controls
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--muted)", fontSize: 11 }}>
                {["Domain", "Score", "Finding", "Recommendation", "Priority"].map(h => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "var(--muted-foreground)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((d, i) => {
                const score = composite(d);
                const priority = score < 2.5 ? { label: "Critical", color: RED } : score < 3.5 ? { label: "High", color: AMB } : { label: "Medium", color: EME };
                return (
                  <tr key={d.id} style={{ borderBottom: "1px solid var(--border)", fontSize: 12 }}>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span>{d.icon}</span><span style={{ fontWeight: 600 }}>{d.label}</span>
                      </div>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ fontWeight: 700, color: levelColor(Math.round(score)) }}>{score.toFixed(1)} — {levelLabel(Math.round(score))}</span>
                    </td>
                    <td style={{ padding: "10px 12px", color: "var(--muted-foreground)", maxWidth: 220 }}>{d.finding}</td>
                    <td style={{ padding: "10px 12px", color: "var(--muted-foreground)", maxWidth: 220 }}>{d.recommendation}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ background: priority.color + "20", color: priority.color, border: "1px solid " + priority.color + "44", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                        {priority.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Roadmap */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px" }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Remediation Roadmap</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
          {roadmap.map(rq => (
            <div key={rq.q} style={{ border: "1.5px solid " + rq.color + "55", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: rq.color, marginBottom: 10 }}>{rq.q}</div>
              {rq.actions.map((a, i) => (
                <div key={i} style={{ fontSize: 11, marginBottom: 7, display: "flex", gap: 6, lineHeight: 1.4 }}>
                  <span style={{ color: rq.color, flexShrink: 0, marginTop: 1 }}>▸</span>
                  <span style={{ color: "var(--muted-foreground)" }}>{a}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MaturityModel() {
  const { orgName } = useOrg();
  const [tab, setTab] = useState("overview");
  const [selectedCell, setSelectedCell] = useState<{ domain: typeof DOMAINS[0]; dim: typeof DIMENSIONS[0] } | null>(null);

  // Allow assessment overrides to update scores
  const [overrides, setOverrides] = useState<Record<string, Record<string, number>>>({});
  const [assessmentDone, setAssessmentDone] = useState(false);

  const domains = useMemo(() => DOMAINS.map(d => {
    const ov = overrides[d.id];
    if (!ov) return d;
    return {
      ...d,
      people:     ov["people"]     ?? d.people,
      governance: ov["governance"] ?? d.governance,
      controls:   ov["controls"]   ?? d.controls,
    };
  }), [overrides]);

  const overall = overallScore(domains);
  const peopleAvg     = Math.round(domains.reduce((a, d) => a + d.people, 0) / domains.length * 10) / 10;
  const govAvg        = Math.round(domains.reduce((a, d) => a + d.governance, 0) / domains.length * 10) / 10;
  const controlsAvg   = Math.round(domains.reduce((a, d) => a + d.controls, 0) / domains.length * 10) / 10;

  const handleAssessmentComplete = (ov: Record<string, Record<string, number>>) => {
    setOverrides(ov);
    setAssessmentDone(true);
    setTimeout(() => setTab("heatmap"), 800);
  };

  const TABS = [
    { id: "overview",   label: "Overview" },
    { id: "heatmap",    label: "Heatmap" },
    { id: "model",      label: "Maturity Model" },
    { id: "assessment", label: "Self-Assessment" + (assessmentDone ? " ✓" : "") },
    { id: "outcomes",   label: "Outcomes & Roadmap" },
  ];

  return (
    <div style={{ padding: "0 0 40px" }}>
      <SubNav
        module="maturity"
        tabs={TABS.map(t => t.id)}
        tabLabels={Object.fromEntries(TABS.map(t => [t.id, t.label]))}
        activeTab={tab}
        onTab={setTab}
      >
        <ModuleHeader icon="📊" title="Cyber Maturity Model" subtitle={`${orgName} — Security Maturity Assessment & Heatmap`}>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ background: levelBg(Math.round(overall)), border: "1px solid " + levelColor(Math.round(overall)) + "55", color: levelColor(Math.round(overall)), borderRadius: 8, padding: "4px 12px", fontSize: 13, fontWeight: 700 }}>
              Overall: {overall.toFixed(1)} — {levelLabel(Math.round(overall))}
            </span>
            <button
              onClick={() => setTab("assessment")}
              style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid " + NAV + "66", background: NAV + "22", cursor: "pointer", fontSize: 12, fontWeight: 600, color: NAV }}>
              Run Assessment
            </button>
          </div>
        </ModuleHeader>
      </SubNav>

      <div style={{ padding: "24px 32px" }}>

        {/* ── OVERVIEW ── */}
        {tab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* KPI row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12 }}>
              {[
                { label: "Overall Maturity", value: overall.toFixed(1), sub: levelLabel(Math.round(overall)), color: levelColor(Math.round(overall)) },
                { label: "People",    value: peopleAvg.toFixed(1),   sub: levelLabel(Math.round(peopleAvg)),    color: DIM_PEOPLE.color },
                { label: "Governance",value: govAvg.toFixed(1),      sub: levelLabel(Math.round(govAvg)),       color: DIM_GOVERNANCE.color },
                { label: "Controls",  value: controlsAvg.toFixed(1), sub: levelLabel(Math.round(controlsAvg)),  color: DIM_CONTROLS.color },
                { label: "Open Findings", value: String(domains.reduce((a, d) => a + d.auditFindings, 0)), sub: "from linked audits", color: RED },
              ].map(k => (
                <div key={k.label} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px", textAlign: "center" }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: k.color, fontFamily: "'JetBrains Mono',monospace" }}>{k.value}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", marginTop: 2 }}>{k.label}</div>
                  <div style={{ fontSize: 10, color: k.color, marginTop: 2 }}>{k.sub}</div>
                </div>
              ))}
            </div>

            {/* Radar + Gauge + Dimension bars */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 200px 1fr", gap: 16 }}>
              <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ fontWeight: 700, marginBottom: 8, alignSelf: "flex-start" }}>Domain Radar</div>
                <RadarChart domains={domains} />
              </div>
              <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Score</div>
                <Gauge score={overall} />
                <div style={{ marginTop: 12, width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
                  <ScoreBar score={peopleAvg}   color={DIM_PEOPLE.color}     label="People" />
                  <ScoreBar score={govAvg}       color={DIM_GOVERNANCE.color} label="Governance" />
                  <ScoreBar score={controlsAvg}  color={DIM_CONTROLS.color}   label="Controls" />
                </div>
              </div>
              <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px" }}>
                <div style={{ fontWeight: 700, marginBottom: 12 }}>Domain Scores</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  {[...domains].sort((a, b) => composite(a) - composite(b)).map(d => {
                    const sc       = composite(d);
                    const lvl      = Math.round(sc);
                    const col      = levelColor(lvl);
                    const improved = sc > composite({ ...d, people: d.people > 1 ? d.people - 0.1 : d.people, governance: d.governance, controls: d.controls }) && (d as any).auditFindings === 0;
                    const implPct    = d.totalControls ? Math.round((d.implemented / d.totalControls) * 100) : 0;
                    const partialPct = d.totalControls ? Math.round((d.partial / d.totalControls) * 100) : 0;
                    return (
                      <div key={d.id}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 13 }}>{d.icon}</span>
                          <div style={{ flex: 1, fontSize: 11, fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.label}</div>
                          <span style={{ background: col + "20", color: col, border: "1px solid " + col + "44", borderRadius: 4, padding: "1px 7px", fontSize: 9, fontWeight: 800, flexShrink: 0 }}>
                            L{lvl} {levelLabel(lvl)}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1, height: 7, background: "rgba(255,255,255,0.07)", borderRadius: 4, overflow: "hidden", display: "flex" }}>
                            <div style={{ width: implPct + "%", height: "100%", background: col }} />
                            <div style={{ width: partialPct + "%", height: "100%", background: AMB }} />
                          </div>
                          <span style={{ fontSize: 9, color: "var(--muted-foreground)", whiteSpace: "nowrap", flexShrink: 0 }}>
                            {d.implemented}/{d.totalControls} ({implPct}%)
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Insights from audit data */}
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px" }}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>Key Insights — Extracted from Audits & Controls</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                {domains.filter(d => d.auditFindings > 0).map(d => (
                  <div key={d.id} style={{ background: RED + "10", border: "1px solid " + RED + "33", borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                      <span>{d.icon}</span>
                      <span style={{ fontWeight: 700, fontSize: 12 }}>{d.label}</span>
                      <span style={{ marginLeft: "auto", fontSize: 10, color: RED, fontWeight: 700 }}>{d.auditFindings} finding{d.auditFindings > 1 ? "s" : ""}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.4 }}>{d.finding}</div>
                    <div style={{ marginTop: 6, fontSize: 10, color: EME, fontWeight: 600 }}>→ {d.recommendation}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── HEATMAP ── */}
        {tab === "heatmap" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Legend */}
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>Maturity Level:</span>
              {LEVELS.map(lv => (
                <div key={lv.n} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 14, height: 14, borderRadius: 3, background: lv.bg, border: "1.5px solid " + lv.color }} />
                  <span style={{ fontSize: 11, color: lv.color, fontWeight: 700 }}>{lv.n} — {lv.label}</span>
                </div>
              ))}
              <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted-foreground)" }}>Click any cell for details</span>
            </div>

            {/* Grid */}
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, color: "var(--muted-foreground)", borderBottom: "1px solid var(--border)", width: 180 }}>Domain</th>
                    {DIMENSIONS.map(dim => (
                      <th key={dim.key} style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontSize: 12, fontWeight: 700, color: dim.color, textAlign: "center" }}>
                        <div>{dim.label}</div>
                        <div style={{ fontSize: 10, fontWeight: 400, color: "var(--muted-foreground)" }}>{dim.desc}</div>
                      </th>
                    ))}
                    <th style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontSize: 12, fontWeight: 700, color: "var(--muted-foreground)", textAlign: "center" }}>Composite</th>
                  </tr>
                </thead>
                <tbody>
                  {domains.map(d => {
                    const sc = composite(d);
                    return (
                      <tr key={d.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "10px 16px" }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <span>{d.icon}</span>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 13 }}>{d.label}</div>
                              {d.auditFindings > 0 && <div style={{ fontSize: 10, color: RED, fontWeight: 600 }}>{d.auditFindings} open finding{d.auditFindings > 1 ? "s" : ""}</div>}
                            </div>
                          </div>
                        </td>
                        {DIMENSIONS.map(dim => {
                          const score = dim.key === "people" ? d.people : dim.key === "governance" ? d.governance : d.controls;
                          return (
                            <td key={dim.key} style={{ padding: "8px 10px" }}>
                              <HeatCell score={score} dim={dim} domainLabel={d.label} onClick={() => setSelectedCell({ domain: d, dim })} />
                            </td>
                          );
                        })}
                        <td style={{ padding: "10px 16px", textAlign: "center" }}>
                          <div style={{ fontWeight: 800, fontSize: 15, color: levelColor(Math.round(sc)) }}>{sc.toFixed(1)}</div>
                          <div style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{levelLabel(Math.round(sc))}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Cell detail */}
            {selectedCell && (
              <div style={{ background: "var(--card)", border: "2px solid " + selectedCell.dim.color + "88", borderRadius: 12, padding: "20px 24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 16 }}>{selectedCell.domain.icon} {selectedCell.domain.label} — {selectedCell.dim.label}</div>
                    <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>{selectedCell.dim.desc}</div>
                  </div>
                  <button onClick={() => setSelectedCell(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--muted-foreground)" }}>✕</button>
                </div>
                <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  {LEVELS.map(lv => {
                    const score = selectedCell.dim.key === "people" ? selectedCell.domain.people : selectedCell.dim.key === "governance" ? selectedCell.domain.governance : selectedCell.domain.controls;
                    const isCurrent = score === lv.n;
                    return (
                      <div key={lv.n} style={{ border: "1.5px solid " + (isCurrent ? lv.color : "var(--border)"), background: isCurrent ? lv.bg : "transparent", borderRadius: 8, padding: "10px 12px" }}>
                        <div style={{ fontWeight: 700, fontSize: 12, color: lv.color, marginBottom: 4 }}>
                          {isCurrent ? "▶ " : ""}{lv.n}. {lv.label}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.4 }}>
                          {lv[selectedCell.dim.key as "people" | "governance" | "controls"]}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {selectedCell.domain.auditFindings > 0 && (
                  <div style={{ marginTop: 14, background: RED + "10", border: "1px solid " + RED + "33", borderRadius: 8, padding: "10px 14px" }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: RED, marginBottom: 4 }}>Linked Finding</div>
                    <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{selectedCell.domain.finding}</div>
                  </div>
                )}
                <div style={{ marginTop: 10, background: EME + "10", border: "1px solid " + EME + "33", borderRadius: 8, padding: "10px 14px" }}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: EME, marginBottom: 4 }}>Recommendation</div>
                  <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{selectedCell.domain.recommendation}</div>
                </div>
                {selectedCell.domain.linkedControls.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Linked Controls</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {selectedCell.domain.linkedControls.map(c => (
                        <span key={c} style={{ background: NAV + "20", border: "1px solid " + NAV + "44", color: NAV, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>{c}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── MATURITY MODEL (staircase) ── */}
        {tab === "model" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "20px 24px" }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Cybersecurity Maturity Model — 5 Levels × 3 Dimensions</div>
              <div style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 20 }}>Each level describes the state of your People, Governance, and Controls. Use this model to understand where you are and what "next" looks like.</div>
              <LevelStaircase />
            </div>

            {/* Full level detail table */}
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--muted)" }}>
                    {["Level", "People (Blue)", "Governance (Green)", "Controls (Red)"].map(h => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", borderBottom: "1px solid var(--border)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {LEVELS.map(lv => (
                    <tr key={lv.n} style={{ borderBottom: "1px solid var(--border)", background: lv.bg }}>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ fontWeight: 800, color: lv.color }}>{lv.n}. {lv.label}</div>
                      </td>
                      <td style={{ padding: "12px 14px", fontSize: 13, color: "var(--foreground)" }}>{lv.people}</td>
                      <td style={{ padding: "12px 14px", fontSize: 13, color: "var(--foreground)" }}>{lv.governance}</td>
                      <td style={{ padding: "12px 14px", fontSize: 13, color: "var(--foreground)" }}>{lv.controls}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Domain current vs target */}
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "20px 24px" }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Current vs Target — by Domain</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {domains.map(d => {
                  const curr = composite(d);
                  const target = Math.min(5, curr + 1);
                  return (
                    <div key={d.id}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                        <span style={{ fontWeight: 600 }}>{d.icon} {d.label}</span>
                        <span style={{ color: "var(--muted-foreground)" }}>Current: <b style={{ color: levelColor(Math.round(curr)) }}>{curr.toFixed(1)}</b> → Target: <b style={{ color: levelColor(Math.ceil(target)) }}>{target.toFixed(1)}</b></span>
                      </div>
                      <div style={{ position: "relative", height: 10, background: "var(--border)", borderRadius: 99 }}>
                        <div style={{ position: "absolute", left: 0, top: 0, width: (curr / 5) * 100 + "%", height: "100%", background: levelColor(Math.round(curr)), borderRadius: 99 }} />
                        <div style={{ position: "absolute", left: (target / 5) * 100 + "%", top: -2, width: 2, height: 14, background: levelColor(Math.ceil(target)), borderRadius: 1 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 16, fontSize: 11, color: "var(--muted-foreground)" }}>
                <span>█ Current score</span><span>| Target marker</span>
              </div>
            </div>
          </div>
        )}

        {/* ── ASSESSMENT ── */}
        {tab === "assessment" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px 20px" }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Self-Assessment Wizard</div>
              <div style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
                Answer questions for each domain across three dimensions — People, Governance, and Controls.
                Scores are automatically extracted from your audit findings and control status, then refined by your answers.
                Results update the Heatmap and Outcomes tabs immediately.
              </div>
            </div>
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "24px" }}>
              <AssessmentWizard domains={domains} onComplete={handleAssessmentComplete} />
            </div>
          </div>
        )}

        {/* ── OUTCOMES & ROADMAP ── */}
        {tab === "outcomes" && <OutcomesPanel domains={domains} />}

      </div>
    </div>
  );
}
