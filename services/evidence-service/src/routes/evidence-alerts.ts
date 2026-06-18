/**
 * Evidence Alert Settings & History API
 *
 * Routes:
 *   GET  /evidence/alerts/settings   — get tenant alert settings
 *   PUT  /evidence/alerts/settings   — update tenant alert settings
 *   POST /evidence/alerts/test       — send a test alert
 *   GET  /evidence/alerts/history    — delivery history (last 50)
 */

import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db } from "@workspace/service-kit";
import {
  evidenceAlertSettingsTable,
  evidenceAlertHistoryTable,
} from "@workspace/db";
import { requireAuth } from "@workspace/service-kit";
import type { JwtPayload } from "@workspace/service-kit";
import type { Request } from "express";
import { sendEvidenceAlerts } from "../services/evidence-alert";
import { validateSlackWebhookUrl } from "../services/briefing-generator";

const router = Router();
type AuthReq = Request & { user: JwtPayload };

// ── GET /evidence/alerts/settings ─────────────────────────────────────────────

router.get("/evidence/alerts/settings", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const tid = Number(tenantId);

    const [row] = await db
      .select()
      .from(evidenceAlertSettingsTable)
      .where(eq(evidenceAlertSettingsTable.tenantId, tid))
      .limit(1);

    if (!row) {
      return res.json({
        enabled:         false,
        alertOnFailed:   true,
        alertOnStale:    false,
        minFailedCount:  1,
        slackWebhookUrl: null,
        emailRecipients: [],
      });
    }

    res.json({
      enabled:         row.enabled,
      alertOnFailed:   row.alertOnFailed,
      alertOnStale:    row.alertOnStale,
      minFailedCount:  row.minFailedCount,
      slackWebhookUrl: row.slackWebhookUrl ?? null,
      emailRecipients: (row.emailRecipients as string[]) ?? [],
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PUT /evidence/alerts/settings ─────────────────────────────────────────────

router.put("/evidence/alerts/settings", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const tid = Number(tenantId);

    const body = req.body as {
      enabled?:         boolean;
      alertOnFailed?:   boolean;
      alertOnStale?:    boolean;
      minFailedCount?:  number;
      slackWebhookUrl?: string | null;
      emailRecipients?: string[];
    };

    if (body.slackWebhookUrl) {
      const v = validateSlackWebhookUrl(body.slackWebhookUrl);
      if (!v.valid) {
        return res.status(400).json({ error: `Invalid Slack webhook URL: ${v.reason}` });
      }
    }

    if (body.emailRecipients !== undefined && !Array.isArray(body.emailRecipients)) {
      return res.status(400).json({ error: "emailRecipients must be an array" });
    }

    const updates: Partial<typeof evidenceAlertSettingsTable.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (typeof body.enabled         === "boolean") updates.enabled        = body.enabled;
    if (typeof body.alertOnFailed   === "boolean") updates.alertOnFailed  = body.alertOnFailed;
    if (typeof body.alertOnStale    === "boolean") updates.alertOnStale   = body.alertOnStale;
    if (typeof body.minFailedCount  === "number" && body.minFailedCount > 0)
      updates.minFailedCount = body.minFailedCount;
    if (body.slackWebhookUrl !== undefined)
      updates.slackWebhookUrl = body.slackWebhookUrl ?? null;
    if (Array.isArray(body.emailRecipients))
      updates.emailRecipients = body.emailRecipients.filter((e) => typeof e === "string" && e.trim());

    const [existing] = await db
      .select({ id: evidenceAlertSettingsTable.id })
      .from(evidenceAlertSettingsTable)
      .where(eq(evidenceAlertSettingsTable.tenantId, tid))
      .limit(1);

    let row;
    if (existing) {
      [row] = await db
        .update(evidenceAlertSettingsTable)
        .set(updates)
        .where(eq(evidenceAlertSettingsTable.tenantId, tid))
        .returning();
    } else {
      [row] = await db
        .insert(evidenceAlertSettingsTable)
        .values({ tenantId: tid, ...updates })
        .returning();
    }

    res.json({
      enabled:         row!.enabled,
      alertOnFailed:   row!.alertOnFailed,
      alertOnStale:    row!.alertOnStale,
      minFailedCount:  row!.minFailedCount,
      slackWebhookUrl: row!.slackWebhookUrl ?? null,
      emailRecipients: (row!.emailRecipients as string[]) ?? [],
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /evidence/alerts/test ────────────────────────────────────────────────

router.post("/evidence/alerts/test", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const tid = Number(tenantId);

    const [settings] = await db
      .select()
      .from(evidenceAlertSettingsTable)
      .where(eq(evidenceAlertSettingsTable.tenantId, tid))
      .limit(1);

    if (!settings) {
      return res.status(400).json({ error: "No alert settings configured. Save settings first." });
    }

    const hasSlack = Boolean(settings.slackWebhookUrl);
    const emailRecipients = (settings.emailRecipients as string[]) ?? [];
    const hasEmail = emailRecipients.length > 0;

    if (!hasSlack && !hasEmail) {
      return res.status(400).json({ error: "No Slack webhook or email recipients configured." });
    }

    await sendEvidenceAlerts(tid, `test-${Date.now()}`, 2, 1, 50);

    res.json({ success: true, message: "Test alert sent. Check your Slack/email." });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to send test alert" });
  }
});

// ── GET /evidence/alerts/history ──────────────────────────────────────────────

router.get("/evidence/alerts/history", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;

    const rows = await db
      .select()
      .from(evidenceAlertHistoryTable)
      .where(eq(evidenceAlertHistoryTable.tenantId, Number(tenantId)))
      .orderBy(desc(evidenceAlertHistoryTable.createdAt))
      .limit(50);

    res.json(rows.map((r) => ({
      id:             r.id,
      runId:          r.runId,
      channel:        r.channel,
      destination:    r.destination,
      failedCount:    r.failedCount,
      staleCount:     r.staleCount,
      failedControls: r.failedControls,
      status:         r.status,
      error:          r.error ?? null,
      sentAt:         r.sentAt?.toISOString() ?? null,
      createdAt:      r.createdAt.toISOString(),
    })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
