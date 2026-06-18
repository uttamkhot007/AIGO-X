import { useState, useMemo } from "react";
import { SubNav, ModuleHeader, Badge } from "@/components/SubNav";
import { AICopilotBar } from "@/components/AICopilotBar";
import WorkflowPipeline, { EMPLOYEE_LIFECYCLE_WF } from "@/components/WorkflowPipeline";
import { useAuth } from "@/context/AuthContext";
import { useOrg } from "@/context/OrgContext";
import { allPolicies } from "@/lib/grc-data";

// ── Design tokens ────────────────────────────────────────────────────────────
const NAV = "#93C5FD";
const EME = "#34D399";
const AMB = "#FCD34D";
const RED = "#F87171";
const PRP = "#C4B5FD";
const card = (extra?: object) => ({
  background:"var(--card)", border:"1px solid var(--border)",
  borderRadius:10, ...extra,
});

// ── Types ────────────────────────────────────────────────────────────────────
type UserType    = "Internal" | "External" | "Non-Human";
type UserStatus  = "active" | "inactive" | "suspended" | "pending";
type TrainFmt    = "Video" | "Quiz" | "Interactive" | "Document";
type TrainCat    = "Security Awareness" | "Compliance" | "Privacy" | "HR" | "Technical";
type TrStatus    = "completed" | "in_progress" | "not_started" | "overdue";

interface PeopleUser {
  id: string; name: string; email: string; type: UserType;
  role: string; department: string; status: UserStatus;
  mfaEnabled: boolean; lastLogin: string; policyAck: number; totalPolicies: number;
  rank?: string;
}

const RANK_OPTIONS = ["C-Suite","VP / SVP","Director","Manager","Senior","Mid-Level","Junior","Intern","Contractor"] as const;
type Rank = typeof RANK_OPTIONS[number];
interface Policy {
  id: string; name: string; category: string; dueDate: string;
  ackRate: number; total: number; acked: number;
  owner: string; version: string; policyStatus: string;
  impact: string; frameworks: string[];
}
interface Training {
  id: string; title: string; category: TrainCat; duration: string;
  mandatory: boolean; dueDate: string; completionRate: number;
  completedCount: number; totalAssigned: number; format: TrainFmt; description: string;
}
interface RbacRole {
  name: string; description: string; userCount: number;
  permissions: Record<string, "full"|"read"|"none"|"limited">;
}

// ── Static Data ──────────────────────────────────────────────────────────────
const USERS: PeopleUser[] = [
  { id:"USR-001", name:"Sarah Chen",       email:"s.chen@acme.com",        type:"Internal", role:"Super Admin",         department:"IT Operations", status:"active",    mfaEnabled:true,  lastLogin:"2026-06-13", policyAck:12, totalPolicies:12, rank:"C-Suite"   },
  { id:"USR-002", name:"James Okafor",     email:"j.okafor@acme.com",      type:"Internal", role:"CISO",                department:"IT Operations", status:"active",    mfaEnabled:true,  lastLogin:"2026-06-12", policyAck:12, totalPolicies:12, rank:"C-Suite"   },
  { id:"USR-003", name:"Maria Santos",     email:"m.santos@acme.com",      type:"Internal", role:"Risk Analyst",        department:"Operations",    status:"active",    mfaEnabled:true,  lastLogin:"2026-06-13", policyAck:10, totalPolicies:12, rank:"Senior"    },
  { id:"USR-004", name:"David Kim",        email:"d.kim@acme.com",         type:"Internal", role:"Compliance Analyst",  department:"Legal",         status:"active",    mfaEnabled:true,  lastLogin:"2026-06-11", policyAck:11, totalPolicies:12, rank:"Mid-Level"  },
  { id:"USR-005", name:"Priya Nair",       email:"p.nair@acme.com",        type:"Internal", role:"CDPO",                department:"Legal",         status:"active",    mfaEnabled:true,  lastLogin:"2026-06-10", policyAck:12, totalPolicies:12, rank:"Director"  },
  { id:"USR-006", name:"Tom Fletcher",     email:"t.fletcher@acme.com",    type:"Internal", role:"Security Analyst",    department:"IT Operations", status:"active",    mfaEnabled:false, lastLogin:"2026-06-09", policyAck:8,  totalPolicies:12, rank:"Senior"    },
  { id:"USR-007", name:"Aisha Musa",       email:"a.musa@acme.com",        type:"Internal", role:"Finance Specialist",  department:"Finance",       status:"active",    mfaEnabled:false, lastLogin:"2026-06-08", policyAck:8,  totalPolicies:12, rank:"Senior"    },
  { id:"USR-008", name:"Carlos Rivera",    email:"c.rivera@acme.com",      type:"Internal", role:"HR Generalist",       department:"HR",            status:"active",    mfaEnabled:false, lastLogin:"2026-06-07", policyAck:9,  totalPolicies:12, rank:"Mid-Level"  },
  { id:"USR-009", name:"Lena Hoffmann",    email:"l.hoffmann@acme.com",    type:"Internal", role:"Internal Auditor",    department:"Operations",    status:"active",    mfaEnabled:true,  lastLogin:"2026-06-12", policyAck:12, totalPolicies:12, rank:"Senior"    },
  { id:"USR-010", name:"Patrick O'Brien",  email:"p.obrien@acme.com",      type:"Internal", role:"Tenant Admin",        department:"IT Operations", status:"inactive",  mfaEnabled:true,  lastLogin:"2026-05-20", policyAck:12, totalPolicies:12, rank:"Director"  },
  { id:"USR-015", name:"Alex Morrison",    email:"a.morrison@acme.com",    type:"Internal", role:"Senior Engineer",     department:"Engineering",   status:"active",    mfaEnabled:true,  lastLogin:"2026-06-13", policyAck:12, totalPolicies:12, rank:"Senior"    },
  { id:"USR-016", name:"Beth Nakamura",    email:"b.nakamura@acme.com",    type:"Internal", role:"Frontend Engineer",   department:"Engineering",   status:"active",    mfaEnabled:true,  lastLogin:"2026-06-12", policyAck:11, totalPolicies:12, rank:"Mid-Level"  },
  { id:"USR-017", name:"Chris Okonkwo",    email:"c.okonkwo@acme.com",     type:"Internal", role:"DevOps Engineer",     department:"Engineering",   status:"active",    mfaEnabled:false, lastLogin:"2026-06-11", policyAck:10, totalPolicies:12, rank:"Mid-Level"  },
  { id:"USR-018", name:"Dana Pierce",      email:"d.pierce@acme.com",      type:"Internal", role:"QA Engineer",         department:"Engineering",   status:"active",    mfaEnabled:true,  lastLogin:"2026-06-13", policyAck:12, totalPolicies:12, rank:"Mid-Level"  },
  { id:"USR-019", name:"Evan Quinn",       email:"e.quinn@acme.com",       type:"Internal", role:"Platform Engineer",   department:"Engineering",   status:"active",    mfaEnabled:true,  lastLogin:"2026-06-10", policyAck:11, totalPolicies:12, rank:"Mid-Level"  },
  { id:"USR-020", name:"Fiona Ross",       email:"f.ross@acme.com",        type:"Internal", role:"Backend Engineer",    department:"Engineering",   status:"active",    mfaEnabled:false, lastLogin:"2026-06-09", policyAck:9,  totalPolicies:12, rank:"Mid-Level"  },
  { id:"USR-021", name:"George Shaw",      email:"g.shaw@acme.com",        type:"Internal", role:"Full Stack Dev",      department:"Engineering",   status:"active",    mfaEnabled:true,  lastLogin:"2026-06-12", policyAck:12, totalPolicies:12, rank:"Mid-Level"  },
  { id:"USR-022", name:"Helen Torres",     email:"h.torres@acme.com",      type:"Internal", role:"ML Engineer",         department:"Engineering",   status:"active",    mfaEnabled:true,  lastLogin:"2026-06-11", policyAck:12, totalPolicies:12, rank:"Senior"    },
  { id:"USR-023", name:"Ivan Vasquez",     email:"i.vasquez@acme.com",     type:"Internal", role:"Security Engineer",   department:"Engineering",   status:"active",    mfaEnabled:true,  lastLogin:"2026-06-10", policyAck:12, totalPolicies:12, rank:"Senior"    },
  { id:"USR-024", name:"Julia Wang",       email:"j.wang@acme.com",        type:"Internal", role:"SRE",                 department:"Engineering",   status:"active",    mfaEnabled:false, lastLogin:"2026-06-08", policyAck:8,  totalPolicies:12, rank:"Mid-Level"  },
  { id:"USR-025", name:"Kevin Xu",         email:"k.xu@acme.com",          type:"Internal", role:"Cloud Architect",     department:"Engineering",   status:"active",    mfaEnabled:true,  lastLogin:"2026-06-12", policyAck:12, totalPolicies:12, rank:"Director"  },
  { id:"USR-026", name:"Laura Young",      email:"l.young@acme.com",       type:"Internal", role:"Data Engineer",       department:"Engineering",   status:"active",    mfaEnabled:true,  lastLogin:"2026-06-11", policyAck:11, totalPolicies:12, rank:"Mid-Level"  },
  { id:"USR-027", name:"Mike Allen",       email:"m.allen@acme.com",       type:"Internal", role:"Network Admin",       department:"IT Operations", status:"active",    mfaEnabled:false, lastLogin:"2026-06-12", policyAck:10, totalPolicies:12, rank:"Mid-Level"  },
  { id:"USR-028", name:"Nina Brown",       email:"n.brown@acme.com",       type:"Internal", role:"Systems Admin",       department:"IT Operations", status:"active",    mfaEnabled:true,  lastLogin:"2026-06-11", policyAck:12, totalPolicies:12, rank:"Mid-Level"  },
  { id:"USR-029", name:"Oscar Carter",     email:"o.carter@acme.com",      type:"Internal", role:"Helpdesk Tech",       department:"IT Operations", status:"active",    mfaEnabled:false, lastLogin:"2026-06-09", policyAck:9,  totalPolicies:12, rank:"Junior"    },
  { id:"USR-030", name:"Paula Davis",      email:"p.davis@acme.com",       type:"Internal", role:"IT Manager",          department:"IT Operations", status:"active",    mfaEnabled:true,  lastLogin:"2026-06-12", policyAck:12, totalPolicies:12, rank:"Manager"   },
  { id:"USR-031", name:"Quinn Evans",      email:"q.evans@acme.com",       type:"Internal", role:"Endpoint Admin",      department:"IT Operations", status:"active",    mfaEnabled:true,  lastLogin:"2026-06-10", policyAck:11, totalPolicies:12, rank:"Mid-Level"  },
  { id:"USR-032", name:"Rachel Foster",    email:"r.foster@acme.com",      type:"Internal", role:"IT Analyst",          department:"IT Operations", status:"active",    mfaEnabled:true,  lastLogin:"2026-06-11", policyAck:12, totalPolicies:12, rank:"Mid-Level"  },
  { id:"USR-033", name:"Sam Green",        email:"s.green@acme.com",       type:"Internal", role:"Infra Engineer",      department:"IT Operations", status:"active",    mfaEnabled:false, lastLogin:"2026-06-08", policyAck:10, totalPolicies:12, rank:"Mid-Level"  },
  { id:"USR-034", name:"Tina Harris",      email:"t.harris@acme.com",      type:"Internal", role:"Cloud Ops",           department:"IT Operations", status:"active",    mfaEnabled:true,  lastLogin:"2026-06-10", policyAck:12, totalPolicies:12, rank:"Mid-Level"  },
  { id:"USR-035", name:"Uma Ibrahim",      email:"u.ibrahim@acme.com",     type:"Internal", role:"IAM Admin",           department:"IT Operations", status:"active",    mfaEnabled:true,  lastLogin:"2026-06-12", policyAck:12, totalPolicies:12, rank:"Senior"    },
  { id:"USR-036", name:"Victor Jones",     email:"v.jones@acme.com",       type:"Internal", role:"Monitoring Eng",      department:"IT Operations", status:"active",    mfaEnabled:false, lastLogin:"2026-06-07", policyAck:8,  totalPolicies:12, rank:"Mid-Level"  },
  { id:"USR-037", name:"Wendy King",       email:"w.king@acme.com",        type:"Internal", role:"Legal Counsel",       department:"Legal",         status:"active",    mfaEnabled:true,  lastLogin:"2026-06-12", policyAck:12, totalPolicies:12, rank:"Director"  },
  { id:"USR-038", name:"Xander Lee",       email:"x.lee@acme.com",         type:"Internal", role:"Contract Manager",    department:"Legal",         status:"active",    mfaEnabled:true,  lastLogin:"2026-06-11", policyAck:11, totalPolicies:12, rank:"Senior"    },
  { id:"USR-039", name:"Yara Martinez",    email:"y.martinez@acme.com",    type:"Internal", role:"Compliance Lead",     department:"Legal",         status:"active",    mfaEnabled:true,  lastLogin:"2026-06-10", policyAck:12, totalPolicies:12, rank:"Director"  },
  { id:"USR-040", name:"Zoe Nelson",       email:"z.nelson@acme.com",      type:"Internal", role:"Paralegal",           department:"Legal",         status:"active",    mfaEnabled:false, lastLogin:"2026-06-09", policyAck:9,  totalPolicies:12, rank:"Junior"    },
  { id:"USR-041", name:"Adam Okafor",      email:"adam.o@acme.com",        type:"Internal", role:"Legal Analyst",       department:"Legal",         status:"active",    mfaEnabled:true,  lastLogin:"2026-06-12", policyAck:12, totalPolicies:12, rank:"Mid-Level"  },
  { id:"USR-052", name:"Mia Zhang",        email:"m.zhang@acme.com",       type:"Internal", role:"HR Manager",          department:"HR",            status:"active",    mfaEnabled:true,  lastLogin:"2026-06-12", policyAck:12, totalPolicies:12, rank:"Manager"   },
  { id:"USR-053", name:"Noah Adams",       email:"n.adams@acme.com",       type:"Internal", role:"Recruiter",           department:"HR",            status:"active",    mfaEnabled:true,  lastLogin:"2026-06-11", policyAck:11, totalPolicies:12, rank:"Mid-Level"  },
  { id:"USR-054", name:"Olivia Brown",     email:"o.brown@acme.com",       type:"Internal", role:"HR Business Partner", department:"HR",            status:"active",    mfaEnabled:true,  lastLogin:"2026-06-10", policyAck:12, totalPolicies:12, rank:"Senior"    },
  { id:"USR-055", name:"Paul Chen",        email:"p.chen@acme.com",        type:"Internal", role:"Learning & Dev",      department:"HR",            status:"active",    mfaEnabled:false, lastLogin:"2026-06-09", policyAck:9,  totalPolicies:12, rank:"Senior"    },
  { id:"USR-056", name:"Quincy Davis",     email:"q.davis@acme.com",       type:"Internal", role:"Benefits Admin",      department:"HR",            status:"active",    mfaEnabled:true,  lastLogin:"2026-06-12", policyAck:12, totalPolicies:12, rank:"Mid-Level"  },
  { id:"USR-060", name:"Uma Harris",       email:"u.harris@acme.com",      type:"Internal", role:"Sales Manager",       department:"Sales",         status:"active",    mfaEnabled:true,  lastLogin:"2026-06-12", policyAck:12, totalPolicies:12, rank:"Manager"   },
  { id:"USR-061", name:"Victor Ingram",    email:"v.ingram@acme.com",      type:"Internal", role:"Account Executive",   department:"Sales",         status:"active",    mfaEnabled:true,  lastLogin:"2026-06-11", policyAck:11, totalPolicies:12, rank:"Senior"    },
  { id:"USR-062", name:"Wendy Jones",      email:"w.jones@acme.com",       type:"Internal", role:"Sales Analyst",       department:"Sales",         status:"active",    mfaEnabled:false, lastLogin:"2026-06-10", policyAck:9,  totalPolicies:12, rank:"Mid-Level"  },
  { id:"USR-067", name:"Bob Ortega",       email:"b.ortega@acme.com",      type:"Internal", role:"Marketing Manager",   department:"Marketing",     status:"active",    mfaEnabled:true,  lastLogin:"2026-06-12", policyAck:12, totalPolicies:12, rank:"Manager"   },
  { id:"USR-068", name:"Clara Park",       email:"c.park@acme.com",        type:"Internal", role:"Content Strategist",  department:"Marketing",     status:"active",    mfaEnabled:true,  lastLogin:"2026-06-11", policyAck:11, totalPolicies:12, rank:"Senior"    },
  { id:"USR-074", name:"Irene Walsh",      email:"i.walsh@acme.com",       type:"Internal", role:"Operations Manager",  department:"Operations",    status:"active",    mfaEnabled:true,  lastLogin:"2026-06-12", policyAck:12, totalPolicies:12, rank:"Manager"   },
  { id:"USR-075", name:"Jay White",        email:"j.white2@acme.com",      type:"Internal", role:"Process Engineer",    department:"Operations",    status:"active",    mfaEnabled:true,  lastLogin:"2026-06-11", policyAck:11, totalPolicies:12, rank:"Mid-Level"  },
  { id:"USR-011", name:"NovaSec Consulting",email:"auditor@novasec.com",   type:"External", role:"External Auditor",    department:"External",      status:"active",    mfaEnabled:true,  lastLogin:"2026-06-01", policyAck:3,  totalPolicies:3,  rank:"Contractor"},
  { id:"USR-012", name:"CloudShield Ltd",  email:"ops@cloudshield.com",    type:"External", role:"Vendor",              department:"External",      status:"active",    mfaEnabled:false, lastLogin:"2026-06-05", policyAck:2,  totalPolicies:3,  rank:"Contractor"},
  { id:"USR-013", name:"FinAudit Partners",email:"review@finaudit.com",    type:"External", role:"External Auditor",    department:"External",      status:"pending",   mfaEnabled:false, lastLogin:"—",          policyAck:0,  totalPolicies:3,  rank:"Contractor"},
  { id:"USR-014", name:"SecAudit GmbH",    email:"contact@secaudit.de",    type:"External", role:"Vendor",              department:"External",      status:"suspended", mfaEnabled:false, lastLogin:"2026-03-14", policyAck:1,  totalPolicies:3,  rank:"Contractor"},
  { id:"SVC-001", name:"grc-api-svc",      email:"svc-api@system.local",   type:"Non-Human",role:"Service Account",     department:"IT Systems",    status:"active",    mfaEnabled:false, lastLogin:"2026-06-13", policyAck:0,  totalPolicies:0  },
  { id:"SVC-002", name:"backup-agent",     email:"svc-bkp@system.local",   type:"Non-Human",role:"Service Account",     department:"IT Systems",    status:"active",    mfaEnabled:false, lastLogin:"2026-06-13", policyAck:0,  totalPolicies:0  },
  { id:"SVC-003", name:"ci-deploy-bot",    email:"cicd@system.local",      type:"Non-Human",role:"Service Account",     department:"DevOps",        status:"active",    mfaEnabled:false, lastLogin:"2026-06-13", policyAck:0,  totalPolicies:0  },
  { id:"SVC-004", name:"monitor-agent",    email:"monitoring@system.local",type:"Non-Human",role:"Service Account",     department:"IT Systems",    status:"inactive",  mfaEnabled:false, lastLogin:"2026-04-01", policyAck:0,  totalPolicies:0  },
];

const _polMeta: { dueDate:string; ackRate:number; total:number; acked:number }[] = [
  { dueDate:"2026-07-01", ackRate:88, total:10, acked:9 },
  { dueDate:"2026-07-01", ackRate:83, total:10, acked:8 },
  { dueDate:"2026-07-15", ackRate:70, total:10, acked:7 },
  { dueDate:"2026-06-30", ackRate:60, total:10, acked:6 },
  { dueDate:"2026-06-25", ackRate:75, total:10, acked:8 },
  { dueDate:"2026-08-01", ackRate:80, total:10, acked:8 },
  { dueDate:"2026-07-20", ackRate:65, total:10, acked:7 },
  { dueDate:"2026-07-10", ackRate:90, total:10, acked:9 },
  { dueDate:"2026-08-15", ackRate:78, total:10, acked:8 },
  { dueDate:"2026-07-01", ackRate:70, total:10, acked:7 },
  { dueDate:"2026-09-01", ackRate:60, total:10, acked:6 },
  { dueDate:"2026-08-01", ackRate:55, total:10, acked:6 },
];
const POLICIES: Policy[] = allPolicies.slice(0, 12).map((p, i) => ({
  id: p.id, name: p.name, category: p.category,
  owner: p.owner, version: p.version, policyStatus: p.status,
  impact: p.impact, frameworks: p.frameworks,
  ..._polMeta[i],
}));

const TRAININGS: Training[] = [
  { id:"TRN-001", title:"Security Awareness Fundamentals",   category:"Security Awareness", duration:"45 min", mandatory:true,  dueDate:"2026-07-01", completionRate:82, completedCount:62, totalAssigned:75, format:"Video",       description:"Phishing recognition, password hygiene, social engineering defense" },
  { id:"TRN-002", title:"GDPR & Privacy Fundamentals",       category:"Privacy",            duration:"60 min", mandatory:true,  dueDate:"2026-07-15", completionRate:74, completedCount:56, totalAssigned:75, format:"Interactive",  description:"Data subject rights, lawful processing, breach notification, DPIA" },
  { id:"TRN-003", title:"Code of Conduct",                   category:"HR",                 duration:"30 min", mandatory:true,  dueDate:"2026-08-01", completionRate:91, completedCount:68, totalAssigned:75, format:"Document",     description:"Workplace ethics, anti-bribery, harassment policy, whistleblower" },
  { id:"TRN-004", title:"Phishing Simulation — Q2 2026",     category:"Security Awareness", duration:"15 min", mandatory:true,  dueDate:"2026-06-30", completionRate:68, completedCount:51, totalAssigned:75, format:"Interactive",  description:"Live phishing simulation; click-rate tracking and remedial training" },
  { id:"TRN-005", title:"Insider Threat Awareness",          category:"Security Awareness", duration:"30 min", mandatory:false, dueDate:"2026-08-15", completionRate:55, completedCount:41, totalAssigned:75, format:"Video",       description:"Recognizing and reporting insider threat indicators" },
  { id:"TRN-006", title:"Data Handling & Classification",    category:"Compliance",         duration:"45 min", mandatory:true,  dueDate:"2026-07-01", completionRate:77, completedCount:58, totalAssigned:75, format:"Quiz",        description:"Data classification tiers, handling rules, DLP policy compliance" },
  { id:"TRN-007", title:"PCI-DSS Awareness for Finance",     category:"Compliance",         duration:"60 min", mandatory:false, dueDate:"2026-07-20", completionRate:87, completedCount:14, totalAssigned:16, format:"Interactive",  description:"Payment card handling, PCI-DSS scope, do's and don'ts for Finance" },
  { id:"TRN-008", title:"Secure SDLC for Developers",        category:"Technical",          duration:"90 min", mandatory:false, dueDate:"2026-08-01", completionRate:69, completedCount:17, totalAssigned:25, format:"Interactive",  description:"OWASP Top 10, secure code review, dependency scanning, threat modeling" },
  { id:"TRN-009", title:"Incident Response Drill",           category:"Technical",          duration:"60 min", mandatory:false, dueDate:"2026-08-15", completionRate:44, completedCount:8,  totalAssigned:18, format:"Interactive",  description:"IR playbook walkthrough, tabletop exercise, escalation paths" },
  { id:"TRN-010", title:"Remote Work & BYOD Security",       category:"HR",                 duration:"20 min", mandatory:true,  dueDate:"2026-08-01", completionRate:83, completedCount:62, totalAssigned:75, format:"Video",       description:"VPN usage, home network security, lost device procedures" },
  { id:"TRN-011", title:"Third-Party Risk Awareness",        category:"Compliance",         duration:"30 min", mandatory:false, dueDate:"2026-07-20", completionRate:58, completedCount:44, totalAssigned:75, format:"Video",       description:"Vendor vetting, contract review, supply chain risks" },
  { id:"TRN-012", title:"AI & Acceptable Use Policy",        category:"Compliance",         duration:"25 min", mandatory:true,  dueDate:"2026-09-01", completionRate:41, completedCount:31, totalAssigned:75, format:"Quiz",        description:"Responsible AI usage, data privacy in AI tools, prohibited use cases" },
];

const MODULES_RBAC = ["GovOps","RiskOps","Compliance","ServiceOps","SecOps","AssetOps","CloudOps","PrivacyOps","DataOps","Analytics","AI vCISO","PeopleOps","Settings"];

const ALL_MODULES_PERM = [
  { id:"GovOps",    label:"GovOps",     icon:"🏛" },
  { id:"RiskOps",   label:"RiskOps",    icon:"⚠️" },
  { id:"Compliance",label:"Compliance", icon:"✅" },
  { id:"ServiceOps",label:"ServiceOps", icon:"🎫" },
  { id:"SecOps",    label:"SecOps",     icon:"🔒" },
  { id:"AssetOps",  label:"AssetOps",   icon:"📦" },
  { id:"CloudOps",  label:"CloudOps",   icon:"☁️" },
  { id:"PrivacyOps",label:"PrivacyOps", icon:"🔏" },
  { id:"DataOps",   label:"DataOps",    icon:"🗄" },
  { id:"Analytics", label:"Analytics",  icon:"📊" },
  { id:"AI vCISO",  label:"AI vCISO",   icon:"◆" },
  { id:"PeopleOps", label:"PeopleOps",  icon:"👥" },
  { id:"Settings",  label:"Settings",   icon:"⚙" },
];
const RBAC_ROLES_DEFAULT: RbacRole[] = [
  { name:"Super Admin",  description:"Unrestricted access to all modules and settings", userCount:1,
    permissions:{ GovOps:"full",RiskOps:"full",Compliance:"full",ServiceOps:"full",SecOps:"full",AssetOps:"full",CloudOps:"full",PrivacyOps:"full",DataOps:"full",Analytics:"full","AI vCISO":"full",PeopleOps:"full",Settings:"full" }},
  { name:"Tenant Admin", description:"Full access to all modules; cannot modify global settings", userCount:2,
    permissions:{ GovOps:"full",RiskOps:"full",Compliance:"full",ServiceOps:"full",SecOps:"full",AssetOps:"full",CloudOps:"full",PrivacyOps:"full",DataOps:"full",Analytics:"full","AI vCISO":"full",PeopleOps:"full",Settings:"full" }},
  { name:"CISO",         description:"Full security & risk oversight, AI vCISO; read-only analytics", userCount:1,
    permissions:{ GovOps:"read",RiskOps:"full",Compliance:"full",ServiceOps:"read",SecOps:"full",AssetOps:"full",CloudOps:"full",PrivacyOps:"full",DataOps:"read",Analytics:"read","AI vCISO":"full",PeopleOps:"read",Settings:"none" }},
  { name:"CRO",          description:"Risk & compliance oversight, analytics", userCount:1,
    permissions:{ GovOps:"read",RiskOps:"full",Compliance:"read",ServiceOps:"none",SecOps:"none",AssetOps:"read",CloudOps:"none",PrivacyOps:"none",DataOps:"none",Analytics:"full","AI vCISO":"none",PeopleOps:"none",Settings:"none" }},
  { name:"CDPO",         description:"Privacy, data governance, analytics — no Settings", userCount:1,
    permissions:{ GovOps:"read",RiskOps:"none",Compliance:"read",ServiceOps:"none",SecOps:"none",AssetOps:"none",CloudOps:"none",PrivacyOps:"full",DataOps:"full",Analytics:"full","AI vCISO":"none",PeopleOps:"none",Settings:"none" }},
  { name:"Risk Analyst", description:"Risk management and compliance reporting access", userCount:3,
    permissions:{ GovOps:"read",RiskOps:"full",Compliance:"read",ServiceOps:"none",SecOps:"read",AssetOps:"read",CloudOps:"none",PrivacyOps:"read",DataOps:"none",Analytics:"read","AI vCISO":"read",PeopleOps:"none",Settings:"none" }},
  { name:"Auditor",      description:"Read-only access to all compliance and audit data", userCount:4,
    permissions:{ GovOps:"read",RiskOps:"read",Compliance:"read",ServiceOps:"none",SecOps:"read",AssetOps:"read",CloudOps:"read",PrivacyOps:"read",DataOps:"none",Analytics:"read","AI vCISO":"none",PeopleOps:"none",Settings:"none" }},
  { name:"HR Admin",     description:"PeopleOps full access; other modules limited — no Settings", userCount:3,
    permissions:{ GovOps:"none",RiskOps:"none",Compliance:"limited",ServiceOps:"read",SecOps:"none",AssetOps:"none",CloudOps:"none",PrivacyOps:"limited",DataOps:"none",Analytics:"read","AI vCISO":"none",PeopleOps:"full",Settings:"none" }},
  { name:"Vendor",       description:"TPRM-only access within ComplianceOps — no Settings", userCount:2,
    permissions:{ GovOps:"none",RiskOps:"none",Compliance:"limited",ServiceOps:"none",SecOps:"none",AssetOps:"none",CloudOps:"none",PrivacyOps:"none",DataOps:"none",Analytics:"none","AI vCISO":"none",PeopleOps:"none",Settings:"none" }},
  { name:"Employee",     description:"Self-service only: training, policy acknowledgment — no Settings", userCount:3,
    permissions:{ GovOps:"none",RiskOps:"none",Compliance:"none",ServiceOps:"limited",SecOps:"none",AssetOps:"none",CloudOps:"none",PrivacyOps:"none",DataOps:"none",Analytics:"none","AI vCISO":"none",PeopleOps:"none",Settings:"none" }},
];

// ── Deterministic user training status ────────────────────────────────────
function userTrainStatus(userId: string, trainId: string): TrStatus {
  const n = (userId.charCodeAt(4)||0) + (userId.charCodeAt(5)||0) + (trainId.charCodeAt(4)||0);
  const v = n % 10;
  if (v < 6) return "completed";
  if (v < 7) return "in_progress";
  if (v < 9) return "not_started";
  return "overdue";
}

// ── Sub-components ────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color="#93C5FD", icon, onClick }: {
  label: string; value: string|number; sub?: string; color?: string; icon: string; onClick?: ()=>void;
}) {
  return (
    <div onClick={onClick} style={{ ...card({ padding:"14px 16px" }), cursor:onClick?"pointer":"default", display:"flex", flexDirection:"column" as const, gap:4 }}
         onMouseEnter={e=>onClick&&((e.currentTarget as HTMLDivElement).style.borderColor="rgba(147,197,253,0.3)")}
         onMouseLeave={e=>onClick&&((e.currentTarget as HTMLDivElement).style.borderColor="var(--border)")}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <span style={{ fontSize:10, fontWeight:800, letterSpacing:"0.08em", color:"var(--muted-foreground)", textTransform:"uppercase" as const }}>{label}</span>
        <span style={{ fontSize:18 }}>{icon}</span>
      </div>
      <div style={{ fontSize:24, fontWeight:900, color }}>{value}</div>
      {sub && <div style={{ fontSize:10, color:"var(--muted-foreground)" }}>{sub}</div>}
    </div>
  );
}

function UserTypeBadge({ type }: { type: UserType }) {
  const m: Record<UserType,{bg:string;color:string}> = {
    Internal:   { bg:"rgba(59,130,246,0.15)",  color:"#93C5FD" },
    External:   { bg:"rgba(245,158,11,0.15)",  color:"#FCD34D" },
    "Non-Human":{ bg:"rgba(139,92,246,0.15)",  color:"#C4B5FD" },
  };
  return <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:4, ...m[type] }}>{type}</span>;
}

function StatusDot({ status }: { status: UserStatus }) {
  const m: Record<UserStatus,string> = { active:EME, inactive:"#6B7280", suspended:RED, pending:AMB };
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5 }}>
      <span style={{ width:7, height:7, borderRadius:"50%", background:m[status], display:"inline-block" }} />
      <span style={{ fontSize:11, fontWeight:600, textTransform:"capitalize" as const }}>{status}</span>
    </span>
  );
}

function MfaBadge({ on }: { on: boolean }) {
  return (
    <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:4,
      background:on?"rgba(16,185,129,0.15)":"rgba(239,68,68,0.15)", color:on?EME:RED }}>
      {on?"✓ MFA":"✗ No MFA"}
    </span>
  );
}

function AckBar({ acked, total }: { acked:number; total:number }) {
  if (total===0) return <span style={{ fontSize:11, color:"rgba(255,255,255,0.3)" }}>N/A</span>;
  const pct = Math.round((acked/total)*100);
  const color = pct===100?EME:pct>=70?AMB:RED;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
      <div style={{ width:52, height:5, borderRadius:3, background:"rgba(255,255,255,0.1)", overflow:"hidden" }}>
        <div style={{ width:`${pct}%`, height:"100%", background:color, borderRadius:3 }} />
      </div>
      <span style={{ fontSize:11, fontWeight:700, color }}>{acked}/{total}</span>
    </div>
  );
}

function TrainStatusBadge({ status }: { status: TrStatus }) {
  const m: Record<TrStatus,{bg:string;color:string;label:string}> = {
    completed:   { bg:"rgba(52,211,153,0.15)",  color:EME,  label:"✓ Completed"   },
    in_progress: { bg:"rgba(252,211,77,0.15)",  color:AMB,  label:"↻ In Progress" },
    not_started: { bg:"var(--border)", color:"var(--muted-foreground)", label:"— Not Started" },
    overdue:     { bg:"rgba(248,113,113,0.15)", color:RED,  label:"⚠ Overdue"    },
  };
  const s = m[status];
  return <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:4, background:s.bg, color:s.color }}>{s.label}</span>;
}

function PermCell({ val }: { val:"full"|"read"|"none"|"limited" }) {
  const m = {
    full:   { bg:"rgba(16,185,129,0.15)",  color:EME,  label:"Full"    },
    read:   { bg:"rgba(59,130,246,0.15)",  color:NAV,  label:"Read"    },
    limited:{ bg:"rgba(245,158,11,0.15)",  color:AMB,  label:"Limited" },
    none:   { bg:"var(--secondary)", color:"rgba(255,255,255,0.2)", label:"—" },
  } as const;
  const s = m[val];
  return <div style={{ display:"flex", justifyContent:"center" }}>
    <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:4, background:s.bg, color:s.color }}>{s.label}</span>
  </div>;
}

// ── Full-page User Detail ─────────────────────────────────────────────────────
function UserDetail({ user, onBack, policies = POLICIES, trainings = TRAININGS, onAssign }: { user: PeopleUser; onBack: ()=>void; policies?: typeof POLICIES; trainings?: typeof TRAININGS; onAssign?: (mode:"policy"|"training")=>void }) {
  const { user: authUser } = useAuth();
  const isHR = authUser?.role === "super_admin" || authUser?.role === "tenant_admin" || authUser?.role === "hr_admin";

  const [detailTab,   setDetailTab]   = useState("overview");
  const [localRank,   setLocalRank]   = useState(user.rank ?? "");
  const [editingRank, setEditingRank] = useState(false);
  const [rankDraft,   setRankDraft]   = useState(user.rank ?? "");
  const [selectedPolicy,   setSelectedPolicy]   = useState<Policy|null>(null);
  const [selectedTraining, setSelectedTraining] = useState<Training|null>(null);

  const ackPct = user.totalPolicies>0 ? Math.round((user.policyAck/user.totalPolicies)*100) : 0;
  const trainRecords = trainings.map(t => ({ training:t, status:userTrainStatus(user.id, t.id) }));
  const completedTrain = trainRecords.filter(r=>r.status==="completed").length;
  const overdueTrain = trainRecords.filter(r=>r.status==="overdue").length;
  const initials = user.name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
  const avatarColor = ["#3B82F6","#8B5CF6","#10B981","#F59E0B","#EF4444","#EC4899"][user.id.charCodeAt(4)%6];

  const activityLog = [
    { ts:"2026-06-13 09:12", event:"Logged in",                   icon:"🔑", color:EME },
    { ts:"2026-06-12 16:44", event:"Policy acknowledged: GDPR / Privacy Policy", icon:"✅", color:EME },
    { ts:"2026-06-12 14:22", event:"Training completed: Code of Conduct",        icon:"🎓", color:NAV },
    { ts:"2026-06-11 10:30", event:"Password changed",             icon:"🔒", color:AMB },
    { ts:"2026-06-10 08:55", event:"MFA device enrolled",          icon:"📱", color:PRP },
    { ts:"2026-06-09 17:01", event:"Access role updated to: " + user.role, icon:"⚙", color:"var(--muted-foreground)" },
  ];

  return (
    <div style={{ display:"flex", flexDirection:"column" as const, gap:0, height:"100%", overflow:"auto" }}>
      {/* Back bar */}
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 20px", borderBottom:"1px solid var(--border)", background:"rgb(9,12,18)" }}>
        <button onClick={onBack} style={{ background:"var(--border)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:6, padding:"5px 12px", fontSize:11, fontWeight:700, color:"rgba(148,163,184,0.8)", cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
          ← Back to People
        </button>
        <span style={{ color:"rgba(255,255,255,0.2)" }}>/</span>
        <span style={{ fontSize:12, fontWeight:600, color:"var(--muted-foreground)" }}>{user.name}</span>
        <span style={{ fontSize:10, fontFamily:"monospace", color:"var(--muted-foreground)", background:"var(--secondary)", border:"1px solid var(--border)", borderRadius:4, padding:"2px 7px" }}>{user.id}</span>
        <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
          <button style={{ background:"rgba(248,113,113,0.1)", border:"1px solid rgba(248,113,113,0.3)", borderRadius:6, padding:"5px 12px", fontSize:11, fontWeight:700, color:RED, cursor:"pointer" }}>Suspend</button>
          <button style={{ background:"rgba(59,130,246,0.15)", border:"1px solid rgba(59,130,246,0.4)", borderRadius:6, padding:"5px 12px", fontSize:11, fontWeight:700, color:NAV, cursor:"pointer" }}>Reset MFA</button>
          <button style={{ background:"rgba(52,211,153,0.15)", border:"1px solid rgba(52,211,153,0.4)", borderRadius:6, padding:"5px 12px", fontSize:11, fontWeight:700, color:EME, cursor:"pointer" }}>+ Assign</button>
        </div>
      </div>

      <div style={{ flex:1, overflow:"auto", padding:"20px", display:"flex", flexDirection:"column" as const, gap:16 }}>
        {/* Profile header card */}
        <div style={{ ...card({ padding:"20px 24px" }), display:"flex", alignItems:"center", gap:20 }}>
          <div style={{ width:64, height:64, borderRadius:16, background:avatarColor, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, fontWeight:900, color:"white", flexShrink:0 }}>{initials}</div>
          <div style={{ flex:1 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
              <span style={{ fontSize:20, fontWeight:800, color:"white" }}>{user.name}</span>
              <UserTypeBadge type={user.type} />
              <StatusDot status={user.status} />
              {localRank && (
                <span style={{ fontSize:11, fontWeight:700, padding:"2px 9px", borderRadius:5,
                  background:"rgba(196,181,253,0.15)", color:"#A78BFA", border:"1px solid rgba(196,181,253,0.25)" }}>
                  ⭐ {localRank}
                </span>
              )}
            </div>
            <div style={{ fontSize:12, color:"var(--muted-foreground)", marginBottom:8 }}>{user.email}</div>
            <div style={{ display:"flex", gap:12, flexWrap:"wrap" as const }}>
              {[
                { label:"Role",       value:user.role },
                { label:"Department", value:user.department },
                { label:"Last Login", value:user.lastLogin },
              ].map(f => (
                <div key={f.label} style={{ fontSize:11 }}>
                  <span style={{ color:"var(--muted-foreground)", marginRight:4 }}>{f.label}:</span>
                  <span style={{ color:NAV, fontWeight:600 }}>{f.value}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Risk score */}
          <div style={{ textAlign:"center" as const, padding:"12px 20px", background:"var(--secondary)", borderRadius:10, border:"1px solid var(--border)" }}>
            <div style={{ fontSize:28, fontWeight:900, color:ackPct>=90?EME:ackPct>=70?AMB:RED, fontFamily:"monospace" }}>{ackPct}%</div>
            <div style={{ fontSize:10, color:"var(--muted-foreground)", fontWeight:700, letterSpacing:"0.05em" }}>POLICY ACK</div>
          </div>
        </div>

        {/* KPI strip */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
          {[
            { label:"Policy Ack",          value:`${user.policyAck}/${user.totalPolicies}`, sub:"policies acknowledged",       color:ackPct>=90?EME:AMB, icon:"📜" },
            { label:"Training Completed",   value:`${completedTrain}/${trainings.length}`,   sub:"training modules done",        color:NAV, icon:"🎓" },
            { label:"Overdue Training",      value:overdueTrain,                               sub:"requires immediate action",    color:overdueTrain>0?RED:EME, icon:"⚠️" },
            { label:"MFA Status",            value:user.mfaEnabled?"Enabled":"Disabled",        sub:"multi-factor authentication", color:user.mfaEnabled?EME:RED, icon:"🔐" },
          ].map(k => (
            <div key={k.label} style={{ ...card({ padding:"12px 16px" }) }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:4 }}>
                <span style={{ fontSize:9, fontWeight:800, letterSpacing:"0.06em", color:"var(--muted-foreground)", textTransform:"uppercase" as const }}>{k.label}</span>
                <span style={{ fontSize:16 }}>{k.icon}</span>
              </div>
              <div style={{ fontSize:20, fontWeight:900, color:k.color, fontFamily:"monospace" }}>{k.value}</div>
              <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:2 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Detail sub-tabs */}
        <div style={{ display:"flex", gap:4, borderBottom:"1px solid var(--border)", paddingBottom:0 }}>
          {[
            { key:"overview",       label:"Overview" },
            { key:"policies",       label:"Policies" },
            { key:"training",       label:"Training" },
            { key:"assigned-tasks", label:"🗂 Assigned Tasks" },
            { key:"activity",       label:"Activity" },
          ].map(t => {
            const count = t.key === "assigned-tasks" ? (() => {
              try {
                const d = JSON.parse(localStorage.getItem("grc_stage_tasks") || "{}");
                return (Object.values(d) as Record<number, any>[])
                  .flatMap(stages => Object.values(stages))
                  .filter((s: any) => s.implementer?.toLowerCase().trim() === user.name.toLowerCase().trim()).length;
              } catch { return 0; }
            })() : 0;
            return (
              <button key={t.key} onClick={()=>setDetailTab(t.key)}
                style={{ background:"none", border:"none", borderBottom:`2px solid ${detailTab===t.key?NAV:"transparent"}`, padding:"8px 16px", fontSize:12, fontWeight:700, color:detailTab===t.key?NAV:"var(--muted-foreground)", cursor:"pointer", marginBottom:-1, display:"flex", alignItems:"center", gap:5 }}>
                {t.label}
                {t.key==="assigned-tasks" && count > 0 && (
                  <span style={{ fontSize:9, fontWeight:800, background:"rgba(147,197,253,0.15)", color:NAV, borderRadius:4, padding:"1px 6px" }}>{count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Overview */}
        {detailTab==="overview" && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
            <div style={card({ padding:"18px 20px" })}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                <div style={{ fontSize:12, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.06em", textTransform:"uppercase" as const }}>Profile Details</div>
                {isHR && user.type !== "Non-Human" && !editingRank && (
                  <button onClick={()=>{ setRankDraft(localRank); setEditingRank(true); }}
                    style={{ padding:"3px 10px", borderRadius:5, border:"1px solid rgba(196,181,253,0.35)", background:"rgba(196,181,253,0.1)",
                      color:"#A78BFA", fontSize:10, fontWeight:700, cursor:"pointer" }}>✏ Edit Rank</button>
                )}
              </div>
              {[
                ["User ID",     user.id],
                ["Full Name",   user.name],
                ["Email",       user.email],
                ["User Type",   user.type],
                ["Role",        user.role],
                ["Department",  user.department],
                ["Status",      user.status],
                ["Last Login",  user.lastLogin],
              ].map(([k,v])=>(
                <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ fontSize:11, color:"var(--muted-foreground)" }}>{k}</span>
                  <span style={{ fontSize:11, fontWeight:600, color:NAV }}>{v}</span>
                </div>
              ))}

              {/* Rank row */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                <span style={{ fontSize:11, color:"var(--muted-foreground)" }}>Rank</span>
                {editingRank ? (
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <select value={rankDraft} onChange={e=>setRankDraft(e.target.value)}
                      style={{ background:"rgb(14,20,30)", border:"1px solid rgba(196,181,253,0.4)", borderRadius:5,
                        padding:"3px 8px", fontSize:11, color:"#A78BFA", fontWeight:700, outline:"none", cursor:"pointer" }}>
                      <option value="">— Not Set —</option>
                      {RANK_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <button onClick={()=>{ setLocalRank(rankDraft); setEditingRank(false); }}
                      style={{ padding:"3px 10px", borderRadius:5, border:"1px solid rgba(52,211,153,0.4)", background:"rgba(52,211,153,0.12)",
                        color:EME, fontSize:10, fontWeight:700, cursor:"pointer" }}>Save</button>
                    <button onClick={()=>setEditingRank(false)}
                      style={{ padding:"3px 8px", borderRadius:5, border:"1px solid rgba(255,255,255,0.1)", background:"transparent",
                        color:"var(--muted-foreground)", fontSize:10, fontWeight:600, cursor:"pointer" }}>✕</button>
                  </div>
                ) : (
                  <span style={{ fontSize:11, fontWeight:700,
                    color: localRank ? "#A78BFA" : "rgba(148,163,184,0.3)" }}>
                    {localRank || "Not Set"}
                  </span>
                )}
              </div>

              {/* HR note */}
              {isHR && user.type !== "Non-Human" && (
                <div style={{ marginTop:10, fontSize:9, color:"var(--muted-foreground)", display:"flex", alignItems:"center", gap:4 }}>
                  <span>🔒</span> HR field — rank can be manually assigned or overridden here
                </div>
              )}
            </div>
            <div style={card({ padding:"18px 20px" })}>
              <div style={{ fontSize:12, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.06em", textTransform:"uppercase" as const, marginBottom:14 }}>Security & Access</div>
              <div style={{ display:"flex", flexDirection:"column" as const, gap:10 }}>
                {[
                  { label:"MFA Enabled",         value:<MfaBadge on={user.mfaEnabled} /> },
                  { label:"Account Type",         value:<UserTypeBadge type={user.type} /> },
                  { label:"Account Status",       value:<StatusDot status={user.status} /> },
                  { label:"Policy Acknowledgment",value:<AckBar acked={user.policyAck} total={user.totalPolicies} /> },
                  { label:"Risk Level",           value:<span style={{ fontSize:11, fontWeight:700, color:user.mfaEnabled&&ackPct>=80?EME:AMB }}>{user.mfaEnabled&&ackPct>=80?"Low":"Medium"}</span> },
                ].map(r=>(
                  <div key={r.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                    <span style={{ fontSize:11, color:"var(--muted-foreground)" }}>{r.label}</span>
                    {r.value}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Policies tab */}
        {detailTab==="policies" && (
          <div style={card({ overflow:"hidden" })}>
            <div style={{ background:"rgba(30,58,95,0.5)", padding:"12px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ fontSize:12, fontWeight:800, letterSpacing:"0.06em", color:NAV }}>POLICY ASSIGNMENTS</span>
              <button onClick={()=>onAssign?.("policy")} style={{ background:"rgba(59,130,246,0.18)", border:"1px solid rgba(59,130,246,0.35)", borderRadius:6, padding:"4px 12px", fontSize:11, fontWeight:700, color:NAV, cursor:"pointer" }}>+ Assign Policy</button>
            </div>
            <table style={{ width:"100%", borderCollapse:"collapse" as const, fontSize:12 }}>
              <thead>
                <tr style={{ background:"var(--secondary)", borderBottom:"1px solid var(--border)" }}>
                  {["ID","Policy Name","Category","Owner","Version","Status","Impact","Frameworks","Acknowledgment"].map(h=>(
                    <th key={h} style={{ padding:"10px 14px", textAlign:"left" as const, fontSize:10, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.06em", textTransform:"uppercase" as const, whiteSpace:"nowrap" as const }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {policies.map((p,i)=>{
                  const acked = i < user.policyAck;
                  const impColor = p.impact==="Critical"?RED:p.impact==="High"?AMB:p.impact==="Medium"?NAV:EME;
                  const stColor  = p.policyStatus==="active"?EME:p.policyStatus==="in-review"?AMB:p.policyStatus==="draft"?PRP:RED;
                  return (
                    <tr key={p.id} style={{ borderBottom:"1px solid rgba(255,255,255,0.04)", background:i%2===0?"transparent":"rgba(255,255,255,0.01)" }}>
                      <td style={{ padding:"10px 14px", whiteSpace:"nowrap" as const }}>
                        <button onClick={()=>setSelectedPolicy(p)} style={{ background:"none", border:"none", padding:0, cursor:"pointer" }}>
                          <span style={{ fontSize:10, fontFamily:"monospace", color:NAV, background:"rgba(147,197,253,0.1)", border:"1px solid rgba(147,197,253,0.18)", borderRadius:4, padding:"2px 6px", textDecoration:"underline", textDecorationStyle:"dotted" as const }}>{p.id}</span>
                        </button>
                      </td>
                      <td style={{ padding:"10px 14px", minWidth:200 }}>
                        <button onClick={()=>setSelectedPolicy(p)} style={{ background:"none", border:"none", padding:0, cursor:"pointer", textAlign:"left" as const }}>
                          <div style={{ fontSize:12, fontWeight:700, color:NAV, textDecoration:"underline", textDecorationStyle:"dotted" as const }}>{p.name}</div>
                        </button>
                      </td>
                      <td style={{ padding:"10px 14px" }}><Badge label={p.category} /></td>
                      <td style={{ padding:"10px 14px", fontSize:11, color:"var(--muted-foreground)", whiteSpace:"nowrap" as const }}>{p.owner}</td>
                      <td style={{ padding:"10px 14px" }}>
                        <span style={{ fontSize:10, fontFamily:"monospace", color:NAV, background:"rgba(147,197,253,0.08)", border:"1px solid rgba(147,197,253,0.18)", borderRadius:4, padding:"2px 6px" }}>v{p.version}</span>
                      </td>
                      <td style={{ padding:"10px 14px" }}>
                        <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:4, background:`${stColor}22`, color:stColor, textTransform:"capitalize" as const }}>{p.policyStatus}</span>
                      </td>
                      <td style={{ padding:"10px 14px" }}>
                        <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:4, background:`${impColor}22`, color:impColor }}>{p.impact}</span>
                      </td>
                      <td style={{ padding:"10px 14px", maxWidth:200 }}>
                        <div style={{ display:"flex", flexWrap:"wrap" as const, gap:4 }}>
                          {p.frameworks.slice(0,2).map(fw=>(
                            <span key={fw} style={{ fontSize:9, padding:"1px 5px", borderRadius:3, background:"rgba(196,181,253,0.12)", color:PRP, border:"1px solid rgba(196,181,253,0.2)", whiteSpace:"nowrap" as const }}>{fw}</span>
                          ))}
                          {p.frameworks.length > 2 && <span style={{ fontSize:9, color:"var(--muted-foreground)" }}>+{p.frameworks.length-2}</span>}
                        </div>
                      </td>
                      <td style={{ padding:"10px 14px" }}>
                        <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:4,
                          background:acked?"rgba(52,211,153,0.15)":"rgba(252,211,77,0.15)",
                          color:acked?EME:AMB }}>
                          {acked?"✓ Acknowledged":"Pending"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Training tab */}
        {detailTab==="training" && (
          <div style={card({ overflow:"hidden" })}>
            <div style={{ background:"rgba(30,58,95,0.5)", padding:"12px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ fontSize:12, fontWeight:800, letterSpacing:"0.06em", color:NAV }}>TRAINING RECORDS — {user.name}</span>
              <button onClick={()=>onAssign?.("training")} style={{ background:"rgba(59,130,246,0.18)", border:"1px solid rgba(59,130,246,0.35)", borderRadius:6, padding:"4px 12px", fontSize:11, fontWeight:700, color:NAV, cursor:"pointer" }}>+ Assign Training</button>
            </div>
            <table style={{ width:"100%", borderCollapse:"collapse" as const, fontSize:12 }}>
              <thead>
                <tr style={{ background:"var(--secondary)", borderBottom:"1px solid var(--border)" }}>
                  {["ID","Course Title","Category","Format","Duration","Mandatory","Status"].map(h=>(
                    <th key={h} style={{ padding:"10px 14px", textAlign:"left" as const, fontSize:10, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.06em", textTransform:"uppercase" as const }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trainRecords.map((r,i)=>(
                  <tr key={r.training.id} style={{ borderBottom:"1px solid rgba(255,255,255,0.04)", background:i%2===0?"transparent":"rgba(255,255,255,0.01)" }}>
                    <td style={{ padding:"10px 14px", whiteSpace:"nowrap" as const }}>
                      <button onClick={()=>setSelectedTraining(r.training)} style={{ background:"none", border:"none", padding:0, cursor:"pointer" }}>
                        <span style={{ fontSize:10, fontFamily:"monospace", color:NAV, background:"rgba(147,197,253,0.1)", border:"1px solid rgba(147,197,253,0.18)", borderRadius:4, padding:"2px 6px", textDecoration:"underline", textDecorationStyle:"dotted" as const }}>{r.training.id}</span>
                      </button>
                    </td>
                    <td style={{ padding:"10px 14px", minWidth:220 }}>
                      <button onClick={()=>setSelectedTraining(r.training)} style={{ background:"none", border:"none", padding:0, cursor:"pointer", textAlign:"left" as const }}>
                        <div style={{ fontSize:12, fontWeight:700, color:NAV, textDecoration:"underline", textDecorationStyle:"dotted" as const }}>{r.training.title}</div>
                      </button>
                    </td>
                    <td style={{ padding:"10px 14px" }}><Badge label={r.training.category} /></td>
                    <td style={{ padding:"10px 14px", fontSize:11, color:"var(--muted-foreground)" }}>{r.training.format}</td>
                    <td style={{ padding:"10px 14px", fontSize:11, color:"var(--muted-foreground)" }}>{r.training.duration}</td>
                    <td style={{ padding:"10px 14px" }}>
                      <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:4,
                        background:r.training.mandatory?"rgba(248,113,113,0.12)":"var(--border)",
                        color:r.training.mandatory?RED:"var(--muted-foreground)" }}>
                        {r.training.mandatory?"Required":"Optional"}
                      </span>
                    </td>
                    <td style={{ padding:"10px 14px" }}><TrainStatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Assigned Tasks tab */}
        {detailTab==="assigned-tasks" && (() => {
          type StageTaskEntry = { auditId:string; auditName:string; stageN:number; stageLabel:string; stageIcon:string; stageOutput:string; status:string; implementer:string; notes:string; evidences:Array<{name:string;size:string;date:string}>; };
          let myTasks: StageTaskEntry[] = [];
          try {
            const d = JSON.parse(localStorage.getItem("grc_stage_tasks") || "{}");
            myTasks = (Object.values(d) as Record<number, StageTaskEntry>[])
              .flatMap(stages => Object.values(stages))
              .filter(s => s.implementer?.toLowerCase().trim() === user.name.toLowerCase().trim());
          } catch {}
          const stColor = (s:string) => s==="completed"?"#10B981":s==="in-progress"?"#60A5FA":"#94A3B8";
          const stBg    = (s:string) => s==="completed"?"rgba(16,185,129,0.1)":s==="in-progress"?"rgba(96,165,250,0.1)":"rgba(148,163,184,0.06)";
          const stLabel = (s:string) => s==="completed"?"✅ Completed":s==="in-progress"?"🔵 In Progress":"⬜ Not Started";
          return (
            <div style={{ display:"flex", flexDirection:"column" as const, gap:12 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <div style={{ fontSize:12, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.06em", textTransform:"uppercase" as const }}>
                  Audit Stage Assignments — {user.name}
                </div>
                <span style={{ fontSize:11, color:"var(--muted-foreground)" }}>{myTasks.length} task{myTasks.length!==1?"s":""} assigned</span>
              </div>

              {myTasks.length === 0 ? (
                <div style={{ ...card({ padding:"32px 24px" }), textAlign:"center" as const }}>
                  <div style={{ fontSize:28, marginBottom:10 }}>🗂</div>
                  <div style={{ fontSize:13, fontWeight:700, color:"var(--foreground)", marginBottom:6 }}>No Assigned Tasks</div>
                  <div style={{ fontSize:11, color:"var(--muted-foreground)" }}>
                    When {user.name} is assigned as an implementer on an audit workflow stage, those tasks will appear here.
                  </div>
                </div>
              ) : (
                myTasks.map((task, i) => (
                  <div key={i} style={{ ...card({ padding:"16px 20px" }), display:"flex", flexDirection:"column" as const, gap:12 }}>
                    <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ width:36, height:36, borderRadius:10, background:"rgba(147,197,253,0.08)", border:"1px solid rgba(147,197,253,0.18)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>{task.stageIcon}</div>
                        <div>
                          <div style={{ fontSize:12, fontWeight:800, color:"var(--foreground)" }}>Stage {task.stageN}: {task.stageLabel}</div>
                          <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:2 }}>Deliverable → {task.stageOutput}</div>
                        </div>
                      </div>
                      <span style={{ fontSize:10, fontWeight:700, padding:"3px 10px", borderRadius:5, background:stBg(task.status), border:`1px solid ${stColor(task.status)}44`, color:stColor(task.status), whiteSpace:"nowrap" as const, flexShrink:0 }}>
                        {stLabel(task.status)}
                      </span>
                    </div>

                    <div style={{ display:"flex", gap:16, fontSize:11, paddingLeft:46 }}>
                      <div>
                        <span style={{ color:"var(--muted-foreground)" }}>Audit: </span>
                        <span style={{ color:NAV, fontWeight:600 }}>{task.auditName || task.auditId}</span>
                      </div>
                      <div>
                        <span style={{ color:"var(--muted-foreground)" }}>Audit ID: </span>
                        <span style={{ fontFamily:"monospace", fontSize:10, color:"var(--muted-foreground)" }}>{task.auditId}</span>
                      </div>
                      {(task.evidences ?? []).length > 0 && (
                        <div>
                          <span style={{ color:"var(--muted-foreground)" }}>Evidence: </span>
                          <span style={{ color:"#10B981", fontWeight:600 }}>{task.evidences.length} file{task.evidences.length!==1?"s":""}</span>
                        </div>
                      )}
                    </div>

                    {task.notes && (
                      <div style={{ paddingLeft:46, fontSize:11, color:"var(--muted-foreground)", background:"rgba(255,255,255,0.02)", borderRadius:6, padding:"8px 12px", marginLeft:34, borderLeft:"2px solid rgba(147,197,253,0.2)" }}>
                        {task.notes}
                      </div>
                    )}

                    {(task.evidences ?? []).length > 0 && (
                      <div style={{ paddingLeft:46, display:"flex", flexWrap:"wrap" as const, gap:6 }}>
                        {task.evidences.map((ev, ei) => (
                          <div key={ei} style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 10px", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:6, fontSize:10 }}>
                            <span>📄</span>
                            <span style={{ color:"var(--foreground)", fontWeight:600 }}>{ev.name}</span>
                            <span style={{ color:"var(--muted-foreground)" }}>{ev.size}</span>
                            <span style={{ color:"var(--muted-foreground)", fontFamily:"monospace" }}>{ev.date}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          );
        })()}

        {/* Activity log */}
        {detailTab==="activity" && (
          <div style={card({ padding:"18px 20px" })}>
            <div style={{ fontSize:12, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.06em", textTransform:"uppercase" as const, marginBottom:16 }}>Recent Activity</div>
            <div style={{ display:"flex", flexDirection:"column" as const, gap:0 }}>
              {activityLog.map((a,i)=>(
                <div key={i} style={{ display:"flex", gap:14, alignItems:"flex-start", padding:"10px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                  <div style={{ width:32, height:32, borderRadius:8, background:"var(--secondary)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, flexShrink:0 }}>{a.icon}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, fontWeight:600, color:"rgba(255,255,255,0.85)" }}>{a.event}</div>
                    <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:2 }}>{a.ts}</div>
                  </div>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:a.color, marginTop:5, flexShrink:0 }} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Policy detail drawer — fixed position, inside outer div is fine */}
      {selectedPolicy && (
        <PolicyDetailModal
          policy={selectedPolicy}
          users={[user, ...USERS.filter(u=>u.id!==user.id)]}
          onClose={()=>setSelectedPolicy(null)}
        />
      )}

      {/* Training detail drawer — fixed position, inside outer div is fine */}
      {selectedTraining && (
        <TrainingDetailModal
          training={selectedTraining}
          users={[user, ...USERS.filter(u=>u.id!==user.id)]}
          onClose={()=>setSelectedTraining(null)}
        />
      )}
    </div>
  );
}

// ── Assign Modal ─────────────────────────────────────────────────────────────
type TargetMode = "all" | "department" | "rank" | "selective";

function AssignModal({ mode, users, onClose, policies = POLICIES, trainings = TRAININGS }: {
  mode: "policy" | "training"; users: PeopleUser[]; onClose: ()=>void; policies?: typeof POLICIES; trainings?: typeof TRAININGS;
}) {
  const humanUsers = users.filter(u => u.type !== "Non-Human" && u.status === "active");
  const departments = Array.from(new Set(humanUsers.map(u => u.department))).sort();
  const usedRanks   = Array.from(new Set(humanUsers.map(u => u.rank ?? "Not Set")));
  const ranksOrdered = [...RANK_OPTIONS.filter(r => usedRanks.includes(r)), ...usedRanks.filter(r => !RANK_OPTIONS.includes(r as Rank))];

  const [targetMode, setTargetMode] = useState<TargetMode>("all");
  const [selDepts,   setSelDepts]   = useState<Set<string>>(new Set());
  const [selRanks,   setSelRanks]   = useState<Set<string>>(new Set());
  const [selUsers,   setSelUsers]   = useState<Set<string>>(new Set());
  const [userSearch, setUserSearch] = useState("");
  const [selected,   setSelected]   = useState<Set<string>>(new Set());

  const targetUsers = useMemo(() => {
    if (targetMode === "all")        return humanUsers;
    if (targetMode === "department") return selDepts.size===0 ? humanUsers : humanUsers.filter(u => selDepts.has(u.department));
    if (targetMode === "rank")       return selRanks.size===0 ? humanUsers : humanUsers.filter(u => selRanks.has(u.rank ?? "Not Set"));
    return humanUsers.filter(u => selUsers.has(u.id));
  }, [targetMode, selDepts, selRanks, selUsers]);

  const filteredSearch = humanUsers.filter(u => {
    const q = userSearch.toLowerCase();
    return !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.department.toLowerCase().includes(q) || (u.rank??"").toLowerCase().includes(q);
  });

  const items = mode==="policy"
    ? policies.map(p  => ({ id:p.id,  title:p.name,  sub:p.category,  badge:p.dueDate }))
    : trainings.map(t => ({ id:t.id,  title:t.title, sub:t.category,  badge:t.duration }));

  const toggle     = (id:string) => setSelected(prev=>{ const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n; });
  const toggleDept = (d:string)  => setSelDepts(prev=>{ const n=new Set(prev); n.has(d)?n.delete(d):n.add(d); return n; });
  const toggleRank = (r:string)  => setSelRanks(prev=>{ const n=new Set(prev); n.has(r)?n.delete(r):n.add(r); return n; });
  const toggleUser = (id:string) => setSelUsers(prev=>{ const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n; });

  const MODES: { id:TargetMode; label:string; icon:string; desc:string }[] = [
    { id:"all",        label:"All Active",   icon:"👥", desc:`${humanUsers.length} users`   },
    { id:"department", label:"Department",   icon:"🏢", desc:"Pick department(s)"            },
    { id:"rank",       label:"By Rank",      icon:"⭐", desc:"Pick rank level(s)"            },
    { id:"selective",  label:"Selective",    icon:"🔍", desc:"Hand-pick individuals"         },
  ];

  const canAssign = selected.size > 0 && (targetMode !== "selective" ? true : selUsers.size > 0);

  return (
    <div style={{ position:"fixed" as const, inset:0, background:"rgba(0,0,0,0.78)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9999 }}
         onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div style={{ background:"rgb(14,20,30)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:14, width:620, maxHeight:"88vh",
        display:"flex", flexDirection:"column" as const, overflow:"hidden", boxShadow:"0 28px 80px rgba(0,0,0,0.85)" }}>

        {/* Header */}
        <div style={{ padding:"18px 22px 14px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:"white" }}>Assign {mode==="policy"?"Policy":"Training"}</div>
            <div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:3 }}>
              {targetMode==="selective" && selUsers.size===0
                ? <span>No users selected yet</span>
                : <span>Assigning to <strong style={{ color:targetUsers.length===humanUsers.length?NAV:AMB }}>
                    {targetUsers.length} user{targetUsers.length!==1?"s":""}
                  </strong> · {mode==="policy"?"Policies":"Courses"}: <strong style={{ color:PRP }}>{selected.size} selected</strong>
                  </span>
              }
            </div>
          </div>
          <button onClick={onClose} style={{ background:"var(--border)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:6, width:28, height:28, cursor:"pointer", color:"var(--muted-foreground)", fontSize:14 }}>✕</button>
        </div>

        <div style={{ flex:1, overflow:"auto" }}>
          {/* ── Step 1: Target Audience ── */}
          <div style={{ padding:"16px 22px 14px", borderBottom:"1px solid var(--border)" }}>
            <div style={{ fontSize:10, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.08em", textTransform:"uppercase" as const, marginBottom:10 }}>
              1 · Select Target Audience
            </div>

            {/* Mode tiles */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:7, marginBottom:12 }}>
              {MODES.map(m => (
                <button key={m.id} onClick={()=>setTargetMode(m.id)}
                  style={{ display:"flex", flexDirection:"column" as const, alignItems:"center", gap:3, padding:"10px 6px", borderRadius:9, cursor:"pointer", fontFamily:"inherit",
                    border:`1px solid ${targetMode===m.id ? NAV+"60" : "rgba(255,255,255,0.09)"}`,
                    background: targetMode===m.id ? "rgba(147,197,253,0.1)" : "var(--secondary)" }}>
                  <span style={{ fontSize:20 }}>{m.icon}</span>
                  <span style={{ fontSize:10, fontWeight:700, color: targetMode===m.id ? NAV : "rgba(148,163,184,0.75)" }}>{m.label}</span>
                  <span style={{ fontSize:9, color:"rgba(148,163,184,0.38)", textAlign:"center" as const }}>{m.desc}</span>
                </button>
              ))}
            </div>

            {/* Department picker */}
            {targetMode === "department" && (
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" as const }}>
                {departments.map(d => {
                  const cnt = humanUsers.filter(u=>u.department===d).length;
                  return (
                    <button key={d} onClick={()=>toggleDept(d)}
                      style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 11px", borderRadius:20, cursor:"pointer", fontFamily:"inherit",
                        border:`1px solid ${selDepts.has(d) ? AMB+"70" : "rgba(255,255,255,0.1)"}`,
                        background: selDepts.has(d) ? "rgba(252,211,77,0.12)" : "var(--secondary)",
                        color: selDepts.has(d) ? AMB : "var(--muted-foreground)", fontSize:11, fontWeight:selDepts.has(d)?700:500 }}>
                      🏢 {d} <span style={{ opacity:0.55 }}>({cnt})</span>
                      {selDepts.has(d) && <span style={{ color:AMB }}>✓</span>}
                    </button>
                  );
                })}
                {selDepts.size===0 && <span style={{ fontSize:10, color:"rgba(148,163,184,0.38)", alignSelf:"center" }}>Select departments — leave empty for all</span>}
                {selDepts.size>0 && <span style={{ fontSize:10, color:AMB, alignSelf:"center", fontWeight:700 }}>{targetUsers.length} users</span>}
              </div>
            )}

            {/* Rank picker */}
            {targetMode === "rank" && (
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" as const }}>
                {ranksOrdered.map(r => {
                  const cnt = humanUsers.filter(u=>(u.rank??"Not Set")===r).length;
                  return (
                    <button key={r} onClick={()=>toggleRank(r)}
                      style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 11px", borderRadius:20, cursor:"pointer", fontFamily:"inherit",
                        border:`1px solid ${selRanks.has(r) ? PRP+"70" : "rgba(255,255,255,0.1)"}`,
                        background: selRanks.has(r) ? "rgba(196,181,253,0.12)" : "var(--secondary)",
                        color: selRanks.has(r) ? PRP : "var(--muted-foreground)", fontSize:11, fontWeight:selRanks.has(r)?700:500 }}>
                      ⭐ {r} <span style={{ opacity:0.55 }}>({cnt})</span>
                      {selRanks.has(r) && <span style={{ color:PRP }}>✓</span>}
                    </button>
                  );
                })}
                {selRanks.size===0 && <span style={{ fontSize:10, color:"rgba(148,163,184,0.38)", alignSelf:"center" }}>Select rank levels</span>}
                {selRanks.size>0 && <span style={{ fontSize:10, color:PRP, alignSelf:"center", fontWeight:700 }}>{targetUsers.length} users</span>}
              </div>
            )}

            {/* Selective picker */}
            {targetMode === "selective" && (
              <div>
                <input value={userSearch} onChange={e=>setUserSearch(e.target.value)}
                  placeholder="Search by name, email, department or rank…"
                  style={{ width:"100%", background:"var(--secondary)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:7,
                    padding:"7px 12px", fontSize:11, color:"white", outline:"none", fontFamily:"inherit", boxSizing:"border-box" as const, marginBottom:8 }} />
                <div style={{ maxHeight:160, overflowY:"auto" as const, display:"flex", flexDirection:"column" as const, gap:3 }}>
                  {filteredSearch.map(u => (
                    <div key={u.id} onClick={()=>toggleUser(u.id)}
                      style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 10px", borderRadius:7, cursor:"pointer",
                        border:`1px solid ${selUsers.has(u.id) ? NAV+"50" : "var(--border)"}`,
                        background: selUsers.has(u.id) ? "rgba(147,197,253,0.1)" : "var(--secondary)" }}>
                      <input type="checkbox" checked={selUsers.has(u.id)} readOnly
                        style={{ accentColor:NAV, width:13, height:13, flexShrink:0, pointerEvents:"none" }} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.9)" }}>{u.name}</div>
                        <div style={{ fontSize:9, color:"var(--muted-foreground)" }}>{u.department} · {u.rank ?? "No rank"}</div>
                      </div>
                      <span style={{ fontSize:9, color:"var(--muted-foreground)", whiteSpace:"nowrap" as const }}>{u.role}</span>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:6 }}>
                  {selUsers.size>0
                    ? <span><strong style={{ color:NAV }}>{selUsers.size}</strong> user{selUsers.size!==1?"s":""} selected</span>
                    : "No users selected yet"
                  }
                </div>
              </div>
            )}

            {/* Summary */}
            {targetMode !== "selective" && (
              <div style={{ marginTop:10, fontSize:11, color:"var(--muted-foreground)" }}>
                <strong style={{ color:NAV }}>{targetUsers.length}</strong> user{targetUsers.length!==1?"s":""} will receive this assignment
              </div>
            )}
          </div>

          {/* ── Step 2: Select items ── */}
          <div style={{ padding:"16px 22px" }}>
            <div style={{ fontSize:10, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.08em", textTransform:"uppercase" as const, marginBottom:10 }}>
              2 · Select {mode==="policy"?"Policies":"Courses"} to Assign
            </div>
            <div style={{ display:"flex", flexDirection:"column" as const, gap:4 }}>
              {items.map(item => (
                <div key={item.id} onClick={()=>toggle(item.id)}
                  style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 12px", borderRadius:8, cursor:"pointer",
                    border:`1px solid ${selected.has(item.id) ? "rgba(59,130,246,0.5)" : "var(--border)"}`,
                    background: selected.has(item.id) ? "rgba(59,130,246,0.1)" : "var(--secondary)" }}>
                  <input type="checkbox" checked={selected.has(item.id)} readOnly
                    style={{ accentColor:NAV, width:14, height:14, flexShrink:0, pointerEvents:"none" }} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:"rgba(255,255,255,0.9)" }}>{item.title}</div>
                    <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:2 }}>{item.sub}</div>
                  </div>
                  <span style={{ fontSize:10, color:"var(--muted-foreground)", background:"var(--border)", borderRadius:4, padding:"2px 7px", whiteSpace:"nowrap" as const }}>{item.badge}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding:"14px 22px", borderTop:"1px solid var(--border)", display:"flex", gap:10, justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ fontSize:11, color:"var(--muted-foreground)" }}>
            {selected.size>0 && targetUsers.length>0 &&
              <span>{selected.size} item{selected.size>1?"s":""} → <strong style={{ color:NAV }}>{targetMode==="selective"?selUsers.size:targetUsers.length}</strong> user{targetUsers.length!==1?"s":""}</span>
            }
          </div>
          <div style={{ display:"flex", gap:10 }}>
            <button onClick={onClose} style={{ padding:"7px 16px", borderRadius:7, border:"1px solid rgba(255,255,255,0.12)", background:"transparent", color:"var(--muted-foreground)", fontSize:12, fontWeight:600, cursor:"pointer" }}>Cancel</button>
            <button onClick={onClose} disabled={!canAssign}
              style={{ padding:"7px 20px", borderRadius:7,
                border:`1px solid ${canAssign?"rgba(59,130,246,0.5)":"rgba(148,163,184,0.2)"}`,
                background: canAssign?"rgba(59,130,246,0.2)":"var(--secondary)",
                color: canAssign?NAV:"var(--muted-foreground)",
                fontSize:12, fontWeight:800, cursor:canAssign?"pointer":"not-allowed", opacity:canAssign?1:0.6 }}>
              Assign {selected.size>0?`${selected.size} item${selected.size>1?"s":""}`:""} →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Policy Detail Drawer ──────────────────────────────────────────────────────
function PolicyDetailModal({ policy, users, onClose }: { policy: Policy; users: PeopleUser[]; onClose: ()=>void }) {
  const sc = policy.ackRate===100?EME:policy.ackRate>=70?AMB:RED;
  const sl = policy.ackRate===100?"Complete":policy.ackRate>=70?"In Progress":"Overdue";
  const impColor = policy.impact==="Critical"?RED:policy.impact==="High"?AMB:policy.impact==="Medium"?NAV:EME;
  const stColor  = policy.policyStatus==="active"?EME:policy.policyStatus==="in-review"?AMB:policy.policyStatus==="draft"?PRP:RED;
  const humanUsers = users.filter(u=>u.type!=="Non-Human"&&u.status==="active");
  const versionNum = parseFloat(policy.version)||1.0;
  const versionHistory = [
    { version:`v${policy.version}`,                           date:"2026-05-15", author:policy.owner, note:"Current version — minor clarifications",              current:true  },
    { version:`v${Math.max(1,versionNum-0.1).toFixed(1)}`,   date:"2026-02-01", author:policy.owner, note:"Updated to reflect new regulatory requirements",      current:false },
    { version:"v1.0",                                         date:"2025-09-01", author:policy.owner, note:"Initial policy release",                              current:false },
  ];

  return (
    <div style={{ position:"fixed" as const, inset:0, background:"rgba(0,0,0,0.65)", zIndex:9998, display:"flex", justifyContent:"flex-end" }}
         onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div style={{ width:520, maxWidth:"90vw", height:"100%", background:"rgb(10,14,22)", borderLeft:"1px solid rgba(255,255,255,0.1)",
        display:"flex", flexDirection:"column" as const, boxShadow:"-24px 0 80px rgba(0,0,0,0.85)", overflowY:"hidden" as const }}>

        {/* Header */}
        <div style={{ padding:"20px 24px 16px", borderBottom:"1px solid var(--border)", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:12 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" as const }}>
              <span style={{ fontSize:10, fontFamily:"monospace", color:NAV, background:"rgba(147,197,253,0.12)", border:"1px solid rgba(147,197,253,0.25)", borderRadius:5, padding:"3px 8px", fontWeight:800 }}>{policy.id}</span>
              <span style={{ fontSize:10, fontWeight:800, padding:"2px 8px", borderRadius:4, background:`${stColor}22`, color:stColor, textTransform:"capitalize" as const }}>{policy.policyStatus}</span>
              <span style={{ fontSize:10, fontWeight:800, padding:"2px 8px", borderRadius:4, background:`${impColor}22`, color:impColor }}>{policy.impact}</span>
            </div>
            <button onClick={onClose} style={{ background:"var(--border)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:6, width:28, height:28, cursor:"pointer", color:"var(--muted-foreground)", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>✕</button>
          </div>
          <div style={{ fontSize:18, fontWeight:800, color:"white", lineHeight:1.3, marginBottom:8 }}>{policy.name}</div>
          <div style={{ display:"flex", gap:14, fontSize:11, color:"var(--muted-foreground)", flexWrap:"wrap" as const }}>
            <span>👤 {policy.owner}</span>
            <span>📂 {policy.category}</span>
            <span>📋 v{policy.version}</span>
            <span>📅 Due {policy.dueDate}</span>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:"auto" as const, padding:"20px 24px", display:"flex", flexDirection:"column" as const, gap:20 }}>

          {/* Acknowledgment progress */}
          <div style={{ ...card({ padding:"16px 18px" }) }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
              <span style={{ fontSize:11, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.06em", textTransform:"uppercase" as const }}>Acknowledgment Status</span>
              <span style={{ fontSize:12, fontWeight:800, color:sc }}>{policy.ackRate}%</span>
            </div>
            <div style={{ height:8, borderRadius:4, background:"rgba(255,255,255,0.08)", overflow:"hidden", marginBottom:8 }}>
              <div style={{ width:`${policy.ackRate}%`, height:"100%", background:sc, borderRadius:4 }} />
            </div>
            <div style={{ display:"flex", gap:16, fontSize:11, flexWrap:"wrap" as const }}>
              <span style={{ color:EME }}>✓ Acknowledged: <strong>{policy.acked}</strong></span>
              <span style={{ color:RED }}>⏳ Pending: <strong>{policy.total - policy.acked}</strong></span>
              <span style={{ color:sc, marginLeft:"auto", fontWeight:800 }}>{sl}</span>
            </div>
          </div>

          {/* Frameworks */}
          <div>
            <div style={{ fontSize:10, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.06em", textTransform:"uppercase" as const, marginBottom:8 }}>Mapped Frameworks</div>
            <div style={{ display:"flex", flexWrap:"wrap" as const, gap:6 }}>
              {policy.frameworks.map(fw=>(
                <span key={fw} style={{ fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:5, background:"rgba(196,181,253,0.12)", color:PRP, border:"1px solid rgba(196,181,253,0.22)" }}>{fw}</span>
              ))}
              {policy.frameworks.length===0 && <span style={{ fontSize:11, color:"var(--muted-foreground)" }}>No frameworks mapped</span>}
            </div>
          </div>

          {/* Policy scope */}
          <div>
            <div style={{ fontSize:10, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.06em", textTransform:"uppercase" as const, marginBottom:8 }}>Policy Scope</div>
            <div style={{ ...card({ padding:"14px 16px" }), fontSize:12, color:"rgba(255,255,255,0.75)", lineHeight:1.6 }}>
              This policy establishes the requirements and responsibilities for <strong style={{ color:"rgba(255,255,255,0.9)" }}>{policy.name}</strong>. It applies to all {policy.category.toLowerCase()}-related activities within the organisation and must be acknowledged by all relevant personnel. Violations must be reported immediately to the policy owner.
            </div>
          </div>

          {/* User acknowledgment list */}
          <div>
            <div style={{ fontSize:10, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.06em", textTransform:"uppercase" as const, marginBottom:8 }}>User Acknowledgments</div>
            <div style={{ display:"flex", flexDirection:"column" as const, gap:3, maxHeight:200, overflowY:"auto" as const, paddingRight:2 }}>
              {humanUsers.slice(0,10).map((u,i)=>{
                const acked = i < policy.acked;
                const initials = u.name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
                return (
                  <div key={u.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 10px", borderRadius:7,
                    background:acked?"rgba(52,211,153,0.05)":"rgba(248,113,113,0.04)",
                    border:`1px solid ${acked?"rgba(52,211,153,0.15)":"rgba(248,113,113,0.12)"}` }}>
                    <div style={{ width:28, height:28, borderRadius:7, background:"var(--secondary)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, color:NAV, flexShrink:0 }}>{initials}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.85)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{u.name}</div>
                      <div style={{ fontSize:9, color:"var(--muted-foreground)" }}>{u.department} · {u.role}</div>
                    </div>
                    <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:4,
                      background:acked?"rgba(52,211,153,0.15)":"rgba(248,113,113,0.12)", color:acked?EME:RED, flexShrink:0 }}>
                      {acked?"✓ Acked":"Pending"}
                    </span>
                  </div>
                );
              })}
              {humanUsers.length>10 && (
                <div style={{ fontSize:10, color:"var(--muted-foreground)", textAlign:"center" as const, padding:"6px 0" }}>
                  +{humanUsers.length-10} more users
                </div>
              )}
            </div>
          </div>

          {/* Version history */}
          <div>
            <div style={{ fontSize:10, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.06em", textTransform:"uppercase" as const, marginBottom:8 }}>Version History</div>
            <div style={{ display:"flex", flexDirection:"column" as const, gap:4 }}>
              {versionHistory.map((v,i)=>(
                <div key={v.version} style={{ display:"flex", gap:10, padding:"8px 12px", borderRadius:7, background:"var(--secondary)", border:"1px solid var(--border)", alignItems:"flex-start" }}>
                  <span style={{ fontSize:10, fontFamily:"monospace", color:i===0?NAV:"var(--muted-foreground)", fontWeight:700,
                    background:i===0?"rgba(147,197,253,0.1)":"transparent",
                    padding:"1px 5px", borderRadius:3, border:`1px solid ${i===0?"rgba(147,197,253,0.2)":"transparent"}`, flexShrink:0, marginTop:1 }}>{v.version}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:10, color:"rgba(255,255,255,0.8)", marginBottom:2 }}>{v.note}</div>
                    <div style={{ fontSize:9, color:"var(--muted-foreground)" }}>{v.date} · {v.author}</div>
                  </div>
                  {v.current && <span style={{ fontSize:9, fontWeight:800, color:EME, background:"rgba(52,211,153,0.12)", borderRadius:4, padding:"1px 6px", flexShrink:0 }}>CURRENT</span>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding:"14px 24px", borderTop:"1px solid var(--border)", display:"flex", gap:8, flexShrink:0 }}>
          <button style={{ flex:1, padding:"8px", borderRadius:7, border:`1px solid ${RED}44`, background:`${RED}12`, color:RED, fontSize:11, fontWeight:700, cursor:"pointer" }}>📣 Send Reminder</button>
          <button style={{ flex:1, padding:"8px", borderRadius:7, border:`1px solid ${NAV}44`, background:`${NAV}12`, color:NAV, fontSize:11, fontWeight:700, cursor:"pointer" }}>⬇ Export Report</button>
          <button onClick={onClose} style={{ padding:"8px 16px", borderRadius:7, border:"1px solid rgba(255,255,255,0.12)", background:"transparent", color:"var(--muted-foreground)", fontSize:11, fontWeight:600, cursor:"pointer" }}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Training Detail Drawer ─────────────────────────────────────────────────────
function TrainingDetailModal({ training, users, onClose }: { training: Training; users: PeopleUser[]; onClose: ()=>void }) {
  const color = training.completionRate>=80?EME:training.completionRate>=60?AMB:RED;
  const fmtIcon: Record<TrainFmt,string> = { Video:"🎬", Quiz:"📝", Interactive:"🖥", Document:"📄" };
  const humanUsers = users.filter(u=>u.type!=="Non-Human"&&u.status==="active");

  const completed   = Math.min(humanUsers.length, Math.round(humanUsers.length * training.completionRate/100));
  const inProgress  = Math.min(humanUsers.length - completed, Math.round(humanUsers.length * 0.1));
  const overdueN    = Math.min(humanUsers.length - completed - inProgress, Math.max(0, Math.round(humanUsers.length*(100-training.completionRate-10)/100*0.2)));
  const notStarted  = Math.max(0, humanUsers.length - completed - inProgress - overdueN);

  return (
    <div style={{ position:"fixed" as const, inset:0, background:"rgba(0,0,0,0.65)", zIndex:9998, display:"flex", justifyContent:"flex-end" }}
         onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div style={{ width:520, maxWidth:"90vw", height:"100%", background:"rgb(10,14,22)", borderLeft:"1px solid rgba(255,255,255,0.1)",
        display:"flex", flexDirection:"column" as const, boxShadow:"-24px 0 80px rgba(0,0,0,0.85)" }}>

        {/* Header */}
        <div style={{ padding:"20px 24px 16px", borderBottom:"1px solid var(--border)", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:12 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" as const }}>
              <span style={{ fontSize:10, fontFamily:"monospace", color:NAV, background:"rgba(147,197,253,0.12)", border:"1px solid rgba(147,197,253,0.25)", borderRadius:5, padding:"3px 8px", fontWeight:800 }}>{training.id}</span>
              {training.mandatory && <span style={{ fontSize:9, fontWeight:800, color:RED, background:"rgba(248,113,113,0.12)", border:"1px solid rgba(248,113,113,0.25)", borderRadius:4, padding:"2px 7px" }}>MANDATORY</span>}
              <span style={{ fontSize:20 }}>{fmtIcon[training.format]}</span>
            </div>
            <button onClick={onClose} style={{ background:"var(--border)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:6, width:28, height:28, cursor:"pointer", color:"var(--muted-foreground)", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>✕</button>
          </div>
          <div style={{ fontSize:18, fontWeight:800, color:"white", lineHeight:1.3, marginBottom:8 }}>{training.title}</div>
          <div style={{ display:"flex", gap:14, fontSize:11, color:"var(--muted-foreground)", flexWrap:"wrap" as const }}>
            <span>📂 {training.category}</span>
            <span>📋 {training.format}</span>
            <span>⏱ {training.duration}</span>
            <span>📅 Due {training.dueDate}</span>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:"auto" as const, padding:"20px 24px", display:"flex", flexDirection:"column" as const, gap:20 }}>

          {/* Completion */}
          <div style={{ ...card({ padding:"16px 18px" }) }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
              <span style={{ fontSize:11, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.06em", textTransform:"uppercase" as const }}>Completion Rate</span>
              <span style={{ fontSize:12, fontWeight:800, color }}>{training.completionRate}%</span>
            </div>
            <div style={{ height:8, borderRadius:4, background:"rgba(255,255,255,0.08)", overflow:"hidden", marginBottom:10 }}>
              <div style={{ width:`${training.completionRate}%`, height:"100%", background:color, borderRadius:4 }} />
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
              {[
                { label:"Completed",   value:completed,  color:EME },
                { label:"In Progress", value:inProgress, color:AMB },
                { label:"Overdue",     value:overdueN,   color:RED },
                { label:"Not Started", value:notStarted, color:"rgba(148,163,184,0.6)" },
              ].map(s=>(
                <div key={s.label} style={{ textAlign:"center" as const, padding:"8px 4px", borderRadius:7, background:"var(--secondary)" }}>
                  <div style={{ fontSize:16, fontWeight:800, color:s.color }}>{s.value}</div>
                  <div style={{ fontSize:9, color:"var(--muted-foreground)", marginTop:2, lineHeight:1.2 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <div style={{ fontSize:10, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.06em", textTransform:"uppercase" as const, marginBottom:8 }}>Course Description</div>
            <div style={{ ...card({ padding:"14px 16px" }), fontSize:12, color:"rgba(255,255,255,0.75)", lineHeight:1.6 }}>{training.description}</div>
          </div>

          {/* Course details */}
          <div>
            <div style={{ fontSize:10, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.06em", textTransform:"uppercase" as const, marginBottom:8 }}>Course Details</div>
            <div style={{ ...card({ padding:"14px 16px" }), display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              {[
                { label:"Format",   value:training.format },
                { label:"Duration", value:training.duration },
                { label:"Category", value:training.category },
                { label:"Due Date", value:training.dueDate },
                { label:"Required", value:training.mandatory?"Yes — Mandatory":"No — Optional" },
                { label:"Enrolled", value:`${training.totalAssigned} users` },
              ].map(d=>(
                <div key={d.label} style={{ display:"flex", flexDirection:"column" as const, gap:2 }}>
                  <span style={{ fontSize:9, color:"var(--muted-foreground)", fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.05em" }}>{d.label}</span>
                  <span style={{ fontSize:11, fontWeight:600, color:"rgba(255,255,255,0.85)" }}>{d.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Per-user status */}
          <div>
            <div style={{ fontSize:10, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.06em", textTransform:"uppercase" as const, marginBottom:8 }}>User Progress</div>
            <div style={{ display:"flex", flexDirection:"column" as const, gap:3, maxHeight:220, overflowY:"auto" as const, paddingRight:2 }}>
              {humanUsers.slice(0,10).map(u=>{
                const st = userTrainStatus(u.id, training.id);
                const stM: Record<TrStatus,{bg:string;color:string;label:string}> = {
                  completed:   { bg:"rgba(52,211,153,0.07)",  color:EME,  label:"✓ Completed"   },
                  in_progress: { bg:"rgba(252,211,77,0.07)",  color:AMB,  label:"↻ In Progress" },
                  not_started: { bg:"rgba(148,163,184,0.05)", color:"var(--muted-foreground)", label:"— Not Started" },
                  overdue:     { bg:"rgba(248,113,113,0.07)", color:RED,  label:"⚠ Overdue"    },
                };
                const sm = stM[st];
                const initials = u.name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
                return (
                  <div key={u.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 10px", borderRadius:7, background:sm.bg, border:`1px solid ${sm.color}22` }}>
                    <div style={{ width:28, height:28, borderRadius:7, background:"var(--secondary)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, color:NAV, flexShrink:0 }}>{initials}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.85)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{u.name}</div>
                      <div style={{ fontSize:9, color:"var(--muted-foreground)" }}>{u.department}</div>
                    </div>
                    <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:4, background:`${sm.color}20`, color:sm.color, flexShrink:0 }}>{sm.label}</span>
                  </div>
                );
              })}
              {humanUsers.length>10 && (
                <div style={{ fontSize:10, color:"var(--muted-foreground)", textAlign:"center" as const, padding:"6px 0" }}>
                  +{humanUsers.length-10} more users
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding:"14px 24px", borderTop:"1px solid var(--border)", display:"flex", gap:8, flexShrink:0 }}>
          <button style={{ flex:1, padding:"8px", borderRadius:7, border:`1px solid ${EME}44`, background:`${EME}12`, color:EME, fontSize:11, fontWeight:700, cursor:"pointer" }}>🎓 Assign to Users</button>
          <button style={{ flex:1, padding:"8px", borderRadius:7, border:`1px solid ${NAV}44`, background:`${NAV}12`, color:NAV, fontSize:11, fontWeight:700, cursor:"pointer" }}>⬇ Export Results</button>
          <button onClick={onClose} style={{ padding:"8px 16px", borderRadius:7, border:"1px solid rgba(255,255,255,0.12)", background:"transparent", color:"var(--muted-foreground)", fontSize:11, fontWeight:600, cursor:"pointer" }}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Training & Awareness Tab ──────────────────────────────────────────────────
function TrainingTab({ users, trainings = TRAININGS, policies = POLICIES }: { users: PeopleUser[]; trainings?: typeof TRAININGS; policies?: typeof POLICIES }) {
  const [catFilter, setCatFilter] = useState<TrainCat|"All">("All");
  const [assignTarget, setAssignTarget] = useState<Training|null>(null);
  const [bulkAll, setBulkAll] = useState(false);
  const [selectedTraining, setSelectedTraining] = useState<Training|null>(null);

  const cats: ("All"|TrainCat)[] = ["All","Security Awareness","Compliance","Privacy","HR","Technical"];
  const filtered = catFilter==="All" ? trainings : trainings.filter(t=>t.category===catFilter);
  const avgCompletion = trainings.length > 0 ? Math.round(trainings.reduce((s,t)=>s+t.completionRate,0)/trainings.length) : 0;
  const mandatory = trainings.filter(t=>t.mandatory).length;
  const overdue = trainings.filter(t=>t.completionRate<70).length;

  const fmtIcon: Record<TrainFmt,string> = { Video:"🎬", Quiz:"📝", Interactive:"🖥", Document:"📄" };

  return (
    <>
      {/* Stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12 }}>
        <StatCard label="Total Courses"   value={trainings.length}  sub="In training catalog"       color={NAV} icon="📚" />
        <StatCard label="Mandatory"        value={mandatory}          sub="Required for all users"    color={RED} icon="🔴" />
        <StatCard label="Avg Completion"   value={`${avgCompletion}%`} sub="Across all active courses" color={avgCompletion>=80?EME:AMB} icon="📊" />
        <StatCard label="Below 70%"        value={overdue}            sub="Needs attention"           color={overdue>0?RED:EME} icon="⚠️" />
        <StatCard label="Active Learners"  value={users.filter(u=>u.type!=="Non-Human"&&u.status==="active").length} sub="Users enrolled" color={EME} icon="👥" />
      </div>

      {/* Bulk assign bar */}
      <div style={{ ...card({ padding:"12px 16px" }), display:"flex", alignItems:"center", gap:12 }}>
        <span style={{ fontSize:12, fontWeight:700, color:"rgba(148,163,184,0.8)" }}>Bulk Assignment:</span>
        <select style={{ background:"var(--card)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:7, padding:"5px 10px", fontSize:11, color:NAV, outline:"none", fontFamily:"inherit" }}
          onChange={e=>setBulkAll(e.target.value==="all")}>
          <option value="active">Active Internal Users ({users.filter(u=>u.type==="Internal"&&u.status==="active").length})</option>
          <option value="all">All Users ({users.filter(u=>u.type!=="Non-Human").length})</option>
        </select>
        <button onClick={()=>trainings.length>0&&setAssignTarget({ ...trainings[0], id:"BULK_TRAINING" })} style={{ background:"rgba(59,130,246,0.18)", border:"1px solid rgba(59,130,246,0.4)", borderRadius:7, padding:"6px 14px", fontSize:11, fontWeight:800, color:NAV, cursor:"pointer" }}>
          🎓 Assign Training
        </button>
        <button onClick={()=>trainings.length>0&&setAssignTarget({ ...trainings[0], id:"BULK_POLICY" })} style={{ background:"rgba(52,211,153,0.14)", border:"1px solid rgba(52,211,153,0.35)", borderRadius:7, padding:"6px 14px", fontSize:11, fontWeight:800, color:EME, cursor:"pointer" }}>
          📜 Assign Policy
        </button>
        <span style={{ marginLeft:"auto", fontSize:10, color:"var(--muted-foreground)" }}>HR & Admin roles can assign to individuals or all users</span>
      </div>

      {/* Category filter */}
      <div style={{ display:"flex", gap:6, flexWrap:"wrap" as const }}>
        {cats.map(c=>(
          <button key={c} onClick={()=>setCatFilter(c)}
            style={{ padding:"4px 12px", borderRadius:6, fontSize:11, fontWeight:700, cursor:"pointer",
              border:`1.5px solid ${catFilter===c?"rgba(99,179,237,0.5)":"rgba(148,163,184,0.2)"}`,
              background:catFilter===c?"rgba(59,130,246,0.16)":"transparent",
              color:catFilter===c?NAV:"var(--muted-foreground)" }}>
            {c}
          </button>
        ))}
      </div>

      {/* Course cards grid */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:12 }}>
        {filtered.map(t=>{
          const color = t.completionRate>=80?EME:t.completionRate>=60?AMB:RED;
          return (
            <div key={t.id} style={{ ...card({ padding:"16px 18px" }), display:"flex", flexDirection:"column" as const, gap:10 }}>
              {/* Header */}
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  {/* TRN-ID badge — clickable */}
                  <div style={{ marginBottom:5 }}>
                    <button onClick={()=>setSelectedTraining(t)} style={{ background:"none", border:"none", padding:0, cursor:"pointer" }}>
                      <span style={{ fontSize:9, fontFamily:"monospace", color:NAV, background:"rgba(147,197,253,0.1)", border:"1px solid rgba(147,197,253,0.18)", borderRadius:4, padding:"2px 6px", fontWeight:800, textDecoration:"underline", textDecorationStyle:"dotted" as const }}>{t.id}</span>
                    </button>
                  </div>
                  {/* Title — clickable */}
                  <button onClick={()=>setSelectedTraining(t)} style={{ background:"none", border:"none", padding:0, cursor:"pointer", textAlign:"left" as const, marginBottom:4, display:"block", width:"100%" }}>
                    <div style={{ fontSize:12, fontWeight:800, color:"white", lineHeight:1.3, textDecoration:"underline", textDecorationStyle:"dotted" as const, textUnderlineOffset:2 }}>{t.title}</div>
                  </button>
                  <div style={{ display:"flex", gap:6 }}>
                    <Badge label={t.category} />
                    {t.mandatory && <span style={{ fontSize:9, fontWeight:800, color:RED, background:"rgba(248,113,113,0.12)", border:"1px solid rgba(248,113,113,0.25)", borderRadius:4, padding:"1px 5px" }}>MANDATORY</span>}
                  </div>
                </div>
                <span style={{ fontSize:20, flexShrink:0 }}>{fmtIcon[t.format]}</span>
              </div>
              {/* Description */}
              <div style={{ fontSize:10.5, color:"var(--muted-foreground)", lineHeight:1.45 }}>{t.description}</div>
              {/* Meta */}
              <div style={{ display:"flex", gap:12, fontSize:10, color:"var(--muted-foreground)" }}>
                <span>⏱ {t.duration}</span>
                <span>📋 {t.format}</span>
                <span>📅 Due {t.dueDate}</span>
              </div>
              {/* Progress */}
              <div>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                  <span style={{ fontSize:10, color:"var(--muted-foreground)" }}>{t.completedCount}/{t.totalAssigned} completed</span>
                  <span style={{ fontSize:11, fontWeight:800, color }}>{t.completionRate}%</span>
                </div>
                <div style={{ height:5, borderRadius:3, background:"var(--border)", overflow:"hidden" }}>
                  <div style={{ width:`${t.completionRate}%`, height:"100%", background:color, borderRadius:3 }} />
                </div>
              </div>
              {/* Actions */}
              <div style={{ display:"flex", gap:8, marginTop:2 }}>
                <button onClick={()=>setAssignTarget(t)} style={{ flex:1, background:`${NAV}14`, border:`1px solid ${NAV}30`, borderRadius:6, padding:"6px", fontSize:10, fontWeight:800, color:NAV, cursor:"pointer" }}>
                  + Assign to Users
                </button>
                <button onClick={()=>setSelectedTraining(t)} style={{ background:"var(--secondary)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:6, padding:"6px 10px", fontSize:10, fontWeight:700, color:"var(--muted-foreground)", cursor:"pointer" }}>
                  View Results
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {selectedTraining && (
        <TrainingDetailModal
          training={selectedTraining}
          users={users}
          onClose={()=>setSelectedTraining(null)}
        />
      )}

      {assignTarget && (
        <AssignModal
          mode={assignTarget.id.startsWith("BULK_POLICY")?"policy":"training"}
          users={users}
          onClose={()=>setAssignTarget(null)}
          policies={policies}
          trainings={trainings}
        />
      )}
    </>
  );
}

// ── Role Editor Modal (create / edit) ────────────────────────────────────────
type PermLevel = "full"|"read"|"limited"|"none";

function RoleEditorModal({ role, onSave, onClose }: {
  role: RbacRole | null;  // null = create new
  onSave: (r: RbacRole) => void;
  onClose: () => void;
}) {
  const isNew = role === null;
  const blank: RbacRole = {
    name:"", description:"", userCount:0,
    permissions: Object.fromEntries(ALL_MODULES_PERM.map(m=>[m.id,"none" as PermLevel])),
  };
  const [form, setForm] = useState<RbacRole>(role ? { ...role, permissions:{ ...role.permissions } } : blank);

  const setField = (k: keyof RbacRole, v: string) => setForm(p=>({ ...p, [k]:v }));
  const setPerm  = (mod: string, v: PermLevel) => setForm(p=>({ ...p, permissions:{ ...p.permissions, [mod]:v } }));

  const PERM_OPTIONS: PermLevel[] = ["full","read","limited","none"];
  const permColor: Record<PermLevel,string> = { full:EME, read:NAV, limited:AMB, none:"var(--muted-foreground)" };
  const permBg:    Record<PermLevel,string> = { full:"rgba(52,211,153,0.12)", read:"rgba(147,197,253,0.12)", limited:"rgba(252,211,77,0.12)", none:"var(--secondary)" };

  // Settings is restricted — only admin roles can have Settings access
  const isProtectedModule = (mod: string) => mod === "Settings";

  return (
    <div style={{ position:"fixed" as const, inset:0, background:"rgba(0,0,0,0.8)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9999 }}
         onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div style={{ background:"var(--input)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:14, width:640, maxHeight:"88vh", display:"flex", flexDirection:"column" as const, overflow:"hidden", boxShadow:"0 32px 80px rgba(0,0,0,0.8)" }}>
        {/* Header */}
        <div style={{ padding:"20px 24px 16px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:"white", marginBottom:4 }}>{isNew?"Create New Role":"Edit Role Permissions"}</div>
            <div style={{ fontSize:11, color:"var(--muted-foreground)" }}>{isNew?"Define a new role with module-level access controls":"Adjust which modules this role can access and at what level"}</div>
          </div>
          <button onClick={onClose} style={{ background:"var(--border)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:6, width:28, height:28, cursor:"pointer", color:"var(--muted-foreground)", fontSize:14 }}>✕</button>
        </div>

        <div style={{ flex:1, overflow:"auto", padding:"20px 24px", display:"flex", flexDirection:"column" as const, gap:16 }}>
          {/* Name + description */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr", gap:12 }}>
            <div>
              <label style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", letterSpacing:"0.06em", textTransform:"uppercase" as const, display:"block", marginBottom:6 }}>Role Name</label>
              <input value={form.name} onChange={e=>setField("name",e.target.value)}
                placeholder="e.g. Privacy Analyst"
                readOnly={!isNew && (form.name==="Super Admin"||form.name==="Tenant Admin")}
                style={{ width:"100%", background:"var(--secondary)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:7, padding:"8px 12px", fontSize:12, color:"white", outline:"none", fontFamily:"inherit", boxSizing:"border-box" as const }} />
            </div>
            <div>
              <label style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", letterSpacing:"0.06em", textTransform:"uppercase" as const, display:"block", marginBottom:6 }}>Description</label>
              <input value={form.description} onChange={e=>setField("description",e.target.value)}
                placeholder="Brief description of this role's purpose"
                style={{ width:"100%", background:"var(--secondary)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:7, padding:"8px 12px", fontSize:12, color:"white", outline:"none", fontFamily:"inherit", boxSizing:"border-box" as const }} />
            </div>
          </div>

          {/* Permission grid */}
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", letterSpacing:"0.06em", textTransform:"uppercase" as const, marginBottom:10 }}>Module Access Permissions</div>
            {/* Legend */}
            <div style={{ display:"flex", gap:16, marginBottom:12 }}>
              {PERM_OPTIONS.map(p=>(
                <div key={p} style={{ display:"flex", alignItems:"center", gap:5, fontSize:10 }}>
                  <div style={{ width:10, height:10, borderRadius:3, background:permBg[p], border:`1px solid ${permColor[p]}40` }} />
                  <span style={{ color:"var(--muted-foreground)", textTransform:"capitalize" as const }}>{p}</span>
                </div>
              ))}
              <span style={{ fontSize:10, color:"var(--muted-foreground)", marginLeft:"auto" }}>⚙ Settings is restricted to Admin roles only</span>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:6 }}>
              {ALL_MODULES_PERM.map(mod => {
                const cur = (form.permissions[mod.id] ?? "none") as PermLevel;
                const locked = isProtectedModule(mod.id) && form.name!=="Super Admin" && form.name!=="Tenant Admin";
                return (
                  <div key={mod.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", borderRadius:8,
                    background: cur==="none"?"var(--secondary)":permBg[cur],
                    border:`1px solid ${cur==="none"?"var(--border)":permColor[cur]+"33"}`,
                    opacity: locked ? 0.5 : 1 }}>
                    <span style={{ fontSize:14, flexShrink:0 }}>{mod.icon}</span>
                    <span style={{ flex:1, fontSize:12, fontWeight:600, color:"rgba(255,255,255,0.85)" }}>{mod.label}</span>
                    {locked ? (
                      <span style={{ fontSize:9, color:"var(--muted-foreground)", background:"var(--secondary)", borderRadius:4, padding:"2px 6px" }}>🔒 Admin Only</span>
                    ) : (
                      <div style={{ display:"flex", gap:3 }}>
                        {PERM_OPTIONS.map(opt=>(
                          <button key={opt} onClick={()=>setPerm(mod.id, opt)}
                            style={{ padding:"2px 8px", borderRadius:4, fontSize:9, fontWeight:800, cursor:"pointer",
                              border:`1px solid ${cur===opt ? permColor[opt] : "rgba(255,255,255,0.1)"}`,
                              background: cur===opt ? permBg[opt] : "transparent",
                              color: cur===opt ? permColor[opt] : "var(--muted-foreground)",
                              textTransform:"capitalize" as const, fontFamily:"inherit" }}>
                            {opt[0].toUpperCase()+opt.slice(1)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding:"14px 24px", borderTop:"1px solid var(--border)", display:"flex", gap:10, justifyContent:"flex-end", alignItems:"center" }}>
          <span style={{ flex:1, fontSize:10, color:"var(--muted-foreground)" }}>
            {Object.values(form.permissions).filter(v=>v!=="none").length} of {ALL_MODULES_PERM.length} modules accessible
          </span>
          <button onClick={onClose} style={{ padding:"7px 16px", borderRadius:7, border:"1px solid rgba(255,255,255,0.12)", background:"transparent", color:"var(--muted-foreground)", fontSize:12, fontWeight:600, cursor:"pointer" }}>Cancel</button>
          <button onClick={()=>{ if(form.name.trim()) onSave(form); }}
            disabled={!form.name.trim()}
            style={{ padding:"7px 20px", borderRadius:7, border:"none", background: form.name.trim()?"linear-gradient(135deg, #3B82F6, #1D4ED8)":"var(--border)", color: form.name.trim()?"white":"var(--muted-foreground)", fontSize:12, fontWeight:800, cursor: form.name.trim()?"pointer":"not-allowed" }}>
            {isNew?"Create Role":"Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main PeopleOps Component ──────────────────────────────────────────────────
export default function PeopleOps() {
  const { user: authUser } = useAuth();
  const effectiveRole = authUser?.role ?? "employee";
  const isAdmin = effectiveRole === "super_admin" || effectiveRole === "tenant_admin";
  const { viewTenantId } = useOrg();
  const effectiveUsers     = viewTenantId === 1 ? USERS     : [];
  const effectivePolicies  = (viewTenantId === 1 ? POLICIES  : []) as typeof POLICIES;
  const effectiveTrainings = (viewTenantId === 1 ? TRAININGS : []) as typeof TRAININGS;

  const [tab, setTab]               = useState("overview");
  const [typeFilter, setTypeFilter] = useState<"All"|UserType>("All");
  const [statusFilter, setStatusFilter] = useState<"All"|UserStatus>("All");
  const [noMfaFilter, setNoMfaFilter] = useState(false);
  const [search, setSearch]         = useState("");
  const [selectedUser, setSelectedUser] = useState<PeopleUser|null>(null);
  const [bulkMode, setBulkMode]     = useState<"policy"|"training"|null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [customRoles, setCustomRoles]   = useState<RbacRole[]>(RBAC_ROLES_DEFAULT);
  const [editingRole,  setEditingRole]  = useState<RbacRole|null|"new">(null);
  const [selectedPolicy, setSelectedPolicy] = useState<Policy|null>(null);

  const handleSaveRole = (saved: RbacRole) => {
    setCustomRoles(prev => {
      const idx = prev.findIndex(r=>r.name===saved.name);
      if (idx >= 0) { const n=[...prev]; n[idx]=saved; return n; }
      return [...prev, saved];
    });
    setEditingRole(null);
  };
  const handleDeleteRole = (name: string) => {
    if (name==="Super Admin"||name==="Tenant Admin") return;
    setCustomRoles(prev=>prev.filter(r=>r.name!==name));
  };

  const filteredUsers = useMemo(()=>
    effectiveUsers.filter(u=>
      (typeFilter==="All"||u.type===typeFilter) &&
      (statusFilter==="All"||u.status===statusFilter) &&
      (!noMfaFilter||!u.mfaEnabled) &&
      (!search||u.name.toLowerCase().includes(search.toLowerCase())||u.email.toLowerCase().includes(search.toLowerCase())||u.id.toLowerCase().includes(search.toLowerCase()))
    )
  ,[effectiveUsers,typeFilter,statusFilter,noMfaFilter,search]);

  const internal = effectiveUsers.filter(u=>u.type==="Internal").length;
  const external = effectiveUsers.filter(u=>u.type==="External").length;
  const nonHuman = effectiveUsers.filter(u=>u.type==="Non-Human").length;
  const noMfa    = effectiveUsers.filter(u=>u.type!=="Non-Human"&&!u.mfaEnabled).length;
  const pending  = effectiveUsers.filter(u=>u.status==="pending"||u.status==="suspended").length;
  const avgAck   = effectivePolicies.length > 0 ? Math.round(effectivePolicies.reduce((s,p)=>s+p.ackRate,0)/effectivePolicies.length) : 0;

  const toggleRow = (id:string) => setSelectedRows(prev=>{ const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n; });
  const toggleAll = () => setSelectedRows(prev=>prev.size===filteredUsers.length?new Set():new Set(filteredUsers.map(u=>u.id)));
  const allSelected = filteredUsers.length>0&&selectedRows.size===filteredUsers.length;
  const hasSelected = selectedRows.size>0;

  const tabs = [
    { key:"overview", label:"Overview",                                                                          dot:EME },
    { key:"people",   label:"People",               count:effectiveUsers.length                                         },
    { key:"policies", label:"Policy Acknowledgment",count:effectivePolicies.filter(p=>p.ackRate<100).length, dot:AMB    },
    { key:"training", label:"Training & Awareness", count:effectiveTrainings.length, dot:"#A78BFA"                      },
    { key:"rbac",     label:"RBAC & Roles",         count:customRoles.length                                            },
    { key:"workflow", label:"⚡ Workflow",            dot:"#6366F1"                                                      },
  ];

  if (selectedUser) {
    return (
      <div style={{ display:"flex", flexDirection:"column" as const, height:"100%", overflow:"hidden", background:"rgb(9,12,18)" }}>
        <ModuleHeader
          title="People Operations"
          description="User lifecycle management, policy acknowledgment tracking, and role-based access control"
          badge={{ label:"PeopleOps", color:"#1E3A5F", bg:"#EFF6FF" }}
          action={{ label:"+ Invite User", onClick:()=>{} }}
        />
        <SubNav tabs={tabs} active={tab} onSelect={(t)=>{ setSelectedUser(null); setTab(t); }} />
        <div style={{ flex:1, overflow:"hidden" }}>
          <UserDetail user={selectedUser} onBack={()=>setSelectedUser(null)} policies={effectivePolicies} trainings={effectiveTrainings} onAssign={(m)=>{ setSelectedUser(null); setBulkMode(m); }} />
        </div>
      </div>
    );
  }
  return (
    <div style={{ display:"flex", flexDirection:"column" as const, height:"100%", overflow:"hidden", background:"rgb(9,12,18)" }}>
      <ModuleHeader
        title="People Operations"
        description="User lifecycle management, policy acknowledgment tracking, and role-based access control"
        badge={{ label:"PeopleOps", color:"#1E3A5F", bg:"#EFF6FF" }}
        action={{ label:"+ Invite User", onClick:()=>{} }}
      />
      <SubNav tabs={tabs} active={tab} onSelect={(t)=>{ setTab(t); setSelectedUser(null); }} />
      <AICopilotBar module="peopleops" />
      <div style={{ flex:1, overflow:"auto", padding:20, display:"flex", flexDirection:"column" as const, gap:16 }}>

        {/* ── Overview ─────────────────────────────────────────────────────── */}
        {tab==="overview" && (
          <div style={{ display:"flex", flexDirection:"column" as const, gap:16 }}>

            {/* Row 1: Awareness Score Gauge + KPI Grid */}
            <div style={{ display:"grid", gridTemplateColumns:"200px 1fr", gap:16 }}>
              <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:"20px 16px", display:"flex", flexDirection:"column" as const, alignItems:"center" }}>
                <div style={{ fontSize:10, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.07em", textTransform:"uppercase" as const, marginBottom:12 }}>Security Awareness</div>
                <svg width="160" height="96" viewBox="0 0 160 96" style={{ overflow:"visible" as const }}>
                  <defs>
                    <linearGradient id="awarGradPO" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#F87171"/><stop offset="60%" stopColor="#FBBF24"/><stop offset="100%" stopColor="#34D399"/>
                    </linearGradient>
                  </defs>
                  <path d="M 18 86 A 62 62 0 0 1 142 86" fill="none" stroke="var(--input)" strokeWidth="10" strokeLinecap="round"/>
                  <path d="M 18 86 A 62 62 0 0 1 142 86" fill="none" stroke="url(#awarGradPO)" strokeWidth="10" strokeLinecap="round"
                    strokeDasharray={`${0.74*195} 195`}/>
                  <text x="80" y="80" textAnchor="middle" style={{ fontSize:28, fontWeight:800, fill:AMB, fontFamily:"'JetBrains Mono', monospace" }}>74</text>
                  <text x="80" y="94" textAnchor="middle" style={{ fontSize:9, fill:"var(--muted-foreground)" }}>/ 100</text>
                </svg>
                <div style={{ fontSize:10, color:AMB, fontWeight:700, marginTop:2 }}>Needs Improvement</div>
                <div style={{ fontSize:9, color:"var(--muted-foreground)", marginTop:6, textAlign:"center" as const, lineHeight:1.4 }}>Org-wide human risk score</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginTop:14, width:"100%" }}>
                  {[{ l:"Training", v:Math.round(effectiveTrainings.reduce((s,t)=>s+effectiveUsers.filter(u=>userTrainStatus(u.id,t.id)==="completed").length,0)/(Math.max(effectiveTrainings.length*effectiveUsers.length,1))*100)+"%", c:NAV },
                    { l:"MFA", v:Math.round((effectiveUsers.filter(u=>u.type!=="Non-Human"&&u.mfaEnabled).length/Math.max(effectiveUsers.filter(u=>u.type!=="Non-Human").length,1))*100)+"%", c:EME },
                    { l:"Phish Rate", v:"8.3%", c:RED },
                    { l:"Policy Ack", v:avgAck+"%", c:PRP }].map(m=>(
                    <div key={m.l} style={{ background:"var(--secondary)", borderRadius:6, padding:"6px 8px", textAlign:"center" as const }}>
                      <div style={{ fontSize:13, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:m.c }}>{m.v}</div>
                      <div style={{ fontSize:8, color:"var(--muted-foreground)", marginTop:1 }}>{m.l}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
                <StatCard label="Training Completion" value={Math.round(effectiveTrainings.reduce((s,t)=>s+effectiveUsers.filter(u=>userTrainStatus(u.id,t.id)==="completed").length,0)/(Math.max(effectiveTrainings.length*effectiveUsers.length,1))*100)+"%"} sub="All courses · all users" color={NAV} icon="📚" />
                <StatCard label="MFA Coverage" value={Math.round((effectiveUsers.filter(u=>u.type!=="Non-Human"&&u.mfaEnabled).length/Math.max(effectiveUsers.filter(u=>u.type!=="Non-Human").length,1))*100)+"%"} sub="Human accounts enabled" color={EME} icon="🔐" />
                <StatCard label="Policy Ack Rate" value={avgAck+"%"} sub="Avg across all policies" color={PRP} icon="📋" />
                <StatCard label="Phishing Click Rate" value="8.3%" sub="↓ 4.1% vs last month" color={RED} icon="🎣" />
                <StatCard label="Users at Risk" value={String(effectiveUsers.filter(u=>u.type!=="Non-Human"&&(!u.mfaEnabled||u.policyAck<u.totalPolicies*0.5)).length)} sub="Low awareness score" color={RED} icon="⚠️" />
                <StatCard label="Security Culture" value="B+" sub="Industry benchmark: C+" color={EME} icon="🏆" />
              </div>
            </div>

            {/* Row 2: Training Completion by Dept | Phishing + MFA */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
              <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:"18px 20px" }}>
                <div style={{ fontSize:12, fontWeight:800, color:NAV, marginBottom:4 }}>Training Completion by Department</div>
                <div style={{ fontSize:10, color:"var(--muted-foreground)", marginBottom:14 }}>Average completion rate across all active courses</div>
                {[
                  { dept:"Finance",     pct:96, users:18, color:EME },
                  { dept:"HR",          pct:94, users:12, color:EME },
                  { dept:"IT",          pct:93, users:15, color:EME },
                  { dept:"Legal",       pct:91, users:8,  color:EME },
                  { dept:"Engineering", pct:88, users:42, color:NAV },
                  { dept:"Marketing",   pct:72, users:24, color:AMB },
                  { dept:"Operations",  pct:68, users:31, color:AMB },
                  { dept:"Sales",       pct:61, users:35, color:RED },
                ].map(d=>(
                  <div key={d.dept} style={{ marginBottom:10 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, marginBottom:3 }}>
                      <span style={{ fontWeight:600, color:"var(--foreground)" }}>{d.dept}</span>
                      <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:d.color }}>{d.pct}% <span style={{ color:"var(--muted-foreground)", fontWeight:400 }}>({d.users} users)</span></span>
                    </div>
                    <div style={{ height:7, borderRadius:4, background:"var(--input)", overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${d.pct}%`, background:`linear-gradient(90deg,${d.color}60,${d.color})`, borderRadius:4 }}/>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display:"flex", flexDirection:"column" as const, gap:12 }}>
                {/* Phishing Simulation */}
                <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:"18px 20px", flex:1 }}>
                  <div style={{ fontSize:12, fontWeight:800, color:RED, marginBottom:4 }}>Phishing Simulation Results</div>
                  <div style={{ fontSize:10, color:"var(--muted-foreground)", marginBottom:14 }}>Last campaign · Jun 12 2026 · 185 targets</div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:6, marginBottom:12 }}>
                    {[
                      { label:"Clicked",        value:"8.3%",  count:15,  color:RED },
                      { label:"Submitted Creds",value:"3.2%",  count:6,   color:RED },
                      { label:"Reported",       value:"31%",   count:57,  color:EME },
                      { label:"No Action",      value:"57.5%", count:107, color:"var(--muted-foreground)" },
                    ].map(s=>(
                      <div key={s.label} style={{ background:"var(--secondary)", borderRadius:8, padding:"10px 6px", textAlign:"center" as const }}>
                        <div style={{ fontSize:16, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:s.color }}>{s.value}</div>
                        <div style={{ fontSize:8, color:"var(--muted-foreground)", marginTop:2 }}>{s.label}</div>
                        <div style={{ fontSize:9, color:s.color, fontWeight:700, marginTop:1 }}>n={s.count}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize:10, color:"var(--muted-foreground)", borderTop:"1px solid var(--border)", paddingTop:10 }}>
                    <span style={{ color:EME, fontWeight:700 }}>↓ 4.1% click rate</span> vs prior campaign (12.4%) · Industry avg: <span style={{ color:AMB, fontWeight:700 }}>10.2%</span>
                  </div>
                </div>
                {/* MFA by Dept */}
                <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:"18px 20px" }}>
                  <div style={{ fontSize:12, fontWeight:800, color:PRP, marginBottom:12 }}>MFA Adoption by Department</div>
                  {[
                    { dept:"Finance",    pct:100, color:EME },
                    { dept:"Legal",      pct:100, color:EME },
                    { dept:"IT",         pct:100, color:EME },
                    { dept:"HR",         pct:92,  color:EME },
                    { dept:"Engineering",pct:95,  color:EME },
                    { dept:"Operations", pct:78,  color:AMB },
                    { dept:"Marketing",  pct:71,  color:AMB },
                    { dept:"Sales",      pct:63,  color:RED },
                  ].map(d=>(
                    <div key={d.dept} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:7 }}>
                      <span style={{ fontSize:10, width:80, color:"var(--muted-foreground)", flexShrink:0 }}>{d.dept}</span>
                      <div style={{ flex:1, height:5, borderRadius:3, background:"var(--input)", overflow:"hidden" }}>
                        <div style={{ height:"100%", width:`${d.pct}%`, background:d.color, borderRadius:3 }}/>
                      </div>
                      <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, fontWeight:700, color:d.color, width:34, textAlign:"right" as const }}>{d.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ── People ──────────────────────────────────────────────────────── */}
        {tab==="people" && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12 }}>
              <StatCard label="Internal Users"  value={internal} sub="Employees & admins"      color={NAV} icon="👤" onClick={()=>{ setTypeFilter("Internal"); setNoMfaFilter(false); }} />
              <StatCard label="External Users"  value={external} sub="Vendors & contractors"   color={AMB} icon="🤝" onClick={()=>{ setTypeFilter("External"); setNoMfaFilter(false); }} />
              <StatCard label="Non-Human IDs"   value={nonHuman} sub="Service accounts"        color={PRP} icon="🤖" onClick={()=>{ setTypeFilter("Non-Human"); setNoMfaFilter(false); }} />
              <StatCard label="MFA Not Enabled" value={noMfa}    sub="Human users without MFA" color={RED} icon="⚠️" onClick={()=>{ setTypeFilter("All"); setNoMfaFilter(true); }} />
              <StatCard label="Action Needed"   value={pending}  sub="Pending / suspended"     color={AMB} icon="📋" onClick={()=>{ setStatusFilter("pending"); setNoMfaFilter(false); }} />
            </div>

            {/* Search + Filters */}
            <div style={{ display:"flex", flexDirection:"column" as const, gap:8 }}>
              <div style={{ position:"relative" as const }}>
                <span style={{ position:"absolute" as const, left:10, top:"50%", transform:"translateY(-50%)", fontSize:12, color:"var(--muted-foreground)", pointerEvents:"none" }}>🔍</span>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name, email or ID…"
                  style={{ width:"100%", background:"var(--card)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, padding:"7px 12px 7px 32px", fontSize:11, color:"white", outline:"none", fontFamily:"inherit", boxSizing:"border-box" as const }} />
              </div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" as const, alignItems:"center" }}>
                {(["All","Internal","External","Non-Human"] as const).map(t=>(
                  <button key={t} onClick={()=>setTypeFilter(t)} style={{ padding:"4px 12px", borderRadius:6, fontSize:11, fontWeight:700, cursor:"pointer",
                    border:`1.5px solid ${typeFilter===t?"rgba(99,179,237,0.5)":"rgba(148,163,184,0.2)"}`,
                    background:typeFilter===t?"rgba(59,130,246,0.16)":"transparent",
                    color:typeFilter===t?NAV:"var(--muted-foreground)" }}>{t}</button>
                ))}
                <div style={{ width:1, background:"rgba(255,255,255,0.1)", height:18, margin:"0 2px" }} />
                {(["All","active","inactive","pending","suspended"] as const).map(s=>(
                  <button key={s} onClick={()=>setStatusFilter(s)} style={{ padding:"4px 12px", borderRadius:6, fontSize:11, fontWeight:700, cursor:"pointer",
                    border:`1.5px solid ${statusFilter===s?"rgba(99,179,237,0.5)":"rgba(148,163,184,0.2)"}`,
                    background:statusFilter===s?"rgba(59,130,246,0.16)":"transparent",
                    color:statusFilter===s?NAV:"var(--muted-foreground)", textTransform:"capitalize" as const }}>{s}</button>
                ))}
                {noMfaFilter && <button onClick={()=>setNoMfaFilter(false)} style={{ padding:"4px 12px", borderRadius:6, fontSize:11, fontWeight:700, cursor:"pointer", border:"1.5px solid rgba(239,68,68,0.5)", background:"rgba(239,68,68,0.12)", color:RED }}>⚠ MFA Disabled ✕</button>}
                <span style={{ marginLeft:"auto", fontSize:10, color:"var(--muted-foreground)" }}>{filteredUsers.length} of {effectiveUsers.length} users</span>
              </div>
            </div>

            {/* Bulk action toolbar */}
            {hasSelected && (
              <div style={{ background:"rgba(59,130,246,0.1)", border:"1px solid rgba(99,179,237,0.3)", borderRadius:8, padding:"10px 16px", display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:12, fontWeight:700, color:NAV, minWidth:86 }}>{selectedRows.size} selected</span>
                <div style={{ width:1, height:18, background:"rgba(99,179,237,0.25)" }} />
                <button onClick={()=>setBulkMode("policy")} style={{ padding:"4px 12px", borderRadius:6, border:"1px solid rgba(99,179,237,0.35)", background:"rgba(59,130,246,0.18)", color:NAV, fontSize:11, fontWeight:700, cursor:"pointer" }}>📜 Assign Policy</button>
                <button onClick={()=>setBulkMode("training")} style={{ padding:"4px 12px", borderRadius:6, border:"1px solid rgba(167,139,250,0.35)", background:"rgba(167,139,250,0.14)", color:PRP, fontSize:11, fontWeight:700, cursor:"pointer" }}>🎓 Assign Training</button>
                <button style={{ padding:"4px 12px", borderRadius:6, border:"1px solid rgba(148,163,184,0.2)", background:"var(--secondary)", color:"var(--muted-foreground)", fontSize:11, fontWeight:700, cursor:"pointer" }}>↓ Export CSV</button>
                <button style={{ padding:"4px 12px", borderRadius:6, border:"1px solid rgba(239,68,68,0.35)", background:"rgba(239,68,68,0.1)", color:RED, fontSize:11, fontWeight:700, cursor:"pointer" }}>Suspend</button>
                <button onClick={()=>setSelectedRows(new Set())} style={{ marginLeft:"auto", padding:"3px 10px", borderRadius:5, border:"1px solid rgba(148,163,184,0.15)", background:"transparent", color:"var(--muted-foreground)", fontSize:10, fontWeight:600, cursor:"pointer" }}>Clear</button>
              </div>
            )}

            {/* Users table */}
            <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, overflow:"hidden", boxShadow:"0 2px 16px rgba(0,0,0,0.4)" }}>
              <table style={{ width:"100%", borderCollapse:"collapse" as const, fontSize:12 }}>
                <thead>
                  <tr style={{ background:"var(--input)", borderBottom:"1px solid var(--border)" }}>
                    <th style={{ padding:"10px 14px", width:36, textAlign:"center" as const }}>
                      <input type="checkbox" checked={allSelected} onChange={toggleAll}
                        ref={el=>{ if(el) el.indeterminate = hasSelected&&!allSelected; }}
                        style={{ cursor:"pointer", accentColor:NAV, width:13, height:13 }} />
                    </th>
                    {["ID","Name / Email","Type","Role","Rank","Department","Status","MFA","Policy Ack","Training"].map(h=>(
                      <th key={h} style={{ padding:"10px 12px", textAlign:"left" as const, color:"var(--muted-foreground)", fontWeight:700, fontSize:10, letterSpacing:"0.5px", textTransform:"uppercase" as const, whiteSpace:"nowrap" as const }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u,i)=>{
                    const trainDone = TRAININGS.filter(t=>userTrainStatus(u.id,t.id)==="completed").length;
                    const isSelected = selectedRows.has(u.id);
                    return (
                      <tr key={u.id}
                        style={{ borderBottom:"1px solid rgba(255,255,255,0.04)", cursor:"pointer", background:isSelected?"rgba(59,130,246,0.08)":i%2===0?"transparent":"rgba(255,255,255,0.01)", transition:"background 0.1s" }}
                        onMouseEnter={e=>{ if(!isSelected)(e.currentTarget as HTMLTableRowElement).style.background="rgba(59,130,246,0.06)"; }}
                        onMouseLeave={e=>{ (e.currentTarget as HTMLTableRowElement).style.background=isSelected?"rgba(59,130,246,0.08)":i%2===0?"transparent":"rgba(255,255,255,0.01)"; }}
                        onClick={()=>setSelectedUser(u)}>
                        <td style={{ padding:"11px 14px", width:36, textAlign:"center" as const }} onClick={e=>{ e.stopPropagation(); toggleRow(u.id); }}>
                          <input type="checkbox" checked={isSelected} readOnly onClick={e=>e.stopPropagation()}
                            style={{ cursor:"pointer", accentColor:NAV, width:13, height:13, pointerEvents:"none" }} />
                        </td>
                        <td style={{ padding:"11px 12px", minWidth:100 }}>
                          <span style={{ fontSize:10, fontFamily:"'JetBrains Mono',monospace", color:NAV, background:"rgba(147,197,253,0.1)", border:"1px solid rgba(147,197,253,0.2)", borderRadius:4, padding:"2px 6px", whiteSpace:"nowrap" as const, fontWeight:700 }}>{u.id}</span>
                        </td>
                        <td style={{ padding:"11px 12px", minWidth:170 }}>
                          <div style={{ fontWeight:700, fontSize:12, color:"rgba(255,255,255,0.9)" }}>{u.name}</div>
                          <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:2 }}>{u.email}</div>
                        </td>
                        <td style={{ padding:"11px 12px" }}><UserTypeBadge type={u.type} /></td>
                        <td style={{ padding:"11px 12px", fontSize:11, fontWeight:600, color:"rgba(255,255,255,0.8)", whiteSpace:"nowrap" as const }}>{u.role}</td>
                        <td style={{ padding:"11px 12px" }}>
                          {u.rank
                            ? <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:4,
                                background:"rgba(196,181,253,0.12)", color:"#A78BFA", whiteSpace:"nowrap" as const }}>{u.rank}</span>
                            : <span style={{ fontSize:10, color:"rgba(148,163,184,0.3)" }}>—</span>
                          }
                        </td>
                        <td style={{ padding:"11px 12px", fontSize:11, color:"var(--muted-foreground)" }}>{u.department}</td>
                        <td style={{ padding:"11px 12px" }}><StatusDot status={u.status} /></td>
                        <td style={{ padding:"11px 12px" }}><MfaBadge on={u.mfaEnabled} /></td>
                        <td style={{ padding:"11px 12px" }}><AckBar acked={u.policyAck} total={u.totalPolicies} /></td>
                        <td style={{ padding:"11px 12px" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                            <div style={{ width:44, height:5, borderRadius:3, background:"var(--border)", overflow:"hidden" }}>
                              <div style={{ width:`${Math.round((trainDone/Math.max(effectiveTrainings.length,1))*100)}%`, height:"100%", background:NAV, borderRadius:3 }} />
                            </div>
                            <span style={{ fontSize:10, fontWeight:700, color:NAV }}>{trainDone}/{effectiveTrainings.length}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── Policy Acknowledgment ────────────────────────────────────────── */}
        {tab==="policies" && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
              <StatCard label="Total Policies"     value={effectivePolicies.length}                             sub="Requiring acknowledgment"   color={NAV} icon="📜" />
              <StatCard label="Avg. Ack. Rate"      value={`${avgAck}%`}                                             sub="Across all active policies" color={avgAck>=80?EME:AMB} icon="📊" />
              <StatCard label="Below 70%"           value={effectivePolicies.filter(p=>p.ackRate<70).length}         sub="Overdue or low completion"  color={RED} icon="⚠️" />
              <StatCard label="Fully Acknowledged"  value={effectivePolicies.filter(p=>p.ackRate===100).length}      sub="100% completion"            color={EME} icon="✅" />
            </div>
            <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, overflow:"hidden" }}>
              <div style={{ background:"rgba(30,58,95,0.5)", padding:"12px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <span style={{ fontSize:12, fontWeight:800, letterSpacing:"0.06em", color:NAV }}>POLICY ACKNOWLEDGMENT TRACKER</span>
                <div style={{ display:"flex", gap:8 }}>
                  <button style={{ padding:"4px 12px", borderRadius:6, border:"1px solid rgba(99,179,237,0.35)", background:"rgba(59,130,246,0.15)", color:NAV, fontSize:11, fontWeight:700, cursor:"pointer" }}>⬇ Export Report</button>
                  <button onClick={()=>setBulkMode("policy")} style={{ padding:"4px 12px", borderRadius:6, border:"1px solid rgba(52,211,153,0.35)", background:"rgba(52,211,153,0.12)", color:EME, fontSize:11, fontWeight:700, cursor:"pointer" }}>+ Assign Policy</button>
                </div>
              </div>
              <table style={{ width:"100%", borderCollapse:"collapse" as const, fontSize:12 }}>
                <thead>
                  <tr style={{ background:"var(--secondary)", borderBottom:"1px solid var(--border)" }}>
                    {["Policy ID","Policy Name","Category","Due Date","Progress","Acked","Pending","Status"].map(h=>(
                      <th key={h} style={{ padding:"10px 14px", textAlign:"left" as const, fontSize:10, fontWeight:700, color:"var(--muted-foreground)", letterSpacing:"0.05em", textTransform:"uppercase" as const }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {effectivePolicies.map((p,i)=>{
                    const sc = p.ackRate===100?EME:p.ackRate>=70?AMB:RED;
                    const sl = p.ackRate===100?"Complete":p.ackRate>=70?"In Progress":"Overdue";
                    return (
                      <tr key={p.id} style={{ borderBottom:"1px solid rgba(255,255,255,0.04)", background:i%2===0?"transparent":"rgba(255,255,255,0.01)" }}>
                        <td style={{ padding:"10px 14px" }}>
                          <button onClick={()=>setSelectedPolicy(p)} style={{ background:"none", border:"none", padding:0, cursor:"pointer" }}>
                            <span style={{ fontSize:10, fontFamily:"monospace", color:NAV, background:"rgba(147,197,253,0.1)", border:"1px solid rgba(147,197,253,0.18)", borderRadius:4, padding:"2px 6px", textDecoration:"underline", textDecorationStyle:"dotted" as const }}>{p.id}</span>
                          </button>
                        </td>
                        <td style={{ padding:"10px 14px" }}>
                          <button onClick={()=>setSelectedPolicy(p)} style={{ background:"none", border:"none", padding:0, cursor:"pointer", textAlign:"left" as const }}>
                            <span style={{ fontWeight:700, fontSize:12, color:"var(--foreground)", textDecoration:"underline", textDecorationStyle:"dotted" as const }}>{p.name}</span>
                          </button>
                        </td>
                        <td style={{ padding:"10px 14px" }}><Badge label={p.category} /></td>
                        <td style={{ padding:"10px 14px", fontSize:11, color:"var(--muted-foreground)" }}>{p.dueDate}</td>
                        <td style={{ padding:"10px 14px" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                            <div style={{ width:80, height:6, borderRadius:3, background:"rgba(255,255,255,0.1)", overflow:"hidden" }}>
                              <div style={{ width:`${p.ackRate}%`, height:"100%", borderRadius:3, background:sc }} />
                            </div>
                            <span style={{ fontSize:11, fontWeight:700, color:sc }}>{p.ackRate}%</span>
                          </div>
                        </td>
                        <td style={{ padding:"10px 14px", fontSize:11, fontWeight:700, color:EME }}>{p.acked}</td>
                        <td style={{ padding:"10px 14px", fontSize:11, fontWeight:700, color:RED }}>{p.total-p.acked}</td>
                        <td style={{ padding:"10px 14px" }}>
                          <span style={{ fontSize:10, fontWeight:800, padding:"2px 8px", borderRadius:4, background:`${sc}22`, color:sc }}>{sl}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── Training & Awareness ─────────────────────────────────────────── */}
        {tab==="training" && <TrainingTab users={effectiveUsers} trainings={effectiveTrainings} policies={effectivePolicies} />}

        {/* ── RBAC & Roles ─────────────────────────────────────────────────── */}
        {tab==="rbac" && (
          <>
            {/* Stats */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
              <StatCard label="Total Roles"       value={customRoles.length}                                sub="All role definitions"            color={NAV} icon="🔐" />
              <StatCard label="Total Users"        value={effectiveUsers.filter(u=>u.type!=="Non-Human").length}     sub="Human identities"                color={EME} icon="👥" />
              <StatCard label="Privileged Roles"   value={customRoles.filter(r=>["Super Admin","Tenant Admin","CISO"].includes(r.name)).length} sub="Admin-level access" color={AMB} icon="⭐" />
              <StatCard label="Custom Roles"       value={customRoles.filter(r=>!RBAC_ROLES_DEFAULT.find(d=>d.name===r.name)).length} sub="Tenant-created roles" color={PRP} icon="🛠" />
            </div>

            {/* Admin toolbar */}
            {isAdmin ? (
              <div style={{ ...card({ padding:"12px 16px" }), display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", letterSpacing:"0.06em", textTransform:"uppercase" as const }}>Role Management</div>
                <span style={{ fontSize:10, color:"var(--muted-foreground)" }}>Tenant Admin & Super Admin can create custom roles and modify module access</span>
                <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
                  <button onClick={()=>setEditingRole("new")} style={{ padding:"6px 14px", borderRadius:7, border:"1px solid rgba(52,211,153,0.4)", background:"rgba(52,211,153,0.12)", color:EME, fontSize:11, fontWeight:800, cursor:"pointer" }}>+ Create New Role</button>
                </div>
              </div>
            ) : (
              <div style={{ ...card({ padding:"10px 16px" }), display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:14 }}>🔒</span>
                <span style={{ fontSize:11, color:"var(--muted-foreground)" }}>Role management requires <strong style={{ color:AMB }}>Tenant Admin</strong> or <strong style={{ color:AMB }}>Super Admin</strong> access</span>
              </div>
            )}

            {/* Role cards grid */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
              {customRoles.map(r => {
                const isBuiltin = !!RBAC_ROLES_DEFAULT.find(d=>d.name===r.name);
                const isProtected = r.name==="Super Admin"||r.name==="Tenant Admin";
                const accessCount = Object.values(r.permissions).filter(v=>v!=="none").length;
                return (
                  <div key={r.name} style={{ ...card({ padding:"16px 18px" }), display:"flex", flexDirection:"column" as const, gap:10 }}>
                    <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
                      <div style={{ flex:1 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:4 }}>
                          <span style={{ fontSize:13, fontWeight:800, color:"white" }}>{r.name}</span>
                          {!isBuiltin && <span style={{ fontSize:9, fontWeight:800, color:PRP, background:"rgba(196,181,253,0.12)", border:"1px solid rgba(196,181,253,0.25)", borderRadius:4, padding:"1px 5px" }}>CUSTOM</span>}
                          {isProtected && <span style={{ fontSize:9, fontWeight:800, color:AMB, background:"rgba(252,211,77,0.1)", border:"1px solid rgba(252,211,77,0.25)", borderRadius:4, padding:"1px 5px" }}>🔒 SYSTEM</span>}
                        </div>
                        <div style={{ fontSize:10, color:"var(--muted-foreground)", lineHeight:1.4 }}>{r.description}</div>
                      </div>
                    </div>

                    {/* Module access pills */}
                    <div style={{ display:"flex", flexWrap:"wrap" as const, gap:3 }}>
                      {ALL_MODULES_PERM.filter(m=>(r.permissions[m.id]??"none")!=="none").map(m=>{
                        const perm = (r.permissions[m.id]??"none") as "full"|"read"|"limited"|"none";
                        const col = { full:EME, read:NAV, limited:AMB, none:"rgba(148,163,184,0.3)" }[perm];
                        const bg  = { full:"rgba(52,211,153,0.1)", read:"rgba(147,197,253,0.1)", limited:"rgba(252,211,77,0.1)", none:"transparent" }[perm];
                        return (
                          <span key={m.id} title={`${m.label}: ${perm}`} style={{ fontSize:9, fontWeight:700, padding:"2px 6px", borderRadius:3, background:bg, color:col, border:`1px solid ${col}30` }}>
                            {m.icon} {m.label}
                          </span>
                        );
                      })}
                      {accessCount===0 && <span style={{ fontSize:10, color:"var(--muted-foreground)" }}>No module access</span>}
                    </div>

                    {/* Footer */}
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:2 }}>
                      <span style={{ fontSize:10, color:NAV, fontWeight:700 }}>{r.userCount} user{r.userCount!==1?"s":""} · {accessCount}/{ALL_MODULES_PERM.length} modules</span>
                      {isAdmin && (
                        <div style={{ display:"flex", gap:5 }}>
                          <button onClick={()=>setEditingRole(r)} style={{ padding:"3px 9px", borderRadius:5, border:"1px solid rgba(147,197,253,0.3)", background:"rgba(147,197,253,0.08)", color:NAV, fontSize:9, fontWeight:700, cursor:"pointer" }}>Edit</button>
                          {!isProtected && (
                            <button onClick={()=>handleDeleteRole(r.name)} style={{ padding:"3px 9px", borderRadius:5, border:"1px solid rgba(248,113,113,0.3)", background:"rgba(248,113,113,0.07)", color:RED, fontSize:9, fontWeight:700, cursor:"pointer" }}>Delete</button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Permission matrix */}
            <div style={{ border:"1px solid var(--border)", borderRadius:10, overflow:"hidden" }}>
              <div style={{ background:"rgba(30,58,95,0.6)", padding:"10px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <span style={{ fontSize:12, fontWeight:800, letterSpacing:"0.06em" }}>Full Permission Matrix</span>
                <div style={{ display:"flex", gap:12, fontSize:10, color:"rgba(255,255,255,0.6)" }}>
                  {[{label:"Full",bg:"rgba(16,185,129,0.15)",c:EME},{label:"Read",bg:"rgba(59,130,246,0.15)",c:NAV},{label:"Limited",bg:"rgba(245,158,11,0.15)",c:AMB},{label:"None",bg:"var(--secondary)",c:"rgba(255,255,255,0.25)"}].map(l=>(
                    <span key={l.label} style={{ display:"flex", alignItems:"center", gap:4 }}>
                      <span style={{ width:18, height:12, borderRadius:2, background:l.bg, color:l.c, fontSize:7, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center" }}>{l.label[0]}</span>
                      {l.label}
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ overflowX:"auto" as const }}>
                <table style={{ width:"100%", borderCollapse:"collapse" as const }}>
                  <thead>
                    <tr style={{ background:"var(--secondary)" }}>
                      <th style={{ padding:"8px 14px", fontSize:10, fontWeight:800, textAlign:"left" as const, color:"rgba(255,255,255,0.5)", letterSpacing:"0.08em", minWidth:140, borderBottom:"1px solid var(--border)" }}>ROLE</th>
                      {MODULES_RBAC.map(m=>(
                        <th key={m} style={{ padding:"8px 6px", fontSize:9, fontWeight:800, textAlign:"center" as const, color:"rgba(255,255,255,0.5)", letterSpacing:"0.06em", whiteSpace:"nowrap" as const, borderBottom:"1px solid var(--border)" }}>{m}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {customRoles.map((role,ri)=>(
                      <tr key={role.name} onClick={()=>isAdmin&&setEditingRole(role)}
                        style={{ background:ri%2===0?"transparent":"rgba(255,255,255,0.015)", borderBottom:"1px solid rgba(255,255,255,0.05)", cursor:isAdmin?"pointer":"default" }}
                        onMouseEnter={e=>{ if(isAdmin)(e.currentTarget as HTMLTableRowElement).style.background="rgba(59,130,246,0.05)"; }}
                        onMouseLeave={e=>{ (e.currentTarget as HTMLTableRowElement).style.background=ri%2===0?"transparent":"rgba(255,255,255,0.015)"; }}>
                        <td style={{ padding:"8px 14px" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                            <div style={{ fontSize:11, fontWeight:700 }}>{role.name}</div>
                            {!RBAC_ROLES_DEFAULT.find(d=>d.name===role.name) && <span style={{ fontSize:8, color:PRP, background:"rgba(196,181,253,0.12)", borderRadius:3, padding:"1px 4px", fontWeight:700 }}>CUSTOM</span>}
                          </div>
                          <div style={{ fontSize:9, color:"rgba(255,255,255,0.4)", marginTop:1 }}>{role.userCount}u{isAdmin?" · click to edit":""}</div>
                        </td>
                        {MODULES_RBAC.map(m=>(
                          <td key={m} style={{ padding:"6px", textAlign:"center" as const }}>
                            <PermCell val={role.permissions[m]??"none"} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {tab==="workflow" && <WorkflowPipeline workflows={[EMPLOYEE_LIFECYCLE_WF]} />}
      </div>

      {/* Policy detail drawer */}
      {selectedPolicy && (
        <PolicyDetailModal
          policy={selectedPolicy}
          users={effectiveUsers}
          onClose={()=>setSelectedPolicy(null)}
        />
      )}

      {/* Bulk assign modal (from policies / people tab) */}
      {bulkMode && (
        <AssignModal
          mode={bulkMode}
          users={effectiveUsers}
          onClose={()=>setBulkMode(null)}
          policies={effectivePolicies}
          trainings={effectiveTrainings}
        />
      )}

      {/* Role editor modal */}
      {editingRole !== null && (
        <RoleEditorModal
          role={editingRole === "new" ? null : editingRole}
          onSave={handleSaveRole}
          onClose={()=>setEditingRole(null)}
        />
      )}
    </div>
  );
}
