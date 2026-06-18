// @ts-nocheck
import { useState, useEffect } from "react";
import { useTheme } from "@/context/ThemeContext";

function apiUrl(path: string) {
  const base = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
  return `${base.replace("/grc-platform", "")}/api${path}`;
}
function tok() { return localStorage.getItem("grc_token") ?? ""; }
function H(json = true) {
  const h: Record<string, string> = { Authorization: `Bearer ${tok()}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

// ── Types ──────────────────────────────────────────────────────────────────────
type DeployType    = "cloud" | "onprem" | "hybrid" | null;
type TenantMode    = "single" | "multi" | null;
type Step          = "target" | "mode" | "config" | "generate" | "done";
type CloudProvider = "aws" | "azure" | "gcp" | "k8s" | "docker";

interface Service { name: string; path: string; status: string; version: string; lastChecked: string; }
interface ServiceSummary { total: number; healthy: number; degraded: number; down: number; }
interface DeployConfig {
  deploymentType: string; tenantMode: string; version: string;
  environment: string; configured: boolean;
  features: { aiEnabled: boolean; mfaEnabled: boolean; ssoEnabled: boolean; auditEnabled: boolean };
  db: { connected: boolean; provider: string };
}
interface Generated {
  envContent?: string;
  composeContent?: string;
  nginxContent?: string;
  envCloudContent?: string;
  envOnPremContent?: string;
  composeCloudContent?: string;
  composeOnPremContent?: string;
  nginxAgentContent?: string;
  setupScript?: string;
  k8sCloudManifest?: string;
  k8sAgentManifest?: string;
  prometheusYml?: string;
  providerScript?: string;
  tenantMode?: string;
  cloudProvider?: string;
  agentCount?: number;
  monitoring?: boolean;
  k8s?: boolean;
}

// ── Colour tokens ──────────────────────────────────────────────────────────────
function mkT(isDark: boolean) {
  return {
    bg:     isDark ? "var(--card)"               : "#f8fafc",
    card:   isDark ? "var(--input)"              : "#ffffff",
    card2:  isDark ? "var(--secondary)"          : "#f1f5f9",
    border: isDark ? "var(--border)"             : "rgba(0,0,0,0.1)",
    text:   isDark ? "var(--foreground)"         : "#1e293b",
    sub:    isDark ? "rgba(148,163,184,0.75)"    : "#64748b",
    muted:  isDark ? "var(--muted-foreground)"   : "#94a3b8",
    accent: "rgb(147,197,253)",
    green:  "#34D399",
    yellow: "#FBBF24",
    red:    "#F87171",
    purple: "#A78BFA",
    orange: "#FB923C",
    inp:    isDark ? "var(--card)"               : "#f8fafc",
    inpBdr: isDark ? "rgba(255,255,255,0.12)"    : "rgba(0,0,0,0.15)",
  };
}

// ── Status pill ────────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: string }) {
  const color = status === "healthy" ? "#34D399" : status === "degraded" ? "#FBBF24" : "#F87171";
  return (
    <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:20,
      background:`${color}20`, color, border:`1px solid ${color}40` }}>
      {status.toUpperCase()}
    </span>
  );
}

// ── Choice card ────────────────────────────────────────────────────────────────
function ChoiceCard({ icon, title, desc, selected, onClick, T, accentColor }: {
  icon:string; title:string; desc:string; selected:boolean; onClick:()=>void;
  T:ReturnType<typeof mkT>; accentColor?: string;
}) {
  const ac = accentColor ?? "rgb(147,197,253)";
  return (
    <button onClick={onClick} style={{
      flex:1, padding:"20px 18px", borderRadius:12, cursor:"pointer", textAlign:"left",
      border: selected ? `2px solid ${ac}` : `2px solid ${T.border}`,
      background: selected ? `${ac}10` : T.card2,
      transition:"all 0.2s", outline:"none", fontFamily:"inherit", minWidth:0,
    }}>
      <div style={{ fontSize:28, marginBottom:8 }}>{icon}</div>
      <div style={{ fontSize:13, fontWeight:700, color: selected ? ac : T.text, marginBottom:5 }}>{title}</div>
      <div style={{ fontSize:11, color:T.sub, lineHeight:1.6 }}>{desc}</div>
    </button>
  );
}

// ── Toggle switch ──────────────────────────────────────────────────────────────
function Toggle({ label, sub, value, onChange, color, T }: {
  label:string; sub?:string; value:boolean; onChange:(v:boolean)=>void;
  color?:string; T:ReturnType<typeof mkT>;
}) {
  const ac = color ?? "rgb(147,197,253)";
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px",
      borderRadius:8, border:`1px solid ${value ? `${ac}40` : T.border}`, background: value ? `${ac}08` : T.card2, marginBottom:10 }}>
      <div>
        <div style={{ fontSize:12, fontWeight:600, color:T.text }}>{label}</div>
        {sub && <div style={{ fontSize:10, color:T.muted, marginTop:1 }}>{sub}</div>}
      </div>
      <button onClick={() => onChange(!value)} style={{
        width:40, height:22, borderRadius:11, border:"none", cursor:"pointer", padding:2,
        background: value ? ac : T.border, transition:"background 0.2s", position:"relative",
        display:"flex", alignItems:"center",
      }}>
        <div style={{
          width:18, height:18, borderRadius:"50%", background:"#fff",
          transform: value ? "translateX(18px)" : "translateX(0px)",
          transition:"transform 0.2s", boxShadow:"0 1px 3px rgba(0,0,0,0.3)",
        }} />
      </button>
    </div>
  );
}

// ── Input field ────────────────────────────────────────────────────────────────
function Field({ label, value, onChange, type="text", placeholder="", T, hint }: {
  label:string; value:string; onChange:(v:string)=>void; type?:string; placeholder?:string;
  T:ReturnType<typeof mkT>; hint?:string;
}) {
  return (
    <div style={{ marginBottom:14 }}>
      <label style={{ fontSize:11, fontWeight:700, color:T.sub, display:"block", marginBottom:4 }}>{label}</label>
      <input type={type} value={value} placeholder={placeholder} onChange={e=>onChange(e.target.value)}
        style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:`1px solid ${T.inpBdr}`,
          background:T.inp, color:T.text, fontSize:12, fontFamily:"inherit", outline:"none",
          boxSizing:"border-box", transition:"border-color 0.2s" }}
      />
      {hint && <div style={{ fontSize:10, color:T.muted, marginTop:3 }}>{hint}</div>}
    </div>
  );
}

// ── Download helper ────────────────────────────────────────────────────────────
function downloadText(filename: string, content: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type:"text/plain" }));
  a.download = filename;
  a.click();
}

// ── Download button ────────────────────────────────────────────────────────────
function DlBtn({ label, content, color, T }: {
  label:string; content:string; color:string; T:ReturnType<typeof mkT>;
}) {
  return (
    <button onClick={() => downloadText(label, content)}
      style={{ padding:"9px 16px", borderRadius:8, border:`1px solid ${color}40`,
        background:`${color}08`, color, fontFamily:"inherit", fontWeight:700,
        fontSize:11, cursor:"pointer", whiteSpace:"nowrap" }}>
      ⬇ {label}
    </button>
  );
}

// ── Hybrid architecture diagram (provider-aware) ──────────────────────────────
const PROVIDER_CLOUD_SERVICES: Record<CloudProvider, {label:string;sub:string}[]> = {
  aws: [
    { label:"Route 53 + ALB",         sub:"DNS · WAF · DDoS Shield"           },
    { label:"ECS Fargate — API",       sub:"aigo-x/api:2.4 · auto-scale · IAM" },
    { label:"ECS Fargate — Web UI",    sub:"aigo-x/web:2.4 · CloudFront CDN"   },
    { label:"ElastiCache Redis 7",     sub:"r7g.small · Multi-AZ · TLS"        },
    { label:"RDS PostgreSQL 16",       sub:"db.t3.medium · Multi-AZ · PITR"    },
    { label:"Secrets Manager + KMS",   sub:"Encrypted secrets · key rotation"  },
  ],
  azure: [
    { label:"App Gateway + Front Door",sub:"WAF v2 · HTTPS · DDoS Standard"   },
    { label:"Container Apps — API",    sub:"aigo-x/api:2.4 · KEDA auto-scale"  },
    { label:"Container Apps — Web",    sub:"aigo-x/web:2.4 · Azure CDN"        },
    { label:"Azure Cache Redis 7",     sub:"C1 Standard · geo-replication · TLS"},
    { label:"Azure DB PostgreSQL",     sub:"Flexible Server · HA · PITR"       },
    { label:"Key Vault + Entra ID",    sub:"Secrets · certificates · SSO"      },
  ],
  gcp: [
    { label:"Cloud LB + Cloud Armor",  sub:"HTTPS · WAF · CDN offload"         },
    { label:"Cloud Run — API",         sub:"aigo-x/api:2.4 · concurrency 80"   },
    { label:"Cloud Run — Web UI",      sub:"aigo-x/web:2.4 · global endpoints" },
    { label:"Memorystore Redis 7",     sub:"1GB Standard · HA · AUTH"          },
    { label:"Cloud SQL PostgreSQL 16", sub:"db-n1-standard · HA · auto-backups" },
    { label:"Secret Manager + KMS",    sub:"CMEK encryption · audit logs"      },
  ],
  k8s: [
    { label:"Ingress + cert-manager",  sub:"nginx-ingress · Let's Encrypt TLS" },
    { label:"Deployment: api",         sub:"replicas: 3 · HPA · PodDisruptionB." },
    { label:"Deployment: web",         sub:"replicas: 2 · HPA · CDN sidecar"   },
    { label:"StatefulSet: Redis",      sub:"redis:7.2-alpine · PVC 10Gi · TLS" },
    { label:"StatefulSet: Postgres",   sub:"postgres:16 · PVC 100Gi · WAL-G"   },
    { label:"Sealed Secrets + OPA",    sub:"GitOps secrets · policy engine"    },
  ],
  docker: [
    { label:"Nginx 1.25",              sub:"TLS termination · rate limiting"   },
    { label:"API Server",              sub:"aigo-x/api-server:2.4.1"           },
    { label:"Web UI",                  sub:"aigo-x/grc-platform:2.4.1"         },
    { label:"Redis 7.2-alpine",        sub:"Sessions · pub-sub · AOF persist"  },
    { label:"PostgreSQL 16",           sub:"Primary + replica · WAL archiving" },
    { label:"Secrets: .env vault",     sub:"Docker secrets · file permissions" },
  ],
};

const PROVIDER_COLOR: Record<CloudProvider, string> = {
  aws:"#FF9900", azure:"#0078D4", gcp:"#4285F4", k8s:"#326CE5", docker:"#2496ED",
};

function HybridDiagram({ T, monitoring, provider }: { T: ReturnType<typeof mkT>; monitoring: boolean; provider: CloudProvider }) {
  const pc = PROVIDER_COLOR[provider] ?? "#60A5FA";
  const cloudSvcs = PROVIDER_CLOUD_SERVICES[provider] ?? PROVIDER_CLOUD_SERVICES.docker;
  const providerLabel: Record<CloudProvider,string> = { aws:"AWS", azure:"Azure", gcp:"GCP", k8s:"Kubernetes", docker:"Docker" };

  const box = (label: string, sub: string, color: string) => (
    <div style={{ padding:"8px 12px", borderRadius:8, border:`1px solid ${color}35`, background:`${color}08`, textAlign:"center" }}>
      <div style={{ fontSize:11, fontWeight:700, color }}>{label}</div>
      <div style={{ fontSize:9, color:T.sub, marginTop:2 }}>{sub}</div>
    </div>
  );

  return (
    <div style={{ padding:"14px 16px", borderRadius:10, background:T.card2, border:`1px solid ${pc}30`, marginBottom:16 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
        <span style={{ fontSize:11, fontWeight:800, color:"#FB923C", textTransform:"uppercase", letterSpacing:"0.05em" }}>🔀 Hybrid Architecture</span>
        <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:20, background:`${pc}15`, color:pc, border:`1px solid ${pc}35` }}>
          {providerLabel[provider]} Control Plane
        </span>
      </div>
      <div style={{ display:"flex", gap:10 }}>
        {/* Cloud side */}
        <div style={{ flex:1 }}>
          <div style={{ fontSize:10, fontWeight:800, color:pc, marginBottom:8, textAlign:"center" }}>☁️ CLOUD CONTROL PLANE</div>
          <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
            {cloudSvcs.map(s => box(s.label, s.sub, pc))}
            {monitoring && box(provider==="aws" ? "CloudWatch + X-Ray" : provider==="azure" ? "Azure Monitor + Log Analytics" : provider==="gcp" ? "Cloud Monitoring + Trace" : "Prometheus + Grafana", "Metrics · logs · traces · alerts", "#A78BFA")}
          </div>
        </div>
        {/* Arrows */}
        <div style={{ display:"flex", flexDirection:"column", justifyContent:"center", alignItems:"center", gap:8, minWidth:52 }}>
          {(["mTLS","REST","VPN"] as string[]).map(lbl => (
            <div key={lbl} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:1 }}>
              <div style={{ fontSize:9, color:T.muted, fontWeight:700 }}>{lbl}</div>
              <div style={{ fontSize:14, color:"#FB923C" }}>⇄</div>
            </div>
          ))}
        </div>
        {/* On-prem side */}
        <div style={{ flex:1 }}>
          <div style={{ fontSize:10, fontWeight:800, color:"#FB923C", marginBottom:8, textAlign:"center" }}>🏢 ON-PREMISES NODES</div>
          <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
            {box("AIGO-X Endpoint Agent",   "Asset discovery · EDR telemetry",    "#FB923C")}
            {box("Browser Extension Agent", "AI tool usage · shadow IT detection", "#FB923C")}
            {box("AD / LDAP Connector",     "Identity sync · group membership",    "#FB923C")}
            {box("Evidence Engine",         "Local collection · gzip compression", "#FB923C")}
            {box("Network Scan Engine",     "CIDR sweep · port scan · vuln check", "#FB923C")}
            {box("IoT / OT Sensor",         "OPC-UA · MODBUS · passive BPF sniff", "#FB923C")}
            {monitoring && box("SIEM Forwarder", "Syslog · CEF · Splunk HEC egress", "#A78BFA")}
            {box("mTLS Outbound Proxy",     "Nginx tunnel · cert-pinning · retry", "#FB923C")}
          </div>
        </div>
      </div>
      <div style={{ marginTop:10, display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
        {[
          { icon:"🔐", label:"Zero inbound",  desc:"All connections initiated outbound from on-prem. No firewall holes required." },
          { icon:"📦", label:"Offline buffer", desc:"Agents cache evidence locally and replay on reconnect — no data loss." },
          { icon:"🔄", label:"30s–5m sync",   desc:"Per-agent configurable interval. Burst mode during incident response." },
          { icon:"🛡️", label:"Cert-pinned",   desc:"Mutual TLS with pinned cloud CA. Agents reject any untrusted endpoint." },
        ].map(f => (
          <div key={f.label} style={{ padding:"8px 10px", borderRadius:8, background:T.card, border:`1px solid ${T.border}` }}>
            <div style={{ fontSize:11 }}>{f.icon} <strong style={{ color:T.text }}>{f.label}</strong></div>
            <div style={{ fontSize:9, color:T.sub, marginTop:3, lineHeight:1.5 }}>{f.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Cloud provider badge ───────────────────────────────────────────────────────
const PROVIDERS: { id: CloudProvider; label: string; icon: string; sub: string; color: string; desc: string }[] = [
  { id:"aws",    icon:"🟠", label:"AWS",        sub:"ECS · Fargate · EKS",          color:"#FF9900", desc:"Amazon ECS/Fargate for containers, RDS for PostgreSQL, ElastiCache for Redis. ALB handles ingress with optional WAF." },
  { id:"azure",  icon:"🔷", label:"Azure",      sub:"Container Apps · AKS",          color:"#0078D4", desc:"Azure Container Apps or AKS for orchestration, Azure Database for PostgreSQL Flexible Server, Azure Cache for Redis." },
  { id:"gcp",    icon:"🔵", label:"GCP",        sub:"Cloud Run · GKE",               color:"#4285F4", desc:"Cloud Run for serverless containers or GKE for Kubernetes, Cloud SQL PostgreSQL, Memorystore for Redis." },
  { id:"k8s",    icon:"☸️", label:"Kubernetes", sub:"Self-managed · EKS · AKS · GKE", color:"#326CE5", desc:"Deploy to any Kubernetes cluster. Generates production-grade manifests with HPA, NetworkPolicy, PDB, and Ingress." },
  { id:"docker", icon:"🐳", label:"Docker",     sub:"Compose · VM · bare metal",     color:"#2496ED", desc:"Docker Compose stack for VM or bare metal servers. PostgreSQL, Redis, Nginx, and all services in a single compose file." },
];

// ── Main page ──────────────────────────────────────────────────────────────────
export default function DeploymentSetup() {
  const { theme } = useTheme();
  const isDark = theme !== "light";
  const T = mkT(isDark);

  const [step,             setStep]            = useState<Step>("target");
  const [deployType,       setDeployType]      = useState<DeployType>(null);
  const [tenantMode,       setTenantMode]      = useState<TenantMode>(null);
  // common config
  const [orgName,          setOrgName]         = useState("My Organisation");
  const [adminEmail,       setAdminEmail]      = useState("admin@example.com");
  const [openaiKey,        setOpenaiKey]       = useState("");
  const [webPort,          setWebPort]         = useState("443");
  const [apiPort,          setApiPort]         = useState("8080");
  // hybrid-specific
  const [cloudProvider,    setCloudProvider]   = useState<CloudProvider>("docker");
  const [cloudApiEndpoint, setCloudApiEndpoint]= useState("https://grc.aigosek.com");
  const [cloudDbUrl,       setCloudDbUrl]      = useState("");
  const [agentKey,         setAgentKey]        = useState("");
  const [agentCount,       setAgentCount]      = useState("1");
  const [agentRegions,     setAgentRegions]    = useState("dc-01");
  const [useK8s,           setUseK8s]          = useState(false);
  const [enableMonitoring, setEnableMonitoring]= useState(false);
  // provider-specific config
  const [awsRegion,        setAwsRegion]       = useState("us-east-1");
  const [awsAccountId,     setAwsAccountId]    = useState("");
  const [ecsCluster,       setEcsCluster]      = useState("aigo-x-cluster");
  const [azureRg,          setAzureRg]         = useState("aigo-x-rg");
  const [azureLocation,    setAzureLocation]   = useState("eastus");
  const [gcpProject,       setGcpProject]      = useState("");
  const [gcpRegion,        setGcpRegion]       = useState("us-central1");
  const [k8sContext,       setK8sContext]       = useState("");
  const [k8sNamespace,     setK8sNamespace]    = useState("aigo-x");
  const [k8sStorageClass,  setK8sStorageClass] = useState("standard");
  // state
  const [generating,       setGenerating]      = useState(false);
  const [generated,        setGenerated]       = useState<Generated|null>(null);
  const [error,            setError]           = useState("");
  const [currentConfig,    setCurrentConfig]   = useState<DeployConfig|null>(null);
  const [services,         setServices]        = useState<{services:Service[];summary:ServiceSummary}|null>(null);
  const [loadingSvc,       setLoadingSvc]      = useState(false);

  useEffect(() => {
    fetch(apiUrl("/deployment/config"), { headers: H() })
      .then(r => r.json()).then(setCurrentConfig).catch(()=>{});
  }, []);

  useEffect(() => {
    if (step === "done") {
      setLoadingSvc(true);
      fetch(apiUrl("/deployment/services"), { headers: H() })
        .then(r => r.json()).then(setServices).catch(()=>{})
        .finally(() => setLoadingSvc(false));
    }
  }, [step]);

  const isHybrid = deployType === "hybrid";
  const isOnPrem = deployType === "onprem";

  const effectiveK8s = useK8s || cloudProvider === "k8s";

  async function handleGenerate() {
    setGenerating(true); setError("");
    try {
      const r = await fetch(apiUrl("/deployment/generate-config"), {
        method:"POST", headers: H(),
        body: JSON.stringify({
          deploymentType: deployType ?? "onprem",
          tenantMode, orgName, adminEmail, openaiKey, webPort, apiPort,
          cloudApiEndpoint, cloudDbUrl, agentKey,
          cloudProvider, useK8s: String(effectiveK8s),
          agentCount, agentRegions,
          enableMonitoring: String(enableMonitoring),
          // provider-specific
          awsRegion, awsAccountId, ecsCluster,
          azureRg, azureLocation,
          gcpProject, gcpRegion,
          k8sContext, k8sNamespace, k8sStorageClass,
        }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error ?? "Generation failed"); return; }
      setGenerated(data);
      setStep("done");
    } catch { setError("Network error — please retry."); }
    finally { setGenerating(false); }
  }

  // ── Step progress bar ─────────────────────────────────────────────────────────
  const STEPS: { key:Step; label:string }[] = [
    { key:"target",   label:"Target"  },
    { key:"mode",     label:"Mode"    },
    { key:"config",   label:"Config"  },
    { key:"generate", label:"Review"  },
    { key:"done",     label:"Deploy"  },
  ];
  const stepIdx = STEPS.findIndex(s => s.key === step);

  const card: React.CSSProperties = {
    background: T.card, border:`1px solid ${T.border}`,
    borderRadius:12, padding:"20px 24px", boxShadow:"0 2px 16px rgba(0,0,0,0.15)",
  };

  return (
    <div style={{ padding:"24px 28px", maxWidth:900, margin:"0 auto", color:T.text, fontFamily:"inherit" }}>
      {/* Header */}
      <div style={{ marginBottom:28 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:6 }}>
          <div style={{ fontSize:20 }}>🚀</div>
          <h1 style={{ margin:0, fontSize:20, fontWeight:800, color:T.text }}>Deployment Configuration</h1>
          {currentConfig?.configured && (
            <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:20,
              background:"rgba(52,211,153,0.12)", color:"#34D399", border:"1px solid rgba(52,211,153,0.3)" }}>
              CONFIGURED
            </span>
          )}
        </div>
        <p style={{ margin:0, fontSize:12, color:T.sub }}>
          Prepare AIGO-X GRC Platform for cloud, on-premises, or hybrid deployment. Generates Docker Compose files, Kubernetes manifests, environment configuration, and setup scripts.
        </p>
      </div>

      {/* Current Config Banner */}
      {currentConfig && (
        <div style={{ ...card, marginBottom:20, display:"flex", gap:24, flexWrap:"wrap", padding:"14px 20px" }}>
          {[
            { label:"Type",        value: currentConfig.deploymentType.toUpperCase() },
            { label:"Mode",        value: currentConfig.tenantMode === "single" ? "Single Tenant" : "Multi-Tenant" },
            { label:"Environment", value: currentConfig.environment },
            { label:"Version",     value: currentConfig.version },
            { label:"AI Features", value: currentConfig.features.aiEnabled ? "✓ Enabled" : "✗ Disabled" },
            { label:"Database",    value: currentConfig.db.connected ? "✓ Connected" : "✗ Not Connected" },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize:10, fontWeight:700, color:T.muted, marginBottom:2 }}>{label}</div>
              <div style={{ fontSize:12, fontWeight:600, color:T.text }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Step Progress */}
      <div style={{ display:"flex", gap:0, marginBottom:28, ...card, padding:"14px 20px" }}>
        {STEPS.map((s, i) => (
          <div key={s.key} style={{ flex:1, display:"flex", alignItems:"center" }}>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", flex:1 }}>
              <div style={{
                width:28, height:28, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:11, fontWeight:800,
                background: i < stepIdx ? "#34D399" : i === stepIdx ? "rgb(147,197,253)" : T.card2,
                color: i <= stepIdx ? "#0f172a" : T.muted,
                border: i === stepIdx ? "2px solid rgb(147,197,253)" : `2px solid ${T.border}`,
                transition:"all 0.3s",
              }}>
                {i < stepIdx ? "✓" : i + 1}
              </div>
              <div style={{ fontSize:10, fontWeight:600, marginTop:4, color: i === stepIdx ? T.accent : i < stepIdx ? "#34D399" : T.muted }}>
                {s.label}
              </div>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ height:2, flex:1, background: i < stepIdx ? "#34D399" : T.border, margin:"0 4px", marginTop:-14, transition:"background 0.3s" }} />
            )}
          </div>
        ))}
      </div>

      {/* ── Step 1: Target ─────────────────────────────────────────────────────── */}
      {step === "target" && (
        <div style={card}>
          <h2 style={{ margin:"0 0 6px", fontSize:15, fontWeight:700, color:T.text }}>Step 1 — Deployment Target</h2>
          <p style={{ margin:"0 0 20px", fontSize:12, color:T.sub }}>Where will this AIGO-X GRC Platform instance run?</p>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14, marginBottom:20 }}>
            <ChoiceCard icon="☁️" title="Cloud" T={T}
              desc="Hosted on AWS, Azure, or GCP. Managed infrastructure, auto-scaling, no server management."
              selected={deployType==="cloud"} onClick={()=>setDeployType("cloud")}
              accentColor="rgb(147,197,253)" />
            <ChoiceCard icon="🏢" title="On-Premises" T={T}
              desc="Run on your own servers or private data centre. Full data sovereignty, air-gapped support, custom networking."
              selected={deployType==="onprem"} onClick={()=>setDeployType("onprem")}
              accentColor="#34D399" />
            <ChoiceCard icon="🔀" title="Hybrid" T={T}
              desc="Cloud control plane + on-prem agent nodes. Agents sync to cloud over mTLS — no inbound ports needed on-prem."
              selected={deployType==="hybrid"} onClick={()=>setDeployType("hybrid")}
              accentColor="#FB923C" />
          </div>

          {deployType === "cloud" && (
            <div style={{ padding:"12px 16px", borderRadius:8, background:"rgba(147,197,253,0.06)", border:"1px solid rgba(147,197,253,0.2)", fontSize:12, color:T.sub, marginBottom:16 }}>
              ☁️ <strong style={{ color:T.accent }}>Cloud deployment</strong> — deploy the Docker images to your cloud provider's container service (ECS, Cloud Run, or AKS). Use the on-prem or hybrid wizard to generate config files.
            </div>
          )}
          {deployType === "onprem" && (
            <div style={{ padding:"12px 16px", borderRadius:8, background:"rgba(52,211,153,0.06)", border:"1px solid rgba(52,211,153,0.2)", fontSize:12, color:T.sub, marginBottom:16 }}>
              🏢 <strong style={{ color:"#34D399" }}>On-Premises</strong> — full stack on your infrastructure. PostgreSQL, API, Web UI, and Nginx — all in a single Docker Compose stack with generated nginx.conf.
            </div>
          )}
          {deployType === "hybrid" && (
            <div style={{ padding:"12px 16px", borderRadius:8, background:"rgba(251,146,60,0.06)", border:"1px solid rgba(251,146,60,0.2)", fontSize:12, color:T.sub, marginBottom:16 }}>
              🔀 <strong style={{ color:"#FB923C" }}>Hybrid</strong> — cloud control plane (web, API, Redis, managed DB) with on-premises agent nodes. Generates Compose files, Kubernetes manifests, nginx configs, and a one-shot agent setup script.
            </div>
          )}

          <button
            onClick={() => {
              if (deployType === "onprem" || deployType === "hybrid") setStep("mode");
            }}
            disabled={!deployType}
            style={{ padding:"10px 24px", borderRadius:8, border:"none", fontFamily:"inherit", fontWeight:700, fontSize:12,
              cursor: deployType ? "pointer" : "not-allowed",
              background: deployType ? (isHybrid ? "#FB923C" : isOnPrem ? "#34D399" : "rgb(147,197,253)") : T.card2,
              color: deployType ? "#0f172a" : T.muted, transition:"all 0.2s" }}>
            {deployType === "cloud" ? "Cloud docs ↗" : "Continue →"}
          </button>
        </div>
      )}

      {/* ── Step 2: Mode ───────────────────────────────────────────────────────── */}
      {step === "mode" && (
        <div style={card}>
          <h2 style={{ margin:"0 0 6px", fontSize:15, fontWeight:700, color:T.text }}>Step 2 — Tenant Mode</h2>
          <p style={{ margin:"0 0 20px", fontSize:12, color:T.sub }}>How will this instance serve your organisation(s)?</p>
          <div style={{ display:"flex", gap:14, marginBottom:20 }}>
            <ChoiceCard icon="👤" title="Single Tenant" T={T}
              desc="One organisation. Simpler setup — dedicated instance for a single company. Recommended for internal deployments."
              selected={tenantMode==="single"} onClick={()=>setTenantMode("single")} />
            <ChoiceCard icon="🏢" title="Multi-Tenant" T={T}
              desc="Multiple organisations sharing one platform. Includes Super Admin tenant management portal, row-level isolation, and separate workspaces per org."
              selected={tenantMode==="multi"} onClick={()=>setTenantMode("multi")} />
          </div>

          {tenantMode && (
            <div style={{ padding:"12px 16px", borderRadius:8, marginBottom:16,
              background: tenantMode==="single" ? "rgba(52,211,153,0.06)" : "rgba(167,139,250,0.06)",
              border:`1px solid ${tenantMode==="single" ? "rgba(52,211,153,0.25)" : "rgba(167,139,250,0.25)"}`,
              fontSize:12, color:T.sub }}>
              {tenantMode === "single" ? (
                <>✅ <strong style={{color:"#34D399"}}>Single Tenant</strong>: Docker Compose with PostgreSQL + API + Frontend + Nginx. One org hardcoded at setup time.</>
              ) : (
                <>✅ <strong style={{color:"#A78BFA"}}>Multi-Tenant</strong>: Docker Compose with PostgreSQL + Redis + API + Frontend + Nginx. Tenant management via Super Admin portal.</>
              )}
            </div>
          )}

          <div style={{ display:"flex", gap:10 }}>
            <button onClick={()=>setStep("target")} style={{ padding:"10px 20px", borderRadius:8, border:`1px solid ${T.border}`, background:"transparent", color:T.sub, fontFamily:"inherit", fontWeight:600, fontSize:12, cursor:"pointer" }}>← Back</button>
            <button onClick={()=>{ if(tenantMode) setStep("config"); }} disabled={!tenantMode}
              style={{ padding:"10px 24px", borderRadius:8, border:"none", fontFamily:"inherit", fontWeight:700, fontSize:12, cursor: tenantMode?"pointer":"not-allowed",
                background: tenantMode ? (isHybrid ? "#FB923C" : "rgb(147,197,253)") : T.card2,
                color: tenantMode ? "#0f172a" : T.muted, transition:"all 0.2s" }}>
              Continue →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Config ─────────────────────────────────────────────────────── */}
      {step === "config" && (
        <div style={card}>
          <h2 style={{ margin:"0 0 6px", fontSize:15, fontWeight:700, color:T.text }}>Step 3 — Configuration</h2>
          <p style={{ margin:"0 0 20px", fontSize:12, color:T.sub }}>
            {isHybrid
              ? "Configure the cloud control plane, on-premises agent connectivity, and optional services."
              : "Provide details for your deployment. Secrets are auto-generated — you can edit them in the downloaded .env file."}
          </p>

          {isHybrid && <HybridDiagram T={T} monitoring={enableMonitoring} provider={cloudProvider} />}

          {/* Cloud provider picker — hybrid only */}
          {isHybrid && (
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:11, fontWeight:800, color:"#60A5FA", marginBottom:10, textTransform:"uppercase", letterSpacing:"0.05em" }}>☁️ Cloud Provider</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:8 }}>
                {PROVIDERS.map(p => {
                  const sel = cloudProvider === p.id;
                  return (
                    <button key={p.id} onClick={() => { setCloudProvider(p.id); if (p.id==="k8s") setUseK8s(true); }} style={{
                      padding:"12px 8px", borderRadius:10, cursor:"pointer", textAlign:"center",
                      border: sel ? `2px solid ${p.color}` : `2px solid ${T.border}`,
                      background: sel ? `${p.color}12` : T.card2,
                      fontFamily:"inherit", outline:"none", transition:"all 0.2s",
                    }}>
                      <div style={{ fontSize:22, marginBottom:4 }}>{p.icon}</div>
                      <div style={{ fontSize:11, fontWeight:700, color: sel ? p.color : T.text }}>{p.label}</div>
                      <div style={{ fontSize:9, color:T.muted, marginTop:2, lineHeight:1.4 }}>{p.sub}</div>
                    </button>
                  );
                })}
              </div>
              {(() => { const p = PROVIDERS.find(x => x.id === cloudProvider); return p ? (
                <div style={{ marginTop:10, padding:"10px 14px", borderRadius:8, background:`${p.color}08`, border:`1px solid ${p.color}25`, fontSize:11, color:T.sub, lineHeight:1.6 }}>
                  <strong style={{ color:p.color }}>{p.icon} {p.label}</strong> — {p.desc}
                </div>
              ) : null; })()}
            </div>
          )}

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
            <div>
              <div style={{ fontSize:11, fontWeight:800, color: isHybrid ? PROVIDER_COLOR[cloudProvider] : T.accent, marginBottom:10, textTransform:"uppercase", letterSpacing:"0.05em" }}>
                {tenantMode==="single" ? "Organisation Details" : "Platform Details"}
              </div>
              {tenantMode === "single" && (
                <>
                  <Field label="Organisation Name" value={orgName} onChange={setOrgName} placeholder="Acme Corporation" T={T} />
                  <Field label="Admin Email" value={adminEmail} onChange={setAdminEmail} type="email" placeholder="admin@acme.com" T={T} />
                </>
              )}
              {!isHybrid && (
                <>
                  <Field label="Web Port" value={webPort} onChange={setWebPort} placeholder="443" T={T} />
                  <Field label="API Port" value={apiPort} onChange={setApiPort} placeholder="8080" T={T} />
                </>
              )}
              {isHybrid && (
                <>
                  <Field label="Cloud API Endpoint" value={cloudApiEndpoint} onChange={setCloudApiEndpoint}
                    placeholder="https://grc.aigosek.com" T={T}
                    hint="Agents will phone home to this URL over mTLS" />
                  <Field label="Cloud Database URL (managed)" value={cloudDbUrl} onChange={setCloudDbUrl}
                    placeholder={
                      cloudProvider==="aws"   ? "postgresql://user:pass@cluster.rds.amazonaws.com:5432/aigo_grc" :
                      cloudProvider==="azure" ? "postgresql://user:pass@server.postgres.database.azure.com:5432/aigo_grc" :
                      cloudProvider==="gcp"   ? "postgresql://user:pass@/aigo_grc?host=/cloudsql/project:region:instance" :
                      "postgresql://user:pass@managed-db.example.com:5432/aigo_grc"
                    } T={T}
                    hint="Leave blank to use placeholder — update in .env.cloud after generation" />
                </>
              )}

              {/* Provider-specific fields */}
              {isHybrid && cloudProvider==="aws" && (
                <div style={{ marginTop:14 }}>
                  <div style={{ fontSize:11, fontWeight:800, color:"#FF9900", marginBottom:10, textTransform:"uppercase", letterSpacing:"0.05em" }}>🟠 AWS Configuration</div>
                  <Field label="AWS Region" value={awsRegion} onChange={setAwsRegion} placeholder="us-east-1" T={T} hint="ECS cluster region — e.g. us-east-1, eu-west-1" />
                  <Field label="AWS Account ID" value={awsAccountId} onChange={setAwsAccountId} placeholder="123456789012" T={T} hint="12-digit account ID for ECR image URLs" />
                  <Field label="ECS Cluster Name" value={ecsCluster} onChange={setEcsCluster} placeholder="aigo-x-cluster" T={T} hint="Existing ECS cluster or leave as default to create new" />
                </div>
              )}
              {isHybrid && cloudProvider==="azure" && (
                <div style={{ marginTop:14 }}>
                  <div style={{ fontSize:11, fontWeight:800, color:"#0078D4", marginBottom:10, textTransform:"uppercase", letterSpacing:"0.05em" }}>🔷 Azure Configuration</div>
                  <Field label="Resource Group" value={azureRg} onChange={setAzureRg} placeholder="aigo-x-rg" T={T} hint="Azure Resource Group to deploy into" />
                  <Field label="Azure Location" value={azureLocation} onChange={setAzureLocation} placeholder="eastus" T={T} hint="e.g. eastus, westeurope, uksouth" />
                </div>
              )}
              {isHybrid && cloudProvider==="gcp" && (
                <div style={{ marginTop:14 }}>
                  <div style={{ fontSize:11, fontWeight:800, color:"#4285F4", marginBottom:10, textTransform:"uppercase", letterSpacing:"0.05em" }}>🔵 GCP Configuration</div>
                  <Field label="GCP Project ID" value={gcpProject} onChange={setGcpProject} placeholder="my-gcp-project-id" T={T} hint="Used for Cloud Run service and Artifact Registry" />
                  <Field label="GCP Region" value={gcpRegion} onChange={setGcpRegion} placeholder="us-central1" T={T} hint="e.g. us-central1, europe-west1, asia-east1" />
                </div>
              )}
              {isHybrid && cloudProvider==="k8s" && (
                <div style={{ marginTop:14 }}>
                  <div style={{ fontSize:11, fontWeight:800, color:"#326CE5", marginBottom:10, textTransform:"uppercase", letterSpacing:"0.05em" }}>☸️ Kubernetes Configuration</div>
                  <Field label="kubectl Context" value={k8sContext} onChange={setK8sContext} placeholder="kubernetes-admin@aigo-x" T={T} hint="kubectl context name — leave blank for current-context" />
                  <Field label="Namespace" value={k8sNamespace} onChange={setK8sNamespace} placeholder="aigo-x" T={T} hint="Kubernetes namespace for all AIGO-X resources" />
                  <Field label="Storage Class" value={k8sStorageClass} onChange={setK8sStorageClass} placeholder="standard" T={T} hint="StorageClass for PVC — e.g. standard, gp3, azuredisk" />
                </div>
              )}
            </div>

            <div>
              {isHybrid ? (
                <>
                  <div style={{ fontSize:11, fontWeight:800, color:"#FB923C", marginBottom:10, textTransform:"uppercase", letterSpacing:"0.05em" }}>On-Premises Agent Config</div>
                  <Field label="Agent Registration Key" value={agentKey} onChange={setAgentKey}
                    type="password" placeholder="Leave blank to auto-generate" T={T} />
                  <Field label="Number of Agent Nodes" value={agentCount} onChange={setAgentCount}
                    placeholder="1" T={T} hint="How many on-prem nodes to configure (max 10)" />
                  <Field label="Agent Region Names" value={agentRegions} onChange={setAgentRegions}
                    placeholder="dc-01, dc-02, london-03" T={T}
                    hint="Comma-separated region labels — one per agent node" />
                  <Field label="OpenAI API Key (optional)" value={openaiKey} onChange={setOpenaiKey}
                    type="password" placeholder="sk-… (leave blank to disable AI)" T={T} />
                </>
              ) : (
                <>
                  <div style={{ fontSize:11, fontWeight:800, color:T.accent, marginBottom:10, textTransform:"uppercase", letterSpacing:"0.05em" }}>AI Features (Optional)</div>
                  <Field label="OpenAI API Key" value={openaiKey} onChange={setOpenaiKey}
                    type="password" placeholder="sk-… (leave blank to disable AI)" T={T} />
                  <div style={{ padding:"10px 12px", borderRadius:8, background:T.card2, border:`1px solid ${T.border}`, fontSize:11, color:T.sub, lineHeight:1.6 }}>
                    🔐 <strong>Security secrets</strong> (JWT, DB password, encryption key) are <strong>auto-generated</strong> using OpenSSL-grade randomness and written to your .env file.
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Optional services — hybrid only */}
          {isHybrid && (
            <div style={{ marginTop:16 }}>
              <div style={{ fontSize:11, fontWeight:800, color:T.accent, marginBottom:10, textTransform:"uppercase", letterSpacing:"0.05em" }}>Optional Services</div>
              <Toggle
                label="Kubernetes Manifests"
                sub={cloudProvider==="k8s" ? "Auto-enabled — K8s provider generates production-grade manifests with HPA, NetworkPolicy, PDB" : "Generate k8s-cloud.yaml and k8s-agents.yaml alongside Docker Compose files"}
                value={effectiveK8s} onChange={v => { setUseK8s(v); }} color="#326CE5" T={T} />
              <Toggle
                label="Monitoring Stack"
                sub={cloudProvider==="aws" ? "CloudWatch metrics + X-Ray tracing — adds IAM role hints to env file" : cloudProvider==="azure" ? "Azure Monitor + Log Analytics workspace integration" : cloudProvider==="gcp" ? "Cloud Monitoring + Cloud Trace — adds GCP project annotations" : "Prometheus + Grafana — added to cloud compose, pre-provisioned dashboards"}
                value={enableMonitoring} onChange={setEnableMonitoring} color="#A78BFA" T={T} />
            </div>
          )}

          <div style={{ display:"flex", gap:10, marginTop:20 }}>
            <button onClick={()=>setStep("mode")} style={{ padding:"10px 20px", borderRadius:8, border:`1px solid ${T.border}`, background:"transparent", color:T.sub, fontFamily:"inherit", fontWeight:600, fontSize:12, cursor:"pointer" }}>← Back</button>
            <button onClick={()=>setStep("generate")}
              style={{ padding:"10px 24px", borderRadius:8, border:"none", fontFamily:"inherit", fontWeight:700, fontSize:12, cursor:"pointer",
                background: isHybrid ? "#FB923C" : "rgb(147,197,253)", color:"#0f172a" }}>
              Review →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: Review / Generate ──────────────────────────────────────────── */}
      {step === "generate" && (
        <div style={card}>
          <h2 style={{ margin:"0 0 6px", fontSize:15, fontWeight:700, color:T.text }}>Step 4 — Review & Generate</h2>
          <p style={{ margin:"0 0 20px", fontSize:12, color:T.sub }}>
            {isHybrid
              ? "Review your hybrid configuration. Files will be generated for the cloud control plane and each on-prem agent region."
              : "Review your deployment configuration, then generate the Docker Compose and .env files."}
          </p>

          {isHybrid && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
              {/* Cloud column */}
              <div>
                <div style={{ fontSize:10, fontWeight:800, color:"#60A5FA", marginBottom:8, textTransform:"uppercase", letterSpacing:"0.05em" }}>☁️ Cloud Control Plane</div>
                {[
                  { label:"Provider",      value: PROVIDERS.find(p=>p.id===cloudProvider)?.label ?? cloudProvider, icon: PROVIDERS.find(p=>p.id===cloudProvider)?.icon ?? "☁️" },
                  { label:"API Endpoint",  value: cloudApiEndpoint || "https://grc.aigosek.com", icon:"🌐" },
                  { label:"Database",      value: cloudDbUrl ? "Custom (provided)" : cloudProvider==="aws" ? "RDS PostgreSQL 16" : cloudProvider==="azure" ? "Azure DB PostgreSQL Flexible" : cloudProvider==="gcp" ? "Cloud SQL PostgreSQL 16" : "Placeholder — update in .env.cloud", icon:"🗄️" },
                  { label:"Cache",         value: cloudProvider==="aws" ? "ElastiCache Redis 7" : cloudProvider==="azure" ? "Azure Cache for Redis" : cloudProvider==="gcp" ? "Memorystore Redis 7" : "Redis 7.2-alpine", icon:"⚡" },
                  { label:"Tenant Mode",   value: tenantMode==="single" ? "Single Tenant" : "Multi-Tenant", icon:"🏢" },
                  { label:"Monitoring",    value: enableMonitoring ? (cloudProvider==="aws" ? "CloudWatch + X-Ray" : cloudProvider==="azure" ? "Azure Monitor + Log Analytics" : cloudProvider==="gcp" ? "Cloud Monitoring + Trace" : "Prometheus + Grafana") : "Disabled", icon: enableMonitoring ? "📊" : "—" },
                  { label:"K8s Manifests", value: effectiveK8s ? "Included (HPA + PDB + NetworkPolicy)" : "Docker Compose only", icon: effectiveK8s ? "☸️" : "🐳" },
                  ...(cloudProvider==="aws"   ? [{ label:"AWS Region",      value: awsRegion||"us-east-1",  icon:"🟠" }, { label:"ECS Cluster", value: ecsCluster||"aigo-x-cluster", icon:"📦" }] : []),
                  ...(cloudProvider==="azure" ? [{ label:"Resource Group",  value: azureRg||"aigo-x-rg",    icon:"🔷" }, { label:"Location",    value: azureLocation||"eastus",       icon:"📍" }] : []),
                  ...(cloudProvider==="gcp"   ? [{ label:"GCP Project",     value: gcpProject||"(not set)",  icon:"🔵" }, { label:"Region",      value: gcpRegion||"us-central1",      icon:"📍" }] : []),
                  ...(cloudProvider==="k8s"   ? [{ label:"Namespace",       value: k8sNamespace||"aigo-x",   icon:"☸️" }, { label:"StorageClass", value: k8sStorageClass||"standard",  icon:"💾" }] : []),
                  ...(tenantMode==="single" ? [
                    { label:"Organisation", value: orgName, icon:"🏷️" },
                    { label:"Admin Email",  value: adminEmail, icon:"📧" },
                  ] : []),
                ].map(({ label, value, icon }) => (
                  <div key={label} style={{ padding:"7px 12px", borderRadius:8, background:"rgba(96,165,250,0.04)", border:"1px solid rgba(96,165,250,0.15)", marginBottom:5 }}>
                    <div style={{ fontSize:10, color:T.muted, marginBottom:1 }}>{label}</div>
                    <div style={{ fontSize:12, fontWeight:600, color:T.text }}>{icon} {value}</div>
                  </div>
                ))}
              </div>
              {/* On-prem column */}
              <div>
                <div style={{ fontSize:10, fontWeight:800, color:"#FB923C", marginBottom:8, textTransform:"uppercase", letterSpacing:"0.05em" }}>🏢 On-Premises Agent Nodes</div>
                {[
                  { label:"Agent Nodes",      value: `${agentCount || "1"} node(s)`, icon:"🤖" },
                  { label:"Regions",          value: agentRegions || "dc-01", icon:"📍" },
                  { label:"Evidence Engine",  value: "Local collector (per node)", icon:"🔬" },
                  { label:"Scan Engine",      value: "CIDR + AD probe", icon:"🔍" },
                  { label:"Connectivity",     value: "mTLS outbound only", icon:"🔐" },
                  { label:"Agent Key",        value: agentKey ? "Custom (provided)" : "Auto-generated", icon:"🔑" },
                  { label:"AI Features",      value: openaiKey ? "Enabled" : "Disabled", icon: openaiKey ? "🤖" : "—" },
                  { label:"Setup Script",     value: "setup-agents.sh included", icon:"📜" },
                ].map(({ label, value, icon }) => (
                  <div key={label} style={{ padding:"7px 12px", borderRadius:8, background:"rgba(251,146,60,0.04)", border:"1px solid rgba(251,146,60,0.15)", marginBottom:5 }}>
                    <div style={{ fontSize:10, color:T.muted, marginBottom:1 }}>{label}</div>
                    <div style={{ fontSize:12, fontWeight:600, color:T.text }}>{icon} {value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isHybrid && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:20 }}>
              {[
                { label:"Deployment Type", value: "On-Premises", icon:"🏢" },
                { label:"Tenant Mode",     value: tenantMode==="single" ? "Single Tenant" : "Multi-Tenant", icon: tenantMode==="single" ? "👤" : "🏢" },
                ...(tenantMode==="single" ? [
                  { label:"Organisation", value: orgName,    icon:"🏷️" },
                  { label:"Admin Email",  value: adminEmail, icon:"📧" },
                ] : []),
                { label:"Web Port",     value: webPort,                          icon:"🌐" },
                { label:"API Port",     value: apiPort,                          icon:"⚙️" },
                { label:"AI Features",  value: openaiKey ? "Enabled" : "Disabled (add key later)", icon: openaiKey ? "🤖" : "—" },
                { label:"Database",     value:"PostgreSQL 16 (auto-configured)", icon:"🗄️" },
                { label:"Nginx Config", value:"nginx.conf included",             icon:"⚙️" },
                { label:"TLS/SSL",      value:"Provide certs in ./ssl/",         icon:"🔒" },
              ].map(({ label, value, icon }) => (
                <div key={label} style={{ padding:"10px 14px", borderRadius:8, background:T.card2, border:`1px solid ${T.border}` }}>
                  <div style={{ fontSize:10, color:T.muted, marginBottom:3 }}>{label}</div>
                  <div style={{ fontSize:12, fontWeight:600, color:T.text }}>{icon} {value}</div>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div style={{ padding:"10px 14px", borderRadius:8, background:"rgba(248,113,113,0.08)", border:"1px solid rgba(248,113,113,0.3)", color:"#F87171", fontSize:12, marginBottom:14 }}>
              {error}
            </div>
          )}

          <div style={{ display:"flex", gap:10 }}>
            <button onClick={()=>setStep("config")} style={{ padding:"10px 20px", borderRadius:8, border:`1px solid ${T.border}`, background:"transparent", color:T.sub, fontFamily:"inherit", fontWeight:600, fontSize:12, cursor:"pointer" }}>← Back</button>
            <button onClick={handleGenerate} disabled={generating}
              style={{ padding:"10px 28px", borderRadius:8, border:"none", fontFamily:"inherit", fontWeight:700, fontSize:12, cursor: generating?"wait":"pointer",
                background: generating ? T.card2 : (isHybrid ? "#FB923C" : "#34D399"),
                color: generating ? T.muted : "#0f172a", transition:"all 0.2s" }}>
              {generating ? "⏳ Generating…" : isHybrid ? "🔀 Generate Hybrid Config" : "⬇ Generate & Download Files"}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 5: Done ───────────────────────────────────────────────────────── */}
      {step === "done" && generated && (
        <div>
          <div style={{ ...card, borderColor: isHybrid ? "rgba(251,146,60,0.3)" : "rgba(52,211,153,0.3)", marginBottom:16 }}>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
              <div style={{ fontSize:28 }}>{isHybrid ? "🔀" : "✅"}</div>
              <div>
                <div style={{ fontSize:15, fontWeight:800, color: isHybrid ? "#FB923C" : "#34D399" }}>
                  {isHybrid ? "Hybrid Configuration Generated!" : "Configuration Generated!"}
                </div>
                <div style={{ fontSize:12, color:T.sub, marginTop:2 }}>
                  {isHybrid
                    ? `${generated.k8s ? "Compose + K8s manifests" : "Docker Compose files"}, nginx configs, and agent setup script — ready to deploy.`
                    : "Download the files below and follow the deployment steps."}
                </div>
              </div>
            </div>

            {/* ── Hybrid downloads ── */}
            {isHybrid && generated.composeCloudContent && (
              <>
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:11, fontWeight:800, color:"#60A5FA", marginBottom:8, textTransform:"uppercase", letterSpacing:"0.05em" }}>☁️ Cloud Control Plane</div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    {generated.cloudProvider !== "k8s" && (
                      <DlBtn label="docker-compose.cloud.yml" content={generated.composeCloudContent} color="#60A5FA" T={T} />
                    )}
                    <DlBtn label=".env.cloud"               content={generated.envCloudContent!}    color="#60A5FA" T={T} />
                    {generated.cloudProvider !== "k8s" && (
                      <DlBtn label="nginx.conf"               content={generated.nginxContent!}        color="#60A5FA" T={T} />
                    )}
                    {generated.k8s && generated.k8sCloudManifest && (
                      <DlBtn label="k8s-cloud.yaml" content={generated.k8sCloudManifest} color="#326CE5" T={T} />
                    )}
                    {generated.monitoring && generated.prometheusYml && (
                      <DlBtn label="prometheus.yml" content={generated.prometheusYml} color="#A78BFA" T={T} />
                    )}
                    {generated.providerScript && (
                      <DlBtn label={
                        generated.cloudProvider==="aws"   ? "deploy-aws.sh"   :
                        generated.cloudProvider==="azure" ? "deploy-azure.sh" :
                        generated.cloudProvider==="gcp"   ? "deploy-gcp.sh"   :
                        generated.cloudProvider==="k8s"   ? "deploy-k8s.sh"   : "deploy.sh"
                      } content={generated.providerScript} color={PROVIDER_COLOR[generated.cloudProvider as CloudProvider] ?? "#60A5FA"} T={T} />
                    )}
                  </div>
                </div>

                <div style={{ marginBottom:20 }}>
                  <div style={{ fontSize:11, fontWeight:800, color:"#FB923C", marginBottom:8, textTransform:"uppercase", letterSpacing:"0.05em" }}>🏢 On-Premises Agent Nodes</div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    <DlBtn label="docker-compose.agent.yml" content={generated.composeOnPremContent!} color="#FB923C" T={T} />
                    <DlBtn label=".env.onprem"              content={generated.envOnPremContent!}      color="#FB923C" T={T} />
                    <DlBtn label="nginx-agent.conf"         content={generated.nginxAgentContent!}     color="#FB923C" T={T} />
                    <DlBtn label="setup-agents.sh"          content={generated.setupScript!}           color="#34D399" T={T} />
                    {generated.k8s && generated.k8sAgentManifest && (
                      <DlBtn label="k8s-agents.yaml" content={generated.k8sAgentManifest} color="#A78BFA" T={T} />
                    )}
                  </div>
                </div>
              </>
            )}

            {/* ── On-prem downloads ── */}
            {!isHybrid && (
              <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" }}>
                <DlBtn label="docker-compose.yml" content={generated.composeContent!} color={T.accent}  T={T} />
                <DlBtn label=".env"               content={generated.envContent!}     color="#34D399"    T={T} />
                {generated.nginxContent && (
                  <DlBtn label="nginx.conf" content={generated.nginxContent} color="#FBBF24" T={T} />
                )}
              </div>
            )}

            {/* Deployment steps */}
            <div style={{ background:T.card2, border:`1px solid ${T.border}`, borderRadius:8, padding:"14px 16px" }}>
              <div style={{ fontSize:11, fontWeight:700, color: isHybrid ? "#FB923C" : T.accent, marginBottom:10 }}>
                {isHybrid ? "HYBRID DEPLOYMENT STEPS" : "DEPLOYMENT STEPS"}
              </div>
              {(isHybrid ? (
                generated.cloudProvider === "aws" ? [
                  "Authenticate: aws configure (set region to " + (awsRegion||"us-east-1") + ")",
                  "Create ECR repos: aws ecr create-repository --repository-name aigo-x/api && aws ecr create-repository --repository-name aigo-x/web",
                  "Push images: aws ecr get-login-password | docker login --username AWS --password-stdin <account>.dkr.ecr." + (awsRegion||"us-east-1") + ".amazonaws.com",
                  "Register task definitions: aws ecs register-task-definition --cli-input-json file://ecs-task-api.json",
                  "Update service: aws ecs update-service --cluster " + (ecsCluster||"aigo-x-cluster") + " --service aigo-x-api --force-new-deployment",
                  "Run cloud DB migrations: aws ecs run-task --cluster " + (ecsCluster||"aigo-x-cluster") + " --task-definition aigo-x-migrate",
                  "Retrieve AGENT_REGISTRATION_KEY from .env.cloud",
                  "Copy docker-compose.agent.yml + .env.onprem + setup-agents.sh to each on-prem server",
                  "Generate mTLS certs: openssl req -x509 -newkey rsa:4096 -keyout agent.key -out agent.crt -days 3650 -nodes",
                  "Run: chmod +x setup-agents.sh && sudo ./setup-agents.sh",
                  "Verify agent connectivity: AIGO-X → Settings → Agent Nodes",
                  ...(effectiveK8s ? ["Apply K8s manifests: kubectl apply -f k8s-cloud.yaml && kubectl apply -f k8s-agents.yaml"] : []),
                ] : generated.cloudProvider === "azure" ? [
                  "Login: az login && az account set --subscription <subscription-id>",
                  "Create resource group: az group create --name " + (azureRg||"aigo-x-rg") + " --location " + (azureLocation||"eastus"),
                  "Create ACR: az acr create --resource-group " + (azureRg||"aigo-x-rg") + " --name aigoxacr --sku Basic",
                  "Build & push: az acr build --registry aigoxacr --image aigo-x/api:1.0 .",
                  "Deploy Container App: az containerapp up --name aigo-x-api --resource-group " + (azureRg||"aigo-x-rg") + " --image aigoxacr.azurecr.io/aigo-x/api:1.0",
                  "Run cloud DB migrations: az containerapp exec --name aigo-x-api --resource-group " + (azureRg||"aigo-x-rg") + " --command 'pnpm db:migrate'",
                  "Retrieve AGENT_REGISTRATION_KEY from .env.cloud",
                  "Copy docker-compose.agent.yml + .env.onprem + setup-agents.sh to each on-prem server",
                  "Generate mTLS certs: openssl req -x509 -newkey rsa:4096 -keyout agent.key -out agent.crt -days 3650 -nodes",
                  "Run: chmod +x setup-agents.sh && sudo ./setup-agents.sh",
                  "Verify agent connectivity: AIGO-X → Settings → Agent Nodes",
                  ...(effectiveK8s ? ["Apply K8s manifests: kubectl apply -f k8s-cloud.yaml && kubectl apply -f k8s-agents.yaml"] : []),
                ] : generated.cloudProvider === "gcp" ? [
                  "Authenticate: gcloud auth login && gcloud config set project " + (gcpProject||"<project-id>"),
                  "Enable APIs: gcloud services enable run.googleapis.com sqladmin.googleapis.com redis.googleapis.com",
                  "Build & push: gcloud builds submit --tag gcr.io/" + (gcpProject||"<project>") + "/aigo-x-api:1.0",
                  "Deploy: gcloud run deploy aigo-x-api --image gcr.io/" + (gcpProject||"<project>") + "/aigo-x-api:1.0 --region " + (gcpRegion||"us-central1") + " --allow-unauthenticated",
                  "Run cloud DB migrations: gcloud run jobs execute aigo-x-migrate --region " + (gcpRegion||"us-central1"),
                  "Retrieve AGENT_REGISTRATION_KEY from .env.cloud",
                  "Copy docker-compose.agent.yml + .env.onprem + setup-agents.sh to each on-prem server",
                  "Generate mTLS certs: openssl req -x509 -newkey rsa:4096 -keyout agent.key -out agent.crt -days 3650 -nodes",
                  "Run: chmod +x setup-agents.sh && sudo ./setup-agents.sh",
                  "Verify agent connectivity: AIGO-X → Settings → Agent Nodes",
                  ...(effectiveK8s ? ["Apply K8s manifests: kubectl apply -f k8s-cloud.yaml && kubectl apply -f k8s-agents.yaml"] : []),
                ] : generated.cloudProvider === "k8s" ? [
                  "Set context: kubectl config use-context " + (k8sContext||"<your-context>"),
                  "Create namespace: kubectl create namespace " + (k8sNamespace||"aigo-x"),
                  "Create secrets: kubectl create secret generic aigo-x-secrets --from-env-file=.env.cloud -n " + (k8sNamespace||"aigo-x"),
                  "Apply cloud manifests: kubectl apply -f k8s-cloud.yaml -n " + (k8sNamespace||"aigo-x"),
                  "Wait for pods: kubectl rollout status deployment/aigo-x-api -n " + (k8sNamespace||"aigo-x"),
                  "Run DB migrations: kubectl exec -n " + (k8sNamespace||"aigo-x") + " deploy/aigo-x-api -- pnpm db:migrate",
                  "Retrieve AGENT_REGISTRATION_KEY from .env.cloud",
                  "Copy docker-compose.agent.yml + .env.onprem + setup-agents.sh to each on-prem server",
                  "Generate mTLS certs: openssl req -x509 -newkey rsa:4096 -keyout agent.key -out agent.crt -days 3650 -nodes",
                  "Run: chmod +x setup-agents.sh && sudo ./setup-agents.sh",
                  "Apply agent manifests: kubectl apply -f k8s-agents.yaml",
                  "Verify agent connectivity: AIGO-X → Settings → Agent Nodes",
                ] : [
                  "Deploy cloud compose: docker compose -f docker-compose.cloud.yml --env-file .env.cloud up -d",
                  "Run cloud DB migrations: docker compose -f docker-compose.cloud.yml exec api pnpm db:migrate",
                  "Verify cloud health: curl https://<your-cloud-api>/api/healthz",
                  "Retrieve AGENT_REGISTRATION_KEY from .env.cloud",
                  "Copy docker-compose.agent.yml + .env.onprem + setup-agents.sh to each on-prem server",
                  "Generate mTLS certs: openssl req -x509 -newkey rsa:4096 -keyout agent.key -out agent.crt -days 3650 -nodes",
                  "Run: chmod +x setup-agents.sh && sudo ./setup-agents.sh",
                  "Verify agent connectivity: AIGO-X → Settings → Agent Nodes",
                  ...(effectiveK8s ? ["Apply K8s manifests: kubectl apply -f k8s-cloud.yaml && kubectl apply -f k8s-agents.yaml"] : []),
                ]
              ) : [
                "Place downloaded files in your deployment directory",
                "Add TLS certificates to ./ssl/ (fullchain.pem, privkey.pem)",
                "Review .env — update OPENAI_API_KEY if needed",
                "Run: docker compose up -d",
                "Run migrations: docker compose exec api pnpm db:migrate",
                "Seed initial data: docker compose exec api node dist/seed.mjs",
                `Open: https://your-server:${webPort}/grc-platform`,
              ]).map((s, i) => (
                <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start", marginBottom:6 }}>
                  <div style={{ width:18, height:18, borderRadius:"50%",
                    background: isHybrid ? "rgba(251,146,60,0.15)" : "rgba(147,197,253,0.15)",
                    color: isHybrid ? "#FB923C" : T.accent,
                    fontSize:10, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:1 }}>{i+1}</div>
                  <div style={{ fontSize:11, color:T.sub, fontFamily:"'JetBrains Mono',monospace", lineHeight:1.5 }}>{s}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Service Registry */}
          <div style={card}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
              <div style={{ fontSize:14, fontWeight:700, color:T.text }}>🔬 Microservice Health Check</div>
              {services?.summary && (
                <div style={{ display:"flex", gap:8 }}>
                  {[
                    { label:`${services.summary.healthy} Healthy`,   color:"#34D399" },
                    { label:`${services.summary.degraded} Degraded`, color:"#FBBF24" },
                    { label:`${services.summary.down} Down`,         color:"#F87171" },
                  ].map(({ label, color }) => (
                    <span key={label} style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:20, background:`${color}20`, color, border:`1px solid ${color}40` }}>{label}</span>
                  ))}
                </div>
              )}
            </div>

            {loadingSvc ? (
              <div style={{ color:T.muted, fontSize:12, padding:"20px 0", textAlign:"center" }}>Loading service registry…</div>
            ) : services ? (
              <div style={{ display:"grid", gap:6, gridTemplateColumns:"repeat(auto-fill, minmax(280px,1fr))" }}>
                {services.services.map(svc => (
                  <div key={svc.name} style={{ padding:"10px 14px", borderRadius:8, background:T.card2, border:`1px solid ${T.border}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <div>
                      <div style={{ fontSize:12, fontWeight:600, color:T.text }}>{svc.name}</div>
                      <div style={{ fontSize:10, color:T.muted }}>{svc.path} · v{svc.version}</div>
                    </div>
                    <StatusPill status={svc.status} />
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color:T.muted, fontSize:12 }}>Service data unavailable (super_admin required)</div>
            )}
          </div>

          <div style={{ marginTop:14, textAlign:"center" }}>
            <button onClick={()=>{ setStep("target"); setDeployType(null); setTenantMode(null); setGenerated(null); setError(""); }}
              style={{ padding:"8px 20px", borderRadius:8, border:`1px solid ${T.border}`, background:"transparent", color:T.sub, fontFamily:"inherit", fontWeight:600, fontSize:11, cursor:"pointer" }}>
              ↺ Start Over
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
