import { useState } from "react";
import { type Risk, type Severity } from "@/lib/data";
import { useOrg } from "@/context/OrgContext";
import { useRisks, useCreateRisk } from "@/hooks/useGrcApi";

const severityStyle: Record<string, { bg: string; color: string; border: string }> = {
  Critical: { bg: "rgba(239,68,68,0.06)", color: "#991B1B", border: "#FECACA" },
  High:     { bg: "rgba(245,158,11,0.06)", color: "#92400E", border: "#FDE68A" },
  Medium:   { bg: "#EEF2FF", color: "#3730A3", border: "#C7D2FE" },
  Low:      { bg: "rgba(34,197,94,0.08)", color: "#065F46", border: "#A7F3D0" },
};

const statusStyle: Record<string, { bg: string; color: string; border: string; label: string }> = {
  "open":        { bg: "rgba(239,68,68,0.06)", color: "#991B1B", border: "#FECACA", label: "Open" },
  "in-progress": { bg: "rgba(59,130,246,0.12)", color: "#1E3A5F", border: "#BFDBFE", label: "In Progress" },
  "accepted":    { bg: "rgba(245,158,11,0.06)", color: "#92400E", border: "#FDE68A", label: "Accepted" },
  "closed":      { bg: "rgba(34,197,94,0.08)", color: "#065F46", border: "#A7F3D0", label: "Closed" },
};

const severities: Severity[] = ["Critical", "High", "Medium", "Low"];

const HEAT_COLS = [1, 2, 3, 4, 5];
const HEAT_ROWS = [5, 4, 3, 2, 1];

const heatColor = (prob: number, impact: number) => {
  const score = prob * impact;
  if (score >= 20) return { bg: "rgba(220,38,38,0.18)", border: "#FECACA", text: "#991B1B" };
  if (score >= 12) return { bg: "rgba(245,158,11,0.14)", border: "#FDE68A", text: "#92400E" };
  if (score >= 6)  return { bg: "rgba(30,58,95,0.12)",  border: "#BFDBFE", text: "#1E3A5F" };
  return { bg: "rgba(34,197,94,0.08)", border: "#A7F3D0", text: "#065F46" };
};

const RISK_POSITIONS: Record<string, { prob: number; impact: number }> = {
  "RK-2041": { prob: 4, impact: 5 },
  "RK-2039": { prob: 3, impact: 5 },
  "RK-2037": { prob: 4, impact: 4 },
  "RK-2035": { prob: 3, impact: 3 },
  "RK-2033": { prob: 3, impact: 3 },
  "RK-2031": { prob: 2, impact: 4 },
  "RK-2029": { prob: 2, impact: 2 },
  "RK-2027": { prob: 4, impact: 2 },
};

const PROB_LABELS = ["", "Rare", "Unlikely", "Possible", "Likely", "Almost Certain"];
const IMP_LABELS  = ["", "Negligible", "Minor", "Moderate", "Major", "Critical"];

const emptyForm = {
  severity: "High" as Severity,
  name: "",
  category: "Cloud Security",
  owner: "",
  ownerFull: "",
  score: 10,
  trend: "flat" as "up" | "down" | "flat",
  description: "",
  status: "open" as Risk["status"],
};

const CATEGORIES = ["Cloud Security", "Identity & Access", "Vulnerability", "Third-Party Risk", "Privacy", "Network Security", "Infrastructure", "Asset Management", "Physical", "Supply Chain"];

export default function RiskRegister() {
  const [view, setView] = useState<"table" | "heatmap">("table");
  const [filter, setFilter] = useState<Severity | "All">("All");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [heatHover, setHeatHover] = useState<string | null>(null);

  const { data: apiRisks, isLoading, isError } = useRisks();
  const createRiskMut = useCreateRisk();

  const liveRisks: Risk[] = (apiRisks ?? []).map((r: any) => ({
    id:          r.riskId ?? String(r.id),
    severity:    r.severity ?? "Medium",
    name:        r.name,
    owner:       (r.owner ?? (r.ownerFull ?? "").slice(0, 2).toUpperCase()) || "?",
    ownerFull:   r.ownerFull ?? r.owner ?? "",
    score:       Number(r.score) ?? 0,
    trend:       r.trend ?? "flat",
    category:    r.category ?? "",
    description: r.description ?? "",
    status:      r.status ?? "open",
    created:     r.createdAt ?? r.created ?? "",
    updated:     r.updatedAt ?? r.updated ?? "",
  }));

  const filtered = liveRisks.filter((r) => {
    const matchSev = filter === "All" || r.severity === filter;
    const matchSearch = r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.id.toLowerCase().includes(search.toLowerCase()) ||
      r.category.toLowerCase().includes(search.toLowerCase());
    return matchSev && matchSearch;
  });

  const selectedRisk = liveRisks.find((r) => r.id === selected);

  const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 } as Record<Severity, number>;
  liveRisks.forEach((r) => counts[r.severity as Severity]++);

  async function createRisk() {
    if (!form.name.trim()) return;
    await createRiskMut.mutateAsync({
      name: form.name, category: form.category, severity: form.severity,
      description: form.description, score: form.score,
      owner: form.ownerFull.slice(0, 2).toUpperCase() || "?",
      ownerFull: form.ownerFull, trend: form.trend, status: form.status,
    } as any);
    setShowCreate(false);
    setForm(emptyForm);
  }

  if (isLoading) return (
    <div style={{ padding: 32, color: "#9CA3AF", fontSize: 14, display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ display: "inline-block", width: 16, height: 16, border: "2px solid #1E3A5F", borderTopColor: "#93C5FD", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      Loading risks…
    </div>
  );
  if (isError) return (
    <div style={{ padding: 32, color: "#DC2626", fontSize: 14 }}>
      Failed to load risks. Please try refreshing.
    </div>
  );

  return (
    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "rgb(147,197,253)", letterSpacing: "-0.5px", margin: 0 }}>Risk Register</h1>
          <p style={{ fontSize: 12, color: "#9CA3AF", margin: "4px 0 0", fontWeight: 500 }}>Track, assess and manage organizational risks</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ display: "flex", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
            {(["table", "heatmap"] as const).map(v => (
              <button key={v} onClick={() => setView(v)} style={{ padding: "7px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: "none", background: view === v ? "rgba(59,130,246,0.15)" : "transparent", color: view === v ? "#1E3A5F" : "#6B7280", borderRight: v === "table" ? "1px solid var(--border)" : "none" }}>
                {v === "table" ? "⊞ Table" : "◫ Heatmap"}
              </button>
            ))}
          </div>
          <button onClick={() => setShowCreate(true)} style={{ background: "linear-gradient(135deg, #1E3A5F, #065F46)", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, color: "white", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 2px 8px rgba(30,58,95,0.3)" }}>+ New Risk</button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {severities.map((s) => (
          <div key={s} onClick={() => setFilter(filter === s ? "All" : s)}
            style={{ background: "var(--card)", border: `1px solid ${filter === s ? severityStyle[s].border : "rgba(255,255,255,0.1)"}`, borderRadius: 12, padding: "12px 16px", cursor: "pointer", boxShadow: filter === s ? `0 2px 12px ${severityStyle[s].bg}` : "0 1px 4px rgba(0,0,0,0.05)", transition: "all 0.15s" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 6 }}>{s}</div>
            <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: severityStyle[s].color }}>{counts[s]}</div>
            <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>open risks</div>
          </div>
        ))}
      </div>

      {/* Filter & search bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 16px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
        <span style={{ fontSize: 14, color: "#9CA3AF" }}>🔍</span>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search risks by name, ID, or category..."
          style={{ flex: 1, border: "none", outline: "none", fontSize: 13, color: "var(--foreground)", background: "transparent", fontFamily: "inherit" }} />
        <div style={{ display: "flex", gap: 6 }}>
          {(["All", ...severities] as const).map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              style={{ padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: filter === s ? (s === "All" ? "1px solid #BFDBFE" : `1px solid ${severityStyle[s].border}`) : "1px solid var(--border)", background: filter === s ? (s === "All" ? "rgba(59,130,246,0.12)" : severityStyle[s].bg) : "transparent", color: filter === s ? (s === "All" ? "#1E3A5F" : severityStyle[s].color) : "#6B7280" }}>{s}</button>
          ))}
        </div>
        <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 600, flexShrink: 0 }}>{filtered.length} risks</span>
      </div>

      {/* Create Risk Modal */}
      {showCreate && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, width: 560, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "rgb(147,197,253)" }}>Create New Risk</div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>Add a risk to the register for tracking and treatment</div>
              </div>
              <button onClick={() => setShowCreate(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 20 }}>×</button>
            </div>
            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", display: "block", marginBottom: 5 }}>Risk Name *</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Describe the risk..."
                  style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "inherit", outline: "none", background: "var(--input)", color: "var(--foreground)", boxSizing: "border-box" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", display: "block", marginBottom: 5 }}>Severity</label>
                  <select value={form.severity} onChange={e => setForm(p => ({ ...p, severity: e.target.value as Severity }))}
                    style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 10px", fontSize: 12, fontFamily: "inherit", background: "var(--input)", color: "var(--foreground)", cursor: "pointer" }}>
                    {severities.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", display: "block", marginBottom: 5 }}>Category</label>
                  <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                    style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 10px", fontSize: 12, fontFamily: "inherit", background: "var(--input)", color: "var(--foreground)", cursor: "pointer" }}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", display: "block", marginBottom: 5 }}>Owner (Full Name)</label>
                  <input value={form.ownerFull} onChange={e => setForm(p => ({ ...p, ownerFull: e.target.value }))} placeholder="e.g. Alex Kim"
                    style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", fontSize: 12, fontFamily: "inherit", background: "var(--input)", color: "var(--foreground)", outline: "none", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", display: "block", marginBottom: 5 }}>Risk Score (1–25)</label>
                  <input type="number" min={1} max={25} value={form.score} onChange={e => setForm(p => ({ ...p, score: Number(e.target.value) }))}
                    style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", fontSize: 12, fontFamily: "'JetBrains Mono', monospace", background: "var(--input)", color: "var(--foreground)", outline: "none", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", display: "block", marginBottom: 5 }}>Status</label>
                  <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as Risk["status"] }))}
                    style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 10px", fontSize: 12, fontFamily: "inherit", background: "var(--input)", color: "var(--foreground)", cursor: "pointer" }}>
                    <option value="open">Open</option>
                    <option value="in-progress">In Progress</option>
                    <option value="accepted">Accepted</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", display: "block", marginBottom: 5 }}>Trend</label>
                  <select value={form.trend} onChange={e => setForm(p => ({ ...p, trend: e.target.value as "up" | "down" | "flat" }))}
                    style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 10px", fontSize: 12, fontFamily: "inherit", background: "var(--input)", color: "var(--foreground)", cursor: "pointer" }}>
                    <option value="up">↑ Increasing</option>
                    <option value="down">↓ Decreasing</option>
                    <option value="flat">— Stable</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", display: "block", marginBottom: 5 }}>Description</label>
                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3} placeholder="Describe the risk in detail..."
                  style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", fontSize: 12, fontFamily: "inherit", background: "var(--input)", color: "var(--foreground)", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
              </div>
              <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
                <button onClick={createRisk} disabled={!form.name.trim()} style={{ flex: 1, background: "linear-gradient(135deg, #1E3A5F, #065F46)", border: "none", borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 700, color: "white", cursor: form.name.trim() ? "pointer" : "not-allowed", opacity: form.name.trim() ? 1 : 0.5, fontFamily: "inherit" }}>Create Risk</button>
                <button onClick={() => setShowCreate(false)} style={{ padding: "10px 20px", border: "1px solid var(--border)", background: "var(--input)", borderRadius: 8, fontSize: 12, fontWeight: 700, color: "#6B7280", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Views */}
      {view === "table" ? (
        <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 360px" : "1fr", gap: 16 }}>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "var(--card)", borderBottom: "2px solid var(--border)" }}>
                  {["ID", "Severity", "Risk", "Category", "Owner", "Score", "Status", "Trend", "Updated"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "10px 14px", color: "#9CA3AF", fontWeight: 700, fontSize: 10, letterSpacing: "0.5px", textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} onClick={() => setSelected(selected === r.id ? null : r.id)}
                    style={{ borderBottom: "1px solid var(--border)", cursor: "pointer", background: selected === r.id ? "rgba(59,130,246,0.08)" : "transparent", transition: "background 0.1s" }}
                    onMouseEnter={e => { if (selected !== r.id) (e.currentTarget as HTMLTableRowElement).style.background = "var(--secondary)"; }}
                    onMouseLeave={e => { if (selected !== r.id) (e.currentTarget as HTMLTableRowElement).style.background = "transparent"; }}
                  >
                    <td style={{ padding: "11px 14px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#9CA3AF", fontWeight: 600 }}>{r.id}</td>
                    <td style={{ padding: "11px 14px" }}>
                      <span style={{ background: severityStyle[r.severity].bg, border: `1px solid ${severityStyle[r.severity].border}`, color: severityStyle[r.severity].color, borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{r.severity}</span>
                    </td>
                    <td style={{ padding: "11px 14px", color: "var(--foreground)", maxWidth: 220 }}><div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div></td>
                    <td style={{ padding: "11px 14px", color: "#6B7280" }}>{r.category}</td>
                    <td style={{ padding: "11px 14px" }}><span className="owner-capsule" title={r.ownerFull}>{r.ownerFull ?? r.owner}</span></td>
                    <td style={{ padding: "11px 14px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: severityStyle[r.severity].color, fontSize: 13 }}>{r.score}</td>
                    <td style={{ padding: "11px 14px" }}>
                      <span style={{ background: statusStyle[r.status]?.bg, border: `1px solid ${statusStyle[r.status]?.border}`, color: statusStyle[r.status]?.color, borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{statusStyle[r.status]?.label ?? r.status}</span>
                    </td>
                    <td style={{ padding: "11px 14px", fontWeight: 700, color: r.trend === "down" ? "#065F46" : r.trend === "up" ? "#DC2626" : "#9CA3AF" }}>
                      {r.trend === "down" ? "▼" : r.trend === "up" ? "▲" : "—"}
                    </td>
                    <td style={{ padding: "11px 14px", color: "#9CA3AF", fontSize: 11 }}>{r.updated}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={9} style={{ padding: "40px", textAlign: "center", color: "#9CA3AF" }}>No risks match your filters</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Detail panel */}
          {selectedRisk && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)", animation: "slide-right 0.2s ease both" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.5px", marginBottom: 4 }}>{selectedRisk.id}</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <span style={{ background: severityStyle[selectedRisk.severity].bg, border: `1px solid ${severityStyle[selectedRisk.severity].border}`, color: severityStyle[selectedRisk.severity].color, borderRadius: 4, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>{selectedRisk.severity}</span>
                    <span style={{ background: statusStyle[selectedRisk.status]?.bg, border: `1px solid ${statusStyle[selectedRisk.status]?.border}`, color: statusStyle[selectedRisk.status]?.color, borderRadius: 4, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>{statusStyle[selectedRisk.status]?.label}</span>
                  </div>
                </div>
                <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 18, lineHeight: 1 }}>×</button>
              </div>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "rgb(147,197,253)", margin: "0 0 12px", lineHeight: 1.4 }}>{selectedRisk.name}</h3>
              <p style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.6, margin: "0 0 16px" }}>{selectedRisk.description}</p>

              {/* Risk score visual */}
              <div style={{ background: "var(--input)", borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF" }}>Risk Score</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, color: severityStyle[selectedRisk.severity].color, fontSize: 16 }}>{selectedRisk.score}</span>
                </div>
                <div style={{ height: 6, background: "var(--card)", borderRadius: 3 }}>
                  <div style={{ height: "100%", width: `${(selectedRisk.score / 25) * 100}%`, background: severityStyle[selectedRisk.severity].color, borderRadius: 3, opacity: 0.7, transition: "width 0.5s ease" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                  <span style={{ fontSize: 9, color: "#9CA3AF" }}>0</span>
                  <span style={{ fontSize: 9, color: "#9CA3AF" }}>25 max</span>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                {[
                  ["Category", selectedRisk.category],
                  ["Owner", selectedRisk.ownerFull],
                  ["Trend", selectedRisk.trend === "down" ? "▼ Decreasing" : selectedRisk.trend === "up" ? "▲ Increasing" : "— Stable"],
                  ["Created", selectedRisk.created],
                  ["Last Updated", selectedRisk.updated],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 600 }}>{k}</span>
                    <span style={{ fontSize: 12, color: "var(--foreground)", fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* Treatment actions */}
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>Treatment Options</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {["Mitigate", "Accept", "Transfer", "Avoid"].map(t => (
                    <button key={t} style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "7px 8px", fontSize: 11, fontWeight: 700, color: "#6B7280", cursor: "pointer", fontFamily: "inherit", background: "var(--input)", textAlign: "center" }}>{t}</button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button style={{ flex: 1, background: "linear-gradient(135deg, #1E3A5F, #065F46)", border: "none", borderRadius: 8, padding: "8px", fontSize: 12, fontWeight: 700, color: "white", cursor: "pointer", fontFamily: "inherit" }}>Edit Risk</button>
                <button style={{ flex: 1, background: "var(--input)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px", fontSize: 12, fontWeight: 700, color: "var(--foreground)", cursor: "pointer", fontFamily: "inherit" }}>Add Evidence</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Heatmap view */
        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16 }}>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "24px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "rgb(147,197,253)", marginBottom: 4 }}>Risk Heatmap — Probability × Impact</div>
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>Click a risk to view details. Axes scale 1 (low) to 5 (high).</div>
            </div>
            <div style={{ display: "grid", gap: 4 }}>
              {/* Y-axis label */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <div style={{ width: 100, flexShrink: 0 }} />
                {HEAT_COLS.map(c => (
                  <div key={c} style={{ flex: 1, textAlign: "center", fontSize: 10, fontWeight: 700, color: "#9CA3AF" }}>{IMP_LABELS[c]}</div>
                ))}
              </div>
              {HEAT_ROWS.map(prob => (
                <div key={prob} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 100, flexShrink: 0, textAlign: "right", fontSize: 10, fontWeight: 700, color: "#9CA3AF", paddingRight: 8 }}>{PROB_LABELS[prob]}</div>
                  {HEAT_COLS.map(impact => {
                    const colors = heatColor(prob, impact);
                    const cellRisks = liveRisks.filter(r => {
                      const pos = RISK_POSITIONS[r.id];
                      return pos && pos.prob === prob && pos.impact === impact;
                    });
                    return (
                      <div key={impact} style={{ flex: 1, height: 72, background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 8, position: "relative", display: "flex", flexWrap: "wrap", alignItems: "flex-start", padding: 4, gap: 2, transition: "all 0.15s" }}>
                        <div style={{ position: "absolute", top: 3, right: 5, fontSize: 9, fontWeight: 700, color: colors.text, opacity: 0.6 }}>{prob * impact}</div>
                        {cellRisks.map(r => (
                          <button key={r.id} onClick={() => { setSelected(r.id === selected ? null : r.id); setView("table"); }}
                            title={r.name}
                            style={{ background: severityStyle[r.severity].bg, border: `1px solid ${severityStyle[r.severity].border}`, borderRadius: 4, padding: "1px 5px", fontSize: 9, fontWeight: 700, color: severityStyle[r.severity].color, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", overflow: "hidden", maxWidth: "90%", textOverflow: "ellipsis" }}>
                            {r.id}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                <div style={{ width: 100, flexShrink: 0, textAlign: "right", fontSize: 10, color: "#9CA3AF", fontWeight: 700, paddingRight: 8 }}>Impact →</div>
              </div>
            </div>
          </div>

          {/* Heatmap legend + risk list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>Legend</div>
              {[
                { label: "Critical (20–25)", ...heatColor(5, 5) },
                { label: "High (12–19)", ...heatColor(3, 5) },
                { label: "Medium (6–11)", ...heatColor(2, 4) },
                { label: "Low (1–5)", ...heatColor(1, 2) },
              ].map(item => (
                <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 14, height: 14, background: item.bg, border: `1px solid ${item.border}`, borderRadius: 3 }} />
                  <span style={{ fontSize: 11, color: "var(--foreground)", fontWeight: 500 }}>{item.label}</span>
                </div>
              ))}
            </div>
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)", flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>Top Risks</div>
              {liveRisks.filter(r => r.severity === "Critical" || r.severity === "High").map(r => (
                <div key={r.id} onClick={() => { setSelected(r.id); setView("table"); }} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.opacity = "0.7"}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.opacity = "1"}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: "#9CA3AF" }}>{r.id}</span>
                    <span style={{ background: severityStyle[r.severity].bg, border: `1px solid ${severityStyle[r.severity].border}`, color: severityStyle[r.severity].color, borderRadius: 3, padding: "1px 6px", fontSize: 9, fontWeight: 700 }}>{r.severity}</span>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--foreground)", lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
