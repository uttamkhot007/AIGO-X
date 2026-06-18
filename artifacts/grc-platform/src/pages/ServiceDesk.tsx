import { useState, useEffect, useCallback } from "react";
import { SubNav } from "@/components/SubNav";
import { useTickets } from "@/hooks/useGrcApi";

const NAV = "#1E3A5F";
const EME = "#065F46";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "").replace(/\/grc-platform$/, "");

const TABS = [
  { key: "kanban",      label: "Kanban" },
  { key: "tickets",    label: "All Tickets" },
  { key: "kb",         label: "Knowledge Base" },
  { key: "analytics",  label: "Analytics" },
  { key: "escalation", label: "Escalation Rules" },
];

const priBadge: Record<string, { color: string; bg: string; border: string }> = {
  P1: { color: "#991B1B", bg: "rgba(239,68,68,0.06)", border: "#FECACA" },
  P2: { color: "#92400E", bg: "rgba(245,158,11,0.06)", border: "#FDE68A" },
  P3: { color: "#3730A3", bg: "#EEF2FF", border: "#C7D2FE" },
  P4: { color: "#6B7280", bg: "rgb(23,30,42)", border: "rgba(255,255,255,0.1)" },
};
const statusBadge: Record<string, { color: string; bg: string; border: string }> = {
  "new":          { color: "var(--foreground)", bg: "rgb(23,30,42)", border: "rgba(255,255,255,0.1)" },
  "open":         { color: "#991B1B", bg: "rgba(239,68,68,0.06)", border: "#FECACA" },
  "triaging":     { color: "#D97706", bg: "rgba(245,158,11,0.06)", border: "#FDE68A" },
  "in-progress":  { color: NAV, bg: "rgba(59,130,246,0.12)", border: "#BFDBFE" },
  "resolved":     { color: EME, bg: "rgba(34,197,94,0.08)", border: "#A7F3D0" },
};

type Ticket = {
  id: number;
  ticketId: string;
  priority: string;
  title: string;
  category: string;
  assignee: string;
  status: string;
  sla: string;
  aiSeverity?: string;
  aiCategory?: string;
  aiConfidence?: number;
  createdAt: string;
};

type KbArticle = { id: number; articleId: string; title: string; category: string; tags: string; views: number; helpful: number; content: string };

function useApi<T>(path: string, defaultVal: T, deps: unknown[] = []) {
  const [data, setData] = useState<T>(defaultVal);
  const [loading, setLoading] = useState(false);
  const token = localStorage.getItem("grc_token");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api${path}`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) {
        const ct = r.headers.get("content-type") ?? "";
        if (ct.includes("application/json")) {
          setData(await r.json() as T);
        }
      }
    } catch {
      // silently keep default value on network / parse errors
    } finally {
      setLoading(false);
    }
  }, [path, token, ...deps]);
  useEffect(() => { load(); }, [load]);
  return { data, loading, reload: load };
}

// ── Ticket Card ───────────────────────────────────────────────────────────────

function TicketCard({ t, onClick }: { t: Ticket; onClick?: () => void }) {
  return (
    <div onClick={onClick} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px", cursor: "pointer", boxShadow: "0 2px 12px rgba(0,0,0,0.40)", marginBottom: 8, transition: "box-shadow 0.15s" }}
      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)"}
      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 4px rgba(0,0,0,0.06)"}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 9, fontFamily: "monospace", color: "var(--muted-foreground)", fontWeight: 600 }}>{t.ticketId}</span>
        <span style={{ background: priBadge[t.priority]!.bg, border: `1px solid ${priBadge[t.priority]!.border}`, color: priBadge[t.priority]!.color, borderRadius: 3, padding: "1px 6px", fontSize: 9, fontWeight: 700 }}>{t.priority}</span>
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--foreground)", lineHeight: 1.4, marginBottom: 8 }}>{t.title}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 4 }}>
          <span style={{ background: "var(--input)", borderRadius: 3, padding: "1px 6px", fontSize: 9, fontWeight: 600, color: "#6B7280" }}>{t.category}</span>
          <span style={{ background: "rgba(59,130,246,0.08)", borderRadius: 3, padding: "1px 6px", fontSize: 9, fontWeight: 600, color: "#0369A1" }}>SLA: {t.sla}</span>
        </div>
        <span className="owner-capsule" style={{ flexShrink: 0 }}>{t.assignee}</span>
      </div>
      {t.aiConfidence != null && (
        <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 4, paddingTop: 6, borderTop: "1px solid #F9FAFB" }}>
          <span style={{ fontSize: 9, color: "var(--muted-foreground)" }}>AI:</span>
          <span style={{ fontSize: 9, fontWeight: 700, color: t.aiSeverity === "P1" ? "#DC2626" : t.aiSeverity === "P2" ? "#D97706" : "var(--foreground)" }}>{t.aiSeverity}</span>
          <div style={{ flex: 1, height: 3, background: "var(--input)", borderRadius: 2 }}>
            <div style={{ height: "100%", width: `${(t.aiConfidence ?? 0.5) * 100}%`, background: (t.aiConfidence ?? 0) > 0.8 ? EME : "#D97706", borderRadius: 2 }} />
          </div>
          <span style={{ fontSize: 9, color: "var(--muted-foreground)" }}>{Math.round((t.aiConfidence ?? 0.5) * 100)}%</span>
        </div>
      )}
    </div>
  );
}

// ── Kanban Tab ─────────────────────────────────────────────────────────────────

function KanbanTab({ tickets, reload }: { tickets: Ticket[]; reload: () => void }) {
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [triage, setTriage] = useState<{ severity?: string; suggestedCategory?: string; suggestedSla?: string; confidence?: number; reasoning?: string } | null>(null);
  const [triaging, setTriaging] = useState(false);
  const [similar, setSimilar] = useState<Array<{ id: string; title: string; resolution: string; resolvedAt: string; matchScore: number }>>([]);
  const token = localStorage.getItem("grc_token");

  const columns = [
    { key: "open",        label: "New / Open",     color: "#DC2626", dotColor: "#EF4444" },
    { key: "triaging",    label: "Triaging",        color: "#D97706", dotColor: "#F59E0B" },
    { key: "in-progress", label: "In Progress",     color: NAV,       dotColor: "#3B82F6" },
    { key: "resolved",    label: "Resolved",        color: EME,       dotColor: "#10B981" },
  ];

  async function runTriage(t: Ticket) {
    setSelected(t);
    setTriage(null);
    setSimilar([]);
    setTriaging(true);
    try {
      const [triageR, simR] = await Promise.all([
        fetch(`${BASE}/api/servicedesk/triage`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ title: t.title, category: t.category }) }),
        fetch(`${BASE}/api/servicedesk/similar/${t.ticketId}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (triageR.ok) setTriage(await triageR.json() as typeof triage);
      if (simR.ok) setSimilar(((await simR.json() as { suggestions: typeof similar }).suggestions));
    } finally {
      setTriaging(false);
    }
  }

  return (
    <div style={{ padding: "16px 24px", display: "flex", gap: 14, overflowX: "auto", minHeight: "calc(100vh - 200px)" }}>
      {columns.map(col => {
        const colTickets = tickets.filter(t => t.status === col.key || (col.key === "open" && t.status === "new"));
        return (
          <div key={col.key} style={{ width: 280, minWidth: 280, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, padding: "8px 12px", background: "var(--card)", borderRadius: 10, border: "1px solid var(--border)", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: col.dotColor }} />
              <span style={{ fontSize: 12, fontWeight: 800, color: col.color, flex: 1 }}>{col.label}</span>
              <span style={{ background: "var(--input)", borderRadius: 10, padding: "1px 8px", fontSize: 10, fontWeight: 700, color: "#6B7280" }}>{colTickets.length}</span>
            </div>
            <div style={{ flex: 1 }}>
              {colTickets.map(t => (
                <TicketCard key={t.id} t={t} onClick={() => runTriage(t)} />
              ))}
            </div>
          </div>
        );
      })}

      {selected && (
        <div style={{ position: "fixed", right: 0, top: 52, bottom: 0, width: 380, background: "var(--card)", borderLeft: "1px solid var(--border)", zIndex: 100, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "-4px 0 24px rgba(0,0,0,0.1)" }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", fontSize: 16, cursor: "pointer", color: "var(--muted-foreground)", padding: 0 }}>✕</button>
            <div>
              <div style={{ fontSize: 12, fontFamily: "monospace", color: "var(--muted-foreground)", fontWeight: 600 }}>{selected.ticketId}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: NAV }}>{selected.title}</div>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
            <div style={{ marginBottom: 14, padding: "12px 14px", background: `linear-gradient(135deg, ${NAV}10, ${EME}10)`, border: `1px solid ${NAV}20`, borderRadius: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: NAV, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 16, height: 16, background: `linear-gradient(135deg, ${NAV}, ${EME})`, borderRadius: 4, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "var(--card)" }}>◆</span>
                AI Triage Assessment
              </div>
              {triaging && <div style={{ fontSize: 12, color: "var(--muted-foreground)", textAlign: "center", padding: "8px 0" }}>◆ Analyzing ticket...</div>}
              {triage && !triaging && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                    <div style={{ background: "var(--card)", borderRadius: 8, padding: "8px 10px" }}>
                      <div style={{ fontSize: 9, color: "var(--muted-foreground)", fontWeight: 700, marginBottom: 3 }}>SEVERITY</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: triage.severity === "P1" ? "#DC2626" : triage.severity === "P2" ? "#D97706" : NAV, fontFamily: "monospace" }}>{triage.severity}</div>
                    </div>
                    <div style={{ background: "var(--card)", borderRadius: 8, padding: "8px 10px" }}>
                      <div style={{ fontSize: 9, color: "var(--muted-foreground)", fontWeight: 700, marginBottom: 3 }}>CONFIDENCE</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: (triage.confidence ?? 0) > 0.8 ? EME : "#D97706", fontFamily: "monospace" }}>{Math.round((triage.confidence ?? 0.5) * 100)}%</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--foreground)", lineHeight: 1.5, marginBottom: 6 }}>{triage.reasoning}</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <span style={{ background: "rgba(59,130,246,0.08)", border: "1px solid #BAE6FD", color: "#0369A1", borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{triage.suggestedCategory}</span>
                    <span style={{ background: "rgba(34,197,94,0.08)", border: "1px solid #BBF7D0", color: "#15803D", borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>SLA: {triage.suggestedSla}</span>
                  </div>
                </>
              )}
            </div>

            {similar.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>Similar Resolved Tickets</div>
                {similar.map(s => (
                  <div key={s.id} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--muted-foreground)" }}>{s.id}</span>
                      <span style={{ fontSize: 9, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(52,211,153,0.25)", color: EME, borderRadius: 3, padding: "1px 5px", fontWeight: 700 }}>{Math.round(s.matchScore * 100)}% match</span>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--foreground)", marginBottom: 6 }}>{s.title}</div>
                    <div style={{ fontSize: 11, color: "#6B7280", lineHeight: 1.5 }}><strong>Resolution:</strong> {s.resolution}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── All Tickets Tab ────────────────────────────────────────────────────────────

function TicketsTab({ tickets, reload }: { tickets: Ticket[]; reload: () => void }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ title: "", priority: "P2", category: "Security", assignee: "", sla: "8h" });
  const [triaging, setTriaging] = useState(false);
  const [triageResult, setTriageResult] = useState<{ severity?: string; suggestedSla?: string; confidence?: number; reasoning?: string } | null>(null);
  const token = localStorage.getItem("grc_token");

  const filtered = statusFilter === "all" ? tickets : tickets.filter(t => t.status === statusFilter);

  async function triageNew() {
    if (!form.title) return;
    setTriaging(true);
    try {
      const r = await fetch(`${BASE}/api/servicedesk/triage`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ title: form.title, category: form.category }) });
      if (r.ok) setTriageResult(await r.json() as typeof triageResult);
    } finally {
      setTriaging(false);
    }
  }

  async function createTicket() {
    await fetch(`${BASE}/api/tickets`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...form, status: "open" }) });
    setShowNew(false);
    setForm({ title: "", priority: "P2", category: "Security", assignee: "", sla: "8h" });
    setTriageResult(null);
    reload();
  }

  return (
    <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {[["all", "All"], ["open", "Open"], ["in-progress", "In Progress"], ["resolved", "Resolved"]].map(([v, l]) => (
          <button key={v} onClick={() => setStatusFilter(v)}
            style={{ padding: "5px 14px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: statusFilter === v ? "1px solid rgba(99,179,237,0.25)" : "1px solid var(--border)", background: statusFilter === v ? "rgba(59,130,246,0.12)" : "white", color: statusFilter === v ? NAV : "#6B7280" }}>{l}</button>
        ))}
        <button onClick={() => setShowNew(true)} style={{ marginLeft: "auto", background: `linear-gradient(135deg, ${NAV}, ${EME})`, border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 12, fontWeight: 700, color: "white", cursor: "pointer", fontFamily: "inherit" }}>+ New Ticket</button>
      </div>

      {showNew && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 24px", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: NAV, marginBottom: 16 }}>New Ticket + AI Triage</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Title</label>
              <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Describe the issue..."
                style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
            </div>
            {[
              { key: "priority", label: "Priority", opts: ["P1", "P2", "P3", "P4"] },
              { key: "category", label: "Category", opts: ["Security", "Access", "Compliance", "Privacy", "Network", "Infra", "Vendor Risk"] },
              { key: "sla",      label: "SLA",      opts: ["2h", "4h", "8h", "24h", "48h", "72h", "5d"] },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", display: "block", marginBottom: 4 }}>{f.label}</label>
                <select value={(form as Record<string, string>)[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 10px", fontSize: 12, fontFamily: "inherit", outline: "none", background: "var(--card)", cursor: "pointer" }}>
                  {f.opts.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: triageResult ? 14 : 0 }}>
            <button onClick={triageNew} disabled={!form.title || triaging}
              style={{ border: "1px solid var(--border)", background: "var(--card)", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, color: "var(--foreground)", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>
              {triaging ? "◆ Triaging..." : "◆ AI Triage"}
            </button>
            <button onClick={createTicket} style={{ background: `linear-gradient(135deg, ${NAV}, ${EME})`, border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, color: "white", cursor: "pointer", fontFamily: "inherit" }}>Create Ticket</button>
            <button onClick={() => { setShowNew(false); setTriageResult(null); }} style={{ border: "1px solid var(--border)", background: "var(--card)", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, color: "var(--muted-foreground)", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          </div>
          {triageResult && (
            <div style={{ padding: "12px 14px", background: `linear-gradient(135deg, ${NAV}08, ${EME}08)`, border: `1px solid ${NAV}20`, borderRadius: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: NAV, marginBottom: 6 }}>◆ AI Triage Result</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <span style={{ background: priBadge[triageResult.severity ?? "P3"]!.bg, border: `1px solid ${priBadge[triageResult.severity ?? "P3"]!.border}`, color: priBadge[triageResult.severity ?? "P3"]!.color, borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>Severity: {triageResult.severity}</span>
                <span style={{ background: "rgba(59,130,246,0.08)", border: "1px solid #BAE6FD", color: "#0369A1", borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>SLA: {triageResult.suggestedSla}</span>
                <span style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(52,211,153,0.25)", color: EME, borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>Confidence: {Math.round((triageResult.confidence ?? 0.5) * 100)}%</span>
              </div>
              <div style={{ fontSize: 11, color: "#6B7280", lineHeight: 1.5 }}>{triageResult.reasoning}</div>
            </div>
          )}
        </div>
      )}

      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "var(--card)", borderBottom: "1px solid var(--border)" }}>
              {["ID", "Priority", "Ticket", "Category", "Assignee", "Status", "SLA", "AI Triage"].map(h => (
                <th key={h} style={{ textAlign: "left", padding: "10px 14px", color: "var(--muted-foreground)", fontWeight: 700, fontSize: 10, letterSpacing: "0.5px", textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(t => (
              <tr key={t.id} style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "var(--secondary)"}
                onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = "var(--secondary)"}>
                <td style={{ padding: "11px 14px", fontFamily: "monospace", fontSize: 10, color: "var(--muted-foreground)", fontWeight: 600 }}>{t.ticketId}</td>
                <td style={{ padding: "11px 14px" }}>
                  <span style={{ background: priBadge[t.priority]!.bg, border: `1px solid ${priBadge[t.priority]!.border}`, color: priBadge[t.priority]!.color, borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{t.priority}</span>
                </td>
                <td style={{ padding: "11px 14px", color: "var(--foreground)", fontWeight: 600, maxWidth: 260 }}><div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</div></td>
                <td style={{ padding: "11px 14px", color: "#6B7280" }}>{t.category}</td>
                <td style={{ padding: "11px 14px" }}>
                  <span className="owner-capsule">{t.assignee}</span>
                </td>
                <td style={{ padding: "11px 14px" }}>
                  <span style={{ background: statusBadge[t.status]?.bg ?? "var(--card)", border: `1px solid ${statusBadge[t.status]?.border ?? "rgba(255,255,255,0.1)"}`, color: statusBadge[t.status]?.color ?? "var(--foreground)", borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>
                    {t.status === "in-progress" ? "In Progress" : t.status.charAt(0).toUpperCase() + t.status.slice(1)}
                  </span>
                </td>
                <td style={{ padding: "11px 14px", fontFamily: "monospace", fontSize: 11, color: "var(--foreground)", fontWeight: 600 }}>{t.sla}</td>
                <td style={{ padding: "11px 14px" }}>
                  {t.aiConfidence != null ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: t.aiSeverity === "P1" ? "#DC2626" : NAV }}>{t.aiSeverity}</span>
                      <div style={{ width: 40, height: 4, background: "var(--input)", borderRadius: 2 }}>
                        <div style={{ height: "100%", width: `${(t.aiConfidence) * 100}%`, background: t.aiConfidence > 0.8 ? EME : "#D97706", borderRadius: 2 }} />
                      </div>
                      <span style={{ fontSize: 9, color: "var(--muted-foreground)" }}>{Math.round(t.aiConfidence * 100)}%</span>
                    </div>
                  ) : <span style={{ fontSize: 10, color: "#D1D5DB" }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── KB Tab ─────────────────────────────────────────────────────────────────────

function KbTab() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<KbArticle | null>(null);
  const [creating, setCreating] = useState(false);
  const [newArt, setNewArt] = useState({ title: "", category: "Security", tags: "", content: "" });
  const token = localStorage.getItem("grc_token");

  const { data: articles, loading, reload } = useApi<KbArticle[]>(`/servicedesk/kb${search ? `?q=${encodeURIComponent(search)}` : ""}`, [], [search]);

  async function save() {
    await fetch(`${BASE}/api/servicedesk/kb`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(newArt) });
    setCreating(false);
    setNewArt({ title: "", category: "Security", tags: "", content: "" });
    reload();
  }

  return (
    <div style={{ padding: "16px 24px", display: "flex", gap: 16, height: "calc(100vh - 200px)" }}>
      <div style={{ width: 300, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search articles..."
            style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontFamily: "inherit", outline: "none" }} />
          <button onClick={() => setCreating(true)} style={{ background: `linear-gradient(135deg, ${NAV}, ${EME})`, border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 11, fontWeight: 700, color: "white", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>+ New</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading && <div style={{ padding: "20px", textAlign: "center", fontSize: 12, color: "var(--muted-foreground)" }}>Loading...</div>}
          {articles.map(a => (
            <div key={a.id} onClick={() => setSelected(a)}
              style={{ padding: "10px 12px", cursor: "pointer", borderRadius: 8, marginBottom: 4, background: selected?.id === a.id ? "rgba(59,130,246,0.12)" : "white", border: `1px solid ${selected?.id === a.id ? "#BFDBFE" : "rgba(255,255,255,0.1)"}`, transition: "all 0.1s" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: selected?.id === a.id ? NAV : "var(--foreground)", marginBottom: 3 }}>{a.title}</div>
              <div style={{ display: "flex", gap: 4 }}>
                <span style={{ background: "var(--input)", borderRadius: 3, padding: "1px 6px", fontSize: 9, color: "#6B7280", fontWeight: 600 }}>{a.category}</span>
                <span style={{ fontSize: 9, color: "var(--muted-foreground)" }}>👁 {a.views}</span>
                <span style={{ fontSize: 9, color: EME }}>👍 {a.helpful}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 24px", overflow: "auto", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
        {creating && (
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: NAV, marginBottom: 16 }}>New KB Article</div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Title</label>
              <input value={newArt.title} onChange={e => setNewArt(p => ({ ...p, title: e.target.value }))} placeholder="Article title..."
                style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Category</label>
                <select value={newArt.category} onChange={e => setNewArt(p => ({ ...p, category: e.target.value }))}
                  style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 10px", fontSize: 12, fontFamily: "inherit", outline: "none", background: "var(--card)" }}>
                  {["Security", "Access", "Compliance", "Privacy", "Network", "Infra", "Vendor Risk"].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Tags</label>
                <input value={newArt.tags} onChange={e => setNewArt(p => ({ ...p, tags: e.target.value }))} placeholder="tag1,tag2,..."
                  style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Content (Markdown)</label>
              <textarea value={newArt.content} onChange={e => setNewArt(p => ({ ...p, content: e.target.value }))} rows={12} placeholder="## Overview&#10;&#10;Write your article content here..."
                style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", fontSize: 12, fontFamily: "monospace", outline: "none", boxSizing: "border-box", resize: "vertical" }} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={save} style={{ background: `linear-gradient(135deg, ${NAV}, ${EME})`, border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 12, fontWeight: 700, color: "white", cursor: "pointer", fontFamily: "inherit" }}>Publish Article</button>
              <button onClick={() => setCreating(false)} style={{ border: "1px solid var(--border)", background: "var(--card)", borderRadius: 8, padding: "9px 16px", fontSize: 12, fontWeight: 700, color: "var(--muted-foreground)", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
            </div>
          </div>
        )}
        {!creating && selected && (
          <div>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 10, fontFamily: "monospace", color: "var(--muted-foreground)", marginBottom: 4 }}>{selected.articleId}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: NAV }}>{selected.title}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <span style={{ background: "var(--input)", borderRadius: 4, padding: "2px 8px", fontSize: 10, color: "#6B7280", fontWeight: 600 }}>{selected.category}</span>
                  {selected.tags.split(",").filter(Boolean).map(t => (
                    <span key={t} style={{ background: "rgba(59,130,246,0.12)", borderRadius: 4, padding: "2px 8px", fontSize: 10, color: NAV, fontWeight: 600 }}>{t.trim()}</span>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, fontSize: 12, color: "var(--muted-foreground)" }}>
                <span>👁 {selected.views}</span>
                <span style={{ color: EME }}>👍 {selected.helpful}</span>
              </div>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.8, color: "var(--foreground)", whiteSpace: "pre-wrap" }}>
              {selected.content.split(/^(#{1,3} .+)$/m).map((part, i) => {
                if (/^#{1,3} /.test(part)) {
                  const level = (part.match(/^(#{1,3})/) || [])[1]?.length ?? 1;
                  return <div key={i} style={{ fontSize: level === 1 ? 16 : level === 2 ? 14 : 13, fontWeight: 800, color: NAV, marginTop: 20, marginBottom: 8 }}>{part.replace(/^#{1,3} /, "")}</div>;
                }
                return <span key={i}>{part}</span>;
              })}
            </div>
          </div>
        )}
        {!creating && !selected && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 8, color: "var(--muted-foreground)" }}>
            <div style={{ fontSize: 32 }}>📚</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Select an article to read</div>
            <div style={{ fontSize: 11 }}>or search the knowledge base</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Analytics Tab ──────────────────────────────────────────────────────────────

function AnalyticsTab() {
  const { data: metrics } = useApi<{
    mttr: string; firstResponseTime: string; resolutionRate: number; slaBreaches: number;
    totalTickets: number; openTickets: number;
    trend: Array<{ week: string; tickets: number; resolved: number; slaBreaches: number }>;
    byPriority: Array<{ priority: string; count: number; avgResolutionH: number }>;
  }>("/servicedesk/metrics", { mttr: "4.2h", firstResponseTime: "0.8h", resolutionRate: 67, slaBreaches: 0, totalTickets: 7, openTickets: 3, trend: [], byPriority: [] });

  const trendMax = Math.max(...(metrics.trend.map(t => t.tickets) || [1]));

  return (
    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { label: "Mean Time to Resolve",    value: metrics.mttr,            color: NAV,      sub: "Target: <6h" },
          { label: "First Response Time",     value: metrics.firstResponseTime,color: EME,     sub: "Target: <1h" },
          { label: "Resolution Rate",         value: `${metrics.resolutionRate}%`,color: EME,  sub: "This month" },
          { label: "SLA Breaches",            value: metrics.slaBreaches,     color: metrics.slaBreaches > 0 ? "#DC2626" : EME, sub: "This week" },
        ].map(k => (
          <div key={k.label} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 18px", boxShadow: "0 1px 6px rgba(0,0,0,0.05)", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: k.color, borderRadius: "12px 12px 0 0" }} />
            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "monospace", color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 2 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: NAV, marginBottom: 16 }}>Ticket Volume (Last 4 Weeks)</div>
          {metrics.trend.length > 0 && (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 120 }}>
              {metrics.trend.map(t => (
                <div key={t.week} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{ width: "100%", display: "flex", gap: 2, alignItems: "flex-end", height: 90 }}>
                    <div style={{ flex: 1, background: `${NAV}30`, borderRadius: "3px 3px 0 0", height: `${(t.tickets / trendMax) * 90}px` }} />
                    <div style={{ flex: 1, background: EME, borderRadius: "3px 3px 0 0", height: `${(t.resolved / trendMax) * 90}px`, opacity: 0.8 }} />
                  </div>
                  <div style={{ fontSize: 9, color: "var(--muted-foreground)", fontWeight: 700 }}>{t.week}</div>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 10, height: 10, background: `${NAV}30`, borderRadius: 2 }} /><span style={{ fontSize: 10, color: "#6B7280" }}>Total</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 10, height: 10, background: EME, borderRadius: 2, opacity: 0.8 }} /><span style={{ fontSize: 10, color: "#6B7280" }}>Resolved</span></div>
          </div>
        </div>

        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: NAV, marginBottom: 16 }}>By Priority — Avg Resolution Time</div>
          {metrics.byPriority.map(p => (
            <div key={p.priority} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ background: priBadge[p.priority]!.bg, border: `1px solid ${priBadge[p.priority]!.border}`, color: priBadge[p.priority]!.color, borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700, width: 28, textAlign: "center" }}>{p.priority}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: 11, color: "#6B7280" }}>{p.count} tickets</span>
                  <span style={{ fontSize: 11, fontWeight: 800, fontFamily: "monospace", color: NAV }}>{p.avgResolutionH}h avg</span>
                </div>
                <div style={{ height: 5, background: "var(--input)", borderRadius: 3 }}>
                  <div style={{ height: "100%", width: `${Math.min(100, (p.avgResolutionH / 72) * 100)}%`, background: priBadge[p.priority]!.color, borderRadius: 3, opacity: 0.7 }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Escalation Rules ───────────────────────────────────────────────────────────

function EscalationTab() {
  const { data: rules } = useApi<Array<{ id: string; name: string; trigger: string; action: string; enabled: boolean }>>("/servicedesk/escalation-rules", []);
  const [localRules, setLocalRules] = useState(rules);
  useEffect(() => { setLocalRules(rules); }, [rules]);

  return (
    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: NAV }}>Escalation Rules</div>
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>Automated escalation triggers for SLA breaches and critical events</div>
        </div>
        <button style={{ background: `linear-gradient(135deg, ${NAV}, ${EME})`, border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, color: "white", cursor: "pointer", fontFamily: "inherit" }}>+ New Rule</button>
      </div>

      {localRules.map(rule => (
        <div key={rule.id} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", boxShadow: "0 1px 6px rgba(0,0,0,0.05)", display: "flex", alignItems: "center", gap: 16 }}>
          <div onClick={() => setLocalRules(prev => prev.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r))}
            style={{ width: 36, height: 20, background: rule.enabled ? NAV : "rgba(255,255,255,0.1)", borderRadius: 10, position: "relative", cursor: "pointer", flexShrink: 0, transition: "background 0.2s" }}>
            <div style={{ width: 16, height: 16, background: "var(--card)", borderRadius: "50%", position: "absolute", top: 2, left: rule.enabled ? 18 : 2, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: NAV }}>{rule.name}</span>
              <span style={{ fontFamily: "monospace", fontSize: 9, color: "var(--muted-foreground)" }}>{rule.id}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div style={{ background: "var(--card)", borderRadius: 8, padding: "8px 12px" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", marginBottom: 3 }}>Trigger</div>
                <div style={{ fontSize: 11, color: "var(--foreground)" }}>{rule.trigger}</div>
              </div>
              <div style={{ background: "rgba(34,197,94,0.08)", borderRadius: 8, padding: "8px 12px" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", marginBottom: 3 }}>Action</div>
                <div style={{ fontSize: 11, color: "var(--foreground)" }}>{rule.action}</div>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button style={{ border: "1px solid var(--border)", background: "var(--card)", borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 600, color: "#6B7280", cursor: "pointer", fontFamily: "inherit" }}>Edit</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ServiceDesk() {
  const [tab, setTab] = useState("kanban");
  const { data: ticketsData, isLoading: loading, isError: ticketsError, refetch: reload } = useTickets();
  const tickets = ticketsData ?? [];

  const openCount       = tickets.filter(t => t.status === "open").length;
  const inProgressCount = tickets.filter(t => t.status === "in-progress").length;
  const resolvedCount   = tickets.filter(t => t.status === "resolved").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 52px)", background: "#F9F8F6" }}>
      {ticketsError && (
        <div style={{ background: "rgba(220,38,38,0.08)", borderBottom: "1px solid rgba(220,38,38,0.2)", padding: "8px 24px", fontSize: 12, color: "#DC2626", fontWeight: 600 }}>
          ⚠ Failed to load tickets — check API connectivity
        </div>
      )}
      <div style={{ background: "var(--card)", borderBottom: "1px solid var(--border)", padding: "12px 24px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 0 }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: NAV, letterSpacing: "-0.5px", margin: "0 0 2px" }}>Service Desk</h1>
            <p style={{ fontSize: 11, color: "var(--muted-foreground)", margin: 0, fontWeight: 500 }}>AI-powered ticketing · SLA tracking · Knowledge base · Resolution intelligence</p>
          </div>
          <div style={{ display: "flex", gap: 12, paddingBottom: 12 }}>
            {[
              { label: "Open",        value: openCount,       color: "#DC2626" },
              { label: "In Progress", value: inProgressCount, color: NAV },
              { label: "Resolved",    value: resolvedCount,   color: EME },
            ].map(k => (
              <div key={k.label} style={{ textAlign: "right" }}>
                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "monospace", color: k.color }}>{k.value}</div>
                <div style={{ fontSize: 9, color: "var(--muted-foreground)", fontWeight: 700, textTransform: "uppercase" }}>{k.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <SubNav tabs={TABS} active={tab} onSelect={setTab} />
      <div style={{ flex: 1, overflowY: tab === "kanban" ? "hidden" : "auto" }}>
        {tab === "kanban"     && <KanbanTab tickets={tickets} reload={reload} />}
        {tab === "tickets"    && <TicketsTab tickets={tickets} reload={reload} />}
        {tab === "kb"         && <KbTab />}
        {tab === "analytics"  && <AnalyticsTab />}
        {tab === "escalation" && <EscalationTab />}
      </div>
    </div>
  );
}
