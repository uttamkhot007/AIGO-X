import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";

const NAV = "#1E3A5F";
const EME = "#065F46";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "").replace(/\/grc-platform$/, "");

interface Message {
  role: "user" | "ai";
  text: string;
  timestamp: Date;
}

const MODULE_CONTEXTS: Record<string, string> = {
  "/":            "Executive GRC Dashboard — overall risk posture, compliance overview, and KPIs",
  "/govops":      "Governance & Policy Management — policies, processes, procedures, frameworks",
  "/riskops":     "Risk Operations — risk register, risk scoring, FAIR model, treatment plans",
  "/complianceops":"Compliance Operations — framework coverage, audit readiness, control status",
  "/serviceops":  "Service Operations — service catalog, SLA management, service delivery",
  "/secops":      "Security Operations — vulnerability management, threat intelligence, SOC",
  "/assetops":    "Asset Operations — asset inventory, CAASM, asset lifecycle",
  "/cloudops":    "Cloud Operations — CSPM, cloud configuration, multi-cloud posture",
  "/privacyops":  "Privacy Operations — GDPR, CCPA, DSAR management, data protection",
  "/dataops":     "Data Operations — DSPM, data classification, data lineage",
  "/analyticsops":"Analytics & BI — GRC metrics, dashboards, trend analysis",
  "/ai":          "AI vCISO — security program roadmap, executive briefings, risk Q&A",
  "/admin":       "Admin Portal — tenant management, user administration",
  "/settings":    "Platform Settings — agents, users, roles, integrations, notifications",
};

const SUGGESTIONS_BY_MODULE: Record<string, string[]> = {
  "/":            ["What are our top 3 risks this week?", "Generate a board summary", "What's our compliance trend?"],
  "/riskops":     ["Score our top risks using FAIR model", "Which risks need immediate treatment?", "Compare risk vs industry benchmarks"],
  "/secops":      ["What CVEs require immediate patching?", "Summarize our threat landscape", "Generate incident response playbook"],
  "/complianceops":["What's our ISO 27001 readiness?", "Which controls are at risk?", "Draft an audit response"],
  "/privacyops":  ["How are we tracking on GDPR Article 32?", "Summarize open DSARs", "Any DPIA action items?"],
  "/ai":          ["Generate Q2 security briefing", "What's our biggest risk?", "Create remediation roadmap"],
};

function getContext(location: string) {
  const key = Object.keys(MODULE_CONTEXTS).find(k => k !== "/" && location.startsWith(k)) ?? "/";
  return MODULE_CONTEXTS[key] ?? MODULE_CONTEXTS["/"]!;
}

function getSuggestions(location: string) {
  const key = Object.keys(SUGGESTIONS_BY_MODULE).find(k => k !== "/" && location.startsWith(k)) ?? "/";
  return SUGGESTIONS_BY_MODULE[key] ?? SUGGESTIONS_BY_MODULE["/"]!;
}

interface AIAssistantProps {
  open: boolean;
  onClose: () => void;
}

interface LiveInsight {
  type: "critical" | "warning" | "info";
  text: string;
  action: string;
}

export function AIAssistant({ open, onClose }: AIAssistantProps) {
  const [location] = useLocation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [convId, setConvId] = useState<number | null>(null);
  const [reportStreaming, setReportStreaming] = useState(false);
  const [insights, setInsights] = useState<LiveInsight[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const token = localStorage.getItem("grc_token");
  const ctx = getContext(location);
  const suggestions = getSuggestions(location);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    setConvId(null);
    setMessages([]);
  }, [location]);

  useEffect(() => {
    if (!open || !token || insights.length > 0) return;
    setInsightsLoading(true);
    fetch(`${BASE}/api/ai/vciso/insights`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    })
      .then(r => r.json())
      .then((d: { insights?: LiveInsight[] }) => { if (d.insights) setInsights(d.insights); })
      .catch(() => {})
      .finally(() => setInsightsLoading(false));
  }, [open]);

  async function initConv() {
    if (convId) return convId;
    const r = await fetch(`${BASE}/api/ai/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: `AI Assistant — ${ctx.split("—")[0]?.trim()}`, context: ctx }),
    });
    const data = await r.json() as { id: number };
    setConvId(data.id);
    return data.id;
  }

  async function sendMessage(q?: string) {
    const question = q ?? input;
    if (!question.trim() || streaming) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", text: question, timestamp: new Date() }]);
    setStreaming(true);

    try {
      const cid = await initConv();
      const resp = await fetch(`${BASE}/api/ai/conversations/${cid}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: question, context: ctx }),
      });

      let aiText = "";
      setMessages(prev => [...prev, { role: "ai", text: "", timestamp: new Date() }]);
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
                setMessages(prev => {
                  const u = [...prev];
                  u[u.length - 1] = { role: "ai", text: aiText, timestamp: new Date() };
                  return u;
                });
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch {
      setMessages(prev => [...prev, { role: "ai", text: "Connection error. Please try again.", timestamp: new Date() }]);
    } finally {
      setStreaming(false);
    }
  }

  async function generateReport() {
    if (reportStreaming) return;
    setReportStreaming(true);
    setMessages(prev => [...prev, { role: "user", text: "Generate a comprehensive security report for this module", timestamp: new Date() }]);

    try {
      const resp = await fetch(`${BASE}/api/ai/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type: ctx.split("—")[0]?.trim() ?? "Security", context: ctx }),
      });

      let aiText = "";
      setMessages(prev => [...prev, { role: "ai", text: "", timestamp: new Date() }]);
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
                setMessages(prev => {
                  const u = [...prev];
                  u[u.length - 1] = { role: "ai", text: aiText, timestamp: new Date() };
                  return u;
                });
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch {
      setMessages(prev => [...prev, { role: "ai", text: "Report generation failed. Please try again.", timestamp: new Date() }]);
    } finally {
      setReportStreaming(false);
    }
  }

  function clearHistory() {
    setMessages([]);
    setConvId(null);
  }

  if (!open) return null;

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.2)", zIndex: 199, backdropFilter: "blur(2px)" }} />

      <div style={{
        position: "fixed", right: 0, top: 0, bottom: 0, width: 420,
        background: "white", zIndex: 200,
        display: "flex", flexDirection: "column",
        boxShadow: "-8px 0 40px rgba(0,0,0,0.15)",
        borderLeft: "1px solid #E5E7EB",
        animation: "slideIn 0.25s ease",
      }}>
        <style>{`@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>

        <div style={{ padding: "14px 16px", borderBottom: "1px solid #F3F4F6", background: `linear-gradient(135deg, ${NAV}, ${EME})`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 28, height: 28, background: "rgba(255,255,255,0.2)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "white" }}>◆</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "white" }}>AIGO-X AI Assistant</div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.7)", marginTop: 1 }}>● Context-aware · Streaming · GRC Intelligence</div>
              </div>
            </div>
            <button onClick={onClose} style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 6, width: 26, height: 26, cursor: "pointer", color: "white", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
          </div>
          <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 8, padding: "6px 10px", fontSize: 10, color: "rgba(255,255,255,0.9)", fontWeight: 600 }}>
            📍 Context: {ctx}
          </div>
        </div>

        <div style={{ padding: "8px 12px", borderBottom: "1px solid #F3F4F6", display: "flex", gap: 8, flexShrink: 0 }}>
          <button onClick={generateReport} disabled={reportStreaming}
            style={{ flex: 1, background: reportStreaming ? "#F3F4F6" : `linear-gradient(135deg, ${NAV}15, ${EME}15)`, border: `1px solid ${reportStreaming ? "#E5E7EB" : NAV + "30"}`, borderRadius: 8, padding: "7px 12px", fontSize: 11, fontWeight: 700, color: reportStreaming ? "#9CA3AF" : NAV, cursor: reportStreaming ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            {reportStreaming ? "◆ Generating..." : "◆ Generate Report"}
          </button>
          <button onClick={clearHistory}
            style={{ border: "1px solid #E5E7EB", background: "white", borderRadius: 8, padding: "7px 12px", fontSize: 11, fontWeight: 700, color: "#9CA3AF", cursor: "pointer", fontFamily: "inherit" }}>
            Clear
          </button>
        </div>

        {/* Live AI Insights */}
        {(insightsLoading || insights.length > 0) && messages.length === 0 && (
          <div style={{ padding: "10px 12px", borderBottom: "1px solid #F3F4F6", flexShrink: 0 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 6 }}>● Live Security Insights</div>
            {insightsLoading ? (
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>Analysing your security posture…</div>
            ) : insights.map((ins, i) => (
              <div key={i} style={{ marginBottom: 6, background: ins.type === "critical" ? "rgba(239,68,68,0.06)" : ins.type === "warning" ? "rgba(245,158,11,0.06)" : "rgba(16,185,129,0.06)", border: `1px solid ${ins.type === "critical" ? "#FECACA" : ins.type === "warning" ? "#FDE68A" : "#A7F3D0"}`, borderRadius: 8, padding: "7px 10px" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: ins.type === "critical" ? "#991B1B" : ins.type === "warning" ? "#92400E" : "#065F46", marginBottom: 2 }}>{ins.text}</div>
                <div style={{ fontSize: 10, color: "#6B7280" }}>→ {ins.action}</div>
              </div>
            ))}
          </div>
        )}

        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
          {messages.length === 0 && (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <div style={{ width: 48, height: 48, background: `linear-gradient(135deg, ${NAV}, ${EME})`, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "white", margin: "0 auto 12px" }}>◆</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: NAV, marginBottom: 6 }}>How can I help?</div>
              <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 16 }}>Ask anything about your current module</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {suggestions.map(s => (
                  <button key={s} onClick={() => sendMessage(s)}
                    style={{ border: "1px solid #E5E7EB", background: "white", borderRadius: 8, padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "#374151", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start", gap: 3 }}>
              {msg.role === "ai" && (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 16, height: 16, background: `linear-gradient(135deg, ${NAV}, ${EME})`, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, color: "white" }}>◆</div>
                  <span style={{ fontSize: 9, color: "#9CA3AF", fontWeight: 600 }}>AIGO-X AI</span>
                </div>
              )}
              <div style={{
                maxWidth: "88%",
                background: msg.role === "user" ? `linear-gradient(135deg, ${NAV}, ${EME})` : "#F9FAFB",
                border: msg.role === "user" ? "none" : "1px solid #F3F4F6",
                borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "4px 14px 14px 14px",
                padding: "10px 13px",
                fontSize: 12,
                lineHeight: 1.6,
                color: msg.role === "user" ? "white" : "#374151",
                whiteSpace: "pre-wrap",
              }}>
                {msg.text}
                {streaming && i === messages.length - 1 && msg.role === "ai" && (
                  <span style={{ display: "inline-block", width: 6, height: 12, background: NAV, borderRadius: 1, marginLeft: 3, verticalAlign: "middle", opacity: 0.7 }} />
                )}
              </div>
              <div style={{ fontSize: 9, color: "#D1D5DB" }}>
                {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: "10px 12px", borderTop: "1px solid #F3F4F6", display: "flex", gap: 8, flexShrink: 0 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
            placeholder="Ask about your security posture..."
            disabled={streaming}
            style={{ flex: 1, border: "1px solid #E5E7EB", borderRadius: 10, padding: "9px 12px", fontSize: 12, color: "#374151", background: "#F9FAFB", outline: "none", fontFamily: "inherit" }}
          />
          <button onClick={() => sendMessage()} disabled={streaming}
            style={{ background: `linear-gradient(135deg, ${NAV}, ${EME})`, border: "none", borderRadius: 10, padding: "9px 14px", fontSize: 12, fontWeight: 700, color: "white", cursor: streaming ? "not-allowed" : "pointer", opacity: streaming ? 0.6 : 1, fontFamily: "inherit" }}>
            {streaming ? "●" : "→"}
          </button>
        </div>
      </div>
    </>
  );
}
