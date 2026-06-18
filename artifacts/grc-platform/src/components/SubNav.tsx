import { useState } from "react";

export interface SubNavTab {
  key: string;
  label: string;
  count?: number;
  dot?: string;
}

interface SubNavProps {
  tabs: SubNavTab[];
  active: string;
  onSelect: (key: string) => void;
}

export function SubNav({ tabs, active, onSelect }: SubNavProps) {
  return (
    <div style={{
      display: "flex", gap: 0, borderBottom: "1px solid var(--border)",
      background: "var(--card)", padding: "0 24px",
      position: "sticky", top: 0, zIndex: 10,
      boxShadow: "0 1px 0 rgba(0,0,0,0.06)",
      flexShrink: 0, overflowX: "auto",
      scrollbarWidth: "none",
    }}>
      {tabs.map(t => (
        <button key={t.key} onClick={() => onSelect(t.key)} style={{
          padding: "11px 16px", fontSize: 12, fontWeight: 700,
          cursor: "pointer", fontFamily: "inherit",
          background: "none", border: "none",
          borderBottom: `2px solid ${active === t.key ? "rgb(147,197,253)" : "transparent"}`,
          color: active === t.key ? "rgb(147,197,253)" : "var(--muted-foreground)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "color 0.15s", whiteSpace: "nowrap",
        }}>
          {t.dot && <div style={{ width: 6, height: 6, borderRadius: "50%", background: t.dot }} />}
          {t.label}
          {t.count !== undefined && (
            <span style={{
              background: active === t.key ? "rgba(99,179,237,0.12)" : "var(--border)",
              color: active === t.key ? "rgb(147,197,253)" : "var(--muted-foreground)",
              border: `1px solid ${active === t.key ? "rgba(99,179,237,0.25)" : "var(--border)"}`,
              borderRadius: 10, padding: "1px 7px", fontSize: 10, fontWeight: 700,
            }}>{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function ModuleHeader({
  title, description, action, secondAction, badge,
}: {
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
  secondAction?: { label: string; onClick: () => void };
  badge?: { label: string; color: string; bg: string };
}) {
  return (
    <div style={{
      padding: "16px 24px 12px", background: "rgb(9,12,18)",
      borderBottom: "1px solid var(--border)",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      flexShrink: 0,
    }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: "rgb(147,197,253)", letterSpacing: "-0.5px", margin: 0 }}>{title}</h1>
          {badge && (
            <span style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.color}33`, borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{badge.label}</span>
          )}
        </div>
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: 0, fontWeight: 500 }}>{description}</p>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {secondAction && (
          <button onClick={secondAction.onClick} style={{
            background: "var(--secondary)", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700,
            color: "var(--foreground)", cursor: "pointer", fontFamily: "inherit",
          }}>{secondAction.label}</button>
        )}
        {action && (
          <button onClick={action.onClick} style={{
            background: "linear-gradient(135deg, #1E3A5F, #065F46)", border: "none",
            borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700,
            color: "white", cursor: "pointer", fontFamily: "inherit",
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
          }}>{action.label}</button>
        )}
      </div>
    </div>
  );
}

export const sev: Record<string, { bg: string; color: string; border: string }> = {
  Critical: { bg: "rgba(239,68,68,0.08)",   color: "#F87171", border: "rgba(239,68,68,0.3)"   },
  High:     { bg: "rgba(251,191,36,0.08)",  color: "#FBBF24", border: "rgba(251,191,36,0.3)"  },
  Medium:   { bg: "rgba(99,179,237,0.10)",  color: "rgb(147,197,253)", border: "rgba(99,179,237,0.3)" },
  Low:      { bg: "rgba(52,211,153,0.08)",  color: "#34D399", border: "rgba(52,211,153,0.3)"  },
  Info:     { bg: "rgba(14,165,233,0.08)",  color: "#38BDF8", border: "rgba(14,165,233,0.3)"  },
};

export const statusBadge: Record<string, { bg: string; color: string; border: string }> = {
  "active":        { bg: "rgba(52,211,153,0.08)",  color: "#34D399", border: "rgba(52,211,153,0.3)"  },
  "implemented":   { bg: "rgba(52,211,153,0.08)",  color: "#34D399", border: "rgba(52,211,153,0.3)"  },
  "completed":     { bg: "rgba(52,211,153,0.08)",  color: "#34D399", border: "rgba(52,211,153,0.3)"  },
  "resolved":      { bg: "rgba(52,211,153,0.08)",  color: "#34D399", border: "rgba(52,211,153,0.3)"  },
  "approved":      { bg: "rgba(52,211,153,0.08)",  color: "#34D399", border: "rgba(52,211,153,0.3)"  },
  "in-progress":   { bg: "rgba(99,179,237,0.10)",  color: "rgb(147,197,253)", border: "rgba(99,179,237,0.3)" },
  "in-review":     { bg: "rgba(99,179,237,0.10)",  color: "rgb(147,197,253)", border: "rgba(99,179,237,0.3)" },
  "open":          { bg: "rgba(251,191,36,0.08)",  color: "#FBBF24", border: "rgba(251,191,36,0.3)"  },
  "partial":       { bg: "rgba(251,191,36,0.08)",  color: "#FBBF24", border: "rgba(251,191,36,0.3)"  },
  "planned":       { bg: "rgba(148,163,184,0.08)", color: "rgba(148,163,184,0.8)", border: "rgba(148,163,184,0.2)" },
  "draft":         { bg: "rgba(148,163,184,0.08)", color: "rgba(148,163,184,0.8)", border: "rgba(148,163,184,0.2)" },
  "not-started":   { bg: "rgba(148,163,184,0.08)", color: "rgba(148,163,184,0.8)", border: "rgba(148,163,184,0.2)" },
  "overdue":       { bg: "rgba(239,68,68,0.08)",   color: "#F87171", border: "rgba(239,68,68,0.3)"   },
  "breached":      { bg: "rgba(239,68,68,0.08)",   color: "#F87171", border: "rgba(239,68,68,0.3)"   },
  "closed":        { bg: "rgba(52,211,153,0.08)",  color: "#34D399", border: "rgba(52,211,153,0.3)"  },
  "generated":     { bg: "rgba(52,211,153,0.08)",  color: "#34D399", border: "rgba(52,211,153,0.3)"  },
  "scheduled":     { bg: "rgba(99,179,237,0.10)",  color: "rgb(147,197,253)", border: "rgba(99,179,237,0.3)" },
  "disabled":      { bg: "rgba(148,163,184,0.06)", color: "var(--muted-foreground)", border: "rgba(148,163,184,0.15)" },
  "suspended":     { bg: "rgba(239,68,68,0.06)",   color: "#F87171", border: "rgba(239,68,68,0.2)"   },
  "pending":       { bg: "rgba(251,191,36,0.06)",  color: "#FBBF24", border: "rgba(251,191,36,0.2)"  },
};

export function Badge({ label, style: s }: { label?: string; style?: React.CSSProperties }) {
  if (!label) return null;
  const ss = statusBadge[label.toLowerCase()] ?? { bg: "rgba(148,163,184,0.08)", color: "rgba(148,163,184,0.8)", border: "rgba(148,163,184,0.2)" };
  return (
    <span style={{
      background: ss.bg, color: ss.color, border: `1px solid ${ss.border}`,
      borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700,
      textTransform: "capitalize", whiteSpace: "nowrap", ...s,
    }}>{label}</span>
  );
}

export function SevBadge({ label }: { label: string }) {
  const ss = sev[label] ?? sev.Low;
  return (
    <span style={{
      background: ss.bg, color: ss.color, border: `1px solid ${ss.border}`,
      borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700,
    }}>{label}</span>
  );
}

export function TableShell({ cols, rows, onRowClick, selectable = true, bulkActions }: {
  cols: string[];
  rows: React.ReactNode[][];
  onRowClick?: (rowIndex: number) => void;
  selectable?: boolean;
  bulkActions?: { label: string; icon?: string; danger?: boolean; onClick: (indices: number[]) => void }[];
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const toggleRow = (i: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
  };

  const toggleAll = () =>
    setSelected(prev => prev.size === rows.length ? new Set() : new Set(rows.map((_, i) => i)));

  const hasSelected = selected.size > 0;
  const allSelected = rows.length > 0 && selected.size === rows.length;

  const actions = bulkActions ?? [
    { label: "Export CSV", icon: "↓",  danger: false, onClick: (_: number[]) => {} },
    { label: "Assign",     icon: "→",  danger: false, onClick: (_: number[]) => {} },
    { label: "Archive",    icon: "⬡",  danger: false, onClick: (_: number[]) => {} },
    { label: "Delete",     icon: "✕",  danger: true,  onClick: (_: number[]) => {} },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Bulk action bar — slides in when rows are selected */}
      <div style={{
        height: hasSelected ? 44 : 0, overflow: "hidden", transition: "height 0.2s ease",
        background: "rgba(59,130,246,0.12)",
        borderTop: `1px solid ${hasSelected ? "rgba(99,179,237,0.3)" : "transparent"}`,
        borderLeft: `1px solid ${hasSelected ? "rgba(99,179,237,0.3)" : "transparent"}`,
        borderRight: `1px solid ${hasSelected ? "rgba(99,179,237,0.3)" : "transparent"}`,
        borderBottom: "none", borderRadius: "10px 10px 0 0",
        display: "flex", alignItems: "center", padding: "0 14px", gap: 10,
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "rgb(147,197,253)", minWidth: 86, whiteSpace: "nowrap" }}>
          {selected.size} selected
        </span>
        <div style={{ width: 1, height: 18, background: "rgba(147,197,253,0.2)", flexShrink: 0 }} />
        {actions.map(a => (
          <button key={a.label} onClick={() => a.onClick([...selected])} style={{
            padding: "4px 11px", borderRadius: 6, fontSize: 11, fontWeight: 700,
            cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4,
            border: `1px solid ${a.danger ? "rgba(239,68,68,0.45)" : "rgba(99,179,237,0.35)"}`,
            background: a.danger ? "rgba(239,68,68,0.10)" : "rgba(59,130,246,0.15)",
            color: a.danger ? "#F87171" : "rgb(147,197,253)",
            transition: "background 0.12s",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = a.danger ? "rgba(239,68,68,0.22)" : "rgba(59,130,246,0.28)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = a.danger ? "rgba(239,68,68,0.10)" : "rgba(59,130,246,0.15)"; }}>
            {a.icon && <span style={{ fontSize: 10 }}>{a.icon}</span>}{a.label}
          </button>
        ))}
        <button onClick={() => setSelected(new Set())} style={{
          marginLeft: "auto", padding: "3px 9px", borderRadius: 5, border: "1px solid rgba(148,163,184,0.2)",
          background: "transparent", color: "var(--muted-foreground)", fontSize: 10, fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit",
        }}>Clear</button>
      </div>

      {/* Table */}
      <div style={{
        background: "var(--card)", border: "1px solid var(--border)",
        borderRadius: hasSelected ? "0 0 12px 12px" : 12,
        overflow: "hidden", boxShadow: "0 2px 16px rgba(0,0,0,0.45)",
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "var(--input)", borderBottom: "1px solid var(--border)" }}>
              {selectable && (
                <th style={{ padding: "10px 14px", width: 36, textAlign: "center" }}>
                  <input type="checkbox" checked={allSelected}
                    ref={el => { if (el) el.indeterminate = hasSelected && !allSelected; }}
                    onChange={toggleAll}
                    style={{ cursor: "pointer", accentColor: "rgb(147,197,253)", width: 13, height: 13 }} />
                </th>
              )}
              {cols.map(c => <th key={c} style={{ textAlign: "left", padding: "10px 14px", color: "var(--muted-foreground)", fontWeight: 700, fontSize: 10, letterSpacing: "0.5px", textTransform: "uppercase" }}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} onClick={() => onRowClick?.(i)}
                style={{
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                  cursor: onRowClick ? "pointer" : "default", transition: "background 0.1s",
                  background: selected.has(i) ? "rgba(59,130,246,0.09)" : "transparent",
                }}
                onMouseEnter={e => { if (!selected.has(i) && onRowClick) (e.currentTarget as HTMLTableRowElement).style.background = "rgba(59,130,246,0.07)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = selected.has(i) ? "rgba(59,130,246,0.09)" : "transparent"; }}>
                {selectable && (
                  <td style={{ padding: "11px 14px", width: 36, textAlign: "center" }} onClick={e => toggleRow(i, e)}>
                    <input type="checkbox" checked={selected.has(i)}
                      onChange={e => e.stopPropagation()}
                      onClick={e => e.stopPropagation()}
                      style={{ cursor: "pointer", accentColor: "rgb(147,197,253)", width: 13, height: 13, pointerEvents: "none" }} />
                  </td>
                )}
                {row.map((cell, j) => <td key={j} style={{ padding: "11px 14px", color: "var(--foreground)" }}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Mono({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "var(--muted-foreground)", fontWeight: 600, ...style }}>{children}</span>;
}
