import { Router } from "express";
import { requireAuth } from "../lib/auth";
import type { JwtPayload } from "../lib/auth";
import type { Request } from "express";

const router = Router();
type AuthReq = Request & { user: JwtPayload };

const SEED_INCIDENTS = [
  {
    id:"INC-2026-0047", title:"Ransomware infection on Kenya Finance workstations",
    priority:"P1 - Critical", status:"investigating", type:"Malware",
    regionFlag:"🇰🇪", region:"Kenya", tags:["Ransomware","CERT-In","Data Compromised"],
    description:"LockBit 3.0 variant detected on 4 Finance department workstations at Nairobi HQ. Lateral movement attempted towards domain controller. Immediate isolation enacted at 03:47 UTC.",
    impact:"4 workstations encrypted; Finance operations halted. Potential exfiltration of payroll data (est. 2,400 records). DC access attempt blocked by PAM controls.",
    rootCause:"Phishing email with malicious macro-enabled XLSM attachment opened by Finance user. YARA rule coverage gap for LockBit 3.0 GZIP packer variant.",
    affectedSystems:["KE-FIN-WS-014","KE-FIN-WS-015","KE-FIN-WS-016","KE-FIN-WS-017","KE-DC-02 (blocked)"],
    owner:"Alex Kim", reporter:"SOC Analyst Tier 2",
    started:"2026-06-13 03:47 UTC", detected:"2026-06-13 03:47 UTC", contained:"2026-06-13 04:15 UTC", resolved:null,
    mttr:"In progress", mttd:"8 min", usersAffected:4, escalationLevel:3,
    dataBreach:true, notifyPending:true, slaAtRisk:true,
    aiInsights:["LockBit 3.0 variant with modified packer — update YARA rules across all EDR instances immediately.","CERT-In 6-hour notification window at risk — DPO must file initial notification within 2 hours.","Lateral movement towards KE-DC-02 blocked by PAM tier controls — emergency AD password rotation recommended."],
    timeline:[
      { ts:"03:47 UTC", actor:"EDR Agent",    event:"Ransomware execution detected on KE-FIN-WS-014",                type:"detection"   },
      { ts:"03:49 UTC", actor:"SIEM",         event:"Correlated alerts on 3 additional Finance workstations",         type:"detection"   },
      { ts:"03:52 UTC", actor:"Alex Kim",     event:"Incident created; P1 declared; IR team paged",                   type:"action"      },
      { ts:"04:02 UTC", actor:"Network Ops",  event:"All 4 workstations isolated at switch level (VLAN quarantine)",  type:"containment" },
      { ts:"04:15 UTC", actor:"IAM Team",     event:"Compromised user accounts disabled; credentials rotated",        type:"containment" },
      { ts:"04:30 UTC", actor:"CISO",         event:"Executive briefing completed; legal & DPO engaged",              type:"escalation"  },
    ],
  },
  {
    id:"INC-2026-0046", title:"Unauthorized API access — Customer PII exfiltration attempt",
    priority:"P1 - Critical", status:"contained", type:"Data Breach",
    regionFlag:"🇸🇦", region:"KSA", tags:["PII","PDPL","API Abuse"],
    description:"Abnormal API request volume from authenticated service account SA-PORTAL-07 detected — 47,000 requests in 3 minutes against /api/customers endpoint. DLP alert triggered on outbound data pattern consistent with bulk PII export.",
    impact:"Approximately 12,400 customer records potentially accessed. PII fields include name, email, phone, national ID. No evidence of successful exfiltration outside perimeter.",
    rootCause:"Compromised service account credential obtained via supply-chain attack on third-party vendor monitoring tool. Credential was shared across 3 environments.",
    affectedSystems:["api-gateway-prod-01","customers-db-prod","SA-PORTAL-07 (service account)"],
    owner:"Priya Patel", reporter:"DLP System",
    started:"2026-06-10 11:23 UTC", detected:"2026-06-10 11:23 UTC", contained:"2026-06-10 11:41 UTC", resolved:null,
    mttr:"In progress", mttd:"< 1 min", usersAffected:12400, escalationLevel:3,
    dataBreach:true, notifyPending:true, slaAtRisk:false,
    aiInsights:["PDPL Article 19 breach notification required to NDMO within 72 hours — deadline: 2026-06-13 11:23 UTC.","Service account credential shared across environments — enforce dedicated per-environment secrets immediately.","API rate limiting gap identified — recommend 1,000 req/min threshold on /api/customers with automated lockout."],
    timeline:[
      { ts:"11:23 UTC", actor:"DLP System",   event:"Bulk PII export pattern detected on /api/customers",            type:"detection"   },
      { ts:"11:24 UTC", actor:"SIEM",         event:"Correlated with 47k API requests from SA-PORTAL-07",            type:"detection"   },
      { ts:"11:27 UTC", actor:"Priya Patel",  event:"Service account SA-PORTAL-07 disabled immediately",             type:"containment" },
      { ts:"11:41 UTC", actor:"Cloud Sec",    event:"Egress traffic analysis complete — no data left perimeter",     type:"investigation"},
      { ts:"12:00 UTC", actor:"DPO",          event:"PDPL notification assessment started; legal team engaged",       type:"escalation"  },
    ],
  },
  {
    id:"INC-2026-0044", title:"Spear-phishing campaign targeting Finance — BEC attempt",
    priority:"P2 - High", status:"investigating", type:"Phishing",
    regionFlag:"🇲🇾", region:"Malaysia", tags:["BEC","Phishing","Finance"],
    description:"Coordinated spear-phishing campaign targeting Finance team in KL office. 6 employees received tailored emails impersonating CFO requesting urgent wire transfer. 1 employee clicked malicious link.",
    impact:"1 user credential potentially compromised. No wire transfer executed. Finance systems access reviewed — no unauthorized transactions detected.",
    rootCause:"Attacker used OSINT (LinkedIn) to identify Finance team members. Email spoofed CFO display name; SPF/DKIM passed due to lookalike domain (acme-finance.com).",
    affectedSystems:["Exchange Online","MY-FIN-USER-03 (endpoint)","Email Gateway"],
    owner:"Marcus Johnson", reporter:"Finance Manager",
    started:"2026-06-11 09:14 UTC", detected:"2026-06-11 09:47 UTC", contained:"2026-06-11 10:30 UTC", resolved:null,
    mttr:"In progress", mttd:"33 min", usersAffected:6, escalationLevel:2,
    dataBreach:false, notifyPending:false, slaAtRisk:false,
    aiInsights:["Lookalike domain acme-finance.com registered 3 days ago — block and DNS sinkhole immediately.","6 Finance users targeted — mandatory security awareness refresher required before end of week.","SPF/DKIM bypass via lookalike domain — implement DMARC p=reject policy on all domains."],
    timeline:[
      { ts:"09:14 UTC", actor:"Email Gateway",  event:"6 phishing emails delivered — SPF/DKIM passed on lookalike domain", type:"detection"   },
      { ts:"09:47 UTC", actor:"Finance Mgr",    event:"Suspicious email reported to security helpdesk",                    type:"detection"   },
      { ts:"10:05 UTC", actor:"Marcus Johnson", event:"All 6 emails quarantined; IOCs extracted",                         type:"containment" },
      { ts:"10:30 UTC", actor:"IAM Team",       event:"MY-FIN-USER-03 password reset; MFA re-enrolled",                   type:"containment" },
    ],
  },
  {
    id:"INC-2026-0041", title:"Cloud storage misconfiguration — S3 bucket public exposure",
    priority:"P2 - High", status:"resolved", type:"Misconfiguration",
    regionFlag:"🌐", region:"Global", tags:["S3","Cloud","Misconfiguration"],
    description:"AWS S3 bucket prod-reports-archive exposed publicly for estimated 4 hours. Bucket contained 847 PDF compliance reports. Detected via CSPM policy alert.",
    impact:"847 internal compliance reports accessible without authentication. No evidence of external access confirmed via S3 access logs. Remediated within 22 minutes of detection.",
    rootCause:"Terraform misconfiguration — ACL block_public_acls inadvertently removed in PR merged without proper review. Pipeline lacked ACL validation gate.",
    affectedSystems:["prod-reports-archive (S3)","AWS Account: production"],
    owner:"Sarah Chen", reporter:"CSPM Alert",
    started:"2026-06-08 14:00 UTC", detected:"2026-06-08 17:58 UTC", contained:"2026-06-08 18:06 UTC", resolved:"2026-06-08 18:20 UTC",
    mttr:"4h 20min", mttd:"3h 58min", usersAffected:0, escalationLevel:2,
    dataBreach:false, notifyPending:false, slaAtRisk:false,
    aiInsights:["S3 access logs confirm no external access — 0 GetObject requests from outside company IP ranges.","Add ACL validation step to Terraform CI/CD pipeline to prevent recurrence.","4-hour detection gap — consider real-time EventBridge rule for ACL changes instead of hourly CSPM scan."],
    timeline:[
      { ts:"14:00 UTC", actor:"Terraform",    event:"Deployment with misconfigured bucket ACL applied to production",   type:"detection"   },
      { ts:"17:58 UTC", actor:"CSPM (Wiz)",   event:"Public bucket policy violation alert raised",                       type:"detection"   },
      { ts:"18:06 UTC", actor:"Sarah Chen",   event:"Bucket ACL re-applied — public access blocked",                    type:"containment" },
      { ts:"18:20 UTC", actor:"Sarah Chen",   event:"Full remediation confirmed; incident closed",                       type:"resolution"  },
    ],
  },
  {
    id:"INC-2026-0038", title:"Insider threat — bulk data download by departing employee",
    priority:"P2 - High", status:"resolved", type:"Insider Threat",
    regionFlag:"🇮🇳", region:"India", tags:["Insider","DLP","Exfiltration"],
    description:"DLP alert triggered when departing Sales employee downloaded 14,200 customer records to personal USB drive 3 days before termination date. USB usage policy violation detected.",
    impact:"14,200 customer records copied to personal device including name, email, phone, account value. Employee placed on immediate suspension pending investigation.",
    rootCause:"USB port restrictions not applied to Sales department endpoint group. DLP policy covered email but not USB endpoint channel. Offboarding process lacked automated access review trigger.",
    affectedSystems:["IN-SALES-LPT-08 (endpoint)","CRM Database","DLP Agent"],
    owner:"Priya Patel", reporter:"DLP System",
    started:"2026-06-05 16:22 UTC", detected:"2026-06-05 16:22 UTC", contained:"2026-06-05 16:40 UTC", resolved:"2026-06-09 09:00 UTC",
    mttr:"3d 17h", mttd:"< 1 min", usersAffected:14200, escalationLevel:2,
    dataBreach:true, notifyPending:false, slaAtRisk:false,
    aiInsights:["USB write access should be blocked for all non-IT endpoints — apply GPO immediately to Sales and Finance OUs.","GDPR/PDPL personal data involved — legal team should assess notification obligations.","Implement automated access review trigger at point of resignation in HR system."],
    timeline:[
      { ts:"16:22 UTC", actor:"DLP Agent",   event:"USB mass storage write detected — 14,200 records",               type:"detection"   },
      { ts:"16:25 UTC", actor:"SOC Analyst", event:"DLP alert triaged — confirmed deliberate data theft",             type:"investigation"},
      { ts:"16:40 UTC", actor:"IT Ops",      event:"Employee laptop seized; USB drive recovered",                    type:"containment" },
      { ts:"17:00 UTC", actor:"HR & Legal",  event:"Employee suspended; legal investigation initiated",              type:"escalation"  },
      { ts:"Jun 09",    actor:"Priya Patel", event:"Full investigation complete; incident closed",                   type:"resolution"  },
    ],
  },
  {
    id:"INC-2026-0035", title:"DDoS attack on KSA public portal — service degradation",
    priority:"P2 - High", status:"resolved", type:"DDoS",
    regionFlag:"🇸🇦", region:"KSA", tags:["DDoS","Availability","WAF"],
    description:"Volumetric DDoS attack targeting KSA public-facing customer portal. Peak traffic 28 Gbps — 400x normal baseline. WAF rate limiting engaged; Cloudflare Magic Transit activated.",
    impact:"Customer portal degraded for 42 minutes — page load >15s. Internal systems unaffected. Approximately 1,200 customers affected during degradation window.",
    rootCause:"Botnet of approximately 4,200 compromised IoT devices using HTTP flood with randomized User-Agent rotation to evade static WAF rules.",
    affectedSystems:["KSA Customer Portal (portal.acme.sa)","Cloudflare Edge","WAF (Imperva)"],
    owner:"Alex Kim", reporter:"Network Monitoring",
    started:"2026-06-03 02:15 UTC", detected:"2026-06-03 02:15 UTC", contained:"2026-06-03 02:57 UTC", resolved:"2026-06-03 04:00 UTC",
    mttr:"1h 45min", mttd:"< 1 min", usersAffected:1200, escalationLevel:2,
    dataBreach:false, notifyPending:false, slaAtRisk:false,
    aiInsights:["Botnet IOCs shared with Cloudflare — blocking 4,247 source IPs at edge layer.","SAMA CSF Protect domain gap: DDoS runbook not tested in 14 months — schedule tabletop exercise.","Consider upgrading Cloudflare plan to include advanced L7 ML-based DDoS mitigation."],
    timeline:[
      { ts:"02:15 UTC", actor:"Net Monitor",   event:"Traffic spike detected — 28 Gbps inbound to portal",            type:"detection"   },
      { ts:"02:18 UTC", actor:"WAF (Imperva)",  event:"Rate limiting rules activated — partial mitigation",            type:"containment" },
      { ts:"02:31 UTC", actor:"Alex Kim",       event:"Cloudflare Magic Transit activated; traffic re-routed",         type:"containment" },
      { ts:"02:57 UTC", actor:"Cloudflare",     event:"Full DDoS mitigation — portal restored to normal latency",     type:"resolution"  },
      { ts:"04:00 UTC", actor:"Alex Kim",       event:"Post-attack analysis complete; incident closed",               type:"resolution"  },
    ],
  },
  {
    id:"INC-2026-0032", title:"Privilege escalation via vulnerable SUDO configuration",
    priority:"P3 - Medium", status:"resolved", type:"Privilege Escalation",
    regionFlag:"🌐", region:"Global", tags:["Linux","SUDO","CVE-2023-22809"],
    description:"Developer account on build server used CVE-2023-22809 (sudo editfile bypass) to escalate to root. Detected via auditd alert on unexpected sudo activity pattern.",
    impact:"Root access obtained on build-server-03 for approximately 7 minutes. No evidence of persistence or lateral movement. Build artifacts reviewed — no tampering detected.",
    rootCause:"sudo package version 1.9.10 with unpatched CVE-2023-22809 remained on build server due to maintenance freeze exception applied 8 months ago with no expiry tracking.",
    affectedSystems:["build-server-03 (Ubuntu 22.04)","CI/CD Pipeline (Jenkins)"],
    owner:"Marcus Johnson", reporter:"auditd / SIEM",
    started:"2026-05-28 11:44 UTC", detected:"2026-05-28 11:52 UTC", contained:"2026-05-28 12:01 UTC", resolved:"2026-05-28 15:30 UTC",
    mttr:"3h 46min", mttd:"8 min", usersAffected:0, escalationLevel:1,
    dataBreach:false, notifyPending:false, slaAtRisk:false,
    aiInsights:["sudo patched to 1.9.13p3 on all affected servers. Scan confirmed no other instances of CVE-2023-22809.","Maintenance freeze exception process lacks expiry date tracking — remediate in ITSM change process.","Build artifact integrity verified via SHA-256 checksums — no tampering detected in 30-day window."],
    timeline:[
      { ts:"11:44 UTC", actor:"Developer",      event:"CVE-2023-22809 exploited — root shell obtained on build-server-03", type:"detection"    },
      { ts:"11:52 UTC", actor:"auditd/SIEM",    event:"Unexpected sudo pattern alert raised",                               type:"detection"    },
      { ts:"12:01 UTC", actor:"IT Security",    event:"Developer session terminated; account disabled",                     type:"containment"  },
      { ts:"14:00 UTC", actor:"DFIR Team",      event:"Build artifact integrity check completed — no tampering",            type:"investigation" },
      { ts:"15:30 UTC", actor:"Marcus Johnson", event:"sudo patched on all servers; incident closed",                       type:"resolution"   },
    ],
  },
  {
    id:"INC-2026-0029", title:"Third-party vendor breach — shared access credentials exposed",
    priority:"P2 - High", status:"open", type:"Supply Chain",
    regionFlag:"🇬🇧", region:"EU", tags:["Supply Chain","Third Party","Credential Exposure"],
    description:"Tier-1 IT monitoring vendor Orion Tech notified of breach in their SaaS platform. ACME credentials used for monitoring integration were among those exposed in the vendor breach.",
    impact:"Read-only monitoring credentials exposed — access to infrastructure metrics dashboards. No write access provisioned. Investigating if any sensitive metric data was accessed.",
    rootCause:"Vendor-side breach — Orion Tech confirmed attacker accessed their customer credential vault. ACME credentials not rotated for 14 months against annual policy requirement.",
    affectedSystems:["Orion Tech SaaS Platform","Monitoring Integration (read-only)","Infrastructure Metrics API"],
    owner:"Sarah Chen", reporter:"Vendor Notification",
    started:"2026-06-14 08:00 UTC", detected:"2026-06-14 08:00 UTC", contained:null, resolved:null,
    mttr:"In progress", mttd:"0 min (vendor notified)", usersAffected:0, escalationLevel:2,
    dataBreach:false, notifyPending:false, slaAtRisk:true,
    aiInsights:["Orion Tech credentials revoked and rotated — new API key issued with least-privilege scope only.","NIS2 Article 23 supply chain incident — assess notification obligation to competent authority by 14 June.","3 other Tier-1 vendors have not had credential rotation in >12 months — review immediately."],
    timeline:[
      { ts:"08:00 UTC", actor:"Orion Tech",  event:"Vendor breach notification received — customer credentials exposed", type:"detection"    },
      { ts:"08:15 UTC", actor:"Sarah Chen",  event:"Incident created; credential revocation initiated",                  type:"containment"  },
      { ts:"09:00 UTC", actor:"Cloud Sec",   event:"Monitoring integration audit — no unauthorized access confirmed",    type:"investigation" },
    ],
  },
];

router.get("/incidents", requireAuth, async (req, res) => {
  const { tenantId } = (req as AuthReq).user;
  const data = tenantId === 1 ? SEED_INCIDENTS : [];
  res.json(data);
});

router.get("/incidents/:id", requireAuth, async (req, res) => {
  const { tenantId } = (req as AuthReq).user;
  if (tenantId !== 1) { res.status(404).json({ error: "Not found" }); return; }
  const incident = SEED_INCIDENTS.find(i => i.id === req.params["id"]);
  if (!incident) { res.status(404).json({ error: "Not found" }); return; }
  res.json(incident);
});

export default router;
