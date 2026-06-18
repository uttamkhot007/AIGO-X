import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import {
  Shield, ShieldCheck, ShieldAlert, Activity, Cpu, RefreshCw, ExternalLink,
  ChevronDown, ChevronRight, CheckCircle2, XCircle, AlertTriangle, MinusCircle,
  HardDrive, Wifi, Server, Users, Cloud, Eye, Clock, Terminal, Key, Lock,
  MemoryStick,
} from "lucide-react";

const API = "/admin-api";

// ── Types ──────────────────────────────────────────────────────────────────────

interface AgentStatus {
  agent_id?: string;
  version: string;
  platform: string;
  uptime_secs: number;
  last_collection?: string;
  last_heartbeat?: string;
  compliance_score?: number;
  weighted_score?: number;
  active_threats: number;
  health: string;
  checks_passed?: number;
  checks_failed?: number;
  checks_warned?: number;
  checks_total?: number;
}

interface Check {
  id: string;
  display_name?: string;
  category?: string;
  status: string;
  evidence: string;
  recommendation?: string;
  severity?: string;
}

interface ScoreSummary {
  score: number;
  weighted_score?: number;
  label: string;
  passed: number;
  failed: number;
  warned: number;
  skipped: number;
  total: number;
  critical_failures?: number;
  high_failures?: number;
}

interface Inventory {
  hostname?: string;
  platform?: string;
  arch?: string;
  os?: { name: string; version: string; patch_level?: string };
  hardware?: { cpu: string; ram_gb: number; disk_gb: number };
  memory_usage_pct?: number;
  cpu_usage_pct?: number;
  encryption_status?: string;
  encryption_volumes?: Array<{ path: string; status: string; method?: string }>;
  password_min_length?: number;
  password_max_age_days?: number;
  password_complexity_enabled?: boolean;
  password_min_classes?: number;
  screen_lock_enabled?: boolean;
  screen_lock_timeout_secs?: number;
  firewall_enabled?: boolean;
  azure_ad_device_id?: string;
  azure_ad_registered?: boolean;
  azure_ad_compliant?: boolean;
  ip_addresses?: string[];
}

// ── Utility helpers ────────────────────────────────────────────────────────────

function scoreColor(s: number) {
  if (s >= 90) return "#10b981";
  if (s >= 75) return "#22c55e";
  if (s >= 60) return "#eab308";
  if (s >= 40) return "#f97316";
  return "#ef4444";
}
function scoreLabel(s: number) {
  if (s >= 90) return "Excellent";
  if (s >= 75) return "Good";
  if (s >= 60) return "Fair";
  if (s >= 40) return "Poor";
  return "Critical";
}
function scoreGlowClass(s: number) {
  if (s >= 90) return "score-ring-excellent";
  if (s >= 75) return "score-ring-good";
  if (s >= 60) return "score-ring-fair";
  if (s >= 40) return "score-ring-poor";
  return "score-ring-critical";
}
function formatUptime(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${h}h ${m}m ${s}s`;
}
function chipCls(status: string) {
  return { pass: "chip-pass", fail: "chip-fail", warn: "chip-warn" }[status] ?? "chip-skip";
}
function badgeCls(sev = "low") {
  return { critical: "badge-critical", high: "badge-high", medium: "badge-medium" }[sev.toLowerCase()] ?? "badge-low";
}
function categoryIcon(cat = "") {
  const s16 = { size: 14 };
  if (cat.includes("Encrypt"))  return <HardDrive {...s16} style={{ color: "#fca5a5" }} />;
  if (cat.includes("Firewall")) return <Shield {...s16} style={{ color: "#fdba74" }} />;
  if (cat.includes("Antivirus"))return <ShieldCheck {...s16} style={{ color: "#93c5fd" }} />;
  if (cat.includes("Log"))      return <Terminal {...s16} style={{ color: "#6ee7b7" }} />;
  if (cat.includes("Patch"))    return <RefreshCw {...s16} style={{ color: "#93c5fd" }} />;
  if (cat.includes("Boot"))     return <Lock {...s16} style={{ color: "#c4b5fd" }} />;
  if (cat.includes("Access"))   return <Eye {...s16} style={{ color: "#93c5fd" }} />;
  if (cat.includes("User"))     return <Users {...s16} style={{ color: "#fde047" }} />;
  if (cat.includes("Network"))  return <Wifi {...s16} style={{ color: "#fde047" }} />;
  if (cat.includes("SSH"))      return <Terminal {...s16} style={{ color: "#67e8f9" }} />;
  if (cat.includes("Windows"))  return <Server {...s16} style={{ color: "#93c5fd" }} />;
  if (cat.includes("Azure"))    return <Cloud {...s16} style={{ color: "#67e8f9" }} />;
  if (cat.includes("Resource")) return <Activity {...s16} style={{ color: "#6ee7b7" }} />;
  if (cat.includes("Password")) return <Key {...s16} style={{ color: "#c4b5fd" }} />;
  return <CheckCircle2 {...s16} style={{ color: "#94a3b8" }} />;
}
function statusIcon(status: string) {
  if (status === "pass") return <CheckCircle2 size={14} style={{ color: "#6ee7b7" }} />;
  if (status === "fail") return <XCircle size={14} style={{ color: "#fca5a5" }} />;
  if (status === "warn") return <AlertTriangle size={14} style={{ color: "#fde047" }} />;
  return <MinusCircle size={14} style={{ color: "#475569" }} />;
}

// ── Category summary ───────────────────────────────────────────────────────────

interface CatSummary { name: string; pass: number; fail: number; warn: number; total: number }
function buildCategories(checks: Check[]): CatSummary[] {
  const map = new Map<string, CatSummary>();
  for (const c of checks) {
    const cat = c.category ?? "General";
    if (!map.has(cat)) map.set(cat, { name: cat, pass: 0, fail: 0, warn: 0, total: 0 });
    const s = map.get(cat)!;
    s.total++;
    if (c.status === "pass") s.pass++;
    else if (c.status === "fail") s.fail++;
    else if (c.status === "warn") s.warn++;
  }
  return Array.from(map.values()).sort((a, b) => (b.fail + b.warn) - (a.fail + a.warn));
}

// ── Radial score gauge (SVG, no extra dep) ────────────────────────────────────

function ScoreGauge({ score }: { score: number }) {
  const color = scoreColor(score);
  const glowCls = scoreGlowClass(score);
  const label = scoreLabel(score);
  const R = 78;
  const circ = 2 * Math.PI * R;
  const arc = (score / 100) * circ * 0.75;
  return (
    <div className="flex flex-col items-center">
      <svg width="196" height="196" viewBox="0 0 196 196" className={glowCls}>
        {/* track */}
        <circle cx="98" cy="98" r={R} fill="none"
          stroke="rgba(255,255,255,0.06)" strokeWidth="14" strokeLinecap="round"
          strokeDasharray={`${circ * 0.75} ${circ}`}
          transform="rotate(135 98 98)" />
        {/* fill */}
        <circle cx="98" cy="98" r={R} fill="none"
          stroke={color} strokeWidth="14" strokeLinecap="round"
          strokeDasharray={`${arc} ${circ}`}
          transform="rotate(135 98 98)"
          style={{ transition: "stroke-dasharray 1.2s cubic-bezier(0.4,0,0.2,1)" }} />
        <text x="98" y="92" textAnchor="middle" fill={color}
          fontSize="38" fontWeight="700" fontFamily="inherit">{score}</text>
        <text x="98" y="116" textAnchor="middle"
          fill="rgba(255,255,255,0.4)" fontSize="12" fontFamily="inherit">{label}</text>
      </svg>
    </div>
  );
}

// ── Metric card ────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color = "#60a5fa", icon }: {
  label: string; value: string | number; sub?: string; color?: string; icon: React.ReactNode;
}) {
  return (
    <div className="glass-card p-4 flex gap-3 items-start">
      <div className="mt-0.5 shrink-0" style={{ color }}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">{label}</div>
        <div className="text-xl font-bold text-white mt-0.5">{value}</div>
        {sub && <div className="text-[10px] text-slate-600 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

// ── Category card ──────────────────────────────────────────────────────────────

function CategoryCard({ cat }: { cat: CatSummary }) {
  const pct = cat.total > 0 ? Math.round((cat.pass / cat.total) * 100) : 0;
  const fillColor = cat.fail > 0 ? "#ef4444" : cat.warn > 0 ? "#eab308" : "#10b981";
  const chipStatus = cat.fail > 0 ? "fail" : cat.warn > 0 ? "warn" : "pass";
  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          {categoryIcon(cat.name)}
          <span className="text-[11px] font-semibold text-slate-300 truncate">{cat.name}</span>
        </div>
        <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide shrink-0 ml-1 ${chipCls(chipStatus)}`}>
          {cat.fail > 0 ? `${cat.fail}F` : cat.warn > 0 ? `${cat.warn}W` : "✓"}
        </span>
      </div>
      <div className="progress-bar-track h-1.5 mb-1.5">
        <div className="progress-bar-fill" style={{ width: `${pct}%`, background: fillColor }} />
      </div>
      <div className="flex justify-between text-[9px] text-slate-600">
        <span>{cat.pass}/{cat.total} passed</span>
        <span>{pct}%</span>
      </div>
    </div>
  );
}

// ── Resource bar ───────────────────────────────────────────────────────────────

function ResourceBar({ label, pct, icon, color }: {
  label: string; pct: number; icon: React.ReactNode; color: string;
}) {
  const c = pct >= 90 ? "#ef4444" : pct >= 75 ? "#f97316" : color;
  return (
    <div className="flex items-center gap-3">
      <div style={{ color: c }}>{icon}</div>
      <div className="flex-1">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-slate-400">{label}</span>
          <span className="font-bold" style={{ color: c }}>{pct.toFixed(0)}%</span>
        </div>
        <div className="progress-bar-track h-2">
          <div className="progress-bar-fill" style={{ width: `${Math.min(pct, 100)}%`, background: c }} />
        </div>
      </div>
    </div>
  );
}

// ── Policy detail rows ─────────────────────────────────────────────────────────

function PolicyRow({ label, target, value, pass, unknown }: {
  label: string; target: string; value: string; pass: boolean; unknown: boolean;
}) {
  return (
    <div className="glass-inner p-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        {unknown ? <MinusCircle size={14} style={{ color: "#475569" }} />
          : pass ? <CheckCircle2 size={14} style={{ color: "#6ee7b7" }} />
            : <XCircle size={14} style={{ color: "#fca5a5" }} />}
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-300 truncate">{label}</div>
          <div className="text-[10px] text-slate-600 truncate">{target}</div>
        </div>
      </div>
      <div className={`text-sm font-bold shrink-0 ${unknown ? "text-slate-600" : pass ? "text-emerald-400" : "text-red-400"}`}>
        {value}
      </div>
    </div>
  );
}

// ── Expandable check row ───────────────────────────────────────────────────────

function CheckRow({ check }: { check: Check }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr
        className="border-b border-white/[0.045] hover:bg-white/[0.025] cursor-pointer transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <td className="py-2.5 px-4">
          <div className="flex items-center gap-2">
            {statusIcon(check.status)}
            <span className="text-xs font-semibold text-slate-300">{check.display_name ?? check.id}</span>
          </div>
        </td>
        <td className="py-2.5 px-4 hidden sm:table-cell">
          <span className="text-[10px] px-2 py-0.5 rounded border text-slate-500"
            style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
            {check.category ?? "—"}
          </span>
        </td>
        <td className="py-2.5 px-4 hidden md:table-cell">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${badgeCls(check.severity)}`}>
            {check.severity ?? "low"}
          </span>
        </td>
        <td className="py-2.5 px-4">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${chipCls(check.status)}`}>
            {check.status}
          </span>
        </td>
        <td className="py-2.5 pr-4 text-right">
          {open
            ? <ChevronDown size={13} style={{ color: "#334155" }} />
            : <ChevronRight size={13} style={{ color: "#334155" }} />}
        </td>
      </tr>
      {open && (
        <tr className="border-b border-white/[0.04]">
          <td colSpan={5} className="px-4 pb-3">
            <div className="expand-down glass-inner p-3 space-y-2 mt-1">
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-0.5">Evidence</div>
                <div className="text-xs text-slate-300">{check.evidence}</div>
              </div>
              {check.recommendation && (
                <div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-0.5">Recommendation</div>
                  <div className="text-xs text-amber-300/90">{check.recommendation}</div>
                </div>
              )}
              <div className="text-[10px] font-mono text-slate-700 pt-0.5">{check.id}</div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Loading shimmer box ────────────────────────────────────────────────────────
function Skel({ h = "20px", w = "100%" }: { h?: string; w?: string }) {
  return <div className="shimmer" style={{ height: h, width: w }} />;
}

type Tab = "overview" | "checks" | "policy" | "system";
type FilterStatus = "all" | "fail" | "warn" | "pass" | "skip";

// ══════════════════════════════════════════════════════════════════════════════
// Main App
// ══════════════════════════════════════════════════════════════════════════════

export default function App() {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [inv, setInv] = useState<Inventory | null>(null);
  const [score, setScore] = useState<ScoreSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [tab, setTab] = useState<Tab>("overview");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [search, setSearch] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [stR, chR, invR, scR] = await Promise.allSettled([
        axios.get<AgentStatus>(`${API}/status`),
        axios.get<{ checks: Check[] }>(`${API}/checks`),
        axios.get<Inventory>(`${API}/inventory`),
        axios.get<ScoreSummary>(`${API}/score`),
      ]);
      if (stR.status  === "fulfilled") setStatus(stR.value.data);
      if (chR.status  === "fulfilled") setChecks(chR.value.data.checks ?? []);
      if (invR.status === "fulfilled") setInv(invR.value.data);
      if (scR.status  === "fulfilled") setScore(scR.value.data);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Cannot reach agent");
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  const compScore = status?.compliance_score ?? score?.score ?? 0;
  const categories = buildCategories(checks);
  const filteredChecks = checks.filter(c => {
    if (filterStatus !== "all" && c.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return (c.display_name ?? c.id).toLowerCase().includes(q)
        || (c.category ?? "").toLowerCase().includes(q)
        || c.evidence.toLowerCase().includes(q);
    }
    return true;
  });

  const healthColor = status?.health === "healthy" ? "#10b981"
    : status?.health === "degraded" ? "#eab308" : "#ef4444";

  return (
    <div className="mesh-bg min-h-screen text-slate-100">

      {/* ── Sticky header ── */}
      <header className="sticky top-0 z-50 border-b border-white/[0.07]"
        style={{ background: "rgba(10,15,30,0.88)", backdropFilter: "blur(20px)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg,#3b82f6,#6366f1)" }}>
              <Shield size={15} style={{ color: "#fff" }} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold gradient-text-blue">AIGO-X</span>
              <span className="text-sm text-slate-600">Agent</span>
            </div>
            {status && (
              <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full border"
                style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.07)" }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: healthColor }} />
                <span className="text-[10px] text-slate-400 capitalize">{status.health}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <span className="hidden md:block text-[10px] text-slate-700">{lastRefresh.toLocaleTimeString()}</span>
            <button data-testid="button-refresh" onClick={refresh}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{ background: "rgba(59,130,246,0.1)", color: "#93c5fd", border: "1px solid rgba(59,130,246,0.2)" }}>
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* Error banner */}
        {error && (
          <div className="glass-card p-4 flex items-start gap-3"
            style={{ background: "rgba(239,68,68,0.07)", borderColor: "rgba(239,68,68,0.22)" }}>
            <ShieldAlert size={18} style={{ color: "#fca5a5" }} className="mt-0.5 shrink-0" />
            <div>
              <div className="text-sm font-semibold text-red-300">Agent unreachable</div>
              <div className="text-xs text-slate-400 mt-0.5">{error}</div>
              <div className="text-xs text-slate-600 mt-1">
                Run <code className="text-slate-500">grc-agent start</code> — admin server defaults to localhost:7979
              </div>
            </div>
          </div>
        )}

        {loading && !status ? (
          /* Skeleton */
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="glass-card p-6 flex flex-col items-center gap-4">
              <Skel h="180px" w="180px" />
              <Skel h="14px" w="60%" />
            </div>
            <div className="lg:col-span-3 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[...Array(4)].map((_, i) => <div key={i} className="glass-card p-4"><Skel h="52px" /></div>)}
              </div>
              <div className="glass-card p-4"><Skel h="100px" /></div>
            </div>
          </div>
        ) : status ? (
          <>
            {/* Tab nav */}
            <div className="glass-inner w-fit rounded-xl p-1 flex gap-1">
              {(["overview","checks","policy","system"] as Tab[]).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                    tab === t ? "text-white" : "text-slate-500 hover:text-slate-300"
                  }`}
                  style={tab === t ? {
                    background: "linear-gradient(135deg,rgba(59,130,246,.22),rgba(99,102,241,.18))",
                    border: "1px solid rgba(59,130,246,.3)"
                  } : {}}>
                  {t}
                </button>
              ))}
            </div>

            {/* ══ OVERVIEW ══ */}
            {tab === "overview" && (
              <div className="space-y-5">
                {/* Score + KPIs */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                  <div className="glass-card p-6 flex flex-col items-center justify-center gap-2 lg:col-span-1">
                    <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">
                      Compliance Score
                    </div>
                    <ScoreGauge score={compScore} />
                    <div className="text-center">
                      <div className="text-[10px] text-slate-500">v{status.version} · {status.platform}</div>
                      {status.agent_id && (
                        <div className="text-[10px] font-mono text-slate-700 mt-0.5 truncate max-w-[180px]">
                          {status.agent_id.slice(0, 24)}…
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                    <KpiCard label="Passed" icon={<CheckCircle2 size={20} />} color="#10b981"
                      value={score?.passed ?? checks.filter(c => c.status === "pass").length}
                      sub={`of ${score?.total ?? checks.length} checks`} />
                    <KpiCard label="Failed" icon={<XCircle size={20} />} color="#ef4444"
                      value={score?.failed ?? checks.filter(c => c.status === "fail").length}
                      sub={score?.critical_failures ? `${score.critical_failures} critical` : undefined} />
                    <KpiCard label="Warnings" icon={<AlertTriangle size={20} />} color="#eab308"
                      value={score?.warned ?? checks.filter(c => c.status === "warn").length}
                      sub="need attention" />
                    <KpiCard label="Uptime" icon={<Activity size={20} />} color="#818cf8"
                      value={formatUptime(status.uptime_secs)}
                      sub={status.active_threats ? `${status.active_threats} active threats` : "no threats"} />
                  </div>
                </div>

                {/* Categories */}
                {categories.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-slate-600 font-semibold mb-3">
                      Check Categories
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                      {categories.map(cat => <CategoryCard key={cat.name} cat={cat} />)}
                    </div>
                  </div>
                )}

                {/* Resources */}
                {(inv?.memory_usage_pct != null || inv?.cpu_usage_pct != null) && (
                  <div className="glass-card p-5">
                    <div className="text-[10px] uppercase tracking-widest text-slate-600 font-semibold mb-4">
                      Resource Usage
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      {inv?.memory_usage_pct != null && (
                        <ResourceBar label="Memory" pct={inv.memory_usage_pct}
                          icon={<MemoryStick size={15} />} color="#818cf8" />
                      )}
                      {inv?.cpu_usage_pct != null && (
                        <ResourceBar label="CPU" pct={inv.cpu_usage_pct}
                          icon={<Cpu size={15} />} color="#06b6d4" />
                      )}
                    </div>
                    {inv?.hardware && (
                      <div className="mt-4 pt-4 border-t border-white/[0.05] grid grid-cols-3 gap-3 text-xs text-slate-500">
                        <div><span className="text-slate-600 block text-[10px]">CPU</span>
                          <span className="text-slate-300 font-medium">{inv.hardware.cpu || "—"}</span></div>
                        <div><span className="text-slate-600 block text-[10px]">RAM</span>
                          <span className="text-slate-300 font-medium">{inv.hardware.ram_gb.toFixed(1)} GB</span></div>
                        <div><span className="text-slate-600 block text-[10px]">Disk</span>
                          <span className="text-slate-300 font-medium">{inv.hardware.disk_gb.toFixed(0)} GB</span></div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ══ CHECKS ══ */}
            {tab === "checks" && (
              <div className="glass-card overflow-hidden">
                <div className="px-5 py-4 border-b border-white/[0.05] flex flex-wrap items-center gap-3">
                  <input type="text" placeholder="Search checks…" value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="flex-1 min-w-[150px] bg-white/[0.04] border border-white/[0.07] rounded-lg px-3 py-1.5 text-xs text-slate-300 placeholder-slate-700 outline-none focus:border-blue-500/40 transition-colors" />
                  <div className="flex gap-1">
                    {(["all","fail","warn","pass","skip"] as FilterStatus[]).map(f => (
                      <button key={f} onClick={() => setFilterStatus(f)}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all ${
                          filterStatus === f
                            ? (f === "all" ? "bg-blue-500/15 text-blue-300 border border-blue-500/25" : chipCls(f))
                            : "text-slate-600 hover:text-slate-400"
                        }`}>
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="px-5 py-2 border-b border-white/[0.03]">
                  <span className="text-[10px] text-slate-700">{filteredChecks.length} of {checks.length} checks</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/[0.05]">
                        {["Check","Category","Severity","Status",""].map((h,i) => (
                          <th key={i} className={`text-left py-2.5 px-4 text-[10px] font-semibold text-slate-600 uppercase tracking-widest ${
                            i === 1 ? "hidden sm:table-cell" : i === 2 ? "hidden md:table-cell" : ""
                          }`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredChecks.length === 0
                        ? <tr><td colSpan={5} className="py-16 text-center text-xs text-slate-700">
                            No checks match
                          </td></tr>
                        : filteredChecks.map(c => <CheckRow key={c.id} check={c} />)
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ══ POLICY TAB ══ */}
            {tab === "policy" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                {/* Password Policy */}
                <div className="glass-card p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Key size={15} style={{ color: "#c4b5fd" }} />
                    <span className="text-sm font-semibold text-slate-200">Password Policy</span>
                  </div>
                  {inv ? (
                    <div className="space-y-2">
                      <PolicyRow label="Minimum Length" target="≥ 12 characters required"
                        value={inv.password_min_length != null ? `${inv.password_min_length} chars` : "—"}
                        pass={inv.password_min_length != null && inv.password_min_length >= 12}
                        unknown={inv.password_min_length == null} />
                      <PolicyRow label="Complexity Rules" target="Upper + lower + digit + special"
                        value={inv.password_complexity_enabled == null ? "—"
                          : inv.password_complexity_enabled
                            ? (inv.password_min_classes != null ? `${inv.password_min_classes} classes` : "Enabled")
                            : "Disabled"}
                        pass={inv.password_complexity_enabled === true}
                        unknown={inv.password_complexity_enabled == null} />
                      <PolicyRow label="Maximum Age" target="≤ 90 days rotation"
                        value={inv.password_max_age_days != null ? `${inv.password_max_age_days} days` : "—"}
                        pass={inv.password_max_age_days != null && inv.password_max_age_days <= 90}
                        unknown={inv.password_max_age_days == null} />
                    </div>
                  ) : <div className="space-y-2">{[...Array(3)].map((_,i) => <Skel key={i} h="52px"/>)}</div>}
                </div>

                {/* Screen Lock */}
                <div className="glass-card p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Lock size={15} style={{ color: "#93c5fd" }} />
                    <span className="text-sm font-semibold text-slate-200">Screen Lock</span>
                  </div>
                  {inv ? (
                    <div className="space-y-2">
                      <PolicyRow label="Screen Lock Enabled" target="Required"
                        value={inv.screen_lock_enabled == null ? "—" : inv.screen_lock_enabled ? "Enabled" : "Disabled"}
                        pass={inv.screen_lock_enabled === true}
                        unknown={inv.screen_lock_enabled == null} />
                      <PolicyRow label="Idle Timeout" target="≤ 15 min (900 s)"
                        value={inv.screen_lock_timeout_secs == null ? "—"
                          : inv.screen_lock_timeout_secs === 0 ? "Always on"
                            : `${inv.screen_lock_timeout_secs}s (${(inv.screen_lock_timeout_secs/60).toFixed(0)} min)`}
                        pass={inv.screen_lock_timeout_secs != null && inv.screen_lock_timeout_secs > 0 && inv.screen_lock_timeout_secs <= 900}
                        unknown={inv.screen_lock_timeout_secs == null} />
                    </div>
                  ) : <div className="space-y-2">{[...Array(2)].map((_,i) => <Skel key={i} h="52px"/>)}</div>}
                </div>

                {/* Encryption */}
                <div className="glass-card p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <HardDrive size={15} style={{ color: "#fca5a5" }} />
                    <span className="text-sm font-semibold text-slate-200">Disk Encryption</span>
                  </div>
                  {inv ? (
                    <div className="space-y-2">
                      <div className="glass-inner p-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {inv.encryption_status === "enabled"
                            ? <CheckCircle2 size={14} style={{ color: "#6ee7b7" }} />
                            : inv.encryption_status === "disabled"
                              ? <XCircle size={14} style={{ color: "#fca5a5" }} />
                              : <MinusCircle size={14} style={{ color: "#475569" }} />}
                          <div>
                            <div className="text-xs font-semibold text-slate-300">Full-Disk Encryption</div>
                            <div className="text-[10px] text-slate-600">BitLocker / FileVault / LUKS</div>
                          </div>
                        </div>
                        <div className={`text-sm font-bold ${
                          inv.encryption_status === "enabled" ? "text-emerald-400"
                          : inv.encryption_status === "disabled" ? "text-red-400" : "text-slate-600"}`}>
                          {(inv.encryption_status ?? "unknown").charAt(0).toUpperCase() + (inv.encryption_status ?? "unknown").slice(1)}
                        </div>
                      </div>
                      {(inv.encryption_volumes ?? []).filter(v => v.method).map((vol, i) => (
                        <div key={i} className="glass-inner p-2.5 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <HardDrive size={11} style={{ color: "#93c5fd" }} />
                            <span className="text-[10px] font-mono text-slate-500">{vol.path}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {vol.method && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                                style={{ background:"rgba(59,130,246,.1)", color:"#93c5fd", border:"1px solid rgba(59,130,246,.2)" }}>
                                {vol.method}
                              </span>
                            )}
                            <span className={`text-[10px] font-bold ${vol.status === "enabled" ? "text-emerald-400" : "text-red-400"}`}>
                              {vol.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <Skel h="80px" />}
                </div>

                {/* Azure AD */}
                <div className="glass-card p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Cloud size={15} style={{ color: "#67e8f9" }} />
                    <span className="text-sm font-semibold text-slate-200">Azure AD / Entra ID</span>
                  </div>
                  {inv ? (
                    !inv.azure_ad_device_id ? (
                      <div className="glass-inner p-5 text-center">
                        <Cloud size={24} style={{ color: "#1e293b" }} className="mx-auto mb-2" />
                        <div className="text-xs text-slate-600">Not configured</div>
                        <div className="text-[10px] text-slate-700 mt-0.5">Set GRC_AZURE_DEVICE_ID to enable</div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="glass-inner p-3">
                          <div className="text-[10px] text-slate-600 uppercase tracking-widest font-semibold mb-1">Device ID</div>
                          <div className="text-[10px] font-mono text-slate-400 break-all">{inv.azure_ad_device_id}</div>
                        </div>
                        <PolicyRow label="AD Registration" target="Device enrolled in Entra ID"
                          value={inv.azure_ad_registered ? "Registered" : "Not Registered"}
                          pass={inv.azure_ad_registered === true}
                          unknown={inv.azure_ad_registered == null} />
                        <PolicyRow label="CA Compliance" target="Meets Conditional Access policy"
                          value={inv.azure_ad_compliant == null ? "—" : inv.azure_ad_compliant ? "Compliant" : "Non-Compliant"}
                          pass={inv.azure_ad_compliant === true}
                          unknown={inv.azure_ad_compliant == null} />
                      </div>
                    )
                  ) : <Skel h="80px" />}
                </div>
              </div>
            )}

            {/* ══ SYSTEM TAB ══ */}
            {tab === "system" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="glass-card p-5">
                  <div className="text-[10px] uppercase tracking-widest text-slate-600 font-semibold mb-4">Operating System</div>
                  <dl className="space-y-2.5">
                    {([
                      ["Hostname", inv?.hostname],
                      ["OS", inv?.os?.name],
                      ["Version", inv?.os?.version],
                      ["Kernel", inv?.os?.patch_level],
                      ["Platform", inv?.platform],
                      ["Architecture", inv?.arch],
                    ] as [string, string | undefined][]).filter(([,v]) => v).map(([k,v]) => (
                      <div key={k} className="flex justify-between text-xs">
                        <span className="text-slate-600">{k}</span>
                        <span className="text-slate-300 font-medium font-mono truncate max-w-[55%]">{v}</span>
                      </div>
                    ))}
                  </dl>
                </div>

                <div className="glass-card p-5">
                  <div className="text-[10px] uppercase tracking-widest text-slate-600 font-semibold mb-4">Network</div>
                  <dl className="space-y-2.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-600">Firewall</span>
                      <span className={`font-semibold ${inv?.firewall_enabled == null ? "text-slate-700" : inv.firewall_enabled ? "text-emerald-400" : "text-red-400"}`}>
                        {inv?.firewall_enabled == null ? "—" : inv.firewall_enabled ? "Active" : "Disabled"}
                      </span>
                    </div>
                    {(inv?.ip_addresses ?? []).map((ip, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-slate-600">{i === 0 ? "IP Address" : ""}</span>
                        <span className="text-slate-300 font-mono">{ip}</span>
                      </div>
                    ))}
                  </dl>
                </div>

                <div className="glass-card p-5 md:col-span-2">
                  <div className="text-[10px] uppercase tracking-widest text-slate-600 font-semibold mb-4">Agent</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    {[
                      ["Version", `v${status.version}`],
                      ["Health", status.health],
                      ["Uptime", formatUptime(status.uptime_secs)],
                      ["Threats", String(status.active_threats)],
                    ].map(([k,v]) => (
                      <div key={k} className="glass-inner p-3 text-center">
                        <div className="text-[10px] text-slate-600 uppercase tracking-wide">{k}</div>
                        <div className="text-sm font-bold text-slate-200 mt-1">{v}</div>
                      </div>
                    ))}
                  </div>
                  {status.agent_id && (
                    <div className="glass-inner px-3 py-2">
                      <div className="text-[10px] text-slate-600 uppercase tracking-widest font-semibold mb-0.5">Agent ID</div>
                      <div className="font-mono text-xs text-slate-500 break-all">{status.agent_id}</div>
                    </div>
                  )}
                  {status.last_collection && (
                    <div className="flex items-center gap-1.5 mt-3 text-[10px] text-slate-700">
                      <Clock size={10} />
                      Last collection: {new Date(status.last_collection).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        ) : null}

        <footer className="text-center py-4">
          <p className="text-[10px] text-slate-800">
            AIGO-X Agent {status ? `v${status.version}` : ""} ·{" "}
            <a href="https://github.com/grcshield/grc-agent" target="_blank" rel="noreferrer"
              className="hover:text-slate-600 inline-flex items-center gap-0.5">
              GitHub <ExternalLink size={9} />
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}
