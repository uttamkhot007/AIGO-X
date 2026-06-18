import { useEffect, type ReactNode } from "react";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  width?: number;
  children: ReactNode;
  headerColor?: string;
}

export function Drawer({ open, onClose, title, subtitle, width = 520, children, headerColor = "#1E3A5F" }: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex" }}>
      <div
        style={{ flex: 1, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(3px)" }}
        onClick={onClose}
      />
      <div style={{
        width, background: "var(--card)", border: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "-8px 0 48px rgba(0,0,0,0.6)",
        display: "flex", flexDirection: "column", overflow: "hidden",
        animation: "slideIn 0.2s ease",
      }}>
        <style>{`@keyframes slideIn { from { transform: translateX(40px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>

        <div style={{ background: headerColor, padding: "20px 24px", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "white", lineHeight: 1.3 }}>{title}</div>
            {subtitle && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", marginTop: 3 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 6, width: 28, height: 28, cursor: "pointer", color: "white", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit", flexShrink: 0 }}>×</button>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function Field({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, color: "var(--foreground)", fontWeight: 500, fontFamily: mono ? "'JetBrains Mono', monospace" : "inherit" }}>{value ?? "—"}</div>
    </div>
  );
}

export function DrawerSection({ title }: { title: string }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.5px", textTransform: "uppercase", marginTop: 22, marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid var(--border)" }}>{title}</div>
  );
}

export function DrawerBadge({ label, color, bg, border }: { label: string; color: string; bg: string; border: string }) {
  return (
    <span style={{ background: bg, border: `1px solid ${border}`, color, borderRadius: 4, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{label}</span>
  );
}

export function AiInsightBox({ insights }: { insights: string[] }) {
  if (!insights?.length) return null;
  return (
    <div style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(99,179,237,0.2)", borderRadius: 8, padding: "12px 14px", marginTop: 4 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "rgb(147,197,253)", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 8 }}>✦ AI Insights</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {insights.map((ins, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ color: "rgb(147,197,253)", fontSize: 11, flexShrink: 0, marginTop: 1 }}>›</span>
            <span style={{ fontSize: 12, color: "var(--foreground)", lineHeight: 1.55 }}>{ins}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
