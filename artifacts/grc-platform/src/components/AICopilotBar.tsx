import { useState, useRef, useEffect, useCallback } from "react";
import { useTheme } from "@/context/ThemeContext";
import { useOrg } from "@/context/OrgContext";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "").replace(/\/grc-platform$/, "");

export type CopilotModule =
  | "dashboard" | "govops" | "riskops" | "complianceops"
  | "serviceops" | "secops" | "assetops" | "cloudops"
  | "privacyops" | "dataops" | "analyticsops" | "ai"
  | "peopleops" | "workflows" | "aisecops";

interface CopilotConfig {
  context: string;
  insights: string[];
  suggestions: string[];
}

const COPILOT: Record<CopilotModule, CopilotConfig> = {
  dashboard: {
    context: "Executive GRC Dashboard — overall risk posture, compliance overview, and KPIs",
    insights: [
      "Overall GRC health: 82/100. Cloud and Risk modules driving a 3.2-point quarterly decline.",
      "ISO 27001 surveillance audit in 14 days — readiness at 87%. 18 controls still need evidence.",
      "Top threat this week: cloud misconfiguration. AI recommends running a CSPM scan before Thursday.",
    ],
    suggestions: ["Summarise this week's top risks", "What needs attention before the audit?", "Generate board-level security briefing"],
  },
  riskops: {
    context: "Risk Operations — risk register, risk scoring, FAIR model, treatment plans",
    insights: [
      "3 Critical risks exceed appetite. FAIR model estimates $2.4M max loss exposure for the cyber cluster.",
      "RK-2039 treatment overdue — assigned owner last active 12 days ago. Escalation recommended.",
      "AI suggests transferring cloud risk RK-2041 to cyber-insurance pool — cost vs residual analysis ready.",
    ],
    suggestions: ["Which risks need treatment this week?", "Score top risks using FAIR model", "Generate risk treatment recommendations"],
  },
  complianceops: {
    context: "Compliance Operations — framework coverage, audit readiness, control status",
    insights: [
      "ISO 27001 readiness: 87% — 18 controls pending evidence upload. Audit window opens in 14 days.",
      "SOC 2 Type II: 5 controls drifted since last audit period. Remediation actions required now.",
      "GDPR Article 32 gap: encryption at rest partially implemented across 3 data stores.",
    ],
    suggestions: ["What's our ISO 27001 readiness score?", "Which controls are drifting?", "Draft audit response for SOC 2"],
  },
  govops: {
    context: "Governance & Policy Management — policies, processes, procedures, frameworks",
    insights: [
      "Policy attestation: Sales dept at 57% — 3 policies overdue. SLA breach occurs Friday.",
      "Operations dept: 2 overdue attestations, 3 days until SLA breach. Auto-reminder sent.",
      "AI identified 2 policy improvement opportunities based on recent incident pattern data.",
    ],
    suggestions: ["Which policies need urgent attestation?", "Generate policy gap analysis", "Which departments are non-compliant?"],
  },
  serviceops: {
    context: "Service Operations — service catalog, SLA management, incident & change management",
    insights: [
      "SLA breach imminent: INC-2241 and INC-2244 (P2) breach in < 2 hours. Immediate action needed.",
      "Problem PRB-0023 linked to 7 repeat incidents this month — root cause still unresolved.",
      "AI correlates INC-2241 with change CR-0891 deployed last Tuesday — rollback candidate flagged.",
    ],
    suggestions: ["Which tickets are near SLA breach?", "Show open P1/P2 incidents", "Summarise this week's change risk"],
  },
  secops: {
    context: "Security Operations — vulnerability management, threat intelligence, SOC monitoring",
    insights: [
      "CVE-2024-3094 (Critical CVSS 10.0): 3 affected assets remain unpatched. Patch deadline: 48 hours.",
      "Threat intel: APT41 targeting financial sector. 2 TTPs detected match your environment right now.",
      "SIEM anomaly: unusual outbound data transfer from WS-0412 (14 GB at 02:14 UTC). Investigate.",
    ],
    suggestions: ["Which CVEs need immediate patching?", "Summarise our threat landscape", "Generate incident response playbook"],
  },
  assetops: {
    context: "Asset Operations — asset inventory, CAASM, asset lifecycle management",
    insights: [
      "47 assets have no assigned owner — creating security coverage gaps across the attack surface.",
      "12 assets running end-of-life software (Windows Server 2012, Python 2.7). Upgrade is urgent.",
      "Shadow IT detected: 3 unmanaged cloud SaaS applications are accessing corporate data.",
    ],
    suggestions: ["Show unowned assets", "Which assets run EOL software?", "Run shadow IT discovery scan"],
  },
  cloudops: {
    context: "Cloud Operations — CSPM, cloud configuration, multi-cloud security posture",
    insights: [
      "AWS us-east-1: 2 S3 buckets with public read access — PII exposure risk. Immediate action required.",
      "Cloud security posture score: 71/100. Top contributors: IAM misconfiguration (5 findings), open ports.",
      "Azure: MFA not enforced on 3 privileged accounts. Conditional Access policy update needed.",
    ],
    suggestions: ["Show my highest cloud risk findings", "Summarise IAM posture across clouds", "What's drifted since last scan?"],
  },
  privacyops: {
    context: "Privacy Operations — GDPR, CCPA, DSAR management, data protection",
    insights: [
      "2 DSARs approaching 30-day GDPR deadline — responses due Friday. Assignees have been notified.",
      "DPIA overdue for Project Mercury — AI-based personal data processing detected without review.",
      "Cookie consent non-compliance on 2 web properties. ICO guidance updated January 2025.",
    ],
    suggestions: ["Show DSARs approaching deadline", "Which DPIAs are overdue?", "Check GDPR Article 32 status"],
  },
  dataops: {
    context: "Data Operations — DSPM, data classification, data lineage, sensitive data discovery",
    insights: [
      "Sensitive data discovery: SSNs and PII found in 3 unclassified S3 buckets. Classification required.",
      "DSPM alert: 847 unencrypted credit card records detected in a dev environment database.",
      "Data lineage gap: 4 financial reports trace to ungoverned sources outside the data catalog.",
    ],
    suggestions: ["Where is sensitive data exposed?", "Show unclassified data stores", "Run DSPM scan on cloud storage"],
  },
  analyticsops: {
    context: "Analytics & BI — GRC metrics, dashboards, trend analysis, benchmarking",
    insights: [
      "GRC score trend: −3.2 pts this quarter. Cloud security and risk treatment velocity driving decline.",
      "Sector benchmark: your risk posture is 67th percentile. Top quartile requires 12 control improvements.",
      "Predictive model: 73% probability of a compliance finding in Q3 if current drift trend continues.",
    ],
    suggestions: ["Show our GRC trend this quarter", "How do we compare to sector benchmarks?", "What's our predicted compliance risk?"],
  },
  ai: {
    context: "AI vCISO — security program roadmap, executive briefings, risk Q&A, playbook generation",
    insights: [
      "AI vCISO generated 3 executive briefings and 2 remediation playbooks this week.",
      "Recommended: review Q2 security roadmap — 4 strategic initiatives stalled awaiting approval.",
      "Pattern detected: 78% of recent incidents share a common IAM misconfiguration root cause.",
    ],
    suggestions: ["Generate Q2 security briefing", "Create remediation roadmap", "What's our biggest unaddressed risk?"],
  },
  peopleops: {
    context: "People Operations — workforce risk, access reviews, HR compliance, security training",
    insights: [
      "3 employees with elevated privileged access are overdue for annual access certification review.",
      "Separation of duties conflict: 2 users can both approve and execute financial transactions.",
      "Security awareness training completion: 78% overall. HR dept lowest at 52% — deadline this Friday.",
    ],
    suggestions: ["Who hasn't completed security training?", "Show privileged access review status", "Flag SoD conflicts"],
  },
  workflows: {
    context: "Workflow Automation — GRC workflows, automation pipelines, approval chains",
    insights: [
      "5 active workflows are overdue — oldest is 'Risk Assessment Q1' at 12 days past its SLA.",
      "AI automation opportunity: 8 manual approval steps qualify for auto-approval rule configuration.",
      "Bottleneck detected: Compliance Review stage averaging 4.2 days vs 1-day SLA target.",
    ],
    suggestions: ["Show overdue workflows", "Where are the workflow bottlenecks?", "Which approvals can be automated?"],
  },
  aisecops: {
    context: "AI Security Operations — AI model inventory, threat detection, shadow AI discovery, AI posture & compliance",
    insights: [
      "Shadow LLM detected: unmanaged GPT-4 instance with unrestricted internet access and no DLP controls — Critical risk.",
      "Prompt injection attack confirmed on Invoice Processing Bot: 3,400 adversarial queries in 48 hours. Model offline.",
      "EU AI Act gap: 4 high-risk AI systems lack required conformity assessments. Deadline pressure increasing.",
    ],
    suggestions: ["Which AI models have critical vulnerabilities?", "Show active AI threats", "What's our EU AI Act readiness?"],
  },
};

interface Msg { role: "user" | "ai"; text: string; }

interface Props {
  module: CopilotModule;
  liveInsights?: string[];
}

export function AICopilotBar({ module, liveInsights }: Props) {
  const { theme } = useTheme();
  const { viewTenantId } = useOrg();
  const isDark = theme !== "light";
  const [expanded, setExpanded] = useState(false);
  const [insightIdx, setInsightIdx] = useState(0);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [convId, setConvId] = useState<number | null>(null);
  const [fetchedInsights, setFetchedInsights] = useState<string[]>([]);
  const [fetchedContext, setFetchedContext] = useState<string>("");
  const [ctxLoading, setCtxLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const token = localStorage.getItem("grc_token");
  const cfg = COPILOT[module];

  // Prefer: fetched live insights > liveInsights prop > static config
  const activeInsights = fetchedInsights.length > 0
    ? fetchedInsights
    : (liveInsights && liveInsights.length > 0) ? liveInsights : (cfg?.insights ?? []);

  const isLive = fetchedInsights.length > 0;

  // Fetch live DB-grounded context on module or tenant change.
  // Always passes the active viewTenantId so super_admin sees the correct tenant's data.
  const fetchContext = useCallback(async () => {
    if (!token) return;
    setCtxLoading(true);
    try {
      const url = `${BASE}/api/ai/copilot-context/${module}?tenantId=${viewTenantId}`;
      const r = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) {
        const data = await r.json() as { insights?: string[]; systemContext?: string };
        if (data.insights?.length) setFetchedInsights(data.insights);
        if (data.systemContext) setFetchedContext(data.systemContext);
      }
    } catch { /* fall back to static */ }
    finally { setCtxLoading(false); }
  }, [module, token, viewTenantId]);

  // Clear stale data immediately when the tenant switches, then re-fetch
  useEffect(() => {
    setFetchedInsights([]);
    setFetchedContext("");
    fetchContext();
  }, [fetchContext]);

  useEffect(() => {
    if (expanded) return;
    const t = setInterval(() => setInsightIdx(i => (i + 1) % activeInsights.length), 6000);
    return () => clearInterval(t);
  }, [expanded, activeInsights.length]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    setMessages([]); setConvId(null); setInsightIdx(0);
    setFetchedInsights([]); setFetchedContext("");
  }, [module]);

  const T = {
    bar:       isDark ? "rgba(15,23,42,0.88)"       : "rgba(30,58,95,0.04)",
    barBdr:    isDark ? "rgba(147,197,253,0.14)"    : "rgba(30,58,95,0.14)",
    insightBg: isDark ? "rgba(147,197,253,0.06)"    : "rgba(30,58,95,0.05)",
    insightBdr:isDark ? "rgba(147,197,253,0.18)"    : "rgba(30,58,95,0.18)",
    chipBg:    isDark ? "var(--secondary)"    : "rgba(255,255,255,0.85)",
    chipBdr:   isDark ? "rgba(255,255,255,0.10)"    : "rgba(30,58,95,0.14)",
    text:      isDark ? "var(--foreground)"           : "#1e293b",
    muted:     isDark ? "rgba(148,163,184,0.75)"    : "#64748b",
    accent:    isDark ? "rgb(147,197,253)"           : "#1E3A5F",
    inputBg:   isDark ? "var(--border)"    : "white",
    inputBdr:  isDark ? "rgba(255,255,255,0.12)"    : "rgba(30,58,95,0.2)",
    msgAiBg:   isDark ? "var(--secondary)"    : "#F1F5F9",
    dotInact:  isDark ? "rgba(255,255,255,0.14)"    : "rgba(30,58,95,0.18)",
  };

  async function initConv() {
    if (convId) return convId;
    // Combine the static module description with live platform data for a grounded system prompt
    const fullContext = fetchedContext
      ? `${cfg.context}\n\n${fetchedContext}`
      : cfg.context;
    const r = await fetch(`${BASE}/api/ai/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: `Copilot — ${module}`, context: fullContext }),
    });
    const data = await r.json() as { id: number };
    setConvId(data.id);
    return data.id;
  }

  async function send(q?: string) {
    const question = (q ?? input).trim();
    if (!question || streaming) return;
    setInput("");
    if (!expanded) setExpanded(true);
    setMessages(prev => [...prev, { role: "user", text: question }]);
    setStreaming(true);
    try {
      const cid = await initConv();
      const fullContext = fetchedContext
        ? `${cfg.context}\n\n${fetchedContext}`
        : cfg.context;
      const resp = await fetch(`${BASE}/api/ai/conversations/${cid}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: question, context: fullContext }),
      });
      let aiText = "";
      setMessages(prev => [...prev, { role: "ai", text: "" }]);
      const reader = resp.body!.getReader();
      const dec = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of dec.decode(value).split("\n")) {
          if (line.startsWith("data: ")) {
            try {
              const d = JSON.parse(line.slice(6)) as { content?: string };
              if (d.content) {
                aiText += d.content;
                setMessages(prev => {
                  const u = [...prev];
                  u[u.length - 1] = { role: "ai", text: aiText };
                  return u;
                });
              }
            } catch { /**/ }
          }
        }
      }
    } catch {
      setMessages(prev => [...prev, { role: "ai", text: "Connection error — please try again." }]);
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div style={{ margin: "0 24px 4px" }}>
      {/* ── Collapsed banner ─────────────────────────────────────────────── */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          background: T.bar, border: `1px solid ${T.barBdr}`,
          borderRadius: expanded ? "10px 10px 0 0" : 10,
          padding: "7px 13px", cursor: "pointer",
          backdropFilter: isDark ? "blur(12px)" : "none",
          transition: "border-radius 0.18s",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
          <div style={{
            width: 18, height: 18, background: "linear-gradient(135deg, #1E3A5F, #065F46)",
            borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 8, color: "white", fontWeight: 900,
          }}>◆</div>
          <span style={{ fontSize: 9.5, fontWeight: 800, color: T.accent, letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
            AI COPILOT
          </span>
          {/* Live data indicator */}
          <div style={{
            display: "flex", alignItems: "center", gap: 3,
            background: isLive ? "rgba(52,211,153,0.12)" : "transparent",
            border: isLive ? "1px solid rgba(52,211,153,0.3)" : "none",
            borderRadius: 4, padding: isLive ? "1px 5px" : 0,
            transition: "all 0.4s",
          }}>
            {ctxLoading && (
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(148,163,184,0.6)", animation: "copilot-blink 1s step-end infinite" }} />
            )}
            {isLive && !ctxLoading && (
              <>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#34D399" }} />
                <span style={{ fontSize: 8, fontWeight: 700, color: "#34D399", letterSpacing: "0.04em" }}>LIVE</span>
              </>
            )}
          </div>
        </div>

        <div style={{ flex: 1, overflow: "hidden" }}>
          <span style={{ fontSize: 11, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.4 }}>
            {activeInsights[insightIdx % activeInsights.length]}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
            {activeInsights.map((_, i) => (
              <div
                key={i}
                onClick={() => setInsightIdx(i)}
                style={{
                  width: i === insightIdx ? 10 : 4, height: 4, borderRadius: 3,
                  background: i === insightIdx ? T.accent : T.dotInact,
                  cursor: "pointer", transition: "all 0.3s",
                }}
              />
            ))}
          </div>
          <button
            onClick={e => { e.stopPropagation(); setExpanded(true); }}
            style={{
              background: "linear-gradient(135deg, #1E3A5F, #065F46)", border: "none",
              borderRadius: 5, padding: "3px 9px", fontSize: 9.5, fontWeight: 700,
              color: "white", cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit",
            }}
          >
            Ask →
          </button>
          <button
            onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
            style={{
              background: "none", border: `1px solid ${T.chipBdr}`, borderRadius: 4,
              width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", fontSize: 9, color: T.muted, fontFamily: "inherit",
            }}
          >
            {expanded ? "▲" : "▼"}
          </button>
        </div>
      </div>

      {/* ── Expanded panel ───────────────────────────────────────────────── */}
      {expanded && (
        <div style={{
          background: T.bar, borderLeft: `1px solid ${T.barBdr}`, borderRight: `1px solid ${T.barBdr}`,
          borderBottom: `1px solid ${T.barBdr}`, borderRadius: "0 0 10px 10px",
          padding: "10px 13px 12px",
          backdropFilter: isDark ? "blur(12px)" : "none",
        }}>
          {/* Insights grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 7, marginBottom: 10 }}>
            {activeInsights.map((ins, i) => (
              <div
                key={i}
                style={{
                  background: T.insightBg, border: `1px solid ${T.insightBdr}`,
                  borderRadius: 7, padding: "7px 9px", fontSize: 11, color: T.text,
                  lineHeight: 1.5, display: "flex", gap: 6,
                }}
              >
                <span style={{ color: "#34D399", fontWeight: 800, flexShrink: 0, marginTop: 1 }}>•</span>
                <span>{ins}</span>
              </div>
            ))}
          </div>

          {/* Chat messages */}
          {messages.length > 0 && (
            <div
              ref={scrollRef}
              style={{ maxHeight: 220, overflowY: "auto", marginBottom: 9, display: "flex", flexDirection: "column", gap: 7 }}
            >
              {messages.map((msg, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start", gap: 2 }}>
                  {msg.role === "ai" && <span style={{ fontSize: 9, color: T.muted }}>◆ AIGO-X Copilot</span>}
                  <div style={{
                    maxWidth: "88%", padding: "7px 10px",
                    borderRadius: msg.role === "user" ? "10px 10px 2px 10px" : "2px 10px 10px 10px",
                    background: msg.role === "user" ? "linear-gradient(135deg, #1E3A5F, #065F46)" : T.msgAiBg,
                    border: msg.role === "user" ? "none" : `1px solid ${T.barBdr}`,
                    fontSize: 11, lineHeight: 1.6, color: msg.role === "user" ? "white" : T.text,
                    whiteSpace: "pre-wrap",
                  }}>
                    {msg.text}
                    {streaming && i === messages.length - 1 && msg.role === "ai" && (
                      <span style={{
                        display: "inline-block", width: 5, height: 10, background: T.accent,
                        borderRadius: 1, marginLeft: 2, verticalAlign: "middle", opacity: 0.8,
                        animation: "copilot-blink 1s step-end infinite",
                      }} />
                    )}
                  </div>
                </div>
              ))}
              <style>{`@keyframes copilot-blink { 0%,100%{opacity:0.8} 50%{opacity:0.2} }`}</style>
            </div>
          )}

          {/* Suggestions */}
          {messages.length === 0 && (
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 9 }}>
              {cfg.suggestions.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  style={{
                    background: T.chipBg, border: `1px solid ${T.chipBdr}`, borderRadius: 6,
                    padding: "4px 9px", fontSize: 10, fontWeight: 600, color: T.text,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input row */}
          <div style={{ display: "flex", gap: 7 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
              disabled={streaming}
              placeholder={`Ask AI about ${module === "ai" ? "security strategy" : module}…`}
              style={{
                flex: 1, background: T.inputBg, border: `1px solid ${T.inputBdr}`,
                borderRadius: 7, padding: "6px 10px", fontSize: 11, color: T.text,
                outline: "none", fontFamily: "inherit",
              }}
            />
            <button
              onClick={() => send()}
              disabled={streaming}
              style={{
                background: "linear-gradient(135deg, #1E3A5F, #065F46)", border: "none",
                borderRadius: 7, padding: "6px 13px", fontSize: 11, fontWeight: 700,
                color: "white", cursor: streaming ? "not-allowed" : "pointer",
                opacity: streaming ? 0.55 : 1, fontFamily: "inherit",
              }}
            >
              {streaming ? "●" : "→"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
