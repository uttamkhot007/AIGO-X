// @ts-nocheck
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { getApiUrl } from "@/lib/api";
import { RiskBubbleHeatmap } from "@/components/command-center/RiskBubbleHeatmap";
import XLSXStyle from "xlsx-js-style";
import { exportBoardPackPdf } from "@/lib/boardPackPdf";

const apiUrl = (path: string) => getApiUrl(path.replace(/^\//, ""));
const token = () => localStorage.getItem("grc_token") ?? "";
const hdr = (): Record<string, string> => {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const t = token(); if (t) h["Authorization"] = `Bearer ${t}`;
  const vt = localStorage.getItem("grc_view_tenant"); if (vt) h["X-View-As-Tenant"] = vt;
  return h;
};

// ── Design tokens ──────────────────────────────────────────────────────────
const BG  = "var(--background)";
const SUR = "var(--card)";
const BOR = "var(--border)";
const FG  = "var(--foreground)";
const MUT = "var(--muted-foreground)";
const EME = "#34D399";
const AMB = "#FBBF24";
const RED = "#F87171";
const BLU = "#60A5FA";
const PUR = "#A78BFA";
const ORG = "#FB923C";

const RISK_TYPES = ["Macroeconomic", "Financial System", "Policy/Regulatory", "Geopolitical", "Climate/ESG"] as const;
const PILLARS    = ["Growth", "Innovation", "Compliance", "Operations", "People", "Technology"] as const;
const SCEN_TYPES = ["Adverse", "Severe", "Catastrophic", "What-If"] as const;
const KRI_CATS   = ["Macroeconomic", "Financial System", "Policy/Regulatory", "Geopolitical", "Climate/ESG", "Other"] as const;

const LIKELIHOOD_LABELS = ["Remote (1)", "Unlikely (2)", "Possible (3)", "Likely (4)", "Probable (5)"];
const IMPACT_LABELS     = ["Negligible (1)", "Low (2)", "Medium (3)", "High (4)", "Extreme (5)"];

const SEV_COLOR: Record<string, string> = {
  withinAppetite: EME, withinTolerance: AMB, outsideTolerance: RED,
};
const SEV_LABEL: Record<string, string> = {
  withinAppetite: "Within Appetite", withinTolerance: "Within Tolerance", outsideTolerance: "Outside Tolerance",
};

const TYPE_COLOR: Record<string, string> = {
  Macroeconomic: BLU, "Financial System": PUR, "Policy/Regulatory": AMB, Geopolitical: RED, "Climate/ESG": EME,
};

// ── Shared UI atoms ────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color }: any) {
  return (
    <div style={{ background: SUR, border: `1px solid ${BOR}`, borderRadius: 10, padding: "14px 18px", display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, color: MUT, fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 22, fontWeight: 700, color: color ?? FG, fontVariantNumeric: "tabular-nums" }}>{value}</span>
      {sub && <span style={{ fontSize: 10, color: MUT }}>{sub}</span>}
    </div>
  );
}

function Fld({ label, children, hint }: any) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 11, color: MUT, fontWeight: 600 }}>{label}</label>
      {children}
      {hint && <span style={{ fontSize: 10, color: MUT }}>{hint}</span>}
    </div>
  );
}

function Inp({ value, onChange, type = "text", placeholder = "", min, max }: any) {
  return (
    <input type={type} value={value ?? ""} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      min={min} max={max}
      style={{ background: BG, border: `1px solid ${BOR}`, borderRadius: 6, padding: "7px 10px", color: FG, fontSize: 12, width: "100%", outline: "none", boxSizing: "border-box" }} />
  );
}

function Sel({ value, onChange, options }: { value: any; onChange: (v: string) => void; options: string[] | { value: string; label: string }[] }) {
  return (
    <select value={value ?? ""} onChange={e => onChange(e.target.value)}
      style={{ background: BG, border: `1px solid ${BOR}`, borderRadius: 6, padding: "7px 10px", color: FG, fontSize: 12, width: "100%", outline: "none" }}>
      {options.map((o: any) => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
    </select>
  );
}

function Tex({ value, onChange, rows = 2, placeholder = "" }: any) {
  return (
    <textarea value={value ?? ""} onChange={e => onChange(e.target.value)} rows={rows} placeholder={placeholder}
      style={{ background: BG, border: `1px solid ${BOR}`, borderRadius: 6, padding: "7px 10px", color: FG, fontSize: 12, width: "100%", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
  );
}

function Btn({ onClick, variant = "primary", children, style = {}, disabled = false }: any) {
  const base: React.CSSProperties = { border: "none", borderRadius: 7, padding: "8px 16px", cursor: disabled ? "not-allowed" : "pointer", fontWeight: 600, fontSize: 12, opacity: disabled ? 0.5 : 1, fontFamily: "inherit" };
  const vars: any = {
    primary: { background: BLU, color: "#000" },
    ghost:   { background: "transparent", border: `1px solid ${BOR}`, color: FG },
    danger:  { background: "rgba(248,113,113,0.15)", border: `1px solid ${RED}`, color: RED },
    success: { background: "rgba(52,211,153,0.15)", border: `1px solid ${EME}`, color: EME },
    amber:   { background: "rgba(251,191,36,0.15)", border: `1px solid ${AMB}`, color: AMB },
    purple:  { background: "rgba(167,139,250,0.15)", border: `1px solid ${PUR}`, color: PUR },
  };
  return <button onClick={onClick} disabled={disabled} style={{ ...base, ...(vars[variant] ?? vars.primary), ...style }}>{children}</button>;
}

function Panel({ open, title, onClose, onSave, saving, children, wide }: any) {
  if (!open) return null;
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 200 }} />
      <div style={{ position: "fixed", right: 0, top: 0, bottom: 0, width: wide ? 640 : 480, zIndex: 201, background: "var(--background)", borderLeft: `1px solid ${BOR}`, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${BOR}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: SUR, flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: BLU }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, color: MUT, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ padding: 20, flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>
        <div style={{ padding: "16px 20px", borderTop: `1px solid ${BOR}`, display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Btn>
        </div>
      </div>
    </>
  );
}

function Sect({ title, children }: any) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: MUT, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8, paddingBottom: 4, borderBottom: `1px solid ${BOR}` }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
    </div>
  );
}

function Badge({ v, map, labelMap }: { v: string; map: Record<string, string>; labelMap?: Record<string, string> }) {
  const col = map[v] ?? MUT;
  return (
    <span style={{ background: `${col}20`, color: col, border: `1px solid ${col}44`, borderRadius: 5, padding: "2px 8px", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}>
      {(labelMap ?? {})[v] ?? v}
    </span>
  );
}

function ScoreBar({ value, max = 25, color }: { value: number; max?: number; color?: string }) {
  const pct = Math.min(100, (value / max) * 100);
  const c = color ?? (pct >= 80 ? RED : pct >= 50 ? AMB : EME);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: `${BOR}80`, borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: c, borderRadius: 3, transition: "width 0.4s" }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: c, width: 28, textAlign: "right" }}>{value}</span>
    </div>
  );
}

// ── 5×5 Heat Map grid ──────────────────────────────────────────────────────

function HeatMapGrid({ risks, appetiteCfg, svgRef }: { risks: any[]; appetiteCfg: any[]; svgRef?: React.Ref<SVGSVGElement> }) {
  const [hovered, setHovered] = useState<{ l: number; i: number } | null>(null);

  function getBandColor(l: number, i: number): [string, string] {
    const score = l * i;
    if (appetiteCfg.length > 0) {
      const avgAt = appetiteCfg.reduce((s, c) => s + Number(c.appetite_threshold ?? 6), 0) / appetiteCfg.length;
      const avgTt = appetiteCfg.reduce((s, c) => s + Number(c.tolerance_threshold ?? 9), 0) / appetiteCfg.length;
      if (score <= avgAt)  return ["rgba(34,197,94,0.12)",  "#059669"];
      if (score <= avgTt)  return ["rgba(251,191,36,0.12)", "#D97706"];
      return ["rgba(220,38,38,0.15)", "#DC2626"];
    }
    if (score >= 16) return ["rgba(220,38,38,0.15)", "#DC2626"];
    if (score >= 10) return ["rgba(251,191,36,0.12)", "#D97706"];
    if (score >= 5)  return ["rgba(34,197,94,0.10)",  "#059669"];
    return ["rgba(34,197,94,0.08)", "#059669"];
  }

  const CELL = 48;
  const LPAD = 72;
  const THEAD = 28;
  const W = LPAD + 5 * CELL;
  const H = THEAD + 5 * CELL;

  return (
    <div style={{ overflowX: "auto" }}>
      <svg ref={svgRef} width={W} height={H} style={{ display: "block", fontFamily: "inherit" }}>
        {/* Column headers */}
        {[1,2,3,4,5].map(i => (
          <text key={i} x={LPAD + (i - 0.5) * CELL} y={THEAD - 6} textAnchor="middle" fontSize={9} fill={MUT} fontWeight={600}>
            {["Neg","Low","Med","High","Ext"][i-1]}
          </text>
        ))}
        <text x={LPAD + 2.5 * CELL} y={THEAD - 18} textAnchor="middle" fontSize={9} fill={MUT}>Impact →</text>

        {/* Rows (likelihood 5→1 top to bottom) */}
        {[5,4,3,2,1].map((l, rowIdx) => (
          <React.Fragment key={l}>
            {/* Row label */}
            <text x={LPAD - 4} y={THEAD + rowIdx * CELL + CELL / 2 + 4} textAnchor="end" fontSize={9} fill={MUT} fontWeight={600}>
              {["Rem","Unlik","Poss","Likely","Prob"][l-1]}
            </text>
            {[1,2,3,4,5].map(i => {
              const [bg, border] = getBandColor(l, i);
              const isHov = hovered?.l === l && hovered?.i === i;
              const cellRisks = risks.filter(r => r.likelihood === l && r.impact === i);
              const x = LPAD + (i - 1) * CELL;
              const y = THEAD + rowIdx * CELL;

              // Directional arrows: inherent → residual migration within cell
              const cellInherentRisks = risks.filter(r => r.likelihood === l && r.impact === i);
              const hasResidualMigration = cellInherentRisks.some(r => {
                const resL = Math.max(1, Math.round(l * (1 - Number(r.control_factor ?? 0))));
                const resI = Math.max(1, Math.round(i * (1 - Number(r.control_factor ?? 0))));
                return resL !== l || resI !== i;
              });

              return (
                <g key={i}
                  onMouseEnter={() => setHovered({ l, i })}
                  onMouseLeave={() => setHovered(null)}>
                  <rect x={x} y={y} width={CELL} height={CELL} fill={bg}
                    stroke={isHov ? border : `${border}40`} strokeWidth={isHov ? 1.5 : 0.5} rx={2} />
                  {/* Score label */}
                  <text x={x + CELL - 5} y={y + 12} textAnchor="end" fontSize={8} fill={border} fontWeight={700}>{l * i}</text>
                  {/* Risk dots */}
                  {cellRisks.slice(0, 6).map((r, dotIdx) => (
                    <circle key={r.risk_id ?? dotIdx}
                      cx={x + 8 + (dotIdx % 3) * 12}
                      cy={y + CELL - 14 + Math.floor(dotIdx / 3) * 12}
                      r={5}
                      fill={TYPE_COLOR[r.risk_type] ?? BLU}
                      opacity={0.85}
                      stroke="rgba(255,255,255,0.5)" strokeWidth={0.5}
                      title={r.title}
                    />
                  ))}
                  {cellRisks.length > 6 && (
                    <text x={x + CELL / 2} y={y + CELL - 3} textAnchor="middle" fontSize={7} fill={border}>+{cellRisks.length - 6}</text>
                  )}
                  {/* Directional arrow for risks with control_factor > 0 */}
                  {hasResidualMigration && (
                    <text x={x + CELL - 6} y={y + CELL - 3} textAnchor="end" fontSize={9} fill={EME}>↙</text>
                  )}
                </g>
              );
            })}
          </React.Fragment>
        ))}
        {/* Likelihood axis label */}
        <text x={8} y={THEAD + 2.5 * CELL} textAnchor="middle" fontSize={9} fill={MUT}
          transform={`rotate(-90, 8, ${THEAD + 2.5 * CELL})`}>Likelihood →</text>
      </svg>
      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
        {RISK_TYPES.map(t => (
          <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: MUT }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: TYPE_COLOR[t] }} />{t}
          </span>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 10, color: MUT }}>↙ = residual migration</span>
      </div>
    </div>
  );
}

// ── Sparkline (mini trend line) ────────────────────────────────────────────

function Sparkline({ readings, color }: { readings: { value: number; ts: string }[]; color: string }) {
  if (readings.length < 2) return <span style={{ fontSize: 10, color: MUT }}>—</span>;
  const last8 = readings.slice(-8);
  const vals = last8.map(r => Number(r.value));
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const W = 60; const H = 22;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * W},${H - ((v - min) / range) * (H - 2) - 1}`).join(" ");
  return (
    <svg width={W} height={H} style={{ display: "inline-block", verticalAlign: "middle" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={parseFloat(pts.split(" ").pop()?.split(",")[0] ?? "0")} cy={parseFloat(pts.split(" ").pop()?.split(",")[1] ?? "0")} r={2} fill={color} />
    </svg>
  );
}

// ── KRI gauge bar ──────────────────────────────────────────────────────────

function KriGauge({ current, warning, breach }: { current: number; warning: number; breach: number }) {
  const maxV = Math.max(breach * 1.2, current * 1.1, 1);
  const wPct  = (warning / maxV) * 100;
  const bPct  = (breach / maxV) * 100;
  const cPct  = Math.min(100, (current / maxV) * 100);
  const color = current >= breach ? RED : current >= warning ? AMB : EME;
  return (
    <div style={{ position: "relative", height: 10, background: `${BOR}60`, borderRadius: 5, overflow: "hidden", minWidth: 80 }}>
      <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${wPct}%`, background: `${EME}30` }} />
      <div style={{ position: "absolute", left: `${wPct}%`, top: 0, height: "100%", width: `${bPct - wPct}%`, background: `${AMB}30` }} />
      <div style={{ position: "absolute", left: `${bPct}%`, top: 0, height: "100%", right: 0, background: `${RED}30` }} />
      <div style={{ position: "absolute", left: `${cPct}%`, top: 0, bottom: 0, width: 3, background: color, borderRadius: 2, transform: "translateX(-50%)" }} />
    </div>
  );
}

// ── Overview Tab ───────────────────────────────────────────────────────────

function OverviewTab({ stats, risks, kris, escalations, objectives, onGoTo }: any) {
  const risksByType = RISK_TYPES.map(t => ({
    type: t,
    count: risks.filter((r: any) => r.risk_type === t).length,
    outside: risks.filter((r: any) => r.risk_type === t && r.appetite_status === "outsideTolerance").length,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* KPI band */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        <KpiCard label="Strategic Risks" value={stats.totalRisks ?? 0} color={BLU} sub={`${stats.openRisks ?? 0} open`} />
        <KpiCard label="Outside Tolerance" value={stats.outsideTolerance ?? 0} color={stats.outsideTolerance > 0 ? RED : EME} sub="need escalation" />
        <KpiCard label="KRI Breaches" value={stats.kriBreaches ?? 0} color={stats.kriBreaches > 0 ? RED : EME} sub={`${stats.kriWarnings ?? 0} warnings`} />
        <KpiCard label="Open Escalations" value={stats.openEscalations ?? 0} color={stats.openEscalations > 0 ? AMB : EME} sub="non-bypassable" />
        <KpiCard label="Strategic Objectives" value={stats.totalObjectives ?? 0} color={PUR} sub={`${stats.totalScenarios ?? 0} scenarios`} />
      </div>

      {/* Open escalation banner */}
      {(stats.openEscalations ?? 0) > 0 && (
        <div style={{ background: "rgba(248,113,113,0.08)", border: `1px solid rgba(248,113,113,0.35)`, borderRadius: 10, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, color: RED, fontSize: 13 }}>⚠ {stats.openEscalations} Non-Bypassable Escalation{stats.openEscalations > 1 ? "s" : ""} Open</div>
            <div style={{ fontSize: 11, color: MUT, marginTop: 2 }}>Risks outside tolerance must be resolved before they can be archived. CISO and Board Risk Committee notified.</div>
          </div>
          <Btn variant="danger" onClick={() => onGoTo("escalations")}>View Escalations</Btn>
        </div>
      )}

      {/* Risk exposure by strategic pillar */}
      {(stats.pillars ?? []).length > 0 && (
        <div style={{ background: SUR, border: `1px solid ${BOR}`, borderRadius: 10, padding: 18 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: FG, marginBottom: 14 }}>Exposure by Strategic Pillar</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(stats.pillars ?? []).map((p: any) => (
              <div key={p.pillar} style={{ display: "grid", gridTemplateColumns: "120px 1fr 60px 80px 80px", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: FG }}>{p.pillar}</span>
                <ScoreBar value={Math.round(p.avgScore ?? 0)} max={25} />
                <span style={{ fontSize: 11, color: MUT, textAlign: "right" }}>{p.riskCount} risks</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: (p.outsideCount ?? 0) > 0 ? RED : EME }}>{p.outsideCount ?? 0} outside</span>
                <span style={{ fontSize: 10, color: MUT }}>avg {(p.avgScore ?? 0).toFixed(1)}/25</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Risk by type grid */}
      <div style={{ background: SUR, border: `1px solid ${BOR}`, borderRadius: 10, padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: FG, marginBottom: 14 }}>Risk Exposure by Category</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
          {risksByType.map(({ type, count, outside }) => (
            <div key={type} style={{ background: BG, border: `1px solid ${BOR}`, borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: TYPE_COLOR[type], flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: FG }}>{type}</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: TYPE_COLOR[type] }}>{count}</div>
              {outside > 0 && <div style={{ fontSize: 10, color: RED, marginTop: 4 }}>⚠ {outside} outside tolerance</div>}
            </div>
          ))}
        </div>
      </div>

      {/* KRI status grid */}
      {kris.length > 0 && (
        <div style={{ background: SUR, border: `1px solid ${BOR}`, borderRadius: 10, padding: 18 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: FG, marginBottom: 14 }}>KRI Status Grid</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
            {kris.slice(0, 8).map((k: any) => {
              const color = k.status === "breach" ? RED : k.status === "warning" ? AMB : EME;
              return (
                <div key={k.kri_id} style={{ background: BG, border: `1px solid ${color}44`, borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: FG }}>{k.name}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color, background: `${color}20`, border: `1px solid ${color}44`, borderRadius: 4, padding: "1px 6px" }}>{k.status?.toUpperCase()}</span>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color }}>{k.current_value} {k.unit}</div>
                  <div style={{ fontSize: 10, color: MUT }}>Breach: {k.breach_threshold} {k.unit}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div style={{ background: SUR, border: `1px solid ${BOR}`, borderRadius: 10, padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: FG, marginBottom: 12 }}>Quick Actions</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[
            { label: "Add Objective", sub: "Register strategic objective", go: "objectives" },
            { label: "Add Strategic Risk", sub: "Assess and score a new risk", go: "risks" },
            { label: "Monitor KRIs", sub: "Update key risk indicators", go: "kris" },
            { label: "Run Scenario", sub: "Stress-test & sensitivity analysis", go: "scenarios" },
            { label: "Appetite Config", sub: "Set tolerance thresholds", go: "appetite" },
          ].map(a => (
            <Btn key={a.go} onClick={() => onGoTo(a.go)} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", padding: "10px 14px", background: `${BLU}15`, border: `1px solid ${BLU}44`, color: FG }}>
              <span style={{ fontWeight: 700, fontSize: 12, color: BLU }}>{a.label}</span>
              <span style={{ fontSize: 10, color: MUT, fontWeight: 400 }}>{a.sub}</span>
            </Btn>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Strategic Objectives Tab ───────────────────────────────────────────────

function ObjectivesTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const blankForm = { title: "", description: "", pillar: "Growth", owner: "", status: "active", kpi_linkage: "", kri_linkage: "", review_date: "" };
  const [form, setForm] = useState<any>({ ...blankForm });
  const set = (k: string) => (v: string) => setForm((f: any) => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch(apiUrl("/strategic-risk/objectives"), { headers: hdr() }); setRows(await r.json()); }
    catch { } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setForm({ ...blankForm }); setEditing(null); setOpen(true); };
  const openEdit = (r: any) => { setForm({ title: r.title, description: r.description, pillar: r.pillar, owner: r.owner, status: r.status, kpi_linkage: r.kpi_linkage ?? "", kri_linkage: r.kri_linkage ?? "", review_date: r.review_date ?? "" }); setEditing(r); setOpen(true); };
  const del = async (id: string) => { if (!confirm("Delete this objective?")) return; await fetch(apiUrl(`/strategic-risk/objectives/${id}`), { method: "DELETE", headers: hdr() }); load(); };

  const save = async () => {
    setSaving(true);
    try {
      if (editing) await fetch(apiUrl(`/strategic-risk/objectives/${editing.obj_id}`), { method: "PUT", headers: hdr(), body: JSON.stringify(form) });
      else await fetch(apiUrl("/strategic-risk/objectives"), { method: "POST", headers: hdr(), body: JSON.stringify(form) });
      await load(); setOpen(false);
    } finally { setSaving(false); }
  };

  const STATUS_MAP: Record<string, string> = { active: EME, "under-review": AMB, archived: MUT };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: FG }}>Strategic Objectives Register</div>
          <div style={{ fontSize: 11, color: MUT }}>Version-controlled register of strategic objectives with ownership and KPI/KRI linkage</div>
        </div>
        <Btn onClick={openAdd}>+ Add Objective</Btn>
      </div>

      {loading ? <div style={{ padding: 40, textAlign: "center", color: MUT, fontSize: 12 }}>Loading…</div> :
        rows.length === 0 ? (
          <div style={{ background: SUR, border: `1px solid ${BOR}`, borderRadius: 10, padding: 48, textAlign: "center", color: MUT }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🎯</div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>No strategic objectives yet</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Add your first strategic objective to start mapping risks.</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 14 }}>
            {rows.map((r: any) => (
              <div key={r.obj_id} style={{ background: SUR, border: `1px solid ${BOR}`, borderRadius: 12, padding: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: FG }}>{r.title}</div>
                    <div style={{ fontSize: 10, color: MUT, marginTop: 2 }}>{r.obj_id} · v{r.version} · {r.pillar}</div>
                  </div>
                  <Badge v={r.status} map={STATUS_MAP} labelMap={{ active: "Active", "under-review": "Under Review", archived: "Archived" }} />
                </div>
                {r.description && <div style={{ fontSize: 11, color: MUT, marginBottom: 10, lineHeight: 1.4 }}>{r.description}</div>}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                  {r.owner && <span style={{ fontSize: 10, color: FG, background: `${BLU}15`, border: `1px solid ${BLU}44`, borderRadius: 5, padding: "2px 8px" }}>👤 {r.owner}</span>}
                  {r.review_date && <span style={{ fontSize: 10, color: MUT }}>📅 Review: {r.review_date}</span>}
                </div>
                {r.kpi_linkage && <div style={{ fontSize: 10, color: MUT, marginBottom: 4 }}>📊 KPIs: {r.kpi_linkage}</div>}
                {r.kri_linkage && <div style={{ fontSize: 10, color: MUT, marginBottom: 10 }}>📈 KRIs: {r.kri_linkage}</div>}
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <Btn variant="ghost" onClick={() => openEdit(r)} style={{ padding: "4px 10px", fontSize: 11 }}>Edit</Btn>
                  <Btn variant="danger" onClick={() => del(r.obj_id)} style={{ padding: "4px 10px", fontSize: 11 }}>Delete</Btn>
                </div>
              </div>
            ))}
          </div>
        )}

      <Panel open={open} title={editing ? "Edit Objective" : "New Strategic Objective"} onClose={() => setOpen(false)} onSave={save} saving={saving}>
        <Sect title="Core Details">
          <Fld label="Objective Title *"><Inp value={form.title} onChange={set("title")} placeholder="e.g. Expand into Asian markets" /></Fld>
          <Fld label="Description"><Tex value={form.description} onChange={set("description")} placeholder="Describe the strategic objective…" /></Fld>
        </Sect>
        <Sect title="Classification">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Fld label="Strategic Pillar"><Sel value={form.pillar} onChange={set("pillar")} options={[...PILLARS]} /></Fld>
            <Fld label="Status"><Sel value={form.status} onChange={set("status")} options={["active", "under-review", "archived"]} /></Fld>
          </div>
        </Sect>
        <Sect title="Ownership & Review">
          <Fld label="Owner"><Inp value={form.owner} onChange={set("owner")} placeholder="e.g. CEO, Strategy Team" /></Fld>
          <Fld label="Periodic Review Date"><Inp type="date" value={form.review_date} onChange={set("review_date")} /></Fld>
          <Fld label="KPI Linkage" hint="Comma-separated KPI names linked to this objective"><Inp value={form.kpi_linkage} onChange={set("kpi_linkage")} placeholder="Revenue Growth %, Market Share, NPS…" /></Fld>
          <Fld label="KRI Linkage" hint="Comma-separated SKRI-xxx IDs that monitor progress on this objective"><Inp value={form.kri_linkage} onChange={set("kri_linkage")} placeholder="SKRI-xxx, SKRI-xxx" /></Fld>
        </Sect>
      </Panel>
    </div>
  );
}

// ── Strategic Risks Tab ────────────────────────────────────────────────────

function StrategicRisksTab({ objectives, highlightId, onHighlightConsumed }: { objectives: any[]; highlightId?: string | null; onHighlightConsumed?: () => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const blankForm = { objective_id: "", title: "", description: "", risk_type: "Macroeconomic", likelihood: 3, impact: 3, control_factor: 0, owner: "", qualitative_desc: "", financial_impact: 0 };
  const [form, setForm] = useState<any>({ ...blankForm });
  const set = (k: string) => (v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const [filterType, setFilterType] = useState("All");

  // ── Export dialog state ────────────────────────────────────────────────
  const [exportOpen, setExportOpen] = useState(false);
  const [expFilterType, setExpFilterType] = useState("All");
  const [expFilterAppetite, setExpFilterAppetite] = useState("All");
  const [expSortBy, setExpSortBy] = useState("none");
  const [expSortDir, setExpSortDir] = useState("desc");
  const [expCols, setExpCols] = useState({
    linkedObjective: true,
    controlFactor: true,
    financialImpact: true,
    qualitativeDesc: false,
  });
  const toggleExpCol = (k: string) => setExpCols((c: any) => ({ ...c, [k]: !c[k] }));

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch(apiUrl("/strategic-risk/risks"), { headers: hdr() }); setRows(await r.json()); }
    catch { } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Drill-down from heatmap: when highlightId is set and rows are loaded,
  // automatically open the detail/edit panel for the matching risk.
  useEffect(() => {
    if (!highlightId || loading || rows.length === 0) return;
    const target = rows.find((r: any) => r.risk_id === highlightId);
    if (target) {
      setForm({ objective_id: target.objective_id ?? "", title: target.title, description: target.description, risk_type: target.risk_type, likelihood: target.likelihood, impact: target.impact, control_factor: target.control_factor, owner: target.owner, qualitative_desc: target.qualitative_desc ?? "", financial_impact: target.financial_impact ?? 0 });
      setEditing(target);
      setOpen(true);
      onHighlightConsumed?.();
    }
  }, [highlightId, loading, rows, onHighlightConsumed]);

  const openAdd = () => { setForm({ ...blankForm }); setEditing(null); setOpen(true); };
  const openEdit = (r: any) => { setForm({ objective_id: r.objective_id ?? "", title: r.title, description: r.description, risk_type: r.risk_type, likelihood: r.likelihood, impact: r.impact, control_factor: r.control_factor, owner: r.owner, qualitative_desc: r.qualitative_desc ?? "", financial_impact: r.financial_impact ?? 0 }); setEditing(r); setOpen(true); };
  const del = async (id: string) => {
    if (!confirm("Delete this strategic risk?")) return;
    const resp = await fetch(apiUrl(`/strategic-risk/risks/${id}`), { method: "DELETE", headers: hdr() });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: "Delete failed" }));
      alert(err.error ?? "Delete failed");
      return;
    }
    load();
  };
  const save = async () => {
    setSaving(true);
    try {
      if (editing) {
        const resp = await fetch(apiUrl(`/strategic-risk/risks/${editing.risk_id}`), { method: "PUT", headers: hdr(), body: JSON.stringify(form) });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({ error: "Save failed" }));
          alert(err.error ?? "Save failed");
          return;
        }
      } else {
        await fetch(apiUrl("/strategic-risk/risks"), { method: "POST", headers: hdr(), body: JSON.stringify(form) });
      }
      await load(); setOpen(false);
    } finally { setSaving(false); }
  };

  const inherentScore = form.likelihood * form.impact;
  const residualScore = Math.round(form.likelihood * form.impact * (1 - Number(form.control_factor ?? 0)) * 10) / 10;

  const filtered = filterType === "All" ? rows : rows.filter((r: any) => r.risk_type === filterType);

  const APPETITE_KEY: Record<string, string> = {
    "All": "All",
    "Within Appetite": "withinAppetite",
    "Within Tolerance": "withinTolerance",
    "Outside Tolerance": "outsideTolerance",
  };

  const expPreview = useMemo(() => {
    let list = [...rows];
    if (expFilterType !== "All") list = list.filter((r: any) => r.risk_type === expFilterType);
    if (expFilterAppetite !== "All") {
      const key = APPETITE_KEY[expFilterAppetite];
      list = list.filter((r: any) => (r.appetite_status ?? "withinAppetite") === key);
    }
    if (expSortBy === "inherent") {
      list.sort((a: any, b: any) => {
        const sa = Number(a.inherent_score ?? a.likelihood * a.impact);
        const sb = Number(b.inherent_score ?? b.likelihood * b.impact);
        return expSortDir === "desc" ? sb - sa : sa - sb;
      });
    } else if (expSortBy === "residual") {
      list.sort((a: any, b: any) => {
        const sa = Number(a.residual_score ?? a.inherent_score ?? a.likelihood * a.impact);
        const sb = Number(b.residual_score ?? b.inherent_score ?? b.likelihood * b.impact);
        return expSortDir === "desc" ? sb - sa : sa - sb;
      });
    }
    return list;
  }, [rows, expFilterType, expFilterAppetite, expSortBy, expSortDir]);

  function openExportDialog() {
    setExpFilterType(filterType);
    setExpFilterAppetite("All");
    setExpSortBy("none");
    setExpSortDir("desc");
    setExportOpen(true);
  }

  function exportXlsx() {
    const XS = XLSXStyle;
    const dateStr = new Date().toISOString().slice(0, 10);
    const wb = XS.utils.book_new();

    const APPETITE_LABEL: Record<string, string> = {
      withinAppetite: "Within Appetite",
      withinTolerance: "Within Tolerance",
      outsideTolerance: "Outside Tolerance",
    };

    const headerStyle = {
      font: { bold: true, color: { rgb: "FFFFFF" }, sz: 10 },
      fill: { fgColor: { rgb: "1E3A5F" } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: { bottom: { style: "thin", color: { rgb: "60A5FA" } } },
    };
    const cellStyle = {
      font: { sz: 10 },
      alignment: { vertical: "center", wrapText: true },
      border: {
        top: { style: "thin", color: { rgb: "334155" } },
        bottom: { style: "thin", color: { rgb: "334155" } },
        left: { style: "thin", color: { rgb: "334155" } },
        right: { style: "thin", color: { rgb: "334155" } },
      },
    };
    const redCell = { ...cellStyle, font: { ...cellStyle.font, color: { rgb: "F87171" }, bold: true } };
    const amberCell = { ...cellStyle, font: { ...cellStyle.font, color: { rgb: "FBBF24" }, bold: true } };
    const greenCell = { ...cellStyle, font: { ...cellStyle.font, color: { rgb: "34D399" }, bold: true } };

    const scoreStyle = (score: number) => score >= 15 ? redCell : score >= 9 ? amberCell : greenCell;
    const appetiteStyle = (v: string) => v === "outsideTolerance" ? redCell : v === "withinTolerance" ? amberCell : greenCell;

    const baseHeaders: { key: string; label: string; always?: boolean }[] = [
      { key: "id",         label: "Risk ID",          always: true },
      { key: "title",      label: "Title",             always: true },
      { key: "type",       label: "Type",              always: true },
      { key: "objective",  label: "Linked Objective",  always: false },
      { key: "likelihood", label: "Likelihood (1-5)",  always: true },
      { key: "impact",     label: "Impact (1-5)",      always: true },
      { key: "inherent",   label: "Inherent Score",    always: true },
      { key: "controlPct", label: "Control Factor %",  always: false },
      { key: "residual",   label: "Residual Score",    always: true },
      { key: "appetite",   label: "Appetite Status",   always: true },
      { key: "owner",      label: "Owner",             always: true },
      { key: "financialImpact", label: "Financial Impact ($)", always: false },
      { key: "qualDesc",   label: "Qualitative Description", always: false },
    ];

    const colVisible = (key: string) => {
      if (key === "objective")     return expCols.linkedObjective;
      if (key === "controlPct")    return expCols.controlFactor;
      if (key === "financialImpact") return expCols.financialImpact;
      if (key === "qualDesc")      return expCols.qualitativeDesc;
      return true;
    };

    const activeHeaders = baseHeaders.filter(h => h.always || colVisible(h.key));

    const dataRows = expPreview.map((r: any) => {
      const obj = objectives.find((o: any) => o.obj_id === r.objective_id);
      const inherent = Number(r.inherent_score ?? r.likelihood * r.impact);
      const residual = Number(r.residual_score ?? inherent);
      const aStatus = r.appetite_status ?? "withinAppetite";
      return {
        id: r.risk_id ?? "",
        title: r.title ?? "",
        type: r.risk_type ?? "",
        objective: obj?.title ?? "",
        likelihood: Number(r.likelihood),
        impact: Number(r.impact),
        inherent,
        controlPct: Math.round(Number(r.control_factor ?? 0) * 100),
        residual: parseFloat(residual.toFixed(1)),
        appetite: APPETITE_LABEL[aStatus] ?? aStatus,
        appetiteRaw: aStatus,
        owner: r.owner ?? "",
        financialImpact: Number(r.financial_impact ?? 0),
        qualDesc: r.qualitative_desc ?? "",
      };
    });

    const cellFor = (d: any, key: string) => {
      if (key === "inherent")   return { v: d.inherent, t: "n", s: scoreStyle(d.inherent) };
      if (key === "residual")   return { v: d.residual, t: "n", s: scoreStyle(d.residual) };
      if (key === "appetite")   return { v: d.appetite, t: "s", s: appetiteStyle(d.appetiteRaw) };
      const v = (d as any)[key];
      const isNum = typeof v === "number";
      return { v, t: isNum ? "n" : "s", s: cellStyle };
    };

    const aoa: any[][] = [
      activeHeaders.map(h => ({ v: h.label, t: "s", s: headerStyle })),
      ...dataRows.map(d => activeHeaders.map(h => cellFor(d, h.key))),
    ];

    const ws = XS.utils.aoa_to_sheet(aoa);
    const colWidths: Record<string, number> = {
      id: 9, title: 28, type: 18, objective: 24, likelihood: 12, impact: 12,
      inherent: 12, controlPct: 12, residual: 12, appetite: 18, owner: 16,
      financialImpact: 16, qualDesc: 32,
    };
    ws["!cols"] = activeHeaders.map(h => ({ wch: colWidths[h.key] ?? 14 }));
    ws["!rows"] = [{ hpt: 24 }, ...dataRows.map(() => ({ hpt: 18 }))];
    XS.utils.book_append_sheet(wb, ws, "Strategic Risk Register");

    const typePart  = expFilterType !== "All" ? `-${expFilterType.replace(/\//g, "-").replace(/\s/g, "")}` : "";
    const appPart   = expFilterAppetite !== "All" ? `-${expFilterAppetite.replace(/\s/g, "")}` : "";
    const sortPart  = expSortBy !== "none" ? `-by${expSortBy === "inherent" ? "Inherent" : "Residual"}${expSortDir === "desc" ? "Desc" : "Asc"}` : "";
    XS.writeFile(wb, `Strategic-Risks${typePart}${appPart}${sortPart}-${dateStr}.xlsx`);

    setExportOpen(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Export dialog ─────────────────────────────────────────────────── */}
      {exportOpen && (
        <>
          <div onClick={() => setExportOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 301, background: "var(--background)", border: `1px solid ${BOR}`, borderRadius: 12, width: 480, maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 64px rgba(0,0,0,0.45)" }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${BOR}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: SUR, borderRadius: "12px 12px 0 0" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: BLU }}>Export Risk Register</div>
              <button onClick={() => setExportOpen(false)} style={{ background: "none", border: "none", fontSize: 18, color: MUT, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>

              <div style={{ background: `${BLU}10`, border: `1px solid ${BLU}30`, borderRadius: 8, padding: "10px 14px", fontSize: 11, color: BLU }}>
                <span style={{ fontWeight: 700 }}>{expPreview.length}</span> of <span style={{ fontWeight: 700 }}>{rows.length}</span> risks will be exported
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Fld label="Filter by Risk Type">
                  <Sel value={expFilterType} onChange={setExpFilterType} options={["All", ...RISK_TYPES]} />
                </Fld>
                <Fld label="Filter by Appetite Status">
                  <Sel value={expFilterAppetite} onChange={setExpFilterAppetite}
                    options={["All", "Within Appetite", "Within Tolerance", "Outside Tolerance"]} />
                </Fld>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Fld label="Sort By">
                  <Sel value={expSortBy} onChange={setExpSortBy}
                    options={[{ value: "none", label: "Default order" }, { value: "inherent", label: "Inherent Score" }, { value: "residual", label: "Residual Score" }]} />
                </Fld>
                <Fld label="Sort Direction">
                  <Sel value={expSortDir} onChange={setExpSortDir}
                    options={[{ value: "desc", label: "High → Low" }, { value: "asc", label: "Low → High" }]} />
                </Fld>
              </div>

              <div>
                <div style={{ fontSize: 11, color: MUT, fontWeight: 600, marginBottom: 8 }}>COLUMN VISIBILITY</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {[
                    { key: "linkedObjective",  label: "Linked Objective" },
                    { key: "controlFactor",    label: "Control Factor %" },
                    { key: "financialImpact",  label: "Financial Impact ($)" },
                    { key: "qualitativeDesc",  label: "Qualitative Description" },
                  ].map(col => (
                    <label key={col.key} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 11, color: FG, background: BG, border: `1px solid ${BOR}`, borderRadius: 6, padding: "7px 10px" }}>
                      <input type="checkbox" checked={(expCols as any)[col.key]} onChange={() => toggleExpCol(col.key)}
                        style={{ accentColor: BLU, width: 14, height: 14, cursor: "pointer" }} />
                      {col.label}
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ fontSize: 10, color: MUT, background: `${BOR}40`, borderRadius: 6, padding: "7px 10px" }}>
                Filename: <span style={{ fontFamily: "monospace", color: FG }}>
                  {`Strategic-Risks${expFilterType !== "All" ? `-${expFilterType.replace(/\//g, "-").replace(/\s/g, "")}` : ""}${expFilterAppetite !== "All" ? `-${expFilterAppetite.replace(/\s/g, "")}` : ""}${expSortBy !== "none" ? `-by${expSortBy === "inherent" ? "Inherent" : "Residual"}${expSortDir === "desc" ? "Desc" : "Asc"}` : ""}-${new Date().toISOString().slice(0,10)}.xlsx`}
                </span>
              </div>
            </div>
            <div style={{ padding: "14px 20px", borderTop: `1px solid ${BOR}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn variant="ghost" onClick={() => setExportOpen(false)}>Cancel</Btn>
              <Btn onClick={exportXlsx} disabled={expPreview.length === 0}>↓ Download XLSX</Btn>
            </div>
          </div>
        </>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: FG }}>Strategic Risk Assessment</div>
          <div style={{ fontSize: 11, color: MUT }}>5×5 likelihood/impact assessment — formula-locked inherent and residual scores</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Sel value={filterType} onChange={setFilterType} options={["All", ...RISK_TYPES]} />
          <Btn variant="ghost" onClick={openExportDialog} disabled={rows.length === 0} style={{ fontSize: 11, padding: "7px 12px" }}>↓ Export XLSX</Btn>
          <Btn onClick={openAdd}>+ Add Risk</Btn>
        </div>
      </div>

      {loading ? <div style={{ padding: 40, textAlign: "center", color: MUT, fontSize: 12 }}>Loading…</div> :
        filtered.length === 0 ? (
          <div style={{ background: SUR, border: `1px solid ${BOR}`, borderRadius: 10, padding: 48, textAlign: "center", color: MUT }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>⚡</div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>No strategic risks registered</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Add a strategic risk to begin assessment.</div>
          </div>
        ) : (
          <div style={{ background: SUR, border: `1px solid ${BOR}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ background: "var(--muted)", color: MUT }}>
                    {["ID", "Title", "Type", "Objective", "Likelihood", "Impact", "Inherent", "Control", "Residual", "Appetite Status", "Owner", ""].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r: any) => {
                    const obj = objectives.find((o: any) => o.obj_id === r.objective_id);
                    const inherent = Number(r.inherent_score ?? r.likelihood * r.impact);
                    const residual = Number(r.residual_score ?? inherent);
                    const aStatus = r.appetite_status ?? "withinAppetite";
                    return (
                      <tr key={r.risk_id} style={{ borderTop: `1px solid ${BOR}` }}>
                        <td style={{ padding: "9px 12px", color: BLU, fontWeight: 700, fontFamily: "monospace", whiteSpace: "nowrap" }}>{r.risk_id}</td>
                        <td style={{ padding: "9px 12px", color: FG, fontWeight: 600 }}>{r.title}</td>
                        <td style={{ padding: "9px 12px" }}>
                          <span style={{ background: `${TYPE_COLOR[r.risk_type] ?? BLU}18`, color: TYPE_COLOR[r.risk_type] ?? BLU, border: `1px solid ${TYPE_COLOR[r.risk_type] ?? BLU}44`, borderRadius: 5, padding: "2px 7px", fontSize: 10, fontWeight: 700 }}>{r.risk_type}</span>
                        </td>
                        <td style={{ padding: "9px 12px", color: MUT, fontSize: 10 }}>{obj?.title ?? "—"}</td>
                        <td style={{ padding: "9px 12px", color: FG, textAlign: "center" }}>
                          <span style={{ fontWeight: 700 }}>{r.likelihood}</span>
                          <span style={{ color: MUT, fontSize: 10 }}> / 5</span>
                        </td>
                        <td style={{ padding: "9px 12px", color: FG, textAlign: "center" }}>
                          <span style={{ fontWeight: 700 }}>{r.impact}</span>
                          <span style={{ color: MUT, fontSize: 10 }}> / 5</span>
                        </td>
                        <td style={{ padding: "9px 12px", textAlign: "right" }}>
                          <span style={{ fontWeight: 700, color: inherent >= 15 ? RED : inherent >= 9 ? AMB : EME }}>{inherent}</span>
                        </td>
                        <td style={{ padding: "9px 12px", textAlign: "right", color: MUT }}>{Math.round(Number(r.control_factor ?? 0) * 100)}%</td>
                        <td style={{ padding: "9px 12px", textAlign: "right" }}>
                          <span style={{ fontWeight: 700, color: residual >= 15 ? RED : residual >= 9 ? AMB : EME }}>{residual.toFixed(1)}</span>
                        </td>
                        <td style={{ padding: "9px 12px" }}>
                          <Badge v={aStatus} map={SEV_COLOR} labelMap={SEV_LABEL} />
                        </td>
                        <td style={{ padding: "9px 12px", color: MUT }}>{r.owner || "—"}</td>
                        <td style={{ padding: "9px 12px", display: "flex", gap: 4 }}>
                          <Btn variant="ghost" onClick={() => openEdit(r)} style={{ padding: "3px 8px", fontSize: 10 }}>Edit</Btn>
                          <Btn variant="danger" onClick={() => del(r.risk_id)} style={{ padding: "3px 8px", fontSize: 10 }}>Del</Btn>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

      <Panel open={open} title={editing ? "Edit Strategic Risk" : "New Strategic Risk"} onClose={() => setOpen(false)} onSave={save} saving={saving} wide>
        <Sect title="Core Identity">
          <Fld label="Risk Title *"><Inp value={form.title} onChange={set("title")} placeholder="e.g. Currency devaluation risk in emerging markets" /></Fld>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Fld label="Risk Type (mandatory)">
              <Sel value={form.risk_type} onChange={set("risk_type")} options={[...RISK_TYPES]} />
            </Fld>
            <Fld label="Linked Objective (optional)">
              <Sel value={form.objective_id ?? ""} onChange={set("objective_id")}
                options={[{ value: "", label: "— None —" }, ...objectives.map((o: any) => ({ value: o.obj_id, label: o.title }))]} />
            </Fld>
          </div>
          <Fld label="Owner"><Inp value={form.owner} onChange={set("owner")} placeholder="e.g. CFO, Strategy Director" /></Fld>
        </Sect>

        <Sect title="5×5 Likelihood / Impact Assessment">
          <div style={{ background: "rgba(96,165,250,0.06)", border: `1px solid rgba(96,165,250,0.25)`, borderRadius: 8, padding: "10px 14px", fontSize: 11, color: BLU }}>
            ℹ Inherent and residual scores are formula-locked (Inherent = L×I; Residual = L×I×(1−Control)) — manual override is disabled.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Fld label={`Likelihood: ${LIKELIHOOD_LABELS[Number(form.likelihood) - 1]}`}>
              <input type="range" min={1} max={5} step={1} value={form.likelihood}
                onChange={e => set("likelihood")(e.target.value)}
                style={{ width: "100%", accentColor: BLU }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: MUT }}>
                <span>1 Remote</span><span>3 Possible</span><span>5 Probable</span>
              </div>
            </Fld>
            <Fld label={`Impact: ${IMPACT_LABELS[Number(form.impact) - 1]}`}>
              <input type="range" min={1} max={5} step={1} value={form.impact}
                onChange={e => set("impact")(e.target.value)}
                style={{ width: "100%", accentColor: BLU }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: MUT }}>
                <span>1 Negligible</span><span>3 Medium</span><span>5 Extreme</span>
              </div>
            </Fld>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div style={{ background: `${AMB}15`, border: `1px solid ${AMB}44`, borderRadius: 8, padding: "12px", textAlign: "center" }}>
              <div style={{ fontSize: 10, color: MUT, marginBottom: 4 }}>Inherent Score (L×I)</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: inherentScore >= 15 ? RED : inherentScore >= 9 ? AMB : EME }}>{inherentScore}</div>
              <div style={{ fontSize: 9, color: MUT }}>out of 25 — formula locked</div>
            </div>
            <Fld label={`Control Factor: ${Math.round(Number(form.control_factor) * 100)}% reduction`} hint="0 = no controls; 1 = fully mitigated">
              <input type="range" min={0} max={1} step={0.05} value={form.control_factor}
                onChange={e => set("control_factor")(e.target.value)}
                style={{ width: "100%", accentColor: EME }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: MUT }}>
                <span>0%</span><span>50%</span><span>100%</span>
              </div>
            </Fld>
            <div style={{ background: `${EME}15`, border: `1px solid ${EME}44`, borderRadius: 8, padding: "12px", textAlign: "center" }}>
              <div style={{ fontSize: 10, color: MUT, marginBottom: 4 }}>Residual Score</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: residualScore >= 15 ? RED : residualScore >= 9 ? AMB : EME }}>{residualScore}</div>
              <div style={{ fontSize: 9, color: MUT }}>out of 25 — formula locked</div>
            </div>
          </div>
        </Sect>

        <Sect title="Qualitative & Quantitative">
          <Fld label="Qualitative Description"><Tex value={form.qualitative_desc} onChange={set("qualitative_desc")} rows={3} placeholder="Describe the risk scenario, drivers, and potential impact…" /></Fld>
          <Fld label="Quantitative Financial Impact ($)" hint="Estimated financial exposure if the risk materialises">
            <Inp type="number" value={form.financial_impact} onChange={set("financial_impact")} />
          </Fld>
          <Fld label="Description / Notes"><Tex value={form.description} onChange={set("description")} placeholder="Additional context…" /></Fld>
        </Sect>
      </Panel>
    </div>
  );
}

// ── KRI Monitoring Tab ─────────────────────────────────────────────────────

function KriTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const blankForm = { name: "", category: "Macroeconomic", unit: "%", current_value: 0, warning_threshold: 5, breach_threshold: 8, linked_risk_ids: "" };
  const [form, setForm] = useState<any>({ ...blankForm });
  const set = (k: string) => (v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch(apiUrl("/strategic-risk/kris"), { headers: hdr() }); setRows(await r.json()); }
    catch { } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setForm({ ...blankForm }); setEditing(null); setOpen(true); };
  const openEdit = (r: any) => { setForm({ name: r.name, category: r.category, unit: r.unit, current_value: r.current_value, warning_threshold: r.warning_threshold, breach_threshold: r.breach_threshold, linked_risk_ids: r.linked_risk_ids ?? "" }); setEditing(r); setOpen(true); };
  const del = async (id: string) => { if (!confirm("Delete this KRI?")) return; await fetch(apiUrl(`/strategic-risk/kris/${id}`), { method: "DELETE", headers: hdr() }); load(); };
  const save = async () => {
    setSaving(true);
    try {
      if (editing) await fetch(apiUrl(`/strategic-risk/kris/${editing.kri_id}`), { method: "PUT", headers: hdr(), body: JSON.stringify(form) });
      else await fetch(apiUrl("/strategic-risk/kris"), { method: "POST", headers: hdr(), body: JSON.stringify(form) });
      await load(); setOpen(false);
    } finally { setSaving(false); }
  };

  const breaches = rows.filter((r: any) => r.status === "breach").length;
  const warnings = rows.filter((r: any) => r.status === "warning").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: FG }}>Strategic KRI Monitoring</div>
          <div style={{ fontSize: 11, color: MUT }}>Early warning system — monitors KRIs against thresholds with trend analysis (FR-430)</div>
        </div>
        <Btn onClick={openAdd}>+ Add KRI</Btn>
      </div>

      {(breaches > 0 || warnings > 0) && (
        <div style={{ background: breaches > 0 ? "rgba(248,113,113,0.08)" : "rgba(251,191,36,0.08)", border: `1px solid ${breaches > 0 ? "rgba(248,113,113,0.4)" : "rgba(251,191,36,0.4)"}`, borderRadius: 10, padding: "12px 16px" }}>
          <span style={{ fontWeight: 700, color: breaches > 0 ? RED : AMB, fontSize: 13 }}>
            {breaches > 0 ? `⚠ ${breaches} KRI breach${breaches > 1 ? "es" : ""} detected` : `⚠ ${warnings} KRI${warnings > 1 ? "s" : ""} approaching threshold`}
          </span>
          <span style={{ fontSize: 11, color: MUT, marginLeft: 8 }}>Dynamic posture recalculation triggered — residual scores updated</span>
        </div>
      )}

      {loading ? <div style={{ padding: 40, textAlign: "center", color: MUT, fontSize: 12 }}>Loading…</div> :
        rows.length === 0 ? (
          <div style={{ background: SUR, border: `1px solid ${BOR}`, borderRadius: 10, padding: 48, textAlign: "center", color: MUT }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📊</div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>No KRIs defined</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Add KRIs to monitor strategic risk indicators against thresholds.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {rows.map((r: any) => {
              const color = r.status === "breach" ? RED : r.status === "warning" ? AMB : EME;
              let readings: any[] = [];
              try { readings = Array.isArray(r.readings) ? r.readings : JSON.parse(r.readings ?? "[]"); } catch { readings = []; }
              const earlyWarning = r.status === "ok" && Number(r.current_value) >= Number(r.warning_threshold) * 0.85;
              return (
                <div key={r.kri_id} style={{ background: SUR, border: `1px solid ${color}44`, borderRadius: 10, padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: FG }}>{r.name}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color, background: `${color}20`, border: `1px solid ${color}44`, borderRadius: 4, padding: "2px 7px" }}>
                          {r.status?.toUpperCase()}
                        </span>
                        {earlyWarning && <span style={{ fontSize: 10, fontWeight: 700, color: AMB, background: `${AMB}20`, border: `1px solid ${AMB}44`, borderRadius: 4, padding: "2px 7px" }}>⚡ EARLY WARNING</span>}
                      </div>
                      <div style={{ fontSize: 10, color: MUT, marginTop: 2 }}>{r.kri_id} · {r.category}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 26, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>{r.current_value} <span style={{ fontSize: 14, fontWeight: 500 }}>{r.unit}</span></div>
                      <div style={{ fontSize: 10, color: MUT }}>Trend: {r.trend_direction ?? "stable"} {r.trend_direction === "up" ? "↑" : r.trend_direction === "down" ? "↓" : "→"}</div>
                    </div>
                  </div>
                  <KriGauge current={Number(r.current_value)} warning={Number(r.warning_threshold)} breach={Number(r.breach_threshold)} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: MUT, marginTop: 4 }}>
                    <span>Warning: {r.warning_threshold} {r.unit}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      Trend: <Sparkline readings={readings} color={color} />
                    </span>
                    <span>Breach: {r.breach_threshold} {r.unit}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
                    <Btn variant="ghost" onClick={() => openEdit(r)} style={{ padding: "4px 10px", fontSize: 11 }}>Update Value</Btn>
                    <Btn variant="danger" onClick={() => del(r.kri_id)} style={{ padding: "4px 10px", fontSize: 11 }}>Delete</Btn>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      <Panel open={open} title={editing ? "Update KRI" : "New Strategic KRI"} onClose={() => setOpen(false)} onSave={save} saving={saving}>
        <Sect title="KRI Definition">
          <Fld label="KRI Name *"><Inp value={form.name} onChange={set("name")} placeholder="e.g. Inflation Rate, FX Volatility Index" /></Fld>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Fld label="Category"><Sel value={form.category} onChange={set("category")} options={[...KRI_CATS]} /></Fld>
            <Fld label="Unit"><Inp value={form.unit} onChange={set("unit")} placeholder="%, bps, index, ratio…" /></Fld>
          </div>
        </Sect>
        <Sect title="Thresholds & Current Value">
          <Fld label="Current Value *"><Inp type="number" value={form.current_value} onChange={set("current_value")} /></Fld>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Fld label="Warning Threshold" hint="Early warning level"><Inp type="number" value={form.warning_threshold} onChange={set("warning_threshold")} /></Fld>
            <Fld label="Breach Threshold" hint="Mandatory escalation level"><Inp type="number" value={form.breach_threshold} onChange={set("breach_threshold")} /></Fld>
          </div>
        </Sect>
        <Sect title="Linkage">
          <Fld label="Linked Strategic Risk IDs" hint="Comma-separated SR-xxx IDs"><Inp value={form.linked_risk_ids} onChange={set("linked_risk_ids")} placeholder="SR-xxx, SR-xxx" /></Fld>
        </Sect>
      </Panel>
    </div>
  );
}

// ── Scenario & Stress-Test Workbench ──────────────────────────────────────

function ScenariosTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [simOpen, setSimOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<any>(null);
  const [simTarget, setSimTarget] = useState<any>(null);
  const blankForm = { name: "", scenario_type: "Adverse", description: "", parameters: [] };
  const [form, setForm] = useState<any>({ ...blankForm });
  const set = (k: string) => (v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch(apiUrl("/strategic-risk/scenarios"), { headers: hdr() }); setRows(await r.json()); }
    catch { } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const blankParam = { variable_name: "", base_value: 0, stress_value: 0, affected_objectives: "" };
  const addParam = () => setForm((f: any) => ({ ...f, parameters: [...(f.parameters ?? []), { ...blankParam }] }));
  const setParam = (idx: number, k: string, v: any) => setForm((f: any) => ({
    ...f,
    parameters: f.parameters.map((p: any, i: number) => i === idx ? { ...p, [k]: v } : p),
  }));
  const removeParam = (idx: number) => setForm((f: any) => ({ ...f, parameters: f.parameters.filter((_: any, i: number) => i !== idx) }));

  const openAdd = () => { setForm({ ...blankForm, parameters: [] }); setEditing(null); setOpen(true); };
  const openEdit = (r: any) => {
    let params: any[] = [];
    try { params = Array.isArray(r.parameters) ? r.parameters : JSON.parse(r.parameters ?? "[]"); } catch { params = []; }
    setForm({ name: r.name, scenario_type: r.scenario_type, description: r.description, parameters: params });
    setEditing(r); setOpen(true);
  };
  const del = async (id: string) => { if (!confirm("Delete this scenario?")) return; await fetch(apiUrl(`/strategic-risk/scenarios/${id}`), { method: "DELETE", headers: hdr() }); load(); };
  const save = async () => {
    setSaving(true);
    try {
      const body = { ...form, parameters: form.parameters };
      if (editing) await fetch(apiUrl(`/strategic-risk/scenarios/${editing.scenario_id}`), { method: "PUT", headers: hdr(), body: JSON.stringify(body) });
      else await fetch(apiUrl("/strategic-risk/scenarios"), { method: "POST", headers: hdr(), body: JSON.stringify(body) });
      await load(); setOpen(false);
    } finally { setSaving(false); }
  };

  const runSim = async (r: any) => {
    setSimTarget(r); setSimulating(true); setSimResult(null); setSimOpen(true);
    try {
      const res = await fetch(apiUrl(`/strategic-risk/scenarios/${r.scenario_id}/simulate`), { method: "POST", headers: hdr() });
      setSimResult(await res.json());
    } catch { setSimResult({ error: "Simulation failed" }); }
    finally { setSimulating(false); }
  };

  const SCEN_COLOR: Record<string, string> = { Adverse: AMB, Severe: ORG, Catastrophic: RED, "What-If": BLU };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: FG }}>Scenario & Stress-Test Workbench</div>
          <div style={{ fontSize: 11, color: MUT }}>Define scenarios, run simulations, and view sensitivity waterfall analysis</div>
        </div>
        <Btn onClick={openAdd}>+ New Scenario</Btn>
      </div>

      {loading ? <div style={{ padding: 40, textAlign: "center", color: MUT, fontSize: 12 }}>Loading…</div> :
        rows.length === 0 ? (
          <div style={{ background: SUR, border: `1px solid ${BOR}`, borderRadius: 10, padding: 48, textAlign: "center", color: MUT }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🧪</div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>No scenarios defined</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Create a scenario to run stress tests and sensitivity analysis.</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 14 }}>
            {rows.map((r: any) => {
              const color = SCEN_COLOR[r.scenario_type] ?? BLU;
              let params: any[] = [];
              try { params = Array.isArray(r.parameters) ? r.parameters : JSON.parse(r.parameters ?? "[]"); } catch { params = []; }
              return (
                <div key={r.scenario_id} style={{ background: SUR, border: `1px solid ${BOR}`, borderRadius: 12, padding: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: FG }}>{r.name}</div>
                      <div style={{ fontSize: 10, color: MUT, marginTop: 2 }}>{r.scenario_id}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, color, background: `${color}20`, border: `1px solid ${color}44`, borderRadius: 5, padding: "2px 8px" }}>{r.scenario_type}</span>
                  </div>
                  {r.description && <div style={{ fontSize: 11, color: MUT, marginBottom: 10 }}>{r.description}</div>}
                  <div style={{ fontSize: 10, color: MUT, marginBottom: 12 }}>{params.length} variables defined</div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <Btn variant="purple" onClick={() => runSim(r)} style={{ padding: "5px 12px", fontSize: 11 }}>▶ Run Simulation</Btn>
                    <Btn variant="ghost" onClick={() => openEdit(r)} style={{ padding: "4px 10px", fontSize: 11 }}>Edit</Btn>
                    <Btn variant="danger" onClick={() => del(r.scenario_id)} style={{ padding: "4px 10px", fontSize: 11 }}>Del</Btn>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      {/* Scenario form panel */}
      <Panel open={open} title={editing ? "Edit Scenario" : "New Scenario"} onClose={() => setOpen(false)} onSave={save} saving={saving} wide>
        <Sect title="Scenario Definition">
          <Fld label="Scenario Name *"><Inp value={form.name} onChange={set("name")} placeholder="e.g. Global Recession — 2027" /></Fld>
          <Fld label="Scenario Type"><Sel value={form.scenario_type} onChange={set("scenario_type")} options={[...SCEN_TYPES]} /></Fld>
          <Fld label="Description"><Tex value={form.description} onChange={set("description")} placeholder="Describe the scenario context and assumptions…" /></Fld>
        </Sect>
        <Sect title="Scenario Variables">
          <div style={{ fontSize: 11, color: MUT, marginBottom: 6 }}>Define stress variables — base value vs. stressed value. The simulation engine computes risk exposure change per variable.</div>
          {(form.parameters ?? []).map((p: any, idx: number) => (
            <div key={idx} style={{ background: BG, border: `1px solid ${BOR}`, borderRadius: 8, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: FG }}>Variable {idx + 1}</span>
                <Btn variant="danger" onClick={() => removeParam(idx)} style={{ padding: "2px 8px", fontSize: 10 }}>✕</Btn>
              </div>
              <Fld label="Variable Name"><Inp value={p.variable_name} onChange={(v: string) => setParam(idx, "variable_name", v)} placeholder="e.g. GDP Growth Rate" /></Fld>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Fld label="Base Value"><Inp type="number" value={p.base_value} onChange={(v: string) => setParam(idx, "base_value", Number(v))} /></Fld>
                <Fld label="Stress Value"><Inp type="number" value={p.stress_value} onChange={(v: string) => setParam(idx, "stress_value", Number(v))} /></Fld>
              </div>
              <Fld label="Affected Objective IDs" hint="Comma-separated SOBJ-xxx IDs (empty = all)"><Inp value={p.affected_objectives} onChange={(v: string) => setParam(idx, "affected_objectives", v)} /></Fld>
            </div>
          ))}
          <Btn variant="ghost" onClick={addParam} style={{ width: "100%", padding: "8px" }}>+ Add Variable</Btn>
        </Sect>
      </Panel>

      {/* Simulation results modal */}
      {simOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={() => setSimOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)" }} />
          <div style={{ position: "relative", background: SUR, border: `1px solid ${BOR}`, borderRadius: 14, width: 680, maxHeight: "85vh", overflow: "auto", padding: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: FG }}>Simulation Results</div>
                <div style={{ fontSize: 11, color: MUT }}>{simTarget?.name}</div>
              </div>
              <Btn variant="ghost" onClick={() => setSimOpen(false)} style={{ padding: "4px 10px" }}>✕ Close</Btn>
            </div>

            {simulating && (
              <div style={{ padding: 40, textAlign: "center", color: MUT }}>
                <div style={{ fontSize: 24, marginBottom: 10 }}>⚙️</div>
                <div>Running sensitivity analysis…</div>
              </div>
            )}

            {!simulating && simResult && !simResult.error && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Summary */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <KpiCard label="Base Exposure" value={simResult.totalBaseExposure} color={BLU} />
                  <KpiCard label="Stress Exposure" value={Math.round(simResult.totalStressExposure)} color={simResult.totalDelta > 0 ? RED : EME} />
                  <KpiCard label="Δ Delta" value={`${simResult.totalDelta >= 0 ? "+" : ""}${Math.round(simResult.totalDelta)}`} color={simResult.totalDelta > 0 ? RED : EME} sub={`across ${simResult.riskCount} risks`} />
                </div>

                {/* Sensitivity waterfall */}
                <div style={{ background: BG, border: `1px solid ${BOR}`, borderRadius: 10, padding: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: FG, marginBottom: 12 }}>Sensitivity Waterfall — Variables Ranked by Impact</div>
                  {(simResult.sensitivity ?? []).length === 0 ? (
                    <div style={{ fontSize: 11, color: MUT, textAlign: "center", padding: 24 }}>No variables defined. Add variables to the scenario and re-run.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {simResult.sensitivity.map((v: any, i: number) => {
                        const maxDelta = Math.max(...simResult.sensitivity.map((s: any) => s.impact), 1);
                        const barPct = (v.impact / maxDelta) * 100;
                        const barColor = v.delta > 0 ? RED : EME;
                        return (
                          <div key={i} style={{ display: "grid", gridTemplateColumns: "160px 1fr 80px 80px", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 11, color: FG, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.variable}</span>
                            <div style={{ height: 10, background: `${BOR}80`, borderRadius: 3, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${barPct}%`, background: barColor, borderRadius: 3, transition: "width 0.4s" }} />
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700, color: barColor, textAlign: "right" }}>
                              {v.delta >= 0 ? "+" : ""}{Math.round(v.delta)}
                            </span>
                            <span style={{ fontSize: 10, color: MUT }}>base {v.baseValue} → {v.stressValue}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 10, color: MUT, textAlign: "right" }}>Simulated: {simResult.simulatedAt ? new Date(simResult.simulatedAt).toLocaleString() : "—"}</div>
              </div>
            )}
            {!simulating && simResult?.error && (
              <div style={{ color: RED, fontSize: 13, textAlign: "center", padding: 32 }}>⚠ {simResult.error}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Appetite / Tolerance Tab ───────────────────────────────────────────────

function AppetiteTab({ riskRows }: { riskRows: any[] }) {
  const [cfgRows, setCfgRows] = useState<any[]>([]);
  const [statusRows, setStatusRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({ category: "Macroeconomic", appetite_statement: "", appetite_threshold: 6, tolerance_threshold: 9 });
  const set = (k: string) => (v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cr, sr] = await Promise.all([
        fetch(apiUrl("/strategic-risk/appetite"), { headers: hdr() }).then(r => r.json()),
        fetch(apiUrl("/strategic-risk/appetite-status"), { headers: hdr() }).then(r => r.json()),
      ]);
      setCfgRows(Array.isArray(cr) ? cr : []);
      setStatusRows(Array.isArray(sr) ? sr : []);
    } catch { } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await fetch(apiUrl("/strategic-risk/appetite"), { method: "POST", headers: hdr(), body: JSON.stringify(form) });
      await load(); setOpen(false);
    } finally { setSaving(false); }
  };

  const ZONE_COLOR: Record<string, string> = { withinAppetite: EME, withinTolerance: AMB, outsideTolerance: RED };
  const TREND_ICON: Record<string, string> = { improving: "↑", stable: "→", worsening: "↓" };
  const TREND_COLOR: Record<string, string> = { improving: EME, stable: MUT, worsening: RED };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: FG }}>Appetite / Tolerance Alignment (FR-445 & FR-065)</div>
          <div style={{ fontSize: 11, color: MUT }}>Per-category exposure classification with forward-looking trend projection</div>
        </div>
        <Btn onClick={() => setOpen(true)}>Configure Appetite</Btn>
      </div>

      {loading ? <div style={{ padding: 40, textAlign: "center", color: MUT, fontSize: 12 }}>Loading…</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {statusRows.map((s: any) => {
            const cfg = cfgRows.find((c: any) => c.category === s.category);
            const color = ZONE_COLOR[s.zoneStatus] ?? MUT;
            const trendColor = TREND_COLOR[s.trendProjection] ?? MUT;
            const atPct = Math.min(100, (s.appetiteThreshold / 25) * 100);
            const ttPct = Math.min(100, (s.toleranceThreshold / 25) * 100);
            const avPct = Math.min(100, (s.avgResidual / 25) * 100);
            return (
              <div key={s.category} style={{ background: SUR, border: `1px solid ${BOR}`, borderRadius: 12, padding: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: TYPE_COLOR[s.category] ?? BLU, flexShrink: 0 }} />
                      <span style={{ fontSize: 14, fontWeight: 700, color: FG }}>{s.category}</span>
                      <Badge v={s.zoneStatus} map={ZONE_COLOR} labelMap={SEV_LABEL} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: trendColor }}>
                        {TREND_ICON[s.trendProjection] ?? "→"} {s.trendProjection}
                      </span>
                    </div>
                    {cfg?.appetite_statement && <div style={{ fontSize: 11, color: MUT, marginTop: 4, maxWidth: 480 }}>"{cfg.appetite_statement}"</div>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color }}>{s.avgResidual} <span style={{ fontSize: 13, fontWeight: 500, color: MUT }}>avg residual</span></div>
                    <div style={{ fontSize: 11, color: MUT }}>{s.riskCount} risks · {s.outsideCount} outside tolerance</div>
                  </div>
                </div>

                {/* Exposure gauge */}
                <div style={{ position: "relative", height: 16, background: `${BOR}60`, borderRadius: 8, overflow: "hidden", marginBottom: 6 }}>
                  {/* Green zone: 0 → appetite */}
                  <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${atPct}%`, background: `${EME}25`, borderRight: `2px solid ${EME}` }} />
                  {/* Amber zone: appetite → tolerance */}
                  <div style={{ position: "absolute", left: `${atPct}%`, top: 0, height: "100%", width: `${ttPct - atPct}%`, background: `${AMB}25`, borderRight: `2px solid ${AMB}` }} />
                  {/* Red zone: tolerance → 25 */}
                  <div style={{ position: "absolute", left: `${ttPct}%`, top: 0, height: "100%", right: 0, background: `${RED}25` }} />
                  {/* Current value marker */}
                  <div style={{ position: "absolute", left: `${avPct}%`, top: 0, bottom: 0, width: 3, background: color, borderRadius: 2, transform: "translateX(-50%)" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: MUT }}>
                  <span style={{ color: EME }}>● Appetite: {s.appetiteThreshold}</span>
                  <span style={{ color: AMB }}>● Tolerance: {s.toleranceThreshold}</span>
                  <span style={{ color }}>● Current: {s.avgResidual}</span>
                  <span style={{ color: MUT }}>Max: 25</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Panel open={open} title="Configure Appetite Thresholds" onClose={() => setOpen(false)} onSave={save} saving={saving}>
        <Sect title="Category">
          <Fld label="Risk Category"><Sel value={form.category} onChange={set("category")} options={[...RISK_TYPES]} /></Fld>
          <Fld label="Appetite Statement" hint="Board-approved risk appetite statement for this category">
            <Tex value={form.appetite_statement} onChange={set("appetite_statement")} placeholder="e.g. The organisation accepts low levels of macroeconomic risk…" />
          </Fld>
        </Sect>
        <Sect title="Thresholds (0–25 scale)">
          <Fld label={`Appetite Threshold: ${form.appetite_threshold}`} hint="Residual score at or below this = Within Appetite">
            <input type="range" min={1} max={24} step={1} value={form.appetite_threshold}
              onChange={e => set("appetite_threshold")(Number(e.target.value))}
              style={{ width: "100%", accentColor: EME }} />
          </Fld>
          <Fld label={`Tolerance Threshold: ${form.tolerance_threshold}`} hint="Above appetite but at or below this = Within Tolerance; above = Outside Tolerance">
            <input type="range" min={Number(form.appetite_threshold) + 1} max={25} step={1} value={form.tolerance_threshold}
              onChange={e => set("tolerance_threshold")(Number(e.target.value))}
              style={{ width: "100%", accentColor: AMB }} />
          </Fld>
          <div style={{ display: "flex", gap: 12, fontSize: 11 }}>
            <span style={{ color: EME }}>✅ ≤ {form.appetite_threshold} = Within Appetite</span>
            <span style={{ color: AMB }}>⚠ ≤ {form.tolerance_threshold} = Within Tolerance</span>
            <span style={{ color: RED }}>🔴 &gt; {form.tolerance_threshold} = Outside Tolerance</span>
          </div>
        </Sect>
      </Panel>
    </div>
  );
}

// ── Escalations Tab ────────────────────────────────────────────────────────

function EscalationsTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({ status: "open", resolution_note: "", evidence: "" });
  const set = (k: string) => (v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch(apiUrl("/strategic-risk/escalations"), { headers: hdr() }); setRows(await r.json()); }
    catch { } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openResolve = (r: any) => { setForm({ status: r.status, resolution_note: r.resolution_note ?? "", evidence: r.evidence ?? "" }); setEditing(r); setOpen(true); };
  const save = async () => {
    if (form.status === "resolved" && !form.evidence.trim()) { alert("Evidence is required before resolving an escalation."); return; }
    setSaving(true);
    try {
      const resp = await fetch(apiUrl(`/strategic-risk/escalations/${editing.escalation_id}`), { method: "PUT", headers: hdr(), body: JSON.stringify(form) });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Save failed" }));
        alert(err.error ?? "Save failed");
        return;
      }
      await load(); setOpen(false);
    } finally { setSaving(false); }
  };

  const openEsc = rows.filter((r: any) => r.status === "open").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: FG }}>Governance Escalation Queue (FR-070 & FR-450)</div>
        <div style={{ fontSize: 11, color: MUT }}>Non-bypassable escalations triggered when risks move outside tolerance. Cannot be archived without resolution evidence.</div>
      </div>

      {openEsc > 0 && (
        <div style={{ background: "rgba(248,113,113,0.08)", border: `1px solid rgba(248,113,113,0.4)`, borderRadius: 10, padding: "14px 18px" }}>
          <div style={{ fontWeight: 700, color: RED, fontSize: 13 }}>🔴 {openEsc} open escalation{openEsc > 1 ? "s" : ""} require action</div>
          <div style={{ fontSize: 11, color: MUT, marginTop: 4 }}>Each open escalation has automatically notified: Risk Owner, CISO, Board Risk Committee. Escalations cannot be bypassed — resolution evidence is mandatory.</div>
        </div>
      )}

      {loading ? <div style={{ padding: 40, textAlign: "center", color: MUT, fontSize: 12 }}>Loading…</div> :
        rows.length === 0 ? (
          <div style={{ background: SUR, border: `1px solid ${BOR}`, borderRadius: 10, padding: 48, textAlign: "center", color: MUT }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>No escalations</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Escalations are automatically created when strategic risks exceed the tolerance threshold.</div>
          </div>
        ) : (
          <div style={{ background: SUR, border: `1px solid ${BOR}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ background: "var(--muted)", color: MUT }}>
                    {["Escalation ID", "Risk", "Status", "Escalation Chain", "Triggered", "Resolved At", "Evidence", ""].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r: any) => {
                    const statusColor = r.status === "open" ? RED : r.status === "under-review" ? AMB : EME;
                    return (
                      <tr key={r.escalation_id} style={{ borderTop: `1px solid ${BOR}` }}>
                        <td style={{ padding: "9px 12px", color: BLU, fontWeight: 700, fontFamily: "monospace", whiteSpace: "nowrap" }}>{r.escalation_id}</td>
                        <td style={{ padding: "9px 12px", color: FG, fontWeight: 600 }}>{r.risk_title}</td>
                        <td style={{ padding: "9px 12px" }}>
                          <span style={{ background: `${statusColor}20`, color: statusColor, border: `1px solid ${statusColor}44`, borderRadius: 5, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>
                            {r.status?.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: "9px 12px", color: MUT, fontSize: 10 }}>{r.escalation_chain}</td>
                        <td style={{ padding: "9px 12px", color: MUT, whiteSpace: "nowrap" }}>{r.triggered_at ? new Date(r.triggered_at).toLocaleDateString() : "—"}</td>
                        <td style={{ padding: "9px 12px", color: MUT }}>{r.resolved_at ? new Date(r.resolved_at).toLocaleDateString() : "—"}</td>
                        <td style={{ padding: "9px 12px", color: r.evidence ? EME : MUT, fontSize: 10 }}>{r.evidence ? "✅ Provided" : "⚠ Required"}</td>
                        <td style={{ padding: "9px 12px" }}>
                          {r.status !== "resolved" && (
                            <Btn variant={r.status === "open" ? "danger" : "amber"} onClick={() => openResolve(r)} style={{ padding: "3px 10px", fontSize: 10, whiteSpace: "nowrap" }}>
                              {r.status === "open" ? "Resolve" : "Update"}
                            </Btn>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

      <Panel open={open} title="Resolve Escalation" onClose={() => setOpen(false)} onSave={save} saving={saving}>
        <div style={{ background: "rgba(248,113,113,0.08)", border: `1px solid rgba(248,113,113,0.3)`, borderRadius: 8, padding: "12px 14px", fontSize: 11, marginBottom: 4 }}>
          <div style={{ fontWeight: 700, color: RED, marginBottom: 4 }}>Escalation: {editing?.escalation_id}</div>
          <div style={{ color: MUT }}>Risk: <span style={{ color: FG }}>{editing?.risk_title}</span></div>
          <div style={{ color: MUT, marginTop: 4 }}>Chain: {editing?.escalation_chain}</div>
        </div>
        <Sect title="Resolution">
          <Fld label="Escalation Status">
            <Sel value={form.status} onChange={set("status")} options={[
              { value: "open", label: "Open" },
              { value: "under-review", label: "Under Review" },
              { value: "resolved", label: "Resolved" },
            ]} />
          </Fld>
          <Fld label="Evidence (mandatory for resolution)" hint="Describe actions taken, decisions made, and supporting documentation">
            <Tex value={form.evidence} onChange={set("evidence")} rows={3} placeholder="e.g. Board approval obtained on 2026-07-01; risk treatment plan approved with €500K budget…" />
          </Fld>
          <Fld label="Resolution Note">
            <Tex value={form.resolution_note} onChange={set("resolution_note")} placeholder="Summary of how the escalation was addressed…" />
          </Fld>
        </Sect>
      </Panel>
    </div>
  );
}

// ── Heat Map Tab (enhanced) ────────────────────────────────────────────────

function HeatMapTab({ risks, appetiteCfg, onDrillDown }: { risks: any[]; appetiteCfg: any[]; onDrillDown?: (riskId: string) => void }) {
  const gridSvgRef = useRef<SVGSVGElement>(null);

  function exportSvg() {
    const svg = gridSvgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(clone);
    const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Strategic-Risk-HeatMap-${new Date().toISOString().slice(0, 10)}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPng() {
    const svg = gridSvgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const w = svg.width.baseVal.value;
    const h = svg.height.baseVal.value;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(clone);
    const svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const scale = 3;
      const canvas = document.createElement("canvas");
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(scale, scale);
      ctx.fillStyle = "#0F172A";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `Strategic-Risk-HeatMap-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
    };
    img.src = url;
  }

  // Normalise strategic risks into StrategicRiskPoint shape expected by RiskBubbleHeatmap
  const strategicPoints = risks.map((r: any) => ({
    risk_id: r.risk_id,
    title: r.title,
    risk_type: r.risk_type,
    inherent_score: Number(r.inherent_score ?? r.likelihood * r.impact),
    residual_score: Number(r.residual_score ?? 0),
    appetite_status: r.appetite_status ?? "withinAppetite",
    owner: r.owner,
  }));
  const appetitePoints = appetiteCfg.map((c: any) => ({
    appetite_threshold: Number(c.appetite_threshold ?? 6),
    tolerance_threshold: Number(c.tolerance_threshold ?? 9),
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: FG }}>Strategic Risk Heat Map</div>
          <div style={{ fontSize: 11, color: MUT }}>5×5 grid with appetite zone overlays (FR-060) and inherent→residual directional arrows. Click a diamond to inspect the risk.</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="ghost" onClick={exportSvg} disabled={risks.length === 0} style={{ fontSize: 11, padding: "7px 12px" }}>↓ Export SVG</Btn>
          <Btn variant="ghost" onClick={exportPng} disabled={risks.length === 0} style={{ fontSize: 11, padding: "7px 12px" }}>↓ Export PNG</Btn>
          <Btn variant="primary" onClick={() => exportBoardPackPdf(risks, appetiteCfg)} disabled={risks.length === 0} style={{ fontSize: 11, padding: "7px 14px" }}>📄 Export Board Pack (PDF)</Btn>
        </div>
      </div>

      {/* Shared RiskBubbleHeatmap — strategic mode with zone bands + migration arrows */}
      <RiskBubbleHeatmap
        domain="strategic"
        strategicRisks={strategicPoints}
        appetiteConfig={appetitePoints}
        onDrillDown={onDrillDown}
      />

      <div style={{ background: SUR, border: `1px solid ${BOR}`, borderRadius: 12, padding: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: FG, marginBottom: 14 }}>5×5 Scoring Grid</div>
        <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: MUT }}>
            <span style={{ width: 16, height: 10, background: "rgba(34,197,94,0.18)", border: `1px solid ${EME}`, borderRadius: 2 }} />
            Within Appetite
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: MUT }}>
            <span style={{ width: 16, height: 10, background: "rgba(251,191,36,0.18)", border: `1px solid ${AMB}`, borderRadius: 2 }} />
            Within Tolerance
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: MUT }}>
            <span style={{ width: 16, height: 10, background: "rgba(220,38,38,0.18)", border: `1px solid ${RED}`, borderRadius: 2 }} />
            Outside Tolerance
          </span>
        </div>
        <HeatMapGrid risks={risks} appetiteCfg={appetiteCfg} svgRef={gridSvgRef} />
      </div>

      {/* Risk list with appetite status */}
      <div style={{ background: SUR, border: `1px solid ${BOR}`, borderRadius: 10, padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: FG, marginBottom: 12 }}>Risk Register Summary</div>
        {risks.length === 0 ? (
          <div style={{ fontSize: 11, color: MUT, textAlign: "center", padding: "20px 0" }}>No strategic risks — add risks in the Risk Assessment tab.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {risks.map((r: any) => {
              const inherent = Number(r.inherent_score ?? r.likelihood * r.impact);
              const residual = Number(r.residual_score ?? inherent);
              const color = r.appetite_status === "outsideTolerance" ? RED : r.appetite_status === "withinTolerance" ? AMB : EME;
              return (
                <div key={r.risk_id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", background: BG, borderRadius: 8, border: `1px solid ${BOR}` }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: TYPE_COLOR[r.risk_type] ?? BLU, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: FG }}>{r.title}</span>
                  <span style={{ fontSize: 10, color: MUT }}>{r.risk_type}</span>
                  <span style={{ fontSize: 11, color: AMB, fontWeight: 700 }}>{inherent}</span>
                  <span style={{ fontSize: 11, color: MUT }}>→</span>
                  <span style={{ fontSize: 11, color: EME, fontWeight: 700 }}>{residual.toFixed(1)}</span>
                  <Badge v={r.appetite_status ?? "withinAppetite"} map={SEV_COLOR} labelMap={SEV_LABEL} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main StrategicRiskTab component ───────────────────────────────────────

export default function StrategicRiskTab() {
  const [subTab, setSubTab] = useState("overview");
  const [stats, setStats] = useState<any>({});
  const [risks, setRisks] = useState<any[]>([]);
  const [kris, setKris] = useState<any[]>([]);
  const [escalations, setEscalations] = useState<any[]>([]);
  const [objectives, setObjectives] = useState<any[]>([]);
  const [appetiteCfg, setAppetiteCfg] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // drillRiskId: set when the heatmap bubble is clicked; passed to StrategicRisksTab
  // so it can open the detail panel for that specific risk automatically.
  const [drillRiskId, setDrillRiskId] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, rRes, kRes, eRes, oRes, aRes] = await Promise.all([
        fetch(apiUrl("/strategic-risk/dashboard"), { headers: hdr() }).then(r => r.json()).catch(() => ({})),
        fetch(apiUrl("/strategic-risk/risks"), { headers: hdr() }).then(r => r.json()).catch(() => []),
        fetch(apiUrl("/strategic-risk/kris"), { headers: hdr() }).then(r => r.json()).catch(() => []),
        fetch(apiUrl("/strategic-risk/escalations"), { headers: hdr() }).then(r => r.json()).catch(() => []),
        fetch(apiUrl("/strategic-risk/objectives"), { headers: hdr() }).then(r => r.json()).catch(() => []),
        fetch(apiUrl("/strategic-risk/appetite"), { headers: hdr() }).then(r => r.json()).catch(() => []),
      ]);
      setStats(sRes ?? {});
      setRisks(Array.isArray(rRes) ? rRes : []);
      setKris(Array.isArray(kRes) ? kRes : []);
      setEscalations(Array.isArray(eRes) ? eRes : []);
      setObjectives(Array.isArray(oRes) ? oRes : []);
      setAppetiteCfg(Array.isArray(aRes) ? aRes : []);
    } catch { } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  // Refresh data when switching tabs; optionally surface a specific risk detail
  const handleTabChange = useCallback((t: string, riskId?: string) => {
    if (riskId !== undefined) setDrillRiskId(riskId);
    setSubTab(t);
    loadDashboard();
  }, [loadDashboard]);

  const SUB_TABS = [
    { key: "overview",    label: "📊 Overview" },
    { key: "objectives",  label: "🎯 Objectives" },
    { key: "risks",       label: "⚡ Risks",     count: risks.length },
    { key: "heatmap",     label: "🗺 Heat Map" },
    { key: "kris",        label: "📈 KRIs",      count: kris.length, alert: kris.filter((k: any) => k.status === "breach").length > 0 },
    { key: "scenarios",   label: "🧪 Scenarios" },
    { key: "appetite",    label: "⚖ Appetite" },
    { key: "escalations", label: "🚨 Escalations", count: escalations.filter((e: any) => e.status === "open").length, alert: escalations.filter((e: any) => e.status === "open").length > 0 },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Sub-nav */}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${BOR}`, overflowX: "auto", flexShrink: 0 }}>
        {SUB_TABS.map(t => (
          <button key={t.key} onClick={() => handleTabChange(t.key)}
            style={{
              padding: "10px 16px", border: "none", background: "none", cursor: "pointer",
              fontSize: 12, fontWeight: 600, fontFamily: "inherit",
              color: subTab === t.key ? BLU : MUT,
              borderBottom: subTab === t.key ? `2px solid ${BLU}` : "2px solid transparent",
              whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6,
            }}>
            {t.label}
            {t.count != null && t.count > 0 && (
              <span style={{ background: t.alert ? `${RED}30` : `${BLU}25`, color: t.alert ? RED : BLU, border: `1px solid ${t.alert ? RED : BLU}44`, borderRadius: 10, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: "20px 0", flex: 1 }}>
        {subTab === "overview"    && <OverviewTab stats={stats} risks={risks} kris={kris} escalations={escalations} objectives={objectives} onGoTo={handleTabChange} />}
        {subTab === "objectives"  && <ObjectivesTab />}
        {subTab === "risks"       && <StrategicRisksTab objectives={objectives} highlightId={drillRiskId} onHighlightConsumed={() => setDrillRiskId(null)} />}
        {subTab === "heatmap"     && <HeatMapTab risks={risks} appetiteCfg={appetiteCfg} onDrillDown={(riskId) => handleTabChange("risks", riskId)} />}
        {subTab === "kris"        && <KriTab />}
        {subTab === "scenarios"   && <ScenariosTab />}
        {subTab === "appetite"    && <AppetiteTab riskRows={risks} />}
        {subTab === "escalations" && <EscalationsTab />}
      </div>
    </div>
  );
}
