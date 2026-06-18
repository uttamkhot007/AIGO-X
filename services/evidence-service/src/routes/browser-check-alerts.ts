/**
 * Browser Check Alert Settings & History API
 *
 * Routes:
 *   GET  /browser-check-alerts/settings   — get tenant alert settings
 *   PUT  /browser-check-alerts/settings   — update tenant alert settings
 *   POST /browser-check-alerts/test       — send a test alert
 *   GET  /browser-check-alerts/history    — delivery history (last 50)
 */

import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db } from "@workspace/service-kit";
import {
  browserCheckAlertSettingsTable,
  browserCheckAlertHistoryTable,
} from "@workspace/db";
import { requireAuth } from "@workspace/service-kit";
import type { JwtPayload } from "@workspace/service-kit";
import type { Request } from "express";
import { sendBrowserCheckAlerts } from "../services/browser-check-alert";
import { validateSlackWebhookUrl } from "../services/briefing-generator";

const router = Router();
type AuthReq = Request & { user: JwtPayload };

// ── GET /browser-check-alerts/settings ────────────────────────────────────────

router.get("/browser-check-alerts/settings", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const tid = Number(tenantId);

    const [row] = await db
      .select()
      .from(browserCheckAlertSettingsTable)
      .where(eq(browserCheckAlertSettingsTable.tenantId, tid))
      .limit(1);

    if (!row) {
      return res.json({
        enabled:         false,
        slackWebhookUrl: null,
        emailRecipients: [],
      });
    }

    res.json({
      enabled:         row.enabled,
      slackWebhookUrl: row.slackWebhookUrl ?? null,
      emailRecipients: (row.emailRecipients as string[]) ?? [],
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PUT /browser-check-alerts/settings ────────────────────────────────────────

router.put("/browser-check-alerts/settings", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const tid = Number(tenantId);

    const body = req.body as {
      enabled?:         boolean;
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

    const updates: Partial<typeof browserCheckAlertSettingsTable.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (typeof body.enabled === "boolean") updates.enabled = body.enabled;
    if (body.slackWebhookUrl !== undefined)
      updates.slackWebhookUrl = body.slackWebhookUrl ?? null;
    if (Array.isArray(body.emailRecipients))
      updates.emailRecipients = body.emailRecipients.filter(
        (e) => typeof e === "string" && e.trim()
      );

    const [existing] = await db
      .select({ id: browserCheckAlertSettingsTable.id })
      .from(browserCheckAlertSettingsTable)
      .where(eq(browserCheckAlertSettingsTable.tenantId, tid))
      .limit(1);

    let row;
    if (existing) {
      [row] = await db
        .update(browserCheckAlertSettingsTable)
        .set(updates)
        .where(eq(browserCheckAlertSettingsTable.tenantId, tid))
        .returning();
    } else {
      [row] = await db
        .insert(browserCheckAlertSettingsTable)
        .values({ tenantId: tid, ...updates })
        .returning();
    }

    res.json({
      enabled:         row!.enabled,
      slackWebhookUrl: row!.slackWebhookUrl ?? null,
      emailRecipients: (row!.emailRecipients as string[]) ?? [],
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /browser-check-alerts/test ───────────────────────────────────────────

router.post("/browser-check-alerts/test", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const tid = Number(tenantId);

    const [settings] = await db
      .select()
      .from(browserCheckAlertSettingsTable)
      .where(eq(browserCheckAlertSettingsTable.tenantId, tid))
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

    await sendBrowserCheckAlerts(tid, {
      runId:         `test-${Date.now()}`,
      checkId:       "test-check",
      checkName:     "Test Browser Check",
      url:           "https://example.com",
      verdict:       "fail",
      controlRef:    "TEST-001",
      screenshotUrl: null,
      errorMessage:  "This is a test alert from DuFense.",
    });

    res.json({ success: true, message: "Test alert sent. Check your Slack/email." });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to send test alert" });
  }
});

// ── GET /browser-check-alerts/history ─────────────────────────────────────────

router.get("/browser-check-alerts/history", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const tid = Number(tenantId);

    const rows = await db
      .select()
      .from(browserCheckAlertHistoryTable)
      .where(eq(browserCheckAlertHistoryTable.tenantId, tid))
      .orderBy(desc(browserCheckAlertHistoryTable.createdAt))
      .limit(50);

    res.json(
      rows.map((r) => ({
        id:            r.id,
        runId:         r.runId,
        checkId:       r.checkId,
        checkName:     r.checkName,
        url:           r.url,
        verdict:       r.verdict,
        controlRef:    r.controlRef,
        screenshotUrl: r.screenshotUrl ?? null,
        channel:       r.channel,
        destination:   r.destination,
        status:        r.status,
        error:         r.error ?? null,
        sentAt:        r.sentAt?.toISOString() ?? null,
        createdAt:     r.createdAt.toISOString(),
      }))
    );
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
