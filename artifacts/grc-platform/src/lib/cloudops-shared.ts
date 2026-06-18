// ── CloudOps shared constants — single source of truth for CloudOps.tsx and Dashboard.tsx ──

export const ENT_TOTAL_RESOURCES = 0;
export const ENT_SCORE = 0;
export const ENT_CRITICAL = 0;
export const ENT_HIGH = 0;
export const ENT_MEDIUM = 0;
export const ENT_OPEN_FINDINGS = 0;
export const ENT_SCORE_WEEKLY: number[] = [];

// Derived cloud-risk metrics — zero until cloud integrations are connected
export const ENT_ATTACK_PATHS = 0;
export const ENT_SECRETS_EXPOSED = 0;

export const PROVIDER_RESOURCES: Record<string, number> = {
  AWS: 0,
  Azure: 0,
  GCP: 0,
};

// ── CSPM sampled findings — shared between CloudOps CSPM tab and Dashboard strip ──
export interface CspmFinding {
  id: string;
  resource: string;
  region: string;
  provider: "AWS" | "Azure" | "GCP";
  sev: "Critical" | "High" | "Medium" | "Low";
  rule: string;
  status: "open" | "in-remediation" | "resolved" | "suppressed";
  cat: string;
  lastSeen: string;
}

export const cspmFindings: CspmFinding[] = [];

// Derived per-provider counts — computed once, exported for use in Dashboard and CloudOps
export function getProviderCounts(findings: CspmFinding[] = cspmFindings) {
  const providers = ["AWS", "Azure", "GCP"] as const;
  return providers.map(p => ({
    p,
    crit: findings.filter(f => f.provider === p && f.sev === "Critical").length,
    high: findings.filter(f => f.provider === p && f.sev === "High").length,
    total: PROVIDER_RESOURCES[p],
  }));
}

// Top open critical findings for Dashboard
export const topOpenCritical = cspmFindings.filter(f => f.sev === "Critical" && f.status === "open").slice(0, 3);
