import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useTheme } from "@/context/ThemeContext";

interface BrowserAgentStatus {
  count: number;
  connected: boolean;
  activeCount: number;
  version: string | null;
  lastSeen: string;
  eventCount24h: number;
  aiToolCount24h: number;
  shadowItCount24h: number;
  policyViolations24h: number;
  managedCount: number;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function BrowserAgentBadge() {
  const [, navigate] = useLocation();
  const { theme } = useTheme();
  const isDark = theme !== "light" && theme !== "light-dark";
  const [status, setStatus] = useState<BrowserAgentStatus | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchStatus = () => {
    const token = localStorage.getItem("grc_token");
    if (!token) return;
    fetch(`${BASE}/api/browser-agent/status`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setStatus(d); })
      .catch(() => {});
  };

  useEffect(() => {
    fetchStatus();
    const iv = setInterval(fetchStatus, 30_000);
    return () => clearInterval(iv);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const connected = status?.connected ?? false;
  const count     = status?.activeCount ?? 0;

  const dot  = connected ? "#10B981" : status ? "#9CA3AF" : "#9CA3AF";
  const glow = connected ? "0 0 6px #10B98166" : "none";

  const surfBg = isDark ? "rgba(255,255,255,0.06)" : "#F8FAFC";
  const surfBd = isDark ? "rgba(255,255,255,0.1)"  : "#E2E8F0";
  const popBg  = isDark ? "rgba(15,20,35,0.98)"    : "#FFFFFF";
  const popBd  = isDark ? "rgba(255,255,255,0.1)"  : "#E2E8F0";
  const textC  = isDark ? "rgba(255,255,255,0.88)" : "#1E293B";
  const mutedC = isDark ? "rgba(255,255,255,0.45)" : "#64748B";
  const accentC = "rgb(147,197,253)";

  const riskColor = { critical: "#DC2626", high: "#D97706", medium: "#6366F1", low: "#10B981" };

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      {/* Badge pill button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Browser Agent status — click for details"
        style={{
          display: "flex", alignItems: "center", gap: 6,
          background: surfBg, border: `1px solid ${open ? accentC : surfBd}`,
          borderRadius: 8, padding: "5px 10px", cursor: "pointer",
          fontFamily: "inherit", transition: "border-color 0.15s",
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = accentC)}
        onMouseLeave={e => !open && (e.currentTarget.style.borderColor = surfBd)}
      >
        {/* Status dot */}
        <div style={{
          width: 7, height: 7, borderRadius: "50%",
          background: dot, boxShadow: glow, flexShrink: 0,
          animation: connected ? "pulse-dot 2s ease-in-out infinite" : "none",
        }} />
        {/* Icon */}
        <i className="bi bi-browser-chrome" style={{ fontSize: 12, color: isDark ? "rgba(255,255,255,0.6)" : "#64748B" }} />
        {/* Label */}
        <span style={{ fontSize: 11, fontWeight: 700, color: connected ? (isDark ? "rgba(255,255,255,0.85)" : "#1E293B") : mutedC, whiteSpace: "nowrap" }}>
          {status ? (connected ? `${count} agent${count !== 1 ? "s" : ""}` : "No agents") : "Browser Agent"}
        </span>
        {/* Version */}
        {status?.version && (
          <span style={{ fontSize: 9, fontWeight: 700, color: mutedC, fontFamily: "monospace" }}>
            v{status.version}
          </span>
        )}
        {/* Policy violations badge */}
        {(status?.policyViolations24h ?? 0) > 0 && (
          <div style={{
            background: "#DC2626", borderRadius: 10, minWidth: 16, height: 16,
            padding: "0 4px", fontSize: 9, fontWeight: 800, color: "white",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {status!.policyViolations24h}
          </div>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0,
          width: 280, background: popBg, border: `1px solid ${popBd}`,
          borderRadius: 12, boxShadow: "0 16px 48px rgba(0,0,0,0.28)",
          backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
          zIndex: 999, overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{ padding: "12px 14px 10px", borderBottom: `1px solid ${popBd}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <i className="bi bi-browser-chrome" style={{ fontSize: 14, color: accentC }} />
                <span style={{ fontSize: 13, fontWeight: 800, color: textC }}>Browser Agent</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: dot, boxShadow: glow }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: connected ? "#10B981" : mutedC }}>
                  {connected ? "Online" : "Offline"}
                </span>
              </div>
            </div>
            {status?.version && (
              <div style={{ fontSize: 10, color: mutedC, marginTop: 3 }}>
                v{status.version} · {status.managedCount} managed
              </div>
            )}
          </div>

          {/* Stats grid */}
          {status && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: popBd }}>
              {[
                { label: "Active Extensions", value: status.activeCount,        icon: "bi-browser-chrome", color: "#10B981" },
                { label: "AI Tool Visits",     value: status.aiToolCount24h,     icon: "bi-robot",          color: accentC   },
                { label: "Shadow IT",          value: status.shadowItCount24h,   icon: "bi-cloud-slash",    color: "#F59E0B" },
                { label: "Policy Violations",  value: status.policyViolations24h,icon: "bi-shield-exclamation", color: "#EF4444" },
              ].map(({ label, value, icon, color }) => (
                <div key={label} style={{ background: popBg, padding: "10px 12px" }}>
                  <div style={{ fontSize: 9, color: mutedC, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{label}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <i className={`bi ${icon}`} style={{ fontSize: 12, color }} />
                    <span style={{ fontSize: 16, fontWeight: 800, color: textC }}>{value}</span>
                    <span style={{ fontSize: 9, color: mutedC }}>24h</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Footer CTA */}
          <div style={{ padding: "10px 14px", display: "flex", gap: 8 }}>
            <button
              onClick={() => { navigate("/agents"); setOpen(false); }}
              style={{
                flex: 1, padding: "7px 0", borderRadius: 8, border: `1px solid ${popBd}`,
                background: isDark ? "rgba(147,197,253,0.1)" : "#EFF6FF",
                color: accentC, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Manage Agents →
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
