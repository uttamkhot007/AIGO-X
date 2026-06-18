import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlatformStats {
  frameworkCount:      number;
  frameworkNames:      string[];
  agentCount:          number;
  grcScore:            number;
  controlsCoverage:    number;
  controlsImplemented: number;
  controlsTotal:       number;
}

const FALLBACK_STATS: PlatformStats = {
  frameworkCount:      7,
  frameworkNames:      ["ISO 27001", "SOC 2", "GDPR", "HIPAA", "PCI DSS 4.0", "NIST CSF", "NIS2"],
  agentCount:          14,
  grcScore:            84,
  controlsCoverage:    79,
  controlsImplemented: 624,
  controlsTotal:       788,
};

const QUICK_FILL = [
  { email: "admin@acme.com",   label: "Admin",   color: "#93C5FD" },
  { email: "ciso@acme.com",    label: "CISO",    color: "#34D399" },
  { email: "analyst@acme.com", label: "Analyst", color: "#FCD34D" },
  { email: "auditor@acme.com", label: "Auditor", color: "#C084FC" },
];

// ── Styles ────────────────────────────────────────────────────────────────────

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');

  @keyframes floatUp     { 0%,100% { transform: translateY(0px);  } 50% { transform: translateY(-12px); } }
  @keyframes floatUpAlt  { 0%,100% { transform: translateY(-8px); } 50% { transform: translateY(4px);   } }
  @keyframes floatUpB    { 0%,100% { transform: translateY(0px);  } 50% { transform: translateY(-10px); } }
  @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes orbPulse    { 0%,100% { opacity: 0.3; transform: scale(1);    } 50% { opacity: 0.5; transform: scale(1.05); } }
  @keyframes tickerScroll{ 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
  @keyframes spinSlow    { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes pulse       { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
  @keyframes borderGlow  { 0%,100% { box-shadow: 0 0 0 0 rgba(147,197,253,0.3); } 50% { box-shadow: 0 0 0 8px rgba(147,197,253,0); } }
  @keyframes countUp     { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }

  .login-root * { box-sizing: border-box; }
  .login-root   { font-family: 'Plus Jakarta Sans', sans-serif; }

  .float-0  { animation: floatUp    4s ease-in-out infinite; }
  .float-1  { animation: floatUpAlt 5s ease-in-out infinite; }
  .float-2  { animation: floatUpB   6s ease-in-out infinite 1s; }

  .hero-a { animation: fadeSlideIn 0.7s ease forwards; }
  .hero-b { animation: fadeSlideIn 0.7s ease 0.15s forwards; opacity: 0; }
  .hero-c { animation: fadeSlideIn 0.7s ease 0.30s forwards; opacity: 0; }
  .hero-d { animation: fadeSlideIn 0.7s ease 0.45s forwards; opacity: 0; }
  .hero-e { animation: fadeSlideIn 0.7s ease 0.60s forwards; opacity: 0; }

  .form-side { animation: fadeSlideIn 0.7s ease 0.2s forwards; opacity: 0; }

  .ticker-track { animation: tickerScroll var(--ticker-dur, 50s) linear infinite; }

  .stat-num { animation: countUp 0.5s ease forwards; }

  /* Force text visible regardless of global --foreground override */
  .ticker-pill { color: rgba(255,255,255,0.75) !important; -webkit-text-fill-color: rgba(255,255,255,0.75) !important; }
  .login-chip-inactive { color: rgba(255,255,255,0.65) !important; -webkit-text-fill-color: rgba(255,255,255,0.65) !important; }
  .login-chip-active   { -webkit-text-fill-color: var(--chip-active-col) !important; }

  .cta-btn {
    background: linear-gradient(135deg, #3B82F6 0%, #6366F1 50%, #8B5CF6 100%);
    transition: all 0.25s ease;
    position: relative;
    overflow: hidden;
  }
  .cta-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 30px rgba(99,102,241,0.5); }
  .cta-btn::after {
    content: '';
    position: absolute; inset: 0;
    background: linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 60%);
    pointer-events: none;
  }
  .cta-btn:disabled { opacity: 0.6; transform: none; cursor: not-allowed; }

  .chip-btn { transition: all 0.15s ease; }
  .chip-btn:hover { transform: translateY(-1px); }

  .input-field { transition: border-color 0.2s, box-shadow 0.2s; color: white !important; -webkit-text-fill-color: white !important; }
  .input-field:focus { outline: none; border-color: #93C5FD !important; box-shadow: 0 0 0 3px rgba(147,197,253,0.15); }
  .input-field:-webkit-autofill,
  .input-field:-webkit-autofill:hover,
  .input-field:-webkit-autofill:focus { -webkit-text-fill-color: white !important; -webkit-box-shadow: 0 0 0 1000px rgba(7,15,33,0.95) inset !important; caret-color: white; }

  .stat-card { transition: transform 0.2s; cursor: default; }
  .stat-card:hover { transform: translateY(-2px); }

  .float-card-wrap { transition: transform 0.2s; }
  .float-card-wrap:hover { transform: scale(1.02); }

  @media (max-width: 900px) {
    .login-left  { display: none !important; }
    .login-right { width: 100% !important;   }
  }
`;

// ── Component ─────────────────────────────────────────────────────────────────

export default function Login() {
  const [, navigate]        = useLocation();
  const { setToken }        = useAuth();
  const [email, setEmail]   = useState("admin@acme.com");
  const [password, setPassword] = useState("password123");
  const [error, setError]   = useState("");
  const [showPw, setShowPw] = useState(false);
  const login               = useLogin();

  // Live platform stats — fetched from the public (no-auth) /api/public/stats endpoint
  const [stats, setStats]       = useState<PlatformStats>(FALLBACK_STATS);
  const [statsReady, setStatsReady] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(getApiUrl("/public/stats"), { signal: controller.signal })
      .then(r => r.ok ? r.json() as Promise<PlatformStats> : Promise.reject())
      .then(data => {
        setStats({
          frameworkCount:      data.frameworkCount      ?? FALLBACK_STATS.frameworkCount,
          frameworkNames:      Array.isArray(data.frameworkNames) && data.frameworkNames.length
                                 ? data.frameworkNames
                                 : FALLBACK_STATS.frameworkNames,
          agentCount:          data.agentCount          ?? FALLBACK_STATS.agentCount,
          grcScore:            data.grcScore            ?? FALLBACK_STATS.grcScore,
          controlsCoverage:    data.controlsCoverage    ?? FALLBACK_STATS.controlsCoverage,
          controlsImplemented: data.controlsImplemented ?? FALLBACK_STATS.controlsImplemented,
          controlsTotal:       data.controlsTotal       ?? FALLBACK_STATS.controlsTotal,
        });
        setStatsReady(true);
      })
      .catch(() => setStatsReady(true));     // keep fallback values on error
    return () => controller.abort();
  }, []);

  // Cap ticker to 20 names for readable scroll speed, duplicate for seamless loop
  const TICKER_MAX = 20;
  const tickerSample = stats.frameworkNames.slice(0, TICKER_MAX);
  const tickerItems  = [...tickerSample, ...tickerSample];
  // ~2.5 s per name feels like a natural news ticker pace
  const tickerDuration = `${tickerSample.length * 2.5}s`;

  // Float cards — values from live stats
  const floatCards = [
    {
      icon: "🛡",  title: "Risk Score",   value: `${stats.grcScore}/100`,
      sub: stats.grcScore >= 90 ? "Excellent posture" : stats.grcScore >= 75 ? "Good posture" : "Needs attention",
      color: stats.grcScore >= 90 ? "#34D399" : stats.grcScore >= 75 ? "#FCD34D" : "#F87171",
    },
    {
      icon: "✅",  title: "Compliance",   value: `${stats.frameworkCount}`,
      sub: "Active frameworks",   color: "#93C5FD",
    },
    {
      icon: "🤖",  title: "AI Agents",   value: `${stats.agentCount} Active`,
      sub: "Running 24/7",         color: "#FCD34D",
    },
  ];

  // Stat row
  const statRow = [
    { value: String(stats.agentCount),       label: "AI Agents",  icon: "🤖", color: "#93C5FD" },
    { value: `${stats.frameworkCount}+`,     label: "Frameworks", icon: "🌐", color: "#34D399" },
    { value: `${stats.controlsCoverage}%`,   label: "Coverage",   icon: "⚡", color: "#FCD34D" },
  ];

  // Trust badge frameworks (real names from DB, capped at 3)
  const trustBadges = stats.frameworkNames.slice(0, 3);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    login.mutate(
      { data: { email, password } },
      {
        onSuccess(data) {
          if (data.mfaRequired && data.tempToken) {
            sessionStorage.setItem("grc_mfa_challenge", data.tempToken);
            navigate("/mfa");
            return;
          }
          setToken(data.token, data.user?.name ?? undefined);
          navigate("/");
        },
        onError() { setError("Invalid email or password. Try password123"); },
      },
    );
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="login-root" style={{
        minHeight: "100vh",
        display: "flex",
        background: "#050B1A",
        overflow: "hidden",
        position: "relative",
      }}>

        {/* ── LEFT HERO PANEL ─────────────────────────────────────────── */}
        <div className="login-left" style={{
          flex: "0 0 58%",
          position: "relative",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}>
          {/* AI-generated hero image */}
          <img src={`${(import.meta as { env: Record<string,string> }).env["BASE_URL"] ?? "/"}login-hero.png`} alt="" style={{
            position: "absolute", inset: 0,
            width: "100%", height: "100%",
            objectFit: "cover",
            opacity: 0.4,
          }} />

          {/* Gradients */}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(5,11,26,0.94) 0%, rgba(10,22,54,0.72) 50%, rgba(5,11,26,0.88) 100%)" }} />
          <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 120, background: "linear-gradient(to right, transparent, #050B1A)" }} />

          {/* Ambient orbs */}
          <div style={{ position: "absolute", width: 500, height: 500, background: "radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)", top: -100, left: -100, borderRadius: "50%", animation: "orbPulse 6s ease-in-out infinite" }} />
          <div style={{ position: "absolute", width: 400, height: 400, background: "radial-gradient(circle, rgba(52,211,153,0.12) 0%, transparent 70%)", bottom: 50, right: 50, borderRadius: "50%", animation: "orbPulse 8s ease-in-out infinite 2s" }} />
          <div style={{ position: "absolute", width: 300, height: 300, background: "radial-gradient(circle, rgba(147,197,253,0.10) 0%, transparent 70%)", top: "40%", left: "40%", borderRadius: "50%", animation: "orbPulse 5s ease-in-out infinite 1s" }} />

          {/* Content */}
          <div style={{ position: "relative", zIndex: 2, display: "flex", flexDirection: "column", height: "100%", padding: "36px 52px" }}>

            {/* Logo */}
            <div className="hero-a" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "auto" }}>
              <div style={{ width: 44, height: 44, background: "linear-gradient(135deg, #3B82F6, #6366F1)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 900, color: "white", boxShadow: "0 4px 20px rgba(99,102,241,0.4)" }}>A</div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "white", letterSpacing: "-0.3px" }}>AIGO-X</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 500, letterSpacing: "0.5px" }}>ENTERPRISE PLATFORM</div>
              </div>
            </div>

            {/* Live float cards — top-right */}
            <div style={{ position: "absolute", top: 100, right: 60, display: "flex", flexDirection: "column", gap: 12, zIndex: 3 }}>
              {floatCards.map((card, i) => (
                <div key={card.title} className={`float-card-wrap float-${i}`} style={{
                  background: "rgba(10,20,50,0.78)",
                  backdropFilter: "blur(20px)",
                  WebkitBackdropFilter: "blur(20px)",
                  border: "1px solid rgba(80,120,200,0.2)",
                  borderRadius: 14,
                  padding: "12px 16px",
                  display: "flex", alignItems: "center", gap: 12,
                  minWidth: 185,
                  boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
                }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: `${card.color}18`, border: `1px solid ${card.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{card.icon}</div>
                  <div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", fontWeight: 600, letterSpacing: "0.3px", textTransform: "uppercase" }}>{card.title}</div>
                    <div className={statsReady ? "stat-num" : ""} style={{ fontSize: 15, fontWeight: 800, color: "white", letterSpacing: "-0.3px" }}>{card.value}</div>
                    <div style={{ fontSize: 10, color: card.color, fontWeight: 600 }}>{card.sub}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Main headline */}
            <div style={{ marginTop: "auto", paddingTop: 160 }}>

              {/* Live badge */}
              <div className="hero-b" style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(147,197,253,0.12)", border: "1px solid rgba(147,197,253,0.25)", borderRadius: 100, padding: "5px 14px", marginBottom: 20 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#34D399", animation: "pulse 2s ease-in-out infinite" }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: "#93C5FD", letterSpacing: "0.4px" }}>Next-Generation GRC Intelligence</span>
              </div>

              <h1 className="hero-c" style={{ margin: "0 0 16px", fontSize: "clamp(32px, 3.5vw, 52px)", fontWeight: 900, lineHeight: 1.08, letterSpacing: "-1.5px" }}>
                <span style={{ color: "white" }}>Simplified</span>{" "}
                <span style={{ background: "linear-gradient(135deg, #93C5FD 0%, #6366F1 40%, #34D399 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>GRC.</span>
                <br />
                <span style={{ color: "rgba(255,255,255,0.85)", fontSize: "85%" }}>Intelligent. Unified.</span>
              </h1>

              <p className="hero-d" style={{ margin: "0 0 32px", fontSize: 15, color: "rgba(255,255,255,0.55)", lineHeight: 1.7, maxWidth: 420, fontWeight: 450 }}>
                Reimagine governance, risk, and compliance with an AI-native platform — predictive insights, adaptive controls, and real-time automation built for the modern enterprise.
              </p>

              {/* Live stat row */}
              <div className="hero-e" style={{ display: "flex", gap: 12, marginBottom: 32, flexWrap: "wrap" }}>
                {statRow.map(s => (
                  <div key={s.label} className="stat-card" style={{ background: "rgba(10,25,60,0.7)", border: "1px solid rgba(80,130,220,0.2)", borderRadius: 12, padding: "12px 18px", textAlign: "center" }}>
                    <div style={{ fontSize: 10, marginBottom: 2 }}>{s.icon}</div>
                    <div className={statsReady ? "stat-num" : ""} style={{ fontSize: 22, fontWeight: 900, color: s.color, lineHeight: 1.1, letterSpacing: "-0.5px" }}>{s.value}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 600, marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Live framework ticker from DB */}
              {tickerItems.length > 0 && (
                <div style={{ overflow: "hidden", maskImage: "linear-gradient(to right, transparent, black 15%, black 85%, transparent)" }}>
                  <div className="ticker-track" style={{ display: "flex", gap: 8, width: "max-content", ["--ticker-dur" as string]: tickerDuration }}>
                    {tickerItems.map((f, i) => (
                      <div key={`${f}-${i}`} className="ticker-pill" style={{
                        background: "rgba(10,30,70,0.8)",
                        border: "1px solid rgba(80,130,220,0.3)",
                        borderRadius: 100, padding: "4px 12px",
                        fontSize: 10, fontWeight: 700,
                        whiteSpace: "nowrap", letterSpacing: "0.3px",
                      }}>{f}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT FORM PANEL ─────────────────────────────────────────── */}
        <div className="login-right form-side" style={{
          flex: "0 0 42%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 32px",
          background: "#070F21",
          position: "relative",
          borderLeft: "1px solid rgba(255,255,255,0.05)",
        }}>
          <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 30% 20%, rgba(99,102,241,0.07) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(52,211,153,0.06) 0%, transparent 50%)", pointerEvents: "none" }} />

          <div style={{ width: "100%", maxWidth: 380, position: "relative" }}>

            {/* Logo */}
            <div style={{ marginBottom: 32, textAlign: "center" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ width: 44, height: 44, background: "linear-gradient(135deg, #3B82F6, #6366F1)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 900, color: "white", boxShadow: "0 4px 20px rgba(99,102,241,0.4)", animation: "borderGlow 3s ease-in-out infinite" }}>A</div>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "white", letterSpacing: "-0.3px" }}>AIGO-X</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontWeight: 600, letterSpacing: "0.8px" }}>GRC PLATFORM</div>
                </div>
              </div>
            </div>

            {/* Card */}
            <div style={{ background: "rgba(8,18,48,0.96)", border: "1px solid rgba(60,100,180,0.2)", borderRadius: 20, padding: "32px 32px 28px", boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}>

              <div style={{ marginBottom: 24 }}>
                <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800, color: "white", letterSpacing: "-0.5px" }}>Welcome back 👋</h2>
                <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.45)", fontWeight: 500, lineHeight: 1.5 }}>Sign in to your GRC command center</p>
              </div>

              {/* Quick-fill chips */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: 8 }}>Quick Demo Access</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {QUICK_FILL.map(({ email: e, label, color }) => {
                    const active = email === e;
                    return (
                      <button key={e} className={`chip-btn ${active ? "login-chip-active" : "login-chip-inactive"}`}
                        onClick={() => { setEmail(e); setPassword("password123"); }}
                        style={{ background: active ? `${color}22` : "rgba(10,25,60,0.8)", border: `1px solid ${active ? `${color}60` : "rgba(80,120,200,0.25)"}`, borderRadius: 8, padding: "4px 11px", fontSize: 11, fontWeight: 700, color: active ? color : "rgba(255,255,255,0.65)", cursor: "pointer", fontFamily: "inherit", ["--chip-active-col" as string]: color }}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <form onSubmit={handleSubmit}>
                {/* Email */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: "0.4px", textTransform: "uppercase", display: "block", marginBottom: 7 }}>Email Address</label>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", fontSize: 13, pointerEvents: "none", opacity: 0.4 }}>✉</span>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="input-field" placeholder="you@company.com"
                      style={{ width: "100%", paddingLeft: 36, paddingRight: 14, paddingTop: 11, paddingBottom: 11, background: "rgba(15,30,60,0.9)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, fontSize: 13, color: "white", WebkitTextFillColor: "white", caretColor: "white", fontFamily: "inherit" }} />
                  </div>
                </div>

                {/* Password */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: "0.4px", textTransform: "uppercase" }}>Password</label>
                    <button type="button" style={{ background: "none", border: "none", fontSize: 11, color: "#93C5FD", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>Forgot password?</button>
                  </div>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", fontSize: 13, pointerEvents: "none", opacity: 0.4 }}>🔒</span>
                    <input type={showPw ? "text" : "password"} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required className="input-field" placeholder="••••••••"
                      style={{ width: "100%", paddingLeft: 36, paddingRight: 42, paddingTop: 11, paddingBottom: 11, background: "rgba(15,30,60,0.9)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, fontSize: 13, color: "white", WebkitTextFillColor: "white", caretColor: "white", fontFamily: "inherit" }} />
                    <button type="button" onClick={() => setShowPw(p => !p)}
                      style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 13, opacity: 0.4, padding: 0 }}>
                      {showPw ? "🙈" : "👁"}
                    </button>
                  </div>
                </div>

                {error && (
                  <div style={{ background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 10, padding: "9px 13px", fontSize: 12, color: "#FCA5A5", fontWeight: 600, marginBottom: 14 }}>⚠ {error}</div>
                )}

                <button type="submit" disabled={login.isPending} className="cta-btn"
                  style={{ width: "100%", border: "none", borderRadius: 12, padding: "13px", fontSize: 14, fontWeight: 800, color: "white", cursor: "pointer", fontFamily: "inherit", letterSpacing: "-0.2px", marginTop: 12 }}>
                  {login.isPending
                    ? <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                        <span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%", animation: "spinSlow 0.8s linear infinite" }} />
                        Signing in…
                      </span>
                    : "Sign In  →"
                  }
                </button>
              </form>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18 }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                  Demo: <strong style={{ color: "rgba(147,197,253,0.7)" }}>password123</strong>
                </span>
                <button onClick={() => navigate("/register")} style={{ background: "none", border: "none", fontSize: 12, fontWeight: 700, color: "#93C5FD", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
                  Create account ↗
                </button>
              </div>
            </div>

            {/* Trust badges — real framework names from DB */}
            <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 24, flexWrap: "wrap" }}>
              {trustBadges.map(f => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "rgba(255,255,255,0.25)", fontWeight: 700, letterSpacing: "0.4px" }}>
                  <span style={{ width: 14, height: 14, borderRadius: "50%", border: "1px solid rgba(52,211,153,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#34D399" }}>✓</span>
                  {f}
                </div>
              ))}
            </div>

            <div style={{ textAlign: "center", marginTop: 16, fontSize: 10, color: "rgba(255,255,255,0.18)", fontWeight: 500 }}>
              Your data, your servers · Zero external dependencies
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
