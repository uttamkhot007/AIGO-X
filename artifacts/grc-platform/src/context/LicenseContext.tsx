import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import { useOrg } from "@/context/OrgContext";
import { hasSubmoduleRestrictions } from "@/config/submodules";

export type LicenseModules = {
  // Page-level module keys — mirror the sidebar navigation
  govops: boolean; riskops: boolean; complyops: boolean;
  secops: boolean; cloudops: boolean;
  privacyops: boolean; dataops: boolean;
  assetops: boolean; serviceops: boolean; peopleops: boolean;
  analyticsops: boolean; aivciso: boolean;
  // Sub-feature keys — retained for fine-grained feature gating within pages
  cspm: boolean; sspm: boolean; ciem: boolean; cnspm: boolean; asm: boolean;
  threatintel: boolean; cwpp: boolean; scpm: boolean; aispm: boolean;
  dpia: boolean; dspm: boolean; dlp: boolean; datalineage: boolean;
  encryption: boolean; residency: boolean;
};

export interface LicenseData {
  plan: string;
  seats: number;
  seatsUsed: number;
  modules: LicenseModules;
  frameworkIds: number[];
  expiresAt: string | null;
}

interface LicenseContextValue {
  plan: string;
  seats: number;
  seatsUsed: number;
  modules: LicenseModules;
  frameworkIds: number[];
  /** Raw licensed framework IDs from the DB — no bypass applied.
   *  Use for lock/upgrade UI only. For access-control use isFrameworkLicensed(). */
  rawFrameworkIds: number[];
  /** Resolved list of licensed frameworks with display names — use this instead of fetching /api/compliance/frameworks in individual pages */
  licensedFrameworks: { id: number; name: string }[];
  expiresAt: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  isSuperAdmin: boolean;
  /** True when the current user is a super_admin viewing their own tenant — grants full entitlement bypass.
   *  Use this (not raw isSuperAdmin) for gating framework/module access in page logic. */
  isViewingOwnTenant: boolean;
  isModuleLicensed: (key: keyof LicenseModules) => boolean;
  isFrameworkLicensed: (id: number) => boolean;
  /** Granular sub-module check.
   *  Returns true when:
   *   • isViewingOwnTenant (bypass), OR
   *   • parent module is licensed AND no sub-module restrictions are defined (full access), OR
   *   • the specific sub-module key is explicitly set to true in the license.
   */
  isSubModuleLicensed: (parentKey: string, subKey: string) => boolean;
}

// Fallback: if a page-level key isn't stored in the DB modules object (pre-migration license),
// fall back to checking the related sub-feature keys so existing tenants aren't locked out.
// Only used when the license has ZERO page-level keys (pure old format).
const PAGE_FALLBACK: Record<string, string[]> = {
  secops:    ["cspm", "sspm", "ciem", "cnspm", "asm", "threatintel", "cwpp", "scpm", "aispm"],
  cloudops:  ["cspm"],
  privacyops:["dpia"],
  dataops:   ["dspm", "dlp"],
};
// Core pages are always accessible regardless of license
const CORE_PAGES = new Set(["govops", "riskops", "complyops"]);
// All page-level module keys — if any of these exist in the DB modules object,
// the license is "new format" and missing page-level keys default to false (not sub-feature fallback)
const PAGE_LEVEL_KEYS = new Set([
  "govops", "riskops", "complyops",
  "secops", "cloudops",
  "privacyops", "dataops",
  "assetops", "serviceops", "peopleops",
  "analyticsops", "aivciso",
]);

const DEFAULT_MODULES: LicenseModules = {
  govops: true, riskops: true, complyops: true,
  secops: false, cloudops: false, privacyops: false, dataops: false,
  assetops: false, serviceops: false, peopleops: false,
  analyticsops: false, aivciso: false,
  cspm: false, sspm: false, ciem: false, cnspm: false, asm: false,
  threatintel: false, cwpp: false, scpm: false, aispm: false,
  dpia: false, dspm: false, dlp: false, datalineage: false,
  encryption: false, residency: false,
};

const ALL_MODULES: LicenseModules = {
  govops: true, riskops: true, complyops: true,
  secops: true, cloudops: true, privacyops: true, dataops: true,
  assetops: true, serviceops: true, peopleops: true,
  analyticsops: true, aivciso: true,
  cspm: true, sspm: true, ciem: true, cnspm: true, asm: true,
  threatintel: true, cwpp: true, scpm: true, aispm: true,
  dpia: true, dspm: true, dlp: true, datalineage: true,
  encryption: true, residency: true,
};

const LicenseContext = createContext<LicenseContextValue>({
  plan: "starter",
  seats: 0,
  seatsUsed: 0,
  modules: DEFAULT_MODULES,
  frameworkIds: [],
  rawFrameworkIds: [],
  licensedFrameworks: [],
  expiresAt: null,
  loading: false,
  error: null,
  refresh: () => {},
  isSuperAdmin: false,
  isViewingOwnTenant: false,
  isModuleLicensed: () => false,
  isFrameworkLicensed: () => false,
  isSubModuleLicensed: () => false,
});

function apiUrl(path: string) {
  const base = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
  return `${base.replace("/grc-platform", "")}/api${path}`;
}

export function LicenseProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { viewTenantId } = useOrg();
  const isSuperAdmin = user?.role === "super_admin";

  // isViewingOwnTenant = true ONLY when a super_admin is looking at their own tenant.
  // Regular users always have isViewingOwnTenant = false and must pass a license check.
  // Super_admin viewing a DIFFERENT tenant also has isViewingOwnTenant = false (sees that tenant's restrictions).
  const isViewingOwnTenant = isSuperAdmin && viewTenantId === user?.tenantId;

  const [license, setLicense] = useState<LicenseData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [licensedFrameworks, setLicensedFrameworks] = useState<{ id: number; name: string }[]>([]);

  const refresh = useCallback(async (tenantId?: number) => {
    const token = localStorage.getItem("grc_token");
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      if (tenantId && tenantId > 0) headers["X-View-As-Tenant"] = String(tenantId);

      // Fetch license + framework library concurrently
      const [licenseRes, fwRes] = await Promise.all([
        fetch(apiUrl("/me/license"), { headers }),
        fetch(apiUrl("/compliance/frameworks"), { headers }),
      ]);

      if (licenseRes.ok) {
        const data = await licenseRes.json();
        setLicense(data);
        setError(null);

        // Resolve framework names from library, filtered to this tenant's licensed IDs
        if (fwRes.ok) {
          const fwData: any[] = await fwRes.json();
          if (Array.isArray(fwData)) {
            const ids: number[] = data.frameworkIds ?? [];
            setLicensedFrameworks(
              fwData
                .filter(fw => ids.includes(fw.libraryId ?? 0))
                .map(fw => ({ id: fw.libraryId ?? 0, name: fw.name as string }))
            );
          }
        }
      } else {
        setError(`License fetch failed: HTTP ${licenseRes.status}`);
        setLicense(null);
      }
    } catch (e: any) {
      setError(e?.message ?? "License fetch error");
      setLicense(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) { setLicense(null); setError(null); return; }
    // Always fetch the license so rawFrameworkIds is available for lock UI.
    // Super_admin on own tenant: fetch own tenant's license (for rawFrameworkIds only —
    //   access control is still bypassed via isViewingOwnTenant in isFrameworkLicensed/isModuleLicensed).
    // Super_admin viewing another tenant: pass viewTenantId so the API returns that tenant's license.
    // Regular users: fetch own license — JWT identifies their tenant.
    refresh(isSuperAdmin ? viewTenantId : undefined);
  }, [user, isViewingOwnTenant, viewTenantId, isSuperAdmin, refresh]);

  function isModuleLicensed(key: keyof LicenseModules): boolean {
    // Super_admin on their own tenant gets unrestricted access
    if (isViewingOwnTenant) return true;
    if (CORE_PAGES.has(key as string)) return true; // core pages always accessible
    if (!license) return false;
    const mods = license.modules as any;
    // If the key exists directly in the modules object, use it
    if (key in mods) return !!(mods[key]);
    // Backward-compat: fall back to sub-feature keys ONLY for pure old-format licenses
    // (i.e. licenses that have NO page-level keys at all). If ANY page-level key is
    // present, missing page-level keys default to false so sub-features can't smuggle
    // access to unlicensed pages.
    const hasAnyPageLevelKey = Object.keys(mods).some(k => PAGE_LEVEL_KEYS.has(k));
    if (!hasAnyPageLevelKey) {
      const fallbacks = PAGE_FALLBACK[key as string];
      if (fallbacks) return fallbacks.some(f => !!(mods[f]));
    }
    return false;
  }

  function isFrameworkLicensed(id: number): boolean {
    if (isViewingOwnTenant) return true;
    if (!license) return false;
    // Empty frameworkIds means no frameworks are licensed for this tenant — deny by default.
    // Super-admin on own tenant is already handled above (isViewingOwnTenant bypass).
    if (!license.frameworkIds || license.frameworkIds.length === 0) return false;
    return license.frameworkIds.includes(id);
  }

  function isSubModuleLicensed(parentKey: string, subKey: string): boolean {
    // Super-admin on own tenant → unrestricted
    if (isViewingOwnTenant) return true;
    if (!license) return false;
    const mods = license.modules as Record<string, boolean | undefined>;
    // Legacy short-key fallback: if the sub-feature's short key (e.g. "cspm" from "sec.cspm")
    // is explicitly true in the modules object, grant access without requiring parent module.
    // Preserves backward-compat for tenants licensed with per-feature keys (pre-page-level format).
    const shortKey = subKey.includes(".") ? subKey.split(".").pop()! : subKey;
    if (mods[shortKey] === true) return true;
    // Parent module must be licensed
    if (!isModuleLicensed(parentKey as keyof LicenseModules)) return false;
    // No sub-module restrictions defined for this parent → full access
    if (!hasSubmoduleRestrictions(mods, parentKey)) return true;
    // Explicit dot-notation sub-module check
    return !!(mods[subKey]);
  }

  return (
    <LicenseContext.Provider value={{
      plan: isViewingOwnTenant ? "enterprise" : (license?.plan ?? "starter"),
      seats: isViewingOwnTenant ? 9999 : (license?.seats ?? 0),
      seatsUsed: license?.seatsUsed ?? 0,
      modules: isViewingOwnTenant ? ALL_MODULES : (license?.modules ?? DEFAULT_MODULES),
      frameworkIds: isViewingOwnTenant ? [] : (license?.frameworkIds ?? []),
      rawFrameworkIds: license?.frameworkIds ?? [],
      licensedFrameworks,
      expiresAt: license?.expiresAt ?? null,
      loading,
      error,
      refresh,
      isSuperAdmin,
      isViewingOwnTenant,
      isModuleLicensed,
      isFrameworkLicensed,
      isSubModuleLicensed,
    }}>
      {children}
    </LicenseContext.Provider>
  );
}

export function useLicense() {
  return useContext(LicenseContext);
}
