import { useState, useEffect, useCallback, useRef } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { OrgProvider, useOrg } from "@/context/OrgContext";
import { RealtimeProvider } from "@/context/RealtimeContext";
import { LicenseProvider } from "@/context/LicenseContext";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Shell } from "@/components/Shell";
import { CommandPalette } from "@/components/CommandPalette";
import Home from "@/pages/Home";
import Dashboard from "@/pages/Dashboard";
import Onboarding from "@/pages/Onboarding";
import GovOps from "@/pages/GovOps";
import RiskOps from "@/pages/RiskOps";
import ComplianceOps from "@/pages/ComplianceOps";
import ServiceOps from "@/pages/ServiceOps";
import SecOps from "@/pages/SecOps";
import AssetOps from "@/pages/AssetOps";
import CloudOps from "@/pages/CloudOps";
import AISecOps from "@/pages/AISecOps";
import PrivacyOps from "@/pages/PrivacyOps";
import DataOps from "@/pages/DataOps";
import AnalyticsOps from "@/pages/AnalyticsOps";
import AIvCISO from "@/pages/AIvCISO";
import ADauditor from "@/pages/ADauditor";
import PeopleOps from "@/pages/PeopleOps";
import Workflows from "@/pages/Workflows";
import ServiceDesk from "@/pages/ServiceDesk";
import AdminPortal from "@/pages/AdminPortal";
import DeploymentSetup from "@/pages/DeploymentSetup";
import Settings from "@/pages/Settings";
import GovernanceProfile from "@/pages/GovernanceProfile";
import ComplianceProfile from "@/pages/ComplianceProfile";
import ControlProfile from "@/pages/ControlProfile";
import CompliancePack from "@/pages/CompliancePack";
import EvidenceEngine from "@/pages/EvidenceEngine";
import Questionnaires from "@/pages/Questionnaires";
import RiskProfile from "@/pages/RiskProfile";
import VendorPortal from "@/pages/VendorPortal";
import PortalView from "@/pages/PortalView";
import TrustCenter from "@/pages/TrustCenter";
import SettingsProfile from "@/pages/SettingsProfile";
import RBACAdmin from "@/pages/RBACAdmin";
import MaturityModel from "@/pages/MaturityModel";
import Agents from "@/pages/Agents";
import NotFound from "@/pages/not-found";
import Login from "@/pages/Login";
import MfaVerify from "@/pages/MfaVerify";
import Register from "@/pages/Register";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function AuthGuard({ children }: { children: React.ReactNode }) {
  const [, navigate] = useLocation();
  const token = localStorage.getItem("grc_token");
  useEffect(() => { if (!token) navigate("/login"); }, [token, navigate]);
  if (!token) return null;
  return <>{children}</>;
}

function TenantFetchInterceptor() {
  const { viewTenantId } = useOrg();
  const tenantIdRef = useRef(viewTenantId);
  useEffect(() => { tenantIdRef.current = viewTenantId; }, [viewTenantId]);
  useEffect(() => {
    const origFetch = window.fetch.bind(window);
    window.fetch = function(input: RequestInfo | URL, init?: RequestInit) {
      const url = typeof input === "string" ? input
                : input instanceof URL ? input.href
                : (input as Request).url;
      if (url.startsWith("/api/")) {
        const headers = new Headers(init?.headers);
        headers.set("X-View-As-Tenant", String(tenantIdRef.current));
        init = { ...init, headers };
      }
      return origFetch(input, init);
    };
    return () => { window.fetch = origFetch; };
  }, []);
  return null;
}

function Router({ cmdOpen, setCmdOpen }: { cmdOpen: boolean; setCmdOpen: (v: boolean) => void }) {
  return (
    <>
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/mfa" component={MfaVerify} />
        <Route path="/register" component={Register} />
        <Route path="/portal/:type" component={PortalView} />
        <Route path="/trust/:slug" component={TrustCenter} />
        <Route>
          <AuthGuard>
            <Shell onOpenCmd={() => setCmdOpen(true)}>
              <Switch>
                <Route path="/"              component={Home} />
                <Route path="/dashboard"    component={Dashboard} />
                <Route path="/onboarding">{() => <Onboarding />}</Route>
                <Route path="/govops"        component={GovOps} />
                <Route path="/riskops"       component={RiskOps} />
                <Route path="/complianceops" component={ComplianceOps} />
                <Route path="/serviceops"    component={ServiceOps} />
                <Route path="/secops"        component={SecOps} />
                <Route path="/assetops"      component={AssetOps} />
                <Route path="/cloudops"      component={CloudOps} />
                <Route path="/aisecops"      component={AISecOps} />
                <Route path="/privacyops"    component={PrivacyOps} />
                <Route path="/dataops"       component={DataOps} />
                <Route path="/analyticsops"  component={AnalyticsOps} />
                <Route path="/ai"            component={AIvCISO} />
                <Route path="/ad-auditor"    component={ADauditor} />
                <Route path="/peopleops"     component={PeopleOps} />
                <Route path="/workflows"     component={Workflows} />
                <Route path="/service-desk"  component={ServiceDesk} />
                <Route path="/admin"         component={AdminPortal} />
                <Route path="/deployment"    component={DeploymentSetup} />
                <Route path="/settings"      component={Settings} />
                <Route path="/agents"          component={Agents} />
                <Route path="/maturity"        component={MaturityModel} />
                <Route path="/evidence-engine" component={EvidenceEngine} />
                <Route path="/questionnaires"  component={Questionnaires} />
                <Route path="/vendor-portal"   component={VendorPortal} />
                {/* Object Profile Routes */}
                <Route path="/govops/controls/:id"         component={ControlProfile} />
                <Route path="/govops/policies/:id"         component={GovernanceProfile} />
                <Route path="/govops/processes/:id"        component={GovernanceProfile} />
                <Route path="/govops/procedures/:id"       component={GovernanceProfile} />
                <Route path="/complianceops/questionnaires/:id" component={Questionnaires} />
                <Route path="/complianceops/questionnaires"    component={Questionnaires} />
                <Route path="/complianceops/packs/:id"        component={CompliancePack} />
                <Route path="/complianceops/packs"          component={CompliancePack} />
                <Route path="/complianceops/frameworks/:id" component={ComplianceProfile} />
                <Route path="/complianceops/controls/:id"   component={ComplianceProfile} />
                <Route path="/riskops/risks/:id"           component={RiskProfile} />
                <Route path="/riskops/vendors/:id"         component={RiskProfile} />
                <Route path="/riskops/vulnerabilities/:id" component={RiskProfile} />
                <Route path="/settings/assets/:id"         component={SettingsProfile} />
                <Route path="/settings/asset-groups/:id"   component={SettingsProfile} />
                <Route path="/settings/agents/:id"         component={SettingsProfile} />
                <Route path="/settings/users/:id"          component={SettingsProfile} />
                <Route path="/settings/user-roles/:id"     component={SettingsProfile} />
                <Route path="/settings/rbac"               component={RBACAdmin} />
                <Route path="/servicedesk/requests/:id"    component={RiskProfile} />
                {/* Legacy redirects */}
                <Route path="/risk"          component={RiskOps} />
                <Route path="/compliance"    component={ComplianceOps} />
                <Route path="/security"      component={SecOps} />
                <Route path="/privacy"       component={PrivacyOps} />
                <Route component={NotFound} />
              </Switch>
            </Shell>
          </AuthGuard>
        </Route>
      </Switch>
    </>
  );
}

export default function App() {
  const [cmdOpen, setCmdOpen] = useState(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setCmdOpen(v => !v);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <OrgProvider>
            <LicenseProvider>
              <RealtimeProvider>
                <TenantFetchInterceptor />
                <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                  <Router cmdOpen={cmdOpen} setCmdOpen={setCmdOpen} />
                </WouterRouter>
              </RealtimeProvider>
            </LicenseProvider>
          </OrgProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
