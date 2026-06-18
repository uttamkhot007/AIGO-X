export type AuditPhase = "initiation" | "planning" | "fieldwork" | "reporting" | "closure";
export type AuditStatus = "planned" | "in-progress" | "completed" | "on-hold" | "cancelled";
export type FindingStatus = "open" | "management-response" | "in-remediation" | "resolved" | "accepted";
export type FindingSeverity = "Critical" | "High" | "Medium" | "Low" | "Informational";

export interface AuditPlan {
  id: string; name: string; framework: string; type: "internal" | "external";
  auditor: string; lead: string; startDate: string; endDate: string;
  currentPhase: AuditPhase; status: AuditStatus; scope: string;
  phaseProgress: Record<AuditPhase, { pct: number; startDate: string; endDate: string }>;
  tenantId: string; createdAt: string; updatedAt: string;
}

export interface FindingResponse { text: string; respondedBy: string; respondedAt: string; }

export interface AuditFinding {
  id: string; auditId: string; title: string; control: string;
  severity: FindingSeverity; status: FindingStatus; owner: string;
  dueDate: string; description: string; recommendation?: string; category?: string;
  responses: FindingResponse[];
  evidenceRequired: boolean; createdAt: string; updatedAt: string;
}

export interface EvidenceRequest {
  id: string; auditId: string; control: string; description: string;
  requestedFrom: string; dueDate: string;
  status: "pending" | "submitted" | "accepted" | "rejected";
  type: string; submittedAt?: string; rejectionReason?: string;
  title?: string; collectedBy?: string;
  createdAt: string; updatedAt: string;
}

export class AuditService {}
export const auditService = new AuditService();
