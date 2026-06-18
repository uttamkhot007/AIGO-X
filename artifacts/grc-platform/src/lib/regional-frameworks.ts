// ── Regional & Global Compliance Frameworks ───────────────────────────────
// Comprehensive catalog for AIGO-X GRC Platform

export interface RegionalFramework {
  id: string;
  label: string;
  shortLabel: string;
  icon: string;
  controls: number;
  category: string;
  color: string;
  region: string;
  regionFlag: string;
  authority: string;
  year: number;
  description: string;
  scope: string;
  mandatory: boolean;
  templates: string[];
  tags: string[];
}

// ── Color palette ──────────────────────────────────────────────────────────
const NAV = "#93C5FD";
const EME = "#34D399";
const AMB = "#FCD34D";
const RED = "#F87171";
const PRP = "#C4B5FD";
const CYN = "#67E8F9";
const ORG = "#FB923C";
const RSE = "#FDA4AF";

// ── Region metadata ────────────────────────────────────────────────────────
export const REGIONS = [
  { id:"global",     label:"Global / International", flag:"🌐", color:NAV },
  { id:"in",         label:"India",                  flag:"🇮🇳", color:"#FF9933" },
  { id:"au",         label:"Australia",              flag:"🇦🇺", color:"#00843D" },
  { id:"ae",         label:"UAE",                    flag:"🇦🇪", color:"#00732F" },
  { id:"sa",         label:"Saudi Arabia (KSA)",     flag:"🇸🇦", color:"#006C35" },
  { id:"bh",         label:"Bahrain",                flag:"🇧🇭", color:"#CE1126" },
  { id:"us",         label:"United States",          flag:"🇺🇸", color:"#3C3B6E" },
  { id:"ug",         label:"Uganda",                 flag:"🇺🇬", color:"#FCDC04" },
  { id:"ng",         label:"Nigeria",                flag:"🇳🇬", color:"#008751" },
  { id:"lk",         label:"Sri Lanka",              flag:"🇱🇰", color:"#8D153A" },
  { id:"bd",         label:"Bangladesh",             flag:"🇧🇩", color:"#006A4E" },
  { id:"gb",         label:"United Kingdom",         flag:"🇬🇧", color:"#012169" },
];

// ── Framework Catalog ──────────────────────────────────────────────────────
export const ALL_FRAMEWORKS: RegionalFramework[] = [

  // ════════════════════════════════════════════════════
  // GLOBAL / INTERNATIONAL
  // ════════════════════════════════════════════════════
  {
    id:"iso27001", label:"ISO 27001:2022", shortLabel:"ISO 27001",
    icon:"🏛", controls:114, category:"ISMS", color:NAV,
    region:"global", regionFlag:"🌐", authority:"ISO / IEC",
    year:2022, mandatory:false,
    description:"International standard for Information Security Management Systems (ISMS). Covers people, processes and technology controls across 4 mandatory clauses and Annex A.",
    scope:"Enterprise-wide ISMS — all information assets",
    templates:["ISMS Policy","Risk Assessment Methodology","SOA Template","Asset Register","Incident Log","Internal Audit Plan","Management Review Minutes"],
    tags:["ISMS","Risk","Controls","Certification"],
  },
  {
    id:"iso27701", label:"ISO 27701:2019", shortLabel:"ISO 27701",
    icon:"🔐", controls:49, category:"Privacy ISMS", color:PRP,
    region:"global", regionFlag:"🌐", authority:"ISO / IEC",
    year:2019, mandatory:false,
    description:"Extension to ISO 27001 for Privacy Information Management Systems (PIMS). Maps directly to GDPR, CCPA and other privacy laws.",
    scope:"PII processing activities",
    templates:["PIMS Policy","PII Processing Register","Data Subject Rights Procedure","Privacy Risk Assessment"],
    tags:["Privacy","PII","PIMS","GDPR Mapping"],
  },
  {
    id:"iso31000", label:"ISO 31000:2018", shortLabel:"ISO 31000",
    icon:"⚖", controls:48, category:"Risk Management", color:AMB,
    region:"global", regionFlag:"🌐", authority:"ISO",
    year:2018, mandatory:false,
    description:"International risk management standard providing principles, framework and process for managing risks across any organisation and sector.",
    scope:"Enterprise risk management",
    templates:["Risk Management Policy","Risk Register","Risk Treatment Plan","Risk Appetite Statement","Risk Reporting Template"],
    tags:["Risk","ERM","Principles","Framework"],
  },
  {
    id:"iso22301", label:"ISO 22301:2019", shortLabel:"ISO 22301",
    icon:"🛡", controls:53, category:"Business Continuity", color:CYN,
    region:"global", regionFlag:"🌐", authority:"ISO",
    year:2019, mandatory:false,
    description:"Business Continuity Management System (BCMS) standard. Ensures organisations can continue critical operations during and after disruptive incidents.",
    scope:"Critical business processes and supporting infrastructure",
    templates:["BCP Policy","BIA Template","Business Continuity Plan","Crisis Communication Plan","Tabletop Exercise Script","Recovery Plan"],
    tags:["BCP","BCMS","Resilience","DR"],
  },
  {
    id:"soc2", label:"SOC 2 Type II", shortLabel:"SOC 2",
    icon:"☁", controls:64, category:"Trust Services", color:EME,
    region:"global", regionFlag:"🌐", authority:"AICPA",
    year:2022, mandatory:false,
    description:"AICPA Trust Services Criteria audit report. Evaluates security, availability, processing integrity, confidentiality and privacy controls for SaaS and cloud services.",
    scope:"Cloud/SaaS product and supporting infrastructure",
    templates:["SOC 2 Readiness Checklist","TSC Control Matrix","Evidence Collection Guide","Vendor Questionnaire","Security Policy Pack"],
    tags:["Cloud","SaaS","Trust","AICPA"],
  },
  {
    id:"gdpr", label:"GDPR", shortLabel:"GDPR",
    icon:"🇪🇺", controls:25, category:"Privacy", color:PRP,
    region:"global", regionFlag:"🌐", authority:"European Parliament",
    year:2018, mandatory:true,
    description:"EU General Data Protection Regulation. Governs personal data processing of EU/EEA residents globally. Landmark privacy regulation with €20M / 4% global turnover penalties.",
    scope:"Any organisation processing EU/EEA personal data",
    templates:["Privacy Notice","RoPA (Article 30)","DPIA Template","DSR Procedure","Breach Notification (72h)","DPA Template","Cookie Policy","LIA Template"],
    tags:["Privacy","EU","Data Protection","DSAR"],
  },
  {
    id:"hipaa", label:"HIPAA / HITECH", shortLabel:"HIPAA",
    icon:"🏥", controls:45, category:"Healthcare", color:AMB,
    region:"global", regionFlag:"🌐", authority:"US HHS",
    year:1996, mandatory:true,
    description:"US Health Insurance Portability and Accountability Act. Protects PHI and ePHI. Applies globally to healthcare entities processing US patient data.",
    scope:"Healthcare entities and business associates handling ePHI",
    templates:["HIPAA Security Policy","BAA Template","PHI Inventory","Risk Analysis Workbook","Breach Notification Letter","Training Attestation"],
    tags:["Healthcare","PHI","ePHI","US"],
  },
  {
    id:"pci", label:"PCI-DSS v4.0", shortLabel:"PCI-DSS",
    icon:"💳", controls:281, category:"Payment Security", color:ORG,
    region:"global", regionFlag:"🌐", authority:"PCI SSC",
    year:2022, mandatory:true,
    description:"Payment Card Industry Data Security Standard. Mandatory for organisations that store, process or transmit cardholder data. Version 4.0 adds significant customised implementation options.",
    scope:"Cardholder Data Environment (CDE) and connected systems",
    templates:["PCI Scoping Worksheet","SAQ A / SAQ D","Cardholder Data Flow Diagram","Penetration Test Scope","Log Review Procedure","Change Management Policy"],
    tags:["Payment","CDE","Cardholder","QSA"],
  },
  {
    id:"nis2", label:"NIS2 Directive", shortLabel:"NIS2",
    icon:"🇪🇺", controls:21, category:"Critical Infrastructure", color:CYN,
    region:"global", regionFlag:"🌐", authority:"European Parliament",
    year:2022, mandatory:true,
    description:"EU Network and Information Security Directive 2.0. Expands to cover 18 critical sectors with stricter incident reporting (24h/72h/1 month) and supply chain requirements.",
    scope:"Essential and important entities across 18 critical sectors",
    templates:["NIS2 Gap Assessment","Incident Reporting Template (24h / 72h)","Supply Chain Security Policy","Security Measures Register","Board Accountability Declaration"],
    tags:["Critical Infra","EU","Incident Reporting","Supply Chain"],
  },
  {
    id:"nistcsf", label:"NIST CSF 2.0", shortLabel:"NIST CSF",
    icon:"🔭", controls:108, category:"Cybersecurity Framework", color:NAV,
    region:"global", regionFlag:"🌐", authority:"NIST",
    year:2024, mandatory:false,
    description:"NIST Cybersecurity Framework 2.0. Six core functions: Govern, Identify, Protect, Detect, Respond, Recover. Widely adopted globally as a risk-based cybersecurity framework.",
    scope:"All organisational information systems",
    templates:["CSF Current/Target Profile","Tier Assessment","Risk Register Alignment","Cyber Event Playbook","Implementation Roadmap"],
    tags:["NIST","Risk-Based","Cybersecurity","Framework"],
  },
  {
    id:"cis8", label:"CIS Controls v8.1", shortLabel:"CIS Controls",
    icon:"🛡", controls:153, category:"Security Controls", color:RED,
    region:"global", regionFlag:"🌐", authority:"CIS (Center for Internet Security)",
    year:2023, mandatory:false,
    description:"18 prioritised security controls organised into 3 Implementation Groups. IG1 = basic cyber hygiene (56 Safeguards). Maps to NIST CSF, ISO 27001 and PCI-DSS.",
    scope:"All systems and users in the enterprise",
    templates:["IG1 / IG2 / IG3 Inventory","Asset Inventory Template","Software Inventory","CIS Control Assessment","Vulnerability Prioritisation Matrix"],
    tags:["Security Hygiene","Controls","IG1","Mapping"],
  },
  {
    id:"cmmc", label:"CMMC 2.0", shortLabel:"CMMC",
    icon:"⚔", controls:110, category:"Defense", color:AMB,
    region:"global", regionFlag:"🌐", authority:"US DoD",
    year:2021, mandatory:true,
    description:"Cybersecurity Maturity Model Certification for US DoD contractors. Three levels: Foundational (17 practices), Advanced (110 practices), Expert. Mandatory for DoD contracts.",
    scope:"US DoD contractors and subcontractors handling CUI/FCI",
    templates:["System Security Plan (SSP)","POAM Template","CUI Handling Policy","Incident Response Plan","Supply Chain Risk Management Policy"],
    tags:["Defense","DoD","CUI","FCI"],
  },

  // ════════════════════════════════════════════════════
  // INDIA 🇮🇳
  // ════════════════════════════════════════════════════
  {
    id:"in_dpdp", label:"DPDP Act 2023", shortLabel:"DPDP Act",
    icon:"🇮🇳", controls:34, category:"Data Protection", color:"#FF9933",
    region:"in", regionFlag:"🇮🇳", authority:"Ministry of Electronics & IT (MeitY)",
    year:2023, mandatory:true,
    description:"India's Digital Personal Data Protection Act. Applies to processing of digital personal data in India. Establishes Data Fiduciaries, Data Processors, and Data Principals. Penalties up to ₹250 crore.",
    scope:"Processing digital personal data within India or abroad if related to goods/services in India",
    templates:["Privacy Notice Template","Consent Mechanism","Data Principal Rights Procedure","Grievance Redressal Policy","Significant Data Fiduciary Assessment","Cross-Border Transfer Impact Assessment"],
    tags:["India","Data Protection","Consent","MeitY"],
  },
  {
    id:"in_rbi", label:"RBI Cybersecurity Framework", shortLabel:"RBI CSF",
    icon:"🏦", controls:56, category:"Banking / Finance", color:"#FF9933",
    region:"in", regionFlag:"🇮🇳", authority:"Reserve Bank of India (RBI)",
    year:2016, mandatory:true,
    description:"RBI Master Direction on IT Framework for NBFC / Banks. Covers cyber security governance, SOC requirements, vulnerability management, incident reporting and supply chain risk.",
    scope:"Scheduled commercial banks, NBFCs, payment system operators",
    templates:["Cyber Crisis Management Plan","SOC Capability Assessment","Application Security Policy","Cyber Incident Reporting Form (RBI)","Third-Party Vendor Assessment","IT Steering Committee Charter"],
    tags:["India","Banking","RBI","SOC","NBFC"],
  },
  {
    id:"in_sebi", label:"SEBI CSCRF 2024", shortLabel:"SEBI CSCRF",
    icon:"📈", controls:61, category:"Capital Markets", color:"#FF9933",
    region:"in", regionFlag:"🇮🇳", authority:"Securities and Exchange Board of India (SEBI)",
    year:2024, mandatory:true,
    description:"SEBI Cybersecurity & Cyber Resilience Framework 2024. Replaces older circular. Applicable to Market Infrastructure Institutions, stock exchanges, clearing corporations and intermediaries.",
    scope:"SEBI-regulated entities: stock exchanges, depositories, brokers, mutual funds, portfolio managers",
    templates:["CSCRF Compliance Tracker","Annual Audit Checklist","Cyber Audit Programme","Incident Reporting Format (6h / 24h)","Third-Party Vendor Due Diligence","Business Continuity Plan"],
    tags:["India","SEBI","Capital Markets","Cyber Resilience"],
  },
  {
    id:"in_certin", label:"CERT-In Directions 2022", shortLabel:"CERT-In",
    icon:"🛡", controls:22, category:"Cyber Incident Reporting", color:"#FF9933",
    region:"in", regionFlag:"🇮🇳", authority:"CERT-In (MeitY)",
    year:2022, mandatory:true,
    description:"CERT-In Directions under IT Act Section 70B. Mandates reporting of 20 types of cyber incidents within 6 hours. Requires log retention, NTP synchronisation and KYC for VPN/cloud providers.",
    scope:"All service providers, data centres, corporations and government entities",
    templates:["Incident Reporting Form (6h)","Log Retention Policy","NTP Synchronisation SOP","VPN KYC Register","Annual Compliance Declaration"],
    tags:["India","Incident Reporting","6h","CERT-In","Log Retention"],
  },
  {
    id:"in_irdai", label:"IRDAI Cybersecurity Guidelines", shortLabel:"IRDAI",
    icon:"🛡", controls:38, category:"Insurance", color:"#FF9933",
    region:"in", regionFlag:"🇮🇳", authority:"Insurance Regulatory and Development Authority of India",
    year:2023, mandatory:true,
    description:"IRDAI Information & Cybersecurity Guidelines for insurance companies. Covers board-level accountability, CISO appointment, cyber insurance, SOC requirements and annual audits.",
    scope:"All IRDAI-regulated insurance entities",
    templates:["Board Cybersecurity Policy","CISO Charter","Annual Cybersecurity Audit Checklist","Third-Party Risk Policy","Cyber Incident Management Plan"],
    tags:["India","Insurance","IRDAI","Board Governance"],
  },
  {
    id:"in_it_act", label:"IT Act 2000 / SPDI Rules 2011", shortLabel:"IT Act & SPDI",
    icon:"⚖", controls:18, category:"IT Law", color:"#FF9933",
    region:"in", regionFlag:"🇮🇳", authority:"Ministry of Law & Justice / MeitY",
    year:2011, mandatory:true,
    description:"Information Technology Act 2000 with SPDI Rules 2011. Defines Sensitive Personal Data or Information (SPDI) and obligations for body corporates. Precursor to DPDP Act.",
    scope:"All body corporates handling SPDI",
    templates:["SPDI Privacy Policy","Security Practices Document","SPDI Data Transfer Agreement","Grievance Officer Appointment Letter"],
    tags:["India","IT Act","SPDI","Legal"],
  },

  // ════════════════════════════════════════════════════
  // AUSTRALIA 🇦🇺
  // ════════════════════════════════════════════════════
  {
    id:"au_e8", label:"ASD Essential Eight", shortLabel:"Essential Eight",
    icon:"🇦🇺", controls:37, category:"Cyber Hygiene", color:"#00843D",
    region:"au", regionFlag:"🇦🇺", authority:"Australian Signals Directorate (ASD)",
    year:2023, mandatory:false,
    description:"Eight baseline mitigation strategies from the ASD ACSC. Four maturity levels (0–3). Prioritised: Application control, patch apps, configure Microsoft Office macros, user app hardening, restrict admin privileges, patch OS, MFA, backups.",
    scope:"Australian government agencies (mandatory) and private sector (recommended)",
    templates:["Essential Eight Maturity Assessment","Maturity Level Roadmap","Application Control Policy","Patch Management SOP","MFA Implementation Guide","Backup & Recovery Plan"],
    tags:["Australia","ASD","Cyber Hygiene","Maturity Model"],
  },
  {
    id:"au_apra234", label:"APRA CPS 234", shortLabel:"APRA CPS 234",
    icon:"🏦", controls:44, category:"Financial Services", color:"#00843D",
    region:"au", regionFlag:"🇦🇺", authority:"Australian Prudential Regulation Authority (APRA)",
    year:2019, mandatory:true,
    description:"APRA Prudential Standard CPS 234 — Information Security. Mandates information security capability, policy framework, controls, incident response and audit. Applies to all APRA-regulated entities.",
    scope:"Banks, insurers, superannuation funds and other APRA-regulated entities",
    templates:["CPS 234 Board Declaration","Information Security Policy Framework","3rd Party Assessment Checklist","Incident Notification (24h / 72h)","Annual Control Testing Report","IRAP-style Assessment Template"],
    tags:["Australia","APRA","Financial Services","Prudential"],
  },
  {
    id:"au_ism", label:"Australian ISM", shortLabel:"ISM",
    icon:"🛡", controls:800, category:"Government Security", color:"#00843D",
    region:"au", regionFlag:"🇦🇺", authority:"ASD / Australian Cyber Security Centre (ACSC)",
    year:2024, mandatory:true,
    description:"Australian Government Information Security Manual — 800+ controls across 19 chapters. Mandatory for Commonwealth entities. Aligns with PROTECTED and SECRET data handling requirements.",
    scope:"Australian Government entities and suppliers",
    templates:["ISM Controls Assessment","System Security Plan (SSP)","Security Assessment Report","Authority to Operate (ATO) Package","IRAP Assessment Checklist","Continuous Monitoring Plan"],
    tags:["Australia","Government","ACSC","IRAP","Protected"],
  },
  {
    id:"au_privacy", label:"Privacy Act 1988 (APPs)", shortLabel:"Privacy Act",
    icon:"🔐", controls:13, category:"Privacy", color:"#00843D",
    region:"au", regionFlag:"🇦🇺", authority:"Office of the Australian Information Commissioner (OAIC)",
    year:1988, mandatory:true,
    description:"Privacy Act 1988 with 13 Australian Privacy Principles (APPs). The Privacy Act Review 2023 is modernising obligations. Applies to organisations with >AU$3M annual turnover and all health service providers.",
    scope:"Organisations and Australian Government agencies",
    templates:["Privacy Policy Template","Privacy Impact Assessment (PIA)","Data Breach Response Plan","DSR Handling Procedure","Cross-Border Disclosure Assessment","APP Compliance Checklist"],
    tags:["Australia","Privacy","APPs","NDB","OAIC"],
  },
  {
    id:"au_soci", label:"SOCI Act 2018", shortLabel:"SOCI Act",
    icon:"⚡", controls:31, category:"Critical Infrastructure", color:"#00843D",
    region:"au", regionFlag:"🇦🇺", authority:"Department of Home Affairs",
    year:2021, mandatory:true,
    description:"Security of Critical Infrastructure Act 2018 (expanded 2021). Covers 11 critical infrastructure sectors. Mandates asset register, incident reporting (12h for serious incidents), Risk Management Programme.",
    scope:"Operators of critical infrastructure assets across 11 sectors",
    templates:["CIRMP (Critical Infrastructure Risk Management Programme)","Positive Security Obligation Register","Incident Notification Template (12h)","Enhanced Cyber Obligations Assessment"],
    tags:["Australia","Critical Infrastructure","CIRMP","Sectors"],
  },

  // ════════════════════════════════════════════════════
  // UAE 🇦🇪
  // ════════════════════════════════════════════════════
  {
    id:"ae_pdpl", label:"UAE PDPL 2021", shortLabel:"UAE PDPL",
    icon:"🇦🇪", controls:28, category:"Data Protection", color:"#00732F",
    region:"ae", regionFlag:"🇦🇪", authority:"UAE Data Office (UDO)",
    year:2021, mandatory:true,
    description:"UAE Federal Personal Data Protection Law No. 45 of 2021. Applies to processing of personal data in UAE or related to UAE residents. Establishes Data Controller, Processor obligations and cross-border transfer rules.",
    scope:"Private-sector entities processing personal data in UAE",
    templates:["Privacy Notice (Arabic/English)","Data Processing Agreement (DPA)","Cross-Border Transfer Mechanism","Data Subject Rights Form","DPIA Template","Data Breach Notification (72h)","Consent Form"],
    tags:["UAE","Data Protection","Federal","Privacy","Personal Data"],
  },
  {
    id:"ae_nesa", label:"UAE IA Regulations (NESA)", shortLabel:"NESA IA",
    icon:"🛡", controls:188, category:"National Security", color:"#00732F",
    region:"ae", regionFlag:"🇦🇪", authority:"National Electronic Security Authority (NESA) / TDRA",
    year:2014, mandatory:true,
    description:"UAE Information Assurance Standards (IAS). Tiered approach for critical national infrastructure entities. 5 IA Levels with 188 controls. Now administered by TDRA.",
    scope:"UAE critical national infrastructure operators",
    templates:["IA Level Assessment","Information Classification Policy","Supplier Security Management","Security Operations Centre Design","Incident Management Procedure","Annual IA Review Report"],
    tags:["UAE","Critical Infrastructure","NESA","TDRA","IA Levels"],
  },
  {
    id:"ae_cbuae", label:"CBUAE Cybersecurity Framework", shortLabel:"CBUAE CSF",
    icon:"🏦", controls:62, category:"Financial Services", color:"#00732F",
    region:"ae", regionFlag:"🇦🇪", authority:"Central Bank of UAE (CBUAE)",
    year:2021, mandatory:true,
    description:"CBUAE Cybersecurity Framework for licensed financial institutions. Covers governance, risk, supply chain, incident response, and technology controls. Annual self-assessment required.",
    scope:"All CBUAE-licensed financial institutions and payment service providers",
    templates:["CBUAE Self-Assessment Questionnaire","Cyber Risk Appetite Statement","Technology Risk Register","Third-Party Security Assessment","Incident Notification Form","Business Continuity Scenario"],
    tags:["UAE","Banking","CBUAE","Financial","Self-Assessment"],
  },
  {
    id:"ae_adhics", label:"ADHICS v2", shortLabel:"ADHICS",
    icon:"🏥", controls:141, category:"Healthcare", color:"#00732F",
    region:"ae", regionFlag:"🇦🇪", authority:"Abu Dhabi Department of Health (DoH)",
    year:2019, mandatory:true,
    description:"Abu Dhabi Healthcare Information and Cyber Security Standard v2. Comprehensive 141-control standard for healthcare entities. Aligned with ISO 27001 and NIST. Mandatory for DoH-licensed facilities.",
    scope:"Abu Dhabi healthcare service providers and their business associates",
    templates:["ADHICS Control Assessment","Medical Device Security Policy","PHI Processing Register","Incident Response Plan (Healthcare)","Vendor Assessment Questionnaire","MFA Implementation Checklist"],
    tags:["UAE","Healthcare","Abu Dhabi","DoH","PHI"],
  },
  {
    id:"ae_difc", label:"DIFC Data Protection Law 2020", shortLabel:"DIFC DPL",
    icon:"🏛", controls:30, category:"Privacy", color:"#00732F",
    region:"ae", regionFlag:"🇦🇪", authority:"Dubai International Financial Centre (DIFC)",
    year:2020, mandatory:true,
    description:"DIFC Data Protection Law No. 5 of 2020. GDPR-influenced framework applying within DIFC. Covers consent, data minimisation, rights of data subjects, cross-border transfers and breach notification.",
    scope:"Entities established or carrying out processing within DIFC",
    templates:["DIFC Privacy Notice","Data Transfer Mechanism","Data Protection Policy","DSR Response Procedure","DPIA Screening Checklist","Commissioner Registration Form"],
    tags:["UAE","DIFC","Privacy","GDPR-aligned","Dubai"],
  },
  {
    id:"ae_ncema", label:"NCEMA 7000:2021", shortLabel:"NCEMA 7000",
    icon:"🏛", controls:77, category:"Business Continuity", color:"#00732F",
    region:"ae", regionFlag:"🇦🇪", authority:"National Emergency Crisis and Disasters Management Authority (NCEMA)",
    year:2021, mandatory:true,
    description:"UAE National Standard for Business Continuity Management NCEMA 7000:2021. Aligned with ISO 22301 but tailored for UAE context. Mandatory for federal entities and critical sector organisations.",
    scope:"UAE federal entities, semi-government and critical infrastructure operators",
    templates:["BIA Template (NCEMA)","Business Continuity Plan (UAE Arabic/English)","Crisis Communication Plan","Tabletop Exercise Package","NCEMA Self-Assessment Form","Recovery Objectives Register"],
    tags:["UAE","Business Continuity","NCEMA","BCM","Emergency Management"],
  },

  // ════════════════════════════════════════════════════
  // SAUDI ARABIA (KSA) 🇸🇦
  // ════════════════════════════════════════════════════
  {
    id:"sa_ecc", label:"NCA ECC (Essential Cybersecurity Controls)", shortLabel:"NCA ECC",
    icon:"🇸🇦", controls:114, category:"National Cybersecurity", color:"#006C35",
    region:"sa", regionFlag:"🇸🇦", authority:"National Cybersecurity Authority (NCA)",
    year:2018, mandatory:true,
    description:"Saudi Arabia Essential Cybersecurity Controls. 114 controls across 5 domains: Cybersecurity Governance, Risk, Compliance, Technology, and Human Aspects. Mandatory for government and critical national infrastructure.",
    scope:"Saudi government entities and critical national infrastructure organisations",
    templates:["ECC Control Assessment Matrix","Cybersecurity Policy Template (Arabic/English)","Risk Treatment Plan","Annual Compliance Report","NCA Assessment Preparation Checklist","Incident Reporting SOP"],
    tags:["KSA","NCA","Government","Critical Infrastructure","Arabic"],
  },
  {
    id:"sa_ccc", label:"NCA CCC (Cloud Cybersecurity Controls)", shortLabel:"NCA CCC",
    icon:"☁", controls:84, category:"Cloud Security", color:"#006C35",
    region:"sa", regionFlag:"🇸🇦", authority:"National Cybersecurity Authority (NCA)",
    year:2021, mandatory:true,
    description:"Saudi NCA Cloud Cybersecurity Controls for cloud service providers and consumers. Mandatory for government cloud adoption. Covers shared responsibility, data residency (data must remain in KSA), incident response.",
    scope:"Saudi government cloud consumers and cloud service providers",
    templates:["Cloud Shared Responsibility Matrix","Data Residency Declaration","Cloud Risk Assessment","CSP Assessment Questionnaire","Cloud Security Policy","Data Classification for Cloud"],
    tags:["KSA","NCA","Cloud","Data Residency","CSP"],
  },
  {
    id:"sa_pdpl", label:"Saudi PDPL 2021", shortLabel:"Saudi PDPL",
    icon:"🔐", controls:29, category:"Data Protection", color:"#006C35",
    region:"sa", regionFlag:"🇸🇦", authority:"Saudi Data & Artificial Intelligence Authority (SDAIA)",
    year:2021, mandatory:true,
    description:"Saudi Arabia Personal Data Protection Law (PDPL). First comprehensive data privacy law in KSA. Restricts cross-border transfers, mandates consent, provides individual rights. Implemented by SDAIA/NCA.",
    scope:"Entities processing personal data of Saudi residents",
    templates:["Privacy Notice (Arabic/English)","Consent Form","Data Subject Rights Procedure","Cross-Border Transfer Impact Assessment","DPA Template","DPIA Checklist","Data Breach Notification Template"],
    tags:["KSA","Privacy","SDAIA","Personal Data","Consent"],
  },
  {
    id:"sa_sama", label:"SAMA Cybersecurity Framework", shortLabel:"SAMA CSF",
    icon:"🏦", controls:71, category:"Financial Services", color:"#006C35",
    region:"sa", regionFlag:"🇸🇦", authority:"Saudi Central Bank (SAMA)",
    year:2017, mandatory:true,
    description:"SAMA Cybersecurity Framework for financial sector. Four domains: Leadership & Governance, Risk Management & Compliance, Operations & Technology, Third-Party Management. Annual maturity assessment required.",
    scope:"All SAMA-regulated financial institutions: banks, insurance companies, exchange organisations",
    templates:["SAMA CSF Self-Assessment Tool","Cybersecurity Governance Charter","Third-Party Vendor Assessment","Technology Risk Register","Annual Compliance Report","Incident Response Playbook"],
    tags:["KSA","SAMA","Banking","Financial","Maturity Model"],
  },
  {
    id:"sa_otcsc", label:"NCA OT-CSC", shortLabel:"NCA OT-CSC",
    icon:"⚡", controls:66, category:"OT/ICS Security", color:"#006C35",
    region:"sa", regionFlag:"🇸🇦", authority:"National Cybersecurity Authority (NCA)",
    year:2022, mandatory:true,
    description:"NCA Operational Technology Cybersecurity Controls. Applies to organisations operating Industrial Control Systems (ICS), SCADA and other OT environments in KSA. Energy, utilities, manufacturing focus.",
    scope:"Saudi organisations operating OT/ICS/SCADA environments",
    templates:["OT Asset Inventory","IT/OT Network Segmentation Policy","OT Incident Response Plan","Remote Access Policy (OT)","OT Vendor Security Requirements","Purdue Model Assessment"],
    tags:["KSA","OT","ICS","SCADA","Industrial","Energy"],
  },
  {
    id:"sa_cscc", label:"NCA CSCC", shortLabel:"NCA CSCC",
    icon:"🏛", controls:50, category:"Critical Systems", color:"#006C35",
    region:"sa", regionFlag:"🇸🇦", authority:"National Cybersecurity Authority (NCA)",
    year:2021, mandatory:true,
    description:"NCA Cybersecurity Controls for Critical Systems (CSCC). Targets the most critical systems within national organisations. Enhanced requirements beyond ECC for tier-1 critical systems.",
    scope:"Critical national systems in KSA government and CNI",
    templates:["Critical System Classification","Enhanced Control Assessment","Red Team Assessment Scope","SOC Level 3 Requirements","Privileged Access Management Policy"],
    tags:["KSA","NCA","Critical Systems","Enhanced Controls"],
  },

  // ════════════════════════════════════════════════════
  // BAHRAIN 🇧🇭
  // ════════════════════════════════════════════════════
  {
    id:"bh_pdpl", label:"Bahrain PDPL 2018", shortLabel:"Bahrain PDPL",
    icon:"🇧🇭", controls:26, category:"Data Protection", color:"#CE1126",
    region:"bh", regionFlag:"🇧🇭", authority:"Personal Data Protection Authority (PDPA)",
    year:2018, mandatory:true,
    description:"Bahrain Personal Data Protection Law No. 30 of 2018 — first comprehensive data protection law in MENA. GDPR-inspired. Covers consent, sensitive data, cross-border transfers, data subject rights. Fines up to BD 100,000.",
    scope:"Public and private entities in Bahrain processing personal data",
    templates:["Privacy Notice (Arabic/English)","Consent Record Form","Data Retention Schedule","DPIA Checklist","Data Subject Rights Procedure","Cross-Border Transfer Assessment","Breach Notification (72h)","DPA Template"],
    tags:["Bahrain","MENA","Data Protection","PDPA","Privacy"],
  },
  {
    id:"bh_cbb", label:"CBB Cybersecurity Framework", shortLabel:"CBB CSF",
    icon:"🏦", controls:58, category:"Financial Services", color:"#CE1126",
    region:"bh", regionFlag:"🇧🇭", authority:"Central Bank of Bahrain (CBB)",
    year:2019, mandatory:true,
    description:"CBB Cybersecurity Framework for Bahraini financial institutions. Covers governance, risk, security operations, third-party risk, incident response, and business continuity. Annual assessment required.",
    scope:"CBB-licensed financial institutions, banks, exchange houses, payment providers",
    templates:["CBB CSF Assessment Questionnaire","Cyber Risk Register","Technology Risk Policy","Third-Party Security SLA","Incident Report Form (CBB)","Annual Audit Programme","Board Cyber Dashboard"],
    tags:["Bahrain","CBB","Banking","Financial","Governance"],
  },
  {
    id:"bh_iga", label:"iGA e-Government Security Standards", shortLabel:"iGA Security",
    icon:"🏛", controls:45, category:"e-Government", color:"#CE1126",
    region:"bh", regionFlag:"🇧🇭", authority:"Information & eGovernment Authority (iGA)",
    year:2020, mandatory:true,
    description:"Bahrain Information and eGovernment Authority security standards for government digital services. Covers cloud adoption, national ID integration, cybersecurity, and digital service security.",
    scope:"Bahrain government entities and approved e-service providers",
    templates:["Government Cloud Security Policy","Digital Service Risk Assessment","e-Government Incident Report","National ID Integration Security Guide","Annual IT Audit Checklist"],
    tags:["Bahrain","Government","iGA","e-Government","Digital Services"],
  },
  {
    id:"bh_ncf", label:"Bahrain National Cybersecurity Framework", shortLabel:"Bahrain NCF",
    icon:"🛡", controls:52, category:"National Cybersecurity", color:"#CE1126",
    region:"bh", regionFlag:"🇧🇭", authority:"National Cyber Security Centre (NCSC Bahrain)",
    year:2022, mandatory:false,
    description:"Bahrain National Cybersecurity Framework. Provides a structured approach to managing cyber risks for critical infrastructure and major organisations. Aligns with NIST CSF and ISO 27001.",
    scope:"Bahrain critical infrastructure and major organisations",
    templates:["NCF Gap Assessment","Cybersecurity Roadmap Template","Incident Reporting Procedure","Sector Risk Profile","Board Cybersecurity Report"],
    tags:["Bahrain","National Framework","NCSC","Cybersecurity"],
  },

  // ════════════════════════════════════════════════════
  // UNITED STATES 🇺🇸
  // ════════════════════════════════════════════════════
  {
    id:"us_nist80053", label:"NIST SP 800-53 Rev 5", shortLabel:"NIST 800-53",
    icon:"🇺🇸", controls:1000, category:"Federal Security Controls", color:"#3C3B6E",
    region:"us", regionFlag:"🇺🇸", authority:"NIST",
    year:2020, mandatory:true,
    description:"NIST Security and Privacy Controls for Information Systems and Organisations. ~1000 controls across 20 control families. Mandatory for US federal information systems. Widely adopted by non-federal organisations.",
    scope:"US federal information systems; widely adopted by private sector",
    templates:["System Security Plan (SSP)","Security Assessment Report (SAR)","Plan of Action & Milestones (POA&M)","Control Implementation Statement","Privacy Impact Assessment","Contingency Plan"],
    tags:["US","Federal","FISMA","Controls","Government"],
  },
  {
    id:"us_fedramp", label:"FedRAMP (High)", shortLabel:"FedRAMP",
    icon:"☁", controls:421, category:"Federal Cloud", color:"#3C3B6E",
    region:"us", regionFlag:"🇺🇸", authority:"FedRAMP PMO / GSA",
    year:2011, mandatory:true,
    description:"Federal Risk and Authorisation Management Program. Required for cloud services sold to US federal agencies. FedRAMP High = 421 controls. Based on NIST SP 800-53 Rev 5.",
    scope:"Cloud Service Providers (CSPs) seeking federal authorisation",
    templates:["FedRAMP SSP Template","Customer Responsibility Matrix (CRM)","Continuous Monitoring Plan","Vulnerability Scanning SOP","Incident Response Plan","3PAO Assessment Package"],
    tags:["US","FedRAMP","Cloud","Federal","CSP","ATO"],
  },
  {
    id:"us_sox", label:"Sarbanes-Oxley (SOX)", shortLabel:"SOX",
    icon:"📊", controls:34, category:"Financial Reporting", color:"#3C3B6E",
    region:"us", regionFlag:"🇺🇸", authority:"SEC / PCAOB",
    year:2002, mandatory:true,
    description:"Sarbanes-Oxley Act financial reporting and IT controls. Section 302 (CEO/CFO attestation), Section 404 (ICFR assessment), Section 409 (real-time disclosure). Applies to US-listed public companies worldwide.",
    scope:"US public companies and foreign private issuers listed on US stock exchanges",
    templates:["ITGC Control Matrix","SOX Section 404 Readiness Checklist","Change Management Policy","Logical Access Review Template","IT Audit Programme","COSO Framework Self-Assessment","Deficiency Classification Guide"],
    tags:["US","SOX","Public Company","ITGC","Financial Controls","SEC"],
  },
  {
    id:"us_ccpa", label:"CCPA / CPRA", shortLabel:"CCPA/CPRA",
    icon:"🔐", controls:22, category:"Privacy", color:"#3C3B6E",
    region:"us", regionFlag:"🇺🇸", authority:"California Privacy Protection Agency (CPPA)",
    year:2020, mandatory:true,
    description:"California Consumer Privacy Act / California Privacy Rights Act. Strongest US state privacy law. Gives California residents rights to know, delete, opt-out of sale/sharing, correct data. Applies globally if thresholds met.",
    scope:"Businesses meeting revenue/data thresholds that process California resident personal information",
    templates:["Privacy Notice (CCPA-compliant)","Do Not Sell/Share Opt-Out Mechanism","Consumer Rights Request Procedure","Data Inventory & Mapping","CPRA Risk Assessment","Contractor/Service Provider Agreement Addendum"],
    tags:["US","California","Privacy","Consumer Rights","CPPA"],
  },
  {
    id:"us_nydfs", label:"NY DFS 23 NYCRR 500", shortLabel:"NY DFS 500",
    icon:"🏦", controls:23, category:"Financial Services", color:"#3C3B6E",
    region:"us", regionFlag:"🇺🇸", authority:"NY Department of Financial Services (DFS)",
    year:2017, mandatory:true,
    description:"New York DFS Cybersecurity Regulation — one of the first US state cyber laws. Requires CISO, annual pen testing, MFA, encryption, incident notification and CEO attestation. Amended 2023 with enhanced requirements.",
    scope:"DFS-licensed financial institutions operating in New York",
    templates:["Annual CEO Attestation Form","Cybersecurity Policy Template","Penetration Test Scope","Incident Notice to DFS (72h)","CISO Annual Report","Third-Party Service Provider Policy"],
    tags:["US","New York","DFS","Financial","CISO","Annual Certification"],
  },
  {
    id:"us_glba", label:"GLBA Safeguards Rule 2023", shortLabel:"GLBA",
    icon:"🏦", controls:20, category:"Financial Services", color:"#3C3B6E",
    region:"us", regionFlag:"🇺🇸", authority:"FTC",
    year:2023, mandatory:true,
    description:"Gramm-Leach-Bliley Act FTC Safeguards Rule (updated 2023). Requires financial institutions to implement comprehensive information security programmes. Now includes specific technical safeguards similar to NY DFS 500.",
    scope:"FTC-supervised financial institutions",
    templates:["Information Security Programme","Risk Assessment Template","Vendor Oversight Policy","Incident Response Plan","Annual Report to Board","Employee Security Training Plan"],
    tags:["US","GLBA","FTC","Financial","Safeguards"],
  },
  {
    id:"us_nerccip", label:"NERC CIP", shortLabel:"NERC CIP",
    icon:"⚡", controls:100, category:"Energy / OT", color:"#3C3B6E",
    region:"us", regionFlag:"🇺🇸", authority:"NERC (North American Electric Reliability Corp)",
    year:2006, mandatory:true,
    description:"North American Electric Reliability Corporation Critical Infrastructure Protection standards. Mandatory for bulk electric system owners and operators. 13 CIP standards covering BES Cyber Systems.",
    scope:"Owners/operators/users of North American Bulk Electric System",
    templates:["BES Cyber Asset Inventory","Electronic Security Perimeter Document","Physical Security Plan","System Security Management Policy","Recovery Plans for BES Cyber Systems","Configuration Change Management SOP"],
    tags:["US","Energy","OT","SCADA","Utility","Electric Grid"],
  },

  // ════════════════════════════════════════════════════
  // UGANDA 🇺🇬
  // ════════════════════════════════════════════════════
  {
    id:"ug_dppa", label:"Data Protection & Privacy Act 2019", shortLabel:"Uganda DPPA",
    icon:"🇺🇬", controls:24, category:"Data Protection", color:"#FCDC04",
    region:"ug", regionFlag:"🇺🇬", authority:"Personal Data Protection Office (PDPO)",
    year:2019, mandatory:true,
    description:"Uganda Data Protection and Privacy Act 2019. Establishes PDPO. Covers consent, data subject rights, cross-border transfers, sensitive data, registration of data collectors. First comprehensive data protection law in East Africa.",
    scope:"Entities that control or process personal data in Uganda",
    templates:["Privacy Policy (Uganda)","Data Collector Registration Form","Consent Collection Mechanism","DSR Request Procedure","Cross-Border Transfer Assessment","Breach Notification Template","PDPO Annual Return"],
    tags:["Uganda","PDPO","East Africa","Data Protection","Privacy"],
  },
  {
    id:"ug_ucc", label:"UCC Cybersecurity Framework", shortLabel:"UCC CSF",
    icon:"📡", controls:38, category:"Telecommunications", color:"#FCDC04",
    region:"ug", regionFlag:"🇺🇬", authority:"Uganda Communications Commission (UCC)",
    year:2020, mandatory:true,
    description:"Uganda Communications Commission Cybersecurity Framework and Guidelines. Covers licensed telecom operators and internet service providers. Incident reporting, network security, subscriber data protection.",
    scope:"UCC-licensed telecommunications service providers and ISPs",
    templates:["Network Security Policy","Subscriber Data Protection Policy","Incident Reporting Form (UCC)","Penetration Testing Scope","Business Continuity Plan (Telco)"],
    tags:["Uganda","Telecom","UCC","ISP","Network Security"],
  },
  {
    id:"ug_bou", label:"Bank of Uganda ICT Standards", shortLabel:"BoU ICT",
    icon:"🏦", controls:42, category:"Financial Services", color:"#FCDC04",
    region:"ug", regionFlag:"🇺🇬", authority:"Bank of Uganda (BoU)",
    year:2019, mandatory:true,
    description:"Bank of Uganda ICT Security Guidelines and Cybersecurity Framework for supervised financial institutions. Covers IT governance, cybersecurity controls, internet/mobile banking security, and incident management.",
    scope:"BoU-supervised commercial banks, microfinance institutions and payment service providers",
    templates:["IT Security Policy Framework","Mobile Banking Security Checklist","Internet Banking Risk Assessment","Cyber Incident Report (BoU)","IT Governance Charter","Third-Party Risk Policy"],
    tags:["Uganda","Banking","BoU","Financial","ICT Governance"],
  },
  {
    id:"ug_nitau", label:"NITA-U e-Government Security Standards", shortLabel:"NITA-U",
    icon:"🏛", controls:35, category:"e-Government", color:"#FCDC04",
    region:"ug", regionFlag:"🇺🇬", authority:"National Information Technology Authority Uganda (NITA-U)",
    year:2021, mandatory:true,
    description:"NITA-U standards for e-Government information systems security in Uganda. Covers government cloud, interoperability, data sharing, cybersecurity and digital service delivery.",
    scope:"Ugandan government ministries, departments, agencies and local governments",
    templates:["e-Government Security Compliance Checklist","Data Sharing Agreement Template","Government System Risk Assessment","ICT Procurement Security Requirements","Annual Compliance Declaration"],
    tags:["Uganda","Government","NITA-U","e-Government","Digital Services"],
  },

  // ════════════════════════════════════════════════════
  // NIGERIA 🇳🇬
  // ════════════════════════════════════════════════════
  {
    id:"ng_ndpa", label:"Nigeria Data Protection Act 2023", shortLabel:"NDPA 2023",
    icon:"🇳🇬", controls:32, category:"Data Protection", color:"#008751",
    region:"ng", regionFlag:"🇳🇬", authority:"Nigeria Data Protection Commission (NDPC)",
    year:2023, mandatory:true,
    description:"Nigeria Data Protection Act 2023 — replaces NDPR 2019. Establishes NDPC with stronger enforcement powers. Covers consent, lawful bases, cross-border transfers, data subject rights. First standalone data protection law in Nigeria.",
    scope:"Data controllers and processors established in Nigeria or processing Nigerian residents' data",
    templates:["Privacy Policy (Nigerian format)","Data Processing Agreement","Consent Notice Template","DSR Handling Procedure","Breach Notification Template","DPO Appointment Letter","Annual Compliance Return (NDPC)","Data Audit Report"],
    tags:["Nigeria","NDPC","Data Protection","West Africa","Privacy"],
  },
  {
    id:"ng_cbn", label:"CBN Cybersecurity Framework 2021", shortLabel:"CBN CSF",
    icon:"🏦", controls:64, category:"Financial Services", color:"#008751",
    region:"ng", regionFlag:"🇳🇬", authority:"Central Bank of Nigeria (CBN)",
    year:2021, mandatory:true,
    description:"CBN Cybersecurity Framework and Guidelines (Revised 2021) for Nigerian banks and financial institutions. 5 functions aligned to NIST CSF. Minimum baseline requirements and annual assessment.",
    scope:"All CBN-licensed financial institutions: commercial banks, fintechs, payment service providers, microfinance banks",
    templates:["CBN CSF Self-Assessment Tool","Cybersecurity Governance Policy","Risk Register Template","Third-Party Risk Assessment","Incident Report (NITDA/CBN)","Annual Cyber Risk Report to Board","BCP for Financial Services"],
    tags:["Nigeria","CBN","Banking","Financial","NIST-aligned"],
  },
  {
    id:"ng_ncc", label:"NCC Cybersecurity Regulations 2022", shortLabel:"NCC Cyber",
    icon:"📡", controls:41, category:"Telecommunications", color:"#008751",
    region:"ng", regionFlag:"🇳🇬", authority:"Nigerian Communications Commission (NCC)",
    year:2022, mandatory:true,
    description:"NCC Cybersecurity Regulations for licensed telecommunications operators in Nigeria. Covers security baselines, incident reporting, subscriber data protection, lawful interception and network resilience.",
    scope:"NCC-licensed Mobile Network Operators, ISPs and value-added service providers",
    templates:["Network Security Baseline Checklist","Subscriber Data Protection Policy","Incident Notification Form (NCC 24h)","Lawful Interception Policy","Penetration Test Programme","Business Continuity Plan"],
    tags:["Nigeria","Telecom","NCC","Network Security","Subscriber Data"],
  },
  {
    id:"ng_nitda", label:"NITDA Guidelines", shortLabel:"NITDA",
    icon:"🏛", controls:36, category:"IT Governance", color:"#008751",
    region:"ng", regionFlag:"🇳🇬", authority:"National Information Technology Development Agency (NITDA)",
    year:2019, mandatory:true,
    description:"NITDA data protection, IT governance and cybersecurity guidelines for Nigerian organisations. Covers public and private sector IT standards, cloud adoption, IT procurement and NDPA enforcement.",
    scope:"Organisations engaged in data processing activities in Nigeria",
    templates:["IT Governance Policy","Data Audit Report Format","DPO Job Description","Third-Party Vendor Security Questionnaire","Annual NITDA Compliance Audit","Cloud Adoption Security Checklist"],
    tags:["Nigeria","NITDA","IT Governance","Data Audit","Compliance"],
  },

  // ════════════════════════════════════════════════════
  // SRI LANKA 🇱🇰
  // ════════════════════════════════════════════════════
  {
    id:"lk_cbsl", label:"CBSL Cybersecurity Direction 2023", shortLabel:"CBSL Direction",
    icon:"🇱🇰", controls:44, category:"Financial Services", color:"#8D153A",
    region:"lk", regionFlag:"🇱🇰", authority:"Central Bank of Sri Lanka (CBSL)",
    year:2023, mandatory:true,
    description:"CBSL Direction on Cybersecurity for licensed banks and financial institutions. Covers governance, risk management, security controls, incident notification (24h), third-party management and annual assessments.",
    scope:"All CBSL-licensed banks, finance companies and leasing companies",
    templates:["Cybersecurity Governance Policy","CBSL Incident Report Form (24h)","Annual Cybersecurity Assessment Report","Third-Party Risk Management Policy","Technology Risk Register","Board Cybersecurity Report"],
    tags:["Sri Lanka","CBSL","Banking","Financial","Incident Reporting"],
  },
  {
    id:"lk_trcsl", label:"TRCSL Security Regulations", shortLabel:"TRCSL",
    icon:"📡", controls:33, category:"Telecommunications", color:"#8D153A",
    region:"lk", regionFlag:"🇱🇰", authority:"Telecommunication Regulatory Commission of Sri Lanka (TRCSL)",
    year:2021, mandatory:true,
    description:"TRCSL cybersecurity and data protection regulations for licensed telecom operators in Sri Lanka. Covers network security, subscriber data, lawful interception, incident reporting and business continuity.",
    scope:"TRCSL-licensed telecom service providers",
    templates:["Network Security Policy","Subscriber Data Policy","Incident Notification Procedure","Lawful Interception Framework","Annual Network Security Audit"],
    tags:["Sri Lanka","TRCSL","Telecom","Network Security"],
  },
  {
    id:"lk_certcc", label:"CERT|CC Sri Lanka Guidelines", shortLabel:"CERT|CC SL",
    icon:"🛡", controls:28, category:"Cyber Incident Management", color:"#8D153A",
    region:"lk", regionFlag:"🇱🇰", authority:"Sri Lanka CERT|CC (ICTA)",
    year:2022, mandatory:false,
    description:"Sri Lanka Computer Emergency Readiness Team guidelines for cyber incident preparedness and response. Covers critical national infrastructure, government systems and private sector.",
    scope:"Sri Lanka critical infrastructure, government entities and major private sector organisations",
    templates:["Incident Response Plan","Critical System Identification Form","Vulnerability Disclosure Policy","CERT|CC Incident Report Form","Cyber Resilience Assessment"],
    tags:["Sri Lanka","CERT","Incident Response","Critical Infrastructure"],
  },
  {
    id:"lk_icta", label:"ICTA Cybersecurity Framework", shortLabel:"ICTA CSF",
    icon:"🏛", controls:40, category:"e-Government / IT", color:"#8D153A",
    region:"lk", regionFlag:"🇱🇰", authority:"Information & Communication Technology Agency (ICTA)",
    year:2023, mandatory:true,
    description:"ICTA Cybersecurity Framework for Sri Lankan government entities. Covers IT governance, cloud adoption, digital service security, data protection and cybersecurity capacity building.",
    scope:"Sri Lankan government ministries, departments and statutory boards",
    templates:["Government IT Security Policy","Cloud Adoption Security Checklist","Digital Service Risk Assessment","Annual ICT Audit Report","Data Classification Policy"],
    tags:["Sri Lanka","ICTA","Government","e-Government","ICT Governance"],
  },

  // ════════════════════════════════════════════════════
  // BANGLADESH 🇧🇩
  // ════════════════════════════════════════════════════
  {
    id:"bd_csa", label:"Cyber Security Act 2023", shortLabel:"Bangladesh CSA",
    icon:"🇧🇩", controls:30, category:"Cybersecurity Law", color:"#006A4E",
    region:"bd", regionFlag:"🇧🇩", authority:"Ministry of ICT / Digital Security Agency",
    year:2023, mandatory:true,
    description:"Bangladesh Cyber Security Act 2023 (replaces Digital Security Act 2018). Criminalises cybercrimes, establishes the Cyber Security Agency, mandates critical infrastructure protection and incident reporting.",
    scope:"All persons and entities operating digital systems in Bangladesh",
    templates:["Cyber Incident Report Form (BDCERT)","Digital Security Policy","Critical System Register","Incident Response SOP","Annual Compliance Declaration"],
    tags:["Bangladesh","Cyber Law","DSA","Digital Security"],
  },
  {
    id:"bd_bb", label:"Bangladesh Bank ICT Security Guidelines", shortLabel:"BB ICT",
    icon:"🏦", controls:52, category:"Financial Services", color:"#006A4E",
    region:"bd", regionFlag:"🇧🇩", authority:"Bangladesh Bank (Central Bank)",
    year:2020, mandatory:true,
    description:"Bangladesh Bank ICT Security Guidelines and Risk Management Framework for banks and financial institutions. Covers ISMS, internet/mobile banking security, SWIFT security, incident reporting and SOC requirements.",
    scope:"Bangladesh Bank-supervised scheduled banks, specialised banks and financial institutions",
    templates:["ICT Security Policy","Internet Banking Risk Assessment","SWIFT Security Checklist (CSCF)","Cyber Incident Report Form (BB 4h)","SOC Capability Assessment","Third-Party ICT Risk Policy","BCP/DRP Template"],
    tags:["Bangladesh","Banking","BB","SWIFT","ICT Security"],
  },
  {
    id:"bd_btrc", label:"BTRC Cybersecurity Guidelines", shortLabel:"BTRC",
    icon:"📡", controls:36, category:"Telecommunications", color:"#006A4E",
    region:"bd", regionFlag:"🇧🇩", authority:"Bangladesh Telecommunication Regulatory Commission (BTRC)",
    year:2020, mandatory:true,
    description:"BTRC cybersecurity and network security guidelines for licensed telecom operators in Bangladesh. Covers network integrity, subscriber data protection, lawful interception and incident management.",
    scope:"BTRC-licensed mobile and internet service providers",
    templates:["Network Security Baseline","Subscriber Data Policy","Incident Notification Form","Lawful Interception SOP","Annual Network Security Assessment"],
    tags:["Bangladesh","BTRC","Telecom","Network","Subscriber Data"],
  },
  {
    id:"bd_cirt", label:"BGD e-GOV CIRT Standards", shortLabel:"BGD CIRT",
    icon:"🛡", controls:27, category:"e-Government / CERT", color:"#006A4E",
    region:"bd", regionFlag:"🇧🇩", authority:"Bangladesh e-Government Computer Incident Response Team",
    year:2022, mandatory:true,
    description:"Bangladesh Government CIRT standards for government information systems. Covers critical infrastructure protection, mandatory incident reporting to BGD e-GOV CIRT, security baselines and patch management.",
    scope:"Bangladeshi government ministries, agencies and critical infrastructure operators",
    templates:["Government Incident Report Form","Critical Asset Register","Patch Management SOP","Security Configuration Baseline","Annual Government IT Security Assessment"],
    tags:["Bangladesh","Government","CIRT","Incident Reporting","Patch Management"],
  },

  // ════════════════════════════════════════════════════
  // UNITED KINGDOM 🇬🇧
  // ════════════════════════════════════════════════════
  {
    id:"gb_ukgdpr", label:"UK GDPR + DPA 2018", shortLabel:"UK GDPR",
    icon:"🇬🇧", controls:26, category:"Data Protection", color:"#012169",
    region:"gb", regionFlag:"🇬🇧", authority:"Information Commissioner's Office (ICO)",
    year:2018, mandatory:true,
    description:"Post-Brexit UK data protection framework: UK GDPR plus the Data Protection Act 2018. Mirrors EU GDPR but with UK-specific provisions. ICO enforcement with fines up to £17.5M or 4% global turnover.",
    scope:"Organisations established in UK or processing UK residents' personal data",
    templates:["UK Privacy Notice","UK RoPA (Article 30)","UK DPIA Template","DSR Response Procedure","Breach Notification (ICO 72h)","UK DPA Template","Legitimate Interests Assessment","UK International Transfer Mechanism (IDTA)"],
    tags:["UK","GDPR","ICO","Data Protection","Post-Brexit","DPA 2018"],
  },
  {
    id:"gb_cyberessentials", label:"Cyber Essentials / Plus", shortLabel:"Cyber Essentials",
    icon:"🛡", controls:68, category:"Cyber Hygiene", color:"#012169",
    region:"gb", regionFlag:"🇬🇧", authority:"NCSC (National Cyber Security Centre)",
    year:2014, mandatory:false,
    description:"UK Government-backed certification scheme. Five technical controls: Firewalls, Secure configuration, User access control, Malware protection, Patch management. Cyber Essentials Plus adds external testing.",
    scope:"Any UK organisation (mandatory for UK Government suppliers handling personal data)",
    templates:["Cyber Essentials Self-Assessment Questionnaire","Technical Controls Gap Analysis","Patching Policy","Boundary Firewalls & Gateways Policy","Secure Configuration Baseline","Malware Protection Policy"],
    tags:["UK","NCSC","Certification","Cyber Hygiene","Government Contracts"],
  },
  {
    id:"gb_caf", label:"NCSC CAF (Cyber Assessment Framework)", shortLabel:"NCSC CAF",
    icon:"🔭", controls:62, category:"Critical Infrastructure", color:"#012169",
    region:"gb", regionFlag:"🇬🇧", authority:"NCSC",
    year:2018, mandatory:true,
    description:"NCSC Cyber Assessment Framework for UK critical national infrastructure operators and regulators. Four objectives: Managing security risk, Protecting against cyber attack, Detecting cyber events, Minimising impact.",
    scope:"UK critical national infrastructure operators and relevant digital service providers under NIS Regulations",
    templates:["CAF Self-Assessment","Indicator of Good Practice (IGP) Mapping","Network Architecture Review","Incident Detection Capability Assessment","Supply Chain Cyber Security Policy"],
    tags:["UK","Critical Infrastructure","NCSC","CNI","NIS","Resilience"],
  },
  {
    id:"gb_nis", label:"UK NIS Regulations 2018", shortLabel:"UK NIS",
    icon:"⚡", controls:35, category:"Network & Info Security", color:"#012169",
    region:"gb", regionFlag:"🇬🇧", authority:"DCMS / Sector Regulators",
    year:2018, mandatory:true,
    description:"UK Network and Information Systems Regulations 2018. Applies to Operators of Essential Services (OES) and Relevant Digital Service Providers. Requires appropriate security measures and incident reporting.",
    scope:"Operators of Essential Services and digital service providers in UK",
    templates:["NIS Competent Authority Incident Report","Security Measures Assessment (CAF-based)","Network Risk Assessment","Incident Response Plan","Supply Chain Security Policy","Designated SPOC Registration"],
    tags:["UK","NIS","Critical Infrastructure","OES","RDSP","Incident Reporting"],
  },
  {
    id:"gb_fca", label:"FCA SYSC Cybersecurity Requirements", shortLabel:"FCA SYSC",
    icon:"🏦", controls:45, category:"Financial Services", color:"#012169",
    region:"gb", regionFlag:"🇬🇧", authority:"Financial Conduct Authority (FCA) / PRA",
    year:2022, mandatory:true,
    description:"FCA Senior Manager and Certification Regime (SM&CR) plus SYSC cybersecurity requirements. PS21/3 Operational Resilience. Covers ICT risk, outsourcing, cyber resilience and board accountability. Aligned with DORA.",
    scope:"FCA/PRA-authorised firms",
    templates:["Operational Resilience Self-Assessment","Important Business Services Mapping","Impact Tolerances Definition","SMCR Accountability Register","Outsourcing Register","Technology Risk Policy","ICT Incident Report (FCA)"],
    tags:["UK","FCA","PRA","Financial","Operational Resilience","SMCR","DORA-aligned"],
  },
  {
    id:"gb_ico", label:"ICO Accountability Framework", shortLabel:"ICO Framework",
    icon:"🔐", controls:32, category:"Data Protection Accountability", color:"#012169",
    region:"gb", regionFlag:"🇬🇧", authority:"Information Commissioner's Office (ICO)",
    year:2021, mandatory:false,
    description:"ICO Accountability Framework — practical tool to help organisations demonstrate UK GDPR accountability. 10 areas: Leadership/governance, Policies, Training, Data sharing, Records, DSARs, DPIA, Breach management, Contracts, DPO.",
    scope:"All UK GDPR-subject organisations",
    templates:["ICO Accountability Self-Assessment","Data Protection Policy","Consent Management Procedure","Legitimate Interests Assessment","Data Retention Schedule","Staff Privacy Training Record","ROPA Template"],
    tags:["UK","ICO","Accountability","UK GDPR","DPO","Demonstration"],
  },
];

// ── Helper exports ────────────────────────────────────────────────────────
export function getFrameworksByRegion(regionId: string): RegionalFramework[] {
  return ALL_FRAMEWORKS.filter(f => f.region === regionId);
}

export function getFrameworkById(id: string): RegionalFramework | undefined {
  return ALL_FRAMEWORKS.find(f => f.id === id);
}

export function searchFrameworks(query: string): RegionalFramework[] {
  const q = query.toLowerCase();
  return ALL_FRAMEWORKS.filter(f =>
    f.label.toLowerCase().includes(q) ||
    f.shortLabel.toLowerCase().includes(q) ||
    f.authority.toLowerCase().includes(q) ||
    f.category.toLowerCase().includes(q) ||
    f.tags.some(t => t.toLowerCase().includes(q))
  );
}

export const FRAMEWORK_COUNT = ALL_FRAMEWORKS.length;
export const REGION_COUNT = REGIONS.length;
