/**
 * BrowserCheckCronRegistry
 *
 * Registers a separate node-cron task per enabled browser check so each check
 * fires at its own defined schedule (e.g. "0 8 * * *" fires at 08:00 UTC, not
 * at the global evidence-collection window).
 *
 * The registry syncs every 5 minutes to pick up new, updated, or deleted checks.
 * If a check's cron expression changes, the old task is destroyed and a new one
 * is registered automatically.
 *
 * Alerts are fired only on a status *transition* to fail/error (i.e. the check
 * was previously passing or unknown). Repeated failures do not re-alert.
 */

import cron from "node-cron";
import { db } from "@workspace/service-kit";
import { tenantsTable, browserChecksTable, browserCheckRunsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { runBrowserCheck } from "./browser-verification/BrowserVerificationService";
import { writeBrowserCheckEvidenceArtifact } from "./browser-verification/BrowserCheckEvidenceWriter";
import { sendEvidenceAlerts } from "./evidence-alert";
import { sendBrowserCheckAlerts } from "./browser-check-alert";

interface RegisteredTask {
  cronExpr: string;
  task: cron.ScheduledTask;
}

// Map of "${tenantId}:${checkId}" → registered cron task
const taskRegistry = new Map<string, RegisteredTask>();

// ── Execute a single scheduled check ─────────────────────────────────────────

async function executeCheck(tenantId: number, checkId: string): Promise<void> {
  const [check] = await db.select().from(browserChecksTable)
    .where(and(eq(browserChecksTable.tenantId, tenantId), eq(browserChecksTable.checkId, checkId)));
  if (!check || !check.enabled) return;

  // Capture previous status BEFORE the run for transition-gating
  const previousStatus = check.lastStatus;

  const runId = `bcr-sched-${checkId}-${Date.now()}`;
  console.log(`[browser-cron] Running scheduled check ${checkId} for tenant ${tenantId}`);

  // Persist run record before executing — guarantees audit trail even if execution crashes
  await db.insert(browserCheckRunsTable).values({
    tenantId,
    runId,
    checkId: check.checkId,
    controlRef: check.controlRef,
    status: "running",
    triggeredBy: "scheduled",
  });

  const perCheckConfig = {
    slackWebhookUrl:  check.alertSlackWebhookUrl ?? null,
    emailRecipients:  (check.alertEmailRecipients as string[] | null) ?? null,
  };

  let result;
  try {
    result = await runBrowserCheck(check.url, check.instruction);
  } catch (runErr) {
    const msg = (runErr as Error).message;
    await db.update(browserCheckRunsTable)
      .set({ status: "error", errorMessage: msg, durationMs: 0 })
      .where(and(eq(browserCheckRunsTable.tenantId, tenantId), eq(browserCheckRunsTable.runId, runId)));
    await db.update(browserChecksTable)
      .set({ lastRunAt: new Date(), lastStatus: "error", lastError: msg, updatedAt: new Date() })
      .where(and(eq(browserChecksTable.tenantId, tenantId), eq(browserChecksTable.checkId, checkId)));
    sendBrowserCheckAlerts(tenantId, {
      runId, checkId: check.checkId, checkName: check.name,
      url: check.url, verdict: "error", controlRef: check.controlRef,
      screenshotUrl: null, errorMessage: msg,
      previousStatus,
    }, perCheckConfig).catch((err) =>
      console.error(`[browser-cron] Browser check alert (catch) failed for check ${checkId}:`, err)
    );
    return;
  }

  // Persist run result
  await db.update(browserCheckRunsTable)
    .set({
      status:        result.verdict,
      screenshotUrl: result.screenshotPath,
      verdict:       result.verdict,
      errorMessage:  result.verdict === "error" ? result.summary : null,
      durationMs:    result.durationMs,
    })
    .where(and(eq(browserCheckRunsTable.tenantId, tenantId), eq(browserCheckRunsTable.runId, runId)));

  await db.update(browserChecksTable)
    .set({
      lastRunAt:  new Date(),
      lastStatus: result.verdict,
      lastError:  result.verdict === "error" ? result.summary : null,
      updatedAt:  new Date(),
    })
    .where(and(eq(browserChecksTable.tenantId, tenantId), eq(browserChecksTable.checkId, checkId)));

  // Write evidence artifact and fire alerts on failure
  try {
    const { artifactRunId, failed } = await writeBrowserCheckEvidenceArtifact({
      tenantId, check, result, triggeredBy: "scheduled",
    });
    if (failed > 0) {
      sendEvidenceAlerts(tenantId, artifactRunId, failed, 0, 1).catch((err) =>
        console.error(`[browser-cron] Alert dispatch failed for check ${checkId}:`, err)
      );
    }
  } catch (e) {
    console.error(`[browser-cron] Evidence write failed for check ${checkId}:`, e);
  }

  // Browser-check alert — only fires on verdict transition to fail/error
  if (result.verdict === "fail" || result.verdict === "error") {
    sendBrowserCheckAlerts(tenantId, {
      runId,
      checkId:        check.checkId,
      checkName:      check.name,
      url:            check.url,
      verdict:        result.verdict as "fail" | "error",
      controlRef:     check.controlRef,
      screenshotUrl:  result.screenshotPath ?? null,
      errorMessage:   result.verdict === "error" ? result.summary : null,
      previousStatus,
    }, perCheckConfig).catch((err) =>
      console.error(`[browser-cron] Browser check alert failed for check ${checkId}:`, err)
    );
  }
}

// ── Registry sync ────────────────────────────────────────────────────────────

async function syncAllChecks(): Promise<void> {
  try {
    const tenants = await db
      .select({ id: tenantsTable.id })
      .from(tenantsTable)
      .where(eq(tenantsTable.status, "active"));
    const activeKeys = new Set<string>();

    for (const tenant of tenants) {
      const checks = await db
        .select()
        .from(browserChecksTable)
        .where(and(eq(browserChecksTable.tenantId, tenant.id), eq(browserChecksTable.enabled, true)));

      for (const check of checks) {
        const key = `${tenant.id}:${check.checkId}`;
        activeKeys.add(key);

        const existing = taskRegistry.get(key);
        if (existing && existing.cronExpr === check.scheduleCron) continue;

        // Destroy stale task (cron expression changed or first registration)
        if (existing) {
          existing.task.stop();
          taskRegistry.delete(key);
        }

        if (!cron.validate(check.scheduleCron)) {
          console.warn(`[browser-cron] Invalid cron expression for check ${check.checkId}: "${check.scheduleCron}" — skipping`);
          continue;
        }

        const task = cron.schedule(check.scheduleCron, () => {
          executeCheck(tenant.id, check.checkId).catch((err) =>
            console.error(`[browser-cron] Unhandled error in executeCheck(${check.checkId}):`, err)
          );
        });

        taskRegistry.set(key, { cronExpr: check.scheduleCron, task });
        console.log(`[browser-cron] Registered check ${check.checkId} for tenant ${tenant.id} at "${check.scheduleCron}"`);
      }
    }

    // Deregister tasks for checks that are no longer enabled/present
    for (const [key, { task }] of taskRegistry) {
      if (!activeKeys.has(key)) {
        task.stop();
        taskRegistry.delete(key);
        console.log(`[browser-cron] Deregistered check ${key}`);
      }
    }
  } catch (err) {
    console.error("[browser-cron] syncAllChecks failed:", err);
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

export function startBrowserCheckCronRegistry(): void {
  // Initial sync on startup
  syncAllChecks().catch((err) => console.error("[browser-cron] Initial sync failed:", err));

  // Re-sync every 5 minutes to pick up new/updated/deleted checks
  cron.schedule("*/5 * * * *", () => {
    syncAllChecks().catch((err) => console.error("[browser-cron] Periodic sync failed:", err));
  });

  console.log("[browser-cron] BrowserCheckCronRegistry initialized");
}
