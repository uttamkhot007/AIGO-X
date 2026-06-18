import { useState, useEffect, createContext, useContext } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useDashboardKpis, useDashboardActivity, useRisks } from "@/hooks/useGrcApi";
import { Drawer, Field, DrawerSection } from "@/components/Drawer";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useOrg } from "@/context/OrgContext";
import { AICopilotBar } from "@/components/AICopilotBar";
import { ENT_SCORE, ENT_CRITICAL, ENT_HIGH, ENT_ATTACK_PATHS, ENT_SECRETS_EXPOSED, getProviderCounts, topOpenCritical } from "@/lib/cloudops-shared";

const aiInsights = [
  { id: "ai1", category: "Risk",       insight: "3 critical risks require immediate remediation — estimated exposure reduced by 42% if addressed this sprint.", confidence: 94, action: "Review RiskOps" },
  { id: "ai2", category: "Compliance", insight: "ISO 27001 certification at 87% readiness. 6 controls in 'partial' status are blocking full certification.",      confidence: 91, action: "View Controls" },
  { id: "ai3", category: "Threat",     insight: "Credential stuffing attack pattern detected across 4 tenants. Recommend enforcing MFA on all admin accounts.",   confidence: 88, action: "Go to SecOps" },
  { id: "ai4", category: "Policy",     insight: "Access Control Policy v3.2 approved but not yet distributed to 14 staff members.",                              confidence: 97, action: "Go to GovOps" },
];

const sev: Record<string, { bg: string; color: string; border: string }> = {
  Critical: { bg: "rgba(239,68,68,0.06)", color: "#991B1B", border: "#FECACA" },
  High:     { bg: "rgba(245,158,11,0.06)", color: "#92400E", border: "#FDE68A" },
  Medium:   { bg: "#EEF2FF", color: "#3730A3", border: "#C7D2FE" },
  Low:      { bg: "rgba(34,197,94,0.08)", color: "#065F46", border: "#A7F3D0" },
};

const KPI_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  "grc-score":  { color: "rgb(147,197,253)", bg: "rgba(59,130,246,0.12)",  border: "#BFDBFE" },
  "open-risks": { color: "#92400E", bg: "rgba(245,158,11,0.06)",  border: "#FDE68A" },
  "controls":   { color: "#065F46", bg: "rgba(34,197,94,0.08)",  border: "#A7F3D0" },
  "audits":     { color: "#4338CA", bg: "#EEF2FF",  border: "#C7D2FE" },
  "privacy":    { color: "#065F46", bg: "rgba(34,197,94,0.08)",  border: "#BBF7D0" },
};

const KPI_NAV: Record<string, string> = {
  "grc-score":  "/govops",
  "open-risks": "/riskops",
  "controls":   "/complianceops",
  "audits":     "/govops",
  "privacy":    "/privacyops",
};

const ACT_NAV: Record<string, string> = {
  "Risk": "/riskops", "Compliance": "/complianceops", "AI vCISO": "/ai",
  "Security": "/secops", "Privacy": "/privacyops", "Service Desk": "/serviceops",
};

const RISK_THREATS: Record<string, string> = {
  "Cloud Security":    "External — Cloud misconfiguration, insider threat",
  "Identity & Access": "External/Internal — Credential theft, privilege escalation",
  "Vulnerability":     "External — Known CVE exploitation by threat actors",
  "Third-Party Risk":  "Supply chain — Vendor data breach, contractual breach",
  "Privacy":           "Regulatory — GDPR enforcement, data subject complaints",
  "Network Security":  "External — Lateral movement, network intrusion",
  "Infrastructure":    "External — Man-in-the-middle, impersonation attacks",
  "Asset Management":  "Internal — Shadow IT, unmanaged device compromise",
  "Cyber":             "External APT — Ransomware, zero-day exploitation",
  "Operational":       "Internal/External — Process failure, service disruption",
  "Financial":         "Internal/External — Fraud, financial misstatement",
  "Legal":             "Regulatory — Contractual breach, litigation exposure",
  "Compliance":        "Regulatory — Audit finding, certification non-conformity",
  "Data":              "External/Internal — Data exfiltration, unauthorised access",
  "Physical":          "External — Unauthorized physical access, environmental hazard",
  "Reputational":      "External/Internal — Public disclosure, media incident",
  "Strategic":         "External — Market shift, competitive pressure, M&A risk",
  "AI":                "External/Internal — Model manipulation, algorithmic bias",
  "Audit":             "Regulatory — Control deficiency, material weakness",
  "HR":                "Internal — Insider threat, workforce non-compliance",
  "Vendor":            "Supply chain — Third-party security failure, dependency risk",
  "Supply Chain":      "External — Supplier compromise, counterfeit components",
};
const RISK_VECTORS: Record<string, string> = {
  "Cloud Security":    "Network / Misconfigured public cloud access",
  "Identity & Access": "Remote / Compromised credentials",
  "Vulnerability":     "Network / Unauthenticated remote code execution",
  "Third-Party Risk":  "Supply chain / Vendor API access",
  "Privacy":           "Process failure / Regulatory non-compliance",
  "Network Security":  "Adjacent network / Firewall bypass",
  "Infrastructure":    "Network / TLS interception",
  "Asset Management":  "Physical / Unmanaged device",
  "Cyber":             "Network / Remote code execution",
  "Operational":       "Internal process / System or service failure",
  "Financial":         "Internal process / Financial control bypass",
  "Legal":             "Contractual / Regulatory non-compliance",
  "Compliance":        "Process / Inadequate evidence or control operation",
  "Data":              "Network / Unauthorised data access or transfer",
  "Physical":          "Physical / Perimeter breach or environmental event",
  "Reputational":      "Social / Public disclosure or media exposure",
  "Strategic":         "Market / External competitive or regulatory shift",
  "AI":                "System / Model input manipulation or drift",
  "Audit":             "Process / Control design or operating effectiveness gap",
  "HR":                "Internal / Privileged user misuse or social engineering",
  "Vendor":            "Supply chain / Third-party access or dependency",
  "Supply Chain":      "External / Compromised upstream supplier",
};
const RISK_RECS: Record<string, string[]> = {
  "Cloud Security":    ["Enable Block Public Access policy at account level immediately","Deploy AWS Config / Azure Policy rules to detect open buckets","Run Macie scan for sensitive data in misconfigured storage"],
  "Identity & Access": ["Enforce MFA for all privileged accounts within 24 hours","Implement just-in-time PAM with session recording","Audit and revoke stale privileged sessions older than 7 days"],
  "Vulnerability":     ["Apply patch in next maintenance window — test in staging first","Isolate affected servers behind additional WAF rules until patched","Deploy eBPF-based runtime threat detection as interim control"],
  "Third-Party Risk":  ["Obtain signed DPA from vendor within 5 business days","Suspend vendor data processing until DPA is executed","Escalate to Legal for GDPR Article 28 compliance review"],
  "Privacy":           ["Assign open DSARs to dedicated responders immediately","Deploy automated DSAR acknowledgement within 24-hour SLA","Implement GDPR Art. 15 response template with automated redaction"],
  "Network Security":  ["Conduct emergency firewall rule audit within 48 hours","Remove or formally document stale rules with signed risk acceptance","Implement quarterly firewall rule recertification workflow"],
  "Infrastructure":    ["Renew expiring SSL certificates within 48 hours","Enable auto-renewal via ACME / Let's Encrypt with monitoring","Deploy certificate expiry alerting with 30-day threshold"],
  "Asset Management":  ["Conduct IoT device discovery scan across affected subnet","Register all discovered devices in CMDB with owner and classification","Deploy NAC (802.1X) to enforce IoT network segmentation"],
};
const RISK_CONTROLS: Record<string, string[]> = {
  "Cloud Security":    ["A.12.1.1 — Documented operating procedures","A.12.6.1 — Technical vulnerability management","CC7.2 — SOC 2 system monitoring"],
  "Identity & Access": ["A.9.4.2 — Secure log-on procedures","CC6.1 — SOC 2 logical access controls","164.312.a — HIPAA access control"],
  "Vulnerability":     ["A.12.6.1 — Technical vulnerability management","A.16.1.1 — Incident management","NIS2-ART21 — Cybersecurity risk measures"],
  "Third-Party Risk":  ["A.15.1.2 — Security in supplier agreements","ART-30 — GDPR records of processing","CC9.2 — SOC 2 vendor management"],
  "Privacy":           ["ART-30 — Records of processing activities","ART-32 — Security of processing","NIS2-ART23 — Incident notification"],
  "Network Security":  ["A.13.1.1 — Network controls","A.12.6.1 — Vulnerability management","CC7.2 — System monitoring"],
  "Infrastructure":    ["A.10.1.1 — Cryptographic controls policy","A.12.6.1 — Vulnerability management","CC7.2 — System monitoring"],
  "Asset Management":  ["A.8.1.1 — Inventory of assets","A.8.1.2 — Ownership of assets","A.13.1.3 — Segregation in networks"],
};

function getRiskAI(r: { severity: string; category: string; score: number; status: string }) {
  const key = Object.keys(RISK_RECS).find(k => r.category.includes(k)) ?? r.category;
  const cvss = r.severity === "Critical" ? Math.min(10, 8.5 + (r.score % 5) * 0.1) :
               r.severity === "High"     ? Math.min(10, 6.5 + (r.score % 5) * 0.1) :
               r.severity === "Medium"   ? 4.0 + (r.score % 5) * 0.1 : 1.5 + (r.score % 3) * 0.1;
  return {
    threat:     RISK_THREATS[key]  ?? "External/Internal — Advanced persistent threat actor",
    vector:     RISK_VECTORS[key]  ?? "Network / Multi-vector attack surface",
    recs:       RISK_RECS[key]     ?? ["Review controls","Update treatment plan","Escalate if SLA breached"],
    controls:   RISK_CONTROLS[key] ?? ["A.5.1 — Policies for information security"],
    cvss:       Number(cvss.toFixed(1)),
    likelihood: r.severity === "Critical" ? "Very High" : r.severity === "High" ? "High" : r.severity === "Medium" ? "Medium" : "Low",
    impact:     r.severity === "Critical" ? "Severe"   : r.severity === "High"  ? "Major" : r.severity === "Medium" ? "Moderate" : "Minor",
    treatment:  r.status === "in-progress" ? "Mitigate — In Progress" : r.status === "accepted" ? "Accept — Risk Accepted" : "Mitigate — Pending",
    confidence: 88 + (Math.floor(r.score) % 10),
  };
}

interface DashMeta {
  grcScore: number; grcLabel: string; coverage: number;
  openRisks: number; criticalRisks: number;
  activeAudits: number;
  privacyScore: number; openDsars: number; overdueDsars: number; totalDsars: number;
  totalUsers: number; openTickets: number; accessReviews: number;
  vendorAvgScore: number; criticalVendors: number;
}
const META0: DashMeta = {
  grcScore:0, grcLabel:"No Data", coverage:0,
  openRisks:0, criticalRisks:0, activeAudits:0,
  privacyScore:0, openDsars:0, overdueDsars:0, totalDsars:0,
  totalUsers:0, openTickets:0, accessReviews:0,
  vendorAvgScore:0, criticalVendors:0,
};
interface DashLive {
  kpis: any[];
  riskSegments: any[];
  frameworks: any[];
  risks: any[];
  activity: any[];
  meta: DashMeta;
}
const LiveCtx = createContext<DashLive>({ kpis: [], riskSegments: [], frameworks: [], risks: [], activity: [], meta: META0 });
function useLive(): DashLive { return useContext(LiveCtx); }

function RiskGauge({ segs = [] }: { segs?: any[] }) {
  const r = 78, cx = 100, cy = 100;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const totalRisks = segs.reduce((s, x) => s + x.count, 0);
  return (
    <svg width={200} height={200} viewBox="0 0 200 200">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={16} />
      {segs.map((s, i) => {
        const dash = s.pct * circ;
        const gap = circ - dash;
        const rot = offset * 360 - 90;
        offset += s.pct;
        return <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth={16}
          strokeDasharray={`${dash} ${gap}`} strokeDashoffset={0} transform={`rotate(${rot} ${cx} ${cy})`} />;
      })}
      <text x={cx} y={cy - 6} textAnchor="middle" fill="#1E3A5F" fontSize={30} fontWeight={800} fontFamily="JetBrains Mono, monospace">{totalRisks}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill="var(--muted-foreground)" fontSize={9} fontFamily="Plus Jakarta Sans, sans-serif" fontWeight={600} letterSpacing="1">OPEN RISKS</text>
    </svg>
  );
}

function KpiCard({ label, value, unit, color, bg, border, delta, up, onClick }: { label: string; value: number | string; unit?: string; color?: string; bg?: string; border?: string; delta?: string; up?: boolean; onClick?: () => void }) {
  return (
    <div style={{
      background: "var(--card)", border: `1px solid ${border}`, borderRadius: 12, padding: "14px 16px",
      boxShadow: "0 2px 16px rgba(0,0,0,0.45)", position: "relative", overflow: "hidden",
      transition: "box-shadow 0.2s, transform 0.2s", cursor: "pointer",
    }}
      onClick={onClick}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 24px rgba(0,0,0,0.18)"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 16px rgba(0,0,0,0.45)"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)"; }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: color, opacity: 0.7, borderRadius: "12px 12px 0 0" }} />
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.5px", marginBottom: 8, textTransform: "uppercase" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
        <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-1px", fontFamily: "'JetBrains Mono', monospace", color }}>{value}</span>
        <span style={{ fontSize: 13, color: "var(--muted-foreground)", fontFamily: "'JetBrains Mono', monospace" }}>{unit}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6, fontSize: 11, fontWeight: 600, color: up ? "#065F46" : "#DC2626" }}>
        <span>{up ? "▲" : "▼"}</span><span>{delta}</span>
        <span style={{ color: "var(--muted-foreground)", fontWeight: 400 }}>vs last month</span>
      </div>
    </div>
  );
}

function AiBanner({ insightIdx, setInsightIdx }: { insightIdx: number; setInsightIdx: (i: number) => void }) {
  const ins = aiInsights[insightIdx];
  return (
    <div className="ai-banner" style={{
      border: "1px solid rgba(99,179,237,0.25)", borderRadius: 10, padding: "10px 16px",
      display: "flex", alignItems: "center", gap: 12, boxShadow: "0 1px 3px rgba(30,58,95,0.08)",
    }}>
      <div style={{ background: "linear-gradient(135deg, #1E3A5F, #065F46)", borderRadius: 6, padding: "4px 10px", fontSize: 10, fontWeight: 700, letterSpacing: "0.5px", color: "white", flexShrink: 0 }}>AI INSIGHT</div>
      <span style={{ fontSize: 12, color: "var(--foreground)", fontWeight: 500, flex: 1 }}>{(ins as any).insight ?? (ins as any).text}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
        {aiInsights.map((_, i) => (
          <div key={i} onClick={() => setInsightIdx(i)} style={{ width: 6, height: 6, borderRadius: "50%", cursor: "pointer", background: i === insightIdx ? "#1E3A5F" : "#BFDBFE", transition: "background 0.2s" }} />
        ))}
      </div>
      <button style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer", color: "rgb(147,197,253)", flexShrink: 0, fontFamily: "inherit" }}>{ins.action} →</button>
    </div>
  );
}

const TYPE_NAV: Record<string, string> = {
  "risk": "/riskops", "ticket": "/serviceops", "dsar": "/privacyops",
  "control": "/complianceops", "policy": "/govops", "audit": "/govops",
  "cloud-finding": "/cloudops", "security": "/secops",
};
const TYPE_LABEL: Record<string, string> = {
  "risk": "RiskOps", "ticket": "ServiceOps", "dsar": "PrivacyOps",
  "control": "ComplyOps", "policy": "GovOps", "audit": "GovOps",
  "cloud-finding": "CloudOps", "security": "SecOps",
};

const TYPE_ICON: Record<string, string> = {
  "risk": "⚠️", "ticket": "🎫", "dsar": "🔒", "control": "✅",
  "policy": "📄", "audit": "📋", "cloud-finding": "☁️", "security": "🛡️",
};
const TYPE_DESC: Record<string, string> = {
  "risk":          "Risk Register item — residual risk requiring treatment or acceptance",
  "ticket":        "Service Desk ticket — assigned for resolution or review",
  "dsar":          "Data Subject Access Request — privacy obligation under GDPR / CCPA",
  "control":       "Compliance control — mapped to regulatory framework requirement",
  "policy":        "Governance policy — approved and published to the policy library",
  "audit":         "Audit programme — evidence collection and findings in progress",
  "cloud-finding": "Cloud security misconfiguration — detected by CSPM scanner",
  "security":      "Security finding — detected by endpoint or SIEM tooling",
};
const SEV_COLOR: Record<string, string> = {
  Critical: "#DC2626", High: "#D97706", Medium: "#4338CA", Low: "#065F46",
  Overdue: "#DC2626", Urgent: "#D97706", Active: "#065F46",
  Implemented: "#065F46", "In Progress": "#D97706", Planned: "#6B7280",
};

function ActivityFeed({ items = [] }: { items?: any[] }) {
  const [, navigate] = useLocation();
  const [sel, setSel] = useState<any>(null);

  return (
    <>
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.5px", marginBottom: 12, textTransform: "uppercase" }}>Recent Activity</div>
        {items.length === 0 && (
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", padding: "12px 0", textAlign: "center" }}>No recent activity</div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {items.slice(0, 8).map((a) => {
            const label = TYPE_LABEL[a.type as string] ?? null;
            const timeStr = a.ts ? new Date(a.ts).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
            return (
              <div key={a.id}
                style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", borderRadius: 6, padding: "6px 8px", transition: "background 0.15s" }}
                onClick={() => setSel(a)}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--secondary)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: a.badgeColor ?? "#6B7280", flexShrink: 0, marginTop: 4 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "var(--foreground)", lineHeight: 1.5, fontWeight: 500 }}>{a.title}</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 2 }}>
                    <span style={{ fontSize: 10, color: "var(--muted-foreground)", fontWeight: 500 }}>{timeStr}</span>
                    {label && <span style={{ fontSize: 9, color: "rgba(147,197,253,0.5)", fontWeight: 600 }}>→ {label}</span>}
                  </div>
                </div>
                <span style={{ fontSize: 10, color: "var(--muted-foreground)", flexShrink: 0, marginTop: 3 }}>↗</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Activity Detail Drawer ── */}
      {sel && (() => {
        const dest  = TYPE_NAV[sel.type as string] ?? null;
        const label = TYPE_LABEL[sel.type as string] ?? "Platform";
        const icon  = TYPE_ICON[sel.type as string] ?? "🔔";
        const desc  = TYPE_DESC[sel.type as string] ?? "Platform event";
        const hdrColor = sel.badgeColor
          ? `rgba(${sel.badgeColor === "#DC2626" ? "220,38,38" : sel.badgeColor === "#D97706" ? "217,119,6" : sel.badgeColor === "#4338CA" ? "67,56,202" : "6,95,70"}, 0.85)`
          : "#1E3A5F";
        const timeStr = sel.ts ? new Date(sel.ts).toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
        const badgeLabel = sel.badge ?? "—";
        const badgeColor = SEV_COLOR[badgeLabel] ?? "#6B7280";
        const [detailModule, detailId] = (sel.detail ?? "").split(" — ");
        return (
          <Drawer open title={sel.title} subtitle={`${icon} ${label}`} onClose={() => setSel(null)} headerColor={hdrColor}>

            {/* Severity / badge pill */}
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 6, padding: "4px 10px", background: `${badgeColor}18`, color: badgeColor, border: `1px solid ${badgeColor}40`, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {badgeLabel}
              </span>
              {sel.actor && (
                <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>by <strong style={{ color: "var(--foreground)" }}>{sel.actor}</strong></span>
              )}
            </div>

            {/* Core metadata */}
            <DrawerSection title="Incident Details" />
            <Field label="Type"       value={<span style={{ display: "flex", alignItems: "center", gap: 6 }}><span>{icon}</span><span>{desc}</span></span>} />
            {detailId   && <Field label="Reference ID" value={<span style={{ fontFamily: "monospace", fontSize: 12, color: "rgb(147,197,253)" }}>{detailId.trim()}</span>} />}
            {detailModule && <Field label="Source"     value={detailModule.trim()} />}
            <Field label="Triggered"  value={timeStr} />
            <Field label="Actor"      value={sel.actor ?? "System"} />
            <Field label="Module"     value={label} />

            {/* Type-specific context block */}
            <DrawerSection title="Context" />
            <div style={{ background: "var(--secondary)", borderRadius: 8, padding: "12px 14px", border: "1px solid rgba(255,255,255,0.06)", fontSize: 11, color: "var(--foreground)", lineHeight: 1.7 }}>
              {sel.type === "cloud-finding" && (
                <>
                  <div style={{ marginBottom: 6 }}><strong>Finding:</strong> {sel.title.replace("Cloud finding detected: ", "")}</div>
                  <div style={{ marginBottom: 6 }}><strong>Provider:</strong> {detailModule?.trim() ?? "Cloud"}</div>
                  <div style={{ marginBottom: 6 }}><strong>Severity:</strong> <span style={{ color: badgeColor, fontWeight: 700 }}>{badgeLabel}</span></div>
                  <div style={{ color: "var(--muted-foreground)" }}>This finding was detected by the CSPM scanner. Open CloudOps to view affected resources, remediation steps, and suppression options.</div>
                </>
              )}
              {sel.type === "risk" && (
                <>
                  <div style={{ marginBottom: 6 }}><strong>Risk:</strong> {sel.title.replace(/^Risk (escalated|logged): /, "")}</div>
                  <div style={{ marginBottom: 6 }}><strong>Severity:</strong> <span style={{ color: badgeColor, fontWeight: 700 }}>{badgeLabel}</span></div>
                  <div style={{ color: "var(--muted-foreground)" }}>Open RiskOps to view the full risk register entry, treatment plan, and control mappings.</div>
                </>
              )}
              {sel.type === "ticket" && (
                <>
                  <div style={{ marginBottom: 6 }}><strong>Ticket:</strong> {sel.title.replace(/^Ticket (resolved|created): /, "")}</div>
                  <div style={{ marginBottom: 6 }}><strong>Priority:</strong> <span style={{ color: badgeColor, fontWeight: 700 }}>{badgeLabel}</span></div>
                  <div style={{ color: "var(--muted-foreground)" }}>Open ServiceOps to view the full ticket, assignee, comments, and resolution history.</div>
                </>
              )}
              {sel.type === "dsar" && (
                <>
                  <div style={{ marginBottom: 6 }}><strong>Request:</strong> {sel.title.replace(/^DSAR (completed|received): /, "")}</div>
                  <div style={{ marginBottom: 6 }}><strong>Status:</strong> <span style={{ color: badgeColor, fontWeight: 700 }}>{badgeLabel}</span></div>
                  <div style={{ color: "var(--muted-foreground)" }}>Open PrivacyOps to manage this data subject request, track the SLA deadline, and submit the response.</div>
                </>
              )}
              {sel.type === "control" && (
                <>
                  <div style={{ marginBottom: 6 }}><strong>Control:</strong> {sel.title.replace("Control implemented: ", "")}</div>
                  <div style={{ color: "var(--muted-foreground)" }}>Open ComplianceOps to review the control evidence, linked audit requirements, and testing schedule.</div>
                </>
              )}
              {sel.type === "policy" && (
                <>
                  <div style={{ marginBottom: 6 }}><strong>Policy:</strong> {sel.title.replace(/^Policy (activated|updated): /, "")}</div>
                  <div style={{ color: "var(--muted-foreground)" }}>Open GovOps to view the full policy, approval history, distribution status, and attestation records.</div>
                </>
              )}
              {sel.type === "audit" && (
                <>
                  <div style={{ marginBottom: 6 }}><strong>Audit:</strong> {sel.title.replace(/^Audit (completed|in progress|started): /, "")}</div>
                  <div style={{ color: "var(--muted-foreground)" }}>Open GovOps to view the audit programme, evidence collection tasks, and current findings.</div>
                </>
              )}
              {sel.type === "security" && (
                <>
                  <div style={{ marginBottom: 6 }}><strong>Finding:</strong> {sel.title.replace("Critical security finding: ", "")}</div>
                  <div style={{ marginBottom: 6 }}><strong>Severity:</strong> <span style={{ color: badgeColor, fontWeight: 700 }}>{badgeLabel}</span></div>
                  <div style={{ color: "var(--muted-foreground)" }}>Open SecOps to view the full finding detail, affected device, and remediation workflow.</div>
                </>
              )}
            </div>

            {/* Footer: open in module */}
            {dest && (
              <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                <button onClick={() => { setSel(null); navigate(dest); }}
                  style={{ width: "100%", background: "rgba(147,197,253,0.08)", border: "1px solid rgba(147,197,253,0.25)", borderRadius: 8, padding: "10px 14px", fontSize: 12, fontWeight: 700, color: "rgb(147,197,253)", cursor: "pointer", fontFamily: "inherit" }}>
                  Open in {label} →
                </button>
              </div>
            )}
          </Drawer>
        );
      })()}
    </>
  );
}

/* ── CISO / Full-Access Dashboard ─────────────────────────────────────── */
const OB_STAGES = ["Org Setup","Team & Roles","Asset Inventory","Risk Framework","Compliance Mapping","Policy Library","Control Baseline","Vendor Registry","Security Tools","Data Classification","Incident Process","Training Program","Go-Live Checklist"];

function CisoDashboard({ insightIdx, setInsightIdx, mounted }: { insightIdx: number; setInsightIdx: (i: number) => void; mounted: boolean }) {
  const [, navigate] = useLocation();
  const live = useLive();
  const [selRisk, setSelRisk] = useState<any>(null);
  const { data: ob, completionPct } = useOnboarding();
  const obStage = ob ? Math.min(ob.currentStage, OB_STAGES.length) : 0;
  const obDone = ob?.completed ?? false;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {selRisk && (() => {
        const ai = getRiskAI(selRisk);
        const hdrColor = selRisk.severity === "Critical" ? "#991B1B" : selRisk.severity === "High" ? "#92400E" : selRisk.severity === "Medium" ? "#3730A3" : "#065F46";
        const sevBg    = selRisk.severity === "Critical" ? "rgba(239,68,68,0.1)"  : selRisk.severity === "High" ? "rgba(245,158,11,0.1)" : selRisk.severity === "Medium" ? "rgba(99,102,241,0.1)" : "rgba(34,197,94,0.08)";
        const trendColor = selRisk.trend === "up" ? "#DC2626" : selRisk.trend === "down" ? "#065F46" : "#9CA3AF";
        const trendLabel = selRisk.trend === "up" ? "▲ Accelerating" : selRisk.trend === "down" ? "▼ Decelerating" : "— Stable";
        return (
          <Drawer open title={`${selRisk.id} — ${selRisk.name}`} subtitle={`${selRisk.severity} · ${selRisk.category}`} onClose={() => setSelRisk(null)} headerColor={hdrColor}>
            {/* ── Score banner ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 4 }}>
              {[
                { label: "Risk Score", value: String(selRisk.score), sub: "Residual", color: hdrColor },
                { label: "CVSS Est.",  value: String(ai.cvss),        sub: "AI-derived", color: ai.cvss >= 8 ? "#DC2626" : ai.cvss >= 6 ? "#D97706" : "#4338CA" },
                { label: "Likelihood", value: ai.likelihood,           sub: "Assessment",  color: "rgb(147,197,253)" },
                { label: "Trend",      value: trendLabel,              sub: "30-day",       color: trendColor },
              ].map(m => (
                <div key={m.label} style={{ background: "var(--secondary)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ fontSize: 9, color: "var(--muted-foreground)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>{m.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: m.color, fontFamily: "'JetBrains Mono',monospace" }}>{m.value}</div>
                  <div style={{ fontSize: 9, color: "var(--muted-foreground)", marginTop: 2 }}>{m.sub}</div>
                </div>
              ))}
            </div>

            {/* ── AI Intelligence ── */}
            <DrawerSection title="◆ AI Risk Intelligence" />
            <div style={{ background: "rgba(30,58,95,0.2)", border: "1px solid rgba(147,197,253,0.2)", borderRadius: 8, padding: "12px 14px", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                <span style={{ background: "linear-gradient(135deg,#1E3A5F,#065F46)", color: "white", fontSize: 9, fontWeight: 800, padding: "2px 8px", borderRadius: 10, letterSpacing: "0.5px" }}>AI ANALYSIS</span>
                <span style={{ fontSize: 9, color: "var(--muted-foreground)" }}>Confidence: {ai.confidence}% · Updated 2 hours ago</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 9, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 3 }}>Threat Actor</div>
                  <div style={{ fontSize: 11, color: "var(--foreground)", lineHeight: 1.4 }}>{ai.threat}</div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 3 }}>Attack Vector</div>
                  <div style={{ fontSize: 11, color: "var(--foreground)", lineHeight: 1.4 }}>{ai.vector}</div>
                </div>
              </div>
              {selRisk.description && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 9, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>Business Impact</div>
                  <div style={{ fontSize: 12, color: "var(--foreground)", lineHeight: 1.6 }}>{selRisk.description}</div>
                </div>
              )}
            </div>

            {/* ── Risk Details ── */}
            <DrawerSection title="Risk Details" />
            <Field label="Risk ID"  value={selRisk.id} mono />
            <Field label="Category" value={selRisk.category} />
            <Field label="Owner"    value={selRisk.ownerFull ?? selRisk.owner} />
            <Field label="Status"   value={selRisk.status} />
            <Field label="Treatment" value={ai.treatment} />
            <Field label="Created"  value={(selRisk as any).created ?? "—"} />

            {/* ── Top 3 Mitigation Actions ── */}
            <DrawerSection title="Top Mitigation Actions" />
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {ai.recs.map((rec, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "var(--secondary)", borderRadius: 6, padding: "8px 10px", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: "50%", background: i === 0 ? "rgba(239,68,68,0.15)" : i === 1 ? "rgba(245,158,11,0.12)" : "rgba(99,102,241,0.12)", border: `1px solid ${i === 0 ? "rgba(239,68,68,0.3)" : i === 1 ? "rgba(245,158,11,0.3)" : "rgba(99,102,241,0.3)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 800, color: i === 0 ? "#DC2626" : i === 1 ? "#D97706" : "#6366F1" }}>{i + 1}</span>
                  <span style={{ fontSize: 11, color: "var(--foreground)", lineHeight: 1.5 }}>{rec}</span>
                </div>
              ))}
            </div>

            {/* ── Related Controls ── */}
            <DrawerSection title="Related Controls" />
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {ai.controls.map((ctrl, i) => (
                <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11 }}>
                  <span style={{ color: "#065F46", fontSize: 10 }}>✓</span>
                  <span style={{ color: "var(--foreground)" }}>{ctrl}</span>
                </div>
              ))}
            </div>

            {/* ── Footer action ── */}
            <div style={{ marginTop: 20, paddingTop: 12, borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
              <button onClick={() => { setSelRisk(null); navigate("/riskops"); }}
                style={{ flex: 1, background: "rgba(30,58,95,0.3)", border: "1px solid rgba(147,197,253,0.3)", borderRadius: 8, padding: "9px", fontSize: 12, fontWeight: 700, color: "rgb(147,197,253)", cursor: "pointer", fontFamily: "inherit" }}>
                Open in Risk Register →
              </button>
            </div>
          </Drawer>
        );
      })()}
      <AiBanner insightIdx={insightIdx} setInsightIdx={setInsightIdx} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        {live.kpis.map((k) => <KpiCard key={k.id} {...{ ...k, ...(KPI_COLORS[k.id] ?? {}) }} onClick={() => navigate(KPI_NAV[k.id] ?? "/")} />)}
      </div>

      {/* Customer Onboarding */}
      <div style={{ background: obDone ? "linear-gradient(135deg,rgba(52,211,153,0.08),rgba(16,185,129,0.06))" : "linear-gradient(135deg,rgba(59,130,246,0.10),rgba(99,102,241,0.08))", border: `1px solid ${obDone ? "rgba(52,211,153,0.25)" : "rgba(99,179,237,0.22)"}`, borderRadius: 12, padding: "14px 20px", display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: obDone ? "#34D399" : "rgb(147,197,253)", letterSpacing: "0.2px" }}>Customer Onboarding</span>
            {obDone
              ? <span style={{ background: "rgba(52,211,153,0.15)", color: "#34D399", border: "1px solid rgba(52,211,153,0.3)", borderRadius: 10, padding: "1px 8px", fontSize: 9, fontWeight: 700 }}>COMPLETE</span>
              : <span style={{ background: "rgba(99,179,237,0.12)", color: "rgb(147,197,253)", border: "1px solid rgba(99,179,237,0.25)", borderRadius: 10, padding: "1px 8px", fontSize: 9, fontWeight: 700 }}>IN PROGRESS</span>
            }
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
            {OB_STAGES.map((s, i) => {
              const done = obDone || i < obStage;
              const current = !obDone && i === obStage;
              return (
                <div key={s} title={s} style={{ width: 24, height: 24, borderRadius: 6, fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", background: done ? "rgba(52,211,153,0.18)" : current ? "rgba(99,179,237,0.2)" : "var(--secondary)", border: `1px solid ${done ? "rgba(52,211,153,0.35)" : current ? "rgba(99,179,237,0.4)" : "var(--border)"}`, color: done ? "#34D399" : current ? "rgb(147,197,253)" : "var(--muted-foreground)", cursor: "default" }}>
                  {done ? "✓" : i + 1}
                </div>
              );
            })}
          </div>
          <div style={{ height: 4, background: "var(--border)", borderRadius: 4, overflow: "hidden", maxWidth: 480 }}>
            <div style={{ height: "100%", width: `${completionPct}%`, background: obDone ? "#34D399" : "rgb(147,197,253)", borderRadius: 4, transition: "width 0.8s ease" }} />
          </div>
          <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 4 }}>
            {obDone ? "All 13 stages complete — platform fully configured." : `Stage ${obStage + 1} of 13 — ${OB_STAGES[obStage] ?? "Setup"}`} · {completionPct}% complete
          </div>
        </div>
        <button onClick={() => navigate("/onboarding")} style={{ background: obDone ? "rgba(52,211,153,0.15)" : "rgba(59,130,246,0.18)", border: `1px solid ${obDone ? "rgba(52,211,153,0.3)" : "rgba(99,179,237,0.3)"}`, borderRadius: 8, padding: "8px 18px", fontSize: 11, fontWeight: 700, color: obDone ? "#34D399" : "rgb(147,197,253)", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0 }}>
          {obDone ? "Review Setup →" : "Continue Setup →"}
        </button>
      </div>

      {/* CloudOps Health Strip — derived from shared cloudops-shared.ts data */}
      {(() => {
        const provCounts = getProviderCounts();
        const provColors: Record<string,string> = { AWS:"#FF9900", Azure:"#0078D4", GCP:"#4285F4" };
        const pct = ENT_SCORE / 100;
        const r = 38, cx = 48, cy = 48;
        const circ = 2 * Math.PI * r;
        const scoreColor = ENT_SCORE >= 75 ? "#34D399" : ENT_SCORE >= 60 ? "#FCD34D" : "#F87171";
        return (
          <div className="cnapp-panel" style={{ background: "linear-gradient(135deg,rgba(30,58,95,0.55),rgba(6,78,59,0.35))", border: "1px solid rgba(147,197,253,0.2)", borderRadius: 12, padding: "16px 20px" }}>
            {/* Top row */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14 }}>
              {/* Score gauge */}
              <div style={{ flexShrink: 0, textAlign: "center" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "rgb(147,197,253)", letterSpacing: "0.5px", marginBottom: 4, textTransform: "uppercase" }}>CNAPP Score</div>
                <svg width={96} height={56} viewBox="0 0 96 56">
                  <path d={`M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy}`} stroke="rgba(255,255,255,0.08)" strokeWidth={10} fill="none" strokeLinecap="round" />
                  <path d={`M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy}`} stroke={scoreColor} strokeWidth={10} fill="none" strokeLinecap="round"
                    strokeDasharray={`${pct * Math.PI * r} ${Math.PI * r}`} />
                  <text x={cx} y={cy - 2} textAnchor="middle" fontSize={16} fontWeight={800} fill={scoreColor} fontFamily="JetBrains Mono,monospace">{ENT_SCORE}</text>
                  <text x={cx} y={cy + 11} textAnchor="middle" fontSize={7} fill="rgba(148,163,184,0.7)">/100</text>
                </svg>
                <div style={{ fontSize: 10, color: "#34D399", fontWeight: 700, marginTop: 2 }}>↑ +4 pts</div>
              </div>
              <div style={{ width: 1, height: 56, background: "rgba(255,255,255,0.1)", flexShrink: 0 }} />
              {/* Per-provider counts derived from shared data */}
              {provCounts.map(pr => (
                <div key={pr.p} style={{ flexShrink: 0, textAlign: "center" }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: provColors[pr.p], marginBottom: 4 }}>{pr.p}</div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: "#F87171", fontFamily: "'JetBrains Mono',monospace" }}>{pr.crit}C</span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: "#FCD34D", fontFamily: "'JetBrains Mono',monospace" }}>{pr.high}H</span>
                  </div>
                  <div style={{ fontSize: 8, color: "var(--muted-foreground)", marginTop: 2 }}>{(pr.total/1000).toFixed(1)}K res</div>
                </div>
              ))}
              <div style={{ width: 1, height: 56, background: "rgba(255,255,255,0.1)", flexShrink: 0 }} />
              {[
                { label: "Total Critical", value: String(ENT_CRITICAL), color: "#F87171" },
                { label: "Total High",     value: String(ENT_HIGH),     color: "#FCD34D" },
                { label: "Attack Paths",    value: String(ENT_ATTACK_PATHS),    color: "#FCD34D" },
                { label: "Secrets Exposed", value: String(ENT_SECRETS_EXPOSED), color: "#F87171" },
              ].map(m => (
                <div key={m.label} style={{ textAlign: "center", flexShrink: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: m.color, fontFamily: "'JetBrains Mono', monospace" }}>{m.value}</div>
                  <div style={{ fontSize: 9, color: "var(--muted-foreground)", marginTop: 2 }}>{m.label}</div>
                </div>
              ))}
              <div style={{ flex: 1 }} />
              <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center", flexWrap: "wrap" }}>
                {([["CSPM",true],["SSPM",false],["CIEM",false],["CWPP",true],["AISPM",false]] as [string,boolean][]).map(([l,ok]) => (
                  <div key={l} style={{ padding:"3px 9px", borderRadius:5, border:`1px solid ${ok?"rgba(52,211,153,0.3)":"rgba(248,113,113,0.3)"}`, background:ok?"rgba(52,211,153,0.08)":"rgba(248,113,113,0.08)", fontSize:9, fontWeight:700, color:ok?"#34D399":"#F87171" }}>{l}</div>
                ))}
                <button onClick={() => navigate("/cloudops")} style={{ background:"rgba(147,197,253,0.12)", border:"1px solid rgba(147,197,253,0.25)", borderRadius:7, padding:"5px 14px", fontSize:11, fontWeight:700, color:"rgb(147,197,253)", cursor:"pointer", fontFamily:"inherit" }}>Open CloudOps →</button>
              </div>
            </div>
            {/* Top open critical findings — from shared topOpenCritical */}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 10 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 7 }}>Top Open Critical Findings · <span style={{ color:"#F87171" }}>Live from CSPM scan</span></div>
              <div style={{ display: "flex", gap: 10 }}>
                {topOpenCritical.map(f => (
                  <div key={f.id} onClick={() => navigate("/cloudops")} style={{ flex:1, padding:"8px 10px", borderRadius:7, border:"1px solid rgba(248,113,113,0.2)", background:"rgba(248,113,113,0.05)", cursor:"pointer", minWidth:0 }}
                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(248,113,113,0.45)"}
                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(248,113,113,0.2)"}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:3 }}>
                      <span style={{ fontSize:9, color:"#F87171", fontWeight:700, background:"rgba(248,113,113,0.15)", borderRadius:3, padding:"1px 6px" }}>CRITICAL</span>
                      <span style={{ fontSize:8, color:"var(--muted-foreground)" }}>{f.lastSeen}</span>
                    </div>
                    <div style={{ fontSize:10, fontWeight:700, color:"var(--foreground)", marginBottom:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.rule}</div>
                    <div style={{ fontSize:9, color:"var(--muted-foreground)", fontFamily:"monospace", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.resource}</div>
                    <div style={{ fontSize:8, fontWeight:700, marginTop:3, color: provColors[f.provider] }}>☁ {f.provider} · {f.region}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      <div style={{ display: "grid", gridTemplateColumns: "216px 1fr", gap: 16 }}>
        <div onClick={() => navigate("/riskops")}
          style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, boxShadow: "0 2px 16px rgba(0,0,0,0.45)", display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer", transition: "border-color 0.2s, box-shadow 0.2s" }}
          onMouseEnter={e => { const d = e.currentTarget as HTMLDivElement; d.style.borderColor = "rgba(147,197,253,0.3)"; d.style.boxShadow = "0 4px 24px rgba(0,0,0,0.6)"; }}
          onMouseLeave={e => { const d = e.currentTarget as HTMLDivElement; d.style.borderColor = "var(--border)"; d.style.boxShadow = "0 2px 16px rgba(0,0,0,0.45)"; }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", marginBottom: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.5px", textTransform: "uppercase" }}>Risk Posture</div>
            <span style={{ fontSize: 9, color: "rgba(147,197,253,0.5)", fontWeight: 600 }}>View →</span>
          </div>
          <RiskGauge segs={live.riskSegments} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, width: "100%", marginTop: 4 }}>
            {live.riskSegments.map(s => (
              <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10 }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                <span style={{ color: "#6B7280" }}>{s.label}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "rgb(147,197,253)", fontWeight: 700 }}>{s.count}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.5px", textTransform: "uppercase" }}>Compliance Frameworks</div>
            <button onClick={() => navigate("/complianceops")} style={{ fontSize: 11, color: "rgb(147,197,253)", fontWeight: 700, cursor: "pointer", background: "none", border: "none", fontFamily: "inherit" }}>View All →</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {live.frameworks.map(fw => (
              <div key={fw.id} onClick={() => navigate("/complianceops")}
                style={{ cursor: "pointer", borderRadius: 6, padding: "6px 8px", transition: "background 0.15s", margin: "0 -8px" }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "var(--secondary)"}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--foreground)" }}>{fw.name}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: fw.color }}>{fw.pct}%</span>
                </div>
                <div style={{ height: 6, background: "var(--input)", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${fw.pct}%`, background: fw.color, borderRadius: 4, transition: "width 1.2s ease" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 296px", gap: 16 }}>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.5px", textTransform: "uppercase" }}>Top Risks</div>
            <button onClick={() => navigate("/risk")} style={{ fontSize: 11, color: "rgb(147,197,253)", fontWeight: 700, cursor: "pointer", background: "none", border: "none", fontFamily: "inherit" }}>View Register →</button>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr style={{ borderBottom: "2px solid var(--border)" }}>
              {["Severity", "Risk", "Owner", "Score", "Trend"].map(h => <th key={h} style={{ textAlign: "left", padding: "6px 8px", color: "var(--muted-foreground)", fontWeight: 700, fontSize: 10, letterSpacing: "0.5px", textTransform: "uppercase" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {live.risks.slice(0, 5).map(r => (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                  onClick={() => setSelRisk(r)}
                  onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "rgba(59,130,246,0.07)"}
                  onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = "transparent"}>
                  <td style={{ padding: "10px 8px" }}><span style={{ background: sev[r.severity]?.bg, border: `1px solid ${sev[r.severity]?.border}`, color: sev[r.severity]?.color, borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{r.severity}</span></td>
                  <td style={{ padding: "10px 8px" }}><div style={{ fontSize: 12, fontWeight: 500, color: "var(--foreground)" }}>{r.name}</div><div style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 1 }}>{r.id} · {r.category}</div></td>
                  <td style={{ padding: "10px 8px" }}><span className="owner-capsule" title={r.ownerFull}>{r.ownerFull ?? r.owner}</span></td>
                  <td style={{ padding: "10px 8px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: sev[r.severity]?.color, fontSize: 13 }}>{r.score}</td>
                  <td style={{ padding: "10px 8px", fontSize: 12 }}><span style={{ color: r.trend === "down" ? "#065F46" : r.trend === "up" ? "#DC2626" : "var(--muted-foreground)", fontWeight: 700 }}>{r.trend === "down" ? "▼" : r.trend === "up" ? "▲" : "—"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ActivityFeed items={live.activity} />
      </div>
    </div>
  );
}

/* ── CRO / Risk-Focused Dashboard ─────────────────────────────────────── */
function CroDashboard() {
  const [, navigate] = useLocation();
  const live = useLive();
  const liveRisks = live.risks;
  const croKpis = [
    { label: "Total Open Risks", value: liveRisks.length,                                                                                                                   color: "#92400E", bg: "rgba(245,158,11,0.06)", border: "#FDE68A" },
    { label: "Critical",          value: liveRisks.filter(r => r.severity === "Critical").length,                                                                           color: "#991B1B", bg: "rgba(239,68,68,0.06)", border: "#FECACA" },
    { label: "High",              value: liveRisks.filter(r => r.severity === "High").length,                                                                               color: "#D97706", bg: "rgba(245,158,11,0.06)", border: "#FDE68A" },
    { label: "Avg Risk Score",    value: liveRisks.length ? (liveRisks.reduce((s, r) => s + (Number(r.score) || 0), 0) / liveRisks.length).toFixed(1) : "—",               color: "rgb(147,197,253)", bg: "rgba(59,130,246,0.12)", border: "#BFDBFE" },
    { label: "Risks Closed (MTD)",value: liveRisks.filter(r => r.status === "closed" || r.status === "accepted").length,                                                    color: "#065F46", bg: "rgba(34,197,94,0.08)", border: "#A7F3D0" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "linear-gradient(135deg,rgba(180,83,9,0.18),rgba(153,27,27,0.15))", border: "1px solid rgba(251,191,36,0.25)", borderRadius: 10, padding: "10px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ background: "#B45309", borderRadius: 6, padding: "4px 10px", fontSize: 10, fontWeight: 700, color: "var(--card)" }}>RISK ADVISORY</div>
        <span style={{ fontSize: 12, color: "var(--foreground)", fontWeight: 500 }}>
          {live.meta.criticalRisks > 0
            ? `${live.meta.criticalRisks} critical risk${live.meta.criticalRisks !== 1 ? "s" : ""} require executive attention.`
            : live.meta.openRisks > 0
              ? `${live.meta.openRisks} open risk${live.meta.openRisks !== 1 ? "s" : ""} tracked.`
              : "No open risks — risk posture is clean."}{" "}
          {live.meta.activeAudits > 0 ? `${live.meta.activeAudits} audit${live.meta.activeAudits !== 1 ? "s" : ""} in progress.` : ""}
        </span>
        <button onClick={() => navigate("/riskops")} style={{ background: "var(--card)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer", color: "#92400E", flexShrink: 0, fontFamily: "inherit" }}>View Register →</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        {croKpis.map(k => (
          <div key={k.label} style={{ background: "var(--card)", border: `1px solid ${k.border}`, borderRadius: 12, padding: "14px 16px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: k.color, opacity: 0.7, borderRadius: "12px 12px 0 0" }} />
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.5px", marginBottom: 8, textTransform: "uppercase" }}>{k.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "216px 1fr", gap: 16 }}>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, boxShadow: "0 2px 16px rgba(0,0,0,0.45)", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.5px", marginBottom: 4, textTransform: "uppercase", alignSelf: "flex-start" }}>Risk Posture</div>
          <RiskGauge segs={live.riskSegments} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, width: "100%", marginTop: 4 }}>
            {live.riskSegments.map(s => (
              <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10 }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                <span style={{ color: "#6B7280" }}>{s.label}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "rgb(147,197,253)", fontWeight: 700 }}>{s.count}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.5px", textTransform: "uppercase" }}>Risk Register — All Critical & High</div>
            <button onClick={() => navigate("/risk")} style={{ fontSize: 11, color: "rgb(147,197,253)", fontWeight: 700, cursor: "pointer", background: "none", border: "none", fontFamily: "inherit" }}>View All →</button>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr style={{ borderBottom: "2px solid var(--border)" }}>
              {["Severity", "Risk", "Category", "Score", "Trend"].map(h => <th key={h} style={{ textAlign: "left", padding: "6px 8px", color: "var(--muted-foreground)", fontWeight: 700, fontSize: 10, letterSpacing: "0.5px", textTransform: "uppercase" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {live.risks.filter(r => r.severity === "Critical" || r.severity === "High").map(r => (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "rgba(59,130,246,0.07)"}
                  onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = "transparent"}>
                  <td style={{ padding: "10px 8px" }}><span style={{ background: sev[r.severity]?.bg, border: `1px solid ${sev[r.severity]?.border}`, color: sev[r.severity]?.color, borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{r.severity}</span></td>
                  <td style={{ padding: "10px 8px" }}><div style={{ fontSize: 12, fontWeight: 500, color: "var(--foreground)" }}>{r.name}</div></td>
                  <td style={{ padding: "10px 8px", fontSize: 11, color: "#6B7280" }}>{r.category}</td>
                  <td style={{ padding: "10px 8px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: sev[r.severity]?.color }}>{r.score}</td>
                  <td style={{ padding: "10px 8px" }}><span style={{ color: r.trend === "down" ? "#065F46" : r.trend === "up" ? "#DC2626" : "var(--muted-foreground)", fontWeight: 700 }}>{r.trend === "down" ? "▼" : r.trend === "up" ? "▲" : "—"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ── CDPO / Privacy Dashboard ─────────────────────────────────────────── */
function CdpoDashboard() {
  const [, navigate] = useLocation();
  const live = useLive();
  const { meta } = live;
  const dsarActivity = live.activity.filter((a: any) => a.type === "dsar");
  const privacyKpi = live.kpis.find((k: any) => k.id === "privacy");
  const cdpoKpis = [
    { label: "Open DSARs",       value: meta.openDsars,    color: "rgb(147,197,253)", bg: "rgba(59,130,246,0.12)", border: "#BFDBFE" },
    { label: "Overdue DSARs",    value: meta.overdueDsars, color: "#991B1B", bg: "rgba(239,68,68,0.06)", border: "#FECACA" },
    { label: "Total DSARs",      value: meta.totalDsars,   color: "#92400E", bg: "rgba(245,158,11,0.06)", border: "#FDE68A" },
    { label: "Privacy Readiness",value: `${privacyKpi?.value ?? meta.privacyScore}%`, color: "#065F46", bg: "rgba(34,197,94,0.08)", border: "#A7F3D0" },
  ];
  const ssMap: Record<string, { bg: string; color: string; border: string }> = {
    "Overdue": { bg: "rgba(239,68,68,0.06)", color: "#991B1B", border: "#FECACA" },
    "Urgent":  { bg: "rgba(245,158,11,0.06)", color: "#92400E", border: "#FDE68A" },
    "Active":  { bg: "rgba(59,130,246,0.12)", color: "rgb(147,197,253)", border: "#BFDBFE" },
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "linear-gradient(135deg,rgba(6,78,59,0.35),rgba(30,58,95,0.35))", border: "1px solid rgba(52,211,153,0.25)", borderRadius: 10, padding: "10px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ background: "#065F46", borderRadius: 6, padding: "4px 10px", fontSize: 10, fontWeight: 700, color: "var(--card)" }}>PRIVACY STATUS</div>
        <span style={{ fontSize: 12, color: "var(--foreground)", fontWeight: 500 }}>
          {meta.overdueDsars > 0
            ? `${meta.overdueDsars} DSAR${meta.overdueDsars !== 1 ? "s" : ""} overdue — action required.`
            : meta.openDsars > 0
              ? `${meta.openDsars} DSAR${meta.openDsars !== 1 ? "s" : ""} open.`
              : "No open DSARs — privacy queue is clear."}{" "}
          Privacy readiness: {privacyKpi?.value ?? meta.privacyScore}%.
        </span>
        <button onClick={() => navigate("/privacyops")} style={{ background: "var(--card)", border: "1px solid rgba(52,211,153,0.25)", borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer", color: "#065F46", flexShrink: 0, fontFamily: "inherit" }}>Manage →</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {cdpoKpis.map(k => (
          <div key={k.label} onClick={() => navigate("/privacyops")} style={{ background: "var(--card)", border: `1px solid ${k.border}`, borderRadius: 12, padding: "14px 16px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)", position: "relative", overflow: "hidden", cursor: "pointer" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: k.color, opacity: 0.7, borderRadius: "12px 12px 0 0" }} />
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.5px", marginBottom: 8, textTransform: "uppercase" }}>{k.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 296px", gap: 16 }}>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.5px", textTransform: "uppercase" }}>Open DSARs Requiring Action</div>
            <button onClick={() => navigate("/privacyops")} style={{ fontSize: 11, color: "rgb(147,197,253)", fontWeight: 700, cursor: "pointer", background: "none", border: "none", fontFamily: "inherit" }}>All DSARs →</button>
          </div>
          {dsarActivity.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--muted-foreground)", padding: "20px 0", textAlign: "center" }}>No DSAR activity — privacy queue is clear</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr style={{ borderBottom: "2px solid var(--border)" }}>
                {["Request Type", "Subject", "Status", "Received", ""].map(h => <th key={h} style={{ textAlign: "left", padding: "6px 8px", color: "var(--muted-foreground)", fontWeight: 700, fontSize: 10, letterSpacing: "0.5px", textTransform: "uppercase" }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {dsarActivity.slice(0, 8).map((d: any) => {
                  const reqType = (d.title ?? "").split(": ").slice(1).join(": ") || "Request";
                  const subject = (d.detail ?? "").replace(/^Subject:\s*/i, "").replace(/\s*—.*$/, "") || "—";
                  const ss = ssMap[d.badge] ?? ssMap["Active"];
                  const dt = d.ts ? new Date(d.ts).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";
                  return (
                    <tr key={d.id} style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                      onClick={() => navigate("/privacyops")}
                      onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "var(--secondary)"}
                      onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = "transparent"}>
                      <td style={{ padding: "10px 8px", fontSize: 12, color: "var(--foreground)", fontWeight: 500 }}>{reqType}</td>
                      <td style={{ padding: "10px 8px", fontSize: 12, color: "var(--foreground)" }}>{subject}</td>
                      <td style={{ padding: "10px 8px" }}><span style={{ background: ss.bg, border: `1px solid ${ss.border}`, color: ss.color, borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{d.badge}</span></td>
                      <td style={{ padding: "10px 8px", fontSize: 11, color: "#6B7280", fontFamily: "'JetBrains Mono', monospace" }}>{dt}</td>
                      <td style={{ padding: "10px 8px", fontSize: 10, color: "rgba(147,197,253,0.7)", fontWeight: 600 }}>→</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.5px", marginBottom: 12, textTransform: "uppercase" }}>Framework Coverage</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {live.frameworks.length > 0
              ? live.frameworks.map((f: any) => (
                <div key={f.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ fontSize: 11, color: "var(--foreground)", fontWeight: 500 }}>{f.name}</span><span style={{ fontSize: 11, fontWeight: 700, color: f.color, fontFamily: "'JetBrains Mono', monospace" }}>{f.pct}%</span></div>
                  <div style={{ height: 5, background: "var(--input)", borderRadius: 4 }}><div style={{ height: "100%", width: `${f.pct}%`, background: f.color, borderRadius: 4 }} /></div>
                </div>
              ))
              : <div style={{ fontSize: 11, color: "var(--muted-foreground)", textAlign: "center", padding: "16px 0" }}>No framework data — add compliance controls to see coverage</div>
            }
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Management / Executive Dashboard ────────────────────────────────── */
function ManagementDashboard() {
  const [, navigate] = useLocation();
  const live = useLive();
  const { meta } = live;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "linear-gradient(135deg,rgba(30,58,95,0.35),rgba(6,78,59,0.25))", border: "1px solid rgba(99,179,237,0.2)", borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ background: "linear-gradient(135deg, #1E3A5F, #065F46)", borderRadius: 6, padding: "4px 10px", fontSize: 10, fontWeight: 700, color: "var(--card)" }}>EXECUTIVE SUMMARY</div>
        <span style={{ fontSize: 12, color: "var(--foreground)", fontWeight: 500 }}>
          Overall GRC posture is <strong>{meta.grcLabel} ({meta.grcScore}/100)</strong>.
          {meta.criticalRisks > 0 ? ` ${meta.criticalRisks} critical risk${meta.criticalRisks !== 1 ? "s" : ""} require board attention.` : ""}
          {meta.activeAudits > 0 ? ` ${meta.activeAudits} audit${meta.activeAudits !== 1 ? "s" : ""} in progress.` : ""}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        {live.kpis.map((k: any) => (
          <div key={k.id} onClick={() => navigate(TYPE_NAV[k.id] ?? "/complianceops")} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)", position: "relative", overflow: "hidden", cursor: "pointer" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "rgb(147,197,253)", opacity: 0.7, borderRadius: "12px 12px 0 0" }} />
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.5px", marginBottom: 8, textTransform: "uppercase" }}>{k.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: "rgb(147,197,253)" }}>{k.value}<span style={{ fontSize: 13, color: "var(--muted-foreground)" }}>{k.unit}</span></div>
            <div style={{ fontSize: 11, fontWeight: 600, color: k.up ? "#065F46" : "#DC2626", marginTop: 6 }}>{k.up ? "▲" : "▼"} {k.delta}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.5px", marginBottom: 16, textTransform: "uppercase" }}>Compliance by Framework</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {live.frameworks.map(fw => (
              <div key={fw.id}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}><span style={{ fontSize: 12, fontWeight: 600, color: "var(--foreground)" }}>{fw.name}</span><span style={{ fontSize: 12, fontWeight: 700, color: fw.color, fontFamily: "'JetBrains Mono', monospace" }}>{fw.pct}%</span></div>
                <div style={{ height: 8, background: "var(--input)", borderRadius: 4 }}><div style={{ height: "100%", width: `${fw.pct}%`, background: fw.color, borderRadius: 4 }} /></div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.5px", textTransform: "uppercase" }}>Board-Level Action Items</div>
            <button onClick={() => navigate("/riskops")} style={{ fontSize: 11, color: "rgb(147,197,253)", fontWeight: 700, cursor: "pointer", background: "none", border: "none", fontFamily: "inherit" }}>View All →</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {live.risks.filter((r: any) => r.severity === "Critical" || r.severity === "High").slice(0, 4).map((r: any, i: number) => (
              <div key={r.id ?? i} onClick={() => navigate("/riskops")} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", background: "var(--card)", borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer" }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "var(--secondary)"}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "var(--card)"}>
                <span style={{ background: sev[r.severity]?.bg, border: `1px solid ${sev[r.severity]?.border}`, color: sev[r.severity]?.color, borderRadius: 4, padding: "2px 6px", fontSize: 9, fontWeight: 700, flexShrink: 0 }}>{r.severity}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                  <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 2 }}>{r.category ?? "Risk"} · Score: {r.score}</div>
                </div>
                <span style={{ fontSize: 9, color: "rgba(147,197,253,0.6)", fontWeight: 600, flexShrink: 0 }}>→ RiskOps</span>
              </div>
            ))}
            {live.risks.filter((r: any) => r.severity === "Critical" || r.severity === "High").length === 0 && (
              <div style={{ fontSize: 12, color: "var(--muted-foreground)", padding: "16px 0", textAlign: "center" }}>No critical or high risks — posture is clean</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── CHRO Dashboard ────────────────────────────────────────────────────── */
function ChroDashboard() {
  const [, navigate] = useLocation();
  const live = useLive();
  const { meta } = live;
  const chroKpis = [
    { label: "Platform Users",         value: meta.totalUsers,    nav: "/settings", color: "rgb(147,197,253)", bg: "rgba(59,130,246,0.12)", border: "#BFDBFE" },
    { label: "Pending Access Reviews", value: meta.accessReviews, nav: "/serviceops", color: "#D97706", bg: "rgba(245,158,11,0.06)", border: "#FDE68A" },
    { label: "Open Tickets",           value: meta.openTickets,   nav: "/serviceops", color: "#4338CA", bg: "#EEF2FF", border: "#C7D2FE" },
    { label: "Privacy Requests",       value: meta.openDsars,     nav: "/privacyops", color: "#065F46", bg: "rgba(34,197,94,0.08)", border: "#A7F3D0" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "linear-gradient(135deg,rgba(6,78,59,0.35),rgba(30,58,95,0.35))", border: "1px solid rgba(52,211,153,0.25)", borderRadius: 10, padding: "10px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ background: "#065F46", borderRadius: 6, padding: "4px 10px", fontSize: 10, fontWeight: 700, color: "var(--card)" }}>HR & PRIVACY</div>
        <span style={{ fontSize: 12, color: "var(--foreground)", fontWeight: 500 }}>
          {meta.openDsars > 0
            ? `${meta.openDsars} employee privacy request${meta.openDsars !== 1 ? "s" : ""} pending.`
            : "No open privacy requests."}{" "}
          {meta.accessReviews > 0
            ? `${meta.accessReviews} access review${meta.accessReviews !== 1 ? "s" : ""} requiring approval.`
            : ""}{" "}
          {meta.openTickets > 0 ? `${meta.openTickets} open tickets.` : ""}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {chroKpis.map(k => (
          <div key={k.label} onClick={() => navigate(k.nav)} style={{ background: "var(--card)", border: `1px solid ${k.border}`, borderRadius: 12, padding: "14px 16px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)", position: "relative", overflow: "hidden", cursor: "pointer" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: k.color, opacity: 0.7, borderRadius: "12px 12px 0 0" }} />
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.5px", marginBottom: 8, textTransform: "uppercase" }}>{k.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.5px", marginBottom: 16, textTransform: "uppercase" }}>Security Awareness Training</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {live.frameworks.length > 0
              ? live.frameworks.map((f: any) => (
                <div key={f.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: "var(--foreground)", fontWeight: 500 }}>{f.name}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: f.pct >= 80 ? "#065F46" : "#D97706", fontFamily: "'JetBrains Mono', monospace" }}>{f.pct}%</span>
                  </div>
                  <div style={{ height: 6, background: "var(--input)", borderRadius: 4 }}><div style={{ height: "100%", width: `${f.pct}%`, background: f.pct >= 80 ? "#065F46" : "#D97706", borderRadius: 4 }} /></div>
                </div>
              ))
              : <div style={{ fontSize: 11, color: "var(--muted-foreground)", textAlign: "center", padding: "16px 0" }}>No framework data — add controls to see coverage</div>
            }
          </div>
        </div>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.5px", textTransform: "uppercase" }}>Recent Tickets & Access Requests</div>
            <button onClick={() => navigate("/serviceops")} style={{ fontSize: 11, color: "rgb(147,197,253)", fontWeight: 700, cursor: "pointer", background: "none", border: "none", fontFamily: "inherit" }}>All Tickets →</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {live.activity.filter((a: any) => a.type === "ticket").slice(0, 4).map((t: any) => (
              <div key={t.id} onClick={() => navigate("/serviceops")} style={{ display: "flex", gap: 10, padding: "10px 12px", background: "rgba(245,158,11,0.06)", borderRadius: 8, border: "1px solid rgba(251,191,36,0.25)", cursor: "pointer" }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "rgba(245,158,11,0.10)"}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "rgba(245,158,11,0.06)"}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--foreground)" }}>{t.title}</div>
                  <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 2 }}>{t.detail} · {t.actor}</div>
                </div>
                <span style={{ background: t.badgeColor ? `${t.badgeColor}22` : "rgba(245,158,11,0.06)", border: `1px solid ${t.badgeColor ?? "#FDE68A"}44`, color: t.badgeColor ?? "#D97706", borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700, flexShrink: 0, alignSelf: "center" }}>{t.badge}</span>
              </div>
            ))}
            {live.activity.filter((a: any) => a.type === "ticket").length === 0 && (
              <div style={{ fontSize: 11, color: "var(--muted-foreground)", textAlign: "center", padding: "16px 0" }}>No open tickets</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Analyst Dashboard ─────────────────────────────────────────────────── */
function AnalystDashboard({ role }: { role: string }) {
  const [, navigate] = useLocation();
  const live = useLive();
  const isSecurity = role.includes("security") || role === "it_admin";
  const isRisk     = role.includes("risk");
  const isPrivacy  = role.includes("privacy");
  const moduleLink  = isSecurity ? "/secops" : isRisk ? "/riskops" : isPrivacy ? "/privacyops" : "/complianceops";
  const moduleLabel = isSecurity ? "SecOps" : isRisk ? "RiskOps" : isPrivacy ? "PrivacyOps" : "ComplyOps";
  const openItems   = isRisk ? live.meta.openRisks : isPrivacy ? live.meta.openDsars : live.meta.openTickets;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "linear-gradient(135deg,rgba(30,58,95,0.55),rgba(6,78,59,0.4))", border: "1px solid rgba(99,179,237,0.25)", borderRadius: 10, padding: "10px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ background: "linear-gradient(135deg, #1E3A5F, #065F46)", borderRadius: 6, padding: "4px 10px", fontSize: 10, fontWeight: 700, color: "var(--card)" }}>YOUR QUEUE</div>
        <span style={{ fontSize: 12, color: "var(--foreground)", fontWeight: 500 }}>
          {openItems > 0
            ? <>You have <strong>{openItems} open item{openItems !== 1 ? "s" : ""}</strong> in your module. Navigate to take action.</>
            : "Your queue is clear. Navigate to your module to review."}
        </span>
        <button onClick={() => navigate(moduleLink)} style={{ background: "var(--card)", border: "1px solid rgba(99,179,237,0.25)", borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer", color: "rgb(147,197,253)", flexShrink: 0, fontFamily: "inherit" }}>Go to {moduleLabel} →</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        {live.kpis.map((k: any) => <KpiCard key={k.id} {...k} />)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 296px", gap: 16 }}>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.5px", marginBottom: 12, textTransform: "uppercase" }}>My Assigned Items</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(() => {
              const typeFilter = isSecurity ? ["security","cloud-finding"] : isRisk ? ["risk"] : isPrivacy ? ["dsar"] : ["control","policy","audit","ticket"];
              const items = live.activity.filter((a: any) => typeFilter.includes(a.type)).slice(0, 5);
              if (items.length === 0) return (
                <div style={{ fontSize: 12, color: "var(--muted-foreground)", padding: "16px 0", textAlign: "center" }}>No items in your queue — check back later</div>
              );
              return items.map((item: any) => (
                <div key={item.id} onClick={() => navigate(moduleLink)} style={{ display: "flex", gap: 10, padding: "10px 14px", background: "var(--card)", borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer", alignItems: "center" }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "var(--secondary)"}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "var(--card)"}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: item.badgeColor ?? "#6B7280", flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: "var(--foreground)", fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</span>
                  <span style={{ background: `${item.badgeColor ?? "#D97706"}22`, border: `1px solid ${item.badgeColor ?? "#D97706"}44`, color: item.badgeColor ?? "#D97706", borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{item.badge}</span>
                  <span style={{ fontSize: 9, color: "rgba(147,197,253,0.5)", fontWeight: 600, flexShrink: 0 }}>→ {moduleLabel}</span>
                </div>
              ));
            })()}
          </div>
        </div>
        <ActivityFeed items={live.activity} />
      </div>
    </div>
  );
}

/* ── Vendor Dashboard ────────────────────────────────────────────────────── */
function VendorDashboard() {
  const { orgName } = useOrg();
  const live = useLive();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "linear-gradient(135deg, rgba(30,58,95,0.55), rgba(6,78,59,0.4))", border: "1px solid rgba(99,179,237,0.25)", borderRadius: 10, padding: "12px 16px" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "rgb(147,197,253)", marginBottom: 4 }}>Vendor Portal — {orgName}</div>
        <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
          {live.meta.openRisks > 0
            ? <><strong style={{ color: "var(--foreground)" }}>{live.meta.openRisks} open risk{live.meta.openRisks !== 1 ? "s" : ""}</strong> on file for this vendor. {live.meta.criticalRisks > 0 ? `${live.meta.criticalRisks} critical.` : "No critical risks."}</>
            : "No outstanding risks — all compliance attestations are up to date."}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgb(147,197,253)", marginBottom: 12 }}>Required Compliance Frameworks</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {live.frameworks.length > 0
              ? live.frameworks.map((f: any) => (
                <div key={f.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "var(--card)", borderRadius: 8, border: "1px solid var(--border)" }}>
                  <span style={{ fontSize: 12, color: "var(--foreground)", fontWeight: 500 }}>{f.name}</span>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, color: f.pct >= 80 ? "#065F46" : "#D97706" }}>{f.pct}%</span>
                    <span style={{ background: f.pct >= 80 ? "rgba(34,197,94,0.08)" : "rgba(245,158,11,0.08)", border: `1px solid ${f.pct >= 80 ? "#A7F3D0" : "#FDE68A"}`, color: f.pct >= 80 ? "#065F46" : "#92400E", borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{f.pct >= 80 ? "✓ Met" : "In Progress"}</span>
                  </div>
                </div>
              ))
              : <div style={{ fontSize: 12, color: "var(--muted-foreground)", padding: "16px 0", textAlign: "center" }}>No compliance frameworks configured</div>
            }
          </div>
        </div>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgb(147,197,253)", marginBottom: 12 }}>Compliance Overview</div>
          {live.kpis.length > 0
            ? live.kpis.map((k: any) => (
              <div key={k.id} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 12, color: "var(--foreground)" }}>{k.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "rgb(147,197,253)", fontFamily: "'JetBrains Mono', monospace" }}>{k.value}{k.unit ?? ""}</span>
                </div>
                <div style={{ height: 8, background: "var(--input)", borderRadius: 4 }}>
                  <div style={{ height: "100%", width: `${Math.min(100, k.value)}%`, background: k.value >= 75 ? "#065F46" : "#D97706", borderRadius: 4 }} />
                </div>
              </div>
            ))
            : <div style={{ fontSize: 12, color: "var(--muted-foreground)", padding: "16px 0", textAlign: "center" }}>No KPI data available</div>
          }
        </div>
      </div>
    </div>
  );
}

/* ── Employee Dashboard ──────────────────────────────────────────────────── */
function EmployeeDashboard({ user }: { user: { name?: string; email: string } }) {
  const [, navigate] = useLocation();
  const live = useLive();
  const myTickets = live.activity.filter((a: any) => a.type === "ticket").slice(0, 5);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "var(--card)", border: "1px solid rgba(99,179,237,0.25)", borderRadius: 12, padding: "16px 20px" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "rgb(147,197,253)", marginBottom: 4 }}>Welcome back, {user.name ?? user.email.split("@")[0]} 👋</div>
        <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
          {myTickets.length > 0
            ? <>You have <strong style={{ color: "var(--foreground)" }}>{myTickets.length} open ticket{myTickets.length !== 1 ? "s" : ""}</strong> in the service desk. Review them below.</>
            : "Your queue is clear — no open tickets at this time."}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgb(147,197,253)", marginBottom: 12 }}>My Tickets</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {myTickets.length > 0
              ? myTickets.map((t: any) => (
                <div key={t.id} onClick={() => navigate("/serviceops")} style={{ display: "flex", gap: 10, padding: "10px 12px", background: "var(--card)", borderRadius: 8, border: "1px solid var(--border)", alignItems: "center", cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "var(--secondary)"}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "var(--card)"}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: t.badgeColor ?? "#6B7280", flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 12, color: "var(--foreground)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                  <span style={{ background: `${t.badgeColor ?? "#D97706"}22`, border: `1px solid ${t.badgeColor ?? "#D97706"}44`, color: t.badgeColor ?? "#D97706", borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{t.badge}</span>
                </div>
              ))
              : <div style={{ fontSize: 12, color: "var(--muted-foreground)", padding: "16px 0", textAlign: "center" }}>No open tickets</div>
            }
          </div>
          <button onClick={() => navigate("/serviceops")} style={{ marginTop: 12, width: "100%", background: "linear-gradient(135deg, #1E3A5F, #065F46)", border: "none", borderRadius: 8, padding: "9px", fontSize: 12, fontWeight: 700, color: "white", cursor: "pointer", fontFamily: "inherit" }}>Submit New Request</button>
        </div>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgb(147,197,253)", marginBottom: 12 }}>Security Tips</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { icon: "🔑", tip: "Use a unique, strong password for every account. Consider a password manager." },
              { icon: "📱", tip: "Enable MFA on all work accounts to protect against account takeover." },
              { icon: "📧", tip: "Always verify unusual email requests, even from known senders." },
              { icon: "🔒", tip: "Lock your workstation (Win+L / Cmd+Ctrl+Q) when stepping away." },
            ].map((t, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 10px", background: "rgba(34,197,94,0.08)", borderRadius: 8, border: "1px solid rgba(52,211,153,0.2)" }}>
                <span style={{ fontSize: 16 }}>{t.icon}</span>
                <span style={{ fontSize: 11, color: "var(--foreground)", lineHeight: 1.5 }}>{t.tip}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Role dispatch ─────────────────────────────────────────────────────── */
export default function Dashboard() {
  const { user } = useAuth();
  const [insightIdx, setInsightIdx] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setTimeout(() => setMounted(true), 60); }, []);
  useEffect(() => {
    const t = setInterval(() => setInsightIdx(i => (i + 1) % aiInsights.length), 8000);
    return () => clearInterval(t);
  }, []);

  const { data: kpisData, isError: kpisError } = useDashboardKpis();
  const { data: activityData, isError: actError } = useDashboardActivity();
  const { data: risksData, isError: risksError } = useRisks();
  const apiError = kpisError || actError || risksError;

  const liveData: DashLive = {
    kpis:         kpisData?.kpis             ?? [],
    riskSegments: kpisData?.riskSegments      ?? [],
    frameworks:   kpisData?.frameworkCoverage  ?? [],
    activity:     Array.isArray(activityData)  ? activityData : [],
    risks:        Array.isArray(risksData)
      ? risksData.map((r: any) => ({
          ...r,
          id: r.riskId ?? r.id,
          owner: r.owner ?? ((r.ownerFull ?? "").split(" ").map((n: string) => n[0]).join("") || "?"),
        }))
      : [],
    meta: kpisData?.meta ? {
      grcScore:       Number(kpisData.meta.grcScore       ?? 0),
      grcLabel:       String(kpisData.meta.grcLabel       ?? "No Data"),
      coverage:       Number(kpisData.meta.coverage        ?? 0),
      openRisks:      Number(kpisData.meta.openRisks       ?? 0),
      criticalRisks:  Number(kpisData.meta.criticalRisks   ?? 0),
      activeAudits:   Number(kpisData.meta.activeAudits    ?? 0),
      privacyScore:   Number(kpisData.meta.privacyScore    ?? 0),
      openDsars:      Number(kpisData.meta.openDsars       ?? 0),
      overdueDsars:   Number(kpisData.meta.overdueDsars    ?? 0),
      totalDsars:     Number(kpisData.meta.totalDsars      ?? 0),
      totalUsers:     Number(kpisData.meta.totalUsers       ?? 0),
      openTickets:    Number(kpisData.meta.openTickets      ?? 0),
      accessReviews:  Number(kpisData.meta.accessReviews    ?? 0),
      vendorAvgScore: Number(kpisData.meta.vendorAvgScore   ?? 0),
      criticalVendors:Number(kpisData.meta.criticalVendors  ?? 0),
    } : META0,
  };

  const role = user?.role ?? "ciso";

  const renderDashboard = () => {
    if (role === "cro") return <CroDashboard />;
    if (role === "cdpo" || role === "privacy_analyst") return <CdpoDashboard />;
    if (role === "chro") return <ChroDashboard />;
    if (role === "management") return <ManagementDashboard />;
    if (role === "vendor") return <VendorDashboard />;
    if (role === "employee") return <EmployeeDashboard user={user ?? { email: "user@acme.com" }} />;
    if (["security_analyst", "risk_analyst", "compliance_analyst", "it_admin"].includes(role)) return <AnalystDashboard role={role} />;
    return <CisoDashboard insightIdx={insightIdx} setInsightIdx={setInsightIdx} mounted={mounted} />;
  };

  const roleGreetings: Record<string, string> = {
    ciso: "GRC Command Center", cro: "Risk Overview",
    cdpo: "Privacy Control Center", chro: "HR & People Security",
    management: "Executive Dashboard", vendor: "Vendor Portal",
    employee: "My Workspace", security_analyst: "Security Analyst View",
    risk_analyst: "Risk Analyst View", compliance_analyst: "Compliance Analyst View",
    it_admin: "IT Admin View", privacy_analyst: "Privacy Analyst View",
    tenant_admin: "GRC Command Center", super_admin: "GRC Command Center",
    admin: "GRC Command Center",
  };
  return (
    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 4 }}>
      {apiError && (
        <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid #FECACA", borderRadius: 8, padding: "8px 14px", fontSize: 12, color: "#DC2626", marginBottom: 4, fontWeight: 600 }}>
          ⚠ Could not reach the API server — showing cached data. Check your connection or refresh.
        </div>
      )}
      <div style={{ marginBottom: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: "rgb(147,197,253)", letterSpacing: "-0.5px", margin: 0 }}>{roleGreetings[role] ?? "Dashboard"}</h1>
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: "4px 0 0", fontWeight: 500 }}>
          {user?.name ? `Welcome back, ${user.name} · ` : ""}{new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>
      <AICopilotBar module="dashboard" />
      <LiveCtx.Provider value={liveData}>
        {renderDashboard()}
      </LiveCtx.Provider>
    </div>
  );
}
