/**
 * Comprehensive RBAC Configuration
 * Single source of truth for all roles, their descriptions, module access,
 * and per-module permission levels (none | read | write | admin).
 */

// ── Permission levels ─────────────────────────────────────────────────────────

export type Permission = "none" | "read" | "write" | "admin";

// ── Module definitions (must match ids in lib/data.ts modules array) ──────────

export const ALL_MODULES = [
  { id: "home",          label: "Home",            category: "Platform" },
  { id: "govops",        label: "GovOps",           category: "Governance" },
  { id: "riskops",       label: "RiskOps",          category: "Risk & Audit" },
  { id: "complianceops", label: "ComplianceOps",    category: "Risk & Audit" },
  { id: "serviceops",    label: "ServiceOps",       category: "Service Management" },
  { id: "secops",        label: "SecOps",           category: "Security" },
  { id: "assetops",      label: "AssetOps",         category: "Security" },
  { id: "cloudops",      label: "CloudOps",         category: "Security" },
  { id: "aisecops",      label: "AISecOps",         category: "Security" },
  { id: "privacyops",    label: "PrivacyOps",       category: "Privacy" },
  { id: "dataops",       label: "DataOps",          category: "Privacy" },
  { id: "analyticsops",  label: "AnalyticsOps",     category: "Analytics" },
  { id: "ai",            label: "AI vCISO",         category: "AI" },
  { id: "peopleops",     label: "PeopleOps",        category: "People & Culture" },
  { id: "workflows",     label: "Workflows",        category: "Platform" },
  { id: "vendor-portal", label: "Vendor Portal",    category: "Third Party" },
  { id: "settings",      label: "Settings",         category: "Platform" },
] as const;

export type ModuleId = typeof ALL_MODULES[number]["id"];

// ── Role permission map type ──────────────────────────────────────────────────

export type RolePermissionMap = Record<ModuleId, Permission>;

// Helper to build a permission map with defaults
function makePerms(
  allow: Partial<Record<ModuleId, Permission>>,
  defaultPerm: Permission = "none"
): RolePermissionMap {
  const map: Record<string, Permission> = {};
  for (const m of ALL_MODULES) map[m.id] = defaultPerm;
  for (const [k, v] of Object.entries(allow)) map[k] = v!;
  return map as RolePermissionMap;
}

// ── Role definition ───────────────────────────────────────────────────────────

export interface RoleDefinition {
  key: string;
  label: string;
  description: string;
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
  moduleAccess: string[];             // sidebar module ids — what appears in nav
  permissions: RolePermissionMap;      // granular per-module permission level
  portalNote?: string;                 // short blurb shown in role switcher
  isSpecialPortal?: boolean;           // true = has a custom portal view
}

// ── Role definitions ──────────────────────────────────────────────────────────

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    key: "super_admin",
    label: "Super Admin",
    description: "Full platform control across all tenants",
    icon: "◈",
    color: "#7C3AED",
    bgColor: "#F5F3FF",
    borderColor: "#C4B5FD",
    portalNote: "Full platform control",
    moduleAccess: ["home","govops","riskops","complianceops","serviceops","secops","assetops","cloudops","aisecops","privacyops","dataops","analyticsops","ai","peopleops","workflows","vendor-portal","settings"],
    permissions: makePerms({ home:"admin", govops:"admin", riskops:"admin", complianceops:"admin", serviceops:"admin", secops:"admin", assetops:"admin", cloudops:"admin", aisecops:"admin", privacyops:"admin", dataops:"admin", analyticsops:"admin", ai:"admin", peopleops:"admin", workflows:"admin", "vendor-portal":"admin", settings:"admin" }),
  },
  {
    key: "tenant_admin",
    label: "Tenant Admin",
    description: "Full access within tenant — user & config management",
    icon: "🏛",
    color: "#1D4ED8",
    bgColor: "#EFF6FF",
    borderColor: "#BFDBFE",
    portalNote: "Tenant management",
    moduleAccess: ["home","govops","riskops","complianceops","serviceops","secops","assetops","cloudops","aisecops","privacyops","dataops","analyticsops","ai","peopleops","workflows","vendor-portal","settings"],
    permissions: makePerms({ home:"admin", govops:"write", riskops:"write", complianceops:"write", serviceops:"write", secops:"write", assetops:"write", cloudops:"write", aisecops:"admin", privacyops:"write", dataops:"write", analyticsops:"write", ai:"write", peopleops:"write", workflows:"write", "vendor-portal":"write", settings:"admin" }),
  },
  {
    key: "board_management",
    label: "Board & Sr Mgmt",
    description: "Executive board portal — governance oversight only",
    icon: "🏦",
    color: "#0369A1",
    bgColor: "#F0F9FF",
    borderColor: "#BAE6FD",
    portalNote: "Board Portal only",
    isSpecialPortal: true,
    moduleAccess: ["home","govops","analyticsops"],
    permissions: makePerms({ home:"read", govops:"read", analyticsops:"read" }),
  },
  {
    key: "ethics_officer",
    label: "Ethics Officer",
    description: "Ethics & conduct investigations and policy oversight",
    icon: "⚖️",
    color: "#065F46",
    bgColor: "#ECFDF5",
    borderColor: "#A7F3D0",
    portalNote: "EthicsOps only",
    isSpecialPortal: true,
    moduleAccess: ["home","govops","peopleops"],
    permissions: makePerms({ home:"read", govops:"read", peopleops:"admin" }),
  },
  {
    key: "ciso",
    label: "CISO",
    description: "Chief Information Security Officer — GovOps + SecOps",
    icon: "🛡",
    color: "#1D4ED8",
    bgColor: "#EFF6FF",
    borderColor: "#BFDBFE",
    portalNote: "GovOps + SecOps",
    moduleAccess: ["home","govops","riskops","complianceops","secops","assetops","cloudops","aisecops","privacyops","analyticsops","ai","peopleops","workflows"],
    permissions: makePerms({ home:"read", govops:"write", riskops:"write", complianceops:"write", secops:"admin", assetops:"write", cloudops:"write", aisecops:"admin", privacyops:"read", analyticsops:"read", ai:"write", peopleops:"read", workflows:"write" }),
  },
  {
    key: "cro",
    label: "CRO",
    description: "Chief Risk Officer — GovOps + RiskOps",
    icon: "⚠️",
    color: "#D97706",
    bgColor: "#FFFBEB",
    borderColor: "#FDE68A",
    portalNote: "GovOps + RiskOps",
    moduleAccess: ["home","govops","riskops","complianceops","analyticsops","workflows"],
    permissions: makePerms({ home:"read", govops:"write", riskops:"admin", complianceops:"read", analyticsops:"read", workflows:"write" }),
  },
  {
    key: "cdpo",
    label: "CDPO",
    description: "Chief Data Protection Officer — GovOps + ComplianceOps + PrivacyOps",
    icon: "🔏",
    color: "#7C3AED",
    bgColor: "#F5F3FF",
    borderColor: "#C4B5FD",
    portalNote: "GovOps + ComplianceOps + PrivacyOps",
    moduleAccess: ["home","govops","complianceops","privacyops","dataops","analyticsops","workflows"],
    permissions: makePerms({ home:"read", govops:"write", complianceops:"write", privacyops:"admin", dataops:"write", analyticsops:"read", workflows:"write" }),
  },
  {
    key: "chro",
    label: "CHRO",
    description: "Chief Human Resources Officer — GovOps + PeopleOps only",
    icon: "👥",
    color: "#0891B2",
    bgColor: "#ECFEFF",
    borderColor: "#A5F3FC",
    portalNote: "GovOps only",
    moduleAccess: ["home","govops","peopleops","workflows"],
    permissions: makePerms({ home:"read", govops:"read", peopleops:"admin", workflows:"write" }),
  },
  {
    key: "internal_auditor",
    label: "Internal Auditor",
    description: "Audit, Findings & Compliance Oversight — GovOps + AuditOps",
    icon: "📋",
    color: "#065F46",
    bgColor: "#ECFDF5",
    borderColor: "#A7F3D0",
    portalNote: "GovOps + AuditOps",
    isSpecialPortal: true,
    moduleAccess: ["home","govops","complianceops","riskops"],
    permissions: makePerms({ home:"read", govops:"read", complianceops:"write", riskops:"read" }),
  },
  {
    key: "external_auditor",
    label: "External Auditor",
    description: "Read-only access for independent audit & assurance",
    icon: "🔍",
    color: "#6B7280",
    bgColor: "#F9FAFB",
    borderColor: "#E5E7EB",
    portalNote: "Read-only audit",
    isSpecialPortal: true,
    moduleAccess: ["home","govops","complianceops"],
    permissions: makePerms({ home:"read", govops:"read", complianceops:"read" }),
  },
  {
    key: "vendor",
    label: "Vendor",
    description: "Third-party vendor portal — submissions, evidence & agreements",
    icon: "🤝",
    color: "#D97706",
    bgColor: "#FFFBEB",
    borderColor: "#FDE68A",
    portalNote: "Vendor portal",
    isSpecialPortal: true,
    moduleAccess: ["home","vendor-portal"],
    permissions: makePerms({ home:"read", "vendor-portal":"write" }),
  },
  {
    key: "employee",
    label: "Employee",
    description: "Self-service portal for policies, training & reporting",
    icon: "👤",
    color: "#059669",
    bgColor: "#ECFDF5",
    borderColor: "#A7F3D0",
    portalNote: "Employee portal",
    isSpecialPortal: true,
    moduleAccess: ["home","serviceops"],
    permissions: makePerms({ home:"read", serviceops:"write" }),
  },
  {
    key: "service_desk_tech",
    label: "Service Desk Technician",
    description: "Ticket queue management and incident resolution",
    icon: "🎧",
    color: "#0891B2",
    bgColor: "#ECFEFF",
    borderColor: "#A5F3FC",
    portalNote: "ServiceOps ticket management",
    isSpecialPortal: true,
    moduleAccess: ["home","serviceops"],
    permissions: makePerms({ home:"read", serviceops:"admin" }),
  },
  {
    key: "cab_member",
    label: "CAB Committee Member",
    description: "Change advisory board — review and vote on change requests",
    icon: "🗳️",
    color: "#7C3AED",
    bgColor: "#F5F3FF",
    borderColor: "#C4B5FD",
    portalNote: "Change advisory board voting",
    isSpecialPortal: true,
    moduleAccess: ["home","serviceops"],
    permissions: makePerms({ home:"read", serviceops:"read" }),
  },
  {
    key: "management",
    label: "Management",
    description: "Broad oversight across governance, risk & compliance",
    icon: "📊",
    color: "#374151",
    bgColor: "#F9FAFB",
    borderColor: "#E5E7EB",
    portalNote: "Board Portal + oversight",
    moduleAccess: ["home","govops","riskops","complianceops","analyticsops","workflows"],
    permissions: makePerms({ home:"read", govops:"read", riskops:"read", complianceops:"read", analyticsops:"read", workflows:"read" }),
  },
  {
    key: "security_analyst",
    label: "Security Analyst",
    description: "Hands-on security operations and threat response",
    icon: "🔬",
    color: "#DC2626",
    bgColor: "#FEF2F2",
    borderColor: "#FECACA",
    portalNote: "SecOps + AssetOps",
    moduleAccess: ["home","govops","secops","riskops","complianceops","cloudops","aisecops","assetops","workflows"],
    permissions: makePerms({ home:"read", govops:"read", secops:"write", riskops:"read", complianceops:"read", cloudops:"read", aisecops:"write", assetops:"write", workflows:"read" }),
  },
  {
    key: "risk_analyst",
    label: "Risk Analyst",
    description: "Risk identification, assessment and treatment tracking",
    icon: "📉",
    color: "#D97706",
    bgColor: "#FFFBEB",
    borderColor: "#FDE68A",
    portalNote: "RiskOps + GovOps",
    moduleAccess: ["home","govops","riskops","complianceops","analyticsops","workflows"],
    permissions: makePerms({ home:"read", govops:"read", riskops:"write", complianceops:"read", analyticsops:"read", workflows:"read" }),
  },
  {
    key: "compliance_analyst",
    label: "Compliance Analyst",
    description: "Framework management, controls and evidence collection",
    icon: "✅",
    color: "#065F46",
    bgColor: "#ECFDF5",
    borderColor: "#A7F3D0",
    portalNote: "ComplianceOps + GovOps",
    moduleAccess: ["home","govops","complianceops","riskops","analyticsops","workflows"],
    permissions: makePerms({ home:"read", govops:"read", complianceops:"write", riskops:"read", analyticsops:"read", workflows:"read" }),
  },
  {
    key: "privacy_analyst",
    label: "Privacy Analyst",
    description: "Data protection, DSAR handling and consent management",
    icon: "🔒",
    color: "#7C3AED",
    bgColor: "#F5F3FF",
    borderColor: "#C4B5FD",
    portalNote: "PrivacyOps + DataOps",
    moduleAccess: ["home","govops","privacyops","dataops","complianceops","analyticsops","workflows"],
    permissions: makePerms({ home:"read", govops:"read", privacyops:"write", dataops:"write", complianceops:"read", analyticsops:"read", workflows:"read" }),
  },
  {
    key: "it_admin",
    label: "IT Admin",
    description: "Infrastructure, assets and service desk administration",
    icon: "⚙️",
    color: "#374151",
    bgColor: "#F9FAFB",
    borderColor: "#E5E7EB",
    portalNote: "AssetOps + ServiceOps",
    moduleAccess: ["home","assetops","cloudops","serviceops","secops","workflows","settings"],
    permissions: makePerms({ home:"read", assetops:"admin", cloudops:"write", serviceops:"write", secops:"read", workflows:"read", settings:"write" }),
  },
];

// ── Lookup helpers ────────────────────────────────────────────────────────────

export function getRoleDefinition(key: string): RoleDefinition {
  return ROLE_DEFINITIONS.find(r => r.key === key) ?? ROLE_DEFINITIONS[0]!;
}

export function getRoleModuleAccess(key: string): string[] {
  return getRoleDefinition(key).moduleAccess;
}

export function getRolePermission(roleKey: string, moduleId: string): Permission {
  const role = getRoleDefinition(roleKey);
  return (role.permissions as Record<string, Permission>)[moduleId] ?? "none";
}

export function canAccess(roleKey: string, moduleId: string, required: Permission = "read"): boolean {
  const levels: Permission[] = ["none", "read", "write", "admin"];
  const actual  = getRolePermission(roleKey, moduleId);
  return levels.indexOf(actual) >= levels.indexOf(required);
}

// ── Custom admin overrides (stored in-memory + localStorage) ─────────────────
// Admins can override the default permission map per role.

const STORAGE_KEY = "grc_rbac_overrides";

type OverrideMap = Record<string, Partial<RolePermissionMap>>;

let overrideCache: OverrideMap | null = null;

export function loadOverrides(): OverrideMap {
  if (overrideCache) return overrideCache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    overrideCache = raw ? JSON.parse(raw) : {};
  } catch {
    overrideCache = {};
  }
  return overrideCache!;
}

export function saveOverrides(overrides: OverrideMap): void {
  overrideCache = overrides;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides)); } catch {}
}

export function getRolePermissionWithOverride(roleKey: string, moduleId: string): Permission {
  const overrides = loadOverrides();
  const roleOverride = overrides[roleKey];
  if (roleOverride && (roleOverride as Record<string, Permission>)[moduleId] !== undefined) {
    return (roleOverride as Record<string, Permission>)[moduleId]!;
  }
  return getRolePermission(roleKey, moduleId);
}

export function getEffectiveModuleAccess(roleKey: string): string[] {
  const base = getRoleDefinition(roleKey).moduleAccess;
  const overrides = loadOverrides();
  const roleOverride = overrides[roleKey] ?? {};
  // Add modules granted by override, remove modules revoked to "none"
  const all = new Set(base);
  for (const [mod, perm] of Object.entries(roleOverride)) {
    if (perm === "none") all.delete(mod);
    else if (perm !== undefined) all.add(mod);
  }
  return Array.from(all);
}
