// @ts-nocheck
import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { SubNav } from "@/components/SubNav";
import { AICopilotBar } from "@/components/AICopilotBar";
import { useOrg } from "@/context/OrgContext";
import { getStoredToken } from "@/lib/auth-utils";

const NAV = "#1E3A5F";
const EME = "#065F46";
const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "").replace(/\/grc-platform$/, "");

async function exportContent(content: string, format: "pdf" | "docx", title: string, token: string | null) {
  const resp = await fetch(`${BASE_URL}/api/ai/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ content, format, title }),
  });
  if (!resp.ok) throw new Error("Export failed");
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[^a-z0-9]/gi, "-")}.${format === "pdf" ? "pdf" : "docx"}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const TABS = [
  { key: "overview",  label: "Overview" },
  { key: "roadmap",   label: "Security Roadmap" },
  { key: "briefing",  label: "Executive Briefing" },
  { key: "qa",        label: "Risk Q&A" },
  { key: "matrix",    label: "Impact Matrix" },
  { key: "board",     label: "Board View" },
];

const riskBadge: Record<string, { bg: string; color: string; border: string }> = {
  Critical: { bg: "rgba(239,68,68,0.06)", color: "#991B1B", border: "#FECACA" },
  High:     { bg: "rgba(245,158,11,0.06)", color: "#92400E", border: "#FDE68A" },
  Medium:   { bg: "#EEF2FF", color: "#3730A3", border: "#C7D2FE" },
  Low:      { bg: "rgba(34,197,94,0.08)", color: "#065F46", border: "#A7F3D0" },
};

const ROADMAP_PHASES = [
  {
    name: "Assess", color: "#DC2626", weeks: 6, start: 0,
    initiatives: [
      { title: "Asset Discovery & Inventory",     priority: "Critical", effort: 2, frameworks: ["CIS Controls v8"], metric: "100% asset coverage" },
      { title: "Risk Assessment (FAIR Model)",     priority: "Critical", effort: 3, frameworks: ["NIST CSF", "ISO 27001"], metric: "Risk register complete" },
      { title: "Gap Analysis vs ISO 27001:2022",  priority: "High",     effort: 2, frameworks: ["ISO 27001:2022"], metric: "Gap report published" },
      { title: "Current Threat Landscape Review", priority: "High",     effort: 1, frameworks: ["MITRE ATT&CK"], metric: "TTPs mapped" },
    ],
  },
  {
    name: "Foundation", color: "#D97706", weeks: 10, start: 6,
    initiatives: [
      { title: "Identity & Access Management",    priority: "Critical", effort: 4, frameworks: ["CIS Controls 5-6", "NIST 800-53"], metric: "MFA 100% enrolled" },
      { title: "Vulnerability Management Program",priority: "High",     effort: 3, frameworks: ["CIS Controls 7"], metric: "<15d mean time to patch" },
      { title: "Security Awareness Training",     priority: "High",     effort: 2, frameworks: ["ISO A.7.2.2"], metric: "100% staff trained" },
      { title: "Incident Response Plan",          priority: "High",     effort: 3, frameworks: ["NIST SP 800-61"], metric: "IR plan tested" },
    ],
  },
  {
    name: "Implement", color: "rgb(147,197,253)", weeks: 14, start: 16,
    initiatives: [
      { title: "Zero Trust Network Architecture", priority: "Critical", effort: 6, frameworks: ["NIST SP 800-207"], metric: "Micro-segmentation live" },
      { title: "SIEM Deployment & Tuning",        priority: "High",     effort: 4, frameworks: ["CIS Controls 8"], metric: "<1% false positive rate" },
      { title: "Data Classification & DLP",       priority: "High",     effort: 4, frameworks: ["GDPR", "ISO 27001 A.8.2"], metric: "All PII classified" },
      { title: "Cloud Security Posture (CSPM)",   priority: "Medium",   effort: 3, frameworks: ["CIS Benchmarks", "NIST CSF"], metric: "0 critical cloud findings" },
      { title: "Privileged Access Management",    priority: "Critical", effort: 5, frameworks: ["CIS Controls 12"], metric: "All admin via PAM" },
    ],
  },
  {
    name: "Operate", color: EME, weeks: 12, start: 30,
    initiatives: [
      { title: "Continuous Compliance Monitoring", priority: "High",    effort: 3, frameworks: ["ISO 27001", "SOC 2"], metric: "Real-time compliance score" },
      { title: "Threat Hunting Program",           priority: "High",    effort: 4, frameworks: ["MITRE ATT&CK"], metric: "Monthly hunt completed" },
      { title: "Red Team / Pen Testing",           priority: "Medium",  effort: 3, frameworks: ["PTES", "OWASP"], metric: "Annual assessment done" },
      { title: "Vendor Risk Management",           priority: "Medium",  effort: 3, frameworks: ["ISO 27036", "NIST CSF"], metric: "All Tier-1 vendors assessed" },
    ],
  },
  {
    name: "Optimize", color: "#7C3AED", weeks: 0, start: 42,
    initiatives: [
      { title: "AI-Driven Security Analytics",    priority: "Medium",   effort: 5, frameworks: ["NIST AI RMF"], metric: "ML model in production" },
      { title: "Security Metrics & Board Reporting",priority:"Medium",  effort: 2, frameworks: ["NIST CSF", "ISO 27001"], metric: "Monthly board report" },
      { title: "Security Culture Program",        priority: "Low",      effort: 3, frameworks: ["ISO A.7.2.1"], metric: "Culture maturity score 4+" },
    ],
  },
];

const BOARD_METRICS: Array<{ label: string; value: string; delta: string; positive: boolean; color: string; note: string }> = [];

function StreamingText({ text, streaming }: { text: string; streaming: boolean }) {
  return (
    <div style={{ fontSize: 13, lineHeight: 1.8, color: "var(--foreground)", whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
      {text.split(/^(#{1,3} .+)$/m).map((part, i) => {
        if (/^#{1,3} /.test(part)) {
          const level = (part.match(/^(#{1,3})/) || [])[1]?.length ?? 1;
          const txt = part.replace(/^#{1,3} /, "");
          return <div key={i} style={{ fontSize: level === 1 ? 15 : level === 2 ? 14 : 13, fontWeight: 800, color: NAV, marginTop: 16, marginBottom: 6 }}>{txt}</div>;
        }
        return <span key={i}>{part}</span>;
      })}
      {streaming && <span style={{ display: "inline-block", width: 8, height: 14, background: NAV, borderRadius: 2, animation: "pulse 1s infinite", verticalAlign: "middle", marginLeft: 2 }} />}
    </div>
  );
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface AnalysisResult {
  summary?: {
    overallRiskScore: number;
    riskLevel: string;
    criticalCount: number;
    highCount: number;
    openFindings: number;
    complianceScore: number;
    headline: string;
    trend: string;
  };
  topActionItems?: Array<{ priority: string; title: string; description: string; effort: string; framework: string }>;
  recommendedPlaybooks?: Array<{ id: string; title: string; risk: string; category: string }>;
  matrixItems?: Array<{ id: string; title: string; impact: number; effort: number; priority: string }>;
  generatedAt?: string;
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab() {
  const [messages, setMessages] = useState<{role:string;text:string}[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [convId, setConvId] = useState<number | null>(null);
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const token = getStoredToken();

  const aiMessages = messages.filter(m => m.role === "ai" && m.text.trim());

  async function handleExportChat(format: "pdf" | "docx") {
    if (!aiMessages.length || exporting) return;
    setExporting(format);
    try {
      const content = messages.map(m => m.role === "user" ? `**You:** ${m.text}` : m.text).join("\n\n---\n\n");
      await exportContent(content, format, "AI-vCISO-Playbook", token);
    } catch {
      alert("Export failed. Please try again.");
    } finally {
      setExporting(null);
    }
  }

  const { data: analysis, isLoading: analysisLoading } = useQuery<AnalysisResult>({
    queryKey: ["ai", "analyze"],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/ai/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Analysis failed");
      return res.json() as Promise<AnalysisResult>;
    },
    staleTime: 10 * 60_000,
    enabled: !!token,
  });

  const { data: pastConversations = [], isError: convsError } = useQuery({
    queryKey: ["ai", "conversations"],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/ai/conversations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load conversations");
      return res.json() as Promise<Array<{ id: number; title: string; createdAt: string }>>;
    },
    staleTime: 60_000,
    enabled: !!token,
  });

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  async function initConv() {
    if (convId) return convId;
    const r = await fetch(`${BASE_URL}/api/ai/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: "vCISO Chat", context: "GRC Platform — AI vCISO mode" }),
    });
    const data = await r.json() as { id: number };
    setConvId(data.id);
    return data.id;
  }

  async function sendMessage() {
    if (!input.trim() || streaming) return;
    const userMsg = input;
    setInput("");
    setMessages(prev => [...prev, { role: "user", text: userMsg }]);
    setStreaming(true);

    try {
      const cid = await initConv();
      const resp = await fetch(`${BASE_URL}/api/ai/conversations/${cid}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: userMsg }),
      });

      let aiText = "";
      setMessages(prev => [...prev, { role: "ai", text: "" }]);
      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value).split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const d = JSON.parse(line.slice(6)) as { content?: string; done?: boolean };
              if (d.content) {
                aiText += d.content;
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: "ai", text: aiText };
                  return updated;
                });
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch {
      setMessages(prev => [...prev, { role: "ai", text: "Connection error. Please try again." }]);
    } finally {
      setStreaming(false);
    }
  }

  const riskLevelColor: Record<string, string> = { Critical: "#DC2626", High: "#D97706", Medium: "#1D4ED8", Low: EME };
  const priorityBg: Record<string, string> = { Critical: "rgba(239,68,68,0.08)", High: "rgba(245,158,11,0.08)", Medium: "#EEF2FF", Low: "rgba(34,197,94,0.08)" };
  const priorityBorder: Record<string, string> = { Critical: "#FECACA", High: "#FDE68A", Medium: "#C7D2FE", Low: "#A7F3D0" };

  const livePlaybooks = analysis?.recommendedPlaybooks ?? [];
  const actions = analysis?.topActionItems ?? [];
  const summary = analysis?.summary;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, flex: 1, minHeight: 0 }}>

      {/* ── Live Risk Summary Card ─────────────────────────────────────── */}
      {(summary || analysisLoading) && (
        <div style={{ margin: "12px 24px 0", background: `linear-gradient(135deg, ${NAV}08, ${EME}06)`, border: `1px solid ${NAV}20`, borderRadius: 12, padding: "14px 20px", display: "flex", gap: 20, alignItems: "center", flexShrink: 0 }}>
          {analysisLoading ? (
            <div style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: 600 }}>◆ Analysing live risk data…</div>
          ) : summary ? (
            <>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <div style={{ width: 28, height: 28, background: `linear-gradient(135deg, ${NAV}, ${EME})`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "white" }}>◆</div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: NAV }}>AI Risk Analysis</div>
                    <div style={{ fontSize: 9, color: "var(--muted-foreground)" }}>Updated {analysis?.generatedAt ? new Date(analysis.generatedAt).toLocaleTimeString() : "now"}</div>
                  </div>
                  <span style={{ background: priorityBg[summary.riskLevel] ?? priorityBg.High, border: `1px solid ${priorityBorder[summary.riskLevel] ?? priorityBorder.High}`, color: riskLevelColor[summary.riskLevel] ?? "#D97706", borderRadius: 20, padding: "2px 10px", fontSize: 10, fontWeight: 700 }}>
                    {summary.riskLevel} Risk
                  </span>
                  <span style={{ fontSize: 10, color: summary.trend === "deteriorating" ? "#DC2626" : summary.trend === "improving" ? EME : "var(--muted-foreground)", fontWeight: 700 }}>
                    {summary.trend === "deteriorating" ? "▲ Deteriorating" : summary.trend === "improving" ? "▼ Improving" : "→ Stable"}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "var(--foreground)", fontWeight: 500, lineHeight: 1.5 }}>{summary.headline}</div>
              </div>
              <div style={{ display: "flex", gap: 16, flexShrink: 0 }}>
                {[
                  { label: "Risk Score", value: `${summary.overallRiskScore}`, color: riskLevelColor[summary.riskLevel] ?? "#D97706" },
                  { label: "Critical", value: `${summary.criticalCount}`, color: "#DC2626" },
                  { label: "Findings", value: `${summary.openFindings}`, color: "#D97706" },
                  { label: "Compliance", value: `${summary.complianceScore}%`, color: EME },
                ].map(m => (
                  <div key={m.label} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: m.color, fontFamily: "monospace", lineHeight: 1 }}>{m.value}</div>
                    <div style={{ fontSize: 9, color: "var(--muted-foreground)", fontWeight: 600, marginTop: 2 }}>{m.label}</div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* ── Top 3 Action Items ─────────────────────────────────────────── */}
      {actions.length > 0 && (
        <div style={{ margin: "10px 24px 0", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, flexShrink: 0 }}>
          {actions.slice(0, 3).map((a, i) => (
            <div key={i} style={{ background: "var(--card)", border: `1px solid ${priorityBorder[a.priority] ?? "var(--border)"}`, borderRadius: 10, padding: "10px 14px", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: riskLevelColor[a.priority] ?? "#D97706", borderRadius: "10px 10px 0 0" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <span style={{ background: priorityBg[a.priority], border: `1px solid ${priorityBorder[a.priority]}`, color: riskLevelColor[a.priority], borderRadius: 4, padding: "1px 7px", fontSize: 9, fontWeight: 700 }}>{a.priority}</span>
                <span style={{ fontSize: 9, color: "var(--muted-foreground)", fontWeight: 600 }}>{a.effort}</span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--foreground)", marginBottom: 4, lineHeight: 1.3 }}>{a.title}</div>
              <div style={{ fontSize: 10, color: "var(--muted-foreground)", lineHeight: 1.5 }}>{a.description}</div>
              <div style={{ fontSize: 9, color: NAV, fontWeight: 700, marginTop: 6 }}>{a.framework}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Chat + Sidebar ─────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16, flex: 1, minHeight: 0, padding: "12px 24px 16px" }}>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, background: `linear-gradient(135deg, ${NAV}, ${EME})`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "white", flexShrink: 0 }}>◆</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: NAV }}>AI vCISO — AIGO-X Intelligence</div>
              <div style={{ fontSize: 10, color: "#10B981", fontWeight: 600 }}>● Online · Context-aware security advisor</div>
            </div>
            {aiMessages.length > 0 && (
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => handleExportChat("pdf")} disabled={!!exporting}
                  style={{ border: "1px solid var(--border)", background: "var(--card)", borderRadius: 6, padding: "5px 10px", fontSize: 10, fontWeight: 700, color: "var(--foreground)", cursor: exporting ? "not-allowed" : "pointer", opacity: exporting === "pdf" ? 0.6 : 1, fontFamily: "inherit" }}>
                  {exporting === "pdf" ? "…" : "↓ PDF"}
                </button>
                <button onClick={() => handleExportChat("docx")} disabled={!!exporting}
                  style={{ border: "1px solid var(--border)", background: "var(--card)", borderRadius: 6, padding: "5px 10px", fontSize: 10, fontWeight: 700, color: "var(--foreground)", cursor: exporting ? "not-allowed" : "pointer", opacity: exporting === "docx" ? 0.6 : 1, fontFamily: "inherit" }}>
                  {exporting === "docx" ? "…" : "↓ Word"}
                </button>
              </div>
            )}
          </div>
          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
            {messages.length === 0 && (
              <div style={{ textAlign: "center", padding: "32px 16px" }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>◆</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: NAV, marginBottom: 6 }}>Ask the AI vCISO anything</div>
                <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 16 }}>Powered by your live risk register, compliance gaps, and security findings</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
                  {["What are our top critical risks?", "Generate an executive risk summary", "Which compliance gaps are most urgent?", "Draft a remediation plan for our top risk"].map(s => (
                    <button key={s} onClick={() => { setInput(s); }}
                      style={{ border: "1px solid var(--border)", background: "var(--card)", borderRadius: 16, padding: "5px 12px", fontSize: 11, fontWeight: 600, color: "var(--foreground)", cursor: "pointer", fontFamily: "inherit" }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                {msg.role === "ai" && (
                  <div style={{ width: 24, height: 24, background: `linear-gradient(135deg, ${NAV}, ${EME})`, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "white", flexShrink: 0, marginRight: 8, marginTop: 2 }}>◆</div>
                )}
                <div style={{
                  maxWidth: "72%", background: msg.role === "user" ? `linear-gradient(135deg, ${NAV}, ${EME})` : "var(--card)",
                  border: msg.role === "user" ? "none" : "1px solid var(--border)",
                  borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                  padding: "10px 14px", fontSize: 12, lineHeight: 1.6,
                  color: msg.role === "user" ? "white" : "var(--foreground)", fontWeight: 500,
                }}>
                  {msg.role === "ai" ? <StreamingText text={msg.text} streaming={streaming && i === messages.length - 1} /> : msg.text}
                  {i === messages.length - 1 && msg.role === "ai" && streaming && msg.text === "" && (
                    <span style={{ display: "inline-block", width: 6, height: 12, background: NAV, borderRadius: 1, marginLeft: 2, verticalAlign: "middle" }} />
                  )}
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMessage()}
              placeholder="Ask the AI vCISO anything..." disabled={streaming}
              style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "var(--foreground)", background: "var(--card)", outline: "none", fontFamily: "inherit" }} />
            <button onClick={sendMessage} disabled={streaming}
              style={{ background: `linear-gradient(135deg, ${NAV}, ${EME})`, border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, color: "white", cursor: streaming ? "not-allowed" : "pointer", opacity: streaming ? 0.6 : 1, fontFamily: "inherit" }}>
              {streaming ? "●●●" : "Send"}
            </button>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: NAV }}>Recommended Playbooks</div>
              <span style={{ fontSize: 9, color: EME, fontWeight: 700 }}>◆ AI</span>
            </div>
            {analysisLoading ? (
              <div style={{ padding: "14px 16px", fontSize: 11, color: "var(--muted-foreground)" }}>Loading…</div>
            ) : livePlaybooks.length > 0 ? (
              livePlaybooks.map(p => (
                <div key={p.id} style={{ padding: "11px 16px", borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "var(--secondary)"}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = ""}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--muted-foreground)", fontWeight: 600 }}>{p.id}</span>
                    <span style={{ background: riskBadge[p.risk]?.bg ?? "#EEF2FF", border: `1px solid ${riskBadge[p.risk]?.border ?? "#C7D2FE"}`, color: riskBadge[p.risk]?.color ?? "#3730A3", borderRadius: 4, padding: "1px 6px", fontSize: 9, fontWeight: 700 }}>{p.risk}</span>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--foreground)", lineHeight: 1.4 }}>{p.title}</div>
                  <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 2 }}>{p.category}</div>
                </div>
              ))
            ) : (
              <div style={{ padding: "14px 16px", fontSize: 11, color: "var(--muted-foreground)" }}>No playbooks yet — run analysis first</div>
            )}
          </div>

          {pastConversations.length > 0 && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontSize: 12, fontWeight: 700, color: NAV }}>
                Recent Conversations
              </div>
              {pastConversations.slice(0, 5).map(c => (
                <div key={c.id} style={{ padding: "9px 16px", borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                  onClick={() => setConvId(c.id)}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.title}</div>
                  <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 2 }}>{new Date(c.createdAt).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          )}
          {convsError && (
            <div style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.15)", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "#DC2626", fontWeight: 600 }}>
              ⚠ Failed to load conversation history
            </div>
          )}

          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: NAV, marginBottom: 10 }}>Security Posture</div>
            {[
              { label: "Overall Risk", value: summary?.overallRiskScore ?? 72, color: riskLevelColor[summary?.riskLevel ?? "High"] ?? "#D97706" },
              { label: "Compliance",   value: summary?.complianceScore ?? 0, color: EME },
              { label: "Open Findings", value: Math.min(100, (summary?.openFindings ?? 0)), color: "#DC2626" },
            ].map(m => (
              <div key={m.label} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: "#6B7280", fontWeight: 600 }}>{m.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: m.color, fontFamily: "monospace" }}>{m.value}{m.label === "Compliance" ? "%" : ""}</span>
                </div>
                <div style={{ height: 6, background: "var(--input)", borderRadius: 3 }}>
                  <div style={{ height: "100%", width: `${Math.min(100, m.value)}%`, background: m.color, borderRadius: 3 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Roadmap Tab ───────────────────────────────────────────────────────────────

function RoadmapTab() {
  const [selected, setSelected] = useState<typeof ROADMAP_PHASES[0]["initiatives"][0] | null>(null);
  const totalWeeks = 42;

  return (
    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: NAV }}>Security Program Roadmap</div>
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>AI-generated 42-week program · Based on NIST CSF 2.0 + ISO 27001:2022</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {ROADMAP_PHASES.map(p => (
            <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
              <span style={{ fontSize: 10, color: "#6B7280", fontWeight: 600 }}>{p.name}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 24px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
        <div style={{ display: "flex", marginBottom: 8 }}>
          <div style={{ width: 160, flexShrink: 0 }} />
          {Array.from({ length: totalWeeks }, (_, i) => i + 1).filter(w => w % 4 === 0).map(w => (
            <div key={w} style={{ flex: 4, textAlign: "center", fontSize: 9, color: "var(--muted-foreground)", fontWeight: 600 }}>W{w}</div>
          ))}
        </div>

        {ROADMAP_PHASES.map(phase => (
          <div key={phase.name} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 0, height: 32, marginBottom: 4 }}>
              <div style={{ width: 160, flexShrink: 0, fontSize: 11, fontWeight: 800, color: phase.color }}>{phase.name}</div>
              <div style={{ flex: totalWeeks, position: "relative", height: 24, background: "var(--card)", borderRadius: 4 }}>
                {phase.start < totalWeeks && (
                  <div style={{
                    position: "absolute",
                    left: `${(phase.start / totalWeeks) * 100}%`,
                    width: phase.weeks > 0 ? `${(phase.weeks / totalWeeks) * 100}%` : "10%",
                    height: "100%",
                    background: phase.color,
                    borderRadius: 4,
                    opacity: 0.85,
                    display: "flex",
                    alignItems: "center",
                    padding: "0 8px",
                    overflow: "hidden",
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "white", whiteSpace: "nowrap" }}>
                      {phase.name}{phase.weeks > 0 ? ` · ${phase.weeks}w` : " · Ongoing"}
                    </span>
                  </div>
                )}
              </div>
            </div>
            {phase.initiatives.map(ini => (
              <div key={ini.title} style={{ display: "flex", alignItems: "center", height: 28, cursor: "pointer" }}
                onClick={() => setSelected(selected?.title === ini.title ? null : ini)}>
                <div style={{ width: 160, flexShrink: 0, paddingLeft: 12, fontSize: 10, color: selected?.title === ini.title ? NAV : "#6B7280", fontWeight: selected?.title === ini.title ? 700 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ini.title}</div>
                <div style={{ flex: totalWeeks, position: "relative", height: 16, borderRadius: 2 }}>
                  <div style={{
                    position: "absolute",
                    left: `${(phase.start / totalWeeks) * 100}%`,
                    width: `${(ini.effort / totalWeeks) * 100 * 1.5}%`,
                    height: "100%",
                    background: selected?.title === ini.title ? phase.color : `${phase.color}60`,
                    borderRadius: 2,
                    border: selected?.title === ini.title ? `1.5px solid ${phase.color}` : "none",
                    transition: "all 0.15s",
                  }} />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {selected && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)", display: "flex", gap: 20 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: NAV, marginBottom: 4 }}>{selected.title}</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <span style={{ background: riskBadge[selected.priority]!.bg, border: `1px solid ${riskBadge[selected.priority]!.border}`, color: riskBadge[selected.priority]!.color, borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{selected.priority}</span>
              <span style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(99,179,237,0.25)", color: NAV, borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{selected.effort}w effort</span>
            </div>
            <div style={{ fontSize: 11, color: "#6B7280" }}>Frameworks: {selected.frameworks.join(", ")}</div>
          </div>
          <div style={{ padding: "8px 14px", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(52,211,153,0.25)", borderRadius: 8, fontSize: 11, fontWeight: 700, color: EME }}>
            ✓ Success: {selected.metric}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Briefing Tab ──────────────────────────────────────────────────────────────

function BriefingTab() {
  const [content, setContent] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [period, setPeriod] = useState("Q2 2026");
  const [generated, setGenerated] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null);
  const token = localStorage.getItem("grc_token");

  async function handleExport(format: "pdf" | "docx") {
    if (!content || exporting) return;
    setExporting(format);
    try {
      await exportContent(content, format, `Executive-Security-Briefing-${period}`, token);
    } catch {
      alert("Export failed. Please try again.");
    } finally {
      setExporting(null);
    }
  }

  async function generate() {
    if (streaming) return;
    setContent("");
    setStreaming(true);
    setGenerated(false);
    try {
      const resp = await fetch(`${BASE_URL}/api/ai/vciso/briefing`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ period, context: "Enterprise GRC platform, 1,130 assets, 47 open risks, ISO 27001 at 87%" }),
      });
      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value).split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const d = JSON.parse(line.slice(6)) as { content?: string; done?: boolean };
              if (d.content) { full += d.content; setContent(full); }
              if (d.done) setGenerated(true);
            } catch { /* skip */ }
          }
        }
      }
    } catch {
      setContent("Error generating briefing. Please check your connection.");
    } finally {
      setStreaming(false);
      setGenerated(true);
    }
  }

  return (
    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <select value={period} onChange={e => setPeriod(e.target.value)}
          style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 600, color: "var(--foreground)", background: "var(--card)", fontFamily: "inherit", cursor: "pointer" }}>
          {["Q2 2026", "Q1 2026", "Annual 2025", "H2 2025"].map(p => <option key={p}>{p}</option>)}
        </select>
        <button onClick={generate} disabled={streaming}
          style={{ background: `linear-gradient(135deg, ${NAV}, ${EME})`, border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 12, fontWeight: 700, color: "white", cursor: streaming ? "not-allowed" : "pointer", opacity: streaming ? 0.7 : 1, fontFamily: "inherit" }}>
          {streaming ? "◆ Generating..." : "◆ Generate Briefing"}
        </button>
        {generated && (
          <>
            <button onClick={() => handleExport("pdf")} disabled={!!exporting}
              style={{ border: "1px solid var(--border)", background: "var(--card)", borderRadius: 8, padding: "8px 18px", fontSize: 12, fontWeight: 700, color: "var(--foreground)", cursor: exporting ? "not-allowed" : "pointer", opacity: exporting === "pdf" ? 0.6 : 1, fontFamily: "inherit" }}>
              {exporting === "pdf" ? "Exporting…" : "↓ Export PDF"}
            </button>
            <button onClick={() => handleExport("docx")} disabled={!!exporting}
              style={{ border: "1px solid var(--border)", background: "var(--card)", borderRadius: 8, padding: "8px 18px", fontSize: 12, fontWeight: 700, color: "var(--foreground)", cursor: exporting ? "not-allowed" : "pointer", opacity: exporting === "docx" ? 0.6 : 1, fontFamily: "inherit" }}>
              {exporting === "docx" ? "Exporting…" : "↓ Export Word"}
            </button>
          </>
        )}
      </div>

      {!content && !streaming && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "60px 24px", textAlign: "center", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>◆</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: NAV, marginBottom: 8 }}>Executive Security Briefing</div>
          <div style={{ fontSize: 12, color: "var(--muted-foreground)", maxWidth: 400, margin: "0 auto" }}>
            Generate a board-ready executive briefing with AI-powered analysis of your security posture, compliance status, and strategic recommendations.
          </div>
        </div>
      )}

      {(content || streaming) && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "24px 28px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)", maxHeight: "calc(100vh - 260px)", overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
            <div style={{ width: 28, height: 28, background: `linear-gradient(135deg, ${NAV}, ${EME})`, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--card)" }}>◆</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: NAV }}>Executive Security Briefing — {period}</div>
              <div style={{ fontSize: 10, color: "var(--muted-foreground)" }}>AIGO-X AI vCISO · {new Date().toLocaleDateString()}</div>
            </div>
          </div>
          <StreamingText text={content} streaming={streaming} />
        </div>
      )}
    </div>
  );
}

// ── Q&A Tab ───────────────────────────────────────────────────────────────────

function QATab() {
  const [messages, setMessages] = useState<{ role: "user" | "ai"; text: string }[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const token = localStorage.getItem("grc_token");

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const suggestions = [
    "What are our top 3 critical risks this quarter?",
    "How do we compare to ISO 27001 best practices?",
    "Which vulnerabilities have the highest CVSS scores?",
    "What's the ROI of our security investments?",
    "Generate a board-level risk summary",
  ];

  async function ask(q?: string) {
    const question = q ?? input;
    if (!question.trim() || streaming) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", text: question }]);
    setStreaming(true);

    try {
      const resp = await fetch(`${BASE_URL}/api/ai/vciso/qa`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ question, context: "Enterprise GRC, 1,130 assets, NIST CSF, ISO 27001, SOC 2" }),
      });
      let aiText = "";
      setMessages(prev => [...prev, { role: "ai", text: "" }]);
      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split("\n")) {
          if (line.startsWith("data: ")) {
            try {
              const d = JSON.parse(line.slice(6)) as { content?: string; done?: boolean };
              if (d.content) {
                aiText += d.content;
                setMessages(prev => { const u = [...prev]; u[u.length - 1] = { role: "ai", text: aiText }; return u; });
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch {
      setMessages(prev => [...prev, { role: "ai", text: "Connection error. Please try again." }]);
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12, height: "calc(100vh - 180px)" }}>
      {messages.length === 0 && (
        <div style={{ textAlign: "center", padding: "32px 24px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: NAV, marginBottom: 12 }}>Ask the AI vCISO anything about your security posture</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
            {suggestions.map(s => (
              <button key={s} onClick={() => ask(s)}
                style={{ border: "1px solid var(--border)", background: "var(--card)", borderRadius: 20, padding: "6px 14px", fontSize: 11, fontWeight: 600, color: "var(--foreground)", cursor: "pointer", fontFamily: "inherit" }}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", gap: 8 }}>
            {msg.role === "ai" && (
              <div style={{ width: 28, height: 28, background: `linear-gradient(135deg, ${NAV}, ${EME})`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "white", flexShrink: 0, marginTop: 2 }}>◆</div>
            )}
            <div style={{
              maxWidth: "78%",
              background: msg.role === "user" ? `linear-gradient(135deg, ${NAV}, ${EME})` : "white",
              border: msg.role === "user" ? "none" : "1px solid var(--border)",
              borderRadius: 12, padding: "12px 16px",
              color: msg.role === "user" ? "white" : "var(--foreground)",
              boxShadow: msg.role === "ai" ? "0 2px 8px rgba(0,0,0,0.06)" : "none",
            }}>
              {msg.role === "ai" ? <StreamingText text={msg.text} streaming={streaming && i === messages.length - 1} /> : <div style={{ fontSize: 13 }}>{msg.text}</div>}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 12px" }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && ask()}
          placeholder="Ask about risks, compliance, vulnerabilities, strategy..." disabled={streaming}
          style={{ flex: 1, border: "none", outline: "none", fontSize: 13, color: "var(--foreground)", background: "transparent", fontFamily: "inherit" }} />
        <button onClick={() => ask()} disabled={streaming}
          style={{ background: `linear-gradient(135deg, ${NAV}, ${EME})`, border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, color: "white", cursor: "pointer", fontFamily: "inherit" }}>
          {streaming ? "●" : "Ask"}
        </button>
      </div>
    </div>
  );
}

// ── Impact Matrix Tab ─────────────────────────────────────────────────────────

function MatrixTab() {
  const token = getStoredToken();
  const [hovered, setHovered] = useState<{id:string;title:string;impact:number;effort:number;priority:string} | null>(null);
  const [generating, setGenerating] = useState(false);
  const W = 560, H = 400, PAD = 50;
  const plotW = W - PAD * 2;
  const plotH = H - PAD * 2;
  const colors: Record<string, string> = { Critical: "#DC2626", High: "#D97706", Medium: "#1D4ED8", Low: EME };

  const { data: analysis, isLoading, refetch } = useQuery<AnalysisResult>({
    queryKey: ["ai", "analyze"],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/ai/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Analysis failed");
      return res.json() as Promise<AnalysisResult>;
    },
    staleTime: 10 * 60_000,
    enabled: !!token,
  });

  const matrixData = analysis?.matrixItems ?? [];

  async function regenerate() {
    setGenerating(true);
    await refetch();
    setGenerating(false);
  }

  return (
    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: NAV }}>Remediation Priority Matrix</div>
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>Impact × Effort scoring — AI-prioritized from live risk register</div>
        </div>
        <button onClick={regenerate} disabled={isLoading || generating}
          style={{ background: `linear-gradient(135deg, ${NAV}, ${EME})`, border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 11, fontWeight: 700, color: "white", cursor: isLoading || generating ? "not-allowed" : "pointer", opacity: isLoading || generating ? 0.7 : 1, fontFamily: "inherit" }}>
          {isLoading || generating ? "◆ Analysing..." : "◆ Refresh Analysis"}
        </button>
      </div>

      {isLoading ? (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "60px 24px", textAlign: "center", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
          <div style={{ fontSize: 24, marginBottom: 12 }}>◆</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: NAV, marginBottom: 6 }}>Analysing live risk data…</div>
          <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>AI is computing impact × effort scores from your risk register</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16 }}>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
            <svg width={W} height={H} style={{ overflow: "visible" }}>
              <defs>
                <pattern id="grid" width="56" height="40" patternUnits="userSpaceOnUse" x={PAD} y={PAD}>
                  <path d="M 56 0 L 0 0 0 40" fill="none" stroke="var(--border)" strokeWidth="1" />
                </pattern>
              </defs>
              <rect x={PAD} y={PAD} width={plotW} height={plotH} fill="url(#grid)" stroke="rgba(255,255,255,0.1)" strokeWidth="1" rx="4" />
              <rect x={PAD} y={PAD} width={plotW / 2} height={plotH / 2} fill="#ECFDF520" />
              <rect x={PAD + plotW / 2} y={PAD} width={plotW / 2} height={plotH / 2} fill="#FEF2F220" />
              <rect x={PAD} y={PAD + plotH / 2} width={plotW / 2} height={plotH / 2} fill="#FFFBEB20" />
              <rect x={PAD + plotW / 2} y={PAD + plotH / 2} width={plotW / 2} height={plotH / 2} fill="#F9FAFB20" />
              <text x={PAD + plotW / 4} y={PAD + plotH / 4} textAnchor="middle" fill="#10B98130" fontSize="12" fontWeight="800">Quick Wins</text>
              <text x={PAD + plotW * 3 / 4} y={PAD + plotH / 4} textAnchor="middle" fill="#DC262630" fontSize="12" fontWeight="800">Major Projects</text>
              <text x={PAD + plotW / 4} y={PAD + plotH * 3 / 4} textAnchor="middle" fill="#9CA3AF30" fontSize="12" fontWeight="800">Fill-ins</text>
              <text x={PAD + plotW * 3 / 4} y={PAD + plotH * 3 / 4} textAnchor="middle" fill="#9CA3AF30" fontSize="12" fontWeight="800">Thankless Tasks</text>
              <line x1={PAD} y1={PAD + plotH / 2} x2={PAD + plotW} y2={PAD + plotH / 2} stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" strokeDasharray="4 4" />
              <line x1={PAD + plotW / 2} y1={PAD} x2={PAD + plotW / 2} y2={PAD + plotH} stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" strokeDasharray="4 4" />
              {[1, 3, 5, 7, 9].map(v => (
                <g key={v}>
                  <text x={PAD + ((v - 1) / 8) * plotW + 14} y={H - 8} fill="var(--muted-foreground)" fontSize="10" textAnchor="middle">{v}</text>
                  <text x={12} y={PAD + plotH - ((v - 1) / 8) * plotH} fill="var(--muted-foreground)" fontSize="10" textAnchor="middle" dominantBaseline="middle">{v}</text>
                </g>
              ))}
              <text x={W / 2} y={H - 2} fill="var(--muted-foreground)" fontSize="11" textAnchor="middle" fontWeight="600">Effort →</text>
              <text x={10} y={H / 2} fill="var(--muted-foreground)" fontSize="11" textAnchor="middle" fontWeight="600" transform={`rotate(-90, 10, ${H / 2})`}>Impact ↑</text>
              {matrixData.map(item => {
                const cx = PAD + ((item.effort - 1) / 9) * plotW;
                const cy = PAD + plotH - ((item.impact - 1) / 9) * plotH;
                const col = colors[item.priority] ?? EME;
                const isH = hovered?.id === item.id;
                return (
                  <g key={item.id} onMouseEnter={() => setHovered(item)} onMouseLeave={() => setHovered(null)} style={{ cursor: "pointer" }}>
                    <circle cx={cx} cy={cy} r={isH ? 10 : 7} fill={col} opacity={0.9} stroke="white" strokeWidth={isH ? 2 : 1.5} />
                    {isH && <text x={cx} y={cy - 14} textAnchor="middle" fill={col} fontSize="9" fontWeight="700">{item.title}</text>}
                  </g>
                );
              })}
              {matrixData.length === 0 && (
                <text x={W / 2} y={H / 2} textAnchor="middle" fill="var(--muted-foreground)" fontSize="13" fontWeight="600">Run analysis to populate matrix</text>
              )}
            </svg>
          </div>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
            <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", fontSize: 12, fontWeight: 700, color: NAV }}>Priority List</div>
            <div style={{ overflowY: "auto", maxHeight: 360 }}>
              {[...matrixData].sort((a, b) => (b.impact - b.effort * 0.3) - (a.impact - a.effort * 0.3)).map((item, i) => (
                <div key={item.id} style={{ padding: "9px 14px", borderBottom: "1px solid var(--border)", cursor: "pointer", background: hovered?.id === item.id ? "var(--secondary)" : "" }}
                  onMouseEnter={() => setHovered(item)} onMouseLeave={() => setHovered(null)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 18, height: 18, borderRadius: "50%", background: i < 3 ? `linear-gradient(135deg, ${NAV}, ${EME})` : "var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: i < 3 ? "white" : "var(--muted-foreground)", flexShrink: 0 }}>{i + 1}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.title}</div>
                      <div style={{ fontSize: 10, color: "var(--muted-foreground)" }}>Impact {item.impact} · Effort {item.effort}</div>
                    </div>
                    <span style={{ background: riskBadge[item.priority]?.bg ?? "#EEF2FF", border: `1px solid ${riskBadge[item.priority]?.border ?? "#C7D2FE"}`, color: riskBadge[item.priority]?.color ?? "#3730A3", borderRadius: 3, padding: "1px 5px", fontSize: 9, fontWeight: 700, flexShrink: 0 }}>{item.priority}</span>
                  </div>
                </div>
              ))}
              {matrixData.length === 0 && (
                <div style={{ padding: "20px 14px", fontSize: 11, color: "var(--muted-foreground)", textAlign: "center" }}>Click "Refresh Analysis" to generate AI-scored matrix</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Board View Tab ─────────────────────────────────────────────────────────────

interface BoardKpis {
  kpis: {
    openRisks: number;
    criticalRisks: number;
    highRisks: number;
    openFindings: number;
    avgCompliance: number;
    avgMaturity: string;
    frameworks: number;
  };
  topRisks: Array<{ name: string; score: number; severity: string }>;
  complianceFrameworks: Array<{ framework: string; pct: number; implemented: number; total: number }>;
  maturityDomains: Array<{ domain: string; score: number; target: number }>;
  generatedAt: string;
}

function BoardTab() {
  const token = getStoredToken();
  const [reportContent, setReportContent] = useState("");
  const [reportStreaming, setReportStreaming] = useState(false);
  const [reportGenerated, setReportGenerated] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null);

  async function handleExport(format: "pdf" | "docx") {
    if (!reportContent || exporting) return;
    setExporting(format);
    try {
      await exportContent(reportContent, format, "Board-Security-Report", token);
    } catch {
      alert("Export failed. Please try again.");
    } finally {
      setExporting(null);
    }
  }

  const { data: boardData, isLoading } = useQuery<BoardKpis>({
    queryKey: ["ai", "board-kpis"],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/ai/vciso/board-kpis`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Board KPIs failed");
      return res.json() as Promise<BoardKpis>;
    },
    staleTime: 5 * 60_000,
    enabled: !!token,
  });

  async function generateBoardReport() {
    if (reportStreaming) return;
    setReportContent("");
    setReportStreaming(true);
    setReportGenerated(false);
    try {
      const contextSummary = boardData
        ? `Open risks: ${boardData.kpis.openRisks} (${boardData.kpis.criticalRisks} Critical, ${boardData.kpis.highRisks} High). Open findings: ${boardData.kpis.openFindings}. Avg compliance: ${boardData.kpis.avgCompliance}%. Security maturity: ${boardData.kpis.avgMaturity}/5.`
        : "";
      const resp = await fetch(`${BASE_URL}/api/ai/vciso/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          query: "Generate a comprehensive board-ready security posture report for this quarter.",
          type: "board-report",
          context: contextSummary,
        }),
      });
      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split("\n")) {
          if (line.startsWith("data: ")) {
            try {
              const d = JSON.parse(line.slice(6)) as { content?: string; done?: boolean };
              if (d.content) { full += d.content; setReportContent(full); }
              if (d.done) setReportGenerated(true);
            } catch { /* skip */ }
          }
        }
      }
    } catch {
      setReportContent("Error generating board report. Please check your connection.");
    } finally {
      setReportStreaming(false);
      setReportGenerated(true);
    }
  }

  const kpis = boardData?.kpis;
  const severityColor: Record<string, string> = { Critical: "#DC2626", High: "#D97706", Medium: "#1D4ED8", Low: EME };
  const complianceColor = (pct: number) => pct >= 90 ? EME : pct >= 75 ? "#D97706" : "#DC2626";
  const complianceStatus = (pct: number) => pct >= 90 ? "Compliant" : pct >= 75 ? "In Progress" : "At Risk";

  return (
    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: NAV }}>Board Presentation Data</div>
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>Live security posture summary pulled from your GRC data</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={generateBoardReport} disabled={reportStreaming}
            style={{ background: `linear-gradient(135deg, ${NAV}, ${EME})`, border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, color: "white", cursor: reportStreaming ? "not-allowed" : "pointer", opacity: reportStreaming ? 0.7 : 1, fontFamily: "inherit" }}>
            {reportStreaming ? "◆ Generating..." : "◆ Generate Board Report"}
          </button>
          {reportGenerated && (
            <>
              <button onClick={() => handleExport("pdf")} disabled={!!exporting}
                style={{ border: "1px solid var(--border)", background: "var(--card)", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, color: "var(--foreground)", cursor: exporting ? "not-allowed" : "pointer", opacity: exporting === "pdf" ? 0.6 : 1, fontFamily: "inherit" }}>
                {exporting === "pdf" ? "Exporting…" : "↓ Export PDF"}
              </button>
              <button onClick={() => handleExport("docx")} disabled={!!exporting}
                style={{ border: "1px solid var(--border)", background: "var(--card)", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, color: "var(--foreground)", cursor: exporting ? "not-allowed" : "pointer", opacity: exporting === "docx" ? 0.6 : 1, fontFamily: "inherit" }}>
                {exporting === "docx" ? "Exporting…" : "↓ Export Word"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Live KPI Cards */}
      {isLoading ? (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "24px", textAlign: "center", fontSize: 12, color: "var(--muted-foreground)" }}>◆ Loading live KPIs…</div>
      ) : kpis ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {[
            { label: "Open Risks", value: String(kpis.openRisks), note: `${kpis.criticalRisks} Critical, ${kpis.highRisks} High`, color: kpis.criticalRisks > 0 ? "#DC2626" : "#D97706" },
            { label: "Open Findings", value: String(kpis.openFindings), note: "Require attention", color: kpis.openFindings > 10 ? "#DC2626" : "#D97706" },
            { label: "Avg Compliance", value: `${kpis.avgCompliance}%`, note: `Across ${kpis.frameworks} frameworks`, color: complianceColor(kpis.avgCompliance) },
            { label: "Security Maturity", value: `${kpis.avgMaturity}/5`, note: "Average domain score", color: Number(kpis.avgMaturity) >= 3.5 ? EME : "#D97706" },
          ].map(m => (
            <div key={m.label} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: m.color, borderRadius: "12px 12px 0 0" }} />
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>{m.label}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: m.color, fontFamily: "monospace", marginBottom: 4 }}>{m.value}</div>
              <div style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{m.note}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Top Risks */}
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: NAV, marginBottom: 14 }}>Top Risks for Board Awareness</div>
          {isLoading ? (
            <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>Loading live risks…</div>
          ) : boardData?.topRisks?.length ? (
            boardData.topRisks.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: severityColor[r.severity] ?? "#D97706", flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: 12, color: "var(--foreground)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 800, color: severityColor[r.severity] ?? "#D97706" }}>{r.score}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: severityColor[r.severity] ?? "#D97706", background: `${severityColor[r.severity] ?? "#D97706"}15`, borderRadius: 3, padding: "1px 5px" }}>{r.severity}</span>
                </div>
              </div>
            ))
          ) : (
            <div style={{ fontSize: 11, color: "var(--muted-foreground)", fontStyle: "italic" }}>No open risks — looking good!</div>
          )}
        </div>

        {/* Compliance Status */}
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: NAV, marginBottom: 14 }}>Compliance Status</div>
          {isLoading ? (
            <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>Loading compliance data…</div>
          ) : boardData?.complianceFrameworks?.length ? (
            boardData.complianceFrameworks.map(f => {
              const col = complianceColor(f.pct);
              return (
                <div key={f.framework} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--foreground)" }}>{f.framework}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: col, fontFamily: "monospace" }}>{f.pct}%</span>
                      <span style={{ fontSize: 9, color: col, fontWeight: 700 }}>{complianceStatus(f.pct)}</span>
                    </div>
                  </div>
                  <div style={{ height: 5, background: "var(--input)", borderRadius: 3 }}>
                    <div style={{ height: "100%", width: `${f.pct}%`, background: col, borderRadius: 3 }} />
                  </div>
                </div>
              );
            })
          ) : (
            <div style={{ fontSize: 11, color: "var(--muted-foreground)", fontStyle: "italic" }}>No compliance framework data — onboard a framework to see coverage.</div>
          )}
        </div>
      </div>

      {/* AI Board Report */}
      {(reportContent || reportStreaming) && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "24px 28px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
            <div style={{ width: 28, height: 28, background: `linear-gradient(135deg, ${NAV}, ${EME})`, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "white" }}>◆</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: NAV }}>Board Security Report — AI Generated</div>
              <div style={{ fontSize: 10, color: "var(--muted-foreground)" }}>AIGO-X AI vCISO · {new Date().toLocaleDateString()} · Based on live GRC data</div>
            </div>
            {reportGenerated && (
              <div style={{ marginLeft: "auto", fontSize: 10, color: EME, fontWeight: 700, background: "rgba(6,95,70,0.08)", border: "1px solid rgba(52,211,153,0.25)", borderRadius: 4, padding: "2px 8px" }}>● Complete</div>
            )}
          </div>
          <StreamingText text={reportContent} streaming={reportStreaming} />
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AIvCISO() {
  const [tab, setTab] = useState("overview");
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 52px)", background: "#F9F8F6" }}>
      <div style={{ background: "var(--card)", borderBottom: "1px solid var(--border)", padding: "12px 24px 0", flexShrink: 0 }}>
        <div style={{ marginBottom: 0 }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: NAV, letterSpacing: "-0.5px", margin: "0 0 2px" }}>AI vCISO</h1>
          <p style={{ fontSize: 11, color: "var(--muted-foreground)", margin: 0, fontWeight: 500 }}>Intelligent security advisor · Streaming briefings · NL risk analysis · Impact scoring</p>
        </div>
      </div>
      <SubNav tabs={TABS} active={tab} onSelect={setTab} />
      <AICopilotBar module="ai" />
      <div style={{ flex: 1, overflowY: "auto" }}>
        {tab === "overview"  && <OverviewTab />}
        {tab === "roadmap"   && <RoadmapTab />}
        {tab === "briefing"  && <BriefingTab />}
        {tab === "qa"        && <QATab />}
        {tab === "matrix"    && <MatrixTab />}
        {tab === "board"     && <BoardTab />}
      </div>
    </div>
  );
}
