// @ts-nocheck
import { useState, useEffect, useMemo, useCallback } from "react";
import { Drawer, Field, DrawerSection } from "@/components/Drawer";
import { useLicense } from "@/context/LicenseContext";

function apiUrl(path: string) {
  const base = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
  return `${base.replace("/grc-platform", "")}/api${path}`;
}
function tok() { return localStorage.getItem("grc_token") ?? ""; }
function H() { return { "Content-Type": "application/json", Authorization: `Bearer ${tok()}` }; }

const C = {
  bg:"var(--card)", bg2:"var(--input)", bg3:"var(--secondary)",
  border:"var(--border)", border2:"rgba(255,255,255,0.14)",
  text:"var(--foreground)", accent:"rgb(147,197,253)", muted:"var(--muted-foreground)",
  green:"#34D399", warn:"#FBBF24", danger:"#F87171", purple:"#A78BFA",
};
const card: React.CSSProperties = {
  background: C.bg, border: `1px solid ${C.border}`,
  borderRadius: 12, padding: "16px 20px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)",
};
const INP: React.CSSProperties = {
  padding: "7px 11px", background: C.bg2, border: `1px solid rgba(255,255,255,0.12)`,
  borderRadius: 8, color: C.text, fontSize: 12, fontFamily: "inherit", outline: "none",
};
const BTN = (color = C.accent, bg = "rgba(147,197,253,0.08)", border = "rgba(147,197,253,0.25)"): React.CSSProperties => ({
  padding: "6px 14px", background: bg, border: `1px solid ${border}`,
  borderRadius: 7, color, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit",
});

const CATEGORY_COLORS: Record<string, string> = {
  "ISO":                  "#3B82F6",
  "NIST":                 "#0EA5E9",
  "SOC":                  "#8B5CF6",
  "Healthcare":           "#10B981",
  "PCI DSS":              "#EF4444",
  "Financial":            "#F59E0B",
  "Privacy":              "#EC4899",
  "EU Regulatory":        "#A78BFA",
  "Cloud":                "#06B6D4",
  "Defense":              "#64748B",
  "Regional Financial":   "#D97706",
  "Industry":             "#059669",
  "AI":                   "#7C3AED",
};

const ALL_CATEGORIES = ["All", "ISO", "NIST", "SOC", "Healthcare", "PCI DSS", "Financial",
  "Privacy", "EU Regulatory", "Cloud", "Defense", "Regional Financial", "Industry", "AI"];
const ALL_REGIONS = ["All", "Global", "US", "EU", "UK", "APAC", "MENA", "Africa", "LatAm"];
const ALL_STATUSES = ["All", "Active", "Beta", "Inactive"];

function categoryColor(cat: string) {
  return CATEGORY_COLORS[cat] ?? "#64748B";
}

type Framework = {
  id: number; shortCode: string; name: string; version: string;
  category: string; region: string; controlsCount: number;
  isActive: boolean; isBeta: boolean; description: string;
  createdAt: string; tenantCount: number;
};

type FrameworkDetail = Framework & {
  controls: Array<{
    id: number; controlRef: string; domain: string; title: string;
    description: string; requirementText: string; crosswalkRefs: string[];
  }>;
};

type TenantRecord = {
  tenantId: number; tenantName: string; tenantSlug: string;
  plan: string; assignedAt: string; assignedBy: string; status: string;
};

type CrosswalkRow = {
  controlRef: string; domain: string; title: string; frameworkCount: number; crosswalkRefs: string[];
};

// ── Donut chart ───────────────────────────────────────────────────────────────
function Donut({ data, size = 80 }: { data: Array<{ label: string; value: number; color: string }>; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div style={{ width: size, height: size, background: C.bg2, borderRadius: "50%", border: `1px solid ${C.border}` }} />;
  const cx = size / 2;
  const r = size / 2 - 6;
  const stroke = 12;
  let cumAngle = -Math.PI / 2;
  const arcs = data.map(d => {
    const angle = (d.value / total) * 2 * Math.PI;
    const x1 = cx + r * Math.cos(cumAngle);
    const y1 = cx + r * Math.sin(cumAngle);
    cumAngle += angle;
    const x2 = cx + r * Math.cos(cumAngle);
    const y2 = cx + r * Math.sin(cumAngle);
    const largeArc = angle > Math.PI ? 1 : 0;
    return { d: `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`, color: d.color, label: d.label, value: d.value };
  });
  return (
    <svg width={size} height={size}>
      {arcs.map((a, i) => (
        <path key={i} d={a.d} fill="none" stroke={a.color} strokeWidth={stroke} strokeLinecap="round" />
      ))}
      <text x={cx} y={cx + 1} textAnchor="middle" dominantBaseline="middle" fontSize="11" fontWeight="700" fill={C.text}>{total}</text>
      <text x={cx} y={cx + 12} textAnchor="middle" dominantBaseline="middle" fontSize="7" fill={C.muted}>controls</text>
    </svg>
  );
}

// ── Framework card ────────────────────────────────────────────────────────────
function FrameworkCard({ fw, onSelect, onToggleActive, isLocked }: {
  fw: Framework;
  onSelect: (fw: Framework) => void;
  onToggleActive: (fw: Framework, e: React.MouseEvent) => void;
  isLocked?: boolean;
}) {
  const cc = categoryColor(fw.category);
  return (
    <div
      onClick={() => !isLocked && onSelect(fw)}
      style={{
        ...card, padding: "14px 16px", cursor: isLocked ? "not-allowed" : "pointer", position: "relative",
        overflow: "hidden", transition: "border-color 0.15s, transform 0.1s",
        borderColor: fw.isActive ? C.border : "rgba(148,163,184,0.15)",
        opacity: isLocked ? 0.5 : (fw.isActive ? 1 : 0.65),
      }}
      onMouseEnter={e => { if (!isLocked) { (e.currentTarget as HTMLDivElement).style.borderColor = `${cc}55`; (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)"; } }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = fw.isActive ? C.border : "rgba(148,163,184,0.15)"; (e.currentTarget as HTMLDivElement).style.transform = ""; }}
    >
      {/* Top accent bar */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: isLocked ? "#4B5563" : cc, borderRadius: "12px 12px 0 0" }} />

      {/* Lock badge */}
      {isLocked && (
        <div style={{ position: "absolute", top: 10, right: 10, fontSize: 12, color: "#9CA3AF" }}>🔒</div>
      )}

      {/* Beta ribbon */}
      {!isLocked && fw.isBeta && (
        <div style={{ position: "absolute", top: 10, right: -18, background: "#7C3AED", color: "white", fontSize: 8, fontWeight: 800, padding: "2px 20px", transform: "rotate(45deg)", letterSpacing: "0.5px" }}>BETA</div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, paddingTop: 4 }}>
        <div style={{ background: `${cc}18`, border: `1px solid ${cc}40`, borderRadius: 6, padding: "2px 8px", fontSize: 9, fontWeight: 800, color: cc, fontFamily: "'JetBrains Mono', monospace" }}>
          {fw.shortCode}
        </div>
        <div onClick={e => onToggleActive(fw, e)} style={{ cursor: "pointer" }}>
          <div style={{
            width: 30, height: 16, borderRadius: 8, transition: "background 0.2s",
            background: fw.isActive ? C.green : "rgba(148,163,184,0.3)",
            position: "relative",
          }}>
            <div style={{
              position: "absolute", top: 2, left: fw.isActive ? 16 : 2,
              width: 12, height: 12, borderRadius: "50%", background: "white",
              transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
            }} />
          </div>
        </div>
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: C.text, lineHeight: 1.35, marginBottom: 6 }}>{fw.name}</div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        <span style={{ background: `${cc}14`, border: `1px solid ${cc}35`, color: cc, borderRadius: 4, padding: "1px 7px", fontSize: 9, fontWeight: 700 }}>{fw.category}</span>
        <span style={{ background: C.bg2, border: `1px solid ${C.border}`, color: C.muted, borderRadius: 4, padding: "1px 7px", fontSize: 9, fontWeight: 600 }}>{fw.region}</span>
        <span style={{ background: C.bg2, border: `1px solid ${C.border}`, color: C.muted, borderRadius: 4, padding: "1px 7px", fontSize: 9, fontWeight: 600 }}>v{fw.version}</span>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.muted }}>
        <span>{fw.controlsCount > 0 ? `${fw.controlsCount} controls` : "No controls yet"}</span>
        {fw.tenantCount > 0 && <span style={{ color: C.green }}>✓ {fw.tenantCount} tenant{fw.tenantCount !== 1 ? "s" : ""}</span>}
      </div>
    </div>
  );
}

// ── Main FrameworkLibrary component ──────────────────────────────────────────
export default function FrameworkLibrary() {
  const { isSuperAdmin, isViewingOwnTenant, isFrameworkLicensed, rawFrameworkIds } = useLicense();
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [stats, setStats] = useState({ total: 0, active: 0, beta: 0, assigned: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("All");
  const [regionFilter, setRegionFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedFw, setSelectedFw] = useState<FrameworkDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerTab, setDrawerTab] = useState("overview");
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(false);
  const [allTenants, setAllTenants] = useState<Array<{ id: number; name: string; plan: string }>>([]);
  const [assignTenantIds, setAssignTenantIds] = useState<number[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [assignMsg, setAssignMsg] = useState("");
  const [crosswalk, setCrosswalk] = useState<CrosswalkRow[]>([]);
  const [showCrosswalk, setShowCrosswalk] = useState(false);
  const [crosswalkLoading, setCrosswalkLoading] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [importing, setImporting] = useState(false);
  const [controlSearch, setControlSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "300" });
    if (search) params.set("search", search);
    if (catFilter !== "All") params.set("category", catFilter);
    if (regionFilter !== "All") params.set("region", regionFilter);
    if (statusFilter !== "All") params.set("status", statusFilter.toLowerCase());
    const r = await fetch(apiUrl(`/admin/frameworks?${params}`), { headers: H() }).catch(() => null);
    if (r?.ok) {
      const json = await r.json();
      setFrameworks(json.data ?? []);
      setStats(json.stats ?? { total: 0, active: 0, beta: 0, assigned: 0 });
    }
    setLoading(false);
  }, [search, catFilter, regionFilter, statusFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch(apiUrl("/tenants"), { headers: H() }).then(r => r.ok ? r.json() : []).then(data => {
      setAllTenants(Array.isArray(data) ? data.map((t: any) => ({ id: t.id, name: t.name, plan: t.plan })) : []);
    }).catch(() => {});
  }, []);

  const openDetail = useCallback(async (fw: Framework) => {
    setSelectedFw(null);
    setDrawerLoading(true);
    setDrawerTab("overview");
    setAssignMsg("");
    setImportMsg("");
    setControlSearch("");
    const r = await fetch(apiUrl(`/admin/frameworks/${fw.id}`), { headers: H() }).catch(() => null);
    if (r?.ok) {
      setSelectedFw(await r.json());
    }
    setDrawerLoading(false);

    // Load tenants for this framework
    setTenantsLoading(true);
    const tr = await fetch(apiUrl(`/admin/frameworks/${fw.id}/tenants`), { headers: H() }).catch(() => null);
    if (tr?.ok) setTenants(await tr.json());
    setTenantsLoading(false);
  }, []);

  const toggleActive = useCallback(async (fw: Framework, e: React.MouseEvent) => {
    e.stopPropagation();
    const r = await fetch(apiUrl(`/admin/frameworks/${fw.id}`), {
      method: "PATCH", headers: H(),
      body: JSON.stringify({ isActive: !fw.isActive }),
    }).catch(() => null);
    if (r?.ok) {
      setFrameworks(prev => prev.map(f => f.id === fw.id ? { ...f, isActive: !f.isActive } : f));
      if (selectedFw?.id === fw.id) setSelectedFw(prev => prev ? { ...prev, isActive: !prev.isActive } : null);
    }
  }, [selectedFw]);

  const handleAssign = useCallback(async () => {
    if (!selectedFw || assignTenantIds.length === 0) return;
    setAssigning(true); setAssignMsg("");
    const r = await fetch(apiUrl(`/admin/frameworks/${selectedFw.id}/tenants`), {
      method: "POST", headers: H(),
      body: JSON.stringify({ tenantIds: assignTenantIds }),
    }).catch(() => null);
    if (r?.ok) {
      const data = await r.json();
      setAssignMsg(`✓ Assigned to ${data.assigned} tenant(s). Controls injected.`);
      setAssignTenantIds([]);
      // Refresh tenants list
      const tr = await fetch(apiUrl(`/admin/frameworks/${selectedFw.id}/tenants`), { headers: H() }).catch(() => null);
      if (tr?.ok) setTenants(await tr.json());
      load();
    } else {
      setAssignMsg("✗ Assignment failed — check server logs.");
    }
    setAssigning(false);
  }, [selectedFw, assignTenantIds, load]);

  const handleRemoveTenant = useCallback(async (tenantId: number) => {
    if (!selectedFw) return;
    const r = await fetch(apiUrl(`/admin/frameworks/${selectedFw.id}/tenants/${tenantId}`), {
      method: "DELETE", headers: H(),
    }).catch(() => null);
    if (r?.ok) {
      setTenants(prev => prev.filter(t => t.tenantId !== tenantId));
      load();
    }
  }, [selectedFw, load]);

  const handleImport = useCallback(async () => {
    if (!selectedFw || !importJson.trim()) return;
    setImporting(true); setImportMsg("");
    try {
      const controls = JSON.parse(importJson);
      const r = await fetch(apiUrl(`/admin/frameworks/${selectedFw.id}/controls/import`), {
        method: "POST", headers: H(),
        body: JSON.stringify(controls),
      }).catch(() => null);
      if (r?.ok) {
        const data = await r.json();
        setImportMsg(`✓ Imported ${data.imported} controls.`);
        setImportJson("");
        // Reload detail
        const dr = await fetch(apiUrl(`/admin/frameworks/${selectedFw.id}`), { headers: H() }).catch(() => null);
        if (dr?.ok) setSelectedFw(await dr.json());
        load();
      } else {
        setImportMsg("✗ Import failed.");
      }
    } catch {
      setImportMsg("✗ Invalid JSON.");
    }
    setImporting(false);
  }, [selectedFw, importJson, load]);

  const loadCrosswalk = useCallback(async () => {
    setCrosswalkLoading(true);
    const r = await fetch(apiUrl("/admin/frameworks/crosswalk"), { headers: H() }).catch(() => null);
    if (r?.ok) setCrosswalk(await r.json());
    setCrosswalkLoading(false);
    setShowCrosswalk(true);
  }, []);

  const filteredControls = useMemo(() => {
    if (!selectedFw) return [];
    if (!controlSearch) return selectedFw.controls;
    const q = controlSearch.toLowerCase();
    return selectedFw.controls.filter(c =>
      c.controlRef.toLowerCase().includes(q) || c.title.toLowerCase().includes(q) || c.domain.toLowerCase().includes(q)
    );
  }, [selectedFw, controlSearch]);

  // Domain breakdown for donut
  const domainCounts = useMemo(() => {
    if (!selectedFw?.controls.length) return [];
    const map: Record<string, number> = {};
    selectedFw.controls.forEach(c => { map[c.domain] = (map[c.domain] ?? 0) + 1; });
    const colors = ["#3B82F6","#10B981","#8B5CF6","#EF4444","#F59E0B","#06B6D4","#EC4899","#64748B"];
    return Object.entries(map).map(([label, value], i) => ({ label, value, color: colors[i % colors.length]! }));
  }, [selectedFw]);

  const unassignedTenants = useMemo(() => {
    const assignedIds = new Set(tenants.map(t => t.tenantId));
    return allTenants.filter(t => !assignedIds.has(t.id));
  }, [allTenants, tenants]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Stats bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { label: "Total Frameworks", value: stats.total || frameworks.length, color: C.accent, border: "#BFDBFE" },
          { label: "Active",           value: stats.active,                       color: C.green,  border: "rgba(52,211,153,0.3)" },
          { label: "Beta / Preview",   value: stats.beta,                         color: C.purple, border: "rgba(167,139,250,0.3)" },
          { label: "Tenant Activations",value: stats.assigned,                    color: C.warn,   border: "rgba(251,191,36,0.3)" },
        ].map(k => (
          <div key={k.label} style={{ ...card, borderColor: k.border, position: "relative", overflow: "hidden", padding: "12px 16px" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: k.color, opacity: 0.7, borderRadius: "12px 12px 0 0" }} />
            <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Search + filters */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input style={{ ...INP, flex: 1, minWidth: 200 }} placeholder="Search frameworks, categories, codes…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <select style={INP} value={catFilter} onChange={e => setCatFilter(e.target.value)}>
          {ALL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select style={INP} value={regionFilter} onChange={e => setRegionFilter(e.target.value)}>
          {ALL_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select style={INP} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={loadCrosswalk} style={BTN(C.purple, "rgba(167,139,250,0.08)", "rgba(167,139,250,0.3)")}>⤢ Crosswalk</button>
        <span style={{ fontSize: 11, color: C.muted, whiteSpace: "nowrap" }}>{frameworks.length} shown</span>
      </div>

      {/* Category legend */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
          <button key={cat} onClick={() => setCatFilter(catFilter === cat ? "All" : cat)} style={{
            padding: "2px 10px", borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            background: catFilter === cat ? `${color}22` : "transparent",
            border: `1px solid ${catFilter === cat ? color : "rgba(148,163,184,0.2)"}`,
            color: catFilter === cat ? color : C.muted,
          }}>{cat}</button>
        ))}
      </div>

      {/* Loading state */}
      {loading && (
        <div style={{ textAlign: "center", padding: "40px 0", color: C.muted, fontSize: 13 }}>Loading framework library…</div>
      )}

      {/* Framework grid */}
      {!loading && frameworks.length === 0 && (
        <div style={{ ...card, textAlign: "center", padding: "48px 24px" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📚</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6 }}>No frameworks found</div>
          <div style={{ fontSize: 12, color: C.muted }}>Try clearing filters or wait for the library to seed on first server start.</div>
        </div>
      )}

      {!loading && frameworks.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
          {frameworks
            .filter(fw => isSuperAdmin || isFrameworkLicensed(fw.id))
            .map(fw => (
              <FrameworkCard key={fw.id} fw={fw} onSelect={openDetail} onToggleActive={toggleActive}
                isLocked={!rawFrameworkIds.includes(fw.id)} />
            ))}
        </div>
      )}

      {/* ── Framework Detail Drawer ──────────────────────────────────────────── */}
      {(selectedFw || drawerLoading) && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex" }}>
          <div style={{ flex: 1, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(3px)" }}
            onClick={() => setSelectedFw(null)} />
          <div style={{
            width: 620, background: "var(--card)", border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "-8px 0 48px rgba(0,0,0,0.6)", display: "flex", flexDirection: "column",
            overflow: "hidden", animation: "slideIn 0.2s ease",
          }}>
            <style>{`@keyframes slideIn { from { transform: translateX(40px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>

            {/* Drawer header */}
            <div style={{ background: selectedFw ? categoryColor(selectedFw.category) + "33" : "#1E3A5F",
              borderBottom: `1px solid ${selectedFw ? categoryColor(selectedFw.category) + "44" : "rgba(255,255,255,0.1)"}`,
              padding: "18px 24px", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div>
                {drawerLoading && <div style={{ fontSize: 14, color: C.muted }}>Loading…</div>}
                {selectedFw && (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                      <span style={{ background: `${categoryColor(selectedFw.category)}22`, border: `1px solid ${categoryColor(selectedFw.category)}55`, color: categoryColor(selectedFw.category), borderRadius: 5, padding: "2px 8px", fontSize: 10, fontWeight: 800, fontFamily: "monospace" }}>{selectedFw.shortCode}</span>
                      {selectedFw.isBeta && <span style={{ background: "rgba(124,58,237,0.18)", color: C.purple, border: "1px solid rgba(167,139,250,0.4)", borderRadius: 4, padding: "1px 7px", fontSize: 9, fontWeight: 700 }}>BETA</span>}
                      {!selectedFw.isActive && <span style={{ background: "rgba(148,163,184,0.1)", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 4, padding: "1px 7px", fontSize: 9, fontWeight: 700 }}>INACTIVE</span>}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "white", lineHeight: 1.3 }}>{selectedFw.name}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", marginTop: 3 }}>{selectedFw.category} · {selectedFw.region} · v{selectedFw.version}</div>
                  </>
                )}
              </div>
              <button onClick={() => setSelectedFw(null)} style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 6, width: 28, height: 28, cursor: "pointer", color: "white", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit", flexShrink: 0 }}>×</button>
            </div>

            {/* Drawer tabs */}
            {selectedFw && (
              <>
                <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${C.border}`, background: C.bg, flexShrink: 0 }}>
                  {[
                    { key: "overview", label: "Overview" },
                    { key: "controls", label: `Controls (${selectedFw.controls.length})` },
                    { key: "tenants",  label: `Tenants (${tenants.length})` },
                    { key: "import",   label: "Import Controls" },
                  ].map(t => (
                    <button key={t.key} onClick={() => setDrawerTab(t.key)} style={{
                      padding: "10px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                      background: "none", border: "none",
                      borderBottom: `2px solid ${drawerTab === t.key ? C.accent : "transparent"}`,
                      color: drawerTab === t.key ? C.accent : C.muted,
                      whiteSpace: "nowrap",
                    }}>{t.label}</button>
                  ))}
                </div>

                <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>

                  {/* OVERVIEW TAB */}
                  {drawerTab === "overview" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      {selectedFw.description && (
                        <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px", fontSize: 12, color: C.text, lineHeight: 1.6 }}>
                          {selectedFw.description}
                        </div>
                      )}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        {[
                          { label: "Short Code", value: selectedFw.shortCode },
                          { label: "Category", value: selectedFw.category },
                          { label: "Region", value: selectedFw.region },
                          { label: "Version", value: selectedFw.version },
                          { label: "Controls", value: selectedFw.controlsCount > 0 ? `${selectedFw.controlsCount} master controls` : "No controls imported yet" },
                          { label: "Status", value: selectedFw.isActive ? (selectedFw.isBeta ? "Beta / Preview" : "Active / GA") : "Inactive" },
                        ].map(f => (
                          <div key={f.label} style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px" }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 3 }}>{f.label}</div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{f.value}</div>
                          </div>
                        ))}
                      </div>

                      {selectedFw.controls.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>Controls by Domain</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                            <Donut data={domainCounts} size={100} />
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              {domainCounts.map(d => (
                                <div key={d.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: d.color, flexShrink: 0 }} />
                                  <span style={{ fontSize: 11, color: C.text }}>{d.label}</span>
                                  <span style={{ fontSize: 11, fontFamily: "monospace", color: C.muted, marginLeft: "auto" }}>{d.value}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Active toggle */}
                      <div style={{ display: "flex", gap: 10 }}>
                        <button onClick={e => toggleActive(selectedFw, e)} style={BTN(
                          selectedFw.isActive ? C.danger : C.green,
                          selectedFw.isActive ? "rgba(239,68,68,0.08)" : "rgba(52,211,153,0.08)",
                          selectedFw.isActive ? "rgba(239,68,68,0.3)" : "rgba(52,211,153,0.3)",
                        )}>
                          {selectedFw.isActive ? "⏸ Deactivate Framework" : "▶ Activate Framework"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* CONTROLS TAB */}
                  {drawerTab === "controls" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <input style={{ ...INP, width: "100%", boxSizing: "border-box" }}
                        placeholder="Search by ref, domain, or title…"
                        value={controlSearch} onChange={e => setControlSearch(e.target.value)} />

                      {filteredControls.length === 0 && (
                        <div style={{ textAlign: "center", padding: "32px 0", color: C.muted, fontSize: 12 }}>
                          {selectedFw.controls.length === 0
                            ? "No controls imported yet. Use the Import Controls tab to bulk-load controls."
                            : "No controls match the search."}
                        </div>
                      )}

                      {filteredControls.map(c => (
                        <div key={c.id} style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <span style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700, background: `${categoryColor(selectedFw.category)}18`, color: categoryColor(selectedFw.category), border: `1px solid ${categoryColor(selectedFw.category)}35`, borderRadius: 4, padding: "1px 7px" }}>{c.controlRef}</span>
                            <span style={{ fontSize: 10, color: C.muted, background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 4, padding: "1px 6px" }}>{c.domain}</span>
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: c.description ? 4 : 0 }}>{c.title}</div>
                          {c.description && <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{c.description}</div>}
                          {c.crosswalkRefs?.length > 0 && (
                            <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
                              {(c.crosswalkRefs as string[]).map((ref: string) => (
                                <span key={ref} style={{ fontSize: 9, color: C.purple, background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.25)", borderRadius: 4, padding: "1px 6px" }}>⤢ {ref}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* TENANTS TAB */}
                  {drawerTab === "tenants" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {/* Assign new tenants */}
                      <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, marginBottom: 10 }}>+ Assign to Tenants</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 160, overflow: "auto", marginBottom: 10 }}>
                          {unassignedTenants.length === 0 ? (
                            <div style={{ fontSize: 11, color: C.muted }}>All tenants already have this framework assigned.</div>
                          ) : unassignedTenants.map(t => (
                            <label key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "4px 0" }}>
                              <input type="checkbox" checked={assignTenantIds.includes(t.id)}
                                onChange={e => setAssignTenantIds(prev => e.target.checked ? [...prev, t.id] : prev.filter(id => id !== t.id))}
                                style={{ accentColor: C.accent }} />
                              <span style={{ fontSize: 12, color: C.text }}>{t.name}</span>
                              <span style={{ fontSize: 10, color: C.muted, marginLeft: "auto" }}>{t.plan}</span>
                            </label>
                          ))}
                        </div>
                        {assignMsg && <div style={{ fontSize: 11, color: assignMsg.startsWith("✓") ? C.green : C.danger, marginBottom: 8 }}>{assignMsg}</div>}
                        <button onClick={handleAssign} disabled={assigning || assignTenantIds.length === 0} style={{
                          ...BTN(C.green, "rgba(52,211,153,0.1)", "rgba(52,211,153,0.3)"),
                          opacity: assigning || assignTenantIds.length === 0 ? 0.5 : 1,
                        }}>{assigning ? "Assigning…" : `Assign to ${assignTenantIds.length || ""} tenant${assignTenantIds.length !== 1 ? "s" : ""}`}</button>
                      </div>

                      {/* Current tenant list */}
                      {tenantsLoading ? (
                        <div style={{ fontSize: 12, color: C.muted }}>Loading tenant activations…</div>
                      ) : tenants.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "24px 0", color: C.muted, fontSize: 12 }}>No tenants have this framework assigned yet.</div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {tenants.map(t => (
                            <div key={t.tenantId} style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{t.tenantName}</div>
                                <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                                  Assigned {new Date(t.assignedAt).toLocaleDateString()} by {t.assignedBy}
                                </div>
                              </div>
                              <span style={{ fontSize: 9, fontWeight: 700, background: "rgba(52,211,153,0.1)", color: C.green, border: "1px solid rgba(52,211,153,0.3)", borderRadius: 4, padding: "2px 7px" }}>ACTIVE</span>
                              <button onClick={() => handleRemoveTenant(t.tenantId)} style={BTN(C.danger, "rgba(239,68,68,0.07)", "rgba(239,68,68,0.25)")}>Remove</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* IMPORT TAB */}
                  {drawerTab === "import" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      <div style={{ background: "rgba(147,197,253,0.06)", border: "1px solid rgba(147,197,253,0.2)", borderRadius: 8, padding: "12px 14px", fontSize: 11, color: C.text, lineHeight: 1.6 }}>
                        Paste a JSON array of controls to bulk-import for this framework. This will <strong style={{ color: C.warn }}>replace</strong> all existing master controls for this framework.
                        <br />Each item: <code style={{ background: C.bg2, borderRadius: 3, padding: "1px 5px", fontSize: 10 }}>{`{ "controlRef": "A.5.1", "domain": "Governance", "title": "...", "description": "...", "requirementText": "..." }`}</code>
                      </div>
                      <textarea
                        style={{ ...INP, width: "100%", height: 220, resize: "vertical", boxSizing: "border-box", fontFamily: "monospace", fontSize: 11 }}
                        placeholder={'[\n  { "controlRef": "A.5.1", "domain": "Governance", "title": "Information security policies", "description": "..." }\n]'}
                        value={importJson} onChange={e => setImportJson(e.target.value)}
                      />
                      {importMsg && <div style={{ fontSize: 11, color: importMsg.startsWith("✓") ? C.green : C.danger }}>{importMsg}</div>}
                      <button onClick={handleImport} disabled={importing || !importJson.trim()} style={{
                        ...BTN(C.accent, "rgba(147,197,253,0.1)", "rgba(147,197,253,0.3)"),
                        opacity: importing || !importJson.trim() ? 0.5 : 1,
                      }}>{importing ? "Importing…" : "Import Controls"}</button>
                    </div>
                  )}

                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Crosswalk Modal ──────────────────────────────────────────────────── */}
      {showCrosswalk && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100 }}>
          <div style={{ ...card, width: 720, maxHeight: "80vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: C.purple }}>⤢ Control Crosswalk</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Controls shared across multiple frameworks — helps avoid duplicate work items on injection.</div>
              </div>
              <button onClick={() => setShowCrosswalk(false)} style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 6, width: 28, height: 28, cursor: "pointer", color: C.muted, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}>×</button>
            </div>

            {crosswalkLoading ? (
              <div style={{ textAlign: "center", padding: "32px 0", color: C.muted, fontSize: 13 }}>Loading crosswalk data…</div>
            ) : crosswalk.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 0" }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>⤢</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 6 }}>No crosswalk data yet</div>
                <div style={{ fontSize: 12, color: C.muted }}>Import controls with <code style={{ background: C.bg2, padding: "1px 5px", borderRadius: 3, fontSize: 10 }}>crosswalkRefs</code> to populate this panel.</div>
              </div>
            ) : (
              <div style={{ overflow: "auto", flex: 1 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: C.bg2, borderBottom: `1px solid ${C.border}` }}>
                      {["Control Ref", "Domain", "Title", "Frameworks", "Crosswalk"].map(h => (
                        <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {crosswalk.map((r, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid rgba(255,255,255,0.05)` }}>
                        <td style={{ padding: "8px 12px" }}><span style={{ fontFamily: "monospace", fontSize: 10, color: C.purple }}>{r.controlRef}</span></td>
                        <td style={{ padding: "8px 12px" }}><span style={{ fontSize: 10, color: C.muted }}>{r.domain}</span></td>
                        <td style={{ padding: "8px 12px" }}><span style={{ fontSize: 11, color: C.text }}>{r.title}</span></td>
                        <td style={{ padding: "8px 12px", textAlign: "center" }}><span style={{ fontWeight: 800, color: C.warn, fontFamily: "monospace" }}>{r.frameworkCount}</span></td>
                        <td style={{ padding: "8px 12px" }}>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {(r.crosswalkRefs as string[]).slice(0, 3).map((ref: string) => (
                              <span key={ref} style={{ fontSize: 9, color: C.accent, background: "rgba(147,197,253,0.08)", border: "1px solid rgba(147,197,253,0.2)", borderRadius: 4, padding: "1px 5px" }}>{ref}</span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
