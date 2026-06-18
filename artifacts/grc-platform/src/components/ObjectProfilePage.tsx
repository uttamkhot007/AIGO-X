import { Link } from "wouter";
import type { ReactNode } from "react";
import { AiInsightPanel } from "@/components/AiInsightPanel";

const D = {
  bg:       "var(--secondary)",
  bgDeep:   "var(--secondary)",
  border:   "var(--border)",
  text:     "var(--foreground)",
  muted:    "rgb(148,163,184)",
  dim:      "var(--muted-foreground)",
  accent:   "rgb(147,197,253)",
  green:    "rgb(52,211,153)",
  amber:    "rgb(251,191,36)",
  red:      "rgb(248,113,113)",
  purple:   "rgb(196,181,253)",
};

function riskColor(s: number) {
  return s >= 80 ? D.red : s >= 60 ? D.amber : s >= 40 ? D.accent : D.green;
}

export interface RiskSection {
  inherent:  number;
  residual?: number;
  impact?:   number;
  trend?:    "up" | "down" | "flat";
}

export interface RelatedObject {
  id:    string;
  label: string;
  type:  string;
  route: string;
}

export interface TimelineEntry {
  actor: string;
  action: string;
  ts: string;
}

export interface ObjectProfileHero {
  id:       string;
  name:     string;
  type:     string;
  owner:    string;
  status:   string;
  statusOk: boolean;
  modified?: string;
  extra?: { label: string; value: string }[];
}

export interface ObjectProfilePageProps {
  hero:          ObjectProfileHero;
  breadcrumbs?:  { label: string; href?: string }[];
  aiObjectType:  string;
  aiObjectId:    string;
  aiFallback?:   string[];
  riskSection?:  RiskSection;
  related?:      RelatedObject[];
  timeline?:     TimelineEntry[];
  description?:  string;
  children?:     ReactNode;
  onBack?:       string;
}

function RingGauge({ score }: { score: number }) {
  const c = riskColor(score), r = 36, circ = 2 * Math.PI * r, dash = (score / 100) * circ;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width={88} height={88} style={{ transform: "rotate(-90deg)" }}>
        <circle cx="44" cy="44" r={r} fill="none" stroke="var(--border)" strokeWidth="10" />
        <circle cx="44" cy="44" r={r} fill="none" stroke={c} strokeWidth="10"
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round" />
      </svg>
      <div style={{ position: "relative", marginTop: -68, marginBottom: 14, textAlign: "center" }}>
        <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: c }}>{score}</div>
        <div style={{ fontSize: 9, color: D.muted, fontWeight: 700 }}>RISK</div>
      </div>
    </div>
  );
}

function Sparkline({ trend }: { trend?: "up" | "down" | "flat" }) {
  if (!trend) return null;
  const color = trend === "up" ? D.red : trend === "down" ? D.green : D.amber;
  const sym   = trend === "up" ? "▲" : trend === "down" ? "▼" : "—";
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color }}>
      {sym} {trend === "flat" ? "Stable" : trend === "up" ? "Increasing" : "Decreasing"}
    </span>
  );
}

export function ObjectProfilePage({
  hero, breadcrumbs, aiObjectType, aiObjectId, aiFallback, riskSection, related, timeline, description, children, onBack,
}: ObjectProfilePageProps) {
  const card: React.CSSProperties = {
    background: D.bg, border: `1px solid ${D.border}`, borderRadius: 12,
    boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
  };

  const statusColor  = hero.statusOk ? D.green : D.red;
  const statusBg     = hero.statusOk ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)";
  const statusBorder = hero.statusOk ? "rgba(52,211,153,0.3)" : "rgba(248,113,113,0.3)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "20px 24px", overflow: "auto" }}>

      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: D.muted }}>
        {onBack && (
          <Link href={onBack}>
            <button style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: D.accent, fontSize: 12, fontWeight: 700, fontFamily: "inherit", padding: 0 }}>
              ← Back
            </button>
          </Link>
        )}
        {onBack && breadcrumbs && breadcrumbs.length > 0 && <span style={{ color: D.dim }}>·</span>}
        {breadcrumbs?.map((b, i) => (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {i > 0 && <span style={{ color: D.dim }}>/</span>}
            {b.href
              ? <Link href={b.href}><span style={{ color: D.accent, cursor: "pointer" }}>{b.label}</span></Link>
              : <span style={{ color: D.muted }}>{b.label}</span>}
          </span>
        ))}
      </div>

      {/* Hero header */}
      <div style={{ ...card, padding: "20px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" as const }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: D.dim }}>{hero.id}</span>
              <span style={{ fontSize: 9, fontWeight: 800, color: statusColor, background: statusBg, border: `1px solid ${statusBorder}`, borderRadius: 4, padding: "2px 7px" }}>
                {hero.status.toUpperCase()}
              </span>
              <span style={{ fontSize: 9, fontWeight: 700, color: D.accent, background: "rgba(147,197,253,0.12)", border: "1px solid rgba(147,197,253,0.25)", borderRadius: 4, padding: "2px 7px" }}>
                {hero.type}
              </span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: D.text, marginBottom: 6 }}>{hero.name}</div>
            <div style={{ fontSize: 12, color: D.muted }}>
              Owner: <span style={{ color: D.text, fontWeight: 600 }}>{hero.owner}</span>
              {hero.modified && <> · Last modified: <span style={{ color: D.text }}>{hero.modified}</span></>}
            </div>
            {hero.extra && hero.extra.length > 0 && (
              <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" as const }}>
                {hero.extra.map(e => (
                  <div key={e.label} style={{ fontSize: 11 }}>
                    <span style={{ color: D.muted }}>{e.label}: </span>
                    <span style={{ color: D.text, fontWeight: 600 }}>{e.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {riskSection && <RingGauge score={riskSection.inherent} />}
        </div>

      </div>

      {/* Main content grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Description */}
          {description && (
            <div style={{ ...card, padding: "18px 20px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: D.accent, marginBottom: 10 }}>Description</div>
              <div style={{ fontSize: 12, color: D.text, lineHeight: 1.7 }}>{description}</div>
            </div>
          )}

          {/* Custom children */}
          {children}

          {/* Impact & Risk Section */}
          {riskSection && (
            <div style={{ ...card, padding: "18px 20px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: D.accent, marginBottom: 14 }}>Impact & Risk Scoring</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                {[
                  { label: "Inherent Risk",  value: riskSection.inherent,               color: riskColor(riskSection.inherent) },
                  { label: "Residual Risk",  value: riskSection.residual  ?? "—",       color: riskSection.residual !== undefined  ? riskColor(riskSection.residual)  : D.muted },
                  { label: "Impact Score",   value: riskSection.impact    ?? "—",       color: riskSection.impact   !== undefined  ? riskColor(riskSection.impact)    : D.muted },
                ].map(k => (
                  <div key={k.label} style={{ background: D.bgDeep, borderRadius: 8, padding: "12px 14px", textAlign: "center", border: `1px solid ${D.border}` }}>
                    <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: k.color }}>{k.value}</div>
                    <div style={{ fontSize: 10, color: D.muted, marginTop: 3 }}>{k.label}</div>
                  </div>
                ))}
              </div>
              {riskSection.trend && (
                <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                  <span style={{ color: D.muted }}>Trend:</span>
                  <Sparkline trend={riskSection.trend} />
                </div>
              )}
            </div>
          )}

          {/* Related Objects */}
          {related && related.length > 0 && (
            <div style={{ ...card, padding: "18px 20px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: D.accent, marginBottom: 12 }}>Related Objects</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
                {related.map(r => (
                  <Link key={r.id} href={r.route}>
                    <div style={{
                      fontSize: 11, fontWeight: 600, color: D.accent,
                      background: "rgba(147,197,253,0.08)", border: "1px solid rgba(147,197,253,0.2)",
                      borderRadius: 6, padding: "5px 10px", cursor: "pointer",
                      display: "flex", gap: 5, alignItems: "center",
                    }}>
                      <span style={{ fontSize: 9, color: D.muted }}>{r.type}</span>
                      <span>{r.label}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Timeline */}
          {timeline && timeline.length > 0 && (
            <div style={{ ...card, padding: "18px 20px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: D.accent, marginBottom: 12 }}>Activity Timeline</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {timeline.map((t, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: i < timeline.length - 1 ? `1px solid ${D.border}` : "none" }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: D.green, flexShrink: 0, marginTop: 6 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: D.text }}>{t.action}</div>
                      <div style={{ fontSize: 10, color: D.muted, marginTop: 2 }}>{t.actor} · {t.ts}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column: AI Panel */}
        <div>
          <AiInsightPanel objectType={aiObjectType} objectId={aiObjectId} fallbackInsights={aiFallback} />
        </div>
      </div>
    </div>
  );
}
