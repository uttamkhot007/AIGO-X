import cron from "node-cron";
import { eq, lte, and } from "drizzle-orm";
import { db } from "../lib/db";
import { briefingSchedulesTable, briefingDeliveryHistoryTable } from "@workspace/db";
import { generateBriefingText, sendViaEmail, sendViaSlack } from "./briefing-generator";

let schedulerStarted = false;

export function computeNextRunAt(frequency: string, from: Date = new Date()): Date {
  const next = new Date(from);
  if (frequency === "daily") {
    next.setDate(next.getDate() + 1);
    next.setHours(8, 0, 0, 0);
  } else if (frequency === "weekly") {
    next.setDate(next.getDate() + 7);
    next.setHours(8, 0, 0, 0);
  } else {
    next.setMonth(next.getMonth() + 1);
    next.setDate(1);
    next.setHours(8, 0, 0, 0);
  }
  return next;
}

export async function runDueSchedules(): Promise<void> {
  const now = new Date();
  const due = await db
    .select()
    .from(briefingSchedulesTable)
    .where(and(eq(briefingSchedulesTable.active, true), lte(briefingSchedulesTable.nextRunAt, now)));

  if (due.length === 0) return;
  console.log(`[briefing-scheduler] Processing ${due.length} due schedule(s)…`);

  for (const schedule of due) {
    const historyRow = await db
      .insert(briefingDeliveryHistoryTable)
      .values({
        tenantId: schedule.tenantId,
        scheduleId: schedule.id,
        channel: schedule.channel,
        destination: schedule.destination,
        status: "pending",
        period: schedule.period,
      })
      .returning()
      .then((r) => r[0]!);

    let status = "sent";
    let error: string | null = null;

    try {
      const briefingText = await generateBriefingText(schedule.period);

      if (schedule.channel === "slack") {
        await sendViaSlack(schedule.destination, briefingText, schedule.period);
      } else {
        await sendViaEmail(schedule.destination, briefingText, schedule.period);
      }

      console.log(`[briefing-scheduler] Delivered schedule ${schedule.id} via ${schedule.channel} → ${schedule.destination}`);
    } catch (err) {
      status = "failed";
      error = err instanceof Error ? err.message : String(err);
      console.error(`[briefing-scheduler] Failed schedule ${schedule.id}:`, error);
    }

    const sentAt = status === "sent" ? new Date() : undefined;
    await db
      .update(briefingDeliveryHistoryTable)
      .set({ status, error, sentAt })
      .where(eq(briefingDeliveryHistoryTable.id, historyRow.id));

    await db
      .update(briefingSchedulesTable)
      .set({
        lastRunAt: now,
        nextRunAt: computeNextRunAt(schedule.frequency, now),
        updatedAt: now,
      })
      .where(eq(briefingSchedulesTable.id, schedule.id));
  }
}

export function startBriefingScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  cron.schedule("0 * * * *", async () => {
    console.log("[briefing-scheduler] Hourly check for due briefing schedules…");
    try {
      await runDueSchedules();
    } catch (err) {
      console.error("[briefing-scheduler] Error running due schedules:", err);
    }
  });

  console.log("[briefing-scheduler] Started — checking hourly for due briefing schedules");
}
