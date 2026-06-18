use serde::{Deserialize, Serialize};
use crate::checks::{CheckResult, CheckSeverity};
use crate::hardening::HardeningAssessment;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ScoreCategory {
    Excellent,
    Good,
    Fair,
    Poor,
    Critical,
}

impl ScoreCategory {
    pub fn from_score(score: u32) -> Self {
        match score {
            90..=100 => ScoreCategory::Excellent,
            75..=89  => ScoreCategory::Good,
            60..=74  => ScoreCategory::Fair,
            40..=59  => ScoreCategory::Poor,
            _        => ScoreCategory::Critical,
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            ScoreCategory::Excellent => "Excellent",
            ScoreCategory::Good      => "Good",
            ScoreCategory::Fair      => "Fair",
            ScoreCategory::Poor      => "Poor",
            ScoreCategory::Critical  => "Critical",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EndpointScore {
    pub overall: u32,
    pub category: String,
    pub security_score: u32,
    pub hardening_score: u32,
    pub breakdown: ScoreBreakdown,
    pub trend: ScoreTrend,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoreBreakdown {
    pub checks_passed: u32,
    pub checks_failed: u32,
    pub checks_total: u32,
    pub critical_failures: u32,
    pub high_failures: u32,
    /// Weighted score denominator (sum of all check weights)
    pub weighted_total: u32,
    /// Weighted score numerator (sum of weights for passing checks)
    pub weighted_passed: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ScoreTrend {
    Increasing,
    Stable,
    Decreasing,
    Unknown,
}

const SECURITY_WEIGHT: f64 = 0.7;
const HARDENING_WEIGHT: f64 = 0.3;

#[derive(Debug, Default)]
pub struct ScoringEngine {
    history: Vec<u32>,
}

impl ScoringEngine {
    pub fn new() -> Self { Self::default() }

    /// Calculate a severity-weighted compliance score.
    ///
    /// Weighting:
    ///   Critical → 4 points
    ///   High     → 2 points
    ///   Medium   → 1 point
    ///   Low      → 1 point
    ///
    /// This means a single critical failure (e.g. disk encryption disabled) has 4×
    /// the impact on the score as a low-priority finding, matching real-world risk
    /// prioritisation rather than simple pass-count ratios.
    pub fn calculate(
        &mut self,
        checks: &[CheckResult],
        hardening: Option<&HardeningAssessment>,
    ) -> EndpointScore {
        // ── Counts ───────────────────────────────────────────────────────────
        let passed_count = checks.iter().filter(|c| c.status == "pass").count() as u32;
        let failed_count = checks.iter().filter(|c| c.status == "fail").count() as u32;
        let total_count  = checks.len() as u32;

        // ── Weighted sums ────────────────────────────────────────────────────
        let weighted_total: u32 = checks.iter()
            .filter(|c| c.status != "skip")
            .map(|c| c.severity.weight())
            .sum();

        let weighted_passed: u32 = checks.iter()
            .filter(|c| c.status == "pass")
            .map(|c| c.severity.weight())
            .sum();

        let security_score = if weighted_total > 0 {
            (weighted_passed * 100) / weighted_total
        } else {
            100
        };

        let hardening_score = hardening.map(|h| h.score).unwrap_or(security_score);

        let overall = ((security_score as f64 * SECURITY_WEIGHT)
            + (hardening_score as f64 * HARDENING_WEIGHT))
            .round() as u32;

        let trend = self.calculate_trend(overall);
        self.history.push(overall);
        if self.history.len() > 100 { self.history.remove(0); }

        // Separate critical/high failures for breakdown
        let critical_failures = checks.iter()
            .filter(|c| c.status == "fail" && c.severity == CheckSeverity::Critical)
            .count() as u32;
        let high_failures = checks.iter()
            .filter(|c| c.status == "fail" && c.severity == CheckSeverity::High)
            .count() as u32;

        EndpointScore {
            overall,
            category: ScoreCategory::from_score(overall).label().into(),
            security_score,
            hardening_score,
            breakdown: ScoreBreakdown {
                checks_passed: passed_count,
                checks_failed: failed_count,
                checks_total: total_count,
                critical_failures,
                high_failures,
                weighted_total,
                weighted_passed,
            },
            trend,
        }
    }

    /// Last N scores for trend display.
    pub fn history(&self) -> &[u32] { &self.history }

    fn calculate_trend(&self, current: u32) -> ScoreTrend {
        if self.history.len() < 3 { return ScoreTrend::Unknown; }
        let last = *self.history.last().unwrap() as i32;
        let diff = current as i32 - last;
        match diff {
            d if d > 5  => ScoreTrend::Increasing,
            d if d < -5 => ScoreTrend::Decreasing,
            _           => ScoreTrend::Stable,
        }
    }
}
