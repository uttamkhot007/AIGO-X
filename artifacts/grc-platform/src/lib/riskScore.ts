/**
 * computeRiskScore — universal risk scoring utility for GRC objects.
 * Returns a normalised score 0–100 (higher = riskier).
 */

export type RiskObjectType =
  | "asset"
  | "vulnerability"
  | "policy"
  | "control"
  | "vendor"
  | "user"
  | "framework"
  | "procedure"
  | "process"
  | "risk";

interface BaseScore {
  inherent:  number;
  residual?: number;
  impact?:   number;
  trend?:    "up" | "down" | "flat";
  label:     string;
  color:     string;
}

// Severity thresholds
const CRITICAL = 80, HIGH = 60, MEDIUM = 40;

export function scoreColor(s: number): string {
  return s >= CRITICAL ? "#DC2626" : s >= HIGH ? "#D97706" : s >= MEDIUM ? "#1D4ED8" : "#065F46";
}

export function scoreLabel(s: number): "Critical" | "High" | "Medium" | "Low" {
  return s >= CRITICAL ? "Critical" : s >= HIGH ? "High" : s >= MEDIUM ? "Medium" : "Low";
}

// ── Asset Risk ────────────────────────────────────────────────────────────────
interface AssetInput {
  criticality: "Critical" | "High" | "Medium" | "Low";
  exposureScore: number;
  openFindings: number;
  dataSensitivity: "Restricted" | "Confidential" | "Internal" | "Public";
  environment: "Production" | "Staging" | "Development" | "DR" | "Corporate";
}

export function computeAssetRisk(asset: AssetInput): BaseScore {
  const critWeight = asset.criticality === "Critical" ? 35 : asset.criticality === "High" ? 25 : asset.criticality === "Medium" ? 15 : 5;
  const dsWeight   = asset.dataSensitivity === "Restricted" ? 20 : asset.dataSensitivity === "Confidential" ? 15 : asset.dataSensitivity === "Internal" ? 8 : 2;
  const envWeight  = asset.environment === "Production" ? 15 : asset.environment === "DR" ? 12 : asset.environment === "Corporate" ? 10 : 5;
  const expWeight  = Math.round(asset.exposureScore * 0.2);
  const findWeight = Math.min(10, asset.openFindings * 2);
  const inherent   = Math.min(100, critWeight + dsWeight + envWeight + expWeight + findWeight);
  const residual   = Math.max(5, inherent - Math.round(10 / Math.max(1, asset.openFindings + 1)));
  return { inherent, residual, impact: critWeight + dsWeight, label: scoreLabel(inherent), color: scoreColor(inherent) };
}

// ── Vulnerability Risk ────────────────────────────────────────────────────────
interface VulnInput {
  cvssScore: number;
  exploitAvailable: boolean;
  daysOpen: number;
  affectedAssetCriticality: "Critical" | "High" | "Medium" | "Low";
  patchAvailable: boolean;
}

export function computeVulnerabilityRisk(vuln: VulnInput): BaseScore {
  const cvssW  = Math.round(vuln.cvssScore * 8);
  const exploitW  = vuln.exploitAvailable ? 15 : 0;
  const ageW   = Math.min(15, Math.round(vuln.daysOpen / 10));
  const assetW = vuln.affectedAssetCriticality === "Critical" ? 10 : vuln.affectedAssetCriticality === "High" ? 7 : 3;
  const inherent  = Math.min(100, cvssW + exploitW + ageW + assetW);
  const residual  = vuln.patchAvailable ? Math.max(5, inherent - 20) : inherent;
  return { inherent, residual, label: scoreLabel(inherent), color: scoreColor(inherent), trend: vuln.daysOpen > 30 ? "up" : "flat" };
}

// ── Policy Risk ───────────────────────────────────────────────────────────────
interface PolicyInput {
  impact: "Critical" | "High" | "Medium" | "Low";
  status: "active" | "in-review" | "draft" | "retired";
  daysSinceReview: number;
  acknowledgedPct: number;
}

export function computePolicyRisk(policy: PolicyInput): BaseScore {
  const impactW    = policy.impact === "Critical" ? 35 : policy.impact === "High" ? 25 : policy.impact === "Medium" ? 15 : 5;
  const statusW    = policy.status === "draft" ? 20 : policy.status === "in-review" ? 10 : 0;
  const ageW       = Math.min(20, Math.round(policy.daysSinceReview / 30) * 3);
  const ackGap     = Math.round((100 - policy.acknowledgedPct) * 0.25);
  const inherent   = Math.min(100, impactW + statusW + ageW + ackGap);
  const residual   = Math.max(5, inherent - (policy.status === "active" ? 15 : 0));
  return { inherent, residual, label: scoreLabel(inherent), color: scoreColor(inherent) };
}

// ── Control Risk ──────────────────────────────────────────────────────────────
interface ControlInput {
  status: "implemented" | "partial" | "not-started" | "retired";
  evidenceCount: number;
  riskSeverity: "Low" | "Medium" | "High";
  daysSinceTest: number;
}

export function computeControlRisk(control: ControlInput): BaseScore {
  const statusW = control.status === "not-started" ? 50 : control.status === "partial" ? 30 : 5;
  const evidW   = Math.max(0, 20 - control.evidenceCount * 3);
  const riskW   = control.riskSeverity === "High" ? 20 : control.riskSeverity === "Medium" ? 10 : 5;
  const ageW    = Math.min(15, Math.round(control.daysSinceTest / 60));
  const inherent = Math.min(100, statusW + evidW + riskW + ageW);
  const residual = Math.max(5, inherent - (control.status === "implemented" ? 20 : 0));
  return { inherent, residual, label: scoreLabel(inherent), color: scoreColor(inherent) };
}

// ── Vendor Risk ───────────────────────────────────────────────────────────────
interface VendorInput {
  tier: 1 | 2 | 3;
  assessmentScore: number;
  critical: boolean;
  daysSinceAssessment: number;
  dpaInPlace: boolean;
}

export function computeVendorRisk(vendor: VendorInput): BaseScore {
  const tierW  = vendor.tier === 1 ? 20 : vendor.tier === 2 ? 12 : 5;
  const scoreW = Math.round((100 - vendor.assessmentScore) * 0.4);
  const critW  = vendor.critical ? 15 : 0;
  const ageW   = Math.min(15, Math.round(vendor.daysSinceAssessment / 90) * 5);
  const dpaW   = vendor.dpaInPlace ? 0 : 10;
  const inherent = Math.min(100, tierW + scoreW + critW + ageW + dpaW);
  const residual = Math.max(5, inherent - (vendor.dpaInPlace ? 10 : 0));
  return { inherent, residual, label: scoreLabel(inherent), color: scoreColor(inherent), trend: vendor.daysSinceAssessment > 365 ? "up" : "flat" };
}

// ── Universal dispatcher ──────────────────────────────────────────────────────
export function computeRiskScore(objectType: RiskObjectType, input: Record<string, unknown>): BaseScore {
  switch (objectType) {
    case "asset":
      return computeAssetRisk(input as unknown as AssetInput);
    case "vulnerability":
      return computeVulnerabilityRisk(input as unknown as VulnInput);
    case "policy":
      return computePolicyRisk(input as unknown as PolicyInput);
    case "control":
      return computeControlRisk(input as unknown as ControlInput);
    case "vendor":
      return computeVendorRisk(input as unknown as VendorInput);
    default:
      // Generic fallback using riskScore if available
      if (typeof input["riskScore"] === "number") {
        const s = input["riskScore"] as number;
        return { inherent: s, label: scoreLabel(s), color: scoreColor(s) };
      }
      return { inherent: 50, label: "Medium", color: "#1D4ED8" };
  }
}
