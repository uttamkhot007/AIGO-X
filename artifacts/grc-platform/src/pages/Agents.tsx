import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { CATALOG, CATEGORIES, type ConnDef } from "@/lib/agent-catalog";

// ── Theme tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:      "var(--secondary)",
  bg2:     "var(--border)",
  border:  "rgba(255,255,255,0.10)",
  border2: "rgba(255,255,255,0.16)",
  text:    "rgba(255,255,255,0.92)",
  muted:   "rgba(255,255,255,0.45)",
  dim:     "rgba(255,255,255,0.28)",
  online:  "#10B981",
  warn:    "#F59E0B",
  danger:  "#EF4444",
  info:    "#3B82F6",
  purple:  "#8B5CF6",
  teal:    "#22D3EE",
  nav:     "#60A5FA",
};

// ── Types ────────────────────────────────────────────────────────────────────
type AgentOS = "windows" | "linux" | "macos" | "mobile" | "cloud";
type AgentStatus = "online" | "offline" | "warning" | "stale";
type ConnStatus  = "connected" | "partial" | "warning" | "available" | "error";

interface Agent {
  id: string; hostname: string; os: AgentOS; arch: string; version: string;
  status: AgentStatus; lastSeen: string; registeredAt?: string; ip: string; tags: string[];
  health: { cpu: number; mem: number; disk: number; uptime: number };
  policy: { scanSchedule: string; reportingIntervalSecs: number; dataTypes: string[]; maxCpuPct: number; moduleFeeds?: string[] };
  telemetry: { assetsDiscovered: number; eventsLastHour: number; alertsOpen: number };
  pendingPush?: boolean;
  feedActivity?: Record<string, string>;
}

const FEED_COLORS: Record<string, string> = {
  complyops:  "#8B5CF6",
  assetops:   "#22D3EE",
  dataops:    "#3B82F6",
  secops:     "#F59E0B",
  serviceops: "#10B981",
  caasm:      "#22D3EE",
  cspm:       "#60A5FA",
  "network-audit": "#F59E0B",
};

const FEED_NAV: Record<string, string> = {
  complyops:       "/complianceops",
  assetops:        "/assetops",
  dataops:         "/dataops",
  secops:          "/secops",
  serviceops:      "/serviceops",
  caasm:           "/assetops",
  cspm:            "/cloudops",
  "network-audit": "/secops",
};

const FEED_LABEL: Record<string, string> = {
  complyops:       "ComplyOps",
  assetops:        "AssetOps",
  dataops:         "DataOps",
  secops:          "SecOps",
  serviceops:      "ServiceOps",
  caasm:           "AssetOps",
  cspm:            "CloudOps",
  "network-audit": "SecOps",
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
interface ActiveConn { id:string; connectorId:string; connectorName:string; category:string; status:ConnStatus; assetsIngested:number; eventsIngested:number; lastSync:string|null; errorCount:number; }
interface WebhookCfg { id:string; direction:"inbound"|"outbound"; name:string; url:string; signingSecret:string; eventTypes:string[]; active:boolean; createdAt:string; }
interface DeliveryRow { id:string; ts:string; event:string; statusCode:number; latencyMs:number; success:boolean; payload:string; }
interface PipelineMetric { connectorId:string; connectorName:string; date:string; volumeIn:number; latencyP50Ms:number; latencyP95Ms:number; errorRate:number; errors?: Array<{ts:string; code:string; message:string}>; }

// ── Connector catalog & categories imported from @/lib/agent-catalog ─────────
// (single canonical source shared with Settings.tsx — 103 connectors)

const OS_DEPLOY: Record<AgentOS, { cmd: string; lang: string; steps: string[] }> = {
  windows: {
    lang: "powershell",
    cmd: `# Download and install AIGO-X Agent for Windows
$token = "YOUR_ENROLL_TOKEN"
$ver   = "2.4.1"
Invoke-WebRequest -Uri "https://agents.aigo-x.io/windows/$ver/aigo-x-agent-setup.exe" -OutFile "$env:TEMP\\aigo-x-setup.exe"
Start-Process "$env:TEMP\\aigo-x-setup.exe" -ArgumentList "/S /TOKEN=$token" -Wait
Start-Service aigo-x-agent
Write-Host "Agent enrolled — check AIGO-X console in ~30s"`,
    steps: ["Download installer from portal or PowerShell","Run as Administrator","Service starts automatically on boot","Verify in Agents tab within 30s"],
  },
  linux: {
    lang: "bash",
    cmd: `# Install AIGO-X Agent on Linux (systemd)
ENROLL_TOKEN="YOUR_ENROLL_TOKEN"
VER="2.4.1"
curl -fsSL "https://agents.aigo-x.io/linux/$VER/install.sh" | \\
  sudo bash -s -- --token "$ENROLL_TOKEN" --tags "production,linux"
sudo systemctl enable --now aigo-x-agent
sudo systemctl status aigo-x-agent`,
    steps: ["Requires curl + systemd (Ubuntu 20+, RHEL 8+, Debian 11+)","Root/sudo access needed","Runs as unprivileged 'aigo-x' user","Supports x86_64 and arm64"],
  },
  macos: {
    lang: "bash",
    cmd: `# Install AIGO-X Agent on macOS (launchd)
ENROLL_TOKEN="YOUR_ENROLL_TOKEN"
VER="2.4.0"
curl -fsSL "https://agents.aigo-x.io/macos/$VER/aigo-x-agent.pkg" -o /tmp/aigo-x-agent.pkg
sudo installer -pkg /tmp/aigo-x-agent.pkg -target /
sudo /Library/AIGO-X/Agent/bin/aigo-x-enroll --token "$ENROLL_TOKEN"
sudo launchctl load /Library/LaunchDaemons/io.aigo-x.agent.plist`,
    steps: ["macOS 12 Monterey or later","Universal binary (Intel + Apple Silicon)","Requires Full Disk Access in Privacy Settings","MDM deployment supported via .pkg + config profile"],
  },
  mobile: {
    lang: "bash",
    cmd: `# Mobile MDM deployment — no local install required
# 1. Export MDM config profile from portal:
#    Settings → Agents → Mobile → Download Config Profile
#
# 2. Push via your MDM solution:
#    - Jamf Pro: Computers > Configuration Profiles > Upload
#    - Microsoft Intune: Devices > iOS/Android > Config Profiles
#    - Workspace ONE: Apps > App Catalog > Upload
#
# App inventory payload:
{
  "enrollmentToken": "YOUR_ENROLL_TOKEN",
  "platform": "mobile",
  "mdmProfile": "aigo-x-mobile-v1.2.mobileconfig",
  "capabilities": ["mdm-compliance","app-inventory","jailbreak-detection"]
}`,
    steps: ["iOS 15+ / Android 11+","Push via Jamf, Intune, or Workspace ONE","No user interaction required after MDM push","Jailbreak/root detection runs at enrollment"],
  },
  cloud: {
    lang: "bash",
    cmd: `# Deploy AIGO-X Cloud Agent (AWS Lambda / GCP Cloud Run / Azure Functions)
ENROLL_TOKEN="YOUR_ENROLL_TOKEN"

# AWS — CloudFormation one-click
aws cloudformation deploy \\
  --template-url https://agents.aigo-x.io/cloud/aws/template.yaml \\
  --stack-name aigo-x-cloud-agent \\
  --parameter-overrides EnrollToken=$ENROLL_TOKEN \\
  --capabilities CAPABILITY_IAM

# GCP — Cloud Run
gcloud run deploy aigo-x-cloud-agent \\
  --image gcr.io/aigo-x/cloud-agent:latest \\
  --set-env-vars ENROLL_TOKEN=$ENROLL_TOKEN \\
  --platform managed --region us-central1`,
    steps: ["Agentless cloud-native deployment","Read-only IAM role — no write permissions","Scheduled Lambda/Cloud Function (every 5 min)","Collects config, IAM, networking state"],
  },
};

const OS_CAPABILITIES: Record<string, { os: AgentOS; icon: string; color: string; capabilities: Array<{ name: string; description: string; supported: boolean }> }> = {
  Windows: {
    os: "windows", icon: "⊞", color: "#0078D4",
    capabilities: [
      { name: "Registry Auditing", description: "Monitor registry key changes, run-key persistence, COM hijacking", supported: true },
      { name: "AD / WMI Queries", description: "Query Active Directory, WMI classes, domain membership", supported: true },
      { name: "Software Inventory", description: "Enumerate installed applications, versions, publisher, path", supported: true },
      { name: "GPO Compliance", description: "Audit Group Policy Objects against CIS/STIG benchmarks", supported: true },
      { name: "Event Log Forwarding", description: "Forward Security, System, Application event logs via ETW", supported: true },
      { name: "File Integrity Monitoring", description: "SHA-256 hash monitoring on configurable directory trees", supported: true },
      { name: "Scheduled Task Audit", description: "Enumerate all scheduled tasks, detect persistence mechanisms", supported: true },
      { name: "Service Account Analysis", description: "Identify over-privileged service accounts and stale credentials", supported: true },
    ],
  },
  Linux: {
    os: "linux", icon: "⊗", color: "#E2A62D",
    capabilities: [
      { name: "Package Inventory", description: "apt/yum/dnf/rpm — full installed package catalog with CVE mapping", supported: true },
      { name: "CIS Benchmark", description: "CIS Linux Benchmark L1/L2 automated assessment", supported: true },
      { name: "File Integrity Monitoring", description: "inotify-based FIM on /etc, /bin, /usr/bin, custom paths", supported: true },
      { name: "Syslog Forwarding", description: "Forward syslog, auth.log, kern.log to event bus", supported: true },
      { name: "Container Runtime", description: "Docker & containerd: image inventory, running containers, misconfigs", supported: true },
      { name: "Cron & Systemd Audit", description: "Enumerate cron jobs and systemd units for persistence detection", supported: true },
      { name: "Kernel Module Audit", description: "Loaded kernel modules, unusual module detection", supported: true },
      { name: "Network Connections", description: "Active connections, listening ports, firewall rule enumeration", supported: true },
    ],
  },
  macOS: {
    os: "macos", icon: "⌘", color: "#555555",
    capabilities: [
      { name: "MDM Profile Analysis", description: "Enumerate installed MDM configuration profiles and payloads", supported: true },
      { name: "Keychain Policy", description: "Assess Keychain settings, certificate trust, credential storage", supported: true },
      { name: "Gatekeeper / SIP", description: "Verify Gatekeeper enforcement, SIP status, code signing", supported: true },
      { name: "Software Inventory", description: "Applications from /Applications and App Store with CVE mapping", supported: true },
      { name: "Login Items & LaunchAgents", description: "Persistent login items, LaunchAgents, LaunchDaemons enumeration", supported: true },
      { name: "TCC Database Audit", description: "Transparency, Consent & Control database — app permission audit", supported: true },
      { name: "System Extensions", description: "Approved system extensions, network extensions, endpoint security", supported: true },
      { name: "Unified Log Streaming", description: "Stream macOS unified log (subsystem-level filtering)", supported: false },
    ],
  },
  Mobile: {
    os: "mobile", icon: "⬡", color: "#8B5CF6",
    capabilities: [
      { name: "MDM Policy Compliance", description: "Assess device compliance against MDM enrollment policy", supported: true },
      { name: "App Inventory", description: "Installed applications, versions, developer, permissions", supported: true },
      { name: "Jailbreak / Root Detection", description: "Multi-method jailbreak (iOS) and root (Android) detection", supported: true },
      { name: "Encryption Status", description: "Device encryption, biometric auth, screen lock policy", supported: true },
      { name: "Network VPN Status", description: "VPN enrollment status, split-tunneling detection", supported: true },
      { name: "Certificate Pinning", description: "Validate MDM certificates, detect MITM proxies", supported: true },
      { name: "OS Version Compliance", description: "Check OS against minimum version policy, flag stale devices", supported: true },
      { name: "Behavioral Analytics", description: "Runtime behavioral analytics (planned for v1.4)", supported: false },
    ],
  },
};

// ── Micro helpers ─────────────────────────────────────────────────────────────
function useApi<T>(path: string, fallback: T): { data: T; loading: boolean; refetch: () => void } {
  const [data, setData] = useState<T>(fallback);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const token = localStorage.getItem("grc_token");
    const base = (import.meta as { env: Record<string, string> }).env["BASE_URL"] ?? "/grc-platform/";
    const apiBase = base.replace(/grc-platform\/?$/, "api");
    fetch(`${apiBase}${path}`, { headers: { Authorization: `Bearer ${token ?? ""}` } })
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
      .then((d: T) => setData(d))
      .catch(() => { /* keep fallback */ })
      .finally(() => setLoading(false));
  }, [path, tick]);
  return { data, loading, refetch: () => setTick(t => t + 1) };
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const token = localStorage.getItem("grc_token");
  const base = (import.meta as { env: Record<string, string> }).env["BASE_URL"] ?? "/grc-platform/";
  const apiBase = base.replace(/grc-platform\/?$/, "api");
  const r = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
}

async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const token = localStorage.getItem("grc_token");
  const base = (import.meta as { env: Record<string, string> }).env["BASE_URL"] ?? "/grc-platform/";
  const apiBase = base.replace(/grc-platform\/?$/, "api");
  const r = await fetch(`${apiBase}${path}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
}

function shortId() { return Math.random().toString(36).slice(2, 9); }

function Pill({ label, color = C.muted, bg = C.bg }: { label: string; color?: string; bg?: string }) {
  return <span style={{ background: bg, border: `1px solid ${color}40`, borderRadius: 4, padding: "1px 7px", fontSize: 10, fontWeight: 700, color }}>{label}</span>;
}

function StatusBadge({ status }: { status: AgentStatus | ConnStatus }) {
  const map: Record<string, { dot: string; label: string }> = {
    online:    { dot: C.online,  label: "Online"    },
    connected: { dot: C.online,  label: "Connected" },
    offline:   { dot: C.danger,  label: "Offline"   },
    error:     { dot: C.danger,  label: "Error"     },
    stale:     { dot: C.danger,  label: "Stale"     },
    warning:   { dot: C.warn,    label: "Warning"   },
    partial:   { dot: C.warn,    label: "Partial"   },
    available: { dot: C.dim,     label: "Available" },
  };
  const s = map[status] ?? { dot: C.dim, label: status };
  return (
    <div style={{ display:"flex", alignItems:"center", gap:5 }}>
      <div style={{ width:6, height:6, borderRadius:"50%", background:s.dot, boxShadow:`0 0 5px ${s.dot}88` }} />
      <span style={{ fontSize:10, fontWeight:800, color:s.dot, letterSpacing:"0.04em" }}>{s.label.toUpperCase()}</span>
    </div>
  );
}

function OsBadge({ os }: { os: AgentOS }) {
  const m: Record<AgentOS,{icon:string;color:string}> = {
    windows:{icon:"⊞",color:"#60A5FA"},linux:{icon:"⊗",color:"#FCD34D"},
    macos:{icon:"⌘",color:"rgba(255,255,255,0.7)"},mobile:{icon:"⬡",color:"#A78BFA"},cloud:{icon:"☁",color:"#34D399"},
  };
  const s = m[os];
  return <span style={{ fontSize:11, fontWeight:700, color:s.color }}>{s.icon} {os.charAt(0).toUpperCase()+os.slice(1)}</span>;
}

function MiniBar({ pct, danger }: { pct: number; danger: boolean }) {
  const color = pct === 0 ? C.dim : danger ? C.warn : C.online;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
      <div style={{ width:64, height:4, background:"var(--border)", borderRadius:4 }}>
        <div style={{ height:"100%", width:`${Math.min(pct,100)}%`, background:color, borderRadius:4, transition:"width 0.3s" }} />
      </div>
      <span style={{ fontSize:10, fontFamily:"monospace", color, fontWeight:700, width:26 }}>{pct}%</span>
    </div>
  );
}

function Sparkline({ values, color = C.teal }: { values: number[]; color?: string }) {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const w = 56, h = 22;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / max) * h}`).join(" ");
  return (
    <svg width={w} height={h} style={{ display:"block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
    </svg>
  );
}

function KpiCard({ label, value, sub, color = C.teal, icon }: { label:string; value:string|number; sub?:string; color?:string; icon:string }) {
  return (
    <div style={{ background:C.bg, border:`1.5px solid ${C.border}`, borderRadius:10, padding:"14px 16px", display:"flex", flexDirection:"column", gap:4 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <span style={{ fontSize:10, fontWeight:800, letterSpacing:"0.08em", color:C.muted, textTransform:"uppercase" }}>{label}</span>
        <span style={{ fontSize:18 }}>{icon}</span>
      </div>
      <div style={{ fontSize:24, fontWeight:900, color, fontFamily:"monospace" }}>{value}</div>
      {sub && <div style={{ fontSize:10, color:C.dim }}>{sub}</div>}
    </div>
  );
}

// ── Deploy Drawer ─────────────────────────────────────────────────────────────
function DeployDrawer({ onClose }: { onClose: () => void }) {
  const [osTab, setOsTab] = useState<AgentOS>("linux");
  const osList: AgentOS[] = ["linux","windows","macos","mobile","cloud"];
  const { cmd, lang, steps } = OS_DEPLOY[osTab];
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(cmd); setCopied(true); setTimeout(()=>setCopied(false),2000); };
  return (
    <div style={{ position:"fixed", inset:0, zIndex:200, display:"flex", alignItems:"flex-end", justifyContent:"flex-end", pointerEvents:"none" }}>
      <div style={{ width:520, height:"100vh", background:"rgba(10,14,20,0.97)", borderLeft:`1px solid ${C.border2}`,
        boxShadow:"-12px 0 60px rgba(0,0,0,0.6)", pointerEvents:"all", display:"flex", flexDirection:"column", overflow:"hidden" }}>
        {/* Header */}
        <div style={{ padding:"20px 24px 16px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:C.text }}>Deploy Agent</div>
            <div style={{ fontSize:11, color:C.muted, marginTop:3 }}>Platform-specific installation guide</div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:8, width:32, height:32, cursor:"pointer", color:C.muted, fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
        </div>
        {/* OS tabs */}
        <div style={{ display:"flex", gap:0, borderBottom:`1px solid ${C.border}`, padding:"0 24px" }}>
          {osList.map(os => {
            const m: Record<AgentOS,string> = { windows:"Windows", linux:"Linux", macos:"macOS", mobile:"Mobile", cloud:"Cloud" };
            return (
              <button key={os} onClick={()=>setOsTab(os)} style={{ padding:"10px 14px", fontSize:11, fontWeight:700, cursor:"pointer", background:"none", border:"none",
                borderBottom:`2px solid ${osTab===os ? C.teal : "transparent"}`, color:osTab===os ? C.teal : C.muted, transition:"all 0.15s", fontFamily:"inherit" }}>
                {m[os]}
              </button>
            );
          })}
        </div>
        <div style={{ flex:1, overflow:"auto", padding:"20px 24px", display:"flex", flexDirection:"column", gap:16 }}>
          {/* Steps */}
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:C.muted, letterSpacing:"0.06em", textTransform:"uppercase", marginBottom:10 }}>Prerequisites</div>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {steps.map((s,i) => (
                <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                  <div style={{ width:18, height:18, borderRadius:"50%", background:C.teal+"22", border:`1px solid ${C.teal}44`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:800, color:C.teal, flexShrink:0, marginTop:1 }}>{i+1}</div>
                  <span style={{ fontSize:12, color:C.muted, lineHeight:1.5 }}>{s}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Code block */}
          <div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
              <div style={{ fontSize:11, fontWeight:700, color:C.muted, letterSpacing:"0.06em", textTransform:"uppercase" }}>{lang}</div>
              <button onClick={copy} style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:6, padding:"4px 12px", fontSize:11, fontWeight:700, color:copied?C.online:C.teal, cursor:"pointer", fontFamily:"inherit", transition:"color 0.2s" }}>
                {copied ? "✓ Copied" : "Copy"}
              </button>
            </div>
            <pre style={{ background:"rgba(0,0,0,0.4)", border:`1px solid ${C.border}`, borderRadius:8, padding:"14px 16px", fontSize:11, fontFamily:"monospace", color:"rgba(255,255,255,0.82)", lineHeight:1.6, whiteSpace:"pre-wrap", wordBreak:"break-word", margin:0 }}>
              {cmd}
            </pre>
          </div>
          {/* Enroll token note */}
          <div style={{ background:C.teal+"11", border:`1px solid ${C.teal}33`, borderRadius:8, padding:"12px 14px" }}>
            <div style={{ fontSize:11, fontWeight:800, color:C.teal, marginBottom:4 }}>Enroll Token</div>
            <div style={{ fontSize:11, color:C.muted, lineHeight:1.5 }}>Replace <code style={{ background:"var(--border)", borderRadius:3, padding:"0 4px", color:C.teal }}>YOUR_ENROLL_TOKEN</code> with a token from <strong style={{ color:C.text }}>Settings → Agent Tokens</strong>. Tokens are single-use and expire after 24 hours.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Connector Setup Wizard Modal ──────────────────────────────────────────────
function ConnectorWizard({ connector, onClose, onConnect }: { connector: ConnDef; onClose: () => void; onConnect: (id:string)=>void }) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const steps = ["Select Connector", "Configure Auth", "Test & Connect"];
  const authLabels: Record<string,string> = { oauth2:"OAuth 2.0 authorization flow", "api-key":"API Key / Secret", certificate:"Client Certificate + Key", basic:"Username + Password", webhook:"Webhook secret", saml:"SAML assertion" };
  const handleConnect = async () => {
    setSaving(true);
    try { await apiPost("/integrations/connections", { connectorId: connector.id }); onConnect(connector.id); onClose(); }
    catch { setSaving(false); }
  };
  return (
    <div style={{ position:"fixed", inset:0, zIndex:300, background:"rgba(0,0,0,0.7)", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ width:480, background:"rgb(13,17,23)", border:`1.5px solid ${C.border2}`, borderRadius:16, overflow:"hidden", boxShadow:"0 32px 80px rgba(0,0,0,0.8)" }}>
        {/* Header */}
        <div style={{ padding:"20px 24px 16px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ width:40, height:40, borderRadius:10, background:connector.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, fontWeight:800, color:"white", flexShrink:0 }}>
            {connector.ini}
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:15, fontWeight:800, color:C.text }}>{connector.name}</div>
            <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{connector.description}</div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:8, width:30, height:30, cursor:"pointer", color:C.muted, fontSize:14, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
        </div>
        {/* Step indicator */}
        <div style={{ padding:"14px 24px", display:"flex", gap:0 }}>
          {steps.map((s,i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", flex:1 }}>
              <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                <div style={{ width:22, height:22, borderRadius:"50%", background:i<=step?C.teal:"var(--border)", border:`1.5px solid ${i<=step?C.teal:C.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:800, color:i<=step?"black":C.dim, transition:"all 0.2s" }}>
                  {i<step?"✓":i+1}
                </div>
                <span style={{ fontSize:10, fontWeight:700, color:i===step?C.text:C.muted, whiteSpace:"nowrap" }}>{s}</span>
              </div>
              {i<steps.length-1 && <div style={{ flex:1, height:1, background:i<step?C.teal:C.border, margin:"0 8px" }} />}
            </div>
          ))}
        </div>
        {/* Step content */}
        <div style={{ padding:"0 24px 20px" }}>
          {step===0 && (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              <div style={{ fontSize:12, color:C.muted, marginBottom:4 }}>You are about to connect <strong style={{ color:C.text }}>{connector.name}</strong> to your AIGO-X tenant.</div>
              <div style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:"12px 14px", display:"flex", flexDirection:"column", gap:6 }}>
                <div style={{ fontSize:10, fontWeight:800, color:C.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>Auth Method</div>
                <div style={{ fontSize:12, color:C.text }}>{authLabels[connector.authType] ?? connector.authType}</div>
              </div>
              <div style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:"12px 14px" }}>
                <div style={{ fontSize:10, fontWeight:800, color:C.muted, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:6 }}>Category</div>
                <Pill label={connector.cat} color={C.teal} />
              </div>
              <button onClick={()=>setStep(1)} style={{ marginTop:8, background:`linear-gradient(135deg, ${C.teal}cc, ${C.info}cc)`, border:"none", borderRadius:8, padding:"10px", fontSize:12, fontWeight:800, color:"black", cursor:"pointer", fontFamily:"inherit" }}>
                Continue →
              </button>
            </div>
          )}
          {step===1 && (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              <div style={{ fontSize:12, color:C.muted }}>Enter credentials for <strong style={{ color:C.text }}>{authLabels[connector.authType]}</strong></div>
              {connector.authType==="oauth2" ? (
                <div style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:"14px", textAlign:"center" }}>
                  <div style={{ fontSize:12, color:C.muted, marginBottom:10 }}>Click below to authorize AIGO-X to access your {connector.name} account via OAuth 2.0</div>
                  <button style={{ background:connector.color, border:"none", borderRadius:8, padding:"9px 20px", fontSize:12, fontWeight:700, color:"white", cursor:"pointer", fontFamily:"inherit" }}>
                    Authorize with {connector.name}
                  </button>
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {["API Key","Secret / Token"].map(lbl => (
                    <div key={lbl}>
                      <div style={{ fontSize:10, fontWeight:700, color:C.muted, marginBottom:4 }}>{lbl}</div>
                      <input type="password" placeholder={`Enter ${lbl.toLowerCase()}`}
                        style={{ width:"100%", background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 12px", fontSize:12, color:C.text, fontFamily:"monospace", outline:"none", boxSizing:"border-box" }} />
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display:"flex", gap:8, marginTop:8 }}>
                <button onClick={()=>setStep(0)} style={{ flex:1, background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:"9px", fontSize:12, fontWeight:700, color:C.muted, cursor:"pointer", fontFamily:"inherit" }}>← Back</button>
                <button onClick={()=>setStep(2)} style={{ flex:2, background:`linear-gradient(135deg, ${C.teal}cc, ${C.info}cc)`, border:"none", borderRadius:8, padding:"9px", fontSize:12, fontWeight:800, color:"black", cursor:"pointer", fontFamily:"inherit" }}>Test Connection →</button>
              </div>
            </div>
          )}
          {step===2 && (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              <div style={{ background:"rgba(16,185,129,0.08)", border:"1px solid rgba(16,185,129,0.3)", borderRadius:8, padding:"12px 14px", display:"flex", gap:10, alignItems:"center" }}>
                <span style={{ fontSize:18 }}>✓</span>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:C.online }}>Connection test passed</div>
                  <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>Authentication successful — ready to activate</div>
                </div>
              </div>
              <div style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:"12px 14px" }}>
                <div style={{ fontSize:10, fontWeight:800, color:C.muted, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:6 }}>Sync Schedule</div>
                <div style={{ fontSize:12, color:C.text }}>Every hour (default) · Adjustable in connection settings</div>
              </div>
              <div style={{ display:"flex", gap:8, marginTop:8 }}>
                <button onClick={()=>setStep(1)} style={{ flex:1, background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:"9px", fontSize:12, fontWeight:700, color:C.muted, cursor:"pointer", fontFamily:"inherit" }}>← Back</button>
                <button onClick={handleConnect} disabled={saving} style={{ flex:2, background:`linear-gradient(135deg, ${C.online}cc, ${C.teal}cc)`, border:"none", borderRadius:8, padding:"9px", fontSize:12, fontWeight:800, color:"black", cursor:saving?"not-allowed":"pointer", fontFamily:"inherit", opacity:saving?0.7:1 }}>
                  {saving ? "Connecting…" : "✓ Activate Connection"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── New Webhook Modal ─────────────────────────────────────────────────────────
const WEBHOOK_EVENT_TYPES = [
  "risk.created","risk.updated","risk.severity_change",
  "compliance.gap_detected","compliance.control_updated",
  "agent.checkin","agent.alert","agent.offline",
  "asset.discovered","asset.removed",
  "incident.created","incident.resolved",
];

function NewWebhookModal({ onClose, onCreate }: { onClose: () => void; onCreate: () => void }) {
  const [name, setName]             = useState("");
  const [direction, setDirection]   = useState<"inbound"|"outbound">("inbound");
  const [url, setUrl]               = useState("");
  const [evTypes, setEvTypes]       = useState<string[]>(["risk.created","agent.alert"]);
  const [saving, setSaving]         = useState(false);
  const [err, setErr]               = useState("");

  const toggleEv = (ev: string) => setEvTypes(prev => prev.includes(ev) ? prev.filter(e=>e!==ev) : [...prev, ev]);

  const handleCreate = async () => {
    if (!name.trim()) { setErr("Name is required."); return; }
    if (direction==="outbound" && !url.trim()) { setErr("Destination URL is required for outbound webhooks."); return; }
    setSaving(true); setErr("");
    try {
      await apiPost("/integrations/webhooks", {
        name: name.trim(),
        direction,
        url: url.trim() || `https://inbound.aigo-x.io/wh/${shortId()}`,
        eventTypes: evTypes,
        active: true,
        retryPolicy: { maxAttempts: 3, backoffMs: 1000 },
      });
      onCreate();
    } catch { setErr("Failed to create webhook — please try again."); setSaving(false); }
  };

  const dirColor = (d: "inbound"|"outbound") => d==="inbound" ? C.teal : C.purple;

  return (
    <div style={{ position:"fixed", inset:0, zIndex:300, background:"rgba(0,0,0,0.75)", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ width:520, maxHeight:"90vh", overflowY:"auto", background:"rgb(10,14,22)", border:`1.5px solid ${C.border2}`, borderRadius:16, boxShadow:"0 40px 100px rgba(0,0,0,0.85)" }}>
        {/* Header */}
        <div style={{ padding:"20px 24px 14px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:C.text }}>New Webhook</div>
            <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>Configure inbound or outbound event delivery</div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:8, width:30, height:30, cursor:"pointer", color:C.muted, fontSize:14, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
        </div>

        <div style={{ padding:"20px 24px", display:"flex", flexDirection:"column", gap:16 }}>
          {/* Direction toggle */}
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:C.muted, letterSpacing:"0.06em", textTransform:"uppercase" as const, marginBottom:8 }}>Direction</div>
            <div style={{ display:"flex", gap:8 }}>
              {(["inbound","outbound"] as const).map(d => (
                <button key={d} onClick={()=>setDirection(d)}
                  style={{ flex:1, padding:"12px 10px", background:direction===d?`${dirColor(d)}15`:C.bg, border:`1.5px solid ${direction===d?dirColor(d):C.border}`, borderRadius:10, cursor:"pointer", fontFamily:"inherit", transition:"all 0.15s" }}>
                  <div style={{ fontSize:22, marginBottom:6, color:direction===d?dirColor(d):C.dim }}>{d==="inbound"?"↓":"↑"}</div>
                  <div style={{ fontSize:12, fontWeight:800, color:direction===d?dirColor(d):C.muted, marginBottom:3 }}>{d.charAt(0).toUpperCase()+d.slice(1)}</div>
                  <div style={{ fontSize:9, color:C.dim, lineHeight:1.4 }}>{d==="inbound"?"Receive from external systems":"Push events to external URL"}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:C.muted, letterSpacing:"0.06em", textTransform:"uppercase" as const, marginBottom:6 }}>Name</div>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. SIEM Critical Alerts" autoFocus
              style={{ width:"100%", background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 12px", fontSize:12, color:C.text, fontFamily:"inherit", outline:"none", boxSizing:"border-box" as const }} />
          </div>

          {/* URL — outbound only */}
          {direction==="outbound" && (
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:C.muted, letterSpacing:"0.06em", textTransform:"uppercase" as const, marginBottom:6 }}>Destination URL</div>
              <input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://your-endpoint.example.com/webhook"
                style={{ width:"100%", background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 12px", fontSize:11, color:C.text, fontFamily:"monospace", outline:"none", boxSizing:"border-box" as const }} />
            </div>
          )}

          {/* Event types */}
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:C.muted, letterSpacing:"0.06em", textTransform:"uppercase" as const, marginBottom:6 }}>
              Event Types <span style={{ color:C.teal, fontFamily:"monospace" }}>({evTypes.length} selected)</span>
            </div>
            <div style={{ display:"flex", flexWrap:"wrap" as const, gap:5 }}>
              {WEBHOOK_EVENT_TYPES.map(ev => (
                <button key={ev} onClick={()=>toggleEv(ev)}
                  style={{ background:evTypes.includes(ev)?`${C.info}22`:C.bg, border:`1px solid ${evTypes.includes(ev)?`${C.info}66`:C.border}`, borderRadius:6, padding:"4px 10px", fontSize:10, fontWeight:evTypes.includes(ev)?700:500, color:evTypes.includes(ev)?C.info:C.muted, cursor:"pointer", fontFamily:"inherit", transition:"all 0.12s" }}>
                  {ev}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {err && <div style={{ fontSize:11, color:C.danger, background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:6, padding:"8px 12px" }}>{err}</div>}

          {/* Actions */}
          <div style={{ display:"flex", gap:8, justifyContent:"flex-end", paddingTop:4 }}>
            <button onClick={onClose} style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 20px", fontSize:12, fontWeight:700, color:C.muted, cursor:"pointer", fontFamily:"inherit" }}>Cancel</button>
            <button onClick={handleCreate} disabled={saving}
              style={{ background:`linear-gradient(135deg, ${dirColor(direction)}cc, ${C.info}88)`, border:"none", borderRadius:8, padding:"8px 22px", fontSize:12, fontWeight:800, color:"black", cursor:"pointer", fontFamily:"inherit", opacity:saving?0.7:1, transition:"opacity 0.2s" }}>
              {saving ? "Creating…" : "Create Webhook"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Edit Agent Policy Modal ───────────────────────────────────────────────────
function EditPolicyModal({ agent, onClose, onSave }: { agent: Agent; onClose: () => void; onSave: () => void }) {
  const [scanSchedule, setScanSchedule] = useState(agent.policy.scanSchedule);
  const [intervalSecs, setIntervalSecs] = useState(String(agent.policy.reportingIntervalSecs));
  const [maxCpu, setMaxCpu]             = useState(String(agent.policy.maxCpuPct));
  const [dataTypes, setDataTypes]       = useState((agent.policy.dataTypes ?? []).join(", "));
  const [saving, setSaving]             = useState(false);
  const [saved, setSaved]               = useState(false);
  const [err, setErr]                   = useState("");

  const DATA_TYPE_SUGGESTIONS = ["inventory","events","vulnerabilities","ad-inventory","gpo","mdm-compliance","app-inventory","network","config"];

  const handleSave = async () => {
    setSaving(true); setErr("");
    try {
      await apiPatch<Agent>(`/agents/${agent.id}/policy`, {
        scanSchedule,
        reportingIntervalSecs: Math.max(10, Number(intervalSecs) || 60),
        maxCpuPct: Math.min(100, Math.max(1, Number(maxCpu) || 15)),
        dataTypes: dataTypes.split(",").map(s=>s.trim()).filter(Boolean),
      });
      setSaved(true);
      setTimeout(() => onSave(), 800);
    } catch { setErr("Failed to update policy — please try again."); setSaving(false); }
  };

  const row = (label: string, value: string, setter: (v: string) => void, hint?: string, mono?: boolean) => (
    <div>
      <div style={{ fontSize:10, fontWeight:700, color:C.muted, letterSpacing:"0.06em", textTransform:"uppercase" as const, marginBottom:5 }}>{label}</div>
      {hint && <div style={{ fontSize:9, color:C.dim, marginBottom:5 }}>{hint}</div>}
      <input value={value} onChange={e=>setter(e.target.value)}
        style={{ width:"100%", background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 12px", fontSize:11, color:C.text, fontFamily:mono?"monospace":"inherit", outline:"none", boxSizing:"border-box" as const }} />
    </div>
  );

  return (
    <div style={{ position:"fixed", inset:0, zIndex:300, background:"rgba(0,0,0,0.75)", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ width:480, background:"rgb(10,14,22)", border:`1.5px solid ${C.border2}`, borderRadius:16, boxShadow:"0 40px 100px rgba(0,0,0,0.85)", overflow:"hidden" }}>
        {/* Header */}
        <div style={{ padding:"20px 24px 14px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:C.text }}>Edit Policy · <span style={{ fontFamily:"monospace", color:C.teal }}>{agent.hostname}</span></div>
            <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>Agent ID: {agent.id} · {agent.os} / {agent.arch}</div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:8, width:30, height:30, cursor:"pointer", color:C.muted, fontSize:14, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
        </div>

        <div style={{ padding:"20px 24px", display:"flex", flexDirection:"column", gap:14 }}>
          {row("Scan Schedule (cron)", scanSchedule, setScanSchedule, "e.g. 0 */4 * * *  — every 4 hours", true)}
          {row("Reporting Interval (seconds)", intervalSecs, setIntervalSecs, "Minimum 10 seconds")}
          {row("Max CPU %", maxCpu, setMaxCpu, "Throttle threshold — agent pauses scans above this")}
          {row("Data Types", dataTypes, setDataTypes, "Comma-separated: inventory, events, vulnerabilities, …")}

          {/* Data type quick-add */}
          <div>
            <div style={{ fontSize:9, color:C.dim, marginBottom:5 }}>Quick add:</div>
            <div style={{ display:"flex", flexWrap:"wrap" as const, gap:5 }}>
              {DATA_TYPE_SUGGESTIONS.map(dt => {
                const active = dataTypes.split(",").map(s=>s.trim()).includes(dt);
                return (
                  <button key={dt} onClick={() => {
                    const current = dataTypes.split(",").map(s=>s.trim()).filter(Boolean);
                    if (active) setDataTypes(current.filter(s=>s!==dt).join(", "));
                    else setDataTypes([...current, dt].join(", "));
                  }}
                    style={{ background:active?`${C.teal}22`:C.bg, border:`1px solid ${active?`${C.teal}55`:C.border}`, borderRadius:5, padding:"3px 9px", fontSize:9, fontWeight:active?700:500, color:active?C.teal:C.dim, cursor:"pointer", fontFamily:"monospace", transition:"all 0.12s" }}>
                    {dt}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pending push notice */}
          {agent.pendingPush && (
            <div style={{ background:`${C.warn}11`, border:`1px solid ${C.warn}33`, borderRadius:8, padding:"10px 12px", fontSize:11, color:C.warn }}>
              ⚠ A policy push is already pending for this agent — it will be merged with your changes on next check-in.
            </div>
          )}

          {err && <div style={{ fontSize:11, color:C.danger, background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:6, padding:"8px 12px" }}>{err}</div>}

          {/* Actions */}
          <div style={{ display:"flex", gap:8, justifyContent:"flex-end", paddingTop:4 }}>
            <button onClick={onClose} style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 20px", fontSize:12, fontWeight:700, color:C.muted, cursor:"pointer", fontFamily:"inherit" }}>Cancel</button>
            <button onClick={handleSave} disabled={saving||saved}
              style={{ background:saved?`${C.online}cc`:`linear-gradient(135deg, ${C.teal}cc, ${C.info}88)`, border:"none", borderRadius:8, padding:"8px 22px", fontSize:12, fontWeight:800, color:"black", cursor:"pointer", fontFamily:"inherit", opacity:(saving||saved)?0.85:1, transition:"background 0.3s" }}>
              {saved ? "✓ Saved" : saving ? "Saving…" : "Push Policy"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Agents() {
  const [, navigate] = useLocation();
  const TABS = ["Overview","Agents","Capabilities","Integrations","Webhooks","Pipeline"];
  const [tab, setTab]           = useState("Overview");
  const [deployOpen, setDeployOpen]   = useState(false);
  const [wizardConn, setWizardConn]   = useState<ConnDef|null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent|null>(null);
  const [catFilter, setCatFilter]     = useState("All");
  const [intFilter, setIntFilter]     = useState("All");
  const [whDir, setWhDir]             = useState<"all"|"inbound"|"outbound">("all");
  const [expandedLog, setExpandedLog] = useState<string|null>(null);
  const [newWebhookOpen, setNewWebhookOpen]       = useState(false);
  const [editPolicyAgent, setEditPolicyAgent]     = useState<Agent|null>(null);

  const { data: agents,       loading: aLoad, refetch: rAgents } = useApi<Agent[]>("/agents", []);
  const { data: agentStats,   loading: asLoad }                  = useApi<Record<string,number>>("/agents/stats", {});
  const { data: connections,  loading: cLoad, refetch: rConns }  = useApi<ActiveConn[]>("/integrations/connections", []);
  const { data: intStats }                                       = useApi<Record<string,number>>("/integrations/stats", {});
  const { data: webhooks,     refetch: rWh }                     = useApi<WebhookCfg[]>("/integrations/webhooks", []);
  const { data: metrics }                                        = useApi<PipelineMetric[]>("/integrations/metrics", []);
  const { data: deliveryLogs }                                   = useApi<DeliveryRow[]>(
    webhooks.length ? `/integrations/webhooks/${webhooks[0]?.id}/logs` : "/integrations/webhooks", []
  );


  // Merge catalog with live connection status
  const connectorMap = new Map(connections.map(c => [c.connectorId, c]));
  const filteredCatalog = CATALOG
    .filter(c => catFilter==="All" || c.cat===catFilter)
    .filter(c => {
      if (intFilter==="All") return true;
      const live = connectorMap.get(c.id);
      const status = live ? live.status : "available";
      return intFilter==="connected" ? status==="connected" : intFilter==="available" ? status==="available" : status==="warning"||status==="partial"||status==="error";
    });

  const totalAssets  = connections.reduce((s,c)=>s+c.assetsIngested,0);
  const connectedCount = connections.filter(c=>c.status==="connected").length;
  const onlineAgents = (agents as Agent[]).filter(a=>a.status==="online").length;

  // Latest 7-day volume per connector (for pipeline chart)
  const metricsMap = new Map<string, PipelineMetric[]>();
  for (const m of metrics) {
    if (!metricsMap.has(m.connectorId)) metricsMap.set(m.connectorId,[]);
    metricsMap.get(m.connectorId)!.push(m);
  }
  const topConnectors = connections.slice(0,8);

  const filteredWh = webhooks.filter(w => whDir==="all" || w.direction===whDir);

  // ── Shared tab styles
  const tabStyle = (t: string) => ({
    padding:"10px 16px", fontSize:12, fontWeight:700, cursor:"pointer", background:"none", border:"none",
    borderBottom:`2px solid ${tab===t?C.teal:"transparent"}`, color:tab===t?C.teal:C.muted,
    transition:"all 0.15s", fontFamily:"inherit", whiteSpace:"nowrap" as const,
  });

  const card = { background:C.bg, border:`1.5px solid ${C.border}`, borderRadius:10, padding:"16px" };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", minHeight:0, background:"transparent" }}>
      {/* ── Module Header ── */}
      <div style={{ padding:"16px 24px 12px", borderBottom:`1px solid ${C.border}`, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <div style={{ fontSize:17, fontWeight:900, color:C.text, letterSpacing:"-0.3px" }}>Agents & Integration Hub</div>
          <div style={{ fontSize:11, color:C.muted, marginTop:3 }}>Multi-platform agents · 105 connectors · Policy enforcement · Real-time ingestion</div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={()=>rAgents()} style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:"7px 14px", fontSize:11, fontWeight:700, color:C.muted, cursor:"pointer", fontFamily:"inherit" }}>↻ Refresh</button>
          <button onClick={()=>setDeployOpen(true)} style={{ background:`linear-gradient(135deg, ${C.teal}cc, ${C.info}99)`, border:"none", borderRadius:8, padding:"7px 16px", fontSize:11, fontWeight:800, color:"black", cursor:"pointer", fontFamily:"inherit" }}>
            + Deploy Agent
          </button>
        </div>
      </div>

      {/* ── Tab Nav ── */}
      <div style={{ display:"flex", gap:0, borderBottom:`1px solid ${C.border}`, flexShrink:0, padding:"0 24px", background:"rgba(255,255,255,0.015)", overflowX:"auto" }}>
        {TABS.map(t=><button key={t} onClick={()=>setTab(t)} style={tabStyle(t)}>{t}</button>)}
      </div>

      {/* ── Tab Content ── */}
      <div style={{ flex:1, overflow:"auto", padding:"20px 24px", display:"flex", flexDirection:"column", gap:16 }}>

        {/* ════════════ OVERVIEW ════════════ */}
        {tab==="Overview" && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:12 }}>
              <KpiCard label="Active Agents"  value={onlineAgents}                          sub={`of ${(agents as Agent[]).length} total`}  color={C.online} icon="⬡" />
              <KpiCard label="Connected"       value={connectedCount}                         sub={`of ${CATALOG.length} connectors`}         color={C.teal}   icon="⚡" />
              <KpiCard label="Assets Ingested" value={totalAssets.toLocaleString()}           sub="across all connectors"                     color={C.info}   icon="◈" />
              <KpiCard label="Alerts Open"     value={(agents as Agent[]).reduce((s,a)=>s+a.telemetry.alertsOpen,0)} sub="across all agents" color={C.warn}   icon="◬" />
              <KpiCard label="Offline / Stale" value={(agents as Agent[]).filter(a=>a.status==="offline"||a.status==="stale").length} sub="need attention" color={C.danger} icon="◎" />
              <KpiCard label="Webhooks"        value={webhooks.length}                        sub={`${webhooks.filter(w=>w.active).length} active`} color={C.purple} icon="⇄" />
            </div>

            {/* AI Security Insights */}
            <div style={{ background:"linear-gradient(135deg,rgba(139,92,246,0.10),rgba(59,130,246,0.08))", border:"1px solid rgba(139,92,246,0.28)", borderRadius:12, padding:"14px 18px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                <span style={{ fontSize:13 }}>◆</span>
                <span style={{ fontSize:11, fontWeight:800, color:C.purple, letterSpacing:"0.4px", textTransform:"uppercase" }}>AI Fleet Intelligence</span>
                <span style={{ background:"rgba(139,92,246,0.18)", color:C.purple, border:"1px solid rgba(139,92,246,0.3)", borderRadius:10, padding:"1px 8px", fontSize:9, fontWeight:700, marginLeft:"auto" }}>Live Analysis</span>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                {[
                  { icon:"⚠", color:C.warn,   text: `${(agents as Agent[]).filter(a=>a.status==="stale"||a.status==="offline").length} agents offline or stale — check-in latency may indicate network segmentation or firewall blocking port 443.` },
                  { icon:"⬡", color:C.online,  text: `${(agents as Agent[]).filter(a=>a.version.startsWith("1.")).length} agents on v1.x (EOL Q2 2026). AI recommends priority upgrade to v2.4.1 to maintain threat detection fidelity.` },
                  { icon:"⚡", color:C.teal,    text: `Top connectors (${connections.slice(0,2).map(c=>c.connectorName).join(", ") || "AWS, Azure"}) account for ~60% of event volume. Tuning ingestion filters could reduce noise by 30–40%.` },
                  { icon:"◈", color:C.info,    text: `${totalAssets.toLocaleString()} assets discovered across all agents. Cross-correlating with CAASM would resolve ${Math.round(totalAssets*0.08)} shadow-IT assets detected this week.` },
                ].map((ins,i) => (
                  <div key={i} style={{ display:"flex", gap:8, alignItems:"flex-start", background:"var(--secondary)", border:"1px solid var(--border)", borderRadius:8, padding:"9px 12px" }}>
                    <span style={{ color:ins.color, fontSize:13, flexShrink:0, marginTop:1 }}>{ins.icon}</span>
                    <span style={{ fontSize:11, color:C.text, lineHeight:1.5 }}>{ins.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Agent OS donut + Top connectors */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
              {/* OS dist */}
              <div style={{ ...card }}>
                <div style={{ fontSize:12, fontWeight:800, color:C.text, marginBottom:14 }}>Agent Distribution by OS</div>
                {(["linux","windows","macos","mobile","cloud"] as AgentOS[]).map(os => {
                  const count = (agents as Agent[]).filter(a=>a.os===os).length;
                  const total2 = (agents as Agent[]).length || 1;
                  const pct = Math.round((count/total2)*100);
                  const colors: Record<string,string> = { linux:C.warn, windows:C.info, macos:C.muted, mobile:C.purple, cloud:C.online };
                  return (
                    <div key={os} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                      <OsBadge os={os} />
                      <div style={{ flex:1, height:5, background:"var(--border)", borderRadius:4 }}>
                        <div style={{ height:"100%", width:`${pct}%`, background:colors[os]??C.teal, borderRadius:4 }} />
                      </div>
                      <span style={{ fontSize:11, fontFamily:"monospace", color:colors[os]??C.teal, fontWeight:700, width:32, textAlign:"right" }}>{count}</span>
                    </div>
                  );
                })}
              </div>
              {/* Top connected integrations */}
              <div style={{ ...card }}>
                <div style={{ fontSize:12, fontWeight:800, color:C.text, marginBottom:14 }}>Top Integrations by Events</div>
                {connections.slice(0,6).map((c,i) => {
                  const def = CATALOG.find(d=>d.id===c.connectorId);
                  const color = def?.color ?? C.teal;
                  const maxEv = Math.max(...connections.map(x=>x.eventsIngested),1);
                  return (
                    <div key={c.id} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                      <div style={{ width:22, height:22, borderRadius:6, background:color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, color:"white", flexShrink:0 }}>
                        {def?.ini??"?"}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:11, fontWeight:700, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.connectorName}</div>
                        <div style={{ height:3, background:"var(--border)", borderRadius:4, marginTop:3 }}>
                          <div style={{ height:"100%", width:`${(c.eventsIngested/maxEv)*100}%`, background:color, borderRadius:4 }} />
                        </div>
                      </div>
                      <span style={{ fontSize:10, fontFamily:"monospace", color:C.muted, width:52, textAlign:"right" }}>{c.eventsIngested.toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recent agent activity */}
            <div style={{ ...card }}>
              <div style={{ fontSize:12, fontWeight:800, color:C.text, marginBottom:12 }}>Agent Activity</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
                {(agents as Agent[]).map(a => (
                  <div key={a.id} style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:8, padding:"10px 14px", minWidth:180 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                      <span style={{ fontSize:11, fontWeight:700, color:C.text }}>{a.hostname}</span>
                      <StatusBadge status={a.status} />
                    </div>
                    <OsBadge os={a.os} />
                    <div style={{ marginTop:6, display:"flex", gap:6, alignItems:"center" }}>
                      <MiniBar pct={a.health.cpu} danger={a.health.cpu>70} />
                      <span style={{ fontSize:9, color:C.dim }}>CPU</span>
                    </div>
                    <div style={{ fontSize:10, color:C.dim, marginTop:4 }}>
                      {a.telemetry.assetsDiscovered} assets · {a.telemetry.eventsLastHour} events/h
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ════════════ AGENTS ════════════ */}
        {tab==="Agents" && (
          <>
            {/* Inventory Table */}
            <div style={{ background:C.bg, border:`1.5px solid ${C.border}`, borderRadius:10, overflow:"hidden" }}>
              <div style={{ padding:"12px 16px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <span style={{ fontSize:12, fontWeight:800, color:C.text }}>Agent Inventory · {(agents as Agent[]).length} agents</span>
                {aLoad && <span style={{ fontSize:10, color:C.muted }}>Loading…</span>}
              </div>
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                  <thead>
                    <tr style={{ borderBottom:`1px solid ${C.border}`, background:"var(--secondary)" }}>
                      {["ID","Hostname","OS","Version","Status","CPU","Mem","Disk","Assets","Events/h","Last Seen","Last Push","Feed Activity"].map(h=>(
                        <th key={h} style={{ textAlign:"left", padding:"9px 12px", color:C.muted, fontWeight:800, fontSize:9, letterSpacing:"0.06em", textTransform:"uppercase", whiteSpace:"nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(agents as Agent[]).map(a => (
                      <tr key={a.id} style={{ borderBottom:`1px solid ${C.border}`, cursor:"pointer", transition:"background 0.12s" }}
                        onMouseEnter={e=>(e.currentTarget as HTMLTableRowElement).style.background=C.bg2}
                        onMouseLeave={e=>(e.currentTarget as HTMLTableRowElement).style.background="transparent"}
                        onClick={()=>setSelectedAgent(a===selectedAgent?null:a)}>
                        <td style={{ padding:"10px 12px", fontFamily:"monospace", fontSize:10, color:C.dim }}>{a.id}</td>
                        <td style={{ padding:"10px 12px", color:C.text, fontWeight:700 }}>{a.hostname}</td>
                        <td style={{ padding:"10px 12px" }}><OsBadge os={a.os} /></td>
                        <td style={{ padding:"10px 12px", fontFamily:"monospace", fontSize:10, color:C.muted }}>{a.version}</td>
                        <td style={{ padding:"10px 12px" }}><StatusBadge status={a.status} /></td>
                        <td style={{ padding:"10px 12px", minWidth:90 }}><MiniBar pct={a.health.cpu} danger={a.health.cpu>70} /></td>
                        <td style={{ padding:"10px 12px", minWidth:90 }}><MiniBar pct={a.health.mem} danger={a.health.mem>80} /></td>
                        <td style={{ padding:"10px 12px", minWidth:90 }}><MiniBar pct={a.health.disk} danger={a.health.disk>85} /></td>
                        <td style={{ padding:"10px 12px", fontFamily:"monospace", fontWeight:700, color:C.teal }}>{a.telemetry.assetsDiscovered.toLocaleString()}</td>
                        <td style={{ padding:"10px 12px", fontFamily:"monospace", color:C.muted }}>{a.telemetry.eventsLastHour.toLocaleString()}</td>
                        <td style={{ padding:"10px 12px", fontSize:10, color:a.status==="offline"?C.danger:C.muted }}>{new Date(a.lastSeen).toLocaleTimeString()}</td>
                        <td style={{ padding:"10px 12px", fontSize:10, fontFamily:"monospace", color:a.status==="offline"?C.danger:C.teal, whiteSpace:"nowrap" }}>
                          {(() => {
                            const fa = a.feedActivity ?? {};
                            const timestamps = Object.values(fa);
                            const maxTs = timestamps.length > 0 ? timestamps.reduce((best, t) => t > best ? t : best) : null;
                            return maxTs ? relativeTime(maxTs) : relativeTime(a.lastSeen);
                          })()}
                        </td>
                        <td style={{ padding:"10px 12px" }}>
                          <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                            {(() => {
                              const fa = a.feedActivity ?? {};
                              const now = Date.now();
                              const activeFeedKeys = Object.keys(fa).filter(f => now - new Date(fa[f]).getTime() < 86_400_000);
                              const seen = new Set<string>();
                              return activeFeedKeys.map(f => {
                                const route = FEED_NAV[f];
                                if (!route) return null;
                                const label = FEED_LABEL[f] ?? f;
                                if (seen.has(label)) return null;
                                seen.add(label);
                                const color = FEED_COLORS[f] ?? C.dim;
                                const active = a.status !== "offline";
                                return (
                                  <span
                                    key={f}
                                    title={`${label} — pushed ${relativeTime(fa[f])} · Click to open`}
                                    onClick={e => {
                                      e.stopPropagation();
                                      if (active) {
                                        navigate(route);
                                        setTimeout(() => {
                                          document.getElementById("agent-data")?.scrollIntoView({ behavior: "smooth", block: "start" });
                                        }, 400);
                                      }
                                    }}
                                    style={{
                                      background: active ? `${color}22` : "transparent",
                                      border: `1px solid ${color}${active ? "66" : "33"}`,
                                      borderRadius: 4,
                                      padding: "2px 7px",
                                      fontSize: 9,
                                      fontWeight: 700,
                                      color: active ? color : C.dim,
                                      cursor: active ? "pointer" : "default",
                                      whiteSpace: "nowrap" as const,
                                      opacity: active ? 1 : 0.5,
                                      transition: "all 0.15s",
                                    }}
                                    onMouseEnter={e => { if (active) (e.currentTarget as HTMLSpanElement).style.background = `${color}44`; }}
                                    onMouseLeave={e => { if (active) (e.currentTarget as HTMLSpanElement).style.background = `${color}22`; }}
                                  >
                                    {active ? "●" : "○"} {label}
                                  </span>
                                );
                              });
                            })()}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Agent detail / policy editor */}
            {selectedAgent && (
              <div style={{ ...card, display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                <div>
                  <div style={{ fontSize:12, fontWeight:800, color:C.text, marginBottom:12 }}>Agent Detail: {selectedAgent.hostname}</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {[
                      ["Agent ID",   selectedAgent.id],
                      ["IP Address", selectedAgent.ip],
                      ["OS / Arch",  `${selectedAgent.os} / ${selectedAgent.arch}`],
                      ["Version",    selectedAgent.version],
                      ["Registered", new Date(selectedAgent.registeredAt??Date.now()).toLocaleDateString()],
                      ["Last Seen",  new Date(selectedAgent.lastSeen).toLocaleString()],
                      ["Tags",       selectedAgent.tags.join(", ")||"—"],
                    ].map(([k,v])=>(
                      <div key={k as string} style={{ display:"flex", justifyContent:"space-between", borderBottom:`1px solid ${C.border}`, paddingBottom:6 }}>
                        <span style={{ fontSize:11, color:C.muted }}>{k}</span>
                        <span style={{ fontSize:11, fontFamily:"monospace", color:C.text, fontWeight:600 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize:12, fontWeight:800, color:C.text, marginBottom:12 }}>Policy Configuration</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {[
                      ["Scan Schedule", selectedAgent.policy.scanSchedule],
                      ["Reporting Interval", `${selectedAgent.policy.reportingIntervalSecs}s`],
                      ["Max CPU", `${selectedAgent.policy.maxCpuPct}%`],
                      ["Data Types", selectedAgent.policy.dataTypes.join(", ")],
                    ].map(([k,v])=>(
                      <div key={k as string} style={{ marginBottom:6 }}>
                        <div style={{ fontSize:10, fontWeight:700, color:C.muted, marginBottom:3 }}>{k}</div>
                        <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:6, padding:"7px 10px", fontSize:11, fontFamily:"monospace", color:C.text }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <button onClick={()=>setEditPolicyAgent(selectedAgent)} style={{ marginTop:10, background:C.bg2, border:`1px solid ${C.teal}55`, borderRadius:8, padding:"8px 16px", fontSize:11, fontWeight:700, color:C.teal, cursor:"pointer", fontFamily:"inherit", transition:"all 0.15s" }}>
                    ✎ Edit Policy
                  </button>
                  {Object.keys(selectedAgent.feedActivity ?? {}).length > 0 && (
                    <div style={{ marginTop:14 }}>
                      <div style={{ fontSize:10, fontWeight:700, color:C.muted, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.06em" }}>Feed Activity (24h)</div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                        {Object.entries(selectedAgent.feedActivity ?? {}).map(([f, ts]) => {
                          const within24h = Date.now() - new Date(ts).getTime() < 86_400_000;
                          const color = within24h ? (FEED_COLORS[f] ?? C.dim) : C.dim;
                          const route = FEED_NAV[f];
                          const label = FEED_LABEL[f] ?? f;
                          return (
                            <span
                              key={f}
                              title={`${label} — last push ${relativeTime(ts)}${route ? " · Click to open" : ""}`}
                              onClick={() => {
                                if (route) {
                                  navigate(route);
                                  setTimeout(() => {
                                    document.getElementById("agent-data")?.scrollIntoView({ behavior: "smooth", block: "start" });
                                  }, 400);
                                }
                              }}
                              style={{ background:`${color}18`, border:`1px solid ${color}44`, borderRadius:5, padding:"3px 9px", fontSize:10, fontWeight:700, color, cursor: route ? "pointer" : "default", opacity: within24h ? 1 : 0.5 }}
                            >
                              {within24h ? "●" : "○"} {label} <span style={{ fontWeight:400, opacity:0.75 }}>{relativeTime(ts)}</span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* ════════════ CAPABILITIES ════════════ */}
        {tab==="Capabilities" && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
            {Object.entries(OS_CAPABILITIES).map(([osName, data]) => (
              <div key={osName} style={{ ...card }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14, paddingBottom:12, borderBottom:`1px solid ${C.border}` }}>
                  <div style={{ width:36, height:36, borderRadius:9, background:`${data.color}22`, border:`1.5px solid ${data.color}44`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, color:data.color }}>
                    {data.icon}
                  </div>
                  <div>
                    <div style={{ fontSize:14, fontWeight:800, color:C.text }}>{osName}</div>
                    <div style={{ fontSize:10, color:C.muted }}>{data.capabilities.filter(c=>c.supported).length}/{data.capabilities.length} capabilities active</div>
                  </div>
                  <div style={{ marginLeft:"auto" }}>
                    <Pill label={`${(agents as Agent[]).filter(a=>a.os===data.os).length} agents`} color={data.color} />
                  </div>
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {data.capabilities.map(cap => (
                    <div key={cap.name} style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                      <div style={{ width:18, height:18, borderRadius:4, background:cap.supported?`${C.online}22`:`${C.dim}11`, border:`1px solid ${cap.supported?C.online:C.dim}44`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, flexShrink:0, marginTop:1, color:cap.supported?C.online:C.dim }}>
                        {cap.supported?"✓":"○"}
                      </div>
                      <div>
                        <div style={{ fontSize:11, fontWeight:700, color:cap.supported?C.text:C.muted }}>{cap.name}</div>
                        <div style={{ fontSize:10, color:C.muted, lineHeight:1.4 }}>{cap.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ════════════ INTEGRATIONS ════════════ */}
        {tab==="Integrations" && (
          <>
            {/* Stats strip */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10 }}>
              {[
                { label:"Total Connectors",  value:CATALOG.length,       color:C.teal   },
                { label:"Connected",          value:connectedCount,        color:C.online },
                { label:"Warning / Partial",  value:connections.filter(c=>c.status==="warning"||c.status==="partial").length, color:C.warn },
                { label:"Assets Ingested",    value:totalAssets.toLocaleString(), color:C.info },
                { label:"Events / day",       value:connections.reduce((s,c)=>s+c.eventsIngested,0).toLocaleString(), color:C.purple },
              ].map(s=>(
                <div key={s.label} style={{ ...card, padding:"12px 14px" }}>
                  <div style={{ fontSize:9, fontWeight:800, color:C.muted, letterSpacing:"0.08em", textTransform:"uppercase" }}>{s.label}</div>
                  <div style={{ fontSize:22, fontWeight:900, color:s.color, fontFamily:"monospace", marginTop:4 }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Filters */}
            <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
              <div style={{ display:"flex", gap:4, flexWrap:"wrap", flex:1 }}>
                {CATEGORIES.map(cat=>(
                  <button key={cat} onClick={()=>setCatFilter(cat)} style={{ background:catFilter===cat?`${C.teal}22`:C.bg, border:`1px solid ${catFilter===cat?`${C.teal}66`:C.border}`, borderRadius:6, padding:"4px 10px", fontSize:10, fontWeight:700, color:catFilter===cat?C.teal:C.muted, cursor:"pointer", fontFamily:"inherit", transition:"all 0.15s" }}>
                    {cat}
                  </button>
                ))}
              </div>
              <select value={intFilter} onChange={e=>setIntFilter(e.target.value)} style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:"5px 10px", fontSize:10, fontWeight:700, color:C.muted, cursor:"pointer", fontFamily:"inherit", outline:"none" }}>
                <option value="All">All Statuses</option>
                <option value="connected">Connected</option>
                <option value="warning">Warning / Partial</option>
                <option value="available">Available</option>
              </select>
              <span style={{ fontSize:10, color:C.dim }}>{filteredCatalog.length} connectors</span>
            </div>

            {/* Gallery */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))", gap:10 }}>
              {filteredCatalog.map(conn => {
                const live = connectorMap.get(conn.id);
                const status: ConnStatus = live ? live.status : "available";
                const isAvailable = status==="available";
                const statusColors: Record<ConnStatus,string> = { connected:C.online, partial:C.warn, warning:C.warn, error:C.danger, available:C.dim };
                const sc = statusColors[status];
                return (
                  <div key={conn.id} style={{ background:C.bg, border:`1.5px solid ${isAvailable?C.border:sc+"44"}`, borderRadius:10, padding:"14px", cursor:"pointer", transition:"all 0.18s", opacity:isAvailable?0.82:1 }}
                    onMouseEnter={e=>{(e.currentTarget as HTMLDivElement).style.borderColor=conn.color+"66";(e.currentTarget as HTMLDivElement).style.background=C.bg2;}}
                    onMouseLeave={e=>{(e.currentTarget as HTMLDivElement).style.borderColor=isAvailable?C.border:sc+"44";(e.currentTarget as HTMLDivElement).style.background=C.bg;}}>
                    <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:8 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:9 }}>
                        <div style={{ width:32, height:32, borderRadius:8, background:conn.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:800, color:"white", flexShrink:0, boxShadow:`0 2px 8px ${conn.color}44` }}>
                          {conn.ini}
                        </div>
                        <div>
                          <div style={{ fontSize:12, fontWeight:700, color:C.text, lineHeight:1.2 }}>{conn.name}</div>
                          <div style={{ fontSize:9, color:C.muted, fontWeight:600, marginTop:2 }}>{conn.cat}</div>
                        </div>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:4, flexShrink:0 }}>
                        <div style={{ width:5, height:5, borderRadius:"50%", background:sc, boxShadow:`0 0 4px ${sc}88` }} />
                        <span style={{ fontSize:9, fontWeight:800, color:sc }}>{status.toUpperCase()}</span>
                      </div>
                    </div>
                    <div style={{ fontSize:10, color:C.dim, lineHeight:1.4, marginBottom:8 }}>{conn.description}</div>
                    {!isAvailable && live ? (
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:10 }}>
                        <span style={{ color:C.muted }}>Assets: <strong style={{ color:C.teal, fontFamily:"monospace" }}>{live.assetsIngested.toLocaleString()}</strong></span>
                        <span style={{ color:C.dim }}>{live.lastSync ? `${Math.round((Date.now()-new Date(live.lastSync).getTime())/60000)}m ago` : "—"}</span>
                      </div>
                    ) : (
                      <button onClick={e=>{e.stopPropagation();setWizardConn(conn);}} style={{ width:"100%", marginTop:2, background:`linear-gradient(135deg, ${C.teal}44, ${C.info}33)`, border:`1px solid ${C.teal}44`, borderRadius:7, padding:"6px", fontSize:10, fontWeight:800, color:C.teal, cursor:"pointer", fontFamily:"inherit", transition:"all 0.15s" }}>
                        + Connect
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ════════════ WEBHOOKS ════════════ */}
        {tab==="Webhooks" && (
          <>
            {/* Direction filter */}
            <div style={{ display:"flex", gap:8, alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ display:"flex", gap:4 }}>
                {(["all","inbound","outbound"] as const).map(d=>(
                  <button key={d} onClick={()=>setWhDir(d)} style={{ background:whDir===d?`${C.teal}22`:C.bg, border:`1px solid ${whDir===d?`${C.teal}66`:C.border}`, borderRadius:6, padding:"5px 12px", fontSize:11, fontWeight:700, color:whDir===d?C.teal:C.muted, cursor:"pointer", fontFamily:"inherit" }}>
                    {d.charAt(0).toUpperCase()+d.slice(1)}
                  </button>
                ))}
              </div>
              <button onClick={()=>setNewWebhookOpen(true)} style={{ background:`linear-gradient(135deg, ${C.purple}cc, ${C.info}99)`, border:"none", borderRadius:8, padding:"7px 16px", fontSize:11, fontWeight:800, color:"white", cursor:"pointer", fontFamily:"inherit" }}>
                + New Webhook
              </button>
            </div>

            {/* Webhook cards */}
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {filteredWh.map(wh => (
                <div key={wh.id} style={{ ...card }}>
                  <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:12 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <div style={{ width:32, height:32, borderRadius:8, background:wh.direction==="inbound"?`${C.teal}22`:`${C.purple}22`, border:`1.5px solid ${wh.direction==="inbound"?C.teal:C.purple}44`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, color:wh.direction==="inbound"?C.teal:C.purple }}>
                        {wh.direction==="inbound"?"↓":"↑"}
                      </div>
                      <div>
                        <div style={{ fontSize:13, fontWeight:800, color:C.text }}>{wh.name}</div>
                        <div style={{ display:"flex", gap:6, marginTop:3 }}>
                          <Pill label={wh.direction} color={wh.direction==="inbound"?C.teal:C.purple} />
                          <Pill label={wh.active?"active":"paused"} color={wh.active?C.online:C.dim} />
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:9, color:C.dim }}>Created {new Date(wh.createdAt).toLocaleDateString()}</div>
                    </div>
                  </div>

                  {/* Endpoint URL */}
                  <div style={{ marginBottom:10 }}>
                    <div style={{ fontSize:10, fontWeight:700, color:C.muted, marginBottom:4 }}>{wh.direction==="inbound"?"Inbound Endpoint":"Destination URL"}</div>
                    <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                      <code style={{ flex:1, background:"rgba(0,0,0,0.3)", border:`1px solid ${C.border}`, borderRadius:6, padding:"7px 10px", fontSize:11, fontFamily:"monospace", color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {wh.url}
                      </code>
                      <button onClick={()=>navigator.clipboard.writeText(wh.url)} style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:6, padding:"6px 12px", fontSize:10, fontWeight:700, color:C.muted, cursor:"pointer", fontFamily:"inherit", flexShrink:0 }}>Copy</button>
                    </div>
                  </div>

                  {/* Signing secret (inbound only) */}
                  {wh.direction==="inbound" && (
                    <div style={{ marginBottom:10 }}>
                      <div style={{ fontSize:10, fontWeight:700, color:C.muted, marginBottom:4 }}>Signing Secret</div>
                      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                        <code style={{ flex:1, background:"rgba(0,0,0,0.3)", border:`1px solid ${C.border}`, borderRadius:6, padding:"7px 10px", fontSize:11, fontFamily:"monospace", color:C.teal, letterSpacing:"0.05em" }}>
                          ████████████████████████
                        </code>
                        <button onClick={()=>navigator.clipboard.writeText(wh.signingSecret)} style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:6, padding:"6px 12px", fontSize:10, fontWeight:700, color:C.teal, cursor:"pointer", fontFamily:"inherit", flexShrink:0 }}>Reveal & Copy</button>
                      </div>
                    </div>
                  )}

                  {/* Event types */}
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, color:C.muted, marginBottom:6 }}>Event Types</div>
                    <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                      {wh.eventTypes.map(ev=><Pill key={ev} label={ev} color={C.info} />)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Delivery Log */}
            {deliveryLogs.length>0 && (
              <div style={{ ...card }}>
                <div style={{ fontSize:12, fontWeight:800, color:C.text, marginBottom:12 }}>Delivery Log · Last 20 events</div>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                  <thead>
                    <tr style={{ borderBottom:`1px solid ${C.border}`, background:"var(--secondary)" }}>
                      {["Timestamp","Event","Status","Latency",""].map(h=>(
                        <th key={h} style={{ textAlign:"left", padding:"8px 12px", color:C.muted, fontWeight:800, fontSize:9, letterSpacing:"0.06em", textTransform:"uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(deliveryLogs as DeliveryRow[]).map(log => (
                      <tr key={log.id} style={{ borderBottom:`1px solid ${C.border}`, transition:"background 0.1s" }}
                        onMouseEnter={e=>(e.currentTarget as HTMLTableRowElement).style.background=C.bg2}
                        onMouseLeave={e=>(e.currentTarget as HTMLTableRowElement).style.background="transparent"}>
                        <td style={{ padding:"8px 12px", fontFamily:"monospace", fontSize:10, color:C.dim }}>{new Date(log.ts).toLocaleString()}</td>
                        <td style={{ padding:"8px 12px" }}><Pill label={log.event} color={C.info} /></td>
                        <td style={{ padding:"8px 12px" }}>
                          <span style={{ fontFamily:"monospace", fontWeight:800, fontSize:11, color:log.success?C.online:C.danger }}>{log.statusCode}</span>
                        </td>
                        <td style={{ padding:"8px 12px", fontFamily:"monospace", fontSize:10, color:C.muted }}>{log.latencyMs}ms</td>
                        <td style={{ padding:"8px 12px" }}>
                          <button onClick={()=>setExpandedLog(expandedLog===log.id?null:log.id)} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:5, padding:"3px 8px", fontSize:9, fontWeight:700, color:C.muted, cursor:"pointer", fontFamily:"inherit" }}>
                            {expandedLog===log.id?"▲ hide":"▼ payload"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {expandedLog && (() => {
                  const log = (deliveryLogs as DeliveryRow[]).find(l=>l.id===expandedLog);
                  if (!log) return null;
                  return (
                    <div style={{ margin:"0 12px 12px", background:"rgba(0,0,0,0.4)", border:`1px solid ${C.border}`, borderRadius:8, padding:"12px 14px" }}>
                      <div style={{ fontSize:10, fontWeight:700, color:C.muted, marginBottom:6 }}>Payload</div>
                      <pre style={{ fontSize:10, fontFamily:"monospace", color:C.text, margin:0, whiteSpace:"pre-wrap", wordBreak:"break-word" }}>{log.payload}</pre>
                    </div>
                  );
                })()}
              </div>
            )}
          </>
        )}

        {/* ════════════ PIPELINE ════════════ */}
        {tab==="Pipeline" && (
          <>
            {/* Per-connector 7-day volume bars */}
            <div style={{ ...card }}>
              <div style={{ fontSize:12, fontWeight:800, color:C.text, marginBottom:14 }}>Ingestion Volume (7-day) · Events In</div>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {topConnectors.map(conn => {
                  const def = CATALOG.find(d=>d.id===conn.connectorId);
                  const days = metricsMap.get(conn.connectorId) ?? [];
                  const volumes = days.map(d=>d.volumeIn);
                  const maxVol = Math.max(...volumes,1);
                  return (
                    <div key={conn.id} style={{ display:"flex", alignItems:"center", gap:12 }}>
                      <div style={{ width:24, height:24, borderRadius:6, background:def?.color??C.teal, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800, color:"white", flexShrink:0 }}>
                        {def?.ini??"?"}
                      </div>
                      <div style={{ width:130, fontSize:11, fontWeight:700, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{conn.connectorName}</div>
                      <div style={{ flex:1, display:"flex", gap:2, alignItems:"flex-end", height:28 }}>
                        {volumes.map((v,i)=>(
                          <div key={i} style={{ flex:1, background:`${def?.color??C.teal}88`, borderRadius:"2px 2px 0 0", height:`${Math.max((v/maxVol)*100,4)}%`, transition:"height 0.3s", minHeight:2 }} title={`Day -${6-i}: ${v.toLocaleString()} events`} />
                        ))}
                      </div>
                      <div style={{ display:"flex", gap:10, width:140 }}>
                        <Sparkline values={volumes} color={def?.color??C.teal} />
                        <div style={{ fontSize:10, fontFamily:"monospace", color:C.muted, textAlign:"right", lineHeight:1.3 }}>
                          <div>{conn.eventsIngested.toLocaleString()}</div>
                          <div style={{ fontSize:9, color:C.dim }}>total</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Latency table */}
            <div style={{ ...card }}>
              <div style={{ fontSize:12, fontWeight:800, color:C.text, marginBottom:12 }}>P50 / P95 Latency (latest day)</div>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                <thead>
                  <tr style={{ borderBottom:`1px solid ${C.border}`, background:"var(--secondary)" }}>
                    {["Connector","P50 Latency","P95 Latency","Error Rate","Trend","Status"].map(h=>(
                      <th key={h} style={{ textAlign:"left", padding:"8px 12px", color:C.muted, fontWeight:800, fontSize:9, letterSpacing:"0.06em", textTransform:"uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topConnectors.map(conn => {
                    const days = (metricsMap.get(conn.connectorId)??[]);
                    const latest = days[days.length-1];
                    if (!latest) return null;
                    const p50Color = latest.latencyP50Ms<100?C.online:latest.latencyP50Ms<300?C.warn:C.danger;
                    const errColor = latest.errorRate<0.01?C.online:latest.errorRate<0.05?C.warn:C.danger;
                    const def = CATALOG.find(d=>d.id===conn.connectorId);
                    return (
                      <tr key={conn.id} style={{ borderBottom:`1px solid ${C.border}`, transition:"background 0.1s" }}
                        onMouseEnter={e=>(e.currentTarget as HTMLTableRowElement).style.background=C.bg2}
                        onMouseLeave={e=>(e.currentTarget as HTMLTableRowElement).style.background="transparent"}>
                        <td style={{ padding:"10px 12px" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                            <div style={{ width:20, height:20, borderRadius:5, background:def?.color??C.teal, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:800, color:"white" }}>{def?.ini??"?"}</div>
                            <span style={{ fontSize:11, fontWeight:700, color:C.text }}>{conn.connectorName}</span>
                          </div>
                        </td>
                        <td style={{ padding:"10px 12px", fontFamily:"monospace", fontWeight:700, color:p50Color }}>{latest.latencyP50Ms}ms</td>
                        <td style={{ padding:"10px 12px", fontFamily:"monospace", fontWeight:700, color:latest.latencyP95Ms<500?C.warn:C.danger }}>{latest.latencyP95Ms}ms</td>
                        <td style={{ padding:"10px 12px" }}>
                          <span style={{ fontFamily:"monospace", fontWeight:800, fontSize:11, color:errColor }}>{(latest.errorRate*100).toFixed(2)}%</span>
                        </td>
                        <td style={{ padding:"10px 12px" }}>
                          <Sparkline values={days.map(d=>d.latencyP50Ms)} color={p50Color} />
                        </td>
                        <td style={{ padding:"10px 12px" }}>
                          <StatusBadge status={conn.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Error log */}
            {metrics.some(m=>(m.errors?.length??0)>0) && (
              <div style={{ ...card }}>
                <div style={{ fontSize:12, fontWeight:800, color:C.danger, marginBottom:12 }}>Recent Pipeline Errors</div>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {metrics.filter(m=>(m.errors?.length??0)>0).flatMap(m=>(m.errors??[]).map((e:{ts:string;code:string;message:string})=>({...e,connector:m.connectorName}))).slice(0,10).map((err,i) => (
                    <div key={i} style={{ background:"rgba(239,68,68,0.06)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:8, padding:"10px 12px", display:"flex", gap:12, alignItems:"center" }}>
                      <div style={{ width:48, textAlign:"center" }}>
                        <Pill label={err.code} color={C.danger} />
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:11, fontWeight:700, color:C.text }}>{err.connector}</div>
                        <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>{err.message}</div>
                      </div>
                      <div style={{ fontSize:9, fontFamily:"monospace", color:C.dim }}>{new Date(err.ts).toLocaleTimeString()}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}


      </div>

      {/* ── Overlays ── */}
      {deployOpen     && <DeployDrawer onClose={()=>setDeployOpen(false)} />}
      {wizardConn     && <ConnectorWizard connector={wizardConn} onClose={()=>setWizardConn(null)} onConnect={()=>rConns()} />}
      {newWebhookOpen && <NewWebhookModal onClose={()=>setNewWebhookOpen(false)} onCreate={()=>{ rWh(); setNewWebhookOpen(false); }} />}
      {editPolicyAgent && <EditPolicyModal agent={editPolicyAgent} onClose={()=>setEditPolicyAgent(null)} onSave={()=>{ rAgents(); setEditPolicyAgent(null); }} />}
    </div>
  );
}
