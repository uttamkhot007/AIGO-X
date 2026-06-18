import { useEffect, useRef, useState } from "react";

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
`;

const KEYFRAMES = `
@keyframes glow-pulse { 0%,100%{opacity:.7} 50%{opacity:1} }
@keyframes count-up { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
@keyframes slide-in { from{opacity:0;transform:translateX(-12px)} to{opacity:1;transform:translateX(0)} }
@keyframes ring-draw { from{stroke-dashoffset:565} to{stroke-dashoffset:var(--target)} }
@keyframes bar-grow { from{width:0} to{width:var(--target-w)} }
@keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
@keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-3px)} }
`;

const modules = [
  { id: "grc", icon: "⬡", label: "GRC", active: true },
  { id: "risk", icon: "◈", label: "Risk" },
  { id: "compliance", icon: "◉", label: "Compliance" },
  { id: "caasm", icon: "◎", label: "Security" },
  { id: "privacy", icon: "◐", label: "Privacy" },
  { id: "ai", icon: "◆", label: "AI vCISO" },
  { id: "desk", icon: "◫", label: "Service Desk" },
  { id: "agents", icon: "◯", label: "Agents" },
  { id: "settings", icon: "◧", label: "Settings" },
];

const kpis = [
  { label: "GRC Score", value: "84", unit: "/100", delta: "+3.2", up: true, color: "#6366F1" },
  { label: "Open Risks", value: "47", unit: "", delta: "-12", up: false, color: "#F59E0B" },
  { label: "Controls Coverage", value: "91", unit: "%", delta: "+5.1", up: true, color: "#06B6D4" },
  { label: "Active Audits", value: "6", unit: "", delta: "0", up: true, color: "#8B5CF6" },
  { label: "Privacy Readiness", value: "78", unit: "%", delta: "+8.4", up: true, color: "#10B981" },
];

const frameworks = [
  { name: "ISO 27001", pct: 87, trend: "up" },
  { name: "SOC 2 Type II", pct: 93, trend: "up" },
  { name: "GDPR", pct: 79, trend: "up" },
  { name: "HIPAA", pct: 71, trend: "flat" },
  { name: "NIS2", pct: 64, trend: "up" },
];

const risks = [
  { severity: "Critical", name: "Cloud Misconfiguration — S3 Buckets", owner: "AK", score: 18.4, trend: "down" },
  { severity: "High", name: "Privileged Account without MFA", owner: "MS", score: 14.2, trend: "down" },
  { severity: "High", name: "Unpatched Linux Kernel (3 servers)", owner: "RJ", score: 13.8, trend: "flat" },
  { severity: "Medium", name: "Vendor Data Processing Agreement Missing", owner: "PL", score: 9.1, trend: "up" },
  { severity: "Medium", name: "DSAR Response SLA Breach Risk", owner: "EW", score: 7.6, trend: "flat" },
];

const activity = [
  { module: "Risk", icon: "◈", text: "Risk RK-2041 updated — residual score lowered to 9.1", time: "2m ago", color: "#F59E0B" },
  { module: "Compliance", icon: "◉", text: "ISO 27001 — Control A.9.4.2 evidence accepted", time: "14m ago", color: "#6366F1" },
  { module: "AI vCISO", icon: "◆", text: "AI generated remediation playbook for CVE-2024-3094", time: "31m ago", color: "#8B5CF6" },
  { module: "Security", icon: "◎", text: "CAASM discovered 3 new shadow IT applications", time: "1h ago", color: "#06B6D4" },
  { module: "Privacy", icon: "◐", text: "DSAR request DSR-0312 processed — response sent", time: "2h ago", color: "#10B981" },
  { module: "Service Desk", icon: "◫", text: "Ticket SD-7841 auto-triaged by AI — P2 SLA assigned", time: "3h ago", color: "#EC4899" },
];

function RiskGauge() {
  const r = 80;
  const cx = 100;
  const cy = 100;
  const circumference = 2 * Math.PI * r;
  const segments = [
    { pct: 0.12, color: "#EF4444", label: "Critical" },
    { pct: 0.23, color: "#F59E0B", label: "High" },
    { pct: 0.38, color: "#6366F1", label: "Medium" },
    { pct: 0.27, color: "#10B981", label: "Low" },
  ];
  let offset = 0;
  return (
    <div style={{ position: "relative", width: 200, height: 200 }}>
      <svg width={200} height={200} viewBox="0 0 200 200">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={18} />
        {segments.map((s, i) => {
          const dash = s.pct * circumference;
          const gap = circumference - dash;
          const rotation = (offset / 1) * 360 - 90;
          offset += s.pct;
          return (
            <circle
              key={i}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={18}
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={0}
              transform={`rotate(${rotation} ${cx} ${cy})`}
              style={{ filter: `drop-shadow(0 0 6px ${s.color}88)` }}
            />
          );
        })}
        <text x={cx} y={cy - 8} textAnchor="middle" fill="white" fontSize={28} fontWeight={700} fontFamily="JetBrains Mono, monospace">84</text>
        <text x={cx} y={cy + 14} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize={10} fontFamily="Plus Jakarta Sans, sans-serif">RISK SCORE</text>
      </svg>
    </div>
  );
}

const severityColors: Record<string, string> = {
  Critical: "#EF4444",
  High: "#F59E0B",
  Medium: "#6366F1",
  Low: "#10B981",
};

export default function VariantA() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setTimeout(() => setMounted(true), 100); }, []);

  return (
    <div style={{
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      background: "#080A0F",
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      color: "white",
    }}>
      <style>{FONTS}{KEYFRAMES}</style>

      {/* TOP NAV */}
      <nav style={{
        height: 56,
        background: "rgba(255,255,255,0.03)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        backdropFilter: "blur(20px)",
        display: "flex",
        alignItems: "center",
        padding: "0 20px",
        gap: 16,
        position: "relative",
        zIndex: 10,
        flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 8 }}>
          <div style={{
            width: 28, height: 28,
            background: "linear-gradient(135deg, #6366F1, #06B6D4)",
            borderRadius: 6,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 800,
            boxShadow: "0 0 16px rgba(99,102,241,0.5)",
          }}>D</div>
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-0.3px" }}>AIGO</span>
        </div>

        {/* Org switcher */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 8,
          padding: "4px 12px",
          fontSize: 12,
          cursor: "pointer",
        }}>
          <span style={{ color: "rgba(255,255,255,0.6)" }}>Org:</span>
          <span style={{ fontWeight: 600 }}>Acme Corporation</span>
          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>▼</span>
        </div>

        <div style={{ flex: 1 }} />

        {/* Role chip */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "rgba(99,102,241,0.15)",
          border: "1px solid rgba(99,102,241,0.4)",
          borderRadius: 20,
          padding: "3px 10px",
          fontSize: 11,
          fontWeight: 600,
          color: "#A5B4FC",
        }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#6366F1", boxShadow: "0 0 6px #6366F1" }} />
          CISO
        </div>

        {/* AI Button */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(6,182,212,0.2))",
          border: "1px solid rgba(99,102,241,0.3)",
          borderRadius: 8,
          padding: "5px 12px",
          fontSize: 11,
          fontWeight: 600,
          cursor: "pointer",
          color: "#C7D2FE",
          animation: "float 3s ease-in-out infinite",
        }}>
          ◆ AI vCISO
        </div>

        {/* Notification bell */}
        <div style={{ position: "relative", cursor: "pointer" }}>
          <div style={{ fontSize: 18, opacity: 0.7 }}>🔔</div>
          <div style={{
            position: "absolute", top: -4, right: -4,
            background: "#EF4444",
            borderRadius: "50%",
            width: 16, height: 16,
            fontSize: 9,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 700,
            boxShadow: "0 0 8px rgba(239,68,68,0.6)",
          }}>7</div>
        </div>

        {/* Avatar */}
        <div style={{
          width: 32, height: 32,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 700,
          border: "2px solid rgba(99,102,241,0.5)",
          cursor: "pointer",
        }}>AK</div>
      </nav>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* SIDEBAR */}
        <aside style={{
          width: 72,
          background: "rgba(255,255,255,0.02)",
          borderRight: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "16px 0",
          gap: 4,
          flexShrink: 0,
        }}>
          {modules.map((m) => (
            <div key={m.id} style={{
              width: 48, height: 48,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              gap: 2,
              borderRadius: 10,
              cursor: "pointer",
              background: m.active ? "rgba(99,102,241,0.2)" : "transparent",
              border: m.active ? "1px solid rgba(99,102,241,0.4)" : "1px solid transparent",
              boxShadow: m.active ? "0 0 12px rgba(99,102,241,0.2), inset 0 0 0 1px rgba(255,255,255,0.08)" : "none",
              transition: "all 0.2s",
            }}>
              <span style={{
                fontSize: 16,
                color: m.active ? "#A5B4FC" : "rgba(255,255,255,0.35)",
              }}>{m.icon}</span>
              <span style={{
                fontSize: 8,
                fontWeight: 600,
                color: m.active ? "#A5B4FC" : "rgba(255,255,255,0.25)",
                letterSpacing: "0.5px",
              }}>{m.label.toUpperCase()}</span>
            </div>
          ))}
        </aside>

        {/* MAIN */}
        <main style={{
          flex: 1,
          overflow: "auto",
          padding: "20px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}>

          {/* AI INSIGHT BANNER */}
          <div style={{
            background: "linear-gradient(135deg, rgba(99,102,241,0.15), rgba(6,182,212,0.1))",
            border: "1px solid rgba(99,102,241,0.3)",
            borderRadius: 10,
            padding: "10px 16px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            backdropFilter: "blur(10px)",
          }}>
            <div style={{
              background: "linear-gradient(135deg, #6366F1, #06B6D4)",
              borderRadius: 6,
              padding: "4px 8px",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.5px",
              flexShrink: 0,
            }}>AI INSIGHT</div>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", fontWeight: 500 }}>
              3 critical misconfigurations detected in AWS prod — immediate remediation recommended. Estimated risk reduction: 28%.
            </span>
            <div style={{
              marginLeft: "auto",
              background: "rgba(99,102,241,0.2)",
              border: "1px solid rgba(99,102,241,0.4)",
              borderRadius: 6,
              padding: "3px 10px",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              color: "#A5B4FC",
              flexShrink: 0,
            }}>View Playbook →</div>
          </div>

          {/* KPI STRIP */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
            {kpis.map((kpi, i) => (
              <div key={i} style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 12,
                padding: "14px 16px",
                backdropFilter: "blur(10px)",
                boxShadow: `0 0 0 1px rgba(255,255,255,0.04), inset 0 0 0 1px rgba(255,255,255,0.03), 0 4px 24px rgba(0,0,0,0.4)`,
                animation: mounted ? `count-up 0.4s ease ${i * 0.08}s both` : "none",
                position: "relative",
                overflow: "hidden",
              }}>
                <div style={{
                  position: "absolute", top: 0, left: 0, right: 0, height: 2,
                  background: `linear-gradient(90deg, transparent, ${kpi.color}, transparent)`,
                  opacity: 0.8,
                }} />
                <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.4)", letterSpacing: "0.5px", marginBottom: 8, textTransform: "uppercase" }}>
                  {kpi.label}
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                  <span style={{
                    fontSize: 28, fontWeight: 700, letterSpacing: "-1px",
                    fontFamily: "'JetBrains Mono', monospace",
                    color: "white",
                  }}>{kpi.value}</span>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", fontFamily: "'JetBrains Mono', monospace" }}>{kpi.unit}</span>
                </div>
                <div style={{
                  display: "flex", alignItems: "center", gap: 4, marginTop: 6,
                  fontSize: 11, fontWeight: 600,
                  color: kpi.up ? "#10B981" : "#EF4444",
                }}>
                  <span>{kpi.up ? "▲" : "▼"}</span>
                  <span>{kpi.delta}</span>
                  <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>vs last month</span>
                </div>
              </div>
            ))}
          </div>

          {/* MIDDLE ROW */}
          <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 16 }}>
            {/* Risk Gauge */}
            <div style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 12,
              padding: "16px",
              backdropFilter: "blur(10px)",
              display: "flex", flexDirection: "column", alignItems: "center",
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", letterSpacing: "0.5px", marginBottom: 8, textTransform: "uppercase", alignSelf: "flex-start" }}>
                Risk Posture
              </div>
              <RiskGauge />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, width: "100%", marginTop: 4 }}>
                {[["Critical","#EF4444","7"],["High","#F59E0B","14"],["Medium","#6366F1","19"],["Low","#10B981","7"]].map(([l,c,n]) => (
                  <div key={l} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: c as string, boxShadow: `0 0 4px ${c}` }} />
                    <span style={{ color: "rgba(255,255,255,0.5)" }}>{l}</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "white", fontWeight: 600 }}>{n}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Compliance Frameworks */}
            <div style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 12,
              padding: "16px 20px",
              backdropFilter: "blur(10px)",
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", letterSpacing: "0.5px", marginBottom: 16, textTransform: "uppercase" }}>
                Compliance Frameworks
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {frameworks.map((fw, i) => (
                  <div key={i} style={{ animation: mounted ? `slide-in 0.3s ease ${0.2 + i * 0.06}s both` : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>{fw.name}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{
                          fontSize: 12, fontWeight: 700,
                          fontFamily: "'JetBrains Mono', monospace",
                          color: fw.pct >= 80 ? "#10B981" : fw.pct >= 65 ? "#6366F1" : "#F59E0B",
                        }}>{fw.pct}%</span>
                        <span style={{ fontSize: 10, color: fw.trend === "up" ? "#10B981" : "rgba(255,255,255,0.3)" }}>
                          {fw.trend === "up" ? "▲" : "—"}
                        </span>
                      </div>
                    </div>
                    <div style={{
                      height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden",
                    }}>
                      <div style={{
                        height: "100%", width: `${fw.pct}%`,
                        background: fw.pct >= 80
                          ? "linear-gradient(90deg, #10B981, #06D6A0)"
                          : fw.pct >= 65
                          ? "linear-gradient(90deg, #6366F1, #8B5CF6)"
                          : "linear-gradient(90deg, #F59E0B, #FCD34D)",
                        borderRadius: 3,
                        transition: "width 1s ease",
                        boxShadow: fw.pct >= 80 ? "0 0 8px rgba(16,185,129,0.4)" : "0 0 8px rgba(99,102,241,0.4)",
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* BOTTOM ROW */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16 }}>
            {/* Top Risks Table */}
            <div style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 12,
              padding: "16px 20px",
              backdropFilter: "blur(10px)",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", letterSpacing: "0.5px", textTransform: "uppercase" }}>
                  Top Risks
                </div>
                <div style={{ fontSize: 11, color: "#6366F1", cursor: "pointer", fontWeight: 600 }}>View Register →</div>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    {["Severity","Risk","Owner","Score","Trend"].map((h) => (
                      <th key={h} style={{
                        textAlign: "left", padding: "6px 8px",
                        color: "rgba(255,255,255,0.3)", fontWeight: 600, fontSize: 10,
                        letterSpacing: "0.5px", textTransform: "uppercase",
                        borderBottom: "1px solid rgba(255,255,255,0.06)",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {risks.map((r, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding: "9px 8px" }}>
                        <span style={{
                          background: `${severityColors[r.severity]}22`,
                          border: `1px solid ${severityColors[r.severity]}44`,
                          color: severityColors[r.severity],
                          borderRadius: 4, padding: "2px 7px",
                          fontSize: 10, fontWeight: 700,
                          boxShadow: `0 0 6px ${severityColors[r.severity]}33`,
                        }}>{r.severity}</span>
                      </td>
                      <td style={{ padding: "9px 8px", color: "rgba(255,255,255,0.8)", maxWidth: 240 }}>{r.name}</td>
                      <td style={{ padding: "9px 8px" }}>
                        <div style={{
                          width: 24, height: 24, borderRadius: "50%",
                          background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 9, fontWeight: 700,
                        }}>{r.owner}</div>
                      </td>
                      <td style={{
                        padding: "9px 8px",
                        fontFamily: "'JetBrains Mono', monospace",
                        fontWeight: 600, color: severityColors[r.severity],
                      }}>{r.score}</td>
                      <td style={{ padding: "9px 8px", fontSize: 12, color: r.trend === "down" ? "#10B981" : r.trend === "up" ? "#EF4444" : "rgba(255,255,255,0.3)" }}>
                        {r.trend === "down" ? "▼" : r.trend === "up" ? "▲" : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Activity Feed */}
            <div style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 12,
              padding: "16px",
              backdropFilter: "blur(10px)",
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", letterSpacing: "0.5px", marginBottom: 12, textTransform: "uppercase" }}>
                Recent Activity
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {activity.map((a, i) => (
                  <div key={i} style={{
                    display: "flex", gap: 10, alignItems: "flex-start",
                    animation: mounted ? `slide-in 0.3s ease ${0.3 + i * 0.06}s both` : "none",
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                      background: `${a.color}22`,
                      border: `1px solid ${a.color}44`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, color: a.color,
                    }}>{a.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", lineHeight: 1.4, fontWeight: 500 }}>{a.text}</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>{a.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
