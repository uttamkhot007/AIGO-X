import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";

interface TrustData {
  slug: string;
  displayName: string;
  tagline: string;
  accentColor: string;
  logoUrl: string | null;
  visibleSections: Record<string, boolean>;
  certifications: string[];
  grcScore: number;
  controlsImplemented: number;
  controlsTotal: number;
  frameworks: { framework: string; total: number; implemented: number; pct: number }[];
  lastEvidenceRun: string | null;
}

function apiBase() {
  const base = (import.meta as { env: Record<string, string> }).env["BASE_URL"] ?? "/grc-platform/";
  return base.replace(/grc-platform\/?$/, "api");
}

function ScoreRing({ score, color }: { score: number; color: string }) {
  const r = 52, circ = 2 * Math.PI * r, dash = (score / 100) * circ;
  return (
    <div style={{ position: "relative", width: 128, height: 128, flexShrink: 0 }}>
      <svg width={128} height={128} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={64} cy={64} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={12} />
        <circle cx={64} cy={64} r={r} fill="none" stroke={color} strokeWidth={12}
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 30, fontWeight: 800, color, fontFamily: "'JetBrains Mono',monospace", lineHeight: 1 }}>{score}</div>
        <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: "0.5px", marginTop: 2 }}>GRC SCORE</div>
      </div>
    </div>
  );
}

function FrameworkBar({ fw, pct, color }: { fw: string; pct: number; color: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>{fw}</span>
        <span style={{ fontSize: 11, fontWeight: 800, color, fontFamily: "'JetBrains Mono',monospace" }}>{pct}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)" }}>
        <div style={{ height: "100%", borderRadius: 3, background: color, width: `${pct}%`, transition: "width 1s ease" }} />
      </div>
    </div>
  );
}

function StatusBadge({ label, icon, color }: { label: string; icon: string; color: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, padding: "10px 16px",
      background: `${color}15`, border: `1px solid ${color}40`, borderRadius: 10,
    }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>{label}</span>
    </div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 14, padding: "24px 28px", ...style,
    }}>
      {children}
    </div>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: "rgba(255,255,255,0.95)", letterSpacing: "-0.2px" }}>{title}</div>
      {subtitle && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 3 }}>{subtitle}</div>}
    </div>
  );
}

export default function TrustCenter() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [data, setData]       = useState<TrustData | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  interface ChatMessage { role: "user" | "assistant" | "error"; text: string; }
  const [question, setQuestion]   = useState("");
  const [messages, setMessages]   = useState<ChatMessage[]>([]);
  const [asking, setAsking]       = useState(false);
  const chatEndRef                = useRef<HTMLDivElement>(null);

  const [showReqModal, setShowReqModal]   = useState(false);
  const [reqName, setReqName]             = useState("");
  const [reqEmail, setReqEmail]           = useState("");
  const [reqMessage, setReqMessage]       = useState("");
  const [reqSubmitting, setReqSubmitting] = useState(false);
  const [reqDone, setReqDone]             = useState(false);
  const [reqError, setReqError]           = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    fetch(`${apiBase()}/public/trust/${encodeURIComponent(slug)}`)
      .then(async r => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({})) as { error?: string };
          throw new Error(j.error ?? `HTTP ${r.status}`);
        }
        return r.json() as Promise<TrustData>;
      })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError((e as Error).message); setLoading(false); });
  }, [slug]);

  async function handleRequestAccess(e: React.FormEvent) {
    e.preventDefault();
    if (reqSubmitting || !slug) return;
    setReqError(null);
    setReqSubmitting(true);
    try {
      const r = await fetch(`${apiBase()}/public/trust/${encodeURIComponent(slug)}/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: reqName.trim(), email: reqEmail.trim(), message: reqMessage.trim() || undefined }),
      });
      const j = await r.json() as { ok?: boolean; error?: string };
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setReqDone(true);
    } catch (err) {
      setReqError((err as Error).message);
    } finally {
      setReqSubmitting(false);
    }
  }

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || asking) return;
    setQuestion("");
    setAsking(true);
    setMessages(prev => [...prev, { role: "user", text: q }]);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    try {
      const r = await fetch(`${apiBase()}/public/trust/${encodeURIComponent(slug!)}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const j = await r.json() as { answer?: string; error?: string };
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setMessages(prev => [...prev, { role: "assistant", text: j.answer ?? "" }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: "error", text: (err as Error).message }]);
    } finally {
      setAsking(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0A0F1E", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div style={{ width: 40, height: 40, border: "3px solid rgba(255,255,255,0.1)", borderTop: "3px solid #3B82F6", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>Loading Trust Center…</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: "100vh", background: "#0A0F1E", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", maxWidth: 380, padding: "0 24px" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "rgba(255,255,255,0.9)", marginBottom: 8 }}>Trust Center Unavailable</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>{error ?? "This Trust Center page could not be loaded."}</div>
        </div>
      </div>
    );
  }

  const accent = data.accentColor ?? "#1E3A5F";
  const vis = data.visibleSections ?? {};
  const pctColor = (pct: number) => pct >= 90 ? "#34D399" : pct >= 75 ? "#60A5FA" : pct >= 60 ? "#FBBF24" : "#F87171";

  return (
    <div style={{ minHeight: "100vh", background: "#0A0F1E", fontFamily: "'Inter','Segoe UI',sans-serif", color: "white" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        ::placeholder { color: rgba(255,255,255,0.3); }
        a { color: inherit; }
      `}</style>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header style={{
        background: `linear-gradient(135deg, ${accent}22 0%, rgba(10,15,30,0) 60%)`,
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        padding: "0 40px",
      }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "28px 0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {data.logoUrl ? (
              <img src={data.logoUrl} alt="logo" style={{ height: 40, objectFit: "contain", borderRadius: 8 }} />
            ) : (
              <div style={{ width: 40, height: 40, borderRadius: 10, background: accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800 }}>🛡</div>
            )}
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "white", letterSpacing: "-0.3px" }}>{data.displayName}</div>
              {data.tagline && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>{data.tagline}</div>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#34D399", boxShadow: "0 0 8px #34D399" }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: "#34D399", letterSpacing: "0.3px" }}>LIVE POSTURE</span>
            </div>
            {vis.requestAccess !== false && (
              <button
                onClick={() => { setShowReqModal(true); setReqDone(false); setReqError(null); }}
                style={{
                  padding: "8px 18px", borderRadius: 8, border: `1px solid ${accent}60`,
                  background: `${accent}22`, color: "white", fontSize: 12, fontWeight: 700,
                  cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${accent}44`; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = `${accent}22`; }}
              >
                🔑 Request Access
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <main style={{ maxWidth: 960, margin: "0 auto", padding: "40px 40px 80px" }}>

        {/* ── GRC Score + stats hero ──────────────────────────────────────── */}
        {vis.grcScore !== false && (
          <Card style={{ marginBottom: 24, background: `linear-gradient(135deg, ${accent}18 0%, rgba(255,255,255,0.03) 100%)`, border: `1px solid ${accent}30` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 36, flexWrap: "wrap" }}>
              <ScoreRing score={data.grcScore} color={pctColor(data.grcScore)} />
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 6 }}>Overall GRC Posture</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: "white", lineHeight: 1.1, marginBottom: 8 }}>
                  {data.grcScore >= 90 ? "Excellent" : data.grcScore >= 75 ? "Strong" : data.grcScore >= 60 ? "Good" : "Improving"}
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>
                  {data.controlsImplemented} of {data.controlsTotal} controls implemented across {data.frameworks.length} frameworks.
                  {data.lastEvidenceRun && (
                    <> Evidence last collected <strong style={{ color: "rgba(255,255,255,0.75)" }}>{new Date(data.lastEvidenceRun).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</strong>.</>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { label: `${data.controlsImplemented}`, sub: "Controls Implemented", color: "#34D399" },
                  { label: `${data.frameworks.length}`, sub: "Frameworks Active", color: "#60A5FA" },
                  { label: `${Math.round((data.controlsImplemented / Math.max(data.controlsTotal, 1)) * 100)}%`, sub: "Coverage Rate", color: pctColor(data.grcScore) },
                ].map(k => (
                  <div key={k.sub} style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: k.color }}>{k.label}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>{k.sub}</div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>

          {/* ── Framework bars ────────────────────────────────────────────── */}
          {vis.frameworks !== false && (
            <Card>
              <SectionHeading title="Framework Compliance" subtitle="Live control implementation rates" />
              {data.frameworks.map(fw => (
                <FrameworkBar key={fw.framework} fw={fw.framework} pct={fw.pct} color={pctColor(fw.pct)} />
              ))}
            </Card>
          )}

          {/* ── Certifications ────────────────────────────────────────────── */}
          {vis.certifications !== false && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Card>
                <SectionHeading title="Security Certifications" subtitle="Current compliance badges" />
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {(data.certifications?.length > 0 ? data.certifications : ["SOC 2 Type II", "ISO 27001:2022", "GDPR Compliant", "NIST CSF Aligned"]).map((cert: string) => (
                    <StatusBadge key={cert} label={cert} icon="✓" color="#34D399" />
                  ))}
                </div>
              </Card>

              {vis.evidence !== false && data.lastEvidenceRun && (
                <Card>
                  <SectionHeading title="Evidence Freshness" />
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>📋</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#34D399" }}>Automated evidence active</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                        Last collected: {new Date(data.lastEvidenceRun).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          )}
        </div>

        {/* ── AI Q&A widget ─────────────────────────────────────────────────── */}
        {vis.aiQa !== false && (
          <Card style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.06) 0%, rgba(16,185,129,0.04) 100%)", border: "1px solid rgba(59,130,246,0.18)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <span style={{ fontSize: 20 }}>🤖</span>
              <SectionHeading title="Ask a Security Question" subtitle="Get instant answers drawn from our live compliance data" />
            </div>

            {/* ── Chat thread ── */}
            {messages.length > 0 && (
              <div style={{
                maxHeight: 380, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12,
                marginBottom: 16, paddingRight: 4,
              }}>
                {messages.map((msg, i) => {
                  if (msg.role === "user") {
                    return (
                      <div key={i} style={{ display: "flex", justifyContent: "flex-end" }}>
                        <div style={{
                          maxWidth: "75%", background: "#3B82F6", borderRadius: "14px 14px 4px 14px",
                          padding: "10px 16px", fontSize: 13, color: "white", lineHeight: 1.6,
                        }}>
                          {msg.text}
                        </div>
                      </div>
                    );
                  }
                  if (msg.role === "error") {
                    return (
                      <div key={i} style={{ display: "flex", justifyContent: "flex-start" }}>
                        <div style={{
                          maxWidth: "85%", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)",
                          borderRadius: "14px 14px 14px 4px", padding: "10px 16px", fontSize: 13, color: "#F87171", lineHeight: 1.6,
                        }}>
                          {msg.text}
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={i} style={{ display: "flex", justifyContent: "flex-start", gap: 10 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: "50%", background: "rgba(59,130,246,0.18)",
                        border: "1px solid rgba(59,130,246,0.35)", display: "flex", alignItems: "center",
                        justifyContent: "center", fontSize: 14, flexShrink: 0, marginTop: 2,
                      }}>🤖</div>
                      <div style={{ maxWidth: "80%" }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: "0.5px", marginBottom: 5 }}>
                          AI · BASED ON LIVE COMPLIANCE DATA
                        </div>
                        <div style={{
                          background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: "14px 14px 14px 4px", padding: "10px 16px",
                          fontSize: 13, color: "rgba(255,255,255,0.85)", lineHeight: 1.7, whiteSpace: "pre-wrap",
                        }}>
                          {msg.text}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Typing indicator while waiting */}
                {asking && (
                  <div style={{ display: "flex", justifyContent: "flex-start", gap: 10 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: "50%", background: "rgba(59,130,246,0.18)",
                      border: "1px solid rgba(59,130,246,0.35)", display: "flex", alignItems: "center",
                      justifyContent: "center", fontSize: 14, flexShrink: 0,
                    }}>🤖</div>
                    <div style={{
                      background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: "14px 14px 14px 4px", padding: "12px 18px",
                      display: "flex", alignItems: "center", gap: 6,
                    }}>
                      {[0, 1, 2].map(d => (
                        <div key={d} style={{
                          width: 7, height: 7, borderRadius: "50%", background: "rgba(59,130,246,0.7)",
                          animation: "bounce 1.2s ease-in-out infinite",
                          animationDelay: `${d * 0.2}s`,
                        }} />
                      ))}
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            )}

            {/* ── Empty state hint ── */}
            {messages.length === 0 && (
              <div style={{ marginBottom: 14, display: "flex", flexWrap: "wrap", gap: 8 }}>
                {["Are you SOC 2 compliant?", "How do you handle data retention?", "Do you enforce MFA?"].map(hint => (
                  <button
                    key={hint}
                    type="button"
                    onClick={() => setQuestion(hint)}
                    style={{
                      background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.25)",
                      borderRadius: 20, padding: "6px 14px", fontSize: 11, color: "rgba(255,255,255,0.65)",
                      cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(59,130,246,0.18)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(59,130,246,0.08)"; }}
                  >
                    {hint}
                  </button>
                ))}
              </div>
            )}

            {/* ── Input row ── */}
            <form onSubmit={handleAsk} style={{ display: "flex", gap: 10 }}>
              <input
                value={question}
                onChange={e => setQuestion(e.target.value)}
                placeholder="Type a security or compliance question…"
                disabled={asking}
                style={{
                  flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "white",
                  fontFamily: "inherit", outline: "none",
                }}
              />
              <button type="submit" disabled={asking || !question.trim()} style={{
                padding: "12px 24px", borderRadius: 10, border: "none",
                background: asking || !question.trim() ? "rgba(59,130,246,0.35)" : "#3B82F6",
                color: "white", fontSize: 13, fontWeight: 700,
                cursor: asking || !question.trim() ? "default" : "pointer",
                fontFamily: "inherit", flexShrink: 0, transition: "all 0.15s",
              }}>
                {asking ? "Thinking…" : "Ask"}
              </button>
            </form>

            <style>{`
              @keyframes bounce {
                0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
                40%            { transform: translateY(-5px); opacity: 1; }
              }
            `}</style>
          </Card>
        )}
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "24px 40px", textAlign: "center" }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>
          Powered by <strong style={{ color: "rgba(255,255,255,0.5)" }}>AIGO-X GRC</strong> · Public Trust Center · {new Date().getFullYear()}
        </div>
      </footer>

      {/* ── Request Access Modal ─────────────────────────────────────────────── */}
      {showReqModal && (
        <div
          onClick={e => { if (e.target === e.currentTarget) { setShowReqModal(false); setReqDone(false); } }}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 24,
          }}
        >
          <div style={{
            background: "#10172A", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16,
            padding: "32px 36px", width: "100%", maxWidth: 460, position: "relative",
            boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
          }}>
            <button
              onClick={() => { setShowReqModal(false); setReqDone(false); }}
              style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 20, cursor: "pointer", lineHeight: 1 }}
            >×</button>

            {reqDone ? (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "white", marginBottom: 8 }}>Request Submitted!</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.6, marginBottom: 24 }}>
                  We've received your request for access. The team will review it and get back to you at <strong style={{ color: "rgba(255,255,255,0.8)" }}>{reqEmail}</strong>.
                </div>
                <button
                  onClick={() => { setShowReqModal(false); setReqDone(false); setReqName(""); setReqEmail(""); setReqMessage(""); }}
                  style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: accent, color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                >Close</button>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "white", marginBottom: 6 }}>🔑 Request Document Access</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>
                    Submit your details to request access to private audit reports, NDA packages, or security documentation.
                  </div>
                </div>

                <form onSubmit={handleRequestAccess} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 6 }}>Your Name *</div>
                    <input
                      value={reqName}
                      onChange={e => setReqName(e.target.value)}
                      placeholder="Jane Smith"
                      required
                      style={{
                        width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "white", fontFamily: "inherit", outline: "none", boxSizing: "border-box",
                      }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 6 }}>Work Email *</div>
                    <input
                      type="email"
                      value={reqEmail}
                      onChange={e => setReqEmail(e.target.value)}
                      placeholder="jane@company.com"
                      required
                      style={{
                        width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "white", fontFamily: "inherit", outline: "none", boxSizing: "border-box",
                      }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 6 }}>What do you need? (optional)</div>
                    <textarea
                      value={reqMessage}
                      onChange={e => setReqMessage(e.target.value)}
                      placeholder="e.g. SOC 2 Type II report, penetration test results, NDA package…"
                      rows={3}
                      style={{
                        width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "white", fontFamily: "inherit", outline: "none",
                        resize: "vertical", boxSizing: "border-box",
                      }}
                    />
                  </div>

                  {reqError && (
                    <div style={{ fontSize: 12, color: "#F87171", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 7, padding: "8px 12px" }}>
                      {reqError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={reqSubmitting || !reqName.trim() || !reqEmail.trim()}
                    style={{
                      padding: "12px", borderRadius: 9, border: "none", marginTop: 4,
                      background: reqSubmitting || !reqName.trim() || !reqEmail.trim() ? "rgba(59,130,246,0.35)" : accent,
                      color: "white", fontSize: 13, fontWeight: 700,
                      cursor: reqSubmitting || !reqName.trim() || !reqEmail.trim() ? "default" : "pointer",
                      fontFamily: "inherit", transition: "all 0.15s",
                    }}
                  >
                    {reqSubmitting ? "Submitting…" : "Submit Request"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
