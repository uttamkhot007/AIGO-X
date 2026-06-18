import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { modules, adminModule, deploymentModule } from "@/lib/data";
import { useAuth } from "@/context/AuthContext";
import { useTheme, THEME_OPTIONS } from "@/context/ThemeContext";
import { useOrg } from "@/context/OrgContext";
import type { TenantInfo } from "@/context/OrgContext";
import { useRealtime } from "@/context/RealtimeContext";
import { getRoleLabel, getRoleBadgeStyle } from "@/lib/auth-utils";
import { AIAssistant } from "@/components/AIAssistant";
import { BrowserAgentBadge } from "@/components/BrowserAgentBadge";
import { ROLE_DEFINITIONS, getEffectiveModuleAccess } from "@/lib/rbac-config";
import { useLicense } from "@/context/LicenseContext";
import { UpgradeModal } from "@/components/UpgradeModal";
import type { ReactNode } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const base = import.meta.env.BASE_URL.replace(/\/$/, "");

function toHref(path: string) {
  const sub = path.replace("/grc-platform", "") || "/";
  return `${base}${sub}`;
}
function toLocalPath(path: string) {
  return path.replace("/grc-platform", "") || "/";
}

const SIDEBAR_W = 220;
const TOPBAR_H = 52;

const NAV_GROUPS = [
  { label: "CORE",       ids: ["home", "govops", "riskops", "complianceops"] },
  { label: "SECURITY",   ids: ["secops", "cloudops", "aisecops"] },
  { label: "PRIVACY",    ids: ["privacyops", "dataops"] },
  { label: "OPERATIONS", ids: ["assetops", "serviceops", "peopleops"] },
  { label: "INSIGHTS",   ids: ["maturity", "analyticsops", "ai", "workflows"] },
  { label: "SYSTEM",     ids: ["settings"] },
];

const MODULE_ICONS: Record<string, string> = {
  home:          "bi-house-door-fill",
  govops:        "bi-building",
  riskops:       "bi-exclamation-triangle-fill",
  complianceops: "bi-shield-check",
  serviceops:    "bi-ticket-detailed",
  secops:        "bi-shield-lock-fill",
  assetops:      "bi-laptop",
  cloudops:      "bi-cloud-fill",
  aisecops:      "bi-robot",
  privacyops:    "bi-lock-fill",
  dataops:       "bi-database-fill",
  maturity:      "bi-graph-up-arrow",
  analyticsops:  "bi-bar-chart-fill",
  ai:            "bi-cpu",
  peopleops:     "bi-people-fill",
  workflows:     "bi-arrow-repeat",
  "vendor-portal": "bi-buildings",
  settings:      "bi-gear-fill",
  admin:         "bi-key-fill",
  deployment:    "bi-rocket-takeoff-fill",
};

interface ShellProps {
  children: ReactNode;
  onOpenCmd?: () => void;
}

const MODULE_LICENSE_KEY: Record<string, string> = {
  secops:      "secops",
  cloudops:    "cloudops",
  privacyops:  "privacyops",
  dataops:     "dataops",
  assetops:    "assetops",
  serviceops:  "serviceops",
  peopleops:   "peopleops",
  analyticsops:"analyticsops",
  ai:          "aivciso",
  aisecops:    "aisecops",
};

export function Shell({ children, onOpenCmd }: ShellProps) {
  const [location, navigate] = useLocation();
  const { user, clearAuth, setDemoRole, setToken } = useAuth();
  const { theme, setTheme } = useTheme();
  const { orgName, setOrgName, tenants, setTenants, viewTenantId, setViewTenantId } = useOrg();
  const { isModuleLicensed, plan } = useLicense();
  const [upgradeFeature, setUpgradeFeature] = useState<string | null>(null);
  const [roleOpen, setRoleOpen]         = useState(false);
  const [orgOpen, setOrgOpen]           = useState(false);
  const [aiPanelOpen, setAiPanelOpen]   = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [notifOpen, setNotifOpen]       = useState(false);
  const [themeOpen, setThemeOpen]       = useState(false);
  const [addOrgOpen, setAddOrgOpen]     = useState(false);
  const [addForm, setAddForm]           = useState({ name: "", slug: "", domain: "", plan: "starter" });
  const [addSaving, setAddSaving]       = useState(false);
  const [addError, setAddError]         = useState("");

  useEffect(() => {
    const role = user?.role;
    if (role !== "super_admin") return;
    const apiBase = BASE.replace("/grc-platform", "");
    (async () => {
      const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem("grc_token") ?? ""}` });
      let res = await fetch(`${apiBase}/api/tenants`, { headers: authHeader() }).catch(() => null);
      if (res?.status === 403) {
        const ref = await fetch(`${apiBase}/api/auth/refresh`, { headers: authHeader() }).catch(() => null);
        if (ref?.ok) { const { token } = await ref.json(); setToken(token); }
      }
      res = await fetch(`${apiBase}/api/tenants`, { headers: authHeader() }).catch(() => null);
      if (res?.ok) {
        const data: Array<{ id: number; name: string; slug: string }> = await res.json();
        const mapped = data.map(t => ({ id: t.id, name: t.name, slug: t.slug }));
        setTenants(mapped);
        // Resolve the active tenant from localStorage (set by previous switch) or default to first
        const storedId = parseInt(localStorage.getItem("grc_view_tenant") ?? "", 10);
        const current = (!isNaN(storedId) && mapped.find(t => t.id === storedId))
          || mapped.find(t => t.name === orgName)
          || mapped[0];
        if (current) {
          setViewTenantId(current.id);
          setOrgName(current.name);
        }
      }
    })();
  }, [user?.role]);

  async function handleAddOrg() {
    if (!addForm.name.trim() || !addForm.slug.trim()) { setAddError("Name and Slug are required."); return; }
    setAddSaving(true); setAddError("");
    const token = localStorage.getItem("grc_token");
    try {
      const apiBase = BASE.replace("/grc-platform", "");
      const r = await fetch(`${apiBase}/api/tenants`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(addForm),
      });
      const data = await r.json() as { id: number; name: string; slug: string; error?: string };
      if (!r.ok) { setAddError(data.error ?? "Failed to create tenant"); return; }
      const newTenant: TenantInfo = { id: data.id, name: data.name, slug: data.slug };
      setTenants([...tenants, newTenant]);
      setOrgName(newTenant.name);
      setAddOrgOpen(false); setOrgOpen(false);
      setAddForm({ name: "", slug: "", domain: "", plan: "starter" });
    } catch { setAddError("Network error — please retry."); }
    finally { setAddSaving(false); }
  }

  const isDark = theme === "dark" || theme === "dark-blue" || theme === "gaussian-black" || theme === "light-dark";

  function isActive(m: typeof modules[0]) {
    const local = toLocalPath(m.path);
    return local === "/" ? location === "/" : location.startsWith(local);
  }
  function handleLogout() { clearAuth(); navigate("/login"); }
  function closeAll() {
    setOrgOpen(false); setRoleOpen(false); setNotifOpen(false);
    setAiPanelOpen(false); setThemeOpen(false); setActivityOpen(false);
  }

  const { notifications: liveNotifications, unreadCount, onlineUsers, markAllRead, connected } = useRealtime();

  const effectiveRole  = user?.role ?? "ciso";
  const allowedIds     = getEffectiveModuleAccess(effectiveRole);
  const visibleModules = modules.filter(m => allowedIds.includes(m.id));
  const roleLabel      = getRoleLabel(effectiveRole);
  const badgeStyle     = getRoleBadgeStyle(effectiveRole);
  const initials       = user?.initials ?? "AK";
  const userName       = user?.name ?? user?.email ?? "Admin";
  const otherOnlineUsers = onlineUsers.filter(u => u.userId !== user?.userId);

  const currentModule = visibleModules.find(m => isActive(m));
  const pageTitle = currentModule?.label ?? "Command Center";

  const sideBg   = isDark ? "#0d1626" : "#ffffff";
  const sideFg   = isDark ? "rgba(255,255,255,0.85)" : "#1F2937";
  const sideMuted= isDark ? "rgba(255,255,255,0.4)"  : "#9CA3AF";
  const sideHover= isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
  const sideActive = isDark ? "rgba(147,197,253,0.12)" : "rgba(59,130,246,0.08)";
  const sideDivider = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";
  const sideActiveText = isDark ? "#fff" : "#1D4ED8";
  const accentColor = "#93C5FD";

  const topBg  = isDark ? "var(--secondary)" : "var(--secondary)";
  const topBd  = isDark ? "rgba(255,255,255,0.07)" : "var(--border)";
  const popBg  = isDark ? "rgba(10,18,36,0.97)" : "white";
  const popBd  = isDark ? "rgba(255,255,255,0.10)" : "var(--border)";
  const mutedFg= isDark ? "rgba(255,255,255,0.45)" : "#9CA3AF";
  const surfBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
  const surfBd = isDark ? "rgba(255,255,255,0.10)" : "var(--border)";

  function NavIcon({ id }: { id: string }) {
    const cls = MODULE_ICONS[id] ?? "bi-circle";
    return <i className={`bi ${cls}`} style={{ fontSize: 14 }} />;
  }

  return (
    <div style={{
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      background: "transparent",
      minHeight: "100vh",
      display: "flex",
      flexDirection: "row",
      overflow: "hidden",
      color: "var(--foreground)",
    }}>

      {/* ── SIDEBAR ─────────────────────────────────────────────────────── */}
      <aside style={{
        width: SIDEBAR_W,
        minWidth: SIDEBAR_W,
        height: "100vh",
        background: sideBg,
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        borderRight: `1px solid ${sideDivider}`,
        position: "relative",
        zIndex: 100,
        overflow: "hidden",
      }}>

        {/* Logo */}
        <div style={{ padding: "18px 16px 14px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32,
              background: "linear-gradient(135deg, #1e40af, #065f46)",
              borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, fontWeight: 800, color: "#fff",
              flexShrink: 0,
              boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
            }}>D</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: isDark ? "#fff" : "#0F172A", letterSpacing: "-0.3px", lineHeight: 1.1 }}>AIGO-X</div>
              <div style={{ fontSize: 9, color: sideMuted, fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase" }}>GRC Platform</div>
            </div>
          </div>
        </div>

        {/* Org switcher (compact) */}
        <div style={{ padding: "0 12px 12px", flexShrink: 0, position: "relative" }}>
          <button
            onClick={() => { setOrgOpen(!orgOpen); setRoleOpen(false); setNotifOpen(false); setAiPanelOpen(false); setThemeOpen(false); }}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 7,
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 8, padding: "6px 10px", fontSize: 11, cursor: "pointer",
              color: sideFg, fontFamily: "inherit",
            }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981", flexShrink: 0 }} />
            <span style={{ flex: 1, textAlign: "left", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{orgName}</span>
            <i className="bi bi-chevron-expand" style={{ fontSize: 10, color: sideMuted }} />
          </button>
          {orgOpen && (
            <div style={{
              position: "fixed", top: 90, left: 12, width: 196,
              background: popBg, border: `1px solid ${popBd}`, borderRadius: 10,
              boxShadow: "0 16px 48px rgba(0,0,0,0.4)", backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)", zIndex: 999, overflow: "hidden",
            }}>
              {tenants.length === 0
                ? <div style={{ padding: "10px 14px", fontSize: 11, color: mutedFg }}>Loading…</div>
                : tenants.map(t => (
                  <button key={t.id} onClick={() => { setViewTenantId(t.id); setOrgName(t.name); setOrgOpen(false); }}
                    style={{
                      display: "block", width: "100%", padding: "9px 14px", textAlign: "left",
                      fontSize: 12, fontWeight: t.name === orgName ? 700 : 500,
                      color: t.name === orgName ? accentColor : (isDark ? "rgba(255,255,255,0.8)" : "#374151"),
                      background: t.name === orgName ? (isDark ? "rgba(147,197,253,0.12)" : "#EFF6FF") : "transparent",
                      border: "none", cursor: "pointer", fontFamily: "inherit",
                    }}>
                    {t.name}
                    <span style={{ fontSize: 9, color: sideMuted, marginLeft: 6 }}>#{t.id}</span>
                  </button>
                ))
              }
              {effectiveRole === "super_admin" && (
                <div style={{ borderTop: `1px solid ${popBd}`, padding: "8px 14px" }}>
                  <button onClick={() => { setAddOrgOpen(true); setOrgOpen(false); }}
                    style={{ fontSize: 11, color: accentColor, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>
                    + Add Organization
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "0 0 8px", flexShrink: 0 }} />

        {/* Nav groups — scrollable */}
        <nav style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {NAV_GROUPS.map(group => {
            const groupModules = group.ids
              .map(id => visibleModules.find(m => m.id === id))
              .filter(Boolean) as typeof visibleModules;
            if (groupModules.length === 0) return null;
            return (
              <div key={group.label} style={{ marginBottom: 6 }}>
                <div style={{
                  padding: "8px 16px 4px",
                  fontSize: 9.5, fontWeight: 700, color: sideMuted,
                  letterSpacing: "0.8px", textTransform: "uppercase",
                }}>
                  {group.label}
                </div>
                {groupModules.map(m => {
                  const active = isActive(m);
                  const licKey = MODULE_LICENSE_KEY[m.id];
                  const isLocked = licKey ? !isModuleLicensed(licKey as Parameters<typeof isModuleLicensed>[0]) : false;
                  const inner = (
                    <div style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "7px 16px",
                      margin: "1px 8px",
                      borderRadius: 7,
                      cursor: isLocked ? "not-allowed" : "pointer",
                      background: active ? sideActive : "transparent",
                      borderLeft: active ? `2px solid ${accentColor}` : "2px solid transparent",
                      position: "relative",
                      transition: "background 0.12s",
                      opacity: isLocked ? 0.45 : 1,
                    }}
                      onClick={isLocked ? () => setUpgradeFeature(m.label) : undefined}
                      onMouseEnter={e => { if (!active && !isLocked) (e.currentTarget as HTMLDivElement).style.background = sideHover; }}
                      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}>
                      <span style={{ color: active ? accentColor : sideMuted, flexShrink: 0, display: "flex", width: 16, justifyContent: "center" }}>
                        <NavIcon id={m.id} />
                      </span>
                      <span style={{
                        fontSize: 12.5, fontWeight: active ? 700 : 500,
                        color: active ? sideActiveText : sideFg,
                        flex: 1, letterSpacing: "-0.1px",
                      }}>
                        {m.label}
                      </span>
                      {isLocked ? (
                        <span style={{ fontSize: 10, color: sideMuted, flexShrink: 0 }}>🔒</span>
                      ) : m.badge !== undefined ? (
                        <div style={{
                          background: "#DC2626", borderRadius: 10,
                          minWidth: 16, height: 16, padding: "0 4px",
                          fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center",
                          fontWeight: 700, color: "white",
                        }}>{m.badge}</div>
                      ) : null}
                    </div>
                  );
                  return isLocked
                    ? <div key={m.id}>{inner}</div>
                    : <Link key={m.id} href={toLocalPath(m.path)}>{inner}</Link>;
                })}
              </div>
            );
          })}

          {/* Super Admin group */}
          {effectiveRole === "super_admin" && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ padding: "8px 16px 4px", fontSize: 9.5, fontWeight: 700, color: sideMuted, letterSpacing: "0.8px", textTransform: "uppercase" }}>
                ADMIN
              </div>
              {[adminModule, deploymentModule].map(m => {
                const active = location.startsWith(toLocalPath(m.path));
                const col = m.id === "admin" ? "#F87171" : "#34D399";
                return (
                  <Link key={m.id} href={toLocalPath(m.path)}>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "7px 16px", margin: "1px 8px", borderRadius: 7, cursor: "pointer",
                      background: active ? "rgba(248,113,113,0.1)" : "transparent",
                      borderLeft: active ? `2px solid ${col}` : "2px solid transparent",
                      transition: "background 0.12s",
                    }}
                      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLDivElement).style.background = sideHover; }}
                      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}>
                      <span style={{ color: active ? col : sideMuted, display: "flex", width: 16, justifyContent: "center" }}>
                        <NavIcon id={m.id} />
                      </span>
                      <span style={{ fontSize: 12.5, fontWeight: active ? 700 : 500, color: active ? sideActiveText : sideFg }}>
                        {m.label}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </nav>

        {/* Divider */}
        <div style={{ height: 1, background: sideDivider, flexShrink: 0 }} />

        {/* Live Activity */}
        <div
          onClick={() => { setActivityOpen(v => !v); setAiPanelOpen(false); }}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "9px 16px", margin: "6px 8px", borderRadius: 7, cursor: "pointer",
            background: activityOpen ? "rgba(16,185,129,0.12)" : "transparent",
            borderLeft: activityOpen ? "2px solid #10B981" : "2px solid transparent",
            transition: "background 0.12s", flexShrink: 0, position: "relative",
          }}
          onMouseEnter={e => { if (!activityOpen) (e.currentTarget as HTMLDivElement).style.background = sideHover; }}
          onMouseLeave={e => { if (!activityOpen) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}>
          <span style={{ color: activityOpen ? "#10B981" : sideMuted, display: "flex", width: 16, justifyContent: "center" }}>
            <i className="bi bi-activity" style={{ fontSize: 14 }} />
          </span>
          <span style={{ fontSize: 12.5, fontWeight: activityOpen ? 700 : 500, color: activityOpen ? sideActiveText : sideFg, flex: 1 }}>
            Live Activity
          </span>
          {connected && (
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981", boxShadow: "0 0 6px #10B981" }} />
          )}
          {unreadCount > 0 && (
            <div style={{ background: "#DC2626", borderRadius: 10, minWidth: 16, height: 16, padding: "0 4px", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "white" }}>
              {unreadCount > 9 ? "9+" : unreadCount}
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: sideDivider, flexShrink: 0 }} />

        {/* User section */}
        <div style={{ padding: "10px 12px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              background: "linear-gradient(135deg, #1e40af, #065f46)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700, color: "white",
              border: "2px solid rgba(147,197,253,0.3)", flexShrink: 0,
            }}>{initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: isDark ? "#fff" : "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{userName}</div>
              <div style={{ fontSize: 10, color: sideMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{roleLabel}</div>
            </div>
            <button
              onClick={() => { setThemeOpen(!themeOpen); closeAll(); setThemeOpen(v => !v); }}
              title="Theme"
              style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", borderRadius: 6, cursor: "pointer", color: sideMuted, flexShrink: 0, transition: "color 0.1s" }}
              onMouseEnter={e => (e.currentTarget.style.color = isDark ? "#fff" : "#0F172A")}
              onMouseLeave={e => (e.currentTarget.style.color = sideMuted)}>
              <i className="bi bi-palette" style={{ fontSize: 13 }} />
            </button>
          </div>
        </div>

        {/* Theme picker popup */}
        {themeOpen && (
          <div style={{
            position: "fixed", bottom: 60, left: 12, width: 220,
            background: popBg, border: `1px solid ${popBd}`, borderRadius: 12,
            boxShadow: "0 16px 48px rgba(0,0,0,0.4)", backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)", zIndex: 999, overflow: "hidden", padding: 8,
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: mutedFg, letterSpacing: "0.5px", textTransform: "uppercase", padding: "4px 8px 8px" }}>Interface Theme</div>
            {THEME_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => { setTheme(opt.value); setThemeOpen(false); }}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 10px", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", background: theme === opt.value ? (isDark ? "rgba(147,197,253,0.12)" : "#EFF6FF") : "transparent" }}
                onMouseEnter={e => { if (theme !== opt.value) (e.currentTarget.style.background = isDark ? "var(--border)" : "#F9FAFB"); }}
                onMouseLeave={e => { if (theme !== opt.value) (e.currentTarget.style.background = "transparent"); }}>
                <span style={{ fontSize: 16 }}>{opt.icon}</span>
                <div style={{ flex: 1, textAlign: "left" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: theme === opt.value ? accentColor : (isDark ? "rgba(255,255,255,0.9)" : "#111827") }}>{opt.label}</div>
                  <div style={{ fontSize: 10, color: mutedFg }}>{opt.desc}</div>
                </div>
                {theme === opt.value && <span style={{ fontSize: 10, color: accentColor }}>✓</span>}
              </button>
            ))}
          </div>
        )}
      </aside>

      {/* ── MAIN AREA ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>

        {/* ── COMMAND BAR (top) ─────────────────────────────────────────── */}
        <header style={{
          height: TOPBAR_H,
          background: "var(--secondary)",
          borderBottom: `1px solid ${topBd}`,
          backdropFilter: isDark ? "blur(20px)" : "none",
          WebkitBackdropFilter: isDark ? "blur(20px)" : "none",
          display: "flex", alignItems: "center", padding: "0 16px", gap: 8,
          flexShrink: 0, zIndex: 40,
          boxShadow: isDark ? "0 1px 20px rgba(0,0,0,0.2)" : "0 1px 3px rgba(0,0,0,0.05)",
        }}>
          {/* Page breadcrumb */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
            <i className="bi bi-layout-sidebar" style={{ fontSize: 14, color: mutedFg }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)", whiteSpace: "nowrap" }}>
              {pageTitle}
            </span>
          </div>

          {/* Search */}
          <button onClick={onOpenCmd} title="Search (⌘K)"
            style={{ display: "flex", alignItems: "center", gap: 7, background: surfBg, border: `1px solid ${surfBd}`, borderRadius: 8, padding: "5px 12px", fontSize: 11, color: mutedFg, cursor: "pointer", fontFamily: "inherit" }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = accentColor)}
            onMouseLeave={e => (e.currentTarget.style.borderColor = surfBd)}>
            <i className="bi bi-search" style={{ fontSize: 11 }} />
            <span>Search or jump to…</span>
            <kbd style={{ background: isDark ? "var(--border)" : "white", border: `1px solid ${surfBd}`, borderRadius: 4, padding: "1px 5px", fontSize: 9, fontWeight: 700, color: mutedFg }}>⌘K</kbd>
          </button>

          {/* Browser Agent Badge */}
          <BrowserAgentBadge />

          {/* Light/Dark quick toggle */}
          <button
            title={isDark ? "Switch to Light mode" : "Switch to Dark mode"}
            onClick={() => setTheme(isDark ? "light" : "dark-blue")}
            style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: surfBg, border: `1px solid ${surfBd}`, borderRadius: 8, cursor: "pointer", fontSize: 14, color: "var(--foreground)", flexShrink: 0 }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = accentColor)}
            onMouseLeave={e => (e.currentTarget.style.borderColor = surfBd)}>
            <i className={`bi ${isDark ? "bi-sun" : "bi-moon-stars"}`} style={{ fontSize: 13 }} />
          </button>

          {/* Notifications */}
          <div style={{ position: "relative" }}>
            <button onClick={() => { setNotifOpen(!notifOpen); setAiPanelOpen(false); setOrgOpen(false); setRoleOpen(false); setThemeOpen(false); }}
              style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: surfBg, border: `1px solid ${surfBd}`, borderRadius: 8, cursor: "pointer", fontSize: 14, position: "relative", color: "var(--foreground)" }}>
              <i className="bi bi-bell" style={{ fontSize: 14 }} />
              {unreadCount > 0 && (
                <div style={{ position: "absolute", top: 4, right: 4, background: "#DC2626", borderRadius: "50%", width: 12, height: 12, fontSize: 7, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "white" }}>{unreadCount > 9 ? "9+" : unreadCount}</div>
              )}
            </button>
            {notifOpen && (
              <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, width: 340, background: popBg, border: `1px solid ${popBd}`, borderRadius: 12, boxShadow: "0 16px 48px rgba(0,0,0,0.25)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", zIndex: 999, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", borderBottom: `1px solid ${popBd}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>Notifications</span>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: connected ? "#10B981" : "#9CA3AF", boxShadow: connected ? "0 0 5px #10B981" : "none" }} />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {unreadCount > 0 && <span style={{ background: isDark ? "rgba(147,197,253,0.15)" : "#EFF6FF", border: `1px solid ${isDark ? "rgba(147,197,253,0.3)" : "#BFDBFE"}`, borderRadius: 10, padding: "1px 8px", fontSize: 10, fontWeight: 700, color: isDark ? accentColor : "#1D4ED8" }}>{unreadCount} new</span>}
                    <button onClick={() => setNotifOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: mutedFg, fontSize: 16 }}>×</button>
                  </div>
                </div>
                <div style={{ maxHeight: 300, overflowY: "auto" }}>
                  {liveNotifications.length === 0 ? (
                    <div style={{ padding: "24px 16px", textAlign: "center", color: mutedFg, fontSize: 12 }}>
                      <i className="bi bi-bell" style={{ fontSize: 24, display: "block", marginBottom: 8 }} />
                      No notifications yet — live events will appear here.
                    </div>
                  ) : liveNotifications.map(n => (
                    <div key={n.id} style={{ padding: "12px 16px", borderBottom: `1px solid ${popBd}`, background: n.read ? "transparent" : (isDark ? "rgba(147,197,253,0.05)" : "#F0F9FF"), display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: n.read ? (isDark ? "rgba(255,255,255,0.2)" : "#E5E7EB") : n.dot, flexShrink: 0, marginTop: 5 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: n.read ? 400 : 600, color: isDark ? "rgba(255,255,255,0.85)" : "#374151", lineHeight: 1.4 }}>{n.title}</div>
                        <div style={{ fontSize: 11, color: isDark ? "rgba(255,255,255,0.6)" : "#6B7280", marginTop: 1 }}>{n.body}</div>
                        <div style={{ fontSize: 10, color: mutedFg, marginTop: 3 }}>{n.module} · {n.time}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: "8px 16px", borderTop: `1px solid ${popBd}` }}>
                  <button onClick={markAllRead} style={{ fontSize: 11, color: accentColor, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>Mark all as read</button>
                </div>
              </div>
            )}
          </div>

          {/* Who's online */}
          {otherOnlineUsers.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 0, flexShrink: 0 }} title={`${otherOnlineUsers.length} colleague${otherOnlineUsers.length > 1 ? "s" : ""} online`}>
              {otherOnlineUsers.slice(0, 3).map((u, i) => (
                <div key={u.userId} title={`${u.name} (${u.role})`} style={{
                  width: 24, height: 24, borderRadius: "50%",
                  background: `hsl(${(u.userId * 47) % 360}, 55%, 45%)`,
                  border: `2px solid ${isDark ? "var(--secondary)" : "white"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 8, fontWeight: 700, color: "white",
                  marginLeft: i === 0 ? 0 : -6, position: "relative", zIndex: 3 - i,
                }}>
                  {u.initials}
                </div>
              ))}
              {otherOnlineUsers.length > 3 && (
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: isDark ? "rgba(255,255,255,0.12)" : "#E5E7EB", border: `2px solid ${isDark ? "var(--secondary)" : "white"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: mutedFg, marginLeft: -6 }}>
                  +{otherOnlineUsers.length - 3}
                </div>
              )}
            </div>
          )}

          {/* Live connection dot */}
          <div title={connected ? "Live — real-time active" : "Connecting…"} style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: connected ? "#10B981" : "#9CA3AF", boxShadow: connected ? "0 0 6px #10B981" : "none" }} />

          {/* AI Assistant button */}
          <button onClick={() => { setAiPanelOpen(!aiPanelOpen); setNotifOpen(false); setOrgOpen(false); setRoleOpen(false); setThemeOpen(false); }}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "linear-gradient(135deg, #1e40af, #065f46)", borderRadius: 8, padding: "5px 12px", fontSize: 11, fontWeight: 700, color: "white", cursor: "pointer", border: "none", boxShadow: "0 2px 12px rgba(0,0,0,0.25)", fontFamily: "inherit" }}
            onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
            onMouseLeave={e => (e.currentTarget.style.opacity = "1")}>
            <i className="bi bi-stars" style={{ fontSize: 12 }} />
            AI Assistant
          </button>

          {/* Role chip */}
          <div style={{ position: "relative" }}>
            <button onClick={() => { setRoleOpen(!roleOpen); setOrgOpen(false); setNotifOpen(false); setAiPanelOpen(false); setThemeOpen(false); }}
              style={{ display: "flex", alignItems: "center", gap: 6, background: badgeStyle.bg, border: `1px solid ${badgeStyle.border}`, borderRadius: 20, padding: "4px 12px", fontSize: 11, fontWeight: 700, color: badgeStyle.color, cursor: "pointer", fontFamily: "inherit" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: badgeStyle.color }} />
              {roleLabel}
              <i className="bi bi-chevron-down" style={{ fontSize: 8, opacity: 0.7 }} />
            </button>
            {roleOpen && (
              <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, background: popBg, border: `1px solid ${popBd}`, borderRadius: 12, boxShadow: "0 16px 48px rgba(0,0,0,0.28)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", width: 280, zIndex: 999, overflow: "hidden", maxHeight: 420, display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "10px 14px 6px", fontSize: 9, fontWeight: 700, color: mutedFg, letterSpacing: "0.5px", textTransform: "uppercase", flexShrink: 0 }}>Demo Mode — Switch Role</div>
                <div style={{ overflowY: "auto", flex: 1 }}>
                  {ROLE_DEFINITIONS.map(r => {
                    const active = r.key === effectiveRole;
                    return (
                      <button key={r.key} onClick={() => { setDemoRole(r.key); setRoleOpen(false); }}
                        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 12px", textAlign: "left", background: active ? (isDark ? "rgba(147,197,253,0.10)" : "#EFF6FF") : "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)"}` }}
                        onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = isDark ? "rgba(255,255,255,0.06)" : "#F9FAFB"; }}
                        onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}>
                        <div style={{ width: 30, height: 30, borderRadius: 8, background: r.bgColor, border: `1px solid ${r.borderColor}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>
                          {r.icon}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: active ? 700 : 600, color: active ? r.color : (isDark ? "rgba(255,255,255,0.85)" : "#1F2937"), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</div>
                          <div style={{ fontSize: 9.5, color: mutedFg, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.portalNote ?? r.description}</div>
                        </div>
                        {active && <span style={{ fontSize: 10, color: r.color, flexShrink: 0 }}>✓</span>}
                      </button>
                    );
                  })}
                </div>
                <div style={{ padding: "8px 12px", borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`, flexShrink: 0 }}>
                  <div style={{ fontSize: 9, color: mutedFg }}>
                    Permissions & access rules →{" "}
                    <a href="/settings/rbac" style={{ color: accentColor, fontWeight: 700, textDecoration: "none" }}>RBAC Admin</a>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Logout button */}
          <button
            onClick={handleLogout}
            title="Sign out"
            style={{ display: "flex", alignItems: "center", gap: 5, background: "transparent", border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`, borderRadius: 8, padding: "5px 10px", fontSize: 11, fontWeight: 600, color: mutedFg, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#F87171"; (e.currentTarget as HTMLButtonElement).style.color = "#F87171"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"; (e.currentTarget as HTMLButtonElement).style.color = mutedFg; }}>
            <i className="bi bi-box-arrow-right" style={{ fontSize: 13 }} />
            Sign out
          </button>
        </header>

        {/* ── PAGE CONTENT ──────────────────────────────────────────────── */}
        <main key={viewTenantId} style={{ flex: 1, overflow: "auto", background: "var(--background)", color: "var(--foreground)" }}>
          {children}
        </main>
      </div>

      {/* Click-outside overlay */}
      {(orgOpen || roleOpen || notifOpen || themeOpen) && (
        <div style={{ position: "fixed", inset: 0, zIndex: 90 }} onClick={closeAll} />
      )}

      {/* AI Assistant panel */}
      <AIAssistant open={aiPanelOpen} onClose={() => setAiPanelOpen(false)} />

      {/* Live Activity Feed slide-in */}
      {activityOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200 }} onClick={() => setActivityOpen(false)} />
      )}
      <div style={{
        position: "fixed", top: 0, left: SIDEBAR_W, bottom: 0, zIndex: 201,
        width: activityOpen ? 320 : 0,
        overflow: "hidden",
        transition: "width 0.25s cubic-bezier(0.4,0,0.2,1)",
        pointerEvents: activityOpen ? "auto" : "none",
      }}>
        <div style={{ width: 320, height: "100%", background: isDark ? "rgba(10,18,32,0.97)" : "white", borderRight: `1px solid rgba(255,255,255,0.07)`, backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "14px 16px 10px", borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "var(--border)"}`, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <i className="bi bi-activity" style={{ fontSize: 14, color: "#10B981" }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>Live Activity</span>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: connected ? "#10B981" : "#9CA3AF", boxShadow: connected ? "0 0 5px #10B981" : "none" }} />
              </div>
              <button onClick={() => setActivityOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: mutedFg, fontSize: 18, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ fontSize: 10, color: mutedFg, marginTop: 4 }}>
              {connected ? "Streaming live — updates appear without refresh" : "Reconnecting to live stream…"}
            </div>
          </div>
          {onlineUsers.length > 0 && (
            <div style={{ padding: "8px 16px", borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "var(--border)"}`, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: mutedFg, textTransform: "uppercase", letterSpacing: "0.5px" }}>Online now</span>
              <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                {onlineUsers.slice(0, 6).map((u, i) => (
                  <div key={u.userId} title={`${u.name} (${u.role})`} style={{ width: 22, height: 22, borderRadius: "50%", background: `hsl(${(u.userId * 47) % 360}, 55%, 45%)`, border: `1.5px solid ${isDark ? "rgba(255,255,255,0.1)" : "white"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, fontWeight: 700, color: "white", marginLeft: i === 0 ? 0 : -6, position: "relative", zIndex: 6 - i }}>
                    {u.initials}
                  </div>
                ))}
              </div>
              <span style={{ fontSize: 10, color: mutedFg }}>{onlineUsers.length} active</span>
            </div>
          )}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
            {liveNotifications.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center" }}>
                <i className="bi bi-activity" style={{ fontSize: 32, color: mutedFg, display: "block", marginBottom: 12 }} />
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", marginBottom: 6 }}>Listening for events…</div>
                <div style={{ fontSize: 11, color: mutedFg, lineHeight: 1.5 }}>Domain events (risk updates, control changes, new tickets) will appear here in real time as your team works.</div>
              </div>
            ) : liveNotifications.map(n => (
              <div key={n.id} style={{ padding: "10px 16px", borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.04)" : "#F1F5F9"}`, background: n.read ? "transparent" : (isDark ? "rgba(16,185,129,0.05)" : "#F0FDF4"), display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: n.read ? (isDark ? "rgba(255,255,255,0.15)" : "#D1D5DB") : n.dot, flexShrink: 0, marginTop: 5 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: n.read ? 400 : 600, color: isDark ? "rgba(255,255,255,0.85)" : "#1F2937", lineHeight: 1.4 }}>{n.title}</div>
                  {n.body && n.body !== n.title && (
                    <div style={{ fontSize: 11, color: isDark ? "rgba(255,255,255,0.5)" : "#6B7280", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.body}</div>
                  )}
                  <div style={{ fontSize: 9, color: mutedFg, marginTop: 3, display: "flex", gap: 6 }}>
                    <span style={{ background: isDark ? "rgba(255,255,255,0.07)" : "#F3F4F6", borderRadius: 4, padding: "1px 5px" }}>{n.module}</span>
                    <span>{n.time}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {liveNotifications.length > 0 && (
            <div style={{ padding: "8px 16px", borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "var(--border)"}`, flexShrink: 0 }}>
              <button onClick={markAllRead} style={{ fontSize: 11, color: accentColor, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>Mark all as read</button>
            </div>
          )}
        </div>
      </div>

      {/* Add Organisation modal */}
      {addOrgOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}
          onClick={e => { if (e.target === e.currentTarget) { setAddOrgOpen(false); setAddError(""); } }}>
          <div style={{ background: isDark ? "rgb(14,22,34)" : "white", border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "#E2E8F0"}`, borderRadius: 14, width: 480, boxShadow: "0 32px 80px rgba(0,0,0,0.8)", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            <div style={{ padding: "20px 24px 14px", borderBottom: `1px solid ${isDark ? "var(--border)" : "#F1F5F9"}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 12, color: isDark ? "var(--muted-foreground)" : "#94A3B8", marginBottom: 2 }}>Super Admin</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: isDark ? "white" : "#0F172A" }}>Add New Organisation</div>
              </div>
              <button onClick={() => { setAddOrgOpen(false); setAddError(""); }}
                style={{ background: isDark ? "var(--border)" : "#F1F5F9", border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "#E2E8F0"}`, borderRadius: 6, width: 28, height: 28, cursor: "pointer", color: isDark ? "var(--muted-foreground)" : "#64748B", fontSize: 14 }}>
                ✕
              </button>
            </div>
            <div style={{ padding: "18px 24px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                { label: "Organisation Name", key: "name", placeholder: "e.g. Acme Corp", required: true },
                { label: "Slug", key: "slug", placeholder: "e.g. acme-corp (lowercase, no spaces)", required: true },
                { label: "Domain", key: "domain", placeholder: "e.g. acme.com", required: false },
              ].map(f => (
                <div key={f.key}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: isDark ? "var(--muted-foreground)" : "#64748B", marginBottom: 5, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                    {f.label}{f.required && <span style={{ color: "#EF4444" }}> *</span>}
                  </div>
                  <input
                    value={(addForm as Record<string, string>)[f.key]}
                    onChange={e => setAddForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    style={{ width: "100%", boxSizing: "border-box", background: isDark ? "var(--secondary)" : "#F8FAFC", border: `1px solid ${isDark ? "rgba(255,255,255,0.10)" : "#CBD5E1"}`, borderRadius: 8, padding: "8px 12px", fontSize: 12, color: isDark ? "var(--foreground)" : "#0F172A", outline: "none", fontFamily: "inherit" }}
                  />
                </div>
              ))}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: isDark ? "var(--muted-foreground)" : "#64748B", marginBottom: 5, letterSpacing: "0.05em", textTransform: "uppercase" }}>Plan</div>
                <select value={addForm.plan} onChange={e => setAddForm(prev => ({ ...prev, plan: e.target.value }))}
                  style={{ width: "100%", background: isDark ? "var(--secondary)" : "#F8FAFC", border: `1px solid ${isDark ? "rgba(255,255,255,0.10)" : "#CBD5E1"}`, borderRadius: 8, padding: "8px 12px", fontSize: 12, color: isDark ? "var(--foreground)" : "#0F172A", outline: "none", fontFamily: "inherit" }}>
                  {["starter", "pro", "enterprise"].map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
              {addError && (
                <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 7, padding: "8px 12px", fontSize: 12, color: "#EF4444" }}>{addError}</div>
              )}
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
                <button onClick={() => { setAddOrgOpen(false); setAddError(""); }}
                  style={{ background: isDark ? "var(--border)" : "#F1F5F9", border: `1px solid ${isDark ? "rgba(255,255,255,0.10)" : "#E2E8F0"}`, borderRadius: 8, padding: "8px 16px", fontSize: 12, color: isDark ? "rgba(148,163,184,0.8)" : "#64748B", cursor: "pointer", fontFamily: "inherit" }}>
                  Cancel
                </button>
                <button onClick={handleAddOrg} disabled={addSaving}
                  style={{ background: "linear-gradient(135deg, #1E3A5F, #065F46)", border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 12, fontWeight: 700, color: "white", cursor: addSaving ? "not-allowed" : "pointer", opacity: addSaving ? 0.6 : 1, fontFamily: "inherit" }}>
                  {addSaving ? "Creating…" : "Create Organisation"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {upgradeFeature && (
        <UpgradeModal feature={upgradeFeature} plan={plan} onClose={() => setUpgradeFeature(null)} />
      )}
    </div>
  );
}
