import { randomUUID } from "crypto";

export type AppRisk = "Critical"|"High"|"Medium"|"Low";
export type AppStatus = "approved"|"shadow"|"pending-review"|"blocked";

export interface OAuthScope { scope: string; reason: string; risk: "high"|"medium"|"low"; }
export interface SaasApp {
  id: string; name: string; category: string; vendor: string;
  status: AppStatus; risk: AppRisk; riskScore: number; // 0-100
  users: number; activeUsers: number; adminUsers: number;
  oauthScopes: OAuthScope[]; dataClassification: string;
  ssoEnabled: boolean; mfaEnforced: boolean; singleSignOut: boolean;
  gdprCompliant: boolean; soc2: boolean; iso27001: boolean;
  lastAudit: string; dataResidency: string; contractExpiry?: string;
  monthlyActiveUsers: number[]; // 12-month trend
  createdAt: string; updatedAt: string;
}
export interface UserAppAccess {
  userId: string; userName: string; email: string; dept: string;
  appId: string; appName: string; role: string; permissionLevel: "admin"|"user"|"read-only";
  lastActivity: string; daysSinceActive: number; mfaEnabled: boolean; riskScore: number;
  stale: boolean; // no activity > 90 days
}
export interface ShadowItApp {
  id: string; name: string; category: string; users: number;
  dataRisk: AppRisk; authorized: boolean; gdpr: string; lastSeen: string;
  riskScore: number; discoverySource: string;
}

const SEED_APPS: Omit<SaasApp,"id"|"createdAt"|"updatedAt">[] = [
  { name:"Microsoft 365",    category:"Productivity",  vendor:"Microsoft",  status:"approved", risk:"Medium",   riskScore:42, users:850,  activeUsers:821,  adminUsers:12, oauthScopes:[{scope:"Mail.ReadWrite",reason:"Email integration",risk:"high"},{scope:"User.ReadBasic.All",reason:"Directory sync",risk:"medium"},{scope:"Files.ReadWrite",reason:"SharePoint integration",risk:"high"}], dataClassification:"Confidential", ssoEnabled:true,  mfaEnforced:true,  singleSignOut:true,  gdprCompliant:true,  soc2:true,  iso27001:true,  lastAudit:"2024-08-15", dataResidency:"EU",     contractExpiry:"2025-09-01", monthlyActiveUsers:[800,812,820,815,818,821,825,830,821,819,820,821] },
  { name:"Salesforce CRM",   category:"CRM",           vendor:"Salesforce", status:"approved", risk:"High",     riskScore:68, users:320,  activeUsers:285,  adminUsers:8,  oauthScopes:[{scope:"full",reason:"Full org access",risk:"high"},{scope:"api",reason:"REST API access",risk:"medium"}], dataClassification:"Confidential", ssoEnabled:true,  mfaEnforced:true,  singleSignOut:false, gdprCompliant:true,  soc2:true,  iso27001:true,  lastAudit:"2024-07-01", dataResidency:"US",     contractExpiry:"2025-03-15", monthlyActiveUsers:[260,270,275,280,285,282,284,288,285,286,285,285] },
  { name:"Slack",            category:"Messaging",     vendor:"Slack",      status:"approved", risk:"Medium",   riskScore:38, users:850,  activeUsers:812,  adminUsers:5,  oauthScopes:[{scope:"channels:read",reason:"Channel sync",risk:"low"},{scope:"files:write",reason:"File sharing",risk:"medium"},{scope:"users:read.email",reason:"User directory",risk:"medium"}], dataClassification:"Internal",     ssoEnabled:true,  mfaEnforced:false, singleSignOut:false, gdprCompliant:true,  soc2:true,  iso27001:false, lastAudit:"2024-06-15", dataResidency:"US/EU",  contractExpiry:"2025-06-01", monthlyActiveUsers:[790,800,808,810,812,811,812,815,812,810,812,812] },
  { name:"GitHub Enterprise",category:"Dev Tools",     vendor:"GitHub",     status:"approved", risk:"High",     riskScore:71, users:145,  activeUsers:138,  adminUsers:6,  oauthScopes:[{scope:"repo",reason:"Code access",risk:"high"},{scope:"admin:org",reason:"Org management",risk:"high"},{scope:"workflow",reason:"CI/CD",risk:"medium"}], dataClassification:"Confidential", ssoEnabled:true,  mfaEnforced:true,  singleSignOut:true,  gdprCompliant:true,  soc2:true,  iso27001:true,  lastAudit:"2024-09-01", dataResidency:"US",     contractExpiry:"2025-12-01", monthlyActiveUsers:[130,132,135,138,140,138,139,138,137,138,138,138] },
  { name:"Zoom",             category:"Video Conf",    vendor:"Zoom",       status:"approved", risk:"Low",      riskScore:28, users:850,  activeUsers:740,  adminUsers:3,  oauthScopes:[{scope:"meeting:read",reason:"Meeting access",risk:"low"}], dataClassification:"Internal",     ssoEnabled:true,  mfaEnforced:false, singleSignOut:false, gdprCompliant:true,  soc2:true,  iso27001:false, lastAudit:"2024-05-01", dataResidency:"US/EU",  contractExpiry:"2025-04-01", monthlyActiveUsers:[700,720,730,735,740,738,740,745,740,738,740,740] },
  { name:"Jira (Cloud)",     category:"Project Mgmt",  vendor:"Atlassian",  status:"approved", risk:"Medium",   riskScore:45, users:320,  activeUsers:298,  adminUsers:4,  oauthScopes:[{scope:"read:jira-work",reason:"Issue access",risk:"low"},{scope:"write:jira-work",reason:"Issue creation",risk:"medium"},{scope:"manage:jira-project",reason:"Project admin",risk:"high"}], dataClassification:"Internal",     ssoEnabled:true,  mfaEnforced:true,  singleSignOut:true,  gdprCompliant:true,  soc2:true,  iso27001:true,  lastAudit:"2024-08-01", dataResidency:"EU",     contractExpiry:"2025-07-01", monthlyActiveUsers:[280,285,290,295,298,296,298,300,298,296,298,298] },
  { name:"AWS Console",      category:"Cloud Platform",vendor:"Amazon",     status:"approved", risk:"Critical", riskScore:88, users:45,   activeUsers:38,   adminUsers:12, oauthScopes:[{scope:"sts:AssumeRole",reason:"Role switching",risk:"high"},{scope:"iam:*",reason:"IAM management",risk:"high"}], dataClassification:"Restricted",   ssoEnabled:true,  mfaEnforced:true,  singleSignOut:false, gdprCompliant:true,  soc2:true,  iso27001:true,  lastAudit:"2024-09-10", dataResidency:"Global", contractExpiry:undefined, monthlyActiveUsers:[35,36,38,38,40,38,39,38,38,38,38,38] },
  { name:"Okta (IdP)",       category:"IAM",           vendor:"Okta",       status:"approved", risk:"Critical", riskScore:82, users:850,  activeUsers:848,  adminUsers:6,  oauthScopes:[{scope:"okta.users.manage",reason:"User lifecycle",risk:"high"},{scope:"okta.groups.manage",reason:"Group management",risk:"high"}], dataClassification:"Restricted",   ssoEnabled:false, mfaEnforced:true,  singleSignOut:true,  gdprCompliant:true,  soc2:true,  iso27001:true,  lastAudit:"2024-09-12", dataResidency:"EU",     contractExpiry:"2025-11-01", monthlyActiveUsers:[840,842,845,848,848,848,848,848,848,848,848,848] },
  { name:"Workday",          category:"HR",            vendor:"Workday",    status:"approved", risk:"High",     riskScore:65, users:850,  activeUsers:820,  adminUsers:5,  oauthScopes:[{scope:"wd:employees",reason:"Employee data",risk:"high"},{scope:"wd:payroll",reason:"Payroll access",risk:"high"}], dataClassification:"Restricted",   ssoEnabled:true,  mfaEnforced:true,  singleSignOut:true,  gdprCompliant:true,  soc2:true,  iso27001:true,  lastAudit:"2024-08-20", dataResidency:"EU",     contractExpiry:"2026-01-01", monthlyActiveUsers:[810,815,818,820,820,820,820,820,820,820,820,820] },
  { name:"Zendesk",          category:"Support",       vendor:"Zendesk",    status:"approved", risk:"Medium",   riskScore:52, users:85,   activeUsers:78,   adminUsers:3,  oauthScopes:[{scope:"read",reason:"Ticket access",risk:"low"},{scope:"write",reason:"Ticket management",risk:"medium"},{scope:"tickets:read",reason:"All tickets",risk:"medium"}], dataClassification:"Confidential", ssoEnabled:true,  mfaEnforced:false, singleSignOut:false, gdprCompliant:true,  soc2:true,  iso27001:false, lastAudit:"2024-07-15", dataResidency:"US",     contractExpiry:"2025-08-01", monthlyActiveUsers:[72,74,76,78,78,77,78,79,78,77,78,78] },
];

const SEED_SHADOW: Omit<ShadowItApp,"id">[] = [
  { name:"Notion",            category:"Productivity", users:47,  dataRisk:"Medium",   authorized:false, gdpr:"EU ✓",   lastSeen:"Today",  riskScore:42, discoverySource:"Proxy logs" },
  { name:"ChatGPT (OpenAI)", category:"AI Tools",     users:134, dataRisk:"High",     authorized:false, gdpr:"US only",lastSeen:"Today",  riskScore:78, discoverySource:"DLP alerts" },
  { name:"Dropbox",          category:"File Sharing", users:28,  dataRisk:"High",     authorized:false, gdpr:"Unknown",lastSeen:"2d ago", riskScore:72, discoverySource:"Email headers" },
  { name:"Trello",           category:"Project Mgmt", users:19,  dataRisk:"Low",      authorized:false, gdpr:"US/EU",  lastSeen:"4d ago", riskScore:22, discoverySource:"Proxy logs" },
  { name:"Personal Gmail",   category:"Email",        users:8,   dataRisk:"Critical", authorized:false, gdpr:"Unknown",lastSeen:"Today",  riskScore:91, discoverySource:"DLP alerts" },
  { name:"Canva",            category:"Design",       users:22,  dataRisk:"Low",      authorized:false, gdpr:"US/EU",  lastSeen:"3d ago", riskScore:18, discoverySource:"Proxy logs" },
  { name:"WhatsApp Web",     category:"Messaging",    users:61,  dataRisk:"High",     authorized:false, gdpr:"Unknown",lastSeen:"Today",  riskScore:82, discoverySource:"Proxy logs" },
  { name:"Claude (Anthropic)",category:"AI Tools",    users:89,  dataRisk:"High",     authorized:false, gdpr:"US only",lastSeen:"Today",  riskScore:76, discoverySource:"DLP alerts" },
  { name:"Telegram",         category:"Messaging",    users:34,  dataRisk:"High",     authorized:false, gdpr:"Unknown",lastSeen:"Today",  riskScore:85, discoverySource:"DNS logs" },
  { name:"WeTransfer",       category:"File Sharing", users:12,  dataRisk:"Medium",   authorized:false, gdpr:"EU ✓",   lastSeen:"1d ago", riskScore:45, discoverySource:"Proxy logs" },
];

const SEED_USER_ACCESS: Omit<UserAppAccess,"userId">[] = [
  { userName:"Sarah Chen",   email:"ciso@acme.com",    dept:"Security",    appId:"app-7", appName:"AWS Console",       role:"Admin",       permissionLevel:"admin",     lastActivity:"Today",      daysSinceActive:0,  mfaEnabled:true,  riskScore:88, stale:false },
  { userName:"Alex Kim",     email:"admin@acme.com",   dept:"IT Ops",      appId:"app-7", appName:"AWS Console",       role:"Admin",       permissionLevel:"admin",     lastActivity:"Today",      daysSinceActive:0,  mfaEnabled:true,  riskScore:88, stale:false },
  { userName:"Marcus Johnson",email:"analyst@acme.com",dept:"IT Ops",      appId:"app-8", appName:"Okta (IdP)",        role:"Super Admin", permissionLevel:"admin",     lastActivity:"2 days ago", daysSinceActive:2,  mfaEnabled:true,  riskScore:82, stale:false },
  { userName:"Ryan Johnson", email:"ryan@acme.com",    dept:"Engineering", appId:"app-4", appName:"GitHub Enterprise", role:"Owner",       permissionLevel:"admin",     lastActivity:"Today",      daysSinceActive:0,  mfaEnabled:true,  riskScore:71, stale:false },
  { userName:"Priya Lee",    email:"priya@acme.com",   dept:"IT Ops",      appId:"app-2", appName:"Salesforce CRM",    role:"System Admin",permissionLevel:"admin",     lastActivity:"5 days ago", daysSinceActive:5,  mfaEnabled:true,  riskScore:68, stale:false },
  { userName:"Tom Bradley",  email:"tom.b@acme.com",   dept:"Sales",       appId:"app-2", appName:"Salesforce CRM",    role:"User",        permissionLevel:"user",      lastActivity:"91 days ago",daysSinceActive:91, mfaEnabled:false, riskScore:55, stale:true  },
  { userName:"Alice Wong",   email:"alice@acme.com",   dept:"Finance",     appId:"app-1", appName:"Microsoft 365",     role:"Global Admin",permissionLevel:"admin",     lastActivity:"Today",      daysSinceActive:0,  mfaEnabled:true,  riskScore:72, stale:false },
  { userName:"Bob Martins",  email:"bob.m@acme.com",   dept:"Marketing",   appId:"app-3", appName:"Slack",             role:"Admin",       permissionLevel:"admin",     lastActivity:"120 days ago",daysSinceActive:120,mfaEnabled:false, riskScore:61, stale:true  },
  { userName:"Carol Smith",  email:"carol@acme.com",   dept:"Engineering", appId:"app-4", appName:"GitHub Enterprise", role:"Member",      permissionLevel:"user",      lastActivity:"Today",      daysSinceActive:0,  mfaEnabled:true,  riskScore:28, stale:false },
  { userName:"Dave Torres",  email:"dave@acme.com",    dept:"Finance",     appId:"app-9", appName:"Workday",           role:"HR Admin",    permissionLevel:"admin",     lastActivity:"3 days ago", daysSinceActive:3,  mfaEnabled:true,  riskScore:65, stale:false },
  { userName:"Eva Müller",   email:"eva@acme.com",     dept:"Legal",       appId:"app-2", appName:"Salesforce CRM",    role:"Read-Only",   permissionLevel:"read-only", lastActivity:"95 days ago",daysSinceActive:95, mfaEnabled:false, riskScore:30, stale:true  },
  { userName:"Frank Liu",    email:"frank@acme.com",   dept:"Engineering", appId:"app-7", appName:"AWS Console",       role:"Developer",   permissionLevel:"user",      lastActivity:"Today",      daysSinceActive:0,  mfaEnabled:true,  riskScore:52, stale:false },
];

const appStore    = new Map<string, SaasApp[]>();
const shadowStore = new Map<string, ShadowItApp[]>();
const accessStore = new Map<string, UserAppAccess[]>();

function mkApps(tid: string): SaasApp[] {
  const now = new Date().toISOString().slice(0, 10);
  return SEED_APPS.map((a, i) => ({ ...a, id: `app-${i+1}`, createdAt: now, updatedAt: now }));
}
function tenantApps(tid: string): SaasApp[] {
  if (!appStore.has(tid)) appStore.set(tid, tid === "1" ? mkApps(tid) : []);
  return appStore.get(tid)!;
}
function tenantShadow(tid: string): ShadowItApp[] {
  if (!shadowStore.has(tid)) shadowStore.set(tid, tid === "1" ? SEED_SHADOW.map((s, i) => ({ ...s, id: `SHD-${String(i+1).padStart(3,"0")}` })) : []);
  return shadowStore.get(tid)!;
}
function tenantAccess(tid: string): UserAppAccess[] {
  if (!accessStore.has(tid)) accessStore.set(tid, tid === "1" ? SEED_USER_ACCESS.map((u, i) => ({ ...u, userId: `USR-${String(i+1).padStart(3,"0")}` })) : []);
  return accessStore.get(tid)!;
}

export class SspmService {
  getApps(tenantId: string, status?: AppStatus): SaasApp[] {
    const list = tenantApps(tenantId);
    return status ? list.filter(a => a.status === status) : list;
  }
  getApp(tenantId: string, id: string): SaasApp | undefined {
    return tenantApps(tenantId).find(a => a.id === id);
  }
  updateAppStatus(tenantId: string, id: string, status: AppStatus): SaasApp | null {
    const a = tenantApps(tenantId).find(x => x.id === id);
    if (!a) return null;
    a.status = status;
    a.updatedAt = new Date().toISOString().slice(0, 10);
    return a;
  }
  getShadowIt(tenantId: string): ShadowItApp[] { return tenantShadow(tenantId); }
  approveApp(tenantId: string, id: string): ShadowItApp | null {
    const a = tenantShadow(tenantId).find(x => x.id === id);
    if (!a) return null;
    a.authorized = true;
    return a;
  }
  getUserAccess(tenantId: string, appId?: string, staleOnly?: boolean): UserAppAccess[] {
    let list = tenantAccess(tenantId);
    if (appId) list = list.filter(u => u.appId === appId);
    if (staleOnly) list = list.filter(u => u.stale);
    return list;
  }
  getStats(tenantId: string) {
    const apps   = tenantApps(tenantId);
    const shadow = tenantShadow(tenantId);
    const access = tenantAccess(tenantId);
    return {
      totalApps:   apps.length, approvedApps: apps.filter(a=>a.status==="approved").length,
      shadowApps:  shadow.length,
      criticalApps:apps.filter(a=>a.risk==="Critical").length,
      staleAccounts: access.filter(u=>u.stale).length,
      noMfaAdmins: access.filter(u=>u.permissionLevel==="admin"&&!u.mfaEnabled).length,
      totalUsers:  [...new Set(access.map(u=>u.userId))].length,
      avgRiskScore: Math.round(apps.reduce((s,a)=>s+a.riskScore,0)/apps.length),
    };
  }
}
export const sspmService = new SspmService();
