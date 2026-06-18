use serde::{Deserialize, Serialize};
use crate::checks::CheckResult;
use crate::discovery::Inventory;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrameworkResult {
    pub framework: String,
    pub controls_total: u32,
    pub controls_passed: u32,
    pub compliance_score: u32,
    pub findings: Vec<ComplianceFinding>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComplianceFinding {
    pub control_id: String,
    pub title: String,
    pub status: String,
    pub severity: String,
    pub evidence: String,
}

#[derive(Debug)]
pub struct ComplianceEngine {
    frameworks: Vec<String>,
}

impl ComplianceEngine {
    pub fn new() -> Self {
        Self {
            frameworks: vec![
                "CIS Benchmark L1".into(),
                "NIST CSF".into(),
                "SOC 2".into(),
                "ISO 27001".into(),
            ],
        }
    }

    pub fn evaluate(&self, inv: &Inventory, checks: &[CheckResult]) -> Vec<FrameworkResult> {
        self.frameworks.iter().map(|fw| {
            self.evaluate_framework(fw, inv, checks)
        }).collect()
    }

    fn evaluate_framework(&self, framework: &str, _inv: &Inventory, checks: &[CheckResult]) -> FrameworkResult {
        // Map check IDs to framework controls
        let mappings = framework_control_mappings(framework);

        let mut findings = vec![];
        let mut passed = 0u32;
        let total = mappings.len() as u32;

        for (check_id, control) in &mappings {
            if let Some(check) = checks.iter().find(|c| &c.id == check_id) {
                let is_pass = check.status == "pass";
                if is_pass { passed += 1; }
                if !is_pass {
                    findings.push(ComplianceFinding {
                        control_id: control.id.clone(),
                        title: control.title.clone(),
                        status: check.status.clone(),
                        severity: control.severity.clone(),
                        evidence: check.evidence.clone(),
                    });
                }
            } else {
                // Check not collected — treat as not assessed
                findings.push(ComplianceFinding {
                    control_id: control.id.clone(),
                    title: control.title.clone(),
                    status: "skip".into(),
                    severity: control.severity.clone(),
                    evidence: "Control not assessed on this platform".into(),
                });
            }
        }

        let score = if total > 0 { (passed * 100) / total } else { 0 };

        FrameworkResult {
            framework: framework.into(),
            controls_total: total,
            controls_passed: passed,
            compliance_score: score,
            findings,
        }
    }
}

impl Default for ComplianceEngine {
    fn default() -> Self { Self::new() }
}

struct ControlMapping {
    id: String,
    title: String,
    severity: String,
}

fn framework_control_mappings(framework: &str) -> Vec<(String, ControlMapping)> {
    match framework {
        "CIS Benchmark L1" => vec![
            ("AGENT-ENC-001".into(), ControlMapping { id: "CIS-3.2".into(), title: "Ensure disk encryption is enabled".into(), severity: "high".into() }),
            ("AGENT-FW-001".into(),  ControlMapping { id: "CIS-3.5".into(), title: "Ensure host firewall is active".into(), severity: "high".into() }),
            ("AGENT-AV-001".into(),  ControlMapping { id: "CIS-8.1".into(), title: "Ensure anti-malware is installed".into(), severity: "medium".into() }),
            ("AGENT-LOG-001".into(), ControlMapping { id: "CIS-4.1".into(), title: "Ensure audit logging is active".into(), severity: "medium".into() }),
            ("AGENT-ACC-001".into(), ControlMapping { id: "CIS-1.5".into(), title: "Ensure screen lock is configured".into(), severity: "medium".into() }),
            ("AGENT-PATCH-001".into(), ControlMapping { id: "CIS-7.1".into(), title: "Ensure automatic updates enabled".into(), severity: "high".into() }),
            ("AGENT-NET-001".into(), ControlMapping { id: "CIS-9.1".into(), title: "Ensure high-risk ports are closed".into(), severity: "high".into() }),
            ("AGENT-BOOT-001".into(), ControlMapping { id: "CIS-1.7".into(), title: "Ensure Secure Boot is enabled".into(), severity: "low".into() }),
        ],
        "NIST CSF" => vec![
            ("AGENT-ENC-001".into(), ControlMapping { id: "PR.DS-1".into(), title: "Data-at-rest is protected".into(), severity: "high".into() }),
            ("AGENT-FW-001".into(),  ControlMapping { id: "PR.AC-5".into(), title: "Network integrity is protected".into(), severity: "high".into() }),
            ("AGENT-LOG-001".into(), ControlMapping { id: "DE.CM-1".into(), title: "The network is monitored".into(), severity: "medium".into() }),
            ("AGENT-PATCH-001".into(), ControlMapping { id: "PR.IP-12".into(), title: "Vulnerabilities are identified and remediated".into(), severity: "high".into() }),
        ],
        "SOC 2" => vec![
            ("AGENT-ENC-001".into(), ControlMapping { id: "CC6.1".into(), title: "Logical and physical access controls".into(), severity: "high".into() }),
            ("AGENT-FW-001".into(),  ControlMapping { id: "CC6.6".into(), title: "Logical access security measures".into(), severity: "high".into() }),
            ("AGENT-LOG-001".into(), ControlMapping { id: "CC7.2".into(), title: "Security incidents are detected".into(), severity: "medium".into() }),
        ],
        "ISO 27001" => vec![
            ("AGENT-ENC-001".into(), ControlMapping { id: "A.10.1.1".into(), title: "Policy on the use of cryptographic controls".into(), severity: "high".into() }),
            ("AGENT-FW-001".into(),  ControlMapping { id: "A.13.1.1".into(), title: "Network controls".into(), severity: "high".into() }),
            ("AGENT-LOG-001".into(), ControlMapping { id: "A.12.4.1".into(), title: "Event logging".into(), severity: "medium".into() }),
            ("AGENT-ACC-001".into(), ControlMapping { id: "A.11.2.8".into(), title: "Unattended user equipment".into(), severity: "medium".into() }),
        ],
        _ => vec![],
    }
}
