// @ts-nocheck
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { ModuleHeader, SubNav } from "@/components/SubNav";
import {
  ROLE_DEFINITIONS,
  ALL_MODULES,
  loadOverrides,
  saveOverrides,
  type Permission,
  type RoleDefinition,
  type RolePermissionMap,
} from "@/lib/rbac-config";

const PERMISSION_LEVELS: Permission[] = ["none", "read", "write", "admin"];

const PERM_COLORS: Record<Permission, { bg: string; color: string; border: string; label: string }> = {
  none:  { bg: "rgba(107,114,128,0.08)", color: "#6B7280", border: "#E5E7EB",  label: "No Access" },
  read:  { bg: "rgba(59,130,246,0.08)",  color: "#1D4ED8", border: "#BFDBFE",  label: "Read Only" },
  write: { bg: "rgba(245,158,11,0.08)",  color: "#D97706", border: "#FDE68A",  label: "Read & Write" },
  admin: { bg: "rgba(16,185,129,0.08)",  color: "#065F46", border: "#A7F3D0",  label: "Full Admin" },
};

function PermToggle({ value, onChange }: { value: Permission; onChange: (p: Permission) => void }) {
  const s = PERM_COLORS[value];
  const nextIdx = (PERMISSION_LEVELS.indexOf(value) + 1) % PERMISSION_LEVELS.length;
  const next = PERMISSION_LEVELS[nextIdx];
  const nextS = PERM_COLORS[next];

  return (
    <button
      onClick={() => onChange(next)}
      title={`Click to change to: ${nextS.label}`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "3px 10px", borderRadius: 6, cursor: "pointer",
        background: s.bg, color: s.color, border: `1px solid ${s.border}`,
        fontSize: 10, fontWeight: 700, fontFamily: "inherit",
        transition: "all 0.15s", whiteSpace: "nowrap",
        minWidth: 88, justifyContent: "center",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.filter = "brightness(0.9)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.filter = ""; }}
    >
      {value === "none" ? "⊘" : value === "read" ? "👁" : value === "write" ? "✏️" : "⚡"}
      {" "}{s.label}
    </button>
  );
}

function RoleCard({
  role,
  isSelected,
  onClick,
}: {
  role: RoleDefinition;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
        background: isSelected ? `${role.bgColor}` : "var(--card)",
        border: `1px solid ${isSelected ? role.borderColor : "var(--border)"}`,
        borderRadius: 10, cursor: "pointer", textAlign: "left", width: "100%",
        fontFamily: "inherit", transition: "all 0.15s",
        boxShadow: isSelected ? `0 0 0 2px ${role.borderColor}` : "none",
      }}
      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.borderColor = role.borderColor; }}
      onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 10, background: role.bgColor,
        border: `1px solid ${role.borderColor}`, display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: 16, flexShrink: 0,
      }}>
        {role.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: isSelected ? role.color : "var(--foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {role.label}
        </div>
        <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {role.portalNote ?? role.description.slice(0, 36)}
        </div>
      </div>
      {isSelected && <span style={{ fontSize: 12, color: role.color, flexShrink: 0 }}>›</span>}
    </button>
  );
}

function ModulePermissionRow({
  module,
  permission,
  isDefault,
  onChange,
}: {
  module: typeof ALL_MODULES[number];
  permission: Permission;
  isDefault: boolean;
  onChange: (p: Permission) => void;
}) {
  const catColors: Record<string, string> = {
    "Platform": "#6366F1",
    "Governance": "#0891B2",
    "Risk & Audit": "#D97706",
    "Service Management": "#7C3AED",
    "Security": "#DC2626",
    "Privacy": "#059669",
    "Analytics": "#1D4ED8",
    "AI": "#7C3AED",
    "People & Culture": "#0891B2",
    "Third Party": "#D97706",
  };
  const catColor = catColors[module.category] ?? "#6B7280";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
      borderBottom: "1px solid var(--border)", background: "var(--card)",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
            background: `${catColor}14`, color: catColor, border: `1px solid ${catColor}30`,
          }}>
            {module.category}
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--foreground)" }}>{module.label}</span>
          {!isDefault && (
            <span style={{ fontSize: 9, color: "#D97706", fontWeight: 700, background: "rgba(245,158,11,0.1)", padding: "1px 5px", borderRadius: 3, border: "1px solid #FDE68A" }}>
              CUSTOM
            </span>
          )}
        </div>
        <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 2, fontFamily: "'JetBrains Mono',monospace" }}>
          /{module.id}
        </div>
      </div>
      <PermToggle value={permission} onChange={onChange} />
    </div>
  );
}

export default function RBACAdmin() {
  const { user } = useAuth();
  const [selectedRoleKey, setSelectedRoleKey] = useState<string>("tenant_admin");
  const [overrides, setOverrides] = useState<Record<string, Partial<RolePermissionMap>>>({});
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<"matrix" | "roles" | "audit">("roles");
  const [roleSearch, setRoleSearch] = useState("");
  const [matrixSearch, setMatrixSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("All");

  const canEdit = user?.role === "super_admin" || user?.role === "tenant_admin";

  useEffect(() => {
    setOverrides(loadOverrides());
  }, []);

  const selectedRole = ROLE_DEFINITIONS.find(r => r.key === selectedRoleKey) ?? ROLE_DEFINITIONS[0]!;

  function getEffectivePerm(roleKey: string, moduleId: string): Permission {
    const roleOvr = overrides[roleKey];
    if (roleOvr && (roleOvr as any)[moduleId] !== undefined) {
      return (roleOvr as any)[moduleId] as Permission;
    }
    const roleDef = ROLE_DEFINITIONS.find(r => r.key === roleKey);
    return (roleDef?.permissions as any)?.[moduleId] ?? "none";
  }

  function isDefaultPerm(roleKey: string, moduleId: string): boolean {
    const roleOvr = overrides[roleKey];
    return !roleOvr || (roleOvr as any)[moduleId] === undefined;
  }

  function handlePermChange(moduleId: string, perm: Permission) {
    if (!canEdit) return;
    const roleDef = ROLE_DEFINITIONS.find(r => r.key === selectedRoleKey);
    const defaultPerm = (roleDef?.permissions as any)?.[moduleId] ?? "none";

    setOverrides(prev => {
      const next = { ...prev };
      if (!next[selectedRoleKey]) next[selectedRoleKey] = {};
      if (perm === defaultPerm) {
        // Remove override if reverting to default
        const { [moduleId]: _, ...rest } = next[selectedRoleKey] as any;
        if (Object.keys(rest).length === 0) {
          const { [selectedRoleKey]: __, ...others } = next;
          return others;
        }
        next[selectedRoleKey] = rest;
      } else {
        next[selectedRoleKey] = { ...(next[selectedRoleKey] as any), [moduleId]: perm };
      }
      return next;
    });
    setSaved(false);
  }

  function handleSave() {
    saveOverrides(overrides);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    // Dispatch custom event so Shell.tsx picks up the change
    window.dispatchEvent(new Event("rbac-updated"));
  }

  function handleResetRole() {
    if (!canEdit) return;
    setOverrides(prev => {
      const next = { ...prev };
      delete next[selectedRoleKey];
      return next;
    });
    setSaved(false);
  }

  const filteredRoles = ROLE_DEFINITIONS.filter(r =>
    !roleSearch || r.label.toLowerCase().includes(roleSearch.toLowerCase()) || r.description.toLowerCase().includes(roleSearch.toLowerCase())
  );

  const categories = ["All", ...Array.from(new Set(ALL_MODULES.map(m => m.category)))];
  const filteredModules = ALL_MODULES.filter(m => {
    if (catFilter !== "All" && m.category !== catFilter) return false;
    if (matrixSearch && !m.label.toLowerCase().includes(matrixSearch.toLowerCase())) return false;
    return true;
  });

  const customizedCount = Object.keys(overrides[selectedRoleKey] ?? {}).length;

  // Calculate stats for overview
  const stats = ROLE_DEFINITIONS.map(r => {
    const ovr = overrides[r.key] ?? {};
    const customCount = Object.keys(ovr).length;
    const totalModules = ALL_MODULES.length;
    const accessCount = ALL_MODULES.filter(m => getEffectivePerm(r.key, m.id) !== "none").length;
    return { role: r, customCount, accessCount, totalModules };
  });

  const tabs = [
    { key: "roles",  label: "Role Configuration" },
    { key: "matrix", label: "Permission Matrix" },
    { key: "audit",  label: "Change Log" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <ModuleHeader
        title="RBAC — Role-Based Access Control"
        description="Configure granular module permissions for each role. Changes apply instantly on save."
        action={canEdit ? { label: saved ? "✓ Saved!" : "💾 Save Changes", onClick: handleSave } : undefined}
      />

      <SubNav tabs={tabs} active={tab} onSelect={(k: any) => setTab(k)} />

      <div style={{ flex: 1, overflow: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ── OVERVIEW CARDS ─────────────────────────────────────────────── */}
        {tab === "roles" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Stats row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {[
                { label: "Total Roles", value: ROLE_DEFINITIONS.length, color: "#1D4ED8", bg: "#EFF6FF", bd: "#BFDBFE" },
                { label: "Customized Roles", value: Object.keys(overrides).length, color: "#D97706", bg: "#FFFBEB", bd: "#FDE68A" },
                { label: "Total Modules", value: ALL_MODULES.length, color: "#065F46", bg: "#ECFDF5", bd: "#A7F3D0" },
                { label: "Special Portals", value: ROLE_DEFINITIONS.filter(r => r.isSpecialPortal).length, color: "#7C3AED", bg: "#F5F3FF", bd: "#C4B5FD" },
              ].map(k => (
                <div key={k.label} style={{ background: k.bg, border: `1px solid ${k.bd}`, borderRadius: 12, padding: "16px 20px" }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: k.color, fontFamily: "'JetBrains Mono',monospace" }}>{k.value}</div>
                  <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 4 }}>{k.label}</div>
                </div>
              ))}
            </div>

            {/* Two-column layout: role list + detail */}
            <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16, alignItems: "start" }}>

              {/* Left: role list */}
              <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
                  <input value={roleSearch} onChange={e => setRoleSearch(e.target.value)}
                    placeholder="Search roles…"
                    style={{ width: "100%", padding: "7px 10px", background: "var(--input)", border: "1px solid var(--border)", borderRadius: 7, color: "var(--foreground)", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {filteredRoles.map(role => (
                    <div key={role.key} style={{ padding: "6px 10px", borderBottom: "1px solid var(--border)" }}>
                      <RoleCard
                        role={role}
                        isSelected={selectedRoleKey === role.key}
                        onClick={() => setSelectedRoleKey(role.key)}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: role detail + module permissions */}
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                {/* Role header */}
                <div style={{
                  background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12,
                  padding: "20px 24px",
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      <div style={{
                        width: 56, height: 56, borderRadius: 14,
                        background: selectedRole.bgColor, border: `2px solid ${selectedRole.borderColor}`,
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24,
                      }}>
                        {selectedRole.icon}
                      </div>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                          <h2 style={{ fontSize: 18, fontWeight: 800, color: selectedRole.color, margin: 0 }}>{selectedRole.label}</h2>
                          {selectedRole.isSpecialPortal && (
                            <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: "#F5F3FF", color: "#7C3AED", border: "1px solid #C4B5FD" }}>PORTAL ROLE</span>
                          )}
                          {customizedCount > 0 && (
                            <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: "rgba(245,158,11,0.1)", color: "#D97706", border: "1px solid #FDE68A" }}>
                              {customizedCount} CUSTOMIZED
                            </span>
                          )}
                        </div>
                        <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: 0, lineHeight: 1.5 }}>{selectedRole.description}</p>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      {customizedCount > 0 && canEdit && (
                        <button onClick={handleResetRole} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #FECACA", background: "#FEF2F2", color: "#DC2626", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                          ↩ Reset to Default
                        </button>
                      )}
                      {canEdit && (
                        <button onClick={handleSave} style={{ padding: "7px 20px", borderRadius: 8, border: "none", background: saved ? "#059669" : "#1D4ED8", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "background 0.2s" }}>
                          {saved ? "✓ Saved!" : "Save Changes"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Access summary */}
                  <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                    {(["admin", "write", "read", "none"] as Permission[]).map(p => {
                      const count = ALL_MODULES.filter(m => getEffectivePerm(selectedRoleKey, m.id) === p).length;
                      const s = PERM_COLORS[p];
                      return (
                        <div key={p} style={{ display: "flex", alignItems: "center", gap: 6, background: s.bg, border: `1px solid ${s.border}`, borderRadius: 8, padding: "6px 12px" }}>
                          <span style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{count}</span>
                          <span style={{ fontSize: 10, color: s.color, fontWeight: 700 }}>{s.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Permission matrix for selected role */}
                <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "var(--foreground)" }}>Module Permissions</span>
                    <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                      {["All", ...Array.from(new Set(ALL_MODULES.map(m => m.category)))].map(cat => (
                        <button key={cat} onClick={() => setCatFilter(cat)}
                          style={{ padding: "3px 10px", borderRadius: 6, border: `1px solid ${catFilter === cat ? "#3B82F6" : "var(--border)"}`, background: catFilter === cat ? "#EFF6FF" : "var(--card)", color: catFilter === cat ? "#1D4ED8" : "var(--muted-foreground)", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  {!canEdit && (
                    <div style={{ padding: "10px 16px", background: "rgba(245,158,11,0.06)", borderBottom: "1px solid #FDE68A", fontSize: 11, color: "#92400E", display: "flex", alignItems: "center", gap: 8 }}>
                      <span>⚠️</span>
                      <span>You have read-only access. Only Super Admin or Tenant Admin can modify role permissions.</span>
                    </div>
                  )}

                  <div>
                    {ALL_MODULES.filter(m => catFilter === "All" || m.category === catFilter).map(module => (
                      <ModulePermissionRow
                        key={module.id}
                        module={module}
                        permission={getEffectivePerm(selectedRoleKey, module.id)}
                        isDefault={isDefaultPerm(selectedRoleKey, module.id)}
                        onChange={p => handlePermChange(module.id, p)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── PERMISSION MATRIX (all roles × all modules) ────────────────── */}
        {tab === "matrix" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input value={matrixSearch} onChange={e => setMatrixSearch(e.target.value)}
                placeholder="Filter modules…"
                style={{ padding: "8px 12px", background: "var(--input)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--foreground)", fontSize: 12, outline: "none", width: 240 }} />
              <div style={{ display: "flex", gap: 6 }}>
                {categories.map(cat => (
                  <button key={cat} onClick={() => setCatFilter(cat)}
                    style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${catFilter === cat ? "#3B82F6" : "var(--border)"}`, background: catFilter === cat ? "#EFF6FF" : "var(--card)", color: catFilter === cat ? "#1D4ED8" : "var(--muted-foreground)", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ overflowX: "auto", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, tableLayout: "fixed" }}>
                <thead>
                  <tr style={{ background: "var(--secondary)" }}>
                    <th style={{ width: 160, padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", borderBottom: "1px solid var(--border)", position: "sticky", left: 0, background: "var(--secondary)", zIndex: 2 }}>Module</th>
                    {ROLE_DEFINITIONS.map(r => (
                      <th key={r.key} style={{ padding: "10px 6px", textAlign: "center", borderBottom: "1px solid var(--border)", minWidth: 80 }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <span style={{ fontSize: 14 }}>{r.icon}</span>
                          <span style={{ fontSize: 9, fontWeight: 700, color: r.color, lineHeight: 1.2 }}>{r.label.split(" ").slice(0, 2).join(" ")}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredModules.map((m, i) => (
                    <tr key={m.id} style={{ background: i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.015)" }}>
                      <td style={{ padding: "8px 16px", borderBottom: "1px solid var(--border)", position: "sticky", left: 0, background: i % 2 === 0 ? "var(--card)" : "var(--secondary)", zIndex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--foreground)" }}>{m.label}</div>
                        <div style={{ fontSize: 9, color: "var(--muted-foreground)" }}>{m.category}</div>
                      </td>
                      {ROLE_DEFINITIONS.map(r => {
                        const perm = getEffectivePerm(r.key, m.id);
                        const s = PERM_COLORS[perm];
                        const isOvr = !isDefaultPerm(r.key, m.id);
                        return (
                          <td key={r.key} style={{ padding: "4px", textAlign: "center", borderBottom: "1px solid var(--border)" }}>
                            <span style={{
                              display: "inline-block", padding: "2px 6px", borderRadius: 4, fontSize: 9, fontWeight: 700,
                              background: s.bg, color: s.color, border: `1px solid ${isOvr ? "#F59E0B" : s.border}`,
                              cursor: canEdit ? "pointer" : "default",
                            }}
                              title={`${r.label}: ${s.label}${isOvr ? " (customized)" : ""}`}
                              onClick={() => { if (canEdit) { setSelectedRoleKey(r.key); setTab("roles"); } }}>
                              {perm === "none" ? "—" : perm === "read" ? "R" : perm === "write" ? "R/W" : "★"}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div style={{ display: "flex", gap: 16, alignItems: "center", padding: "8px 0" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)" }}>LEGEND:</span>
              {(["none", "read", "write", "admin"] as Permission[]).map(p => {
                const s = PERM_COLORS[p];
                const abbrev = p === "none" ? "—" : p === "read" ? "R" : p === "write" ? "R/W" : "★";
                return (
                  <div key={p} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ display: "inline-block", padding: "2px 6px", borderRadius: 4, fontSize: 9, fontWeight: 700, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>{abbrev}</span>
                    <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{s.label}</span>
                  </div>
                );
              })}
              <span style={{ fontSize: 10, color: "var(--muted-foreground)", marginLeft: 8 }}>
                <span style={{ display: "inline-block", padding: "2px 6px", borderRadius: 4, background: "rgba(245,158,11,0.1)", border: "1px solid #F59E0B", fontSize: 9 }}>—</span>
                {" "}= Admin customized
              </span>
            </div>
          </div>
        )}

        {/* ── CHANGE LOG (audit trail of customizations) ─────────────────── */}
        {tab === "audit" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: "var(--foreground)" }}>Customization Log</span>
                <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
                  {Object.values(overrides).reduce((s, v) => s + Object.keys(v ?? {}).length, 0)} total overrides across {Object.keys(overrides).length} roles
                </span>
              </div>

              {Object.keys(overrides).length === 0 ? (
                <div style={{ padding: "48px 24px", textAlign: "center" }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--foreground)", marginBottom: 6 }}>No customizations yet</div>
                  <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Default role permissions are in use. Use the Role Configuration tab to customize access.</div>
                </div>
              ) : (
                <div>
                  {Object.entries(overrides).map(([roleKey, mods]) => {
                    const roleDef = ROLE_DEFINITIONS.find(r => r.key === roleKey);
                    if (!roleDef || !mods || Object.keys(mods).length === 0) return null;
                    return (
                      <div key={roleKey} style={{ borderBottom: "1px solid var(--border)" }}>
                        <div style={{ padding: "12px 20px", background: "var(--secondary)", display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 16 }}>{roleDef.icon}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: roleDef.color }}>{roleDef.label}</span>
                          <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>— {Object.keys(mods).length} customized permission{Object.keys(mods).length !== 1 ? "s" : ""}</span>
                          <button onClick={() => { setSelectedRoleKey(roleKey); setTab("roles"); }}
                            style={{ marginLeft: "auto", fontSize: 11, color: "#1D4ED8", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>
                            Edit →
                          </button>
                        </div>
                        {Object.entries(mods).map(([modId, perm]) => {
                          const mod = ALL_MODULES.find(m => m.id === modId);
                          const roleDef2 = ROLE_DEFINITIONS.find(r => r.key === roleKey);
                          const defaultPerm = (roleDef2?.permissions as any)?.[modId] ?? "none";
                          const s = PERM_COLORS[perm as Permission];
                          const ds = PERM_COLORS[defaultPerm as Permission];
                          return (
                            <div key={modId} style={{ padding: "10px 20px 10px 48px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid var(--border)" }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--foreground)", flex: 1 }}>{mod?.label ?? modId}</span>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: ds.bg, color: ds.color, border: `1px solid ${ds.border}`, fontWeight: 700 }}>{ds.label}</span>
                                <span style={{ color: "var(--muted-foreground)" }}>→</span>
                                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: s.bg, color: s.color, border: `1px solid ${s.border}`, fontWeight: 700 }}>{s.label}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Full role access summary table */}
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: "var(--foreground)" }}>Role Access Summary</span>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--secondary)" }}>
                    {["Role", "Module Access", "Admin", "Write", "Read", "No Access", "Customized"].map(h => (
                      <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", borderBottom: "1px solid var(--border)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stats.map(({ role, customCount, accessCount }) => {
                    const admin = ALL_MODULES.filter(m => getEffectivePerm(role.key, m.id) === "admin").length;
                    const write = ALL_MODULES.filter(m => getEffectivePerm(role.key, m.id) === "write").length;
                    const read = ALL_MODULES.filter(m => getEffectivePerm(role.key, m.id) === "read").length;
                    const none = ALL_MODULES.filter(m => getEffectivePerm(role.key, m.id) === "none").length;
                    return (
                      <tr key={role.key} style={{ cursor: "pointer" }} onClick={() => { setSelectedRoleKey(role.key); setTab("roles"); }}
                        onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "var(--secondary)"}
                        onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ""}>
                        <td style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 14 }}>{role.icon}</span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: role.color }}>{role.label}</span>
                          </div>
                        </td>
                        <td style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ height: 6, width: `${(accessCount / ALL_MODULES.length) * 80}px`, background: role.color, borderRadius: 3, maxWidth: 80 }} />
                            <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{accessCount}/{ALL_MODULES.length}</span>
                          </div>
                        </td>
                        <td style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", fontSize: 12, fontWeight: 700, color: PERM_COLORS.admin.color }}>{admin}</td>
                        <td style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", fontSize: 12, fontWeight: 700, color: PERM_COLORS.write.color }}>{write}</td>
                        <td style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", fontSize: 12, fontWeight: 700, color: PERM_COLORS.read.color }}>{read}</td>
                        <td style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", fontSize: 12, fontWeight: 700, color: PERM_COLORS.none.color }}>{none}</td>
                        <td style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
                          {customCount > 0 ? (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: "rgba(245,158,11,0.1)", color: "#D97706", border: "1px solid #FDE68A" }}>
                              {customCount} overrides
                            </span>
                          ) : (
                            <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>Default</span>
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
      </div>
    </div>
  );
}
