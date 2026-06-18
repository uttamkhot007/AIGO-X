import { randomUUID } from "crypto";
import { eventBus } from "../../lib/event-bus";
import { encryptToken, decryptToken } from "../../lib/token-encryption";

export type ConnectorCategory =
  | "Cloud" | "Identity" | "EDR/XDR" | "PAM"
  | "ITSM" | "DevSecOps" | "SIEM/SOAR" | "Network"
  | "Vuln Mgmt" | "SaaS" | "Data" | "HR & People";

export type AuthType = "oauth2" | "api-key" | "webhook" | "saml" | "certificate" | "basic";
export type ConnectionStatus = "connected" | "partial" | "warning" | "error" | "available";

export interface ConnectorDef {
  id: string;
  name: string;
  category: ConnectorCategory;
  authType: AuthType;
  logoColor: string;
  logoInitial: string;
  capabilities: string[];
  description: string;
  docsUrl: string;
  featured: boolean;
}

export interface Connection {
  id: string;
  tenantId: string;
  connectorId: string;
  connectorName: string;
  category: ConnectorCategory;
  status: ConnectionStatus;
  syncSchedule: string;
  lastSync: string | null;
  nextSync: string | null;
  assetsIngested: number;
  eventsIngested: number;
  errorCount: number;
  createdAt: string;
  /** AES-256-GCM encrypted OAuth/API token blob (base64). Null until auth flow completes. */
  tokenData: string | null;
}

export interface PipelineMetric {
  connectorId: string;
  connectorName: string;
  date: string;
  volumeIn: number;
  volumeOut: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  errorRate: number;
  errors: Array<{ ts: string; code: string; message: string }>;
}

export interface WebhookConfig {
  id: string;
  tenantId: string;
  direction: "inbound" | "outbound";
  name: string;
  url: string;
  signingSecret: string;
  eventTypes: string[];
  retryPolicy: { maxAttempts: number; backoffMs: number };
  active: boolean;
  createdAt: string;
}

export interface DeliveryLog {
  id: string;
  webhookId: string;
  ts: string;
  event: string;
  statusCode: number;
  latencyMs: number;
  payload: string;
  response: string;
  success: boolean;
}

const CONNECTORS: ConnectorDef[] = [
  // Cloud (CSPM)
  { id:"aws",           name:"Amazon Web Services",      category:"Cloud",      authType:"oauth2",      logoColor:"#FF9900", logoInitial:"⬡", capabilities:["cspm","asset-discovery","cloudtrail","iam-analysis"],          description:"Full AWS posture: EC2, S3, IAM, CloudTrail, Config rules",          docsUrl:"#", featured:true  },
  { id:"azure",         name:"Microsoft Azure",           category:"Cloud",      authType:"oauth2",      logoColor:"#0089D6", logoInitial:"A", capabilities:["cspm","asset-discovery","entra","defender-integration"],        description:"Azure subscriptions, Resource Graph, Defender for Cloud",           docsUrl:"#", featured:true  },
  { id:"gcp",           name:"Google Cloud Platform",     category:"Cloud",      authType:"oauth2",      logoColor:"#4285F4", logoInitial:"G", capabilities:["cspm","asset-discovery","gke","audit-logging"],                 description:"GCP projects, SCC findings, Pub/Sub events, GKE security",          docsUrl:"#", featured:true  },
  { id:"oracle-cloud",  name:"Oracle Cloud",              category:"Cloud",      authType:"api-key",     logoColor:"#F80000", logoInitial:"O", capabilities:["cspm","asset-discovery","oci-iam"],                              description:"OCI compartments, IAM policies, audit events",                       docsUrl:"#", featured:false },
  { id:"alibaba-cloud", name:"Alibaba Cloud",             category:"Cloud",      authType:"api-key",     logoColor:"#FF6A00", logoInitial:"A", capabilities:["cspm","asset-discovery"],                                        description:"Alibaba Cloud RAM, OSS, ECS security posture",                       docsUrl:"#", featured:false },
  { id:"digitalocean",  name:"DigitalOcean",              category:"Cloud",      authType:"api-key",     logoColor:"#0080FF", logoInitial:"D", capabilities:["cspm","asset-discovery"],                                        description:"Droplets, Spaces, Kubernetes — posture & inventory",                docsUrl:"#", featured:false },
  { id:"ibm-cloud",     name:"IBM Cloud",                 category:"Cloud",      authType:"api-key",     logoColor:"#0F62FE", logoInitial:"I", capabilities:["cspm","asset-discovery","iam-analysis"],                         description:"IBM Cloud IAM, Security & Compliance Center",                        docsUrl:"#", featured:false },
  { id:"linode",        name:"Linode / Akamai Cloud",     category:"Cloud",      authType:"api-key",     logoColor:"#00B050", logoInitial:"L", capabilities:["cspm","asset-discovery"],                                        description:"Linode instances, object storage, Kubernetes clusters",              docsUrl:"#", featured:false },
  // Identity (IAM)
  { id:"okta",          name:"Okta",                      category:"Identity",   authType:"oauth2",      logoColor:"#007DC1", logoInitial:"O", capabilities:["sso","mfa","user-lifecycle","group-sync"],                       description:"User provisioning, SSO sessions, MFA policy, groups",               docsUrl:"#", featured:true  },
  { id:"entra-id",      name:"Microsoft Entra ID",        category:"Identity",   authType:"oauth2",      logoColor:"#0078D4", logoInitial:"E", capabilities:["sso","mfa","conditional-access","pim","risky-users"],             description:"Entra ID users, PIM roles, Conditional Access, sign-in risk",       docsUrl:"#", featured:true  },
  { id:"active-directory",name:"Active Directory",        category:"Identity",   authType:"certificate", logoColor:"#0078D4", logoInitial:"⊞", capabilities:["ad-inventory","gpo","kerberos","privileged-accounts"],            description:"On-prem AD: users, computers, GPOs, privilege paths",               docsUrl:"#", featured:true  },
  { id:"google-workspace",name:"Google Workspace",        category:"Identity",   authType:"oauth2",      logoColor:"#4285F4", logoInitial:"G", capabilities:["sspm","user-lifecycle","drive-dlp","gmail-security"],             description:"Workspace users, Drive sharing, Gmail security settings",           docsUrl:"#", featured:true  },
  { id:"onelogin",      name:"OneLogin",                  category:"Identity",   authType:"oauth2",      logoColor:"#003580", logoInitial:"O", capabilities:["sso","user-lifecycle","mfa"],                                    description:"SSO, user lifecycle, MFA enforcement via OneLogin",                 docsUrl:"#", featured:false },
  { id:"pingidentity",  name:"PingIdentity",              category:"Identity",   authType:"oauth2",      logoColor:"#E1001A", logoInitial:"P", capabilities:["sso","mfa","user-lifecycle"],                                    description:"PingFederate, PingOne SSO and MFA",                                docsUrl:"#", featured:false },
  { id:"auth0",         name:"Auth0",                     category:"Identity",   authType:"oauth2",      logoColor:"#EB5424", logoInitial:"A", capabilities:["sso","mfa","user-lifecycle","anomaly-detection"],                 description:"Auth0 tenant users, log streams, anomaly detection",                docsUrl:"#", featured:false },
  { id:"duo-security",  name:"Duo Security",              category:"Identity",   authType:"api-key",     logoColor:"#6BBD45", logoInitial:"D", capabilities:["mfa","device-trust","access-policy"],                             description:"MFA events, device trust, bypass codes, user groups",               docsUrl:"#", featured:false },
  { id:"sailpoint",     name:"SailPoint IIQ",             category:"Identity",   authType:"oauth2",      logoColor:"#006CB7", logoInitial:"S", capabilities:["iam-governance","access-review","role-mining"],                   description:"Identity governance, access certification, role mining",             docsUrl:"#", featured:false },
  { id:"forgerock",     name:"ForgeRock",                 category:"Identity",   authType:"oauth2",      logoColor:"EF5B25",  logoInitial:"F", capabilities:["sso","user-lifecycle","access-management"],                      description:"ForgeRock AM/IDM identity & access management",                     docsUrl:"#", featured:false },
  // EDR/XDR
  { id:"crowdstrike",   name:"CrowdStrike Falcon",        category:"EDR/XDR",    authType:"oauth2",      logoColor:"#E01B22", logoInitial:"C", capabilities:["edr","threat-intel","device-inventory","vulnerability-mgmt"],   description:"Falcon telemetry, detections, device inventory, Spotlight vuln",    docsUrl:"#", featured:true  },
  { id:"sentinelone",   name:"SentinelOne",               category:"EDR/XDR",    authType:"api-key",     logoColor:"#6C3EC5", logoInitial:"S", capabilities:["edr","threat-intel","device-inventory","rogue-detection"],      description:"Agents, detections, threats, device health, network quarantine",    docsUrl:"#", featured:true  },
  { id:"defender",      name:"Microsoft Defender XDR",    category:"EDR/XDR",    authType:"oauth2",      logoColor:"#0078D4", logoInitial:"D", capabilities:["edr","xdr","threat-intel","identity-protection"],                description:"Defender 365: endpoints, identity, email, cloud app alerts",        docsUrl:"#", featured:false },
  { id:"carbon-black",  name:"VMware Carbon Black",       category:"EDR/XDR",    authType:"api-key",     logoColor:"#007F00", logoInitial:"C", capabilities:["edr","threat-hunting","device-inventory"],                       description:"Carbon Black Cloud detections, watchlists, device telemetry",        docsUrl:"#", featured:false },
  { id:"symantec",      name:"Symantec Endpoint Security",category:"EDR/XDR",    authType:"api-key",     logoColor:"#FFD200", logoInitial:"S", capabilities:["edr","device-inventory","policy-compliance"],                    description:"Symantec EP detections, policy compliance, device inventory",        docsUrl:"#", featured:false },
  { id:"bitdefender",   name:"Bitdefender GravityZone",   category:"EDR/XDR",    authType:"api-key",     logoColor:"ED1C24",  logoInitial:"B", capabilities:["edr","device-inventory","patch-assessment"],                     description:"GravityZone incidents, device inventory, patch status",              docsUrl:"#", featured:false },
  { id:"sophos",        name:"Sophos Intercept X",        category:"EDR/XDR",    authType:"api-key",     logoColor:"#005CB9", logoInitial:"S", capabilities:["edr","threat-intel","device-inventory"],                         description:"Sophos Central alerts, devices, XDR detections",                    docsUrl:"#", featured:false },
  { id:"trendmicro",    name:"Trend Micro Vision One",    category:"EDR/XDR",    authType:"api-key",     logoColor:"#EE3124", logoInitial:"T", capabilities:["xdr","edr","threat-intel","attack-surface"],                     description:"Vision One detections, attack surface risk, response workflows",     docsUrl:"#", featured:false },
  { id:"eset-protect",  name:"ESET PROTECT",              category:"EDR/XDR",    authType:"api-key",     logoColor:"#006DB7", logoInitial:"E", capabilities:["edr","device-inventory","policy-compliance"],                    description:"ESET PROTECT detections, managed devices, policy violations",       docsUrl:"#", featured:false },
  // PAM
  { id:"cyberark",      name:"CyberArk",                  category:"PAM",        authType:"certificate", logoColor:"#1A3A5C", logoInitial:"C", capabilities:["pam","privilege-access","session-recording","vault"],             description:"Privileged accounts, session recordings, vault policies",           docsUrl:"#", featured:true  },
  { id:"beyondtrust",   name:"BeyondTrust",               category:"PAM",        authType:"api-key",     logoColor:"#E5001C", logoInitial:"B", capabilities:["pam","privilege-access","remote-support","credential-vault"],    description:"PAM sessions, endpoint privilege mgmt, remote support audit",       docsUrl:"#", featured:true  },
  { id:"hashicorp-vault",name:"HashiCorp Vault",          category:"PAM",        authType:"certificate", logoColor:"#000000", logoInitial:"V", capabilities:["secret-mgmt","pki","dynamic-credentials","audit-log"],           description:"Secrets engine, PKI, dynamic credentials, audit device",            docsUrl:"#", featured:false },
  { id:"delinea",       name:"Delinea Secret Server",     category:"PAM",        authType:"api-key",     logoColor:"#0066CC", logoInitial:"D", capabilities:["pam","privilege-access","session-recording"],                    description:"Secret Server vaults, check-out policies, session recording",        docsUrl:"#", featured:false },
  // ITSM
  { id:"jira",          name:"Jira",                      category:"ITSM",       authType:"oauth2",      logoColor:"#0052CC", logoInitial:"J", capabilities:["ticketing","workflow","sla-tracking","sprint-data"],              description:"Issues, projects, epics, SLA tracking, sprint velocity",            docsUrl:"#", featured:true  },
  { id:"servicenow",    name:"ServiceNow",                category:"ITSM",       authType:"oauth2",      logoColor:"#81B5A1", logoInitial:"S", capabilities:["itsm","cmdb","change-mgmt","incident","problem"],                 description:"ITSM: incidents, changes, CMDB CIs, problem records",               docsUrl:"#", featured:true  },
  { id:"freshservice",  name:"Freshservice",              category:"ITSM",       authType:"api-key",     logoColor:"#32A960", logoInitial:"F", capabilities:["ticketing","cmdb","change-mgmt"],                                 description:"Freshservice tickets, CMDB, change advisory board",                 docsUrl:"#", featured:false },
  { id:"bmc-remedy",    name:"BMC Helix / Remedy",        category:"ITSM",       authType:"basic",       logoColor:"#E30D13", logoInitial:"B", capabilities:["itsm","cmdb","change-mgmt"],                                     description:"Remedy incidents, change requests, CMDB asset records",              docsUrl:"#", featured:false },
  { id:"zendesk",       name:"Zendesk",                   category:"ITSM",       authType:"api-key",     logoColor:"#03363D", logoInitial:"Z", capabilities:["ticketing","customer-support","sla-tracking"],                   description:"Zendesk tickets, SLAs, customer satisfaction scores",               docsUrl:"#", featured:false },
  { id:"linear",        name:"Linear",                    category:"ITSM",       authType:"oauth2",      logoColor:"#5E6AD2", logoInitial:"L", capabilities:["ticketing","sprint-data","workflow"],                              description:"Linear issues, cycles, projects, team velocity",                    docsUrl:"#", featured:false },
  { id:"monday",        name:"Monday.com",                category:"ITSM",       authType:"oauth2",      logoColor:"#FF3D57", logoInitial:"M", capabilities:["project-mgmt","workflow"],                                        description:"Monday boards, items, automations, project tracking",               docsUrl:"#", featured:false },
  // DevSecOps
  { id:"github",        name:"GitHub",                    category:"DevSecOps",  authType:"oauth2",      logoColor:"#24292F", logoInitial:"⌥", capabilities:["code-scanning","secret-scanning","dependabot","audit-log"],       description:"Code scanning, secret detection, Dependabot, org audit log",        docsUrl:"#", featured:true  },
  { id:"gitlab",        name:"GitLab",                    category:"DevSecOps",  authType:"oauth2",      logoColor:"#FC6D26", logoInitial:"G", capabilities:["sast","dast","secret-detection","container-scanning"],           description:"GitLab SAST/DAST, container scanning, dependency scanning",         docsUrl:"#", featured:true  },
  { id:"bitbucket",     name:"Bitbucket",                 category:"DevSecOps",  authType:"oauth2",      logoColor:"#0052CC", logoInitial:"B", capabilities:["code-scanning","audit-log","pipeline-data"],                     description:"Bitbucket pipelines, code insights, audit events",                  docsUrl:"#", featured:false },
  { id:"jenkins",       name:"Jenkins",                   category:"DevSecOps",  authType:"api-key",     logoColor:"#D33833", logoInitial:"J", capabilities:["pipeline-data","build-metrics","plugin-audit"],                  description:"Pipeline runs, build history, plugin security audit",               docsUrl:"#", featured:false },
  { id:"azure-devops",  name:"Azure DevOps",              category:"DevSecOps",  authType:"oauth2",      logoColor:"#0078D4", logoInitial:"A", capabilities:["pipeline-data","code-scanning","work-items","audit-log"],         description:"ADO pipelines, work items, SAST scans, org audit log",              docsUrl:"#", featured:false },
  { id:"sonarqube",     name:"SonarQube",                 category:"DevSecOps",  authType:"api-key",     logoColor:"#4E9BCD", logoInitial:"S", capabilities:["sast","code-quality","vulnerability-detection"],                 description:"SonarQube quality gate, SAST findings, tech debt metrics",          docsUrl:"#", featured:false },
  { id:"snyk",          name:"Snyk",                      category:"DevSecOps",  authType:"api-key",     logoColor:"#4C4A73", logoInitial:"S", capabilities:["sca","container-scanning","iac-scanning","code-scanning"],       description:"Snyk Open Source, Container, IaC, Code vulnerabilities",            docsUrl:"#", featured:false },
  { id:"checkmarx",     name:"Checkmarx",                 category:"DevSecOps",  authType:"api-key",     logoColor:"#FF6B35", logoInitial:"C", capabilities:["sast","sca","api-security"],                                     description:"SAST, SCA, API security findings from Checkmarx One",               docsUrl:"#", featured:false },
  { id:"veracode",      name:"Veracode",                  category:"DevSecOps",  authType:"api-key",     logoColor:"#00B4E3", logoInitial:"V", capabilities:["sast","dast","sca"],                                             description:"Veracode policy scans, SCA, DAST results",                          docsUrl:"#", featured:false },
  { id:"aqua-security", name:"Aqua Security",             category:"DevSecOps",  authType:"api-key",     logoColor:"#00ADEF", logoInitial:"A", capabilities:["container-scanning","kubernetes-security","runtime"],             description:"Aqua container & Kubernetes security, runtime policies",             docsUrl:"#", featured:false },
  { id:"terraform",     name:"HashiCorp Terraform",       category:"DevSecOps",  authType:"api-key",     logoColor:"#7B42BC", logoInitial:"T", capabilities:["iac-scanning","drift-detection","state-audit"],                  description:"Terraform Cloud runs, IaC drift, workspace state audit",            docsUrl:"#", featured:false },
  { id:"argocd",        name:"ArgoCD",                    category:"DevSecOps",  authType:"api-key",     logoColor:"#EF7B4D", logoInitial:"A", capabilities:["gitops","deployment-audit","policy-compliance"],                  description:"ArgoCD application sync status, drift, deployment audit",           docsUrl:"#", featured:false },
  { id:"ansible",       name:"Ansible / AAP",             category:"DevSecOps",  authType:"api-key",     logoColor:"#EE0000", logoInitial:"A", capabilities:["automation-audit","playbook-compliance","configuration-drift"],      description:"Automation jobs, playbook audit, compliance drift detection",         docsUrl:"#", featured:false },
  // SIEM/SOAR
  { id:"splunk",        name:"Splunk",                    category:"SIEM/SOAR",  authType:"api-key",     logoColor:"#65A637", logoInitial:"S", capabilities:["siem","log-ingestion","correlation","alert-forwarding"],          description:"Splunk searches, notable events, indexes, alert actions",           docsUrl:"#", featured:true  },
  { id:"sentinel",      name:"Microsoft Sentinel",        category:"SIEM/SOAR",  authType:"oauth2",      logoColor:"#0078D4", logoInitial:"⊕", capabilities:["siem","soar","threat-intel","incident-mgmt"],                    description:"Sentinel incidents, analytics rules, threat intel, playbooks",       docsUrl:"#", featured:true  },
  { id:"qradar",        name:"IBM QRadar",                category:"SIEM/SOAR",  authType:"api-key",     logoColor:"#006699", logoInitial:"Q", capabilities:["siem","log-ingestion","offense-mgmt"],                           description:"QRadar offenses, log sources, custom rules, network activity",       docsUrl:"#", featured:false },
  { id:"elastic-siem",  name:"Elastic SIEM",              category:"SIEM/SOAR",  authType:"api-key",     logoColor:"#FEC514", logoInitial:"E", capabilities:["siem","log-ingestion","edr-integration"],                        description:"Elastic alerts, cases, fleet enrolled agents",                       docsUrl:"#", featured:false },
  { id:"sumo-logic",    name:"Sumo Logic",                category:"SIEM/SOAR",  authType:"api-key",     logoColor:"#004A76", logoInitial:"S", capabilities:["siem","log-ingestion","cloud-siem"],                             description:"Sumo Logic Cloud SIEM signals, insights, entities",                 docsUrl:"#", featured:false },
  { id:"chronicle",     name:"Google Chronicle SIEM",     category:"SIEM/SOAR",  authType:"oauth2",      logoColor:"#4285F4", logoInitial:"C", capabilities:["siem","threat-intel","udm-events"],                              description:"Chronicle UDM events, YARA-L detections, threat intel",             docsUrl:"#", featured:false },
  { id:"logrhythm",     name:"LogRhythm",                 category:"SIEM/SOAR",  authType:"api-key",     logoColor:"#B7242A", logoInitial:"L", capabilities:["siem","log-ingestion","case-mgmt"],                             description:"LogRhythm alarms, cases, log source health",                        docsUrl:"#", featured:false },
  { id:"exabeam",       name:"Exabeam",                   category:"SIEM/SOAR",  authType:"api-key",     logoColor:"#2A4DAD", logoInitial:"E", capabilities:["ueba","siem","threat-hunting","session-timeline"],               description:"Exabeam UEBA risk scores, sessions, notable users",                 docsUrl:"#", featured:false },
  { id:"cortex-xsoar",  name:"Palo Alto XSOAR",           category:"SIEM/SOAR",  authType:"api-key",     logoColor:"#FA582D", logoInitial:"X", capabilities:["soar","playbooks","incident-mgmt"],                              description:"XSOAR incidents, playbook runs, war room, indicator ingestion",      docsUrl:"#", featured:false },
  { id:"datadog",       name:"Datadog",                   category:"SIEM/SOAR",  authType:"api-key",     logoColor:"#632CA6", logoInitial:"D", capabilities:["observability","siem","apm","log-mgmt"],                          description:"Datadog monitors, security signals, APM traces, logs",              docsUrl:"#", featured:false },
  { id:"new-relic",     name:"New Relic",                 category:"SIEM/SOAR",  authType:"api-key",     logoColor:"#00AC69", logoInitial:"N", capabilities:["observability","alert-mgmt","apm"],                               description:"New Relic alerts, violations, APM transactions",                    docsUrl:"#", featured:false },
  // Network
  { id:"paloalto",      name:"Palo Alto Networks",        category:"Network",    authType:"api-key",     logoColor:"#FA582D", logoInitial:"P", capabilities:["ngfw","threat-prevention","url-filtering","wildfire"],            description:"NGFW rules, threat logs, URL filtering, WildFire verdicts",         docsUrl:"#", featured:true  },
  { id:"cisco-stealthwatch",name:"Cisco Stealthwatch",    category:"Network",    authType:"api-key",     logoColor:"#00BCEB", logoInitial:"C", capabilities:["ndr","flow-analysis","threat-detection","network-behavior"],      description:"Flow data, security events, host groups, alarms",                   docsUrl:"#", featured:true  },
  { id:"zscaler",       name:"Zscaler",                   category:"Network",    authType:"api-key",     logoColor:"#005DAA", logoInitial:"Z", capabilities:["ztna","web-proxy","dlp","cloud-firewall"],                        description:"ZIA/ZPA events, DLP incidents, user activity, policy violations",    docsUrl:"#", featured:true  },
  { id:"fortinet",      name:"Fortinet FortiGate",        category:"Network",    authType:"api-key",     logoColor:"#EE3124", logoInitial:"F", capabilities:["ngfw","utm","vpn","sd-wan"],                                     description:"FortiGate traffic logs, IPS events, VPN sessions, UTM",             docsUrl:"#", featured:false },
  { id:"checkpoint",    name:"Check Point",               category:"Network",    authType:"api-key",     logoColor:"#CC0000", logoInitial:"C", capabilities:["ngfw","threat-prevention","vpn"],                                 description:"Check Point SmartConsole logs, threat prevention, VPN tunnels",      docsUrl:"#", featured:false },
  { id:"cisco-umbrella",name:"Cisco Umbrella",            category:"Network",    authType:"api-key",     logoColor:"#00BCEB", logoInitial:"U", capabilities:["dns-security","web-proxy","threat-intel"],                        description:"Umbrella DNS security events, proxy logs, threat intel",             docsUrl:"#", featured:false },
  { id:"cisco-meraki",  name:"Cisco Meraki",              category:"Network",    authType:"api-key",     logoColor:"#00BCEB", logoInitial:"M", capabilities:["network-inventory","event-log","client-tracking"],                description:"Meraki network events, client devices, security appliance logs",     docsUrl:"#", featured:false },
  { id:"f5-bigip",      name:"F5 BIG-IP",                 category:"Network",    authType:"api-key",     logoColor:"#E4003A", logoInitial:"F", capabilities:["waf","load-balancer","ssl-inspection"],                          description:"BIG-IP WAF events, AFM policies, ASM blocking logs",                docsUrl:"#", featured:false },
  { id:"juniper",              name:"Juniper Networks",           category:"Network",    authType:"api-key",  logoColor:"#84BD00", logoInitial:"J",  capabilities:["ngfw","sd-wan","network-inventory"],                                        description:"Juniper SRX security events, routing policy, network inventory",                               docsUrl:"#", featured:false },
  // Network Management Platforms — central management systems that hold config for entire firewall fleets
  { id:"fortinet-fortimanager",  name:"Fortinet FortiManager",      category:"Network",    authType:"basic",    logoColor:"#EE3124", logoInitial:"FM", capabilities:["ngfw-mgmt","policy-audit","config-pull","firmware-inventory"],                    description:"Central management platform — pull device configs, policy audits and firmware status across the entire FortiGate fleet",    docsUrl:"#", featured:true  },
  { id:"palo-alto-panorama",     name:"Palo Alto Panorama",         category:"Network",    authType:"api-key",  logoColor:"#FA582D", logoInitial:"PA", capabilities:["ngfw-mgmt","policy-audit","config-pull","log-forwarding"],                       description:"Panorama centralized management — device groups, security policies, log-collector configuration", docsUrl:"#", featured:true  },
  { id:"cisco-fmc",              name:"Cisco Firepower (FMC)",      category:"Network",    authType:"basic",    logoColor:"#00BCEB", logoInitial:"FP", capabilities:["ngfw-mgmt","policy-audit","config-pull","threat-intelligence"],                   description:"Firepower Management Center — FTD/ASA policies, intrusion rules, file/malware settings",         docsUrl:"#", featured:true  },
  { id:"sonicwall-nsm",          name:"SonicWall NSM",              category:"Network",    authType:"api-key",  logoColor:"#E04400", logoInitial:"SW", capabilities:["ngfw-mgmt","policy-audit","config-pull"],                                         description:"Network Security Manager — centralized SonicWall device management, policy and reporting",        docsUrl:"#", featured:false },
  { id:"juniper-space",          name:"Juniper Space",              category:"Network",    authType:"basic",    logoColor:"#84BD00", logoInitial:"JS", capabilities:["ngfw-mgmt","policy-audit","config-pull","network-inventory"],                      description:"Juniper Space Network Management Platform — SRX device inventory, security policies, scripts",    docsUrl:"#", featured:false },
  { id:"checkpoint-smartconsole",name:"Check Point SmartConsole",   category:"Network",    authType:"api-key",  logoColor:"#CC0000", logoInitial:"CP", capabilities:["ngfw-mgmt","policy-audit","config-pull","threat-prevention"],                     description:"Check Point management API — policy layers, rule bases, objects and threat-prevention profiles",  docsUrl:"#", featured:false },
  // Vuln Mgmt
  { id:"tenable",       name:"Tenable.io",                category:"Vuln Mgmt",  authType:"api-key",     logoColor:"#00B4E3", logoInitial:"T", capabilities:["vulnerability-scan","asset-discovery","compliance-audit"],        description:"Vulnerability scans, asset tracking, web app scanning",             docsUrl:"#", featured:true  },
  { id:"qualys",        name:"Qualys VMDR",               category:"Vuln Mgmt",  authType:"api-key",     logoColor:"#ED1C24", logoInitial:"Q", capabilities:["vulnerability-scan","asset-inventory","patch-mgmt","pc"],         description:"VMDR detections, asset inventory, PC audits, patch priority",       docsUrl:"#", featured:true  },
  { id:"rapid7",        name:"Rapid7 InsightVM",          category:"Vuln Mgmt",  authType:"api-key",     logoColor:"#E2231A", logoInitial:"R", capabilities:["vulnerability-scan","remediation-tracking","asset-risk"],         description:"InsightVM vulnerabilities, remediation projects, risk scoring",      docsUrl:"#", featured:true  },
  { id:"wiz",           name:"Wiz",                       category:"Vuln Mgmt",  authType:"oauth2",      logoColor:"#00B4E0", logoInitial:"W", capabilities:["cspm","vulnerability-scan","iac-scanning","ciem"],                description:"Wiz issues, cloud attack paths, CIEM, IaC misconfigurations",       docsUrl:"#", featured:false },
  { id:"lacework",      name:"Lacework",                  category:"Vuln Mgmt",  authType:"api-key",     logoColor:"#3B1D8E", logoInitial:"L", capabilities:["cspm","vulnerability-scan","runtime-security","anomaly"],         description:"Lacework cloud security, runtime anomalies, container vuln",         docsUrl:"#", featured:false },
  { id:"orca-security", name:"Orca Security",             category:"Vuln Mgmt",  authType:"api-key",     logoColor:"#FF5A00", logoInitial:"O", capabilities:["cspm","vulnerability-scan","attack-path","data-security"],        description:"Orca agentless cloud scanning, risk priorities, attack paths",       docsUrl:"#", featured:false },
  { id:"nessus",        name:"Nessus Professional",       category:"Vuln Mgmt",  authType:"api-key",     logoColor:"#00B4E3", logoInitial:"N", capabilities:["vulnerability-scan","compliance-audit","credentialed-scan"],      description:"Nessus vulnerability detections, plugin families, compliance checks",docsUrl:"#", featured:false },
  { id:"openvas",       name:"Greenbone / OpenVAS",       category:"Vuln Mgmt",  authType:"api-key",     logoColor:"#4CAF50", logoInitial:"G", capabilities:["vulnerability-scan","open-source"],                               description:"Open-source vulnerability scanning via Greenbone Community Edition", docsUrl:"#", featured:false },
  // SaaS
  { id:"slack",         name:"Slack",                     category:"SaaS",       authType:"oauth2",      logoColor:"#4A154B", logoInitial:"S", capabilities:["sspm","dlp","data-access","workspace-audit"],                     description:"Slack audit logs, DLP events, app access, message retention",       docsUrl:"#", featured:true  },
  { id:"m365",          name:"Microsoft 365",             category:"SaaS",       authType:"oauth2",      logoColor:"#0078D4", logoInitial:"M", capabilities:["sspm","dlp","email-security","sharepoint","teams"],               description:"M365 security score, DLP, Exchange ATP, Teams activity",            docsUrl:"#", featured:true  },
  { id:"zoom",          name:"Zoom",                      category:"SaaS",       authType:"oauth2",      logoColor:"#2D8CFF", logoInitial:"Z", capabilities:["sspm","recording-security","meeting-audit"],                     description:"Zoom operations log, recording access, account security settings",   docsUrl:"#", featured:true  },
  { id:"salesforce",    name:"Salesforce",                category:"SaaS",       authType:"oauth2",      logoColor:"#00A1E0", logoInitial:"S", capabilities:["sspm","dlp","user-activity","field-audit"],                       description:"Salesforce Event Monitoring, field audit trail, setup audit",        docsUrl:"#", featured:true  },
  { id:"hubspot",       name:"HubSpot",                   category:"SaaS",       authType:"oauth2",      logoColor:"#FF7A59", logoInitial:"H", capabilities:["sspm","crm-audit","data-access"],                                 description:"HubSpot activity log, data exports, user permissions",               docsUrl:"#", featured:false },
  { id:"box",           name:"Box",                       category:"SaaS",       authType:"oauth2",      logoColor:"#0061D5", logoInitial:"B", capabilities:["sspm","dlp","file-sharing-audit"],                                description:"Box events, external sharing, DLP policies, user activity",          docsUrl:"#", featured:false },
  { id:"dropbox",       name:"Dropbox Business",          category:"SaaS",       authType:"oauth2",      logoColor:"#0061FE", logoInitial:"D", capabilities:["sspm","file-sharing-audit","data-access"],                       description:"Dropbox team activity, sharing links, external user access",         docsUrl:"#", featured:false },
  { id:"confluence",    name:"Atlassian Confluence",      category:"SaaS",       authType:"oauth2",      logoColor:"#0052CC", logoInitial:"C", capabilities:["sspm","knowledge-mgmt","audit-log"],                              description:"Confluence spaces, page access, audit log, data residency",          docsUrl:"#", featured:false },
  { id:"notion",        name:"Notion",                    category:"SaaS",       authType:"oauth2",      logoColor:"#000000", logoInitial:"N", capabilities:["sspm","workspace-audit","data-access"],                           description:"Notion audit log, page access, member permissions",                 docsUrl:"#", featured:false },
  { id:"docusign",      name:"DocuSign",                  category:"SaaS",       authType:"oauth2",      logoColor:"#FFB400", logoInitial:"D", capabilities:["sspm","envelope-audit","user-activity"],                         description:"DocuSign envelope audit, user activity, credential usage",           docsUrl:"#", featured:false },
  // Data / Analytics
  { id:"snowflake",     name:"Snowflake",                 category:"Data",       authType:"oauth2",      logoColor:"#29B5E8", logoInitial:"❄", capabilities:["dspm","query-audit","access-history","governance"],               description:"Snowflake access history, GRANT audit, object tagging, data sharing",docsUrl:"#", featured:true  },
  { id:"databricks",    name:"Databricks",                category:"Data",       authType:"oauth2",      logoColor:"#FF3621", logoInitial:"◆", capabilities:["dspm","cluster-audit","data-lineage","access-control"],           description:"Databricks audit log, cluster activity, data lineage, permissions",  docsUrl:"#", featured:true  },
  { id:"tableau",       name:"Tableau",                   category:"Data",       authType:"api-key",     logoColor:"#E8762D", logoInitial:"T", capabilities:["sspm","data-access","report-audit"],                              description:"Tableau content access, user activity, permissions audit",           docsUrl:"#", featured:false },
  { id:"powerbi",       name:"Microsoft Power BI",        category:"Data",       authType:"oauth2",      logoColor:"#F2C80F", logoInitial:"P", capabilities:["sspm","data-access","workspace-audit"],                           description:"Power BI activity log, workspace access, dataset lineage",           docsUrl:"#", featured:false },
  // HR & People
  { id:"workday",       name:"Workday",                   category:"HR & People",authType:"oauth2",      logoColor:"#F5821F", logoInitial:"W", capabilities:["hr-sync","user-provisioning","joiner-mover-leaver"],              description:"Workday workers, joiner/mover/leaver triggers, org structure",       docsUrl:"#", featured:false },
  { id:"bamboohr",      name:"BambooHR",                  category:"HR & People",authType:"api-key",     logoColor:"#73C41D", logoInitial:"B", capabilities:["hr-sync","user-provisioning","offboarding"],                     description:"BambooHR employee directory, offboarding triggers, org data",        docsUrl:"#", featured:false },
  { id:"adp",           name:"ADP Workforce Now",         category:"HR & People",authType:"oauth2",      logoColor:"#CC0000", logoInitial:"A", capabilities:["hr-sync","user-provisioning","payroll-audit"],                   description:"ADP worker data, employment status, payroll period audit",           docsUrl:"#", featured:false },
  { id:"sap-sf",        name:"SAP SuccessFactors",        category:"HR & People",authType:"oauth2",      logoColor:"#0070C0", logoInitial:"S", capabilities:["hr-sync","user-provisioning","learning-completion"],              description:"SuccessFactors employees, learning completions, org hierarchy",       docsUrl:"#", featured:false },
  { id:"rippling",      name:"Rippling",                  category:"HR & People",authType:"api-key",     logoColor:"#F7C844", logoInitial:"R", capabilities:["hr-sync","user-provisioning","device-mgmt","app-mgmt"],          description:"Rippling employees, app provisioning, device management",            docsUrl:"#", featured:false },
  // Additional Cloud
  { id:"prisma-cloud",  name:"Palo Alto Prisma Cloud",    category:"Cloud",      authType:"api-key",     logoColor:"#FA582D", logoInitial:"P", capabilities:["cspm","vulnerability-scan","iac-scanning","code-security"],          description:"Prisma Cloud CSPM, container security, IaC scanning, code security",docsUrl:"#", featured:false },
  { id:"cloudflare",    name:"Cloudflare",                category:"Network",    authType:"api-key",     logoColor:"#F48120", logoInitial:"C", capabilities:["waf","ddos-protection","dns-security","zero-trust","audit-log"],    description:"Cloudflare WAF events, DDoS protection, DNS analytics, Zero Trust",  docsUrl:"#", featured:false },
  { id:"dynatrace",     name:"Dynatrace",                 category:"SIEM/SOAR",  authType:"api-key",     logoColor:"#1496FF", logoInitial:"D", capabilities:["observability","apm","log-mgmt","security-analytics"],               description:"Dynatrace Application Security, log management, AI anomaly detection",docsUrl:"#", featured:false },
  { id:"dbt-cloud",     name:"dbt Cloud",                 category:"Data",       authType:"api-key",     logoColor:"#FF694A", logoInitial:"d", capabilities:["dspm","data-lineage","transformation-audit"],                        description:"dbt Cloud run history, exposure audit, data lineage metadata",        docsUrl:"#", featured:false },
  { id:"greenhouse",    name:"Greenhouse",                category:"HR & People",authType:"api-key",     logoColor:"#24A47F", logoInitial:"G", capabilities:["hr-sync","joiner-mover-leaver","hiring-audit"],                      description:"Greenhouse hiring pipeline, offer events, employee start dates",      docsUrl:"#", featured:false },
];

class IntegrationHubService {
  private connections = new Map<string, Connection>();
  private metrics = new Map<string, PipelineMetric[]>();
  private webhooks = new Map<string, WebhookConfig>();
  private deliveryLogs = new Map<string, DeliveryLog[]>();

  constructor() {
    this._seed();
  }

  // ── Connector registry ──────────────────────────────────────────────────────

  getConnectors(category?: ConnectorCategory): ConnectorDef[] {
    if (category) return CONNECTORS.filter(c => c.category === category);
    return CONNECTORS;
  }

  getConnector(id: string): ConnectorDef | null {
    return CONNECTORS.find(c => c.id === id) ?? null;
  }

  // ── Connection management ───────────────────────────────────────────────────

  getConnections(tenantId: string): Connection[] {
    return Array.from(this.connections.values()).filter(c => c.tenantId === tenantId);
  }

  getConnection(tenantId: string, connectionId: string): Connection | null {
    const c = this.connections.get(connectionId);
    return c?.tenantId === tenantId ? c : null;
  }

  createConnection(tenantId: string, connectorId: string): Connection | null {
    const def = this.getConnector(connectorId);
    if (!def) return null;
    const id = randomUUID();
    const conn: Connection = {
      id,
      tenantId,
      connectorId,
      connectorName: def.name,
      category: def.category,
      status: "connected",
      syncSchedule: "0 */1 * * *",
      lastSync: null,
      nextSync: new Date(Date.now() + 3_600_000).toISOString(),
      assetsIngested: 0,
      eventsIngested: 0,
      errorCount: 0,
      createdAt: new Date().toISOString(),
      tokenData: null,
    };
    this.connections.set(id, conn);
    eventBus.publish("integration.connection.created", { connectionId: id, connectorId, connectorName: def.name }, Number(tenantId));
    return conn;
  }

  updateConnection(tenantId: string, connectionId: string, updates: Partial<Connection>): Connection | null {
    const conn = this.getConnection(tenantId, connectionId);
    if (!conn) return null;
    Object.assign(conn, updates);
    return conn;
  }

  deleteConnection(tenantId: string, connectionId: string): boolean {
    const conn = this.getConnection(tenantId, connectionId);
    if (!conn) return false;
    this.connections.delete(connectionId);
    return true;
  }

  triggerSync(tenantId: string, connectionId: string): Connection | null {
    const conn = this.getConnection(tenantId, connectionId);
    if (!conn) return null;
    conn.lastSync = new Date().toISOString();
    conn.nextSync = new Date(Date.now() + 3_600_000).toISOString();
    conn.status = "connected";
    conn.assetsIngested += Math.floor(Math.random() * 50) + 1;
    conn.eventsIngested += Math.floor(Math.random() * 200) + 10;
    eventBus.publish("integration.sync.completed", {
      connectionId,
      connectorId: conn.connectorId,
      connectorName: conn.connectorName,
      assetsIngested: conn.assetsIngested,
      eventsIngested: conn.eventsIngested,
    }, Number(tenantId));
    return conn;
  }

  // ── Pipeline metrics ────────────────────────────────────────────────────────

  getMetrics(tenantId: string): PipelineMetric[] {
    return Array.from(this.metrics.values())
      .flat()
      .filter(m => {
        const conn = Array.from(this.connections.values())
          .find(c => c.tenantId === tenantId && c.connectorId === m.connectorId);
        return !!conn;
      });
  }

  // ── Webhooks ────────────────────────────────────────────────────────────────

  getWebhooks(tenantId: string): WebhookConfig[] {
    return Array.from(this.webhooks.values()).filter(w => w.tenantId === tenantId);
  }

  createWebhook(tenantId: string, config: Omit<WebhookConfig, "id" | "tenantId" | "signingSecret" | "createdAt">): WebhookConfig {
    const id = randomUUID();
    const webhook: WebhookConfig = {
      ...config,
      id,
      tenantId,
      signingSecret: this._generateSecret(),
      createdAt: new Date().toISOString(),
    };
    this.webhooks.set(id, webhook);
    return webhook;
  }

  updateWebhook(tenantId: string, webhookId: string, updates: Partial<WebhookConfig>): WebhookConfig | null {
    const wh = this.webhooks.get(webhookId);
    if (!wh || wh.tenantId !== tenantId) return null;
    Object.assign(wh, updates);
    return wh;
  }

  deleteWebhook(tenantId: string, webhookId: string): boolean {
    const wh = this.webhooks.get(webhookId);
    if (!wh || wh.tenantId !== tenantId) return false;
    this.webhooks.delete(webhookId);
    return true;
  }

  getDeliveryLog(tenantId: string, webhookId: string): DeliveryLog[] {
    const wh = this.webhooks.get(webhookId);
    if (!wh || wh.tenantId !== tenantId) return [];
    return this.deliveryLogs.get(webhookId) ?? [];
  }

  // ── Encrypted token storage ─────────────────────────────────────────────────

  /**
   * Encrypt and persist an OAuth/API token payload for a connection.
   * `tokenPayload` should be a JSON string containing the token fields
   * (access_token, refresh_token, expiry, etc.).
   */
  storeToken(tenantId: string, connectionId: string, tokenPayload: string): boolean {
    const conn = this.getConnection(tenantId, connectionId);
    if (!conn) return false;
    conn.tokenData = encryptToken(tokenPayload);
    return true;
  }

  /**
   * Decrypt and return the stored token payload for a connection.
   * Returns null if no token is stored or the connection is not found.
   */
  getToken(tenantId: string, connectionId: string): string | null {
    const conn = this.getConnection(tenantId, connectionId);
    if (!conn || !conn.tokenData) return null;
    return decryptToken(conn.tokenData);
  }

  /**
   * Encrypt and store the credential config (api key, client id, etc.) for a connection.
   */
  storeConnectionConfig(tenantId: string, connectionId: string, config: Record<string, string>): boolean {
    return this.storeToken(tenantId, connectionId, JSON.stringify(config));
  }

  /**
   * Mark a connection as successfully connected and update ingested counters.
   */
  markConnected(tenantId: string, connectionId: string, ingested: { risks: number; findings: number; controls: number; tickets: number; assets: number }): Connection | null {
    const conn = this.getConnection(tenantId, connectionId);
    if (!conn) return null;
    conn.status    = "connected";
    conn.lastSync  = new Date().toISOString();
    conn.nextSync  = new Date(Date.now() + 3_600_000).toISOString();
    conn.assetsIngested  += ingested.assets;
    conn.eventsIngested  += ingested.risks + ingested.findings + ingested.controls + ingested.tickets;
    return conn;
  }

  // ── Stats ───────────────────────────────────────────────────────────────────

  getStats(tenantId: string) {
    const conns = this.getConnections(tenantId);
    const byCategory: Record<string, number> = {};
    for (const c of conns) {
      byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;
    }
    return {
      totalConnectors: CONNECTORS.length,
      connected: conns.filter(c => c.status === "connected").length,
      partial: conns.filter(c => c.status === "partial").length,
      warning: conns.filter(c => c.status === "warning").length,
      error: conns.filter(c => c.status === "error").length,
      totalAssetsIngested: conns.reduce((s, c) => s + c.assetsIngested, 0),
      totalEventsIngested: conns.reduce((s, c) => s + c.eventsIngested, 0),
      byCategory,
      webhooks: this.getWebhooks(tenantId).length,
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private _generateSecret(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  }

  private _seed() {
    const connected: Array<[string, ConnectionStatus, number, number]> = [
      ["m365",         "connected", 1203, 45230],
      ["aws",          "connected", 634,  28410],
      ["azure",        "partial",   412,  19870],
      ["google-workspace","connected",312, 12340],
      ["github",       "connected", 287,  8920],
      ["okta",         "connected", 847,  33100],
      ["jira",         "connected", 0,    4120],
      ["splunk",       "connected", 0,    89200],
      ["crowdstrike",  "connected", 2341, 156300],
      ["sentinelone",  "partial",   1102, 78400],
      ["tenable",      "connected", 589,  21300],
      ["qualys",       "warning",   421,  18700],
      ["cisco-meraki", "connected", 112,  6800],
      ["paloalto",     "connected", 28,   14200],
      ["servicenow",   "partial",   0,    3200],
      ["salesforce",   "connected", 0,    9100],
      ["snowflake",    "connected", 0,    5600],
      ["slack",        "connected", 0,    28900],
      ["sentinel",     "connected", 0,    67400],
      ["cyberark",     "connected", 0,    4300],
    ];

    const eventTypes = ["asset.discovered","finding.created","risk.changed","incident.created","user.created","policy.violated"];

    for (const [connectorId, status, assets, events] of connected) {
      const def = CONNECTORS.find(c => c.id === connectorId);
      if (!def) continue;
      const id = randomUUID();
      const minsAgo = Math.floor(Math.random() * 60) + 1;
      this.connections.set(id, {
        id,
        tenantId: "1",
        connectorId,
        connectorName: def.name,
        category: def.category,
        status,
        syncSchedule: "0 */1 * * *",
        lastSync: new Date(Date.now() - minsAgo * 60_000).toISOString(),
        nextSync: new Date(Date.now() + (60 - minsAgo) * 60_000).toISOString(),
        assetsIngested: assets,
        eventsIngested: events,
        errorCount: status === "warning" ? Math.floor(Math.random() * 10) + 1 : status === "partial" ? 1 : 0,
        createdAt: new Date(Date.now() - Math.random() * 90 * 86400_000).toISOString(),
        tokenData: null,
      });

      const metricList: PipelineMetric[] = [];
      for (let d = 6; d >= 0; d--) {
        const date = new Date(Date.now() - d * 86400_000).toISOString().slice(0, 10);
        metricList.push({
          connectorId,
          connectorName: def.name,
          date,
          volumeIn: Math.floor(Math.random() * 5000) + 500,
          volumeOut: Math.floor(Math.random() * 4500) + 400,
          latencyP50Ms: Math.floor(Math.random() * 80) + 20,
          latencyP95Ms: Math.floor(Math.random() * 300) + 80,
          errorRate: status === "warning" ? Math.random() * 0.05 + 0.02 : Math.random() * 0.005,
          errors: status === "warning" ? [{ ts: new Date().toISOString(), code: "CONN_TIMEOUT", message: "Connection timeout after 30s" }] : [],
        });
      }
      this.metrics.set(connectorId, metricList);
    }

    const inboundId = randomUUID();
    this.webhooks.set(inboundId, {
      id: inboundId,
      tenantId: "1",
      direction: "inbound",
      name: "CrowdStrike Alerts Inbound",
      url: `/api/webhooks/inbound/${inboundId}`,
      signingSecret: this._generateSecret(),
      eventTypes: ["detection.summary", "incident.notification", "auth.activity"],
      retryPolicy: { maxAttempts: 3, backoffMs: 5000 },
      active: true,
      createdAt: new Date(Date.now() - 7 * 86400_000).toISOString(),
    });

    const outboundId = randomUUID();
    this.webhooks.set(outboundId, {
      id: outboundId,
      tenantId: "1",
      direction: "outbound",
      name: "JIRA Issue Creator",
      url: "https://acme.atlassian.net/rest/api/3/issue",
      signingSecret: this._generateSecret(),
      eventTypes: ["risk.critical", "finding.critical", "incident.created"],
      retryPolicy: { maxAttempts: 5, backoffMs: 10000 },
      active: true,
      createdAt: new Date(Date.now() - 14 * 86400_000).toISOString(),
    });

    const logs: DeliveryLog[] = [];
    const statusCodes = [200, 200, 200, 200, 200, 201, 500, 200, 200, 429];
    for (let i = 0; i < 20; i++) {
      const code = statusCodes[i % statusCodes.length]!;
      logs.push({
        id: randomUUID(),
        webhookId: outboundId,
        ts: new Date(Date.now() - i * 1800_000).toISOString(),
        event: eventTypes[i % eventTypes.length]!,
        statusCode: code,
        latencyMs: code === 500 ? 5000 : Math.floor(Math.random() * 200) + 50,
        payload: JSON.stringify({ event: eventTypes[i % eventTypes.length], data: { id: `EVT-${1000 + i}` } }),
        response: code === 200 || code === 201 ? '{"status":"ok"}' : '{"error":"Internal Server Error"}',
        success: code < 400,
      });
    }
    this.deliveryLogs.set(outboundId, logs);
  }
}

export const integrationHubService = new IntegrationHubService();
