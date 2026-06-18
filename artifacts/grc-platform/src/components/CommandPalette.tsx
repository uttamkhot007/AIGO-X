import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";

// ── Static navigation commands ────────────────────────────────────────────────

interface NavCommand {
  id: string;
  label: string;
  description?: string;
  path: string;
  icon: string;
  category: string;
  keywords?: string[];
}

const NAV_COMMANDS: NavCommand[] = [
  { id: "nav-dashboard",   label: "Dashboard",          description: "GRC overview and KPIs",                path: "/",             icon: "⬡", category: "Navigate", keywords: ["home","overview"] },
  { id: "nav-govops",      label: "GovOps",             description: "Policies, processes and procedures",    path: "/govops",       icon: "◉", category: "Navigate", keywords: ["policy","process","procedure","governance"] },
  { id: "nav-risk",        label: "Risk Register",      description: "View and manage all risks",             path: "/riskops",      icon: "◈", category: "Navigate", keywords: ["risks","register","riskops"] },
  { id: "nav-compliance",  label: "ComplianceOps",      description: "Frameworks, controls and audits",       path: "/complianceops",icon: "◎", category: "Navigate", keywords: ["iso","soc2","gdpr","hipaa","audit","control"] },
  { id: "nav-security",    label: "Security",           description: "CAASM, CSPM and SSPM",                  path: "/secops",       icon: "◬", category: "Navigate", keywords: ["cspm","sspm","caasm","assets","cloud"] },
  { id: "nav-cloud",       label: "CloudOps",           description: "Cloud security posture management",     path: "/cloudops",     icon: "☁", category: "Navigate", keywords: ["aws","azure","gcp","cspm","cloud"] },
  { id: "nav-privacy",     label: "PrivacyOps",         description: "DSAR, DPIA and data privacy",           path: "/privacyops",   icon: "◐", category: "Navigate", keywords: ["dsar","dpia","gdpr","privacy","ropa"] },
  { id: "nav-ai",          label: "AI vCISO",           description: "AI-powered security advisor",           path: "/ai",           icon: "◆", category: "Navigate", keywords: ["ai","vciso","playbook","advisor"] },
  { id: "nav-desk",        label: "Service Desk",       description: "Tickets, SLA and knowledge base",       path: "/service-desk", icon: "◧", category: "Navigate", keywords: ["tickets","help","support","incident"] },
  { id: "nav-people",      label: "PeopleOps",          description: "Users, roles and access risk",          path: "/peopleops",    icon: "◯", category: "Navigate", keywords: ["people","users","hr","employees"] },
  { id: "nav-evidence",    label: "Evidence Engine",    description: "Automated evidence collection",         path: "/evidence-engine", icon: "◐", category: "Navigate", keywords: ["evidence","automated","collection"] },
  { id: "nav-quest",       label: "Questionnaires",     description: "Vendor & compliance questionnaires",    path: "/questionnaires", icon: "◫", category: "Navigate", keywords: ["questionnaire","vendor","survey"] },
  { id: "nav-agents",      label: "Agents",             description: "Agent fleet and connectors",            path: "/agents",       icon: "◫", category: "Navigate", keywords: ["agents","connectors"] },
  { id: "nav-settings",    label: "Settings",           description: "Org config, users and integrations",    path: "/settings",     icon: "◩", category: "Navigate" },
  { id: "act-risk",        label: "New Risk",           description: "Add a new risk to the register",        path: "/riskops",      icon: "+", category: "Actions",  keywords: ["create","add","risk"] },
  { id: "act-ticket",      label: "New Ticket",         description: "Create a service desk ticket",          path: "/service-desk", icon: "+", category: "Actions",  keywords: ["create","add","ticket"] },
  { id: "act-dsar",        label: "New DSAR",           description: "Register a data subject request",       path: "/privacyops",   icon: "+", category: "Actions",  keywords: ["dsar","request","gdpr"] },
];

// ── Type metadata ─────────────────────────────────────────────────────────────

const TYPE_META: Record<string, { color: string; bg: string; dot: string }> = {
  "Policy":           { color: "#1D4ED8", bg: "#EFF6FF", dot: "#3B82F6" },
  "Process":          { color: "#4338CA", bg: "#EEF2FF", dot: "#6366F1" },
  "Procedure":        { color: "#6D28D9", bg: "#F5F3FF", dot: "#8B5CF6" },
  "Control":          { color: "#1E3A5F", bg: "#EFF6FF", dot: "#3B82F6" },
  "Risk":             { color: "#B91C1C", bg: "#FEF2F2", dot: "#EF4444" },
  "Treatment":        { color: "#9A3412", bg: "#FFF7ED", dot: "#F97316" },
  "Vendor":           { color: "#065F46", bg: "#ECFDF5", dot: "#10B981" },
  "Ticket":           { color: "#92400E", bg: "#FFFBEB", dot: "#F59E0B" },
  "Asset":            { color: "#065F46", bg: "#ECFDF5", dot: "#10B981" },
  "Person":           { color: "#5B21B6", bg: "#F5F3FF", dot: "#A855F7" },
  "Audit":            { color: "#0369A1", bg: "#F0F9FF", dot: "#0EA5E9" },
  "Audit Finding":    { color: "#9A3412", bg: "#FFF7ED", dot: "#F97316" },
  "Evidence Request": { color: "#0F766E", bg: "#F0FDFA", dot: "#14B8A6" },
  "Questionnaire":    { color: "#0F766E", bg: "#F0FDFA", dot: "#14B8A6" },
  "DSAR":             { color: "#7C3AED", bg: "#F5F3FF", dot: "#8B5CF6" },
  "RoPA":             { color: "#6D28D9", bg: "#F5F3FF", dot: "#8B5CF6" },
  "SaaS":             { color: "#0F766E", bg: "#F0FDFA", dot: "#14B8A6" },
  "Security Finding": { color: "#B45309", bg: "#FFFBEB", dot: "#EAB308" },
  "Cloud Resource":   { color: "#0369A1", bg: "#F0F9FF", dot: "#0EA5E9" },
  "Cloud Finding":    { color: "#B91C1C", bg: "#FEF2F2", dot: "#EF4444" },
  "Data Store":       { color: "#1E3A5F", bg: "#EFF6FF", dot: "#3B82F6" },
};

// ── Module location colors ────────────────────────────────────────────────────

function locationColor(loc: string): string {
  if (loc.startsWith("GovOps"))      return "#4338CA";
  if (loc.startsWith("RiskOps"))     return "#B91C1C";
  if (loc.startsWith("ComplianceOps")) return "#0369A1";
  if (loc.startsWith("Security"))    return "#065F46";
  if (loc.startsWith("CloudOps"))    return "#0369A1";
  if (loc.startsWith("PeopleOps"))   return "#5B21B6";
  if (loc.startsWith("PrivacyOps"))  return "#7C3AED";
  if (loc.startsWith("Service Desk")) return "#92400E";
  if (loc.startsWith("DataOps"))     return "#1E3A5F";
  return "#6B7280";
}

const STATUS_COLORS: Record<string, string> = {
  active: "#10B981", "in-progress": "#3B82F6", open: "#EF4444",
  draft: "#9CA3AF", planned: "#6366F1", implemented: "#10B981",
  partial: "#F59E0B", "not-started": "#9CA3AF", closed: "#6B7280",
  complete: "#10B981", resolved: "#10B981", approved: "#10B981",
  "in-review": "#F59E0B", distributed: "#3B82F6", pending: "#9CA3AF",
  low: "#10B981", medium: "#F59E0B", high: "#F97316", critical: "#EF4444",
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface SearchResult {
  uid: string; name: string; status: string;
  sub: string | null; location: string; type: string; icon: string; route: string;
}
interface SearchResponse {
  results: Record<string, SearchResult[]>;
  total: number;
  query: string;
}

interface Props { open: boolean; onClose: () => void; }

// ── Component ─────────────────────────────────────────────────────────────────

export function CommandPalette({ open, onClose }: Props) {
  const [query, setQuery]       = useState("");
  const [selected, setSelected] = useState(0);
  const [dbResults, setDbResults]   = useState<SearchResponse | null>(null);
  const [loading, setLoading]   = useState(false);
  const [, navigate]            = useLocation();
  const debounceRef             = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef                = useRef<HTMLInputElement>(null);

  const isSearchMode = query.trim().length >= 2;

  // ── Navigation filter (command mode) ───────────────────────────────────────
  const filteredNav = query.trim()
    ? NAV_COMMANDS.filter(c =>
        c.label.toLowerCase().includes(query.toLowerCase()) ||
        c.description?.toLowerCase().includes(query.toLowerCase()) ||
        c.keywords?.some(k => k.includes(query.toLowerCase()))
      )
    : NAV_COMMANDS;

  // ── Flat list for keyboard nav ─────────────────────────────────────────────
  const flatResults: Array<{ key: string; item: NavCommand | SearchResult; isDb: boolean }> =
    isSearchMode
      ? Object.entries(dbResults?.results ?? {}).flatMap(([group, items]) =>
          items.map(item => ({ key: `${group}:${item.uid}`, item, isDb: true }))
        )
      : filteredNav.map(item => ({ key: item.id, item, isDb: false }));

  // ── Reset on open/close ────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      setDbResults(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (selected >= flatResults.length && flatResults.length > 0) setSelected(0);
  }, [flatResults.length, selected]);

  // ── Debounced DB search ────────────────────────────────────────────────────
  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setDbResults(null); setLoading(false); return; }
    setLoading(true);
    try {
      const token = localStorage.getItem("grc_token") ?? "";
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: SearchResponse = await res.json();
        setDbResults(data);
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) { setDbResults(null); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(() => doSearch(query.trim()), 280);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  // ── Keyboard nav ───────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => Math.min(s + 1, flatResults.length - 1)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
      if (e.key === "Enter")     { e.preventDefault(); activateIndex(selected); }
      if (e.key === "Escape")    { onClose(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, selected, flatResults]);

  function activateIndex(idx: number) {
    const entry = flatResults[idx];
    if (!entry) return;
    if (entry.isDb) {
      const item = entry.item as SearchResult;
      navigate(item.route);
    } else {
      navigate((entry.item as NavCommand).path);
    }
    onClose();
  }

  if (!open) return null;

  const dbGroups = Object.entries(dbResults?.results ?? {});
  const totalHits = dbResults?.total ?? 0;

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", backdropFilter:"blur(5px)", zIndex:9998 }}
        onClick={onClose}
      />

      {/* Panel */}
      <div style={{
        position:"fixed", top:"12%", left:"50%", transform:"translateX(-50%)",
        width:"min(680px, 96vw)",
        background:"#fff",
        borderRadius:16,
        boxShadow:"0 32px 72px rgba(0,0,0,0.22), 0 4px 16px rgba(30,58,95,0.12)",
        zIndex:9999, overflow:"hidden",
        fontFamily:"'Plus Jakarta Sans', sans-serif",
        animation:"subtle-scale 0.14s ease both",
      }}>

        {/* ── Search bar ─────────────────────────────────────────────────── */}
        <div style={{ display:"flex", alignItems:"center", gap:10, padding:"14px 16px", borderBottom:"1px solid #F0F0F0" }}>
          <span style={{ fontSize:17, color: isSearchMode ? "#1E3A5F" : "#9CA3AF", transition:"color 0.2s" }}>⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(0); }}
            placeholder="Search anything — ID, name, status, keyword, owner…"
            style={{ flex:1, border:"none", outline:"none", fontSize:14, color:"#1E3A5F", fontFamily:"inherit", background:"transparent", fontWeight:500 }}
          />
          {loading && (
            <span style={{ fontSize:11, color:"#9CA3AF", animation:"spin 0.8s linear infinite" }}>⟳</span>
          )}
          {query && !loading && (
            <button onClick={() => { setQuery(""); setDbResults(null); }} style={{ background:"none", border:"none", color:"#9CA3AF", cursor:"pointer", fontSize:15, lineHeight:1 }}>×</button>
          )}
          <kbd style={{ background:"#F3F4F6", border:"1px solid #E5E7EB", borderRadius:4, padding:"2px 6px", fontSize:10, fontWeight:700, color:"#9CA3AF", flexShrink:0 }}>ESC</kbd>
        </div>

        {/* ── Mode indicator ──────────────────────────────────────────────── */}
        {isSearchMode && (
          <div style={{ padding:"6px 16px", background:"#F8FAFF", borderBottom:"1px solid #EEF2FF", display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ fontSize:10, color:"#6366F1", fontWeight:700 }}>UNIVERSAL SEARCH</span>
            <span style={{ fontSize:10, color:"#9CA3AF" }}>— searching all objects across every module</span>
            {totalHits > 0 && (
              <span style={{ marginLeft:"auto", fontSize:10, color:"#6366F1", fontWeight:700 }}>{totalHits} result{totalHits !== 1 ? "s" : ""}</span>
            )}
          </div>
        )}

        {/* ── Results ─────────────────────────────────────────────────────── */}
        <div style={{ maxHeight:460, overflowY:"auto", padding:"6px 0" }}>

          {/* Loading skeleton */}
          {isSearchMode && loading && !dbResults && (
            <div style={{ padding:"28px 20px", textAlign:"center" }}>
              <div style={{ fontSize:13, color:"#9CA3AF" }}>Searching all modules…</div>
            </div>
          )}

          {/* No results */}
          {isSearchMode && !loading && totalHits === 0 && dbResults && (
            <div style={{ padding:"32px 20px", textAlign:"center" }}>
              <div style={{ fontSize:20, marginBottom:8 }}>◌</div>
              <div style={{ fontSize:13, color:"#374151", fontWeight:600 }}>No matches for "{query}"</div>
              <div style={{ fontSize:11, color:"#9CA3AF", marginTop:4 }}>Try a different keyword, ID prefix (e.g. RK-, POL-, USR-), or owner name</div>
            </div>
          )}

          {/* DB search results grouped by type */}
          {isSearchMode && !loading && dbGroups.map(([group, items]) => {
            const first = items[0];
            const meta = TYPE_META[first?.type ?? ""] ?? { color:"#374151", bg:"#F9FAFB", dot:"#9CA3AF" };
            return (
              <div key={group}>
                {/* Group header */}
                <div style={{ padding:"8px 16px 4px", display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ width:7, height:7, borderRadius:"50%", background:meta.dot, display:"inline-block", flexShrink:0 }} />
                  <span style={{ fontSize:10, fontWeight:800, color:"#6B7280", letterSpacing:"0.6px", textTransform:"uppercase" as const }}>{group}</span>
                  <span style={{ fontSize:9, color:"#9CA3AF" }}>({items.length})</span>
                </div>

                {/* Group items */}
                {items.map(item => {
                  const globalIdx = flatResults.findIndex(e => e.key === `${group}:${item.uid}`);
                  const isSelected = selected === globalIdx;
                  const statusColor = STATUS_COLORS[item.status?.toLowerCase() ?? ""] ?? "#9CA3AF";
                  const locColor = locationColor(item.location ?? "");
                  return (
                    <div
                      key={item.uid}
                      onClick={() => { navigate(item.route); onClose(); }}
                      onMouseEnter={() => setSelected(globalIdx)}
                      style={{
                        display:"flex", alignItems:"center", gap:12, padding:"9px 16px",
                        background: isSelected ? meta.bg : "transparent",
                        cursor:"pointer", transition:"background 0.1s",
                        borderLeft: isSelected ? `3px solid ${meta.dot}` : "3px solid transparent",
                      }}
                    >
                      {/* Icon box */}
                      <div style={{
                        width:34, height:34, borderRadius:9, flexShrink:0,
                        background: isSelected ? meta.dot : "#F3F4F6",
                        display:"flex", alignItems:"center", justifyContent:"center",
                        fontSize:14, color: isSelected ? "#fff" : "#9CA3AF",
                        transition:"all 0.15s",
                      }}>
                        {item.icon}
                      </div>

                      {/* Content */}
                      <div style={{ flex:1, minWidth:0 }}>
                        {/* Row 1: UID badge + Name */}
                        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
                          <span style={{
                            fontSize:9, fontFamily:"'JetBrains Mono', monospace", fontWeight:700,
                            color: meta.color, background: meta.bg,
                            border:`1px solid ${meta.dot}22`,
                            borderRadius:4, padding:"1px 5px", flexShrink:0,
                          }}>{item.uid}</span>
                          <span style={{ fontSize:13, fontWeight:600, color: isSelected ? meta.color : "#374151", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>
                            {item.name}
                          </span>
                        </div>
                        {/* Row 2: sub-type + location breadcrumb */}
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          {item.sub && (
                            <span style={{ fontSize:10, color:"#9CA3AF" }}>{item.sub}</span>
                          )}
                          {item.location && (
                            <span style={{
                              display:"inline-flex", alignItems:"center", gap:3,
                              fontSize:9, fontWeight:600,
                              color: locColor,
                              background: `${locColor}10`,
                              border: `1px solid ${locColor}25`,
                              borderRadius:4, padding:"1px 6px",
                              flexShrink:0,
                            }}>
                              <span style={{ fontSize:7, opacity:0.7 }}>📍</span>
                              {item.location}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Status */}
                      <div style={{ display:"flex", alignItems:"center", gap:4, flexShrink:0 }}>
                        <span style={{ width:6, height:6, borderRadius:"50%", background:statusColor, display:"inline-block" }} />
                        <span style={{ fontSize:10, color:"#9CA3AF", textTransform:"capitalize" as const }}>{item.status}</span>
                      </div>

                      {isSelected && (
                        <kbd style={{ background: meta.bg, border:`1px solid ${meta.dot}44`, borderRadius:4, padding:"2px 5px", fontSize:9, fontWeight:700, color:meta.color, flexShrink:0 }}>↵</kbd>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Navigation command mode */}
          {!isSearchMode && (() => {
            const groups = Array.from(new Set(filteredNav.map(c => c.category)));
            return groups.map(group => {
              const groupItems = filteredNav.filter(c => c.category === group);
              return (
                <div key={group}>
                  <div style={{ padding:"6px 16px 4px", fontSize:10, fontWeight:700, color:"#9CA3AF", letterSpacing:"0.5px", textTransform:"uppercase" as const }}>{group}</div>
                  {groupItems.map(cmd => {
                    const idx = flatResults.findIndex(e => e.key === cmd.id);
                    const isSelected = selected === idx;
                    return (
                      <div key={cmd.id}
                        onClick={() => { navigate(cmd.path); onClose(); }}
                        onMouseEnter={() => setSelected(idx)}
                        style={{
                          display:"flex", alignItems:"center", gap:12, padding:"9px 16px",
                          background: isSelected ? "#EFF6FF" : "transparent",
                          cursor:"pointer", transition:"background 0.1s",
                        }}
                      >
                        <div style={{ width:32, height:32, borderRadius:8, background: isSelected ? "#BFDBFE" : "#F3F4F6", display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, color: isSelected ? "#1E3A5F" : "#9CA3AF", flexShrink:0 }}>
                          {cmd.icon}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:600, color: isSelected ? "#1E3A5F" : "#374151" }}>{cmd.label}</div>
                          {cmd.description && (
                            <div style={{ fontSize:11, color:"#9CA3AF", marginTop:1 }}>{cmd.description}</div>
                          )}
                        </div>
                        {isSelected && (
                          <kbd style={{ background:"#BFDBFE", border:"1px solid #93C5FD", borderRadius:4, padding:"2px 6px", fontSize:9, fontWeight:700, color:"#1E3A5F" }}>↵</kbd>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            });
          })()}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div style={{ padding:"8px 16px", borderTop:"1px solid #F0F0F0", display:"flex", gap:14, alignItems:"center", background:"#FAFAFA" }}>
          {[["↑↓","navigate"],["↵","open"],["esc","close"]].map(([k,l]) => (
            <div key={k} style={{ display:"flex", alignItems:"center", gap:5 }}>
              <kbd style={{ background:"#F3F4F6", border:"1px solid #E5E7EB", borderRadius:3, padding:"1px 5px", fontSize:9, fontWeight:700, color:"#9CA3AF" }}>{k}</kbd>
              <span style={{ fontSize:10, color:"#9CA3AF" }}>{l}</span>
            </div>
          ))}
          <div style={{ marginLeft:"auto", fontSize:10, color:"#9CA3AF" }}>
            {isSearchMode
              ? `${totalHits} record${totalHits !== 1 ? "s" : ""} across ${dbGroups.length} module${dbGroups.length !== 1 ? "s" : ""}`
              : `${filteredNav.length} command${filteredNav.length !== 1 ? "s" : ""} · type to search records`
            }
          </div>
        </div>
      </div>

      <style>{`
        @keyframes subtle-scale {
          from { opacity:0; transform:translateX(-50%) scale(0.96); }
          to   { opacity:1; transform:translateX(-50%) scale(1); }
        }
        @keyframes spin { to { transform:rotate(360deg); } }
      `}</style>
    </>
  );
}
