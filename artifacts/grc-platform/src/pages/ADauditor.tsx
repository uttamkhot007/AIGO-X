import { useState, useEffect, useCallback, useRef } from "react";
import { ReactFlow, Background, Controls, MiniMap, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { SubNav } from "@/components/SubNav";
import { useLicense } from "@/context/LicenseContext";

const NAV = "#1E3A5F";
const EME = "#065F46";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "").replace(/\/grc-platform$/, "");

const TABS = [
  { key: "overview",    label: "Overview" },
  { key: "accounts",   label: "Privileged Accounts" },
  { key: "gpo",        label: "GPO Findings" },
  { key: "password",   label: "Password Policy" },
  { key: "attackpath", label: "Attack Paths" },
  { key: "behaviour",  label: "Behaviour Analytics" },
  { key: "changefeed", label: "Change Feed" },
  { key: "config",     label: "Configuration" },
];

const riskBadge: Record<string, { bg: string; color: string; border: string }> = {
  Critical: { bg: "rgba(239,68,68,0.06)", color: "#991B1B", border: "#FECACA" },
  High:     { bg: "rgba(245,158,11,0.06)", color: "#92400E", border: "#FDE68A" },
  Medium:   { bg: "#EEF2FF", color: "#3730A3", border: "#C7D2FE" },
  Low:      { bg: "rgba(34,197,94,0.08)", color: "#065F46", border: "#A7F3D0" },
};

const sevBadge: Record<string, { bg: string; color: string; border: string }> = {
  Critical: { bg: "rgba(239,68,68,0.06)", color: "#991B1B", border: "#FECACA" },
  High:     { bg: "rgba(245,158,11,0.06)", color: "#92400E", border: "#FDE68A" },
  Medium:   { bg: "#EEF2FF", color: "#3730A3", border: "#C7D2FE" },
  Low:      { bg: "rgba(34,197,94,0.08)", color: "#065F46", border: "#A7F3D0" },
};

function useAdData<T>(path: string, defaultVal: T) {
  const [data, setData] = useState<T>(defaultVal);
  const [loading, setLoading] = useState(false);
  const token = localStorage.getItem("grc_token");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api${path}`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) {
        const ct = r.headers.get("content-type") ?? "";
        if (ct.includes("application/json")) setData(await r.json() as T);
      }
    } catch {
      // keep default value on network / parse errors
    } finally {
      setLoading(false);
    }
  }, [path, token]);
  useEffect(() => { load(); }, [load]);
  return { data, loading, reload: load };
}

// ── Overview ──────────────────────────────────────────────────────────────────

function OverviewTab() {
  const { data: accData } = useAdData<{ stats: { total: number; stale: number; critical: number; serviceAccounts: number } }>("/ad-auditor/privileged-accounts", { stats: { total: 8, stale: 3, critical: 3, serviceAccounts: 4 } });
  const { data: gpoData } = useAdData<{ stats: { total: number; critical: number; high: number; open: number } }>("/ad-auditor/gpo", { stats: { total: 7, critical: 1, high: 2, open: 5 } });
  const { data: pwData } = useAdData<{ policies: Array<{ domain: string; score: number; grade: string }> }>("/ad-auditor/password-policy", { policies: [] });

  const avgPwScore = pwData.policies.length ? Math.round(pwData.policies.reduce((s, p) => s + p.score, 0) / pwData.policies.length) : 55;

  const kpis = [
    { label: "Privileged Accounts",  value: accData.stats.total,    color: NAV,      sub: `${accData.stats.stale} stale` },
    { label: "Stale Admins",         value: accData.stats.stale,    color: "#DC2626", sub: ">90 days inactive" },
    { label: "Critical Risk Accts",  value: accData.stats.critical, color: "#DC2626", sub: "Immediate action" },
    { label: "GPO Findings",         value: gpoData.stats.total,    color: "#D97706", sub: `${gpoData.stats.critical} critical` },
    { label: "Avg Pwd Policy Score", value: `${avgPwScore}%`,       color: avgPwScore < 50 ? "#DC2626" : "#D97706", sub: "vs CIS Benchmark" },
    { label: "Attack Paths",         value: 5,                      color: "#7C3AED", sub: "To domain admin" },
  ];

  return (
    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", boxShadow: "0 1px 6px rgba(0,0,0,0.05)", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: k.color, borderRadius: "12px 12px 0 0" }} />
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontSize: 30, fontWeight: 800, fontFamily: "monospace", color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: NAV, marginBottom: 12 }}>Critical Security Findings</div>
          {[
            { title: "3 service accounts with Domain Admin rights", severity: "Critical", recommendation: "Remove DA from service accounts, use least-privilege service accounts" },
            { title: "Outbound firewall — all traffic allowed (GPO-007)", severity: "Critical", recommendation: "Implement default-deny outbound with allowlist for required services" },
            { title: "Legacy domain password policy — score 31/100", severity: "High", recommendation: "Enforce 14+ char passwords, 5-attempt lockout, 90-day max age" },
            { title: "5 attack paths leading to Domain Admin", severity: "High", recommendation: "Break attack paths: remove admin.svc from Domain Admins, reset stale creds" },
          ].map((f, i) => (
            <div key={i} style={{ display: "flex", gap: 10, marginBottom: 12, paddingBottom: 12, borderBottom: i < 3 ? "1px solid #F9FAFB" : "none" }}>
              <span style={{ background: sevBadge[f.severity]!.bg, border: `1px solid ${sevBadge[f.severity]!.border}`, color: sevBadge[f.severity]!.color, borderRadius: 4, padding: "1px 6px", fontSize: 9, fontWeight: 700, flexShrink: 0, alignSelf: "flex-start", marginTop: 2 }}>{f.severity}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--foreground)" }}>{f.title}</div>
                <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 3 }}>{f.recommendation}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: NAV, marginBottom: 12 }}>Domain Password Score</div>
          {pwData.policies.map((p, i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--foreground)" }}>{p.domain}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "monospace", color: p.score < 50 ? "#DC2626" : p.score < 70 ? "#D97706" : EME }}>{p.score}</div>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: p.grade === "F" ? "rgba(239,68,68,0.06)" : p.grade === "C" ? "rgba(245,158,11,0.06)" : "rgba(34,197,94,0.08)", border: `2px solid ${p.grade === "F" ? "#DC2626" : p.grade === "C" ? "#D97706" : EME}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: p.grade === "F" ? "#DC2626" : p.grade === "C" ? "#D97706" : EME }}>{p.grade}</div>
                </div>
              </div>
              <div style={{ height: 8, background: "var(--input)", borderRadius: 4 }}>
                <div style={{ height: "100%", width: `${p.score}%`, background: p.score < 50 ? "#DC2626" : p.score < 70 ? "#D97706" : EME, borderRadius: 4, transition: "width 0.6s ease" }} />
              </div>
            </div>
          ))}
          {!pwData.policies.length && (
            <div style={{ display: "flex", gap: 0, flexDirection: "column" }}>
              {[{ domain: "CORP.ACME.LOCAL", score: 78, grade: "B" }, { domain: "LEGACY.ACME.LOCAL", score: 31, grade: "F" }, { domain: "DEV.ACME.LOCAL", score: 55, grade: "C" }].map(p => (
                <div key={p.domain} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--foreground)" }}>{p.domain}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, fontFamily: "monospace", color: p.score < 50 ? "#DC2626" : p.score < 70 ? "#D97706" : EME }}>{p.score} ({p.grade})</span>
                  </div>
                  <div style={{ height: 6, background: "var(--input)", borderRadius: 3 }}>
                    <div style={{ height: "100%", width: `${p.score}%`, background: p.score < 50 ? "#DC2626" : p.score < 70 ? "#D97706" : EME, borderRadius: 3 }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Privileged Accounts ────────────────────────────────────────────────────────

function AccountsTab() {
  const [staleFilter, setStaleFilter] = useState("all");
  const [search, setSearch] = useState("");
  const { data, loading } = useAdData<{ accounts: Array<{ id: string; username: string; displayName: string; type: string; domain: string; groups: string[]; lastLogin: string; passwordAge: number; stale: boolean; risk: string; escalationPaths: number }>; stats: { total: number; stale: number; critical: number; serviceAccounts: number } }>("/ad-auditor/privileged-accounts", { accounts: [], stats: { total: 0, stale: 0, critical: 0, serviceAccounts: 0 } });

  const filtered = data.accounts.filter(a => {
    if (staleFilter === "stale" && !a.stale) return false;
    if (staleFilter === "service" && a.type !== "service") return false;
    if (search && !a.username.toLowerCase().includes(search.toLowerCase()) && !a.displayName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search accounts..."
          style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "7px 12px", fontSize: 12, width: 200, fontFamily: "inherit", outline: "none", background: "var(--card)" }} />
        {[["all", "All"], ["stale", "Stale Only"], ["service", "Service Accounts"]].map(([v, l]) => (
          <button key={v} onClick={() => setStaleFilter(v)}
            style={{ padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: staleFilter === v ? "1px solid rgba(99,179,237,0.25)" : "1px solid var(--border)", background: staleFilter === v ? "rgba(59,130,246,0.12)" : "white", color: staleFilter === v ? NAV : "#6B7280" }}>{l}</button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted-foreground)", fontWeight: 600 }}>{filtered.length} accounts</span>
      </div>

      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
        {loading && <div style={{ padding: "40px", textAlign: "center", fontSize: 12, color: "var(--muted-foreground)" }}>Loading accounts...</div>}
        {!loading && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "var(--card)", borderBottom: "1px solid var(--border)" }}>
                {["Account", "Type", "Domain", "Groups", "Last Login", "Pwd Age", "Status", "Risk", "Paths"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 14px", color: "var(--muted-foreground)", fontWeight: 700, fontSize: 10, letterSpacing: "0.5px", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr key={a.id} style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "var(--secondary)"}
                  onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = "var(--secondary)"}>
                  <td style={{ padding: "11px 14px" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: NAV, fontFamily: "monospace" }}>{a.username}</div>
                    <div style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{a.displayName}</div>
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    <span style={{ background: a.type === "service" ? "rgba(59,130,246,0.08)" : "#F5F3FF", border: `1px solid ${a.type === "service" ? "#BAE6FD" : "#DDD6FE"}`, color: a.type === "service" ? "#0369A1" : "#6D28D9", borderRadius: 4, padding: "2px 7px", fontSize: 10, fontWeight: 700 }}>{a.type}</span>
                  </td>
                  <td style={{ padding: "11px 14px", fontSize: 11, fontFamily: "monospace", color: "#6B7280" }}>{a.domain}</td>
                  <td style={{ padding: "11px 14px" }}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {a.groups.slice(0, 2).map(g => (
                        <span key={g} style={{ background: g.includes("Domain Admins") || g.includes("Enterprise Admins") ? "rgba(239,68,68,0.06)" : "var(--border)", border: `1px solid ${g.includes("Domain Admins") || g.includes("Enterprise Admins") ? "#FECACA" : "rgba(255,255,255,0.1)"}`, color: g.includes("Domain Admins") || g.includes("Enterprise Admins") ? "#991B1B" : "#6B7280", borderRadius: 3, padding: "1px 6px", fontSize: 9, fontWeight: 700 }}>{g}</span>
                      ))}
                      {a.groups.length > 2 && <span style={{ fontSize: 9, color: "var(--muted-foreground)", fontWeight: 600 }}>+{a.groups.length - 2}</span>}
                    </div>
                  </td>
                  <td style={{ padding: "11px 14px", fontSize: 11, color: a.lastLogin === "Never" ? "#DC2626" : "#6B7280" }}>{a.lastLogin}</td>
                  <td style={{ padding: "11px 14px" }}>
                    <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: a.passwordAge > 365 ? "#DC2626" : a.passwordAge > 90 ? "#D97706" : EME }}>{a.passwordAge}d</span>
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    {a.stale ? <span style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(252,165,165,0.25)", color: "#991B1B", borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>Stale</span>
                             : <span style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(52,211,153,0.25)", color: EME, borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>Active</span>}
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    <span style={{ background: riskBadge[a.risk]!.bg, border: `1px solid ${riskBadge[a.risk]!.border}`, color: riskBadge[a.risk]!.color, borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{a.risk}</span>
                  </td>
                  <td style={{ padding: "11px 14px", fontFamily: "monospace", fontSize: 11, fontWeight: 800, color: a.escalationPaths > 8 ? "#DC2626" : a.escalationPaths > 3 ? "#D97706" : "var(--muted-foreground)" }}>{a.escalationPaths}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── GPO Findings ──────────────────────────────────────────────────────────────

function GpoTab({ fwFilter }: { fwFilter: string }) {
  const path = fwFilter && fwFilter !== "all"
    ? `/ad-auditor/gpo?framework=${encodeURIComponent(fwFilter)}`
    : "/ad-auditor/gpo";
  const { data } = useAdData<{ findings: Array<{ id: string; name: string; severity: string; finding: string; recommendation: string; cis: string; status: string }>; stats: Record<string, number> }>(path, { findings: [], stats: {} });
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { label: "Total GPO Findings", value: data.stats["total"] ?? 7,    color: NAV },
          { label: "Critical",           value: data.stats["critical"] ?? 1, color: "#DC2626" },
          { label: "High",               value: data.stats["high"] ?? 2,     color: "#D97706" },
          { label: "Open",               value: data.stats["open"] ?? 5,     color: "#DC2626" },
        ].map(k => (
          <div key={k.label} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "monospace", color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
        {data.findings.map(f => (
          <div key={f.id} style={{ borderBottom: "1px solid var(--border)" }}>
            <div style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
              onClick={() => setExpanded(expanded === f.id ? null : f.id)}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "var(--card)"}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = expanded === f.id ? "var(--card)" : "var(--card)"}>
              <span style={{ background: sevBadge[f.severity]!.bg, border: `1px solid ${sevBadge[f.severity]!.border}`, color: sevBadge[f.severity]!.color, borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{f.severity}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: NAV }}>{f.name}</div>
                <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>{f.finding}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--muted-foreground)" }}>{f.id}</span>
                <span style={{ background: "rgba(59,130,246,0.08)", border: "1px solid #BAE6FD", color: "#0369A1", borderRadius: 4, padding: "1px 6px", fontSize: 9, fontWeight: 700 }}>{f.cis}</span>
                <span style={{ background: f.status === "resolved" ? "rgba(34,197,94,0.08)" : f.status === "in-progress" ? "rgba(59,130,246,0.12)" : "rgba(239,68,68,0.06)", color: f.status === "resolved" ? EME : f.status === "in-progress" ? NAV : "#DC2626", borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{f.status}</span>
                <span style={{ fontSize: 14, color: "var(--muted-foreground)" }}>{expanded === f.id ? "▲" : "▼"}</span>
              </div>
            </div>
            {expanded === f.id && (
              <div style={{ padding: "12px 20px 16px 56px", background: "var(--card)", borderTop: "1px solid var(--border)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Recommendation</div>
                <div style={{ fontSize: 12, color: "var(--foreground)", lineHeight: 1.6, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px" }}>{f.recommendation}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Password Policy ───────────────────────────────────────────────────────────

function PasswordTab() {
  const { data } = useAdData<{ policies: Array<{ domain: string; minLength: number; complexity: boolean; maxAge: number; lockoutThreshold: number; lockoutDuration: number; reversibleEncryption: boolean; score: number; grade: string; cisPass: number; cisFail: number }>; cisChecks: Array<{ id: string; name: string; requirement: string; status: string }> }>("/ad-auditor/password-policy", { policies: [], cisChecks: [] });

  return (
    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {data.policies.map(p => (
          <div key={p.domain} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: NAV, fontFamily: "monospace" }}>{p.domain}</div>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: p.grade === "F" ? "rgba(239,68,68,0.06)" : p.grade === "C" ? "rgba(245,158,11,0.06)" : "rgba(34,197,94,0.08)", border: `2.5px solid ${p.grade === "F" ? "#DC2626" : p.grade === "C" ? "#D97706" : EME}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, color: p.grade === "F" ? "#DC2626" : p.grade === "C" ? "#D97706" : EME }}>{p.grade}</div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ height: 8, background: "var(--input)", borderRadius: 4 }}>
                <div style={{ height: "100%", width: `${p.score}%`, background: p.score < 50 ? "#DC2626" : p.score < 70 ? "#D97706" : EME, borderRadius: 4 }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>CIS Score</span>
                <span style={{ fontSize: 11, fontWeight: 800, fontFamily: "monospace", color: p.score < 50 ? "#DC2626" : p.score < 70 ? "#D97706" : EME }}>{p.score}/100</span>
              </div>
            </div>
            {[
              { label: "Min Length",           value: `${p.minLength} chars`,  ok: p.minLength >= 14 },
              { label: "Complexity",           value: p.complexity ? "Yes" : "No", ok: p.complexity },
              { label: "Max Age",              value: `${p.maxAge} days`,     ok: p.maxAge <= 365 },
              { label: "Lockout Threshold",    value: `${p.lockoutThreshold} attempts`, ok: p.lockoutThreshold <= 5 },
              { label: "Lockout Duration",     value: `${p.lockoutDuration} min`,       ok: p.lockoutDuration >= 15 },
              { label: "Reversible Encryption",value: p.reversibleEncryption ? "Yes" : "No", ok: !p.reversibleEncryption },
            ].map(row => (
              <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: 11, color: "#6B7280" }}>{row.label}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--foreground)" }}>{row.value}</span>
                  <span style={{ fontSize: 12, color: row.ok ? EME : "#DC2626" }}>{row.ok ? "✓" : "✗"}</span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {data.cisChecks.length > 0 && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: NAV, marginBottom: 12 }}>CIS Benchmark Checks</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {data.cisChecks.map(c => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: c.status === "pass" ? "rgba(34,197,94,0.04)" : "rgba(239,68,68,0.04)", border: `1px solid ${c.status === "pass" ? "#A7F3D0" : "#FECACA"}`, borderRadius: 8 }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>{c.status === "pass" ? "✓" : "✗"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                  <div style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{c.id} · {c.requirement}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Attack Paths ──────────────────────────────────────────────────────────────

const STATIC_NODES: Node[] = [
  { id: "workstation", type: "default", position: { x: 50,  y: 220 }, data: { label: "CORP-WS-042\n(j.morrison)" },   style: { background: "#FEF2F2", border: "2px solid #EF4444", borderRadius: 8, fontSize: 11, padding: "6px 10px" } },
  { id: "laps",        type: "default", position: { x: 260, y: 100 }, data: { label: "LAPS Admin\n(cached creds)" },   style: { background: "#FFFBEB", border: "2px solid #F59E0B", borderRadius: 8, fontSize: 11, padding: "6px 10px" } },
  { id: "adminsvc",    type: "default", position: { x: 260, y: 340 }, data: { label: "admin.svc\n(Domain Admin)" },    style: { background: "#FEF2F2", border: "2px solid #DC2626", borderRadius: 8, fontSize: 11, padding: "6px 10px" } },
  { id: "dc01",        type: "default", position: { x: 480, y: 220 }, data: { label: "CORP-DC01\n(Domain Controller)" }, style: { background: "#EFF6FF", border: "2px solid #3B82F6", borderRadius: 8, fontSize: 11, padding: "6px 10px" } },
  { id: "da",          type: "default", position: { x: 680, y: 220 }, data: { label: "Domain Admins\n(GOAL)" },         style: { background: "#FEF2F2", border: "3px solid #DC2626", borderRadius: 8, fontSize: 11, padding: "8px 12px", fontWeight: 700 } },
];
const STATIC_EDGES: Edge[] = [
  { id: "e1", source: "workstation", target: "laps",     label: "Pass-the-Hash",  style: { stroke: "#F59E0B" }, animated: true },
  { id: "e2", source: "workstation", target: "adminsvc", label: "Cred dump",      style: { stroke: "#DC2626" }, animated: true },
  { id: "e3", source: "laps",        target: "dc01",     label: "Admin access",   style: { stroke: "#F59E0B" } },
  { id: "e4", source: "adminsvc",    target: "dc01",     label: "DA access",      style: { stroke: "#DC2626" }, animated: true },
  { id: "e5", source: "dc01",        target: "da",       label: "DCSync",         style: { stroke: "#DC2626" }, animated: true },
];

function AttackPathTab() {
  return (
    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { label: "Attack Paths",     value: 5,     color: "#DC2626" },
          { label: "Critical Paths",   value: 3,     color: "#DC2626" },
          { label: "Pivot Points",     value: 4,     color: "#D97706" },
          { label: "Est. Compromise",  value: "4h",  color: "#7C3AED" },
        ].map(k => (
          <div key={k.label} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "monospace", color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>
      <div style={{ height: 380, border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "#FAFAFA" }}>
        <ReactFlow nodes={STATIC_NODES} edges={STATIC_EDGES} fitView>
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>
    </div>
  );
}

// ── Behaviour Analytics (UEBA) ─────────────────────────────────────────────────

type BehaviourUser = {
  id: number; username: string; displayName: string; department: string;
  riskScore: number; riskLevel: string; baselineLogins: number; recentLogins: number;
  anomalyCount: number; lastAnomaly: string; anomalyTypes: string[]; sparkline: number[];
  peerDeviation: number;
};
type BehaviourEvent = {
  id: number; username: string; eventType: string; description: string; severity: string;
  occurredAt: string; srcIp: string; location: string; detail: Record<string, unknown>;
};
type HeatmapEntry = { hour: number; baseline: number; actual: number };

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return <span style={{ fontSize: 10, color: "#9CA3AF" }}>—</span>;
  const max = Math.max(...data, 1);
  const w = 60; const h = 22;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`).join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={(data.length - 1) / (data.length - 1) * w} cy={h - (data[data.length - 1]! / max) * h} r={2.5} fill={color} />
    </svg>
  );
}

function LoginHeatmap({ heatmap }: { heatmap: HeatmapEntry[] }) {
  const maxVal = Math.max(...heatmap.flatMap(h => [h.baseline, h.actual]), 1);
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: NAV, marginBottom: 10 }}>24-Hour Login Heatmap — Actual vs Baseline</div>
      <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 80 }}>
        {heatmap.map(h => (
          <div key={h.hour} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
            <div style={{ width: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", height: 64, gap: 1 }}>
              <div title={`Actual: ${h.actual}`} style={{ width: "100%", height: `${(h.actual / maxVal) * 60}px`, background: h.actual > h.baseline * 2.5 ? "#DC2626" : h.actual > h.baseline * 1.5 ? "#D97706" : NAV, borderRadius: "2px 2px 0 0", minHeight: h.actual > 0 ? 2 : 0, opacity: 0.85 }} />
              <div title={`Baseline: ${h.baseline}`} style={{ width: "100%", height: `${(h.baseline / maxVal) * 60}px`, background: "rgba(30,58,95,0.18)", borderRadius: "2px 2px 0 0", minHeight: h.baseline > 0 ? 2 : 0 }} />
            </div>
            <div style={{ fontSize: 8, color: "#9CA3AF", marginTop: 2 }}>{h.hour}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 10, height: 10, background: NAV, borderRadius: 2, opacity: 0.85 }} /><span style={{ fontSize: 10, color: "#6B7280" }}>Actual logins</span></div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 10, height: 10, background: "rgba(30,58,95,0.25)", borderRadius: 2 }} /><span style={{ fontSize: 10, color: "#6B7280" }}>Baseline</span></div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 10, height: 10, background: "#DC2626", borderRadius: 2 }} /><span style={{ fontSize: 10, color: "#6B7280" }}>Anomalous spike</span></div>
      </div>
    </div>
  );
}

// ── Risk Score Sparkline Trend ────────────────────────────────────────────────
function RiskScoreTrend({ sparkline, riskScore }: { sparkline: number[]; riskScore: number }) {
  const pts = sparkline.length >= 2 ? sparkline : [0, riskScore];
  const max = Math.max(...pts, 1);
  const W = 120; const H = 36; const pad = 2;
  const xs = pts.map((_, i) => pad + (i / (pts.length - 1)) * (W - pad * 2));
  const ys = pts.map(v => H - pad - ((v / max) * (H - pad * 2)));
  const d = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i]!.toFixed(1)}`).join(" ");
  const fillD = `${d} L${xs[xs.length - 1]!.toFixed(1)},${H} L${xs[0]!.toFixed(1)},${H} Z`;
  const last = pts[pts.length - 1]!;
  const prev = pts[pts.length - 2]!;
  const trend = last > prev ? "▲" : last < prev ? "▼" : "—";
  const trendCol = last > prev ? "#FCA5A5" : last < prev ? "#6EE7B7" : "#9CA3AF";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <svg width={W} height={H} style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id="rsTrendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(252,165,165,0.35)" />
            <stop offset="100%" stopColor="rgba(252,165,165,0)" />
          </linearGradient>
        </defs>
        <path d={fillD} fill="url(#rsTrendGrad)" />
        <path d={d} fill="none" stroke="#FCA5A5" strokeWidth={1.5} strokeLinejoin="round" />
        <circle cx={xs[xs.length - 1]!} cy={ys[ys.length - 1]!} r={3} fill="#FCA5A5" />
      </svg>
      <div>
        <div style={{ fontSize: 16, fontWeight: 900, fontFamily: "monospace", color: "#FCA5A5" }}>{last}</div>
        <div style={{ fontSize: 9, color: trendCol, fontWeight: 700 }}>{trend} {Math.abs(last - prev)} pts</div>
      </div>
    </div>
  );
}

function UserDetailPanel({ user, onClose }: { user: BehaviourUser; onClose: () => void }) {
  const { data, loading } = useAdData<{ user: BehaviourUser | null; events: BehaviourEvent[]; heatmap: HeatmapEntry[] }>(
    `/ad-auditor/behaviour?username=${encodeURIComponent(user.username)}`,
    { user: null, events: [], heatmap: [] }
  );
  const badge = riskBadge[user.riskLevel] ?? riskBadge["Low"]!;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9000, display: "flex", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ width: 560, background: "var(--card)", boxShadow: "-4px 0 32px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ background: NAV, padding: "18px 24px", color: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "monospace" }}>{user.username}</div>
              <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>{user.displayName} · {user.department}</div>
            </div>
            <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#fff", fontSize: 20, cursor: "pointer", padding: "0 4px", lineHeight: 1 }}>×</button>
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 14 }}>
            <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: 8, padding: "8px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 900, fontFamily: "monospace", color: user.riskLevel === "Critical" ? "#FCA5A5" : user.riskLevel === "High" ? "#FCD34D" : "#6EE7B7" }}>{user.riskScore}</div>
              <div style={{ fontSize: 9, opacity: 0.75, textTransform: "uppercase", letterSpacing: "0.5px" }}>Risk Score</div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: 8, padding: "8px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 900, fontFamily: "monospace", color: "#FCD34D" }}>{user.anomalyCount}</div>
              <div style={{ fontSize: 9, opacity: 0.75, textTransform: "uppercase", letterSpacing: "0.5px" }}>Anomalies</div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: 8, padding: "8px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 900, fontFamily: "monospace", color: user.peerDeviation > 100 ? "#FCA5A5" : "#6EE7B7" }}>+{user.peerDeviation}%</div>
              <div style={{ fontSize: 9, opacity: 0.75, textTransform: "uppercase", letterSpacing: "0.5px" }}>vs Peer Avg</div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: 8, padding: "8px 14px", flex: 1 }}>
              <div style={{ fontSize: 9, opacity: 0.75, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Risk Score Trend (10d)</div>
              <RiskScoreTrend sparkline={user.sparkline as number[]} riskScore={user.riskScore} />
            </div>
          </div>
        </div>

        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
          {loading && <div style={{ textAlign: "center", padding: 24, color: "var(--muted-foreground)", fontSize: 12 }}>Loading behaviour data...</div>}

          {!loading && data.heatmap.length > 0 && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
              <LoginHeatmap heatmap={data.heatmap} />
            </div>
          )}

          {!loading && data.events.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: NAV, marginBottom: 10 }}>Anomaly Events</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {data.events.map(ev => {
                  const sb = sevBadge[ev.severity] ?? sevBadge["Low"]!;
                  return (
                    <div key={ev.id} style={{ background: "var(--card)", border: `1px solid ${sb.border}`, borderRadius: 8, padding: "10px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ background: sb.bg, border: `1px solid ${sb.border}`, color: sb.color, borderRadius: 4, padding: "1px 7px", fontSize: 9, fontWeight: 700 }}>{ev.severity}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--foreground)" }}>{ev.eventType}</span>
                        <span style={{ marginLeft: "auto", fontSize: 10, fontFamily: "monospace", color: "var(--muted-foreground)" }}>{ev.occurredAt}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#4B5563", lineHeight: 1.5 }}>{ev.description}</div>
                      {ev.srcIp && (
                        <div style={{ marginTop: 6, display: "flex", gap: 12 }}>
                          <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>IP: <b style={{ fontFamily: "monospace" }}>{ev.srcIp}</b></span>
                          {ev.location && <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>Location: <b>{ev.location}</b></span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: NAV, marginBottom: 8 }}>ML Anomaly Model — Heuristic Signals</div>
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { label: "Off-hours login frequency", score: user.riskScore > 70 ? 88 : 34 },
                { label: "Geo-velocity anomaly",      score: user.anomalyTypes?.includes?.("Impossible Travel") ? 95 : 12 },
                { label: "Lateral movement signals",  score: user.anomalyTypes?.includes?.("Lateral Movement") ? 82 : 8 },
                { label: "Privilege escalation",      score: user.anomalyTypes?.includes?.("Bulk Group Change") ? 91 : 15 },
                { label: "Peer group deviation",      score: Math.min(user.peerDeviation, 99) },
              ].map(sig => (
                <div key={sig.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: 11, color: "#4B5563" }}>{sig.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "monospace", color: sig.score > 70 ? "#DC2626" : sig.score > 40 ? "#D97706" : EME }}>{sig.score}</span>
                  </div>
                  <div style={{ height: 5, background: "var(--input)", borderRadius: 3 }}>
                    <div style={{ height: "100%", width: `${sig.score}%`, background: sig.score > 70 ? "#DC2626" : sig.score > 40 ? "#D97706" : EME, borderRadius: 3, transition: "width 0.5s ease" }} />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 10, color: "var(--muted-foreground)", fontStyle: "italic" }}>
              Scores computed via heuristic rule engine — off-hours frequency, geo-velocity, lateral movement graph, privilege delta, and peer-group z-score. Model training not required.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BehaviourTab() {
  const { data, loading } = useAdData<{ users: BehaviourUser[]; stats: { total: number; critical: number; high: number; anomalies: number } }>(
    "/ad-auditor/behaviour",
    { users: [], stats: { total: 0, critical: 0, high: 0, anomalies: 0 } }
  );
  const [selectedUser, setSelectedUser] = useState<BehaviourUser | null>(null);
  const [filter, setFilter] = useState("all");

  const filtered = data.users.filter(u => filter === "all" || u.riskLevel === filter);

  return (
    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { label: "Monitored Users",  value: data.stats.total,    color: NAV },
          { label: "Critical Risk",    value: data.stats.critical, color: "#DC2626" },
          { label: "High Risk",        value: data.stats.high,     color: "#D97706" },
          { label: "Anomaly Events",   value: data.stats.anomalies, color: "#7C3AED" },
        ].map(k => (
          <div key={k.label} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: k.color, borderRadius: "12px 12px 0 0" }} />
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "monospace", color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)" }}>Risk level:</span>
        {["all", "Critical", "High", "Medium", "Low"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: "5px 12px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              border: filter === f ? "1px solid rgba(99,179,237,0.25)" : "1px solid var(--border)",
              background: filter === f ? "rgba(59,130,246,0.12)" : "white",
              color: filter === f ? NAV : "#6B7280" }}>{f === "all" ? "All" : f}</button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted-foreground)" }}>{filtered.length} users · Click a row for behaviour timeline</span>
      </div>

      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
        {loading && <div style={{ padding: 40, textAlign: "center", fontSize: 12, color: "var(--muted-foreground)" }}>Loading behaviour data...</div>}
        {!loading && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "var(--card)", borderBottom: "1px solid var(--border)" }}>
                {["User", "Department", "Risk Score", "Risk Level", "Anomalies", "Last Anomaly", "Login Trend (10d)", "vs Peers", "Anomaly Types"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 14px", color: "var(--muted-foreground)", fontWeight: 700, fontSize: 10, letterSpacing: "0.5px", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => {
                const badge = riskBadge[u.riskLevel] ?? riskBadge["Low"]!;
                const sparkColor = u.riskLevel === "Critical" ? "#DC2626" : u.riskLevel === "High" ? "#D97706" : EME;
                return (
                  <tr key={u.id}
                    style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                    onClick={() => setSelectedUser(u)}
                    onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "var(--secondary)"}
                    onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ""}>
                    <td style={{ padding: "11px 14px" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: NAV, fontFamily: "monospace" }}>{u.username}</div>
                      <div style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{u.displayName}</div>
                    </td>
                    <td style={{ padding: "11px 14px", fontSize: 11, color: "#6B7280" }}>{u.department}</td>
                    <td style={{ padding: "11px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 36, height: 36, borderRadius: "50%", background: badge.bg, border: `2px solid ${badge.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: badge.color, fontFamily: "monospace" }}>{u.riskScore}</div>
                      </div>
                    </td>
                    <td style={{ padding: "11px 14px" }}>
                      <span style={{ background: badge.bg, border: `1px solid ${badge.border}`, color: badge.color, borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{u.riskLevel}</span>
                    </td>
                    <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 800, fontFamily: "monospace", color: u.anomalyCount > 3 ? "#DC2626" : u.anomalyCount > 1 ? "#D97706" : "#6B7280" }}>{u.anomalyCount}</td>
                    <td style={{ padding: "11px 14px", fontSize: 10, color: "#6B7280", fontFamily: "monospace", whiteSpace: "nowrap" }}>{u.lastAnomaly ? u.lastAnomaly.slice(0, 16) : "—"}</td>
                    <td style={{ padding: "11px 14px" }}>
                      <Sparkline data={u.sparkline as number[]} color={sparkColor} />
                    </td>
                    <td style={{ padding: "11px 14px" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "monospace", color: u.peerDeviation > 100 ? "#DC2626" : u.peerDeviation > 50 ? "#D97706" : EME }}>+{u.peerDeviation}%</span>
                    </td>
                    <td style={{ padding: "11px 14px" }}>
                      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                        {(u.anomalyTypes as string[]).slice(0, 2).map(t => (
                          <span key={t} style={{ background: "#F5F3FF", border: "1px solid #DDD6FE", color: "#6D28D9", borderRadius: 3, padding: "1px 5px", fontSize: 9, fontWeight: 700 }}>{t}</span>
                        ))}
                        {(u.anomalyTypes as string[]).length > 2 && <span style={{ fontSize: 9, color: "var(--muted-foreground)" }}>+{(u.anomalyTypes as string[]).length - 2}</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {selectedUser && <UserDetailPanel user={selectedUser} onClose={() => setSelectedUser(null)} />}
    </div>
  );
}

// ── Change Feed + Diff + Alert Rules ──────────────────────────────────────────

type ChangeFeedEntry = {
  id: number; changeId: string; objectType: string; objectName: string; objectDn: string;
  changeType: string; fieldName: string; oldValue: string; newValue: string;
  changedBy: string; severity: string; riskNote: string; occurredAt: string;
};
type AlertRule = {
  id: number; ruleId: string; name: string; description: string; condition: string;
  severity: string; enabled: boolean; channel: string;
};

function DiffPanel({ entry, onClose }: { entry: ChangeFeedEntry; onClose: () => void }) {
  const sb = sevBadge[entry.severity] ?? sevBadge["Low"]!;
  const oldLines = entry.oldValue ? entry.oldValue.split(",").map(s => s.trim()) : ["(empty)"];
  const newLines = entry.newValue ? entry.newValue.split(",").map(s => s.trim()) : ["(empty)"];
  const removed = oldLines.filter(l => !newLines.includes(l));
  const added   = newLines.filter(l => !oldLines.includes(l));
  const kept    = oldLines.filter(l => newLines.includes(l));

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9000, display: "flex", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ width: 580, background: "var(--card)", boxShadow: "-4px 0 32px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ background: NAV, padding: "18px 24px", color: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, fontFamily: "monospace" }}>{entry.changeId}</div>
              <div style={{ fontSize: 11, opacity: 0.8, marginTop: 3 }}>{entry.objectType} · {entry.objectName}</div>
            </div>
            <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#fff", fontSize: 20, cursor: "pointer", padding: "0 4px", lineHeight: 1 }}>×</button>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <span style={{ background: sb.bg, border: `1px solid ${sb.border}`, color: sb.color, borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{entry.severity}</span>
            <span style={{ background: "rgba(255,255,255,0.12)", borderRadius: 4, padding: "2px 8px", fontSize: 10, color: "#fff" }}>{entry.changeType}</span>
            <span style={{ marginLeft: "auto", fontSize: 10, opacity: 0.75, fontFamily: "monospace" }}>{entry.occurredAt}</span>
          </div>
        </div>

        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>Field Changed</div>
            <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: NAV, background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 6, padding: "8px 12px" }}>{entry.fieldName}</div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>Attribute Diff</div>
            <div style={{ background: "#111827", borderRadius: 8, padding: "12px 16px", fontFamily: "monospace", fontSize: 11, lineHeight: 1.8, overflow: "auto", maxHeight: 240 }}>
              {kept.map((l, i) => <div key={`k${i}`} style={{ color: "#9CA3AF" }}>  {l}</div>)}
              {removed.map((l, i) => <div key={`r${i}`} style={{ color: "#FCA5A5" }}>- {l}</div>)}
              {added.map((l, i)   => <div key={`a${i}`} style={{ color: "#6EE7B7" }}>+ {l}</div>)}
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
              <span style={{ fontSize: 10, color: "#6EE7B7" }}>● {added.length} added</span>
              <span style={{ fontSize: 10, color: "#FCA5A5" }}>● {removed.length} removed</span>
              <span style={{ fontSize: 10, color: "#9CA3AF" }}>● {kept.length} unchanged</span>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>Risk Implication</div>
            <div style={{ background: sb.bg, border: `1px solid ${sb.border}`, borderRadius: 8, padding: "12px 14px", fontSize: 12, color: sb.color, lineHeight: 1.6 }}>{entry.riskNote}</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", marginBottom: 4 }}>Changed By</div>
              <div style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 700, color: NAV }}>{entry.changedBy}</div>
            </div>
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", marginBottom: 4 }}>Object DN</div>
              <div style={{ fontSize: 10, fontFamily: "monospace", color: "#6B7280", wordBreak: "break-all" }}>{entry.objectDn}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AlertRulesPanel({ rules, token }: { rules: AlertRule[]; token: string }) {
  const [localRules, setLocalRules] = useState<AlertRule[]>(rules);
  useEffect(() => { setLocalRules(rules); }, [rules]);

  const toggle = async (rule: AlertRule) => {
    const updated = { ...rule, enabled: !rule.enabled };
    setLocalRules(prev => prev.map(r => r.ruleId === rule.ruleId ? updated : r));
    try {
      await fetch(`${BASE}/api/ad-auditor/alert-rules/${rule.ruleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ enabled: updated.enabled }),
      });
    } catch { /* revert on error is acceptable */ }
  };

  const setChannel = async (rule: AlertRule, channel: string) => {
    setLocalRules(prev => prev.map(r => r.ruleId === rule.ruleId ? { ...r, channel } : r));
    try {
      await fetch(`${BASE}/api/ad-auditor/alert-rules/${rule.ruleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ channel }),
      });
    } catch { /* silently fail */ }
  };

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 800, color: NAV, marginBottom: 12 }}>Alert Rules</div>
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--card)" }}>
              {["Rule", "Condition", "Severity", "Channel", "Enabled"].map(h => (
                <th key={h} style={{ textAlign: "left", padding: "10px 14px", color: "var(--muted-foreground)", fontWeight: 700, fontSize: 10, letterSpacing: "0.5px", textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {localRules.map(rule => {
              const sb = sevBadge[rule.severity] ?? sevBadge["Low"]!;
              return (
                <tr key={rule.ruleId} style={{ borderBottom: "1px solid var(--border)", opacity: rule.enabled ? 1 : 0.5 }}
                  onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "var(--secondary)"}
                  onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ""}>
                  <td style={{ padding: "11px 14px" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: NAV }}>{rule.name}</div>
                    <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 2 }}>{rule.description}</div>
                  </td>
                  <td style={{ padding: "11px 14px", fontSize: 10, fontFamily: "monospace", color: "#6B7280", maxWidth: 200 }}>
                    <div style={{ background: "#F9FAFB", border: "1px solid var(--border)", borderRadius: 4, padding: "3px 6px", wordBreak: "break-all" }}>{rule.condition}</div>
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    <span style={{ background: sb.bg, border: `1px solid ${sb.border}`, color: sb.color, borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{rule.severity}</span>
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    <select value={rule.channel} onChange={e => setChannel(rule, e.target.value)}
                      style={{ fontSize: 11, fontWeight: 700, color: NAV, background: "var(--input)", border: "1px solid var(--border)", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontFamily: "inherit" }}>
                      <option value="email">Email</option>
                      <option value="slack">Slack</option>
                      <option value="webhook">Webhook</option>
                    </select>
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    <div onClick={() => toggle(rule)} style={{ width: 36, height: 20, background: rule.enabled ? NAV : "rgba(156,163,175,0.3)", borderRadius: 10, position: "relative", cursor: "pointer", transition: "background 0.2s" }}>
                      <div style={{ width: 16, height: 16, background: "white", borderRadius: "50%", position: "absolute", top: 2, left: rule.enabled ? 18 : 2, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChangeFeedTab() {
  const token = localStorage.getItem("grc_token") ?? "";
  const [objType,   setObjType]   = useState("all");
  const [severity,  setSeverity]  = useState("all");
  const [category,  setCategory]  = useState("all");
  const [timeRange, setTimeRange] = useState("all");
  const [view, setView]           = useState<"feed" | "alertrules">("feed");
  const [diffEntry, setDiffEntry] = useState<ChangeFeedEntry | null>(null);

  const path = `/ad-auditor/change-feed?objectType=${encodeURIComponent(objType)}&severity=${encodeURIComponent(severity)}&category=${encodeURIComponent(category)}&timeRange=${encodeURIComponent(timeRange)}`;
  const { data, loading } = useAdData<{ entries: (ChangeFeedEntry & { category: string })[]; stats: { total: number; critical: number; high: number; today: number } }>(
    path,
    { entries: [], stats: { total: 0, critical: 0, high: 0, today: 0 } }
  );
  const { data: rulesData } = useAdData<{ rules: AlertRule[] }>("/ad-auditor/alert-rules", { rules: [] });

  return (
    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { label: "Total Changes",   value: data.stats.total,    color: NAV },
          { label: "Critical",        value: data.stats.critical, color: "#DC2626" },
          { label: "High",            value: data.stats.high,     color: "#D97706" },
          { label: "Last 48h",        value: data.stats.today,    color: "#0891B2" },
        ].map(k => (
          <div key={k.label} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: k.color, borderRadius: "12px 12px 0 0" }} />
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "monospace", color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ display: "flex", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          {(["feed", "alertrules"] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{ padding: "6px 16px", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: "inherit",
                background: view === v ? NAV : "transparent", color: view === v ? "#fff" : "#6B7280" }}>
              {v === "feed" ? "Change Feed" : "Alert Rules"}
            </button>
          ))}
        </div>

        {view === "feed" && (
          <>
            <select value={timeRange} onChange={e => setTimeRange(e.target.value)}
              style={{ fontSize: 11, fontWeight: 700, color: NAV, background: "var(--input)", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 8px", cursor: "pointer", fontFamily: "inherit" }}>
              {[["all","All Time"],["1h","Last 1h"],["24h","Last 24h"],["7d","Last 7d"],["30d","Last 30d"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select value={objType} onChange={e => setObjType(e.target.value)}
              style={{ fontSize: 11, fontWeight: 700, color: NAV, background: "var(--input)", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 8px", cursor: "pointer", fontFamily: "inherit" }}>
              {["all", "User", "Group", "GPO", "OU"].map(v => <option key={v} value={v}>{v === "all" ? "All Objects" : v}</option>)}
            </select>
            <select value={category} onChange={e => setCategory(e.target.value)}
              style={{ fontSize: 11, fontWeight: 700, color: NAV, background: "var(--input)", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 8px", cursor: "pointer", fontFamily: "inherit" }}>
              {["all","Group Membership","Policy Change","Access Control","Account Security","Account Creation","Identity","Directory Structure"].map(v => (
                <option key={v} value={v}>{v === "all" ? "All Categories" : v}</option>
              ))}
            </select>
            <select value={severity} onChange={e => setSeverity(e.target.value)}
              style={{ fontSize: 11, fontWeight: 700, color: NAV, background: "var(--input)", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 8px", cursor: "pointer", fontFamily: "inherit" }}>
              {["all", "Critical", "High", "Medium", "Low"].map(v => <option key={v} value={v}>{v === "all" ? "All Severities" : v}</option>)}
            </select>
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted-foreground)" }}>{data.entries.length} events · Click row for diff</span>
          </>
        )}
      </div>

      {view === "alertrules" && <AlertRulesPanel rules={rulesData.rules} token={token} />}

      {view === "feed" && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
          {loading && <div style={{ padding: 40, textAlign: "center", fontSize: 12, color: "var(--muted-foreground)" }}>Loading change feed...</div>}
          {!loading && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "var(--card)", borderBottom: "1px solid var(--border)" }}>
                  {["Time", "Object", "Type", "Category", "Field", "Old Value", "New Value", "Changed By", "Sev"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "10px 14px", color: "var(--muted-foreground)", fontWeight: 700, fontSize: 10, letterSpacing: "0.5px", textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.entries.map(e => {
                  const sb = sevBadge[e.severity] ?? sevBadge["Low"]!;
                  return (
                    <tr key={e.id}
                      style={{ borderBottom: "1px solid var(--border)", cursor: "pointer", borderLeft: e.severity === "Critical" ? "3px solid #DC2626" : e.severity === "High" ? "3px solid #D97706" : "3px solid transparent" }}
                      onClick={() => setDiffEntry(e)}
                      onMouseEnter={ev => (ev.currentTarget as HTMLTableRowElement).style.background = "var(--secondary)"}
                      onMouseLeave={ev => (ev.currentTarget as HTMLTableRowElement).style.background = ""}>
                      <td style={{ padding: "10px 14px", fontSize: 10, fontFamily: "monospace", color: "#6B7280", whiteSpace: "nowrap" }}>{e.occurredAt.slice(0, 16)}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: NAV }}>{e.objectName}</div>
                        <div style={{ fontSize: 9, color: "var(--muted-foreground)" }}>{e.objectType}</div>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ background: e.changeType === "Created" ? "rgba(34,197,94,0.08)" : e.changeType === "Deleted" ? "rgba(239,68,68,0.06)" : "#EFF6FF", border: `1px solid ${e.changeType === "Created" ? "#A7F3D0" : e.changeType === "Deleted" ? "#FECACA" : "#BFDBFE"}`, color: e.changeType === "Created" ? EME : e.changeType === "Deleted" ? "#DC2626" : "#0369A1", borderRadius: 4, padding: "1px 7px", fontSize: 10, fontWeight: 700 }}>{e.changeType}</span>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        {e.category && (
                          <span style={{ background: "rgba(30,58,95,0.08)", border: "1px solid rgba(30,58,95,0.2)", color: NAV, borderRadius: 4, padding: "1px 7px", fontSize: 9, fontWeight: 700, whiteSpace: "nowrap" }}>{e.category}</span>
                        )}
                      </td>
                      <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 11, color: "#4B5563" }}>{e.fieldName}</td>
                      <td style={{ padding: "10px 14px", fontSize: 10, fontFamily: "monospace", color: "#DC2626", maxWidth: 120 }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.oldValue || "—"}</div>
                      </td>
                      <td style={{ padding: "10px 14px", fontSize: 10, fontFamily: "monospace", color: EME, maxWidth: 120 }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.newValue || "—"}</div>
                      </td>
                      <td style={{ padding: "10px 14px", fontSize: 11, fontFamily: "monospace", color: "#6B7280" }}>{e.changedBy}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ background: sb.bg, border: `1px solid ${sb.border}`, color: sb.color, borderRadius: 4, padding: "2px 7px", fontSize: 10, fontWeight: 700 }}>{e.severity}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {diffEntry && <DiffPanel entry={diffEntry} onClose={() => setDiffEntry(null)} />}
    </div>
  );
}

// ── Configuration ─────────────────────────────────────────────────────────────

function ConfigTab() {
  const { data: configData } = useAdData<{ serverUrl: string; entraTenantId: string; domain: string; syncEnabled: boolean }>(
    "/ad-auditor/config",
    { serverUrl: "", entraTenantId: "", domain: "", syncEnabled: false }
  );
  const [form, setForm] = useState({ serverUrl: "", entraTenantId: "", domain: "", syncEnabled: false });
  const [saving, setSaving]   = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const token = localStorage.getItem("grc_token");

  useEffect(() => {
    setForm({
      serverUrl:     configData.serverUrl     ?? "",
      entraTenantId: configData.entraTenantId ?? "",
      domain:        configData.domain        ?? "",
      syncEnabled:   configData.syncEnabled   ?? false,
    });
  }, [configData]);

  const save = async () => {
    setSaving(true);
    try {
      await fetch(`${BASE}/api/ad-auditor/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
    } finally { setSaving(false); }
  };

  const testConn = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch(`${BASE}/api/ad-auditor/test-connection`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const json = await r.json() as { success: boolean; message: string };
      setTestResult(json);
    } finally { setTesting(false); }
  };

  return (
    <div style={{ padding: "20px 24px" }}>
      <div style={{ maxWidth: 560 }}>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: NAV, marginBottom: 4 }}>AD Connector (Legacy — LDAP/Kerberos)</div>
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 16 }}>
            Configure LDAP connection to your on-premise Active Directory domain controller.
            To deploy the AIGO-X agent to a server, go to <strong>Settings → Agent</strong> to download and register a real agent/connector.
          </div>
        </div>

        {[
          { key: "serverUrl",     label: "Server URL",    placeholder: "ldap://dc01.corp.acme.local:389" },
          { key: "entraTenantId", label: "Entra Tenant ID", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" },
          { key: "domain",        label: "Domain",        placeholder: "CORP.ACME.LOCAL" },
        ].map(f => (
          <div key={f.key} style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>{f.label}</label>
            <input value={(form as unknown as Record<string, string>)[f.key] ?? ""}
              onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
              placeholder={f.placeholder}
              style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 14px", fontSize: 12, color: "var(--foreground)", background: "var(--card)", outline: "none", fontFamily: "monospace", boxSizing: "border-box" as const }} />
          </div>
        ))}

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24, padding: "12px 16px", background: "var(--card)", borderRadius: 8, border: "1px solid var(--border)" }}>
          <div onClick={() => setForm(prev => ({ ...prev, syncEnabled: !prev.syncEnabled }))} style={{ width: 36, height: 20, background: form.syncEnabled ? NAV : "rgba(255,255,255,0.1)", borderRadius: 10, position: "relative", cursor: "pointer", transition: "background 0.2s" }}>
            <div style={{ width: 16, height: 16, background: "var(--card)", borderRadius: "50%", position: "absolute", top: 2, left: form.syncEnabled ? 18 : 2, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--foreground)" }}>Enable Automatic Sync</div>
            <div style={{ fontSize: 10, color: "var(--muted-foreground)" }}>Sync every 6 hours</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={testConn} disabled={testing}
            style={{ border: "1px solid var(--border)", background: "var(--card)", borderRadius: 8, padding: "9px 18px", fontSize: 12, fontWeight: 700, color: "var(--foreground)", cursor: testing ? "not-allowed" : "pointer", opacity: testing ? 0.6 : 1, fontFamily: "inherit" }}>
            {testing ? "Testing..." : "Test Connection"}
          </button>
          <button onClick={save} disabled={saving}
            style={{ background: `linear-gradient(135deg, ${NAV}, ${EME})`, border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 12, fontWeight: 700, color: "white", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1, fontFamily: "inherit" }}>
            {saving ? "Saving..." : "Save Configuration"}
          </button>
        </div>

        {testResult && (
          <div style={{ marginTop: 14, padding: "10px 14px", background: testResult.success ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.06)", border: `1px solid ${testResult.success ? "#A7F3D0" : "#FECACA"}`, borderRadius: 8, fontSize: 12, fontWeight: 600, color: testResult.success ? EME : "#DC2626" }}>
            {testResult.success ? "✓ " : "✗ "}{testResult.message}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ADauditor() {
  const [tab, setTab] = useState("overview");
  const { isModuleLicensed, licensedFrameworks, isViewingOwnTenant } = useLicense();
  const [selectedAdFw, setSelectedAdFw] = useState(() => isViewingOwnTenant ? "all" : "");
  const prevSelectedRef = useRef(selectedAdFw);
  useEffect(() => {
    if (!isViewingOwnTenant && selectedAdFw === "" && licensedFrameworks.length > 0) {
      setSelectedAdFw(licensedFrameworks[0].name);
      prevSelectedRef.current = licensedFrameworks[0].name;
    }
  }, [isViewingOwnTenant, licensedFrameworks, selectedAdFw]);

  if (!isModuleLicensed("secops")) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "calc(100vh - 52px)", background: "#F9F8F6", gap: 16, padding: 32 }}>
        <div style={{ fontSize: 40 }}>🔒</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: NAV }}>AD Auditor — Module Locked</div>
        <div style={{ fontSize: 13, color: "#6B7280", textAlign: "center", maxWidth: 420 }}>
          Active Directory &amp; Entra ID security analysis requires the <strong>CIEM</strong> (Cloud Identity &amp; Entitlement Management) module.<br /><br />
          Upgrade your plan or contact your administrator to enable this capability.
        </div>
        <div style={{ marginTop: 8, padding: "8px 20px", background: NAV, color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "default" }}>
          Contact Admin to Upgrade
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 52px)", background: "#F9F8F6" }}>
      <div style={{ background: "var(--card)", borderBottom: "1px solid var(--border)", padding: "12px 24px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: NAV, letterSpacing: "-0.5px", margin: 0 }}>AD Auditor</h1>
          {tab === "gpo" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "var(--muted-foreground)", fontWeight: 600 }}>Framework scope:</span>
              <select
                value={selectedAdFw}
                onChange={e => setSelectedAdFw(e.target.value)}
                style={{ fontSize: 11, fontWeight: 700, color: NAV, background: "var(--input)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontFamily: "inherit" }}>
                {isViewingOwnTenant && <option value="all">All Frameworks</option>}
                {licensedFrameworks.map(fw => <option key={fw.id} value={fw.name}>{fw.name}</option>)}
              </select>
            </div>
          )}
        </div>
        <p style={{ fontSize: 11, color: "var(--muted-foreground)", margin: 0, fontWeight: 500 }}>Active Directory & Entra ID security analysis · Privileged accounts · Attack paths · UEBA · Real-time change feed</p>
      </div>
      <SubNav tabs={TABS} active={tab} onSelect={setTab} />
      <div style={{ flex: 1, overflowY: "auto" }}>
        {tab === "overview"    && <OverviewTab />}
        {tab === "accounts"    && <AccountsTab />}
        {tab === "gpo"         && (
          (!isViewingOwnTenant && licensedFrameworks.length === 0)
            ? <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, color: "#6B7280" }}>
                <div style={{ fontSize: 32 }}>🔒</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>No Licensed Frameworks</div>
                <div style={{ fontSize: 12, textAlign: "center", maxWidth: 360 }}>GPO compliance analysis requires at least one licensed framework. Contact your administrator.</div>
              </div>
            : <GpoTab fwFilter={selectedAdFw || "all"} />
        )}
        {tab === "password"    && <PasswordTab />}
        {tab === "attackpath"  && <AttackPathTab />}
        {tab === "behaviour"   && <BehaviourTab />}
        {tab === "changefeed"  && <ChangeFeedTab />}
        {tab === "config"      && <ConfigTab />}
      </div>
    </div>
  );
}
