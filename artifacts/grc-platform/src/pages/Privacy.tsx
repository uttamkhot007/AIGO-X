import { useState } from "react";

type DSARStatus = "completed" | "in-progress" | "overdue" | "new";
type DPIAStatus = "in-review" | "approved" | "draft";

interface DSAR {
  id: string;
  type: string;
  subject: string;
  email: string;
  received: string;
  due: string;
  status: DSARStatus;
  daysLeft: number | null;
  notes?: string;
}

interface DPIA {
  id: string;
  name: string;
  risk: string;
  status: DPIAStatus;
  owner: string;
  updated: string;
  description?: string;
}

const initialDSARs: DSAR[] = [
  { id: "DSR-0312", type: "Access",      subject: "John M.",  email: "j.m@example.com",  received: "2024-06-10", due: "2024-07-10", status: "completed",   daysLeft: null },
  { id: "DSR-0311", type: "Erasure",     subject: "Anna K.",  email: "a.k@example.com",  received: "2024-06-08", due: "2024-07-08", status: "in-progress", daysLeft: 22 },
  { id: "DSR-0310", type: "Portability", subject: "Marc T.",  email: "m.t@example.com",  received: "2024-06-01", due: "2024-07-01", status: "in-progress", daysLeft: 15 },
  { id: "DSR-0309", type: "Access",      subject: "Lisa P.",  email: "l.p@example.com",  received: "2024-05-28", due: "2024-06-27", status: "overdue",     daysLeft: -4 },
  { id: "DSR-0308", type: "Objection",   subject: "Sven O.",  email: "s.o@example.com",  received: "2024-05-20", due: "2024-06-19", status: "completed",   daysLeft: null },
];

const initialDPIAs: DPIA[] = [
  { id: "DPIA-012", name: "Customer Analytics Platform v2", risk: "High",   status: "in-review", owner: "EW", updated: "2024-06-11", description: "Assessment of new ML-based analytics processing EU citizen data." },
  { id: "DPIA-011", name: "HR Recruitment AI Tool",         risk: "High",   status: "approved",  owner: "PL", updated: "2024-05-30", description: "Impact assessment for AI-driven candidate screening tool." },
  { id: "DPIA-010", name: "New CRM Integration",            risk: "Medium", status: "approved",  owner: "AK", updated: "2024-05-15", description: "Integration with Salesforce for EU customer data processing." },
  { id: "DPIA-009", name: "Marketing Consent Platform",     risk: "Low",    status: "approved",  owner: "EW", updated: "2024-04-28", description: "Consent management and preference center deployment." },
];

const dsarStatus: Record<DSARStatus, { bg: string; color: string; border: string; label: string }> = {
  "new":         { bg: "var(--input)",               color: "#6B7280", border: "rgba(255,255,255,0.1)", label: "New" },
  "completed":   { bg: "rgba(34,197,94,0.08)",        color: "#065F46", border: "#A7F3D0",              label: "Completed" },
  "in-progress": { bg: "rgba(59,130,246,0.12)",       color: "rgb(147,197,253)", border: "#BFDBFE",     label: "In Progress" },
  "overdue":     { bg: "rgba(239,68,68,0.06)",        color: "#991B1B", border: "#FECACA",              label: "Overdue" },
};

const dpiaStatus: Record<DPIAStatus, { bg: string; color: string; border: string; label: string }> = {
  "draft":     { bg: "var(--input)",              color: "#6B7280", border: "rgba(255,255,255,0.1)", label: "Draft" },
  "in-review": { bg: "rgba(245,158,11,0.06)",     color: "#92400E", border: "#FDE68A",              label: "In Review" },
  "approved":  { bg: "rgba(34,197,94,0.08)",      color: "#065F46", border: "#A7F3D0",              label: "Approved" },
};

const riskStyle: Record<string, { bg: string; color: string; border: string }> = {
  High:   { bg: "rgba(245,158,11,0.06)", color: "#92400E", border: "#FDE68A" },
  Medium: { bg: "#EEF2FF",               color: "#3730A3", border: "#C7D2FE" },
  Low:    { bg: "rgba(34,197,94,0.08)",  color: "#065F46", border: "#A7F3D0" },
};

const DSAR_TYPES = ["Access", "Erasure", "Portability", "Objection", "Rectification", "Restriction"];

function SLABadge({ daysLeft, status }: { daysLeft: number | null; status: DSARStatus }) {
  if (status === "completed") return <span style={{ color: "#065F46", fontWeight: 700, fontSize: 11 }}>✓ Done</span>;
  if (daysLeft === null) return null;
  if (daysLeft < 0) return (
    <span style={{ background: "rgba(239,68,68,0.06)", border: "1px solid #FECACA", color: "#991B1B", borderRadius: 4, padding: "2px 7px", fontSize: 10, fontWeight: 700 }}>
      {Math.abs(daysLeft)}d overdue
    </span>
  );
  if (daysLeft <= 7) return (
    <span style={{ background: "rgba(245,158,11,0.06)", border: "1px solid #FDE68A", color: "#92400E", borderRadius: 4, padding: "2px 7px", fontSize: 10, fontWeight: 700 }}>
      {daysLeft}d left ⚠
    </span>
  );
  return <span style={{ fontSize: 11, color: "#9CA3AF" }}>{daysLeft}d left</span>;
}

export default function Privacy() {
  const [dsars, setDsars] = useState<DSAR[]>(initialDSARs);
  const [dpias, setDpias] = useState<DPIA[]>(initialDPIAs);
  const [selectedDsar, setSelectedDsar] = useState<DSAR | null>(null);
  const [selectedDpia, setSelectedDpia] = useState<DPIA | null>(null);
  const [showNewDsar, setShowNewDsar] = useState(false);
  const [showNewDpia, setShowNewDpia] = useState(false);
  const [dsarFilter, setDsarFilter] = useState<DSARStatus | "all">("all");

  const [newDsar, setNewDsar] = useState({ subject: "", email: "", type: "Access", notes: "" });
  const [newDpia, setNewDpia] = useState({ name: "", risk: "Medium", description: "" });

  const filteredDsars = dsarFilter === "all" ? dsars : dsars.filter(d => d.status === dsarFilter);

  function updateDsarStatus(id: string, status: DSARStatus) {
    setDsars(prev => prev.map(d => d.id === id ? { ...d, status, daysLeft: status === "completed" ? null : d.daysLeft } : d));
    setSelectedDsar(prev => prev?.id === id ? { ...prev, status } : prev);
  }

  function createDsar() {
    const today = new Date();
    const due = new Date(today);
    due.setDate(due.getDate() + 30);
    const newId = `DSR-${313 + dsars.length}`;
    setDsars(prev => [...prev, {
      id: newId,
      type: newDsar.type,
      subject: newDsar.subject,
      email: newDsar.email,
      received: today.toISOString().slice(0, 10),
      due: due.toISOString().slice(0, 10),
      status: "new",
      daysLeft: 30,
      notes: newDsar.notes,
    }]);
    setShowNewDsar(false);
    setNewDsar({ subject: "", email: "", type: "Access", notes: "" });
  }

  function createDpia() {
    const newId = `DPIA-${13 + dpias.length}`;
    const today = new Date().toISOString().slice(0, 10);
    setDpias(prev => [...prev, { id: newId, name: newDpia.name, risk: newDpia.risk, status: "draft", owner: "Me", updated: today, description: newDpia.description }]);
    setShowNewDpia(false);
    setNewDpia({ name: "", risk: "Medium", description: "" });
  }

  const openCount = dsars.filter(d => d.status === "in-progress" || d.status === "new").length;
  const overdueCount = dsars.filter(d => d.status === "overdue").length;
  const activeDpias = dpias.filter(d => d.status !== "approved").length;

  return (
    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "rgb(147,197,253)", letterSpacing: "-0.5px", margin: 0 }}>Data Privacy</h1>
          <p style={{ fontSize: 12, color: "#9CA3AF", margin: "4px 0 0", fontWeight: 500 }}>DSPM · RoPA · DPIA/PIA · Consent · DSAR Management</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowNewDsar(true)} style={{ background: "linear-gradient(135deg, #1E3A5F, #065F46)", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, color: "white", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 2px 8px rgba(30,58,95,0.3)" }}>+ New DSAR</button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { label: "Privacy Readiness", value: "78%", color: "#065F46", bg: "rgba(34,197,94,0.08)", border: "#BBF7D0" },
          { label: "Open DSARs",        value: String(openCount),    color: "rgb(147,197,253)", bg: "rgba(59,130,246,0.12)", border: "#BFDBFE" },
          { label: "Overdue DSARs",     value: String(overdueCount), color: "#991B1B", bg: "rgba(239,68,68,0.06)", border: "#FECACA" },
          { label: "Active DPIAs",      value: String(activeDpias),  color: "#4338CA", bg: "#EEF2FF", border: "#C7D2FE" },
        ].map((k) => (
          <div key={k.label} style={{ background: "var(--card)", border: `1px solid ${k.border}`, borderRadius: 12, padding: "14px 16px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: k.color, opacity: 0.7, borderRadius: "12px 12px 0 0" }} />
            <div style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 8 }}>{k.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* DSAR Section */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "rgb(147,197,253)" }}>Data Subject Requests (DSAR)</span>
            <div style={{ display: "flex", gap: 4 }}>
              {(["all", "in-progress", "overdue", "completed"] as const).map(s => (
                <button key={s} onClick={() => setDsarFilter(s)}
                  style={{ padding: "2px 8px", borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: dsarFilter === s ? "1px solid #BFDBFE" : "1px solid var(--border)", background: dsarFilter === s ? "rgba(59,130,246,0.12)" : "transparent", color: dsarFilter === s ? "#1E3A5F" : "#6B7280" }}>
                  {s === "all" ? "All" : s === "in-progress" ? "In Progress" : s.charAt(0).toUpperCase() + s.slice(1)} {s !== "all" && `(${dsars.filter(d => d.status === s).length})`}
                </button>
              ))}
            </div>
          </div>
          <span style={{ fontSize: 11, color: "#9CA3AF" }}>{filteredDsars.length} requests</span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "var(--card)", borderBottom: "1px solid var(--border)" }}>
              {["ID", "Type", "Subject", "Received", "SLA", "Status", "Actions"].map(h => (
                <th key={h} style={{ textAlign: "left", padding: "8px 14px", color: "#9CA3AF", fontWeight: 700, fontSize: 10, letterSpacing: "0.5px", textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredDsars.map((d) => (
              <tr key={d.id}
                style={{ borderBottom: "1px solid var(--border)", cursor: "pointer", background: selectedDsar?.id === d.id ? "rgba(59,130,246,0.06)" : "transparent", transition: "background 0.1s" }}
                onClick={() => setSelectedDsar(selectedDsar?.id === d.id ? null : d)}
                onMouseEnter={e => { if (selectedDsar?.id !== d.id) (e.currentTarget as HTMLTableRowElement).style.background = "var(--secondary)"; }}
                onMouseLeave={e => { if (selectedDsar?.id !== d.id) (e.currentTarget as HTMLTableRowElement).style.background = "transparent"; }}>
                <td style={{ padding: "11px 14px", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#9CA3AF", fontWeight: 600 }}>{d.id}</td>
                <td style={{ padding: "11px 14px" }}>
                  <span style={{ background: "var(--input)", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 7px", fontSize: 10, fontWeight: 700, color: "var(--foreground)" }}>{d.type}</span>
                </td>
                <td style={{ padding: "11px 14px" }}>
                  <div style={{ fontWeight: 600, color: "var(--foreground)" }}>{d.subject}</div>
                  <div style={{ fontSize: 10, color: "#9CA3AF" }}>{d.email}</div>
                </td>
                <td style={{ padding: "11px 14px", fontSize: 11, color: "#9CA3AF" }}>{d.received}</td>
                <td style={{ padding: "11px 14px" }}>
                  <SLABadge daysLeft={d.daysLeft} status={d.status} />
                </td>
                <td style={{ padding: "11px 14px" }}>
                  <span style={{ background: dsarStatus[d.status].bg, border: `1px solid ${dsarStatus[d.status].border}`, color: dsarStatus[d.status].color, borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>
                    {dsarStatus[d.status].label}
                  </span>
                </td>
                <td style={{ padding: "11px 14px" }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: "flex", gap: 4 }}>
                    {d.status !== "in-progress" && d.status !== "completed" && (
                      <button onClick={() => updateDsarStatus(d.id, "in-progress")}
                        style={{ background: "rgba(59,130,246,0.12)", border: "1px solid #BFDBFE", borderRadius: 4, padding: "2px 8px", fontSize: 9, fontWeight: 700, color: "#1E3A5F", cursor: "pointer", fontFamily: "inherit" }}>
                        Start
                      </button>
                    )}
                    {d.status === "in-progress" && (
                      <button onClick={() => updateDsarStatus(d.id, "completed")}
                        style={{ background: "rgba(34,197,94,0.08)", border: "1px solid #A7F3D0", borderRadius: 4, padding: "2px 8px", fontSize: 9, fontWeight: 700, color: "#065F46", cursor: "pointer", fontFamily: "inherit" }}>
                        Complete
                      </button>
                    )}
                    {d.status === "completed" && (
                      <span style={{ fontSize: 10, color: "#9CA3AF" }}>—</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* DSAR Detail + DPIA side by side */}
      <div style={{ display: "grid", gridTemplateColumns: selectedDsar ? "1fr 1fr" : "1fr", gap: 16 }}>
        {/* DSAR Detail Panel */}
        {selectedDsar && (
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#9CA3AF", marginBottom: 6 }}>{selectedDsar.id}</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <span style={{ background: "var(--input)", border: "1px solid var(--border)", borderRadius: 4, padding: "3px 10px", fontSize: 11, fontWeight: 700, color: "var(--foreground)" }}>{selectedDsar.type}</span>
                  <span style={{ background: dsarStatus[selectedDsar.status].bg, border: `1px solid ${dsarStatus[selectedDsar.status].border}`, color: dsarStatus[selectedDsar.status].color, borderRadius: 4, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>{dsarStatus[selectedDsar.status].label}</span>
                </div>
              </div>
              <button onClick={() => setSelectedDsar(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 18 }}>×</button>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "rgb(147,197,253)", marginBottom: 4 }}>{selectedDsar.subject}</div>
              <div style={{ fontSize: 12, color: "#9CA3AF" }}>{selectedDsar.email}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, background: "var(--input)", borderRadius: 8, padding: "12px 14px" }}>
              {[
                ["Received", selectedDsar.received],
                ["Due Date", selectedDsar.due],
                ["Days Left", selectedDsar.daysLeft !== null ? `${selectedDsar.daysLeft > 0 ? selectedDsar.daysLeft + " days" : Math.abs(selectedDsar.daysLeft) + " days overdue"}` : "N/A"],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 600 }}>{k}</span>
                  <span style={{ fontSize: 11, color: k === "Days Left" && selectedDsar.status === "overdue" ? "#DC2626" : "var(--foreground)", fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>Workflow</div>
              <div style={{ display: "flex", gap: 6 }}>
                {(["new", "in-progress", "completed"] as const).map(s => (
                  <button key={s} onClick={() => updateDsarStatus(selectedDsar.id, s)}
                    style={{ flex: 1, background: selectedDsar.status === s ? dsarStatus[s].bg : "var(--input)", border: `1px solid ${selectedDsar.status === s ? dsarStatus[s].border : "var(--border)"}`, borderRadius: 6, padding: "7px 6px", fontSize: 10, fontWeight: 700, color: selectedDsar.status === s ? dsarStatus[s].color : "#6B7280", cursor: "pointer", fontFamily: "inherit" }}>
                    {dsarStatus[s].label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ flex: 1, background: "linear-gradient(135deg, #1E3A5F, #065F46)", border: "none", borderRadius: 8, padding: "8px", fontSize: 12, fontWeight: 700, color: "white", cursor: "pointer", fontFamily: "inherit" }}>Send Response</button>
              <button style={{ flex: 1, background: "var(--input)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px", fontSize: 12, fontWeight: 700, color: "var(--foreground)", cursor: "pointer", fontFamily: "inherit" }}>Export Record</button>
            </div>
          </div>
        )}

        {/* DPIAs */}
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "rgb(147,197,253)" }}>DPIAs / Privacy Impact Assessments</span>
            <button onClick={() => setShowNewDpia(true)} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", fontSize: 11, color: "rgb(147,197,253)", fontWeight: 700, fontFamily: "inherit", padding: "4px 10px" }}>+ New DPIA</button>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "var(--card)", borderBottom: "1px solid var(--border)" }}>
                {["ID", "Assessment", "Risk", "Status", "Owner", "Updated"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 14px", color: "#9CA3AF", fontWeight: 700, fontSize: 10, letterSpacing: "0.5px", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dpias.map((d) => (
                <tr key={d.id} onClick={() => setSelectedDpia(selectedDpia?.id === d.id ? null : d)}
                  style={{ borderBottom: "1px solid var(--border)", cursor: "pointer", background: selectedDpia?.id === d.id ? "rgba(59,130,246,0.06)" : "transparent" }}
                  onMouseEnter={e => { if (selectedDpia?.id !== d.id) (e.currentTarget as HTMLTableRowElement).style.background = "var(--secondary)"; }}
                  onMouseLeave={e => { if (selectedDpia?.id !== d.id) (e.currentTarget as HTMLTableRowElement).style.background = "transparent"; }}>
                  <td style={{ padding: "10px 14px", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#9CA3AF", fontWeight: 600 }}>{d.id}</td>
                  <td style={{ padding: "10px 14px", color: "var(--foreground)", fontWeight: 500, maxWidth: 180 }}>
                    <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.name}</div>
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{ background: riskStyle[d.risk].bg, border: `1px solid ${riskStyle[d.risk].border}`, color: riskStyle[d.risk].color, borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{d.risk}</span>
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{ background: dpiaStatus[d.status].bg, border: `1px solid ${dpiaStatus[d.status].border}`, color: dpiaStatus[d.status].color, borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>
                      {dpiaStatus[d.status].label}
                    </span>
                  </td>
                  <td style={{ padding: "10px 14px" }}><span className="owner-capsule">{d.owner}</span></td>
                  <td style={{ padding: "10px 14px", fontSize: 10, color: "#9CA3AF" }}>{d.updated}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {selectedDpia && (
            <div style={{ padding: "16px 20px", borderTop: "1px solid var(--border)", background: "rgba(59,130,246,0.04)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "rgb(147,197,253)" }}>{selectedDpia.name}</div>
                <button onClick={() => setSelectedDpia(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 16 }}>×</button>
              </div>
              <p style={{ fontSize: 11, color: "#6B7280", lineHeight: 1.6, margin: "0 0 10px" }}>{selectedDpia.description}</p>
              <div style={{ display: "flex", gap: 6 }}>
                {(["draft", "in-review", "approved"] as const).map(s => (
                  <button key={s} onClick={() => setDpias(prev => prev.map(d => d.id === selectedDpia.id ? { ...d, status: s } : d))}
                    style={{ flex: 1, background: selectedDpia.status === s ? dpiaStatus[s].bg : "var(--input)", border: `1px solid ${selectedDpia.status === s ? dpiaStatus[s].border : "var(--border)"}`, borderRadius: 6, padding: "6px", fontSize: 10, fontWeight: 700, color: selectedDpia.status === s ? dpiaStatus[s].color : "#6B7280", cursor: "pointer", fontFamily: "inherit" }}>
                    {dpiaStatus[s].label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New DSAR Modal */}
      {showNewDsar && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={e => { if (e.target === e.currentTarget) setShowNewDsar(false); }}>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, width: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}>
            <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "rgb(147,197,253)" }}>New Data Subject Request</div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>30-day response window starts on submission</div>
              </div>
              <button onClick={() => setShowNewDsar(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 18 }}>×</button>
            </div>
            <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", display: "block", marginBottom: 5 }}>Data Subject Name *</label>
                  <input value={newDsar.subject} onChange={e => setNewDsar(p => ({ ...p, subject: e.target.value }))} placeholder="Full name"
                    style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", fontSize: 12, fontFamily: "inherit", background: "var(--input)", color: "var(--foreground)", outline: "none", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", display: "block", marginBottom: 5 }}>Request Type</label>
                  <select value={newDsar.type} onChange={e => setNewDsar(p => ({ ...p, type: e.target.value }))}
                    style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 10px", fontSize: 12, fontFamily: "inherit", background: "var(--input)", color: "var(--foreground)", cursor: "pointer" }}>
                    {DSAR_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", display: "block", marginBottom: 5 }}>Email Address *</label>
                <input value={newDsar.email} onChange={e => setNewDsar(p => ({ ...p, email: e.target.value }))} placeholder="subject@example.com" type="email"
                  style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", fontSize: 12, fontFamily: "inherit", background: "var(--input)", color: "var(--foreground)", outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", display: "block", marginBottom: 5 }}>Notes (optional)</label>
                <textarea value={newDsar.notes} onChange={e => setNewDsar(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Additional context..."
                  style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", fontSize: 12, fontFamily: "inherit", background: "var(--input)", color: "var(--foreground)", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
              </div>
              <div style={{ background: "rgba(59,130,246,0.06)", border: "1px solid #BFDBFE", borderRadius: 8, padding: "10px 12px", fontSize: 11, color: "#1E3A5F" }}>
                📅 Due date will be set to <strong>{new Date(Date.now() + 30 * 86400000).toLocaleDateString()}</strong> (30-day GDPR window)
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={createDsar} disabled={!newDsar.subject || !newDsar.email}
                  style={{ flex: 1, background: "linear-gradient(135deg, #1E3A5F, #065F46)", border: "none", borderRadius: 8, padding: "10px", fontSize: 12, fontWeight: 700, color: "white", cursor: newDsar.subject && newDsar.email ? "pointer" : "not-allowed", opacity: newDsar.subject && newDsar.email ? 1 : 0.5, fontFamily: "inherit" }}>
                  Create DSAR
                </button>
                <button onClick={() => setShowNewDsar(false)} style={{ padding: "10px 20px", border: "1px solid var(--border)", background: "var(--input)", borderRadius: 8, fontSize: 12, fontWeight: 700, color: "#6B7280", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New DPIA Modal */}
      {showNewDpia && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={e => { if (e.target === e.currentTarget) setShowNewDpia(false); }}>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, width: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}>
            <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "rgb(147,197,253)" }}>New DPIA / Privacy Impact Assessment</div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>Required for high-risk data processing activities</div>
              </div>
              <button onClick={() => setShowNewDpia(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 18 }}>×</button>
            </div>
            <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", display: "block", marginBottom: 5 }}>Assessment Name *</label>
                <input value={newDpia.name} onChange={e => setNewDpia(p => ({ ...p, name: e.target.value }))} placeholder="e.g. New Payment Processing System"
                  style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", fontSize: 12, fontFamily: "inherit", background: "var(--input)", color: "var(--foreground)", outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", display: "block", marginBottom: 5 }}>Risk Level</label>
                <select value={newDpia.risk} onChange={e => setNewDpia(p => ({ ...p, risk: e.target.value }))}
                  style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 10px", fontSize: 12, fontFamily: "inherit", background: "var(--input)", color: "var(--foreground)", cursor: "pointer" }}>
                  <option>High</option>
                  <option>Medium</option>
                  <option>Low</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", display: "block", marginBottom: 5 }}>Description</label>
                <textarea value={newDpia.description} onChange={e => setNewDpia(p => ({ ...p, description: e.target.value }))} rows={3} placeholder="Describe the processing activity..."
                  style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", fontSize: 12, fontFamily: "inherit", background: "var(--input)", color: "var(--foreground)", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={createDpia} disabled={!newDpia.name}
                  style={{ flex: 1, background: "linear-gradient(135deg, #1E3A5F, #065F46)", border: "none", borderRadius: 8, padding: "10px", fontSize: 12, fontWeight: 700, color: "white", cursor: newDpia.name ? "pointer" : "not-allowed", opacity: newDpia.name ? 1 : 0.5, fontFamily: "inherit" }}>
                  Create DPIA
                </button>
                <button onClick={() => setShowNewDpia(false)} style={{ padding: "10px 20px", border: "1px solid var(--border)", background: "var(--input)", borderRadius: 8, fontSize: 12, fontWeight: 700, color: "#6B7280", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
