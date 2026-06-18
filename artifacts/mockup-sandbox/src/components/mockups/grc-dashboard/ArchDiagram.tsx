const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
`;

const KEYFRAMES = `
@keyframes fade-in { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
@keyframes pulse-dot { 0%,100%{opacity:0.4;transform:scale(1)} 50%{opacity:1;transform:scale(1.3)} }
@keyframes flow { 0%{stroke-dashoffset:20} 100%{stroke-dashoffset:0} }
`;

interface ServiceBoxProps {
  name: string;
  desc: string;
  color: string;
  bg: string;
  border: string;
}

function ServiceBox({ name, desc, color, bg, border }: ServiceBoxProps) {
  return (
    <div style={{
      background: bg,
      border: `1px solid ${border}`,
      borderRadius: 8,
      padding: "8px 10px",
      minWidth: 140,
      position: "relative",
    }}>
      <div style={{
        position: "absolute", top: 0, left: 0,
        width: 3, height: "100%", background: color,
        borderRadius: "8px 0 0 8px",
      }} />
      <div style={{
        fontSize: 11, fontWeight: 700,
        fontFamily: "'JetBrains Mono', monospace",
        color: color,
        marginBottom: 2,
        paddingLeft: 4,
      }}>{name}</div>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", paddingLeft: 4, lineHeight: 1.3 }}>{desc}</div>
    </div>
  );
}

interface DomainGroupProps {
  title: string;
  color: string;
  bg: string;
  border: string;
  services: Array<{ name: string; desc: string }>;
  animDelay?: number;
}

function DomainGroup({ title, color, bg, border, services, animDelay = 0 }: DomainGroupProps) {
  return (
    <div style={{
      background: bg,
      border: `1px solid ${border}`,
      borderRadius: 12,
      padding: "12px 14px",
      animation: `fade-in 0.4s ease ${animDelay}s both`,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 800,
        color: color,
        letterSpacing: "1px",
        textTransform: "uppercase",
        marginBottom: 10,
        display: "flex", alignItems: "center", gap: 6,
      }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, animation: "pulse-dot 2s ease infinite" }} />
        {title}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {services.map((s) => (
          <ServiceBox key={s.name} name={s.name} desc={s.desc} color={color} bg="rgba(255,255,255,0.04)" border={`${border}`} />
        ))}
      </div>
    </div>
  );
}

const domains = [
  {
    title: "Core Services",
    color: "#6366F1",
    bg: "rgba(99,102,241,0.06)",
    border: "rgba(99,102,241,0.2)",
    animDelay: 0.1,
    services: [
      { name: "auth-service", desc: "Authentication, MFA, SSO, OIDC/SAML" },
      { name: "tenant-service", desc: "Multi-tenant provisioning, billing meta" },
      { name: "user-service", desc: "Profiles, roles, RBAC permissions" },
      { name: "notification-service", desc: "Email / webhook / in-app alerts" },
    ],
  },
  {
    title: "GRC Domain",
    color: "#8B5CF6",
    bg: "rgba(139,92,246,0.06)",
    border: "rgba(139,92,246,0.2)",
    animDelay: 0.2,
    services: [
      { name: "governance-service", desc: "Policies, procedures, controls" },
      { name: "risk-service", desc: "Risk register, heat maps, scenarios" },
      { name: "compliance-service", desc: "Frameworks, gap analysis" },
      { name: "audit-service", desc: "Plans, findings, evidence, reports" },
    ],
  },
  {
    title: "Security Domain",
    color: "#06B6D4",
    bg: "rgba(6,182,212,0.06)",
    border: "rgba(6,182,212,0.2)",
    animDelay: 0.3,
    services: [
      { name: "caasm-service", desc: "Asset discovery, inventory, topology" },
      { name: "cspm-service", desc: "Cloud posture, misconfiguration" },
      { name: "sspm-service", desc: "SaaS inventory, OAuth risk, shadow IT" },
      { name: "network-audit-service", desc: "Firewall rules, zone analysis" },
    ],
  },
  {
    title: "Privacy Domain",
    color: "#10B981",
    bg: "rgba(16,185,129,0.06)",
    border: "rgba(16,185,129,0.2)",
    animDelay: 0.4,
    services: [
      { name: "privacy-service", desc: "DSPM, RoPA, DPIA, consent, DSAR" },
      { name: "data-classification-service", desc: "Sensitive data discovery, tagging" },
    ],
  },
  {
    title: "Intelligence",
    color: "#F59E0B",
    bg: "rgba(245,158,11,0.06)",
    border: "rgba(245,158,11,0.2)",
    animDelay: 0.5,
    services: [
      { name: "ai-service", desc: "LLM gateway, vCISO engine, NL queries" },
      { name: "ad-auditor-service", desc: "AD/Entra connector, attack paths" },
      { name: "servicedesk-service", desc: "Tickets, SLA, KB, AI triage" },
    ],
  },
  {
    title: "Platform Services",
    color: "#EC4899",
    bg: "rgba(236,72,153,0.06)",
    border: "rgba(236,72,153,0.2)",
    animDelay: 0.6,
    services: [
      { name: "integration-hub-service", desc: "100+ connectors, ingestion pipelines" },
      { name: "agent-gateway-service", desc: "Agent check-ins, policy push" },
      { name: "evidence-service", desc: "Collection, tamper-proof hashing" },
      { name: "reporting-service", desc: "PDF/PPTX/CSV report generation" },
    ],
  },
];

function ArrowDown({ color = "rgba(255,255,255,0.2)", label = "" }: { color?: string; label?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "4px 0" }}>
      {label && <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.5px" }}>{label}</span>}
      <svg width={24} height={24} viewBox="0 0 24 24">
        <line x1={12} y1={2} x2={12} y2={18} stroke={color} strokeWidth={1.5} strokeDasharray="4 2"
          style={{ animation: "flow 1s linear infinite" }}
        />
        <polyline points="7,13 12,19 17,13" fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function HLine({ color = "rgba(255,255,255,0.15)" }: { color?: string }) {
  return (
    <div style={{ height: 1, background: color, margin: "0 0" }} />
  );
}

export default function ArchDiagram() {
  return (
    <div style={{
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      background: "#080A0F",
      minHeight: "100vh",
      padding: "24px 28px",
      overflow: "auto",
      color: "white",
    }}>
      <style>{FONTS}{KEYFRAMES}</style>

      {/* HEADER */}
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: "rgba(99,102,241,0.1)",
          border: "1px solid rgba(99,102,241,0.25)",
          borderRadius: 20, padding: "4px 14px",
          fontSize: 10, fontWeight: 700,
          color: "#A5B4FC", letterSpacing: "1px",
          textTransform: "uppercase",
          marginBottom: 10,
        }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#6366F1", animation: "pulse-dot 1.5s ease infinite" }} />
          Microservices Architecture
        </div>
        <h1 style={{
          fontSize: 22, fontWeight: 800, letterSpacing: "-0.5px",
          background: "linear-gradient(135deg, white, rgba(255,255,255,0.6))",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          marginBottom: 4,
        }}>AIGO GRC Platform — Service Topology</h1>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>
          20 independent microservices · Database-per-service · Event-driven async communication
        </p>
      </div>

      {/* FRONTEND LAYER */}
      <div style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 12,
        padding: "12px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        marginBottom: 4,
        animation: "fade-in 0.3s ease 0s both",
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: "1px", textTransform: "uppercase" }}>Frontend Layer</div>
        {[
          { name: "Web App", detail: "React + Vite · Multi-tenant SPA" },
          { name: "Mobile App", detail: "React Native · Expo" },
        ].map((f) => (
          <div key={f.name} style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8,
            padding: "7px 16px",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "white" }}>{f.name}</div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>{f.detail}</div>
          </div>
        ))}
      </div>

      <ArrowDown color="rgba(255,255,255,0.25)" label="HTTPS" />

      {/* API GATEWAY */}
      <div style={{
        background: "linear-gradient(135deg, rgba(99,102,241,0.15), rgba(6,182,212,0.1))",
        border: "1px solid rgba(99,102,241,0.35)",
        borderRadius: 12,
        padding: "12px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 32,
        marginBottom: 4,
        animation: "fade-in 0.3s ease 0.05s both",
        boxShadow: "0 0 24px rgba(99,102,241,0.15)",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#A5B4FC", letterSpacing: "-0.3px" }}>API Gateway</div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>Kong / Nginx · Single entry point</div>
        </div>
        <div style={{ height: 30, width: 1, background: "rgba(255,255,255,0.1)" }} />
        {["Rate Limiting", "Auth Header Injection", "mTLS", "Request Routing", "Load Balancing"].map((f) => (
          <div key={f} style={{
            background: "rgba(99,102,241,0.15)",
            border: "1px solid rgba(99,102,241,0.25)",
            borderRadius: 5,
            padding: "3px 9px",
            fontSize: 10, fontWeight: 600,
            color: "#C7D2FE",
          }}>{f}</div>
        ))}
      </div>

      <ArrowDown color="rgba(99,102,241,0.4)" label="REST / gRPC" />

      {/* SERVICES GRID */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Core + GRC side by side */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <DomainGroup {...domains[0]} />
          <DomainGroup {...domains[1]} />
        </div>
        {/* Security + Privacy side by side */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <DomainGroup {...domains[2]} />
          <DomainGroup {...domains[3]} />
        </div>
        {/* Intelligence + Platform side by side */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <DomainGroup {...domains[4]} />
          <DomainGroup {...domains[5]} />
        </div>
      </div>

      {/* Event Bus */}
      <div style={{ position: "relative", margin: "12px 0 4px" }}>
        <ArrowDown color="rgba(245,158,11,0.4)" label="ASYNC EVENTS" />
      </div>
      <div style={{
        background: "rgba(245,158,11,0.07)",
        border: "1px solid rgba(245,158,11,0.25)",
        borderRadius: 12,
        padding: "12px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 28,
        animation: "fade-in 0.3s ease 0.65s both",
        boxShadow: "0 0 20px rgba(245,158,11,0.08)",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#FCD34D", letterSpacing: "-0.3px" }}>Event Bus</div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>Kafka / Redis Streams</div>
        </div>
        <div style={{ height: 30, width: 1, background: "rgba(255,255,255,0.08)" }} />
        {["Async Service Comm.", "Event Sourcing", "CQRS Pattern", "Dead Letter Queue", "Replay Support"].map((f) => (
          <div key={f} style={{
            background: "rgba(245,158,11,0.12)",
            border: "1px solid rgba(245,158,11,0.2)",
            borderRadius: 5,
            padding: "3px 9px",
            fontSize: 10, fontWeight: 600,
            color: "#FDE68A",
          }}>{f}</div>
        ))}
      </div>

      {/* INFRASTRUCTURE LAYER */}
      <div style={{ margin: "12px 0 4px" }}>
        <ArrowDown color="rgba(255,255,255,0.15)" label="PERSISTENCE" />
      </div>
      <div style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        padding: "14px 20px",
        animation: "fade-in 0.3s ease 0.7s both",
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 12 }}>
          Infrastructure Layer
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {[
            { name: "PostgreSQL", desc: "Database-per-service pattern · 20 isolated DBs", color: "#336791", icon: "⬡" },
            { name: "Redis", desc: "Session cache · Rate limiting · Pub/Sub", color: "#DC382D", icon: "◈" },
            { name: "S3-compatible", desc: "Evidence files · PDF/PPTX exports · Artifacts", color: "#FF9900", icon: "◎" },
            { name: "Vault / KMS", desc: "Secrets management · Key rotation · Encryption", color: "#00AEF0", icon: "◉" },
            { name: "Prometheus + Grafana", desc: "Metrics · Alerting · SLO dashboards", color: "#E6522C", icon: "◐" },
            { name: "OpenTelemetry", desc: "Distributed tracing · Spans · Logs correlation", color: "#425CC7", icon: "◆" },
          ].map((item) => (
            <div key={item.name} style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8,
              padding: "8px 12px",
              flex: "1 1 160px",
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
            }}>
              <div style={{
                fontSize: 16, color: item.color, flexShrink: 0, marginTop: 1,
              }}>{item.icon}</div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.85)", fontFamily: "'JetBrains Mono', monospace" }}>{item.name}</div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 2, lineHeight: 1.4 }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* LEGEND */}
      <div style={{
        display: "flex", alignItems: "center", gap: 20, justifyContent: "center",
        marginTop: 16, padding: "10px 20px",
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.05)",
        borderRadius: 8,
        fontSize: 10,
      }}>
        <span style={{ color: "rgba(255,255,255,0.35)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Legend:</span>
        {[
          { color: "#6366F1", label: "Sync (REST/gRPC)" },
          { color: "#F59E0B", label: "Async (Event Bus)" },
          { color: "rgba(255,255,255,0.3)", label: "Storage" },
        ].map((l) => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 24, height: 2, background: l.color, borderRadius: 2 }} />
            <span style={{ color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>{l.label}</span>
          </div>
        ))}
        <div style={{ height: 12, width: 1, background: "rgba(255,255,255,0.08)" }} />
        <span style={{ color: "rgba(255,255,255,0.35)", fontWeight: 500 }}>20 microservices · Database-per-service · Zero shared state</span>
      </div>
    </div>
  );
}
