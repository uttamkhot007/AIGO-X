import { useEffect, useState } from "react";

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
`;

const KEYFRAMES = `
@keyframes fade-up { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
@keyframes slide-right { from{opacity:0;transform:translateX(-8px)} to{opacity:1;transform:translateX(0)} }
@keyframes subtle-scale { from{opacity:0;transform:scale(0.97)} to{opacity:1;transform:scale(1)} }
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
  { label: "GRC Score", value: "84", unit: "/100", delta: "+3.2", up: true, color: "#1E3A5F", bg: "#EFF6FF", border: "#BFDBFE" },
  { label: "Open Risks", value: "47", unit: "", delta: "-12", up: false, color: "#92400E", bg: "#FFFBEB", border: "#FDE68A" },
  { label: "Controls Coverage", value: "91", unit: "%", delta: "+5.1", up: true, color: "#065F46", bg: "#ECFDF5", border: "#A7F3D0" },
  { label: "Active Audits", value: "6", unit: "", delta: "0", up: true, color: "#4338CA", bg: "#EEF2FF", border: "#C7D2FE" },
  { label: "Privacy Readiness", value: "78", unit: "%", delta: "+8.4", up: true, color: "#065F46", bg: "#F0FDF4", border: "#BBF7D0" },
];

const frameworks = [
  { name: "ISO 27001", pct: 87, trend: "up", color: "#1E3A5F" },
  { name: "SOC 2 Type II", pct: 93, trend: "up", color: "#065F46" },
  { name: "GDPR", pct: 79, trend: "up", color: "#4338CA" },
  { name: "HIPAA", pct: 71, trend: "flat", color: "#92400E" },
  { name: "NIS2", pct: 64, trend: "up", color: "#0C4A6E" },
];

const risks = [
  { severity: "Critical", name: "Cloud Misconfiguration — S3 Buckets", owner: "AK", score: 18.4, trend: "down" },
  { severity: "High", name: "Privileged Account without MFA", owner: "MS", score: 14.2, trend: "down" },
  { severity: "High", name: "Unpatched Linux Kernel (3 servers)", owner: "RJ", score: 13.8, trend: "flat" },
  { severity: "Medium", name: "Vendor DPA Missing", owner: "PL", score: 9.1, trend: "up" },
  { severity: "Medium", name: "DSAR Response SLA Breach Risk", owner: "EW", score: 7.6, trend: "flat" },
];

const activity = [
  { module: "Risk", icon: "◈", text: "Risk RK-2041 updated — residual score lowered to 9.1", time: "2m ago", dot: "#B45309" },
  { module: "Compliance", icon: "◉", text: "ISO 27001 — Control A.9.4.2 evidence accepted", time: "14m ago", dot: "#1E3A5F" },
  { module: "AI vCISO", icon: "◆", text: "AI generated remediation playbook for CVE-2024-3094", time: "31m ago", dot: "#4338CA" },
  { module: "Security", icon: "◎", text: "CAASM discovered 3 new shadow IT applications", time: "1h ago", dot: "#0C4A6E" },
  { module: "Privacy", icon: "◐", text: "DSAR request DSR-0312 processed — response sent", time: "2h ago", dot: "#065F46" },
  { module: "Service Desk", icon: "◫", text: "Ticket SD-7841 auto-triaged by AI — P2 SLA assigned", time: "3h ago", dot: "#9D174D" },
];

const severityStyle: Record<string, { bg: string; color: string; border: string }> = {
  Critical: { bg: "#FEF2F2", color: "#991B1B", border: "#FECACA" },
  High: { bg: "#FFFBEB", color: "#92400E", border: "#FDE68A" },
  Medium: { bg: "#EEF2FF", color: "#3730A3", border: "#C7D2FE" },
  Low: { bg: "#ECFDF5", color: "#065F46", border: "#A7F3D0" },
};

function RiskGaugeLight() {
  const r = 78;
  const cx = 100;
  const cy = 100;
  const circumference = 2 * Math.PI * r;
  const segments = [
    { pct: 0.12, color: "#DC2626" },
    { pct: 0.23, color: "#D97706" },
    { pct: 0.38, color: "#1E3A5F" },
    { pct: 0.27, color: "#065F46" },
  ];
  let offset = 0;
  return (
    <svg width={200} height={200} viewBox="0 0 200 200">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#E5E7EB" strokeWidth={16} />
      {segments.map((s, i) => {
        const dash = s.pct * circumference;
        const gap = circumference - dash;
        const rotation = offset * 360 - 90;
        offset += s.pct;
        return (
          <circle
            key={i}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={16}
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={0}
            transform={`rotate(${rotation} ${cx} ${cy})`}
          />
        );
      })}
      <text x={cx} y={cy - 6} textAnchor="middle" fill="#1E3A5F" fontSize={30} fontWeight={800} fontFamily="JetBrains Mono, monospace">84</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill="#9CA3AF" fontSize={9} fontFamily="Plus Jakarta Sans, sans-serif" fontWeight={600} letterSpacing="1">RISK SCORE</text>
    </svg>
  );
}

export default function VariantB() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setTimeout(() => setMounted(true), 80); }, []);

  return (
    <div style={{
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      background: "#F9F8F6",
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      color: "#1E3A5F",
    }}>
      <style>{FONTS}{KEYFRAMES}</style>

      {/* TOP NAV */}
      <nav style={{
        height: 56,
        background: "white",
        borderBottom: "1px solid #E5E7EB",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
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
            background: "linear-gradient(135deg, #1E3A5F, #065F46)",
            borderRadius: 6,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 800, color: "white",
            boxShadow: "0 2px 8px rgba(30,58,95,0.25), inset 0 1px 0 rgba(255,255,255,0.2)",
          }}>D</div>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#1E3A5F", letterSpacing: "-0.3px" }}>AIGO</span>
        </div>

        {/* Org switcher */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "#F9FAFB",
          border: "1px solid #E5E7EB",
          borderRadius: 8,
          padding: "4px 12px",
          fontSize: 12,
          cursor: "pointer",
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          color: "#374151",
        }}>
          <span style={{ color: "#9CA3AF" }}>Org:</span>
          <span style={{ fontWeight: 600, color: "#1E3A5F" }}>Acme Corporation</span>
          <span style={{ color: "#9CA3AF", fontSize: 10 }}>▼</span>
        </div>

        <div style={{ flex: 1 }} />

        {/* Role chip */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "#EFF6FF",
          border: "1px solid #BFDBFE",
          borderRadius: 20,
          padding: "4px 12px",
          fontSize: 11, fontWeight: 700,
          color: "#1D4ED8",
        }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#1E3A5F" }} />
          CISO
        </div>

        {/* AI Button */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "linear-gradient(135deg, #1E3A5F, #065F46)",
          borderRadius: 8,
          padding: "5px 12px",
          fontSize: 11, fontWeight: 600,
          cursor: "pointer",
          color: "white",
          boxShadow: "0 2px 8px rgba(30,58,95,0.3), inset 0 1px 0 rgba(255,255,255,0.15)",
        }}>
          ◆ AI vCISO
        </div>

        {/* Notification */}
        <div style={{ position: "relative", cursor: "pointer" }}>
          <div style={{ fontSize: 17, color: "#6B7280" }}>🔔</div>
          <div style={{
            position: "absolute", top: -3, right: -3,
            background: "#DC2626",
            borderRadius: "50%", width: 15, height: 15,
            fontSize: 8,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 700, color: "white",
            boxShadow: "0 1px 4px rgba(220,38,38,0.4)",
          }}>7</div>
        </div>

        {/* Avatar */}
        <div style={{
          width: 32, height: 32, borderRadius: "50%",
          background: "linear-gradient(135deg, #1E3A5F, #2D5F8A)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 700, color: "white",
          border: "2px solid #BFDBFE",
          cursor: "pointer",
          boxShadow: "0 2px 6px rgba(30,58,95,0.2)",
        }}>AK</div>
      </nav>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* SIDEBAR */}
        <aside style={{
          width: 72,
          background: "white",
          borderRight: "1px solid #E5E7EB",
          boxShadow: "1px 0 3px rgba(0,0,0,0.04)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "16px 0",
          gap: 4,
          flexShrink: 0,
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E\")",
        }}>
          {modules.map((m) => (
            <div key={m.id} style={{
              width: 48, height: 48,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              gap: 2,
              borderRadius: 10,
              cursor: "pointer",
              background: m.active ? "#EFF6FF" : "transparent",
              border: m.active ? "1px solid #BFDBFE" : "1px solid transparent",
              boxShadow: m.active ? "0 2px 8px rgba(30,58,95,0.1), inset 0 1px 0 rgba(255,255,255,0.8)" : "none",
              transition: "all 0.2s",
            }}>
              <span style={{
                fontSize: 15,
                color: m.active ? "#1E3A5F" : "#9CA3AF",
              }}>{m.icon}</span>
              <span style={{
                fontSize: 8, fontWeight: 700,
                color: m.active ? "#1E3A5F" : "#9CA3AF",
                letterSpacing: "0.4px",
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
            background: "linear-gradient(135deg, #EFF6FF, #F0FDF4)",
            border: "1px solid #BFDBFE",
            borderRadius: 10,
            padding: "10px 16px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            boxShadow: "0 1px 3px rgba(30,58,95,0.08)",
          }}>
            <div style={{
              background: "linear-gradient(135deg, #1E3A5F, #065F46)",
              borderRadius: 6,
              padding: "4px 10px",
              fontSize: 10, fontWeight: 700,
              letterSpacing: "0.5px",
              color: "white",
              flexShrink: 0,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15)",
            }}>AI INSIGHT</div>
            <span style={{ fontSize: 12, color: "#374151", fontWeight: 500 }}>
              3 critical misconfigurations detected in AWS prod — immediate remediation recommended. Estimated risk reduction: 28%.
            </span>
            <div style={{
              marginLeft: "auto",
              background: "white",
              border: "1px solid #E5E7EB",
              borderRadius: 6,
              padding: "3px 10px",
              fontSize: 11, fontWeight: 600,
              cursor: "pointer",
              color: "#1E3A5F",
              flexShrink: 0,
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            }}>View Playbook →</div>
          </div>

          {/* KPI STRIP */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
            {kpis.map((kpi, i) => (
              <div key={i} style={{
                background: "white",
                border: `1px solid ${kpi.border}`,
                borderRadius: 12,
                padding: "14px 16px",
                boxShadow: `0 2px 12px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.9)`,
                animation: mounted ? `subtle-scale 0.4s ease ${i * 0.07}s both` : "none",
                position: "relative",
                overflow: "hidden",
                transition: "box-shadow 0.2s, transform 0.2s",
              }}>
                <div style={{
                  position: "absolute", top: 0, left: 0, right: 0, height: 3,
                  background: kpi.color,
                  opacity: 0.7,
                  borderRadius: "12px 12px 0 0",
                }} />
                <div style={{
                  position: "absolute", top: 3, left: 0, right: 0, height: 20,
                  background: "linear-gradient(180deg, rgba(255,255,255,0.6), transparent)",
                }} />
                <div style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.5px", marginBottom: 8, textTransform: "uppercase" }}>
                  {kpi.label}
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
                  <span style={{
                    fontSize: 28, fontWeight: 800, letterSpacing: "-1px",
                    fontFamily: "'JetBrains Mono', monospace",
                    color: kpi.color,
                  }}>{kpi.value}</span>
                  <span style={{ fontSize: 13, color: "#9CA3AF", fontFamily: "'JetBrains Mono', monospace" }}>{kpi.unit}</span>
                </div>
                <div style={{
                  display: "flex", alignItems: "center", gap: 4, marginTop: 6,
                  fontSize: 11, fontWeight: 600,
                  color: kpi.up ? "#065F46" : "#DC2626",
                }}>
                  <span>{kpi.up ? "▲" : "▼"}</span>
                  <span>{kpi.delta}</span>
                  <span style={{ color: "#9CA3AF", fontWeight: 400 }}>vs last month</span>
                </div>
              </div>
            ))}
          </div>

          {/* MIDDLE ROW */}
          <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 16 }}>
            {/* Risk Gauge */}
            <div style={{
              background: "white",
              border: "1px solid #E5E7EB",
              borderRadius: 12,
              padding: "16px",
              boxShadow: "0 2px 12px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.9)",
              display: "flex", flexDirection: "column", alignItems: "center",
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.5px", marginBottom: 6, textTransform: "uppercase", alignSelf: "flex-start" }}>
                Risk Posture
              </div>
              <RiskGaugeLight />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, width: "100%", marginTop: 4 }}>
                {[["Critical","#DC2626","7"],["High","#D97706","14"],["Medium","#1E3A5F","19"],["Low","#065F46","7"]].map(([l,c,n]) => (
                  <div key={l} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10 }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: c as string, flexShrink: 0 }} />
                    <span style={{ color: "#6B7280" }}>{l}</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#1E3A5F", fontWeight: 700 }}>{n}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Compliance Frameworks */}
            <div style={{
              background: "white",
              border: "1px solid #E5E7EB",
              borderRadius: 12,
              padding: "16px 20px",
              boxShadow: "0 2px 12px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.9)",
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.5px", marginBottom: 16, textTransform: "uppercase" }}>
                Compliance Frameworks
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                {frameworks.map((fw, i) => (
                  <div key={i} style={{ animation: mounted ? `slide-right 0.3s ease ${0.2 + i * 0.06}s both` : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{fw.name}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{
                          fontSize: 12, fontWeight: 700,
                          fontFamily: "'JetBrains Mono', monospace",
                          color: fw.color,
                        }}>{fw.pct}%</span>
                        <span style={{
                          fontSize: 9, fontWeight: 700,
                          color: fw.trend === "up" ? "#065F46" : "#9CA3AF",
                          background: fw.trend === "up" ? "#ECFDF5" : "#F9FAFB",
                          border: `1px solid ${fw.trend === "up" ? "#A7F3D0" : "#E5E7EB"}`,
                          borderRadius: 3, padding: "1px 4px",
                        }}>
                          {fw.trend === "up" ? "▲" : "—"}
                        </span>
                      </div>
                    </div>
                    <div style={{
                      height: 6, background: "#F3F4F6", borderRadius: 4, overflow: "hidden",
                      boxShadow: "inset 0 1px 2px rgba(0,0,0,0.06)",
                    }}>
                      <div style={{
                        height: "100%", width: `${fw.pct}%`,
                        background: fw.color,
                        borderRadius: 4,
                        backgroundImage: "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0) 100%)",
                        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.3)`,
                        transition: "width 1s ease",
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
              background: "white",
              border: "1px solid #E5E7EB",
              borderRadius: 12,
              padding: "16px 20px",
              boxShadow: "0 2px 12px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.9)",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.5px", textTransform: "uppercase" }}>
                  Top Risks
                </div>
                <div style={{ fontSize: 11, color: "#1E3A5F", cursor: "pointer", fontWeight: 700 }}>View Register →</div>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #F3F4F6" }}>
                    {["Severity","Risk","Owner","Score","Trend"].map((h) => (
                      <th key={h} style={{
                        textAlign: "left", padding: "6px 8px",
                        color: "#9CA3AF", fontWeight: 700, fontSize: 10,
                        letterSpacing: "0.5px", textTransform: "uppercase",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {risks.map((r, i) => (
                    <tr key={i} style={{
                      borderBottom: "1px solid #F9FAFB",
                      transition: "background 0.15s",
                    }}>
                      <td style={{ padding: "10px 8px" }}>
                        <span style={{
                          background: severityStyle[r.severity].bg,
                          border: `1px solid ${severityStyle[r.severity].border}`,
                          color: severityStyle[r.severity].color,
                          borderRadius: 4, padding: "2px 8px",
                          fontSize: 10, fontWeight: 700,
                        }}>{r.severity}</span>
                      </td>
                      <td style={{ padding: "10px 8px", color: "#374151", maxWidth: 240, fontSize: 12 }}>{r.name}</td>
                      <td style={{ padding: "10px 8px" }}>
                        <div style={{
                          width: 26, height: 26, borderRadius: "50%",
                          background: "linear-gradient(135deg, #1E3A5F, #2D5F8A)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 9, fontWeight: 700, color: "white",
                          boxShadow: "0 2px 4px rgba(30,58,95,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
                        }}>{r.owner}</div>
                      </td>
                      <td style={{
                        padding: "10px 8px",
                        fontFamily: "'JetBrains Mono', monospace",
                        fontWeight: 700, color: severityStyle[r.severity].color, fontSize: 13,
                      }}>{r.score}</td>
                      <td style={{ padding: "10px 8px", fontSize: 12 }}>
                        <span style={{
                          color: r.trend === "down" ? "#065F46" : r.trend === "up" ? "#DC2626" : "#9CA3AF",
                          fontWeight: 700,
                        }}>
                          {r.trend === "down" ? "▼" : r.trend === "up" ? "▲" : "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Activity Feed */}
            <div style={{
              background: "white",
              border: "1px solid #E5E7EB",
              borderRadius: 12,
              padding: "16px",
              boxShadow: "0 2px 12px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.9)",
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.5px", marginBottom: 12, textTransform: "uppercase" }}>
                Recent Activity
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                {activity.map((a, i) => (
                  <div key={i} style={{
                    display: "flex", gap: 10, alignItems: "flex-start",
                    animation: mounted ? `slide-right 0.3s ease ${0.3 + i * 0.06}s both` : "none",
                  }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: a.dot,
                      flexShrink: 0, marginTop: 5,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: "#374151", lineHeight: 1.5, fontWeight: 500 }}>{a.text}</div>
                      <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2, fontWeight: 500 }}>{a.time}</div>
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
