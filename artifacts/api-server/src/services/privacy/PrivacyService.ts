// Privacy Service — in-memory seed store
// Covers: RoPA, PIA/DPIA, Privacy Notices, DSAR (with SLA), Consent, DPA Tracker

export interface RopaRecord {
  id: string; tenantId: string; activity: string; controller: string; processor?: string;
  purpose: string; legalBasis: string; dataSubjects: string; categories: string[];
  countries: string[]; retention: string; recipients: string[]; technicalMeasures: string[];
  organisationalMeasures: string[]; dpoReviewed: boolean; lastUpdated: string;
  nextReview: string; status: "active"|"in-review"|"archived"; risk: "Critical"|"High"|"Medium"|"Low";
  article30Compliant: boolean; notes: string;
}

export interface DpiaStep {
  step: number; title: string; status: "complete"|"in-progress"|"pending"; assignee: string; notes: string;
}
export interface Dpia {
  id: string; tenantId: string; dpiaId: string; name: string; risk: "Critical"|"High"|"Medium"|"Low";
  owner: string; updated: string; status: "draft"|"in-review"|"approved"|"rejected";
  processingActivity: string; dataTypes: string[]; thresholdMet: boolean;
  steps: DpiaStep[]; residualRisk: string; dpoApproval: string; approvalDate?: string;
}

export interface PrivacyNotice {
  id: string; tenantId: string; noticeId: string; name: string; channel: string;
  version: string; publishedAt: string; lastModified: string; status: "live"|"draft"|"archived";
  languages: string[]; categories: string[]; dpoApproved: boolean;
  versionHistory: { v: string; date: string; author: string; summary: string }[];
  diff?: { added: string[]; removed: string[]; changed: string[] };
}

export interface DsarRecord {
  id: string; tenantId: string; dsarId: string; type: string; subject: string;
  subjectType: string; received: string; due: string; regulation: string; slaHours: number;
  status: "Received"|"Verifying"|"Searching"|"Reviewing"|"Completed"|"Overdue";
  daysLeft: number; assignee: string; verificationMethod: string; notes: string;
  extensions: number; extensionDays: number; responseMethod: string;
}

export interface ConsentRecord {
  id: string; tenantId: string; consentId: string; subject: string; category: string;
  channel: string; given: string; expires: string; withdrawn?: string;
  status: "active"|"expired"|"withdrawn"; source: string; ipAddress: string;
  lawfulBasis: string; version: string; purposeDescription: string;
}

export interface DpaRecord {
  id: string; tenantId: string; dpaId: string; vendor: string; vendorCountry: string;
  dataTypes: string[]; purpose: string; agreementDate: string; expiryDate: string;
  renewalDays: number; status: "active"|"expiring-soon"|"expired"|"under-review";
  transferMechanism: string; sccs: boolean; risk: "Low"|"Medium"|"High"|"Critical";
  subProcessors: string[]; dpoSigned: boolean; lastAudited: string; notes?: string;
}

// ── Seed Data ─────────────────────────────────────────────────────────────────

const seed_ropa: Omit<RopaRecord,"tenantId">[] = [
  { id:"ROPA-001", activity:"Employee HR Data Processing",    controller:"Acme Corporation", processor:"ADP Payroll",      purpose:"Employment management",         legalBasis:"Contract",            dataSubjects:"Employees",     categories:["Personal","HR","Financial"],      countries:["ES","US"],     retention:"7 years",    recipients:["ADP","Payroll Provider"], technicalMeasures:["Encryption at rest","Access controls"], organisationalMeasures:["HR policy","Data minimisation"], dpoReviewed:true,  lastUpdated:"2026-02-01", nextReview:"2027-02-01", status:"active",    risk:"Low",      article30Compliant:true,  notes:"Routine payroll" },
  { id:"ROPA-002", activity:"Customer Analytics",             controller:"Acme Corporation",                               purpose:"Business intelligence",         legalBasis:"Legitimate interest", dataSubjects:"Customers",     categories:["Personal","Behavioral","Device"],  countries:["ES","US","UK"],retention:"2 years",    recipients:["Google Analytics","Mixpanel"], technicalMeasures:["Pseudonymisation","TLS"], organisationalMeasures:["Analytics policy"], dpoReviewed:true,  lastUpdated:"2026-01-15", nextReview:"2026-07-15", status:"active",    risk:"High",     article30Compliant:true,  notes:"LIA balance test needed" },
  { id:"ROPA-003", activity:"AI Vendor Data Sharing",         controller:"Acme Corporation", processor:"OpenAI Inc.",      purpose:"AI model inference",            legalBasis:"Consent",             dataSubjects:"Users",         categories:["Personal","AI training","Content"],countries:["US"],         retention:"1 year",     recipients:["OpenAI"], technicalMeasures:["API encryption","Data minimisation"], organisationalMeasures:["AI ethics policy","DPA"], dpoReviewed:false, lastUpdated:"2026-03-20", nextReview:"2026-04-20", status:"in-review", risk:"Critical", article30Compliant:false, notes:"DPA not yet executed — in-review" },
  { id:"ROPA-004", activity:"Email Marketing",                controller:"Acme Corporation", processor:"Mailchimp",        purpose:"Marketing communications",      legalBasis:"Consent",             dataSubjects:"Prospects",     categories:["Email","Behavioral"],             countries:["ES","EU"],    retention:"3 years",    recipients:["Mailchimp"], technicalMeasures:["Double opt-in","TLS"], organisationalMeasures:["Marketing consent policy"], dpoReviewed:true,  lastUpdated:"2026-01-10", nextReview:"2027-01-10", status:"active",    risk:"Medium",   article30Compliant:true,  notes:"" },
  { id:"ROPA-005", activity:"Security Monitoring (SIEM)",     controller:"Acme Corporation",                               purpose:"Incident detection & response", legalBasis:"Legitimate interest", dataSubjects:"Employees",     categories:["Access logs","Network","Behavioral"],countries:["ES"],      retention:"1 year",     recipients:[], technicalMeasures:["SIEM encryption","Role-based access"], organisationalMeasures:["Security policy","Acceptable use"], dpoReviewed:true,  lastUpdated:"2025-12-01", nextReview:"2026-12-01", status:"active",    risk:"Medium",   article30Compliant:true,  notes:"" },
  { id:"ROPA-006", activity:"Recruitment Data Processing",    controller:"Acme Corporation", processor:"Greenhouse ATS",   purpose:"Candidate assessment",          legalBasis:"Pre-contract",        dataSubjects:"Candidates",    categories:["Personal","HR","Assessment"],      countries:["ES"],         retention:"6 months",   recipients:["Greenhouse"], technicalMeasures:["Access controls","Encryption"], organisationalMeasures:["Recruitment policy"], dpoReviewed:true,  lastUpdated:"2026-01-20", nextReview:"2027-01-20", status:"active",    risk:"Low",      article30Compliant:true,  notes:"" },
  { id:"ROPA-007", activity:"Customer Support (CRM)",         controller:"Acme Corporation", processor:"Zendesk",          purpose:"Support ticket resolution",     legalBasis:"Contract",            dataSubjects:"Customers",     categories:["Personal","Communication"],        countries:["US","EU"],    retention:"3 years",    recipients:["Zendesk"], technicalMeasures:["TLS","Encryption at rest"], organisationalMeasures:["Support SLA policy"], dpoReviewed:true,  lastUpdated:"2026-02-14", nextReview:"2027-02-14", status:"active",    risk:"Low",      article30Compliant:true,  notes:"" },
  { id:"ROPA-008", activity:"Biometric Access Control",       controller:"Acme Corporation",                               purpose:"Physical security",              legalBasis:"Legitimate interest", dataSubjects:"Employees",     categories:["Biometric","Location"],           countries:["ES"],         retention:"30 days",    recipients:[], technicalMeasures:["On-prem storage","Encryption"], organisationalMeasures:["Biometric policy","Consent notice"], dpoReviewed:false, lastUpdated:"2026-03-01", nextReview:"2026-06-01", status:"in-review", risk:"High",     article30Compliant:false, notes:"Art 9 special category — DPIA required" },
];

const seed_dpias: Omit<Dpia,"tenantId">[] = [
  { id:"DPIA-001", dpiaId:"DPIA-001", name:"AI Vendor Integration Assessment",      risk:"Critical", owner:"Sarah Chen",    updated:"2026-03-20", status:"in-review",  processingActivity:"AI Vendor Data Sharing",     dataTypes:["PII","Behavioral","Content"], thresholdMet:true,  residualRisk:"High",  dpoApproval:"Pending", steps:[
    { step:1, title:"Describe the processing",      status:"complete",    assignee:"Sarah Chen",    notes:"Documented AI inference pipeline" },
    { step:2, title:"Assess necessity/proportionality",status:"complete", assignee:"Sarah Chen",    notes:"Minimal data transfer confirmed" },
    { step:3, title:"Identify & assess risks",      status:"in-progress", assignee:"Priya Patel",   notes:"Profiling and automated decision risks identified" },
    { step:4, title:"Identify mitigation measures", status:"pending",     assignee:"Priya Patel",   notes:"" },
    { step:5, title:"DPO consultation",             status:"pending",     assignee:"DPO",           notes:"" },
    { step:6, title:"Sign-off & approval",          status:"pending",     assignee:"CISO / DPO",    notes:"" },
  ]},
  { id:"DPIA-002", dpiaId:"DPIA-002", name:"Biometric Access Control System",       risk:"High",     owner:"Marcus Johnson",updated:"2026-03-01", status:"draft",      processingActivity:"Biometric Access Control",   dataTypes:["Biometric","Location"],       thresholdMet:true,  residualRisk:"Medium",dpoApproval:"Not started", steps:[
    { step:1, title:"Describe the processing",      status:"complete",    assignee:"Marcus Johnson",notes:"Badge reader + face recognition at DC1" },
    { step:2, title:"Assess necessity/proportionality",status:"in-progress",assignee:"Marcus Johnson",notes:"Evaluating alternatives" },
    { step:3, title:"Identify & assess risks",      status:"pending",     assignee:"Priya Patel",   notes:"" },
    { step:4, title:"Identify mitigation measures", status:"pending",     assignee:"Priya Patel",   notes:"" },
    { step:5, title:"DPO consultation",             status:"pending",     assignee:"DPO",           notes:"" },
    { step:6, title:"Sign-off & approval",          status:"pending",     assignee:"CISO / DPO",    notes:"" },
  ]},
  { id:"DPIA-003", dpiaId:"DPIA-003", name:"Customer Behavioral Profiling",         risk:"High",     owner:"Priya Patel",   updated:"2026-01-10", status:"approved",   processingActivity:"Customer Analytics",         dataTypes:["Behavioral","Device"],        thresholdMet:true,  residualRisk:"Low",   dpoApproval:"Approved", approvalDate:"2026-01-25", steps:[
    { step:1, title:"Describe the processing",      status:"complete",    assignee:"Tom Hughes",    notes:"GA4 + Mixpanel integration documented" },
    { step:2, title:"Assess necessity/proportionality",status:"complete", assignee:"Tom Hughes",    notes:"Confirmed minimal — no direct ID" },
    { step:3, title:"Identify & assess risks",      status:"complete",    assignee:"Priya Patel",   notes:"Low re-identification risk" },
    { step:4, title:"Identify mitigation measures", status:"complete",    assignee:"Priya Patel",   notes:"IP anonymisation, short retention" },
    { step:5, title:"DPO consultation",             status:"complete",    assignee:"DPO",           notes:"DPO reviewed and approved" },
    { step:6, title:"Sign-off & approval",          status:"complete",    assignee:"CISO",          notes:"Approved 25-Jan-2026" },
  ]},
];

const seed_notices: Omit<PrivacyNotice,"tenantId">[] = [
  { id:"NOT-001", noticeId:"NOT-001", name:"Website Privacy Policy",       channel:"Website",      version:"3.2", publishedAt:"2026-01-15", lastModified:"2026-03-01", status:"live",     languages:["EN","ES","FR"], categories:["Analytics","Marketing","Contact"], dpoApproved:true,  versionHistory:[{ v:"3.2", date:"2026-03-01", author:"Sarah Chen",  summary:"Updated AI data sharing section (Art 22)" },{ v:"3.1", date:"2025-10-10", author:"DPO",        summary:"Added India DPDP requirements" },{ v:"3.0", date:"2025-04-01", author:"Legal",       summary:"Full rewrite for NIS2 compliance" }], diff:{ added:["AI inference disclosure","Third-country safeguards section"], removed:["Legacy cookie consent text"], changed:["Retention periods updated","DPO contact updated"] } },
  { id:"NOT-002", noticeId:"NOT-002", name:"Employee Privacy Notice",      channel:"HR Portal",    version:"2.1", publishedAt:"2025-09-01", lastModified:"2026-02-10", status:"live",     languages:["EN","ES"],      categories:["HR","Payroll","Monitoring"],       dpoApproved:true,  versionHistory:[{ v:"2.1", date:"2026-02-10", author:"HR",          summary:"Added biometric processing section" },{ v:"2.0", date:"2025-09-01", author:"DPO",        summary:"GDPR Art 88 update" }], diff:{ added:["Biometric data section","Monitoring disclosure"], removed:[], changed:["Retention schedule updated"] } },
  { id:"NOT-003", noticeId:"NOT-003", name:"Cookie Consent Banner",        channel:"Website",      version:"1.4", publishedAt:"2026-02-01", lastModified:"2026-03-15", status:"draft",    languages:["EN","ES","DE","FR"], categories:["Cookies","Analytics","Marketing"], dpoApproved:false, versionHistory:[{ v:"1.4", date:"2026-03-15", author:"Product",     summary:"Granular consent per category" },{ v:"1.3", date:"2025-11-01", author:"Legal",       summary:"Updated for ePrivacy alignment" }], diff:{ added:["Granular category toggles","Reject-all button"], removed:["Accept-all-only mode"], changed:["Banner language simplified"] } },
  { id:"NOT-004", noticeId:"NOT-004", name:"Marketing Consent Notice",     channel:"Email / App", version:"1.2", publishedAt:"2025-06-01", lastModified:"2025-12-01", status:"live",     languages:["EN"],            categories:["Marketing","Profiling"],          dpoApproved:true,  versionHistory:[{ v:"1.2", date:"2025-12-01", author:"Marketing",   summary:"Added profiling opt-out" }], diff:{ added:["Profiling opt-out right"], removed:[], changed:[] } },
];

const seed_dsars: Omit<DsarRecord,"tenantId">[] = [
  { id:"DSR-0001", dsarId:"DSR-0314", type:"Access",        subject:"john.doe@example.com",     subjectType:"Customer",  received:"2026-06-01", due:"2026-07-01", regulation:"GDPR",     slaHours:720, status:"Searching",  daysLeft:18, assignee:"Priya Patel",   verificationMethod:"Email OTP", notes:"Requesting all account data + processing records", extensions:0, extensionDays:0,  responseMethod:"Secure portal" },
  { id:"DSR-0002", dsarId:"DSR-0313", type:"Erasure",       subject:"jane.smith@example.com",   subjectType:"Customer",  received:"2026-05-28", due:"2026-06-28", regulation:"GDPR",     slaHours:720, status:"Reviewing",  daysLeft:8,  assignee:"Priya Patel",   verificationMethod:"ID upload",  notes:"Deletion requested — customer left EU", extensions:0, extensionDays:0,  responseMethod:"Email" },
  { id:"DSR-0003", dsarId:"DSR-0312", type:"Portability",   subject:"bob.jones@example.com",    subjectType:"Customer",  received:"2026-05-15", due:"2026-06-15", regulation:"GDPR",     slaHours:720, status:"Completed",  daysLeft:0,  assignee:"Marcus Johnson",verificationMethod:"Email OTP", notes:"JSON export delivered", extensions:0, extensionDays:0,  responseMethod:"Download link" },
  { id:"DSR-0004", dsarId:"DSR-0311", type:"Rectification", subject:"alice.wu@example.com",     subjectType:"Employee",  received:"2026-05-10", due:"2026-06-10", regulation:"GDPR",     slaHours:720, status:"Overdue",    daysLeft:-4, assignee:"Priya Patel",   verificationMethod:"HR portal",  notes:"Address and name correction — stalled awaiting HR", extensions:0, extensionDays:0,  responseMethod:"Portal" },
  { id:"DSR-0005", dsarId:"DSR-0310", type:"Restriction",   subject:"miguel.garcia@corp.com",   subjectType:"Customer",  received:"2026-06-03", due:"2026-07-03", regulation:"GDPR",     slaHours:720, status:"Verifying",  daysLeft:20, assignee:"Priya Patel",   verificationMethod:"Email OTP", notes:"Processing restriction pending dispute resolution", extensions:0, extensionDays:0,  responseMethod:"Secure portal" },
  { id:"DSR-0006", dsarId:"DSR-0309", type:"Objection",     subject:"sophie.m@domain.eu",       subjectType:"Customer",  received:"2026-05-25", due:"2026-06-25", regulation:"GDPR",     slaHours:720, status:"Reviewing",  daysLeft:5,  assignee:"Marcus Johnson",verificationMethod:"Email OTP", notes:"Objection to profiling for marketing", extensions:0, extensionDays:0,  responseMethod:"Email" },
  { id:"DSR-0007", dsarId:"DSR-0308", type:"Access",        subject:"carlos.r@california.us",  subjectType:"Consumer",  received:"2026-06-05", due:"2026-07-20", regulation:"CCPA",     slaHours:1080,status:"Received",   daysLeft:37, assignee:"Tom Hughes",    verificationMethod:"Email link", notes:"CA consumer request — 45 day SLA", extensions:0, extensionDays:0,  responseMethod:"Email" },
  { id:"DSR-0008", dsarId:"DSR-0307", type:"Do Not Sell",   subject:"anita.r@texas.us",         subjectType:"Consumer",  received:"2026-06-08", due:"2026-07-08", regulation:"CCPA",     slaHours:720, status:"Searching",  daysLeft:25, assignee:"Tom Hughes",    verificationMethod:"Phone OTP",  notes:"CCPA opt-out of data sale/sharing", extensions:0, extensionDays:0,  responseMethod:"Email" },
];

const seed_consent: Omit<ConsentRecord,"tenantId">[] = [
  { id:"CNS-0001", consentId:"CNS-0001", subject:"john.doe@example.com",  category:"Email marketing",      channel:"Email",   given:"2025-11-01", expires:"2026-11-01", status:"active",    source:"Website signup",   ipAddress:"82.45.23.101", lawfulBasis:"Consent (Art 6.1.a)", version:"3.1", purposeDescription:"Promotional newsletters and product updates" },
  { id:"CNS-0002", consentId:"CNS-0002", subject:"jane.smith@example.com",category:"Email marketing",      channel:"Email",   given:"2025-10-15", expires:"2026-10-15", status:"active",    source:"Checkout form",    ipAddress:"98.112.4.12",  lawfulBasis:"Consent (Art 6.1.a)", version:"3.0", purposeDescription:"Order confirmations and offers" },
  { id:"CNS-0003", consentId:"CNS-0003", subject:"bob.jones@example.com", category:"Analytics tracking",   channel:"Web",     given:"2025-09-20", expires:"2026-09-20", status:"active",    source:"Cookie banner",    ipAddress:"71.23.45.67",  lawfulBasis:"Consent (Art 6.1.a)", version:"3.0", purposeDescription:"Google Analytics and Hotjar session recording" },
  { id:"CNS-0004", consentId:"CNS-0004", subject:"alice.wu@example.com",  category:"Profiling",            channel:"App",     given:"2022-04-10", expires:"2023-04-10", status:"expired",   source:"Account settings", ipAddress:"192.168.1.5",  lawfulBasis:"Consent (Art 6.1.a)", version:"1.2", purposeDescription:"Personalized product recommendations" },
  { id:"CNS-0005", consentId:"CNS-0005", subject:"miguel.garcia@corp.com",category:"Email marketing",      channel:"Email",   given:"—",          expires:"—",          status:"withdrawn", withdrawn:"2026-05-20", source:"Unsubscribe",    ipAddress:"—",            lawfulBasis:"Consent (Art 6.1.a)", version:"3.1", purposeDescription:"Withdrew email marketing consent via unsubscribe" },
  { id:"CNS-0006", consentId:"CNS-0006", subject:"sophie.m@domain.eu",    category:"Third party sharing",  channel:"Web",     given:"2026-01-12", expires:"2027-01-12", status:"active",    source:"Cookie banner",    ipAddress:"81.33.12.99",  lawfulBasis:"Consent (Art 6.1.a)", version:"3.2", purposeDescription:"Data sharing with ad partners for retargeting" },
  { id:"CNS-0007", consentId:"CNS-0007", subject:"raj.k@india.in",        category:"Email marketing",      channel:"App",     given:"2026-04-01", expires:"2027-04-01", status:"active",    source:"App onboarding",   ipAddress:"103.21.56.78", lawfulBasis:"Consent (DPDP S.6)", version:"1.0", purposeDescription:"Product updates — India DPDP consent notice" },
  { id:"CNS-0008", consentId:"CNS-0008", subject:"fatima.al@ksa.sa",      category:"Analytics tracking",   channel:"Web",     given:"2026-03-10", expires:"2027-03-10", status:"active",    source:"Cookie banner",    ipAddress:"212.32.44.18", lawfulBasis:"Consent (SAMA)", version:"3.2", purposeDescription:"Website analytics tracking — KSA consent" },
];

const seed_dpas: Omit<DpaRecord,"tenantId">[] = [
  { id:"DPA-001", dpaId:"DPA-001", vendor:"OpenAI Inc.",         vendorCountry:"US", dataTypes:["PII","Behavioral","Content"],   purpose:"AI model inference",             agreementDate:"2026-01-15", expiryDate:"2027-01-15", renewalDays:30, status:"active",         transferMechanism:"SCCs (EU-US)",    sccs:true,  risk:"Critical", subProcessors:["Azure (Microsoft)"], dpoSigned:false, lastAudited:"2026-02-01" },
  { id:"DPA-002", dpaId:"DPA-002", vendor:"ADP Payroll",         vendorCountry:"US", dataTypes:["Personal","Financial","HR"],    purpose:"Payroll processing",             agreementDate:"2024-03-01", expiryDate:"2026-07-01", renewalDays:90, status:"expiring-soon", transferMechanism:"SCCs (EU-US)",    sccs:true,  risk:"High",     subProcessors:[],                     dpoSigned:true,  lastAudited:"2025-03-01" },
  { id:"DPA-003", dpaId:"DPA-003", vendor:"Mailchimp (Intuit)",  vendorCountry:"US", dataTypes:["Email","Behavioral"],           purpose:"Email marketing platform",       agreementDate:"2023-06-01", expiryDate:"2026-06-01", renewalDays:60, status:"expiring-soon", transferMechanism:"SCCs (EU-US)",    sccs:true,  risk:"Medium",   subProcessors:["Mandrill"],           dpoSigned:true,  lastAudited:"2025-06-01" },
  { id:"DPA-004", dpaId:"DPA-004", vendor:"Zendesk",             vendorCountry:"US", dataTypes:["Personal","Communication"],     purpose:"Customer support CRM",           agreementDate:"2024-01-10", expiryDate:"2027-01-10", renewalDays:60, status:"active",         transferMechanism:"SCCs (EU-US)",    sccs:true,  risk:"Medium",   subProcessors:["AWS"],                dpoSigned:true,  lastAudited:"2025-01-10" },
  { id:"DPA-005", dpaId:"DPA-005", vendor:"Google (Analytics)",  vendorCountry:"US", dataTypes:["Behavioral","Device","IP"],     purpose:"Website analytics",              agreementDate:"2024-04-01", expiryDate:"2026-04-01", renewalDays:60, status:"expired",         transferMechanism:"Adequacy — no",  sccs:false, risk:"High",     subProcessors:["Google GCP"],         dpoSigned:false, lastAudited:"—" },
  { id:"DPA-006", dpaId:"DPA-006", vendor:"Greenhouse",          vendorCountry:"US", dataTypes:["Personal","HR","Assessment"],   purpose:"Applicant tracking",             agreementDate:"2025-02-01", expiryDate:"2028-02-01", renewalDays:90, status:"active",         transferMechanism:"SCCs (EU-US)",    sccs:true,  risk:"Low",      subProcessors:[],                     dpoSigned:true,  lastAudited:"2026-02-01" },
  { id:"DPA-007", dpaId:"DPA-007", vendor:"Hotjar",              vendorCountry:"MT", dataTypes:["Behavioral","Device","Recordings"],purpose:"Session recording & heatmaps",  agreementDate:"2024-08-01", expiryDate:"2026-08-01", renewalDays:60, status:"under-review",  transferMechanism:"EU-EU (Malta)",  sccs:false, risk:"Medium",   subProcessors:["AWS"],                dpoSigned:true,  lastAudited:"2025-08-01" },
];

const PRIVACY_SERVICE_VERSION = "1.0.0";

export class PrivacyService {
  private ropaByTenant   = new Map<string, RopaRecord[]>();
  private dpiasByTenant  = new Map<string, Dpia[]>();
  private noticesByTenant= new Map<string, PrivacyNotice[]>();
  private dsarsByTenant  = new Map<string, DsarRecord[]>();
  private consentByTenant= new Map<string, ConsentRecord[]>();
  private dpasByTenant   = new Map<string, DpaRecord[]>();
  readonly version = PRIVACY_SERVICE_VERSION;

  private ensureTenant(tid: string) {
    const isSeeded = tid === "1";
    if (!this.ropaByTenant.has(tid))    this.ropaByTenant.set(tid,    isSeeded ? seed_ropa.map(r=>({...r, tenantId:tid}))    : []);
    if (!this.dpiasByTenant.has(tid))   this.dpiasByTenant.set(tid,   isSeeded ? seed_dpias.map(d=>({...d, tenantId:tid}))   : []);
    if (!this.noticesByTenant.has(tid)) this.noticesByTenant.set(tid, isSeeded ? seed_notices.map(n=>({...n, tenantId:tid})) : []);
    if (!this.dsarsByTenant.has(tid))   this.dsarsByTenant.set(tid,   isSeeded ? seed_dsars.map(d=>({...d, tenantId:tid}))   : []);
    if (!this.consentByTenant.has(tid)) this.consentByTenant.set(tid, isSeeded ? seed_consent.map(c=>({...c, tenantId:tid})) : []);
    if (!this.dpasByTenant.has(tid))    this.dpasByTenant.set(tid,    isSeeded ? seed_dpas.map(d=>({...d, tenantId:tid}))    : []);
  }

  // ── RoPA ──────────────────────────────────────────────────────────────────
  getRopa(tid: string)          { this.ensureTenant(tid); return this.ropaByTenant.get(tid)!; }
  getRopaById(tid: string, id: string) { return this.getRopa(tid).find(r=>r.id===id) ?? null; }
  getRopaStats(tid: string) {
    const r = this.getRopa(tid);
    return {
      total: r.length, active: r.filter(x=>x.status==="active").length,
      inReview: r.filter(x=>x.status==="in-review").length,
      article30Compliant: r.filter(x=>x.article30Compliant).length,
      dpiaRequired: r.filter(x=>x.risk==="Critical"||x.risk==="High").length,
    };
  }

  // ── DPIA ──────────────────────────────────────────────────────────────────
  getDpias(tid: string)         { this.ensureTenant(tid); return this.dpiasByTenant.get(tid)!; }
  getDpiaById(tid: string, id: string) { return this.getDpias(tid).find(d=>d.id===id) ?? null; }

  advanceDpiaStep(tid: string, id: string, stepNum: number, data: { notes?: string; assignee?: string }): Dpia | null {
    const dpia = this.getDpiaById(tid, id);
    if (!dpia) return null;
    const step = dpia.steps.find(s => s.step === stepNum);
    if (!step) return null;
    step.status = "complete";
    if (data.notes) step.notes = data.notes;
    if (data.assignee) step.assignee = data.assignee;
    const nextStep = dpia.steps.find(s => s.step === stepNum + 1);
    if (nextStep && nextStep.status === "pending") nextStep.status = "in-progress";
    dpia.updated = new Date().toISOString().slice(0, 10);
    if (dpia.steps.every(s => s.status === "complete")) dpia.status = "in-review";
    return dpia;
  }

  signOffDpia(tid: string, id: string, data: { approved: boolean; comments?: string }): Dpia | null {
    const dpia = this.getDpiaById(tid, id);
    if (!dpia) return null;
    dpia.status = data.approved ? "approved" : "rejected";
    dpia.dpoApproval = data.approved ? "Approved" : `Rejected: ${data.comments ?? ""}`;
    dpia.approvalDate = new Date().toISOString().slice(0, 10);
    dpia.updated = new Date().toISOString().slice(0, 10);
    return dpia;
  }

  // ── Notices ───────────────────────────────────────────────────────────────
  getNotices(tid: string)       { this.ensureTenant(tid); return this.noticesByTenant.get(tid)!; }
  getNoticeById(tid: string, id: string) { return this.getNotices(tid).find(n=>n.id===id) ?? null; }

  publishNotice(tid: string, id: string, data: { summary?: string }): PrivacyNotice | null {
    const notice = this.getNoticeById(tid, id);
    if (!notice) return null;
    const [maj, min] = notice.version.split(".").map(Number);
    notice.version = `${maj}.${(min ?? 0) + 1}`;
    notice.status = "live";
    notice.lastModified = new Date().toISOString().slice(0, 10);
    notice.versionHistory.unshift({ v: notice.version, date: notice.lastModified, author: "System", summary: data.summary ?? "Updated" });
    return notice;
  }

  // ── DSAR ──────────────────────────────────────────────────────────────────
  getDsars(tid: string)         { this.ensureTenant(tid); return this.dsarsByTenant.get(tid)!; }
  getDsarById(tid: string, id: string) { return this.getDsars(tid).find(d=>d.id===id) ?? null; }
  getDsarStats(tid: string) {
    const d = this.getDsars(tid);
    return {
      total: d.length, open: d.filter(x=>x.status!=="Completed").length,
      overdue: d.filter(x=>x.status==="Overdue").length,
      dueSoon: d.filter(x=>x.daysLeft>0&&x.daysLeft<=7).length,
      completed: d.filter(x=>x.status==="Completed").length,
      byRegulation: d.reduce((a,x)=>{ a[x.regulation]=(a[x.regulation]??0)+1; return a; }, {} as Record<string,number>),
    };
  }

  createDsar(tid: string, data: { type: string; subject: string; subjectType?: string; regulation?: string; notes?: string; responseMethod?: string }): DsarRecord {
    const dsars = this.getDsars(tid);
    const reg = data.regulation ?? "GDPR";
    const slaHours = reg === "GDPR" ? 720 : reg === "CCPA" ? 1080 : reg === "DPDP" ? 720 : 720;
    const received = new Date().toISOString().slice(0, 10);
    const dueDate = new Date(Date.now() + slaHours * 3600 * 1000).toISOString().slice(0, 10);
    const newDsar: DsarRecord = {
      id: `dsar-${Date.now()}`,
      tenantId: tid,
      dsarId: `DSAR-${String(dsars.length + 1).padStart(3, "0")}`,
      type: data.type,
      subject: data.subject,
      subjectType: data.subjectType ?? "Customer",
      received,
      due: dueDate,
      regulation: reg,
      slaHours,
      status: "Received",
      daysLeft: 30,
      assignee: "Privacy Team",
      verificationMethod: "Email",
      notes: data.notes ?? "",
      extensions: 0,
      extensionDays: 0,
      responseMethod: data.responseMethod ?? "Email",
    };
    dsars.push(newDsar);
    return newDsar;
  }

  transitionDsar(tid: string, id: string, data: { status: DsarRecord["status"]; notes?: string; assignee?: string }): DsarRecord | null {
    const dsar = this.getDsarById(tid, id);
    if (!dsar) return null;
    const validTransitions: Record<string, string[]> = {
      "Received": ["Verifying", "Overdue"],
      "Verifying": ["Searching", "Overdue"],
      "Searching": ["Reviewing", "Overdue"],
      "Reviewing": ["Completed", "Overdue"],
      "Overdue": ["Verifying", "Searching", "Reviewing", "Completed"],
      "Completed": [],
    };
    if (!(validTransitions[dsar.status] ?? []).includes(data.status)) return null;
    dsar.status = data.status;
    if (data.notes) dsar.notes = data.notes;
    if (data.assignee) dsar.assignee = data.assignee;
    if (data.status === "Completed") dsar.daysLeft = 0;
    return dsar;
  }

  extendDsar(tid: string, id: string, days: number): DsarRecord | null {
    const dsar = this.getDsarById(tid, id);
    if (!dsar) return null;
    dsar.extensions += 1;
    dsar.extensionDays += days;
    dsar.daysLeft += days;
    const due = new Date(dsar.due);
    due.setDate(due.getDate() + days);
    dsar.due = due.toISOString().slice(0, 10);
    return dsar;
  }

  // ── Consent ───────────────────────────────────────────────────────────────
  getConsent(tid: string)       { this.ensureTenant(tid); return this.consentByTenant.get(tid)!; }
  getConsentStats(tid: string) {
    const c = this.getConsent(tid);
    return {
      total: c.length, active: c.filter(x=>x.status==="active").length,
      expired: c.filter(x=>x.status==="expired").length,
      withdrawn: c.filter(x=>x.status==="withdrawn").length,
      byCategory: c.reduce((a,x)=>{ a[x.category]=(a[x.category]??0)+1; return a; }, {} as Record<string,number>),
    };
  }

  withdrawConsent(tid: string, id: string): ConsentRecord | null {
    const records = this.getConsent(tid);
    const record = records.find(c => c.id === id);
    if (!record || record.status === "withdrawn") return null;
    record.status = "withdrawn";
    record.withdrawn = new Date().toISOString().slice(0, 10);
    return record;
  }

  // ── DPA ───────────────────────────────────────────────────────────────────
  getDpas(tid: string)          { this.ensureTenant(tid); return this.dpasByTenant.get(tid)!; }
  getDpaById(tid: string, id: string) { return this.getDpas(tid).find(d=>d.id===id) ?? null; }
  getDpaStats(tid: string) {
    const d = this.getDpas(tid);
    return {
      total: d.length, active: d.filter(x=>x.status==="active").length,
      expiringSoon: d.filter(x=>x.status==="expiring-soon").length,
      expired: d.filter(x=>x.status==="expired").length,
      missingSccs: d.filter(x=>!x.sccs&&x.vendorCountry!=="EU").length,
      unsigned: d.filter(x=>!x.dpoSigned).length,
    };
  }

  updateDpa(tid: string, id: string, data: Partial<Pick<DpaRecord, "status"|"sccs"|"dpoSigned"|"notes">>): DpaRecord | null {
    const dpa = this.getDpaById(tid, id);
    if (!dpa) return null;
    if (data.status !== undefined) dpa.status = data.status;
    if (data.sccs !== undefined) dpa.sccs = data.sccs;
    if (data.dpoSigned !== undefined) dpa.dpoSigned = data.dpoSigned;
    if (data.notes !== undefined) dpa.notes = data.notes;
    return dpa;
  }

  renewDpa(tid: string, id: string): DpaRecord | null {
    const dpa = this.getDpaById(tid, id);
    if (!dpa) return null;
    const expiry = new Date(dpa.expiryDate);
    expiry.setFullYear(expiry.getFullYear() + 1);
    dpa.expiryDate = expiry.toISOString().slice(0, 10);
    dpa.status = "active";
    dpa.agreementDate = new Date().toISOString().slice(0, 10);
    return dpa;
  }

  // ── RoPA CRUD ─────────────────────────────────────────────────────────────
  createRopa(tid: string, data: Partial<RopaRecord>): RopaRecord {
    const ropa = this.getRopa(tid);
    const id = `ROPA-${String(ropa.length + 1).padStart(3, "0")}`;
    const record: RopaRecord = {
      id, tenantId: tid,
      activity: data.activity ?? "New Activity",
      controller: data.controller ?? "Acme Corp",
      processor: data.processor,
      purpose: data.purpose ?? "",
      legalBasis: data.legalBasis ?? "Legitimate Interest",
      dataSubjects: data.dataSubjects ?? "Customers",
      categories: data.categories ?? [],
      countries: data.countries ?? ["UK"],
      retention: data.retention ?? "3 years",
      recipients: data.recipients ?? [],
      technicalMeasures: data.technicalMeasures ?? [],
      organisationalMeasures: data.organisationalMeasures ?? [],
      dpoReviewed: false,
      lastUpdated: new Date().toISOString().slice(0, 10),
      nextReview: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
      status: "in-review",
      risk: data.risk ?? "Medium",
      article30Compliant: false,
      notes: data.notes ?? "",
    };
    ropa.push(record);
    return record;
  }

  updateRopa(tid: string, id: string, data: Partial<RopaRecord>): RopaRecord | null {
    const record = this.getRopaById(tid, id);
    if (!record) return null;
    const allowed: (keyof RopaRecord)[] = ["activity","controller","processor","purpose","legalBasis","dataSubjects","categories","countries","retention","recipients","technicalMeasures","organisationalMeasures","dpoReviewed","nextReview","status","risk","article30Compliant","notes"];
    for (const k of allowed) {
      if (data[k] !== undefined) (record as unknown as Record<string, unknown>)[k] = data[k];
    }
    record.lastUpdated = new Date().toISOString().slice(0, 10);
    return record;
  }

  deleteRopa(tid: string, id: string): boolean {
    const list = this.getRopa(tid);
    const idx = list.findIndex(r => r.id === id);
    if (idx === -1) return false;
    list.splice(idx, 1);
    return true;
  }

  // ── Dashboard stats ───────────────────────────────────────────────────────
  getDashboardStats(tid: string) {
    return {
      ropa: this.getRopaStats(tid),
      dsars: this.getDsarStats(tid),
      consent: this.getConsentStats(tid),
      dpas: this.getDpaStats(tid),
      privacyRiskScore: 68,
      openActions: 14,
      nextReviewDate: "2026-07-01",
    };
  }
}

export const privacyService = new PrivacyService();
