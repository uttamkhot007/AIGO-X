// Data Classification Service — in-memory seed store
// Covers: Data Store Inventory, Classification Findings, Sensitivity Heatmap,
//         Data Lineage (for @xyflow/react), Over-Permission Alerts, Regulatory Obligations

export interface DataStore {
  id: string; tenantId: string; storeId: string; name: string;
  type: "S3"|"PostgreSQL"|"MySQL"|"MongoDB"|"SharePoint"|"OneDrive"|"GCS"|"Azure Blob"|"Snowflake"|"Kafka"|"Redis"|"Elasticsearch"|"SFTP"|"NAS";
  platform: "AWS"|"GCP"|"Azure"|"OnPrem"|"SaaS"; environment: "production"|"staging"|"dev"|"archive";
  region: string; owner: string; lastScan: string; scanStatus: "completed"|"in-progress"|"failed"|"never";
  totalFiles: number; sensitiveFiles: number; encryptedAtRest: boolean; publiclyAccessible: boolean;
  classifications: string[]; riskScore: number; retentionPolicy: string; connectorVersion: string;
  taggedOwner: boolean; backupEnabled: boolean;
}

export interface ClassificationFinding {
  id: string; tenantId: string; storeId: string; storeName: string;
  findingType: "PII"|"PHI"|"PCI"|"IP"|"Credentials"|"Biometric"|"Financial"|"Legal"|"Health";
  subType: string; confidence: "High"|"Medium"|"Low";
  fileCount: number; recordCount: number; samplePath: string;
  severity: "Critical"|"High"|"Medium"|"Low";
  regulatoryImpact: string[]; encrypted: boolean; masked: boolean;
  firstDetected: string; lastSeen: string; status: "open"|"accepted"|"remediated";
}

export interface LineageNode {
  id: string; label: string; type: "source"|"transform"|"destination"|"api"|"pipeline";
  platform: string; sensitivity: "Restricted"|"Confidential"|"Internal"|"Public";
  dataTypes: string[]; owner: string;
}
export interface LineageEdge {
  id: string; source: string; target: string; label: string;
  transformType: "copy"|"filter"|"anonymise"|"enrich"|"aggregate"|"export"|"api-call";
  piiFlows: boolean; encrypted: boolean; volume: string;
}

export interface OverPermAlert {
  id: string; tenantId: string; alertId: string; storeId: string; storeName: string;
  user: string; userRole: string; accessLevel: string; sensitivity: string;
  businessJustification: boolean; lastUsed: string; daysSinceUse: number;
  severity: "Critical"|"High"|"Medium"; status: "open"|"reviewed"|"remediated";
  regulatoryImpact: string; recommendation: string;
}

export interface RegObligation {
  id: string; regulation: string; jurisdiction: string; obligationId: string;
  title: string; category: string; description: string;
  status: "compliant"|"partial"|"gap"|"na";
  completionPct: number; dueDate: string; owner: string; evidence: string;
}

// ── Seed data ─────────────────────────────────────────────────────────────────

export const seed_stores: Omit<DataStore,"tenantId">[] = [
  { id:"DS-001", storeId:"DS-001", name:"acme-backups-prod",        type:"S3",          platform:"AWS",    environment:"production", region:"us-east-1",  owner:"Sarah Chen",    lastScan:"2026-06-13 09:00", scanStatus:"completed",  totalFiles:48720,  sensitiveFiles:12840, encryptedAtRest:false, publiclyAccessible:true,  classifications:["PII","Financial","Credentials"], riskScore:95, retentionPolicy:"None", connectorVersion:"2.1.0", taggedOwner:false, backupEnabled:false },
  { id:"DS-002", storeId:"DS-002", name:"prod-db-pg-01/customers",  type:"PostgreSQL",  platform:"AWS",    environment:"production", region:"us-east-1",  owner:"Sarah Chen",    lastScan:"2026-06-13 09:15", scanStatus:"completed",  totalFiles:142000, sensitiveFiles:97200, encryptedAtRest:true,  publiclyAccessible:false, classifications:["PII","Email","Financial"],       riskScore:88, retentionPolicy:"7 years", connectorVersion:"2.0.1", taggedOwner:true,  backupEnabled:true  },
  { id:"DS-003", storeId:"DS-003", name:"sharepoint/sales-docs",   type:"SharePoint",  platform:"SaaS",   environment:"production", region:"EU-West",    owner:"Tom Hughes",    lastScan:"2026-06-11 14:00", scanStatus:"completed",  totalFiles:8420,   sensitiveFiles:2100,  encryptedAtRest:true,  publiclyAccessible:false, classifications:["PII","Contracts","Financial"],   riskScore:62, retentionPolicy:"5 years", connectorVersion:"1.8.0", taggedOwner:true,  backupEnabled:true  },
  { id:"DS-004", storeId:"DS-004", name:"gs://acme-ml-datasets",   type:"GCS",         platform:"GCP",    environment:"production", region:"us-central1",owner:"Alex Kim",      lastScan:"2026-06-13 08:30", scanStatus:"in-progress",totalFiles:310000, sensitiveFiles:88000, encryptedAtRest:false, publiclyAccessible:false, classifications:["PII","Behavioral","Health"],     riskScore:92, retentionPolicy:"Indefinite", connectorVersion:"2.1.0", taggedOwner:false, backupEnabled:false },
  { id:"DS-005", storeId:"DS-005", name:"acme-analytics-container",type:"Azure Blob",  platform:"Azure",  environment:"production", region:"EU-North",   owner:"Marcus Johnson",lastScan:"2026-06-10 11:00", scanStatus:"completed",  totalFiles:52100,  sensitiveFiles:19400, encryptedAtRest:true,  publiclyAccessible:false, classifications:["Behavioral","Financial"],        riskScore:71, retentionPolicy:"2 years", connectorVersion:"1.9.3", taggedOwner:true,  backupEnabled:true  },
  { id:"DS-006", storeId:"DS-006", name:"workspace/slack-main",   type:"Elasticsearch",platform:"SaaS",   environment:"production", region:"us-east-1",  owner:"Priya Patel",   lastScan:"2026-06-13 07:45", scanStatus:"completed",  totalFiles:7800,   sensitiveFiles:340,   encryptedAtRest:true,  publiclyAccessible:false, classifications:["PII","Credentials"],             riskScore:55, retentionPolicy:"90 days", connectorVersion:"1.5.0", taggedOwner:false, backupEnabled:false },
  { id:"DS-007", storeId:"DS-007", name:"hr-database/employees",  type:"MySQL",        platform:"OnPrem", environment:"production", region:"DC1-ES",     owner:"Marcus Johnson",lastScan:"2026-06-13 09:30", scanStatus:"completed",  totalFiles:28400,  sensitiveFiles:28400, encryptedAtRest:true,  publiclyAccessible:false, classifications:["PII","HR","Financial","Biometric"],riskScore:84,retentionPolicy:"7 years",connectorVersion:"2.0.0",taggedOwner:true,  backupEnabled:true  },
  { id:"DS-008", storeId:"DS-008", name:"acme-dr-archive",        type:"S3",           platform:"AWS",    environment:"archive",    region:"us-west-2",  owner:"Sarah Chen",    lastScan:"2026-05-01 00:00", scanStatus:"completed",  totalFiles:980000, sensitiveFiles:241000,encryptedAtRest:false, publiclyAccessible:false, classifications:["PII","Financial","Health","Legal"],riskScore:88,retentionPolicy:"10 years",connectorVersion:"2.0.0",taggedOwner:false, backupEnabled:false },
  { id:"DS-009", storeId:"DS-009", name:"snowflake/dw-prod",      type:"Snowflake",    platform:"SaaS",   environment:"production", region:"us-east-1",  owner:"Alex Kim",      lastScan:"2026-06-12 22:00", scanStatus:"completed",  totalFiles:520000, sensitiveFiles:112000,encryptedAtRest:true,  publiclyAccessible:false, classifications:["PII","Financial","Behavioral"],   riskScore:77, retentionPolicy:"5 years", connectorVersion:"1.2.0", taggedOwner:true,  backupEnabled:true  },
  { id:"DS-010", storeId:"DS-010", name:"nas-legal/contracts",    type:"NAS",          platform:"OnPrem", environment:"production", region:"DC1-ES",     owner:"Legal",         lastScan:"Never",            scanStatus:"never",      totalFiles:0,      sensitiveFiles:0,     encryptedAtRest:false, publiclyAccessible:false, classifications:[],                               riskScore:80, retentionPolicy:"7 years", connectorVersion:"—", taggedOwner:false, backupEnabled:false },
];

export const seed_findings: Omit<ClassificationFinding,"tenantId">[] = [
  { id:"CF-001", storeId:"DS-001", storeName:"acme-backups-prod",       findingType:"Credentials", subType:"AWS Access Keys",    confidence:"High",   fileCount:12,   recordCount:12,    samplePath:"s3://acme-backups-prod/config/env.prod.bak",      severity:"Critical", regulatoryImpact:["GDPR","CCPA","PCI-DSS"], encrypted:false, masked:false, firstDetected:"2026-06-10", lastSeen:"2026-06-13", status:"open" },
  { id:"CF-002", storeId:"DS-001", storeName:"acme-backups-prod",       findingType:"PII",         subType:"Full Name + Email",  confidence:"High",   fileCount:4820, recordCount:48200, samplePath:"s3://acme-backups-prod/customers/dump_2026.csv",  severity:"Critical", regulatoryImpact:["GDPR","CCPA"],           encrypted:false, masked:false, firstDetected:"2026-06-10", lastSeen:"2026-06-13", status:"open" },
  { id:"CF-003", storeId:"DS-002", storeName:"prod-db-pg-01/customers", findingType:"PII",         subType:"SSN / Tax ID",       confidence:"High",   fileCount:0,    recordCount:2840,  samplePath:"prod-db-pg-01.customers.ssn",                     severity:"Critical", regulatoryImpact:["GDPR","CCPA","HIPAA"],   encrypted:true,  masked:false, firstDetected:"2026-06-01", lastSeen:"2026-06-13", status:"open" },
  { id:"CF-004", storeId:"DS-002", storeName:"prod-db-pg-01/customers", findingType:"Financial",   subType:"Credit Card PAN",    confidence:"High",   fileCount:0,    recordCount:1200,  samplePath:"prod-db-pg-01.orders.card_number",                severity:"Critical", regulatoryImpact:["PCI-DSS","GDPR"],        encrypted:true,  masked:false, firstDetected:"2026-06-01", lastSeen:"2026-06-13", status:"open" },
  { id:"CF-005", storeId:"DS-004", storeName:"gs://acme-ml-datasets",   findingType:"PHI",         subType:"Medical Diagnosis",  confidence:"Medium", fileCount:210,  recordCount:88000, samplePath:"gs://acme-ml-datasets/train/patient_data.jsonl",  severity:"Critical", regulatoryImpact:["HIPAA","GDPR"],          encrypted:false, masked:false, firstDetected:"2026-06-12", lastSeen:"2026-06-13", status:"open" },
  { id:"CF-006", storeId:"DS-007", storeName:"hr-database/employees",   findingType:"Biometric",   subType:"Fingerprint Template",confidence:"High",  fileCount:0,    recordCount:847,   samplePath:"hr-db.employees.biometric_data",                  severity:"Critical", regulatoryImpact:["GDPR Art 9","CCPA"],     encrypted:true,  masked:false, firstDetected:"2026-05-20", lastSeen:"2026-06-13", status:"open" },
  { id:"CF-007", storeId:"DS-008", storeName:"acme-dr-archive",        findingType:"Health",       subType:"Medical Records",    confidence:"High",   fileCount:4100, recordCount:241000,samplePath:"s3://acme-dr-archive/medical/records_archive.tar",severity:"Critical", regulatoryImpact:["HIPAA","GDPR"],          encrypted:false, masked:false, firstDetected:"2026-06-01", lastSeen:"2026-06-01", status:"open" },
  { id:"CF-008", storeId:"DS-003", storeName:"sharepoint/sales-docs",  findingType:"PII",          subType:"Passport Number",    confidence:"Medium", fileCount:48,   recordCount:48,    samplePath:"sharepoint/sales-docs/contracts/onboarding_*.pdf", severity:"High",     regulatoryImpact:["GDPR"],                  encrypted:true,  masked:false, firstDetected:"2026-06-11", lastSeen:"2026-06-11", status:"open" },
  { id:"CF-009", storeId:"DS-006", storeName:"workspace/slack-main",   findingType:"Credentials",  subType:"API Tokens in Chat", confidence:"Medium", fileCount:0,    recordCount:23,    samplePath:"slack://channels/dev-ops (3 messages)",           severity:"High",     regulatoryImpact:["PCI-DSS","GDPR"],        encrypted:true,  masked:false, firstDetected:"2026-06-13", lastSeen:"2026-06-13", status:"open" },
  { id:"CF-010", storeId:"DS-009", storeName:"snowflake/dw-prod",      findingType:"Financial",    subType:"Bank Account Number",confidence:"High",   fileCount:0,    recordCount:44200, samplePath:"dw-prod.transactions.bank_account",               severity:"High",     regulatoryImpact:["PCI-DSS","GDPR"],        encrypted:true,  masked:false, firstDetected:"2026-06-12", lastSeen:"2026-06-13", status:"open" },
  { id:"CF-011", storeId:"DS-005", storeName:"acme-analytics-container",findingType:"PII",         subType:"Email + IP Address", confidence:"High",   fileCount:8200, recordCount:19400, samplePath:"azure://acme-analytics/events/clickstream_*.parquet",severity:"High",   regulatoryImpact:["GDPR","CCPA"],           encrypted:true,  masked:false, firstDetected:"2026-06-10", lastSeen:"2026-06-13", status:"open" },
];

export const seed_lineageNodes: LineageNode[] = [
  { id:"LN-001", label:"prod-db-pg-01 (PostgreSQL)",    type:"source",      platform:"AWS RDS",      sensitivity:"Restricted",   dataTypes:["PII","Financial","Email"],   owner:"Sarah Chen" },
  { id:"LN-002", label:"hr-database (MySQL)",           type:"source",      platform:"OnPrem",       sensitivity:"Restricted",   dataTypes:["PII","HR","Biometric"],     owner:"Marcus Johnson" },
  { id:"LN-003", label:"acme-ml-datasets (GCS)",        type:"source",      platform:"GCP",          sensitivity:"Restricted",   dataTypes:["PHI","Behavioral"],         owner:"Alex Kim" },
  { id:"LN-004", label:"ETL Pipeline (Airflow)",        type:"pipeline",    platform:"GCP Composer", sensitivity:"Confidential", dataTypes:["PII","Financial"],          owner:"Data Eng" },
  { id:"LN-005", label:"PII Anonymiser (Lambda)",       type:"transform",   platform:"AWS Lambda",   sensitivity:"Internal",     dataTypes:["Anonymised PII"],           owner:"Data Eng" },
  { id:"LN-006", label:"snowflake/dw-prod",             type:"destination", platform:"Snowflake",    sensitivity:"Confidential", dataTypes:["PII","Financial","Behavioral"],owner:"Alex Kim" },
  { id:"LN-007", label:"acme-analytics-container",      type:"destination", platform:"Azure Blob",   sensitivity:"Confidential", dataTypes:["Behavioral","Financial"],    owner:"Marcus Johnson" },
  { id:"LN-008", label:"OpenAI API (Inference)",        type:"api",         platform:"External",     sensitivity:"Confidential", dataTypes:["PII","Content"],            owner:"Product" },
  { id:"LN-009", label:"acme-backups-prod (S3)",        type:"destination", platform:"AWS S3",       sensitivity:"Restricted",   dataTypes:["PII","Financial","Credentials"],owner:"Sarah Chen" },
  { id:"LN-010", label:"Mailchimp API",                 type:"api",         platform:"External",     sensitivity:"Internal",     dataTypes:["Email","Behavioral"],       owner:"Marketing" },
  { id:"LN-011", label:"acme-dr-archive (S3)",          type:"destination", platform:"AWS S3",       sensitivity:"Restricted",   dataTypes:["PII","Health","Legal"],     owner:"Sarah Chen" },
];

export const seed_lineageEdges: LineageEdge[] = [
  { id:"LE-001", source:"LN-001", target:"LN-004", label:"Full extract (nightly)", transformType:"copy",      piiFlows:true,  encrypted:true,  volume:"97K records/run" },
  { id:"LE-002", source:"LN-002", target:"LN-004", label:"Employee delta",         transformType:"copy",      piiFlows:true,  encrypted:true,  volume:"847 records/run" },
  { id:"LE-003", source:"LN-003", target:"LN-004", label:"Training data pull",     transformType:"copy",      piiFlows:true,  encrypted:false, volume:"88K records/run" },
  { id:"LE-004", source:"LN-004", target:"LN-005", label:"PII flagged records",    transformType:"filter",    piiFlows:true,  encrypted:true,  volume:"42K records" },
  { id:"LE-005", source:"LN-005", target:"LN-006", label:"Anonymised to DW",       transformType:"anonymise", piiFlows:false, encrypted:true,  volume:"42K records" },
  { id:"LE-006", source:"LN-004", target:"LN-007", label:"Analytics export",       transformType:"aggregate", piiFlows:true,  encrypted:true,  volume:"19K records" },
  { id:"LE-007", source:"LN-001", target:"LN-008", label:"Customer context → AI",  transformType:"api-call",  piiFlows:true,  encrypted:true,  volume:"~2K req/day" },
  { id:"LE-008", source:"LN-001", target:"LN-009", label:"Backup (unencrypted)",   transformType:"copy",      piiFlows:true,  encrypted:false, volume:"Full snapshot" },
  { id:"LE-009", source:"LN-006", target:"LN-010", label:"Marketing segment",      transformType:"export",    piiFlows:true,  encrypted:true,  volume:"Email list" },
  { id:"LE-010", source:"LN-004", target:"LN-011", label:"Archive backup",         transformType:"copy",      piiFlows:true,  encrypted:false, volume:"241K records" },
];

export const seed_overPerm: Omit<OverPermAlert,"tenantId">[] = [
  { id:"OP-001", alertId:"OP-001", storeId:"DS-001", storeName:"acme-backups-prod",       user:"tom.h@acme.com",         userRole:"Junior Developer",   accessLevel:"Full Read+Write",    sensitivity:"Restricted (PII+Creds)", businessJustification:false, lastUsed:"Never",     daysSinceUse:999, severity:"Critical", status:"open",      regulatoryImpact:"GDPR Art 25 — excess access",  recommendation:"Remove access immediately" },
  { id:"OP-002", alertId:"OP-002", storeId:"DS-002", storeName:"prod-db-pg-01/customers", user:"contractor@vendor.com",  userRole:"External Contractor",accessLevel:"Full Read",          sensitivity:"Restricted (PII+PCI)",   businessJustification:false, lastUsed:"2026-04-01",daysSinceUse:73,  severity:"Critical", status:"open",      regulatoryImpact:"PCI-DSS Req 7 — need to know", recommendation:"Revoke — expired engagement" },
  { id:"OP-003", alertId:"OP-003", storeId:"DS-007", storeName:"hr-database/employees",   user:"ops-service-account",    userRole:"Service Account",    accessLevel:"Read (all columns)", sensitivity:"Restricted (Biometric)",  businessJustification:false, lastUsed:"2026-06-01",daysSinceUse:12,  severity:"High",     status:"open",      regulatoryImpact:"GDPR Art 9 — biometric special cat", recommendation:"Restrict to non-biometric columns" },
  { id:"OP-004", alertId:"OP-004", storeId:"DS-004", storeName:"gs://acme-ml-datasets",   user:"data-science-team@acme.com",userRole:"Data Science",    accessLevel:"Full Access",        sensitivity:"Restricted (PHI)",       businessJustification:true,  lastUsed:"2026-06-10",daysSinceUse:3,   severity:"High",     status:"reviewed",  regulatoryImpact:"HIPAA — PHI access must be minimum necessary", recommendation:"Scope to specific datasets" },
  { id:"OP-005", alertId:"OP-005", storeId:"DS-008", storeName:"acme-dr-archive",         user:"admin@acme.com",         userRole:"IT Admin",           accessLevel:"Full Admin",         sensitivity:"Restricted (Medical+Legal)",businessJustification:false,lastUsed:"2026-05-15",daysSinceUse:29,  severity:"High",     status:"open",      regulatoryImpact:"GDPR Art 25 — access minimisation", recommendation:"Restrict to break-glass access only" },
  { id:"OP-006", alertId:"OP-006", storeId:"DS-009", storeName:"snowflake/dw-prod",       user:"marketing@acme.com",     userRole:"Marketing Analyst",  accessLevel:"Read (raw PII tables)",sensitivity:"Confidential (PII)",    businessJustification:false, lastUsed:"2026-06-05",daysSinceUse:8,   severity:"Medium",   status:"open",      regulatoryImpact:"GDPR — marketing team must use anonymised view", recommendation:"Redirect to anonymised_customers view" },
];

export const seed_regObligations: Omit<RegObligation,"id">[] = [
  // GDPR
  { regulation:"GDPR", jurisdiction:"EU", obligationId:"GDPR-001", title:"Appoint a DPO",                      category:"Governance",    description:"Designate a Data Protection Officer per Art 37",            status:"compliant", completionPct:100, dueDate:"Ongoing",  owner:"Legal",    evidence:"DPO appointment letter on file" },
  { regulation:"GDPR", jurisdiction:"EU", obligationId:"GDPR-002", title:"Article 30 Records (RoPA)",          category:"Documentation", description:"Maintain records of all processing activities per Art 30",   status:"partial",   completionPct:75,  dueDate:"2026-07-01",owner:"DPO",   evidence:"8/10 activities documented; AI sharing record incomplete" },
  { regulation:"GDPR", jurisdiction:"EU", obligationId:"GDPR-003", title:"DPIA for high-risk processing",      category:"Risk",          description:"Conduct DPIAs for processing likely to result in high risk", status:"partial",   completionPct:60,  dueDate:"2026-04-20",owner:"DPO",   evidence:"3 of 5 required DPIAs complete; biometric pending" },
  { regulation:"GDPR", jurisdiction:"EU", obligationId:"GDPR-004", title:"Consent management",                 category:"Consent",       description:"Obtain and manage valid consent per Art 7",                  status:"compliant", completionPct:100, dueDate:"Ongoing",  owner:"Product",  evidence:"Cookie banner v1.4 deployed" },
  { regulation:"GDPR", jurisdiction:"EU", obligationId:"GDPR-005", title:"DSAR response within 30 days",       category:"DSARs",         description:"Respond to data subject rights requests within 1 month",     status:"partial",   completionPct:80,  dueDate:"Ongoing",  owner:"Privacy",  evidence:"1 overdue DSAR; process in place" },
  { regulation:"GDPR", jurisdiction:"EU", obligationId:"GDPR-006", title:"Breach notification ≤72hrs",         category:"Incidents",     description:"Report personal data breaches to supervisory authority",      status:"compliant", completionPct:100, dueDate:"Ongoing",  owner:"CISO",     evidence:"IR procedure updated; 0 late notifications in 12mo" },
  // CCPA
  { regulation:"CCPA", jurisdiction:"US-CA", obligationId:"CCPA-001", title:"Privacy Policy (CA residents)",  category:"Documentation", description:"Disclose data categories collected, sold, disclosed",         status:"compliant", completionPct:100, dueDate:"Ongoing",  owner:"Legal",    evidence:"Privacy policy v3.2 updated Jan 2026" },
  { regulation:"CCPA", jurisdiction:"US-CA", obligationId:"CCPA-002", title:"Opt-out of data sale",           category:"Rights",        description:"Provide 'Do Not Sell My Personal Information' mechanism",    status:"compliant", completionPct:100, dueDate:"Ongoing",  owner:"Product",  evidence:"DNSMI link on homepage" },
  { regulation:"CCPA", jurisdiction:"US-CA", obligationId:"CCPA-003", title:"CCPA DSARs within 45 days",      category:"DSARs",         description:"Respond to consumer access/deletion requests within 45 days",status:"compliant", completionPct:100, dueDate:"Ongoing",  owner:"Privacy",  evidence:"2 open CA DSARs within SLA" },
  // India DPDP
  { regulation:"DPDP", jurisdiction:"India", obligationId:"DPDP-001", title:"Consent notice requirements",    category:"Consent",       description:"Itemised consent notice in English and Indian language",     status:"partial",   completionPct:55,  dueDate:"2026-09-01",owner:"Product", evidence:"English notice live; Hindi translation in progress" },
  { regulation:"DPDP", jurisdiction:"India", obligationId:"DPDP-002", title:"Data Fiduciary registration",    category:"Governance",    description:"Register as Significant Data Fiduciary if applicable",       status:"gap",       completionPct:0,   dueDate:"2026-09-01",owner:"Legal",   evidence:"Assessment not started" },
  { regulation:"DPDP", jurisdiction:"India", obligationId:"DPDP-003", title:"Data localisation check",        category:"Transfers",     description:"Assess cross-border transfer restrictions",                  status:"partial",   completionPct:40,  dueDate:"2026-09-01",owner:"Legal",   evidence:"Transfer mapping in progress" },
  // SAMA
  { regulation:"SAMA", jurisdiction:"KSA", obligationId:"SAMA-001", title:"Data privacy policy",              category:"Governance",    description:"Publish data privacy policy aligned to SAMA CSF",            status:"compliant", completionPct:100, dueDate:"Ongoing",  owner:"Legal",    evidence:"Policy published in Arabic and English" },
  { regulation:"SAMA", jurisdiction:"KSA", obligationId:"SAMA-002", title:"Cross-border transfer approval",   category:"Transfers",     description:"Obtain SAMA approval for cross-border data transfers",       status:"gap",       completionPct:15,  dueDate:"2026-08-01",owner:"Legal",   evidence:"SAMA notification pending" },
  // NIS2
  { regulation:"NIS2", jurisdiction:"EU", obligationId:"NIS2-001", title:"Incident reporting (24h initial)", category:"Incidents",      description:"Initial notification to national authority within 24 hours",  status:"compliant", completionPct:100, dueDate:"Ongoing",  owner:"CISO",     evidence:"IR policy updated Q1 2026" },
  { regulation:"NIS2", jurisdiction:"EU", obligationId:"NIS2-002", title:"Supply chain risk management",     category:"Third Parties",  description:"Assess and manage third-party cybersecurity risks",           status:"partial",   completionPct:60,  dueDate:"2026-10-01",owner:"Risk",    evidence:"14 of 23 vendors assessed" },
  // HIPAA
  { regulation:"HIPAA", jurisdiction:"US", obligationId:"HIPAA-001", title:"Business Associate Agreements",  category:"Third Parties",  description:"Execute BAAs with all PHI-handling vendors",                  status:"gap",       completionPct:20,  dueDate:"2026-07-01",owner:"Legal",   evidence:"GCS ML dataset BAA not in place" },
  { regulation:"HIPAA", jurisdiction:"US", obligationId:"HIPAA-002", title:"PHI access controls",            category:"Security",       description:"Restrict access to PHI to minimum necessary",                 status:"gap",       completionPct:30,  dueDate:"2026-07-01",owner:"CISO",    evidence:"Data science team has full PHI access — remediation in progress" },
  { regulation:"HIPAA", jurisdiction:"US", obligationId:"HIPAA-003", title:"HIPAA Security Risk Assessment", category:"Risk",           description:"Annual risk analysis of all ePHI systems per 45 CFR §164.308",status:"partial",   completionPct:50,  dueDate:"2026-09-30",owner:"CISO",    evidence:"Partial assessment for GCS dataset; archive not assessed" },
  // LGPD (Brazil)
  { regulation:"LGPD",  jurisdiction:"BR", obligationId:"LGPD-001",  title:"Appoint Data Protection Officer", category:"Governance",   description:"Designate a DPO for Brazilian operations under LGPD Art 41",  status:"compliant", completionPct:100, dueDate:"Ongoing",  owner:"Legal",    evidence:"DPO role covers LGPD; notified to ANPD" },
  { regulation:"LGPD",  jurisdiction:"BR", obligationId:"LGPD-002",  title:"Legal basis for processing",     category:"Documentation", description:"Document specific LGPD legal basis for each processing activity",status:"partial",   completionPct:65,  dueDate:"2026-08-01",owner:"DPO",   evidence:"5 of 8 RoPA records updated with LGPD basis" },
  { regulation:"LGPD",  jurisdiction:"BR", obligationId:"LGPD-003",  title:"Data subject rights workflow",   category:"Rights",        description:"Implement LGPD subject access, correction, portability rights",status:"partial",   completionPct:70,  dueDate:"2026-10-01",owner:"Product", evidence:"DSAR system handles LGPD requests; portability export pending" },
  // PIPEDA (Canada)
  { regulation:"PIPEDA",jurisdiction:"CA", obligationId:"PIPEDA-001",title:"Accountability framework",       category:"Governance",    description:"Designate individual accountable for PIPEDA compliance",       status:"compliant", completionPct:100, dueDate:"Ongoing",  owner:"Legal",    evidence:"Privacy Officer designated; policy published" },
  { regulation:"PIPEDA",jurisdiction:"CA", obligationId:"PIPEDA-002",title:"Breach of security safeguards", category:"Incidents",     description:"Report material breaches to OPC and notify affected individuals",status:"compliant",completionPct:100, dueDate:"Ongoing",  owner:"CISO",     evidence:"Reporting process documented; no reportable breaches in 12mo" },
  // PDPA (Thailand)
  { regulation:"PDPA",  jurisdiction:"TH", obligationId:"PDPA-001",  title:"Consent in Thai language",       category:"Consent",       description:"Obtain consent in Thai for data collection from Thai residents",status:"gap",       completionPct:10,  dueDate:"2026-12-01",owner:"Product", evidence:"Thai consent notice not yet developed" },
  { regulation:"PDPA",  jurisdiction:"TH", obligationId:"PDPA-002",  title:"PDPA data subject rights",       category:"Rights",        description:"Enable correction, deletion, and objection rights for Thai residents",status:"partial",completionPct:40,  dueDate:"2026-12-01",owner:"Product", evidence:"DSAR process covers access only; deletion workflow pending" },
  // POPIA (South Africa)
  { regulation:"POPIA", jurisdiction:"ZA", obligationId:"POPIA-001", title:"Information Officer registration",category:"Governance",   description:"Register Information Officer with the Information Regulator",   status:"compliant", completionPct:100, dueDate:"Ongoing",  owner:"Legal",    evidence:"Registration confirmed May 2026" },
  { regulation:"POPIA", jurisdiction:"ZA", obligationId:"POPIA-002", title:"Cross-border transfer conditions",category:"Transfers",    description:"Ensure adequate protection for cross-border transfers per POPIA §72",status:"partial",completionPct:50,  dueDate:"2026-09-01",owner:"Legal",   evidence:"Transfer impact assessment in progress" },
  // DORA (EU Digital Operational Resilience)
  { regulation:"DORA",  jurisdiction:"EU", obligationId:"DORA-001",  title:"ICT risk management framework",  category:"Risk",          description:"Maintain documented ICT risk management framework per DORA Art 5",status:"partial",  completionPct:55,  dueDate:"2025-01-17",owner:"Risk",    evidence:"Framework document v1.0 — gap analysis in progress" },
  { regulation:"DORA",  jurisdiction:"EU", obligationId:"DORA-002",  title:"ICT-related incident reporting",  category:"Incidents",     description:"Report major ICT incidents to competent authority per DORA Art 19",status:"partial", completionPct:70,  dueDate:"2025-01-17",owner:"CISO",    evidence:"Reporting playbook drafted; classification taxonomy pending" },
  { regulation:"DORA",  jurisdiction:"EU", obligationId:"DORA-003",  title:"Third-party ICT provider register",category:"Third Parties",description:"Maintain contractual register of all critical ICT providers",    status:"partial",  completionPct:60,  dueDate:"2025-01-17",owner:"Risk",    evidence:"14 of 23 providers documented; SLAs being reviewed" },
  // ISO 27701 (Privacy Information Management)
  { regulation:"ISO 27701",jurisdiction:"Global",obligationId:"27701-001",title:"PIMS scope and policy",   category:"Governance",    description:"Define scope of Privacy Information Management System",          status:"partial",   completionPct:45,  dueDate:"2026-12-31",owner:"DPO",    evidence:"PIMS scope document draft; not yet certified" },
  { regulation:"ISO 27701",jurisdiction:"Global",obligationId:"27701-002",title:"PII processing purposes",  category:"Documentation", description:"Document purposes for processing PII per ISO 27701 §7.2",       status:"partial",   completionPct:60,  dueDate:"2026-12-31",owner:"DPO",    evidence:"6 of 8 processing activities mapped to PIMS controls" },
  // ePrivacy
  { regulation:"ePrivacy",jurisdiction:"EU", obligationId:"EP-001",  title:"Cookie consent mechanism",       category:"Consent",       description:"Prior informed consent for non-essential cookies per ePrivacy Directive",status:"compliant",completionPct:100,dueDate:"Ongoing",  owner:"Product",  evidence:"OneTrust CMP deployed; quarterly scans passing" },
  { regulation:"ePrivacy",jurisdiction:"EU", obligationId:"EP-002",  title:"Marketing communications opt-in",category:"Consent",       description:"Obtain opt-in for electronic direct marketing to individuals",   status:"compliant", completionPct:100, dueDate:"Ongoing",  owner:"Marketing",evidence:"Double opt-in enforced in Mailchimp; list cleaned Q1 2026" },
  // PCI-DSS
  { regulation:"PCI-DSS",jurisdiction:"Global",obligationId:"PCI-001",title:"Cardholder data encryption",  category:"Security",       description:"Protect cardholder data in storage and transit per PCI Req 3/4", status:"partial",   completionPct:70,  dueDate:"2026-07-01",owner:"CISO",    evidence:"Prod DB encrypted; backup store (DS-001) unencrypted — remediation ticketed" },
  { regulation:"PCI-DSS",jurisdiction:"Global",obligationId:"PCI-002",title:"Access control (Req 7/8)",    category:"Security",       description:"Restrict access to cardholder data by business need-to-know",    status:"partial",   completionPct:65,  dueDate:"2026-07-01",owner:"CISO",    evidence:"Contractor access revocation pending (OP-002)" },
  { regulation:"PCI-DSS",jurisdiction:"Global",obligationId:"PCI-003",title:"Annual penetration test",     category:"Risk",           description:"Perform annual internal and external penetration testing",        status:"compliant", completionPct:100, dueDate:"2026-03-01",owner:"CISO",    evidence:"Pen test completed Feb 2026; 3 findings remediated" },
];

// ── Heatmap helper ────────────────────────────────────────────────────────────
const SENSITIVITY_TYPES = ["PII","PHI","PCI","IP","Credentials","Biometric","Financial","Legal"];

export function buildHeatmap(findings: ClassificationFinding[]) {
  const stores = [...new Set(findings.map(f=>f.storeName))];
  const grid = stores.map(store => {
    const counts: Record<string,number> = {};
    for (const t of SENSITIVITY_TYPES) {
      counts[t] = findings.filter(f=>f.storeName===store && f.findingType===t).reduce((s,f)=>s+f.recordCount,0);
    }
    return { store, ...counts };
  });
  return { stores, sensitivityTypes: SENSITIVITY_TYPES, grid };
}

export class DataClassService {
  private storesByTenant    = new Map<string, DataStore[]>();
  private findingsByTenant  = new Map<string, ClassificationFinding[]>();
  private overPermByTenant  = new Map<string, OverPermAlert[]>();

  private ensureTenant(tid: string) {
    const isSeeded = tid === "1";
    if (!this.storesByTenant.has(tid))   this.storesByTenant.set(tid,   isSeeded ? seed_stores.map(s=>({...s,tenantId:tid}))   : []);
    if (!this.findingsByTenant.has(tid)) this.findingsByTenant.set(tid, isSeeded ? seed_findings.map(f=>({...f,tenantId:tid})) : []);
    if (!this.overPermByTenant.has(tid)) this.overPermByTenant.set(tid, isSeeded ? seed_overPerm.map(o=>({...o,tenantId:tid})) : []);
  }

  getStores(tid: string)            { this.ensureTenant(tid); return this.storesByTenant.get(tid)!; }
  getStoreById(tid: string, id: string) { return this.getStores(tid).find(s=>s.storeId===id) ?? null; }
  getFindings(tid: string)          { this.ensureTenant(tid); return this.findingsByTenant.get(tid)!; }
  getFindingById(tid: string, id: string) { return this.getFindings(tid).find(f=>f.id===id) ?? null; }
  getOverPerm(tid: string)          { this.ensureTenant(tid); return this.overPermByTenant.get(tid)!; }
  getOverPermById(tid: string, id: string) { return this.getOverPerm(tid).find(a=>a.id===id) ?? null; }
  getHeatmap(tid: string)           { return buildHeatmap(this.getFindings(tid)); }
  getLineage()                      { return { nodes: seed_lineageNodes, edges: seed_lineageEdges }; }
  private _obligationsByTenant: Map<string, RegObligation[]> = new Map();
  getRegObligations(tid: string): RegObligation[] {
    if (!this._obligationsByTenant.has(tid)) {
      this._obligationsByTenant.set(tid, seed_regObligations.map((o,i) => ({...o, id:`RO-${String(i+1).padStart(3,"0")}`, tenantId: tid})));
    }
    return this._obligationsByTenant.get(tid)!;
  }

  triggerStoreScan(tid: string, storeId: string): DataStore | null {
    const store = this.getStoreById(tid, storeId);
    if (!store) return null;
    store.scanStatus = "in-progress";
    store.lastScan = new Date().toISOString().slice(0, 10);
    setTimeout(() => {
      const s = this.getStoreById(tid, storeId);
      if (s && s.scanStatus === "in-progress") s.scanStatus = "completed";
    }, 5000);
    return store;
  }

  remediateFinding(tid: string, id: string, data: { notes?: string }): ClassificationFinding | null {
    const finding = this.getFindingById(tid, id);
    if (!finding) return null;
    finding.status = "remediated";
    if (data.notes) finding.samplePath = `[REMEDIATED] ${finding.samplePath}`;
    return finding;
  }

  acceptFinding(tid: string, id: string, data: { justification?: string }): ClassificationFinding | null {
    const finding = this.getFindingById(tid, id);
    if (!finding) return null;
    finding.status = "accepted";
    return finding;
  }

  updateAlertStatus(tid: string, id: string, status: "open"|"reviewed"|"remediated"): OverPermAlert | null {
    const alert = this.getOverPermById(tid, id);
    if (!alert) return null;
    alert.status = status;
    return alert;
  }

  updateObligationStatus(tid: string, id: string, data: { status: RegObligation["status"]; completionPct?: number; evidence?: string }): RegObligation | null {
    const obs = this.getRegObligations(tid);
    const ob = obs.find(o => o.id === id);
    if (!ob) return null;
    ob.status = data.status;
    if (data.completionPct !== undefined) ob.completionPct = data.completionPct;
    if (data.evidence) ob.evidence = data.evidence;
    return ob;
  }

  getStats(tid: string) {
    const stores   = this.getStores(tid);
    const findings = this.getFindings(tid);
    const overPerm = this.getOverPerm(tid);
    return {
      totalStores:       stores.length,
      criticalStores:    stores.filter(s=>s.riskScore>=90).length,
      totalSensitiveFiles: stores.reduce((s,x)=>s+x.sensitiveFiles,0),
      unencryptedStores: stores.filter(s=>!s.encryptedAtRest).length,
      publicStores:      stores.filter(s=>s.publiclyAccessible).length,
      totalFindings:     findings.length,
      criticalFindings:  findings.filter(f=>f.severity==="Critical").length,
      openFindings:      findings.filter(f=>f.status==="open").length,
      overPermAlerts:    overPerm.filter(o=>o.status==="open").length,
      unscannedStores:   stores.filter(s=>s.scanStatus==="never").length,
      darkDataRisk:      "High",
    };
  }
}

export const dataClassService = new DataClassService();
