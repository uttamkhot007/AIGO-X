export interface PolicyFinding {
  id: string;
  name: string;
  status: "pass" | "fail" | "warn";
  framework: string;
  severity: "Critical" | "High" | "Medium" | "Low";
}

export interface SecurityTool {
  name: string;
  running: boolean;
}

export interface ComplyOpsPayload {
  patch_level: number;
  policy_findings: PolicyFinding[];
  security_tools: SecurityTool[];
  baseline_score: number;
}

export interface HardwareInfo {
  cpu: string;
  ram_gb: number;
  disk_gb: number;
  serial?: string;
  model?: string;
  manufacturer?: string;
}

export interface SoftwareEntry {
  name: string;
  version: string;
  vendor: string;
  install_date?: string;
  cve_count: number;
}

export interface AssetOpsPayload {
  hardware: HardwareInfo;
  software: SoftwareEntry[];
}

export interface DataStore {
  path: string;
  type: string;
  record_count: number;
  classifications: Array<"PII" | "PHI" | "PCI" | "SECRET">;
  risk_level: "Critical" | "High" | "Medium" | "Low";
}

export interface DataOpsPayload {
  stores: DataStore[];
}

export interface CisControl {
  id: string;
  title: string;
  status: "pass" | "fail" | "warn";
  severity: "Critical" | "High" | "Medium" | "Low";
}

export interface CveEntry {
  id: string;
  cvss: number;
  severity: "Critical" | "High" | "Medium" | "Low";
  package: string;
  fixed_version?: string;
}

export interface SecOpsPayload {
  benchmark_id?: string;
  benchmark_name?: string;
  controls: CisControl[];
  cves: CveEntry[];
}

export interface IncidentEntry {
  type: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  description: string;
  timestamp: string;
  source_ip?: string;
}

export interface ChangeRequest {
  title: string;
  category: string;
  risk: "Critical" | "High" | "Medium" | "Low";
}

export interface ServiceOpsPayload {
  incidents: IncidentEntry[];
  change_requests: ChangeRequest[];
}

export interface PushRequest {
  agent_id: string;
  result_type: string;
  payload: unknown;
  checks_run?: number;
  checks_passed?: number;
  checks_failed?: number;
  score?: number;
  payload_signature?: string;
  ed25519_signature?: string;
}
