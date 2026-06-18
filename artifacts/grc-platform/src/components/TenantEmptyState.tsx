import { useOrg } from "@/context/OrgContext";

const MODULES: Record<string, { icon: string; desc: string }> = {
  "Executive Dashboard":    { icon: "▦",  desc: "Connect your data sources to start seeing KPIs, risk posture and compliance metrics." },
  "Risk Register":          { icon: "⚠",  desc: "Import risks from your existing tools or create your first risk manually." },
  "Governance & Policy":    { icon: "📋", desc: "Upload your policy library or use templates to create your first policy." },
  "Security Operations":    { icon: "🛡", desc: "Connect your SIEM, EDR or vulnerability scanner to start ingesting findings." },
  "Cloud Security":         { icon: "☁",  desc: "Link an AWS, Azure or GCP account to start continuous cloud posture monitoring." },
  "Compliance":             { icon: "✓",  desc: "Select your compliance frameworks and begin gap assessments." },
  "Analytics":              { icon: "📊", desc: "Once data is connected, analytics and trends will appear here automatically." },
  "Service Operations":     { icon: "🎫", desc: "Integrate your ticketing system or create your first GRC task." },
  "People & HR":            { icon: "👥", desc: "Sync your HR directory to manage training, access reviews and onboarding." },
  "Administration":         { icon: "⚙",  desc: "Configure platform settings, invite team members and set up integrations." },
  "AI vCISO":               { icon: "🤖", desc: "The AI vCISO will generate briefings and insights once your data is connected." },
  "Security Intelligence":  { icon: "🔍", desc: "Connect CAASM, CSPM and SSPM tools to populate this module." },
  "Workflows":              { icon: "⚡", desc: "Create your first automated workflow or import from a template." },
  "Asset Operations":       { icon: "🖥", desc: "Connect your CMDB, discovery tool or cloud accounts to build your asset inventory." },
  "Risk Management":        { icon: "⚠",  desc: "Import risks, configure your risk appetite and connect TPRM tools to begin." },
  "Privacy Operations":     { icon: "🔒", desc: "Connect your privacy tools and configure DSAR workflows to get started." },
  "Data Security":          { icon: "🗄", desc: "Connect your data stores to begin scanning for sensitive data and misconfigurations." },
  "Settings":               { icon: "⚙",  desc: "Configure your organization profile, users, and integrations to get started." },
  default:                  { icon: "◻",  desc: "Connect your tools and data sources to populate this module." },
};

export default function TenantEmptyState({ module }: { module: string }) {
  const { orgName } = useOrg();
  const { icon, desc } = MODULES[module] ?? MODULES.default;

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      flex: 1, minHeight: 360, padding: "48px 24px", gap: 0,
      fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    }}>
      <div style={{
        width: 72, height: 72, borderRadius: 20,
        background: "rgba(99,102,241,0.08)", border: "1.5px solid rgba(99,102,241,0.18)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 30, marginBottom: 20,
      }}>
        {icon}
      </div>

      <h2 style={{
        fontSize: 18, fontWeight: 700, margin: "0 0 8px",
        color: "var(--foreground)", letterSpacing: "-0.3px", textAlign: "center",
      }}>
        No data for <span style={{ color: "rgb(147,197,253)" }}>{orgName}</span>
      </h2>

      <p style={{
        fontSize: 13, color: "rgba(148,163,184,0.75)", margin: "0 0 28px",
        maxWidth: 400, textAlign: "center", lineHeight: 1.6,
      }}>
        {desc}
      </p>

      <div style={{ display: "flex", gap: 10 }}>
        <button
          style={{
            padding: "9px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.35)",
            color: "rgb(165,180,252)", cursor: "pointer", fontFamily: "inherit",
          }}
          onClick={() => window.location.href = "/grc-platform/onboarding"}
        >
          Run Setup Wizard
        </button>
        <button
          style={{
            padding: "9px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            background: "transparent", border: "1px solid rgba(148,163,184,0.2)",
            color: "var(--muted-foreground)", cursor: "pointer", fontFamily: "inherit",
          }}
          onClick={() => window.location.href = "/grc-platform/settings"}
        >
          Configure Integrations
        </button>
      </div>
    </div>
  );
}
