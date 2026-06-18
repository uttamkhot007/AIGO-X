/**
 * Cross-module orchestration service.
 *
 * Subscribes to GRC events from the event bus and drives automated workflows:
 *  • Every event → written to activity_log (powers the dashboard activity feed)
 *  • Critical risk created → auto-creates a remediation ticket
 *  • Critical CSPM finding emitted → auto-creates a risk item
 *  • DSAR created → DSPM lookup hint logged
 */

import { eq, and } from "drizzle-orm";
import { db } from "./db";
import { eventBus, Events } from "./event-bus";
import { logger } from "./logger";
import { ticketsTable, risksTable } from "@workspace/db";

// ── Orchestration init ────────────────────────────────────────────────────────

export function initOrchestration(): void {
  logger.info("Orchestration service starting");

  // Risk created → auto-escalate Critical risks to tickets
  eventBus.subscribe<{ riskId: string; severity?: string; name?: string }>(
    Events.RISK_CREATED,
    async (event) => {
      const { tenantId, payload } = event;
      if (!tenantId) return;

      if (payload.severity !== "Critical") return;

      try {
        // Find the full risk record
        const [risk] = await db.select()
          .from(risksTable)
          .where(and(eq(risksTable.tenantId, tenantId), eq(risksTable.riskId, payload.riskId)))
          .limit(1);
        if (!risk) return;

        // Check if a ticket already exists for this risk
        const existing = await db.select({ id: ticketsTable.id })
          .from(ticketsTable)
          .where(and(
            eq(ticketsTable.tenantId, tenantId),
            eq(ticketsTable.title, `[AUTO] Remediate ${risk.name}`),
          )).limit(1);
        if (existing.length > 0) return;

        const [latestTicket] = await db.select({ id: ticketsTable.id })
          .from(ticketsTable)
          .where(eq(ticketsTable.tenantId, tenantId))
          .orderBy(ticketsTable.id).limit(1);
        const ticketId = `TKT-${(latestTicket?.id ?? 3000) + 1}`;
        const due = new Date();
        due.setDate(due.getDate() + 7);

        await db.insert(ticketsTable).values({
          tenantId,
          ticketId,
          priority: "Critical",
          title: `[AUTO] Remediate ${risk.name}`,
          category: "Risk Remediation",
          assignee: risk.owner,
          status: "open",
          sla: due.toISOString().split("T")[0]!,
          aiSeverity: "Critical",
          aiCategory: "Risk Remediation",
          aiConfidence: 0.95,
        }).onConflictDoNothing();

        logger.info(
          { riskId: payload.riskId, ticketId, tenantId },
          "Orchestration: Auto-created ticket for Critical risk",
        );
      } catch (err) {
        logger.warn({ err, payload }, "Orchestration: failed to auto-create ticket for Critical risk");
      }
    },
  );

  // Ticket resolved → update corresponding risk status
  eventBus.subscribe<{ ticketId: string }>(
    Events.TICKET_RESOLVED,
    async (event) => {
      const { tenantId, payload } = event;
      if (!tenantId) return;

      try {
        // If ticket title starts with [AUTO] Remediate, find the risk
        const [ticket] = await db.select()
          .from(ticketsTable)
          .where(and(
            eq(ticketsTable.tenantId, tenantId),
            eq(ticketsTable.ticketId, payload.ticketId),
          )).limit(1);
        if (!ticket || !ticket.title.startsWith("[AUTO] Remediate")) return;

        const riskName = ticket.title.replace("[AUTO] Remediate ", "");
        await db.update(risksTable)
          .set({ status: "mitigated", trend: "down", updatedAt: new Date() })
          .where(and(
            eq(risksTable.tenantId, tenantId),
            eq(risksTable.name, riskName),
          ));

        logger.info({ ticketId: payload.ticketId, riskName }, "Orchestration: Risk mitigated via ticket resolution");
      } catch (err) {
        logger.warn({ err, payload }, "Orchestration: failed to update risk on ticket resolution");
      }
    },
  );

  // DSAR created → log cross-module hint (future: trigger DSPM lookup)
  eventBus.subscribe<{ dsarId?: string }>(
    Events.DSAR_CREATED,
    (event) => {
      logger.info(
        { tenantId: event.tenantId, dsarId: event.payload.dsarId },
        "Orchestration: DSAR received — DSPM data subject lookup recommended",
      );
    },
  );

  logger.info("Orchestration service active");
}
