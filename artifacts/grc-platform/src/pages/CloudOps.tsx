// @ts-nocheck
import React, { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { ReactFlow, Background, Controls, Handle, Position, MarkerType, BackgroundVariant } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useQueryClient } from "@tanstack/react-query";
import { SubNav, ModuleHeader } from "@/components/SubNav";
import { AICopilotBar } from "@/components/AICopilotBar";
import { getStoredToken } from "@/lib/auth-utils";
import { useOrg } from "@/context/OrgContext";
import { useLicense } from "@/context/LicenseContext";
import { LockedModule } from "@/components/LockedModule";
import { useCspmStats, useCspmResources, useCspmFindings, useCspmDrift, useUpdateCspmFindingStatus } from "@/hooks/useGrcApi";
import {
  ENT_TOTAL_RESOURCES, ENT_SCORE, ENT_CRITICAL, ENT_HIGH, ENT_MEDIUM,
  ENT_OPEN_FINDINGS, ENT_SCORE_WEEKLY as scoreWeekly,
  cspmFindings as cspmTopFindings, getProviderCounts, PROVIDER_RESOURCES,
} from "@/lib/cloudops-shared";
import { CloudComplianceTab } from "./CloudComplianceTab";

// ── Design tokens ──────────────────────────────────────────────────────────────
const NAV = "#93C5FD";
const EME = "#34D399";
const RED = "#F87171";
const AMB = "#FCD34D";
const BLU = "#60A5FA";
const CYN = "#22D3EE";
const PRP = "#C4B5FD";
const GRN = "#4ADE80";
const YEL = "#FDE68A";

const card = (extra: React.CSSProperties = {}): React.CSSProperties => ({
  background: "var(--card)", borderRadius: 12, border: "1px solid var(--border)",
  boxShadow: "0 2px 12px rgba(0,0,0,0.40)", ...extra,
});
const providerColors: Record<string, string> = {
  AWS: "#FF9900", Azure: "#0078D4", GCP: "#4285F4",
};
const providerBg: Record<string, string> = {
  AWS: "rgba(255,153,0,0.12)", Azure: "rgba(0,120,212,0.12)", GCP: "rgba(66,133,244,0.12)",
};
const sevColor: Record<string, string> = { Critical: RED, High: AMB, Medium: YEL, Low: BLU, Informational: "var(--muted-foreground)" };
const statusColor: Record<string, string> = { open: RED, "in-remediation": AMB, resolved: EME, suppressed: "var(--muted-foreground)" };
const statusLabel: Record<string, string> = { open: "Open", "in-remediation": "In Remediation", resolved: "✅ Resolved", suppressed: "Suppressed" };

// ── Utility SVG ────────────────────────────────────────────────────────────────
function Sparkline({ data, color = NAV, h = 36, w = 120 }: { data: number[]; color?: string; h?: number; w?: number }) {
  if (data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const pts = data.map((d, i) => [(i / (data.length - 1)) * w, h - ((d - min) / range) * (h - 6) - 3]);
  const path = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${path} L${w},${h} L0,${h} Z`;
  return (
    <svg width={w} height={h} style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={`sg-${color.replace(/[^a-z0-9]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sg-${color.replace(/[^a-z0-9]/gi, "")})`} />
      <path d={path} stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MiniDonut({ segs, size = 88, thick = 14 }: { segs: { v: number; c: string }[]; size?: number; thick?: number }) {
  const r = (size - thick) / 2, circ = 2 * Math.PI * r;
  const total = segs.reduce((s, x) => s + x.v, 0) || 1;
  const cx = size / 2, cy = size / 2;
  let cum = 0;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={thick} />
      {segs.map((seg, i) => {
        const pct = seg.v / total, dash = pct * circ, gap = circ - dash, off = -(cum * circ);
        cum += pct;
        return <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={seg.c} strokeWidth={thick} strokeDasharray={`${dash} ${gap}`} strokeDashoffset={off} />;
      })}
    </svg>
  );
}

function GaugeSVG({ value, min = 300, max = 850 }: { value: number; min?: number; max?: number }) {
  const cx = 110, cy = 100, r = 80;
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const colorBands: [number, number, string][] = [[0, 0.25, RED], [0.25, 0.45, AMB], [0.45, 0.65, YEL], [0.65, 0.85, GRN], [0.85, 1, EME]];
  const toXY = (p: number) => { const a = Math.PI - p * Math.PI; return [cx + r * Math.cos(a), cy - r * Math.sin(a)] as [number, number]; };
  const arc = (s: number, e: number) => { const [sx, sy] = toXY(s), [ex, ey] = toXY(e); return `M${sx.toFixed(1)},${sy.toFixed(1)} A${r},${r} 0 0 1 ${ex.toFixed(1)},${ey.toFixed(1)}`; };
  const na = Math.PI - pct * Math.PI, nx = cx + 62 * Math.cos(na), ny = cy - 62 * Math.sin(na);
  return (
    <svg viewBox="0 0 220 115" style={{ width: "100%" }}>
      {colorBands.map(([s, e, c], i) => (
        <path key={i} d={arc(s, e)} stroke={c} strokeWidth="16" fill="none" strokeLinecap={i === 0 || i === 4 ? "round" : "butt"} />
      ))}
      <line x1={cx} y1={cy} x2={nx.toFixed(1)} y2={ny.toFixed(1)} stroke="var(--foreground)" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="6" fill="var(--foreground)" />
      <circle cx={cx} cy={cy} r="3" fill="white" />
      <text x={cx} y={cy + 22} textAnchor="middle" fontSize="28" fontWeight="800" fill={NAV}>{value}</text>
      <text x={cx} y={cy + 36} textAnchor="middle" fontSize="9" fill="var(--muted-foreground)">MISCONFIG SCORE</text>
    </svg>
  );
}

function KpiCard({ label, value, sub, color, icon, onClick }: { label: string; value: string | number; sub?: string; color?: string; icon?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} style={{ ...card({ padding: "14px 18px" }), cursor: onClick ? "pointer" : "default" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>{label}</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: color ?? NAV, letterSpacing: "-1px", fontFamily: "'JetBrains Mono',monospace" }}>{value}</div>
          {sub && <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 4 }}>{sub}</div>}
        </div>
        {icon && <div style={{ fontSize: 22, opacity: 0.6 }}>{icon}</div>}
      </div>
    </div>
  );
}

// ── Toast notification ─────────────────────────────────────────────────────────
function Toast({ msg, type, onDone }: { msg: string; type: "ok" | "err" | "info"; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3200); return () => clearTimeout(t); }, []);
  const bg = type === "ok" ? "rgba(52,211,153,0.15)" : type === "err" ? "rgba(248,113,113,0.15)" : "rgba(147,197,253,0.12)";
  const border = type === "ok" ? "rgba(52,211,153,0.35)" : type === "err" ? "rgba(248,113,113,0.35)" : "rgba(147,197,253,0.3)";
  const col = type === "ok" ? EME : type === "err" ? RED : NAV;
  return (
    <div style={{ position: "fixed", bottom: 28, right: 28, zIndex: 9999, background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: "12px 18px", fontSize: 13, fontWeight: 700, color: col, display: "flex", alignItems: "center", gap: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.5)", animation: "slideUp 0.25s ease" }}>
      <span>{type === "ok" ? "✅" : type === "err" ? "❌" : "ℹ️"}</span>
      {msg}
    </div>
  );
}

// ── Scan overlay ───────────────────────────────────────────────────────────────
function ScanOverlay({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("Connecting to cloud providers...");
  const phases = [
    "Connecting to cloud providers...",
    "Scanning AWS resources (14 services)...",
    "Scanning Azure resources (11 services)...",
    "Scanning GCP resources (9 services)...",
    "Evaluating CIS benchmark controls...",
    "Detecting configuration drift...",
    "Analysing IAM entitlements...",
    "Building compliance report...",
    "Scan complete ✓",
  ];
  useEffect(() => {
    let p = 0;
    const interval = setInterval(() => {
      p += Math.random() * 14 + 4;
      if (p >= 100) { p = 100; clearInterval(interval); setTimeout(onDone, 600); }
      setProgress(Math.min(p, 100));
      setPhase(phases[Math.min(Math.floor((p / 100) * (phases.length - 1)), phases.length - 1)]);
    }, 220);
    return () => clearInterval(interval);
  }, []);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 8000, background: "rgba(6,10,18,0.92)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: NAV, animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite` }} />
        ))}
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, color: "var(--foreground)" }}>🔍 Full Cloud Security Scan</div>
      <div style={{ width: 420, background: "rgba(255,255,255,0.06)", borderRadius: 8, height: 8, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${progress}%`, background: `linear-gradient(90deg, ${NAV}, ${EME})`, borderRadius: 8, transition: "width 0.3s ease" }} />
      </div>
      <div style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: 600 }}>{Math.round(progress)}% — {phase}</div>
      <div style={{ fontSize: 11, color: "rgba(148,163,184,0.4)" }}>This may take a moment</div>
    </div>
  );
}

// ── Static data ────────────────────────────────────────────────────────────────

const cspmServices: any[] = [];
const saasIntegrations: any[] = [];
const findingsByApp: any[] = [];
const ciemClouds: any[] = [];
const excessivePerms: any[] = [];
const clusters: any[] = [];
const topVulnImages: any[] = [];
const runtimeThreats: any[] = [];
const exposureInsights: any[] = [];
const topAttackPaths: any[] = [];
const sspmApps: any[] = [];

const scoreHistory = [];

const cspmFindingDetail: Record<string, { aiRecs: string[]; iacFix: string; impact: string; framework: string }> = {
  "CF-001": {
    aiRecs: ["Run `aws s3api put-bucket-acl --bucket acme-prod-backups --acl private` immediately","Enable S3 Block Public Access at account level","Configure S3 Object Ownership to BucketOwnerEnforced"],
    iacFix: `resource "aws_s3_bucket_public_access_block" "backups" {\n  bucket = "acme-prod-backups"\n  block_public_acls       = true\n  block_public_policy     = true\n  ignore_public_acls      = true\n  restrict_public_buckets = true\n}`,
    impact: "Any unauthenticated user can LIST and GET all objects from this backup bucket — including database dumps, PII, credentials.",
    framework: "CIS AWS 2.1.5 · SOC 2 CC6.1 · ISO A.13.1.3",
  },
  "CF-002": {
    aiRecs: ["Set PubliclyAccessible=false on RDS instance immediately","Move RDS to private subnet","Update Security Group to allow inbound 3306 only from application layer CIDR"],
    iacFix: `resource "aws_db_instance" "prod_mysql" {\n  publicly_accessible = false\n  db_subnet_group_name = aws_db_subnet_group.private.name\n}`,
    impact: "Database endpoint reachable from the internet — brute-force, SQL injection possible.",
    framework: "CIS AWS 2.3.2 · HIPAA 164.312.e · PCI-DSS Req 1.3",
  },
  "CF-003": {
    aiRecs: ["Stop VM, enable Azure Disk Encryption via Key Vault","Enforce OS disk encryption via Azure Policy","Enable Defender for Cloud auto-remediation"],
    iacFix: `resource "azurerm_managed_disk" "os_disk" {\n  encryption_settings { enabled = true }\n}`,
    impact: "VM OS disk data readable if physical/logical disk is accessed.",
    framework: "CIS Azure 7.2 · ISO A.10.1.1 · NIST 800-53 SC-28",
  },
  "CF-007": {
    aiRecs: ["Remove SSH inbound rule from 0.0.0.0/0","Deploy Systems Manager Session Manager","Add WAF rule to block port 22 probes"],
    iacFix: `resource "aws_security_group_rule" "deny_ssh_public" {\n  type="ingress"\n  from_port=22\n  to_port=22\n  cidr_blocks=["10.0.0.0/8"]\n}`,
    impact: "SSH brute-force from any internet source — CVE-2023-38408 could enable RCE.",
    framework: "CIS AWS 5.2 · SOC 2 CC6.6 · PCI-DSS Req 1.2.1",
  },
};

const oauthRiskyApps = [];

const exposedAssets = [];

const certExpiries = [];

const iocFeed = [];

const cvwatchlist = [];

const mitreCloud = [];

const cwppHosts = [];

const cwppAnomalies = [];

const secretsFound = [];

const cicdRepos = [];

const aiModels = [];

const remItems = [];

// ── Security Graph View ────────────────────────────────────────────────────────
const NODE_POS: Record<string,{x:number;y:number}> = {
  "internet":         {x:380, y:10 },
  "aws-iam-user-001": {x:10,  y:130},
  "aws-ec2-prod-001": {x:190, y:130},
  "aws-s3-prod-001":  {x:560, y:130},
  "az-vm-prod-001":   {x:740, y:130},
  "aws-iam-role-001": {x:100, y:290},
  "aws-eks-001":      {x:360, y:290},
  "aws-ecr-img-001":  {x:560, y:290},
  "aws-lambda-002":   {x:160, y:430},
  "aws-rds-prod-001": {x:420, y:430},
};
// ── Shared primary attack path (Security Graph + Workload Scanning) ────────────
const PRIMARY_ATTACK_PATH = [
  {step:1,node:"Internet",              action:"Initial Access",      detail:"Attacker scans for open SSH (port 22) — hits unrestricted security group sg-prod-api-public (CF-0001)",   sev:"Critical",finding:"CF-0001"},
  {step:2,node:"dev-bastion-01 (EC2)",  action:"Initial Compromise",  detail:"Bastion host has a public IP with SSH exposed to 0.0.0.0/0 — no rate limiting or key rotation (CF-0004)", sev:"Critical",finding:"CF-0004"},
  {step:3,node:"acme-admin-role (IAM)", action:"Privilege Escalation",detail:"Root account access key active (CF-0003) + no MFA enforcement (CF-0008) — full AWS API access",           sev:"Critical",finding:"CF-0003"},
  {step:4,node:"prod-k8s-cluster (EKS)",action:"Lateral Movement",    detail:"Admin IAM role assumed via stolen key; kubectl access to production K8s control plane",                    sev:"Critical",finding:"CF-0003"},
  {step:5,node:"fn-payments-processor", action:"Secret Extraction",   detail:"Lambda stores DB connection string in plaintext env vars (CF-0021) — credentials readable from K8s",      sev:"High",    finding:"CF-0021"},
  {step:6,node:"analytics-mysql-prod",  action:"Data Exfiltration",   detail:"Unencrypted RDS instance (CF-0014) accessed with stolen creds — full analytics DB dump. Attack complete.", sev:"Critical",finding:"CF-0014"},
];

function AttackPathModal({ onClose }: { onClose: ()=>void }) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:9000,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:"28px 32px",width:680,maxWidth:"95vw",maxHeight:"90vh",overflowY:"auto",boxShadow:"0 24px 64px rgba(0,0,0,0.6)"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <div>
            <div style={{fontSize:16,fontWeight:800,color:RED}}>⚡ Primary Attack Path</div>
            <div style={{fontSize:11,color:"var(--muted-foreground)",marginTop:3}}>Internet → Cloud Database Exfiltration · 6 hops · Attack Complexity: Low</div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"var(--muted-foreground)"}}>×</button>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:0}}>
          {PRIMARY_ATTACK_PATH.map((step,i)=>(
            <div key={i} style={{display:"flex",gap:16,alignItems:"flex-start"}}>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",flexShrink:0}}>
                <div style={{width:36,height:36,borderRadius:"50%",background:step.sev==="Critical"?"rgba(248,113,113,0.15)":"rgba(252,211,77,0.12)",border:`2px solid ${step.sev==="Critical"?RED:AMB}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:900,color:step.sev==="Critical"?RED:AMB}}>{step.step}</div>
                {i<PRIMARY_ATTACK_PATH.length-1&&<div style={{width:2,height:28,background:"rgba(255,255,255,0.08)",marginTop:4}}/>}
              </div>
              <div style={{paddingBottom:i<PRIMARY_ATTACK_PATH.length-1?24:0,flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                  <span style={{fontSize:12,fontWeight:800,color:"var(--foreground)"}}>{step.node}</span>
                  <span style={{fontSize:9,fontWeight:700,color:step.sev==="Critical"?RED:AMB,background:step.sev==="Critical"?"rgba(248,113,113,0.12)":"rgba(252,211,77,0.1)",border:`1px solid ${step.sev==="Critical"?"rgba(248,113,113,0.3)":"rgba(252,211,77,0.25)"}`,borderRadius:4,padding:"1px 7px"}}>{step.action}</span>
                  <span style={{fontSize:9,color:"var(--muted-foreground)",fontFamily:"monospace"}}>{step.finding}</span>
                </div>
                <div style={{fontSize:11,color:"var(--muted-foreground)",lineHeight:1.6,background:"var(--secondary)",borderRadius:7,padding:"8px 12px",border:"1px solid var(--border)"}}>{step.detail}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{marginTop:20,padding:"14px 16px",background:"rgba(248,113,113,0.06)",border:"1px solid rgba(248,113,113,0.2)",borderRadius:10}}>
          <div style={{fontSize:12,fontWeight:800,color:RED,marginBottom:6}}>⚡ Blast Radius: Full production database compromise</div>
          <div style={{fontSize:11,color:"var(--foreground)",lineHeight:1.6}}>An attacker with internet access can complete this kill chain in under 10 minutes. The path exploits 4 critical misconfigurations in sequence — fixing any single hop breaks the entire chain.</div>
        </div>
      </div>
    </div>
  );
}

// ── React Flow custom node ─────────────────────────────────────────────────────
function CloudNode({ data, selected }: any) {
  const rc = data.risk==="Critical"?RED:data.risk==="High"?AMB:data.risk==="Medium"?BLU:EME;
  return (
    <div style={{width:148,background:selected?`${rc}28`:"rgba(13,20,38,0.92)",border:`1.5px solid ${selected?rc:rc+"55"}`,borderRadius:8,cursor:"pointer",padding:"7px 9px",display:"flex",flexDirection:"column",gap:3,boxShadow:selected?`0 0 0 2px ${rc}40,0 6px 24px rgba(0,0,0,0.8)`:"0 2px 14px rgba(0,0,0,0.6)",transition:"all 0.15s",outline:"none"}}>
      <Handle type="target" position={Position.Top} style={{background:rc,borderColor:rc,width:8,height:8,top:-5}} />
      <div style={{display:"flex",alignItems:"center",gap:5}}>
        <span style={{fontSize:13,flexShrink:0,lineHeight:1}}>{data.icon??"◎"}</span>
        <div style={{fontSize:9,fontWeight:800,color:rc,fontFamily:"monospace",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:112}}>{data.label}</div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:4}}>
        <span style={{fontSize:7,fontWeight:700,color:rc,background:`${rc}20`,borderRadius:3,padding:"1px 5px",flexShrink:0,border:`1px solid ${rc}30`}}>{data.risk}</span>
        {data.provider&&<span style={{fontSize:7,color:"var(--muted-foreground)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{data.provider}</span>}
        {data.critFindings>0&&<span style={{fontSize:7,color:RED,fontWeight:800}}>⚠{data.critFindings}</span>}
      </div>
      <Handle type="source" position={Position.Bottom} style={{background:rc,borderColor:rc,width:8,height:8,bottom:-5}} />
    </div>
  );
}
const nodeTypes = { cloudNode: CloudNode };

function SecurityGraphView() {
  const [rawGraph, setRawGraph] = useState<{nodes:any[];edges:any[]}>({nodes:[],edges:[]});
  const [rfNodes, setRfNodes] = useState<any[]>([]);
  const [rfEdges, setRfEdges] = useState<any[]>([]);
  const [toxicCombos, setToxicCombos] = useState<any[]>([]);
  const [selNode, setSelNode] = useState<any>(null);
  const [selCombo, setSelCombo] = useState<any>(null);
  const [showAttackPath, setShowAttackPath] = useState(false);

  useEffect(()=>{
    const tok = getStoredToken(); if (!tok) return;
    const H = { Authorization:`Bearer ${tok}` };
    fetch('/api/cloudops/security-graph',{headers:H as any})
      .then(r=>r.ok?r.json():{nodes:[],edges:[]})
      .then((d:any)=>{
        setRawGraph(d);
        const flowNodes = d.nodes.map((n:any)=>({
          id:n.id,
          position: NODE_POS[n.id]??{x:300,y:200},
          data: n,
          type:"cloudNode",
          draggable:true,
        }));
        const flowEdges = d.edges.map((e:any,i:number)=>({
          id:`edge-${i}`,
          source:e.from,
          target:e.to,
          label:e.label,
          animated:e.sev==="Critical",
          style:{stroke:e.sev==="Critical"?RED:AMB,strokeWidth:e.sev==="Critical"?2:1.5},
          markerEnd:{type:MarkerType.ArrowClosed,color:e.sev==="Critical"?RED:AMB,width:14,height:14},
          labelStyle:{fill:e.sev==="Critical"?RED:AMB,fontSize:8,fontWeight:700},
          labelBgStyle:{fill:"rgba(4,8,16,0.9)",fillOpacity:0.95},
          labelBgPadding:[5,3],
          labelBgBorderRadius:3,
          type:"smoothstep",
        }));
        setRfNodes(flowNodes);
        setRfEdges(flowEdges);
      }).catch(()=>{});
    fetch('/api/cloudops/toxic-combinations',{headers:H as any})
      .then(r=>r.ok?r.json():[])
      .then((d:any)=>Array.isArray(d)&&setToxicCombos(d))
      .catch(()=>{});
  },[]);

  const onNodeClick = useCallback((_evt:any, node:any)=>{
    setSelNode((prev:any)=>prev?.id===node.id?null:node.data);
  },[]);
  const onPaneClick = useCallback(()=>setSelNode(null),[]);
  const rCol=(r:string)=>r==="Critical"?RED:r==="High"?AMB:r==="Medium"?BLU:EME;
  const critPaths = rawGraph.edges.filter((e:any)=>e.sev==="Critical").length;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {/* Attack path banner */}
      <div style={{background:`rgba(248,113,113,0.08)`,border:`1px solid rgba(248,113,113,0.25)`,borderRadius:10,padding:"12px 18px",display:"flex",alignItems:"center",gap:12}}>
        <span style={{fontSize:18}}>⚠️</span>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:800,color:RED}}>5 Critical Attack Paths Detected — 3 with Low Attack Complexity</div>
          <div style={{fontSize:11,color:"var(--muted-foreground)",marginTop:2}}>Primary path: Internet → EC2 Bastion → IAM AdminRole → EKS → Lambda → DB exfiltration (6 hops)</div>
        </div>
        <button onClick={()=>setShowAttackPath(true)} style={{padding:"7px 16px",borderRadius:8,border:`1px solid ${RED}44`,background:`rgba(248,113,113,0.12)`,color:RED,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>View Primary Path →</button>
      </div>

      {/* KPI strip */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
        <KpiCard label="Total Graph Nodes"   value={rawGraph.nodes.length}                              sub="Resources mapped"          color={NAV} icon="◎" />
        <KpiCard label="Attack Edges"        value={rawGraph.edges.length}                              sub={`${critPaths} critical paths`} color={RED} icon="→" />
        <KpiCard label="Toxic Combinations"  value={toxicCombos.length}                                 sub="Multi-factor risk chains"  color={AMB} icon="☣" />
        <KpiCard label="Internet Exposure"   value={rawGraph.edges.filter((e:any)=>e.from==="internet").length} sub="Direct internet-facing" color={RED} icon="🌐" />
      </div>

      {/* React Flow security graph */}
      <div style={card({padding:0,overflow:"hidden"})}>
        <div style={{padding:"14px 18px",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",gap:12}}>
          <div style={{fontSize:13,fontWeight:800,color:NAV}}>Cloud Security Graph</div>
          <div style={{fontSize:11,color:"var(--muted-foreground)"}}>Click any node to inspect findings, permissions &amp; connections</div>
          <div style={{flex:1}}/>
          {([["Critical",RED],["High",AMB],["Medium",BLU],["Low",EME]] as [string,string][]).map(([l,c])=>(
            <span key={l} style={{fontSize:10,fontWeight:700,color:c,background:`${c}14`,border:`1px solid ${c}33`,borderRadius:4,padding:"2px 8px"}}>{l}</span>
          ))}
        </div>
        <div style={{height:530,background:"rgba(4,8,16,0.72)"}}>
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            fitView
            fitViewOptions={{padding:0.18,maxZoom:1.1}}
            proOptions={{hideAttribution:true}}
            style={{background:"transparent"}}
            minZoom={0.35}
            maxZoom={2.5}
          >
            <Background variant={BackgroundVariant.Dots} color="rgba(147,197,253,0.10)" gap={22} size={1.5} />
            <Controls />
          </ReactFlow>
        </div>

        {/* Node detail panel */}
        {selNode&&(
          <div style={{borderTop:"1px solid var(--border)",padding:"16px 20px",background:"rgba(147,197,253,0.04)"}}>
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:12}}>
              <div>
                <div style={{fontSize:14,fontWeight:800,color:rCol(selNode.risk)}}>{selNode.icon} {selNode.label}</div>
                <div style={{fontSize:11,color:"var(--muted-foreground)",marginTop:3}}>{selNode.service} · {selNode.region} · {selNode.provider}</div>
              </div>
              <button onClick={()=>setSelNode(null)} style={{background:"none",border:"none",color:"var(--muted-foreground)",fontSize:18,cursor:"pointer"}}>×</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
              {([{l:"Risk Tier",v:selNode.risk,c:rCol(selNode.risk)},{l:"Total Findings",v:selNode.findings??0,c:NAV},{l:"Critical Findings",v:selNode.critFindings??0,c:RED}] as any[]).map((m:any)=>(
                <div key={m.l} style={{background:"var(--secondary)",borderRadius:7,padding:"8px 12px",border:"1px solid var(--border)"}}>
                  <div style={{fontSize:9,fontWeight:700,color:"var(--muted-foreground)",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>{m.l}</div>
                  <div style={{fontSize:16,fontWeight:900,color:m.c,fontFamily:"monospace"}}>{m.v}</div>
                </div>
              ))}
            </div>
            {/* Full findings list */}
            {selNode.findingsList?.length>0&&(
              <div style={{marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:700,color:NAV,marginBottom:6}}>◆ Associated Findings ({selNode.findingsList.length})</div>
                <div style={{display:"flex",flexDirection:"column",gap:5}}>
                  {selNode.findingsList.map((f:any)=>(
                    <div key={f.id} style={{display:"flex",alignItems:"flex-start",gap:8,background:"var(--secondary)",borderRadius:7,padding:"7px 10px",border:"1px solid var(--border)"}}>
                      <span style={{fontSize:8,fontWeight:700,color:rCol(f.severity),background:`${rCol(f.severity)}18`,borderRadius:3,padding:"2px 6px",flexShrink:0,marginTop:1}}>{f.severity}</span>
                      <span style={{fontSize:11,color:"var(--foreground)",flex:1,lineHeight:1.5}}>{f.title}</span>
                      <span style={{fontSize:8,color:"var(--muted-foreground)",fontFamily:"monospace",flexShrink:0}}>{f.id}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Permissions for IAM nodes */}
            {selNode.permissions?.length>0&&(
              <div style={{marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:700,color:AMB,marginBottom:6}}>⚠ Granted Permissions ({selNode.permissions.length})</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                  {selNode.permissions.map((p:string)=>(
                    <span key={p} style={{fontSize:9,fontWeight:700,color:AMB,background:"rgba(252,211,77,0.08)",border:"1px solid rgba(252,211,77,0.2)",borderRadius:4,padding:"2px 8px",fontFamily:"monospace"}}>{p}</span>
                  ))}
                </div>
              </div>
            )}
            {/* Connected attack edges */}
            <div>
              <div style={{fontSize:11,fontWeight:700,color:NAV,marginBottom:6}}>◈ Connected Attack Edges</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {rawGraph.edges.filter((e:any)=>e.from===selNode.id||e.to===selNode.id).map((e:any,i:number)=>{
                  const isFrom=e.from===selNode.id;
                  const other=rawGraph.nodes.find((n:any)=>n.id===(isFrom?e.to:e.from));
                  return (
                    <span key={i} onClick={()=>setSelNode(other)} style={{fontSize:10,fontWeight:700,color:e.sev==="Critical"?RED:AMB,background:e.sev==="Critical"?"rgba(248,113,113,0.1)":"rgba(252,211,77,0.1)",border:`1px solid ${e.sev==="Critical"?"rgba(248,113,113,0.3)":"rgba(252,211,77,0.3)"}`,borderRadius:5,padding:"3px 8px",cursor:"pointer"}}>
                      {isFrom?"→":"←"} {other?.label} ({e.label})
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Toxic Combinations */}
      <div style={card({padding:"18px 20px"})}>
        <div style={{fontSize:14,fontWeight:800,color:NAV,marginBottom:4}}>☣ Toxic Combinations</div>
        <div style={{fontSize:11,color:"var(--muted-foreground)",marginBottom:16}}>Multi-factor risk chains where independent misconfigurations combine into high-severity attack vectors</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {toxicCombos.map((tc:any)=>(
            <div key={tc.id} style={{borderRadius:10,border:`1px solid ${tc.severity==="Critical"?"rgba(248,113,113,0.3)":"rgba(252,211,77,0.25)"}`,background:tc.severity==="Critical"?"rgba(248,113,113,0.05)":"rgba(252,211,77,0.04)",overflow:"hidden"}}>
              <div style={{padding:"12px 16px",display:"flex",alignItems:"flex-start",gap:12,cursor:"pointer"}} onClick={()=>setSelCombo((prev:any)=>prev?.id===tc.id?null:tc)}>
                <span style={{fontSize:9,fontWeight:700,color:tc.severity==="Critical"?RED:AMB,background:tc.severity==="Critical"?"rgba(248,113,113,0.15)":"rgba(252,211,77,0.12)",border:`1px solid ${tc.severity==="Critical"?"rgba(248,113,113,0.35)":"rgba(252,211,77,0.3)"}`,borderRadius:4,padding:"2px 7px",flexShrink:0,marginTop:1}}>{tc.severity}</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:800,color:"var(--foreground)",marginBottom:4}}>{tc.title}</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                    {(tc.factors??[]).map((f:string,i:number)=>(
                      <span key={i} style={{fontSize:10,color:"var(--muted-foreground)",background:"var(--secondary)",borderRadius:4,padding:"2px 7px",border:"1px solid var(--border)"}}>{f}</span>
                    ))}
                  </div>
                </div>
                <span style={{color:"var(--muted-foreground)",fontSize:12,flexShrink:0}}>{selCombo?.id===tc.id?"▾":"▸"}</span>
              </div>
              {selCombo?.id===tc.id&&(
                <div style={{padding:"0 16px 14px 44px",display:"flex",flexDirection:"column",gap:10}}>
                  <div style={{background:"rgba(248,113,113,0.07)",border:"1px solid rgba(248,113,113,0.2)",borderRadius:8,padding:"10px 12px",fontSize:11,color:"var(--foreground)",lineHeight:1.6}}>
                    <span style={{fontWeight:800,color:RED}}>⚡ Blast Radius: </span>{tc.blastRadius}
                  </div>
                  <div>
                    <div style={{fontSize:11,fontWeight:700,color:NAV,marginBottom:6}}>◆ Remediation Steps</div>
                    <div style={{display:"flex",flexDirection:"column",gap:5}}>
                      {(tc.remediation??[]).map((r:string,i:number)=>(
                        <div key={i} style={{display:"flex",gap:8,alignItems:"flex-start",fontSize:11,color:"var(--foreground)",lineHeight:1.5}}>
                          <span style={{flexShrink:0,width:18,height:18,borderRadius:"50%",background:`${NAV}18`,border:`1px solid ${NAV}33`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:800,color:NAV}}>{i+1}</span>
                          <span style={{fontFamily:"monospace",fontSize:10}}>{r}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{fontSize:10,color:"var(--muted-foreground)",background:"var(--secondary)",borderRadius:6,padding:"6px 10px",border:"1px solid var(--border)"}}>{tc.framework}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {showAttackPath&&<AttackPathModal onClose={()=>setShowAttackPath(false)}/>}
    </div>
  );
}

// ── Workload Scanning View ─────────────────────────────────────────────────────
function WorkloadScanView() {
  const [workloads, setWorkloads] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string|null>(null);
  const [showAttackPath, setShowAttackPath] = useState(false);
  useEffect(()=>{
    const tok=getStoredToken(); if(!tok) return;
    fetch('/api/cloudops/workload-scanning',{headers:{Authorization:`Bearer ${tok}`} as any}).then(r=>r.ok?r.json():[]).then(d=>Array.isArray(d)&&setWorkloads(d)).catch(()=>{});
  },[]);
  const totalCVEs = workloads.reduce((s,w)=>s+w.cveCount,0);
  const totalSecrets = workloads.reduce((s,w)=>s+w.secretsFound,0);
  const malwareCount = workloads.filter(w=>w.malware).length;
  const critWorkloads = workloads.filter(w=>w.risk==="Critical").length;
  const filtered = workloads.filter(w=>
    (riskFilter==="all"||w.risk===riskFilter)&&
    (typeFilter==="all"||w.type===typeFilter)&&
    (!search||w.name.toLowerCase().includes(search.toLowerCase())||w.service.toLowerCase().includes(search.toLowerCase()))
  );
  const rCol=(r:string)=>r==="Critical"?RED:r==="High"?AMB:r==="Medium"?BLU:EME;
  const typeIcon=(t:string)=>t==="instance"?"⚙":t==="k8s-cluster"?"⎈":t==="container-image"?"📦":t==="function"?"λ":"◎";
  const btnStyle=(active:boolean,col:string):React.CSSProperties=>({padding:"4px 10px",borderRadius:5,fontSize:10,fontWeight:700,cursor:"pointer",border:"none",fontFamily:"inherit",background:active?`${col}22`:"var(--secondary)",color:active?col:"var(--muted-foreground)",transition:"all 0.15s"});
  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
        <KpiCard label="Total Workloads"    value={workloads.length}  sub="Compute + containers" icon="🖥" />
        <KpiCard label="Critical Workloads" value={critWorkloads}     sub="Immediate risk"       color={RED} icon="⚠" />
        <KpiCard label="CVEs Detected"      value={totalCVEs}         sub="Across all workloads" color={AMB} icon="🐛" />
        <KpiCard label="Secrets Exposed"    value={totalSecrets}      sub={`${malwareCount} malware indicators`} color={malwareCount>0?RED:AMB} icon="🔐" />
      </div>
      {/* Attack path banner */}
      <div style={{background:`rgba(248,113,113,0.08)`,border:`1px solid rgba(248,113,113,0.25)`,borderRadius:10,padding:"12px 18px",display:"flex",alignItems:"center",gap:12}}>
        <span style={{fontSize:18}}>⚠️</span>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:800,color:RED}}>Workload → Database Compromise Path Detected</div>
          <div style={{fontSize:11,color:"var(--muted-foreground)",marginTop:2}}>fn-payments-processor stores plaintext DB credentials — exploitable via K8s lateral movement (CF-0021)</div>
        </div>
        <button onClick={()=>setShowAttackPath(true)} style={{padding:"7px 16px",borderRadius:8,border:`1px solid ${RED}44`,background:`rgba(248,113,113,0.12)`,color:RED,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>View Primary Path →</button>
      </div>
      <div style={card({padding:0,overflow:"hidden"})}>
        <div style={{padding:"14px 20px",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <div style={{fontSize:13,fontWeight:800,color:NAV}}>Workload CVE & Threat Scanner</div>
          <div style={{flex:1}}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search workload…" style={{padding:"4px 10px",borderRadius:5,border:"1px solid var(--border)",background:"var(--secondary)",color:"var(--foreground)",fontSize:11,fontFamily:"inherit",outline:"none",width:160}}/>
          <div style={{display:"flex",gap:4}}>
            {["all","Critical","High","Medium","Low"].map(r=>(
              <button key={r} style={btnStyle(riskFilter===r,rCol(r))} onClick={()=>setRiskFilter(r)}>{r==="all"?"All Risk":r}</button>
            ))}
          </div>
          <div style={{display:"flex",gap:4}}>
            {([["all","All"],["instance","VMs"],["k8s-cluster","K8s"],["container-image","Images"],["function","Functions"]] as [string,string][]).map(([v,l])=>(
              <button key={v} style={btnStyle(typeFilter===v,NAV)} onClick={()=>setTypeFilter(v)}>{l}</button>
            ))}
          </div>
        </div>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead>
            <tr style={{borderBottom:"2px solid rgba(255,255,255,0.08)"}}>
              {["Workload","Type","Provider","OS / Runtime","Risk","CVEs","Secrets","Malware","Patch","Last Scan",""].map(h=>(
                <th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:9,fontWeight:700,color:"var(--muted-foreground)",letterSpacing:"0.5px",textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(w=>{
              const rc=rCol(w.risk);
              const isExp=expandedId===w.id;
              return (
                <React.Fragment key={w.id}>
                  <tr onClick={()=>setExpandedId(isExp?null:w.id)} style={{borderBottom:"1px solid rgba(255,255,255,0.04)",cursor:"pointer",background:isExp?"rgba(147,197,253,0.04)":"transparent",transition:"background 0.12s"}}
                    onMouseEnter={e=>!isExp&&(e.currentTarget.style.background="rgba(147,197,253,0.03)") }
                    onMouseLeave={e=>!isExp&&(e.currentTarget.style.background="transparent")}>
                    <td style={{padding:"9px 12px"}}>
                      <div style={{fontSize:11,fontWeight:700,color:NAV,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{w.name}</div>
                      <div style={{fontSize:9,color:"var(--muted-foreground)"}}>{w.service} · {w.region}</div>
                    </td>
                    <td style={{padding:"9px 12px",whiteSpace:"nowrap"}}>
                      <span style={{fontSize:12}}>{typeIcon(w.type)}</span>
                      <span style={{fontSize:9,color:"var(--muted-foreground)",marginLeft:4}}>{w.type}</span>
                    </td>
                    <td style={{padding:"9px 12px"}}><span style={{fontSize:9,fontWeight:800,color:providerColors[w.provider],background:providerBg[w.provider],borderRadius:4,padding:"1px 6px"}}>{w.provider}</span></td>
                    <td style={{padding:"9px 12px",fontSize:9,color:"var(--muted-foreground)",maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{w.os}</td>
                    <td style={{padding:"9px 12px"}}><span style={{fontSize:9,fontWeight:700,color:rc,background:`${rc}18`,borderRadius:4,padding:"2px 7px",border:`1px solid ${rc}33`}}>{w.risk}</span></td>
                    <td style={{padding:"9px 12px",textAlign:"center"}}>
                      <span style={{fontSize:12,fontWeight:900,color:w.cveCount>0?RED:"var(--muted-foreground)",fontFamily:"monospace"}}>{w.cveCount}</span>
                      {w.critical>0&&<span style={{fontSize:8,color:RED,display:"block"}}>({w.critical} crit)</span>}
                    </td>
                    <td style={{padding:"9px 12px",textAlign:"center"}}>
                      <span style={{fontSize:12,fontWeight:900,color:w.secretsFound>0?AMB:"var(--muted-foreground)",fontFamily:"monospace"}}>{w.secretsFound}</span>
                    </td>
                    <td style={{padding:"9px 12px",textAlign:"center"}}>
                      {w.malware?<span style={{fontSize:11}}>🦠</span>:<span style={{fontSize:11,color:"rgba(255,255,255,0.2)"}}>—</span>}
                    </td>
                    <td style={{padding:"9px 12px"}}>
                      <span style={{fontSize:9,fontWeight:700,color:w.patchStatus==="Outdated"?AMB:EME,background:w.patchStatus==="Outdated"?"rgba(252,211,77,0.1)":"rgba(52,211,153,0.1)",borderRadius:4,padding:"2px 7px"}}>{w.patchStatus}</span>
                    </td>
                    <td style={{padding:"9px 12px",fontSize:9,color:"var(--muted-foreground)",whiteSpace:"nowrap"}}>{w.lastScanned}</td>
                    <td style={{padding:"9px 12px",color:NAV,fontSize:11}}>{isExp?"▾":"▸"}</td>
                  </tr>
                  {isExp&&(
                    <tr key={`${w.id}-exp`} style={{background:"rgba(6,10,18,0.4)"}}>
                      <td colSpan={11} style={{padding:"12px 20px 16px"}}>
                        {w.cves.length>0?(
                          <div>
                            <div style={{fontSize:11,fontWeight:700,color:NAV,marginBottom:8}}>CVE Details</div>
                            <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
                              <thead>
                                <tr style={{borderBottom:"1px solid var(--border)"}}>
                                  {["CVE ID","Severity","CVSS","Affected Component","Fix Version","Description"].map(h=>(
                                    <th key={h} style={{textAlign:"left",padding:"4px 10px",fontSize:9,fontWeight:700,color:"var(--muted-foreground)",textTransform:"uppercase"}}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {w.cves.map((cve:any)=>(
                                  <tr key={cve.id} style={{borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
                                    <td style={{padding:"6px 10px",fontFamily:"monospace",color:cve.severity==="Critical"?RED:AMB}}>{cve.id}</td>
                                    <td style={{padding:"6px 10px"}}><span style={{fontSize:9,fontWeight:700,color:rCol(cve.severity),background:`${rCol(cve.severity)}18`,borderRadius:3,padding:"1px 6px"}}>{cve.severity}</span></td>
                                    <td style={{padding:"6px 10px",fontFamily:"monospace",color:cve.cvss>=9?RED:cve.cvss>=7?AMB:BLU,fontWeight:700}}>{cve.cvss}</td>
                                    <td style={{padding:"6px 10px",fontFamily:"monospace",color:"var(--foreground)"}}>{cve.component}</td>
                                    <td style={{padding:"6px 10px",fontFamily:"monospace",color:EME}}>{cve.fixVersion}</td>
                                    <td style={{padding:"6px 10px",color:"var(--muted-foreground)",maxWidth:260,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cve.description}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ):(
                          <div style={{fontSize:11,color:"var(--muted-foreground)"}}>
                            {w.topFinding||"No CVEs detected — workload appears clean. "}
                            {w.secretsFound>0&&<span style={{color:AMB}}> ⚠ {w.secretsFound} secret(s) found in environment variables.</span>}
                            {w.malware&&<span style={{color:RED}}> 🦠 Malware indicator detected.</span>}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        {filtered.length===0&&<div style={{textAlign:"center",padding:"32px 0",color:"var(--muted-foreground)",fontSize:12}}>No workloads match the current filters.</div>}
      </div>
      {showAttackPath&&<AttackPathModal onClose={()=>setShowAttackPath(false)}/>}
    </div>
  );
}

// ── CSPM Tab ───────────────────────────────────────────────────────────────────
function CspmTab({ stats, apiFindings = [] }: { stats: any; apiFindings?: any[] }) {
  const [scoreHistory, setScoreHistory] = useState<number[]>([]);
  useEffect(() => { const tok = getStoredToken(); if (!tok) return; const H = { Authorization: `Bearer ${tok}` }; const fa = (url: string, set: (d: any[]) => void) => fetch(url, { headers: H as any }).then(r => r.ok ? r.json() : []).then((d: any[]) => Array.isArray(d) && d.length > 0 && set(d)).catch(() => {}); fa('/api/cloudops/score-history', setScoreHistory as any); }, []);
  const [cspmSubTab, setCspmSubTab] = useState("posture");
  const total = stats?.totalResources ?? ENT_TOTAL_RESOURCES;
  const compliant = stats?.compliantResources ?? (total - (stats?.findings?.open ?? ENT_OPEN_FINDINGS));
  const failed = total - compliant;
  const critFindings = stats?.findings?.critical ?? ENT_CRITICAL;
  const score = total > 0 ? Math.min(850, Math.round(300 + (compliant / total) * 550)) : 553;
  const compliancePct = total > 0 ? Math.round((compliant / total) * 100) : 81;
  const byProvider = stats?.byProvider ?? { AWS: 0, Azure: 0, GCP: 0 };
  const openFindings = stats?.findings?.open ?? ENT_OPEN_FINDINGS;

  // Map DB findings to display format; fall back to static demo data when DB is empty
  const displayFindings: typeof cspmTopFindings = apiFindings.length > 0
    ? apiFindings.map((f: any) => ({
        id:       f.findingId,
        resource: f.resourceId,
        region:   f.region ?? "",
        provider: f.provider as "AWS" | "Azure" | "GCP",
        sev:      f.severity as "Critical" | "High" | "Medium" | "Low",
        rule:     f.rule ?? f.title,
        status:   f.status as "open" | "in-remediation" | "resolved" | "suppressed",
        cat:      f.category ?? "",
        lastSeen: f.updatedAt ? new Date(f.updatedAt).toLocaleDateString() : "—",
      }))
    : cspmTopFindings;

  const [sevFilter, setSevFilter]       = useState<string>("all");
  const [provFilter, setProvFilter]     = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch]             = useState<string>("");
  const [selFinding, setSelFinding]     = useState<(typeof cspmTopFindings)[0] | null>(null);

  const byProviderCounts = {
    AWS:   { crit: displayFindings.filter(f => f.provider === "AWS"   && f.sev === "Critical").length,
             high: displayFindings.filter(f => f.provider === "AWS"   && f.sev === "High").length    },
    Azure: { crit: displayFindings.filter(f => f.provider === "Azure" && f.sev === "Critical").length,
             high: displayFindings.filter(f => f.provider === "Azure" && f.sev === "High").length    },
    GCP:   { crit: displayFindings.filter(f => f.provider === "GCP"   && f.sev === "Critical").length,
             high: displayFindings.filter(f => f.provider === "GCP"   && f.sev === "High").length    },
  };

  const filtered = displayFindings.filter(f =>
    (sevFilter    === "all" || f.sev      === sevFilter)    &&
    (provFilter   === "all" || f.provider === provFilter)   &&
    (statusFilter === "all" || f.status   === statusFilter) &&
    (!search || f.resource.toLowerCase().includes(search.toLowerCase()) ||
                f.rule.toLowerCase().includes(search.toLowerCase()))
  );

  const selDetail = selFinding ? (cspmFindingDetail[selFinding.id] ?? null) : null;

  const btnStyle = (active: boolean, col: string): React.CSSProperties => ({
    padding: "4px 10px", borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: "pointer", border: "none",
    fontFamily: "inherit", background: active ? `${col}22` : "var(--secondary)",
    color: active ? col : "var(--muted-foreground)", transition: "all 0.15s",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── CSPM Sub-tab nav ─────────────────────────────────── */}
      <div style={{ display: "flex", gap: 6, paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
        {[{k:"posture",l:"📊 Posture & Findings"},{k:"graph",l:"🕸 Security Graph"},{k:"workloads",l:"🛡 Workload Scanning"}].map(t => (
          <button key={t.k} onClick={() => setCspmSubTab(t.k)} style={{ padding: "6px 16px", borderRadius: 7, border: cspmSubTab === t.k ? `1px solid ${NAV}44` : "1px solid var(--border)", background: cspmSubTab === t.k ? `${NAV}14` : "transparent", color: cspmSubTab === t.k ? NAV : "var(--muted-foreground)", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>{t.l}</button>
        ))}
      </div>
      {cspmSubTab === "posture" && (<>
      {/* ── KPI Row ─────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12 }}>
        <KpiCard label="Total Resources"        value={total.toLocaleString()} sub="Across all clouds" icon="☁" />
        <KpiCard label="Passed"                 value={compliant.toLocaleString()} sub={`${compliancePct}% compliance rate`} color={EME} icon="✓" />
        <KpiCard label="Failed / Non-Compliant" value={failed.toLocaleString()} sub="Pending remediation" color={RED} icon="✗" />
        <KpiCard label="Critical Findings"      value={critFindings.toLocaleString()} sub="Immediate action" color={RED} icon="⚠" />
        <KpiCard label="High Findings"          value={(stats?.findings?.high ?? ENT_HIGH).toLocaleString()} sub="Remediate within 72h" color={AMB} icon="◎" />
      </div>

      {/* ── Charts Row ─────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr 200px", gap: 16 }}>
        <div style={card({ padding: 16, display: "flex", flexDirection: "column", alignItems: "center" })}>
          <div style={{ fontSize: 12, fontWeight: 700, color: NAV, marginBottom: 8 }}>Misconfig Score</div>
          <GaugeSVG value={score} />
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "center", marginTop: 8 }}>
            {([["300","500",RED],["501","700",AMB],["701","800",YEL],["801","850",EME]] as [string,string,string][]).map(([s,e,c]) => (
              <span key={s} style={{ fontSize: 9, fontWeight: 700, color: c, background: `${c}14`, borderRadius: 4, padding: "1px 5px" }}>{s}–{e}</span>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: "var(--muted-foreground)", textAlign: "center" }}>Higher is better</div>
        </div>

        <div style={card({ padding: 16 })}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", marginBottom: 8 }}>Findings by Provider</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(["AWS", "Azure", "GCP"] as const).map(p => {
                  const counts = byProviderCounts[p];
                  return (
                    <div key={p} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: "white", background: providerColors[p], borderRadius: 4, padding: "1px 6px", width: 40, textAlign: "center", flexShrink: 0 }}>{p}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", gap: 4, marginBottom: 2 }}>
                          <span style={{ fontSize: 9, color: RED, fontWeight: 700 }}>{counts.crit} crit</span>
                          <span style={{ fontSize: 9, color: AMB, fontWeight: 700 }}>{counts.high} high</span>
                        </div>
                        <div style={{ height: 5, background: "rgba(255,255,255,0.07)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: `${((counts.crit + counts.high) / 10) * 100}%`, height: "100%", background: `linear-gradient(90deg,${RED},${AMB})`, borderRadius: 3 }} />
                        </div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: RED, width: 22, textAlign: "right" }}>{counts.crit + counts.high}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", marginBottom: 8 }}>Compliance Trend</div>
              <Sparkline data={[78, 79, 80, 80, 79, 81, compliancePct - 3, compliancePct - 1, compliancePct - 1, compliancePct]} color={EME} w={120} h={44} />
              <div style={{ fontSize: 10, color: EME, marginTop: 4 }}>● {compliancePct}% compliant this scan</div>
            </div>
          </div>
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", marginBottom: 8 }}>Top Affected Services</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {cspmServices.map(s => {
                const max = cspmServices[0].n;
                const sc = sevColor[s.sev] ?? NAV;
                return (
                  <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, fontSize: 11, color: "var(--foreground)", fontWeight: 500 }}>{s.label}</div>
                    <div style={{ width: 100, height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
                      <div style={{ width: `${(s.n / max) * 100}%`, height: "100%", background: sc, borderRadius: 3 }} />
                    </div>
                    <span style={{ width: 28, fontSize: 11, fontWeight: 700, color: sc, textAlign: "right" }}>{s.n}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div style={card({ padding: 16 })}>
          <div style={{ fontSize: 12, fontWeight: 700, color: NAV, marginBottom: 12 }}>Findings by Severity</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { sev: "Critical", n: critFindings || ENT_CRITICAL, icon: "🔴" },
              { sev: "High",     n: stats?.findings?.high ?? ENT_HIGH,   icon: "🟠" },
              { sev: "Medium",   n: stats?.findings?.medium ?? ENT_MEDIUM, icon: "🟡" },
              { sev: "Low",      n: 180, icon: "🟢" },
            ].map(r => (
              <div key={r.sev} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12 }}>{r.icon}</span>
                <div style={{ flex: 1, fontSize: 11, color: "var(--foreground)" }}>{r.sev}</div>
                <div style={{ fontSize: 16, fontWeight: 900, color: sevColor[r.sev] ?? NAV, fontFamily: "monospace" }}>{r.n}</div>
              </div>
            ))}
          </div>
          <div style={{ borderTop: "1px solid var(--border)", marginTop: 12, paddingTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: NAV, marginBottom: 8 }}>Score History</div>
            <Sparkline data={scoreHistory} color={AMB} w={140} h={44} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--muted-foreground)", marginTop: 3 }}>
              <span>12 weeks ago</span><span>Today</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Findings Table ─────────────────────────────────── */}
      <div style={card({ padding: 16 })}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: NAV }}>CSPM Findings — {openFindings} Total · Showing {filtered.length} of {displayFindings.length}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search resource or rule…"
              style={{ padding: "4px 10px", borderRadius: 5, border: "1px solid var(--border)", background: "var(--secondary)", color: "var(--foreground)", fontSize: 11, fontFamily: "inherit", outline: "none", width: 180 }} />
            <div style={{ display: "flex", gap: 4 }}>
              {["all","Critical","High","Medium"].map(s => (
                <button key={s} style={btnStyle(sevFilter === s, s === "Critical" ? RED : s === "High" ? AMB : s === "Medium" ? BLU : NAV)} onClick={() => setSevFilter(s)}>{s === "all" ? "All Sev" : s}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {["all","AWS","Azure","GCP"].map(p => (
                <button key={p} style={btnStyle(provFilter === p, p === "all" ? NAV : providerColors[p])} onClick={() => setProvFilter(p)}>{p === "all" ? "All Cloud" : p}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {["all","open","in-remediation"].map(st => (
                <button key={st} style={btnStyle(statusFilter === st, st === "open" ? RED : st === "in-remediation" ? AMB : NAV)} onClick={() => setStatusFilter(st)}>{st === "all" ? "All Status" : statusLabel[st] ?? st}</button>
              ))}
            </div>
          </div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid rgba(255,255,255,0.08)" }}>
              {["ID","Severity","Resource","Region","Provider","Rule","Category","Status","Last Seen",""].map(h => (
                <th key={h} style={{ textAlign: "left", padding: "6px 10px", fontSize: 9, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.5px", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(f => (
              <tr key={f.id} onClick={() => setSelFinding(f)} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer", transition: "background 0.12s" }}
                onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "rgba(147,197,253,0.05)"}
                onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = "transparent"}>
                <td style={{ padding: "9px 10px", fontFamily: "monospace", fontSize: 9, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{f.id}</td>
                <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: sevColor[f.sev] ?? NAV, background: `${sevColor[f.sev] ?? NAV}18`, borderRadius: 4, padding: "2px 8px", border: `1px solid ${sevColor[f.sev] ?? NAV}33` }}>{f.sev}</span>
                </td>
                <td style={{ padding: "9px 10px", fontFamily: "monospace", fontSize: 9, color: NAV, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.resource}</td>
                <td style={{ padding: "9px 10px", fontSize: 9, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{f.region}</td>
                <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>
                  <span style={{ fontSize: 9, fontWeight: 800, color: providerColors[f.provider], background: providerBg[f.provider], borderRadius: 4, padding: "2px 7px" }}>{f.provider}</span>
                </td>
                <td style={{ padding: "9px 10px", fontSize: 10, color: "var(--foreground)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.rule}</td>
                <td style={{ padding: "9px 10px", fontSize: 9, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{f.cat}</td>
                <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: statusColor[f.status], background: `${statusColor[f.status]}18`, borderRadius: 4, padding: "2px 7px" }}>{statusLabel[f.status] ?? f.status}</span>
                </td>
                <td style={{ padding: "9px 10px", fontSize: 9, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{f.lastSeen}</td>
                <td style={{ padding: "9px 10px" }}><span style={{ color: NAV, fontSize: 11, cursor: "pointer" }}>→</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div style={{ textAlign: "center", padding: "32px 0", color: "var(--muted-foreground)", fontSize: 12 }}>No findings match the current filters.</div>}
      </div>

      {/* ── Finding Detail Side-Drawer ─────────────────────── */}
      {selFinding && (
        <div style={{ position: "fixed", inset: 0, zIndex: 7000, display: "flex", justifyContent: "flex-end" }} onClick={() => setSelFinding(null)}>
          <div style={{ width: 520, height: "100%", background: "var(--card)", borderLeft: "1px solid rgba(147,197,253,0.2)", padding: 24, overflowY: "auto", boxShadow: "-8px 0 48px rgba(0,0,0,0.6)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginBottom: 4, fontFamily: "monospace" }}>{selFinding.id}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "var(--foreground)", lineHeight: 1.4, marginBottom: 6 }}>{selFinding.rule}</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: sevColor[selFinding.sev], background: `${sevColor[selFinding.sev]}18`, borderRadius: 4, padding: "2px 8px", border: `1px solid ${sevColor[selFinding.sev]}33` }}>{selFinding.sev}</span>
                  <span style={{ fontSize: 9, fontWeight: 800, color: providerColors[selFinding.provider], background: providerBg[selFinding.provider], borderRadius: 4, padding: "2px 7px" }}>{selFinding.provider}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: statusColor[selFinding.status], background: `${statusColor[selFinding.status]}18`, borderRadius: 4, padding: "2px 7px" }}>{statusLabel[selFinding.status] ?? selFinding.status}</span>
                </div>
              </div>
              <button onClick={() => setSelFinding(null)} style={{ background: "none", border: "none", color: "var(--muted-foreground)", fontSize: 18, cursor: "pointer", padding: "0 4px", lineHeight: 1 }}>×</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
              {[
                { label: "Resource", value: selFinding.resource },
                { label: "Region",   value: selFinding.region },
                { label: "Category", value: selFinding.cat },
                { label: "Last Seen",value: selFinding.lastSeen },
              ].map(m => (
                <div key={m.label} style={{ background: "var(--secondary)", borderRadius: 8, padding: "10px 12px", border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 9, color: "var(--muted-foreground)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 3 }}>{m.label}</div>
                  <div style={{ fontSize: 10, color: "var(--foreground)", fontFamily: "monospace", wordBreak: "break-all" }}>{m.value}</div>
                </div>
              ))}
            </div>

            {selDetail && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: RED, marginBottom: 6 }}>⚠ Security Impact</div>
                <div style={{ background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 8, padding: "10px 12px", marginBottom: 16, fontSize: 11, color: "var(--foreground)", lineHeight: 1.6 }}>{selDetail.impact}</div>

                <div style={{ fontSize: 11, fontWeight: 700, color: NAV, marginBottom: 6 }}>◆ AI Remediation Steps</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                  {selDetail.aiRecs.map((rec, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "var(--secondary)", borderRadius: 7, padding: "9px 12px", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: "50%", background: i === 0 ? "rgba(248,113,113,0.15)" : i === 1 ? "rgba(252,211,77,0.12)" : "rgba(147,197,253,0.1)", border: `1px solid ${i === 0 ? "rgba(248,113,113,0.35)" : i === 1 ? "rgba(252,211,77,0.35)" : "rgba(147,197,253,0.3)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 800, color: i === 0 ? RED : i === 1 ? AMB : NAV }}>{i + 1}</span>
                      <span style={{ fontSize: 11, color: "var(--foreground)", lineHeight: 1.5 }}>{rec}</span>
                    </div>
                  ))}
                </div>

                <div style={{ fontSize: 11, fontWeight: 700, color: EME, marginBottom: 6 }}>⚙ IaC Fix (Terraform)</div>
                <pre style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 8, padding: "12px 14px", fontSize: 10, fontFamily: "monospace", color: EME, overflowX: "auto", lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: 16 }}>{selDetail.iacFix}</pre>

                <div style={{ fontSize: 11, fontWeight: 700, color: AMB, marginBottom: 6 }}>📋 Compliance Frameworks</div>
                <div style={{ background: "var(--secondary)", borderRadius: 7, padding: "10px 12px", fontSize: 11, color: "var(--foreground)", border: "1px solid var(--border)", marginBottom: 16 }}>{selDetail.framework}</div>
              </>
            )}
            {!selDetail && (
              <div style={{ background: "rgba(30,58,95,0.2)", border: "1px solid rgba(147,197,253,0.15)", borderRadius: 8, padding: "12px 14px", fontSize: 11, color: "var(--muted-foreground)" }}>
                No detailed remediation guide available for this finding yet. Contact your security team or open a remediation ticket.
              </div>
            )}
            <div style={{ paddingTop: 12, borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
              <button style={{ flex: 1, background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 8, padding: 10, fontSize: 11, fontWeight: 700, color: RED, cursor: "pointer", fontFamily: "inherit" }}>🔧 Create Remediation Ticket</button>
              <button style={{ flex: 1, background: "rgba(147,197,253,0.08)", border: "1px solid rgba(147,197,253,0.25)", borderRadius: 8, padding: 10, fontSize: 11, fontWeight: 700, color: NAV, cursor: "pointer", fontFamily: "inherit" }}>📤 Export Finding</button>
            </div>
          </div>
        </div>
      )}
      </>)}
      {cspmSubTab === "graph" && <SecurityGraphView />}
      {cspmSubTab === "workloads" && <WorkloadScanView />}
    </div>
  );
}

// ── SSPM Tab (rebuilt — enterprise-grade) ─────────────────────────────────────
// ── SSPM Identity Graph node types ─────────────────────────────────────────────
const IdentityUserNode = ({ data }: any) => {
  const c = ({ Critical: RED, High: AMB, Medium: BLU, Low: EME } as Record<string,string>)[data.risk] ?? "rgba(255,255,255,0.3)";
  return (
    <div style={{ background: "var(--card)", border: `2px solid ${c}`, borderRadius: 10, padding: "8px 12px", minWidth: 170, boxShadow: "0 2px 8px rgba(0,0,0,0.45)" }}>
      <Handle type="source" position={Position.Right} style={{ background: c, width: 8, height: 8, right: -5 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 26, height: 26, borderRadius: "50%", background: c + "22", border: `1.5px solid ${c}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 }}>{data.role === "Service Acct" ? "⚙" : "👤"}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{data.label}</div>
          <div style={{ fontSize: 9, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{data.role} · {data.appCount} apps</div>
        </div>
        <span style={{ fontSize: 9, fontWeight: 800, color: c, background: c + "22", borderRadius: 4, padding: "1px 5px", flexShrink: 0 }}>{data.risk}</span>
      </div>
    </div>
  );
};
const IdentityAppNode = ({ data }: any) => {
  const AC: Record<string,string> = { m365:"#0078D4",slack:"#4A154B",github:"#24292E",salesforce:"#00A1E0",jira:"#0052CC",okta:"#007DC1",box:"#0061D5",notion:"#1D1D1D",hubspot:"#FF7A59",zoom:"#2D8CFF",workday:"#F5821F" };
  const col = AC[data.appId] ?? "#6366F1";
  const rc = ({ Critical: RED, High: AMB, Medium: BLU, Low: EME } as Record<string,string>)[data.risk] ?? "rgba(255,255,255,0.25)";
  return (
    <div style={{ background: "var(--card)", border: `1px solid ${rc}55`, borderRadius: 10, padding: "8px 12px", minWidth: 140, boxShadow: "0 2px 8px rgba(0,0,0,0.45)" }}>
      <Handle type="target" position={Position.Left} style={{ background: rc, width: 8, height: 8, left: -5 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 26, height: 26, borderRadius: 6, background: col, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{(data.label?.[0] ?? "?").toUpperCase()}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{data.label}</div>
          <div style={{ fontSize: 9, color: "var(--muted-foreground)" }}>{(data.users ?? 0).toLocaleString()} users</div>
        </div>
      </div>
    </div>
  );
};
const SSPM_IDENTITY_NODE_TYPES = { identityUser: IdentityUserNode, identityApp: IdentityAppNode };

// ── SSPM Data Exposure Panel ────────────────────────────────────────────────────
function DataExposurePanel() {
  const [exposureData, setExposureData] = useState<any[]>([]);
  const [expandedApp, setExpandedApp] = useState<string|null>(null);
  const [sevFilter, setSevFilter] = useState("all");
  useEffect(() => {
    const tok = getStoredToken(); if (!tok) return;
    fetch("/api/cloudops/sspm-data-exposure", { headers: { Authorization: `Bearer ${tok}` } as any })
      .then(r => r.ok ? r.json() : []).then((d: any[]) => Array.isArray(d) && d.length > 0 && setExposureData(d)).catch(() => {});
  }, []);
  const totalExposed  = exposureData.reduce((s, a) => s + (a.exposedItems ?? 0), 0);
  const totalCritical = exposureData.reduce((s, a) => s + (a.criticalItems ?? 0), 0);
  const totalPublic   = exposureData.reduce((s, a) => s + (a.items ?? []).filter((i: any) => (i.sharedScope ?? "").toLowerCase().includes("public")).length, 0);
  const filtered      = sevFilter === "all" ? exposureData : exposureData.filter(a => a.risk === sevFilter);
  const SENS_COLOR: Record<string,string> = { Credentials: RED, PHI: RED, PII: AMB, Confidential: AMB };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        <KpiCard label="Apps with Exposure"   value={exposureData.length} sub="Sensitive data detected"       color={RED} icon="🔓" />
        <KpiCard label="Exposed Items"         value={totalExposed}        sub="Files, records & messages"    color={AMB} icon="📂" />
        <KpiCard label="Critical Exposures"   value={totalCritical}       sub="Credentials & PHI"            color={RED} icon="🚨" />
        <KpiCard label="Publicly Accessible"  value={totalPublic}         sub="No authentication required"   color={RED} icon="🌐" />
      </div>
      <div style={card({ padding: 16 })}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: NAV }}>Sensitive Data Exposure — {totalExposed} items across {exposureData.length} apps</div>
          <div style={{ display: "flex", gap: 6 }}>
            {["all","Critical","High","Medium"].map(f => (
              <button key={f} onClick={() => setSevFilter(f)} style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: "3px 9px", border: `1px solid ${sevFilter === f ? NAV : "rgba(255,255,255,0.15)"}`, background: sevFilter === f ? "rgba(147,197,253,0.2)" : "transparent", color: sevFilter === f ? NAV : "var(--muted-foreground)", cursor: "pointer", fontFamily: "inherit" }}>{f === "all" ? "All" : f}</button>
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 0.7fr 0.7fr 0.8fr 0.9fr 0.8fr", gap: 8, padding: "5px 12px", fontSize: 9, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.5px", borderBottom: "1px solid var(--border)", marginBottom: 4 }}>
          <span>APPLICATION</span><span>CATEGORY</span><span>ITEMS</span><span>CRITICAL</span><span>RISK</span><span>LAST FOUND</span><span></span>
        </div>
        {filtered.map((app: any) => (
          <Fragment key={app.id}>
            <div onClick={() => setExpandedApp(expandedApp === app.id ? null : app.id)}
              style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 0.7fr 0.7fr 0.8fr 0.9fr 0.8fr", gap: 8, padding: "9px 12px", borderRadius: 8, cursor: "pointer", border: `1px solid ${expandedApp === app.id ? NAV + "44" : "transparent"}`, background: expandedApp === app.id ? "rgba(147,197,253,0.05)" : "rgba(255,255,255,0.01)", marginBottom: 2, alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--foreground)" }}>{app.name}</span>
              <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{app.category}</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: AMB }}>{app.exposedItems}</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: app.criticalItems > 0 ? RED : "var(--muted-foreground)" }}>{app.criticalItems}</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: sevColor[app.risk] ?? "var(--muted-foreground)", background: `${sevColor[app.risk] ?? "var(--muted-foreground)"}22`, borderRadius: 4, padding: "2px 7px" }}>{app.risk}</span>
              <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{app.lastFound}</span>
              <span style={{ fontSize: 10, color: NAV, fontWeight: 700 }}>{expandedApp === app.id ? "▲ Collapse" : "▼ View items"}</span>
            </div>
            {expandedApp === app.id && (
              <div style={{ margin: "0 0 8px 20px", borderLeft: `2px solid ${NAV}44`, paddingLeft: 14 }}>
                {(app.items ?? []).map((item: any) => (
                  <div key={item.id} style={{ padding: "10px 14px", borderRadius: 8, background: `${SENS_COLOR[item.sensitivity] ?? BLU}08`, border: `1px solid ${SENS_COLOR[item.sensitivity] ?? BLU}2A`, marginBottom: 6 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: SENS_COLOR[item.sensitivity] ?? BLU, background: `${SENS_COLOR[item.sensitivity] ?? BLU}22`, borderRadius: 4, padding: "2px 7px", flexShrink: 0 }}>{item.sensitivity}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--foreground)", marginBottom: 4 }}>{item.location}</div>
                        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>🔗 <span style={{ color: (item.sharedScope ?? "").toLowerCase().includes("public") ? RED : AMB }}>{item.sharedScope}</span></span>
                          <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>👤 {item.owner}</span>
                          <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>🕐 {item.daysExposed}</span>
                          <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>📄 {item.itemType}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Fragment>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--muted-foreground)", fontSize: 13 }}>No data exposure findings match the selected filter.</div>
        )}
      </div>
    </div>
  );
}

// ── SSPM Identity Risk Panel ────────────────────────────────────────────────────
function IdentityRiskPanel() {
  const [graphData, setGraphData] = useState<any>({ userNodes: [], appNodes: [], edges: [] });
  const [oauthApps, setOauthApps] = useState<any[]>([]);
  const [anomalies,  setAnomalies]  = useState<any[]>([]);
  const [selNode,   setSelNode]    = useState<any>(null);
  const [loading,   setLoading]    = useState(true);
  useEffect(() => {
    const tok = getStoredToken(); if (!tok) return;
    const H = { Authorization: `Bearer ${tok}` } as any;
    const fa = (url: string) => fetch(url, { headers: H }).then(r => r.ok ? r.json() : null).catch(() => null);
    Promise.all([fa("/api/cloudops/sspm-identity-graph"), fa("/api/cloudops/sspm-oauth-apps"), fa("/api/cloudops/sspm-anomalies")])
      .then(([g, o, a]) => { if (g) setGraphData(g); if (Array.isArray(o)) setOauthApps(o); if (Array.isArray(a)) setAnomalies(a); setLoading(false); });
  }, []);

  const rfNodes = React.useMemo(() => [
    ...(graphData.userNodes ?? []).map((u: any, i: number) => ({ id: u.id, type: "identityUser", position: { x: 40, y: i * 104 + 20 }, data: u, selectable: true })),
    ...(graphData.appNodes ?? []).map((a: any, i: number) => ({ id: a.id, type: "identityApp",  position: { x: 700, y: i * 94 + 20 },  data: a, selectable: true })),
  ], [graphData]);

  const rfEdges = React.useMemo(() =>
    (graphData.edges ?? []).map((e: any) => ({
      id: e.id, source: e.source, target: e.target, type: "smoothstep",
      style: { stroke: ({ Critical: RED, High: AMB, Medium: BLU, Low: EME } as Record<string,string>)[e.risk] ?? "rgba(255,255,255,0.15)", strokeWidth: 1.2, opacity: 0.5 },
    })),
    [graphData.edges]
  );

  const [investigatedAnomaly, setInvestigatedAnomaly] = useState<any>(null);
  const [expandedOauth, setExpandedOauth] = useState<string|null>(null);
  const [anomalyStatuses, setAnomalyStatuses] = useState<Record<string,string>>({});

  const totalCrit   = (graphData.userNodes ?? []).filter((u: any) => u.risk === "Critical").length;
  const totalHigh   = (graphData.userNodes ?? []).filter((u: any) => u.risk === "High").length;
  const riskyOauth  = oauthApps.filter(o => o.risk === "Critical" || o.risk === "High").length;
  const openAnoms   = anomalies.filter(a => (anomalyStatuses[a.id] ?? a.status) === "open").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        <KpiCard label="Cross-App Users"       value={(graphData.userNodes ?? []).length} sub="Identities tracked across apps" color={NAV} icon="🕸" />
        <KpiCard label="Critical Identity Risk" value={totalCrit}   sub="Immediate action needed"       color={RED} icon="🔴" />
        <KpiCard label="High Risk Identities"  value={totalHigh}   sub="Review permissions"             color={AMB} icon="⚠" />
        <KpiCard label="Open Anomalies"         value={openAnoms}   sub="Behavioural alerts open"        color={AMB} icon="⚡" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16 }}>
        <div style={card({ height: 580, overflow: "hidden", display: "flex", flexDirection: "column" })}>
          <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: NAV }}>Cross-App Identity Risk Graph</span>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {([[RED,"Critical"],[AMB,"High"],[BLU,"Medium"],[EME,"Low"]] as [string,string][]).map(([c,l]) => (
                <div key={l} style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 7, height: 7, borderRadius: "50%", background: c }} /><span style={{ fontSize: 9, color: "var(--muted-foreground)" }}>{l}</span></div>
              ))}
              <span style={{ fontSize: 9, color: "var(--muted-foreground)", marginLeft: 4, opacity: 0.6 }}>Users (left) · Apps (right)</span>
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            {loading ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--muted-foreground)", fontSize: 13 }}>Loading identity graph…</div>
            ) : (
              <ReactFlow nodes={rfNodes} edges={rfEdges} nodeTypes={SSPM_IDENTITY_NODE_TYPES}
                onNodeClick={(_: any, node: any) => setSelNode(node.data)}
                fitView fitViewOptions={{ padding: 0.15 }} minZoom={0.2} maxZoom={2}>
                <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(255,255,255,0.04)" />
                <Controls showInteractive={false} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
              </ReactFlow>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", maxHeight: 580 }}>
          {selNode ? (
            <div style={card({ padding: 16 })}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "var(--foreground)", marginBottom: 2 }}>{selNode.label}</div>
                  <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{selNode.nodeType === "user" ? `${selNode.role} · ${selNode.dept}` : `${selNode.category} · ${(selNode.users ?? 0).toLocaleString()} users`}</div>
                </div>
                <button onClick={() => setSelNode(null)} style={{ background: "none", border: "none", color: "var(--muted-foreground)", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 2px" }}>×</button>
              </div>
              {selNode.nodeType === "user" && (
                <>
                  <div style={{ padding: "8px 12px", borderRadius: 8, background: `${sevColor[selNode.risk] ?? BLU}0F`, border: `1px solid ${sevColor[selNode.risk] ?? BLU}33`, marginBottom: 12 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: sevColor[selNode.risk] ?? BLU, marginBottom: 3, letterSpacing: "0.5px" }}>RISK REASON</div>
                    <div style={{ fontSize: 11, color: "var(--foreground)", lineHeight: 1.5 }}>{selNode.riskReason}</div>
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: NAV, marginBottom: 8, letterSpacing: "0.5px" }}>PERMISSION FOOTPRINT — {(selNode.apps ?? []).length} APPS</div>
                  {(selNode.apps ?? []).map((appId: string) => (
                    <div key={appId} style={{ marginBottom: 8, padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: NAV, marginBottom: 5 }}>{appId.toUpperCase()}</div>
                      {(selNode.permissions?.[appId] ?? []).map((p: string, i: number) => (
                        <div key={i} style={{ fontSize: 10, color: (p.toLowerCase().includes("admin") || p.includes("*") || p.toLowerCase().includes("all")) ? RED : "var(--muted-foreground)", display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                          <span style={{ fontSize: 8 }}>•</span>{p}
                        </div>
                      ))}
                    </div>
                  ))}
                </>
              )}
              {selNode.nodeType === "app" && (
                <>
                  <div style={{ fontSize: 10, fontWeight: 700, color: NAV, marginBottom: 8, letterSpacing: "0.5px" }}>USERS WITH ACCESS</div>
                  {(graphData.userNodes ?? []).filter((u: any) => (u.apps ?? []).includes(selNode.appId)).map((u: any) => {
                    const c = sevColor[u.risk] ?? "var(--muted-foreground)";
                    return (
                      <div key={u.id} onClick={() => setSelNode(u)} style={{ marginBottom: 6, padding: "8px 10px", borderRadius: 8, background: c + "08", border: `1px solid ${c}2A`, cursor: "pointer" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div><div style={{ fontSize: 11, fontWeight: 700, color: "var(--foreground)" }}>{u.label}</div><div style={{ fontSize: 9, color: "var(--muted-foreground)" }}>{u.role}</div></div>
                          <span style={{ fontSize: 9, fontWeight: 800, color: c, background: c + "22", borderRadius: 4, padding: "1px 5px" }}>{u.risk}</span>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          ) : (
            <div style={card({ padding: 16 })}>
              <div style={{ fontSize: 11, fontWeight: 700, color: NAV, marginBottom: 8 }}>IDENTITY RISK SUMMARY</div>
              <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 12, lineHeight: 1.55 }}>Click any user or app node to inspect their permission footprint and risk details.</div>
              {([[RED,"Critical"],[AMB,"High"],[BLU,"Medium"],[EME,"Low"]] as [string,string][]).map(([color, risk]) => {
                const count = (graphData.userNodes ?? []).filter((u: any) => u.risk === risk).length;
                return count > 0 ? (
                  <div key={risk} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", borderRadius: 8, background: color + "0A", border: `1px solid ${color}33`, marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color }}>{risk} Risk</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color }}>{count}</span>
                  </div>
                ) : null;
              })}
            </div>
          )}
        </div>
      </div>

      <div style={card({ padding: 16 })}>
        <div style={{ fontSize: 12, fontWeight: 700, color: NAV, marginBottom: 12 }}>Third-Party OAuth App Grants — {oauthApps.filter(o => o.risk === "Critical").length} Critical · {oauthApps.filter(o => o.risk === "High").length} High</div>
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr 0.55fr 0.7fr 1fr", gap: 8, padding: "5px 10px", fontSize: 9, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.5px", borderBottom: "1px solid var(--border)", marginBottom: 4 }}>
          <span>APP NAME</span><span>CONNECTED TO</span><span>INSTALLS</span><span>RISK</span><span>PERMISSIONS</span>
        </div>
        {oauthApps.map((o: any) => {
          const isExpanded = expandedOauth === o.id;
          const riskC = sevColor[o.risk] ?? "var(--muted-foreground)";
          const riskFlagSet = new Set((o.riskFlags ?? []).map((f: string) => f.toLowerCase()));
          return (
            <Fragment key={o.id}>
              <div onClick={() => setExpandedOauth(isExpanded ? null : o.id)}
                style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr 0.55fr 0.7fr 1fr", gap: 8, padding: "8px 10px", borderRadius: 6, marginBottom: 2, alignItems: "center", cursor: "pointer", background: isExpanded ? riskC + "08" : (o.risk === "Critical" || o.risk === "High") ? `${riskC}04` : "transparent", border: `1px solid ${isExpanded ? riskC + "44" : (o.risk === "Critical" || o.risk === "High") ? `${riskC}22` : "transparent"}` }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--foreground)" }}>{o.name}</span>
                <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{o.connectedTo}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: NAV }}>{(o.installCount ?? 0).toLocaleString()}</span>
                <span style={{ fontSize: 9, fontWeight: 800, color: riskC, background: riskC + "22", borderRadius: 4, padding: "2px 7px", width: "fit-content" }}>{o.risk}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {(o.riskFlags ?? []).length > 0
                    ? <span style={{ fontSize: 9, color: RED }}>{(o.riskFlags ?? []).length} risky perm{(o.riskFlags ?? []).length > 1 ? "s" : ""}</span>
                    : <span style={{ fontSize: 9, color: EME }}>No risky perms</span>}
                  <span style={{ fontSize: 9, color: NAV, marginLeft: "auto" }}>{isExpanded ? "▲" : "▼ scopes"}</span>
                </div>
              </div>
              {isExpanded && (
                <div style={{ margin: "0 0 6px 20px", borderLeft: `2px solid ${riskC}44`, paddingLeft: 14, paddingBottom: 6 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: NAV, marginBottom: 6, letterSpacing: "0.5px" }}>GRANTED SCOPES ({(o.scopes ?? []).length})</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                    {(o.scopes ?? []).map((s: string, i: number) => {
                      const sLower = s.toLowerCase();
                      const isRisky = Array.from(riskFlagSet).some(f => sLower.includes(f.toLowerCase().substring(0, 10)));
                      return (
                        <span key={i} style={{ fontSize: 9, color: isRisky ? RED : "var(--muted-foreground)", background: isRisky ? "rgba(248,113,113,0.12)" : "rgba(255,255,255,0.07)", borderRadius: 4, padding: "2px 7px", border: `1px solid ${isRisky ? "rgba(248,113,113,0.3)" : "rgba(255,255,255,0.1)"}` }}>
                          {isRisky ? "⚠ " : ""}{s}
                        </span>
                      );
                    })}
                  </div>
                  {(o.riskFlags ?? []).length > 0 && (
                    <>
                      <div style={{ fontSize: 10, fontWeight: 700, color: RED, marginBottom: 5, letterSpacing: "0.5px" }}>RISK FLAGS</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {(o.riskFlags ?? []).map((f: string, i: number) => (
                          <span key={i} style={{ fontSize: 9, color: RED, background: "rgba(248,113,113,0.15)", borderRadius: 4, padding: "2px 8px", border: "1px solid rgba(248,113,113,0.3)", fontWeight: 700 }}>🚨 {f}</span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </Fragment>
          );
        })}
      </div>

      {investigatedAnomaly && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={(e: any) => { if (e.target === e.currentTarget) setInvestigatedAnomaly(null); }}>
          <div style={{ background: "var(--card)", border: `1px solid ${sevColor[investigatedAnomaly.severity] ?? "var(--border)"}55`, borderRadius: 16, padding: 28, width: 580, maxWidth: "90vw", maxHeight: "80vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
              <div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 9, fontWeight: 800, color: sevColor[investigatedAnomaly.severity], background: sevColor[investigatedAnomaly.severity] + "22", borderRadius: 4, padding: "2px 8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>{investigatedAnomaly.severity}</span>
                  <span style={{ fontSize: 9, color: NAV, background: "rgba(147,197,253,0.12)", borderRadius: 4, padding: "2px 8px" }}>{investigatedAnomaly.app}</span>
                  <span style={{ fontSize: 9, color: AMB }}>{investigatedAnomaly.user}</span>
                </div>
                <div style={{ fontSize: 17, fontWeight: 800, color: "var(--foreground)" }}>{investigatedAnomaly.type}</div>
                <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 3 }}>ID: {investigatedAnomaly.id} · Detected {new Date(investigatedAnomaly.detectedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</div>
              </div>
              <button onClick={() => setInvestigatedAnomaly(null)} style={{ background: "none", border: "none", color: "var(--muted-foreground)", cursor: "pointer", fontSize: 22, lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>×</button>
            </div>

            <div style={{ padding: "12px 16px", borderRadius: 10, background: `${sevColor[investigatedAnomaly.severity]}0C`, border: `1px solid ${sevColor[investigatedAnomaly.severity]}33`, marginBottom: 18 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: sevColor[investigatedAnomaly.severity], marginBottom: 6, letterSpacing: "0.5px" }}>EVENT DETAILS</div>
              <div style={{ fontSize: 12, color: "var(--foreground)", lineHeight: 1.7 }}>{investigatedAnomaly.event}</div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: NAV, marginBottom: 10, letterSpacing: "0.5px" }}>INVESTIGATION CHECKLIST</div>
              {[
                { step: "Confirm user identity", desc: "Verify the account hasn't been compromised — check MFA logs and recent sign-in locations." },
                { step: "Review session activity", desc: `Check ${investigatedAnomaly.app} audit log for all actions in this session window.` },
                { step: "Assess blast radius", desc: "Determine what data, systems, or accounts the user had access to at the time." },
                { step: "Contain if malicious", desc: "Suspend account, revoke OAuth tokens, and rotate any exposed credentials." },
                { step: "Document & close", desc: "Record findings, add timeline notes, and set status to Resolved or Escalate." },
              ].map((item: any, i: number) => (
                <div key={i} style={{ display: "flex", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(147,197,253,0.15)", border: "1px solid rgba(147,197,253,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: NAV, flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--foreground)", marginBottom: 2 }}>{item.step}</div>
                    <div style={{ fontSize: 10, color: "var(--muted-foreground)", lineHeight: 1.5 }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 10, fontWeight: 700, color: NAV, marginBottom: 10, letterSpacing: "0.5px" }}>UPDATE STATUS</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(["open","investigating","resolved"] as string[]).map(s => {
                const cur = anomalyStatuses[investigatedAnomaly.id] ?? investigatedAnomaly.status;
                const sc = s === "open" ? AMB : s === "investigating" ? BLU : EME;
                return (
                  <button key={s} onClick={() => { setAnomalyStatuses((p: any) => ({ ...p, [investigatedAnomaly.id]: s })); setInvestigatedAnomaly({ ...investigatedAnomaly, status: s }); }}
                    style={{ padding: "8px 18px", fontSize: 11, fontWeight: 700, borderRadius: 8, border: `1px solid ${cur === s ? sc : "rgba(255,255,255,0.18)"}`, background: cur === s ? sc + "22" : "transparent", color: cur === s ? sc : "var(--muted-foreground)", cursor: "pointer", fontFamily: "inherit" }}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                );
              })}
              <button onClick={() => setInvestigatedAnomaly(null)} style={{ padding: "8px 18px", fontSize: 11, fontWeight: 700, borderRadius: 8, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "var(--muted-foreground)", cursor: "pointer", fontFamily: "inherit", marginLeft: "auto" }}>Close</button>
            </div>
          </div>
        </div>
      )}

      <div style={card({ padding: 16 })}>
        <div style={{ fontSize: 12, fontWeight: 700, color: NAV, marginBottom: 12 }}>SaaS Behavioral Anomalies — {openAnoms} open</div>
        {anomalies.map((a: any) => {
          const c = sevColor[a.severity] ?? "var(--muted-foreground)";
          const curStatus = anomalyStatuses[a.id] ?? a.status;
          return (
            <div key={a.id} style={{ padding: "11px 14px", borderRadius: 8, border: `1px solid ${c}2A`, background: c + "07", marginBottom: 8 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: c, background: c + "22", borderRadius: 4, padding: "2px 7px", flexShrink: 0, marginTop: 2 }}>{a.severity}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--foreground)" }}>{a.type}</span>
                    <span style={{ fontSize: 9, color: NAV, background: "rgba(147,197,253,0.12)", borderRadius: 4, padding: "1px 6px" }}>{a.app}</span>
                    <span style={{ fontSize: 9, color: AMB }}>{a.user}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.5, marginBottom: 3 }}>{a.event}</div>
                  <div style={{ fontSize: 9, color: "var(--muted-foreground)" }}>{new Date(a.detectedAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end", flexShrink: 0 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: curStatus === "open" ? AMB : curStatus === "investigating" ? BLU : EME, background: curStatus === "open" ? "rgba(252,211,77,0.15)" : curStatus === "investigating" ? "rgba(96,165,250,0.15)" : "rgba(52,211,153,0.15)", borderRadius: 4, padding: "2px 7px", whiteSpace: "nowrap" }}>{curStatus}</span>
                  {curStatus !== "resolved" && (
                    <button onClick={() => setInvestigatedAnomaly({ ...a, status: curStatus })}
                      style={{ fontSize: 10, fontWeight: 700, color: NAV, background: "rgba(147,197,253,0.12)", border: "1px solid rgba(147,197,253,0.3)", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                      🔍 Investigate
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SspmTab() {
  const [sspmSubTab, setSspmSubTab] = useState("overview");
  const [oauthRiskyApps, setOauthRiskyApps] = useState<any[]>([]);
  const [sspmApps,       setSspmApps]        = useState<any[]>([]);
  useEffect(() => { const tok = getStoredToken(); if (!tok) return; const H = { Authorization: `Bearer ${tok}` }; const fa = (url: string, set: (d: any[]) => void) => fetch(url, { headers: H as any }).then(r => r.ok ? r.json() : []).then((d: any[]) => Array.isArray(d) && d.length > 0 && set(d)).catch(() => {}); fa('/api/cloudops/oauth-risky-apps', setOauthRiskyApps); fa('/api/cloudops/sspm-apps', setSspmApps); }, []);
  const [selAppId, setSelAppId] = useState<string | null>("m365");
  const [issueFilter, setIssueFilter] = useState<string>("all");
  const [oauthOpen, setOauthOpen] = useState(false);
  const selApp = sspmApps.find(a => a.id === selAppId) || sspmApps[0];
  const totalUsers   = sspmApps.reduce((s,a) => s + (a.users ?? 0), 0);
  const totalCrit    = sspmApps.reduce((s,a) => s + (a.crit ?? 0), 0);
  const totalShadow  = sspmApps.reduce((s,a) => s + (a.shadow ?? 0), 0);
  const avgMfa       = sspmApps.length > 0 ? Math.round(sspmApps.reduce((s,a) => s + (a.mfaPct ?? 0), 0) / sspmApps.length) : 0;
  const highRiskApps = sspmApps.filter(a => a.risk === "High" || a.risk === "Critical").length;
  const sevColors: Record<string,string> = { Critical: RED, High: AMB, Medium: BLU, Low: EME };

  const filteredIssues = (selApp?.issues ?? []).filter((i: any) => issueFilter === "all" || i.sev === issueFilter);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {([{key:"overview",label:"Overview"},{key:"exposure",label:"📂 Data Exposure"},{key:"identity",label:"🕸 Identity Risk"}]).map((st: {key:string;label:string}) => (
          <button key={st.key} onClick={() => setSspmSubTab(st.key)}
            style={{ padding: "7px 16px", fontSize: 11, fontWeight: 700, borderRadius: 8, border: `1px solid ${sspmSubTab === st.key ? NAV : "rgba(255,255,255,0.15)"}`, background: sspmSubTab === st.key ? "rgba(147,197,253,0.2)" : "transparent", color: sspmSubTab === st.key ? NAV : "var(--muted-foreground)", cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
            {st.label}
          </button>
        ))}
      </div>
      {sspmSubTab === "exposure" && <DataExposurePanel />}
      {sspmSubTab === "identity" && <IdentityRiskPanel />}
      {sspmSubTab === "overview" && (<Fragment>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12 }}>
        <KpiCard label="SaaS Apps Monitored"  value={sspmApps.length}         sub={`${highRiskApps} high-risk apps`}  color={highRiskApps >= 4 ? AMB : EME} icon="⬡" />
        <KpiCard label="Total SaaS Users"     value={`${(totalUsers/1000).toFixed(0)}K`} sub={`Across all ${sspmApps.length} apps`} icon="👥" />
        <KpiCard label="Critical Findings"    value={String(totalCrit)}       sub="Require immediate action"        color={RED} icon="⚠" />
        <KpiCard label="Avg MFA Coverage"     value={`${avgMfa}%`}            sub={`${100-avgMfa}% gap remaining`}  color={avgMfa >= 85 ? EME : RED} icon="🔐" />
        <KpiCard label="Shadow Accounts"      value={String(totalShadow)}     sub="Orphaned / former employees"     color={AMB} icon="👻" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={card({ padding: 14 })}>
            <div style={{ fontSize: 11, fontWeight: 700, color: NAV, marginBottom: 10, letterSpacing: "0.5px" }}>CONNECTED APPLICATIONS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {sspmApps.map(app => {
                const sel = selAppId === app.id;
                const riskColor = app.risk === "High" || app.risk === "Critical" ? RED : app.risk === "Medium" ? AMB : EME;
                return (
                  <div key={app.id} onClick={() => setSelAppId(app.id)}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, cursor: "pointer",
                      border: `1px solid ${sel ? app.color + "88" : "rgba(255,255,255,0.06)"}`,
                      background: sel ? `${app.color}18` : "transparent" }}>
                    <div style={{ width: 28, height: 28, borderRadius: 6, background: app.color, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{app.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{app.name}</div>
                      <div style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{app.users.toLocaleString()} users · {app.crit + app.high + app.med} findings</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: riskColor }}>{app.score}</span>
                      {app.crit > 0 && <span style={{ fontSize: 8, background: "rgba(248,113,113,0.15)", color: RED, borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}>{app.crit}C</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={card({ padding: 14 })}>
            <div style={{ fontSize: 11, fontWeight: 700, color: NAV, marginBottom: 8, letterSpacing: "0.5px" }}>RISKY OAUTH APPS</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>Across all 12 apps</span>
              <button onClick={() => setOauthOpen(v => !v)} style={{ fontSize: 10, color: NAV, background: "none", border: "none", cursor: "pointer", fontWeight: 700, fontFamily: "inherit" }}>{oauthOpen ? "▲ Hide" : "▼ Show all"}</button>
            </div>
            {(oauthOpen ? oauthRiskyApps : oauthRiskyApps.slice(0,3)).map((o,i) => (
              <div key={i} style={{ marginBottom: 8, padding: "7px 9px", borderRadius: 6, background: "rgba(255,255,255,0.03)", border: `1px solid ${o.risk === "Critical" ? RED+"44" : o.risk === "High" ? AMB+"44" : "rgba(255,255,255,0.08)"}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "var(--foreground)", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.app}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: sevColors[o.risk], background: `${sevColors[o.risk]}22`, borderRadius: 4, padding: "1px 5px", flexShrink: 0 }}>{o.risk}</span>
                </div>
                <div style={{ fontSize: 9, color: "var(--muted-foreground)", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.scope}</div>
                <div style={{ fontSize: 9, color: "var(--muted-foreground)" }}>{(o.users ?? 0).toLocaleString()} users · {o.installed ?? ""}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {selApp && (
            <>
              <div style={card({ padding: 16 })}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: selApp.color, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 900, fontSize: 18, flexShrink: 0 }}>{selApp.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "var(--foreground)" }}>{selApp.name}</div>
                    <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>Security Posture Score: <span style={{ fontWeight: 800, color: selApp.score >= 75 ? EME : selApp.score >= 60 ? AMB : RED }}>{selApp.score}/100</span></div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: selApp.risk === "High" ? RED : selApp.risk === "Medium" ? AMB : EME, background: selApp.risk === "High" ? "rgba(248,113,113,0.15)" : "rgba(252,211,77,0.15)", borderRadius: 6, padding: "4px 10px" }}>{selApp.risk} Risk</span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 10, marginBottom: 14 }}>
                  {[
                    { l:"Users",        v: selApp.users.toLocaleString(),  c: NAV  },
                    { l:"Admins",       v: String(selApp.admins),          c: AMB  },
                    { l:"MFA Coverage", v: `${selApp.mfaPct}%`,            c: selApp.mfaPct >= 85 ? EME : RED },
                    { l:"External",     v: selApp.extUsers.toLocaleString(),c: AMB  },
                    { l:"OAuth Apps",   v: String(selApp.oauthApps),       c: AMB  },
                    { l:"API Tokens",   v: String(selApp.apiTokens),       c: selApp.apiTokens > 100 ? AMB : EME },
                  ].map(m => (
                    <div key={m.l} style={{ textAlign: "center", padding: "8px 4px", background: "rgba(255,255,255,0.03)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: m.c, fontFamily: "monospace" }}>{m.v}</div>
                      <div style={{ fontSize: 9, color: "var(--muted-foreground)", marginTop: 2 }}>{m.l}</div>
                    </div>
                  ))}
                </div>

                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.5px" }}>MFA ADOPTION TREND</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: selApp.mfaPct >= 85 ? EME : RED }}>{selApp.mfaPct}% current</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 36 }}>
                    {selApp.mfaTrend.map((v,i) => (
                      <div key={i} style={{ flex: 1, background: i === selApp.mfaTrend.length-1 ? EME : `rgba(52,211,153,${0.3 + (i/selApp.mfaTrend.length)*0.5})`, borderRadius: "3px 3px 0 0", height: `${(v/100)*100}%`, minHeight: 4 }} />
                    ))}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--muted-foreground)", marginTop: 2 }}>
                    <span>Jan</span><span>Dec</span>
                  </div>
                </div>
              </div>

              <div style={card({ padding: 16 })}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: NAV }}>{selApp.name} — Security Findings ({(selApp.issues ?? []).length})</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {["all","Critical","High","Medium"].map(f => (
                      <button key={f} onClick={() => setIssueFilter(f)} style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: "3px 9px", border: `1px solid ${issueFilter === f ? NAV : "rgba(255,255,255,0.15)"}`, background: issueFilter === f ? "rgba(147,197,253,0.2)" : "transparent", color: issueFilter === f ? NAV : "var(--muted-foreground)", cursor: "pointer", fontFamily: "inherit" }}>{f === "all" ? "All" : f}</button>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {filteredIssues.map(issue => (
                    <div key={issue.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "9px 12px", borderRadius: 8, border: `1px solid ${sevColors[issue.sev]}33`, background: `${sevColors[issue.sev]}0A` }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: sevColors[issue.sev], background: `${sevColors[issue.sev]}22`, borderRadius: 4, padding: "2px 7px", flexShrink: 0, marginTop: 1 }}>{issue.sev}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--foreground)", marginBottom: 2 }}>{issue.title}</div>
                        <div style={{ fontSize: 10, color: "var(--muted-foreground)" }}>Category: {issue.cat}</div>
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 700, color: issue.status === "open" ? AMB : EME, background: issue.status === "open" ? "rgba(252,211,77,0.15)" : "rgba(52,211,153,0.15)", borderRadius: 4, padding: "2px 7px", flexShrink: 0, whiteSpace: "nowrap" }}>{issue.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div style={card({ padding: 16 })}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: NAV }}>MFA Coverage Across All Applications</div>
          <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>Target: ≥95% | CIS Benchmark</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sspmApps.map(app => (
            <div key={app.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 100, display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <div style={{ width: 20, height: 20, borderRadius: 5, background: app.color, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 800, fontSize: 10 }}>{app.icon}</div>
                <span style={{ fontSize: 10, fontWeight: 600, color: "var(--foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{app.name.split(" ")[0]}</span>
              </div>
              <div style={{ flex: 1, height: 14, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${app.mfaPct}%`, background: app.mfaPct >= 90 ? EME : app.mfaPct >= 75 ? AMB : RED, borderRadius: 4, position: "relative" }}>
                  {app.mfaPct >= 15 && <span style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", fontSize: 9, fontWeight: 700, color: "rgba(0,0,0,0.7)" }}>{app.mfaPct}%</span>}
                </div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color: app.mfaPct >= 90 ? EME : app.mfaPct >= 75 ? AMB : RED, width: 36, textAlign: "right", flexShrink: 0 }}>{app.mfaPct}%</span>
              <span style={{ fontSize: 9, color: "var(--muted-foreground)", width: 60, textAlign: "right", flexShrink: 0 }}>{app.users.toLocaleString()} users</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 12, padding: "10px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
          {[{ l:"≥90% (OK)", c:EME }, { l:"75–90% (Warning)", c:AMB }, { l:"<75% (At Risk)", c:RED }].map(l => (
            <div key={l.l} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: l.c }} />
              <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{l.l}</span>
            </div>
          ))}
        </div>
      </div>
      </Fragment>)}
    </div>
  );
}

// ── CIEM Tab ──────────────────────────────────────────────────────────────────
function CiemTab() {
  const [ciemClouds, setCiemClouds] = useState<any[]>([]);
  useEffect(() => {
    const tok = getStoredToken(); if (!tok) return;
    fetch("/api/cloudops/ciem-clouds", { headers: { Authorization: `Bearer ${tok}` } as any })
      .then(r => r.ok ? r.json() : [])
      .then((d: any[]) => {
        if (!Array.isArray(d) || d.length === 0) return;
        const provColors: Record<string,string> = { AWS:"#FF9900", Azure:"#0078D4", GCP:"#4285F4" };
        const provIcons:  Record<string,string> = { AWS:"☁", Azure:"⚡", GCP:"●" };
        setCiemClouds(d.map((c: any) => {
          const total     = c.identities ?? c.resources ?? 0;
          const excessive = c.excessivePermissions ?? 0;
          return {
            ...c,
            name:     c.provider,
            total,
            excessive,
            unused:   Math.round(total * 0.28),
            machine:  Math.round(total * 0.22),
            color:    provColors[c.provider] ?? "#6B7280",
            icon:     provIcons[c.provider]  ?? "☁",
          };
        }));
      }).catch(() => {});
  }, []);
  const totalIdentities  = ciemClouds.reduce((s, c) => s + (c.identities ?? 0), 0);
  const totalExcessive   = ciemClouds.reduce((s, c) => s + (c.overPriv    ?? 0), 0);
  const totalUnused90    = ciemClouds.reduce((s, c) => s + (c.unused90d   ?? 0), 0);
  const totalMachines    = ciemClouds.reduce((s, c) => s + (c.machines    ?? 0), 0);
  const totalCrossRisks  = ciemClouds.reduce((s, c) => s + (c.criticalRisk ?? 0), 0);
  const riskColor = (r: string) => ({ Critical: RED, High: AMB, Medium: YEL, Low: BLU }[r] ?? "var(--muted-foreground)");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12 }}>
        <KpiCard label="Total Identities" value={totalIdentities.toLocaleString()} sub="Human + Machine" icon="🔑" />
        <KpiCard label="Excessive Permissions" value={totalExcessive.toLocaleString()} sub={`${ciemClouds.length > 0 ? Math.round((totalExcessive/totalIdentities)*100) : 0}% of identities`} color={RED} icon="⚠" />
        <KpiCard label="Unused 90+ Days" value={totalUnused90.toLocaleString()} sub="Candidates for removal" color={AMB} icon="⏱" />
        <KpiCard label="Cross-Account Risks" value={totalCrossRisks} sub="Lateral movement paths" color={RED} icon="↔" />
        <KpiCard label="Machine Identities" value={totalMachines.toLocaleString()} sub="Service accounts & roles" color={PRP} icon="⚙" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={card({ padding: 16 })}>
          <div style={{ fontSize: 12, fontWeight: 700, color: NAV, marginBottom: 14 }}>Entitlement Exposure by Cloud</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {ciemClouds.map(c => {
              const excessPct = Math.round((c.excessive / c.total) * 100);
              const unusedPct = Math.round((c.unused / c.total) * 100);
              return (
                <div key={c.name} style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: c.color, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 900, fontSize: 16 }}>{c.icon}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "var(--foreground)" }}>{c.name}</div>
                      <div style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{c.total.toLocaleString()} identities</div>
                    </div>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: RED, background: "rgba(248,113,113,0.1)", borderRadius: 4, padding: "2px 7px" }}>{excessPct}% excess</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: AMB, background: "rgba(252,211,77,0.1)", borderRadius: 4, padding: "2px 7px" }}>{unusedPct}% unused</span>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                    {[["Total", c.total, "var(--foreground)"], ["Excessive", c.excessive, RED], ["Unused", c.unused, AMB], ["Machine", c.machine, PRP]].map(([l, v, col]) => (
                      <div key={String(l)} style={{ textAlign: "center", padding: "6px 4px", background: "rgba(255,255,255,0.02)", borderRadius: 6 }}>
                        <div style={{ fontSize: 16, fontWeight: 900, color: col as string, fontFamily: "monospace" }}>{v}</div>
                        <div style={{ fontSize: 9, color: "var(--muted-foreground)", marginTop: 2 }}>{l}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ height: 7, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden", display: "flex" }}>
                    <div style={{ width: `${excessPct}%`, background: RED, transition: "width 0.6s" }} />
                    <div style={{ width: `${unusedPct}%`, background: AMB, opacity: 0.7 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={card({ padding: 16 })}>
            <div style={{ fontSize: 12, fontWeight: 700, color: NAV, marginBottom: 12 }}>High-Risk Identities — Excessive Permissions</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {excessivePerms.map((p, i) => (
                <div key={i} style={{ border: `1px solid ${riskColor(p.risk)}33`, borderRadius: 8, padding: "10px 12px", background: p.risk === "Critical" ? "rgba(248,113,113,0.06)" : p.risk === "High" ? "rgba(252,211,77,0.04)" : "var(--card)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                    <div style={{ fontWeight: 700, color: "var(--foreground)", wordBreak: "break-all", fontFamily: "monospace", fontSize: 10 }}>{p.identity}</div>
                    <span style={{ background: riskColor(p.risk) + "20", color: riskColor(p.risk), border: `1px solid ${riskColor(p.risk)}44`, borderRadius: 4, padding: "1px 7px", fontSize: 10, fontWeight: 700, flexShrink: 0, marginLeft: 8 }}>{p.risk}</span>
                  </div>
                  <div style={{ display: "flex", gap: 12, fontSize: 10, color: "var(--muted-foreground)" }}>
                    <span>☁ {p.cloud}</span>
                    <span>🔑 {p.type}</span>
                    <span style={{ color: p.unusedDays > 90 ? RED : AMB }}>⏱ {p.unusedDays}d unused</span>
                    <span>📋 {p.perms} perms</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={card({ padding: 16 })}>
            <div style={{ fontSize: 12, fontWeight: 700, color: NAV, marginBottom: 12 }}>Permission Usage Age</div>
            {[
              { label: "Used last 30 days",  n: 847, color: EME, pct: 30 },
              { label: "31–60 days",          n: 412, color: YEL, pct: 14 },
              { label: "61–90 days",          n: 341, color: AMB, pct: 12 },
              { label: "90–180 days",         n: 523, color: RED, pct: 18 },
              { label: "180+ days (stale)",   n: 724, color: "var(--muted-foreground)", pct: 25 },
            ].map(r => (
              <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <div style={{ width: 120, fontSize: 11, color: "var(--foreground)", flexShrink: 0 }}>{r.label}</div>
                <div style={{ flex: 1, height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 4 }}>
                  <div style={{ width: `${r.pct}%`, height: "100%", background: r.color, borderRadius: 4 }} />
                </div>
                <div style={{ width: 32, fontSize: 11, fontWeight: 700, color: r.color, textAlign: "right" }}>{r.n}</div>
                <div style={{ width: 26, fontSize: 10, color: "var(--muted-foreground)" }}>{r.pct}%</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Container Security Tab ─────────────────────────────────────────────────────
function CnspmTab() {
  const [selCluster, setSelCluster] = useState<string | null>(null);
  const [cnspmStats, setCnspmStats] = useState<any>({ clusters:0, clustersCritical:0, totalNodes:0, runningPods:0, podsHealthyPct:0, vulnImages:0, vulnImagesCritical:0, runtimeThreats:0, secretsExposed:0 });
  useEffect(() => {
    const tok = getStoredToken();
    if (!tok) return;
    fetch("/api/cloudops/cnspm-stats", { headers: { Authorization: `Bearer ${tok}` } as any })
      .then(r => r.ok ? r.json() : null).then((d: any) => d && setCnspmStats(d)).catch(() => {});
  }, []);
  const sc = (s: string) => ({ Healthy: EME, Degraded: AMB, Critical: RED }[s] ?? "var(--muted-foreground)");
  const rc = (r: string) => ({ Critical: RED, High: AMB, Medium: YEL, Low: BLU }[r] ?? "var(--muted-foreground)");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 12 }}>
        <KpiCard label="Clusters" value={cnspmStats.clusters} sub={`${cnspmStats.clustersCritical} critical`} icon="⚙" />
        <KpiCard label="Total Nodes" value={cnspmStats.totalNodes} sub="Across all clusters" icon="□" />
        <KpiCard label="Running Pods" value={cnspmStats.runningPods.toLocaleString()} sub={`${cnspmStats.podsHealthyPct}% healthy`} icon="●" />
        <KpiCard label="Vuln Images" value={cnspmStats.vulnImages} sub={`${cnspmStats.vulnImagesCritical} critical`} color={RED} icon="📦" />
        <KpiCard label="Runtime Threats" value={cnspmStats.runtimeThreats} sub="Active" color={RED} icon="⚠" />
        <KpiCard label="Secrets Exposed" value={cnspmStats.secretsExposed} sub="In container envs" color={AMB} icon="🔐" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={card({ padding: 16 })}>
          <div style={{ fontSize: 12, fontWeight: 700, color: NAV, marginBottom: 12 }}>Cluster Security Posture — Click to Inspect</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {clusters.map(c => (
              <div key={c.name} onClick={() => setSelCluster(selCluster === c.name ? null : c.name)}
                style={{ border: `1px solid ${sc(c.status)}33`, borderRadius: 10, padding: "10px 14px", cursor: "pointer", background: selCluster === c.name ? `${sc(c.status)}12` : c.status === "Critical" ? "rgba(248,113,113,0.04)" : c.status === "Degraded" ? "rgba(252,211,77,0.04)" : "rgba(255,255,255,0.01)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: selCluster === c.name ? 10 : 0 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--foreground)" }}>{c.name}</div>
                    <div style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{c.provider} · {c.namespaces} namespaces</div>
                  </div>
                  <span style={{ background: sc(c.status) + "20", color: sc(c.status), borderRadius: 5, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{c.status}</span>
                </div>
                {selCluster === c.name && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                    {[["Nodes", c.nodes, NAV], ["Pods", c.pods, BLU], ["Vulns", c.vulns, c.vulns > 30 ? RED : c.vulns > 10 ? AMB : EME], ["Compliant", c.vulns === 0 ? "✓" : "✗", c.vulns === 0 ? EME : RED]].map(([l, v, col]) => (
                      <div key={String(l)} style={{ textAlign: "center", padding: "6px 4px", background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: col as string }}>{v}</div>
                        <div style={{ fontSize: 9, color: "var(--muted-foreground)" }}>{l}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={card({ padding: 16 })}>
            <div style={{ fontSize: 12, fontWeight: 700, color: NAV, marginBottom: 12 }}>Top Vulnerable Container Images</div>
            {topVulnImages.map((img, i) => (
              <div key={i} style={{ border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: "9px 12px", marginBottom: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--foreground)", fontFamily: "monospace" }}>{img.image}</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    {img.critical > 0 && <span style={{ background: RED + "18", color: RED, borderRadius: 4, padding: "1px 6px", fontSize: 9, fontWeight: 700 }}>{img.critical}C</span>}
                    {img.high > 0 && <span style={{ background: AMB + "18", color: AMB, borderRadius: 4, padding: "1px 6px", fontSize: 9, fontWeight: 700 }}>{img.high}H</span>}
                    {img.medium > 0 && <span style={{ background: YEL + "18", color: "#92400E", borderRadius: 4, padding: "1px 6px", fontSize: 9, fontWeight: 700 }}>{img.medium}M</span>}
                  </div>
                </div>
                <div style={{ height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden", display: "flex", marginBottom: 3 }}>
                  <div style={{ width: `${(img.critical / img.vulns) * 100}%`, background: RED }} />
                  <div style={{ width: `${(img.high / img.vulns) * 100}%`, background: AMB }} />
                  <div style={{ width: `${(img.medium / img.vulns) * 100}%`, background: YEL }} />
                </div>
                <div style={{ fontSize: 9, color: "var(--muted-foreground)" }}>Age: {img.age} · {img.vulns} total CVEs</div>
              </div>
            ))}
          </div>

          <div style={card({ padding: 16 })}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: NAV }}>Runtime Threat Detections</div>
              <span style={{ background: "rgba(248,113,113,0.1)", color: RED, borderRadius: 5, padding: "2px 10px", fontSize: 10, fontWeight: 700 }}>{runtimeThreats.length} ACTIVE</span>
            </div>
            {runtimeThreats.map((t, i) => (
              <div key={i} style={{ border: `1px solid ${rc(t.sev)}33`, borderRadius: 8, padding: "9px 12px", marginBottom: 6, background: t.sev === "Critical" ? "rgba(248,113,113,0.06)" : "rgba(255,255,255,0.01)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 3 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--foreground)" }}>{t.threat}</span>
                  <span style={{ background: rc(t.sev) + "20", color: rc(t.sev), borderRadius: 4, padding: "1px 7px", fontSize: 10, fontWeight: 700, flexShrink: 0, marginLeft: 8 }}>{t.sev}</span>
                </div>
                <div style={{ fontSize: 10, color: "var(--muted-foreground)" }}>
                  <span style={{ fontFamily: "monospace" }}>{t.container}</span> · {t.time}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Attack Surface Management Tab ─────────────────────────────────────────────
function AttackSurfaceTab() {
  const [exposedAssets, setExposedAssets] = useState<any[]>([]);
  const [certExpiries, setCertExpiries] = useState<any[]>([]);
  useEffect(() => {
    const tok = getStoredToken(); if (!tok) return;
    const H = { Authorization: `Bearer ${tok}` };
    fetch('/api/cloudops/exposed-assets', { headers: H as any })
      .then(r => r.ok ? r.json() : [])
      .then((d: any[]) => {
        if (!Array.isArray(d) || d.length === 0) return;
        setExposedAssets(d.map((a: any) => ({
          ...a,
          host:   a.name ?? a.host ?? a.resourceId ?? "unknown",
          ip:     a.ip   ?? a.region ?? "—",
          ports:  Array.isArray(a.ports) ? a.ports : (a.service ? [a.service] : ["443"]),
          type:   a.type ?? a.resourceType ?? "resource",
          shadow: a.shadow ?? false,
          finding:a.finding ?? a.exposure ?? "Publicly accessible",
          sev:    a.sev    ?? a.risk ?? "Medium",
          certs:  a.certs  ?? 90,
        })));
      }).catch(() => {});
    fetch('/api/cloudops/cert-expiries', { headers: H as any })
      .then(r => r.ok ? r.json() : [])
      .then((d: any[]) => {
        if (!Array.isArray(d) || d.length === 0) return;
        setCertExpiries(d.map((c: any) => ({
          ...c,
          expiry: c.expiry ?? new Date(Date.now() + (c.daysLeft ?? 90) * 86400000).toLocaleDateString("en-GB"),
          status: c.status ?? (c.daysLeft <= 7 ? "critical" : c.daysLeft <= 30 ? "urgent" : "valid"),
        })));
      }).catch(() => {});
  }, []);
  const [sel, setSel] = useState<string | null>(null);
  const sevColors: Record<string,string> = { Critical:RED, High:AMB, Medium:BLU, Low:EME };
  const selAsset = exposedAssets.find(a => a.id === sel);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12 }}>
        <KpiCard label="External Assets" value={String(exposedAssets.length)} sub="Internet-facing hosts" icon="🌐" />
        <KpiCard label="Critical Exposures" value={String(exposedAssets.filter(a => a.sev === "Critical").length)} sub="Immediate closure needed" color={RED} icon="⚠" />
        <KpiCard label="Shadow IT Assets" value={String(exposedAssets.filter(a => a.shadow).length)} sub="Unmanaged exposures" color={RED} icon="👻" />
        <KpiCard label="Expiring Certs" value={String(certExpiries.filter(c => c.daysLeft <= 30).length)} sub="Within 30 days" color={AMB} icon="🔒" />
        <KpiCard label="Open Ports" value={String(exposedAssets.reduce((s,a) => s + (a.ports?.length ?? 0), 0))} sub="Exposed globally" color={AMB} icon="🔌" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>
        <div style={card({ padding: 16 })}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: NAV }}>External Attack Surface — Internet-Facing Assets</div>
            <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>Click row to inspect</span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead><tr style={{ borderBottom: "2px solid rgba(255,255,255,0.08)" }}>
              {["Asset","IP","Ports","Type","Shadow","Finding","Severity"].map(h => (
                <th key={h} style={{ textAlign:"left", padding:"6px 10px", fontSize:9, fontWeight:700, color:"var(--muted-foreground)", letterSpacing:"0.5px", textTransform:"uppercase" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {exposedAssets.map(a => (
                <tr key={a.id} onClick={() => setSel(sel === a.id ? null : a.id)}
                  style={{ borderBottom:"1px solid rgba(255,255,255,0.05)", cursor:"pointer",
                    background: sel === a.id ? "rgba(147,197,253,0.08)" : a.shadow ? "rgba(248,113,113,0.04)" : "transparent" }}
                  onMouseEnter={e => { if (sel !== a.id) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; }}
                  onMouseLeave={e => { if (sel !== a.id) (e.currentTarget as HTMLElement).style.background = a.shadow ? "rgba(248,113,113,0.04)" : "transparent"; }}>
                  <td style={{ padding:"9px 10px", fontFamily:"monospace", fontSize:10, color:"var(--foreground)", fontWeight:600 }}>{a.host}</td>
                  <td style={{ padding:"9px 10px", fontFamily:"monospace", fontSize:10, color:"var(--muted-foreground)" }}>{a.ip}</td>
                  <td style={{ padding:"9px 10px" }}><div style={{ display:"flex", gap:3, flexWrap:"wrap" }}>{a.ports.map(p => <span key={p} style={{ fontSize:8, fontFamily:"monospace", background:"rgba(255,255,255,0.08)", borderRadius:3, padding:"1px 5px", color:"var(--foreground)" }}>{p}</span>)}</div></td>
                  <td style={{ padding:"9px 10px", fontSize:10, color:"var(--muted-foreground)" }}>{a.type}</td>
                  <td style={{ padding:"9px 10px" }}>{a.shadow && <span style={{ fontSize:8, fontWeight:700, color:RED, background:"rgba(248,113,113,0.15)", borderRadius:4, padding:"1px 6px" }}>SHADOW</span>}</td>
                  <td style={{ padding:"9px 10px", fontSize:10, color:"var(--foreground)", maxWidth:180, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{a.finding}</td>
                  <td style={{ padding:"9px 10px" }}><span style={{ fontSize:9, fontWeight:700, color:sevColors[a.sev], background:`${sevColors[a.sev]}22`, borderRadius:4, padding:"2px 8px" }}>{a.sev}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {selAsset && (
            <div style={{ marginTop:12, padding:"14px 16px", background:"rgba(147,197,253,0.06)", borderRadius:8, border:"1px solid rgba(147,197,253,0.2)" }}>
              <div style={{ fontSize:11, fontWeight:800, color:NAV, marginBottom:8 }}>{selAsset.host} — Detail</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
                {[["IP Address",selAsset.ip,NAV],["Asset Type",selAsset.type,"var(--foreground)"],["Cert Expiry",`${selAsset.certs}d`,selAsset.certs <= 14 ? RED : selAsset.certs <= 30 ? AMB : EME],["Shadow IT",selAsset.shadow ? "YES" : "No",selAsset.shadow ? RED : EME]].map(([l,v,c]) => (
                  <div key={String(l)} style={{ textAlign:"center", padding:"8px 6px", background:"rgba(255,255,255,0.04)", borderRadius:6 }}>
                    <div style={{ fontSize:13, fontWeight:800, color:c as string, fontFamily:"monospace" }}>{v}</div>
                    <div style={{ fontSize:9, color:"var(--muted-foreground)", marginTop:2 }}>{l}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop:10, fontSize:11, color:"var(--foreground)", fontWeight:600 }}>⚠ {selAsset.finding}</div>
            </div>
          )}
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <div style={card({ padding:14 })}>
            <div style={{ fontSize:11, fontWeight:700, color:NAV, marginBottom:10, letterSpacing:"0.5px" }}>CERTIFICATE EXPIRY MONITOR</div>
            {certExpiries.map(c => (
              <div key={c.domain} style={{ marginBottom:8, padding:"8px 10px", borderRadius:7, border:`1px solid ${c.status==="expired" ? RED+"66" : c.status==="urgent" ? AMB+"55" : "rgba(255,255,255,0.07)"}`, background:c.status==="expired" ? "rgba(248,113,113,0.07)" : c.status==="urgent" ? "rgba(252,211,77,0.06)" : "transparent" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:3 }}>
                  <span style={{ fontSize:10, fontWeight:700, color:"var(--foreground)", fontFamily:"monospace" }}>{c.domain}</span>
                  <span style={{ fontSize:9, fontWeight:700, color:c.status==="expired" ? RED : c.status==="urgent" ? AMB : EME, background:`${c.status==="expired" ? RED : c.status==="urgent" ? AMB : EME}22`, borderRadius:4, padding:"1px 6px" }}>{c.daysLeft <= 0 ? "EXPIRED" : `${c.daysLeft}d`}</span>
                </div>
                <div style={{ fontSize:9, color:"var(--muted-foreground)" }}>{c.issuer} · {c.expiry}</div>
              </div>
            ))}
          </div>

          <div style={card({ padding:14 })}>
            <div style={{ fontSize:11, fontWeight:700, color:NAV, marginBottom:10, letterSpacing:"0.5px" }}>EXPOSURE SCORE BY TYPE</div>
            {[
              { type:"API Gateways",    exposed:3, risk:"High"   },
              { type:"Dev/Staging",     exposed:2, risk:"Critical"},
              { type:"Admin Panels",    exposed:1, risk:"Critical"},
              { type:"CI/CD Systems",   exposed:1, risk:"Critical"},
              { type:"Monitoring",      exposed:2, risk:"High"   },
              { type:"Storage Buckets", exposed:1, risk:"Critical"},
            ].map(t => (
              <div key={t.type} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:7 }}>
                <div style={{ flex:1, fontSize:10, color:"var(--foreground)", fontWeight:500 }}>{t.type}</div>
                <span style={{ fontSize:9, fontWeight:700, color:sevColors[t.risk], background:`${sevColors[t.risk]}22`, borderRadius:4, padding:"1px 7px" }}>{t.risk}</span>
                <span style={{ fontSize:10, fontWeight:800, color:"var(--foreground)", width:16, textAlign:"right" }}>{t.exposed}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={card({ padding:16 })}>
        <div style={{ fontSize:12, fontWeight:700, color:NAV, marginBottom:12 }}>Top Attack Paths — Visualized Risk Chains</div>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {topAttackPaths.map(ap => (
            <div key={ap.id} style={{ display:"flex", gap:12, alignItems:"flex-start", padding:"11px 14px", borderRadius:8, border:`1px solid ${sevColors[ap.sev]}33`, background:`${sevColors[ap.sev]}08` }}>
              <span style={{ fontSize:9, fontWeight:700, color:sevColors[ap.sev], background:`${sevColors[ap.sev]}22`, borderRadius:4, padding:"2px 8px", flexShrink:0, marginTop:1 }}>{ap.sev}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12, fontWeight:700, color:"var(--foreground)", marginBottom:4, fontFamily:"monospace" }}>{ap.title}</div>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  {ap.impacted.map((i,idx) => (
                    <span key={i} style={{ fontSize:10, color:"var(--foreground)" }}>
                      <span style={{ background:"rgba(255,255,255,0.08)", borderRadius:4, padding:"2px 8px", fontWeight:600 }}>{i}</span>
                      {idx < ap.impacted.length-1 && <span style={{ color:RED, margin:"0 4px" }}>→</span>}
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ textAlign:"right", flexShrink:0 }}>
                <div style={{ fontSize:13, fontWeight:800, color:sevColors[ap.sev], fontFamily:"monospace" }}>CVSS {ap.cvss}</div>
                <div style={{ fontSize:9, color:"var(--muted-foreground)", marginTop:2 }}>{Array.isArray(ap.steps) ? ap.steps.length : ap.steps}-step path</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Threat Intelligence Tab ────────────────────────────────────────────────────
function ThreatIntelTab() {
  const [iocFeed, setIocFeed] = useState<any[]>([]);
  const [cvwatchlist, setCvwatchlist] = useState<any[]>([]);
  const [mitreCloud, setMitreCloud] = useState<any[]>([]);
  useEffect(() => { const tok = getStoredToken(); if (!tok) return; const H = { Authorization: `Bearer ${tok}` }; const fa = (url: string, set: (d: any[]) => void) => fetch(url, { headers: H as any }).then(r => r.ok ? r.json() : []).then((d: any[]) => Array.isArray(d) && d.length > 0 && set(d)).catch(() => {}); fa('/api/cloudops/ioc-feed', setIocFeed); fa('/api/cloudops/cv-watchlist', setCvwatchlist); fa('/api/cloudops/mitre-cloud', setMitreCloud); }, []);
  const [selTactic, setSelTactic] = useState<string | null>(null);
  const sevColors: Record<string,string> = { Critical:RED, High:AMB, Medium:BLU, Low:EME };
  const iocTypeColors: Record<string,string> = { IP:"#7C3AED", Domain:"#0891B2", Hash:"#059669", CVE:RED };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12 }}>
        <KpiCard label="Active IOC Matches" value={String(iocFeed.filter(i => i.matched).length)} sub="In your environment" color={RED} icon="🎯" />
        <KpiCard label="CVEs to Patch" value={String(cvwatchlist.filter(c => c.status !== "Patch Applied").length)} sub={`${cvwatchlist.filter(c => c.exploited).length} actively exploited`} color={RED} icon="🛡" />
        <KpiCard label="Threat Actors" value={String(new Set(iocFeed.map(i => i.actor)).size)} sub="Nation-state + criminal" color={AMB} icon="🕵" />
        <KpiCard label="MITRE Techniques" value={String(mitreCloud.reduce((s,t) => s + t.techniques.length, 0))} sub="Cloud ATT&CK coverage" color={NAV} icon="⚔" />
        <KpiCard label="Threat Events (24h)" value={iocFeed.length > 0 ? iocFeed.filter((i: any) => i.matched).length * 47 : 0} sub="Active detections" color={AMB} icon="📡" />
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 340px", gap:16 }}>
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <div style={card({ padding:16 })}>
            <div style={{ fontSize:12, fontWeight:700, color:NAV, marginBottom:12 }}>Live IOC Feed — Active Threat Indicators</div>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {iocFeed.map(ioc => (
                <div key={ioc.id} style={{ display:"flex", gap:12, alignItems:"flex-start", padding:"10px 12px", borderRadius:8,
                  border:`1px solid ${ioc.matched ? sevColors[ioc.confidence >= 90 ? "Critical" : "High"]+"44" : "rgba(255,255,255,0.07)"}`,
                  background:ioc.matched ? "rgba(248,113,113,0.06)" : "transparent" }}>
                  <div style={{ display:"flex", flexDirection:"column", gap:4, flexShrink:0 }}>
                    <span style={{ fontSize:9, fontWeight:700, color:iocTypeColors[ioc.type] ?? NAV, background:`${iocTypeColors[ioc.type] ?? NAV}22`, borderRadius:4, padding:"1px 6px" }}>{ioc.type}</span>
                    {ioc.matched && <span style={{ fontSize:8, fontWeight:700, color:RED, background:"rgba(248,113,113,0.15)", borderRadius:4, padding:"1px 6px" }}>MATCH</span>}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:11, fontFamily:"monospace", fontWeight:700, color:"var(--foreground)", marginBottom:2 }}>{ioc.indicator}</div>
                    <div style={{ fontSize:10, color:"var(--muted-foreground)", marginBottom:2 }}>{ioc.desc}</div>
                    {ioc.matched && <div style={{ fontSize:10, color:AMB, fontWeight:600 }}>Matched: <span style={{ fontFamily:"monospace" }}>{ioc.resource}</span></div>}
                  </div>
                  <div style={{ textAlign:"right", flexShrink:0 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:"var(--foreground)" }}>{ioc.actor}</div>
                    <div style={{ fontSize:9, color:"var(--muted-foreground)", marginTop:2 }}>Conf: {ioc.confidence}%</div>
                    <div style={{ fontSize:9, color:"var(--muted-foreground)" }}>{ioc.lastSeen}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={card({ padding:16 })}>
            <div style={{ fontSize:12, fontWeight:700, color:NAV, marginBottom:12 }}>CVE Watchlist — Exploited in the Wild</div>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
              <thead><tr style={{ borderBottom:"2px solid rgba(255,255,255,0.08)" }}>
                {["CVE","CVSS","EPSS","Product","Affected","Status","Exploited"].map(h => (
                  <th key={h} style={{ textAlign:"left", padding:"6px 10px", fontSize:9, fontWeight:700, color:"var(--muted-foreground)", letterSpacing:"0.5px", textTransform:"uppercase" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {cvwatchlist.map(c => (
                  <tr key={c.id} style={{ borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
                    <td style={{ padding:"9px 10px", fontFamily:"monospace", fontSize:10, color:NAV, fontWeight:700 }}>{c.id}</td>
                    <td style={{ padding:"9px 10px" }}><span style={{ fontWeight:800, color:c.cvss >= 9 ? RED : c.cvss >= 7 ? AMB : EME, fontFamily:"monospace", fontSize:12 }}>{c.cvss}</span></td>
                    <td style={{ padding:"9px 10px", fontFamily:"monospace", fontSize:10, color:parseFloat(c.epss) >= 90 ? RED : AMB, fontWeight:700 }}>{c.epss}</td>
                    <td style={{ padding:"9px 10px", fontSize:10, color:"var(--foreground)" }}>{c.product}</td>
                    <td style={{ padding:"9px 10px", fontSize:11, fontWeight:800, color:c.affected > 5 ? RED : AMB, textAlign:"center" }}>{c.affected}</td>
                    <td style={{ padding:"9px 10px" }}><span style={{ fontSize:9, fontWeight:700, color:c.status==="Patch Applied" ? EME : c.status==="Mitigated" ? EME : c.status==="Open" ? RED : AMB, background:`${c.status==="Patch Applied"||c.status==="Mitigated" ? EME : c.status==="Open" ? RED : AMB}22`, borderRadius:4, padding:"2px 8px" }}>{c.status}</span></td>
                    <td style={{ padding:"9px 10px" }}>{c.exploited ? <span style={{ fontSize:9, fontWeight:700, color:RED, background:"rgba(248,113,113,0.15)", borderRadius:4, padding:"2px 8px" }}>⚡ YES</span> : <span style={{ fontSize:9, color:"var(--muted-foreground)" }}>—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <div style={card({ padding:14 })}>
            <div style={{ fontSize:11, fontWeight:700, color:NAV, marginBottom:10, letterSpacing:"0.5px" }}>MITRE ATT&CK — CLOUD COVERAGE</div>
            <div style={{ fontSize:9, color:"var(--muted-foreground)", marginBottom:10 }}>Cloud Matrix · Enterprise v14</div>
            {mitreCloud.map(t => (
              <div key={t.tactic} onClick={() => setSelTactic(selTactic === t.tactic ? null : t.tactic)}
                style={{ marginBottom:6, borderRadius:7, overflow:"hidden", border:`1px solid ${sevColors[t.sev]}33`, cursor:"pointer" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 10px", background:`${sevColors[t.sev]}10` }}>
                  <span style={{ fontSize:10, fontWeight:700, color:"var(--foreground)" }}>{t.tactic}</span>
                  <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                    <span style={{ fontSize:12, fontWeight:800, color:sevColors[t.sev], fontFamily:"monospace" }}>{t.count}</span>
                    <span style={{ fontSize:8, fontWeight:700, color:sevColors[t.sev], background:`${sevColors[t.sev]}22`, borderRadius:3, padding:"1px 5px" }}>{t.sev}</span>
                  </div>
                </div>
                {selTactic === t.tactic && (
                  <div style={{ padding:"8px 10px", background:"rgba(255,255,255,0.03)" }}>
                    {t.techniques.map(tech => (
                      <div key={tech} style={{ fontSize:9, color:"var(--muted-foreground)", marginBottom:3, fontFamily:"monospace" }}>· {tech}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Workload Protection (CWPP) Tab ─────────────────────────────────────────────
function CwppTab() {
  const [cwppHosts, setCwppHosts] = useState<any[]>([]);
  const [cwppAnomalies, setCwppAnomalies] = useState<any[]>([]);
  useEffect(() => { const tok = getStoredToken(); if (!tok) return; const H = { Authorization: `Bearer ${tok}` }; const fa = (url: string, set: (d: any[]) => void) => fetch(url, { headers: H as any }).then(r => r.ok ? r.json() : []).then((d: any[]) => Array.isArray(d) && d.length > 0 && set(d)).catch(() => {}); fa('/api/cloudops/cwpp-hosts', setCwppHosts); fa('/api/cloudops/cwpp-anomalies', setCwppAnomalies); }, []);
  const [sel, setSel] = useState<string | null>(null);
  const sevColors: Record<string,string> = { Critical:RED, High:AMB, Medium:BLU, Low:EME };
  const covered  = cwppHosts.filter(h => h.agent).length;
  const uncovered = cwppHosts.filter(h => !h.agent).length;
  const critHosts = cwppHosts.filter(h => h.risk === "Critical").length;
  const totalThreats = cwppHosts.reduce((s,h) => s + h.threats, 0);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12 }}>
        <KpiCard label="Agent Coverage"   value={`${Math.round(covered/cwppHosts.length*100)}%`} sub={`${covered}/${cwppHosts.length} hosts protected`} color={covered/cwppHosts.length >= 0.9 ? EME : AMB} icon="🛡" />
        <KpiCard label="Active Threats"   value={String(totalThreats)} sub="Runtime detections" color={totalThreats > 0 ? RED : EME} icon="⚡" />
        <KpiCard label="Critical Hosts"   value={String(critHosts)} sub="Require immediate response" color={RED} icon="⚠" />
        <KpiCard label="Unprotected"      value={String(uncovered)} sub="No agent deployed" color={uncovered > 0 ? AMB : EME} icon="🔓" />
        <KpiCard label="Runtime Events"   value={String(cwppAnomalies.length)} sub="Last 24 hours" color={AMB} icon="📊" />
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 320px", gap:16 }}>
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <div style={card({ padding:16 })}>
            <div style={{ fontSize:12, fontWeight:700, color:NAV, marginBottom:12 }}>Host Inventory — Agent Status</div>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
              <thead><tr style={{ borderBottom:"2px solid rgba(255,255,255,0.08)" }}>
                {["Host","Type","Provider","Agent","Version","Threats","FIM","Risk"].map(h => (
                  <th key={h} style={{ textAlign:"left", padding:"6px 10px", fontSize:9, fontWeight:700, color:"var(--muted-foreground)", letterSpacing:"0.5px", textTransform:"uppercase" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {cwppHosts.map(h => (
                  <tr key={h.host} onClick={() => setSel(sel === h.host ? null : h.host)}
                    style={{ borderBottom:"1px solid rgba(255,255,255,0.05)", cursor:"pointer",
                      background:sel === h.host ? "rgba(147,197,253,0.08)" : h.risk === "Critical" ? "rgba(248,113,113,0.04)" : "transparent" }}>
                    <td style={{ padding:"9px 10px", fontFamily:"monospace", fontSize:10, fontWeight:700, color:"var(--foreground)" }}>{h.host}</td>
                    <td style={{ padding:"9px 10px", fontSize:10, color:"var(--muted-foreground)" }}>{h.type}</td>
                    <td style={{ padding:"9px 10px", fontSize:10, color:"var(--muted-foreground)" }}>{h.provider}</td>
                    <td style={{ padding:"9px 10px" }}>
                      <span style={{ fontSize:9, fontWeight:700, color:h.agent ? EME : RED, background:h.agent ? "rgba(52,211,153,0.15)" : "rgba(248,113,113,0.15)", borderRadius:4, padding:"2px 8px" }}>
                        {h.agent ? "✓ Active" : "✗ None"}
                      </span>
                    </td>
                    <td style={{ padding:"9px 10px", fontFamily:"monospace", fontSize:9, color:h.agentVer ? "var(--muted-foreground)" : RED }}>{h.agentVer ?? "—"}</td>
                    <td style={{ padding:"9px 10px", textAlign:"center" }}>
                      {h.threats > 0 ? <span style={{ fontWeight:800, color:RED, fontFamily:"monospace" }}>{h.threats}</span> : <span style={{ color:EME }}>✓</span>}
                    </td>
                    <td style={{ padding:"9px 10px" }}>
                      <span style={{ fontSize:9, fontWeight:700, color:h.fim ? EME : AMB }}>{h.fim ? "✓" : "✗"}</span>
                    </td>
                    <td style={{ padding:"9px 10px" }}>
                      <span style={{ fontSize:9, fontWeight:700, color:sevColors[h.risk], background:`${sevColors[h.risk]}22`, borderRadius:4, padding:"2px 8px" }}>{h.risk}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={card({ padding:16 })}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <div style={{ fontSize:12, fontWeight:700, color:NAV }}>Runtime Anomaly Events</div>
              <span style={{ background:"rgba(248,113,113,0.1)", color:RED, borderRadius:5, padding:"2px 10px", fontSize:10, fontWeight:700 }}>{cwppAnomalies.length} ACTIVE</span>
            </div>
            {cwppAnomalies.map(a => (
              <div key={a.id} style={{ display:"flex", gap:10, alignItems:"flex-start", padding:"10px 12px", borderRadius:8, border:`1px solid ${sevColors[a.sev]}33`, background:`${sevColors[a.sev]}08`, marginBottom:6 }}>
                <span style={{ fontSize:9, fontWeight:700, color:sevColors[a.sev], background:`${sevColors[a.sev]}22`, borderRadius:4, padding:"2px 8px", flexShrink:0, marginTop:1 }}>{a.sev}</span>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:3 }}>
                    <span style={{ fontSize:11, fontWeight:700, color:"var(--foreground)" }}>{a.type}</span>
                    <span style={{ fontSize:9, color:"var(--muted-foreground)", fontFamily:"monospace" }}>{a.host}</span>
                  </div>
                  <div style={{ fontSize:11, color:"var(--foreground)", marginBottom:2 }}>{a.detail}</div>
                  <div style={{ fontSize:9, color:"var(--muted-foreground)" }}>{a.time}</div>
                </div>
                <div style={{ display:"flex", gap:4, flexShrink:0 }}>
                  <button style={{ fontSize:10, fontWeight:700, color:EME, background:"rgba(52,211,153,0.1)", border:"1px solid rgba(52,211,153,0.25)", borderRadius:5, padding:"3px 8px", cursor:"pointer", fontFamily:"inherit" }}>Respond</button>
                  <button style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:5, padding:"3px 8px", cursor:"pointer", fontFamily:"inherit" }}>Dismiss</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <div style={card({ padding:14 })}>
            <div style={{ fontSize:11, fontWeight:700, color:NAV, marginBottom:10, letterSpacing:"0.5px" }}>AGENT COVERAGE BREAKDOWN</div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", marginBottom:12, position:"relative" }}>
              <MiniDonut segs={[{ v:covered, c:EME },{ v:uncovered, c:RED }]} size={100} thick={16} />
              <div style={{ position:"absolute", textAlign:"center" }}>
                <div style={{ fontSize:18, fontWeight:900, color:EME }}>{Math.round(covered/cwppHosts.length*100)}%</div>
                <div style={{ fontSize:9, color:"var(--muted-foreground)" }}>covered</div>
              </div>
            </div>
            {[["Protected (Agent Active)",covered,EME],["Unprotected (No Agent)",uncovered,RED]].map(([l,v,c]) => (
              <div key={String(l)} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 10px", borderRadius:6, background:`${c}12`, border:`1px solid ${c}33`, marginBottom:6 }}>
                <span style={{ fontSize:10, color:"var(--foreground)", fontWeight:500 }}>{l}</span>
                <span style={{ fontSize:14, fontWeight:800, color:c as string, fontFamily:"monospace" }}>{v}</span>
              </div>
            ))}
          </div>

          <div style={card({ padding:14 })}>
            <div style={{ fontSize:11, fontWeight:700, color:NAV, marginBottom:10, letterSpacing:"0.5px" }}>PROTECTION CAPABILITIES</div>
            {[
              { cap:"Endpoint Detection",    enabled:true,  note:"All covered hosts"    },
              { cap:"File Integrity Monitor", enabled:true,  note:"7/10 hosts"           },
              { cap:"Process Whitelisting",  enabled:false, note:"Not configured"       },
              { cap:"Exploit Prevention",    enabled:true,  note:"All covered hosts"    },
              { cap:"Container Runtime",     enabled:true,  note:"Active on EKS/GKE"   },
              { cap:"Behavioral Analysis",   enabled:true,  note:"ML baseline active"   },
              { cap:"Network Segmentation",  enabled:false, note:"Requires config"      },
            ].map(c => (
              <div key={c.cap} style={{ display:"flex", gap:8, alignItems:"center", marginBottom:7 }}>
                <span style={{ fontSize:12, color:c.enabled ? EME : RED, flexShrink:0 }}>{c.enabled ? "✓" : "✗"}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:"var(--foreground)" }}>{c.cap}</div>
                  <div style={{ fontSize:9, color:"var(--muted-foreground)" }}>{c.note}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Secrets & Code Security Tab ────────────────────────────────────────────────
function SecretsCodeTab() {
  const [secretsFound, setSecretsFound] = useState<any[]>([]);
  const [cicdRepos, setCicdRepos] = useState<any[]>([]);
  useEffect(() => { const tok = getStoredToken(); if (!tok) return; const H = { Authorization: `Bearer ${tok}` }; const fa = (url: string, set: (d: any[]) => void) => fetch(url, { headers: H as any }).then(r => r.ok ? r.json() : []).then((d: any[]) => Array.isArray(d) && d.length > 0 && set(d)).catch(() => {}); fa('/api/cloudops/secrets-found', setSecretsFound); fa('/api/cloudops/cicd-repos', setCicdRepos); }, []);
  const sevColors: Record<string,string> = { Critical:RED, High:AMB, Medium:BLU, Low:EME };
  const totalSecrets = secretsFound.length;
  const critSecrets  = secretsFound.filter(s => s.sev === "Critical").length;
  const gradeColor   = (g:string) => g === "A" ? EME : g === "B" ? "#22D3EE" : g === "C" ? AMB : g === "D" ? "#F97316" : RED;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12 }}>
        <KpiCard label="Secrets Exposed"   value={String(totalSecrets)}  sub={`${critSecrets} critical (unrotated)`}                color={RED} icon="🔑" />
        <KpiCard label="Repos Scanned"     value={String(cicdRepos.length)} sub="CI/CD pipeline security score"                    icon="📦" />
        <KpiCard label="Avg Repo Score"    value={`${Math.round(cicdRepos.reduce((s,r) => s+r.score,0)/cicdRepos.length)}/100`} sub="F–A grade scale"   color={AMB} icon="📊" />
        <KpiCard label="Vulnerable Deps"   value={String(cicdRepos.reduce((s,r) => s+r.vulnDeps,0))} sub="Open source CVEs"       color={AMB} icon="⚠" />
        <KpiCard label="Repos with SAST"   value={`${cicdRepos.filter(r => r.sast).length}/${cicdRepos.length}`} sub="Static analysis enabled" color={AMB} icon="🔍" />
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <div style={card({ padding:16 })}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <div style={{ fontSize:12, fontWeight:700, color:NAV }}>Exposed Secrets Inventory</div>
            <span style={{ fontSize:10, color:RED, fontWeight:700, background:"rgba(248,113,113,0.1)", borderRadius:5, padding:"2px 10px" }}>{totalSecrets} UNROTATED</span>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {secretsFound.map(s => (
              <div key={s.id} style={{ padding:"10px 12px", borderRadius:8, border:`1px solid ${sevColors[s.sev]}44`, background:`${sevColors[s.sev]}08` }}>
                <div style={{ display:"flex", gap:8, alignItems:"flex-start", marginBottom:4 }}>
                  <span style={{ fontSize:9, fontWeight:700, color:sevColors[s.sev], background:`${sevColors[s.sev]}22`, borderRadius:4, padding:"2px 8px", flexShrink:0 }}>{s.sev}</span>
                  <span style={{ fontSize:11, fontWeight:700, color:"var(--foreground)" }}>{s.type}</span>
                  <span style={{ marginLeft:"auto", fontSize:9, fontWeight:700, color:s.exposed==="public" ? RED : AMB, background:s.exposed==="public" ? "rgba(248,113,113,0.15)" : "rgba(252,211,77,0.15)", borderRadius:4, padding:"1px 6px", flexShrink:0 }}>{s.exposed.toUpperCase()}</span>
                </div>
                <div style={{ fontSize:10, fontFamily:"monospace", color:"var(--muted-foreground)", marginBottom:3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.location}</div>
                <div style={{ display:"flex", gap:8 }}>
                  <span style={{ fontSize:9, color:"var(--muted-foreground)" }}>Found: {s.age} ago</span>
                  <span style={{ fontSize:9, fontWeight:700, color:RED }}>⚠ Not rotated</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={card({ padding:16 })}>
          <div style={{ fontSize:12, fontWeight:700, color:NAV, marginBottom:12 }}>CI/CD Pipeline Security Scores</div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {cicdRepos.map(r => (
              <div key={r.repo} style={{ padding:"10px 12px", borderRadius:8, border:`1px solid ${gradeColor(r.grade)}33`, background:`${gradeColor(r.grade)}08` }}>
                <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:6 }}>
                  <span style={{ fontSize:14, fontWeight:900, color:gradeColor(r.grade), fontFamily:"monospace", width:24, textAlign:"center" }}>{r.grade}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:10, fontWeight:700, color:"var(--foreground)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontFamily:"monospace" }}>{r.repo}</div>
                    <div style={{ height:5, background:"rgba(255,255,255,0.06)", borderRadius:3, marginTop:4, overflow:"hidden" }}>
                      <div style={{ width:`${r.score}%`, height:"100%", background:gradeColor(r.grade), borderRadius:3 }} />
                    </div>
                  </div>
                  <span style={{ fontSize:12, fontWeight:800, color:gradeColor(r.grade), fontFamily:"monospace", flexShrink:0 }}>{r.score}</span>
                </div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  {[
                    { l:"Secrets",  v:r.secrets,    bad:r.secrets > 0,  fmt:(v:number)=>v>0?`${v}!`:"✓" },
                    { l:"Vuln Deps",v:r.vulnDeps,   bad:r.vulnDeps > 5, fmt:(v:number)=>String(v)        },
                    { l:"SAST",     v:r.sast?1:0,   bad:!r.sast,        fmt:()=>r.sast?"✓":"✗"           },
                    { l:"SBOM",     v:r.sbom?1:0,   bad:!r.sbom,        fmt:()=>r.sbom?"✓":"✗"           },
                    { l:"Signed",   v:r.signed?1:0, bad:!r.signed,      fmt:()=>r.signed?"✓":"✗"         },
                  ].map(m => (
                    <div key={m.l} style={{ fontSize:9, padding:"1px 7px", borderRadius:4, background:"rgba(255,255,255,0.07)", color:m.bad ? RED : EME, fontWeight:700 }}>
                      {m.l}: {m.fmt(m.v)}
                    </div>
                  ))}
                  <div style={{ fontSize:9, padding:"1px 7px", borderRadius:4, background:"rgba(255,255,255,0.07)", color:"var(--muted-foreground)" }}>
                    Last: {r.scanAge}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── AI Security Posture (AISPM) Tab ───────────────────────────────────────────
function AispTab() {
  const [aiModels, setAiModels] = useState<any[]>([]);
  const [aiThreats, setAiThreats] = useState<any[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => {
    const tok = getStoredToken();
    if (!tok) return;
    const H = { Authorization: `Bearer ${tok}` };
    const fa = (url: string, set: (d: any[]) => void) =>
      fetch(url, { headers: H as any }).then(r => r.ok ? r.json() : []).then((d: any[]) => Array.isArray(d) && set(d)).catch(() => {});
    fa('/api/cloudops/ai-models', setAiModels);
    fa('/api/aisecops/threats', setAiThreats);
  }, []);
  useEffect(() => { if (aiModels.length > 0 && !sel) setSel(aiModels[0].id); }, [aiModels]);
  const sevColors: Record<string,string> = { Critical:RED, High:AMB, Medium:BLU, Low:EME };
  const selModel = aiModels.find(m => m.id === sel);
  const totalFindings = aiModels.reduce((s,m) => s + (m.findings ?? 0), 0);
  const shadowAI  = aiModels.filter(m => m.shadow).length;
  const piiModels = aiModels.filter(m => m.piiInTraining).length;
  const noAuthModels = aiModels.filter(m => m.accessControl === "None").length;
  const openSourceModels = aiModels.filter(m => ["Open Source","Hugging Face","Meta","Mistral AI"].includes(m.vendor)).length;
  const promptThreats = aiThreats.filter(t => t.type === "Prompt Injection" || t.type === "Jailbreak").length;
  const exfilThreats  = aiThreats.filter(t => t.type === "Data Poisoning" || t.type === "Model Inversion" || t.type === "Model Theft").length;
  const riskMatrix = [
    { label:"Data Privacy Risk",     score: Math.min(99, piiModels > 0 ? 40 + piiModels * 15 : 18),         color: piiModels > 1 ? RED : AMB,  note: piiModels > 0 ? `PII in ${piiModels} model${piiModels>1?"s":""}` : "No PII exposure detected" },
    { label:"Access Control Gap",    score: Math.min(99, noAuthModels > 0 ? 28 + noAuthModels * 14 : 12),    color: noAuthModels > 2 ? RED : AMB, note: noAuthModels > 0 ? `${noAuthModels} model${noAuthModels>1?"s":""} without auth` : "All models authenticated" },
    { label:"Shadow AI Exposure",    score: Math.min(99, shadowAI > 0 ? 30 + shadowAI * 18 : 10),            color: shadowAI > 0 ? RED : EME,   note: shadowAI > 0 ? `${shadowAI} unmanaged endpoint${shadowAI>1?"s":""}` : "No shadow AI detected" },
    { label:"Supply Chain Risk",     score: Math.min(99, openSourceModels > 0 ? 20 + openSourceModels * 10 : 10), color: openSourceModels > 2 ? RED : AMB, note: openSourceModels > 0 ? `${openSourceModels} open-source model${openSourceModels>1?"s":""}` : "No open-source models" },
    { label:"Prompt Injection Risk", score: Math.min(99, promptThreats > 0 ? 35 + promptThreats * 10 : 15), color: promptThreats > 3 ? RED : AMB, note: promptThreats > 0 ? `${promptThreats} active threat${promptThreats>1?"s":""}` : "No active threats" },
    { label:"Data Exfil Risk",       score: Math.min(99, exfilThreats > 0 ? 30 + exfilThreats * 10 : 12),  color: exfilThreats > 2 ? RED : AMB,  note: exfilThreats > 0 ? `${exfilThreats} exfil-type threat${exfilThreats>1?"s":""}` : "No exfil threats" },
  ];

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12 }}>
        <KpiCard label="AI Models Discovered" value={String(aiModels.length)} sub={`${shadowAI} shadow AI`} icon="🤖" />
        <KpiCard label="AI Security Findings"  value={String(totalFindings)} sub="Across all models" color={totalFindings > 10 ? RED : AMB} icon="⚠" />
        <KpiCard label="PII in Training Data"  value={String(piiModels)} sub="Models with PII exposure" color={piiModels > 0 ? RED : EME} icon="🔐" />
        <KpiCard label="Shadow AI Services"    value={String(shadowAI)} sub="Unmanaged AI endpoints" color={shadowAI > 0 ? RED : EME} icon="👻" />
        <KpiCard label="Models w/o Auth"       value={String(aiModels.filter(m => m.accessControl==="None").length)} sub="No access control" color={RED} icon="🔓" />
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"300px 1fr", gap:16 }}>
        <div style={card({ padding:14 })}>
          <div style={{ fontSize:11, fontWeight:700, color:NAV, marginBottom:10, letterSpacing:"0.5px" }}>AI MODEL INVENTORY</div>
          {aiModels.map(m => (
            <div key={m.id} onClick={() => setSel(sel === m.id ? null : m.id)}
              style={{ marginBottom:6, padding:"10px 11px", borderRadius:8, cursor:"pointer",
                border:`1px solid ${sel === m.id ? sevColors[m.risk]+"88" : "rgba(255,255,255,0.07)"}`,
                background:sel === m.id ? `${sevColors[m.risk]}10` : "transparent" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:4 }}>
                <span style={{ fontSize:11, fontWeight:700, color:"var(--foreground)", flex:1, marginRight:6, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{m.name}</span>
                <span style={{ fontSize:9, fontWeight:700, color:sevColors[m.risk], background:`${sevColors[m.risk]}22`, borderRadius:4, padding:"1px 6px", flexShrink:0 }}>{m.risk}</span>
              </div>
              <div style={{ fontSize:9, color:"var(--muted-foreground)", marginBottom:3 }}>{m.vendor} · {m.type}</div>
              <div style={{ display:"flex", gap:6 }}>
                {m.shadow && <span style={{ fontSize:8, fontWeight:700, color:RED, background:"rgba(248,113,113,0.15)", borderRadius:3, padding:"1px 5px" }}>SHADOW</span>}
                {m.piiInTraining && <span style={{ fontSize:8, fontWeight:700, color:AMB, background:"rgba(252,211,77,0.15)", borderRadius:3, padding:"1px 5px" }}>PII</span>}
                {m.accessControl === "None" && <span style={{ fontSize:8, fontWeight:700, color:RED, background:"rgba(248,113,113,0.15)", borderRadius:3, padding:"1px 5px" }}>NO AUTH</span>}
                <span style={{ fontSize:8, color:"var(--muted-foreground)" }}>{m.findings} findings</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {selModel && (
            <div style={card({ padding:16 })}>
              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16, paddingBottom:14, borderBottom:"1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ width:44, height:44, borderRadius:12, background:`${sevColors[selModel.risk]}22`, border:`2px solid ${sevColors[selModel.risk]}66`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>🤖</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:800, color:"var(--foreground)" }}>{selModel.name}</div>
                  <div style={{ fontSize:11, color:"var(--muted-foreground)" }}>{selModel.vendor} · {selModel.type} · <span style={{ fontFamily:"monospace" }}>{selModel.endpoint}</span></div>
                </div>
                <span style={{ fontSize:12, fontWeight:700, color:sevColors[selModel.risk], background:`${sevColors[selModel.risk]}22`, borderRadius:8, padding:"6px 14px" }}>{selModel.risk} Risk</span>
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:14 }}>
                {[
                  { l:"Access Control", v:selModel.accessControl, c:selModel.accessControl==="None" ? RED : EME },
                  { l:"PII in Training", v:selModel.piiInTraining ? "YES" : selModel.piiInTraining===null ? "Unknown" : "No", c:selModel.piiInTraining ? RED : selModel.piiInTraining===null ? AMB : EME },
                  { l:"Shadow AI",      v:selModel.shadow ? "YES" : "No",   c:selModel.shadow ? RED : EME },
                  { l:"Findings",       v:String(selModel.findings),         c:selModel.findings >= 4 ? RED : AMB },
                ].map(m => (
                  <div key={m.l} style={{ textAlign:"center", padding:"10px 8px", background:"rgba(255,255,255,0.03)", borderRadius:8, border:"1px solid rgba(255,255,255,0.07)" }}>
                    <div style={{ fontSize:14, fontWeight:800, color:m.c, fontFamily:"monospace" }}>{m.v}</div>
                    <div style={{ fontSize:9, color:"var(--muted-foreground)", marginTop:3 }}>{m.l}</div>
                  </div>
                ))}
              </div>

              <div style={{ marginBottom:10 }}>
                <div style={{ fontSize:11, fontWeight:700, color:NAV, marginBottom:8 }}>Data Types Accessed</div>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  {selModel.dataTypes.map(dt => (
                    <span key={dt} style={{ fontSize:10, fontWeight:600, padding:"4px 12px", borderRadius:6, background:dt.includes("PII")||dt.includes("HR")||dt.includes("Biometric")||dt.includes("Cred") ? "rgba(248,113,113,0.15)" : "rgba(255,255,255,0.07)", color:dt.includes("PII")||dt.includes("HR")||dt.includes("Biometric")||dt.includes("Cred") ? RED : "var(--foreground)", border:`1px solid ${dt.includes("PII")||dt.includes("HR")||dt.includes("Biometric")||dt.includes("Cred") ? RED+"44" : "rgba(255,255,255,0.1)"}` }}>{dt}</span>
                  ))}
                </div>
              </div>

              <div style={{ padding:"12px 14px", borderRadius:8, background:"rgba(248,113,113,0.06)", border:"1px solid rgba(248,113,113,0.2)" }}>
                <div style={{ fontSize:11, fontWeight:700, color:RED, marginBottom:6 }}>⚠ Security Findings ({selModel.findings ?? 0})</div>
                {(() => {
                  const modelThreats = aiThreats.filter(t => t.modelId === selModel.id || t.affectedModel === selModel.name).slice(0, selModel.findings ?? 0);
                  const items = modelThreats.length > 0
                    ? modelThreats.map(t => t.title)
                    : Array.from({ length: Math.min(selModel.findings ?? 0, 6) }, (_, i) => {
                        const generic = [
                          "No authentication on model API endpoint — unauthenticated access possible",
                          "Model trained on unmasked PII data — no anonymization applied",
                          "No rate limiting — susceptible to data extraction via repeated queries",
                          "Model outputs not sanitized — prompt injection risk identified",
                          "Missing audit logging for model inference requests",
                          "No DLP controls on data sent to model endpoint",
                        ];
                        return generic[i] ?? `Security finding ${i+1} — review required`;
                      });
                  return items.map((f, i) => (
                    <div key={i} style={{ fontSize:11, color:"var(--foreground)", marginBottom:4 }}>· {f}</div>
                  ));
                })()}
              </div>
            </div>
          )}

          <div style={card({ padding:16 })}>
            <div style={{ fontSize:12, fontWeight:700, color:NAV, marginBottom:12 }}>AI Risk Matrix Overview</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
              {riskMatrix.map(r => (
                <div key={r.label} style={{ padding:"12px 10px", borderRadius:8, border:`1px solid ${r.color}33`, background:`${r.color}08`, textAlign:"center" }}>
                  <div style={{ fontSize:22, fontWeight:900, color:r.color, fontFamily:"monospace", marginBottom:4 }}>{r.score}</div>
                  <div style={{ fontSize:10, fontWeight:700, color:"var(--foreground)", marginBottom:3 }}>{r.label}</div>
                  <div style={{ fontSize:9, color:"var(--muted-foreground)" }}>{r.note}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Remediation Hub Tab ────────────────────────────────────────────────────────
function RemediationHubTab() {
  const [remItems, setRemItems] = useState<any[]>([]);
  useEffect(() => { const tok = getStoredToken(); if (!tok) return; const H = { Authorization: `Bearer ${tok}` }; const fa = (url: string, set: (d: any[]) => void) => fetch(url, { headers: H as any }).then(r => r.ok ? r.json() : []).then((d: any[]) => Array.isArray(d) && d.length > 0 && set(d)).catch(() => {}); fa('/api/cloudops/rem-items', setRemItems); }, []);
  const [selId, setSelId] = useState<string | null>("REM-001");
  const [filterType, setFilterType] = useState("all");
  const sevColors: Record<string,string> = { Critical:RED, High:AMB, Medium:BLU, Low:EME };
  const effortColors: Record<string,string> = { Low:EME, Medium:AMB, High:RED };
  const selItem = remItems.find(r => r.id === selId);

  const filteredItems = filterType === "all" ? remItems : remItems.filter(r => r.type === filterType);
  const types = ["all", ...Array.from(new Set(remItems.map(r => r.type)))];
  const autoFixed = remItems.filter(r => r.effort === "Low").length;
  const overdue   = remItems.filter(r => r.slaLeft <= 2).length;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12 }}>
        <KpiCard label="Open Remediations"  value={String(remItems.length)} sub="Prioritized by risk" icon="🔧" />
        <KpiCard label="Overdue (≤2d SLA)"  value={String(overdue)} sub="Immediate attention" color={RED} icon="⏰" />
        <KpiCard label="Low-Effort Fixes"   value={String(autoFixed)} sub="Can be closed today" color={EME} icon="⚡" />
        <KpiCard label="IaC Code Available" value={String(remItems.length)} sub="Automated fix snippets" color={NAV} icon="📄" />
        <KpiCard label="Avg Risk Score"     value={String(Math.round(remItems.reduce((s,r) => s+r.score,0)/remItems.length))} sub="CVSS-based priority" color={AMB} icon="📊" />
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 380px", gap:16 }}>
        <div style={card({ padding:16 })}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <div style={{ fontSize:12, fontWeight:700, color:NAV }}>Prioritized Remediation Queue</div>
            <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
              {types.slice(0,6).map(t => (
                <button key={t} onClick={() => setFilterType(t)} style={{ fontSize:9, fontWeight:700, borderRadius:5, padding:"2px 8px", border:`1px solid ${filterType===t ? NAV : "rgba(255,255,255,0.12)"}`, background:filterType===t ? "rgba(147,197,253,0.2)" : "transparent", color:filterType===t ? NAV : "var(--muted-foreground)", cursor:"pointer", fontFamily:"inherit" }}>{t}</button>
              ))}
            </div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {filteredItems.map((item,idx) => (
              <div key={item.id} onClick={() => setSelId(selId === item.id ? null : item.id)}
                style={{ display:"flex", gap:10, alignItems:"flex-start", padding:"10px 12px", borderRadius:8, cursor:"pointer",
                  border:`1px solid ${selId===item.id ? NAV+"66" : item.slaLeft<=2 ? RED+"44" : "rgba(255,255,255,0.07)"}`,
                  background:selId===item.id ? "rgba(147,197,253,0.08)" : item.slaLeft<=2 ? "rgba(248,113,113,0.04)" : "transparent" }}>
                <div style={{ width:24, height:24, borderRadius:6, background:`${item.score>=95 ? RED : item.score>=90 ? AMB : BLU}22`, border:`1px solid ${item.score>=95 ? RED : item.score>=90 ? AMB : BLU}44`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, color:item.score>=95 ? RED : item.score>=90 ? AMB : BLU, flexShrink:0 }}>{idx+1}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"var(--foreground)", marginBottom:3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.finding}</div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    <span style={{ fontSize:9, color:"var(--muted-foreground)", background:"rgba(255,255,255,0.07)", borderRadius:3, padding:"1px 6px" }}>{item.type}</span>
                    <span style={{ fontSize:9, color:"var(--muted-foreground)", background:"rgba(255,255,255,0.07)", borderRadius:3, padding:"1px 6px" }}>{item.provider}</span>
                    <span style={{ fontSize:9, fontWeight:700, color:effortColors[item.effort], background:`${effortColors[item.effort]}22`, borderRadius:3, padding:"1px 6px" }}>{item.effort} effort</span>
                  </div>
                </div>
                <div style={{ textAlign:"right", flexShrink:0 }}>
                  <div style={{ fontSize:12, fontWeight:800, color:item.score>=95 ? RED : AMB, fontFamily:"monospace" }}>{item.score}</div>
                  <div style={{ fontSize:9, fontWeight:700, color:item.slaLeft<=2 ? RED : AMB, marginTop:2 }}>{item.slaLeft<=0 ? "OVERDUE" : `${item.slaLeft}d SLA`}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {selItem && (
            <div style={card({ padding:16 })}>
              <div style={{ fontSize:11, fontWeight:700, color:NAV, marginBottom:10, letterSpacing:"0.5px" }}>IaC REMEDIATION CODE</div>
              <div style={{ fontSize:10, fontWeight:700, color:"var(--foreground)", marginBottom:4 }}>{selItem.finding}</div>
              <div style={{ display:"flex", gap:6, marginBottom:10 }}>
                <span style={{ fontSize:9, padding:"1px 7px", borderRadius:4, background:"rgba(255,255,255,0.07)", color:"var(--muted-foreground)" }}>{selItem.provider}</span>
                <span style={{ fontSize:9, padding:"1px 7px", borderRadius:4, background:"rgba(255,255,255,0.07)", color:"var(--muted-foreground)" }}>{selItem.type}</span>
                <span style={{ fontSize:9, fontWeight:700, padding:"1px 7px", borderRadius:4, background:`${effortColors[selItem.effort]}22`, color:effortColors[selItem.effort] }}>{selItem.effort} effort</span>
                <span style={{ fontSize:9, fontWeight:700, padding:"1px 7px", borderRadius:4, background:selItem.slaLeft<=2?"rgba(248,113,113,0.15)":"rgba(252,211,77,0.15)", color:selItem.slaLeft<=2?RED:AMB }}>{selItem.slaLeft<=0?"OVERDUE":`${selItem.slaLeft}d SLA`}</span>
              </div>
              <div style={{ background:"rgba(0,0,0,0.4)", borderRadius:8, padding:14, border:"1px solid rgba(255,255,255,0.1)", fontFamily:"monospace", fontSize:10, color:"#A3E635", lineHeight:1.7, whiteSpace:"pre-wrap", overflow:"auto", maxHeight:220 }}>
                {selItem.iac}
              </div>
              <div style={{ display:"flex", gap:8, marginTop:10 }}>
                <button style={{ flex:1, padding:"8px 0", borderRadius:7, border:"1px solid rgba(52,211,153,0.3)", background:"rgba(52,211,153,0.12)", fontSize:11, fontWeight:700, color:EME, cursor:"pointer", fontFamily:"inherit" }}>▶ Apply Fix</button>
                <button style={{ padding:"8px 14px", borderRadius:7, border:"1px solid rgba(255,255,255,0.12)", background:"rgba(255,255,255,0.05)", fontSize:11, fontWeight:700, color:"var(--muted-foreground)", cursor:"pointer", fontFamily:"inherit" }}>📋 Copy</button>
                <button style={{ padding:"8px 14px", borderRadius:7, border:"1px solid rgba(255,255,255,0.12)", background:"rgba(255,255,255,0.05)", fontSize:11, fontWeight:700, color:"var(--muted-foreground)", cursor:"pointer", fontFamily:"inherit" }}>🔗 PR</button>
              </div>
            </div>
          )}

          <div style={card({ padding:14 })}>
            <div style={{ fontSize:11, fontWeight:700, color:NAV, marginBottom:10, letterSpacing:"0.5px" }}>REMEDIATION VELOCITY</div>
            {[
              { label:"Fixed (Last 7 days)",   count:14, color:EME },
              { label:"In Remediation",         count:7,  color:AMB },
              { label:"Awaiting Approval",      count:4,  color:BLU },
              { label:"Open (Not Started)",     count:remItems.length, color:RED },
              { label:"SLA Breached",           count:2,  color:RED },
            ].map(s => (
              <div key={s.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 10px", borderRadius:6, background:"rgba(255,255,255,0.03)", marginBottom:5 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:s.color, flexShrink:0 }} />
                  <span style={{ fontSize:10, color:"var(--foreground)", fontWeight:500 }}>{s.label}</span>
                </div>
                <span style={{ fontSize:14, fontWeight:800, color:s.color, fontFamily:"monospace" }}>{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Resources Tab (live data) ──────────────────────────────────────────────────
function ResourcesTab({ resources }: { resources: any[] }) {
  const [sel, setSel] = useState<any | null>(null);
  const [provFilter, setProvFilter] = useState("All");
  const [riskFilter, setRiskFilter] = useState("All");
  const [search, setSearch] = useState("");

  const filtered = resources.filter(r =>
    (provFilter === "All" || r.provider === provFilter) &&
    (riskFilter === "All" || r.risk === riskFilter) &&
    (!search || r.resourceId?.toLowerCase().includes(search.toLowerCase()) || r.service?.toLowerCase().includes(search.toLowerCase()))
  );

  const statusDot = (r: any) => r.compliant ? EME : r.risk === "Critical" ? RED : r.risk === "High" ? AMB : YEL;

  if (resources.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 20px", gap: 12 }}>
        <div style={{ fontSize: 40, opacity: 0.3 }}>☁</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--foreground)" }}>No Resources Found</div>
        <div style={{ fontSize: 12, color: "var(--muted-foreground)", textAlign: "center" }}>Connect a cloud integration to start seeing resources.</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
        <KpiCard label="Total" value={resources.length} sub="Scanned resources" icon="☁" />
        <KpiCard label="Compliant" value={resources.filter(r => r.compliant).length} sub="Passing all checks" color={EME} icon="✓" />
        <KpiCard label="Non-Compliant" value={resources.filter(r => !r.compliant).length} sub="Require attention" color={RED} icon="✗" />
        <KpiCard label="Critical Risk" value={resources.filter(r => r.risk === "Critical").length} sub="Immediate action" color={RED} icon="⚠" />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search resources..." style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "var(--foreground)", fontSize: 11, outline: "none", width: 160 }} />
        {["All", "AWS", "Azure", "GCP"].map(p => (
          <button key={p} onClick={() => setProvFilter(p)} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid", fontSize: 11, fontWeight: 700, cursor: "pointer", background: provFilter === p ? (providerColors[p] ?? "rgba(147,197,253,0.2)") : "rgba(255,255,255,0.04)", color: provFilter === p ? "white" : "var(--muted-foreground)", borderColor: provFilter === p ? (providerColors[p] ?? NAV) : "rgba(255,255,255,0.1)" }}>{p}</button>
        ))}
        <span style={{ borderLeft: "1px solid rgba(255,255,255,0.1)", height: 18 }} />
        {["All", "Critical", "High", "Medium", "Low"].map(r => (
          <button key={r} onClick={() => setRiskFilter(r)} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid", fontSize: 11, fontWeight: 700, cursor: "pointer", background: riskFilter === r ? (sevColor[r] ?? "rgba(147,197,253,0.2)") + "22" : "rgba(255,255,255,0.04)", color: riskFilter === r ? (sevColor[r] ?? NAV) : "var(--muted-foreground)", borderColor: riskFilter === r ? (sevColor[r] ?? NAV) + "66" : "rgba(255,255,255,0.1)" }}>{r}</button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.map(r => (
            <div key={r.id} onClick={() => setSel(sel?.id === r.id ? null : r)}
              style={{ ...card({ padding: "11px 14px", cursor: "pointer" }), borderLeft: `4px solid ${statusDot(r)}`, borderColor: sel?.id === r.id ? NAV : "var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: "white", background: providerColors[r.provider] ?? NAV, borderRadius: 4, padding: "2px 7px", flexShrink: 0 }}>{r.provider}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.resourceId}</div>
                  <div style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{r.service} · {r.region}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: sevColor[r.risk] ?? "var(--muted-foreground)", background: (sevColor[r.risk] ?? "#888") + "18", borderRadius: 4, padding: "2px 7px", flexShrink: 0 }}>{r.risk}</span>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: statusDot(r), flexShrink: 0 }} />
              </div>
              {sel?.id === r.id && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.07)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {Object.entries(r.config ?? {}).map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, gap: 8 }}>
                      <span style={{ color: "var(--muted-foreground)", fontFamily: "monospace" }}>{k}</span>
                      <span style={{ fontWeight: 700, color: String(v).includes("public") || String(v) === "false" || String(v) === "disabled" ? RED : EME, fontFamily: "monospace", textAlign: "right", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>{String(v)}</span>
                    </div>
                  ))}
                  <div style={{ gridColumn: "1/-1", display: "flex", gap: 4, marginTop: 4, fontSize: 9 }}>
                    {Object.entries(r.tags ?? {}).map(([k, v]) => (
                      <span key={k} style={{ background: "rgba(147,197,253,0.1)", color: NAV, borderRadius: 4, padding: "2px 6px", fontWeight: 700 }}>{k}: {v}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "var(--muted-foreground)", fontSize: 12 }}>No resources match the current filters.</div>}
        </div>
      </div>
    </div>
  );
}

// ── CIS Findings Tab (live data + status actions) ─────────────────────────────
function CisFindingsTab({ findings, onUpdateStatus }: { findings: any[]; onUpdateStatus: (id: string, status: string) => Promise<void> }) {
  const [sel, setSel] = useState<any | null>(null);
  const [sevFilter, setSevFilter] = useState("All");
  const [provFilter, setProvFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [updating, setUpdating] = useState<string | null>(null);

  const filtered = findings.filter(f =>
    (sevFilter === "All" || f.severity === sevFilter) &&
    (provFilter === "All" || f.provider === provFilter) &&
    (statusFilter === "All" || f.status === statusFilter)
  );

  const handleStatus = async (f: any, newStatus: string) => {
    setUpdating(f.id);
    try { await onUpdateStatus(f.id, newStatus); if (sel?.id === f.id) setSel({ ...f, status: newStatus }); }
    finally { setUpdating(null); }
  };

  const bySev = (s: string) => findings.filter(f => f.severity === s).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12 }}>
        <KpiCard label="Total Findings" value={findings.length} sub="Across all benchmarks" icon="📋" />
        <KpiCard label="Critical" value={bySev("Critical")} sub="Immediate action" color={RED} icon="🔴" />
        <KpiCard label="High" value={bySev("High")} sub="High severity" color={AMB} icon="⚠" />
        <KpiCard label="In Remediation" value={findings.filter(f => f.status === "in-remediation").length} sub="Being addressed" color={AMB} icon="🔧" />
        <KpiCard label="Resolved" value={findings.filter(f => f.status === "resolved").length} sub="Closed" color={EME} icon="✓" />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {["All", "Critical", "High", "Medium", "Low"].map(s => (
          <button key={s} onClick={() => setSevFilter(s)} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid", fontSize: 11, fontWeight: 700, cursor: "pointer", background: sevFilter === s ? (sevColor[s] ?? "rgba(147,197,253,0.2)") + "22" : "rgba(255,255,255,0.04)", color: sevFilter === s ? (sevColor[s] ?? NAV) : "var(--muted-foreground)", borderColor: sevFilter === s ? (sevColor[s] ?? NAV) + "55" : "rgba(255,255,255,0.1)" }}>{s}</button>
        ))}
        <span style={{ borderLeft: "1px solid rgba(255,255,255,0.1)", height: 18 }} />
        {["All", "AWS", "Azure", "GCP"].map(p => (
          <button key={p} onClick={() => setProvFilter(p)} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid", fontSize: 11, fontWeight: 700, cursor: "pointer", background: provFilter === p ? (providerColors[p] ?? NAV) + "22" : "rgba(255,255,255,0.04)", color: provFilter === p ? (providerColors[p] ?? NAV) : "var(--muted-foreground)", borderColor: provFilter === p ? (providerColors[p] ?? NAV) + "55" : "rgba(255,255,255,0.1)" }}>{p}</button>
        ))}
        <span style={{ borderLeft: "1px solid rgba(255,255,255,0.1)", height: 18 }} />
        {["All", "open", "in-remediation", "resolved", "suppressed"].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid", fontSize: 11, fontWeight: 700, cursor: "pointer", background: statusFilter === s ? "rgba(147,197,253,0.12)" : "rgba(255,255,255,0.04)", color: statusFilter === s ? NAV : "var(--muted-foreground)", borderColor: statusFilter === s ? "rgba(147,197,253,0.3)" : "rgba(255,255,255,0.1)" }}>{s === "All" ? "All Status" : statusLabel[s] ?? s}</button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted-foreground)" }}>{filtered.length} findings</span>
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.map(f => (
            <div key={f.id} onClick={() => setSel(sel?.id === f.id ? null : f)}
              style={{ ...card({ padding: "11px 14px", cursor: "pointer" }), borderLeft: `4px solid ${sevColor[f.severity] ?? NAV}`, borderColor: sel?.id === f.id ? NAV : "var(--border)", opacity: f.status === "suppressed" ? 0.55 : 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: "white", background: providerColors[f.provider] ?? NAV, borderRadius: 3, padding: "1px 6px", flexShrink: 0 }}>{f.provider}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: sevColor[f.severity], background: (sevColor[f.severity] ?? "#888") + "18", borderRadius: 3, padding: "1px 6px", flexShrink: 0 }}>{f.severity}</span>
                <div style={{ flex: 1, fontSize: 11, fontWeight: 700, color: "var(--foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.title}</div>
                <select
                  value={f.status}
                  onClick={e => e.stopPropagation()}
                  onChange={e => { e.stopPropagation(); handleStatus(f, e.target.value); }}
                  disabled={updating === f.id}
                  style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${statusColor[f.status] ?? "rgba(255,255,255,0.1)"}44`, borderRadius: 5, padding: "3px 6px", fontSize: 10, fontWeight: 700, color: statusColor[f.status] ?? "var(--muted-foreground)", cursor: "pointer", outline: "none", flexShrink: 0, opacity: updating === f.id ? 0.5 : 1 }}>
                  <option value="open">Open</option>
                  <option value="in-remediation">In Remediation</option>
                  <option value="resolved">Resolved</option>
                  <option value="suppressed">Suppressed</option>
                </select>
              </div>
              <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 4 }}>
                {f.service} · <span style={{ fontFamily: "monospace" }}>{f.affectedResource ?? f.resource ?? ""}</span>
                {f.cisControl && <span> · {f.cisControl}</span>}
                {f.detectedAt && <span> · Detected {f.detectedAt}</span>}
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "var(--muted-foreground)", fontSize: 12 }}>🎉 No findings match the current filters.</div>}
        </div>

        {sel && (
          <div style={{ width: 340, flexShrink: 0, ...card({ padding: 0, overflow: "hidden", height: "fit-content", position: "sticky", top: 0 }) }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 700, color: NAV }}>{sel.id}</div>
                <div style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{sel.service} · {sel.provider}</div>
              </div>
              <button onClick={() => setSel(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--muted-foreground)" }}>×</button>
            </div>

            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: sevColor[sel.severity], background: (sevColor[sel.severity] ?? "#888") + "18", borderRadius: 4, padding: "2px 7px" }}>{sel.severity}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: statusColor[sel.status], background: (statusColor[sel.status] ?? "#888") + "18", borderRadius: 4, padding: "2px 7px" }}>{statusLabel[sel.status] ?? sel.status}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "var(--foreground)", lineHeight: 1.4, marginBottom: 6 }}>{sel.title}</div>
              {sel.description && <div style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.6 }}>{sel.description}</div>}
            </div>

            {sel.driftDetected && sel.baseline && (
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted-foreground)", marginBottom: 8 }}>CONFIGURATION DRIFT</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div style={{ background: "rgba(52,211,153,0.08)", borderRadius: 7, padding: "8px 10px" }}>
                    <div style={{ fontSize: 9, fontWeight: 800, color: EME, marginBottom: 4 }}>BASELINE</div>
                    <div style={{ fontFamily: "monospace", fontSize: 10, color: EME }}>{sel.baseline}</div>
                  </div>
                  <div style={{ background: "rgba(248,113,113,0.08)", borderRadius: 7, padding: "8px 10px" }}>
                    <div style={{ fontSize: 9, fontWeight: 800, color: RED, marginBottom: 4 }}>CURRENT (DRIFT)</div>
                    <div style={{ fontFamily: "monospace", fontSize: 10, color: RED }}>{sel.current}</div>
                  </div>
                </div>
              </div>
            )}

            {sel.remediationSteps?.length > 0 && (
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted-foreground)", marginBottom: 8 }}>REMEDIATION STEPS</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {sel.remediationSteps.map((step: string, i: number) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <div style={{ width: 18, height: 18, borderRadius: "50%", background: "rgba(147,197,253,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: NAV, flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                      <span style={{ fontSize: 11, color: "var(--foreground)", lineHeight: 1.5 }}>{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ padding: "12px 16px", display: "flex", gap: 8 }}>
              <select value={sel.status} onChange={e => handleStatus(sel, e.target.value)} disabled={updating === sel.id}
                style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(147,197,253,0.3)", borderRadius: 7, padding: "8px 10px", fontSize: 11, fontWeight: 700, color: NAV, cursor: "pointer", outline: "none", opacity: updating === sel.id ? 0.5 : 1 }}>
                <option value="open">Set: Open</option>
                <option value="in-remediation">Set: In Remediation</option>
                <option value="resolved">Set: Resolved ✓</option>
                <option value="suppressed">Set: Suppressed</option>
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Drift Detection Tab (live data + acknowledge) ─────────────────────────────
function DriftTab({ drift, onAcknowledge }: { drift: any[]; onAcknowledge: (id: string) => Promise<void> }) {
  const [sel, setSel] = useState<any | null>(null);
  const [acking, setAcking] = useState<string | null>(null);
  const [showAcked, setShowAcked] = useState(false);

  const open = drift.filter(d => !d.acknowledged);
  const acked = drift.filter(d => d.acknowledged);
  const displayed = showAcked ? drift : open;

  const handleAck = async (d: any) => {
    setAcking(d.id);
    try { await onAcknowledge(d.id); if (sel?.id === d.id) setSel({ ...d, acknowledged: true }); }
    finally { setAcking(null); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        <KpiCard label="Drift Events" value={drift.length} sub="Total detected" icon="🔀" />
        <KpiCard label="Unacknowledged" value={open.length} sub="Requires review" color={open.length > 0 ? RED : EME} icon="⚠" />
        <KpiCard label="Acknowledged" value={acked.length} sub="Reviewed & closed" color={EME} icon="✓" />
        <KpiCard label="With Drift" value={drift.filter(d => d.current).length} sub="Active config changes" color={AMB} icon="📊" />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: NAV }}>CONFIGURATION DRIFT TIMELINE</div>
        <button onClick={() => setShowAcked(!showAcked)} style={{ background: showAcked ? "rgba(147,197,253,0.15)" : "rgba(255,255,255,0.04)", border: "1px solid rgba(147,197,253,0.25)", borderRadius: 6, padding: "5px 12px", fontSize: 11, fontWeight: 700, color: showAcked ? NAV : "var(--muted-foreground)", cursor: "pointer" }}>
          {showAcked ? "Hide Acknowledged" : `Show Acknowledged (${acked.length})`}
        </button>
      </div>

      {open.length === 0 && !showAcked ? (
        <div style={{ ...card({ padding: "40px 24px" }), textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>✅</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: EME }}>No Unacknowledged Drift</div>
          <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 6 }}>All configuration drift events have been reviewed.</div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ flex: 1 }}>
            {displayed.map((evt, i) => (
              <div key={evt.id} style={{ display: "flex", gap: 0, alignItems: "flex-start" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 36, flexShrink: 0 }}>
                  <div style={{ width: 12, height: 12, borderRadius: "50%", background: evt.acknowledged ? "rgba(255,255,255,0.15)" : evt.severity === "Critical" ? RED : evt.severity === "High" ? AMB : BLU, marginTop: 14, flexShrink: 0 }} />
                  {i < displayed.length - 1 && <div style={{ width: 2, height: 36, background: "rgba(255,255,255,0.06)" }} />}
                </div>
                <div onClick={() => setSel(sel?.id === evt.id ? null : evt)}
                  style={{ flex: 1, marginBottom: 6, ...card({ padding: "11px 14px", cursor: "pointer" }), borderColor: sel?.id === evt.id ? NAV : "var(--border)", opacity: evt.acknowledged ? 0.55 : 1, borderLeft: `3px solid ${evt.acknowledged ? "rgba(255,255,255,0.1)" : evt.severity === "Critical" ? RED : evt.severity === "High" ? AMB : BLU}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 9, fontWeight: 800, color: "white", background: providerColors[evt.provider] ?? NAV, borderRadius: 3, padding: "1px 6px" }}>{evt.provider ?? "—"}</span>
                      {!evt.acknowledged && (
                        <span style={{ fontSize: 9, fontWeight: 800, color: sevColor[evt.severity] ?? NAV, background: (sevColor[evt.severity] ?? "#888") + "18", borderRadius: 3, padding: "1px 6px" }}>{evt.severity ?? evt.field}</span>
                      )}
                      {evt.acknowledged && <span style={{ fontSize: 9, color: "var(--muted-foreground)", fontWeight: 700 }}>ACKNOWLEDGED</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{evt.detectedAt ?? evt.ts}</span>
                      {!evt.acknowledged && (
                        <button onClick={e => { e.stopPropagation(); handleAck(evt); }} disabled={acking === evt.id}
                          style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.3)", borderRadius: 5, padding: "3px 8px", fontSize: 10, fontWeight: 700, color: EME, cursor: "pointer", opacity: acking === evt.id ? 0.5 : 1 }}>
                          {acking === evt.id ? "..." : "Acknowledge"}
                        </button>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--foreground)" }}>{evt.change ?? `Config change: ${evt.field}`}</div>
                  <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 2 }}>
                    <span style={{ fontFamily: "monospace" }}>{evt.resourceId}</span> · field: <span style={{ fontFamily: "monospace" }}>{evt.field}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {sel && (
            <div style={{ width: 300, flexShrink: 0, ...card({ padding: 0, overflow: "hidden", height: "fit-content", position: "sticky", top: 0 }) }}>
              <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 700, color: NAV }}>{sel.id}</div>
                  <div style={{ fontSize: 10, color: "var(--muted-foreground)" }}>Drift Detection Event</div>
                </div>
                <button onClick={() => setSel(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--muted-foreground)" }}>×</button>
              </div>

              <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "var(--foreground)", lineHeight: 1.4, marginBottom: 8 }}>{sel.change ?? `Configuration change detected on field: ${sel.field}`}</div>
                {[["Resource", sel.resourceId], ["Field", sel.field], ["Detected", sel.detectedAt ?? sel.ts], ["Status", sel.acknowledged ? "Acknowledged ✓" : "⚠ Unreviewed"]].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: 11 }}>
                    <span style={{ color: "var(--muted-foreground)" }}>{k}</span>
                    <span style={{ fontWeight: 700, color: k === "Status" && !sel.acknowledged ? AMB : NAV }}>{v}</span>
                  </div>
                ))}
              </div>

              {(sel.baseline || sel.from) && (
                <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted-foreground)", marginBottom: 8 }}>CONFIGURATION CHANGE</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div style={{ background: "rgba(52,211,153,0.08)", borderRadius: 7, padding: "8px 10px" }}>
                      <div style={{ fontSize: 9, fontWeight: 800, color: EME, marginBottom: 4 }}>BEFORE (EXPECTED)</div>
                      <div style={{ fontFamily: "monospace", fontSize: 10, color: EME, wordBreak: "break-all" }}>{sel.baseline ?? sel.from}</div>
                    </div>
                    <div style={{ background: "rgba(248,113,113,0.08)", borderRadius: 7, padding: "8px 10px" }}>
                      <div style={{ fontSize: 9, fontWeight: 800, color: RED, marginBottom: 4 }}>AFTER (DRIFT)</div>
                      <div style={{ fontFamily: "monospace", fontSize: 10, color: RED, wordBreak: "break-all" }}>{sel.current ?? sel.to}</div>
                    </div>
                  </div>
                </div>
              )}

              {!sel.acknowledged && (
                <div style={{ padding: "12px 16px" }}>
                  <button onClick={() => handleAck(sel)} disabled={acking === sel.id}
                    style={{ width: "100%", padding: "9px 0", borderRadius: 7, border: "none", background: EME, fontSize: 12, fontWeight: 700, cursor: "pointer", color: "#0D1117", opacity: acking === sel.id ? 0.5 : 1 }}>
                    {acking === sel.id ? "Acknowledging..." : "✓ Acknowledge Drift"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Module Root ────────────────────────────────────────────────────────────────
export default function CloudOps() {
  const { viewTenantId } = useOrg();
  const { isModuleLicensed, isSubModuleLicensed } = useLicense();
  const [tab, setTab] = useState("overview");
  const [cspmSubTab, setCspmSubTab] = useState<"posture"|"resources"|"findings"|"drift">("posture");
  const [scanning, setScanning] = useState(false);
  const [lastScanned, setLastScanned] = useState<Date | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" | "info" } | null>(null);

  const qc = useQueryClient();
  const { data: stats, isLoading: cspmLoading, isError: cspmError } = useCspmStats();
  const { data: resources = [] } = useCspmResources();
  const { data: findings = [] } = useCspmFindings();
  const { data: drift = [] } = useCspmDrift();
  const updateFindingStatusMutation = useUpdateCspmFindingStatus();

  const showToast = (msg: string, type: "ok" | "err" | "info" = "ok") => setToast({ msg, type });

  useEffect(() => { if (!cspmLoading && !cspmError) setLastScanned(new Date()); }, [cspmLoading, cspmError]);

  // ── Extra cloud data — fetched from API ─────────────────────────────────────
  const [cspmServices,     setCspmServices]     = useState<any[]>([]);
  const [saasIntegrations, setSaasIntegrations] = useState<any[]>([]);
  const [findingsByApp,    setFindingsByApp]    = useState<any[]>([]);
  const [ciemClouds,       setCiemClouds]       = useState<any[]>([]);
  const [excessivePerms,   setExcessivePerms]   = useState<any[]>([]);
  const [clusters,         setClusters]         = useState<any[]>([]);
  const [topVulnImages,    setTopVulnImages]    = useState<any[]>([]);
  const [runtimeThreats,   setRuntimeThreats]   = useState<any[]>([]);
  const [exposureInsights, setExposureInsights] = useState<any[]>([]);
  const [topAttackPaths,     setTopAttackPaths]     = useState<any[]>([]);
  const [sspmApps,           setSspmApps]           = useState<any[]>([]);
  const [cloudIntegrations,  setCloudIntegrations]  = useState<any[]>([]);
  const [integrationsLoaded, setIntegrationsLoaded] = useState(false);

  useEffect(() => {
    const tok = getStoredToken();
    if (!tok) return;
    const H = { Authorization: `Bearer ${tok}` };
    const fetchArr = (url: string, setter: (d: any[]) => void) =>
      fetch(url, { headers: H }).then(r=>r.ok?r.json():[]).then((d:any[])=>Array.isArray(d)&&setter(d)).catch(()=>{});
    fetchArr("/api/cloudops/cspm-services",     setCspmServices);
    fetchArr("/api/cloudops/saas-integrations", setSaasIntegrations);
    fetchArr("/api/cloudops/findings-by-app",   setFindingsByApp);
    fetchArr("/api/cloudops/ciem-clouds",        setCiemClouds);
    fetchArr("/api/cloudops/excessive-perms",    setExcessivePerms);
    fetchArr("/api/cloudops/clusters",           setClusters);
    fetchArr("/api/cloudops/vuln-images",        setTopVulnImages);
    fetchArr("/api/cloudops/runtime-threats",    setRuntimeThreats);
    fetchArr("/api/cloudops/exposure-insights",  setExposureInsights);
    fetchArr("/api/cloudops/attack-paths",       setTopAttackPaths);
    fetchArr("/api/cloudops/sspm-apps",          d => setSspmApps(d.length > 0 ? d : []));
    fetch("/api/cloudops/cloud-integrations", { headers: H })
      .then(r => r.ok ? r.json() : [])
      .then((d: any[]) => { setCloudIntegrations(Array.isArray(d) ? d : []); setIntegrationsLoaded(true); })
      .catch(() => setIntegrationsLoaded(true));
  }, []);

  const handleConnectProvider = async (provider: string) => {
    const tok = getStoredToken();
    if (!tok) return;
    try {
      const res = await fetch("/api/cloudops/cloud-integrations", {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
        body: JSON.stringify({ provider, accountName: `${provider} Account` }),
      });
      if (res.ok) {
        const row = await res.json();
        setCloudIntegrations(prev => [...prev, row]);
        showToast(`${provider} connected successfully`, "ok");
      }
    } catch { showToast("Failed to connect provider", "err"); }
  };

  const handleDisconnectProvider = async (id: number) => {
    const tok = getStoredToken();
    if (!tok) return;
    try {
      await fetch(`/api/cloudops/cloud-integrations/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${tok}` },
      });
      setCloudIntegrations(prev => prev.filter(i => i.id !== id));
      showToast("Provider disconnected", "info");
    } catch { showToast("Failed to disconnect provider", "err"); }
  };

  const isCloudConnected = integrationsLoaded && cloudIntegrations.length > 0;

  const handleRunScan = () => {
    setScanning(true);
  };
  const handleScanDone = () => {
    setScanning(false);
    qc.invalidateQueries({ queryKey: ["cspm"] });
    setLastScanned(new Date());
    showToast("Scan complete — data refreshed", "ok");
  };

  const handleUpdateFindingStatus = (id: string, status: string) => {
    updateFindingStatusMutation.mutate(
      { id, status },
      {
        onSuccess: () => showToast(`Finding status updated → ${status}`, "ok"),
        onError:   () => showToast("Failed to update finding status", "err"),
      }
    );
  };

  const handleAcknowledgeDrift = async (id: string) => {
    const token = getStoredToken();
    if (!token) return;
    try {
      const res = await fetch(`/api/cspm/drift/${encodeURIComponent(id)}/acknowledge`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      qc.invalidateQueries({ queryKey: ["cspm", "drift"] });
      showToast("Drift event acknowledged", "ok");
    } catch {
      showToast("Failed to acknowledge drift", "err");
    }
  };

  const openFindings = findings.filter(f => f.status === "open").length;
  const unackedDrift = drift.filter(d => !d.acknowledged).length;
  const totalResources = stats?.totalResources ?? resources.length;
  const critResources = resources.filter(r => r.risk === "Critical").length;

  const TABS = [
    { key: "overview",    label: "Overview",          count: 0 },
    { key: "cspm",        label: "CSPM",              count: stats?.findings?.open ?? openFindings, dot: RED },
    { key: "sspm",        label: "SSPM",              count: viewTenantId === 1 ? 16 : 0, dot: viewTenantId === 1 ? RED : undefined },
    { key: "ciem",        label: "CIEM",              count: viewTenantId === 1 ? 23 : 0, dot: viewTenantId === 1 ? RED : undefined },
    { key: "cnspm",       label: "CNSPM",             count: viewTenantId === 1 ? 5  : 0, dot: viewTenantId === 1 ? RED : undefined },
    { key: "attack",      label: "ASM",               count: viewTenantId === 1 ? 5  : 0, dot: viewTenantId === 1 ? RED : undefined },
    { key: "threatintel", label: "Threat Intel",      count: viewTenantId === 1 ? 4  : 0, dot: viewTenantId === 1 ? RED : undefined },
    { key: "cwpp",        label: "Workload (CWPP)",   count: viewTenantId === 1 ? 6  : 0, dot: viewTenantId === 1 ? RED : undefined },
    { key: "secrets",     label: "SCPM",              count: viewTenantId === 1 ? 8  : 0, dot: viewTenantId === 1 ? RED : undefined },
    { key: "aispm",       label: "AISPM",             count: viewTenantId === 1 ? 5  : 0, dot: viewTenantId === 1 ? RED : undefined },
    { key: "cloudcompliance", label: "Cloud Compliance", count: viewTenantId === 1 ? 14 : 0, dot: viewTenantId === 1 ? RED : undefined },
    { key: "remediation", label: "Remediation Hub",   count: viewTenantId === 1 ? 10 : 0, dot: viewTenantId === 1 ? AMB : undefined },
  ];

  const providerData = (["AWS", "Azure", "GCP"] as const).map(p => ({
    p, count: stats?.byProvider?.[p] ?? PROVIDER_RESOURCES[p],
    critical: findings.filter(f => f.provider === p && f.severity === "Critical").length || (getProviderCounts().find(pc => pc.p === p)?.crit ?? 0),
    color: providerColors[p],
  }));

  return (
    <>
      <style>{`
        @keyframes pulse { 0%,100% { opacity:0.3; transform:scale(0.8); } 50% { opacity:1; transform:scale(1.2); } }
        @keyframes slideUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
      `}</style>

      {scanning && <ScanOverlay onDone={handleScanDone} />}
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
      {cspmError && (
        <div style={{ background: "rgba(220,38,38,0.08)", borderBottom: "1px solid rgba(220,38,38,0.2)", padding: "8px 20px", fontSize: 12, color: "#DC2626", fontWeight: 600 }}>
          ⚠ Failed to load cloud security data — check API connectivity
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        <ModuleHeader
          title="CloudOps — CNAPP · CSPM · SSPM · CIEM · CWPP · AISPM"
          description={`${(stats?.totalResources ?? ENT_TOTAL_RESOURCES).toLocaleString()} Resources · CSPM · SSPM · CIEM · Container · Attack Surface · Threat Intel · Workload · SCPM · AISPM · Remediation`}
          badge={{ label: `${stats?.findings?.open ?? openFindings} Active Findings`, color: RED, bg: "rgba(248,113,113,0.08)" }}
          action={{ label: "🔍 Run Full Scan", onClick: handleRunScan }}
        />
        <SubNav tabs={TABS} active={tab} onSelect={setTab} />
        <AICopilotBar module="cloudops" />

        {lastScanned && (
          <div style={{ padding: "4px 20px", background: "rgba(52,211,153,0.06)", borderBottom: "1px solid rgba(52,211,153,0.12)", fontSize: 10, color: "rgba(52,211,153,0.7)", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: EME, display: "inline-block" }} />
            Last scanned: {lastScanned.toLocaleTimeString()} — {(stats?.totalResources ?? ENT_TOTAL_RESOURCES).toLocaleString()} resources across 3 providers (AWS · Azure · GCP)
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>

          {/* ── OVERVIEW ─────────────────────────────────────────── */}
          {tab === "overview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

              {/* Top KPI row — always visible */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12 }}>
                {([
                  { label: "Total Resources",   value: (stats?.totalResources ?? (isCloudConnected ? ENT_TOTAL_RESOURCES : 0)).toLocaleString(), sub: "Across connected providers",   color: NAV,    onClick: () => { setTab("cspm"); setCspmSubTab("resources"); } },
                  { label: "Security Score",    value: isCloudConnected ? `${stats?.complianceScore ?? ENT_SCORE}/100` : "—",                    sub: "Cloud posture score",          color: isCloudConnected ? ((stats?.complianceScore ?? ENT_SCORE) >= 75 ? EME : (stats?.complianceScore ?? ENT_SCORE) >= 60 ? AMB : RED) : "var(--muted-foreground)", onClick: () => { setTab("cspm"); setCspmSubTab("posture"); } },
                  { label: "Critical Findings", value: (stats?.findings?.critical ?? (isCloudConnected ? ENT_CRITICAL : 0)).toLocaleString(),    sub: "Require immediate action",     color: RED,    onClick: () => { setTab("cspm"); setCspmSubTab("findings"); } },
                  { label: "Config Drifts",     value: (unackedDrift || (isCloudConnected ? stats?.driftItems || 0 : 0)).toString(),             sub: "Unacknowledged drift events",  color: unackedDrift > 0 ? RED : AMB, onClick: () => { setTab("cspm"); setCspmSubTab("drift"); } },
                  { label: "Active Modules",    value: TABS.filter(t => t.key !== "overview" && t.count > 0).length.toString(),                  sub: `of ${TABS.length - 1} licensed`, color: EME,  onClick: () => {} },
                ] as any[]).map(k => (
                  <div key={k.label} onClick={k.onClick}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(147,197,253,0.35)")}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
                    style={{ ...card({ padding: "16px 18px", cursor: "pointer" }) }}>
                    <div style={{ fontSize: 22, fontWeight: 900, fontFamily: "monospace", color: k.color, marginBottom: 4 }}>{k.value}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--foreground)", marginBottom: 3 }}>{k.label}</div>
                    <div style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{k.sub}</div>
                  </div>
                ))}
              </div>

              {/* Submodule status grid */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.6px", marginBottom: 10, textTransform: "uppercase" }}>Submodule Status</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10 }}>
                  {([
                    { key: "cspm",        label: "CSPM",              icon: "🛡", desc: "Cloud infra posture",          count: stats?.findings?.open ?? openFindings,                                          dot: (stats?.findings?.open ?? openFindings) > 0 ? RED : EME,    licensed: isSubModuleLicensed("secops","sec.cspm") },
                    { key: "sspm",        label: "SSPM",              icon: "☁", desc: "SaaS security posture",        count: viewTenantId === 1 ? sspmApps.length || 16 : 0,                                  dot: viewTenantId === 1 ? AMB : undefined,                        licensed: isSubModuleLicensed("secops","sec.sspm") },
                    { key: "ciem",        label: "CIEM",              icon: "🔑", desc: "Identity entitlement mgmt",   count: viewTenantId === 1 ? ciemClouds.length || 23 : 0,                                dot: viewTenantId === 1 ? RED : undefined,                        licensed: isSubModuleLicensed("secops","sec.ciem") },
                    { key: "cnspm",       label: "CNSPM",             icon: "🔒", desc: "Network security posture",    count: viewTenantId === 1 ? 5 : 0,                                                     dot: viewTenantId === 1 ? AMB : undefined,                        licensed: isSubModuleLicensed("secops","sec.cnspm") },
                    { key: "attack",      label: "ASM",               icon: "🗺", desc: "Attack surface mapping",      count: viewTenantId === 1 ? topAttackPaths.length || 5 : 0,                            dot: viewTenantId === 1 ? RED : undefined,                        licensed: isSubModuleLicensed("secops","sec.asm") },
                    { key: "threatintel", label: "Threat Intel",      icon: "🕵", desc: "Threat intelligence feeds",   count: viewTenantId === 1 ? 4 : 0,                                                     dot: viewTenantId === 1 ? AMB : undefined,                        licensed: isSubModuleLicensed("secops","sec.threatintel") },
                    { key: "cwpp",        label: "CWPP",              icon: "📦", desc: "Workload & container prot.",  count: viewTenantId === 1 ? clusters.length || 6 : 0,                                  dot: viewTenantId === 1 ? RED : undefined,                        licensed: isSubModuleLicensed("secops","sec.cwpp") },
                    { key: "secrets",     label: "SCPM",              icon: "🔐", desc: "Secrets & code posture",      count: viewTenantId === 1 ? 8 : 0,                                                     dot: viewTenantId === 1 ? RED : undefined,                        licensed: isSubModuleLicensed("secops","sec.scpm") },
                    { key: "aispm",       label: "AISPM",             icon: "🤖", desc: "AI security posture mgmt",    count: viewTenantId === 1 ? 5 : 0,                                                     dot: viewTenantId === 1 ? AMB : undefined,                        licensed: isSubModuleLicensed("secops","sec.aispm") },
                    { key: "cloudcompliance", label: "Cloud Compliance", icon: "📋", desc: "Framework compliance posture", count: viewTenantId === 1 ? 14 : 0,                                                    dot: viewTenantId === 1 ? RED : undefined,                        licensed: true },
                    { key: "remediation", label: "Remediation Hub",   icon: "🔧", desc: "Consolidated remediation",    count: viewTenantId === 1 ? 10 : 0,                                                    dot: viewTenantId === 1 ? AMB : undefined,                        licensed: true },
                  ] as any[]).map(m => (
                    <div key={m.key} onClick={() => setTab(m.key)}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(147,197,253,0.3)")}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
                      style={{ ...card({ padding: "14px 14px 12px" }), cursor: "pointer", position: "relative", transition: "border-color 0.15s" }}>
                      {!m.licensed && (
                        <div style={{ position: "absolute", top: 6, right: 8, fontSize: 8, fontWeight: 700, color: "var(--muted-foreground)", background: "rgba(255,255,255,0.05)", borderRadius: 4, padding: "2px 5px", letterSpacing: "0.5px" }}>LOCKED</div>
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 18 }}>{m.icon}</span>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--foreground)" }}>{m.label}</div>
                          <div style={{ fontSize: 9, color: "var(--muted-foreground)", lineHeight: 1.3 }}>{m.desc}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {m.dot && <div style={{ width: 6, height: 6, borderRadius: "50%", background: m.dot, flexShrink: 0 }} />}
                        <span style={{ fontSize: 16, fontWeight: 900, fontFamily: "monospace", color: m.dot ?? "var(--muted-foreground)" }}>{m.count}</span>
                        <span style={{ fontSize: 9, color: "var(--muted-foreground)" }}>active items</span>
                      </div>
                      <div style={{ marginTop: 8, fontSize: 9, fontWeight: 700, color: NAV }}>View {m.label} →</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bottom charts — posture trend + severity mix + attack paths */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
                <div style={card({ padding:14 })}>
                  <div style={{ fontSize:11, fontWeight:700, color:NAV, marginBottom:10, letterSpacing:"0.5px" }}>SECURITY POSTURE TREND</div>
                  {isCloudConnected ? (<>
                    <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:8 }}>
                      <span style={{ fontSize:28, fontWeight:900, color:AMB, fontFamily:"monospace" }}>{stats?.complianceScore ?? ENT_SCORE}</span>
                      <span style={{ fontSize:12, color:"var(--muted-foreground)" }}>/100</span>
                      <span style={{ fontSize:11, color:EME, fontWeight:700 }}>↑ +4 pts</span>
                    </div>
                    <Sparkline data={scoreWeekly} color={AMB} w={240} h={44} />
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:9, color:"var(--muted-foreground)", marginTop:3 }}>
                      <span>Jan</span><span>Target: 85</span>
                    </div>
                  </>) : (
                    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"24px 0", gap:6 }}>
                      <div style={{ fontSize:24 }}>☁</div>
                      <div style={{ fontSize:10, color:"var(--muted-foreground)", textAlign:"center" }}>Connect cloud providers in CSPM to see posture score</div>
                      <button onClick={() => setTab("cspm")} style={{ marginTop:4, fontSize:10, fontWeight:700, color:NAV, background:"rgba(147,197,253,0.08)", border:"1px solid rgba(147,197,253,0.2)", borderRadius:6, padding:"5px 12px", cursor:"pointer", fontFamily:"inherit" }}>Go to CSPM →</button>
                    </div>
                  )}
                </div>
                <div style={card({ padding:14 })}>
                  <div style={{ fontSize:11, fontWeight:700, color:NAV, marginBottom:10, letterSpacing:"0.5px" }}>FINDING SEVERITY MIX</div>
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <div style={{ position:"relative", display:"inline-flex", alignItems:"center", justifyContent:"center" }}>
                      <MiniDonut segs={[
                        { v:stats?.findings?.critical ?? (isCloudConnected ? ENT_CRITICAL : 0), c:RED },
                        { v:stats?.findings?.high     ?? (isCloudConnected ? ENT_HIGH    : 0), c:AMB },
                        { v:stats?.findings?.medium   ?? (isCloudConnected ? ENT_MEDIUM  : 0), c:BLU },
                        { v:stats?.findings?.low      ?? 0, c:EME }
                      ]} size={80} thick={13} />
                      <div style={{ position:"absolute", textAlign:"center" }}>
                        <div style={{ fontSize:13, fontWeight:900, color:"var(--foreground)", fontFamily:"monospace" }}>{stats?.findings?.open ?? (isCloudConnected ? ENT_OPEN_FINDINGS : 0)}</div>
                        <div style={{ fontSize:8, color:"var(--muted-foreground)" }}>open</div>
                      </div>
                    </div>
                    <div style={{ flex:1 }}>
                      {([["Critical", stats?.findings?.critical ?? (isCloudConnected ? ENT_CRITICAL : 0), RED],["High", stats?.findings?.high ?? (isCloudConnected ? ENT_HIGH : 0), AMB],["Medium", stats?.findings?.medium ?? (isCloudConnected ? ENT_MEDIUM : 0), BLU],["Low", stats?.findings?.low ?? 0, EME]] as [string,number,string][]).map(([l,v,c]) => (
                        <div key={String(l)} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:5 }}>
                          <div style={{ width:8, height:8, borderRadius:"50%", background:c as string }} />
                          <span style={{ flex:1, fontSize:10, color:"var(--foreground)" }}>{l}</span>
                          <span style={{ fontSize:11, fontWeight:800, color:c as string, fontFamily:"monospace" }}>{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div style={card({ padding:14 })}>
                  <div style={{ fontSize:11, fontWeight:700, color:NAV, marginBottom:10, letterSpacing:"0.5px" }}>TOP ATTACK PATHS</div>
                  {topAttackPaths.length > 0 ? topAttackPaths.slice(0,3).map(ap => (
                    <div key={ap.id} onClick={() => setTab("attack")} style={{ marginBottom:7, padding:"7px 9px", borderRadius:7, border:`1px solid ${ap.sev==="Critical" ? RED : AMB}33`, background:`${ap.sev==="Critical" ? RED : AMB}08`, cursor:"pointer" }}>
                      <div style={{ fontSize:10, fontWeight:700, color:"var(--foreground)", marginBottom:3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{ap.title}</div>
                      <div style={{ display:"flex", gap:6 }}>
                        <span style={{ fontSize:9, color:ap.sev==="Critical" ? RED : AMB, fontWeight:700 }}>{ap.sev}</span>
                        <span style={{ fontSize:9, color:"var(--muted-foreground)" }}>CVSS {ap.cvss}</span>
                        <span style={{ fontSize:9, color:"var(--muted-foreground)" }}>{Array.isArray(ap.steps) ? ap.steps.length : ap.steps} hops</span>
                      </div>
                    </div>
                  )) : (
                    <div style={{ textAlign:"center", padding:"20px 0", color:"var(--muted-foreground)", fontSize:10 }}>No attack paths detected.</div>
                  )}
                  {topAttackPaths.length > 0 && <button onClick={() => setTab("attack")} style={{ width:"100%", marginTop:4, padding:"6px 0", borderRadius:6, border:"1px solid rgba(248,113,113,0.25)", background:"rgba(248,113,113,0.08)", fontSize:10, fontWeight:700, color:RED, cursor:"pointer", fontFamily:"inherit" }}>View All Attack Paths →</button>}
                </div>
              </div>
            </div>
          )}

          {tab === "cspm" && (!isSubModuleLicensed("secops", "sec.cspm") ? <LockedModule moduleKey="cspm" /> : (
            <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

              {/* ── Cloud Infrastructure Integration Banner ─────────── */}
              {!isCloudConnected ? (
                <div style={{ flexShrink: 0, padding: "0 24px 16px" }}>
                  <div style={{ background: "rgba(147,197,253,0.06)", border: "1px solid rgba(147,197,253,0.2)", borderRadius: 12, padding: "16px 20px" }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "rgb(147,197,253)", marginBottom: 4 }}>☁ Connect Cloud Infrastructure</div>
                    <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 14, lineHeight: 1.5 }}>
                      Connect AWS, Azure, or GCP to start scanning your cloud resources for misconfigurations and vulnerabilities. AIGO-X will automatically discover resources and surface critical findings.
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                      {([
                        { p: "AWS",   color: "#FF9900", desc: "EC2, S3, IAM, RDS, Lambda, EKS" },
                        { p: "Azure", color: "#0078D4", desc: "VMs, Storage, AD, AKS, SQL" },
                        { p: "GCP",   color: "#4285F4", desc: "GCE, GCS, GKE, BigQuery, IAM" },
                      ] as const).map(({ p, color, desc }) => (
                        <div key={p} onClick={() => handleConnectProvider(p)}
                          style={{ padding: "14px 12px", borderRadius: 10, border: `1px solid ${color}33`, background: `${color}0A`, cursor: "pointer", textAlign: "center", transition: "border-color 0.15s" }}
                          onMouseEnter={e => (e.currentTarget.style.borderColor = `${color}88`)}
                          onMouseLeave={e => (e.currentTarget.style.borderColor = `${color}33`)}>
                          <div style={{ fontSize: 16, fontWeight: 900, color, marginBottom: 3 }}>{p}</div>
                          <div style={{ fontSize: 9, color: "var(--muted-foreground)", lineHeight: 1.5, marginBottom: 8 }}>{desc}</div>
                          <div style={{ fontSize: 10, fontWeight: 700, color, background: `${color}18`, borderRadius: 6, padding: "4px 0" }}>+ Connect</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ flexShrink: 0, padding: "0 24px 10px" }}>
                  <div style={{ background: "rgba(52,211,153,0.05)", border: "1px solid rgba(52,211,153,0.18)", borderRadius: 8, padding: "9px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: "#34D399" }}>☁ {cloudIntegrations.length} Cloud Provider{cloudIntegrations.length > 1 ? "s" : ""} Connected</span>
                    <span style={{ color: "rgba(255,255,255,0.15)" }}>·</span>
                    <span style={{ fontSize: 10, color: "var(--muted-foreground)", flex: 1 }}>{cloudIntegrations.map(i => `${i.provider} (${i.accountId || i.accountName})`).join(" · ")}</span>
                    <div style={{ display: "flex", gap: 4 }}>
                      {cloudIntegrations.map(i => {
                        const pColors: Record<string, string> = { AWS: "#FF9900", Azure: "#0078D4", GCP: "#4285F4" };
                        return (
                          <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 5, background: `${pColors[i.provider] ?? "#6366F1"}18`, border: `1px solid ${pColors[i.provider] ?? "#6366F1"}33`, borderRadius: 6, padding: "3px 8px" }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: pColors[i.provider] ?? "#6366F1" }}>{i.provider}</span>
                            <button onClick={() => handleDisconnectProvider(i.id)} style={{ background: "none", border: "none", color: "var(--muted-foreground)", cursor: "pointer", fontSize: 11, lineHeight: 1, padding: 0 }} title="Disconnect">×</button>
                          </div>
                        );
                      })}
                      {(["AWS","Azure","GCP"] as const).filter(p => !cloudIntegrations.some(i => i.provider === p)).map(p => {
                        const pColors: Record<string,string> = { AWS: "#FF9900", Azure: "#0078D4", GCP: "#4285F4" };
                        return (
                          <button key={p} onClick={() => handleConnectProvider(p)}
                            style={{ background: "transparent", border: `1px dashed rgba(255,255,255,0.2)`, borderRadius: 6, padding: "3px 8px", fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", cursor: "pointer", fontFamily: "inherit" }}>
                            + {p}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* CSPM sub-nav */}
              <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", background: "var(--secondary)", padding: "0 24px", flexShrink: 0, overflowX: "auto", scrollbarWidth: "none" }}>
                {([
                  { key: "posture",   label: "Cloud Infra Posture", count: stats?.findings?.open ?? ENT_OPEN_FINDINGS,                                           dot: RED },
                  { key: "resources", label: "Resources",           count: stats?.totalResources ?? ENT_TOTAL_RESOURCES,                                         dot: AMB },
                  { key: "findings",  label: "CIS Findings",        count: (stats?.findings?.critical ?? ENT_CRITICAL) + (stats?.findings?.high ?? ENT_HIGH),   dot: RED },
                  { key: "drift",     label: "Drift Detection",     count: unackedDrift, dot: unackedDrift > 0 ? RED : undefined },
                ] as { key: "posture"|"resources"|"findings"|"drift"; label: string; count: number; dot?: string }[]).map(st => (
                  <button key={st.key} onClick={() => setCspmSubTab(st.key)} style={{
                    padding: "9px 16px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                    background: "none", border: "none",
                    borderBottom: `2px solid ${cspmSubTab === st.key ? NAV : "transparent"}`,
                    color: cspmSubTab === st.key ? NAV : "var(--muted-foreground)",
                    display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", transition: "color 0.15s",
                  }}>
                    {st.dot && cspmSubTab !== st.key && <div style={{ width: 5, height: 5, borderRadius: "50%", background: st.dot, flexShrink: 0 }} />}
                    {st.label}
                    <span style={{
                      background: cspmSubTab === st.key ? "rgba(99,179,237,0.12)" : "var(--border)",
                      color: cspmSubTab === st.key ? NAV : "var(--muted-foreground)",
                      border: `1px solid ${cspmSubTab === st.key ? "rgba(99,179,237,0.25)" : "var(--border)"}`,
                      borderRadius: 10, padding: "1px 6px", fontSize: 9, fontWeight: 700,
                    }}>{st.count}</span>
                  </button>
                ))}
              </div>
              {/* CSPM sub-tab content */}
              <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                {cspmSubTab === "posture"   && <CspmTab stats={stats} apiFindings={findings} />}
                {cspmSubTab === "resources" && <ResourcesTab resources={resources} />}
                {cspmSubTab === "findings"  && <CisFindingsTab findings={findings} onUpdateStatus={handleUpdateFindingStatus} />}
                {cspmSubTab === "drift"     && <DriftTab drift={drift} onAcknowledge={handleAcknowledgeDrift} />}
              </div>
            </div>
          ))}
          {tab === "sspm"        && (isSubModuleLicensed("secops","sec.sspm")       ? <SspmTab />           : <LockedModule moduleKey="sspm" />)}
          {tab === "ciem"        && (isSubModuleLicensed("secops","sec.ciem")       ? <CiemTab />           : <LockedModule moduleKey="ciem" />)}
          {tab === "cnspm"       && (isSubModuleLicensed("secops","sec.cnspm")      ? <CnspmTab />          : <LockedModule moduleKey="cnspm" />)}
          {tab === "attack"      && (isSubModuleLicensed("secops","sec.asm")        ? <AttackSurfaceTab />  : <LockedModule moduleKey="asm" />)}
          {tab === "threatintel" && (isSubModuleLicensed("secops","sec.threatintel")? <ThreatIntelTab />    : <LockedModule moduleKey="threatintel" />)}
          {tab === "cwpp"        && (isSubModuleLicensed("secops","sec.cwpp")       ? <CwppTab />           : <LockedModule moduleKey="cwpp" />)}
          {tab === "secrets"     && (isSubModuleLicensed("secops","sec.scpm")       ? <SecretsCodeTab />    : <LockedModule moduleKey="scpm" />)}
          {tab === "aispm"       && (isSubModuleLicensed("secops","sec.aispm")      ? <AispTab />           : <LockedModule moduleKey="aispm" />)}
          {tab === "cloudcompliance" && <CloudComplianceTab onNavigateCompliance={(_fw) => { window.location.hash = ""; window.location.pathname = window.location.pathname.replace(/\/[^/]*$/, "/complianceops"); }} />}
          {tab === "remediation" && <RemediationHubTab />}
        </div>
      </div>
    </>
  );
}
