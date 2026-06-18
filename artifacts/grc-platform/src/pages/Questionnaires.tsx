import React, { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "").replace("/grc-platform", "");
const api = (p: string) => `${BASE}/api${p}`;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Question {
  id: string; number: string; category: string;
  question: string; answer: string;
  status: "unanswered" | "ai-draft" | "reviewed";
  confidence?: number | null; // AI confidence 0.0–1.0; null for manual answers
  answerSource?: "manual" | "ai-draft";
  source?: string;
}

interface Questionnaire {
  id: string; name: string; type: string; recipient: string;
  status: "draft" | "in_review" | "completed" | "sent";
  dueDate: string; createdAt: string; updatedAt: string;
  questionCount: number; progress: number;
  questions?: Question[];
}

interface Template {
  name: string; questionCount: number; categories: string[]; description: string;
}

// ── Palette ───────────────────────────────────────────────────────────────────

const BLU = "#3B82F6", EME = "#059669", AMB = "#D97706", RED = "#DC2626";

const statusColor = (s: string) =>
  s === "reviewed" ? EME : s === "ai-draft" ? BLU : "var(--muted-foreground)";
const statusLabel = (s: string) =>
  s === "reviewed" ? "Reviewed" : s === "ai-draft" ? "AI Draft" : "Unanswered";

const qStatusColor = (s: string) =>
  s === "completed" ? EME : s === "in_review" ? AMB : s === "in-progress" ? BLU : s === "sent" ? "#8B5CF6" : "var(--muted-foreground)";
const qStatusLabel = (s: string) =>
  s === "completed" ? "Completed" : s === "in_review" ? "In Review" : s === "in-progress" ? "In Progress" : s === "sent" ? "Sent" : "Draft";

// ── Main Component ────────────────────────────────────────────────────────────

export default function Questionnaires({ params }: { params?: { id?: string } }) {
  const [, navigate] = useLocation();
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<Questionnaire & { questions: Question[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [catFilter, setCatFilter] = useState("All");
  const [qFilter, setQFilter] = useState<"all" | "unanswered" | "ai-draft" | "reviewed">("all");
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState({ name: "", type: "SIG Lite 2024", recipient: "" });
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState("");
  const [importMode, setImportMode] = useState<"text" | "csv">("text");
  const [importXlsxFile, setImportXlsxFile] = useState<File | null>(null);
  const [importFileName, setImportFileName] = useState("");
  const [importFor, setImportFor] = useState<string | null>(null);
  const [importError, setImportError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [answeringAll, setAnsweringAll] = useState(false);
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [answerProgress, setAnswerProgress] = useState<{ processed: number; total: number } | null>(null);
  const [streamTexts, setStreamTexts] = useState<Record<string, string>>({});
  const token = localStorage.getItem("grc_token");
  const headers = { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" };
  const answerAllRef = useRef<AbortController | null>(null);

  function loadList() {
    fetch(api("/questionnaires"), { headers }).then(r => r.json())
      .then(setQuestionnaires).catch(console.error);
  }

  useEffect(() => {
    setLoading(true);
    const urlId = params?.id;
    Promise.all([
      fetch(api("/questionnaires"), { headers }).then(r => r.json()),
      fetch(api("/questionnaires/templates"), { headers }).then(r => r.json()),
    ]).then(async ([qs, ts]) => {
      setQuestionnaires(qs);
      setTemplates(ts);
      // Deep-link: auto-open questionnaire from URL param
      if (urlId && Array.isArray(qs)) {
        const match = (qs as Questionnaire[]).find(q => q.id === urlId);
        if (match) {
          const full = await fetch(api(`/questionnaires/${match.id}`), { headers }).then(r => r.json());
          setSelected(full);
          setCatFilter("All");
          setQFilter("all");
        }
      }
    }).catch(console.error).finally(() => setLoading(false));
  }, [params?.id]);

  async function openQuestionnaire(q: Questionnaire) {
    const full = await fetch(api(`/questionnaires/${q.id}`), { headers }).then(r => r.json());
    setSelected(full);
    setCatFilter("All");
    setQFilter("all");
    navigate(`/complianceops/questionnaires/${q.id}`);
  }

  async function createQuestionnaire() {
    if (!newForm.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(api("/questionnaires"), {
        method: "POST",
        headers,
        body: JSON.stringify(newForm),
      }).then(r => r.json());
      loadList();
      setCreating(false);
      setNewForm({ name: "", type: "SIG Lite 2024", recipient: "" });
      openQuestionnaire(res);
    } finally {
      setSaving(false);
    }
  }

  async function aiAnswerOne(qId: string) {
    if (!selected) return;
    setAnsweringId(qId);
    setStreamTexts(prev => ({ ...prev, [qId]: "" }));
    try {
      const res = await fetch(api(`/questionnaires/${selected.id}/ai-answer/${qId}`), {
        method: "POST", headers,
      });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const d = JSON.parse(line.slice(6));
            if (d.content) {
              fullText += d.content;
              setStreamTexts(prev => ({ ...prev, [qId]: fullText }));
            }
            if (d.done) {
              const confidence: number | undefined = d.confidence;
              setSelected(prev => {
                if (!prev) return prev;
                const prevQs = prev.questions ?? [];
                return {
                  ...prev,
                  questions: prevQs.map(q =>
                    q.id === qId ? { ...q, answer: fullText, status: "ai-draft", confidence: confidence ?? null, answerSource: "ai-draft" as const } : q
                  ),
                  progress: Math.round(prevQs.filter(q => q.id === qId ? true : q.status !== "unanswered").length / (prevQs.length || 1) * 100),
                };
              });
            }
          } catch { /* ignore */ }
        }
      }
    } finally {
      setAnsweringId(null);
    }
  }

  async function aiAnswerAll() {
    if (!selected) return;
    setAnsweringAll(true);
    setAnswerProgress({ processed: 0, total: (selected.questions ?? []).filter(q => q.status === "unanswered").length });
    const ctrl = new AbortController();
    answerAllRef.current = ctrl;
    try {
      const res = await fetch(api(`/questionnaires/${selected.id}/ai-answer-all`), {
        method: "POST", headers, signal: ctrl.signal,
      });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const updatedAnswers: Record<string, { answer: string; confidence?: number }> = {};
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const d = JSON.parse(line.slice(6));
            if (d.questionId && d.answer) {
              updatedAnswers[d.questionId] = { answer: d.answer, confidence: d.confidence };
              setAnswerProgress({ processed: d.processed, total: d.total });
              setSelected(prev => {
                if (!prev) return prev;
                const questions = (prev.questions ?? []).map(q => {
                  const u = updatedAnswers[q.id];
                  return u ? { ...q, answer: u.answer, confidence: u.confidence ?? null, status: "ai-draft" as const, answerSource: "ai-draft" as const } : q;
                });
                return { ...prev, questions, status: "in_review" as const, progress: Math.round(questions.filter(q => q.status !== "unanswered").length / (questions.length || 1) * 100) };
              });
            }
            if (d.done) break;
          } catch { /* ignore */ }
        }
      }
    } catch { /* aborted */ } finally {
      setAnsweringAll(false);
      setAnswerProgress(null);
      loadList();
    }
  }

  async function updateAnswer(qId: string, answer: string) {
    setSelected(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        questions: (prev.questions ?? []).map(q =>
          q.id === qId ? { ...q, answer, status: answer.trim() ? "reviewed" : "unanswered" } : q
        ),
      };
    });
    // Debounced save via PATCH
    if (selected) {
      const updated = (selected.questions ?? []).map(q =>
        q.id === qId ? { ...q, answer, status: answer.trim() ? "reviewed" as const : "unanswered" as const } : q
      );
      await fetch(api(`/questionnaires/${selected.id}`), {
        method: "PATCH", headers, body: JSON.stringify({ questions: updated }),
      });
    }
  }

  async function markReviewed(qId: string) {
    if (!selected) return;
    const updated = (selected.questions ?? []).map(q =>
      q.id === qId ? { ...q, status: "reviewed" as const } : q
    );
    setSelected(prev => prev ? { ...prev, questions: updated } : prev);
    await fetch(api(`/questionnaires/${selected.id}`), {
      method: "PATCH", headers, body: JSON.stringify({ questions: updated }),
    });
  }

  async function deleteQuestionnaire(id: string) {
    await fetch(api(`/questionnaires/${id}`), { method: "DELETE", headers });
    setQuestionnaires(prev => prev.filter(q => q.id !== id));
    if (selected?.id === id) setSelected(null);
  }

  async function exportCsv() {
    if (!selected) return;
    const res = await fetch(api(`/questionnaires/${selected.id}/export`), { headers });
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${selected.name.replace(/\s+/g, "_")}.csv`;
    a.click();
  }

  async function exportPdf() {
    if (!selected) return;
    const res = await fetch(api(`/questionnaires/${selected.id}/export/pdf`), { headers });
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${selected.name.replace(/\s+/g, "_")}.pdf`;
    a.click();
  }

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    const lower = file.name.toLowerCase();
    const isXlsx = lower.endsWith(".xlsx") || lower.endsWith(".xls");
    const isCsv  = lower.endsWith(".csv") || lower.endsWith(".tsv");
    if (isXlsx) {
      setImportXlsxFile(file);
      setImportText("");
    } else {
      setImportXlsxFile(null);
      setImportMode(isCsv ? "csv" : "text");
      const reader = new FileReader();
      reader.onload = (ev) => setImportText((ev.target?.result as string) ?? "");
      reader.readAsText(file);
    }
    e.target.value = "";
  }, []);

  async function doImport() {
    if (!importFor || (!importText.trim() && !importXlsxFile)) return;
    setImportError("");
    setSaving(true);
    try {
      let res: { error?: string; imported?: number; questionnaire?: Questionnaire & { questions: Question[] } };
      if (importXlsxFile) {
        // Send XLSX as multipart/form-data — avoids JSON body size limits
        const token = localStorage.getItem("grc_token");
        const form = new FormData();
        form.append("file", importXlsxFile, importXlsxFile.name);
        res = await fetch(api(`/questionnaires/${importFor}/import`), {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}` },
          body: form,
        }).then(r => r.json());
      } else {
        // Send CSV or plain-text as JSON with explicit mode
        res = await fetch(api(`/questionnaires/${importFor}/import`), {
          method: "POST", headers, body: JSON.stringify({ text: importText, mode: importMode }),
        }).then(r => r.json());
      }
      if (res.error) { setImportError(res.error); return; }
      const updated = res.questionnaire!;
      setSelected(updated);
      setQuestionnaires(prev => prev.map(q => q.id === importFor ? updated : q));
      setImporting(false);
      setImportText("");
      setImportXlsxFile(null);
      setImportFileName("");
      setImportFor(null);
    } catch {
      setImportError("Import failed — please try again.");
    } finally {
      setSaving(false);
    }
  }

  function importQuestionCount(): number {
    if (importXlsxFile) return 0; // unknown until server parses
    if (importMode === "csv") return parseCSVLines(importText);
    return importText.split("\n").filter(l => l.trim().length > 2).length;
  }
  function parseCSVLines(text: string): number {
    return text.split("\n").filter(l => l.trim().length > 0).length;
  }
  const canImport = !!(importXlsxFile || importText.trim());

  const inp: React.CSSProperties = { padding: "8px 11px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--input)", color: "var(--foreground)", fontSize: 13, fontFamily: "inherit", outline: "none", width: "100%" };
  const sel: React.CSSProperties = { ...inp, cursor: "pointer", width: "auto" };

  const selectedQs = selected?.questions ?? [];
  const categories = selected ? ["All", ...Array.from(new Set(selectedQs.map(q => q.category)))] : [];
  const visibleQs = selectedQs.filter(q => {
    if (catFilter !== "All" && q.category !== catFilter) return false;
    if (qFilter !== "all" && q.status !== qFilter) return false;
    return true;
  });

  const unanswered = selectedQs.filter(q => q.status === "unanswered").length;
  const aiDraft    = selectedQs.filter(q => q.status === "ai-draft").length;
  const reviewed   = selectedQs.filter(q => q.status === "reviewed").length;

  return (
    <div style={{ display: "flex", height: "100%", background: "var(--background)", overflow: "hidden" }}>

      {/* ── IMPORT MODAL ── */}
      {importing && importFor && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, width: 580, maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}>
            <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "var(--foreground)" }}>⬆ Import Questions</div>
                <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>
                  Upload CSV / XLSX / TXT, or paste questions below
                </div>
              </div>
              <button onClick={() => { setImporting(false); setImportText(""); setImportXlsxFile(null); setImportFileName(""); setImportFor(null); setImportError(""); }}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--muted-foreground)", padding: "0 4px", lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: "16px 22px", flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <input ref={fileInputRef} type="file" accept=".csv,.txt,.xlsx,.xls" style={{ display: "none" }} onChange={handleFileUpload} />
                <button onClick={() => fileInputRef.current?.click()}
                  style={{ padding: "7px 14px", background: "var(--secondary)", color: "var(--foreground)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>
                  📂 Upload CSV / XLSX / TXT
                </button>
                {importFileName && !importXlsxFile && (
                  <span style={{ fontSize: 11, color: "var(--muted-foreground)", display: "flex", alignItems: "center", gap: 6 }}>
                    {importFileName}
                    <button onClick={() => { setImportFileName(""); setImportText(""); setImportMode("text"); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", fontSize: 14, padding: 0 }}>×</button>
                  </span>
                )}
                {!importFileName && !importXlsxFile && <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>or paste below</span>}
              </div>
              {importXlsxFile ? (
                <div style={{ padding: "16px 18px", background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: 8, display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 24 }}>📊</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>{importFileName}</div>
                    <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>
                      XLSX ready — uploaded as multipart file (up to 10 MB). Server parses all sheets and extracts questions by column header.
                    </div>
                  </div>
                  <button onClick={() => { setImportXlsxFile(null); setImportFileName(""); }}
                    style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", fontSize: 16 }}>×</button>
                </div>
              ) : (
                <>
                  {/* Mode toggle — only relevant when text is present */}
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>Format:</span>
                    {(["text", "csv"] as const).map(m => (
                      <button key={m} onClick={() => setImportMode(m)}
                        style={{ padding: "3px 10px", borderRadius: 5, border: `1px solid ${importMode === m ? BLU : "var(--border)"}`, background: importMode === m ? "rgba(59,130,246,0.1)" : "var(--secondary)", color: importMode === m ? BLU : "var(--muted-foreground)", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                        {m === "text" ? "Plain text (one per line)" : "CSV (Question, Category, Number)"}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={importText}
                    onChange={e => setImportText(e.target.value)}
                    rows={11}
                    placeholder={importMode === "csv"
                      ? `CSV format: Question,Category,Number (first row may be a header)\n\n"Do you have an information security policy?",Governance,1.1\n"Is MFA enforced for remote access?",Access Control,2.3\n"How often is risk assessment reviewed?",Risk Management,3.1`
                      : `Paste one question per line — commas in questions are fine:\n\nDo you have an information security policy?\nIs MFA enforced for all remote access?\nHow often is your risk assessment reviewed?`}
                    style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--input)", color: "var(--foreground)", fontSize: 12, fontFamily: "inherit", resize: "vertical", outline: "none", lineHeight: 1.6 }}
                  />
                </>
              )}
              {importText.trim() && !importXlsxFile && (
                <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
                  {importQuestionCount()} row(s) detected — mode: <strong>{importMode === "csv" ? "CSV" : "plain text"}</strong>
                </div>
              )}
              {importError && <div style={{ fontSize: 12, color: "#DC2626", background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 6, padding: "8px 12px" }}>{importError}</div>}
            </div>
            <div style={{ padding: "12px 22px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => { setImporting(false); setImportText(""); setImportXlsxFile(null); setImportFileName(""); setImportFor(null); setImportError(""); }}
                style={{ padding: "8px 18px", background: "var(--secondary)", color: "var(--foreground)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>
                Cancel
              </button>
              <button onClick={doImport} disabled={saving || !canImport}
                style={{ padding: "8px 20px", background: saving || !canImport ? "var(--secondary)" : BLU, color: saving || !canImport ? "var(--muted-foreground)" : "#fff", border: "none", borderRadius: 6, cursor: saving || !canImport ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>
                {saving ? "Importing…" : importXlsxFile ? "Import XLSX" : `Import ${importQuestionCount()} Questions`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── LEFT PANEL ── */}
      <div style={{ width: 300, flexShrink: 0, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", background: "var(--card)" }}>
        <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16 }}>📋</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: "var(--foreground)" }}>Questionnaires</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>SIG · CAIQ · VSA · Custom</div>
            </div>
            <button onClick={() => setCreating(true)}
              style={{ padding: "6px 12px", background: BLU, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
              + New
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "8px" }}>
          {loading ? (
            <div style={{ padding: 20, textAlign: "center", color: "var(--muted-foreground)", fontSize: 12 }}>Loading…</div>
          ) : questionnaires.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
              <div style={{ fontSize: 13, color: "var(--foreground)", fontWeight: 600, marginBottom: 6 }}>No questionnaires yet</div>
              <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 14 }}>Create your first vendor security questionnaire</div>
              <button onClick={() => setCreating(true)}
                style={{ padding: "8px 16px", background: BLU, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                + Create Questionnaire
              </button>
            </div>
          ) : questionnaires.map(q => (
            <div key={q.id}
              onClick={() => openQuestionnaire(q)}
              style={{ background: selected?.id === q.id ? "rgba(59,130,246,0.08)" : "transparent", border: selected?.id === q.id ? `1px solid rgba(59,130,246,0.3)` : "1px solid transparent", borderRadius: 8, padding: "10px 12px", marginBottom: 4, cursor: "pointer" }}
              onMouseEnter={e => { if (selected?.id !== q.id) e.currentTarget.style.background = "var(--secondary)"; }}
              onMouseLeave={e => { if (selected?.id !== q.id) e.currentTarget.style.background = "transparent"; }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--foreground)", lineHeight: 1.3, flex: 1, marginRight: 8 }}>{q.name}</div>
                <span style={{ background: `${qStatusColor(q.status)}18`, color: qStatusColor(q.status), border: `1px solid ${qStatusColor(q.status)}33`, borderRadius: 4, padding: "1px 6px", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0 }}>
                  {qStatusLabel(q.status)}
                </span>
              </div>
              <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginBottom: 6 }}>{q.type} · {q.questionCount} questions</div>
              <div style={{ height: 4, background: "var(--secondary)", borderRadius: 2, overflow: "hidden", marginBottom: 4 }}>
                <div style={{ width: `${q.progress}%`, height: "100%", background: q.progress === 100 ? EME : BLU, borderRadius: 2 }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--muted-foreground)" }}>
                <span>{q.progress}% complete</span>
                {q.recipient && <span>{q.recipient}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Templates section */}
        {templates.length > 0 && (
          <div style={{ borderTop: "1px solid var(--border)", padding: "12px 16px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>Templates</div>
            {templates.map(t => (
              <div key={t.name} onClick={() => { setNewForm(f => ({ ...f, type: t.name })); setCreating(true); }}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px", borderRadius: 6, cursor: "pointer", marginBottom: 2 }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--secondary)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                <span style={{ fontSize: 11, color: "var(--foreground)", fontWeight: 500 }}>{t.name}</span>
                <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{t.questionCount}Q</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── MAIN PANEL ── */}
      {selected ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Header */}
          <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: "var(--foreground)", marginBottom: 3 }}>{selected.name}</div>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                  {selected.type} · {(selected.questions ?? []).length} questions
                  {selected.recipient && ` · ${selected.recipient}`}
                  {selected.dueDate && ` · Due ${selected.dueDate}`}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { setImportFor(selected.id); setImporting(true); setImportText(""); setImportError(""); }}
                  style={{ padding: "7px 14px", background: "var(--secondary)", color: "var(--foreground)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                  ⬆ Import Questions
                </button>
                <button onClick={exportCsv}
                  style={{ padding: "7px 14px", background: "var(--secondary)", color: "var(--foreground)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                  ⬇ Export CSV
                </button>
                <button onClick={exportPdf}
                  style={{ padding: "7px 14px", background: "var(--secondary)", color: "var(--foreground)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                  ⬇ Export PDF
                </button>
                <button
                  onClick={aiAnswerAll}
                  disabled={answeringAll || unanswered === 0}
                  style={{ padding: "7px 16px", background: answeringAll ? "var(--secondary)" : BLU, color: answeringAll ? "var(--foreground)" : "#fff", border: "none", borderRadius: 6, cursor: (answeringAll || unanswered === 0) ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, opacity: unanswered === 0 ? 0.5 : 1 }}>
                  {answeringAll ? (
                    <>
                      <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", animation: "spin 0.7s linear infinite" }} />
                      {answerProgress ? `Answering ${answerProgress.processed}/${answerProgress.total}…` : "Starting AI…"}
                    </>
                  ) : (
                    <>🤖 AI Answer All ({unanswered})</>
                  )}
                </button>
                <button onClick={() => deleteQuestionnaire(selected.id)}
                  style={{ padding: "7px 10px", background: "transparent", color: RED, border: `1px solid ${RED}44`, borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                  🗑
                </button>
              </div>
            </div>

            {/* Progress bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, height: 6, background: "var(--secondary)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${selected.progress}%`, height: "100%", background: selected.progress === 100 ? EME : BLU, borderRadius: 3, transition: "width 0.4s ease" }} />
              </div>
              <div style={{ fontSize: 11, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{selected.progress}%</div>
              {[
                { label: "Unanswered", count: unanswered, color: "var(--muted-foreground)" },
                { label: "AI Draft",   count: aiDraft,    color: BLU },
                { label: "Reviewed",   count: reviewed,   color: EME },
              ].map(s => (
                <span key={s.label} style={{ fontSize: 11, color: s.color, fontWeight: 600, whiteSpace: "nowrap" }}>{s.count} {s.label}</span>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div style={{ padding: "10px 24px", borderBottom: "1px solid var(--border)", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)" }}>Category:</div>
            {categories.map(cat => (
              <button key={cat} onClick={() => setCatFilter(cat)}
                style={{ padding: "3px 10px", borderRadius: 20, border: catFilter === cat ? `1px solid ${BLU}` : "1px solid var(--border)", background: catFilter === cat ? "rgba(59,130,246,0.1)" : "transparent", color: catFilter === cat ? BLU : "var(--muted-foreground)", cursor: "pointer", fontSize: 11, fontWeight: catFilter === cat ? 700 : 400, fontFamily: "inherit" }}>
                {cat}
              </button>
            ))}
            <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
              <select value={qFilter} onChange={e => setQFilter(e.target.value as typeof qFilter)} style={{ ...sel, fontSize: 11, padding: "3px 8px" }}>
                <option value="all">All statuses</option>
                <option value="unanswered">Unanswered</option>
                <option value="ai-draft">AI Draft</option>
                <option value="reviewed">Reviewed</option>
              </select>
              <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{visibleQs.length} questions</span>
            </div>
          </div>

          {/* Question list */}
          <div style={{ flex: 1, overflow: "auto", padding: "8px 24px 24px" }}>
            {visibleQs.map((q, idx) => {
              const isAnswering = answeringId === q.id;
              const streamText = streamTexts[q.id];
              const displayAnswer = isAnswering && streamText ? streamText : q.answer;
              return (
                <div key={q.id}
                  style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px 20px", marginBottom: 10, transition: "border-color 0.15s" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div style={{ flex: 1, marginRight: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", background: "var(--secondary)", border: "1px solid var(--border)", borderRadius: 4, padding: "1px 7px" }}>
                          {q.number}
                        </span>
                        <span style={{ fontSize: 10, color: "var(--muted-foreground)", background: "var(--secondary)", borderRadius: 4, padding: "1px 7px", border: "1px solid var(--border)" }}>
                          {q.category}
                        </span>
                        {q.source && (
                          <span style={{ fontSize: 10, color: BLU, background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 4, padding: "1px 7px" }}>
                            {q.source}
                          </span>
                        )}
                        <span style={{ background: `${statusColor(q.status)}18`, color: statusColor(q.status), border: `1px solid ${statusColor(q.status)}33`, borderRadius: 4, padding: "1px 7px", fontSize: 10, fontWeight: 700 }}>
                          {statusLabel(q.status)}
                        </span>
                        {q.confidence != null && q.status === "ai-draft" && (
                          <span style={{ background: "rgba(59,130,246,0.08)", color: BLU, border: "1px solid rgba(59,130,246,0.25)", borderRadius: 4, padding: "1px 7px", fontSize: 10, fontWeight: 700 }}>
                            AI {Math.round(q.confidence * 100)}%
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", lineHeight: 1.5 }}>
                        <span style={{ color: "var(--muted-foreground)", marginRight: 6 }}>{idx + 1}.</span>{q.question}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      {q.status === "ai-draft" && (
                        <button onClick={() => markReviewed(q.id)}
                          style={{ padding: "4px 10px", background: `${EME}18`, color: EME, border: `1px solid ${EME}33`, borderRadius: 5, cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: "inherit" }}>
                          ✓ Mark Reviewed
                        </button>
                      )}
                      <button onClick={() => aiAnswerOne(q.id)} disabled={isAnswering || answeringAll}
                        style={{ padding: "4px 10px", background: isAnswering ? "var(--secondary)" : "rgba(59,130,246,0.1)", color: BLU, border: `1px solid rgba(59,130,246,0.3)`, borderRadius: 5, cursor: (isAnswering || answeringAll) ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 700, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}>
                        {isAnswering ? (
                          <>
                            <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", border: `2px solid rgba(59,130,246,0.3)`, borderTopColor: BLU, animation: "spin 0.7s linear infinite" }} />
                            Writing…
                          </>
                        ) : "🤖 AI Answer"}
                      </button>
                    </div>
                  </div>

                  {/* Answer text area */}
                  <div style={{ position: "relative" }}>
                    <textarea
                      value={isAnswering && streamText ? streamText : q.answer}
                      onChange={e => updateAnswer(q.id, e.target.value)}
                      readOnly={isAnswering}
                      rows={Math.max(3, Math.ceil((displayAnswer?.length ?? 0) / 90))}
                      placeholder="Enter answer here, or click AI Answer to auto-fill…"
                      style={{ ...inp, resize: "vertical", minHeight: 72, fontSize: 12, lineHeight: 1.6, background: isAnswering ? "var(--secondary)" : q.status === "ai-draft" ? "rgba(59,130,246,0.03)" : q.status === "reviewed" ? `${EME}06` : "var(--input)" }}
                    />
                    {isAnswering && (
                      <div style={{ position: "absolute", bottom: 8, right: 10, display: "flex", alignItems: "center", gap: 5, background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: 4, padding: "2px 8px" }}>
                        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", border: `2px solid rgba(59,130,246,0.3)`, borderTopColor: BLU, animation: "spin 0.7s linear infinite" }} />
                        <span style={{ fontSize: 10, color: BLU, fontWeight: 700 }}>AI writing…</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {visibleQs.length === 0 && (
              <div style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground)", fontSize: 13 }}>No questions match the selected filters</div>
            )}
          </div>
        </div>
      ) : (
        /* Empty state */
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <div style={{ fontSize: 56 }}>📋</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "var(--foreground)" }}>Security Questionnaire Manager</div>
          <div style={{ fontSize: 13, color: "var(--muted-foreground)", textAlign: "center", maxWidth: 400 }}>
            Manage SIG Lite, CAIQ, and VSA questionnaires with AI auto-answer based on your security posture.
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button onClick={() => setCreating(true)}
              style={{ padding: "10px 22px", background: BLU, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 700 }}>
              + New Questionnaire
            </button>
          </div>
          {templates.length > 0 && (
            <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
              {templates.map(t => (
                <div key={t.name}
                  onClick={() => { setNewForm(f => ({ ...f, type: t.name })); setCreating(true); }}
                  style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px", cursor: "pointer", textAlign: "center", minWidth: 160 }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = BLU)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)", marginBottom: 4 }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 8 }}>{t.questionCount} questions</div>
                  <div style={{ fontSize: 10, color: BLU }}>{t.categories.slice(0, 3).join(" · ")}{t.categories.length > 3 ? " · …" : ""}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── CREATE MODAL ── */}
      {creating && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={e => e.target === e.currentTarget && setCreating(false)}>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "28px 32px", width: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--foreground)", marginBottom: 20 }}>New Questionnaire</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", display: "block", marginBottom: 6, textTransform: "uppercase" }}>NAME</label>
                <input value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Acme Corp Security Review 2024" style={inp}
                  onKeyDown={e => e.key === "Enter" && createQuestionnaire()} autoFocus />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", display: "block", marginBottom: 6, textTransform: "uppercase" }}>TEMPLATE</label>
                <select value={newForm.type} onChange={e => setNewForm(f => ({ ...f, type: e.target.value }))} style={{ ...inp, cursor: "pointer" }}>
                  {templates.map(t => (
                    <option key={t.name} value={t.name}>{t.name} ({t.questionCount} questions)</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", display: "block", marginBottom: 6, textTransform: "uppercase" }}>RECIPIENT (optional)</label>
                <input value={newForm.recipient} onChange={e => setNewForm(f => ({ ...f, recipient: e.target.value }))}
                  placeholder="e.g. Acme Corp, vendor@example.com" style={inp} />
              </div>
              {newForm.type && templates.find(t => t.name === newForm.type) && (
                <div style={{ background: "var(--secondary)", borderRadius: 8, padding: "10px 14px", fontSize: 11, color: "var(--muted-foreground)" }}>
                  📋 {templates.find(t => t.name === newForm.type)?.description}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
              <button onClick={() => setCreating(false)}
                style={{ padding: "9px 20px", background: "var(--secondary)", color: "var(--foreground)", border: "1px solid var(--border)", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>
                Cancel
              </button>
              <button onClick={createQuestionnaire} disabled={!newForm.name.trim() || saving}
                style={{ padding: "9px 20px", background: BLU, color: "#fff", border: "none", borderRadius: 7, cursor: (!newForm.name.trim() || saving) ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit", opacity: (!newForm.name.trim() || saving) ? 0.6 : 1 }}>
                {saving ? "Creating…" : "Create Questionnaire"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
