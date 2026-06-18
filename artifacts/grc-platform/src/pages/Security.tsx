import { useState } from "react";
import { useOrg } from "@/context/OrgContext";

function StatCard({ label, value, unit, color, border }: { label: string; value: string | number; unit?: string; color: string; border: string }) {
  return (
    <div style={{ background: "var(--card)", border: `1px solid ${border}`, borderRadius: 12, padding: "16px 18px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: color, opacity: 0.7, borderRadius: "12px 12px 0 0" }} />
      <div style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
        <span style={{ fontSize: 30, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color }}>{value}</span>
        {unit && <span style={{ fontSize: 13, color: "#9CA3AF", fontFamily: "'JetBrains Mono', monospace" }}>{unit}</span>}
      </div>
    </div>
  );
}

const assets = [
  { type: "Server",         count: 142, new: 2,  status: "healthy", color: "#065F46" },
  { type: "Workstation",    count: 847, new: 14, status: "healthy", color: "rgb(147,197,253)" },
  { type: "Cloud Service",  count: 63,  new: 5,  status: "alert",   color: "#D97706" },
  { type: "SaaS App",       count: 31,  new: 3,  status: "alert",   color: "#DC2626" },
  { type: "IoT Device",     count: 28,  new: 0,  status: "unknown", color: "#9CA3AF" },
  { type: "Network Device", count: 19,  new: 1,  status: "healthy", color: "#4338CA" },
];

const findings = [
  { id: "CSPM-0041", cloud: "AWS",   severity: "Critical", title: "S3 bucket with public read access",        resource: "s3://acme-prod-data",    status: "open",       category: "Storage" },
  { id: "CSPM-0039", cloud: "AWS",   severity: "High",     title: "Security group allows 0.0.0.0/0 on 22",   resource: "sg-0b2f3f4d5e6",        status: "open",       category: "Network" },
  { id: "CSPM-0037", cloud: "Azure", severity: "High",     title: "Storage account allows public blob access",resource: "acmeprod.blob.core",     status: "remediated", category: "Storage" },
  { id: "CSPM-0035", cloud: "GCP",   severity: "Medium",   title: "Cloud SQL without private IP",             resource: "sql:acme-prod-db",       status: "open",       category: "Database" },
  { id: "SSPM-0021", cloud: "M365",  severity: "Medium",   title: "Teams external access unrestricted",        resource: "teams-tenant",           status: "open",       category: "Collaboration" },
  { id: "SSPM-0019", cloud: "Slack", severity: "Low",      title: "Legacy app tokens not rotated in 90d",     resource: "workspace-acme",         status: "open",       category: "Access" },
];

const sspmApps = [
  { app: "Microsoft 365", vendor: "Microsoft", score: 68, issues: 4, critical: 1, mfa: true,  sso: true,  dlp: false, lastScan: "2 hours ago",   trend: "down" },
  { app: "Slack",         vendor: "Slack",     score: 74, issues: 2, critical: 0, mfa: true,  sso: true,  dlp: false, lastScan: "3 hours ago",   trend: "flat" },
  { app: "GitHub",        vendor: "GitHub",    score: 81, issues: 1, critical: 0, mfa: false, sso: true,  dlp: false, lastScan: "4 hours ago",   trend: "up" },
  { app: "Salesforce",    vendor: "Salesforce",score: 57, issues: 6, critical: 2, mfa: true,  sso: false, dlp: true,  lastScan: "6 hours ago",   trend: "down" },
  { app: "Zoom",          vendor: "Zoom",      score: 72, issues: 3, critical: 0, mfa: true,  sso: true,  dlp: false, lastScan: "8 hours ago",   trend: "flat" },
  { app: "Jira",          vendor: "Atlassian", score: 63, issues: 4, critical: 1, mfa: false, sso: true,  dlp: false, lastScan: "12 hours ago",  trend: "down" },
];

const sevStyle: Record<string, { bg: string; color: string; border: string }> = {
  Critical: { bg: "rgba(239,68,68,0.06)",  color: "#991B1B", border: "#FECACA" },
  High:     { bg: "rgba(245,158,11,0.06)", color: "#92400E", border: "#FDE68A" },
  Medium:   { bg: "#EEF2FF",               color: "#3730A3", border: "#C7D2FE" },
  Low:      { bg: "rgba(34,197,94,0.08)",  color: "#065F46", border: "#A7F3D0" },
};

type Finding = typeof findings[0];

export default function Security() {
  const { viewTenantId } = useOrg();
  const [activeTab, setActiveTab] = useState<"caasm" | "cspm" | "sspm">("caasm");
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [findingFilter, setFindingFilter] = useState<"all" | "open" | "remediated">("all");
  const [sevFilter, setSevFilter] = useState<"all" | "Critical" | "High" | "Medium" | "Low">("all");

  const lFindings = viewTenantId === 1 ? findings : [];

  const filteredFindings = lFindings.filter(f => {
    const matchStatus = findingFilter === "all" || f.status === findingFilter;
    const matchSev = sevFilter === "all" || f.severity === sevFilter;
    return matchStatus && matchSev;
  });

  const openCount = lFindings.filter(f => f.status === "open").length;
  const critCount = lFindings.filter(f => f.severity === "Critical").length;

  const TABS = [
    { key: "caasm", label: "Asset Inventory (CAASM)" },
    { key: "cspm",  label: "Cloud Findings (CSPM)" },
    { key: "sspm",  label: "SaaS Config Drift (SSPM)" },
  ] as const;

  return (
    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "rgb(147,197,253)", letterSpacing: "-0.5px", margin: 0 }}>Security Intelligence</h1>
          <p style={{ fontSize: 12, color: "#9CA3AF", margin: "4px 0 0", fontWeight: 500 }}>CAASM · CSPM · SSPM · Network Security</p>
        </div>
        <button style={{ background: "linear-gradient(135deg, #1E3A5F, #065F46)", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, color: "white", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 2px 8px rgba(30,58,95,0.3)" }}>
          ↻ Sync Connectors
        </button>
      </div>

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <StatCard label="Total Assets"   value={1130}         color="#1E3A5F" border="#BFDBFE" />
        <StatCard label="Open Findings"  value={openCount}    color="#DC2626" border="#FECACA" />
        <StatCard label="SSPM Apps"      value={sspmApps.length} color="#D97706" border="#FDE68A" />
        <StatCard label="Security Score" value={76} unit="/100" color="#065F46" border="#A7F3D0" />
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", width: "fit-content" }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: "none", borderRight: "1px solid var(--border)", background: activeTab === t.key ? "rgba(59,130,246,0.12)" : "transparent", color: activeTab === t.key ? "#1E3A5F" : "#6B7280", transition: "all 0.15s" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* CAASM Tab */}
      {activeTab === "caasm" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 14 }}>Asset Inventory by Type</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10 }}>
              {assets.map((a) => (
                <div key={a.type} style={{ textAlign: "center", padding: "14px 8px", background: "var(--input)", borderRadius: 10, border: `1px solid ${a.status === "alert" ? "rgba(239,68,68,0.3)" : "var(--border)"}`, cursor: "pointer", transition: "all 0.15s" }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.border = `1px solid ${a.color}40`}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.border = `1px solid ${a.status === "alert" ? "rgba(239,68,68,0.3)" : "var(--border)"}`}>
                  <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: a.color }}>{a.count}</div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "var(--foreground)", marginTop: 4 }}>{a.type}</div>
                  <div style={{ fontSize: 9, color: a.status === "alert" ? "#DC2626" : a.status === "unknown" ? "#9CA3AF" : "#065F46", fontWeight: 700, marginTop: 4 }}>
                    {a.status === "alert" ? "⚠ Alert" : a.status === "unknown" ? "? Unknown" : "✓ Healthy"}
                  </div>
                  {a.new > 0 && <div style={{ fontSize: 9, color: "#D97706", fontWeight: 600, marginTop: 2 }}>+{a.new} new</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Asset breakdown bars */}
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 14 }}>Coverage & Health by Asset Type</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {assets.map(a => {
                const total = assets.reduce((s, x) => s + x.count, 0);
                const pct = Math.round((a.count / total) * 100);
                return (
                  <div key={a.type}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--foreground)" }}>{a.type}</span>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: a.color }}>{a.count}</span>
                        <span style={{ fontSize: 9, color: "#9CA3AF" }}>{pct}%</span>
                      </div>
                    </div>
                    <div style={{ height: 8, background: "var(--input)", borderRadius: 4 }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: a.color, borderRadius: 4, opacity: 0.8, transition: "width 0.5s ease" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* CSPM Tab */}
      {activeTab === "cspm" && (
        <div style={{ display: "grid", gridTemplateColumns: selectedFinding ? "1fr 360px" : "1fr", gap: 16 }}>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "rgb(147,197,253)" }}>CSPM / SSPM Findings</span>
              <div style={{ display: "flex", gap: 6 }}>
                {(["all", "open", "remediated"] as const).map(s => (
                  <button key={s} onClick={() => setFindingFilter(s)}
                    style={{ padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: findingFilter === s ? "1px solid #BFDBFE" : "1px solid var(--border)", background: findingFilter === s ? "rgba(59,130,246,0.12)" : "transparent", color: findingFilter === s ? "#1E3A5F" : "#6B7280" }}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
                <div style={{ width: 1, background: "var(--border)" }} />
                {(["all", "Critical", "High", "Medium", "Low"] as const).map(s => (
                  <button key={s} onClick={() => setSevFilter(s)}
                    style={{ padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: sevFilter === s ? (s === "all" ? "1px solid #BFDBFE" : `1px solid ${sevStyle[s]?.border}`) : "1px solid var(--border)", background: sevFilter === s ? (s === "all" ? "rgba(59,130,246,0.12)" : sevStyle[s]?.bg) : "transparent", color: sevFilter === s ? (s === "all" ? "#1E3A5F" : sevStyle[s]?.color) : "#6B7280" }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "var(--card)", borderBottom: "1px solid var(--border)" }}>
                  {["ID", "Platform", "Severity", "Finding", "Resource", "Category", "Status"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "10px 14px", color: "#9CA3AF", fontWeight: 700, fontSize: 10, letterSpacing: "0.5px", textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredFindings.map((f) => (
                  <tr key={f.id} onClick={() => setSelectedFinding(selectedFinding?.id === f.id ? null : f)}
                    style={{ borderBottom: "1px solid var(--border)", cursor: "pointer", background: selectedFinding?.id === f.id ? "rgba(59,130,246,0.06)" : "transparent", transition: "background 0.1s" }}
                    onMouseEnter={e => { if (selectedFinding?.id !== f.id) (e.currentTarget as HTMLTableRowElement).style.background = "var(--secondary)"; }}
                    onMouseLeave={e => { if (selectedFinding?.id !== f.id) (e.currentTarget as HTMLTableRowElement).style.background = "transparent"; }}>
                    <td style={{ padding: "11px 14px", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#9CA3AF", fontWeight: 600 }}>{f.id}</td>
                    <td style={{ padding: "11px 14px" }}>
                      <span style={{ background: "var(--input)", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 7px", fontSize: 10, fontWeight: 700, color: "var(--foreground)" }}>{f.cloud}</span>
                    </td>
                    <td style={{ padding: "11px 14px" }}>
                      <span style={{ background: sevStyle[f.severity].bg, border: `1px solid ${sevStyle[f.severity].border}`, color: sevStyle[f.severity].color, borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{f.severity}</span>
                    </td>
                    <td style={{ padding: "11px 14px", color: "var(--foreground)", fontWeight: 500, maxWidth: 220 }}>
                      <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.title}</div>
                    </td>
                    <td style={{ padding: "11px 14px", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#6B7280" }}>{f.resource}</td>
                    <td style={{ padding: "11px 14px" }}>
                      <span style={{ background: "var(--input)", border: "1px solid var(--border)", borderRadius: 3, padding: "1px 6px", fontSize: 9, color: "#6B7280", fontWeight: 600 }}>{f.category}</span>
                    </td>
                    <td style={{ padding: "11px 14px" }}>
                      <span style={{ background: f.status === "remediated" ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.06)", border: `1px solid ${f.status === "remediated" ? "#A7F3D0" : "#FECACA"}`, color: f.status === "remediated" ? "#065F46" : "#991B1B", borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>
                        {f.status === "remediated" ? "Remediated" : "Open"}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredFindings.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: 32, textAlign: "center", color: "#9CA3AF" }}>No findings match your filters</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Finding Detail */}
          {selectedFinding && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)", display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#9CA3AF", fontWeight: 600, marginBottom: 6 }}>{selectedFinding.id}</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <span style={{ background: sevStyle[selectedFinding.severity].bg, border: `1px solid ${sevStyle[selectedFinding.severity].border}`, color: sevStyle[selectedFinding.severity].color, borderRadius: 4, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>{selectedFinding.severity}</span>
                    <span style={{ background: "var(--input)", border: "1px solid var(--border)", borderRadius: 4, padding: "3px 10px", fontSize: 11, fontWeight: 700, color: "var(--foreground)" }}>{selectedFinding.cloud}</span>
                  </div>
                </div>
                <button onClick={() => setSelectedFinding(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 18 }}>×</button>
              </div>

              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: "rgb(147,197,253)", margin: "0 0 8px", lineHeight: 1.4 }}>{selectedFinding.title}</h3>
                <p style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.6, margin: 0 }}>
                  This misconfiguration exposes resources to unauthorized access. Immediate remediation is recommended to reduce attack surface and maintain compliance posture.
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, background: "var(--input)", borderRadius: 8, padding: "12px 14px" }}>
                {[
                  ["Resource", selectedFinding.resource],
                  ["Category", selectedFinding.category],
                  ["Platform", selectedFinding.cloud],
                  ["Status", selectedFinding.status === "remediated" ? "✓ Remediated" : "⚠ Open"],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 600 }}>{k}</span>
                    <span style={{ fontSize: 11, color: "var(--foreground)", fontWeight: 600, fontFamily: k === "Resource" ? "'JetBrains Mono', monospace" : "inherit" }}>{v}</span>
                  </div>
                ))}
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>Remediation Steps</div>
                {["Review the resource configuration in the cloud console", "Apply the recommended security policy", "Verify the fix with a re-scan", "Document the remediation in the audit trail"].map((step, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                    <span style={{ width: 18, height: 18, background: "rgba(59,130,246,0.12)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: "#1E3A5F", flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
                    <span style={{ fontSize: 11, color: "var(--foreground)", lineHeight: 1.5 }}>{step}</span>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ flex: 1, background: "linear-gradient(135deg, #1E3A5F, #065F46)", border: "none", borderRadius: 8, padding: "8px", fontSize: 12, fontWeight: 700, color: "white", cursor: "pointer", fontFamily: "inherit" }}>Create Ticket</button>
                <button style={{ flex: 1, background: "var(--input)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px", fontSize: 12, fontWeight: 700, color: "var(--foreground)", cursor: "pointer", fontFamily: "inherit" }}>Mark Remediated</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SSPM Tab */}
      {activeTab === "sspm" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "rgb(147,197,253)" }}>SaaS Security Posture — Configuration Drift</span>
              <span style={{ marginLeft: 10, fontSize: 11, color: "#9CA3AF" }}>Last scanned: {sspmApps[0].lastScan}</span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "var(--card)", borderBottom: "1px solid var(--border)" }}>
                  {["Application", "Security Score", "Issues", "MFA", "SSO", "DLP", "Trend", "Last Scan"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "10px 14px", color: "#9CA3AF", fontWeight: 700, fontSize: 10, letterSpacing: "0.5px", textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sspmApps.map((app) => {
                  const scoreColor = app.score >= 80 ? "#065F46" : app.score >= 65 ? "#D97706" : "#DC2626";
                  const scoreBg = app.score >= 80 ? "rgba(34,197,94,0.08)" : app.score >= 65 ? "rgba(245,158,11,0.06)" : "rgba(239,68,68,0.06)";
                  return (
                    <tr key={app.app} style={{ borderBottom: "1px solid var(--border)", cursor: "default" }}
                      onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "var(--secondary)"}
                      onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = "transparent"}>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ fontWeight: 700, color: "var(--foreground)", fontSize: 12 }}>{app.app}</div>
                        <div style={{ fontSize: 10, color: "#9CA3AF" }}>{app.vendor}</div>
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ background: scoreBg, color: scoreColor, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>{app.score}</span>
                          <div style={{ width: 60, height: 4, background: "var(--input)", borderRadius: 2 }}>
                            <div style={{ height: "100%", width: `${app.score}%`, background: scoreColor, borderRadius: 2 }} />
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", gap: 4 }}>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, color: app.issues > 0 ? "#DC2626" : "#065F46", fontSize: 13 }}>{app.issues}</span>
                          {app.critical > 0 && <span style={{ background: "rgba(239,68,68,0.06)", border: "1px solid #FECACA", color: "#991B1B", borderRadius: 3, padding: "1px 5px", fontSize: 9, fontWeight: 700 }}>{app.critical} critical</span>}
                        </div>
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <span style={{ fontSize: 12, color: app.mfa ? "#065F46" : "#DC2626", fontWeight: 700 }}>{app.mfa ? "✓" : "✗"}</span>
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <span style={{ fontSize: 12, color: app.sso ? "#065F46" : "#DC2626", fontWeight: 700 }}>{app.sso ? "✓" : "✗"}</span>
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <span style={{ fontSize: 12, color: app.dlp ? "#065F46" : "#9CA3AF", fontWeight: 700 }}>{app.dlp ? "✓" : "—"}</span>
                      </td>
                      <td style={{ padding: "12px 14px", fontWeight: 700, color: app.trend === "up" ? "#065F46" : app.trend === "down" ? "#DC2626" : "#9CA3AF", fontSize: 14 }}>
                        {app.trend === "up" ? "▲" : app.trend === "down" ? "▼" : "—"}
                      </td>
                      <td style={{ padding: "12px 14px", fontSize: 11, color: "#9CA3AF" }}>{app.lastScan}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* SSPM drift summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {[
              { label: "Apps Without MFA", value: sspmApps.filter(a => !a.mfa).length, color: "#DC2626", bg: "rgba(239,68,68,0.06)", border: "#FECACA", note: "Require MFA enforcement" },
              { label: "Apps Without SSO", value: sspmApps.filter(a => !a.sso).length, color: "#D97706", bg: "rgba(245,158,11,0.06)", border: "#FDE68A", note: "Centralize identity" },
              { label: "Apps Drifting Down", value: sspmApps.filter(a => a.trend === "down").length, color: "#DC2626", bg: "rgba(239,68,68,0.06)", border: "#FECACA", note: "Score declining" },
            ].map(card => (
              <div key={card.label} style={{ background: "var(--card)", border: `1px solid ${card.border}`, borderRadius: 12, padding: "14px 18px", boxShadow: "0 1px 6px rgba(0,0,0,0.08)" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>{card.label}</div>
                <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: card.color }}>{card.value}</div>
                <div style={{ fontSize: 10, color: card.color, fontWeight: 600, marginTop: 4 }}>{card.note}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
