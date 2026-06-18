import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "").replace("/grc-platform", "");
const api = (p: string) => `${BASE}/api${p}`;

interface Question {
  id: string; number: string; category: string;
  question: string; answer: string;
  status: "unanswered" | "ai-draft" | "reviewed";
}

interface Questionnaire {
  id: string; name: string; type: string; recipient: string;
  status: string; dueDate: string; progress: number;
  questionCount: number; questions?: Question[];
}

const D = {
  bg: "var(--background)", card: "var(--card)", border: "var(--border)",
  text: "var(--foreground)", muted: "rgb(148,163,184)",
  accent: "rgb(147,197,253)", green: "rgb(52,211,153)",
  amber: "rgb(251,191,36)", red: "rgb(248,113,113)",
};

const BLU = "#3B82F6", EME = "#059669", AMB = "#D97706";

const statusColor = (s: string) =>
  s === "completed" ? EME : s === "in-progress" ? BLU : s === "sent" ? "#8B5CF6" : "var(--muted-foreground)";

const qStatusColor = (s: string) =>
  s === "reviewed" ? EME : s === "ai-draft" ? BLU : "var(--muted-foreground)";

const qStatusLabel = (s: string) =>
  s === "reviewed" ? "✓ Reviewed" : s === "ai-draft" ? "AI Draft" : "Unanswered";

function ProgressBar({ pct, color = BLU }: { pct: number; color?: string }) {
  return (
    <div style={{ height: 6, background: "var(--secondary)", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.min(100, pct)}%`, background: pct >= 80 ? EME : pct >= 40 ? color : AMB, borderRadius: 3, transition: "width 0.3s" }} />
    </div>
  );
}

export default function VendorPortal() {
  const { user } = useAuth();
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([]);
  const [selected, setSelected] = useState<(Questionnaire & { questions: Question[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editAnswers, setEditAnswers] = useState<Record<string, string>>({});
  const [catFilter, setCatFilter] = useState("All");

  const token = localStorage.getItem("grc_token");
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };

  const vendorName = user?.email?.split("@")[0] ?? "Vendor";
  const vendorCompany = user?.email?.split("@")[1]?.split(".")[0] ?? "Your Company";

  useEffect(() => {
    setLoading(true);
    fetch(api("/questionnaires"), { headers })
      .then(r => r.json())
      .then((qs: any[]) => {
        const list = Array.isArray(qs) ? qs : [];
        const mine = list.filter((q: any) =>
          q.recipient && (
            q.recipient.toLowerCase().includes(vendorName.toLowerCase()) ||
            q.recipient.toLowerCase().includes((user?.email ?? "").toLowerCase())
          )
        );
        setQuestionnaires(mine.length > 0 ? mine : list.filter((q: any) => q.status === "sent" || q.status === "in-progress").slice(0, 3));
      })
      .catch(() => setQuestionnaires([]))
      .finally(() => setLoading(false));
  }, []);

  async function openQuestionnaire(q: Questionnaire) {
    const full = await fetch(api(`/questionnaires/${q.id}`), { headers }).then(r => r.json());
    const qs: Question[] = full.questions ?? [];
    setSelected({ ...full, questions: qs });
    setCatFilter("All");
    const answers: Record<string, string> = {};
    qs.forEach((q: Question) => { answers[q.id] = q.answer ?? ""; });
    setEditAnswers(answers);
  }

  async function saveAnswer(questionId: string) {
    if (!selected) return;
    setSaving(questionId);
    const answer = editAnswers[questionId] ?? "";
    try {
      await fetch(api(`/questionnaires/${selected.id}/questions/${questionId}`), {
        method: "PATCH", headers,
        body: JSON.stringify({ answer, status: answer.trim() ? "reviewed" : "unanswered" }),
      });
      setSelected(prev => {
        if (!prev) return prev;
        const updated = (prev.questions ?? []).map(q =>
          q.id === questionId ? { ...q, answer, status: (answer.trim() ? "reviewed" : "unanswered") as Question["status"] } : q
        );
        const reviewed = updated.filter(q => q.status !== "unanswered").length;
        return { ...prev, questions: updated, progress: Math.round((reviewed / Math.max(updated.length, 1)) * 100) };
      });
    } catch (_) {}
    setSaving(null);
  }

  async function submitQuestionnaire() {
    if (!selected) return;
    await fetch(api(`/questionnaires/${selected.id}`), {
      method: "PATCH", headers,
      body: JSON.stringify({ status: "completed" }),
    });
    setSelected(prev => prev ? { ...prev, status: "completed" } : prev);
    setQuestionnaires(prev => prev.map(q => q.id === selected.id ? { ...q, status: "completed" } : q));
  }

  const profileInfo = [
    { label: "Vendor Contact", value: user?.email ?? "—" },
    { label: "Organisation",   value: vendorCompany },
    { label: "Role",           value: "Vendor / Third-Party" },
    { label: "Portal Access",  value: "Active" },
  ];

  // ── Questionnaire detail view ─────────────────────────────────────────────
  if (selected) {
    const qs = selected.questions ?? [];
    const cats = ["All", ...Array.from(new Set(qs.map(q => q.category)))];
    const filtered = catFilter === "All" ? qs : qs.filter(q => q.category === catFilter);
    const reviewed = qs.filter(q => q.status !== "unanswered").length;
    const progress = Math.round((reviewed / Math.max(qs.length, 1)) * 100);

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: D.bg }}>
        <div style={{ padding: "16px 24px", borderBottom: `1px solid ${D.border}`, display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <button onClick={() => setSelected(null)} style={{ background: "var(--secondary)", border: `1px solid ${D.border}`, borderRadius: 6, padding: "5px 12px", fontSize: 12, color: D.muted, cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: D.text }}>{selected.name}</div>
            <div style={{ fontSize: 11, color: D.muted }}>{selected.type} · Due {selected.dueDate}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: D.muted }}>{reviewed}/{qs.length} answered · {progress}%</span>
            <div style={{ width: 80 }}><ProgressBar pct={progress} /></div>
            {selected.status !== "completed" ? (
              <button onClick={submitQuestionnaire} style={{ background: EME, border: "none", borderRadius: 6, padding: "7px 16px", fontSize: 12, fontWeight: 700, color: "white", cursor: "pointer", fontFamily: "inherit" }}>
                Submit
              </button>
            ) : (
              <span style={{ background: "rgba(5,150,105,0.12)", color: EME, border: "1px solid rgba(5,150,105,0.25)", borderRadius: 6, padding: "5px 12px", fontSize: 11, fontWeight: 700 }}>✓ Submitted</span>
            )}
          </div>
        </div>

        <div style={{ padding: "10px 24px", borderBottom: `1px solid ${D.border}`, display: "flex", gap: 6, flexWrap: "wrap", flexShrink: 0 }}>
          {cats.map(c => (
            <button key={c} onClick={() => setCatFilter(c)} style={{ background: catFilter === c ? "rgba(147,197,253,0.15)" : "var(--secondary)", border: `1px solid ${catFilter === c ? "rgba(147,197,253,0.35)" : D.border}`, borderRadius: 5, padding: "4px 10px", fontSize: 11, color: catFilter === c ? D.accent : D.muted, cursor: "pointer", fontFamily: "inherit", fontWeight: catFilter === c ? 700 : 400 }}>
              {c}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map(q => (
            <div key={q.id} style={{ background: D.card, border: `1px solid ${q.status !== "unanswered" ? "rgba(52,211,153,0.25)" : D.border}`, borderRadius: 10, padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: D.muted, minWidth: 40, paddingTop: 3, flexShrink: 0 }}>{q.number}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                    <span style={{ background: "var(--secondary)", border: `1px solid ${D.border}`, borderRadius: 4, padding: "2px 7px", fontSize: 9, fontWeight: 700, color: D.muted }}>{q.category}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: qStatusColor(q.status) }}>{qStatusLabel(q.status)}</span>
                  </div>
                  <div style={{ fontSize: 13, color: D.text, lineHeight: 1.6, marginBottom: 10 }}>{q.question}</div>
                  <textarea
                    value={editAnswers[q.id] ?? ""}
                    onChange={e => setEditAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                    placeholder="Enter your answer here…"
                    rows={3}
                    disabled={selected.status === "completed"}
                    style={{ width: "100%", background: "var(--secondary)", border: `1px solid ${D.border}`, borderRadius: 6, padding: "8px 10px", fontSize: 12, color: D.text, fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box", opacity: selected.status === "completed" ? 0.6 : 1 }}
                  />
                  {selected.status !== "completed" && (
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8, gap: 8 }}>
                      {saving === q.id && <span style={{ fontSize: 11, color: D.muted, alignSelf: "center" }}>Saving…</span>}
                      <button onClick={() => saveAnswer(q.id)} disabled={saving === q.id} style={{ background: "rgba(147,197,253,0.12)", border: "1px solid rgba(147,197,253,0.25)", borderRadius: 5, padding: "5px 14px", fontSize: 11, fontWeight: 700, color: D.accent, cursor: "pointer", fontFamily: "inherit", opacity: saving === q.id ? 0.6 : 1 }}>
                        Save
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ textAlign: "center" as const, color: D.muted, padding: "40px 0", fontSize: 13 }}>No questions in this category.</div>
          )}
        </div>
      </div>
    );
  }

  // ── Portal landing ────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: D.bg, overflow: "auto" }}>
      <div style={{ padding: "20px 24px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: "rgba(147,197,253,0.12)", border: "1px solid rgba(147,197,253,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🏢</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: D.text }}>Vendor Portal</div>
            <div style={{ fontSize: 12, color: D.muted }}>Welcome, {vendorName} · {vendorCompany}</div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, padding: "0 24px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 16 }}>
          <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 12, padding: "18px 20px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: D.accent, marginBottom: 14 }}>Vendor Profile</div>
            {profileInfo.map((row, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: i < profileInfo.length - 1 ? `1px solid ${D.border}` : "none", fontSize: 12 }}>
                <span style={{ color: D.muted }}>{row.label}</span>
                <span style={{ color: D.text, fontWeight: 600 }}>{row.value}</span>
              </div>
            ))}
            <div style={{ marginTop: 14, padding: "10px 12px", background: "rgba(52,211,153,0.06)", borderRadius: 8, border: "1px solid rgba(52,211,153,0.2)", fontSize: 11, color: D.muted, lineHeight: 1.6 }}>
              ✅ Your vendor profile is active. Contact your account manager to update company details.
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { label: "Assigned Questionnaires", value: questionnaires.length,                                                                         color: BLU, bg: "rgba(59,130,246,0.08)",   border: "#BFDBFE" },
              { label: "Completed",               value: questionnaires.filter(q => q.status === "completed").length,                                   color: EME, bg: "rgba(5,150,105,0.08)",    border: "#A7F3D0" },
              { label: "In Progress",             value: questionnaires.filter(q => q.status === "in-progress" || q.status === "sent").length,          color: AMB, bg: "rgba(217,119,6,0.06)",    border: "#FDE68A" },
            ].map(k => (
              <div key={k.label} style={{ background: D.card, border: `1px solid ${k.border}`, borderRadius: 10, padding: "14px 18px", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: k.color, borderRadius: "10px 10px 0 0" }} />
                <div style={{ fontSize: 10, fontWeight: 700, color: D.muted, textTransform: "uppercase" as const, letterSpacing: "0.5px", marginBottom: 4 }}>{k.label}</div>
                <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 12, padding: "18px 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: D.accent, marginBottom: 14 }}>📋 My Questionnaires</div>
          {loading ? (
            <div style={{ fontSize: 12, color: D.muted, padding: "20px 0", textAlign: "center" as const }}>Loading questionnaires…</div>
          ) : questionnaires.length === 0 ? (
            <div style={{ fontSize: 12, color: D.muted, padding: "20px 0", textAlign: "center" as const }}>No questionnaires assigned yet. Your account manager will notify you when one is ready.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {questionnaires.map(q => {
                const sc = statusColor(q.status);
                const progress = q.progress ?? 0;
                return (
                  <div key={q.id} onClick={() => openQuestionnaire(q)} style={{ border: `1px solid ${D.border}`, borderRadius: 10, padding: "14px 16px", cursor: "pointer" }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(147,197,253,0.4)")}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = D.border)}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: D.accent }}>{q.name}</span>
                          <span style={{ background: `${sc}18`, color: sc, border: `1px solid ${sc}33`, borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{q.status.replace("-", " ").toUpperCase()}</span>
                        </div>
                        <div style={{ display: "flex", gap: 16, fontSize: 11, color: D.muted, marginBottom: 10 }}>
                          <span>Type: <strong style={{ color: D.text }}>{q.type}</strong></span>
                          <span>Due: <strong style={{ color: D.text }}>{q.dueDate}</strong></span>
                          <span>Questions: <strong style={{ color: D.text }}>{q.questionCount}</strong></span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ flex: 1, maxWidth: 200 }}><ProgressBar pct={progress} /></div>
                          <span style={{ fontSize: 11, color: progress >= 80 ? EME : D.muted, fontWeight: 600 }}>{progress}% complete</span>
                        </div>
                      </div>
                      <button style={{ background: "rgba(147,197,253,0.1)", border: "1px solid rgba(147,197,253,0.25)", borderRadius: 6, padding: "6px 14px", fontSize: 11, fontWeight: 700, color: D.accent, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                        {q.status === "completed" ? "View" : "Open →"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ background: "rgba(147,197,253,0.04)", border: "1px solid rgba(147,197,253,0.15)", borderRadius: 10, padding: "14px 18px", fontSize: 12, color: D.muted, lineHeight: 1.7 }}>
          <span style={{ fontWeight: 700, color: D.accent }}>Need help?</span> Contact your account manager or email <span style={{ color: D.accent, fontFamily: "'JetBrains Mono',monospace" }}>vendor-support@aigo-x.com</span>. Response within 1 business day.
        </div>
      </div>
    </div>
  );
}
