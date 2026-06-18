export interface HeatMapCell {
  likelihood: number; impact: number; score: number; color: string; riskIds: string[];
}
export interface MonteCarloResult {
  p50: number; p80: number; p95: number; distribution: { bucket: number; count: number }[];
  mean: number; stdDev: number; iterations: number;
}
export interface RiskCascade {
  parentId: string; childId: string;
  relationship: "triggers" | "amplifies" | "compounds";
  description: string;
}

const RISK_POSITIONS: Record<string, { likelihood: number; impact: number }> = {
  "RK-2041": { likelihood: 4, impact: 5 },
  "RK-2039": { likelihood: 4, impact: 4 },
  "RK-2037": { likelihood: 3, impact: 5 },
  "RK-2035": { likelihood: 3, impact: 3 },
  "RK-2033": { likelihood: 4, impact: 2 },
  "RK-2031": { likelihood: 2, impact: 3 },
  "RK-2029": { likelihood: 2, impact: 2 },
  "RK-2027": { likelihood: 1, impact: 2 },
};

function cellColor(score: number): string {
  if (score >= 16) return "#DC2626";
  if (score >= 10) return "#D97706";
  if (score >= 5)  return "#EAB308";
  return "#059669";
}

export class RiskService {
  buildHeatMap(riskList: { id: string }[]): HeatMapCell[] {
    const cells: HeatMapCell[] = [];
    for (let l = 1; l <= 5; l++) {
      for (let i = 1; i <= 5; i++) {
        const score = l * i;
        const riskIds = riskList
          .filter(r => { const pos = RISK_POSITIONS[r.id]; return pos && pos.likelihood === l && pos.impact === i; })
          .map(r => r.id);
        cells.push({ likelihood: l, impact: i, score, color: cellColor(score), riskIds });
      }
    }
    return cells;
  }

  getRiskPosition(riskId: string): { likelihood: number; impact: number } | null {
    return RISK_POSITIONS[riskId] ?? null;
  }

  runMonteCarlo(baseScore: number, riskId: string, iterations = 1000): MonteCarloResult {
    const pos = RISK_POSITIONS[riskId];
    const anchor = pos ? pos.likelihood * pos.impact : baseScore;
    const results: number[] = [];
    for (let k = 0; k < iterations; k++) {
      const v1 = (Math.random() - 0.5) * 2;
      const v2 = (Math.random() - 0.5) * 2;
      const variance = ((v1 + v2) / 2) * 0.4 * anchor;
      results.push(Math.max(0.1, Math.min(25, anchor + variance)));
    }
    results.sort((a, b) => a - b);
    const mean = results.reduce((s, v) => s + v, 0) / results.length;
    const variance = results.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / results.length;
    const stdDev = Math.sqrt(variance);
    const distribution = Array.from({ length: 10 }, (_, i) => ({
      bucket: i * 2.5 + 1.25,
      count: results.filter(v => v >= i * 2.5 && v < (i + 1) * 2.5).length,
    }));
    return {
      p50: Math.round(results[Math.floor(iterations * 0.5)]! * 10) / 10,
      p80: Math.round(results[Math.floor(iterations * 0.8)]! * 10) / 10,
      p95: Math.round(results[Math.floor(iterations * 0.95)]! * 10) / 10,
      mean: Math.round(mean * 10) / 10,
      stdDev: Math.round(stdDev * 10) / 10,
      iterations,
      distribution,
    };
  }
}

export const riskService = new RiskService();
