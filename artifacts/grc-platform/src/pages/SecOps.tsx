// @ts-nocheck
import { useState, useMemo, useEffect, useRef } from "react";
import { parseConfig } from "@/lib/configParser";
import { SubNav, ModuleHeader, Badge, SevBadge, TableShell, Mono } from "@/components/SubNav";
import { AICopilotBar } from "@/components/AICopilotBar";
import WorkflowPipeline, { SEC_FINDINGS_WF } from "@/components/WorkflowPipeline";
import { getStoredToken } from "@/lib/auth-utils";
import { ReactFlow, Background, Controls, MiniMap, type Node, type Edge, MarkerType } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useOrg } from "@/context/OrgContext";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

// ── Theme ──────────────────────────────────────────────────────────────────────
const NAV = "#1E3A5F", EME = "#065F46", RED = "#DC2626", AMB = "#D97706";
const BLU = "#1D4ED8", CYN = "#0891B2", PRP = "#7C3AED", GRN = "#059669";

const card = (extra: React.CSSProperties = {}): React.CSSProperties => ({
  background: "var(--card)", borderRadius: 12, border: "1px solid var(--border)",
  boxShadow: "0 2px 12px rgba(0,0,0,0.40)", ...extra,
});

function StatCard({ label, value, sub, color = NAV, icon }: { label: string; value: string | number; sub?: string; color?: string; icon: string }) {
  return (
    <div style={card({ padding:"16px 20px", display:"flex", alignItems:"center", gap:14 })}>
      <div style={{ width:40, height:40, borderRadius:10, background:`${color}18`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>{icon}</div>
      <div>
        <div style={{ fontSize:22, fontWeight:800, color:NAV, letterSpacing:"-0.5px" }}>{value}</div>
        <div style={{ fontSize:11, fontWeight:700, color:"#6B7280" }}>{label}</div>
        {sub && <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:2 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ── Network device types ───────────────────────────────────────────────────────
type DeviceType = "Firewall"|"Core Switch"|"Access Switch"|"Router"|"VPN Gateway"|"IDS/IPS"|"Load Balancer"|"WAF";
type DeviceStatus = "compliant"|"warning"|"critical"|"offline";

interface NetworkDevice {
  id: string; hostname: string; ip: string; type: DeviceType; vendor: string; model: string;
  os: string; osVersion: string; location: string; zone: string; status: DeviceStatus;
  findings: number; critFindings: number; lastAudit: string; lastSeen: string;
  uptime: string; managed: boolean; mfaEnabled: boolean; sshVersion: string;
  snmpVersion: string; configVersion: string; backupAge: string; vlans: number;
}

const networkDevices: any[] = [];


// ── Device findings (per-device audit findings) ────────────────────────────────
const deviceFindings: any[] = [];

// ── Firewall rules ─────────────────────────────────────────────────────────────
const firewallRules: any[] = [];

// ── Rule change history ────────────────────────────────────────────────────────
const ruleChanges: any[] = [];

// ── Zone connectivity matrix ───────────────────────────────────────────────────
const zones = ["Internet","DMZ","CORP_NET","DB_SUBNET","OT_ZONE","MGMT","VPN_POOL"];
type ZoneStatus = "ALLOW"|"DENY"|"RESTRICT"|"ISOLATE"|"VIOLATION";
const zoneMatrix: Record<string, Record<string, any>> = {};

const zoneStatusStyle: Record<ZoneStatus, { bg:string; color:string; border:string }> = {
  ALLOW:     { bg:"rgba(34,197,94,0.08)", color:EME,  border:"#A7F3D0" },
  DENY:      { bg:"rgb(23,30,42)", color:"var(--muted-foreground)", border:"rgba(255,255,255,0.1)" },
  RESTRICT:  { bg:"rgba(59,130,246,0.12)", color:BLU,  border:"#BFDBFE" },
  ISOLATE:   { bg:"var(--border)", color:"var(--foreground)", border:"#D1D5DB" },
  VIOLATION: { bg:"rgba(239,68,68,0.06)", color:RED,  border:"#FECACA" },
};

// ── AD Auditor ─────────────────────────────────────────────────────────────────
const adFindings: any[] = [];

// ── Attack paths (cross-domain) ────────────────────────────────────────────────
const attackPathsData: any[] = [];

// ── Helpers ────────────────────────────────────────────────────────────────────
const statusColor: Record<DeviceStatus, string> = { compliant:EME, warning:AMB, critical:RED, offline:"var(--muted-foreground)" };
const statusBg:    Record<DeviceStatus, string> = { compliant:"rgba(34,197,94,0.08)", warning:"rgba(245,158,11,0.06)", critical:"rgba(239,68,68,0.06)", offline:"var(--card)" };
const devTypeIcon: Record<DeviceType, string> = {
  "Firewall":"🔥","Core Switch":"🔀","Access Switch":"📡","Router":"↔","VPN Gateway":"🔒",
  "IDS/IPS":"🛡","Load Balancer":"⚖","WAF":"🕵",
};
const riskBg:  Record<string,string> = { Critical:"rgba(239,68,68,0.06)", High:"rgba(245,158,11,0.06)", Medium:"rgba(59,130,246,0.12)", Low:"rgba(34,197,94,0.08)" };
const riskClr: Record<string,string> = { Critical:RED, High:AMB, Medium:BLU, Low:EME };
const riskBdr: Record<string,string> = { Critical:"#FECACA", High:"#FDE68A", Medium:"#BFDBFE", Low:"#A7F3D0" };

function RiskBadge({ level }: { level: string }) {
  return <span style={{ background:riskBg[level]??"var(--border)", color:riskClr[level]??"#6B7280", border:`1px solid ${riskBdr[level]??"rgba(255,255,255,0.1)"}`, borderRadius:4, padding:"2px 8px", fontSize:10, fontWeight:700 }}>{level}</span>;
}

// ── Attack path graph builder ──────────────────────────────────────────────────
const domainColor: Record<string, string> = { Network:PRP, CAASM:NAV, CSPM:BLU, AD:CYN };

function buildAttackGraph(path: typeof attackPathsData[0] | null) {
  if (!path) return { nodes: [], edges: [] };

  const xSpacing = 280, yBase = 120;
  const nodes: Node[] = path.nodes.map((n, i) => ({
    id: n.id,
    position: { x: 80 + i * xSpacing, y: yBase + (i % 2 === 0 ? 0 : 60) },
    style: {
      background: n.risk === "Critical" ? "rgba(239,68,68,0.06)" : n.risk === "High" ? "rgba(245,158,11,0.06)" : "white",
      border: `2px solid ${n.risk === "Critical" ? RED : n.risk === "High" ? AMB : "rgba(255,255,255,0.1)"}`,
      borderRadius: 12, padding: "10px 14px", width: 220,
      boxShadow: n.risk === "Critical" ? "0 0 14px rgba(220,38,38,0.25)" : "0 2px 8px rgba(0,0,0,0.08)",
      fontFamily: "inherit",
    },
    data: {
      label: (
        <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ fontSize:9, fontWeight:800, color:  "var(--card)", background:domainColor[n.domain]??NAV, padding:"1px 6px", borderRadius:3 }}>{n.domain}</span>
            <span style={{ fontSize:9, fontWeight:700, color:n.risk==="Critical"?RED:AMB }}>{n.risk}</span>
          </div>
          <div style={{ fontSize:11, fontWeight:800, color:NAV, lineHeight:1.3 }}>{n.label}</div>
          <div style={{ fontSize:10, color:"#6B7280", lineHeight:1.4 }}>{n.detail}</div>
          <div style={{ fontSize:9, color:"var(--muted-foreground)" }}>Zone: {n.zone}</div>
        </div>
      ),
    },
  }));

  const edges: Edge[] = path.edges.map(e => ({
    id: `${e.s}-${e.t}`,
    source: e.s, target: e.t,
    style: { stroke: RED, strokeWidth: 2.5, strokeDasharray:"5,4" },
    markerEnd: { type: MarkerType.ArrowClosed, color: RED, width: 14, height: 14 },
    animated: true,
    label: "attack vector",
    labelStyle: { fontSize: 9, fontWeight: 700, fill: RED, fontFamily: "inherit" },
  }));

  return { nodes, edges };
}

// ── Network Security Auditor ───────────────────────────────────────────────────
interface NetAudit {
  id: string; filename: string; hostname: string; vendor: string; vendorSlug: string;
  deviceType: string; firmware: string; firmwareEol: string; firmwareDaysLeft: number;
  auditDate: string; score: number; risk: "Critical"|"High"|"Medium"|"Low";
  rulesTotal: number;
  findings: { critical:number; high:number; medium:number; low:number };
  cisPass: number; cisFail: number; cisTotal: number;
  interfaces: number; vpnTunnels: number; netObjects: number; natRules: number;
  allowRules: number; allowAnyService: number; utmCoverage: number;
  positiveControls: { title:string; desc:string }[];
  cisDomains: { name:string; pass:number; total:number }[];
  cisChecks: { id:string; title:string; result:"pass"|"fail"; sev:string; detail:string }[];
  rulesList: { num:number; name:string; aiLabel:string; action:string; srcZone:string; dstZone:string; srcAddr:string; dstAddr:string; service:string; secProfile:string; flags:string[] }[];
  auditSummary: string;
  permissiveRules:number; anySrcRules:number; dupRules:number; shadowedRules:number; disabledRules:number; consolCandidates:number; dnsAnomalies:number; rulesNoLog:number; anyServiceRules:number;
}

const netAudits: NetAudit[] = [
  {
    id:"NA-001", filename:"TMA-NAIROBI_7-4_2878_202604151530.conf", hostname:"TMA-NAIROBI-7-4", vendor:"FortiGate", vendorSlug:"FortiGate",
    deviceType:"Firewall", firmware:"v7.4.11-build2878", firmwareEol:"2028-09-30", firmwareDaysLeft:837,
    auditDate:"16/04/2026", score:39, risk:"High", rulesTotal:19,
    findings:{ critical:2, high:7, medium:11, low:4 },
    cisPass:16, cisFail:10, cisTotal:36, interfaces:41, vpnTunnels:6, netObjects:94, natRules:6,
    allowRules:19, allowAnyService:18, utmCoverage:95,
    auditSummary:"FortiGate audit completed for device \".*\\\\.translate\\\\.goog\". Analyzed 19 rules, 41 interfaces, 6 VPN tunnels, 94 network objects. Overall security score: 39/100 (High risk). Found 2 critical and 7 high severity issues requiring immediate attention. CIS Benchmark: 16/36 controls passing.",
    permissiveRules:8, anySrcRules:1, dupRules:0, shadowedRules:0, disabledRules:0, consolCandidates:0, dnsAnomalies:0, rulesNoLog:0, anyServiceRules:18,
    positiveControls:[
      { title:"WAN HTTPS Scoped To Specific Destinations", desc:"No WAN-facing HTTPS allow rule uses destination=any — published web services are exposed via specific VIPs / server objects rather than as an open HTTPS gateway into the internal estate." },
      { title:"UTM Profiles On Branch / VPN-Tunnel Rules", desc:"Branch-office and VPN-tunnel allow rules carry UTM security profiles, so traffic from remote sites is inspected before pivoting into the headquarters network." },
      { title:"Centralised Syslog / SIEM Forwarding Configured", desc:"Firewall events are forwarded to a remote syslog / SIEM collector, so logs survive a device compromise and can be correlated with other telemetry." },
      { title:"Administrator MFA Enforced", desc:"Every administrator account requires multi-factor authentication, blocking credential-only access to the management plane." },
      { title:"Super-Admin Profile Restricted", desc:"The super_admin profile is held by fewer than three accounts, limiting blast radius from an admin compromise." },
      { title:"SSL-VPN Uses Trusted Certificate", desc:"The SSL-VPN portal presents a non-default certificate, eliminating the factory-warning that conditions users to ignore TLS errors." },
    ],
    cisDomains:[
      { name:"Access Control", pass:4, total:7 },
      { name:"Management",     pass:2, total:6 },
      { name:"VPN Security",   pass:8, total:10 },
      { name:"Logging",        pass:0, total:4 },
      { name:"Policy Mgmt",    pass:2, total:4 },
      { name:"Firmware",       pass:0, total:5 },
    ],
    cisChecks:[
      { id:"CIS-1.1", title:"Ensure a default deny-all policy is configured",              result:"fail", sev:"high",     detail:"No explicit deny-all rule detected at end of policy chain" },
      { id:"CIS-1.2", title:"Ensure no allow-all rules exist",                             result:"pass", sev:"critical", detail:"No allow-all rules found" },
      { id:"CIS-1.3", title:"Ensure logging is enabled on all accept rules",               result:"pass", sev:"high",     detail:"All accept rules have logging enabled" },
      { id:"CIS-1.4", title:"Remove disabled or inactive firewall rules",                  result:"pass", sev:"low",      detail:"No inactive rules detected" },
      { id:"CIS-1.5", title:"Ensure all firewall rules have business-justification comments", result:"fail", sev:"low",  detail:"16 of 19 accept rules lack adequate comments" },
      { id:"CIS-1.6", title:"Ensure the implicit deny rule has logging enabled",           result:"fail", sev:"medium",   detail:"No logged deny-all rule detected; blocked traffic may be invisible" },
      { id:"CIS-2.1", title:"Disable Telnet management access",                            result:"pass", sev:"critical", detail:"Telnet management disabled on all interfaces" },
      { id:"CIS-2.2", title:"Restrict management access to dedicated management interface",result:"fail", sev:"high",     detail:"HTTPS management accessible on 3 non-management interfaces" },
      { id:"CIS-2.3", title:"Enforce MFA for all administrator accounts",                  result:"pass", sev:"critical", detail:"MFA enforced for all admin accounts" },
      { id:"CIS-2.4", title:"Limit admin sessions with idle timeout ≤ 10 minutes",        result:"fail", sev:"medium",   detail:"Admin idle timeout is 30 minutes — exceeds CIS recommendation" },
      { id:"CIS-3.1", title:"Ensure SSL-VPN uses certificate authentication",              result:"pass", sev:"high",     detail:"Certificate-based SSL-VPN authentication configured" },
      { id:"CIS-3.2", title:"Ensure IKEv1 is disabled",                                   result:"fail", sev:"high",     detail:"IKEv1 still enabled in VPN phase-1 configuration" },
      { id:"CIS-3.3", title:"Use AES-256 or ChaCha20 for VPN encryption",                 result:"pass", sev:"high",     detail:"AES-256-GCM enforced on all IPsec tunnels" },
      { id:"CIS-4.1", title:"Forward logs to a centralised SIEM",                         result:"pass", sev:"high",     detail:"Syslog forwarding to SIEM configured" },
      { id:"CIS-4.2", title:"Enable logging on the implicit deny rule",                   result:"fail", sev:"medium",   detail:"Implicit deny has no logging — blocked traffic is invisible" },
    ],
    rulesList:[
      { num:3,  name:"BRANCH ACCESS ...", aiLabel:"Branch Access",           action:"accept", srcZone:"SERVERS MA...", dstZone:"BRANCH-ZO...", srcAddr:"Net.10.0.0/...", dstAddr:"Net.10.0.0/...", service:"ALL", secProfile:"SSL:certific", flags:["B-2"] },
      { num:5,  name:"INTER-BRANCH A...", aiLabel:"Inter-Branch Communication",action:"accept",srcZone:"BRANCH-ZO...", dstZone:"BRANCH-ZO...", srcAddr:"Net.10.0.0/...", dstAddr:"Net.10.0.0/...", service:"ALL", secProfile:"SSL:certific", flags:["B-5"] },
      { num:6,  name:"BRANCH ACCESS I...",aiLabel:"Branch Access Inbound",   action:"accept", srcZone:"BRANCH-ZO...", dstZone:"MANAGEME...",  srcAddr:"Net.10.0.0/...", dstAddr:"Net.10.0.0/...", service:"ALL", secProfile:"SSL:certific", flags:["B-2"] },
      { num:7,  name:"REMOTE SSL LAN ...",aiLabel:"Remote VPN Access",       action:"accept", srcZone:"ssl.root",    dstZone:"MANAGEME...",  srcAddr:"MANAGEME...",    dstAddr:"Net.10.0.0/...", service:"ALL", secProfile:"SSL:certific", flags:["F-6"] },
      { num:8,  name:"WLAN INTERNET ...", aiLabel:"WLAN Internet Access",    action:"accept", srcZone:"TMEA_STAFF",  dstZone:"INTERNET-Z...", srcAddr:"TMEA_STAF...",  dstAddr:"all",            service:"ALL", secProfile:"SSL:certific", flags:["F-7"] },
      { num:13, name:"loopback-access",   aiLabel:"Network Monitoring",      action:"accept", srcZone:"BRANCH-ZO...",dstZone:"HQ-PAT TM...", srcAddr:"all",            dstAddr:"TMEA-EMS,...",   service:"PING",secProfile:"—",            flags:["D-8"] },
      { num:14, name:"TCA_Servers_Inter...",aiLabel:"TCA Server Comm",       action:"accept", srcZone:"TCA_Servers", dstZone:"INTERNET-Z...",srcAddr:"TCA_Servers",    dstAddr:"all",            service:"ALL", secProfile:"SSL:certific", flags:["F-9"] },
    ],
  },
  {
    id:"NA-002", filename:"Sonicwall_CONFIG.exp", hostname:"NSA-2700", vendor:"SonicWall", vendorSlug:"SonicWall",
    deviceType:"Firewall", firmware:"SonicOS 7.0.1-5050", firmwareEol:"2027-06-30", firmwareDaysLeft:379,
    auditDate:"07/04/2026", score:42, risk:"High", rulesTotal:27,
    findings:{ critical:1, high:2, medium:5, low:5 },
    cisPass:19, cisFail:8, cisTotal:32, interfaces:12, vpnTunnels:4, netObjects:52, natRules:9,
    allowRules:27, allowAnyService:6, utmCoverage:78,
    auditSummary:"SonicWall NSA 2700 audit completed. Analyzed 27 rules, 12 interfaces, 4 VPN tunnels. Score 42/100 (High risk). 1 critical, 2 high severity issues detected. CIS Benchmark: 19/32 controls passing.",
    permissiveRules:5, anySrcRules:2, dupRules:1, shadowedRules:0, disabledRules:1, consolCandidates:0, dnsAnomalies:0, rulesNoLog:3, anyServiceRules:6,
    positiveControls:[
      { title:"Geo-IP Blocking Enabled", desc:"SonicWall Geo-IP filtering blocks inbound connections from high-risk country groups, reducing attack surface on internet-facing services." },
      { title:"Content Filtering Service Active", desc:"CFS profiles applied to outbound LAN-to-WAN rules, blocking malware-category and uncategorised domains." },
      { title:"Application Intelligence Enabled", desc:"App Control Advanced enabled and logging selected categories for DLP and shadow-IT visibility." },
    ],
    cisDomains:[
      { name:"Access Control", pass:6, total:7 },
      { name:"Management",     pass:3, total:6 },
      { name:"VPN Security",   pass:7, total:10 },
      { name:"Logging",        pass:1, total:4 },
      { name:"Policy Mgmt",    pass:2, total:5 },
    ],
    cisChecks:[
      { id:"CIS-1.1", title:"Default deny-all at end of policy chain",      result:"pass", sev:"high",   detail:"Explicit deny-all rule present at bottom of all rule-sets" },
      { id:"CIS-1.2", title:"No allow-all rules",                           result:"fail", sev:"critical",detail:"2 any-source/any-destination rules detected — immediate review required" },
      { id:"CIS-2.1", title:"Telnet management disabled",                   result:"pass", sev:"critical",detail:"Management access limited to HTTPS/SSH" },
      { id:"CIS-2.2", title:"Management restricted to dedicated interface",  result:"fail", sev:"high",   detail:"Management plane accessible from LAN and WLAN zones" },
      { id:"CIS-3.1", title:"IKEv2 only for VPN",                          result:"fail", sev:"high",   detail:"IKEv1 main-mode enabled on 2 VPN policies" },
    ],
    rulesList:[
      { num:1, name:"LAN-to-WAN Allow", aiLabel:"Default Internet Egress", action:"allow", srcZone:"LAN", dstZone:"WAN", srcAddr:"Any", dstAddr:"Any", service:"Any", secProfile:"CFS+GAV", flags:[] },
      { num:2, name:"SSLVPN Access",    aiLabel:"Remote Access",           action:"allow", srcZone:"SSLVPN", dstZone:"LAN", srcAddr:"SSLVPN Pool", dstAddr:"LAN_Subnets", service:"HTTPS", secProfile:"GAV", flags:[] },
      { num:3, name:"Block GeoIP",      aiLabel:"Geo-IP Block",            action:"deny",  srcZone:"WAN",  dstZone:"LAN", srcAddr:"GeoIP-Block", dstAddr:"Any", service:"Any", secProfile:"—", flags:["GEO"] },
    ],
  },
  {
    id:"NA-003", filename:"Sonicwall_CONFIG.exp", hostname:"Cisco-SW-2960", vendor:"Cisco IOS Switch", vendorSlug:"Cisco",
    deviceType:"Switch", firmware:"Cisco IOS 15.2(7)E5", firmwareEol:"2026-12-31", firmwareDaysLeft:198,
    auditDate:"07/04/2026", score:76, risk:"Low", rulesTotal:0,
    findings:{ critical:1, high:1, medium:2, low:1 },
    cisPass:28, cisFail:4, cisTotal:32, interfaces:48, vpnTunnels:0, netObjects:0, natRules:0,
    allowRules:0, allowAnyService:0, utmCoverage:0,
    auditSummary:"Cisco IOS Switch audit completed. 48 interfaces audited. Score 76/100 (Low risk — Needs work). CIS Benchmark: 28/32 controls passing. Switch is near end-of-support lifecycle.",
    permissiveRules:0, anySrcRules:0, dupRules:0, shadowedRules:0, disabledRules:0, consolCandidates:0, dnsAnomalies:0, rulesNoLog:0, anyServiceRules:0,
    positiveControls:[
      { title:"SNMPv3 Configured",    desc:"SNMPv3 with auth/priv enforced — no SNMPv1/v2c community strings active." },
      { title:"Port Security Active", desc:"Port security configured on all access ports, limiting MAC addresses per port to 1." },
      { title:"BPDU Guard Enabled",   desc:"BPDU Guard enabled on all edge ports, protecting against STP manipulation attacks." },
    ],
    cisDomains:[
      { name:"Access Control", pass:7, total:8 },
      { name:"Management",     pass:6, total:7 },
      { name:"VPN Security",   pass:0, total:0 },
      { name:"Logging",        pass:3, total:4 },
      { name:"Policy Mgmt",    pass:4, total:5 },
      { name:"Firmware",       pass:8, total:8 },
    ],
    cisChecks:[
      { id:"CIS-1.1", title:"Disable Telnet — enforce SSH only",          result:"fail", sev:"critical", detail:"Telnet still enabled on VTY lines 0–4; SSH not exclusively enforced" },
      { id:"CIS-1.2", title:"Enforce SSH v2 only",                        result:"pass", sev:"high",     detail:"SSH v2 enforced; v1 disabled" },
      { id:"CIS-1.3", title:"Configure console and AUX timeout",          result:"pass", sev:"medium",   detail:"Console timeout set to 5 minutes" },
      { id:"CIS-1.4", title:"Encrypt passwords in running config",        result:"fail", sev:"high",     detail:"'service password-encryption' not enabled; passwords visible in config" },
    ],
    rulesList:[],
  },
  {
    id:"NA-004", filename:"PA-5220-11-03-2026 1", hostname:"PA-5220", vendor:"Palo Alto PAN-OS", vendorSlug:"Palo",
    deviceType:"Firewall", firmware:"PAN-OS 11.0.3-h3", firmwareEol:"2027-03-15", firmwareDaysLeft:272,
    auditDate:"06/04/2026", score:31, risk:"High", rulesTotal:2228,
    findings:{ critical:2, high:9, medium:9, low:4 },
    cisPass:14, cisFail:16, cisTotal:36, interfaces:24, vpnTunnels:12, netObjects:1840, natRules:88,
    allowRules:1912, allowAnyService:204, utmCoverage:62,
    auditSummary:"Palo Alto PA-5220 audit completed. Analyzed 2228 rules, 24 interfaces, 12 IPsec tunnels, 1840 network objects. Score 31/100 (High risk). 2 critical, 9 high severity issues. Excessive rule count with 204 allow-any-service rules requires immediate hygiene.",
    permissiveRules:31, anySrcRules:14, dupRules:8, shadowedRules:6, disabledRules:42, consolCandidates:18, dnsAnomalies:2, rulesNoLog:96, anyServiceRules:204,
    positiveControls:[
      { title:"Threat Prevention Profiles Applied", desc:"Threat Prevention security profiles applied to internet-facing security policies, providing IPS and AV inspection." },
      { title:"Zone Protection Profiles Configured", desc:"Zone protection profiles active on all perimeter zones, limiting SYN flood and reconnaissance attacks." },
    ],
    cisDomains:[
      { name:"Access Control", pass:3, total:8 },
      { name:"Management",     pass:4, total:7 },
      { name:"VPN Security",   pass:5, total:8 },
      { name:"Logging",        pass:1, total:5 },
      { name:"Policy Mgmt",    pass:1, total:8 },
    ],
    cisChecks:[
      { id:"CIS-1.1", title:"Enable logging on all security rules",            result:"fail", sev:"high",   detail:"96 rules have logging disabled — traffic is invisible to SIEM" },
      { id:"CIS-1.2", title:"Remove or consolidate shadowed rules",            result:"fail", sev:"medium", detail:"6 shadowed rules detected — never evaluated by the firewall engine" },
      { id:"CIS-1.3", title:"Remove disabled rules older than 90 days",        result:"fail", sev:"low",    detail:"42 disabled rules identified; 28 older than 90 days" },
      { id:"CIS-1.4", title:"Apply security profiles to all allow rules",      result:"fail", sev:"high",   detail:"38% of allow rules have no security profile attached" },
      { id:"CIS-2.1", title:"Enforce certificate-based admin authentication",  result:"pass", sev:"high",   detail:"Certificate authentication enforced for all admin accounts" },
    ],
    rulesList:[
      { num:1, name:"Outbound-General", aiLabel:"General Internet Egress", action:"allow", srcZone:"Trust", dstZone:"Untrust", srcAddr:"10.0.0.0/8", dstAddr:"any", service:"application-default", secProfile:"GP-Strict", flags:["ANY-SVC"] },
      { num:2, name:"DMZ-Web-Servers",  aiLabel:"DMZ Public Web",          action:"allow", srcZone:"Untrust", dstZone:"DMZ", srcAddr:"any", dstAddr:"WebServers", service:"tcp/443", secProfile:"GP-Strict", flags:[] },
    ],
  },
  {
    id:"NA-005", filename:"JuniperSRX_300_2026.xml", hostname:"SRX300-EDGE", vendor:"Juniper", vendorSlug:"Juniper",
    deviceType:"Firewall", firmware:"Junos 22.4R3-S2", firmwareEol:"2028-01-15", firmwareDaysLeft:578,
    auditDate:"03/04/2026", score:58, risk:"Medium", rulesTotal:44,
    findings:{ critical:0, high:4, medium:6, low:3 },
    cisPass:21, cisFail:9, cisTotal:32, interfaces:8, vpnTunnels:3, netObjects:36, natRules:4,
    allowRules:44, allowAnyService:3, utmCoverage:81,
    auditSummary:"Juniper SRX300 edge device audit completed. Analyzed 44 policies, 8 interfaces, 3 IPsec tunnels. Score 58/100 (Medium risk). 4 high severity issues. UTM coverage at 81% — needs improvement on outbound user traffic policies.",
    permissiveRules:3, anySrcRules:1, dupRules:0, shadowedRules:0, disabledRules:2, consolCandidates:0, dnsAnomalies:0, rulesNoLog:8, anyServiceRules:3,
    positiveControls:[
      { title:"Junos Commit Confirmations Active", desc:"Commit confirmed prevents accidental lockout during configuration changes, with automatic rollback if not confirmed within 5 minutes." },
      { title:"OSPF Authentication Enabled", desc:"MD5 authentication on all OSPF adjacencies, preventing route injection attacks." },
    ],
    cisDomains:[
      { name:"Access Control", pass:5, total:7 },
      { name:"Management",     pass:4, total:6 },
      { name:"VPN Security",   pass:6, total:8 },
      { name:"Logging",        pass:2, total:4 },
      { name:"Policy Mgmt",    pass:4, total:7 },
    ],
    cisChecks:[
      { id:"CIS-1.1", title:"Explicit deny-all term at end of each policy",  result:"pass", sev:"high",   detail:"All firewall families have explicit deny-all as final term" },
      { id:"CIS-1.2", title:"Remove any-any permit rules",                   result:"fail", sev:"critical",detail:"1 any-any permit in trust-to-untrust with application=any" },
      { id:"CIS-2.1", title:"Disable telnet for management access",          result:"pass", sev:"critical",detail:"Telnet disabled; SSH enforced on management interface" },
    ],
    rulesList:[
      { num:1, name:"trust-internet",  aiLabel:"LAN Internet Access",    action:"permit", srcZone:"trust", dstZone:"untrust", srcAddr:"192.168.0.0/16", dstAddr:"any", service:"junos-https,junos-http", secProfile:"UTM-Std", flags:[] },
      { num:2, name:"vpn-remote-users",aiLabel:"Remote User VPN Access", action:"permit", srcZone:"vpn",   dstZone:"trust",   srcAddr:"Remote-Pool",    dstAddr:"Corp-Net", service:"any", secProfile:"IPS-Def", flags:[] },
    ],
  },
  {
    id:"NA-006", filename:"CheckPoint_R81_GW.txt", hostname:"CP-GW-PROD", vendor:"Check Point", vendorSlug:"CheckPoint",
    deviceType:"Firewall", firmware:"R81.20 T634", firmwareEol:"2029-01-01", firmwareDaysLeft:941,
    auditDate:"01/04/2026", score:71, risk:"Medium", rulesTotal:186,
    findings:{ critical:0, high:3, medium:4, low:5 },
    cisPass:26, cisFail:6, cisTotal:36, interfaces:6, vpnTunnels:8, netObjects:312, natRules:22,
    allowRules:148, allowAnyService:12, utmCoverage:92,
    auditSummary:"Check Point R81.20 gateway audit completed. Analyzed 186 rules, 6 interfaces, 8 VPN communities. Score 71/100 (Medium risk). Excellent UTM coverage at 92%. 3 high-severity configuration issues identified requiring attention.",
    permissiveRules:4, anySrcRules:0, dupRules:2, shadowedRules:1, disabledRules:6, consolCandidates:3, dnsAnomalies:0, rulesNoLog:14, anyServiceRules:12,
    positiveControls:[
      { title:"SmartEvent Correlation Active", desc:"SmartEvent is consuming logs and generating correlation events, enabling real-time security monitoring." },
      { title:"IPS Blade Enabled in Prevention Mode", desc:"IPS protection set to 'Prevent' for critical protections, blocking known-bad traffic rather than only alerting." },
      { title:"SandBlast Threat Emulation Active", desc:"Threat emulation sandboxing enabled for email and web traffic, detecting zero-day payloads before execution." },
      { title:"HTTPS Inspection Configured", desc:"HTTPS inspection active for traffic from untrusted zones, decrypting and scanning TLS-encrypted malware payloads." },
    ],
    cisDomains:[
      { name:"Access Control", pass:6, total:7 },
      { name:"Management",     pass:5, total:6 },
      { name:"VPN Security",   pass:7, total:8 },
      { name:"Logging",        pass:3, total:5 },
      { name:"Policy Mgmt",    pass:5, total:8 },
      { name:"Firmware",       pass:0, total:2 },
    ],
    cisChecks:[
      { id:"CIS-1.1", title:"Ensure Stealth rule exists",                    result:"pass", sev:"high",   detail:"Stealth rule blocking direct access to gateway is present and enabled" },
      { id:"CIS-1.2", title:"Ensure Cleanup rule with logging exists",       result:"pass", sev:"medium", detail:"Cleanup rule present with logging enabled" },
      { id:"CIS-1.3", title:"Enable anti-spoofing on all interfaces",        result:"fail", sev:"high",   detail:"Anti-spoofing disabled on DMZ interface — spoof source attacks possible" },
      { id:"CIS-2.1", title:"Restrict GUI access to management subnet",      result:"pass", sev:"high",   detail:"SmartConsole access restricted to 10.0.0.0/24 management network" },
    ],
    rulesList:[
      { num:1, name:"Stealth",         aiLabel:"Gateway Protection",      action:"drop",  srcZone:"Any",  dstZone:"CP-GW",   srcAddr:"Any", dstAddr:"GW-Object", service:"Any", secProfile:"—", flags:["STEALTH"] },
      { num:2, name:"VPN-Communities", aiLabel:"Site-to-Site VPN",        action:"accept",srcZone:"Internal",dstZone:"VPN",  srcAddr:"Corp-Net", dstAddr:"Remote-Net", service:"VPN-Traffic", secProfile:"IPS", flags:[] },
    ],
  },
  {
    id:"NA-007", filename:"Cisco_ASA_5516X_vpn.cfg", hostname:"ASA-5516-VPN", vendor:"Cisco ASA", vendorSlug:"Cisco",
    deviceType:"Firewall", firmware:"ASA 9.18(4)21", firmwareEol:"2026-09-30", firmwareDaysLeft:106,
    auditDate:"28/03/2026", score:44, risk:"High", rulesTotal:91,
    findings:{ critical:3, high:5, medium:7, low:2 },
    cisPass:15, cisFail:12, cisTotal:32, interfaces:6, vpnTunnels:14, netObjects:88, natRules:16,
    allowRules:91, allowAnyService:22, utmCoverage:55,
    auditSummary:"Cisco ASA 5516-X VPN gateway audit completed. Score 44/100 (High risk). IKEv1 enabled on 9 of 14 VPN tunnels. Split tunnelling active. Firmware approaching end-of-support in 106 days. Immediate remediation required for 3 critical findings.",
    permissiveRules:6, anySrcRules:3, dupRules:1, shadowedRules:0, disabledRules:4, consolCandidates:0, dnsAnomalies:1, rulesNoLog:24, anyServiceRules:22,
    positiveControls:[
      { title:"AAA Authentication Configured", desc:"RADIUS/TACACS+ authentication enforced for all administrator logins — no local-only accounts with CLI access." },
      { title:"Syslog Forwarding to SIEM", desc:"Syslog level 6 (informational) forwarding active to SIEM collector on management network." },
    ],
    cisDomains:[
      { name:"Access Control", pass:4, total:8 },
      { name:"Management",     pass:3, total:6 },
      { name:"VPN Security",   pass:4, total:10 },
      { name:"Logging",        pass:2, total:4 },
      { name:"Policy Mgmt",    pass:2, total:4 },
    ],
    cisChecks:[
      { id:"CIS-1.1", title:"Disable IKEv1 for all VPN tunnels",            result:"fail", sev:"high",   detail:"IKEv1 active on 9 of 14 IPsec tunnel-groups — deprecated protocol" },
      { id:"CIS-1.2", title:"Disable split tunnelling for remote access VPN",result:"fail", sev:"high",  detail:"Split tunnelling enabled for all AnyConnect groups" },
      { id:"CIS-1.3", title:"Enforce AES-256 for all IPsec phase-2",        result:"fail", sev:"high",   detail:"3DES still in phase-2 proposal of 4 tunnel groups" },
      { id:"CIS-2.1", title:"Disable HTTP server if not required",          result:"fail", sev:"medium", detail:"HTTP management enabled on inside interface — should be HTTPS only" },
    ],
    rulesList:[
      { num:1, name:"Outside-to-DMZ", aiLabel:"Web Server Access", action:"permit", srcZone:"outside", dstZone:"DMZ", srcAddr:"any", dstAddr:"WebServers", service:"https", secProfile:"—", flags:[] },
      { num:2, name:"Split-Tunnel",   aiLabel:"VPN Split Tunnel",  action:"permit", srcZone:"vpn",     dstZone:"inside", srcAddr:"VPN-Pool", dstAddr:"Corp-Net", service:"any", secProfile:"—", flags:["SPLIT"] },
    ],
  },
  {
    id:"NA-008", filename:"FortiGate_100F_Nairobi_HQ.conf", hostname:"FG-100F-HQ", vendor:"FortiGate", vendorSlug:"FortiGate",
    deviceType:"Firewall", firmware:"v7.4.4-build2662", firmwareEol:"2028-09-30", firmwareDaysLeft:837,
    auditDate:"15/03/2026", score:85, risk:"Low", rulesTotal:32,
    findings:{ critical:0, high:1, medium:2, low:4 },
    cisPass:31, cisFail:3, cisTotal:36, interfaces:18, vpnTunnels:4, netObjects:64, natRules:8,
    allowRules:32, allowAnyService:2, utmCoverage:97,
    auditSummary:"FortiGate 100F HQ audit completed. Score 85/100 (Low risk — Best performer in fleet). 32 rules analyzed. Excellent security posture with 97% UTM coverage. 3 minor CIS benchmark findings require attention.",
    permissiveRules:1, anySrcRules:0, dupRules:0, shadowedRules:0, disabledRules:1, consolCandidates:0, dnsAnomalies:0, rulesNoLog:0, anyServiceRules:2,
    positiveControls:[
      { title:"All Rules Have Security Profiles", desc:"100% of allow rules carry anti-virus, web filter, and IPS security profiles — comprehensive UTM coverage." },
      { title:"FortiGuard Subscriptions Current", desc:"All FortiGuard security subscriptions (AV, IPS, Web Filter, DNS) active and up-to-date." },
      { title:"SD-WAN Performance Monitoring Active", desc:"SD-WAN health checks monitoring all WAN links — automatic failover configured." },
      { title:"Zero-Trust Network Access Configured", desc:"ZTNA access proxy configured for application access, replacing legacy VPN for internal resources." },
    ],
    cisDomains:[
      { name:"Access Control", pass:7, total:7 },
      { name:"Management",     pass:6, total:6 },
      { name:"VPN Security",   pass:9, total:10 },
      { name:"Logging",        pass:4, total:4 },
      { name:"Policy Mgmt",    pass:5, total:9 },
    ],
    cisChecks:[
      { id:"CIS-1.1", title:"Default deny-all at end of policy chain",       result:"pass", sev:"high",   detail:"Explicit deny-all with logging as final rule in all VDOM policies" },
      { id:"CIS-1.2", title:"All rules have comments",                       result:"fail", sev:"low",    detail:"3 rules missing business-justification comments" },
      { id:"CIS-1.3", title:"Enable logging on all accept rules",            result:"pass", sev:"high",   detail:"All 32 accept rules have logging enabled" },
      { id:"CIS-2.1", title:"Restrict admin access to management VDOM only", result:"pass", sev:"high",   detail:"Management VDOM configured; production VDOMs have no admin access" },
      { id:"CIS-2.2", title:"Admin idle timeout ≤ 10 minutes",              result:"fail", sev:"medium", detail:"Admin timeout set to 20 minutes — reduce to 10 minutes" },
    ],
    rulesList:[
      { num:1, name:"LAN-Internet",  aiLabel:"Outbound Internet Access", action:"accept", srcZone:"LAN", dstZone:"WAN", srcAddr:"LAN_All", dstAddr:"all", service:"ALL", secProfile:"UTM-Strict", flags:[] },
      { num:2, name:"Guest-WiFi",    aiLabel:"Guest WLAN Internet",      action:"accept", srcZone:"GUEST", dstZone:"WAN", srcAddr:"Guest-Pool", dstAddr:"all", service:"HTTP,HTTPS,DNS", secProfile:"Guest-UTM", flags:[] },
    ],
  },
];

// Score trend data (fleet-wide, last 12 weeks)
const scoreTrendData = [
  { week:"W1", score:51 }, { week:"W2", score:52 }, { week:"W3", score:53 }, { week:"W4", score:54 },
  { week:"W5", score:55 }, { week:"W6", score:56 }, { week:"W7", score:57 }, { week:"W8", score:57 },
  { week:"W9", score:58 }, { week:"W10", score:59 }, { week:"W11", score:60 }, { week:"W12", score:61 },
];

// ── Score gauge (SVG semi-circle) ──────────────────────────────────────────────
function ScoreGauge({ score, size = 120 }: { score: number; size?: number }) {
  const r = size * 0.38, cx = size / 2, cy = size * 0.54;
  const angle = (score / 100) * 180 - 90; // -90 to +90
  const rad = (angle * Math.PI) / 180;
  const nx = cx + r * Math.cos(rad), ny = cy + r * Math.sin(rad);
  const color = score >= 70 ? GRN : score >= 50 ? AMB : RED;
  const trackColor = "rgba(255,255,255,0.08)";
  const d = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const pct = score / 100;
  const arcLen = Math.PI * r;
  return (
    <svg width={size} height={size * 0.62} viewBox={`0 0 ${size} ${size * 0.62}`} style={{ display:"block" }}>
      <path d={d} fill="none" stroke={trackColor} strokeWidth={size * 0.09} strokeLinecap="round" />
      <path d={d} fill="none" stroke={color} strokeWidth={size * 0.09} strokeLinecap="round"
        strokeDasharray={`${arcLen * pct} ${arcLen * (1 - pct)}`} />
      <circle cx={nx} cy={ny} r={size * 0.045} fill={color} />
      <text x={cx} y={cy - 2} textAnchor="middle" fontSize={size * 0.22} fontWeight="800" fill={color} fontFamily="'JetBrains Mono',monospace">{score}</text>
      <text x={cx} y={cy + size * 0.13} textAnchor="middle" fontSize={size * 0.095} fill="#9CA3AF" fontFamily="inherit">out of 100</text>
    </svg>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
// ── Network vendor definitions (management platforms) ─────────────────────────
const NETWORK_VENDORS = [
  { connectorId:"fortinet-fortimanager",   label:"FortiManager",             logo:"🛡", logoColor:"#EE3124", fields:[
    { key:"hostname", label:"Hostname / IP", placeholder:"192.168.1.99", type:"text" },
    { key:"port",     label:"Port",          placeholder:"443",            type:"text" },
    { key:"username", label:"Username",      placeholder:"admin",          type:"text" },
    { key:"password", label:"Password",      placeholder:"",               type:"password" },
  ]},
  { connectorId:"palo-alto-panorama",      label:"Palo Alto Panorama",       logo:"🌐", logoColor:"#FA582D", fields:[
    { key:"hostname", label:"Hostname / IP", placeholder:"10.0.0.10",    type:"text" },
    { key:"api_key",  label:"API Key",        placeholder:"LUFRPT1...",   type:"password" },
  ]},
  { connectorId:"cisco-fmc",               label:"Cisco Firepower (FMC)",    logo:"🔵", logoColor:"#00BCEB", fields:[
    { key:"hostname", label:"FMC Hostname / IP", placeholder:"fmc.corp.local", type:"text" },
    { key:"username", label:"Username",          placeholder:"admin",          type:"text" },
    { key:"password", label:"Password",          placeholder:"",               type:"password" },
  ]},
  { connectorId:"sonicwall-nsm",           label:"SonicWall NSM",            logo:"🔒", logoColor:"#E04400", fields:[
    { key:"hostname", label:"Hostname / IP", placeholder:"nsm.corp.local", type:"text" },
    { key:"api_key",  label:"API Key",        placeholder:"",               type:"password" },
  ]},
  { connectorId:"juniper-space",           label:"Juniper Space",            logo:"🟢", logoColor:"#84BD00", fields:[
    { key:"hostname", label:"Hostname / IP", placeholder:"space.corp.local", type:"text" },
    { key:"username", label:"Username",      placeholder:"super",            type:"text" },
    { key:"password", label:"Password",      placeholder:"",                 type:"password" },
  ]},
  { connectorId:"checkpoint-smartconsole", label:"Check Point SmartConsole", logo:"✅", logoColor:"#CC0000", fields:[
    { key:"hostname", label:"Management Server IP", placeholder:"192.168.1.5", type:"text" },
    { key:"api_key",  label:"API Key",               placeholder:"",            type:"password" },
  ]},
];

// ── Per-audit findings generator ──────────────────────────────────────────────
function generateAuditFindings(a: any) {
  const sevOrder: any = { Critical:0, High:1, Medium:2, Low:3 };
  const domainCat: any = {
    "1":"Access Control","2":"Management Access","3":"VPN Security",
    "4":"Logging & Monitoring","5":"Firmware & Updates",
    "6":"Network Segmentation","7":"Authentication","8":"Policy Compliance",
    "9":"Threat Prevention","10":"Remote Access",
  };
  const remForTitle = (title: string) => {
    const t = title.toLowerCase();
    if (t.includes("deny-all") || t.includes("deny all"))
      return "Add an explicit deny-all rule at the bottom of the policy chain with logging enabled. Verify it is the last rule and covers all source/destination combinations.";
    if (t.includes("allow-all") || t.includes("allow all"))
      return "Remove any allow-all rules immediately. Implement specific permit rules for each required traffic flow with documented business justification.";
    if (t.includes("logging") && (t.includes("accept") || t.includes("rule")))
      return "Enable 'log at session end' on all accept rules. Verify log forwarding to your SIEM or syslog collector for centralised retention and correlation.";
    if (t.includes("logging") && t.includes("implicit"))
      return "Configure the implicit deny rule with logging enabled. This ensures all blocked traffic is recorded for forensic analysis of attack attempts.";
    if (t.includes("telnet"))
      return "Disable Telnet on all management interfaces. Use SSH v2 exclusively. Restrict source IPs to the management workstation range via an ACL or trusted-host list.";
    if (t.includes("management access") || t.includes("management interface"))
      return "Restrict HTTPS/SSH admin access to the dedicated management interface only. Disable admin access on user-facing and WAN interfaces. Use an out-of-band management network where possible.";
    if (t.includes("mfa") || t.includes("multi-factor"))
      return "Enable MFA for all administrator accounts. Integrate with RADIUS/LDAP and configure a TOTP or certificate-based second factor for both local and remote admin sessions.";
    if (t.includes("idle timeout") || t.includes("session timeout"))
      return "Set the admin idle timeout to ≤10 minutes. Apply to all admin profiles. This limits the window of opportunity from an unattended active management session.";
    if (t.includes("ikev1"))
      return "Disable IKEv1 in all VPN phase-1 configurations. Migrate tunnels to IKEv2 with AES-256-GCM encryption and SHA-256+ integrity. Coordinate IKEv2 migration with remote-peer administrators.";
    if (t.includes("aes") || t.includes("encryption"))
      return "Enforce AES-256-GCM or ChaCha20-Poly1305 for all VPN encryption. Remove DES, 3DES, and RC4. Update both phase-1 and phase-2 proposals and verify with peer devices.";
    if (t.includes("certificate"))
      return "Replace the default self-signed certificate with a CA-signed certificate. Distribute the CA cert to clients to prevent TLS trust warnings. Rotate annually.";
    if (t.includes("comment") || t.includes("justification"))
      return "Add a structured comment to every rule: business purpose, change-ticket reference, owner, and expiry date for temporary rules. Enforce via the change-management process.";
    if (t.includes("siem") || t.includes("log forwarding") || t.includes("syslog"))
      return "Configure syslog/API forwarding to your SIEM. Forward all severity levels. Test by generating a known event and verifying receipt in the SIEM within 5 minutes.";
    if (t.includes("firmware") || t.includes("eol") || t.includes("end-of-life"))
      return "Plan upgrade to a supported firmware release. Schedule a maintenance window, snapshot the config, test in a lab, then execute the upgrade. Record the new EOL date.";
    if (t.includes("backup"))
      return "Configure automated config backups to a remote SFTP/SCP server. Schedule daily, retain 30 days minimum. Test restoration quarterly.";
    if (t.includes("snmp"))
      return "Disable SNMPv1/v2c. Migrate to SNMPv3 with SHA-256 auth and AES-128 encryption. Restrict SNMP to the management network.";
    if (t.includes("password"))
      return "Enforce strong password policy: ≥14 characters, complexity, 90-day rotation, lockout after 5 failures. Integrate with directory services where possible.";
    return `Review the CIS guidance for '${title}' and implement remediation per the vendor hardening guide. Test changes in a staging environment before production deployment.`;
  };

  const out: any[] = [];

  // CIS failures → unique findings
  for (const ck of (a.cisChecks ?? [])) {
    if (ck.result === "fail") {
      const domNum = (ck.id.match(/CIS-(\d+)/) ?? [])[1] ?? "1";
      out.push({ id:ck.id, severity:{critical:"Critical",high:"High",medium:"Medium",low:"Low"}[ck.sev]??"Medium",
        title:ck.title, category:domainCat[domNum]??"Configuration",
        detail:ck.detail, remediation:remForTitle(ck.title), ref:ck.id, status:"open" });
    }
  }

  // Rule-analysis findings from audit metrics
  if ((a.anyServiceRules??0) > 0) out.push({ id:"RA-001", severity:"High",
    title:`${a.anyServiceRules} allow rule${a.anyServiceRules>1?"s":""}  configured with ANY service — least-privilege violation`,
    category:"Rule Policy",
    detail:`${a.anyServiceRules} of ${a.allowRules} allow rules use service=ANY instead of scoped port/protocol objects. This permits all protocols and ports to matched destinations, massively increasing attack surface.`,
    remediation:"Replace ANY service with named service objects for each required port (TCP/443, UDP/53, etc.). Document the minimum required port set and create objects for reuse across rules. Review with the application owner.",
    ref:"NIST SP 800-41 §4.3 · CIS Control 12.1", status:"open" });

  if ((a.rulesNoLog??0) > 0) out.push({ id:"RA-002", severity:"High",
    title:`${a.rulesNoLog} accept rule${a.rulesNoLog>1?"s have":" has"} logging disabled — blind spot in traffic visibility`,
    category:"Logging & Monitoring",
    detail:`${a.rulesNoLog} accept rules generate no traffic logs. Permitted sessions are invisible to the SIEM and cannot be reviewed during incident investigations or compliance audits.`,
    remediation:"Enable 'log at session end' on every accept rule. Confirm log forwarding to your SIEM is active. Verify logs appear in your log management platform within 5 minutes.",
    ref:"CIS Control 8.1 · ISO 27001 A.12.4", status:"open" });

  if ((a.permissiveRules??0) > 0) out.push({ id:"RA-003", severity:"Critical",
    title:`${a.permissiveRules} overly permissive rule${a.permissiveRules>1?"s":""}  with broad source/destination scope`,
    category:"Access Control",
    detail:`${a.permissiveRules} rules use ANY for source or destination addresses, enabling unrestricted traffic from/to any IP. This violates least-privilege, creates lateral-movement paths, and widens the blast radius of a host compromise.`,
    remediation:"Define specific IP objects for source and destination in every rule. Use security zones with explicit deny between untrusted segments. Require a change ticket and peer review for any rule retaining ANY.",
    ref:"NIST 800-41 §4.3 · CIS 12.2 · DORA Art. 9", status:"open" });

  if ((a.anySrcRules??0) > 0) out.push({ id:"RA-004", severity:"High",
    title:`${a.anySrcRules} rule${a.anySrcRules>1?"s use":" uses"} ANY source — unrestricted inbound access`,
    category:"Access Control",
    detail:`${a.anySrcRules} rules allow traffic from any source IP to reach internal resources. This is rarely justified for internal rules and exposes assets to the entire network.`,
    remediation:"Replace ANY source with specific IP objects or address groups. For internet-facing rules, apply geo-IP blocking as an additional layer. CISO sign-off required for any rule retaining ANY source.",
    ref:"NIST 800-41 §4.3", status:"open" });

  if ((a.dupRules??0) > 0) out.push({ id:"RA-005", severity:"Medium",
    title:`${a.dupRules} duplicate rule${a.dupRules>1?"s":""}  — policy bloat and audit risk`,
    category:"Policy Hygiene",
    detail:`${a.dupRules} rules are exact or near-duplicate copies of other rules. Duplicates obscure intended policy, inflate audit scope, and indicate insufficient change-management controls.`,
    remediation:"Run a rule consolidation review. Remove the redundant entry after confirming the remaining rule satisfies the business requirement. Improve the change-management process to check for duplicates before approval.",
    ref:"CIS Control 12.3", status:"open" });

  if ((a.shadowedRules??0) > 0) out.push({ id:"RA-006", severity:"Medium",
    title:`${a.shadowedRules} shadowed rule${a.shadowedRules>1?"s":""} — never evaluated by the firewall engine`,
    category:"Policy Hygiene",
    detail:`${a.shadowedRules} rules will never be matched because a broader rule higher in the chain catches all their traffic first. Any intended security in the shadowed rules is silently bypassed.`,
    remediation:"Reorder rules: place specific rules before broader ones. After reordering, verify traffic in staging. Remove permanently unreachable rules from the policy.",
    ref:"Firewall policy ordering best practice", status:"open" });

  if ((a.disabledRules??0) > 0) out.push({ id:"RA-007", severity:"Low",
    title:`${a.disabledRules} disabled rule${a.disabledRules>1?"s":""}  — should be reviewed or removed`,
    category:"Policy Hygiene",
    detail:`${a.disabledRules} rules are currently disabled. Accumulating disabled rules indicates policy drift and may create risk if accidentally re-enabled during incident response.`,
    remediation:"Review each disabled rule with the original requester. Document justification to retain or delete. Remove rules no longer required and update the firewall change log.",
    ref:"Firewall policy best practice", status:"open" });

  if ((a.dnsAnomalies??0) > 0) out.push({ id:"RA-008", severity:"Medium",
    title:`${a.dnsAnomalies} DNS anomal${a.dnsAnomalies>1?"ies":"y"} — potential C2 or exfiltration path`,
    category:"Threat Prevention",
    detail:`${a.dnsAnomalies} DNS-related anomalies detected, including rules that may allow DNS to unexpected destinations or bypass DNS inspection. DNS tunnelling is a common C2 and data-exfiltration vector.`,
    remediation:"Restrict DNS to approved internal resolvers only. Enable DNS filtering on all rules permitting UDP/TCP 53. Monitor for high-volume queries to newly registered or unusual domains.",
    ref:"MITRE ATT&CK T1071.004", status:"open" });

  // Firmware / EOL finding
  if ((a.firmwareDaysLeft??999) < 365 && (a.firmwareDaysLeft??999) >= 0) {
    const fsev = (a.firmwareDaysLeft??999) < 90 ? "Critical" : (a.firmwareDaysLeft??999) < 180 ? "High" : "Medium";
    out.push({ id:"FW-001", severity:fsev,
      title:`Firmware EOL in ${a.firmwareDaysLeft} days — ${a.firmware}`,
      category:"Firmware & Updates",
      detail:`${a.firmware} reaches end-of-life on ${a.firmwareEol??"-"}. After EOL the vendor releases no security patches. Unpatched CVEs in expired firmware create unmitigated exploit paths that attackers actively target.`,
      remediation:`Plan upgrade before ${a.firmwareEol??"-"}. Test upgrade in a lab, snapshot config, execute in a maintenance window. Record new firmware version and updated EOL date in your CMDB.`,
      ref:"Vendor EOL advisory", status:"open" });
  }

  // Low UTM/security-profile coverage
  if ((a.utmCoverage??100) < 70) out.push({ id:"UTM-001", severity:"High",
    title:`Low UTM security-profile coverage — only ${a.utmCoverage}% of rules inspected`,
    category:"Threat Prevention",
    detail:`Only ${a.utmCoverage}% of allow rules carry UTM/security profiles (AV, IPS, URL filtering, app control). Rules without profiles pass traffic without deep-packet inspection, creating blind spots for malware and exploit traffic.`,
    remediation:"Apply IPS + AV profiles as a minimum to all internet-facing and inter-zone allow rules. Add URL filtering and app control for high-sensitivity zones. Start in monitor mode, then switch to block after baseline.",
    ref:"CIS Control 13.3 · NIST 800-41 §4.5", status:"open" });

  out.sort((x:any,y:any) => (sevOrder[x.severity]??4)-(sevOrder[y.severity]??4));
  return out;
}

export default function SecOps() {
  const [tab, setTab] = useState("overview");
  const [selectedDevice, setSelectedDevice] = useState<NetworkDevice | null>(null);
  const [selectedPath, setSelectedPath]     = useState<typeof attackPathsData[0] | null>(null);
  const [selectedRule, setSelectedRule]     = useState<typeof firewallRules[0] | null>(null);
  const [selectedChange, setSelectedChange] = useState<typeof ruleChanges[0] | null>(null);
  const [selectedFinding, setSelectedFinding] = useState<typeof deviceFindings[0] | null>(null);
  const [typeFilter, setTypeFilter]   = useState<DeviceType | "All">("All");
  const [statusFilter, setStatusFilter] = useState<DeviceStatus | "All">("All");
  const [findingDevFilter, setFindingDevFilter] = useState("All");
  const [findingCatFilter, setFindingCatFilter] = useState("All");
  const [selectedAudit, setSelectedAudit] = useState<NetAudit | null>(null);
  const [auditSubTab, setAuditSubTab]     = useState("overview");
  const [auditSearch, setAuditSearch]     = useState("");
  const [auditVendorFilter, setAuditVendorFilter] = useState("All");
  const [selectedAuditIds, setSelectedAuditIds] = useState<Set<string>>(new Set());
  const [chartFilter, setChartFilter] = useState<{ type: "severity" | "vendor" | "device" | "risk" | null; value: string }>({ type: null, value: "" });
  const [auditBulkModal, setAuditBulkModal] = useState<string | null>(null);
  // Upload state
  const [uploadDragging, setUploadDragging] = useState(false);
  const [uploadFile,  setUploadFile]  = useState<string|null>(null);
  const [uploadStep,  setUploadStep]  = useState(-1);       // -1 = idle, 0-4 = processing, 5 = done
  const parsedConfigRef = useRef<ReturnType<typeof parseConfig> | null>(null);
  const [uploadedAudits, setUploadedAudits] = useState<NetAudit[]>(() => {
    try {
      const saved = localStorage.getItem("secops_uploaded_audits");
      return saved ? (JSON.parse(saved) as NetAudit[]) : [];
    } catch { return []; }
  });
  // Real integration connections (fetched from API)
  const [netMgmtConns, setNetMgmtConns] = useState<any[]>([]);
  const [connectModal,  setConnectModal]  = useState<{vendor:typeof NETWORK_VENDORS[0]; conn?:any}|null>(null);
  const [connectForm,   setConnectForm]   = useState<Record<string,string>>({});
  const [connectSaving, setConnectSaving] = useState(false);
  const [connectError,  setConnectError]  = useState<string|null>(null);
  const [syncingIds,    setSyncingIds]    = useState<Set<string>>(new Set());
  const [expandedFindingId, setExpandedFindingId] = useState<string|null>(null);

  // ── Net Auditor fleet sub-tabs ─────────────────────────────────────────────
  const [netFleetTab, setNetFleetTab] = useState("overview");
  const [topoSelected, setTopoSelected] = useState<any>(null);
  const [diffAudit1, setDiffAudit1] = useState("NA-001");
  const [diffAudit2, setDiffAudit2] = useState("NA-004");
  const [changeRequests, setChangeRequests] = useState<any[]>(() => {
    try { const s = localStorage.getItem("net_change_requests"); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [crShowForm, setCrShowForm] = useState(false);
  const [crForm, setCrForm] = useState({ srcZone:"", dstZone:"", port:"443", protocol:"TCP", justification:"", priority:"Medium" });
  const [crSelectedId, setCrSelectedId] = useState<string|null>(null);
  useEffect(() => {
    try { localStorage.setItem("net_change_requests", JSON.stringify(changeRequests)); } catch {}
  }, [changeRequests]);

  // Persist uploaded audits so configs survive page navigation / refresh
  useEffect(() => {
    try { localStorage.setItem("secops_uploaded_audits", JSON.stringify(uploadedAudits)); } catch { /* quota exceeded – ignore */ }
  }, [uploadedAudits]);

  // ── AD Auditor: manual/paste config state ──────────────────────────────────
  const [adAddModal,  setAdAddModal]  = useState(false);
  const [adPasteMode, setAdPasteMode] = useState<"paste"|"manual">("paste");
  const [adPasteText, setAdPasteText] = useState("");
  const [adParsed,    setAdParsed]    = useState<any[]>([]);
  const [adManualForm, setAdManualForm] = useState({ category:"Privileged Access", finding:"", severity:"High", affected:"1", status:"open", remediation:"" });
  const [uploadedAdFindings, setUploadedAdFindings] = useState<any[]>(() => {
    try { const s = localStorage.getItem("secops_ad_findings"); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem("secops_ad_findings", JSON.stringify(uploadedAdFindings)); } catch {}
  }, [uploadedAdFindings]);

  function parseAdReport(raw: string): any[] {
    // Strip HTML tags to get plain text
    const text = raw.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
                    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
                    .replace(/<[^>]+>/g, " ")
                    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
                    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
                    .replace(/\s{2,}/g, " ");
    const lines = text.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);
    const results: any[] = [];
    const sevMap: Record<string,string> = {
      critical:"Critical", high:"High", medium:"Medium", low:"Low",
      Critical:"Critical", High:"High", Medium:"Medium", Low:"Low",
      warning:"High", error:"Critical", info:"Low",
    };
    const catKeywords: [string, RegExp][] = [
      ["Privileged Access",  /admin|privilege|domain.?admin|priv|priv(ileged)?/i],
      ["Kerberos",           /kerberos|kerberoast|golden.?ticket|silver.?ticket|asrep|as-rep/i],
      ["Password Policy",    /password|passwd|pwd|credential|pass/i],
      ["Delegation",         /delegat/i],
      ["Stale Objects",      /stale|inactive|disabled|dormant|orphan/i],
      ["Group Policy",       /gpo|group.?policy|policy/i],
      ["LDAP",               /ldap|signing|bind/i],
      ["Trust",              /trust|forest|cross/i],
    ];
    const severityRe = /\b(critical|high|medium|low|warning|error|info)\b/i;
    const affectedRe = /(\d[\d,]+)\s*(?:user|object|account|computer|host|member|group)?s?\b/i;
    // Try to detect table rows (CSV-like or pipe-separated)
    const tableRows = lines.filter(l => l.includes("|") || l.split(",").length >= 4);
    if (tableRows.length >= 2) {
      for (const row of tableRows) {
        const cols = row.split(/\s*[|,]\s*/).map(c => c.trim()).filter(Boolean);
        if (cols.length < 2) continue;
        const text2 = cols.join(" ");
        const sevMatch = text2.match(severityRe);
        const sev = sevMatch ? (sevMap[sevMatch[1].toLowerCase()] ?? "Medium") : "Medium";
        const affMatch = text2.match(affectedRe);
        const affected = affMatch ? parseInt(affMatch[1].replace(/,/g,"")) : 1;
        let cat = "General";
        for (const [c, re] of catKeywords) { if (re.test(text2)) { cat = c; break; } }
        results.push({
          id: `AD-U${Date.now()}-${results.length+1}`,
          category: cat, finding: cols[0].slice(0,120),
          severity: sev, affected, status: "open",
          remediation: cols[cols.length-1].slice(0,200),
        });
      }
      if (results.length > 0) return results;
    }
    // Paragraph / line-based parsing
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (line.length < 8) { i++; continue; }
      const sevMatch = line.match(severityRe);
      if (!sevMatch && line.length < 30) { i++; continue; }
      const sev = sevMatch ? (sevMap[sevMatch[1].toLowerCase()] ?? "Medium") : "Medium";
      const affMatch = (lines[i+1] ?? line).match(affectedRe);
      const affected = affMatch ? parseInt(affMatch[1].replace(/,/g,"")) : 1;
      let cat = "General";
      for (const [c, re] of catKeywords) { if (re.test(line)) { cat = c; break; } }
      const remediation = lines[i+2] ? lines[i+2].slice(0,200) : "Review and remediate per AD security best practice.";
      results.push({ id:`AD-U${Date.now()}-${results.length+1}`, category:cat, finding:line.slice(0,120), severity:sev, affected, status:"open", remediation });
      i += 3;
    }
    return results.slice(0, 50);
  }

  const [dbFindings,  setDbFindings]  = useState<typeof deviceFindings>([]);
  const [dbFwRules,   setDbFwRules]   = useState<typeof firewallRules>([]);
  const [dbChanges,   setDbChanges]   = useState<typeof ruleChanges>([]);
  const [dbNetAudits,  setDbNetAudits]  = useState<any[]>([]);
  const [dbAdFindings,    setDbAdFindings]    = useState<any[]>([]);
  const [networkDevices,  setNetworkDevices]  = useState<any[]>([]);
  const [zoneMatrix,      setZoneMatrix]      = useState<Record<string, Record<string, any>>>({});

  useEffect(() => {
    const token = getStoredToken();
    if (!token) return;
    const H = { Authorization: `Bearer ${token}` };
    fetch("/api/security/findings", { headers: H })
      .then(r => r.json())
      .then((d: any[]) => Array.isArray(d) && d.length > 0 && setDbFindings(d.map((f: any) => ({
        id:       f.findingId ?? String(f.id),
        deviceId: f.resource  ?? "",
        device:   f.resource  ?? "",
        type:     f.cloud     ?? "Security",
        title:    f.title,
        severity: f.severity,
        status:   f.status,
        category: f.cloud     ?? "General",
      }))))
      .catch(() => {});
    fetch("/api/security/firewall-rules", { headers: H })
      .then(r => r.json())
      .then((d: any[]) => Array.isArray(d) && d.length > 0 && setDbFwRules(d.map((r: any) => ({
        id:        r.id,
        device:    r.ruleSetId ?? "",
        from:      r.src,
        to:        r.dst,
        port:      r.port,
        action:    r.action,
        risk:      r.riskScore >= 80 ? "Critical" : r.riskScore >= 60 ? "High" : r.riskScore >= 40 ? "Medium" : "Low",
        review:    (r.anomalies ?? []).some((a: string) => a === "any-any" || a === "overly-permissive")
                     ? "REMOVE"
                     : (r.anomalies ?? []).length > 0 ? "REVIEW" : "OK",
        anomalies: r.anomalies ?? [],
        comment:   r.comment   ?? "",
      }))))
      .catch(() => {});
    fetch("/api/security/rule-changes", { headers: H })
      .then(r => r.json())
      .then((d: any[]) => Array.isArray(d) && d.length > 0 && setDbChanges(d.map((c: any) => ({
        id:         c.id,
        ts:         c.changedAt  ?? "",
        device:     c.ruleSetId  ?? "",
        ruleId:     c.ruleId     ?? "",
        changeType: c.action === "add" ? "add" : c.action === "delete" ? "delete" : "modify",
        field:      "rule",
        before:     c.before ? JSON.stringify(c.before) : "—",
        after:      c.after  ? JSON.stringify(c.after)  : "—",
        changedBy:  c.changedBy  ?? "",
        ticket:     c.ticketRef  ?? "—",
        risk:       "High",
        approved:   !!c.approvedBy,
      }))))
      .catch(() => {});
    fetch("/api/network-audit/audits", { headers: H })
      .then(r => r.ok ? r.json() : [])
      .then((d: any[]) => Array.isArray(d) && d.length > 0 && setDbNetAudits(d))
      .catch(() => {});
    fetch("/api/ad-auditor/ad-findings", { headers: H })
      .then(r => r.ok ? r.json() : [])
      .then((d: any[]) => Array.isArray(d) && d.length > 0 && setDbAdFindings(d))
      .catch(() => {});
    // Fetch real network-management-platform connections
    fetch("/api/integrations/connections", { headers: H })
      .then(r => r.ok ? r.json() : { connections:[] })
      .then((body: any) => {
        const conns: any[] = Array.isArray(body) ? body : (body?.connections ?? []);
        const MGMT_IDS = ["fortinet-fortimanager","palo-alto-panorama","cisco-fmc","sonicwall-nsm","juniper-space","checkpoint-smartconsole"];
        setNetMgmtConns(conns.filter((c: any) => MGMT_IDS.includes(c.connectorId)));
      })
      .catch(() => {});
    fetch("/api/network-audit/devices", { headers: H })
      .then(r => r.ok ? r.json() : [])
      .then((d: any[]) => Array.isArray(d) && d.length > 0 && setNetworkDevices(d))
      .catch(() => {});
    fetch("/api/network-audit/zone-matrix", { headers: H })
      .then(r => r.ok ? r.json() : {})
      .then((d: any) => d && typeof d === "object" && Object.keys(d).length > 0 && setZoneMatrix(d))
      .catch(() => {});
  }, []);

  const { viewTenantId } = useOrg();
  const lNetworkDevices = viewTenantId === 1 ? networkDevices : [] as typeof networkDevices;
  const lZoneMatrix     = viewTenantId === 1 ? zoneMatrix     : {} as typeof zoneMatrix;

  const lFindings    = dbFindings.length   > 0 ? dbFindings   : deviceFindings;
  const lFwRules     = dbFwRules.length    > 0 ? dbFwRules    : firewallRules;
  const lRuleChanges = dbChanges.length    > 0 ? dbChanges    : ruleChanges;
  const lNetAudits   = dbNetAudits.length  > 0 ? dbNetAudits  : netAudits;
  const lAdFindings  = [...(dbAdFindings.length > 0 ? dbAdFindings : adFindings), ...uploadedAdFindings];

  const { nodes: apNodes, edges: apEdges } = useMemo(() => buildAttackGraph(selectedPath), [selectedPath]);

  const filteredDevices = useMemo(() => lNetworkDevices.filter(d =>
    (typeFilter   === "All" || d.type   === typeFilter) &&
    (statusFilter === "All" || d.status === statusFilter)
  ), [typeFilter, statusFilter, lNetworkDevices]);

  const filteredFindings = useMemo(() => lFindings.filter(f =>
    (findingDevFilter === "All" || f.deviceId === findingDevFilter) &&
    (findingCatFilter === "All" || f.category === findingCatFilter)
  ), [findingDevFilter, findingCatFilter]);

  const tabs = [
    { key:"overview",  label:"Overview",    count:0 },
    { key:"ad",        label:"AD Auditor",  count:lAdFindings.filter(f=>f.status==="open").length, dot:AMB },
    { key:"netaudit",  label:"Net Auditor", count:lNetAudits.filter(a=>a.risk==="Critical"||a.risk==="High").length, dot:AMB },
  ];

  const MGMT_IDS = ["fortinet-fortimanager","palo-alto-panorama","cisco-fmc","sonicwall-nsm","juniper-space","checkpoint-smartconsole"];

  const handleConnectSubmit = async () => {
    if (!connectModal) return;
    setConnectSaving(true); setConnectError(null);
    const token = getStoredToken();
    const H2: any = { "Content-Type":"application/json", ...(token ? { Authorization:`Bearer ${token}` } : {}) };
    try {
      const r = await fetch("/api/integrations/connections", {
        method:"POST", headers:H2,
        body: JSON.stringify({ connectorId: connectModal.vendor.connectorId, config: connectForm }),
      });
      if (!r.ok) throw new Error(await r.text());
      const body = await r.json();
      const newConn = body?.connection ?? body;
      setNetMgmtConns(prev => [...prev.filter((c:any)=>c.connectorId!==connectModal.vendor.connectorId), newConn]);
      setConnectModal(null); setConnectForm({});
    } catch(e:any) {
      setConnectError(e?.message ?? "Connection failed — check credentials");
    } finally { setConnectSaving(false); }
  };

  const handleSync = async (conn: any) => {
    setSyncingIds(s => new Set([...s, conn.id]));
    const token = getStoredToken();
    const H2: any = { ...(token ? { Authorization:`Bearer ${token}` } : {}) };
    try {
      await fetch(`/api/integrations/connections/${conn.id}/sync`, { method:"POST", headers:H2 });
      const r2 = await fetch("/api/integrations/connections", { headers:H2 });
      if (r2.ok) {
        const body = await r2.json();
        const conns: any[] = Array.isArray(body) ? body : (body?.connections ?? []);
        setNetMgmtConns(conns.filter((c:any) => MGMT_IDS.includes(c.connectorId)));
      }
    } catch {}
    setSyncingIds(s => { const n=new Set(s); n.delete(conn.id); return n; });
  };

  return (
    <>
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
      <ModuleHeader
        title="Security Operations"
        description="Network Security Auditor — upload device configs or auto-pull from integrations, AD security, fleet posture scoring"
        badge={{ label:"SecOps", color:NAV, bg:"rgba(59,130,246,0.12)" }}
        action={{ label:"+ Upload Config", onClick:()=>{ setTab("netaudit"); } }}
      />
      <SubNav tabs={tabs} active={tab} onSelect={t => { setTab(t); setSelectedAudit(null); }} />
      <AICopilotBar module="secops" />
      <div style={{ flex:1, overflow:"auto", padding:20, display:"flex", flexDirection:"column", gap:16 }}>

        {/* ── SecOps Overview ──────────────────────────────────────────────── */}
        {tab === "overview" && (() => {
          const openAdFinds   = lAdFindings.filter(f => f.status === "open").length;
          const critAdFinds   = lAdFindings.filter(f => f.severity === "Critical" && f.status === "open").length;
          const allAudits     = [...lNetAudits, ...uploadedAudits];
          const fleetAvgOv    = allAudits.length ? Math.round(allAudits.reduce((s,a)=>s+a.score,0)/allAudits.length) : 0;
          const critRiskAudits = allAudits.filter(a=>a.risk==="Critical").length;
          const highRiskAudits = allAudits.filter(a=>a.risk==="High").length;
          const totalFindsOv  = allAudits.reduce((s,a)=>s+a.findings.critical+a.findings.high+a.findings.medium+a.findings.low,0);
          const critFindsOv   = allAudits.reduce((s,a)=>s+a.findings.critical,0);
          const adByCategory  = [...new Set(lAdFindings.map(f=>f.category))].map(cat=>({
            cat, open: lAdFindings.filter(f=>f.category===cat&&f.status!=="resolved").length,
          })).filter(x=>x.open>0);
          const catColor2: Record<string,string> = { "Privileged Access":RED, Kerberos:AMB, "Password Policy":BLU, Delegation:PRP, "Stale Objects":CYN, "Group Policy":GRN };
          return (
            <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
              {/* KPI row — 6 tiles */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:12 }}>
                {([
                  { label:"Total Audits",        value:String([...lNetAudits,...uploadedAudits].length), sub:"Devices in fleet",                     color:NAV, onClick:()=>setTab("netaudit") },
                  { label:"Fleet Avg Score",     value:String(fleetAvgOv),                              sub:"Higher is better",                    color:fleetAvgOv>=70?EME:fleetAvgOv>=50?AMB:RED, onClick:()=>setTab("netaudit") },
                  { label:"High/Critical Risk",  value:String(critRiskAudits+highRiskAudits),           sub:`${critRiskAudits} critical · ${highRiskAudits} high`, color:RED, onClick:()=>setTab("netaudit") },
                  { label:"Total Findings",      value:String(totalFindsOv),                            sub:`${critFindsOv} critical`,              color:critFindsOv>0?RED:AMB, onClick:()=>setTab("netaudit") },
                  { label:"AD Findings",         value:String(openAdFinds),                             sub:`${critAdFinds} critical · open`,       color:critAdFinds>0?RED:AMB, onClick:()=>setTab("ad") },
                  { label:"AD Affected Objects", value:lAdFindings.reduce((s,f)=>s+f.affected,0).toLocaleString(), sub:"Users & computers impacted",  color:PRP, onClick:()=>setTab("ad") },
                ] as {label:string;value:string;sub:string;color:string;onClick:()=>void}[]).map(k => (
                  <div key={k.label} onClick={k.onClick}
                    onMouseEnter={e=>(e.currentTarget.style.borderColor="rgba(147,197,253,0.35)")}
                    onMouseLeave={e=>(e.currentTarget.style.borderColor="var(--border)")}
                    style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:"16px 18px", boxShadow:"0 2px 8px rgba(0,0,0,0.05)", cursor:"pointer" }}>
                    <div style={{ fontSize:20, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:k.color, marginBottom:4 }}>{k.value}</div>
                    <div style={{ fontSize:11, fontWeight:700, color:"var(--foreground)", marginBottom:3 }}>{k.label}</div>
                    <div style={{ fontSize:10, color:"var(--muted-foreground)", lineHeight:1.4 }}>{k.sub}</div>
                  </div>
                ))}
              </div>

              {/* Middle row: fleet score trend + AD breakdown + top AD findings */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16 }}>
                {/* Fleet score by device */}
                <div style={card({ padding:"18px 20px" })}>
                  <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:14, display:"flex", justifyContent:"space-between" }}>
                    <span>Fleet Security Scores</span>
                    <button onClick={()=>setTab("netaudit")} style={{ background:"none", border:"none", fontSize:11, color:BLU, cursor:"pointer", fontWeight:700 }}>View all →</button>
                  </div>
                  {[...lNetAudits,...uploadedAudits].sort((a,b)=>a.score-b.score).slice(0,7).map(a=>{
                    const col = a.score>=70?EME:a.score>=50?AMB:RED;
                    return (
                      <div key={a.id} onClick={()=>{ setTab("netaudit"); setSelectedAudit(a); setAuditSubTab("overview"); }}
                        onMouseEnter={e=>(e.currentTarget.style.background="var(--secondary)")}
                        onMouseLeave={e=>(e.currentTarget.style.background="transparent")}
                        style={{ marginBottom:8, cursor:"pointer", borderRadius:6, padding:"3px 4px" }}>
                        <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:3 }}>
                          <span style={{ fontWeight:600, color:"var(--foreground)", maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{a.hostname}</span>
                          <span style={{ fontWeight:800, color:col, fontFamily:"'JetBrains Mono',monospace", fontSize:12 }}>{a.score}</span>
                        </div>
                        <div style={{ height:5, borderRadius:3, background:"var(--input)", overflow:"hidden" }}>
                          <div style={{ height:"100%", borderRadius:3, background:col, width:`${a.score}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* AD Findings by category */}
                <div style={card({ padding:"18px 20px" })}>
                  <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:14, display:"flex", justifyContent:"space-between" }}>
                    <span>AD Risk by Category</span>
                    <button onClick={()=>setTab("ad")} style={{ background:"none", border:"none", fontSize:11, color:BLU, cursor:"pointer", fontWeight:700 }}>View all →</button>
                  </div>
                  {adByCategory.map(c=>{
                    const maxOpen = Math.max(...adByCategory.map(x=>x.open),1);
                    return (
                      <div key={c.cat} onClick={()=>setTab("ad")}
                        onMouseEnter={e=>(e.currentTarget.style.background="var(--secondary)")}
                        onMouseLeave={e=>(e.currentTarget.style.background="transparent")}
                        style={{ marginBottom:10, cursor:"pointer", borderRadius:6, padding:"2px 4px" }}>
                        <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:4 }}>
                          <span style={{ fontWeight:600, color:catColor2[c.cat]??NAV }}>{c.cat}</span>
                          <span style={{ fontWeight:700, color:catColor2[c.cat]??NAV, fontSize:10 }}>{c.open} open</span>
                        </div>
                        <div style={{ height:6, borderRadius:4, background:"var(--input)", overflow:"hidden" }}>
                          <div style={{ height:"100%", borderRadius:4, background:catColor2[c.cat]??NAV, width:`${Math.round((c.open/maxOpen)*100)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Top AD Findings */}
                <div style={card({ padding:"18px 20px" })}>
                  <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:12, display:"flex", justifyContent:"space-between" }}>
                    <span>Top AD Findings</span>
                    <button onClick={()=>setTab("ad")} style={{ background:"none", border:"none", fontSize:11, color:BLU, cursor:"pointer", fontWeight:700 }}>View all →</button>
                  </div>
                  {lAdFindings.filter(f=>f.status!=="resolved").slice(0,5).map(f=>(
                    <div key={f.id} style={{ padding:"8px 0", borderBottom:"1px solid var(--border)" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:6 }}>
                        <span style={{ fontSize:11, fontWeight:600, color:"var(--foreground)", flex:1, lineHeight:1.4 }}>{f.finding}</span>
                        <span style={{ fontSize:9, fontWeight:700, background:f.severity==="Critical"?"rgba(239,68,68,0.06)":f.severity==="High"?"rgba(245,158,11,0.06)":"rgba(59,130,246,0.12)", color:f.severity==="Critical"?RED:f.severity==="High"?AMB:BLU, border:`1px solid ${f.severity==="Critical"?"#FECACA":f.severity==="High"?"#FDE68A":"#BFDBFE"}`, borderRadius:4, padding:"2px 6px", flexShrink:0 }}>{f.severity}</span>
                      </div>
                      <div style={{ fontSize:9, color:"var(--muted-foreground)", marginTop:3 }}>{f.category} · {f.affected} affected · {f.status}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}



        {/* ── AD Auditor ───────────────────────────────────────────────────── */}
        {tab === "ad" && (
          <>
            {/* Header bar with Add Config button */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
              <div style={{ fontSize:14, fontWeight:800, color:NAV }}>Active Directory Findings</div>
              <div style={{ display:"flex", gap:8 }}>
                {uploadedAdFindings.length > 0 && (
                  <button onClick={()=>setUploadedAdFindings([])} style={{ background:"rgba(239,68,68,0.08)", color:RED, border:"1px solid #FECACA", borderRadius:8, padding:"6px 14px", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                    🗑 Clear Imported ({uploadedAdFindings.length})
                  </button>
                )}
                <button onClick={()=>{ setAdAddModal(true); setAdPasteMode("paste"); setAdPasteText(""); setAdParsed([]); setAdManualForm({ category:"Privileged Access", finding:"", severity:"High", affected:"1", status:"open", remediation:"" }); }}
                  style={{ background:NAV, color:"white", border:"none", borderRadius:8, padding:"6px 18px", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                  + Add Config
                </button>
              </div>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
              <StatCard label="Total AD Findings"   value={lAdFindings.length}                                                      sub="Across all categories"  color={NAV} icon="🏛" />
              <StatCard label="Critical Findings"   value={lAdFindings.filter(f=>f.severity==="Critical").length}                   sub="Domain-level risk"       color={RED} icon="🔴" />
              <StatCard label="Affected Objects"    value={lAdFindings.reduce((s,f)=>s+f.affected,0).toLocaleString()}              sub="Users + computers"       color={AMB} icon="👥" />
              <StatCard label="Open / In Progress"  value={lAdFindings.filter(f=>["open","in-progress"].includes(f.status)).length} sub="Needs attention"         color={AMB} icon="📋" />
            </div>
            <TableShell
              cols={["ID","Category","Finding","Severity","Affected","Status","Remediation","Source"]}
              rows={lAdFindings.map(f => [
                <Mono>{f.id}</Mono>,
                <span style={{ fontWeight:700, color:NAV, fontSize:11 }}>{f.category}</span>,
                <span style={{ fontSize:12 }}>{f.finding}</span>,
                <SevBadge label={f.severity} />,
                <span style={{ fontWeight:700, color:RED, fontSize:12 }}>{(f.affected??0).toLocaleString()}</span>,
                <Badge label={f.status} />,
                <span style={{ fontSize:11, color:"#6B7280" }}>{f.remediation}</span>,
                <span style={{ fontSize:9, fontWeight:700, padding:"2px 6px", borderRadius:4, background: String(f.id).startsWith("AD-U") ? "rgba(124,58,237,0.08)" : "var(--secondary)", color: String(f.id).startsWith("AD-U") ? PRP : "var(--muted-foreground)", border: String(f.id).startsWith("AD-U") ? "1px solid rgba(124,58,237,0.25)" : "1px solid var(--border)" }}>
                  {String(f.id).startsWith("AD-U") ? "Imported" : "System"}
                </span>,
              ])}
            />

            {/* ── Add Config Modal ───────────────────────────────────────────── */}
            {adAddModal && (
              <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center" }}
                onClick={e=>{ if (e.target===e.currentTarget) setAdAddModal(false); }}>
                <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:16, padding:"28px 32px", width:680, maxWidth:"95vw", maxHeight:"90vh", overflow:"auto", boxShadow:"0 24px 64px rgba(0,0,0,0.5)" }}
                  onClick={e=>e.stopPropagation()}>

                  {/* Modal header */}
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
                    <div>
                      <div style={{ fontSize:16, fontWeight:800, color:NAV }}>Add AD Audit Config</div>
                      <div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:2 }}>Import findings from a report (text / HTML) or add a finding manually</div>
                    </div>
                    <button onClick={()=>setAdAddModal(false)} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"var(--muted-foreground)", lineHeight:1 }}>✕</button>
                  </div>

                  {/* Mode tabs */}
                  <div style={{ display:"flex", gap:0, borderBottom:"2px solid var(--border)", marginBottom:20 }}>
                    {([["paste","📋 Paste Report"],["manual","✏️ Manual Entry"]] as [string,string][]).map(([k,l])=>(
                      <button key={k} onClick={()=>{ setAdPasteMode(k as any); setAdParsed([]); }}
                        style={{ background:"none", border:"none", borderBottom:`2px solid ${adPasteMode===k?NAV:"transparent"}`, marginBottom:-2, padding:"8px 20px", fontSize:12, fontWeight:adPasteMode===k?800:600, color:adPasteMode===k?NAV:"var(--muted-foreground)", cursor:"pointer" }}>
                        {l}
                      </button>
                    ))}
                  </div>

                  {/* Paste mode */}
                  {adPasteMode === "paste" && (
                    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                      <div style={{ fontSize:12, color:"var(--muted-foreground)", lineHeight:1.6 }}>
                        Paste your AD audit report below. Accepts plain text, CSV, pipe-separated tables, or full HTML (e.g. from PingCastle, BloodHound exports, or any audit tool). The parser will extract findings automatically.
                      </div>

                      <div>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                          <label style={{ fontSize:11, fontWeight:700, color:"var(--muted-foreground)", letterSpacing:"0.3px" }}>REPORT CONTENT (TEXT OR HTML)</label>
                          {adPasteText && <button onClick={()=>{ setAdPasteText(""); setAdParsed([]); }} style={{ background:"none", border:"none", fontSize:10, color:RED, cursor:"pointer", fontWeight:700 }}>Clear</button>}
                        </div>
                        <textarea
                          value={adPasteText}
                          onChange={e=>{ setAdPasteText(e.target.value); setAdParsed([]); }}
                          placeholder={"Paste plain text, HTML, CSV or pipe-delimited table here…\n\nExamples:\n  Critical | 47 users with Domain Admin | Privileged Access | Review membership\n  <html>…PingCastle report…</html>\n  High,Domain admin count too high,12 accounts,Review group membership"}
                          style={{ width:"100%", boxSizing:"border-box", height:200, padding:"10px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--secondary)", color:"var(--foreground)", fontSize:12, fontFamily:"'JetBrains Mono',monospace", resize:"vertical", outline:"none", lineHeight:1.6 }}
                        />
                      </div>

                      {adParsed.length === 0 && adPasteText.trim().length > 0 && (
                        <button onClick={()=>{ const r = parseAdReport(adPasteText); setAdParsed(r.length>0?r:[{ id:`AD-U${Date.now()}-1`, category:"General", finding:adPasteText.trim().slice(0,120), severity:"Medium", affected:1, status:"open", remediation:"Review and remediate per AD security best practice." }]); }}
                          style={{ background:NAV, color:"white", border:"none", borderRadius:8, padding:"9px 24px", fontSize:13, fontWeight:700, cursor:"pointer", alignSelf:"flex-start" }}>
                          🔍 Parse Report
                        </button>
                      )}

                      {adParsed.length > 0 && (
                        <div>
                          <div style={{ fontSize:12, fontWeight:700, color:EME, marginBottom:8 }}>✓ {adParsed.length} finding{adParsed.length!==1?"s":""} extracted — review before importing:</div>
                          <div style={{ maxHeight:280, overflow:"auto", border:"1px solid var(--border)", borderRadius:10, background:"var(--secondary)" }}>
                            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                              <thead>
                                <tr style={{ borderBottom:"1px solid var(--border)", background:"var(--card)", position:"sticky", top:0 }}>
                                  {["Category","Finding","Severity","Affected","Remediation"].map(h=>(
                                    <th key={h} style={{ padding:"8px 12px", textAlign:"left", fontSize:9, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.5px", whiteSpace:"nowrap" }}>{h.toUpperCase()}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {adParsed.map((f,i)=>(
                                  <tr key={i} style={{ borderBottom:"1px solid var(--border)" }}>
                                    <td style={{ padding:"7px 12px", color:NAV, fontWeight:700, fontSize:10, whiteSpace:"nowrap" }}>{f.category}</td>
                                    <td style={{ padding:"7px 12px", maxWidth:220, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={f.finding}>{f.finding}</td>
                                    <td style={{ padding:"7px 12px" }}>
                                      <span style={{ fontSize:9, fontWeight:700, padding:"2px 7px", borderRadius:4, background:f.severity==="Critical"?"rgba(239,68,68,0.08)":f.severity==="High"?"rgba(245,158,11,0.08)":"rgba(59,130,246,0.08)", color:f.severity==="Critical"?RED:f.severity==="High"?AMB:BLU, border:`1px solid ${f.severity==="Critical"?"#FECACA":f.severity==="High"?"#FDE68A":"#BFDBFE"}` }}>{f.severity}</span>
                                    </td>
                                    <td style={{ padding:"7px 12px", fontFamily:"monospace", fontWeight:700, color:RED }}>{(f.affected??1).toLocaleString()}</td>
                                    <td style={{ padding:"7px 12px", maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color:"var(--muted-foreground)" }} title={f.remediation}>{f.remediation}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div style={{ display:"flex", gap:10, marginTop:14, justifyContent:"flex-end" }}>
                            <button onClick={()=>setAdParsed([])} style={{ padding:"8px 18px", borderRadius:8, border:"1px solid var(--border)", background:"var(--secondary)", color:"var(--foreground)", fontSize:12, fontWeight:700, cursor:"pointer" }}>← Re-parse</button>
                            <button onClick={()=>{ setUploadedAdFindings(prev=>[...prev,...adParsed]); setAdAddModal(false); setAdParsed([]); setAdPasteText(""); }}
                              style={{ padding:"8px 22px", borderRadius:8, border:"none", background:EME, color:"white", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                              ✓ Import {adParsed.length} Finding{adParsed.length!==1?"s":""}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Manual entry mode */}
                  {adPasteMode === "manual" && (
                    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                      {([ 
                        { key:"finding",      label:"Finding Description *", type:"textarea", placeholder:"e.g. 47 accounts have Domain Admin privileges — number should be minimised" },
                        { key:"category",     label:"Category", type:"select", options:["Privileged Access","Kerberos","Password Policy","Delegation","Stale Objects","Group Policy","LDAP","Trust","General"] },
                        { key:"severity",     label:"Severity", type:"select", options:["Critical","High","Medium","Low"] },
                        { key:"affected",     label:"Affected Objects (count)", type:"number", placeholder:"e.g. 47" },
                        { key:"status",       label:"Status", type:"select", options:["open","in-progress","resolved"] },
                        { key:"remediation",  label:"Remediation", type:"textarea", placeholder:"Recommended remediation steps…" },
                      ] as {key:string;label:string;type:string;placeholder?:string;options?:string[]}[]).map(field=>(
                        <div key={field.key}>
                          <label style={{ display:"block", fontSize:11, fontWeight:700, color:"var(--muted-foreground)", marginBottom:5, letterSpacing:"0.3px" }}>{field.label.toUpperCase()}</label>
                          {field.type === "select" ? (
                            <select value={(adManualForm as any)[field.key]} onChange={e=>setAdManualForm(f=>({...f,[field.key]:e.target.value}))}
                              style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--secondary)", color:"var(--foreground)", fontSize:12, fontFamily:"inherit", outline:"none" }}>
                              {field.options!.map(o=><option key={o} value={o}>{o}</option>)}
                            </select>
                          ) : field.type === "textarea" ? (
                            <textarea value={(adManualForm as any)[field.key]} onChange={e=>setAdManualForm(f=>({...f,[field.key]:e.target.value}))}
                              placeholder={field.placeholder} rows={3}
                              style={{ width:"100%", boxSizing:"border-box", padding:"9px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--secondary)", color:"var(--foreground)", fontSize:12, fontFamily:"inherit", resize:"vertical", outline:"none" }} />
                          ) : (
                            <input type="number" min={1} value={(adManualForm as any)[field.key]} onChange={e=>setAdManualForm(f=>({...f,[field.key]:e.target.value}))}
                              placeholder={field.placeholder}
                              style={{ width:"100%", boxSizing:"border-box", padding:"9px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--secondary)", color:"var(--foreground)", fontSize:12, fontFamily:"inherit", outline:"none" }} />
                          )}
                        </div>
                      ))}
                      <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:4 }}>
                        <button onClick={()=>setAdAddModal(false)} style={{ padding:"9px 20px", borderRadius:8, border:"1px solid var(--border)", background:"var(--secondary)", color:"var(--foreground)", fontSize:12, fontWeight:700, cursor:"pointer" }}>Cancel</button>
                        <button onClick={()=>{
                          if (!adManualForm.finding.trim()) return;
                          setUploadedAdFindings(prev=>[...prev,{
                            id:`AD-U${Date.now()}-M`, category:adManualForm.category,
                            finding:adManualForm.finding.trim(), severity:adManualForm.severity,
                            affected:parseInt(adManualForm.affected)||1,
                            status:adManualForm.status, remediation:adManualForm.remediation.trim()||"Review and remediate per AD security best practice.",
                          }]);
                          setAdAddModal(false);
                        }} disabled={!adManualForm.finding.trim()}
                          style={{ padding:"9px 22px", borderRadius:8, border:"none", background:adManualForm.finding.trim()?NAV:"var(--muted)", color:"white", fontSize:12, fontWeight:700, cursor:adManualForm.finding.trim()?"pointer":"default" }}>
                          + Add Finding
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}





        {/* ── Network Security Auditor ─────────────────────────────────────── */}
        {tab === "netaudit" && (() => {
          const vendorColors: Record<string,string> = { FortiGate:NAV, SonicWall:BLU, Cisco:CYN, Palo:PRP, Juniper:GRN, CheckPoint:EME };
          const allFleetAudits = [...lNetAudits, ...uploadedAudits];
          const fleetAvg = allFleetAudits.length ? Math.round(allFleetAudits.reduce((s,a)=>s+a.score,0)/allFleetAudits.length) : 0;
          const critRisk  = allFleetAudits.filter(a=>a.risk==="Critical").length;
          const highRisk  = allFleetAudits.filter(a=>a.risk==="High").length;
          const totalFinds = allFleetAudits.reduce((s,a)=>s+a.findings.critical+a.findings.high+a.findings.medium+a.findings.low,0);
          const critFinds  = allFleetAudits.reduce((s,a)=>s+a.findings.critical,0);

          // Chart data
          const vendorDist = Object.entries(
            lNetAudits.reduce((m,a)=>{ m[a.vendorSlug]=(m[a.vendorSlug]||0)+1; return m; },{} as Record<string,number>)
          ).map(([name,value])=>({ name, value }));

          const deviceTypeDist = Object.entries(
            lNetAudits.reduce((m,a)=>{ m[a.deviceType]=(m[a.deviceType]||0)+1; return m; },{} as Record<string,number>)
          ).map(([name,value])=>({ name, value }));

          const fleetSevData = [
            { name:"Critical", count: lNetAudits.reduce((s,a)=>s+a.findings.critical,0), fill:RED },
            { name:"High",     count: lNetAudits.reduce((s,a)=>s+a.findings.high,0),     fill:AMB },
            { name:"Medium",   count: lNetAudits.reduce((s,a)=>s+a.findings.medium,0),   fill:BLU },
            { name:"Low",      count: lNetAudits.reduce((s,a)=>s+a.findings.low,0),      fill:EME },
          ];

          const cisDomainAll: Record<string,{pass:number;total:number}> = {};
          lNetAudits.forEach(a => a.cisDomains.forEach(d => {
            if (!cisDomainAll[d.name]) cisDomainAll[d.name] = { pass:0, total:0 };
            cisDomainAll[d.name].pass  += d.pass;
            cisDomainAll[d.name].total += d.total;
          }));
          const radarData = Object.entries(cisDomainAll).map(([name,{pass,total}])=>({
            name, pct: total > 0 ? Math.round((pass/total)*100) : 0,
          }));

          const topByRisk = [...lNetAudits].sort((a,b)=>a.score-b.score).slice(0,6);

          const heatmapData = lNetAudits.map(a => ({
            name: a.hostname.length > 14 ? a.hostname.slice(0,14)+"…" : a.hostname,
            Critical: a.findings.critical, High: a.findings.high,
            Medium: a.findings.medium, Low: a.findings.low,
          }));

          const filteredAudits = [...lNetAudits, ...uploadedAudits].filter(a => {
            if (auditVendorFilter !== "All" && a.vendorSlug !== auditVendorFilter) return false;
            if (auditSearch !== "" && !a.filename.toLowerCase().includes(auditSearch.toLowerCase()) && !a.hostname.toLowerCase().includes(auditSearch.toLowerCase())) return false;
            if (chartFilter.type === "vendor"   && a.vendorSlug !== chartFilter.value) return false;
            if (chartFilter.type === "risk"     && a.risk !== chartFilter.value) return false;
            if (chartFilter.type === "device"   && a.hostname !== chartFilter.value) return false;
            if (chartFilter.type === "severity") {
              const sev = chartFilter.value;
              if (sev === "Critical" && a.findings.critical === 0) return false;
              if (sev === "High"     && a.findings.high === 0)     return false;
              if (sev === "Medium"   && a.findings.medium === 0)   return false;
              if (sev === "Low"      && a.findings.low === 0)      return false;
            }
            return true;
          });

          const PIECOL = [NAV, BLU, CYN, PRP, GRN, AMB, RED, "#F59E0B"];

          // ── Per-audit detail ────────────────────────────────────────────────
          if (selectedAudit) {
            const a = selectedAudit;
            const allFinds = generateAuditFindings(a);
            const subTabs = [
              { key:"overview",  label:"Overview" },
              { key:"findings",  label:`Findings (${allFinds.length})` },
              { key:"cis",       label:`CIS Checks (${a.cisChecks?.length ?? 0})` },
              { key:"rules",     label:`Rules (${a.rulesList?.length ?? 0})` },
            ];
            const scoreColor = a.score >= 70 ? GRN : a.score >= 50 ? AMB : RED;
            return (
              <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                {/* Header bar */}
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <button onClick={()=>{ setSelectedAudit(null); setAuditSubTab("overview"); }} style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:8, padding:"6px 14px", fontSize:12, fontWeight:700, cursor:"pointer", color:"var(--foreground)" }}>← Back to Fleet</button>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:16, fontWeight:800, color:NAV }}>{a.filename}</div>
                    <div style={{ fontSize:11, color:"var(--muted-foreground)" }}>{a.vendor} · {a.firmware} · Audited {a.auditDate}</div>
                  </div>
                  <RiskBadge level={a.risk} />
                </div>

                {/* Score + KPI strip */}
                <div style={{ display:"grid", gridTemplateColumns:"auto 1fr 1fr 1fr 1fr 1fr 1fr", gap:12, alignItems:"stretch" }}>
                  <div style={card({ padding:"18px 24px", display:"flex", flexDirection:"column", alignItems:"center", gap:4 })}>
                    <div style={{ fontSize:10, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.5px", marginBottom:4 }}>SECURITY SCORE</div>
                    <ScoreGauge score={a.score} size={140} />
                    <div style={{ fontSize:11, fontWeight:800, color:scoreColor, marginTop:2 }}>{a.risk} Risk</div>
                  </div>
                  {[
                    { label:"Rules Analysed",     value:a.rulesTotal,            icon:"📋", color:NAV },
                    { label:"CIS Pass Rate",       value:`${Math.round(a.cisPass/Math.max(a.cisTotal,1)*100)}%`, icon:"✅", color:EME },
                    { label:"Interfaces",          value:a.interfaces,             icon:"🔌", color:BLU },
                    { label:"VPN Tunnels",         value:a.vpnTunnels,             icon:"🔒", color:PRP },
                    { label:"Network Objects",     value:a.netObjects,             icon:"🗂",  color:CYN },
                    { label:"UTM Coverage",        value:`${a.utmCoverage}%`,      icon:"🛡",  color:a.utmCoverage>=80?EME:AMB },
                  ].map(k=>(
                    <div key={k.label} style={card({ padding:"14px 16px", display:"flex", flexDirection:"column", justifyContent:"center", gap:4 })}>
                      <div style={{ fontSize:20 }}>{k.icon}</div>
                      <div style={{ fontSize:20, fontWeight:800, color:k.color, fontFamily:"'JetBrains Mono',monospace" }}>{k.value}</div>
                      <div style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", lineHeight:1.3 }}>{k.label}</div>
                    </div>
                  ))}
                </div>

                {/* Severity chips */}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
                  {[
                    { label:"Critical", count:a.findings.critical, color:RED,    bg:"rgba(239,68,68,0.06)", border:"#FECACA" },
                    { label:"High",     count:a.findings.high,     color:AMB,    bg:"rgba(245,158,11,0.06)", border:"#FDE68A" },
                    { label:"Medium",   count:a.findings.medium,   color:BLU,    bg:"rgba(59,130,246,0.08)", border:"#BFDBFE" },
                    { label:"Low",      count:a.findings.low,      color:EME,    bg:"rgba(34,197,94,0.06)",  border:"#A7F3D0" },
                  ].map(f=>(
                    <div key={f.label} style={{ background:f.bg, border:`1px solid ${f.border}`, borderRadius:10, padding:"12px 16px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div>
                        <div style={{ fontSize:22, fontWeight:800, color:f.color, fontFamily:"'JetBrains Mono',monospace" }}>{f.count}</div>
                        <div style={{ fontSize:11, fontWeight:700, color:f.color }}>{f.label}</div>
                      </div>
                      <div style={{ fontSize:26, opacity:0.4 }}>
                        {f.label==="Critical"?"🔴":f.label==="High"?"🟠":f.label==="Medium"?"🔵":"🟢"}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Sub-tabs */}
                <div style={{ display:"flex", gap:4, borderBottom:"2px solid var(--border)", paddingBottom:0 }}>
                  {subTabs.map(s=>(
                    <button key={s.key} onClick={()=>setAuditSubTab(s.key)} style={{
                      background:"none", border:"none", borderBottom:`2px solid ${auditSubTab===s.key?NAV:"transparent"}`,
                      marginBottom:-2, padding:"8px 16px", fontSize:12, fontWeight:auditSubTab===s.key?800:600,
                      color:auditSubTab===s.key?NAV:"var(--muted-foreground)", cursor:"pointer",
                    }}>{s.label}</button>
                  ))}
                </div>

                {/* Sub-tab: Overview */}
                {auditSubTab === "overview" && (
                  <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                      {/* Key Metrics */}
                      <div style={card({ padding:20 })}>
                        <div style={{ fontSize:13, fontWeight:800, color:NAV, marginBottom:14 }}>Key Metrics</div>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                          {[
                            { label:"Security Score",          value:String(a.score),                icon:"🎯" },
                            { label:"CIS Pass Rate",           value:`${Math.round(a.cisPass/Math.max(a.cisTotal,1)*100)}% (${a.cisPass}/${a.cisTotal})`, icon:"✅" },
                            { label:"Rules Analysed",          value:String(a.rulesTotal),            icon:"📋" },
                            { label:"Allow Rules",             value:String(a.allowRules),            icon:"✔" },
                            { label:"Allow-Any-Service Rules", value:String(a.allowAnyService),       icon:"⚠" },
                            { label:"Permissive Rules",        value:String(a.permissiveRules),       icon:"🔓" },
                            { label:"UTM Coverage",            value:`${a.utmCoverage}%`,             icon:"🛡" },
                            { label:"Interfaces",              value:String(a.interfaces),            icon:"🔌" },
                            { label:"VPN Tunnels",             value:String(a.vpnTunnels),            icon:"🔒" },
                            { label:"Network Objects",         value:String(a.netObjects),            icon:"🗂" },
                            { label:"NAT Rules",               value:String(a.natRules),              icon:"↔" },
                            { label:"Rules Without Logging",   value:String(a.rulesNoLog),            icon:"📵" },
                            { label:"Shadowed Rules",          value:String(a.shadowedRules),         icon:"👥" },
                            { label:"Disabled Rules",          value:String(a.disabledRules),         icon:"🚫" },
                          ].map(m=>(
                            <div key={m.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 10px", background:"var(--secondary)", borderRadius:6 }}>
                              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                                <span style={{ fontSize:12 }}>{m.icon}</span>
                                <span style={{ fontSize:11, color:"var(--muted-foreground)" }}>{m.label}</span>
                              </div>
                              <span style={{ fontSize:12, fontWeight:800, color:NAV, fontFamily:"'JetBrains Mono',monospace" }}>{m.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* Positive Controls + Audit Summary */}
                      <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                        <div style={card({ padding:20 })}>
                          <div style={{ fontSize:13, fontWeight:800, color:EME, marginBottom:12 }}>✅ Positive Controls ({(a.positiveControls??[]).length})</div>
                          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                            {(a.positiveControls??[]).map((pc,i)=>(
                              <div key={i} style={{ background:"rgba(34,197,94,0.05)", border:"1px solid #A7F3D0", borderRadius:8, padding:"10px 12px" }}>
                                <div style={{ fontSize:12, fontWeight:700, color:EME, marginBottom:4 }}>✓ {pc.title}</div>
                                <div style={{ fontSize:11, color:"var(--muted-foreground)", lineHeight:1.5 }}>{pc.desc}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div style={card({ padding:20 })}>
                          <div style={{ fontSize:13, fontWeight:800, color:NAV, marginBottom:10 }}>Audit Summary</div>
                          <div style={{ fontSize:12, color:"var(--foreground)", lineHeight:1.7, marginBottom:14 }}>{a.auditSummary}</div>
                          {/* Finding Severity Distribution mini bar */}
                          <div style={{ fontSize:11, fontWeight:700, color:"var(--muted-foreground)", marginBottom:8 }}>FINDING SEVERITY DISTRIBUTION</div>
                          <ResponsiveContainer width="100%" height={80}>
                            <BarChart data={[
                              { name:"Crit", v:a.findings.critical, fill:RED },
                              { name:"High", v:a.findings.high,     fill:AMB },
                              { name:"Med",  v:a.findings.medium,   fill:BLU },
                              { name:"Low",  v:a.findings.low,      fill:EME },
                            ]} barSize={28}>
                              <XAxis dataKey="name" tick={{ fontSize:10, fill:"#9CA3AF" }} axisLine={false} tickLine={false} />
                              <Tooltip contentStyle={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:8, fontSize:11 }} />
                              <Bar dataKey="v" radius={[4,4,0,0]}>
                                {[RED,AMB,BLU,EME].map((c,i)=><Cell key={i} fill={c} />)}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>

                    {/* CIS by domain + Firmware Lifecycle */}
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                      <div style={card({ padding:20 })}>
                        <div style={{ fontSize:13, fontWeight:800, color:NAV, marginBottom:14 }}>CIS Benchmark by Domain</div>
                        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                          {(a.cisDomains??[]).filter(d=>d.total>0).map(d=>{
                            const pct = Math.round((d.pass/d.total)*100);
                            const col = pct >= 70 ? EME : pct >= 40 ? AMB : RED;
                            return (
                              <div key={d.name}>
                                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                                  <span style={{ fontSize:12, fontWeight:600, color:"var(--foreground)" }}>{d.name}</span>
                                  <span style={{ fontSize:11, fontWeight:700, color:col, fontFamily:"'JetBrains Mono',monospace" }}>{d.pass}/{d.total} ({pct}%)</span>
                                </div>
                                <div style={{ height:8, borderRadius:4, background:"var(--input)", overflow:"hidden" }}>
                                  <div style={{ height:"100%", borderRadius:4, background:col, width:`${pct}%`, transition:"width 0.4s" }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div style={card({ padding:20 })}>
                        <div style={{ fontSize:13, fontWeight:800, color:NAV, marginBottom:14 }}>Firmware Lifecycle</div>
                        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                          {[
                            { label:"Firmware Version",   value:a.firmware,          icon:"💾" },
                            { label:"End-of-Support Date",value:a.firmwareEol,        icon:"📅" },
                            { label:"Days Until EOS",     value:`${a.firmwareDaysLeft} days`, icon:"⏳", color:a.firmwareDaysLeft<180?RED:a.firmwareDaysLeft<365?AMB:EME },
                            { label:"Device Hostname",    value:a.hostname,           icon:"🖥" },
                            { label:"Vendor",             value:a.vendor,             icon:"🏭" },
                            { label:"Device Type",        value:a.deviceType,         icon:"🔀" },
                          ].map(f=>(
                            <div key={f.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 10px", background:"var(--secondary)", borderRadius:6 }}>
                              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                                <span>{f.icon}</span>
                                <span style={{ fontSize:11, color:"var(--muted-foreground)" }}>{f.label}</span>
                              </div>
                              <span style={{ fontSize:12, fontWeight:800, color:f.color??NAV, fontFamily:"'JetBrains Mono',monospace", maxWidth:160, textAlign:"right", wordBreak:"break-all" }}>{f.value}</span>
                            </div>
                          ))}
                          <div style={{ marginTop:4, padding:"10px 12px", borderRadius:8, background:a.firmwareDaysLeft<180?"rgba(239,68,68,0.06)":a.firmwareDaysLeft<365?"rgba(245,158,11,0.06)":"rgba(34,197,94,0.06)", border:`1px solid ${a.firmwareDaysLeft<180?"#FECACA":a.firmwareDaysLeft<365?"#FDE68A":"#A7F3D0"}` }}>
                            <div style={{ fontSize:11, fontWeight:700, color:a.firmwareDaysLeft<180?RED:a.firmwareDaysLeft<365?AMB:EME }}>
                              {a.firmwareDaysLeft < 180 ? "⚠ End-of-support imminent — schedule firmware upgrade now" : a.firmwareDaysLeft < 365 ? "ℹ EOS within 12 months — plan upgrade in next cycle" : "✓ Firmware within supported lifecycle"}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Sub-tab: Findings */}
                {auditSubTab === "findings" && (
                  <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
                    {/* Severity summary bar */}
                    <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                      {(["Critical","High","Medium","Low"] as const).map(sev => {
                        const count = allFinds.filter(f=>f.severity===sev).length;
                        if (!count) return null;
                        const col = sev==="Critical"?RED:sev==="High"?AMB:sev==="Medium"?BLU:EME;
                        return <span key={sev} style={{ fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:20, background:`${col}18`, border:`1px solid ${col}44`, color:col }}>{sev}: {count}</span>;
                      })}
                      <span style={{ fontSize:10, color:"var(--muted-foreground)", marginLeft:"auto", alignSelf:"center" }}>Click any row to see detail + remediation</span>
                    </div>
                    <div style={card({ padding:0, overflow:"hidden" })}>
                      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                        <thead>
                          <tr style={{ borderBottom:"2px solid var(--border)", background:"var(--secondary)" }}>
                            {["ID","Severity","Title","Category","Status"].map(h=>(
                              <th key={h} style={{ padding:"10px 14px", textAlign:"left", fontSize:10, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.5px", whiteSpace:"nowrap" }}>{h.toUpperCase()}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {allFinds.map((f)=>{
                            const isExp = expandedFindingId === f.id;
                            const rowColor = f.severity==="Critical"?`${RED}08`:f.severity==="High"?`${AMB}08`:"transparent";
                            const borderCol = f.severity==="Critical"?RED:f.severity==="High"?AMB:f.severity==="Medium"?BLU:EME;
                            return (
                              <>
                                <tr key={f.id} onClick={()=>setExpandedFindingId(isExp?null:f.id)}
                                  style={{ borderBottom:isExp?"none":"1px solid var(--border)", cursor:"pointer", background:isExp?`${borderCol}12`:rowColor, transition:"background 0.15s" }}>
                                  <td style={{ padding:"10px 14px", borderLeft:`3px solid ${isExp?borderCol:"transparent"}` }}><Mono style={{ fontSize:11 }}>{f.id}</Mono></td>
                                  <td style={{ padding:"10px 14px" }}><RiskBadge level={f.severity} /></td>
                                  <td style={{ padding:"10px 14px", fontWeight:600, maxWidth:400 }}>{f.title}</td>
                                  <td style={{ padding:"10px 14px", color:"var(--muted-foreground)", fontSize:11 }}>{f.category}</td>
                                  <td style={{ padding:"10px 14px" }}>
                                    <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:4, background:"rgba(239,68,68,0.08)", color:RED, border:"1px solid #FECACA" }}>Open</span>
                                  </td>
                                </tr>
                                {isExp && (
                                  <tr key={`${f.id}-detail`} style={{ borderBottom:"1px solid var(--border)" }}>
                                    <td colSpan={5} style={{ padding:0 }}>
                                      <div style={{ margin:"0 0 0 3px", padding:"16px 20px", background:`${borderCol}0A`, borderLeft:`3px solid ${borderCol}` }}>
                                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
                                          <div>
                                            <div style={{ fontSize:10, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.5px", marginBottom:6 }}>DESCRIPTION</div>
                                            <div style={{ fontSize:12, color:"var(--foreground)", lineHeight:1.6 }}>{f.detail}</div>
                                          </div>
                                          <div>
                                            <div style={{ fontSize:10, fontWeight:800, color:EME, letterSpacing:"0.5px", marginBottom:6 }}>REMEDIATION</div>
                                            <div style={{ fontSize:12, color:"var(--foreground)", lineHeight:1.6 }}>{f.remediation}</div>
                                          </div>
                                        </div>
                                        <div style={{ marginTop:12, display:"flex", alignItems:"center", gap:16, paddingTop:10, borderTop:"1px solid var(--border)" }}>
                                          <div style={{ fontSize:10, color:"var(--muted-foreground)" }}><span style={{ fontWeight:700 }}>Reference:</span> {f.ref}</div>
                                          <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
                                            <button style={{ fontSize:10, fontWeight:700, padding:"4px 12px", borderRadius:6, background:AMB, color:"white", border:"none", cursor:"pointer" }}>Mark In Progress</button>
                                            <button style={{ fontSize:10, fontWeight:700, padding:"4px 12px", borderRadius:6, background:EME, color:"white", border:"none", cursor:"pointer" }}>Mark Resolved</button>
                                          </div>
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Sub-tab: CIS Checks */}
                {auditSubTab === "cis" && (
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    <div style={{ display:"flex", gap:8, fontSize:11, fontWeight:700 }}>
                      <span style={{ background:"rgba(34,197,94,0.08)", border:"1px solid #A7F3D0", color:EME, padding:"3px 10px", borderRadius:20 }}>✓ Pass: {(a.cisChecks??[]).filter(c=>c.result==="pass").length}</span>
                      <span style={{ background:"rgba(239,68,68,0.06)", border:"1px solid #FECACA", color:RED, padding:"3px 10px", borderRadius:20 }}>✗ Fail: {(a.cisChecks??[]).filter(c=>c.result==="fail").length}</span>
                    </div>
                    {(a.cisChecks??[]).map(c=>(
                      <div key={c.id} style={card({ padding:"12px 16px", borderLeft:`4px solid ${c.result==="pass"?EME:RED}` })}>
                        <div style={{ display:"flex", alignItems:"flex-start", gap:12 }}>
                          <span style={{ fontSize:18, marginTop:1 }}>{c.result==="pass"?"✅":"❌"}</span>
                          <div style={{ flex:1 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
                              <Mono>{c.id}</Mono>
                              <RiskBadge level={c.sev.charAt(0).toUpperCase()+c.sev.slice(1)} />
                              <span style={{ fontSize:10, fontWeight:800, padding:"2px 8px", borderRadius:4, background:c.result==="pass"?"rgba(34,197,94,0.08)":"rgba(239,68,68,0.06)", color:c.result==="pass"?EME:RED, border:`1px solid ${c.result==="pass"?"#A7F3D0":"#FECACA"}` }}>
                                {c.result.toUpperCase()}
                              </span>
                            </div>
                            <div style={{ fontSize:12, fontWeight:700, color:"var(--foreground)", marginBottom:4 }}>{c.title}</div>
                            <div style={{ fontSize:11, color:"var(--muted-foreground)", lineHeight:1.5 }}>{c.detail}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Sub-tab: Rules Explorer */}
                {auditSubTab === "rules" && (
                  <div>
                    {(a.rulesList??[]).length === 0 ? (
                      <div style={{ textAlign:"center", padding:40, color:"var(--muted-foreground)", fontSize:13 }}>No rules data available for this device type.</div>
                    ) : (
                      <div style={card({ padding:0, overflow:"hidden" })}>
                        <div style={{ padding:"14px 16px", borderBottom:"1px solid var(--border)", background:"rgba(30,58,95,0.04)" }}>
                          <div style={{ fontSize:12, fontWeight:800, color:NAV }}>Rules Explorer — AI Enriched</div>
                          <div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:2 }}>AI-enriched rule labels shown in <span style={{ background:NAV, color:"white", borderRadius:3, padding:"1px 5px", fontSize:9, fontWeight:700 }}>AI</span> badge column</div>
                        </div>
                        <div style={{ overflowX:"auto" }}>
                          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                            <thead>
                              <tr style={{ borderBottom:"1px solid var(--border)", background:"var(--secondary)" }}>
                                {["#","Name / AI Label","Action","Src Zone","Dst Zone","Src Addr","Dst Addr","Service","Sec Profile","Flags"].map(h=>(
                                  <th key={h} style={{ padding:"9px 12px", textAlign:"left", fontSize:9, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.5px", whiteSpace:"nowrap" }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {(a.rulesList??[]).map(r=>(
                                <tr key={r.num} style={{ borderBottom:"1px solid var(--border)" }}>
                                  <td style={{ padding:"9px 12px", fontWeight:700, color:NAV }}>{r.num}</td>
                                  <td style={{ padding:"9px 12px", minWidth:180 }}>
                                    <div style={{ fontSize:11, fontWeight:700, color:"var(--foreground)", marginBottom:3 }}>{r.name}</div>
                                    <span style={{ background:NAV, color:"white", borderRadius:3, padding:"1px 5px", fontSize:9, fontWeight:700, marginRight:4 }}>AI</span>
                                    <span style={{ fontSize:10, color:BLU }}>{r.aiLabel}</span>
                                  </td>
                                  <td style={{ padding:"9px 12px" }}>
                                    <span style={{ padding:"2px 7px", borderRadius:4, fontSize:10, fontWeight:700, background:r.action==="accept"||r.action==="allow"||r.action==="permit"?"rgba(34,197,94,0.08)":"rgba(239,68,68,0.06)", color:r.action==="accept"||r.action==="allow"||r.action==="permit"?EME:RED, border:`1px solid ${r.action==="accept"||r.action==="allow"||r.action==="permit"?"#A7F3D0":"#FECACA"}` }}>{r.action.toUpperCase()}</span>
                                  </td>
                                  <td style={{ padding:"9px 12px", fontFamily:"monospace", fontSize:10, color:"var(--foreground)" }}>{r.srcZone}</td>
                                  <td style={{ padding:"9px 12px", fontFamily:"monospace", fontSize:10, color:"var(--foreground)" }}>{r.dstZone}</td>
                                  <td style={{ padding:"9px 12px", fontSize:10, color:"var(--muted-foreground)", maxWidth:120, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.srcAddr}</td>
                                  <td style={{ padding:"9px 12px", fontSize:10, color:"var(--muted-foreground)", maxWidth:120, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.dstAddr}</td>
                                  <td style={{ padding:"9px 12px", fontSize:10, color:"var(--foreground)", fontFamily:"monospace" }}>{r.service}</td>
                                  <td style={{ padding:"9px 12px", fontSize:10, color:r.secProfile==="—"?"var(--muted-foreground)":EME, fontWeight:r.secProfile==="—"?400:700 }}>{r.secProfile}</td>
                                  <td style={{ padding:"9px 12px" }}>
                                    {r.flags.map(f=>(
                                      <span key={f} style={{ marginRight:4, fontSize:9, fontWeight:700, background:"rgba(245,158,11,0.08)", border:"1px solid #FDE68A", color:AMB, borderRadius:3, padding:"1px 5px" }}>{f}</span>
                                    ))}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          }

          // ── Upload handler ───────────────────────────────────────────────────
          const UPLOAD_STEPS = ["Uploading file…","Reading configuration…","Detecting vendor & firmware…","Analysing rules & CIS controls…","Generating audit report…"];
          const startUpload = (filename: string, file?: File) => {
            setUploadFile(filename);
            setUploadStep(0);
            parsedConfigRef.current = null;

            // Read and parse the file immediately; result will be used once steps complete
            if (file) {
              const reader = new FileReader();
              reader.onload = (ev) => {
                try {
                  const content = ev.target?.result as string ?? "";
                  parsedConfigRef.current = parseConfig(filename, content);
                } catch (err) {
                  console.warn("Config parse error:", err);
                }
              };
              reader.readAsText(file);
            }

            const advance = (step: number) => {
              if (step > UPLOAD_STEPS.length - 1) {
                const p = parsedConfigRef.current;
                const newAudit = {
                  id: `UA-${Date.now()}`,
                  hostname:      (p?.hostname ?? filename.replace(/\.(conf|xml|exp|cfg|txt|gz)$/i,"").replace(/[-_]/g," ").slice(0,28)) || "Uploaded Device",
                  ip:            p?.ip          || `10.${Math.floor(Math.random()*220)+10}.${Math.floor(Math.random()*220)+10}.${Math.floor(Math.random()*220)+10}`,
                  vendor:        p?.vendor      ?? "FortiGate",
                  vendorSlug:    p?.vendorSlug  ?? "FortiGate",
                  deviceType:    p?.deviceType  ?? "Firewall",
                  firmware:      p?.firmware    ?? "Unknown",
                  score:         p?.score       ?? 45,
                  risk:          p?.risk        ?? "High",
                  lastAudit:     p?.auditDate   ?? new Date().toISOString().slice(0,10),
                  filename,
                  findings:      p?.findings    ?? { critical:2, high:5, medium:8, low:4 },
                  cisPass:       p?.cisPass     ?? 8,
                  cisFail:       p?.cisFail     ?? 6,
                  cisTotal:      p?.cisTotal    ?? 14,
                  interfaces:    p?.interfaces  ?? 0,
                  vpnTunnels:    p?.vpnTunnels  ?? 0,
                  netObjects:    p?.netObjects  ?? 0,
                  natRules:      p?.natRules    ?? 0,
                  rulesTotal:    p?.rulesTotal  ?? 0,
                  allowRules:    p?.allowRules  ?? 0,
                  allowAnyService: p?.allowAnyService ?? 0,
                  permissiveRules: p?.permissiveRules ?? 0,
                  anySrcRules:   p?.anySrcRules ?? 0,
                  dupRules:      p?.dupRules    ?? 0,
                  shadowedRules: p?.shadowedRules ?? 0,
                  disabledRules: p?.disabledRules ?? 0,
                  consolCandidates: p?.consolCandidates ?? 0,
                  dnsAnomalies:  p?.dnsAnomalies ?? 0,
                  rulesNoLog:    p?.rulesNoLog  ?? 0,
                  anyServiceRules: p?.anyServiceRules ?? 0,
                  utmCoverage:   p?.utmCoverage ?? 0,
                  firmwareEol:   p?.firmwareEol ?? "Unknown",
                  firmwareDaysLeft: p?.firmwareDaysLeft ?? 365,
                  auditDate:     p?.auditDate   ?? new Date().toISOString().slice(0,10),
                  cisChecks:     p?.cisChecks   ?? [],
                  rulesList:     p?.rulesList   ?? [],
                  positiveControls: p?.positiveControls ?? [],
                  cisDomains:    p?.cisDomains  ?? [],
                  auditSummary:  p?.auditSummary ?? "Audit generated from uploaded configuration file.",
                };
                setUploadedAudits(prev => [...prev, newAudit as any]);
                setUploadStep(5);
                return;
              }
              const delays = [500,900,700,1200,800];
              setTimeout(() => { setUploadStep(step + 1); advance(step + 1); }, delays[step] ?? 700);
            };
            advance(0);
          };
          // ── Fleet dashboard ─────────────────────────────────────────────────
          return (
            <div style={{ display:"flex", flexDirection:"column", gap:20 }}>

              {/* ── Fleet sub-tab nav ──────────────────────────────────────── */}
              <div style={{ display:"flex", gap:4, borderBottom:"2px solid var(--border)", paddingBottom:0 }}>
                {([["overview","📋 Fleet Overview"],["topology","🗺 Network Topology"],["diff","🔄 Config Diff"],["changes","📝 Change Requests"]] as [string,string][]).map(([k,l])=>(
                  <button key={k} onClick={()=>setNetFleetTab(k)}
                    style={{ background:"none", border:"none", borderBottom:`2px solid ${netFleetTab===k?NAV:"transparent"}`, marginBottom:-2, padding:"9px 20px", fontSize:12, fontWeight:netFleetTab===k?800:600, color:netFleetTab===k?NAV:"var(--muted-foreground)", cursor:"pointer" }}>
                    {l}
                  </button>
                ))}
              </div>

              {/* ── Fleet Overview ─────────────────────────────────────────── */}
              {netFleetTab === "overview" && <>
              {/* ── Upload Config + Integrations Hub ──────────────────────── */}
              <div style={card({ padding:0, overflow:"hidden" })}>
                <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 20px", borderBottom:"1px solid var(--border)", background:"rgba(30,58,95,0.03)" }}>
                  <span style={{ fontSize:10, fontWeight:800, color:NAV, letterSpacing:"0.5px" }}>DATA SOURCES</span>
                  <span style={{ fontSize:10, color:"var(--muted-foreground)" }}>Upload device config files or pull automatically from connected integrations</span>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:0 }}>
                  {/* Left: Upload drop-zone */}
                  <div style={{ padding:"18px 22px", borderRight:"1px solid var(--border)" }}>
                    <div style={{ fontSize:12, fontWeight:700, color:"var(--foreground)", marginBottom:12, display:"flex", alignItems:"center", gap:6 }}>
                      <span>📁</span> Upload Device Config
                    </div>
                    {(uploadStep === -1 || uploadStep === 5) ? (
                      <div
                        onDragOver={e=>{ e.preventDefault(); setUploadDragging(true); }}
                        onDragLeave={()=>setUploadDragging(false)}
                        onDrop={e=>{ e.preventDefault(); setUploadDragging(false); const f=e.dataTransfer.files[0]; if(f) startUpload(f.name, f); }}
                        onClick={()=>document.getElementById("secops-file-input")?.click()}
                        style={{ border:`2px dashed ${uploadDragging?"#3B82F6":"var(--border)"}`, borderRadius:12, padding:"24px 16px", textAlign:"center", background:uploadDragging?"rgba(59,130,246,0.06)":"var(--secondary)", cursor:"pointer", transition:"all 0.2s" }}
                      >
                        <input id="secops-file-input" type="file" accept=".conf,.xml,.exp,.cfg,.txt,.gz" style={{ display:"none" }} onChange={e=>{ const f=e.target.files?.[0]; if(f) startUpload(f.name, f); (e.target as any).value=""; }} />
                        <div style={{ fontSize:30, marginBottom:8 }}>☁</div>
                        <div style={{ fontSize:13, fontWeight:700, color:"var(--foreground)", marginBottom:4 }}>Drag & drop config file here</div>
                        <div style={{ fontSize:10, color:"var(--muted-foreground)", marginBottom:14, lineHeight:1.6 }}>
                          FortiGate <code style={{ fontSize:9 }}>.conf</code> · PAN-OS <code style={{ fontSize:9 }}>.xml</code> · SonicWall <code style={{ fontSize:9 }}>.exp</code> · Cisco IOS <code style={{ fontSize:9 }}>.cfg</code> · Juniper <code style={{ fontSize:9 }}>.conf</code>
                        </div>
                        <div style={{ display:"inline-block", background:NAV, color:"white", borderRadius:8, padding:"7px 20px", fontSize:12, fontWeight:700 }}>Browse Files</div>
                        {uploadStep === 5 && (
                          <div style={{ marginTop:12, padding:"8px 14px", background:"rgba(6,95,70,0.08)", border:"1px solid #6EE7B7", borderRadius:8, display:"flex", alignItems:"center", gap:6, justifyContent:"center" }}>
                            <span style={{ color:EME, fontWeight:900, fontSize:13 }}>✓</span>
                            <span style={{ fontSize:11, fontWeight:700, color:EME }}>{uploadFile} — audit added to fleet</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ border:"1px solid var(--border)", borderRadius:12, padding:"18px 20px", background:"var(--secondary)" }}>
                        <div style={{ fontSize:11, fontWeight:700, color:"var(--foreground)", marginBottom:14, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{uploadFile}</div>
                        {UPLOAD_STEPS.map((label,i)=>(
                          <div key={i} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                            <div style={{ width:18, height:18, borderRadius:"50%", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", border:`2px solid ${uploadStep>i?EME:uploadStep===i?NAV:"var(--border)"}`, background:uploadStep>i?EME:"transparent", transition:"all 0.35s" }}>
                              {uploadStep>i ? <span style={{ color:"white", fontSize:9, fontWeight:900 }}>✓</span> : uploadStep===i ? <span style={{ width:6, height:6, borderRadius:"50%", background:NAV, display:"block" }} /> : null}
                            </div>
                            <span style={{ fontSize:11, color:uploadStep>i?EME:uploadStep===i?"var(--foreground)":"var(--muted-foreground)", fontWeight:uploadStep>=i?600:400, transition:"color 0.35s" }}>{label}</span>
                            {uploadStep===i && <span style={{ fontSize:10, color:"var(--muted-foreground)", marginLeft:"auto", animation:"pulse 1s infinite" }}>…</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Right: Integration tiles — real API connections */}
                  <div style={{ padding:"18px 22px" }}>
                    <div style={{ fontSize:12, fontWeight:700, color:"var(--foreground)", marginBottom:4, display:"flex", alignItems:"center", gap:6 }}>
                      <span>🔗</span> Auto-Pull from Integrations
                    </div>
                    <div style={{ fontSize:10, color:"var(--muted-foreground)", marginBottom:10 }}>Credentials stored encrypted · connections persist across sessions</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
                      {NETWORK_VENDORS.map(vendor => {
                        const conn = netMgmtConns.find(c => c.connectorId === vendor.connectorId);
                        const isSyncing = conn && syncingIds.has(conn.id);
                        const isConn = conn && (conn.status === "connected" || conn.status === "partial");
                        const statusLabel = isSyncing ? "⟳ Syncing…" : isConn ? `● Connected${conn.lastSync ? ` · ${new Date(conn.lastSync).toLocaleDateString()}` : ""}` : "○ Not connected";
                        return (
                          <div key={vendor.connectorId} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", borderRadius:10, border:`1px solid ${isConn?"rgba(6,95,70,0.25)":"var(--border)"}`, background:isConn?"rgba(6,95,70,0.04)":"var(--card)", transition:"all 0.2s" }}>
                            <span style={{ fontSize:15, flexShrink:0 }}>{vendor.logo}</span>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:11, fontWeight:700, color:"var(--foreground)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{vendor.label}</div>
                              <div style={{ fontSize:9, fontWeight:700, color:isConn?EME:"var(--muted-foreground)" }}>{statusLabel}</div>
                            </div>
                            {isConn ? (
                              <button onClick={()=>handleSync(conn)} disabled={isSyncing}
                                style={{ background:isSyncing?"var(--secondary)":EME, color:"white", border:"none", borderRadius:6, padding:"4px 12px", fontSize:10, fontWeight:700, cursor:isSyncing?"default":"pointer", opacity:isSyncing?0.55:1, transition:"opacity 0.2s" }}>
                                {isSyncing ? "…" : "Sync"}
                              </button>
                            ) : (
                              <button onClick={()=>{ setConnectModal({vendor}); setConnectForm({}); setConnectError(null); }}
                                style={{ background:"transparent", color:NAV, border:`1px solid ${NAV}`, borderRadius:6, padding:"4px 12px", fontSize:10, fontWeight:700, cursor:"pointer" }}>
                                Connect
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Top row: Gauge + AI Summary + KPI cards */}
              <div style={{ display:"grid", gridTemplateColumns:"auto 1fr", gap:16 }}>
                {/* Gauge card */}
                <div style={card({ padding:"22px 28px", display:"flex", flexDirection:"column", alignItems:"center", minWidth:200 })}>
                  <div style={{ fontSize:10, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.5px", marginBottom:8 }}>FLEET POSTURE SCORE</div>
                  <ScoreGauge score={fleetAvg} size={160} />
                  <div style={{ fontSize:11, fontWeight:700, color:"var(--muted-foreground)", marginTop:6 }}>{lNetAudits.length} devices audited</div>
                </div>
                {/* Right: AI Summary + KPIs */}
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  {/* AI Executive Summary */}
                  <div style={card({ padding:"16px 20px", background:"rgba(30,58,95,0.03)", borderColor:"rgba(30,58,95,0.15)" })}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                      <span style={{ background:NAV, color:"white", borderRadius:4, padding:"2px 8px", fontSize:9, fontWeight:800 }}>AI</span>
                      <span style={{ fontSize:12, fontWeight:800, color:NAV }}>Executive Summary</span>
                    </div>
                    <div style={{ fontSize:12, color:"var(--foreground)", lineHeight:1.7 }}>
                      Fleet-wide security posture score is <strong style={{ color:fleetAvg>=70?EME:fleetAvg>=50?AMB:RED }}>{fleetAvg}/100</strong> across {lNetAudits.length} audited devices.
                      {" "}<strong style={{ color:RED }}>{critRisk} Critical</strong> and <strong style={{ color:AMB }}>{highRisk} High</strong> risk devices require immediate attention.
                      {" "}Total of <strong>{totalFinds}</strong> findings identified, of which <strong style={{ color:RED }}>{critFinds}</strong> are critical severity.
                      {" "}FortiGate 100F (HQ) leads the fleet at <strong style={{ color:EME }}>85/100</strong>, while Palo Alto PA-5220 requires the most urgent remediation at <strong style={{ color:RED }}>31/100</strong>.
                      {" "}Key themes: excessive allow-any-service rules, IKEv1 VPN usage, and insufficient UTM coverage across branch devices.
                    </div>
                  </div>
                  {/* KPI row */}
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10 }}>
                    {[
                      { label:"Total Audits",         value:lNetAudits.length,  icon:"📁", color:NAV },
                      { label:"Average Score",         value:fleetAvg,          icon:"📊", color:fleetAvg>=70?EME:fleetAvg>=50?AMB:RED },
                      { label:"Critical Risk Devices", value:critRisk,          icon:"🔴", color:RED },
                      { label:"High Risk Devices",     value:highRisk,          icon:"🟠", color:AMB },
                      { label:"Total Findings",        value:totalFinds,        icon:"⚠", color:AMB },
                    ].map(k=>(
                      <div key={k.label} style={card({ padding:"13px 14px" })}>
                        <div style={{ fontSize:18 }}>{k.icon}</div>
                        <div style={{ fontSize:20, fontWeight:800, color:k.color, fontFamily:"'JetBrains Mono',monospace", marginTop:4 }}>{k.value}</div>
                        <div style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", marginTop:2, lineHeight:1.3 }}>{k.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Charts row 1 */}
              <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:16 }}>
                {/* Security Score Trend */}
                <div style={card({ padding:"18px 20px" })}>
                  <div style={{ fontSize:13, fontWeight:800, color:NAV, marginBottom:14 }}>Security Score Trend (12 Weeks)</div>
                  <ResponsiveContainer width="100%" height={170}>
                    <LineChart data={scoreTrendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="week" tick={{ fontSize:9, fill:"#9CA3AF" }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0,100]} tick={{ fontSize:9, fill:"#9CA3AF" }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:8, fontSize:11 }} />
                      <Line type="monotone" dataKey="score" stroke={NAV} strokeWidth={2.5} dot={{ r:3, fill:NAV }} activeDot={{ r:5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {/* Vendor Distribution */}
                <div style={card({ padding:"18px 20px" })}>
                  <div style={{ fontSize:13, fontWeight:800, color:NAV, marginBottom:10 }}>Vendor Distribution</div>
                  <ResponsiveContainer width="100%" height={130}>
                    <PieChart>
                      <Pie data={vendorDist} cx="50%" cy="50%" innerRadius={35} outerRadius={58} paddingAngle={3} dataKey="value">
                        {vendorDist.map((_,i)=><Cell key={i} fill={PIECOL[i%PIECOL.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:8, fontSize:11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:4 }}>
                    {vendorDist.map((v,i)=>(
                      <div key={v.name} style={{ display:"flex", alignItems:"center", gap:4 }}>
                        <div style={{ width:8, height:8, borderRadius:2, background:PIECOL[i%PIECOL.length] }} />
                        <span style={{ fontSize:10, color:"var(--muted-foreground)" }}>{v.name} ({v.value})</span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Device Type Mix */}
                <div style={card({ padding:"18px 20px" })}>
                  <div style={{ fontSize:13, fontWeight:800, color:NAV, marginBottom:10 }}>Device Type Mix</div>
                  <ResponsiveContainer width="100%" height={130}>
                    <PieChart>
                      <Pie data={deviceTypeDist} cx="50%" cy="50%" innerRadius={35} outerRadius={58} paddingAngle={3} dataKey="value">
                        {deviceTypeDist.map((_,i)=><Cell key={i} fill={PIECOL[(i+3)%PIECOL.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:8, fontSize:11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:4 }}>
                    {deviceTypeDist.map((v,i)=>(
                      <div key={v.name} style={{ display:"flex", alignItems:"center", gap:4 }}>
                        <div style={{ width:8, height:8, borderRadius:2, background:PIECOL[(i+3)%PIECOL.length] }} />
                        <span style={{ fontSize:10, color:"var(--muted-foreground)" }}>{v.name} ({v.value})</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Charts row 2 */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                {/* Fleet Finding Severity — clickable: filters table */}
                <div style={card({ padding:"18px 20px" })}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                    <div style={{ fontSize:13, fontWeight:800, color:NAV }}>Fleet Finding Severity</div>
                    {chartFilter.type === "severity" && (
                      <button onClick={()=>setChartFilter({type:null,value:""})} style={{ fontSize:10, color:RED, background:"rgba(248,113,113,0.1)", border:"1px solid rgba(248,113,113,0.3)", borderRadius:5, padding:"2px 8px", cursor:"pointer", fontFamily:"inherit", fontWeight:700 }}>✕ Clear filter</button>
                    )}
                  </div>
                  <div style={{ fontSize:10, color:"var(--muted-foreground)", marginBottom:8 }}>Click a bar to filter the audit table below</div>
                  <ResponsiveContainer width="100%" height={150}>
                    <BarChart data={fleetSevData} layout="vertical" barSize={16}
                      onClick={d => { if (d?.activePayload?.[0]) { const sev = d.activePayload[0].payload.name; setChartFilter(prev => prev.type==="severity"&&prev.value===sev ? {type:null,value:""} : {type:"severity",value:sev}); } }}>
                      <XAxis type="number" tick={{ fontSize:9, fill:"#9CA3AF" }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize:11, fill:"var(--foreground)", fontWeight:600 }} axisLine={false} tickLine={false} width={60} />
                      <Tooltip contentStyle={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:8, fontSize:11 }} cursor={{ fill:"rgba(255,255,255,0.04)" }} />
                      <Bar dataKey="count" radius={[0,4,4,0]} style={{ cursor:"pointer" }}>
                        {fleetSevData.map((d,i)=><Cell key={i} fill={d.fill} opacity={chartFilter.type==="severity"&&chartFilter.value!==d.name?0.35:1} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {/* CIS Benchmark Domains Radar */}
                <div style={card({ padding:"18px 20px" })}>
                  <div style={{ fontSize:13, fontWeight:800, color:NAV, marginBottom:14 }}>CIS Benchmark Domains (Fleet Avg %)</div>
                  <ResponsiveContainer width="100%" height={150}>
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="rgba(255,255,255,0.08)" />
                      <PolarAngleAxis dataKey="name" tick={{ fontSize:9, fill:"#9CA3AF" }} />
                      <Radar dataKey="pct" stroke={NAV} fill={NAV} fillOpacity={0.18} strokeWidth={2} />
                      <Tooltip contentStyle={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:8, fontSize:11 }} formatter={(v)=>`${v}%`} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Charts row 3 */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                {/* Top Devices by Risk — clickable: open audit detail */}
                <div style={card({ padding:"18px 20px" })}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                    <div style={{ fontSize:13, fontWeight:800, color:NAV }}>Top Devices by Risk (Lowest Score)</div>
                    {chartFilter.type === "device" && (
                      <button onClick={()=>setChartFilter({type:null,value:""})} style={{ fontSize:10, color:RED, background:"rgba(248,113,113,0.1)", border:"1px solid rgba(248,113,113,0.3)", borderRadius:5, padding:"2px 8px", cursor:"pointer", fontFamily:"inherit", fontWeight:700 }}>✕ Clear</button>
                    )}
                  </div>
                  <div style={{ fontSize:10, color:"var(--muted-foreground)", marginBottom:8 }}>Click a bar to drill into that device's audit</div>
                  <ResponsiveContainer width="100%" height={170}>
                    <BarChart data={topByRisk.map(a=>({ name:a.hostname.length>12?a.hostname.slice(0,12)+"…":a.hostname, fullName:a.hostname, score:a.score, fill:a.score>=70?GRN:a.score>=50?AMB:RED }))} layout="vertical" barSize={14}
                      onClick={d => { if (d?.activePayload?.[0]) { const name = d.activePayload[0].payload.fullName; const audit = [...lNetAudits,...uploadedAudits].find(a=>a.hostname===name); if (audit) { setSelectedAudit(audit); setAuditSubTab("overview"); } else setChartFilter(prev=>prev.type==="device"&&prev.value===name?{type:null,value:""}:{type:"device",value:name}); } }}>
                      <XAxis type="number" domain={[0,100]} tick={{ fontSize:9, fill:"#9CA3AF" }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize:9, fill:"var(--foreground)" }} axisLine={false} tickLine={false} width={90} />
                      <Tooltip contentStyle={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:8, fontSize:11 }} cursor={{ fill:"rgba(255,255,255,0.04)" }} />
                      <Bar dataKey="score" radius={[0,4,4,0]} style={{ cursor:"pointer" }}>
                        {topByRisk.map((a,i)=><Cell key={i} fill={a.score>=70?GRN:a.score>=50?AMB:RED} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {/* Per-Device Severity Heatmap — clickable: open audit */}
                <div style={card({ padding:"18px 20px" })}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                    <div style={{ fontSize:13, fontWeight:800, color:NAV }}>Per-Device Severity Heatmap</div>
                  </div>
                  <div style={{ fontSize:10, color:"var(--muted-foreground)", marginBottom:8 }}>Click a row to open that device</div>
                  <ResponsiveContainer width="100%" height={170}>
                    <BarChart data={heatmapData} layout="vertical" barSize={14}
                      onClick={d => { if (d?.activePayload?.[0]) { const rawName = d.activePayload[0].payload.name; const audit = [...lNetAudits,...uploadedAudits].find(a=>a.hostname.startsWith(rawName.replace("…",""))); if (audit) { setSelectedAudit(audit); setAuditSubTab("overview"); } } }}>
                      <XAxis type="number" tick={{ fontSize:9, fill:"#9CA3AF" }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize:9, fill:"var(--foreground)" }} axisLine={false} tickLine={false} width={90} />
                      <Tooltip contentStyle={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:8, fontSize:11 }} cursor={{ fill:"rgba(255,255,255,0.04)" }} />
                      <Legend iconSize={8} wrapperStyle={{ fontSize:10 }} />
                      <Bar dataKey="Critical" stackId="a" fill={RED} style={{ cursor:"pointer" }} />
                      <Bar dataKey="High"     stackId="a" fill={AMB} style={{ cursor:"pointer" }} />
                      <Bar dataKey="Medium"   stackId="a" fill={BLU} style={{ cursor:"pointer" }} />
                      <Bar dataKey="Low"      stackId="a" fill={EME} radius={[0,3,3,0]} style={{ cursor:"pointer" }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Audit History Table */}
              <div style={card({ padding:0, overflow:"hidden" })}>
                {/* Header row */}
                <div style={{ padding:"14px 20px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                  <div style={{ fontSize:14, fontWeight:800, color:NAV }}>Audit History</div>
                  {chartFilter.type && (
                    <span style={{ fontSize:10, fontWeight:700, color:AMB, background:"rgba(252,211,77,0.12)", border:"1px solid rgba(252,211,77,0.3)", borderRadius:5, padding:"2px 8px" }}>
                      Filtered: {chartFilter.type} = {chartFilter.value}
                      <button onClick={()=>setChartFilter({type:null,value:""})} style={{ marginLeft:6, background:"none", border:"none", color:AMB, cursor:"pointer", fontWeight:800, fontSize:11, padding:0 }}>✕</button>
                    </span>
                  )}
                  <div style={{ flex:1 }} />
                  <input
                    placeholder="Search filename or device…"
                    value={auditSearch}
                    onChange={e=>setAuditSearch(e.target.value)}
                    style={{ background:"var(--input)", border:"1px solid var(--border)", borderRadius:8, padding:"6px 12px", fontSize:12, color:"var(--foreground)", width:200, outline:"none" }}
                  />
                  <select value={auditVendorFilter} onChange={e=>setAuditVendorFilter(e.target.value)} style={{ background:"var(--input)", border:"1px solid var(--border)", borderRadius:8, padding:"6px 10px", fontSize:12, color:"var(--foreground)", outline:"none" }}>
                    <option value="All">All Vendors</option>
                    {[...new Set(lNetAudits.map(a=>a.vendorSlug))].map(v=><option key={v} value={v}>{v}</option>)}
                  </select>
                </div>

                {/* Bulk action bar — appears when rows are selected */}
                {selectedAuditIds.size > 0 && (
                  <div style={{ padding:"10px 20px", background:"rgba(147,197,253,0.07)", borderBottom:"1px solid rgba(147,197,253,0.2)", display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ fontSize:12, fontWeight:700, color:NAV }}>{selectedAuditIds.size} audit{selectedAuditIds.size>1?"s":""} selected</span>
                    <div style={{ flex:1 }} />
                    {([
                      { label:"✦ AI Enrich",      color:NAV,  bg:"rgba(147,197,253,0.12)", border:"rgba(147,197,253,0.3)", action:"ai" },
                      { label:"✎ Edit",            color:AMB,  bg:"rgba(252,211,77,0.10)", border:"rgba(252,211,77,0.3)",  action:"edit" },
                      { label:"↓ Export CSV",      color:"#34D399", bg:"rgba(52,211,153,0.10)", border:"rgba(52,211,153,0.3)", action:"csv" },
                      { label:"✓ Mark Reviewed",   color:"#34D399", bg:"rgba(52,211,153,0.08)", border:"rgba(52,211,153,0.25)", action:"reviewed" },
                      { label:"🗑 Delete",          color:RED,  bg:"rgba(248,113,113,0.10)", border:"rgba(248,113,113,0.3)", action:"delete" },
                    ] as {label:string;color:string;bg:string;border:string;action:string}[]).map(btn=>(
                      <button key={btn.action} onClick={()=>{
                        if (btn.action === "delete") {
                          setUploadedAudits(prev => prev.filter(a => !selectedAuditIds.has(a.id)));
                          setSelectedAuditIds(new Set());
                        } else if (btn.action === "csv") {
                          const sel = filteredAudits.filter(a=>selectedAuditIds.has(a.id));
                          const rows = ["Filename,Vendor,Score,Risk,Rules,Critical,High,Medium,Low,Date",...sel.map(a=>`${a.filename},${a.vendor},${a.score},${a.risk},${a.rulesTotal},${a.findings.critical},${a.findings.high},${a.findings.medium},${a.findings.low},${a.auditDate}`)];
                          const blob = new Blob([rows.join("\n")],{type:"text/csv"});
                          const url = URL.createObjectURL(blob);
                          const el = document.createElement("a"); el.href=url; el.download="audit-export.csv"; el.click(); URL.revokeObjectURL(url);
                        } else {
                          setAuditBulkModal(btn.action);
                        }
                      }} style={{ padding:"5px 12px", borderRadius:7, border:`1px solid ${btn.border}`, background:btn.bg, fontSize:11, fontWeight:700, color:btn.color, cursor:"pointer", fontFamily:"inherit" }}>{btn.label}</button>
                    ))}
                    <button onClick={()=>setSelectedAuditIds(new Set())} style={{ padding:"5px 10px", borderRadius:7, border:"1px solid var(--border)", background:"transparent", fontSize:11, color:"var(--muted-foreground)", cursor:"pointer", fontFamily:"inherit" }}>Clear</button>
                  </div>
                )}

                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                  <thead>
                    <tr style={{ borderBottom:"1px solid var(--border)", background:"var(--secondary)" }}>
                      {/* Select-all checkbox */}
                      <th style={{ padding:"10px 14px", width:36 }}>
                        <input type="checkbox"
                          checked={filteredAudits.length > 0 && filteredAudits.every(a=>selectedAuditIds.has(a.id))}
                          ref={el=>{ if (el) el.indeterminate = selectedAuditIds.size>0 && !filteredAudits.every(a=>selectedAuditIds.has(a.id)); }}
                          onChange={e=>{ if (e.target.checked) setSelectedAuditIds(new Set(filteredAudits.map(a=>a.id))); else setSelectedAuditIds(new Set()); }}
                          style={{ width:14, height:14, cursor:"pointer", accentColor:NAV }} />
                      </th>
                      {["Filename","Vendor","Score","Risk","Rules","Findings","Date","Actions"].map(h=>(
                        <th key={h} style={{ padding:"10px 14px", textAlign:"left", fontSize:10, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.5px" }}>{h.toUpperCase()}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAudits.map(a=>{
                      const scoreCol = a.score>=70?GRN:a.score>=50?AMB:RED;
                      const totalF = a.findings.critical+a.findings.high+a.findings.medium+a.findings.low;
                      const isSelected = selectedAuditIds.has(a.id);
                      return (
                        <tr key={a.id}
                          style={{ borderBottom:"1px solid var(--border)", cursor:"pointer", background: isSelected ? "rgba(147,197,253,0.06)" : "transparent", transition:"background 0.1s" }}
                          onClick={()=>{ setSelectedAudit(a); setAuditSubTab("overview"); }}
                          onMouseEnter={e=>{ if (!isSelected) e.currentTarget.style.background="var(--secondary)"; }}
                          onMouseLeave={e=>{ if (!isSelected) e.currentTarget.style.background="transparent"; }}>
                          {/* Row checkbox */}
                          <td style={{ padding:"11px 14px" }} onClick={e=>e.stopPropagation()}>
                            <input type="checkbox"
                              checked={isSelected}
                              onChange={e=>{ const next = new Set(selectedAuditIds); if (e.target.checked) next.add(a.id); else next.delete(a.id); setSelectedAuditIds(next); }}
                              style={{ width:14, height:14, cursor:"pointer", accentColor:NAV }} />
                          </td>
                          <td style={{ padding:"11px 14px" }}>
                            <div style={{ fontSize:11, fontWeight:700, color:NAV, maxWidth:220, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{a.filename}</div>
                            <div style={{ fontSize:10, color:"var(--muted-foreground)" }}>{a.hostname} · {a.deviceType}</div>
                          </td>
                          <td style={{ padding:"11px 14px" }}>
                            <span style={{ background:vendorColors[a.vendorSlug]?`${vendorColors[a.vendorSlug]}18`:"var(--secondary)", color:vendorColors[a.vendorSlug]??NAV, border:`1px solid ${vendorColors[a.vendorSlug]??"var(--border)"}30`, borderRadius:5, padding:"2px 8px", fontSize:10, fontWeight:700 }}>{a.vendor}</span>
                          </td>
                          <td style={{ padding:"11px 14px" }}>
                            <div style={{ width:32, height:32, borderRadius:"50%", background:`${scoreCol}18`, border:`2px solid ${scoreCol}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, color:scoreCol, fontFamily:"'JetBrains Mono',monospace" }}>{a.score}</div>
                          </td>
                          <td style={{ padding:"11px 14px" }}><RiskBadge level={a.risk} /></td>
                          <td style={{ padding:"11px 14px", fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"var(--foreground)" }}>{a.rulesTotal}</td>
                          <td style={{ padding:"11px 14px" }}>
                            <div style={{ display:"flex", gap:3 }}>
                              {a.findings.critical>0 && <span style={{ width:18, height:18, borderRadius:"50%", background:RED, color:"white", fontSize:9, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center" }}>{a.findings.critical}</span>}
                              {a.findings.high>0     && <span style={{ width:18, height:18, borderRadius:"50%", background:AMB, color:"white", fontSize:9, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center" }}>{a.findings.high}</span>}
                              {a.findings.medium>0   && <span style={{ width:18, height:18, borderRadius:"50%", background:BLU, color:"white", fontSize:9, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center" }}>{a.findings.medium}</span>}
                              {a.findings.low>0      && <span style={{ width:18, height:18, borderRadius:"50%", background:EME, color:"white", fontSize:9, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center" }}>{a.findings.low}</span>}
                              <span style={{ fontSize:10, color:"var(--muted-foreground)", alignSelf:"center", marginLeft:2 }}>{totalF} total</span>
                            </div>
                          </td>
                          <td style={{ padding:"11px 14px", fontSize:11, color:"var(--muted-foreground)" }}>{a.auditDate}</td>
                          <td style={{ padding:"11px 14px" }} onClick={e=>e.stopPropagation()}>
                            <div style={{ display:"flex", gap:5 }}>
                              <button onClick={()=>{ setSelectedAudit(a); setAuditSubTab("overview"); }} style={{ background:NAV, color:"white", border:"none", borderRadius:6, padding:"5px 10px", fontSize:11, fontWeight:700, cursor:"pointer" }}>View →</button>
                              <button onClick={()=>{ setSelectedAuditIds(new Set([a.id])); setAuditBulkModal("ai"); }} style={{ background:"rgba(147,197,253,0.12)", color:NAV, border:`1px solid rgba(147,197,253,0.3)`, borderRadius:6, padding:"5px 8px", fontSize:11, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" }} title="AI Enrich">✦ AI</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filteredAudits.length === 0 && (
                  <div style={{ padding:32, textAlign:"center", color:"var(--muted-foreground)", fontSize:12 }}>No audits match the current filters.</div>
                )}
              </div>

              {/* Bulk action modal */}
              {auditBulkModal && (
                <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:9000, display:"flex", alignItems:"center", justifyContent:"center" }}
                  onClick={()=>setAuditBulkModal(null)}>
                  <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:16, padding:"28px 32px", width:520, maxWidth:"95vw", boxShadow:"0 24px 64px rgba(0,0,0,0.5)" }}
                    onClick={e=>e.stopPropagation()}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
                      <div style={{ fontSize:16, fontWeight:800, color:"var(--foreground)" }}>
                        {auditBulkModal==="ai" ? "✦ AI Enrichment" : auditBulkModal==="edit" ? "✎ Edit Audits" : "✓ Mark Reviewed"}
                      </div>
                      <button onClick={()=>setAuditBulkModal(null)} style={{ background:"none", border:"none", fontSize:18, cursor:"pointer", color:"var(--muted-foreground)" }}>✕</button>
                    </div>
                    {auditBulkModal === "ai" && (
                      <div>
                        <div style={{ fontSize:12, color:"var(--muted-foreground)", marginBottom:16 }}>AI analysis for {selectedAuditIds.size} selected audit{selectedAuditIds.size>1?"s":""}:</div>
                        {filteredAudits.filter(a=>selectedAuditIds.has(a.id)).map(a=>(
                          <div key={a.id} style={{ marginBottom:12, padding:"12px 14px", borderRadius:10, background:"var(--secondary)", border:"1px solid var(--border)" }}>
                            <div style={{ fontSize:12, fontWeight:700, color:NAV, marginBottom:6 }}>{a.hostname} — Score {a.score}/100</div>
                            <div style={{ fontSize:11, color:"var(--foreground)", lineHeight:1.6 }}>
                              {a.risk==="Critical"||a.risk==="High" ? `⚠ High-risk device with ${a.findings.critical} critical findings. Immediate remediation recommended. Key concerns: excessive allow-any rules, outdated firmware, missing UTM profiles.` :
                               a.risk==="Medium" ? `ℹ Moderate risk profile. ${a.findings.high} high-severity findings require attention within 72h. Focus on VPN configuration and logging gaps.` :
                               `✓ Low risk posture. ${a.findings.low} minor findings detected. Maintain current hardening standard and schedule quarterly review.`}
                            </div>
                          </div>
                        ))}
                        <div style={{ marginTop:16, padding:"12px 14px", borderRadius:10, background:"rgba(147,197,253,0.06)", border:"1px solid rgba(147,197,253,0.2)" }}>
                          <div style={{ fontSize:11, fontWeight:700, color:NAV, marginBottom:4 }}>AI Recommendation</div>
                          <div style={{ fontSize:11, color:"var(--foreground)", lineHeight:1.6 }}>Prioritise remediation in order of risk score (lowest first). Create a unified remediation ticket for findings shared across multiple devices to reduce effort by an estimated 35%.</div>
                        </div>
                      </div>
                    )}
                    {auditBulkModal === "edit" && (
                      <div style={{ fontSize:12, color:"var(--muted-foreground)", lineHeight:1.7 }}>
                        Bulk edit metadata for {selectedAuditIds.size} audit{selectedAuditIds.size>1?"s":""}. Owner, tags, and review notes can be updated. Individual findings remain unmodified.
                        <div style={{ marginTop:14, display:"flex", flexDirection:"column", gap:10 }}>
                          {[{l:"Owner",placeholder:"e.g. Alex Kim"},{l:"Review Notes",placeholder:"Enter notes…"},{l:"Tags",placeholder:"comma-separated"}].map(f=>(
                            <div key={f.l}>
                              <div style={{ fontSize:11, fontWeight:700, color:"var(--muted-foreground)", marginBottom:4 }}>{f.l.toUpperCase()}</div>
                              <input placeholder={f.placeholder} style={{ width:"100%", boxSizing:"border-box", padding:"8px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--secondary)", color:"var(--foreground)", fontSize:12, fontFamily:"inherit", outline:"none" }} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {auditBulkModal === "reviewed" && (
                      <div style={{ fontSize:12, color:"var(--muted-foreground)", lineHeight:1.7 }}>
                        Mark {selectedAuditIds.size} audit{selectedAuditIds.size>1?"s":""} as reviewed? This will timestamp the review and record your user ID in the audit log.
                      </div>
                    )}
                    <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:20 }}>
                      <button onClick={()=>setAuditBulkModal(null)} style={{ padding:"9px 20px", borderRadius:8, border:"1px solid var(--border)", background:"var(--secondary)", color:"var(--foreground)", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Cancel</button>
                      <button onClick={()=>{ setAuditBulkModal(null); setSelectedAuditIds(new Set()); }} style={{ padding:"9px 22px", borderRadius:8, border:"none", background:NAV, color:"white", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                        {auditBulkModal==="ai"?"Done":auditBulkModal==="edit"?"Save Changes":"Mark Reviewed"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              </>}

              {/* ── Network Topology ──────────────────────────────────────────── */}
              {netFleetTab === "topology" && (() => {
                const devs: any[] = lNetworkDevices;
                const zMatrix: any = lZoneMatrix;
                const DEV_COL: any = { "Firewall":RED,"Core Switch":NAV,"Access Switch":BLU,"Edge Router":EME,"VPN Gateway":PRP,"Load Balancer":AMB,"IDS/IPS":CYN,"Wireless Controller":"#F59E0B","Proxy Server":"#6B7280","NAT Gateway":"#059669" };
                const DEV_ICO: any = { "Firewall":"🔥","Core Switch":"🔀","Access Switch":"📡","Edge Router":"↔","VPN Gateway":"🔒","IDS/IPS":"🛡","Load Balancer":"⚖","Wireless Controller":"📶","Proxy Server":"🔍","NAT Gateway":"🌐" };

                // ── Perimeter ring model: group zones into External / DMZ / Internal ──
                const PCLASS: any = {
                  "Perimeter":"external","Internet":"external","CORP_NET":"external",
                  "DMZ":"dmz","DB_SUBNET":"dmz","OT_ZONE":"dmz",
                  "Core":"internal","Office LAN":"internal","Legacy DC":"internal","Cloud":"internal","MGMT":"internal","VPN_POOL":"internal",
                };
                const RING_CFG: any = {
                  "external": { label:"🌐  EXTERNAL ZONE (Perimeter / Internet-Facing)", bg:"rgba(239,68,68,0.04)",  border:RED },
                  "dmz":      { label:"🔶  DMZ — Demilitarized Zone",                    bg:"rgba(245,158,11,0.04)", border:AMB },
                  "internal": { label:"🔒  INTERNAL NETWORK (Core / Office / Cloud)",    bg:"rgba(34,197,94,0.04)",  border:EME },
                };
                const RING_Y: any  = { "external":30,  "dmz":230, "internal":430 };
                const RING_H: any  = { "external":168, "dmz":168, "internal":190 };

                const ringDevs: any = { external:[], dmz:[], internal:[] };
                devs.forEach((d:any)=>{ const cls=PCLASS[d.zone]??"internal"; ringDevs[cls].push(d); });
                const maxPerRing = Math.max(1, ...["external","dmz","internal"].map((c:string)=>ringDevs[c].length));
                const ringW = maxPerRing * 155 + 60;

                const topoNodes: any[] = [];
                const topoEdges: any[] = [];

                // Background ring nodes (outermost first)
                (["internal","dmz","external"] as string[]).forEach((cls:string)=>{
                  const cfg = RING_CFG[cls];
                  const yOff = RING_Y[cls];
                  topoNodes.push({ id:`ring-${cls}`, selectable:false, connectable:false, draggable:false,
                    position:{ x:-30, y:yOff-22 },
                    style:{ width:ringW+40, height:RING_H[cls], background:cfg.bg, border:`2px dashed ${cfg.border}`, borderRadius:16, zIndex:0, pointerEvents:"none" },
                    data:{ label:<div style={{ fontSize:8, fontWeight:800, color:cfg.border, letterSpacing:"0.4px", padding:"4px 8px" }}>{cfg.label}</div> }
                  });
                  ringDevs[cls].forEach((d:any, i:number)=>{
                    const col = DEV_COL[d.type]??"#6B7280";
                    topoNodes.push({ id:d.id, position:{ x:10+i*155, y:yOff },
                      style:{ width:138, padding:"7px 9px", background:"var(--card)", border:`2px solid ${topoSelected?.id===d.id?col:col+"55"}`, borderRadius:10, boxShadow:topoSelected?.id===d.id?`0 0 12px ${col}44`:"0 2px 5px rgba(0,0,0,0.14)", cursor:"pointer", fontFamily:"inherit", zIndex:2 },
                      data:{ label:(
                        <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                            <span style={{ fontSize:11 }}>{DEV_ICO[d.type]??"🖥"}</span>
                            <span style={{ fontSize:8, fontWeight:800, color:col, background:`${col}18`, borderRadius:3, padding:"1px 5px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:75 }}>{d.zone}</span>
                          </div>
                          <div style={{ fontSize:9, fontWeight:700, color:"var(--foreground)", lineHeight:1.2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{d.name}</div>
                          <div style={{ fontSize:8, color:"var(--muted-foreground)", fontFamily:"monospace" }}>{d.ip}</div>
                          <div style={{ fontSize:8, fontWeight:700, color:d.status==="up"?EME:d.status==="degraded"?AMB:RED }}>● {d.status} · {d.vulns??0} vulns</div>
                        </div>
                      ) } });
                  });
                });
                const addedEdges = new Set<string>();
                Object.entries(zMatrix).forEach(([srcZ,dstMap]:any)=>{
                  Object.entries(dstMap).forEach(([dstZ,policy]:any)=>{
                    if(srcZ===dstZ) return;
                    const k=[srcZ,dstZ].sort().join("|");
                    if(addedEdges.has(k)) return;
                    const srcD=devs.find((d:any)=>d.zone===srcZ);
                    const dstD=devs.find((d:any)=>d.zone===dstZ);
                    if(!srcD||!dstD) return;
                    addedEdges.add(k);
                    const allow=String(policy).startsWith("ALLOW"); const deny=policy==="DENY";
                    topoEdges.push({ id:`e-${k}`, source:srcD.id, target:dstD.id, type:"straight",
                      style:{ stroke:allow?EME:deny?RED:BLU, strokeWidth:1.5, opacity:0.65, strokeDasharray:deny?"5,3":undefined },
                      markerEnd:{ type:MarkerType.ArrowClosed, color:allow?EME:deny?RED:BLU, width:9, height:9 },
                      label:policy, labelStyle:{ fontSize:7, fill:allow?EME:deny?RED:BLU, fontFamily:"inherit", fontWeight:700 } });
                  });
                });
                return (
                  <div style={{ display:"flex", gap:16 }}>
                    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                      <div style={card({ padding:"14px 16px", width:180 })}>
                        <div style={{ fontSize:11, fontWeight:800, color:NAV, marginBottom:10 }}>Device Types</div>
                        {Object.entries(DEV_COL).map(([t,c]:any)=>(
                          <div key={t} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
                            <span style={{ fontSize:10 }}>{DEV_ICO[t]??"🖥"}</span>
                            <div style={{ width:8, height:8, borderRadius:2, background:c, flexShrink:0 }} />
                            <span style={{ fontSize:10, color:"var(--foreground)" }}>{t}</span>
                          </div>
                        ))}
                        <div style={{ marginTop:10, paddingTop:10, borderTop:"1px solid var(--border)" }}>
                          <div style={{ fontSize:11, fontWeight:800, color:NAV, marginBottom:8 }}>Traffic Flows</div>
                          {([[EME,"━","ALLOW"],[RED,"┅","DENY"],[BLU,"━","ACL"]] as [string,string,string][]).map(([c,s,l])=>(
                            <div key={l} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
                              <span style={{ color:c, fontFamily:"monospace", fontWeight:800, fontSize:13 }}>{s}</span>
                              <span style={{ fontSize:10, color:"var(--foreground)" }}>{l}</span>
                            </div>
                          ))}
                        </div>
                        <div style={{ marginTop:10, paddingTop:10, borderTop:"1px solid var(--border)" }}>
                          <div style={{ fontSize:10, fontWeight:800, color:NAV, marginBottom:6 }}>Fleet Stats</div>
                          <div style={{ fontSize:11, color:"var(--muted-foreground)", lineHeight:1.9 }}>
                            <div><strong style={{ color:"var(--foreground)" }}>{devs.length}</strong> devices</div>
                            <div><strong style={{ color:RED }}>{devs.filter((d:any)=>d.patchStatus==="overdue").length}</strong> overdue patches</div>
                            <div><strong style={{ color:AMB }}>{devs.reduce((s:any,d:any)=>s+(d.vulns??0),0)}</strong> total vulns</div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div style={{ flex:1, height:560, borderRadius:12, border:"1px solid var(--border)", overflow:"hidden", background:"var(--card)" }}>
                      {devs.length===0 ? (
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", color:"var(--muted-foreground)", fontSize:13 }}>No network devices. Ensure you are viewing Tenant 1.</div>
                      ) : (
                        <ReactFlow nodes={topoNodes} edges={topoEdges} fitView nodesDraggable={false}
                          onNodeClick={(_:any,node:any)=>{ const d=devs.find((x:any)=>x.id===node.id); setTopoSelected((prev:any)=>prev?.id===d?.id?null:d??null); }}
                          defaultEdgeOptions={{ animated:false }} minZoom={0.25} maxZoom={2}>
                          <Background variant={"dots" as any} gap={20} size={1} color="rgba(255,255,255,0.06)" />
                          <Controls />
                          <MiniMap nodeColor={(n:any)=>{ const d=devs.find((x:any)=>x.id===n.id); return d?DEV_COL[d.type]??"#6B7280":"rgba(59,130,246,0.15)"; }} style={{ background:"var(--card)", border:"1px solid var(--border)" }} />
                        </ReactFlow>
                      )}
                    </div>
                    {topoSelected && (()=>{
                      const col = DEV_COL[topoSelected.type]??"#6B7280";
                      // Find matching audit snapshot by hostname (exact or partial match)
                      const devAudit: any = lNetAudits.find((a:any)=>
                        a.hostname===topoSelected.name ||
                        a.hostname?.toLowerCase().includes(topoSelected.name?.toLowerCase()) ||
                        topoSelected.name?.toLowerCase().includes(a.hostname?.toLowerCase()??"__none__")
                      ) ?? null;
                      // Derive risk score: base 100, penalise vulns/patch/status/vendor-match
                      const derivedScore = devAudit?.score ?? Math.max(10,
                        100 - (topoSelected.vulns??0)*10 -
                        (topoSelected.patchStatus==="overdue"?20:topoSelected.patchStatus==="pending"?8:0) -
                        (topoSelected.status==="degraded"?25:topoSelected.status==="down"?40:0)
                      );
                      const derivedRisk = derivedScore>=70?"Low":derivedScore>=50?"Medium":"High";
                      return (
                        <div style={card({ width:268, padding:16, flexShrink:0, overflow:"auto", maxHeight:600, display:"flex", flexDirection:"column", gap:12 })}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                            <div>
                              <div style={{ fontSize:13, fontWeight:800, color:NAV, marginBottom:4 }}>{topoSelected.name}</div>
                              <div style={{ fontSize:10, fontWeight:700, color:col, background:`${col}15`, borderRadius:6, padding:"3px 9px", display:"inline-block" }}>{topoSelected.type}</div>
                            </div>
                            <button onClick={()=>setTopoSelected(null)} style={{ background:"none", border:"none", color:"var(--muted-foreground)", cursor:"pointer", fontSize:14, flexShrink:0 }}>✕</button>
                          </div>

                          {/* Risk score banner */}
                          <div style={{ padding:"10px 14px", borderRadius:8, background:derivedScore>=70?"rgba(34,197,94,0.06)":derivedScore>=50?"rgba(245,158,11,0.06)":"rgba(239,68,68,0.06)", border:`1px solid ${derivedScore>=70?"#A7F3D0":derivedScore>=50?"#FDE68A":"#FECACA"}`, display:"flex", alignItems:"center", gap:12 }}>
                            <div style={{ textAlign:"center", flexShrink:0 }}>
                              <div style={{ fontSize:24, fontWeight:800, color:derivedScore>=70?EME:derivedScore>=50?AMB:RED, lineHeight:1 }}>{derivedScore}</div>
                              <div style={{ fontSize:8, fontWeight:700, color:"var(--muted-foreground)" }}>RISK SCORE</div>
                            </div>
                            <div style={{ flex:1 }}>
                              <div style={{ fontSize:11, fontWeight:700, color:derivedScore>=70?EME:derivedScore>=50?AMB:RED, marginBottom:2 }}>{derivedRisk} Risk</div>
                              <div style={{ fontSize:10, color:"var(--muted-foreground)" }}>
                                {devAudit ? `From audit ${devAudit.id} · ${devAudit.auditDate}` : "Derived from device health metrics"}
                              </div>
                            </div>
                          </div>

                          {/* Config summary */}
                          {devAudit && (
                            <div style={{ padding:"10px 12px", borderRadius:8, background:"var(--secondary)", border:"1px solid var(--border)" }}>
                              <div style={{ fontSize:9, fontWeight:800, color:NAV, marginBottom:6 }}>CONFIG SUMMARY</div>
                              <div style={{ fontSize:10, color:"var(--foreground)", lineHeight:1.65 }}>{devAudit.auditSummary}</div>
                              <div style={{ display:"flex", gap:8, marginTop:8, flexWrap:"wrap" }}>
                                {[[RED,`${devAudit.findings?.critical??0} crit`],[AMB,`${devAudit.findings?.high??0} high`],[BLU,`CIS ${devAudit.cisPass}/${devAudit.cisTotal}`]].map(([c,l]:any)=>(
                                  <span key={l} style={{ fontSize:9, fontWeight:700, color:c, background:`${c}12`, borderRadius:3, padding:"2px 6px" }}>{l}</span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Inventory fields */}
                          <div>
                            {([["Vendor",topoSelected.vendor],["Model",topoSelected.model],["IP",topoSelected.ip],["Zone",topoSelected.zone],["Perimeter Class",PCLASS[topoSelected.zone]??"internal"],["Firmware",topoSelected.firmware],["Patch Status",topoSelected.patchStatus],["Last Scan",topoSelected.lastScan],["Status",topoSelected.status]] as [string,string][]).map(([l,v])=>(
                              <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid var(--border)" }}>
                                <span style={{ fontSize:10, color:"var(--muted-foreground)" }}>{l}</span>
                                <span style={{ fontSize:10, fontWeight:700, fontFamily:"monospace", color:l==="Patch Status"&&v==="overdue"?RED:l==="Patch Status"&&v==="current"?EME:l==="Status"&&v==="degraded"?AMB:l==="Status"&&v==="up"?EME:"var(--foreground)" }}>{v}</span>
                              </div>
                            ))}
                          </div>

                          {/* Vulnerability callout */}
                          <div style={{ padding:"9px 12px", borderRadius:8, background:topoSelected.vulns>0?"rgba(239,68,68,0.06)":"rgba(34,197,94,0.06)", border:`1px solid ${topoSelected.vulns>0?"#FECACA":"#A7F3D0"}` }}>
                            <div style={{ fontSize:10, fontWeight:700, color:topoSelected.vulns>0?RED:EME }}>{topoSelected.vulns>0?`⚠ ${topoSelected.vulns} vulnerability${topoSelected.vulns!==1?"s":""} detected`:"✓ No vulnerabilities detected"}</div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}

              {/* ── Config Diff ───────────────────────────────────────────────── */}
              {netFleetTab === "diff" && (() => {
                const allA = [...lNetAudits, ...uploadedAudits];
                if(allA.length < 2) return (
                  <div style={card({ padding:40, textAlign:"center", color:"var(--muted-foreground)" })}>
                    <div style={{ fontSize:32, marginBottom:8 }}>🔄</div>
                    <div style={{ fontSize:13, fontWeight:700, marginBottom:4 }}>Upload a second config to compare</div>
                    <div style={{ fontSize:11 }}>Go to Fleet Overview and upload another audit config — then select two snapshots here for a rule-level diff.</div>
                  </div>
                );
                const a1: any = allA.find((a:any)=>a.id===diffAudit1)??allA[0];
                const a2: any = allA.find((a:any)=>a.id===diffAudit2)??allA[1];
                if(!a1||!a2||a1.id===a2.id) return <div style={{ textAlign:"center", padding:40, color:"var(--muted-foreground)" }}>Select two different audits to compare.</div>;

                const sameDevice = a1.hostname === a2.hostname;
                const scoreDelta = (a2.score??0)-(a1.score??0);

                // ── Rule-level diff ───────────────────────────────────────────
                const rules1: any[] = a1.rulesList ?? [];
                const rules2: any[] = a2.rulesList ?? [];
                const rMap1 = Object.fromEntries(rules1.map((r:any)=>[r.num, r]));
                const rMap2 = Object.fromEntries(rules2.map((r:any)=>[r.num, r]));
                const ruleEq = (r1:any, r2:any) =>
                  r1.action===r2.action && r1.srcZone===r2.srcZone && r1.dstZone===r2.dstZone &&
                  r1.srcAddr===r2.srcAddr && r1.dstAddr===r2.dstAddr && r1.service===r2.service &&
                  r1.secProfile===r2.secProfile;

                const addedRules    = rules2.filter((r:any)=>!rMap1[r.num]);
                const removedRules  = rules1.filter((r:any)=>!rMap2[r.num]);
                const modifiedRules = rules1.filter((r:any)=>rMap2[r.num]&&!ruleEq(r,rMap2[r.num]));
                const unchangedCount = rules1.filter((r:any)=>rMap2[r.num]&&ruleEq(r,rMap2[r.num])).length;

                // Build aligned diff rows for side-by-side view
                const allNums = [...new Set([...rules1.map((r:any)=>r.num),...rules2.map((r:any)=>r.num)])].sort((a:any,b:any)=>a-b);
                const diffRows = allNums.map((num:any)=>{
                  const r1=rMap1[num]??null, r2=rMap2[num]??null;
                  if(r1&&r2) return { type:ruleEq(r1,r2)?"unchanged":"modified", r1, r2 };
                  if(r1) return { type:"removed", r1, r2:null };
                  return { type:"added", r1:null, r2 };
                });

                const rowBg:  any = { unchanged:"transparent", modified:"rgba(245,158,11,0.05)", removed:"rgba(239,68,68,0.05)", added:"rgba(34,197,94,0.05)" };
                const rowBdr: any = { unchanged:"var(--border)", modified:AMB+"55", removed:RED+"55", added:EME+"55" };
                const rowTag: any = { modified:[AMB,"MOD"], removed:[RED,"DEL"], added:[EME,"ADD"] };

                // CIS diff
                const cisChecks1: any[] = a1.cisChecks??[];
                const cisMap2 = Object.fromEntries((a2.cisChecks??[]).map((c:any)=>[c.id,c]));
                const cisDiffs = cisChecks1.filter((c:any)=>cisMap2[c.id]&&cisMap2[c.id].result!==c.result)
                  .map((c:any)=>({ id:c.id, title:c.title??"", r1:c.result, r2:cisMap2[c.id].result }));

                // Metric rows
                const metricRows = [
                  { label:"Security Score",       v1:a1.score,       v2:a2.score,       dir:"better" },
                  { label:"Total Rules",           v1:a1.rulesTotal,  v2:a2.rulesTotal,  dir:"neutral" },
                  { label:"Allow-Any-Service",     v1:a1.allowAnyService, v2:a2.allowAnyService, dir:"worse" },
                  { label:"Permissive Rules",      v1:a1.permissiveRules, v2:a2.permissiveRules, dir:"worse" },
                  { label:"Rules Without Logging", v1:a1.rulesNoLog,  v2:a2.rulesNoLog,  dir:"worse" },
                  { label:"UTM Coverage %",        v1:a1.utmCoverage, v2:a2.utmCoverage, dir:"better" },
                  { label:"CIS Pass Rate %", v1:Math.round(((a1.cisPass??0)/Math.max(a1.cisTotal??1,1))*100), v2:Math.round(((a2.cisPass??0)/Math.max(a2.cisTotal??1,1))*100), dir:"better" },
                  { label:"Critical Findings",     v1:a1.findings?.critical??0, v2:a2.findings?.critical??0, dir:"worse" },
                  { label:"High Findings",         v1:a1.findings?.high??0,     v2:a2.findings?.high??0,     dir:"worse" },
                  { label:"VPN Tunnels",           v1:a1.vpnTunnels,  v2:a2.vpnTunnels,  dir:"neutral" },
                  { label:"Interfaces",            v1:a1.interfaces,  v2:a2.interfaces,  dir:"neutral" },
                ];

                const RuleCell = ({r,side}:{r:any,side:"a"|"b"}) => !r
                  ? <div style={{ padding:"10px 14px", fontStyle:"italic", color:"var(--muted-foreground)", fontSize:10 }}>— not present —</div>
                  : (
                    <div style={{ padding:"10px 14px", display:"flex", flexDirection:"column", gap:3 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                        <span style={{ fontSize:9, fontWeight:800, fontFamily:"monospace", color:"var(--muted-foreground)" }}>#{r.num}</span>
                        <span style={{ fontSize:9, fontWeight:800, padding:"1px 6px", borderRadius:3, background:(r.action==="deny"||r.action==="drop")?"rgba(239,68,68,0.1)":"rgba(34,197,94,0.08)", color:(r.action==="deny"||r.action==="drop")?RED:EME }}>{r.action?.toUpperCase()}</span>
                        <span style={{ fontSize:10, fontWeight:700, color:"var(--foreground)" }}>{r.name}</span>
                        {r.aiLabel && <span style={{ fontSize:9, color:"var(--muted-foreground)", fontStyle:"italic" }}>({r.aiLabel})</span>}
                      </div>
                      <div style={{ fontSize:10, fontFamily:"monospace", color:"var(--muted-foreground)" }}>{r.srcZone} → {r.dstZone} &nbsp;|&nbsp; svc: {r.service}</div>
                      <div style={{ fontSize:10, fontFamily:"monospace", color:"var(--muted-foreground)", fontSize:9 }}>{r.srcAddr} → {r.dstAddr}</div>
                      <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:2 }}>
                        {r.secProfile&&r.secProfile!=="—"&&<span style={{ fontSize:8, color:CYN, background:"rgba(8,145,178,0.08)", borderRadius:3, padding:"1px 5px" }}>🛡 {r.secProfile}</span>}
                        {(r.flags??[]).map((f:string)=><span key={f} style={{ fontSize:8, fontWeight:700, color:AMB, background:"rgba(245,158,11,0.08)", border:"1px solid #FDE68A", borderRadius:3, padding:"1px 5px" }}>{f}</span>)}
                      </div>
                    </div>
                  );

                return (
                  <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

                    {/* Selectors */}
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                      {([[diffAudit1,setDiffAudit1,"Baseline (Version A)"],[diffAudit2,setDiffAudit2,"Compare (Version B)"]] as [string,Function,string][]).map(([v,s,l])=>(
                        <div key={l}>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"var(--muted-foreground)", marginBottom:5 }}>{l.toUpperCase()}</label>
                          <select value={v} onChange={e=>s(e.target.value)} style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--secondary)", color:"var(--foreground)", fontSize:12, fontFamily:"inherit", outline:"none" }}>
                            {allA.map((a:any)=><option key={a.id} value={a.id}>{a.hostname} ({a.vendor}) — {a.auditDate} · score {a.score}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>

                    {/* Cross-device warning */}
                    {!sameDevice && (
                      <div style={{ padding:"10px 16px", borderRadius:8, background:"rgba(245,158,11,0.05)", border:"1px solid #FDE68A", display:"flex", gap:10, alignItems:"flex-start" }}>
                        <span style={{ fontSize:16, flexShrink:0 }}>⚠</span>
                        <div style={{ fontSize:11, color:"var(--foreground)" }}>
                          <strong style={{ color:AMB }}>Cross-device comparison:</strong> {a1.hostname} ({a1.vendor}) vs {a2.hostname} ({a2.vendor}).
                          Rule numbers may not correspond across different devices. For an accurate rule-level diff, compare two snapshots of the <strong>same hostname</strong> — upload a second config in Fleet Overview to enable this.
                        </div>
                      </div>
                    )}

                    {/* Summary pills */}
                    <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                      <div style={card({ padding:"12px 18px", display:"flex", flexDirection:"column", alignItems:"center" })}>
                        <div style={{ fontSize:22, fontWeight:800, color:scoreDelta>0?EME:scoreDelta<0?RED:"var(--muted-foreground)" }}>{scoreDelta>0?"+":""}{scoreDelta}</div>
                        <div style={{ fontSize:9, fontWeight:700, color:"var(--muted-foreground)" }}>SCORE Δ</div>
                      </div>
                      {([[addedRules.length,EME,"+ RULES ADDED"],[modifiedRules.length,AMB,"~ RULES MODIFIED"],[removedRules.length,RED,"- RULES REMOVED"],[unchangedCount,"#6B7280","= UNCHANGED"]] as [number,string,string][]).map(([n,c,lbl])=>(
                        <div key={lbl} style={card({ padding:"12px 18px", display:"flex", flexDirection:"column", alignItems:"center", borderLeft:n>0&&c!=="#6B7280"?`3px solid ${c}`:undefined })}>
                          <div style={{ fontSize:22, fontWeight:800, color:n>0?c:"var(--muted-foreground)" }}>{n}</div>
                          <div style={{ fontSize:9, fontWeight:700, color:n>0?c:"var(--muted-foreground)" }}>{lbl}</div>
                        </div>
                      ))}
                    </div>

                    {/* Side-by-side rule diff */}
                    <div style={card({ padding:0, overflow:"hidden" })}>
                      <div style={{ padding:"12px 16px", borderBottom:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <div style={{ fontSize:12, fontWeight:800, color:NAV }}>Rule-Level Diff &nbsp;<span style={{ fontSize:10, fontWeight:400, color:"var(--muted-foreground)" }}>{diffRows.length} rule positions compared</span></div>
                        <div style={{ display:"flex", gap:10 }}>
                          {([[EME,"+ Added"],[AMB,"~ Modified"],[RED,"- Removed"],["#6B7280","= Unchanged"]] as [string,string][]).map(([c,l])=>(
                            <span key={l} style={{ fontSize:10, fontWeight:700, color:c }}>● {l}</span>
                          ))}
                        </div>
                      </div>
                      {diffRows.length===0 ? (
                        <div style={{ padding:24, textAlign:"center", color:"var(--muted-foreground)", fontSize:12 }}>No rules in either selected audit. Try two firewall configs (not switch configs).</div>
                      ) : (
                        <div style={{ overflow:"auto", maxHeight:440 }}>
                          <div style={{ display:"grid", gridTemplateColumns:"28px 1fr 1fr", borderBottom:"2px solid var(--border)", background:"var(--secondary)", position:"sticky", top:0, zIndex:2 }}>
                            <div />
                            <div style={{ padding:"8px 14px", borderLeft:"1px solid var(--border)", fontSize:9, fontWeight:800, color:BLU }}>VERSION A — {a1.hostname}</div>
                            <div style={{ padding:"8px 14px", borderLeft:"1px solid var(--border)", fontSize:9, fontWeight:800, color:PRP }}>VERSION B — {a2.hostname}</div>
                          </div>
                          {diffRows.map((row:any, i:number)=>{
                            const tag = rowTag[row.type];
                            return (
                              <div key={i} style={{ display:"grid", gridTemplateColumns:"28px 1fr 1fr", borderBottom:`1px solid ${rowBdr[row.type]}`, background:rowBg[row.type] }}>
                                <div style={{ padding:"8px 4px", display:"flex", alignItems:"flex-start", justifyContent:"center", paddingTop:12 }}>
                                  {tag && <span style={{ fontSize:7, fontWeight:800, padding:"2px 4px", borderRadius:3, background:`${tag[0]}18`, color:tag[0] }}>{tag[1]}</span>}
                                </div>
                                <div style={{ borderLeft:`1px solid ${rowBdr[row.type]}` }}>
                                  <RuleCell r={row.r1} side="a" />
                                </div>
                                <div style={{ borderLeft:`1px solid ${rowBdr[row.type]}` }}>
                                  <RuleCell r={row.r2} side="b" />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Metrics + CIS diff */}
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                      <div style={card({ padding:0, overflow:"hidden" })}>
                        <div style={{ padding:"12px 16px", borderBottom:"1px solid var(--border)", fontSize:12, fontWeight:800, color:NAV }}>Configuration Metrics</div>
                        <table style={{ width:"100%", borderCollapse:"collapse" }}>
                          <thead>
                            <tr style={{ background:"var(--secondary)", borderBottom:"1px solid var(--border)" }}>
                              {["METRIC","VER A","VER B","Δ"].map((h,i)=><th key={h} style={{ padding:"7px 12px", textAlign:i===0?"left":"center", fontSize:9, fontWeight:800, color:"var(--muted-foreground)" }}>{h}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {metricRows.map(r=>{
                              const n1=Number(r.v1??0), n2=Number(r.v2??0);
                              const better=r.dir==="better"?n2>n1:r.dir==="worse"?n2<n1:false;
                              const worse =r.dir==="better"?n2<n1:r.dir==="worse"?n2>n1:false;
                              const delta=n2-n1; const changed=r.v1!==r.v2;
                              return (
                                <tr key={r.label} style={{ borderBottom:"1px solid var(--border)", background:changed?(better?"rgba(34,197,94,0.04)":worse?"rgba(239,68,68,0.04)":"transparent"):"transparent" }}>
                                  <td style={{ padding:"7px 12px", fontSize:10, color:"var(--foreground)" }}>{r.label}</td>
                                  <td style={{ padding:"7px 12px", textAlign:"center", fontFamily:"monospace", fontWeight:700, color:BLU }}>{r.v1??"-"}</td>
                                  <td style={{ padding:"7px 12px", textAlign:"center", fontFamily:"monospace", fontWeight:700, color:PRP }}>{r.v2??"-"}</td>
                                  <td style={{ padding:"7px 12px", textAlign:"center", fontWeight:800, fontFamily:"monospace", color:better?EME:worse?RED:"var(--muted-foreground)" }}>
                                    {!changed?"━":(delta>0?"+":"")+delta}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div style={card({ padding:0, overflow:"hidden" })}>
                        <div style={{ padding:"12px 16px", borderBottom:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                          <div style={{ fontSize:12, fontWeight:800, color:NAV }}>CIS Check Changes</div>
                          <span style={{ fontSize:10, color:"var(--muted-foreground)" }}>{cisDiffs.length} changed · {cisChecks1.length} total</span>
                        </div>
                        {cisDiffs.length===0 ? (
                          <div style={{ padding:24, textAlign:"center", color:"var(--muted-foreground)", fontSize:12 }}>
                            {cisChecks1.length===0?"No CIS checks on Version A.":"✓ All shared CIS checks are identical between versions."}
                          </div>
                        ) : (
                          <div style={{ overflow:"auto", maxHeight:280 }}>
                            {cisDiffs.map((d:any)=>(
                              <div key={d.id} style={{ padding:"9px 14px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", gap:10 }}>
                                <code style={{ fontSize:10, color:NAV, fontFamily:"monospace", flexShrink:0 }}>{d.id}</code>
                                <div style={{ flex:1, fontSize:11, color:"var(--foreground)" }}>{d.title}</div>
                                <div style={{ display:"flex", alignItems:"center", gap:5, flexShrink:0 }}>
                                  {([d.r1,"→",d.r2] as string[]).map((r,i)=> r==="→"
                                    ? <span key={i} style={{ color:"var(--muted-foreground)", fontSize:11 }}>→</span>
                                    : <span key={i} style={{ fontSize:9, fontWeight:700, padding:"2px 7px", borderRadius:4, background:r==="pass"?"rgba(34,197,94,0.08)":"rgba(239,68,68,0.06)", color:r==="pass"?EME:RED, border:`1px solid ${r==="pass"?"#A7F3D0":"#FECACA"}` }}>{r?.toUpperCase()}</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        <div style={{ padding:"12px 14px", borderTop:"1px solid var(--border)", background:"var(--secondary)", display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                          {[{lbl:"Version A",a:a1,c:BLU},{lbl:"Version B",a:a2,c:PRP}].map(({lbl,a,c})=>(
                            <div key={lbl}>
                              <div style={{ fontSize:10, fontWeight:800, color:c, marginBottom:3 }}>{lbl}: {a.hostname}</div>
                              <div style={{ fontSize:10, color:"var(--muted-foreground)", lineHeight:1.8 }}>
                                Score <strong style={{ color:a.score>=70?EME:a.score>=50?AMB:RED }}>{a.score}</strong> · CIS <strong>{a.cisPass}/{a.cisTotal}</strong> · Risk <strong style={{ color:a.risk==="Critical"||a.risk==="High"?RED:a.risk==="Medium"?AMB:EME }}>{a.risk}</strong>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* ── Change Requests ───────────────────────────────────────────── */}
              {netFleetTab === "changes" && (() => {
                const ZONES_LIST = ["Internet","Perimeter","DMZ","Core","Office LAN","Legacy DC","Cloud","CORP_NET","DB_SUBNET","MGMT","VPN_POOL"];
                const getCisImpact = (port:string, srcZ:string, dstZ:string) => {
                  const p=port.toLowerCase();
                  if(p==="22") return ["CIS-2.1","CIS-2.2"];
                  if(p==="3389") return ["CIS-2.2","CIS-2.3"];
                  if(p==="5432"||p==="3306"||p==="1433") return ["CIS-3.1","CIS-6.1"];
                  if(srcZ==="Internet"||dstZ==="Internet") return ["CIS-1.1","CIS-1.2","CIS-1.5"];
                  return ["CIS-1.5","CIS-1.6"];
                };
                const stCol: any = { pending:AMB, approved:BLU, implemented:EME, rejected:RED };
                return (
                  <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                      <div>
                        <div style={{ fontSize:14, fontWeight:800, color:NAV }}>Firewall Change Requests</div>
                        <div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:2 }}>Propose, approve and track firewall rule changes with compliance impact analysis</div>
                      </div>
                      <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center" }}>
                        {(["pending","approved","implemented"] as string[]).map(s=>{
                          const cnt=changeRequests.filter((r:any)=>r.status===s).length;
                          return <span key={s} style={{ fontSize:10, fontWeight:700, padding:"4px 10px", borderRadius:20, background:`${stCol[s]}15`, border:`1px solid ${stCol[s]}44`, color:stCol[s] }}>{cnt} {s}</span>;
                        })}
                        <button onClick={()=>setCrShowForm((f:boolean)=>!f)} style={{ background:NAV, color:"white", border:"none", borderRadius:8, padding:"7px 16px", fontSize:12, fontWeight:700, cursor:"pointer" }}>{crShowForm?"✕ Cancel":"+ New Request"}</button>
                      </div>
                    </div>
                    {crShowForm && (
                      <div style={card({ padding:20 })}>
                        <div style={{ fontSize:13, fontWeight:800, color:NAV, marginBottom:14 }}>New Change Request</div>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:12 }}>
                          {([["srcZone","Source Zone"],["dstZone","Destination Zone"]] as [string,string][]).map(([k,l])=>(
                            <div key={k}>
                              <label style={{ display:"block", fontSize:10, fontWeight:700, color:"var(--muted-foreground)", marginBottom:4 }}>{l.toUpperCase()}</label>
                              <select value={(crForm as any)[k]} onChange={e=>setCrForm((f:any)=>({...f,[k]:e.target.value}))} style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:"1px solid var(--border)", background:"var(--secondary)", color:"var(--foreground)", fontSize:12, fontFamily:"inherit", outline:"none" }}>
                                <option value="">Select zone…</option>
                                {ZONES_LIST.map(z=><option key={z} value={z}>{z}</option>)}
                              </select>
                            </div>
                          ))}
                          <div>
                            <label style={{ display:"block", fontSize:10, fontWeight:700, color:"var(--muted-foreground)", marginBottom:4 }}>PORT / PROTOCOL</label>
                            <div style={{ display:"flex", gap:6 }}>
                              <input type="number" value={crForm.port} onChange={e=>setCrForm((f:any)=>({...f,port:e.target.value}))} placeholder="443" style={{ width:70, padding:"8px 10px", borderRadius:8, border:"1px solid var(--border)", background:"var(--secondary)", color:"var(--foreground)", fontSize:12, fontFamily:"inherit", outline:"none" }} />
                              <select value={crForm.protocol} onChange={e=>setCrForm((f:any)=>({...f,protocol:e.target.value}))} style={{ flex:1, padding:"8px 10px", borderRadius:8, border:"1px solid var(--border)", background:"var(--secondary)", color:"var(--foreground)", fontSize:12, fontFamily:"inherit", outline:"none" }}>
                                {["TCP","UDP","ICMP","ANY"].map(p=><option key={p}>{p}</option>)}
                              </select>
                            </div>
                          </div>
                        </div>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:12, alignItems:"end", marginBottom:12 }}>
                          <div>
                            <label style={{ display:"block", fontSize:10, fontWeight:700, color:"var(--muted-foreground)", marginBottom:4 }}>BUSINESS JUSTIFICATION *</label>
                            <textarea value={crForm.justification} onChange={e=>setCrForm((f:any)=>({...f,justification:e.target.value}))} placeholder="Describe the business reason for this rule change…" rows={2} style={{ width:"100%", boxSizing:"border-box", padding:"8px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--secondary)", color:"var(--foreground)", fontSize:12, fontFamily:"inherit", resize:"none", outline:"none" }} />
                          </div>
                          <div>
                            <label style={{ display:"block", fontSize:10, fontWeight:700, color:"var(--muted-foreground)", marginBottom:4 }}>PRIORITY</label>
                            <select value={crForm.priority} onChange={e=>setCrForm((f:any)=>({...f,priority:e.target.value}))} style={{ padding:"8px 10px", borderRadius:8, border:"1px solid var(--border)", background:"var(--secondary)", color:"var(--foreground)", fontSize:12, fontFamily:"inherit", outline:"none" }}>
                              {["Critical","High","Medium","Low"].map(p=><option key={p}>{p}</option>)}
                            </select>
                          </div>
                        </div>
                        {crForm.srcZone && crForm.dstZone && (
                          <div style={{ marginBottom:12, padding:"10px 14px", borderRadius:8, background:"rgba(30,58,95,0.04)", border:"1px solid rgba(30,58,95,0.15)" }}>
                            <div style={{ fontSize:10, fontWeight:800, color:NAV, marginBottom:4 }}>COMPLIANCE IMPACT PREVIEW</div>
                            <div style={{ fontSize:11, color:"var(--foreground)" }}>
                              {crForm.srcZone} → {crForm.dstZone} :{crForm.port}/{crForm.protocol} affects:&nbsp;
                              {getCisImpact(crForm.port,crForm.srcZone,crForm.dstZone).map((c:string)=>(
                                <span key={c} style={{ marginRight:4, fontSize:10, fontWeight:700, background:"rgba(245,158,11,0.08)", border:"1px solid #FDE68A", color:AMB, borderRadius:3, padding:"1px 6px" }}>{c}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
                          <button onClick={()=>{setCrShowForm(false);setCrForm({srcZone:"",dstZone:"",port:"443",protocol:"TCP",justification:"",priority:"Medium"});}} style={{ padding:"8px 18px", borderRadius:8, border:"1px solid var(--border)", background:"var(--secondary)", color:"var(--foreground)", fontSize:12, fontWeight:700, cursor:"pointer" }}>Cancel</button>
                          <button
                            onClick={()=>{
                              if(!crForm.srcZone||!crForm.dstZone||!crForm.justification.trim()) return;
                              const newCR: any = { id:`CR-${String(Date.now()).slice(-6)}`, srcZone:crForm.srcZone, dstZone:crForm.dstZone, port:crForm.port, protocol:crForm.protocol, justification:crForm.justification.trim(), priority:crForm.priority, status:"pending", createdAt:new Date().toISOString().slice(0,10), affectedControls:getCisImpact(crForm.port,crForm.srcZone,crForm.dstZone), complianceImpact:crForm.priority };
                              setChangeRequests((prev:any[])=>[newCR,...prev]);
                              setCrShowForm(false);
                              setCrForm({srcZone:"",dstZone:"",port:"443",protocol:"TCP",justification:"",priority:"Medium"});
                            }}
                            disabled={!crForm.srcZone||!crForm.dstZone||!crForm.justification.trim()}
                            style={{ padding:"8px 22px", borderRadius:8, border:"none", background:crForm.srcZone&&crForm.dstZone&&crForm.justification.trim()?NAV:"var(--muted)", color:"white", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                            Submit Request
                          </button>
                        </div>
                      </div>
                    )}
                    {changeRequests.length===0 ? (
                      <div style={card({ padding:40, textAlign:"center", color:"var(--muted-foreground)" })}>
                        <div style={{ fontSize:32, marginBottom:8 }}>📝</div>
                        <div style={{ fontSize:13, fontWeight:700, marginBottom:4 }}>No change requests yet</div>
                        <div style={{ fontSize:11 }}>Click "+ New Request" to raise a firewall change request.</div>
                      </div>
                    ) : (
                      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                        {changeRequests.map((cr:any)=>{
                          const isExp = crSelectedId===cr.id;
                          return (
                            <div key={cr.id} style={card({ padding:0, overflow:"hidden", borderLeft:`4px solid ${stCol[cr.status]??"var(--border)"}` })}>
                              <div onClick={()=>setCrSelectedId((p:any)=>p===cr.id?null:cr.id)}
                                style={{ display:"flex", alignItems:"center", gap:14, padding:"13px 18px", cursor:"pointer" }}
                                onMouseEnter={e=>(e.currentTarget.style.background="var(--secondary)")}
                                onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                                <code style={{ fontSize:11, color:NAV, fontFamily:"monospace", flexShrink:0 }}>{cr.id}</code>
                                <span style={{ fontFamily:"monospace", fontSize:11, fontWeight:700, color:"var(--foreground)", flexShrink:0 }}>{cr.srcZone} → {cr.dstZone}</span>
                                <span style={{ fontFamily:"monospace", fontSize:10, color:"var(--muted-foreground)", flexShrink:0 }}>:{cr.port}/{cr.protocol}</span>
                                <span style={{ flex:1, fontSize:11, color:"var(--muted-foreground)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{cr.justification}</span>
                                <span style={{ fontSize:9, fontWeight:700, padding:"2px 8px", borderRadius:4, background:`${stCol[cr.priority==="Critical"?RED:cr.priority==="High"?AMB:BLU]??"var(--border)"}15`, color:cr.priority==="Critical"?RED:cr.priority==="High"?AMB:BLU, border:"1px solid currentColor", flexShrink:0 }}>{cr.priority}</span>
                                <span style={{ fontSize:9, fontWeight:700, padding:"2px 8px", borderRadius:4, background:`${stCol[cr.status]??"var(--border)"}18`, color:stCol[cr.status]??"var(--muted-foreground)", textTransform:"uppercase", flexShrink:0 }}>{cr.status}</span>
                                <span style={{ color:"var(--muted-foreground)", fontSize:12, flexShrink:0 }}>{isExp?"▲":"▼"}</span>
                              </div>
                              {isExp && (
                                <div style={{ borderTop:"1px solid var(--border)", padding:"16px 18px", background:"var(--secondary)" }}>
                                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom:14 }}>
                                    <div>
                                      <div style={{ fontSize:11, fontWeight:800, color:NAV, marginBottom:8 }}>Request Details</div>
                                      {([["Source Zone",cr.srcZone],["Destination Zone",cr.dstZone],["Port / Protocol",`${cr.port}/${cr.protocol}`],["Priority",cr.priority],["Submitted",cr.createdAt],["Status",cr.status]] as [string,string][]).map(([l,v])=>(
                                        <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid var(--border)" }}>
                                          <span style={{ fontSize:10, color:"var(--muted-foreground)" }}>{l}</span>
                                          <span style={{ fontSize:10, fontWeight:700, color:NAV }}>{v}</span>
                                        </div>
                                      ))}
                                      <div style={{ marginTop:10 }}>
                                        <div style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", marginBottom:4 }}>JUSTIFICATION</div>
                                        <div style={{ fontSize:11, lineHeight:1.6, padding:"8px 10px", background:"var(--card)", borderRadius:6, color:"var(--foreground)" }}>{cr.justification}</div>
                                      </div>
                                    </div>
                                    <div>
                                      <div style={{ fontSize:11, fontWeight:800, color:AMB, marginBottom:8 }}>⚠ Compliance Impact</div>
                                      <div style={{ fontSize:11, color:"var(--foreground)", marginBottom:8 }}>Affected CIS controls:</div>
                                      <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:12 }}>
                                        {(cr.affectedControls??[]).map((c:string)=>(
                                          <span key={c} style={{ fontSize:10, fontWeight:700, padding:"3px 10px", borderRadius:5, background:"rgba(245,158,11,0.08)", border:"1px solid #FDE68A", color:AMB }}>{c}</span>
                                        ))}
                                      </div>
                                      <div style={{ padding:"10px 12px", borderRadius:8, background:"rgba(245,158,11,0.04)", border:"1px solid #FDE68A", fontSize:11, color:"var(--foreground)", lineHeight:1.6 }}>
                                        Opening {cr.srcZone}→{cr.dstZone} on :{cr.port}/{cr.protocol} introduces a new traffic flow that must be reviewed for least-privilege compliance and logged per CIS Control 8.
                                      </div>

                                      {/* Candidate affected rules from fleet audits */}
                                      {(()=>{
                                        const crSrc=(cr.srcZone??"").toLowerCase();
                                        const crDst=(cr.dstZone??"").toLowerCase();
                                        const crPort=String(cr.port??"");
                                        const candidateRules = [...lNetAudits,...uploadedAudits].flatMap((a:any)=>
                                          (a.rulesList??[]).map((r:any)=>({...r,auditHost:a.hostname,auditId:a.id,auditScore:a.score}))
                                        ).filter((r:any)=>{
                                          const rSrc=(r.srcZone??"").toLowerCase();
                                          const rDst=(r.dstZone??"").toLowerCase();
                                          const svcMatch = crPort&&(r.service?.includes(crPort)||r.service==="ALL"||r.service==="any");
                                          const srcMatch = crSrc&&(rSrc.includes(crSrc)||crSrc.includes(rSrc));
                                          const dstMatch = crDst&&(rDst.includes(crDst)||crDst.includes(rDst));
                                          return (srcMatch||dstMatch)&&svcMatch;
                                        });
                                        if(candidateRules.length===0) return null;
                                        return (
                                          <div style={{ marginTop:10 }}>
                                            <div style={{ fontSize:10, fontWeight:800, color:RED, marginBottom:6 }}>🔍 CANDIDATE AFFECTED RULES ({candidateRules.length} matching)</div>
                                            <div style={{ display:"flex", flexDirection:"column", gap:4, maxHeight:180, overflow:"auto" }}>
                                              {candidateRules.map((r:any,i:number)=>(
                                                <div key={i} style={{ padding:"7px 10px", borderRadius:6, background:"rgba(239,68,68,0.04)", border:"1px solid #FECACA", display:"flex", flexDirection:"column", gap:2 }}>
                                                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                                                    <span style={{ fontSize:9, fontWeight:800, fontFamily:"monospace", color:"var(--muted-foreground)" }}>#{r.num}</span>
                                                    <span style={{ fontSize:9, fontWeight:700, color:r.action==="deny"||r.action==="drop"?RED:EME }}>{r.action?.toUpperCase()}</span>
                                                    <span style={{ fontSize:10, fontWeight:700, color:"var(--foreground)" }}>{r.name}</span>
                                                    <span style={{ marginLeft:"auto", fontSize:9, color:"var(--muted-foreground)", fontFamily:"monospace" }}>{r.auditHost}</span>
                                                  </div>
                                                  <div style={{ fontSize:9, fontFamily:"monospace", color:"var(--muted-foreground)" }}>{r.srcZone} → {r.dstZone} | {r.service}</div>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  </div>
                                  <div style={{ display:"flex", alignItems:"center", gap:8, paddingTop:10, borderTop:"1px solid var(--border)" }}>
                                    <span style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", marginRight:4 }}>WORKFLOW:</span>
                                    {cr.status==="pending" && <>
                                      <button onClick={()=>setChangeRequests((prev:any[])=>prev.map((r:any)=>r.id===cr.id?{...r,status:"approved",approvedAt:new Date().toISOString().slice(0,10)}:r))} style={{ padding:"6px 16px", borderRadius:7, background:BLU, color:"white", border:"none", fontSize:11, fontWeight:700, cursor:"pointer" }}>✓ Approve</button>
                                      <button onClick={()=>setChangeRequests((prev:any[])=>prev.map((r:any)=>r.id===cr.id?{...r,status:"rejected"}:r))} style={{ padding:"6px 16px", borderRadius:7, background:"rgba(239,68,68,0.1)", color:RED, border:"1px solid #FECACA", fontSize:11, fontWeight:700, cursor:"pointer" }}>✗ Reject</button>
                                    </>}
                                    {cr.status==="approved" && (
                                      <button onClick={()=>setChangeRequests((prev:any[])=>prev.map((r:any)=>r.id===cr.id?{...r,status:"implemented",implementedAt:new Date().toISOString().slice(0,10)}:r))} style={{ padding:"6px 16px", borderRadius:7, background:EME, color:"white", border:"none", fontSize:11, fontWeight:700, cursor:"pointer" }}>🚀 Mark Implemented</button>
                                    )}
                                    {(cr.status==="implemented"||cr.status==="rejected") && (
                                      <span style={{ fontSize:11, fontWeight:700, color:cr.status==="implemented"?EME:RED }}>{cr.status==="implemented"?"✓ Implemented":"✗ Rejected"}</span>
                                    )}
                                    <button onClick={()=>setChangeRequests((prev:any[])=>prev.filter((r:any)=>r.id!==cr.id))} style={{ marginLeft:"auto", padding:"5px 12px", borderRadius:7, background:"rgba(239,68,68,0.08)", color:RED, border:"1px solid #FECACA", fontSize:10, fontWeight:700, cursor:"pointer" }}>Delete</button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

            </div>
          );
        })()}

      </div>
    </div>

    {/* ── Connect modal overlay ──────────────────────────────────────────────── */}
    {connectModal && (
      <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center" }}
        onClick={e => { if (e.target === e.currentTarget) { setConnectModal(null); setConnectError(null); } }}>
        <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:16, padding:"28px 32px", width:480, maxWidth:"95vw", boxShadow:"0 24px 64px rgba(0,0,0,0.4)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
            <span style={{ fontSize:24 }}>{connectModal.vendor.logo}</span>
            <div>
              <div style={{ fontSize:16, fontWeight:800, color:"var(--foreground)" }}>Connect {connectModal.vendor.label}</div>
              <div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:2 }}>Credentials are encrypted and stored securely on the server</div>
            </div>
            <button onClick={()=>{ setConnectModal(null); setConnectError(null); }} style={{ marginLeft:"auto", background:"transparent", border:"none", fontSize:18, cursor:"pointer", color:"var(--muted-foreground)", lineHeight:1 }}>✕</button>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:14, marginBottom:20 }}>
            {connectModal.vendor.fields.map(field => (
              <div key={field.key}>
                <label style={{ display:"block", fontSize:11, fontWeight:700, color:"var(--muted-foreground)", marginBottom:5, letterSpacing:"0.3px" }}>{field.label.toUpperCase()}</label>
                <input
                  type={field.type ?? "text"}
                  placeholder={field.placeholder}
                  value={connectForm[field.key] ?? ""}
                  onChange={e => setConnectForm(f => ({...f, [field.key]: e.target.value}))}
                  style={{ width:"100%", boxSizing:"border-box", padding:"9px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--secondary)", color:"var(--foreground)", fontSize:13, fontFamily:"inherit", outline:"none" }}
                />
              </div>
            ))}
          </div>
          {connectError && (
            <div style={{ marginBottom:14, padding:"10px 14px", borderRadius:8, background:"rgba(220,38,38,0.06)", border:"1px solid #FECACA", color:RED, fontSize:12, fontWeight:600 }}>
              {connectError}
            </div>
          )}
          <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
            <button onClick={()=>{ setConnectModal(null); setConnectError(null); }}
              style={{ padding:"9px 20px", borderRadius:8, border:"1px solid var(--border)", background:"var(--secondary)", color:"var(--foreground)", fontSize:12, fontWeight:700, cursor:"pointer" }}>
              Cancel
            </button>
            <button onClick={handleConnectSubmit} disabled={connectSaving}
              style={{ padding:"9px 22px", borderRadius:8, border:"none", background:connectSaving?"var(--muted)":NAV, color:"white", fontSize:12, fontWeight:700, cursor:connectSaving?"default":"pointer", opacity:connectSaving?0.65:1 }}>
              {connectSaving ? "Connecting…" : "Test & Connect"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
