import { Router } from "express";
import { eq, and, sql, ilike, or } from "drizzle-orm";
import { db } from "@workspace/service-kit";
import {
  frameworkLibraryTable,
  frameworkLibraryControlsTable,
  tenantFrameworksTable,
  controlsTable,
  tenantsTable,
  usersTable,
} from "@workspace/db";
import { requireAuth, requireRole } from "@workspace/service-kit";
import type { JwtPayload } from "@workspace/service-kit";

const router = Router();
const isSuperAdmin = requireRole("super_admin");

function u(req: Parameters<typeof requireAuth>[0]) {
  return (req as typeof req & { user: JwtPayload }).user;
}

// ── Seed helper — idempotent (called once on server start) ───────────────────

const FRAMEWORK_SEED: Array<{
  shortCode: string; name: string; version: string; category: string;
  region: string; controlsCount: number; isBeta: boolean; description: string;
}> = [
  // ISO / IEC
  { shortCode:"ISO27001",   name:"ISO/IEC 27001:2022",           version:"2022", category:"ISO",      region:"Global",  controlsCount:93,  isBeta:false, description:"Information Security Management System — defines requirements for an ISMS." },
  { shortCode:"ISO27002",   name:"ISO/IEC 27002:2022",           version:"2022", category:"ISO",      region:"Global",  controlsCount:93,  isBeta:false, description:"Code of practice for information security controls." },
  { shortCode:"ISO27017",   name:"ISO/IEC 27017:2015",           version:"2015", category:"ISO",      region:"Global",  controlsCount:37,  isBeta:false, description:"Information security controls for cloud services." },
  { shortCode:"ISO27018",   name:"ISO/IEC 27018:2019",           version:"2019", category:"ISO",      region:"Global",  controlsCount:25,  isBeta:false, description:"Protection of PII in public clouds." },
  { shortCode:"ISO27701",   name:"ISO/IEC 27701:2019",           version:"2019", category:"ISO",      region:"Global",  controlsCount:49,  isBeta:false, description:"Privacy Information Management System — extends ISO 27001 for GDPR." },
  { shortCode:"ISO27005",   name:"ISO/IEC 27005:2022",           version:"2022", category:"ISO",      region:"Global",  controlsCount:0,   isBeta:false, description:"Information security risk management guidelines." },
  { shortCode:"ISO22301",   name:"ISO 22301:2019",               version:"2019", category:"ISO",      region:"Global",  controlsCount:46,  isBeta:false, description:"Business continuity management system requirements." },
  { shortCode:"ISO20000",   name:"ISO/IEC 20000-1:2018",         version:"2018", category:"ISO",      region:"Global",  controlsCount:34,  isBeta:false, description:"IT service management system requirements." },
  { shortCode:"ISO42001",   name:"ISO/IEC 42001:2023",           version:"2023", category:"ISO",      region:"Global",  controlsCount:38,  isBeta:false, description:"AI Management System (AIMS) — requirements for responsible AI." },
  { shortCode:"ISO31000",   name:"ISO 31000:2018",               version:"2018", category:"ISO",      region:"Global",  controlsCount:22,  isBeta:false, description:"Risk management — principles and generic guidelines." },
  { shortCode:"ISO9001",    name:"ISO 9001:2015",                version:"2015", category:"ISO",      region:"Global",  controlsCount:0,   isBeta:false, description:"Quality management systems requirements." },
  { shortCode:"ISO14001",   name:"ISO 14001:2015",               version:"2015", category:"ISO",      region:"Global",  controlsCount:0,   isBeta:false, description:"Environmental management systems requirements." },
  { shortCode:"ISO45001",   name:"ISO 45001:2018",               version:"2018", category:"ISO",      region:"Global",  controlsCount:0,   isBeta:false, description:"Occupational health and safety management systems." },
  { shortCode:"ISO37001",   name:"ISO 37001:2016",               version:"2016", category:"ISO",      region:"Global",  controlsCount:0,   isBeta:false, description:"Anti-bribery management systems requirements." },
  { shortCode:"ISO37301",   name:"ISO 37301:2021",               version:"2021", category:"ISO",      region:"Global",  controlsCount:0,   isBeta:false, description:"Compliance management systems requirements." },
  { shortCode:"ISO27032",   name:"ISO/IEC 27032:2023",           version:"2023", category:"ISO",      region:"Global",  controlsCount:0,   isBeta:false, description:"Guidelines for cybersecurity." },
  { shortCode:"ISO27035",   name:"ISO/IEC 27035:2023",           version:"2023", category:"ISO",      region:"Global",  controlsCount:0,   isBeta:false, description:"Information security incident management guidelines." },
  { shortCode:"ISO27043",   name:"ISO/IEC 27043:2015",           version:"2015", category:"ISO",      region:"Global",  controlsCount:0,   isBeta:false, description:"Incident investigation principles and processes." },
  { shortCode:"ISO15408",   name:"ISO/IEC 15408 (Common Criteria)",version:"2022",category:"ISO",    region:"Global",  controlsCount:0,   isBeta:false, description:"Evaluation criteria for IT security." },
  { shortCode:"ISO29101",   name:"ISO/IEC 29101:2018",           version:"2018", category:"ISO",      region:"Global",  controlsCount:0,   isBeta:false, description:"Privacy architecture framework." },
  { shortCode:"ISO29134",   name:"ISO/IEC 29134:2017",           version:"2017", category:"ISO",      region:"Global",  controlsCount:0,   isBeta:false, description:"Guidelines for privacy impact assessment." },
  { shortCode:"ISO29151",   name:"ISO/IEC 29151:2017",           version:"2017", category:"ISO",      region:"Global",  controlsCount:0,   isBeta:false, description:"Code of practice for PII protection." },

  // NIST
  { shortCode:"NIST-CSF2",  name:"NIST Cybersecurity Framework 2.0",version:"2.0",category:"NIST",   region:"US",      controlsCount:108, isBeta:false, description:"Framework for improving critical infrastructure cybersecurity." },
  { shortCode:"NIST-800-53",name:"NIST SP 800-53 Rev 5",          version:"Rev 5",category:"NIST",   region:"US",      controlsCount:1074,isBeta:false, description:"Security and privacy controls for federal information systems." },
  { shortCode:"NIST-800-171",name:"NIST SP 800-171 Rev 3",        version:"Rev 3",category:"NIST",   region:"US",      controlsCount:110, isBeta:false, description:"Protecting CUI in non-federal systems." },
  { shortCode:"NIST-800-37", name:"NIST SP 800-37",               version:"Rev 2",category:"NIST",   region:"US",      controlsCount:0,   isBeta:false, description:"Risk management framework for information systems." },
  { shortCode:"NIST-800-30", name:"NIST SP 800-30",               version:"Rev 1",category:"NIST",   region:"US",      controlsCount:0,   isBeta:false, description:"Guide for conducting risk assessments." },
  { shortCode:"NIST-800-61", name:"NIST SP 800-61",               version:"Rev 2",category:"NIST",   region:"US",      controlsCount:0,   isBeta:false, description:"Computer security incident handling guide." },
  { shortCode:"NIST-800-82", name:"NIST SP 800-82",               version:"Rev 3",category:"NIST",   region:"US",      controlsCount:0,   isBeta:false, description:"Guide to operational technology (OT) security." },
  { shortCode:"NIST-800-207",name:"NIST SP 800-207 (Zero Trust)", version:"1.0",  category:"NIST",   region:"US",      controlsCount:0,   isBeta:false, description:"Zero trust architecture principles." },
  { shortCode:"NIST-AI-RMF", name:"NIST AI RMF 1.0",             version:"1.0",  category:"NIST",   region:"US",      controlsCount:72,  isBeta:false, description:"AI risk management framework." },
  { shortCode:"NIST-PF",     name:"NIST Privacy Framework 1.0",   version:"1.0",  category:"NIST",   region:"US",      controlsCount:100, isBeta:false, description:"A tool for improving privacy through enterprise risk management." },
  { shortCode:"NIST-SMB-CSF",name:"NIST CSF for SMBs",           version:"1.0",  category:"NIST",   region:"US",      controlsCount:20,  isBeta:false, description:"Cybersecurity framework implementation for small businesses." },

  // SOC
  { shortCode:"SOC1-I",     name:"SOC 1 Type I",                  version:"2023", category:"SOC",    region:"US",      controlsCount:0,   isBeta:false, description:"Report on controls at a service organisation — design effectiveness." },
  { shortCode:"SOC1-II",    name:"SOC 1 Type II",                 version:"2023", category:"SOC",    region:"US",      controlsCount:0,   isBeta:false, description:"Report on controls at a service organisation — operating effectiveness." },
  { shortCode:"SOC2-I",     name:"SOC 2 Type I",                  version:"2023", category:"SOC",    region:"US",      controlsCount:64,  isBeta:false, description:"Trust Services Criteria — design effectiveness." },
  { shortCode:"SOC2-II",    name:"SOC 2 Type II",                 version:"2023", category:"SOC",    region:"US",      controlsCount:64,  isBeta:false, description:"Trust Services Criteria — Security, Availability, Confidentiality, PI, Privacy." },

  // Healthcare
  { shortCode:"HIPAA-SEC",  name:"HIPAA Security Rule",           version:"2013", category:"Healthcare",region:"US",   controlsCount:45,  isBeta:false, description:"Standards for electronic protected health information (ePHI) security." },
  { shortCode:"HIPAA-PRV",  name:"HIPAA Privacy Rule",            version:"2013", category:"Healthcare",region:"US",   controlsCount:18,  isBeta:false, description:"Standards for use and disclosure of protected health information." },
  { shortCode:"HIPAA-BRN",  name:"HIPAA Breach Notification",     version:"2013", category:"Healthcare",region:"US",   controlsCount:6,   isBeta:false, description:"Requirements for notifying patients of PHI breaches." },
  { shortCode:"HITRUST-CSF",name:"HITRUST CSF v11",               version:"v11",  category:"Healthcare",region:"US",   controlsCount:156, isBeta:false, description:"Comprehensive health information trust framework." },
  { shortCode:"21CFR11",    name:"21 CFR Part 11 (FDA)",          version:"2024", category:"Healthcare",region:"US",   controlsCount:14,  isBeta:false, description:"Electronic records and signatures requirements for FDA-regulated industries." },
  { shortCode:"HICP",       name:"Health Industry Cybersecurity Practices (HICP)", version:"2023", category:"Healthcare",region:"US",controlsCount:72,isBeta:false, description:"Cybersecurity practices for healthcare organisations." },

  // Payment / Financial
  { shortCode:"PCIDSS4",    name:"PCI DSS v4.0",                  version:"4.0",  category:"PCI DSS", region:"Global",  controlsCount:286, isBeta:false, description:"Payment Card Industry Data Security Standard." },
  { shortCode:"PCI-PADSS",  name:"PCI PA-DSS",                    version:"3.2",  category:"PCI DSS", region:"Global",  controlsCount:14,  isBeta:false, description:"Payment application data security standard." },
  { shortCode:"PCI-P2PE",   name:"PCI P2PE",                      version:"3.0",  category:"PCI DSS", region:"Global",  controlsCount:0,   isBeta:false, description:"Point-to-point encryption standard." },
  { shortCode:"PCI-SSF",    name:"PCI SSF",                       version:"1.2",  category:"PCI DSS", region:"Global",  controlsCount:0,   isBeta:false, description:"Software security framework for payment software vendors." },
  { shortCode:"SOX",        name:"SOX (ICFR)",                    version:"2024", category:"Financial",region:"US",     controlsCount:0,   isBeta:false, description:"Sarbanes-Oxley internal controls over financial reporting." },
  { shortCode:"GLBA",       name:"GLBA",                          version:"2024", category:"Financial",region:"US",     controlsCount:0,   isBeta:false, description:"Gramm-Leach-Bliley Act safeguards rule." },
  { shortCode:"FFIEC",      name:"FFIEC IT Handbook",             version:"2024", category:"Financial",region:"US",     controlsCount:0,   isBeta:false, description:"Federal Financial Institutions Examination Council IT examination handbook." },
  { shortCode:"BASELIII",   name:"Basel III Ops Risk",            version:"2023", category:"Financial",region:"Global", controlsCount:0,   isBeta:false, description:"Basel III operational risk requirements." },
  { shortCode:"MIFID2",     name:"MiFID II",                      version:"2024", category:"Financial",region:"EU",     controlsCount:0,   isBeta:false, description:"Markets in Financial Instruments Directive II." },
  { shortCode:"FINRA",      name:"FINRA",                         version:"2024", category:"Financial",region:"US",     controlsCount:0,   isBeta:false, description:"Financial Industry Regulatory Authority rules." },
  { shortCode:"CFTC",       name:"CFTC",                          version:"2024", category:"Financial",region:"US",     controlsCount:0,   isBeta:false, description:"Commodity Futures Trading Commission requirements." },

  // Privacy / Data Protection
  { shortCode:"GDPR",       name:"GDPR",                          version:"2018", category:"Privacy", region:"EU",      controlsCount:99,  isBeta:false, description:"General Data Protection Regulation — EU data protection law." },
  { shortCode:"UK-GDPR",    name:"UK GDPR",                       version:"2021", category:"Privacy", region:"UK",      controlsCount:99,  isBeta:false, description:"UK post-Brexit data protection framework." },
  { shortCode:"CCPA",       name:"CCPA/CPRA",                     version:"2023", category:"Privacy", region:"US",      controlsCount:20,  isBeta:false, description:"California Consumer Privacy Act / California Privacy Rights Act." },
  { shortCode:"LGPD",       name:"LGPD (Brazil)",                 version:"2020", category:"Privacy", region:"LatAm",   controlsCount:0,   isBeta:false, description:"Lei Geral de Proteção de Dados — Brazil's data protection law." },
  { shortCode:"PDPA-TH",    name:"PDPA (Thailand)",               version:"2022", category:"Privacy", region:"APAC",    controlsCount:0,   isBeta:false, description:"Thailand Personal Data Protection Act." },
  { shortCode:"PDPA-SG",    name:"PDPA (Singapore)",              version:"2021", category:"Privacy", region:"APAC",    controlsCount:0,   isBeta:false, description:"Singapore Personal Data Protection Act." },
  { shortCode:"PDPA-PH",    name:"PDPA (Philippines)",            version:"2012", category:"Privacy", region:"APAC",    controlsCount:0,   isBeta:false, description:"Philippines Data Privacy Act." },
  { shortCode:"PIPEDA",     name:"PIPEDA (Canada)",               version:"2019", category:"Privacy", region:"Global",  controlsCount:0,   isBeta:false, description:"Canada's federal privacy legislation for private-sector organisations." },
  { shortCode:"APPI",       name:"APPI (Japan)",                  version:"2022", category:"Privacy", region:"APAC",    controlsCount:0,   isBeta:false, description:"Japan Act on the Protection of Personal Information." },
  { shortCode:"POPIA",      name:"POPIA (South Africa)",          version:"2020", category:"Privacy", region:"Africa",  controlsCount:0,   isBeta:false, description:"South Africa Protection of Personal Information Act." },
  { shortCode:"PIPL",       name:"PIPL (China)",                  version:"2021", category:"Privacy", region:"APAC",    controlsCount:0,   isBeta:false, description:"China Personal Information Protection Law." },
  { shortCode:"AUS-PRIV",   name:"Australian Privacy Act",        version:"2022", category:"Privacy", region:"APAC",    controlsCount:0,   isBeta:false, description:"Australia Privacy Act 1988 — Australian Privacy Principles." },
  { shortCode:"INDIA-DPDP", name:"India DPDP Act",               version:"2023", category:"Privacy", region:"APAC",    controlsCount:0,   isBeta:true,  description:"India Digital Personal Data Protection Act 2023." },
  { shortCode:"UAE-PDPL",   name:"UAE PDPL",                      version:"2021", category:"Privacy", region:"MENA",    controlsCount:0,   isBeta:false, description:"UAE Federal Data Protection Law." },
  { shortCode:"SAUDI-PDPL", name:"Saudi PDPL",                    version:"2023", category:"Privacy", region:"MENA",    controlsCount:0,   isBeta:false, description:"Saudi Arabia Personal Data Protection Law." },
  { shortCode:"KENYA-DPA",  name:"Kenya DPA",                     version:"2019", category:"Privacy", region:"Africa",  controlsCount:0,   isBeta:false, description:"Kenya Data Protection Act 2019." },
  { shortCode:"NIGERIA-DPA",name:"Nigeria DPA",                   version:"2023", category:"Privacy", region:"Africa",  controlsCount:0,   isBeta:true,  description:"Nigeria Data Protection Act 2023." },
  { shortCode:"NZ-PRIV",    name:"New Zealand Privacy Act",       version:"2020", category:"Privacy", region:"APAC",    controlsCount:0,   isBeta:false, description:"New Zealand Privacy Act 2020." },
  { shortCode:"SWISS-NDSG", name:"Swiss nDSG",                    version:"2023", category:"Privacy", region:"Global",  controlsCount:0,   isBeta:false, description:"Swiss new Federal Act on Data Protection." },

  // EU / UK Regulatory
  { shortCode:"NIS2",       name:"NIS2 Directive",                version:"2022", category:"EU Regulatory",region:"EU",controlsCount:21,  isBeta:false, description:"Network and Information Systems Directive 2 — EU cybersecurity requirements." },
  { shortCode:"DORA",       name:"DORA",                          version:"2023", category:"EU Regulatory",region:"EU",controlsCount:46,  isBeta:false, description:"Digital Operational Resilience Act — EU financial sector ICT requirements." },
  { shortCode:"EU-AI-ACT",  name:"EU AI Act",                     version:"2024", category:"EU Regulatory",region:"EU",controlsCount:18,  isBeta:true,  description:"EU regulation on artificial intelligence — risk-based requirements." },
  { shortCode:"EIDAS2",     name:"eIDAS 2.0",                     version:"2024", category:"EU Regulatory",region:"EU",controlsCount:0,   isBeta:true,  description:"EU digital identity and trust services regulation." },
  { shortCode:"EU-WBD",     name:"EU Whistleblower Directive",    version:"2019", category:"EU Regulatory",region:"EU",controlsCount:0,   isBeta:false, description:"EU directive on the protection of whistleblowers." },
  { shortCode:"CSRD",       name:"CSRD",                          version:"2023", category:"EU Regulatory",region:"EU",controlsCount:0,   isBeta:false, description:"Corporate Sustainability Reporting Directive." },
  { shortCode:"CRA",        name:"Cyber Resilience Act (CRA)",    version:"2024", category:"EU Regulatory",region:"EU",controlsCount:0,   isBeta:true,  description:"EU cybersecurity requirements for products with digital elements." },
  { shortCode:"UK-CE",      name:"UK Cyber Essentials",           version:"2023", category:"EU Regulatory",region:"UK",controlsCount:5,   isBeta:false, description:"UK government-backed scheme for basic cyber hygiene." },
  { shortCode:"UK-CE-PLUS", name:"UK Cyber Essentials Plus",      version:"2023", category:"EU Regulatory",region:"UK",controlsCount:5,   isBeta:false, description:"UK Cyber Essentials with independent technical verification." },
  { shortCode:"UK-NCSC-CAF",name:"UK NCSC CAF",                  version:"2023", category:"EU Regulatory",region:"UK",controlsCount:14,  isBeta:false, description:"NCSC Cyber Assessment Framework for UK CNI sectors." },
  { shortCode:"ENISA-GP",   name:"EU ENISA Good Practices",       version:"2024", category:"EU Regulatory",region:"EU",controlsCount:0,   isBeta:false, description:"ENISA good practices for cybersecurity in various sectors." },
  { shortCode:"MICA",       name:"MiCA",                          version:"2023", category:"EU Regulatory",region:"EU",controlsCount:0,   isBeta:false, description:"Markets in Crypto-Assets Regulation." },

  // Cloud & Shared Responsibility
  { shortCode:"CSA-STAR-L1",name:"CSA STAR Level 1",             version:"2023", category:"Cloud",   region:"Global",  controlsCount:197, isBeta:false, description:"CSA Security Trust Assurance and Risk — self-assessment." },
  { shortCode:"CSA-STAR-L2",name:"CSA STAR Level 2",             version:"2023", category:"Cloud",   region:"Global",  controlsCount:197, isBeta:false, description:"CSA STAR third-party attestation or certification." },
  { shortCode:"FEDRAMP-LOW", name:"FedRAMP Low",                  version:"2023", category:"Cloud",   region:"US",      controlsCount:125, isBeta:false, description:"Federal Risk and Authorization Management Program — low baseline." },
  { shortCode:"FEDRAMP-MOD", name:"FedRAMP Moderate",             version:"2023", category:"Cloud",   region:"US",      controlsCount:325, isBeta:false, description:"FedRAMP — moderate baseline." },
  { shortCode:"FEDRAMP-HIGH",name:"FedRAMP High",                 version:"2023", category:"Cloud",   region:"US",      controlsCount:421, isBeta:false, description:"FedRAMP — high baseline for sensitive government data." },
  { shortCode:"STATERAMP",  name:"StateRAMP",                     version:"2023", category:"Cloud",   region:"US",      controlsCount:325, isBeta:false, description:"State and Local Government Risk and Authorization Management Program." },
  { shortCode:"TX-RAMP",    name:"TX-RAMP",                       version:"2023", category:"Cloud",   region:"US",      controlsCount:200, isBeta:false, description:"Texas Risk and Authorization Management Program." },
  { shortCode:"DOD-IL2",    name:"DoD IL2",                       version:"2023", category:"Cloud",   region:"US",      controlsCount:325, isBeta:false, description:"Department of Defense Impact Level 2 cloud requirements." },
  { shortCode:"DOD-IL4",    name:"DoD IL4",                       version:"2023", category:"Cloud",   region:"US",      controlsCount:421, isBeta:false, description:"DoD Impact Level 4 — Controlled Unclassified Information." },
  { shortCode:"DOD-IL5",    name:"DoD IL5",                       version:"2023", category:"Cloud",   region:"US",      controlsCount:421, isBeta:false, description:"DoD Impact Level 5 — National Security Systems." },
  { shortCode:"IRAP",       name:"IRAP (Australia)",              version:"2023", category:"Cloud",   region:"APAC",    controlsCount:0,   isBeta:false, description:"Information Security Registered Assessors Program — Australian government cloud." },
  { shortCode:"C5",         name:"C5 (Germany BSI)",              version:"2023", category:"Cloud",   region:"EU",      controlsCount:0,   isBeta:false, description:"Cloud Computing Compliance Criteria Catalogue — BSI Germany." },
  { shortCode:"ENS",        name:"ENS (Spain)",                   version:"2022", category:"Cloud",   region:"EU",      controlsCount:0,   isBeta:false, description:"Esquema Nacional de Seguridad — Spain national security scheme." },
  { shortCode:"AGID",       name:"AGID (Italy)",                  version:"2023", category:"Cloud",   region:"EU",      controlsCount:0,   isBeta:false, description:"Italy agency for digital Italy cloud security qualification." },
  { shortCode:"SECNUMCLOUD", name:"SecNumCloud (France)",         version:"3.2",  category:"Cloud",   region:"EU",      controlsCount:0,   isBeta:false, description:"ANSSI cloud security qualification — France." },
  { shortCode:"NCSC-CCP",   name:"NCSC CCP (UK)",                 version:"2023", category:"Cloud",   region:"UK",      controlsCount:0,   isBeta:false, description:"UK NCSC Cloud Security Principles." },

  // Defense / Government
  { shortCode:"CMMC-L1",    name:"CMMC 2.0 Level 1",             version:"2.0",  category:"Defense", region:"US",      controlsCount:17,  isBeta:false, description:"Cybersecurity Maturity Model Certification — foundational practices." },
  { shortCode:"CMMC-L2",    name:"CMMC 2.0 Level 2",             version:"2.0",  category:"Defense", region:"US",      controlsCount:110, isBeta:false, description:"CMMC — advanced practices aligned with NIST 800-171." },
  { shortCode:"CMMC-L3",    name:"CMMC 2.0 Level 3",             version:"2.0",  category:"Defense", region:"US",      controlsCount:134, isBeta:false, description:"CMMC — expert practices aligned with NIST 800-172." },
  { shortCode:"DFARS",      name:"DFARS 252.204-7012",            version:"2024", category:"Defense", region:"US",      controlsCount:0,   isBeta:false, description:"Defense Federal Acquisition Regulation Supplement cyber requirements." },
  { shortCode:"ITAR",       name:"ITAR",                          version:"2024", category:"Defense", region:"US",      controlsCount:0,   isBeta:false, description:"International Traffic in Arms Regulations." },
  { shortCode:"EAR",        name:"EAR",                          version:"2024", category:"Defense", region:"US",      controlsCount:0,   isBeta:false, description:"Export Administration Regulations." },
  { shortCode:"JSIG",       name:"JSIG",                          version:"2023", category:"Defense", region:"US",      controlsCount:0,   isBeta:false, description:"Joint SAP Implementation Guide." },
  { shortCode:"ICD503",     name:"ICD 503",                       version:"2023", category:"Defense", region:"US",      controlsCount:0,   isBeta:false, description:"Intelligence Community Directive 503 — IC IT risk management." },
  { shortCode:"NIST-800-172",name:"NIST SP 800-172",             version:"2021", category:"Defense", region:"US",      controlsCount:35,  isBeta:false, description:"Enhanced security requirements for CUI." },

  // Regional Financial Regulators
  { shortCode:"RBI-ISMS",   name:"RBI ISMS",                      version:"2023", category:"Regional Financial",region:"APAC",controlsCount:0, isBeta:false, description:"Reserve Bank of India Information Security guidelines." },
  { shortCode:"RBI-CSF",    name:"RBI Cybersecurity Framework",   version:"2023", category:"Regional Financial",region:"APAC",controlsCount:81,isBeta:false, description:"RBI Master Direction on IT Risk and Cyber Risk." },
  { shortCode:"SEBI-CSCRF", name:"SEBI CSCRF",                    version:"2024", category:"Regional Financial",region:"APAC",controlsCount:72,isBeta:false, description:"SEBI Cybersecurity and Cyber Resilience Framework." },
  { shortCode:"MAS-TRM",    name:"MAS TRM (Singapore)",           version:"2021", category:"Regional Financial",region:"APAC",controlsCount:0, isBeta:false, description:"MAS Technology Risk Management guidelines." },
  { shortCode:"HKMA-CYBR",  name:"HKMA CYBR (Hong Kong)",        version:"2023", category:"Regional Financial",region:"APAC",controlsCount:0, isBeta:false, description:"HKMA Cybersecurity Fortification Initiative." },
  { shortCode:"APRA-CPS234",name:"APRA CPS 234 (Australia)",      version:"2022", category:"Regional Financial",region:"APAC",controlsCount:0, isBeta:false, description:"APRA information security requirements for regulated entities." },
  { shortCode:"BAFIN-BAIT", name:"BaFin BAIT (Germany)",          version:"2021", category:"Regional Financial",region:"EU",  controlsCount:0, isBeta:false, description:"BaFin Bankaufsichtliche Anforderungen an die IT." },
  { shortCode:"FCA-OPRES",  name:"FCA Operational Resilience (UK)",version:"2022",category:"Regional Financial",region:"UK", controlsCount:0, isBeta:false, description:"FCA operational resilience requirements for financial firms." },
  { shortCode:"CBSL",       name:"CBSL (Sri Lanka)",              version:"2023", category:"Regional Financial",region:"APAC",controlsCount:0, isBeta:false, description:"Central Bank of Sri Lanka IT risk guidelines." },
  { shortCode:"NBR",        name:"NBR (Romania)",                  version:"2023", category:"Regional Financial",region:"EU",  controlsCount:0, isBeta:false, description:"National Bank of Romania cybersecurity requirements." },
  { shortCode:"DNB",        name:"DNB (Netherlands)",              version:"2023", category:"Regional Financial",region:"EU",  controlsCount:0, isBeta:false, description:"De Nederlandsche Bank ICT and outsourcing requirements." },
  { shortCode:"CSSF",       name:"CSSF (Luxembourg)",              version:"2023", category:"Regional Financial",region:"EU",  controlsCount:0, isBeta:false, description:"Commission de Surveillance du Secteur Financier IT requirements." },
  { shortCode:"FINMA",      name:"FINMA (Switzerland)",            version:"2023", category:"Regional Financial",region:"Global",controlsCount:0,isBeta:false, description:"FINMA operational risk and outsourcing requirements." },
  { shortCode:"AMF",        name:"AMF (France)",                   version:"2023", category:"Regional Financial",region:"EU",  controlsCount:0, isBeta:false, description:"Autorité des marchés financiers IT requirements." },
  { shortCode:"CNMV",       name:"CNMV (Spain)",                   version:"2023", category:"Regional Financial",region:"EU",  controlsCount:0, isBeta:false, description:"Spain securities market regulator technology requirements." },
  { shortCode:"CONSOB",     name:"CONSOB (Italy)",                 version:"2023", category:"Regional Financial",region:"EU",  controlsCount:0, isBeta:false, description:"Italy financial market cybersecurity requirements." },
  { shortCode:"BACEN",      name:"BACEN (Brazil)",                 version:"2023", category:"Regional Financial",region:"LatAm",controlsCount:0,isBeta:false, description:"Banco Central do Brasil cybersecurity requirements." },
  { shortCode:"SAMA-CSF",   name:"SAMA (Saudi Arabia)",            version:"2023", category:"Regional Financial",region:"MENA",controlsCount:85,isBeta:false, description:"Saudi Arabia Monetary Authority Cybersecurity Framework." },
  { shortCode:"CBUAE",      name:"CBUAE (UAE)",                    version:"2023", category:"Regional Financial",region:"MENA",controlsCount:0, isBeta:false, description:"Central Bank of UAE cybersecurity requirements." },
  { shortCode:"DFSA",       name:"DFSA (Dubai)",                   version:"2023", category:"Regional Financial",region:"MENA",controlsCount:0, isBeta:false, description:"Dubai Financial Services Authority technology requirements." },
  { shortCode:"CBK",        name:"CBK (Kuwait)",                   version:"2023", category:"Regional Financial",region:"MENA",controlsCount:0, isBeta:false, description:"Central Bank of Kuwait cybersecurity requirements." },
  { shortCode:"NBE",        name:"NBE (Egypt)",                    version:"2023", category:"Regional Financial",region:"MENA",controlsCount:0, isBeta:false, description:"National Bank of Egypt cybersecurity framework." },
  { shortCode:"FSB-CYBER",  name:"FSB Cyber Lexicon",              version:"2018", category:"Regional Financial",region:"Global",controlsCount:0,isBeta:false, description:"Financial Stability Board cyber terminology and standards." },
  { shortCode:"EBA-ICT",    name:"EBA ICT Guidelines",             version:"2023", category:"Regional Financial",region:"EU",  controlsCount:0, isBeta:false, description:"EBA guidelines on ICT and security risk management." },
  { shortCode:"ECB-TIBER",  name:"ECB TIBER-EU",                   version:"2022", category:"Regional Financial",region:"EU",  controlsCount:0, isBeta:false, description:"ECB threat intelligence-based ethical red-teaming framework." },

  // Industry Specific
  { shortCode:"NERC-CIP",   name:"NERC CIP v7",                   version:"v7",   category:"Industry", region:"US",     controlsCount:83,  isBeta:false, description:"NERC Critical Infrastructure Protection standards for bulk electric systems." },
  { shortCode:"SWIFT-CSCF", name:"SWIFT CSCF v2024",              version:"2024", category:"Industry", region:"Global", controlsCount:32,  isBeta:false, description:"SWIFT Customer Security Controls Framework." },
  { shortCode:"TISAX",      name:"TISAX (Automotive)",             version:"2024", category:"Industry", region:"EU",     controlsCount:0,   isBeta:false, description:"Trusted Information Security Assessment Exchange — automotive industry." },
  { shortCode:"CIS-V8",     name:"CIS Controls v8",               version:"v8",   category:"Industry", region:"Global", controlsCount:18,  isBeta:false, description:"Center for Internet Security critical security controls." },
  { shortCode:"CIS-BENCH",  name:"CIS Benchmarks",                version:"2024", category:"Industry", region:"Global", controlsCount:0,   isBeta:false, description:"CIS hardening benchmarks for operating systems and applications." },
  { shortCode:"HITRUST-SCF",name:"HITRUST SCF",                   version:"2024", category:"Industry", region:"Global", controlsCount:0,   isBeta:false, description:"HITRUST Shared Controls Framework." },
  { shortCode:"MITRE-ATT",  name:"MITRE ATT&CK",                  version:"v15",  category:"Industry", region:"Global", controlsCount:0,   isBeta:false, description:"Globally accessible knowledge base of adversary tactics and techniques." },
  { shortCode:"D3FEND",     name:"D3FEND",                        version:"v1",   category:"Industry", region:"Global", controlsCount:0,   isBeta:true,  description:"MITRE D3FEND — defensive cybersecurity countermeasures ontology." },
  { shortCode:"COBIT2019",  name:"COBIT 2019",                    version:"2019", category:"Industry", region:"Global", controlsCount:0,   isBeta:false, description:"Framework for IT governance and management." },
  { shortCode:"ITIL4",      name:"ITIL 4",                        version:"2019", category:"Industry", region:"Global", controlsCount:0,   isBeta:false, description:"IT service management best practices." },
  { shortCode:"VDA-ISA",    name:"VDA ISA",                       version:"6.0",  category:"Industry", region:"EU",     controlsCount:0,   isBeta:false, description:"German automotive industry information security assessment." },
  { shortCode:"EN50600",    name:"EN 50600 (DC)",                  version:"2022", category:"Industry", region:"EU",     controlsCount:0,   isBeta:false, description:"Data centre facilities and infrastructure standard." },
  { shortCode:"IEC62443",   name:"IEC 62443 (OT/ICS)",            version:"2024", category:"Industry", region:"Global", controlsCount:0,   isBeta:false, description:"Industrial automation and control systems security standards." },
  { shortCode:"DO-326A",    name:"DO-326A (Aviation)",             version:"2019", category:"Industry", region:"Global", controlsCount:0,   isBeta:false, description:"Airworthiness security process specification for aviation." },
  { shortCode:"ISO21434",   name:"ISO 21434 (Automotive Cyber)",  version:"2021", category:"Industry", region:"Global", controlsCount:0,   isBeta:false, description:"Road vehicles cybersecurity engineering." },
  { shortCode:"TARA",       name:"TARA",                          version:"2023", category:"Industry", region:"Global", controlsCount:0,   isBeta:false, description:"Threat Analysis and Risk Assessment — automotive cybersecurity method." },
  { shortCode:"IEC61508",   name:"IEC 61508 (Functional Safety)", version:"2010", category:"Industry", region:"Global", controlsCount:0,   isBeta:false, description:"Functional safety of E/E/PE safety-related systems." },
  { shortCode:"FDA-CYBER",  name:"FDA Cybersecurity (Medical Devices)",version:"2023",category:"Industry",region:"US",  controlsCount:0,   isBeta:false, description:"FDA pre-market and post-market cybersecurity guidance for medical devices." },
  { shortCode:"IMDRF",      name:"IMDRF",                         version:"2020", category:"Industry", region:"Global", controlsCount:0,   isBeta:false, description:"International Medical Device Regulators Forum cybersecurity principles." },
  { shortCode:"EUCS",       name:"EUCS",                          version:"2024", category:"Industry", region:"EU",     controlsCount:0,   isBeta:true,  description:"EU Cybersecurity Certification Scheme for Cloud Services." },

  // Emerging / AI
  { shortCode:"EU-AI-HIRISK",name:"EU AI Act High-Risk",          version:"2024", category:"AI",       region:"EU",     controlsCount:0,   isBeta:true,  description:"EU AI Act requirements specific to high-risk AI systems." },
  { shortCode:"NIST-AI-PLAY",name:"NIST AI RMF Playbook",        version:"1.0",  category:"AI",       region:"US",     controlsCount:0,   isBeta:false, description:"Practical playbook for implementing NIST AI Risk Management Framework." },
  { shortCode:"MAS-FAIRNESS",name:"Singapore MAS Fairness Principles",version:"2023",category:"AI",   region:"APAC",   controlsCount:0,   isBeta:false, description:"MAS principles for fairness, ethics, accountability in AI." },
  { shortCode:"UK-AI-SAFETY",name:"UK AI Safety Framework",      version:"2024", category:"AI",       region:"UK",     controlsCount:0,   isBeta:true,  description:"UK government's AI safety evaluation framework." },
  { shortCode:"OECD-AI",    name:"OECD AI Principles",            version:"2024", category:"AI",       region:"Global", controlsCount:0,   isBeta:false, description:"OECD principles on artificial intelligence." },
  { shortCode:"G7-AI",      name:"G7 Hiroshima AI Code",          version:"2023", category:"AI",       region:"Global", controlsCount:0,   isBeta:false, description:"G7 international guiding principles for advanced AI." },
  { shortCode:"IEEE7000",   name:"IEEE 7000-series",              version:"2021", category:"AI",       region:"Global", controlsCount:0,   isBeta:false, description:"IEEE ethical AI standards series." },
  { shortCode:"NIST-600-1", name:"NIST SP 600-1 (IoT)",          version:"2024", category:"AI",       region:"US",     controlsCount:0,   isBeta:true,  description:"NIST IoT cybersecurity and privacy baseline requirements." },
];

let seedRan = false;
export async function seedFrameworkLibrary(): Promise<void> {
  if (seedRan) return;
  seedRan = true;
  try {
    // Check if already seeded
    const [row] = await db.select({ cnt: sql<number>`COUNT(*)::int` }).from(frameworkLibraryTable);
    if ((row?.cnt ?? 0) > 0) return;

    // Insert all frameworks
    await db.insert(frameworkLibraryTable).values(
      FRAMEWORK_SEED.map(f => ({
        shortCode: f.shortCode,
        name: f.name,
        version: f.version,
        category: f.category,
        region: f.region,
        controlsCount: f.controlsCount,
        isBeta: f.isBeta,
        isActive: true,
        description: f.description,
      }))
    ).onConflictDoNothing();

    console.log(`[FrameworkLibrary] Seeded ${FRAMEWORK_SEED.length} frameworks`);
  } catch (err) {
    console.error("[FrameworkLibrary] Seed error:", err);
  }
}

// ── GET /admin/frameworks — paginated list ───────────────────────────────────

router.get("/admin/frameworks", requireAuth, isSuperAdmin, async (req, res) => {
  try {
    const { search, category, region, status, page = "1", limit = "50" } = req.query as Record<string, string>;
    const pg = Math.max(1, parseInt(page, 10));
    const lim = Math.min(200, Math.max(1, parseInt(limit, 10)));
    const offset = (pg - 1) * lim;

    const rows = await db.select({
      id: frameworkLibraryTable.id,
      shortCode: frameworkLibraryTable.shortCode,
      name: frameworkLibraryTable.name,
      version: frameworkLibraryTable.version,
      category: frameworkLibraryTable.category,
      region: frameworkLibraryTable.region,
      controlsCount: frameworkLibraryTable.controlsCount,
      isActive: frameworkLibraryTable.isActive,
      isBeta: frameworkLibraryTable.isBeta,
      description: frameworkLibraryTable.description,
      createdAt: frameworkLibraryTable.createdAt,
      tenantCount: sql<number>`(SELECT COUNT(*) FROM tenant_frameworks tf WHERE tf.framework_id = ${frameworkLibraryTable.id} AND tf.status = 'active')::int`,
    }).from(frameworkLibraryTable)
      .where(and(
        search ? or(
          ilike(frameworkLibraryTable.name, `%${search}%`),
          ilike(frameworkLibraryTable.shortCode, `%${search}%`),
          ilike(frameworkLibraryTable.category, `%${search}%`),
        ) : undefined,
        category && category !== "All" ? eq(frameworkLibraryTable.category, category) : undefined,
        region && region !== "All" ? eq(frameworkLibraryTable.region, region) : undefined,
        status === "active" ? eq(frameworkLibraryTable.isActive, true) :
        status === "inactive" ? eq(frameworkLibraryTable.isActive, false) :
        status === "beta" ? eq(frameworkLibraryTable.isBeta, true) : undefined,
      ))
      .orderBy(frameworkLibraryTable.category, frameworkLibraryTable.name)
      .limit(lim)
      .offset(offset);

    const [totRow] = await db.select({ total: sql<number>`COUNT(*)::int` }).from(frameworkLibraryTable);
    const [activeRow] = await db.select({ c: sql<number>`COUNT(*)::int` }).from(frameworkLibraryTable).where(eq(frameworkLibraryTable.isActive, true));
    const [betaRow] = await db.select({ c: sql<number>`COUNT(*)::int` }).from(frameworkLibraryTable).where(eq(frameworkLibraryTable.isBeta, true));
    const [assignedRow] = await db.select({ c: sql<number>`COUNT(*)::int` }).from(tenantFrameworksTable).where(eq(tenantFrameworksTable.status, "active"));

    res.json({
      data: rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })),
      stats: {
        total: totRow?.total ?? 0,
        active: activeRow?.c ?? 0,
        beta: betaRow?.c ?? 0,
        assigned: assignedRow?.c ?? 0,
      },
      page: pg, limit: lim,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /admin/frameworks/crosswalk — controls in ≥2 frameworks ──────────────

router.get("/admin/frameworks/crosswalk", requireAuth, isSuperAdmin, async (_req, res) => {
  try {
    const rows = await db.select({
      controlRef: frameworkLibraryControlsTable.controlRef,
      domain: frameworkLibraryControlsTable.domain,
      title: frameworkLibraryControlsTable.title,
      crosswalkRefs: frameworkLibraryControlsTable.crosswalkRefs,
      frameworkCount: sql<number>`COUNT(DISTINCT ${frameworkLibraryControlsTable.frameworkId})::int`,
    }).from(frameworkLibraryControlsTable)
      .groupBy(
        frameworkLibraryControlsTable.controlRef,
        frameworkLibraryControlsTable.domain,
        frameworkLibraryControlsTable.title,
        frameworkLibraryControlsTable.crosswalkRefs,
      )
      .having(sql`COUNT(DISTINCT ${frameworkLibraryControlsTable.frameworkId}) >= 2`)
      .orderBy(sql`COUNT(DISTINCT ${frameworkLibraryControlsTable.frameworkId}) DESC`);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /admin/frameworks/:id — single framework + controls ──────────────────

router.get("/admin/frameworks/:id", requireAuth, isSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params["id"]!, 10);
    const [fw] = await db.select().from(frameworkLibraryTable).where(eq(frameworkLibraryTable.id, id)).limit(1);
    if (!fw) { res.status(404).json({ error: "Framework not found" }); return; }

    const controls = await db.select().from(frameworkLibraryControlsTable)
      .where(eq(frameworkLibraryControlsTable.frameworkId, id))
      .orderBy(frameworkLibraryControlsTable.domain, frameworkLibraryControlsTable.controlRef);

    res.json({ ...fw, createdAt: fw.createdAt.toISOString(), controls });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PATCH /admin/frameworks/:id — toggle active/beta, update metadata ─────────

router.patch("/admin/frameworks/:id", requireAuth, isSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params["id"]!, 10);
    const { isActive, isBeta, version, description } = req.body as {
      isActive?: boolean; isBeta?: boolean; version?: string; description?: string;
    };
    const patch: Record<string, unknown> = {};
    if (typeof isActive === "boolean") patch["isActive"] = isActive;
    if (typeof isBeta === "boolean") patch["isBeta"] = isBeta;
    if (version) patch["version"] = version;
    if (description !== undefined) patch["description"] = description;

    const [updated] = await db.update(frameworkLibraryTable).set(patch).where(eq(frameworkLibraryTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Framework not found" }); return; }
    res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /admin/frameworks/:id/controls/import — bulk import controls ─────────

router.post("/admin/frameworks/:id/controls/import", requireAuth, isSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params["id"]!, 10);
    const [fw] = await db.select({ id: frameworkLibraryTable.id }).from(frameworkLibraryTable).where(eq(frameworkLibraryTable.id, id)).limit(1);
    if (!fw) { res.status(404).json({ error: "Framework not found" }); return; }

    const controls = req.body as Array<{
      controlRef: string; domain: string; title: string;
      description?: string; requirementText?: string; crosswalkRefs?: string[];
    }>;

    if (!Array.isArray(controls) || controls.length === 0) {
      res.status(400).json({ error: "Body must be a non-empty array of controls" });
      return;
    }

    // Delete existing controls for this framework
    await db.delete(frameworkLibraryControlsTable).where(eq(frameworkLibraryControlsTable.frameworkId, id));

    // Insert new controls
    await db.insert(frameworkLibraryControlsTable).values(
      controls.map(c => ({
        frameworkId: id,
        controlRef: c.controlRef,
        domain: c.domain,
        title: c.title,
        description: c.description ?? null,
        requirementText: c.requirementText ?? null,
        crosswalkRefs: c.crosswalkRefs ?? [],
      }))
    );

    // Update controls count
    await db.update(frameworkLibraryTable)
      .set({ controlsCount: controls.length })
      .where(eq(frameworkLibraryTable.id, id));

    res.json({ imported: controls.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /admin/frameworks/:id/tenants — which tenants have this framework ─────

router.get("/admin/frameworks/:id/tenants", requireAuth, isSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params["id"]!, 10);
    const rows = await db.select({
      tenantFrameworkId: tenantFrameworksTable.id,
      tenantId: tenantFrameworksTable.tenantId,
      tenantName: tenantsTable.name,
      tenantSlug: tenantsTable.slug,
      plan: tenantsTable.plan,
      assignedAt: tenantFrameworksTable.assignedAt,
      assignedBy: tenantFrameworksTable.assignedBy,
      status: tenantFrameworksTable.status,
    }).from(tenantFrameworksTable)
      .innerJoin(tenantsTable, eq(tenantFrameworksTable.tenantId, tenantsTable.id))
      .where(eq(tenantFrameworksTable.frameworkId, id))
      .orderBy(tenantFrameworksTable.assignedAt);

    res.json(rows.map(r => ({ ...r, assignedAt: r.assignedAt.toISOString() })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /admin/frameworks/:id/tenants — assign framework to tenants ──────────

router.post("/admin/frameworks/:id/tenants", requireAuth, isSuperAdmin, async (req, res) => {
  try {
    const frameworkId = parseInt(req.params["id"]!, 10);
    const actor = u(req);
    const { tenantIds } = req.body as { tenantIds: number[] };
    if (!Array.isArray(tenantIds) || tenantIds.length === 0) {
      res.status(400).json({ error: "tenantIds must be a non-empty array" });
      return;
    }

    const [fw] = await db.select().from(frameworkLibraryTable).where(eq(frameworkLibraryTable.id, frameworkId)).limit(1);
    if (!fw) { res.status(404).json({ error: "Framework not found" }); return; }
    if (!fw.isActive) { res.status(400).json({ error: "Framework is not active" }); return; }

    const results: Array<{ tenantId: number; injected: number; skipped: number }> = [];

    for (const tenantId of tenantIds) {
      // Upsert tenant_frameworks record
      await db.insert(tenantFrameworksTable).values({
        tenantId,
        frameworkId,
        assignedBy: actor.email,
        status: "active",
      }).onConflictDoNothing();

      // Inject master controls into tenant's compliance_controls
      const masterControls = await db.select().from(frameworkLibraryControlsTable)
        .where(eq(frameworkLibraryControlsTable.frameworkId, frameworkId));

      let injected = 0;
      let skipped = 0;
      for (const ctrl of masterControls) {
        try {
          // controlId = ctrl.controlRef (no framework prefix) so that the same underlying
          // control referenced by multiple frameworks deduplicates correctly via UNIQUE(tenantId, controlId)
          await db.insert(controlsTable).values({
            tenantId,
            controlId: ctrl.controlRef,
            framework: fw.name,
            domain: ctrl.domain,
            name: ctrl.title,
            status: "not-started",
            owner: "Unassigned",
            evidence: 0,
            dueDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          }).onConflictDoNothing();
          injected++;
        } catch {
          skipped++;
        }
      }
      results.push({ tenantId, injected, skipped });
    }

    res.json({ assigned: tenantIds.length, results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /admin/frameworks/:id/tenants/:tenantId — remove from tenant ───────

router.delete("/admin/frameworks/:id/tenants/:tenantId", requireAuth, isSuperAdmin, async (req, res) => {
  try {
    const frameworkId = parseInt(req.params["id"]!, 10);
    const tenantId = parseInt(req.params["tenantId"]!, 10);

    const [fw] = await db.select({ shortCode: frameworkLibraryTable.shortCode, name: frameworkLibraryTable.name })
      .from(frameworkLibraryTable).where(eq(frameworkLibraryTable.id, frameworkId)).limit(1);
    if (!fw) { res.status(404).json({ error: "Framework not found" }); return; }

    // Remove tenant_frameworks record
    await db.delete(tenantFrameworksTable).where(
      and(eq(tenantFrameworksTable.tenantId, tenantId), eq(tenantFrameworksTable.frameworkId, frameworkId))
    );

    // Collect the controlRefs that belong to this framework
    const fwControls = await db.select({ controlRef: frameworkLibraryControlsTable.controlRef })
      .from(frameworkLibraryControlsTable)
      .where(eq(frameworkLibraryControlsTable.frameworkId, frameworkId));
    const fwControlRefs = fwControls.map(c => c.controlRef);

    // Find controlRefs that are ALSO in another active framework still assigned to this tenant.
    // Those must not be removed because they belong to the remaining assignments.
    let protectedRefs: string[] = [];
    if (fwControlRefs.length > 0) {
      const otherFrameworks = await db.select({ frameworkId: tenantFrameworksTable.frameworkId })
        .from(tenantFrameworksTable)
        .where(
          and(
            eq(tenantFrameworksTable.tenantId, tenantId),
            eq(tenantFrameworksTable.status, "active"),
          )
        );
      const otherFrameworkIds = otherFrameworks
        .map(r => r.frameworkId)
        .filter(fid => fid !== frameworkId);

      if (otherFrameworkIds.length > 0) {
        const sharedControls = await db.select({ controlRef: frameworkLibraryControlsTable.controlRef })
          .from(frameworkLibraryControlsTable)
          .where(
            and(
              sql`${frameworkLibraryControlsTable.frameworkId} = ANY(${sql.raw(`ARRAY[${otherFrameworkIds.join(",")}]::int[]`)})`,
              sql`${frameworkLibraryControlsTable.controlRef} = ANY(${sql.raw(`ARRAY[${fwControlRefs.map(r => `'${r.replace(/'/g, "''")}'`).join(",")}]::text[]`)})`,
            )
          );
        protectedRefs = sharedControls.map(c => c.controlRef);
      }
    }

    // Only delete controls that: have no evidence AND are not shared with another active framework
    const safeToDelete = fwControlRefs.filter(ref => !protectedRefs.includes(ref));
    let deleted: { id: number }[] = [];
    if (safeToDelete.length > 0) {
      deleted = await db.delete(controlsTable).where(
        and(
          eq(controlsTable.tenantId, tenantId),
          eq(controlsTable.evidence, 0),
          sql`${controlsTable.controlId} = ANY(${sql.raw(`ARRAY[${safeToDelete.map(r => `'${r.replace(/'/g, "''")}'`).join(",")}]::text[]`)})`,
        )
      ).returning({ id: controlsTable.id });
    }

    res.json({ removed: deleted.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
