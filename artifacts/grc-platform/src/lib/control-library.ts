export type ControlStatus = "implemented" | "partial" | "planned" | "not-started";

export interface ComplianceControlFull {
  id: string;
  framework: string;
  domain: string;
  name: string;
  description: string;
  crossReferences: string[];
  status: ControlStatus;
  owner: string;
  evidence: number;
  dueDate: string;
}

const OW = ["Alex Kim","Sarah Chen","Priya Patel","Marcus Johnson","Emma Wilson","Ryan Johnson","Maria Santos","David Chen"];
const ow = (i: number) => OW[i % OW.length];

type R = [string,string,string,string,string,string[],ControlStatus,number,number,string];

const raw: R[] = [

  // ══════════════════════════════════════════════════════════════════════════════
  // ISO 27001:2022 ANNEX A — ALL 93 CONTROLS
  // ══════════════════════════════════════════════════════════════════════════════

  // ── Organizational Controls (37) ─────────────────────────────────────────────
  ["5.1","ISO 27001","Governance","Policies for information security",
   "Top-management-approved information security policies defining management direction, reviewed at planned intervals.",
   ["SOC 2: CC1.1","NIST CSF: GV.PO-01","PCI DSS 4.0: 12.1","NIS2: Art.21(a)"],
   "implemented",0,5,"2025-12-31"],

  ["5.2","ISO 27001","Governance","Information security roles and responsibilities",
   "Defined and allocated information security responsibilities in accordance with the information security policy.",
   ["SOC 2: CC1.3","NIST CSF: GV.RR-02","HIPAA: §164.308(a)(2)"],
   "implemented",1,4,"2025-12-31"],

  ["5.3","ISO 27001","Governance","Segregation of duties",
   "Conflicting duties and conflicting areas of responsibility segregated to reduce opportunities for unauthorized or unintentional modification or misuse of assets.",
   ["SOC 2: CC5.2","NIST CSF: PR.AA-05","PCI DSS 4.0: 7.2"],
   "implemented",2,4,"2025-12-31"],

  ["5.4","ISO 27001","Governance","Management responsibilities",
   "All personnel required to apply information security in accordance with established policies and procedures.",
   ["SOC 2: CC1.2","NIST CSF: GV.RR-01"],
   "implemented",3,3,"2025-12-31"],

  ["5.5","ISO 27001","Governance","Contact with authorities",
   "Organisation maintains appropriate contacts with relevant authorities such as law enforcement, regulatory bodies, and emergency services.",
   ["NIST CSF: RS.CO-05","NIS2: Art.21(b)"],
   "implemented",4,2,"2025-12-31"],

  ["5.6","ISO 27001","Governance","Contact with special interest groups",
   "Organisation maintains appropriate contacts with special interest groups, security forums, and professional associations.",
   ["NIST CSF: ID.RA-06"],
   "implemented",5,1,"2025-12-31"],

  ["5.7","ISO 27001","Threat Intelligence","Threat intelligence",
   "Information about information security threats collected and analysed to produce threat intelligence.",
   ["NIST CSF: ID.RA-01","NIST CSF: DE.AE-02","SOC 2: CC3.2"],
   "partial",6,2,"2025-09-30"],

  ["5.8","ISO 27001","Project Security","Information security in project management",
   "Information security integrated into the organisation's project management processes.",
   ["NIST CSF: PR.PS-01","PCI DSS 4.0: 6.1"],
   "implemented",7,3,"2025-12-31"],

  ["5.9","ISO 27001","Asset Management","Inventory of information and associated assets",
   "Inventory of information and other associated assets including owners is developed and maintained.",
   ["SOC 2: CC6.1","NIST CSF: ID.AM-01","PCI DSS 4.0: 12.5.1","HIPAA: §164.308(a)(7)"],
   "implemented",0,5,"2025-12-31"],

  ["5.10","ISO 27001","Asset Management","Acceptable use of information and associated assets",
   "Rules for acceptable use and procedures for handling information and other assets identified, documented and implemented.",
   ["SOC 2: CC6.5","NIST CSF: PR.AA-01"],
   "implemented",1,4,"2025-12-31"],

  ["5.11","ISO 27001","Asset Management","Return of assets",
   "Personnel and other interested parties return all organisational assets upon change or termination of employment.",
   ["NIST CSF: ID.AM-04"],
   "implemented",2,2,"2025-12-31"],

  ["5.12","ISO 27001","Asset Management","Classification of information",
   "Information classified according to security needs based on confidentiality, integrity, availability, and relevant interested party requirements.",
   ["SOC 2: C1.1","NIST CSF: ID.AM-07","PCI DSS 4.0: 9.6.1"],
   "implemented",3,4,"2025-12-31"],

  ["5.13","ISO 27001","Asset Management","Labelling of information",
   "Information labelling procedures developed and implemented in accordance with the information classification scheme.",
   ["NIST CSF: ID.AM-07","PCI DSS 4.0: 3.3.2"],
   "partial",4,2,"2025-09-30"],

  ["5.14","ISO 27001","Asset Management","Information transfer",
   "Information transfer rules, procedures, or agreements in place for all types of transfer facilities within and outside the organisation.",
   ["SOC 2: CC6.7","NIST CSF: PR.DS-02","PCI DSS 4.0: 4.1","HIPAA: §164.312(e)"],
   "implemented",5,4,"2025-12-31"],

  ["5.15","ISO 27001","Access Control","Access control",
   "Rules to control physical and logical access to information and other associated assets established and implemented based on business and security requirements.",
   ["SOC 2: CC6.1","NIST CSF: PR.AA-01","HIPAA: §164.312(a)","PCI DSS 4.0: 7.1","NIS2: Art.21(j)"],
   "implemented",6,5,"2025-12-31"],

  ["5.16","ISO 27001","Access Control","Identity management",
   "The full lifecycle of identities managed through assignment and removal of identities in accordance with the organisation's identity management policy.",
   ["SOC 2: CC6.2","NIST CSF: PR.AA-02","HIPAA: §164.312(a)","PCI DSS 4.0: 8.1"],
   "implemented",7,5,"2025-12-31"],

  ["5.17","ISO 27001","Access Control","Authentication information",
   "Allocation and management of authentication information controlled by a management process including rules for appropriate secret authentication information.",
   ["SOC 2: CC6.1","NIST CSF: PR.AA-02","HIPAA: §164.312(d)","PCI DSS 4.0: 8.2"],
   "implemented",0,4,"2025-12-31"],

  ["5.18","ISO 27001","Access Control","Access rights",
   "Access rights to information and other associated assets provisioned, reviewed, modified and removed in accordance with the organisation's access control policy.",
   ["SOC 2: CC6.3","NIST CSF: PR.AA-03","PCI DSS 4.0: 7.3"],
   "implemented",1,4,"2025-12-31"],

  ["5.19","ISO 27001","Supply Chain","Information security in supplier relationships",
   "Processes and procedures defined and implemented to manage information security risks associated with use of supplier products and services.",
   ["SOC 2: CC9.2","NIST CSF: GV.SC-06","PCI DSS 4.0: 12.8","NIS2: Art.21(d)"],
   "partial",2,2,"2025-10-15"],

  ["5.20","ISO 27001","Supply Chain","Addressing information security in supplier agreements",
   "Relevant information security requirements established and agreed with each supplier based on the type of supplier relationship.",
   ["SOC 2: CC9.2","NIST CSF: GV.SC-10","PCI DSS 4.0: 12.8.2"],
   "partial",3,2,"2025-10-15"],

  ["5.21","ISO 27001","Supply Chain","Managing information security in the ICT supply chain",
   "Processes and procedures defined and implemented to manage information security risks associated with the ICT products and services supply chain.",
   ["NIST CSF: GV.SC-07","NIS2: Art.21(d)"],
   "partial",4,1,"2025-11-30"],

  ["5.22","ISO 27001","Supply Chain","Monitoring, review and change management of supplier services",
   "Organisation regularly monitors, reviews, evaluates and manages change in supplier information security practices and service delivery.",
   ["SOC 2: CC9.2","NIST CSF: GV.SC-06"],
   "partial",5,2,"2025-09-30"],

  ["5.23","ISO 27001","Supply Chain","Information security for use of cloud services",
   "Processes for acquisition, use, management and exit from cloud services established in accordance with the organisation's information security requirements.",
   ["NIST CSF: GV.SC-08","PCI DSS 4.0: 12.8.5","NIS2: Art.21(d)"],
   "partial",6,1,"2025-09-30"],

  ["5.24","ISO 27001","Incident Management","Incident management planning and preparation",
   "Organisation plans and prepares for managing information security incidents by defining, establishing and communicating incident management processes, roles and responsibilities.",
   ["SOC 2: CC7.3","NIST CSF: RS.MA-01","HIPAA: §164.308(a)(6)","NIS2: Art.21(b)"],
   "implemented",7,4,"2025-12-31"],

  ["5.25","ISO 27001","Incident Management","Assessment and decision on information security events",
   "Organisation assesses information security events and decides if they are to be categorised as information security incidents.",
   ["SOC 2: CC7.4","NIST CSF: DE.AE-07"],
   "implemented",0,3,"2025-12-31"],

  ["5.26","ISO 27001","Incident Management","Response to information security incidents",
   "Information security incidents responded to in accordance with documented procedures.",
   ["SOC 2: CC7.4","NIST CSF: RS.MA-02","HIPAA: §164.308(a)(6)","NIS2: Art.21(b)"],
   "implemented",1,4,"2025-12-31"],

  ["5.27","ISO 27001","Incident Management","Learning from information security incidents",
   "Knowledge gained from information security incidents used to strengthen and improve the information security controls.",
   ["SOC 2: CC7.5","NIST CSF: RS.AN-07","NIST CSF: ID.IM-01"],
   "partial",2,2,"2025-09-30"],

  ["5.28","ISO 27001","Incident Management","Collection of evidence",
   "Organisation defines and implements procedures for identification, collection, acquisition, and preservation of evidence related to information security events.",
   ["NIST CSF: RS.AN-03","PCI DSS 4.0: 12.10.3"],
   "partial",3,1,"2025-09-30"],

  ["5.29","ISO 27001","Business Continuity","Information security during disruption",
   "Organisation plans how to maintain information security at an appropriate level during disruption.",
   ["SOC 2: A1.3","NIST CSF: RC.RP-01","HIPAA: §164.308(a)(7)","NIS2: Art.21(c)"],
   "partial",4,2,"2025-10-31"],

  ["5.30","ISO 27001","Business Continuity","ICT readiness for business continuity",
   "ICT readiness planned, implemented, maintained and tested based on business continuity objectives and ICT continuity requirements.",
   ["SOC 2: A1.2","NIST CSF: RC.RP-02","NIS2: Art.21(c)"],
   "partial",5,2,"2025-10-31"],

  ["5.31","ISO 27001","Compliance","Legal, statutory, regulatory and contractual requirements",
   "Legal, statutory, regulatory and contractual requirements relevant to information security and the organisation's approach to meeting these requirements identified, documented and kept up to date.",
   ["SOC 2: CC1.5","NIST CSF: GV.OC-03","GDPR: Art.5"],
   "implemented",6,4,"2025-12-31"],

  ["5.32","ISO 27001","Compliance","Intellectual property rights",
   "Organisation implements appropriate procedures to protect intellectual property rights.",
   ["NIST CSF: GV.OC-04"],
   "implemented",7,2,"2025-12-31"],

  ["5.33","ISO 27001","Compliance","Protection of records",
   "Records protected from loss, destruction, falsification, unauthorised access and unauthorised release in accordance with legislative, regulatory, contractual and business requirements.",
   ["SOC 2: CC2.1","NIST CSF: PR.DS-11","GDPR: Art.30","PCI DSS 4.0: 10.7"],
   "implemented",0,4,"2025-12-31"],

  ["5.34","ISO 27001","Privacy","Privacy and protection of personally identifiable information",
   "Organisation identifies and meets the requirements regarding the preservation of privacy and protection of PII in accordance with applicable laws.",
   ["GDPR: Art.5","GDPR: Art.32","HIPAA: §164.312","NIST CSF: PR.DS-07"],
   "implemented",1,4,"2025-12-31"],

  ["5.35","ISO 27001","Compliance","Independent review of information security",
   "Organisation's approach to managing information security and its implementation reviewed independently at planned intervals or when significant changes occur.",
   ["SOC 2: CC4.2","NIST CSF: GV.OV-02"],
   "partial",2,1,"2025-10-31"],

  ["5.36","ISO 27001","Compliance","Compliance with policies, rules and standards for information security",
   "Compliance with the organisation's information security policy, topic-specific policies, rules and standards reviewed regularly.",
   ["SOC 2: CC4.1","NIST CSF: GV.OV-01"],
   "implemented",3,3,"2025-12-31"],

  ["5.37","ISO 27001","Governance","Documented operating procedures",
   "Operating procedures for information processing facilities documented and made available to personnel who need them.",
   ["NIST CSF: PR.PS-01","PCI DSS 4.0: 12.1.3"],
   "implemented",4,3,"2025-12-31"],

  // ── People Controls (8) ──────────────────────────────────────────────────────
  ["6.1","ISO 27001","HR Security","Screening",
   "Background verification checks on all candidates for employment carried out prior to joining the organisation and on an ongoing basis.",
   ["SOC 2: CC1.4","NIST CSF: GV.RR-04"],
   "implemented",5,3,"2025-12-31"],

  ["6.2","ISO 27001","HR Security","Terms and conditions of employment",
   "Employment contractual agreements state employees' and the organisation's responsibilities for information security.",
   ["SOC 2: CC1.4","NIST CSF: PR.AT-01"],
   "implemented",6,3,"2025-12-31"],

  ["6.3","ISO 27001","HR Security","Information security awareness, education and training",
   "All personnel receive appropriate information security awareness education and training, and regular updates of the organisation's policies and procedures.",
   ["SOC 2: CC2.2","NIST CSF: PR.AT-01","HIPAA: §164.308(a)(5)","PCI DSS 4.0: 12.6","NIS2: Art.21(h)"],
   "implemented",7,4,"2025-12-31"],

  ["6.4","ISO 27001","HR Security","Disciplinary process",
   "Disciplinary process formalised and communicated to take actions against personnel who have committed an information security policy violation.",
   ["SOC 2: CC1.4","NIST CSF: GV.RR-04"],
   "implemented",0,2,"2025-12-31"],

  ["6.5","ISO 27001","HR Security","Responsibilities after termination or change of employment",
   "Information security responsibilities and duties that remain valid after termination or change of employment defined, enforced and communicated.",
   ["SOC 2: CC6.2","NIST CSF: PR.AA-04"],
   "implemented",1,3,"2025-12-31"],

  ["6.6","ISO 27001","HR Security","Confidentiality or non-disclosure agreements",
   "Confidentiality or non-disclosure agreements reflecting the organisation's needs for the protection of information identified, documented, regularly reviewed and signed.",
   ["SOC 2: CC1.4","NIST CSF: GV.PO-02"],
   "implemented",2,4,"2025-12-31"],

  ["6.7","ISO 27001","HR Security","Remote working",
   "Security measures implemented when personnel are working remotely to protect information accessed, processed or stored outside the organisation's premises.",
   ["NIST CSF: PR.AA-05","PCI DSS 4.0: 12.3.3"],
   "implemented",3,3,"2025-12-31"],

  ["6.8","ISO 27001","HR Security","Information security event reporting",
   "Organisation provides a mechanism for personnel to report observed or suspected information security events through appropriate channels in a timely manner.",
   ["SOC 2: CC7.3","NIST CSF: DE.AE-08"],
   "implemented",4,3,"2025-12-31"],

  // ── Physical Controls (14) ───────────────────────────────────────────────────
  ["7.1","ISO 27001","Physical Security","Physical security perimeters",
   "Security perimeters defined and used to protect areas that contain information and other associated assets.",
   ["SOC 2: CC6.4","NIST CSF: PR.IR-01","HIPAA: §164.310(a)","PCI DSS 4.0: 9.1"],
   "implemented",5,4,"2025-12-31"],

  ["7.2","ISO 27001","Physical Security","Physical entry",
   "Secure areas protected by appropriate entry controls and access points to prevent unauthorised physical access.",
   ["SOC 2: CC6.4","NIST CSF: PR.IR-01","PCI DSS 4.0: 9.2"],
   "implemented",6,4,"2025-12-31"],

  ["7.3","ISO 27001","Physical Security","Securing offices, rooms and facilities",
   "Physical security for offices, rooms and facilities designed and implemented.",
   ["SOC 2: CC6.4","NIST CSF: PR.IR-01","PCI DSS 4.0: 9.3"],
   "implemented",7,3,"2025-12-31"],

  ["7.4","ISO 27001","Physical Security","Physical security monitoring",
   "Premises continuously monitored for unauthorised physical access.",
   ["SOC 2: CC7.1","NIST CSF: DE.CM-09","PCI DSS 4.0: 9.4.5"],
   "implemented",0,4,"2025-12-31"],

  ["7.5","ISO 27001","Physical Security","Protecting against physical and environmental threats",
   "Protection against physical and environmental threats, such as natural disasters and other intentional or unintentional physical threats to infrastructure, designed and implemented.",
   ["NIST CSF: PR.IR-01","PCI DSS 4.0: 9.5"],
   "implemented",1,2,"2025-12-31"],

  ["7.6","ISO 27001","Physical Security","Working in secure areas",
   "Security measures for working in secure areas designed and implemented.",
   ["SOC 2: CC6.4","NIST CSF: PR.IR-03"],
   "implemented",2,2,"2025-12-31"],

  ["7.7","ISO 27001","Physical Security","Clear desk and clear screen",
   "Clear desk rules for papers and removable storage media and clear screen rules for information processing facilities defined and appropriately enforced.",
   ["NIST CSF: PR.IR-03","PCI DSS 4.0: 12.3.2"],
   "implemented",3,3,"2025-12-31"],

  ["7.8","ISO 27001","Physical Security","Equipment siting and protection",
   "Equipment sited securely and protected to reduce the risks from physical and environmental threats and hazards, and from unauthorised access.",
   ["NIST CSF: PR.IR-02","PCI DSS 4.0: 9.5"],
   "implemented",4,2,"2025-12-31"],

  ["7.9","ISO 27001","Physical Security","Security of assets off-premises",
   "Off-site assets protected taking into account the different risks of working outside the organisation's premises.",
   ["NIST CSF: PR.IR-02","HIPAA: §164.310(d)","PCI DSS 4.0: 9.6"],
   "implemented",5,2,"2025-12-31"],

  ["7.10","ISO 27001","Asset Management","Storage media",
   "Storage media managed through their lifecycle of acquisition, use, transportation and disposal in accordance with the organisation's classification scheme and handling requirements.",
   ["SOC 2: CC6.5","NIST CSF: PR.DS-01","HIPAA: §164.310(d)","PCI DSS 4.0: 9.4"],
   "implemented",6,4,"2025-12-31"],

  ["7.11","ISO 27001","Physical Security","Supporting utilities",
   "Information processing facilities protected from power failures and other disruptions caused by failures in supporting utilities.",
   ["SOC 2: A1.1","NIST CSF: PR.IR-02"],
   "implemented",7,3,"2025-12-31"],

  ["7.12","ISO 27001","Physical Security","Cabling security",
   "Cables carrying power, data or supporting information services protected from interception, interference or damage.",
   ["NIST CSF: PR.IR-02"],
   "implemented",0,1,"2025-12-31"],

  ["7.13","ISO 27001","Physical Security","Equipment maintenance",
   "Equipment maintained correctly to ensure availability, integrity and confidentiality of information.",
   ["SOC 2: A1.1","NIST CSF: PR.IR-02"],
   "implemented",1,2,"2025-12-31"],

  ["7.14","ISO 27001","Asset Management","Secure disposal or re-use of equipment",
   "Items of equipment verified to ensure that any sensitive data and licensed software has been removed or securely overwritten prior to disposal or re-use.",
   ["NIST CSF: PR.DS-08","HIPAA: §164.310(d)","PCI DSS 4.0: 9.4.2"],
   "implemented",2,3,"2025-12-31"],

  // ── Technological Controls (34) ──────────────────────────────────────────────
  ["8.1","ISO 27001","Endpoint Security","User endpoint devices",
   "Information stored on, processed by or accessible via user endpoint devices protected.",
   ["SOC 2: CC6.8","NIST CSF: PR.PS-03","PCI DSS 4.0: 2.2.1"],
   "implemented",3,4,"2025-12-31"],

  ["8.2","ISO 27001","Access Control","Privileged access rights",
   "Allocation and use of privileged access rights restricted and managed.",
   ["SOC 2: CC6.3","NIST CSF: PR.AA-05","HIPAA: §164.312(a)","PCI DSS 4.0: 7.2.2"],
   "implemented",4,5,"2025-12-31"],

  ["8.3","ISO 27001","Access Control","Information access restriction",
   "Access to information and other associated assets restricted in accordance with the established access control policy.",
   ["SOC 2: CC6.1","NIST CSF: PR.AA-03","PCI DSS 4.0: 7.3"],
   "implemented",5,4,"2025-12-31"],

  ["8.4","ISO 27001","Access Control","Access to source code",
   "Read and write access to source code, development tools and software libraries managed appropriately.",
   ["SOC 2: CC8.1","NIST CSF: PR.PS-02","PCI DSS 4.0: 6.2.2"],
   "implemented",6,3,"2025-12-31"],

  ["8.5","ISO 27001","Access Control","Secure authentication",
   "Secure authentication technologies and procedures implemented based on information access restrictions and the access control policy.",
   ["SOC 2: CC6.1","NIST CSF: PR.AA-02","HIPAA: §164.312(d)","PCI DSS 4.0: 8.4","NIS2: Art.21(k)"],
   "implemented",7,5,"2025-12-31"],

  ["8.6","ISO 27001","Operations","Capacity management",
   "The use of resources monitored and adjusted in line with current and expected capacity requirements.",
   ["SOC 2: A1.1","NIST CSF: PR.IR-02"],
   "implemented",0,4,"2025-12-31"],

  ["8.7","ISO 27001","Endpoint Security","Protection against malware",
   "Protection against malware implemented and supported by appropriate user awareness.",
   ["SOC 2: CC6.8","NIST CSF: DE.CM-01","HIPAA: §164.312","PCI DSS 4.0: 5.2","NIS2: Art.21(e)"],
   "implemented",1,5,"2025-12-31"],

  ["8.8","ISO 27001","Vulnerability Management","Management of technical vulnerabilities",
   "Information about technical vulnerabilities of information systems used obtained in a timely fashion, the organisation's exposure to such vulnerabilities evaluated and appropriate measures taken.",
   ["SOC 2: CC7.1","NIST CSF: ID.RA-01","PCI DSS 4.0: 11.3","NIS2: Art.21(e)"],
   "partial",2,2,"2025-09-30"],

  ["8.9","ISO 27001","Operations","Configuration management",
   "Configurations, including security configurations, of hardware, software, services and networks established, documented, implemented, monitored and reviewed.",
   ["SOC 2: CC7.1","NIST CSF: PR.PS-01","PCI DSS 4.0: 2.2","NIS2: Art.21(e)"],
   "implemented",3,4,"2025-12-31"],

  ["8.10","ISO 27001","Data Protection","Information deletion",
   "Information stored in information systems, devices or in any other storage media deleted when no longer required.",
   ["NIST CSF: PR.DS-11","GDPR: Art.17","PCI DSS 4.0: 3.2.1"],
   "implemented",4,4,"2025-12-31"],

  ["8.11","ISO 27001","Data Protection","Data masking",
   "Data masking used in accordance with the organisation's access control policy and other related policies, and business requirements, taking applicable legislation into consideration.",
   ["SOC 2: C1.2","NIST CSF: PR.DS-01","PCI DSS 4.0: 3.3"],
   "implemented",5,4,"2025-12-31"],

  ["8.12","ISO 27001","Data Protection","Data leakage prevention",
   "Data leakage prevention measures applied to systems, networks and any other devices that process, store or transmit sensitive information.",
   ["SOC 2: C1.2","NIST CSF: PR.DS-01","PCI DSS 4.0: 3.4"],
   "partial",6,2,"2025-10-31"],

  ["8.13","ISO 27001","Business Continuity","Information backup",
   "Backup copies of information, software and systems maintained and regularly tested in accordance with the agreed backup policy.",
   ["SOC 2: A1.2","NIST CSF: PR.DS-11","HIPAA: §164.308(a)(7)","PCI DSS 4.0: 12.3.4"],
   "implemented",7,5,"2025-12-31"],

  ["8.14","ISO 27001","Business Continuity","Redundancy of information processing facilities",
   "Information processing facilities implemented with redundancy sufficient to meet availability requirements.",
   ["SOC 2: A1.2","NIST CSF: PR.IR-04"],
   "implemented",0,4,"2025-12-31"],

  ["8.15","ISO 27001","Monitoring","Logging",
   "Logs that record activities, exceptions, faults and other relevant events produced, stored, protected and analysed.",
   ["SOC 2: CC7.2","NIST CSF: DE.CM-03","HIPAA: §164.312(b)","PCI DSS 4.0: 10.2","NIS2: Art.21(f)"],
   "implemented",1,5,"2025-12-31"],

  ["8.16","ISO 27001","Monitoring","Monitoring activities",
   "Networks, systems and applications monitored for anomalous behaviour and appropriate actions taken to evaluate potential information security incidents.",
   ["SOC 2: CC7.2","NIST CSF: DE.CM-01","PCI DSS 4.0: 10.6","NIS2: Art.21(f)"],
   "implemented",2,4,"2025-12-31"],

  ["8.17","ISO 27001","Monitoring","Clock synchronization",
   "Clocks of information processing systems used by the organisation synchronised to approved time sources.",
   ["SOC 2: CC7.2","NIST CSF: DE.CM-03","PCI DSS 4.0: 10.6.1"],
   "implemented",3,3,"2025-12-31"],

  ["8.18","ISO 27001","Access Control","Use of privileged utility programs",
   "Use of utility programs that might be capable of overriding system and application controls restricted and tightly controlled.",
   ["SOC 2: CC6.3","NIST CSF: PR.AA-05","PCI DSS 4.0: 2.7"],
   "implemented",4,3,"2025-12-31"],

  ["8.19","ISO 27001","Operations","Installation of software on operational systems",
   "Procedures and measures implemented to securely manage software installation on operational systems.",
   ["SOC 2: CC8.1","NIST CSF: PR.PS-01","PCI DSS 4.0: 6.3"],
   "implemented",5,4,"2025-12-31"],

  ["8.20","ISO 27001","Network Security","Networks security",
   "Networks and network devices secured, managed and controlled to protect information in systems and applications.",
   ["SOC 2: CC6.6","NIST CSF: PR.IR-01","PCI DSS 4.0: 1.3","NIS2: Art.21(e)"],
   "implemented",6,5,"2025-12-31"],

  ["8.21","ISO 27001","Network Security","Security of network services",
   "Security mechanisms, service levels and service requirements of network services identified, implemented and monitored.",
   ["SOC 2: CC6.6","NIST CSF: PR.IR-01","PCI DSS 4.0: 1.2"],
   "implemented",7,4,"2025-12-31"],

  ["8.22","ISO 27001","Network Security","Segregation of networks",
   "Groups of information services, users and information systems segregated in the organisation's networks.",
   ["SOC 2: CC6.6","NIST CSF: PR.IR-01","PCI DSS 4.0: 1.3.2"],
   "implemented",0,4,"2025-12-31"],

  ["8.23","ISO 27001","Network Security","Web filtering",
   "Access to external websites managed to reduce exposure to malicious content.",
   ["SOC 2: CC6.8","NIST CSF: PR.PS-04","PCI DSS 4.0: 6.4"],
   "implemented",1,3,"2025-12-31"],

  ["8.24","ISO 27001","Cryptography","Use of cryptography",
   "Rules for the effective use of cryptography, including cryptographic key management, defined and implemented.",
   ["SOC 2: CC6.7","NIST CSF: PR.DS-02","HIPAA: §164.312(e)","PCI DSS 4.0: 4.2","NIS2: Art.21(i)"],
   "implemented",2,5,"2025-12-31"],

  ["8.25","ISO 27001","Secure Development","Secure development life cycle",
   "Rules for the secure development of software and systems established and applied to developments within the organisation.",
   ["SOC 2: CC8.1","NIST CSF: PR.PS-02","PCI DSS 4.0: 6.2"],
   "implemented",3,5,"2025-12-31"],

  ["8.26","ISO 27001","Secure Development","Application security requirements",
   "Information security requirements identified, specified and approved when developing or acquiring applications.",
   ["SOC 2: CC8.1","NIST CSF: PR.PS-02","PCI DSS 4.0: 6.2.1"],
   "implemented",4,4,"2025-12-31"],

  ["8.27","ISO 27001","Secure Development","Secure system architecture and engineering principles",
   "Principles for engineering secure systems established, documented, maintained and applied to any information system development activities.",
   ["SOC 2: CC8.1","NIST CSF: PR.PS-02","PCI DSS 4.0: 6.2.3"],
   "implemented",5,4,"2025-12-31"],

  ["8.28","ISO 27001","Secure Development","Secure coding",
   "Secure coding principles applied to software development.",
   ["SOC 2: CC8.1","NIST CSF: PR.PS-02","PCI DSS 4.0: 6.2.4"],
   "implemented",6,5,"2025-12-31"],

  ["8.29","ISO 27001","Secure Development","Security testing in development and acceptance",
   "Security testing processes defined and implemented in the development life cycle.",
   ["SOC 2: CC8.1","NIST CSF: PR.PS-02","PCI DSS 4.0: 6.2.5"],
   "partial",7,3,"2025-09-30"],

  ["8.30","ISO 27001","Supply Chain","Outsourced development",
   "Organisation directs, monitors and reviews the activities related to outsourced system development.",
   ["SOC 2: CC9.2","NIST CSF: GV.SC-09","PCI DSS 4.0: 12.8.4"],
   "partial",0,2,"2025-10-31"],

  ["8.31","ISO 27001","Secure Development","Separation of development, test and production environments",
   "Development, testing and production environments separated and secured.",
   ["SOC 2: CC8.1","NIST CSF: PR.PS-02","PCI DSS 4.0: 6.4.1"],
   "implemented",1,4,"2025-12-31"],

  ["8.32","ISO 27001","Operations","Change management",
   "Changes to information processing facilities and information systems subject to change management procedures.",
   ["SOC 2: CC8.1","NIST CSF: PR.PS-03","PCI DSS 4.0: 6.5"],
   "implemented",2,5,"2025-12-31"],

  ["8.33","ISO 27001","Secure Development","Test information",
   "Test information appropriately selected, protected and managed.",
   ["SOC 2: CC6.5","NIST CSF: PR.DS-01","PCI DSS 4.0: 6.4.2"],
   "implemented",3,3,"2025-12-31"],

  ["8.34","ISO 27001","Operations","Protection of information systems during audit testing",
   "Audit tests and other assurance activities involving assessment of operational systems planned and agreed between the tester and appropriate management.",
   ["SOC 2: CC8.1","NIST CSF: ID.IM-04"],
   "implemented",4,3,"2025-12-31"],

  // ══════════════════════════════════════════════════════════════════════════════
  // SOC 2 TYPE II — UNIQUE TRUST SERVICE CRITERIA (not already cross-referenced)
  // ══════════════════════════════════════════════════════════════════════════════

  ["CC1.1","SOC 2","Governance","Board commitment to integrity and ethics",
   "Board of directors demonstrates a commitment to integrity and ethical values.",
   ["ISO 27001: 5.4","NIST CSF: GV.OV-01"],
   "implemented",5,3,"2025-12-31"],

  ["CC1.2","SOC 2","Governance","Board exercises oversight responsibility",
   "Board of directors exercises oversight responsibility independent of management.",
   ["ISO 27001: 5.4","NIST CSF: GV.OV-02"],
   "implemented",6,2,"2025-12-31"],

  ["CC1.3","SOC 2","Governance","Management establishes structure and authority",
   "Management establishes structure, reporting lines, and appropriate authorities and responsibilities.",
   ["ISO 27001: 5.2","NIST CSF: GV.RR-02"],
   "implemented",7,3,"2025-12-31"],

  ["CC1.4","SOC 2","HR Security","Commitment to attract, develop, and retain competent individuals",
   "Organisation demonstrates commitment to attract, develop, and retain competent individuals in alignment with objectives.",
   ["ISO 27001: 6.1","ISO 27001: 6.3","NIST CSF: PR.AT-01"],
   "implemented",0,3,"2025-12-31"],

  ["CC2.1","SOC 2","Governance","Uses relevant quality information",
   "Organisation obtains or generates and uses relevant quality information to support the functioning of internal control.",
   ["ISO 27001: 5.33","NIST CSF: GV.PO-02"],
   "implemented",1,2,"2025-12-31"],

  ["CC2.2","SOC 2","Governance","Communicates internally",
   "Organisation internally communicates information, including objectives and responsibilities for internal control.",
   ["ISO 27001: 6.3","NIST CSF: GV.PO-02"],
   "implemented",2,2,"2025-12-31"],

  ["CC3.1","SOC 2","Risk Management","Specifies suitable objectives",
   "Entity specifies objectives with sufficient clarity to enable the identification and assessment of risks.",
   ["ISO 27001: 5.1","NIST CSF: GV.RM-01"],
   "implemented",3,3,"2025-12-31"],

  ["CC3.2","SOC 2","Risk Management","Identifies and analyzes risk",
   "Entity identifies risks to the achievement of its objectives across the entity and analyzes risks as a basis for determining how they should be managed.",
   ["ISO 27001: 5.7","NIST CSF: ID.RA-05"],
   "implemented",4,3,"2025-12-31"],

  ["CC3.3","SOC 2","Risk Management","Assesses fraud risk",
   "Entity considers the potential for fraud in assessing risks to the achievement of objectives.",
   ["ISO 27001: 5.3","NIST CSF: ID.RA-03"],
   "partial",5,1,"2025-09-30"],

  ["CC3.4","SOC 2","Risk Management","Identifies and assesses changes",
   "Entity identifies and assesses changes that could significantly impact the system of internal control.",
   ["ISO 27001: 8.32","NIST CSF: ID.IM-02"],
   "implemented",6,2,"2025-12-31"],

  ["CC4.1","SOC 2","Compliance","Selects and develops ongoing evaluations",
   "Entity selects, develops and performs ongoing and/or separate evaluations to ascertain whether the components of internal control are present and functioning.",
   ["ISO 27001: 5.36","NIST CSF: GV.OV-01"],
   "implemented",7,3,"2025-12-31"],

  ["CC4.2","SOC 2","Compliance","Evaluates and communicates deficiencies",
   "Entity evaluates and communicates internal control deficiencies in a timely manner to those parties responsible for taking corrective action.",
   ["ISO 27001: 5.35","NIST CSF: GV.OV-02"],
   "partial",0,1,"2025-10-31"],

  ["CC5.1","SOC 2","Operations","Selects and develops control activities",
   "Entity selects and develops control activities that contribute to the mitigation of risks to the achievement of objectives.",
   ["ISO 27001: 5.36","NIST CSF: GV.PO-01"],
   "implemented",1,3,"2025-12-31"],

  ["CC9.1","SOC 2","Risk Management","Identifies risk mitigation strategies",
   "Entity identifies, selects and develops risk mitigation activities for risks arising from potential business disruptions.",
   ["ISO 27001: 5.29","NIST CSF: GV.RM-02","NIS2: Art.21(c)"],
   "implemented",2,4,"2025-12-31"],

  ["A1.1","SOC 2","Business Continuity","Capacity and performance requirements",
   "Current processing capacity and utilization reviewed and compared with capacity requirements.",
   ["ISO 27001: 8.6","NIST CSF: PR.IR-02"],
   "implemented",3,4,"2025-12-31"],

  ["A1.2","SOC 2","Business Continuity","Environmental protections and availability",
   "Environmental protections, software, data backup processes, and recovery infrastructure designed to meet recovery time and recovery point objectives.",
   ["ISO 27001: 8.13","ISO 27001: 5.30","NIST CSF: RC.RP-02","HIPAA: §164.308(a)(7)"],
   "implemented",4,5,"2025-12-31"],

  ["A1.3","SOC 2","Business Continuity","Recovery plan tested",
   "Recovery plan procedures tested and updated to address findings.",
   ["ISO 27001: 5.29","NIST CSF: RC.RP-01","HIPAA: §164.308(a)(7)"],
   "partial",5,2,"2025-10-31"],

  ["C1.1","SOC 2","Data Protection","Identifies and maintains confidential information",
   "Confidential information is identified and designated in accordance with contractual and legal requirements.",
   ["ISO 27001: 5.12","NIST CSF: ID.AM-07"],
   "implemented",6,4,"2025-12-31"],

  ["C1.2","SOC 2","Data Protection","Disposes of confidential information",
   "Confidential information is protected during the disposal process to meet the entity's objectives.",
   ["ISO 27001: 8.11","NIST CSF: PR.DS-08"],
   "implemented",7,4,"2025-12-31"],

  ["PI1.1","SOC 2","Operations","Defines and communicates processing objectives",
   "Entity defines and communicates its system processing objectives, including input/output requirements.",
   ["ISO 27001: 5.37","NIST CSF: PR.PS-01"],
   "implemented",0,3,"2025-12-31"],

  ["PI1.2","SOC 2","Operations","Inputs evaluated for completeness and accuracy",
   "Inputs are evaluated to meet defined system processing objectives and to detect and correct errors.",
   ["ISO 27001: 8.9","NIST CSF: PR.DS-01"],
   "implemented",1,3,"2025-12-31"],

  ["P1.1","SOC 2","Privacy","Privacy notice to data subjects",
   "Entity provides notice to data subjects about its privacy practices in a manner that enables individuals to understand and exercise their choices.",
   ["GDPR: Art.13","GDPR: Art.14","HIPAA: §164.308(a)(1)"],
   "implemented",2,4,"2025-12-31"],

  ["P2.1","SOC 2","Privacy","Choice and consent management",
   "Entity communicates choices available to individuals regarding personal information collection and use, and obtains implicit or explicit consent for collection and use.",
   ["GDPR: Art.7","GDPR: Art.21","NIST CSF: GV.PO-02"],
   "implemented",3,4,"2025-12-31"],

  // ══════════════════════════════════════════════════════════════════════════════
  // NIST CSF 2.0 — UNIQUE CATEGORIES
  // ══════════════════════════════════════════════════════════════════════════════

  ["GV.OC-01","NIST CSF","Governance","Organisational context and mission understood",
   "The organisational mission is understood and informs cybersecurity risk management.",
   ["ISO 27001: 5.1","SOC 2: CC1.1"],
   "implemented",4,3,"2025-12-31"],

  ["GV.RM-01","NIST CSF","Risk Management","Risk management strategy established",
   "Risk management objectives are established and agreed to by organisational stakeholders.",
   ["ISO 27001: 5.4","SOC 2: CC3.1"],
   "implemented",5,3,"2025-12-31"],

  ["GV.RM-02","NIST CSF","Risk Management","Risk appetite and tolerance set",
   "Risk tolerance and appetite statements are established, communicated, and maintained.",
   ["ISO 27001: 5.1","SOC 2: CC3.2"],
   "implemented",6,4,"2025-12-31"],

  ["GV.SC-01","NIST CSF","Supply Chain","Cybersecurity supply chain risk program",
   "A cybersecurity supply chain risk management program, strategy, objectives, policies, and processes are established.",
   ["ISO 27001: 5.19","ISO 27001: 5.21","SOC 2: CC9.2","NIS2: Art.21(d)"],
   "partial",7,2,"2025-10-31"],

  ["ID.AM-03","NIST CSF","Asset Management","Hardware assets inventoried",
   "Hardware assets associated with the organisation's information systems are catalogued.",
   ["ISO 27001: 5.9","SOC 2: CC6.1","PCI DSS 4.0: 12.5.1"],
   "implemented",0,4,"2025-12-31"],

  ["ID.RA-02","NIST CSF","Risk Management","Cyber threat intelligence received",
   "Cyber threat intelligence is received from information sharing forums and sources.",
   ["ISO 27001: 5.7","SOC 2: CC3.2"],
   "partial",1,1,"2025-09-30"],

  ["ID.RA-05","NIST CSF","Risk Management","Threats and vulnerabilities identified",
   "Threats, vulnerabilities, likelihoods, and impacts are used to understand inherent risk and inform risk response prioritisation.",
   ["ISO 27001: 8.8","SOC 2: CC3.2"],
   "implemented",2,3,"2025-12-31"],

  ["ID.IM-01","NIST CSF","Governance","Improvements from evaluations",
   "Improvements are identified from security evaluations and assessments.",
   ["ISO 27001: 5.27","SOC 2: CC4.1"],
   "partial",3,1,"2025-10-31"],

  ["RS.CO-01","NIST CSF","Incident Management","Incident reporting roles established",
   "Incident reporting roles and responsibilities are established.",
   ["ISO 27001: 5.24","SOC 2: CC7.3","NIS2: Art.21(b)"],
   "implemented",4,3,"2025-12-31"],

  ["RS.CO-03","NIST CSF","Incident Management","Information shared with designated parties",
   "Information is shared consistent with response plans with designated internal and external stakeholders.",
   ["ISO 27001: 5.5","SOC 2: CC7.4"],
   "partial",5,2,"2025-09-30"],

  ["RC.CO-01","NIST CSF","Business Continuity","Recovery communications planned",
   "Public relations and reputational management communications are maintained after an incident.",
   ["ISO 27001: 5.26","SOC 2: CC7.5"],
   "partial",6,1,"2025-11-30"],

  ["DE.CM-06","NIST CSF","Monitoring","External service provider activity monitored",
   "External service provider activity is monitored to detect potentially adverse events.",
   ["ISO 27001: 5.22","SOC 2: CC9.2"],
   "partial",7,2,"2025-10-31"],

  ["DE.AE-05","NIST CSF","Monitoring","Incident alert thresholds established",
   "Incident alert thresholds are established.",
   ["ISO 27001: 8.16","SOC 2: CC7.2"],
   "implemented",0,3,"2025-12-31"],

  // ══════════════════════════════════════════════════════════════════════════════
  // PCI DSS v4.0 — UNIQUE REQUIREMENTS
  // ══════════════════════════════════════════════════════════════════════════════

  ["PCI-1.1","PCI DSS 4.0","Network Security","Processes and mechanisms for network security controls",
   "Processes and mechanisms for installing and maintaining network security controls are defined and understood.",
   ["ISO 27001: 8.20","ISO 27001: 8.21","NIST CSF: PR.IR-01"],
   "implemented",1,4,"2025-12-31"],

  ["PCI-2.2","PCI DSS 4.0","Configuration Management","System components configured with secure configurations",
   "All system components are configured and managed securely using a configuration hardening standard.",
   ["ISO 27001: 8.9","NIST CSF: PR.PS-01","NIS2: Art.21(e)"],
   "implemented",2,5,"2025-12-31"],

  ["PCI-3.3","PCI DSS 4.0","Data Protection","Sensitive authentication data not stored after authorisation",
   "Sensitive authentication data (SAD) is not stored after authorisation, even if encrypted.",
   ["ISO 27001: 8.10","ISO 27001: 8.11","NIST CSF: PR.DS-01"],
   "implemented",3,5,"2025-12-31"],

  ["PCI-3.5","PCI DSS 4.0","Cryptography","Primary account number protected",
   "PAN is secured with strong cryptography wherever stored.",
   ["ISO 27001: 8.24","NIST CSF: PR.DS-02"],
   "implemented",4,5,"2025-12-31"],

  ["PCI-4.2","PCI DSS 4.0","Cryptography","PAN protected with strong cryptography during transmission",
   "PAN is protected with strong cryptography during transmission over open, public networks.",
   ["ISO 27001: 8.24","ISO 27001: 5.14","NIST CSF: PR.DS-02"],
   "implemented",5,5,"2025-12-31"],

  ["PCI-5.2","PCI DSS 4.0","Endpoint Security","Malicious software prevented",
   "Malicious software (malware) is prevented, or detected and addressed.",
   ["ISO 27001: 8.7","NIST CSF: DE.CM-01"],
   "implemented",6,5,"2025-12-31"],

  ["PCI-6.2","PCI DSS 4.0","Secure Development","Bespoke and custom software developed securely",
   "Bespoke and custom software is developed securely.",
   ["ISO 27001: 8.25","ISO 27001: 8.26","NIST CSF: PR.PS-02"],
   "implemented",7,4,"2025-12-31"],

  ["PCI-7.1","PCI DSS 4.0","Access Control","Access to system components and data restricted",
   "Processes and mechanisms for restricting access to system components and cardholder data by business need to know are defined and understood.",
   ["ISO 27001: 5.15","ISO 27001: 8.3","NIST CSF: PR.AA-01"],
   "implemented",0,5,"2025-12-31"],

  ["PCI-8.4","PCI DSS 4.0","Access Control","Multi-factor authentication for access to CDE",
   "Multi-factor authentication is implemented to secure access into the cardholder data environment.",
   ["ISO 27001: 8.5","ISO 27001: 5.17","NIST CSF: PR.AA-02","NIS2: Art.21(k)"],
   "implemented",1,5,"2025-12-31"],

  ["PCI-9.1","PCI DSS 4.0","Physical Security","Processes and mechanisms to protect CDE physical access",
   "Processes and mechanisms for restricting physical access to cardholder data are defined and understood.",
   ["ISO 27001: 7.1","ISO 27001: 7.2","NIST CSF: PR.IR-01"],
   "implemented",2,4,"2025-12-31"],

  ["PCI-10.2","PCI DSS 4.0","Monitoring","Audit logs are implemented to support detection",
   "Audit logs are implemented to support the detection of anomalies and suspicious activity, and the forensic analysis of events.",
   ["ISO 27001: 8.15","NIST CSF: DE.CM-03","HIPAA: §164.312(b)"],
   "implemented",3,5,"2025-12-31"],

  ["PCI-10.5","PCI DSS 4.0","Monitoring","Audit log history retained",
   "Audit log history is retained and available for analysis.",
   ["ISO 27001: 8.15","ISO 27001: 5.33","NIST CSF: PR.DS-11"],
   "implemented",4,4,"2025-12-31"],

  ["PCI-11.3","PCI DSS 4.0","Vulnerability Management","External and internal vulnerabilities managed",
   "External and internal vulnerabilities are regularly identified, prioritised, and addressed.",
   ["ISO 27001: 8.8","NIST CSF: ID.RA-01"],
   "partial",5,2,"2025-09-30"],

  ["PCI-11.4","PCI DSS 4.0","Vulnerability Management","External and internal penetration testing performed",
   "External and internal penetration testing is regularly performed, and exploitable vulnerabilities and security weaknesses are corrected.",
   ["ISO 27001: 8.8","ISO 27001: 8.29","NIST CSF: ID.RA-01"],
   "partial",6,2,"2025-09-30"],

  ["PCI-12.1","PCI DSS 4.0","Governance","Information security policy established",
   "A comprehensive information security policy that governs and provides direction for protection of the entity's information assets is established.",
   ["ISO 27001: 5.1","ISO 27001: 5.37","NIST CSF: GV.PO-01"],
   "implemented",7,5,"2025-12-31"],

  ["PCI-12.8","PCI DSS 4.0","Supply Chain","Risk to information assets from third parties managed",
   "Risk to information assets associated with third-party service provider (TPSP) relationships is managed.",
   ["ISO 27001: 5.19","ISO 27001: 5.20","NIST CSF: GV.SC-06"],
   "partial",0,2,"2025-10-31"],

  ["PCI-12.10","PCI DSS 4.0","Incident Management","Suspected and confirmed security incidents responded to immediately",
   "Suspected and confirmed security incidents that could impact the CDE are responded to immediately.",
   ["ISO 27001: 5.24","ISO 27001: 5.26","NIST CSF: RS.MA-01"],
   "implemented",1,4,"2025-12-31"],

  ["PCI-3.6","PCI DSS 4.0","Cryptography","Cryptographic keys protecting stored account data secured",
   "Cryptographic keys used to protect stored account data are secured.",
   ["ISO 27001: 8.24","NIST CSF: PR.DS-02"],
   "implemented",2,4,"2025-12-31"],

  // ══════════════════════════════════════════════════════════════════════════════
  // HIPAA SECURITY RULE — UNIQUE SAFEGUARDS
  // ══════════════════════════════════════════════════════════════════════════════

  ["HIPAA-308.a.1","HIPAA","Administrative Safeguards","Security management process",
   "Implement policies and procedures to prevent, detect, contain, and correct security violations through risk analysis and risk management.",
   ["ISO 27001: 5.1","ISO 27001: 5.36","NIST CSF: GV.RM-01","SOC 2: CC3.2"],
   "implemented",3,5,"2025-12-31"],

  ["HIPAA-308.a.2","HIPAA","Administrative Safeguards","Assigned security responsibility",
   "Identify the security official who is responsible for the development and implementation of security policies and procedures.",
   ["ISO 27001: 5.2","NIST CSF: GV.RR-02","SOC 2: CC1.3"],
   "implemented",4,3,"2025-12-31"],

  ["HIPAA-308.a.3","HIPAA","Administrative Safeguards","Workforce security",
   "Implement policies and procedures to ensure that workforce members have appropriate access and to prevent unauthorised workforce members from accessing ePHI.",
   ["ISO 27001: 5.15","ISO 27001: 5.18","NIST CSF: PR.AA-01"],
   "implemented",5,4,"2025-12-31"],

  ["HIPAA-308.a.4","HIPAA","Administrative Safeguards","Information access management",
   "Implement policies and procedures for authorising access to ePHI that are consistent with the applicable HIPAA requirements.",
   ["ISO 27001: 5.15","ISO 27001: 8.3","NIST CSF: PR.AA-01","PCI DSS 4.0: 7.1"],
   "implemented",6,4,"2025-12-31"],

  ["HIPAA-308.a.5","HIPAA","Administrative Safeguards","Security awareness and training",
   "Implement a security awareness and training program for all workforce members including management.",
   ["ISO 27001: 6.3","NIST CSF: PR.AT-01","SOC 2: CC2.2"],
   "implemented",7,4,"2025-12-31"],

  ["HIPAA-308.a.6","HIPAA","Administrative Safeguards","Security incident procedures",
   "Implement policies and procedures to address security incidents including response and reporting.",
   ["ISO 27001: 5.24","ISO 27001: 5.26","NIST CSF: RS.MA-01","SOC 2: CC7.3"],
   "implemented",0,4,"2025-12-31"],

  ["HIPAA-308.a.7","HIPAA","Administrative Safeguards","Contingency plan",
   "Establish and implement policies and procedures for responding to an emergency or other occurrence that damages systems containing ePHI.",
   ["ISO 27001: 5.29","ISO 27001: 8.13","NIST CSF: RC.RP-01","SOC 2: A1.2"],
   "partial",1,3,"2025-10-31"],

  ["HIPAA-308.a.8","HIPAA","Administrative Safeguards","Evaluation",
   "Perform a periodic technical and nontechnical evaluation to assess the extent to which security policies and procedures meet the requirements.",
   ["ISO 27001: 5.35","ISO 27001: 5.36","NIST CSF: GV.OV-01","SOC 2: CC4.2"],
   "partial",2,2,"2025-10-31"],

  ["HIPAA-308.b.1","HIPAA","Administrative Safeguards","Business associate contracts",
   "Obtain satisfactory assurances from business associates that they will appropriately safeguard ePHI.",
   ["ISO 27001: 5.20","ISO 27001: 5.19","NIST CSF: GV.SC-10","GDPR: Art.28"],
   "implemented",3,4,"2025-12-31"],

  ["HIPAA-310.a","HIPAA","Physical Safeguards","Facility access controls",
   "Implement policies and procedures to limit physical access to electronic information systems and the facility in which they are housed.",
   ["ISO 27001: 7.1","ISO 27001: 7.2","NIST CSF: PR.IR-01","SOC 2: CC6.4"],
   "implemented",4,4,"2025-12-31"],

  ["HIPAA-310.b","HIPAA","Physical Safeguards","Workstation use",
   "Implement policies and procedures that specify the proper functions to be performed and the manner in which those functions are to be performed on workstations.",
   ["ISO 27001: 8.1","ISO 27001: 7.7","NIST CSF: PR.PS-03"],
   "implemented",5,3,"2025-12-31"],

  ["HIPAA-310.c","HIPAA","Physical Safeguards","Workstation security",
   "Implement physical safeguards for all workstations that access ePHI to restrict access to authorised users.",
   ["ISO 27001: 8.1","ISO 27001: 7.3","NIST CSF: PR.PS-03","SOC 2: CC6.4"],
   "implemented",6,3,"2025-12-31"],

  ["HIPAA-310.d","HIPAA","Physical Safeguards","Device and media controls",
   "Implement policies and procedures that govern the receipt and removal of hardware and electronic media that contain ePHI.",
   ["ISO 27001: 7.10","ISO 27001: 7.14","NIST CSF: PR.DS-01"],
   "implemented",7,4,"2025-12-31"],

  ["HIPAA-312.a","HIPAA","Technical Safeguards","Access control",
   "Implement technical policies and procedures for electronic information systems that maintain ePHI to allow access only to those persons or software programs that have been granted access rights.",
   ["ISO 27001: 5.15","ISO 27001: 8.2","NIST CSF: PR.AA-01","PCI DSS 4.0: 7.1"],
   "implemented",0,5,"2025-12-31"],

  ["HIPAA-312.b","HIPAA","Technical Safeguards","Audit controls",
   "Implement hardware, software, and/or procedural mechanisms that record and examine activity in information systems that contain or use ePHI.",
   ["ISO 27001: 8.15","ISO 27001: 8.16","NIST CSF: DE.CM-03","PCI DSS 4.0: 10.2"],
   "implemented",1,5,"2025-12-31"],

  ["HIPAA-312.c","HIPAA","Technical Safeguards","Integrity controls",
   "Implement policies and procedures to protect ePHI from improper alteration or destruction.",
   ["ISO 27001: 5.34","NIST CSF: PR.DS-01"],
   "implemented",2,4,"2025-12-31"],

  ["HIPAA-312.d","HIPAA","Technical Safeguards","Person or entity authentication",
   "Implement procedures to verify that a person or entity seeking access to ePHI is the one claimed.",
   ["ISO 27001: 8.5","ISO 27001: 5.17","NIST CSF: PR.AA-02","PCI DSS 4.0: 8.4"],
   "implemented",3,4,"2025-12-31"],

  ["HIPAA-312.e","HIPAA","Technical Safeguards","Transmission security",
   "Implement technical security measures to guard against unauthorised access to ePHI that is being transmitted over an electronic communications network.",
   ["ISO 27001: 8.24","ISO 27001: 5.14","NIST CSF: PR.DS-02","PCI DSS 4.0: 4.2"],
   "implemented",4,5,"2025-12-31"],

  // ══════════════════════════════════════════════════════════════════════════════
  // GDPR — KEY ARTICLES
  // ══════════════════════════════════════════════════════════════════════════════

  ["GDPR-Art.5","GDPR","Data Processing Principles","Principles relating to processing of personal data",
   "Personal data shall be processed lawfully, fairly, transparently, for specified purposes, minimised, accurate, stored no longer than necessary, and processed securely.",
   ["ISO 27001: 5.34","ISO 27001: 5.31","HIPAA: §164.312","NIST CSF: GV.OC-03"],
   "implemented",5,5,"2025-12-31"],

  ["GDPR-Art.6","GDPR","Data Processing Principles","Lawfulness of processing",
   "Processing of personal data is only lawful if at least one legal basis applies (consent, contract, legal obligation, vital interests, public task, or legitimate interests).",
   ["ISO 27001: 5.31","NIST CSF: GV.OC-03","SOC 2: CC1.5"],
   "implemented",6,5,"2025-12-31"],

  ["GDPR-Art.7","GDPR","Consent Management","Conditions for consent",
   "Consent by the data subject must be freely given, specific, informed, and unambiguous, with the ability to withdraw at any time.",
   ["ISO 27001: 5.34","SOC 2: P2.1","NIST CSF: GV.PO-02"],
   "implemented",7,4,"2025-12-31"],

  ["GDPR-Art.13","GDPR","Data Subject Rights","Information to be provided — direct collection",
   "Transparent information provided to data subjects at the time of collection including identity of controller, purposes, and data subject rights.",
   ["ISO 27001: 5.34","SOC 2: P1.1","NIST CSF: GV.PO-02"],
   "implemented",0,4,"2025-12-31"],

  ["GDPR-Art.14","GDPR","Data Subject Rights","Information to be provided — indirect collection",
   "Transparent information provided when personal data is not collected directly from the data subject.",
   ["ISO 27001: 5.34","SOC 2: P1.1"],
   "partial",1,2,"2025-09-30"],

  ["GDPR-Art.15","GDPR","Data Subject Rights","Right of access by the data subject",
   "Data subjects have the right to obtain confirmation of whether personal data is processed and to receive a copy of such data.",
   ["ISO 27001: 5.34","SOC 2: P5.1","NIST CSF: PR.DS-07"],
   "implemented",2,4,"2025-12-31"],

  ["GDPR-Art.16","GDPR","Data Subject Rights","Right to rectification",
   "Data subjects have the right to obtain without undue delay the rectification of inaccurate personal data.",
   ["ISO 27001: 5.34","NIST CSF: PR.DS-07"],
   "implemented",3,3,"2025-12-31"],

  ["GDPR-Art.17","GDPR","Data Subject Rights","Right to erasure (right to be forgotten)",
   "Data subjects have the right to have personal data erased where there is no longer a legitimate reason for processing it.",
   ["ISO 27001: 8.10","ISO 27001: 5.34","NIST CSF: PR.DS-11"],
   "partial",4,2,"2025-09-30"],

  ["GDPR-Art.18","GDPR","Data Subject Rights","Right to restriction of processing",
   "Data subjects have the right to obtain restriction of processing under certain conditions.",
   ["ISO 27001: 5.34","NIST CSF: PR.DS-07"],
   "partial",5,2,"2025-09-30"],

  ["GDPR-Art.20","GDPR","Data Subject Rights","Right to data portability",
   "Data subjects have the right to receive personal data in a structured, commonly used format and to transmit it to another controller.",
   ["ISO 27001: 5.34","NIST CSF: PR.DS-07"],
   "partial",6,1,"2025-11-30"],

  ["GDPR-Art.21","GDPR","Data Subject Rights","Right to object",
   "Data subjects have the right to object at any time to processing of their personal data for legitimate interests or direct marketing purposes.",
   ["ISO 27001: 5.34","SOC 2: P2.1"],
   "partial",7,2,"2025-09-30"],

  ["GDPR-Art.25","GDPR","Privacy by Design","Data protection by design and by default",
   "Controller implements appropriate technical and organisational measures designed to implement the data protection principles and integrate necessary safeguards into processing.",
   ["ISO 27001: 5.8","ISO 27001: 5.34","NIST CSF: PR.PS-02","SOC 2: CC8.1"],
   "partial",0,2,"2025-10-31"],

  ["GDPR-Art.28","GDPR","Data Processing","Processor obligations",
   "Controller only uses processors providing sufficient guarantees with a binding data processing agreement in place.",
   ["ISO 27001: 5.20","ISO 27001: 5.19","NIST CSF: GV.SC-10","HIPAA: §164.308(b)(1)"],
   "implemented",1,5,"2025-12-31"],

  ["GDPR-Art.30","GDPR","Records","Records of processing activities",
   "Controller and processor maintain records of all categories of processing activities.",
   ["ISO 27001: 5.33","NIST CSF: PR.DS-11","SOC 2: CC2.1"],
   "implemented",2,5,"2025-12-31"],

  ["GDPR-Art.32","GDPR","Security","Security of processing",
   "Controller and processor implement appropriate technical and organisational measures to ensure security appropriate to the risk, including encryption and pseudonymisation.",
   ["ISO 27001: 8.24","ISO 27001: 5.34","NIST CSF: PR.DS-02","HIPAA: §164.312","SOC 2: CC6.7"],
   "implemented",3,5,"2025-12-31"],

  ["GDPR-Art.33","GDPR","Breach Notification","Breach notification to supervisory authority",
   "Controller notifies the relevant supervisory authority of a personal data breach within 72 hours of becoming aware of it.",
   ["ISO 27001: 5.26","ISO 27001: 5.24","NIST CSF: RS.CO-03","NIS2: Art.21(b)"],
   "implemented",4,4,"2025-12-31"],

  ["GDPR-Art.34","GDPR","Breach Notification","Communication of data breach to data subject",
   "Where a personal data breach is likely to result in a high risk to data subjects, the controller communicates the breach to those data subjects without undue delay.",
   ["ISO 27001: 5.26","NIST CSF: RS.CO-03"],
   "partial",5,2,"2025-09-30"],

  ["GDPR-Art.35","GDPR","Privacy by Design","Data Protection Impact Assessment",
   "Where a type of processing is likely to result in a high risk, the controller carries out a data protection impact assessment prior to processing.",
   ["ISO 27001: 5.8","ISO 27001: 5.31","NIST CSF: ID.RA-01","SOC 2: CC3.2"],
   "partial",6,3,"2025-10-31"],

  ["GDPR-Art.37","GDPR","Governance","Designation of a Data Protection Officer",
   "Organisations that process personal data on a large scale must appoint a Data Protection Officer.",
   ["ISO 27001: 5.2","ISO 27001: 5.4","NIST CSF: GV.RR-02","SOC 2: CC1.3"],
   "implemented",7,4,"2025-12-31"],

  ["GDPR-Art.44","GDPR","International Transfers","General principle for transfers to third countries",
   "Transfer of personal data to a third country may only take place where adequate safeguards are in place (adequacy decision, SCCs, BCRs).",
   ["ISO 27001: 5.31","ISO 27001: 5.14","NIST CSF: GV.OC-03"],
   "partial",0,2,"2025-10-31"],

  // ══════════════════════════════════════════════════════════════════════════════
  // NIS2 DIRECTIVE — UNIQUE ART.21 SECURITY MEASURES
  // ══════════════════════════════════════════════════════════════════════════════

  ["NIS2-Art.21a","NIS2","Risk Management","Policies on risk analysis and information system security",
   "Risk analysis and information system security policies covering governance, risk management processes, and security objectives.",
   ["ISO 27001: 5.1","ISO 27001: 5.4","NIST CSF: GV.RM-01","HIPAA: §164.308(a)(1)"],
   "partial",1,2,"2025-10-17"],

  ["NIS2-Art.21b","NIS2","Incident Management","Incident handling and reporting",
   "Policies and procedures for detecting, reporting, assessing, and responding to cybersecurity incidents, including mandatory notification to authorities.",
   ["ISO 27001: 5.24","ISO 27001: 5.26","NIST CSF: RS.MA-01","GDPR: Art.33","SOC 2: CC7.3"],
   "partial",2,2,"2025-10-17"],

  ["NIS2-Art.21c","NIS2","Business Continuity","Business continuity including backup management and disaster recovery",
   "Business continuity management including backup management, disaster recovery, and crisis management to ensure continuity of essential services.",
   ["ISO 27001: 5.29","ISO 27001: 5.30","ISO 27001: 8.13","NIST CSF: RC.RP-01","SOC 2: A1.2"],
   "partial",3,2,"2025-10-17"],

  ["NIS2-Art.21d","NIS2","Supply Chain","Supply chain security",
   "Security in supply chain including security-related aspects concerning relationships between each entity and its direct suppliers or service providers.",
   ["ISO 27001: 5.19","ISO 27001: 5.21","ISO 27001: 5.23","NIST CSF: GV.SC-01","SOC 2: CC9.2"],
   "not-started",4,0,"2026-01-31"],

  ["NIS2-Art.21e","NIS2","Technical Controls","Security in network and IS acquisition, development and maintenance",
   "Security in the acquisition, development and maintenance of network and information systems, including vulnerability handling and disclosure.",
   ["ISO 27001: 8.7","ISO 27001: 8.8","ISO 27001: 8.9","ISO 27001: 8.25","NIST CSF: PR.PS-02"],
   "partial",5,1,"2025-10-17"],

  ["NIS2-Art.21g","NIS2","Cyber Hygiene","Basic cyber hygiene practices",
   "Basic cyber hygiene practices and cybersecurity training to maintain a minimum baseline of security for all personnel.",
   ["ISO 27001: 6.3","ISO 27001: 8.1","NIST CSF: PR.AT-01","PCI DSS 4.0: 12.6"],
   "partial",6,2,"2025-10-17"],

  ["NIS2-Art.21h","NIS2","HR Security","Cybersecurity training and awareness",
   "Mandatory cybersecurity training programmes for all personnel including management to meet the sector-specific risk profile.",
   ["ISO 27001: 6.3","ISO 27001: 6.2","NIST CSF: PR.AT-01","HIPAA: §164.308(a)(5)","SOC 2: CC2.2"],
   "partial",7,2,"2025-10-17"],

  ["NIS2-Art.21k","NIS2","Access Control","Multi-factor authentication or continuous authentication solutions",
   "Use of multi-factor authentication or continuous authentication solutions and secured voice, video, and text communications.",
   ["ISO 27001: 8.5","ISO 27001: 5.17","NIST CSF: PR.AA-02","PCI DSS 4.0: 8.4","HIPAA: §164.312(d)"],
   "partial",0,3,"2025-10-17"],
];

export const controlLibrary: ComplianceControlFull[] = raw.map(
  ([id, fw, dom, name, desc, refs, st, oi, ev, due]) => ({
    id, framework: fw, domain: dom, name, description: desc,
    crossReferences: refs, status: st, owner: ow(oi), evidence: ev, dueDate: due,
  })
);

export const controlMap = new Map<string, ComplianceControlFull>(
  controlLibrary.map(c => [c.id, c])
);
