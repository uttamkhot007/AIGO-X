import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

export interface TenantInfo {
  id: number;
  name: string;
  slug: string;
}

interface OrgContextValue {
  orgName: string;
  isDemo: boolean;
  viewTenantId: number;
  tenants: TenantInfo[];
  setOrgName: (name: string) => void;
  setTenants: (tenants: TenantInfo[]) => void;
  setViewTenantId: (id: number) => void;
}

const OrgContext = createContext<OrgContextValue>({
  orgName: "Acme Corporation",
  isDemo: true,
  viewTenantId: 1,
  tenants: [],
  setOrgName: () => {},
  setTenants: () => {},
  setViewTenantId: () => {},
});

const DEMO_TENANT = "Acme Corporation";

function readStoredTenantId(): number {
  const raw = localStorage.getItem("grc_view_tenant");
  const n = raw ? parseInt(raw, 10) : NaN;
  return isNaN(n) || n <= 0 ? 1 : n;
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const [orgName, setOrgName] = useState(DEMO_TENANT);
  const [tenants, setTenants] = useState<TenantInfo[]>([]);
  // viewTenantId is the authoritative source — seeded from localStorage so it
  // survives page reloads when the user switches tenants.
  const [viewTenantId, setViewTenantIdState] = useState<number>(readStoredTenantId);

  const isDemo = orgName === DEMO_TENANT;

  function setViewTenantId(id: number) {
    localStorage.setItem("grc_view_tenant", String(id));
    setViewTenantIdState(id);
  }

  return (
    <OrgContext.Provider value={{ orgName, isDemo, viewTenantId, tenants, setOrgName, setTenants, setViewTenantId }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  return useContext(OrgContext);
}
