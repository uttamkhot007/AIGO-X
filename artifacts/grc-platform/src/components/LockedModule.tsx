// @ts-nocheck
import { useState } from "react";
import { useLicense } from "@/context/LicenseContext";
import { UpgradeModal } from "./UpgradeModal";

export const MODULE_DISPLAY_NAMES: Record<string, string> = {
  // Page-level modules (sidebar navigation)
  govops:      "Governance Operations (GovOps)",
  riskops:     "Risk Operations (RiskOps)",
  complyops:   "Compliance Operations (ComplyOps)",
  secops:      "Security Operations (SecOps)",
  cloudops:    "Cloud Operations (CloudOps)",
  privacyops:  "Privacy Operations (PrivacyOps)",
  dataops:     "Data Operations (DataOps)",
  assetops:    "Asset Operations (AssetOps)",
  serviceops:  "Service Operations (ServiceOps)",
  peopleops:   "People Operations (PeopleOps)",
  analyticsops:"Analytics Operations (AnalyticsOps)",
  aivciso:     "AI vCISO",
  // Sub-feature modules (within-page gating)
  cspm:        "Cloud Security Posture Management (CSPM)",
  sspm:        "SaaS Security Posture Management (SSPM)",
  ciem:        "Cloud Infrastructure Entitlement Management (CIEM)",
  cnspm:       "Cloud Network Security Posture Management (CNSPM)",
  asm:         "Attack Surface Management (ASM)",
  threatintel: "Threat Intelligence",
  cwpp:        "Cloud Workload Protection Platform (CWPP)",
  scpm:        "Secrets & Code Posture Management (SCPM)",
  aispm:       "AI Security Posture Management (AISPM)",
  dpia:        "Privacy Impact Assessment / DPIA",
  dspm:        "Data Security Posture Management (DSPM)",
  dlp:         "Data Loss Prevention (DLP)",
  datalineage: "Data Lineage",
  encryption:  "Encryption Management",
  residency:   "Data Residency",
};

interface LockedModuleProps {
  moduleKey: string;
  name?: string;
  description?: string;
}

export function LockedModule({ moduleKey, name, description }: LockedModuleProps) {
  const [open, setOpen] = useState(false);
  const { plan } = useLicense();
  const displayName = name ?? MODULE_DISPLAY_NAMES[moduleKey] ?? moduleKey;
  return (
    <>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:320, padding:48 }}>
        <div style={{ textAlign:"center", maxWidth:440 }}>
          <div style={{ fontSize:52, marginBottom:16 }}>🔒</div>
          <div style={{ fontSize:16, fontWeight:800, color:"var(--foreground)", marginBottom:8 }}>{displayName}</div>
          <div style={{ fontSize:13, color:"var(--muted-foreground)", lineHeight:1.7, marginBottom:8 }}>
            {description ?? "This module is not included in your current licence."}
          </div>
          <div style={{ fontSize:11, color:"var(--muted-foreground)", marginBottom:24 }}>
            Current plan:{" "}
            <span style={{ fontWeight:700, textTransform:"uppercase", color:"var(--foreground)" }}>{plan}</span>
          </div>
          <button
            onClick={() => setOpen(true)}
            style={{ background:"linear-gradient(135deg,#1E3A5F,#065F46)", border:"none", borderRadius:8, padding:"10px 28px", fontSize:13, fontWeight:700, color:"#fff", cursor:"pointer" }}
          >
            🚀 Upgrade Plan
          </button>
        </div>
      </div>
      {open && <UpgradeModal feature={displayName} plan={plan} onClose={() => setOpen(false)} />}
    </>
  );
}
