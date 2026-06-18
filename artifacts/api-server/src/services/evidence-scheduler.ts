import cron from "node-cron";
import { collectEvidence } from "./evidence-collector";
import { db } from "../lib/db";
import { tenantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendEvidenceAlerts } from "./evidence-alert";

let schedulerStarted = false;

async function collectEvidenceAllTenants(): Promise<void> {
  const tenants = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.status, "active"));

  for (const { id } of tenants) {
    try {
      const result = await collectEvidence(id, "Scheduled");
      // Fire alerts after collection — non-blocking, errors logged internally
      sendEvidenceAlerts(id, result.runId, result.failed, result.stale, result.total).catch((err) =>
        console.error(`[evidence-scheduler] Alert dispatch failed for tenant ${id}:`, err)
      );
    } catch (err) {
      console.error(`[evidence-scheduler] Collection failed for tenant ${id}:`, err);
    }
  }
}

export function startEvidenceScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const schedule = process.env["EVIDENCE_CRON"] ?? "0 2 * * *";

  cron.schedule(schedule, async () => {
    console.log("[evidence-scheduler] Starting scheduled evidence collection for all tenants…");
    try {
      await collectEvidenceAllTenants();
      console.log("[evidence-scheduler] Scheduled collection complete.");
    } catch (err) {
      console.error("[evidence-scheduler] Collection failed:", err);
    }
  });

  console.log(`[evidence-scheduler] Scheduled evidence collection at cron: ${schedule}`);
}
