import { useQueryClient, useQuery } from "@tanstack/react-query";

const D = {
  bg:       "var(--ai-panel-bg, rgba(15,23,42,0.95))",
  border:   "var(--ai-panel-border, rgba(147,197,253,0.18))",
  text:     "var(--foreground)",
  muted:    "rgb(148,163,184)",
  accent:   "rgb(147,197,253)",
  green:    "rgb(52,211,153)",
  amber:    "rgb(251,191,36)",
  red:      "rgb(248,113,113)",
  badgeBg:  "rgba(147,197,253,0.12)",
  innerBg:  "var(--secondary)",
  innerBdr: "var(--border)",
};

const ENRICH_URL = "/api/ai/enrich";

interface EnrichResult {
  summary: string;
  riskScoreSuggestion?: number;
  recommendations: string[];
  relatedObjectHints?: string[];
  enrichedAt?: string;
}

interface Props {
  objectType: string;
  objectId: string;
  fallbackInsights?: string[];
}

function Skeleton({ w = "100%", h = 10, mb = 8 }: { w?: string | number; h?: number; mb?: number }) {
  return (
    <>
      <div style={{
        width: w, height: h, borderRadius: 4, marginBottom: mb,
        background: "linear-gradient(90deg, var(--border) 25%, rgba(255,255,255,0.12) 50%, var(--border) 75%)",
        backgroundSize: "200% 100%",
        animation: "dark-shimmer 1.5s infinite",
      }} />
      <style>{`@keyframes dark-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
    </>
  );
}

async function fetchEnrich(objectType: string, objectId: string): Promise<EnrichResult> {
  const token = localStorage.getItem("grc_token");
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const url = `${base.replace("/grc-platform", "")}${ENRICH_URL}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
    body: JSON.stringify({ objectType, objectId, tenantId: 1 }),
  });
  if (!r.ok) throw new Error(r.statusText);
  return r.json() as Promise<EnrichResult>;
}

export function AiInsightPanel({ objectType, objectId, fallbackInsights = [] }: Props) {
  const qc = useQueryClient();
  const queryKey = ["ai-enrich", objectType, objectId];

  const { data: result, isLoading: loading, isError: error } = useQuery<EnrichResult>({
    queryKey,
    queryFn: () => fetchEnrich(objectType, objectId),
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  const reanalyse = () => { void qc.invalidateQueries({ queryKey }); };

  const enrichedAt = result?.enrichedAt
    ? new Date(result.enrichedAt).toISOString().slice(0, 19).replace("T", " ") + " UTC"
    : null;

  const container: React.CSSProperties = {
    background: D.bg, border: `1px solid ${D.border}`, borderRadius: 12, padding: "16px 18px",
    boxShadow: "0 0 24px rgba(147,197,253,0.06)",
  };

  const header = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 14 }}>✦</span>
        <span style={{ fontSize: 11, fontWeight: 800, color: D.accent, letterSpacing: "0.05em" }}>AI Insights</span>
      </div>
      <button onClick={reanalyse} style={{ fontSize: 10, color: D.accent, fontWeight: 700, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", opacity: 0.8 }}>
        ↻ Retry
      </button>
    </div>
  );

  if (loading) {
    return (
      <div style={container}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
          <span style={{ fontSize: 14 }}>✦</span>
          <span style={{ fontSize: 11, fontWeight: 800, color: D.accent }}>AI Insights</span>
          <span style={{ fontSize: 9, color: D.amber, fontWeight: 700, background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: 4, padding: "1px 6px" }}>
            ANALYSING…
          </span>
        </div>
        <Skeleton h={10} mb={8} />
        <Skeleton w="85%" h={10} mb={8} />
        <Skeleton w="70%" h={10} mb={14} />
        <Skeleton h={8} mb={6} />
        <Skeleton w="90%" h={8} mb={6} />
        <Skeleton w="75%" h={8} mb={0} />
      </div>
    );
  }

  if (error || (!result && fallbackInsights.length === 0)) {
    return (
      <div style={container}>
        {header}
        <div style={{ fontSize: 11, color: D.muted, lineHeight: 1.6, fontStyle: "italic", marginBottom: fallbackInsights.length > 0 ? 12 : 0 }}>
          AI analysis unavailable. Connect to the live API to enable contextual enrichment.
        </div>
        {fallbackInsights.length > 0 && (
          <div>
            {fallbackInsights.map((ins, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
                <span style={{ color: D.green, fontWeight: 800, fontSize: 12, flexShrink: 0, marginTop: 1 }}>•</span>
                <span style={{ fontSize: 11, color: D.text, lineHeight: 1.5 }}>{ins}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (!result && fallbackInsights.length > 0) {
    return (
      <div style={container}>
        {header}
        {fallbackInsights.map((ins, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
            <span style={{ color: D.green, fontWeight: 800, fontSize: 12, flexShrink: 0, marginTop: 1 }}>•</span>
            <span style={{ fontSize: 11, color: D.text, lineHeight: 1.5 }}>{ins}</span>
          </div>
        ))}
      </div>
    );
  }

  const insights = result ? result.recommendations : fallbackInsights;
  const summary  = result?.summary ?? null;

  return (
    <div style={container}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 14 }}>✦</span>
          <span style={{ fontSize: 11, fontWeight: 800, color: D.accent }}>AI Insights</span>
          {result && (
            <span style={{ fontSize: 9, fontWeight: 700, color: D.green, background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.25)", borderRadius: 4, padding: "1px 6px" }}>
              ✓ AI ENRICHED
            </span>
          )}
        </div>
        <button onClick={reanalyse} title="Re-analyse" style={{ fontSize: 10, color: D.accent, fontWeight: 700, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
          ↻ Re-analyse
        </button>
      </div>

      {summary && (
        <div style={{ fontSize: 11, color: D.text, lineHeight: 1.6, marginBottom: 12, padding: "10px 12px", background: D.innerBg, borderRadius: 8, border: `1px solid ${D.innerBdr}` }}>
          {summary}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {insights.map((ins, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ color: D.green, fontWeight: 800, fontSize: 12, flexShrink: 0, marginTop: 1 }}>•</span>
            <span style={{ fontSize: 11, color: D.text, lineHeight: 1.5 }}>{ins}</span>
          </div>
        ))}
      </div>

      {enrichedAt && (
        <div style={{ marginTop: 10, fontSize: 9, color: D.muted }}>Enriched {enrichedAt}</div>
      )}

      {result?.riskScoreSuggestion !== undefined && (
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: D.innerBg, borderRadius: 6, border: `1px solid ${D.innerBdr}` }}>
          <span style={{ fontSize: 10, color: D.muted }}>AI Risk Score:</span>
          <span style={{ fontSize: 13, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: result.riskScoreSuggestion >= 70 ? D.red : result.riskScoreSuggestion >= 40 ? D.amber : D.green }}>
            {result.riskScoreSuggestion}
          </span>
          <span style={{ fontSize: 9, color: D.muted }}>/100</span>
        </div>
      )}
    </div>
  );
}
