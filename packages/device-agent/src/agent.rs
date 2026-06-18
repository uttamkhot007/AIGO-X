use anyhow::Result;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::time;
use tracing::{error, info, warn};

use crate::admin::{self, AdminStatus, CheckEntry, SharedAdminState};
use crate::checks;
use crate::client::AgentClient;
use crate::compliance::ComplianceEngine;
use crate::config::Config;
use crate::discovery::{self, Inventory};
use crate::hardening::HardeningEngine;
use crate::offline::OfflineStore;
use crate::recovery::AutoRecoveryManager;
use crate::remediation::{RemediationEngine, RemediationResult, RemediationExecutionResult};
use crate::scoring::ScoringEngine;
use crate::secrets::SecretsBackend;
use crate::security::ThreatDetectionEngine;

// ── Agent entry point ─────────────────────────────────────────────────────────

pub async fn run(cfg: Config, dry_run: bool) -> Result<()> {
    info!(
        version = env!("CARGO_PKG_VERSION"),
        platform = std::env::consts::OS,
        dry_run,
        azure_ad_enabled = cfg.azure_ad.enabled,
        delta_push       = cfg.healing.delta_push,
        watchdog_secs    = cfg.healing.watchdog_timeout_secs,
        auto_remediate   = cfg.remediation.auto_remediate,
        remediation_dry  = cfg.remediation.dry_run_remediation,
        "AIGO-X endpoint agent starting"
    );

    // ── Resolve secrets (Vault AppRole → env-var fallback) ──────────────────
    let secrets = SecretsBackend::from_config(&cfg.vault);
    let raw_token = cfg.registration.agent_token.clone();
    let resolved_token = secrets.get_agent_token(&raw_token).await;
    info!(
        backend = if cfg.vault.enabled && cfg.vault.address.is_some() { "vault" } else { "env" },
        "secrets backend initialised"
    );

    if dry_run {
        return run_dry_run(cfg, resolved_token).await;
    }

    // ── Start local admin HTTP server ────────────────────────────────────────
    let admin_state = admin::start(&cfg.admin).await;

    // ── Build HTTP client with the resolved token ────────────────────────────
    let client = AgentClient::new(&cfg, resolved_token.clone())?;
    let device_key = crate::secrets::get_or_create_device_key().ok();
    let sqlite_key = device_key.as_ref().map(crate::secrets::derive_sqlite_key);
    let mut store = sqlite_key.and_then(|k| OfflineStore::open(cfg.store.path.as_deref(), k).ok());
    let start_time = Instant::now();

    // ── Persistent engines (carry history/state across cycles) ───────────────
    let mut scoring   = ScoringEngine::new();
    let mut recovery  = AutoRecoveryManager::new();

    // ── Register (idempotent upsert on server) ────────────────────────────────
    let reg = client.register().await?;
    let agent_id = reg.agent_id.clone();

    // Persist HMAC secret delivered by server (CQ-004 / AE-001)
    if let Some(ref secret) = reg.hmac_secret {
        if let Err(e) = crate::secrets::store_hmac_secret(secret) {
            warn!(err = %e, "failed to store hmac secret to keyring");
        }
        client.set_hmac_secret(secret.clone());
    }

    if let Some(ref mut s) = store {
        let _ = s.set_agent_id(&agent_id);
    }

    let heartbeat_interval = Duration::from_secs(
        reg.heartbeat_interval.unwrap_or(cfg.agent.heartbeat_interval),
    );
    let base_collection = Duration::from_secs(
        reg.collection_interval.unwrap_or(cfg.agent.collection_interval),
    );

    info!(
        agent_id          = %agent_id,
        heartbeat_secs    = heartbeat_interval.as_secs(),
        collection_secs   = base_collection.as_secs(),
        "agent ready"
    );

    // ── Initial status push to admin UI ──────────────────────────────────────
    push_admin_status(&admin_state, &agent_id, &cfg, start_time, None, None, None, 0, 0, 0);

    // ── Run one cycle immediately, then enter the adaptive tick loop ──────────
    let mut last_score: u32 = 100;
    let mut last_payload_hash: Option<String> = None;
    let mut last_collection = Instant::now() - base_collection; // triggers immediately

    let _ = run_cycle_with_watchdog(
        &client, &agent_id, store.as_mut(), &admin_state, &cfg,
        start_time, &mut scoring, &mut recovery, &mut last_payload_hash,
    ).await.map(|score| { last_score = score; });

    let mut heartbeat_ticker = time::interval(heartbeat_interval);
    heartbeat_ticker.tick().await;     // consume immediate first tick

    loop {
        tokio::select! {
            _ = heartbeat_ticker.tick() => {
                // ── Healing signal: re-register ──────────────────────────────
                if recovery.signals.needs_reregister() {
                    recovery.signals.clear_reregister();
                    info!(agent_id, "healing: re-registering with server");
                    match client.register().await {
                        Ok(r) => info!(agent_id = %r.agent_id, "healing: re-registration OK"),
                        Err(e) => {
                            error!(err = %e, "healing: re-registration failed");
                            recovery.monitor.record_failure("api_client", &e.to_string());
                        }
                    }
                }

                // ── Heartbeat ────────────────────────────────────────────────
                match client.checkin(&agent_id).await {
                    Ok(pending_actions) => {
                        recovery.monitor.record_success("api_client");
                        let now = chrono::Utc::now().to_rfc3339();
                        if let Ok(mut s) = admin_state.lock() {
                            if let Some(ref mut st) = s.status {
                                st.last_heartbeat = Some(now);
                            }
                        }
                        // ── Process server commands ─────────────────────────
                        for action in pending_actions {
                            let cmd_type = action.get("type").and_then(|v| v.as_str()).unwrap_or("unknown");
                            match cmd_type {
                                "push_config" => {
                                    info!(agent_id, "command: push_config received");
                                    // TODO: apply config from action.get("config")
                                }
                                "collect_logs" => {
                                    info!(agent_id, "command: collect_logs received");
                                    // TODO: trigger log collection
                                }
                                "update_agent" => {
                                    info!(agent_id, "command: update_agent received");
                                    let target_version = action.get("version").and_then(|v| v.as_str()).map(|s| s.to_string());
                                    let client_clone = client.clone();
                                    tokio::spawn(async move {
                                        if let Err(e) = crate::updater::run_update(&client_clone, target_version).await {
                                            error!(err = %e, "auto-update failed");
                                        }
                                    });
                                }
                                other => {
                                    warn!(agent_id, cmd_type = other, "unknown server command received");
                                }
                            }
                        }
                    }
                    Err(e) => {
                        warn!(err = %e, "heartbeat failed");
                        recovery.monitor.record_failure("api_client", &e.to_string());
                    }
                }

                // ── Post-cycle recovery check ────────────────────────────────
                recovery.run_recovery_cycle().await;
            }

            _ = tokio::signal::ctrl_c() => {
                info!("shutdown signal received — agent stopped");
                break;
            }

            // Adaptive collection: poll every second, fire when interval elapsed
            _ = time::sleep(Duration::from_secs(1)) => {
                let effective = adaptive_collection_interval(
                    last_score, base_collection, cfg.healing.adaptive_score_threshold,
                );

                let force_collect = recovery.signals.needs_collect();
                if force_collect { recovery.signals.clear_collect(); }

                let due = last_collection.elapsed() >= effective;

                if due || force_collect {
                    last_collection = Instant::now();
                    last_score = run_cycle_with_watchdog(
                        &client, &agent_id, store.as_mut(), &admin_state, &cfg,
                        start_time, &mut scoring, &mut recovery, &mut last_payload_hash,
                    ).await.unwrap_or(last_score);

                    if force_collect {
                        info!(last_score, "forced collection cycle complete");
                    }
                }
            }
        }
    }

    Ok(())
}

// ── Watchdog-wrapped collection cycle ─────────────────────────────────────────

/// Runs one collection cycle, killing it via watchdog if it exceeds `cfg.healing.watchdog_timeout_secs`.
/// Returns the new compliance score on success.
async fn run_cycle_with_watchdog(
    client: &AgentClient,
    agent_id: &str,
    store: Option<&mut OfflineStore>,
    admin_state: &SharedAdminState,
    cfg: &Config,
    start_time: Instant,
    scoring: &mut ScoringEngine,
    recovery: &mut AutoRecoveryManager,
    last_payload_hash: &mut Option<String>,
) -> Result<u32> {
    let timeout = Duration::from_secs(cfg.healing.watchdog_timeout_secs);

    match tokio::time::timeout(
        timeout,
        run_cycle(client, agent_id, store, admin_state, cfg, start_time, scoring, last_payload_hash),
    ).await {
        Ok(score) => {
            recovery.monitor.record_success("collection");
            Ok(score)
        }
        Err(_elapsed) => {
            error!(
                watchdog_secs = timeout.as_secs(),
                "collection cycle timed out — watchdog triggered"
            );
            recovery.monitor.record_failure("collection", "watchdog timeout");
            recovery.run_recovery_cycle().await;
            Err(anyhow::anyhow!("collection cycle timed out"))
        }
    }
}

// ── Core collection cycle ─────────────────────────────────────────────────────

async fn run_cycle(
    client: &AgentClient,
    agent_id: &str,
    store: Option<&mut OfflineStore>,
    admin_state: &SharedAdminState,
    cfg: &Config,
    start_time: Instant,
    scoring: &mut ScoringEngine,
    last_payload_hash: &mut Option<String>,
) -> u32 {
    info!("starting collection cycle");

    // Collect inventory
    let inv = match discovery::collect().await {
        Ok(inv) => inv,
        Err(e) => {
            error!(err = %e, "collection failed");
            return 0;
        }
    };

    // ── Run all checks ────────────────────────────────────────────────────────
    let check_results = checks::run_all(&inv);
    let passed = check_results.iter().filter(|c| c.status == "pass").count() as u32;
    let failed = check_results.iter()
        .filter(|c| c.status == "fail" || c.status == "warn").count() as u32;

    // ── Remediation engine ────────────────────────────────────────────────────
    let mut remediation_engine = RemediationEngine::new(cfg.remediation.clone());
    let remediation_plan = remediation_engine.plan(&check_results);
    let execution_result = remediation_engine.execute_safe_fixes_with_validation(&remediation_plan, &check_results).await;
    let remediation_results = execution_result.remediation_results.clone();
    let remediation_applied = remediation_results.iter().filter(|r| r.status == "success").count() as u32;
    let remediation_failed = remediation_results.iter().filter(|r| r.status == "failed").count() as u32;
    let immediate_validations = execution_result.check_results.clone();

    // AE-005: Also schedule a delayed re-validation (~30 s) for fixes that need
    // time to take effect (service restarts, policy refreshes, etc.).
    let validation_queue = remediation_engine.validation_queue.clone();
    if !validation_queue.is_empty() {
        let client_clone = client.clone();
        let agent_id_clone = agent_id.to_string();
        let remediation_cfg = cfg.remediation.clone();
        let check_ids: Vec<String> = validation_queue.iter().map(|(id, _)| id.clone()).collect();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_secs(30)).await;
            info!(agent_id = %agent_id_clone, "running post-remediation validation after 30s");
            match discovery::collect().await {
                Ok(inv) => {
                    let validations = crate::remediation::RemediationEngine::new(remediation_cfg)
                        .run_validations_with_queue(&check_ids, &inv, &validation_queue).await;
                    if !validations.is_empty() {
                        let validation_payload = serde_json::json!({
                            "remediationValidations": validations.iter().map(|v| serde_json::json!({
                                "checkId": v.check_id,
                                "preStatus": v.pre_status,
                                "postStatus": v.post_status,
                                "validated": v.validated,
                                "validatedAt": v.validated_at,
                            })).collect::<Vec<_>>(),
                            "validatedAt": chrono::Utc::now().to_rfc3339(),
                        });
                        if let Err(e) = client_clone.push_validation(&agent_id_clone, validation_payload).await {
                            warn!(err = %e, "validation push failed");
                        }
                    }
                }
                Err(e) => {
                    warn!(err = %e, "validation discovery collection failed");
                }
            }
        });
    }

    info!(
        auto_actions = remediation_plan.auto_applicable.len(),
        manual_actions = remediation_plan.manual_required.len(),
        applied = remediation_applied,
        failed = remediation_failed,
        "remediation plan generated"
    );

    // ── Enrichment engines ────────────────────────────────────────────────────
    let hardening   = HardeningEngine::new().assess(&inv);
    let compliance  = ComplianceEngine::new().evaluate(&inv, &check_results);
    let mut threat_engine = ThreatDetectionEngine::new();
    let threats     = threat_engine.analyze(&inv);

    // ── Weighted score (persistent history for trend tracking) ────────────────
    let endpoint_score = scoring.calculate(&check_results, Some(&hardening));
    let score = endpoint_score.overall;

    info!(
        total  = check_results.len(),
        passed,
        failed,
        score,
        hardening_score  = hardening.score,
        threats          = threats.len(),
        remediation_applied,
        remediation_failed,
        "checks complete"
    );

    // ── Admin UI push ─────────────────────────────────────────────────────────
    let now_ts = chrono::Utc::now().to_rfc3339();
    let check_entries: Vec<CheckEntry> = check_results.iter().map(|c| CheckEntry {
        id: c.id.clone(),
        display_name: crate::checks::display_name_from_id(&c.id).into(),
        category: crate::checks::category_from_id(&c.id).into(),
        status: c.status.clone(),
        evidence: c.evidence.clone(),
        recommendation: c.recommendation.clone(),
        severity: c.severity.label().into(),
    }).collect();

    push_admin_status(
        admin_state, agent_id, cfg, start_time,
        Some(now_ts.clone()), Some(now_ts.clone()),
        Some(score), threats.len(),
        passed, failed,
    );
    if let Ok(mut s) = admin_state.lock() {
        s.update_checks(check_entries);
    }

    // ── Build payload ─────────────────────────────────────────────────────────
    let payload = build_payload(&inv, &check_results, &endpoint_score, &hardening, &compliance, &threats, &remediation_results, &remediation_plan, &immediate_validations);

    // ── Delta detection: skip push if payload is identical to last cycle ──────
    let payload_hash = compute_hash(&payload);
    if cfg.healing.delta_push {
        if let Some(ref prev) = *last_payload_hash {
            if prev == &payload_hash {
                info!(agent_id, "delta-push: payload unchanged — skipping push (saving bandwidth)");
                return score;
            }
        }
    }
    *last_payload_hash = Some(payload_hash);

    // ── Push to server ────────────────────────────────────────────────────────
    match client.push(agent_id, payload.clone(), passed, failed, score).await {
        Ok(()) => {
            if let Some(s) = store {
                flush_buffered(client, agent_id, s).await;
            }
        }
        Err(e) => {
            warn!(err = %e, "push failed after retries — buffering to local cache");
            if let Some(s) = store {
                if let Err(be) = s.buffer_payload(agent_id, &payload) {
                    error!(err = %be, "failed to buffer payload");
                }
            }
        }
    }

    score
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Adaptive collection interval: shorten when the score drops below the threshold
/// (collect more often when the endpoint is under stress / non-compliant).
/// Normal operation → base interval. Degraded → base / 2.
fn adaptive_collection_interval(
    last_score: u32,
    base: Duration,
    threshold: u32,
) -> Duration {
    if last_score < threshold {
        let halved = base / 2;
        // Never go below 60 s to avoid hammering the server
        halved.max(Duration::from_secs(60))
    } else {
        base
    }
}

/// SHA-256 of the serialized payload — used for delta detection.
fn compute_hash(payload: &Value) -> String {
    let s = serde_json::to_string(payload).unwrap_or_default();
    let mut h = Sha256::new();
    h.update(s.as_bytes());
    hex::encode(h.finalize())
}

async fn flush_buffered(client: &AgentClient, agent_id: &str, store: &mut OfflineStore) {
    let pending = match store.get_buffered_payloads() {
        Ok(p) => p,
        Err(_) => return,
    };
    if pending.is_empty() { return; }
    info!(count = pending.len(), "flushing buffered payloads");
    for p in pending {
        if let Err(e) = client.push(agent_id, p.payload.clone(), 0, 0, 0).await {
            warn!(err = %e, "flush failed — will retry next cycle");
            break;
        }
        let _ = store.delete_buffered_payload(p.id);
    }
}

fn push_admin_status(
    admin_state: &SharedAdminState,
    agent_id: &str,
    cfg: &Config,
    start_time: Instant,
    last_collection: Option<String>,
    last_heartbeat: Option<String>,
    score: Option<u32>,
    active_threats: usize,
    checks_passed: u32,
    checks_failed: u32,
) {
    let uptime = start_time.elapsed().as_secs();
    let health = if active_threats > 0 { "degraded" } else { "healthy" }.to_string();
    let status = AdminStatus {
        agent_id: Some(agent_id.to_string()),
        version: cfg.agent.version.clone(),
        platform: std::env::consts::OS.to_string(),
        uptime_secs: uptime,
        last_collection: last_collection.clone(),
        last_heartbeat: last_heartbeat.clone(),
        compliance_score: score,
        weighted_score: None,
        active_threats,
        health,
        checks_passed: Some(checks_passed as u32),
        checks_failed: Some(checks_failed as u32),
        checks_warned: Some(0),
        checks_total: Some((checks_passed + checks_failed) as u32),
    };
    if let Ok(mut s) = admin_state.lock() {
        s.update_status(status);
    }
}

// ── Payload builder ───────────────────────────────────────────────────────────

pub fn build_payload(
    inv: &Inventory,
    checks: &[checks::CheckResult],
    score: &crate::scoring::EndpointScore,
    hardening: &crate::hardening::HardeningAssessment,
    compliance: &[crate::compliance::FrameworkResult],
    threats: &[crate::security::ThreatEvent],
    remediation_results: &[RemediationResult],
    remediation_plan: &crate::remediation::RemediationPlan,
    validation_results: &[crate::remediation::RemediationCheckValidation],
) -> Value {
    let check_list: Vec<Value> = checks.iter().map(|c| {
        serde_json::json!({
            "id":             c.id,
            "status":         c.status,
            "severity":       c.severity,
            "evidence":       c.evidence,
            "recommendation": c.recommendation,
        })
    }).collect();

    let users: Vec<Value> = inv.users.iter().map(|u| {
        serde_json::json!({ "name": u.name, "isAdmin": u.is_admin })
    }).collect();

    let services: Vec<Value> = inv.services.iter().map(|s| {
        serde_json::json!({ "name": s.name, "status": s.status, "startType": s.start_type })
    }).collect();

    let software: Vec<Value> = inv.software_inventory.iter().map(|s| {
        serde_json::json!({
            "name": s.name,
            "version": s.version,
            "publisher": s.publisher,
            "installDate": s.install_date,
            "source": s.source,
            "cpeIdentifier": s.cpe_identifier,
        })
    }).collect();

    // R3: include per-volume encryption detail — server reads p.encryptionVolumes
    let encr_volumes: Vec<Value> = inv.encryption_volumes.iter().map(|v| {
        serde_json::json!({
            "path":   v.path,
            "status": v.status,
            "method": v.method,
        })
    }).collect();

    let patches: Vec<Value> = inv.patch_status.iter().map(|p| {
        serde_json::json!({
            "name": p.name,
            "currentVersion": p.current_version,
            "availableVersion": p.available_version,
            "severity": p.severity,
            "installDate": p.install_date,
            "status": p.status,
        })
    }).collect();

    let payload_json = serde_json::json!({
        // ── Identity ─────────────────────────────────────────────────────────
        "hostname": inv.hostname,
        "platform": inv.platform,
        "arch":     inv.arch,
        // ── Azure AD identity (Task #913) ─────────────────────────────────────
        "azureAd": {
            "deviceId":   inv.azure_ad_device_id,
            "registered": inv.azure_ad_registered,
            "compliant":  inv.azure_ad_compliant,
        },
        // ── Hardware / OS ─────────────────────────────────────────────────────
        "hardware": {
            "cpu":          inv.hardware.cpu,
            "ramGb":        inv.hardware.ram_gb,
            "diskGb":       inv.hardware.disk_gb,
            "serialNumber": inv.hardware.serial_number,
        },
        "os": {
            "name":       inv.os.name,
            "version":    inv.os.version,
            "patchLevel": inv.os.patch_level,
        },
        // ── Resource telemetry ────────────────────────────────────────────────
        "resourceUsage": {
            "memoryUsagePct": inv.memory_usage_pct,
            "cpuUsagePct":    inv.cpu_usage_pct,
        },
        // ── Network / endpoints ───────────────────────────────────────────────
        "users":      users,
        "services":   services,
        "openPorts":  inv.open_ports,
        "ipAddresses": inv.ip_addresses,
        "macAddresses": inv.mac_addresses,
        // ── Posture fields ────────────────────────────────────────────────────
        "encryptionStatus":       inv.encryption_status,
        "encryptionVolumes":      encr_volumes,
        "firewallEnabled":        inv.firewall_enabled,
        "antivirusEnabled":       inv.antivirus_enabled,
        "antivirusUpToDate":      inv.antivirus_up_to_date,
        "auditLoggingEnabled":    inv.audit_logging_enabled,
        "sshRootLoginDisabled":   inv.ssh_root_login_disabled,
        "passwordAuthDisabled":   inv.password_auth_disabled,
        "screenLockEnabled":      inv.screen_lock_enabled,
        "autoUpdateEnabled":      inv.auto_update_enabled,
        "guestAccountDisabled":   inv.guest_account_disabled,
        "remoteRegistryDisabled": inv.remote_registry_disabled,
        "uacEnabled":             inv.uac_enabled,
        "secureBootEnabled":      inv.secure_boot_enabled,
        "sipEnabled":             inv.sip_enabled,
        "gatekeeperEnabled":      inv.gatekeeper_enabled,
        "softwareInventory":      software,
        "patchStatus":            patches,
        "edrDetected":            inv.edr_detected,
        "edrProducts":            inv.edr_products,
        "eventLoggingEnabled":    inv.event_logging_enabled,
        "ntpSynced":              inv.ntp_synced,
        "fimStatus":              inv.fim_status,
        "fimViolations":          inv.fim_violations,
        "tlsVersion":             inv.tls_version,
        // ── Checks ───────────────────────────────────────────────────────────
        "checks": check_list,
        // ── Score (severity-weighted) ─────────────────────────────────────────
        "score": {
            "overall":         score.overall,
            "category":        score.category,
            "securityScore":   score.security_score,
            "hardeningScore":  score.hardening_score,
            "trend":           score.trend,
            "breakdown": {
                "checksPassed":    score.breakdown.checks_passed,
                "checksFailed":    score.breakdown.checks_failed,
                "checksTotal":     score.breakdown.checks_total,
                "criticalFailures": score.breakdown.critical_failures,
                "highFailures":    score.breakdown.high_failures,
                "weightedTotal":   score.breakdown.weighted_total,
                "weightedPassed":  score.breakdown.weighted_passed,
            },
        },
        // ── Hardening assessment ──────────────────────────────────────────────
        "hardening": {
            "score": hardening.score,
            "baseline": hardening.baseline,
            "findings": hardening.findings,
        },
        // ── Framework compliance ──────────────────────────────────────────────
        "compliance": compliance,
        // ── Threat events ─────────────────────────────────────────────────────
        "threats": threats,
        // ── Remediation ─────────────────────────────────────────────────────────
        "remediation": build_remediation_json(remediation_results, remediation_plan),
        // ── Immediate validation (AE-005) ───────────────────────────────────────
        "remediationValidations": validation_results.iter().map(|v| serde_json::json!({
            "checkId": v.check_id,
            "preStatus": v.pre_status,
            "postStatus": v.post_status,
            "validated": v.validated,
        })).collect::<Vec<_>>(),
        // ── Metadata ──────────────────────────────────────────────────────────
        "collectedAt":  inv.collected_at,
        "agentVersion": env!("CARGO_PKG_VERSION"),
    });

    // Compute SHA-256 hash of canonical payload for integrity verification
    let payload_canonical = serde_json::to_string(&payload_json).unwrap_or_default();
    let hash = sha2::Sha256::digest(payload_canonical.as_bytes());
    let payload_hash = format!("sha256:{:x}", hash);

    // Inject hash into payload
    let mut payload_obj = match payload_json {
        Value::Object(map) => map,
        _ => return payload_json,
    };
    payload_obj.insert("payloadHash".into(), Value::String(payload_hash));
    Value::Object(payload_obj)
}

fn build_remediation_json(
    remediation_results: &[RemediationResult],
    remediation_plan: &crate::remediation::RemediationPlan,
) -> Value {
    let results: Vec<Value> = remediation_results.iter().map(|r| {
        serde_json::json!({
            "actionId": r.action_id,
            "checkId": r.check_id,
            "status": r.status,
            "message": r.message,
            "rolledBack": r.rolled_back,
            "backupPath": r.backup_path,
            "executedAt": r.executed_at,
            "platform": r.platform,
        })
    }).collect();
    let planned: Vec<Value> = remediation_plan.manual_required.iter().map(|a| {
        serde_json::json!({
            "id": a.id,
            "title": a.title,
            "description": a.description,
            "checkId": a.check_id,
            "priority": format!("{:?}", a.priority).to_lowercase(),
            "requiresApproval": a.requires_approval,
            "autoFix": a.auto_fix,
            "estimatedRisk": a.estimated_risk,
        })
    }).collect();
    serde_json::json!({
        "results": results,
        "manualActions": planned,
        "autoActionCount": remediation_plan.auto_applicable.len(),
        "manualActionCount": remediation_plan.manual_required.len(),
    })
}

// ── Dry-run mode ──────────────────────────────────────────────────────────────

async fn run_dry_run(cfg: Config, resolved_token: String) -> Result<()> {
    info!("dry-run mode: verifying connectivity and registration");

    let client = AgentClient::new(&cfg, resolved_token)?;
    let reg = client.register().await?;
    info!(agent_id = %reg.agent_id, "dry-run: registration OK");

    let inv = discovery::collect().await?;
    let check_results = checks::run_all(&inv);
    let passed = check_results.iter().filter(|c| c.status == "pass").count();
    let total = check_results.len();

    let hardening  = HardeningEngine::new().assess(&inv);
    let compliance = ComplianceEngine::new().evaluate(&inv, &check_results);
    let mut te     = ThreatDetectionEngine::new();
    let threats    = te.analyze(&inv);
    let mut scoring = ScoringEngine::new();
    let ep_score   = scoring.calculate(&check_results, Some(&hardening));

    info!(
        passed,
        total,
        score          = ep_score.overall,
        category       = %ep_score.category,
        threats        = threats.len(),
        frameworks     = compliance.len(),
        azure_ad_enabled = cfg.azure_ad.enabled,
        "dry-run: collection + checks OK"
    );

    if let Err(e) = client.checkin(&reg.agent_id).await {
        warn!(err = %e, "dry-run: heartbeat failed (non-fatal in dry-run)");
    } else {
        info!("dry-run: heartbeat OK");
    }

    info!("dry-run complete — all systems go");
    Ok(())
}
