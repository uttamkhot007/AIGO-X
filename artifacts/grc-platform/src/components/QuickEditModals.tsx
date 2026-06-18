import React, { useState, useEffect } from "react";

const NAV = "#93C5FD";
const EME = "#34D399";
const AMB = "#FCD34D";
const RED = "#F87171";

const tok = () => localStorage.getItem("grc_token") ?? "";
const H = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${tok()}` });

function objUrl(type: string, id: string | number): string {
  const map: Record<string, string> = {
    policy:    `/api/governance/policies/${id}`,
    process:   `/api/governance/processes/${id}`,
    procedure: `/api/governance/procedures/${id}`,
    control:   `/api/governance/controls/${id}`,
    risk:      `/api/risks/${id}`,
    vendor:    `/api/risks/vendors/${id}`,
  };
  return map[type] ?? `/api/${type}s/${id}`;
}
function objMethod(type: string) { return type === "vendor" ? "PUT" : "PATCH"; }

const ovl: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)",
  zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
};
const card: React.CSSProperties = {
  background: "var(--card)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14,
  padding: "28px 28px 24px", width: 480, maxWidth: "calc(100vw - 40px)",
  maxHeight: "80vh", display: "flex", flexDirection: "column",
  boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
};
const inp: React.CSSProperties = {
  width: "100%", background: "var(--input)", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 8, color: "var(--foreground)", fontSize: 13, padding: "9px 12px",
  fontFamily: "inherit", outline: "none", boxSizing: "border-box",
};
const lbl: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", marginBottom: 4, display: "block",
};
const cancelBtn: React.CSSProperties = {
  flex: 1, padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)",
  background: "var(--secondary)", color: "var(--muted-foreground)", fontSize: 13,
  fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
};

const SEV = [
  { label: "Critical",      bg: "rgba(127,29,29,0.45)",  color: RED,      border: "rgba(252,165,165,0.3)" },
  { label: "High",          bg: "rgba(120,53,15,0.45)",  color: AMB,      border: "rgba(253,230,138,0.3)" },
  { label: "Medium",        bg: "rgba(120,53,15,0.25)",  color: "#FBBF24", border: "rgba(253,230,138,0.2)" },
  { label: "Low",           bg: "rgba(6,78,59,0.35)",    color: EME,      border: "rgba(167,243,208,0.3)" },
  { label: "Informational", bg: "rgba(37,99,235,0.15)",  color: NAV,      border: "rgba(147,197,253,0.3)" },
];
const SEV_SCORE: Record<string, number> = { Critical: 90, High: 70, Medium: 50, Low: 25, Informational: 10 };

function TypeLabel(type: string) { return type.charAt(0).toUpperCase() + type.slice(1); }

// ── OwnerPickerModal ──────────────────────────────────────────────────────────
interface OwnerPickerProps {
  open: boolean;
  objectType: string;
  objectId: string | number;
  objectName: string;
  currentOwner?: string;
  onClose: () => void;
  onSaved: (newOwner: string) => void;
}

export function OwnerPickerModal({ open, objectType, objectId, objectName, currentOwner, onClose, onSaved }: OwnerPickerProps) {
  const [users, setUsers] = useState<{ id: number; name: string; email: string; role: string }[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setSelected(currentOwner ?? "");
    setSearch("");
    setErr("");
    fetch("/api/users", { headers: H() })
      .then(r => r.json())
      .then(d => Array.isArray(d) && setUsers(d))
      .catch(() => setErr("Could not load users"));
  }, [open]);

  const filtered = users.filter(u =>
    [u.name, u.email, u.role ?? ""].some(s => s.toLowerCase().includes(search.toLowerCase()))
  );

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    setErr("");
    try {
      const body: Record<string, string> = { owner: selected };
      if (objectType === "risk") body["ownerFull"] = selected;
      const res = await fetch(objUrl(objectType, objectId), {
        method: objMethod(objectType), headers: H(), body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Save failed");
      onSaved(selected);
      onClose();
    } catch { setErr("Failed to save — please try again."); }
    finally { setSaving(false); }
  };

  if (!open) return null;
  const initials = (name: string) => name.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div style={ovl} onClick={onClose}>
      <div style={card} onClick={e => e.stopPropagation()}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--foreground)", marginBottom: 3 }}>Assign Owner</div>
          <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{TypeLabel(objectType)}: <span style={{ color: NAV }}>{objectName}</span></div>
        </div>
        <input style={{ ...inp, marginBottom: 12 }} placeholder="Search by name, email or role…" value={search} onChange={e => setSearch(e.target.value)} autoFocus />
        {err && <div style={{ fontSize: 11, color: RED, marginBottom: 8 }}>{err}</div>}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 5, marginBottom: 16, maxHeight: 320 }}>
          {filtered.length === 0 && <div style={{ fontSize: 12, color: "var(--muted-foreground)", textAlign: "center", padding: "24px 0" }}>No users found</div>}
          {filtered.map(u => {
            const isSel = selected === u.name;
            return (
              <div key={u.id} onClick={() => setSelected(u.name)} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                borderRadius: 10, cursor: "pointer",
                background: isSel ? "rgba(59,130,246,0.15)" : "var(--secondary)",
                border: `1px solid ${isSel ? "rgba(147,197,253,0.4)" : "rgba(255,255,255,0.06)"}`,
                transition: "all 0.12s",
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                  background: isSel ? "rgba(59,130,246,0.35)" : "rgba(99,102,241,0.25)",
                  border: `2px solid ${isSel ? NAV : "transparent"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: 700, color: isSel ? NAV : "var(--muted-foreground)",
                }}>{initials(u.name || u.email)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", marginBottom: 1 }}>{u.name || "—"}</div>
                  <div style={{ fontSize: 11, color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email} · {u.role}</div>
                </div>
                {isSel && <div style={{ width: 18, height: 18, borderRadius: "50%", background: NAV, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#1E3A5F", flexShrink: 0 }}>✓</div>}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={cancelBtn}>Cancel</button>
          <button onClick={save} disabled={!selected || saving} style={{
            flex: 2, padding: "10px", borderRadius: 8, border: "none", fontFamily: "inherit",
            background: !selected || saving ? "rgba(37,99,235,0.25)" : "linear-gradient(135deg,#1D4ED8,#2563EB)",
            color: !selected || saving ? "rgba(147,197,253,0.5)" : "white",
            fontSize: 13, fontWeight: 700, cursor: !selected || saving ? "not-allowed" : "pointer",
          }}>{saving ? "Saving…" : "Assign Owner"}</button>
        </div>
      </div>
    </div>
  );
}

// ── RiskLevelModal ────────────────────────────────────────────────────────────
interface RiskLevelProps {
  open: boolean;
  objectType: string;
  objectId: string | number;
  objectName: string;
  currentLevel?: string;
  fieldName?: string;
  onClose: () => void;
  onSaved: (newLevel: string) => void;
}

export function RiskLevelModal({ open, objectType, objectId, objectName, currentLevel, fieldName = "severity", onClose, onSaved }: RiskLevelProps) {
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { if (open) { setSelected(currentLevel ?? ""); setErr(""); } }, [open]);

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    setErr("");
    try {
      const body: Record<string, unknown> = { [fieldName]: selected };
      if (objectType === "risk" && fieldName === "severity") body["score"] = SEV_SCORE[selected] ?? 50;
      const res = await fetch(objUrl(objectType, objectId), {
        method: objMethod(objectType), headers: H(), body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Save failed");
      onSaved(selected);
      onClose();
    } catch { setErr("Failed to save — please try again."); }
    finally { setSaving(false); }
  };

  if (!open) return null;
  const fieldLabel = fieldName === "impact" ? "Impact Level" : fieldName === "riskTier" ? "Risk Tier" : "Risk Severity";

  return (
    <div style={ovl} onClick={onClose}>
      <div style={{ ...card, width: 420 }} onClick={e => e.stopPropagation()}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--foreground)", marginBottom: 3 }}>Change {fieldLabel}</div>
          <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{TypeLabel(objectType)}: <span style={{ color: NAV }}>{objectName}</span></div>
        </div>
        {err && <div style={{ fontSize: 11, color: RED, marginBottom: 8 }}>{err}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 20 }}>
          {SEV.map(s => {
            const isSel = selected === s.label;
            return (
              <div key={s.label} onClick={() => setSelected(s.label)} style={{
                display: "flex", alignItems: "center", gap: 14, padding: "11px 16px",
                borderRadius: 10, cursor: "pointer",
                background: isSel ? s.bg : "var(--secondary)",
                border: `1px solid ${isSel ? s.border : "rgba(255,255,255,0.06)"}`,
                transition: "all 0.12s",
              }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: isSel ? 700 : 500, color: isSel ? s.color : "var(--muted-foreground)", flex: 1 }}>{s.label}</span>
                {isSel && <div style={{ width: 18, height: 18, borderRadius: "50%", background: s.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#111", flexShrink: 0 }}>✓</div>}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={cancelBtn}>Cancel</button>
          <button onClick={save} disabled={!selected || saving} style={{
            flex: 2, padding: "10px", borderRadius: 8, border: "none", fontFamily: "inherit",
            background: !selected || saving ? "rgba(127,29,29,0.25)" : "linear-gradient(135deg,#7F1D1D,#991B1B)",
            color: !selected || saving ? "rgba(248,113,113,0.5)" : "white",
            fontSize: 13, fontWeight: 700, cursor: !selected || saving ? "not-allowed" : "pointer",
          }}>{saving ? "Saving…" : `Set ${fieldLabel}`}</button>
        </div>
      </div>
    </div>
  );
}

// ── EvidenceUploadModal ───────────────────────────────────────────────────────
interface EvidenceProps {
  open: boolean;
  objectType: string;
  objectId: string;
  objectName: string;
  onClose: () => void;
  onSaved: () => void;
}

const EVIDENCE_TYPES = ["Document", "Screenshot", "Log", "Configuration", "Test Result", "Policy", "Attestation", "Other"];

export function EvidenceUploadModal({ open, objectType, objectId, objectName, onClose, onSaved }: EvidenceProps) {
  const [form, setForm] = useState({ title: "", evidenceType: "Document", description: "", referenceUrl: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");
  const ef = (f: string, v: string) => setForm(prev => ({ ...prev, [f]: v }));

  useEffect(() => {
    if (open) { setForm({ title: "", evidenceType: "Document", description: "", referenceUrl: "" }); setSaved(false); setErr(""); }
  }, [open]);

  const submit = async () => {
    if (!form.title.trim()) return;
    setSaving(true); setErr("");
    try {
      const res = await fetch("/api/evidence/objects", {
        method: "POST", headers: H(),
        body: JSON.stringify({ objectType, objectId, objectName, ...form }),
      });
      if (!res.ok) throw new Error("Save failed");
      setSaved(true);
      setTimeout(() => { onSaved(); onClose(); }, 1400);
    } catch { setErr("Failed to record evidence — please try again."); }
    finally { setSaving(false); }
  };

  if (!open) return null;

  if (saved) return (
    <div style={ovl}>
      <div style={{ ...card, width: 360, alignItems: "center", textAlign: "center", gap: 14 }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(52,211,153,0.12)", border: "2px solid rgba(52,211,153,0.35)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, color: EME }}>✓</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: EME }}>Evidence Recorded</div>
        <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>"{form.title}" has been attached to this {objectType}.</div>
      </div>
    </div>
  );

  return (
    <div style={ovl} onClick={onClose}>
      <div style={card} onClick={e => e.stopPropagation()}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--foreground)", marginBottom: 3 }}>Upload Evidence</div>
          <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{TypeLabel(objectType)}: <span style={{ color: NAV }}>{objectName}</span></div>
        </div>
        {err && <div style={{ fontSize: 11, color: RED, marginBottom: 8 }}>{err}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 13, marginBottom: 20 }}>
          <div><label style={lbl}>Title *</label><input style={inp} value={form.title} onChange={e => ef("title", e.target.value)} placeholder="e.g. Q1 Security Audit Report" autoFocus /></div>
          <div>
            <label style={lbl}>Evidence Type</label>
            <select style={inp} value={form.evidenceType} onChange={e => ef("evidenceType", e.target.value)}>
              {EVIDENCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div><label style={lbl}>Description</label><textarea style={{ ...inp, minHeight: 68, resize: "vertical" as const }} value={form.description} onChange={e => ef("description", e.target.value)} placeholder="What does this evidence demonstrate?" /></div>
          <div><label style={lbl}>Reference URL or File Path</label><input style={inp} value={form.referenceUrl} onChange={e => ef("referenceUrl", e.target.value)} placeholder="https://… or /path/to/file.pdf" /></div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={cancelBtn}>Cancel</button>
          <button onClick={submit} disabled={!form.title.trim() || saving} style={{
            flex: 2, padding: "10px", borderRadius: 8, border: "none", fontFamily: "inherit",
            background: !form.title.trim() || saving ? "rgba(6,78,59,0.25)" : "linear-gradient(135deg,#065F46,#059669)",
            color: !form.title.trim() || saving ? "rgba(52,211,153,0.5)" : "white",
            fontSize: 13, fontWeight: 700, cursor: !form.title.trim() || saving ? "not-allowed" : "pointer",
          }}>{saving ? "Saving…" : "Record Evidence"}</button>
        </div>
      </div>
    </div>
  );
}
