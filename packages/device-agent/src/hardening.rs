use serde::{Deserialize, Serialize};
use crate::discovery::Inventory;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HardeningAssessment {
    pub score: u32,
    pub category_scores: CategoryScores,
    pub findings: Vec<HardeningFinding>,
    pub baseline: BaselineComparison,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryScores {
    pub configuration: u32,
    pub system: u32,
    pub application: u32,
    pub network: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HardeningFinding {
    pub id: String,
    pub category: String,
    pub severity: String,
    pub title: String,
    pub description: String,
    pub recommendation: String,
    pub baseline_control: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BaselineComparison {
    pub standard: String,
    pub compliance_pct: u32,
    pub non_compliant: Vec<String>,
}

#[derive(Debug, Default)]
pub struct HardeningEngine;

impl HardeningEngine {
    pub fn new() -> Self { Self }

    pub fn assess(&self, inv: &Inventory) -> HardeningAssessment {
        let config_findings = self.assess_configuration(inv);
        let system_findings = self.assess_system(inv);
        let network_findings = self.assess_network(inv);
        let app_findings = self.assess_application(inv);

        let mut all_findings = vec![];
        all_findings.extend(config_findings);
        all_findings.extend(system_findings);
        all_findings.extend(network_findings);
        all_findings.extend(app_findings.clone());

        let non_compliant: Vec<String> = all_findings.iter()
            .filter(|f| f.severity == "critical" || f.severity == "high")
            .map(|f| f.id.clone())
            .collect();

        let config_score = self.category_score(&all_findings, "configuration");
        let system_score = self.category_score(&all_findings, "system");
        let network_score = self.category_score(&all_findings, "network");
        let app_score = self.category_score(&all_findings, "application");

        let overall = (config_score + system_score + network_score + app_score) / 4;

        HardeningAssessment {
            score: overall,
            category_scores: CategoryScores {
                configuration: config_score,
                system: system_score,
                application: app_score,
                network: network_score,
            },
            baseline: BaselineComparison {
                standard: "CIS Benchmark Level 1".into(),
                compliance_pct: if non_compliant.is_empty() { 100 } else {
                    100u32.saturating_sub((non_compliant.len() as u32 * 10).min(100))
                },
                non_compliant,
            },
            findings: all_findings,
        }
    }

    fn category_score(&self, findings: &[HardeningFinding], category: &str) -> u32 {
        let cat_findings: Vec<_> = findings.iter().filter(|f| f.category == category).collect();
        if cat_findings.is_empty() { return 85; } // default good score if nothing assessed
        let critical = cat_findings.iter().filter(|f| f.severity == "critical").count() as u32;
        let high = cat_findings.iter().filter(|f| f.severity == "high").count() as u32;
        let medium = cat_findings.iter().filter(|f| f.severity == "medium").count() as u32;
        100u32.saturating_sub(critical * 20 + high * 10 + medium * 5)
    }

    fn assess_configuration(&self, inv: &Inventory) -> Vec<HardeningFinding> {
        let mut f = vec![];
        if inv.encryption_status == "disabled" {
            f.push(HardeningFinding {
                id: "HARD-CFG-001".into(), category: "configuration".into(),
                severity: "critical".into(),
                title: "Disk encryption disabled".into(),
                description: "Full disk encryption is not enabled.".into(),
                recommendation: "Enable BitLocker / FileVault / LUKS.".into(),
                baseline_control: Some("CIS 3.2".into()),
            });
        }
        if inv.auto_update_enabled == Some(false) {
            f.push(HardeningFinding {
                id: "HARD-CFG-002".into(), category: "configuration".into(),
                severity: "high".into(),
                title: "Automatic updates disabled".into(),
                description: "OS patch management is not automated.".into(),
                recommendation: "Enable automatic OS updates.".into(),
                baseline_control: Some("CIS 7.1".into()),
            });
        }
        f
    }

    fn assess_system(&self, inv: &Inventory) -> Vec<HardeningFinding> {
        let mut f = vec![];
        if inv.secure_boot_enabled == Some(false) {
            f.push(HardeningFinding {
                id: "HARD-SYS-001".into(), category: "system".into(),
                severity: "medium".into(),
                title: "Secure Boot disabled".into(),
                description: "Secure Boot is not active in UEFI firmware.".into(),
                recommendation: "Enable Secure Boot in firmware settings.".into(),
                baseline_control: Some("CIS 1.7".into()),
            });
        }
        if inv.audit_logging_enabled == Some(false) {
            f.push(HardeningFinding {
                id: "HARD-SYS-002".into(), category: "system".into(),
                severity: "high".into(),
                title: "Audit logging disabled".into(),
                description: "System audit logging service is not running.".into(),
                recommendation: "Enable and configure system audit logging (auditd / Windows Event Log).".into(),
                baseline_control: Some("CIS 4.1".into()),
            });
        }
        f
    }

    fn assess_network(&self, inv: &Inventory) -> Vec<HardeningFinding> {
        let mut f = vec![];
        if inv.firewall_enabled == Some(false) {
            f.push(HardeningFinding {
                id: "HARD-NET-001".into(), category: "network".into(),
                severity: "critical".into(),
                title: "Host firewall disabled".into(),
                description: "No host-based firewall is active.".into(),
                recommendation: "Enable the host firewall and define restrictive ingress rules.".into(),
                baseline_control: Some("CIS 3.5".into()),
            });
        }
        const HIGH_RISK: &[u16] = &[21, 23, 135, 445, 3389, 5900];
        let exposed: Vec<u16> = inv.open_ports.iter().copied().filter(|p| HIGH_RISK.contains(p)).collect();
        if !exposed.is_empty() {
            f.push(HardeningFinding {
                id: "HARD-NET-002".into(), category: "network".into(),
                severity: "high".into(),
                title: format!("High-risk ports open: {:?}", exposed),
                description: "Potentially dangerous network services are exposed.".into(),
                recommendation: "Firewall or disable unneeded services on these ports.".into(),
                baseline_control: Some("CIS 9.1".into()),
            });
        }
        f
    }

    fn assess_application(&self, inv: &Inventory) -> Vec<HardeningFinding> {
        let mut f = vec![];
        if inv.antivirus_enabled == Some(false) {
            f.push(HardeningFinding {
                id: "HARD-APP-001".into(), category: "application".into(),
                severity: "high".into(),
                title: "No antivirus / EDR detected".into(),
                description: "Endpoint protection software is not detected.".into(),
                recommendation: "Deploy antivirus or EDR solution.".into(),
                baseline_control: Some("CIS 8.1".into()),
            });
        }
        f
    }
}
