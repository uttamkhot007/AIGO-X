/**
 * Browser Check Alert Service
 *
 * Sends Slack and/or email notifications whenever a browser check run
 * *transitions* to a "fail" or "error" verdict (i.e. the previous verdict
 * was not already fail/error — prevents repeat-failure spam).
 *
 * Destinations are resolved by merging per-check overrides with the tenant-global
 * settings:
 *   - If a check has its own alertSlackWebhookUrl / alertEmailRecipients set,
 *     those are used INSTEAD of the global defaults.
 *   - If a check has no per-check overrides, the tenant-global settings are used.
 *   - The global `enabled` flag is a kill switch; all alerts are suppressed when disabled.
 */

import { db } from "../lib/db";
import {
  browserCheckAlertSettingsTable,
  browserCheckAlertHistoryTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { validateSlackWebhookUrl } from "./briefing-generator";

const DEEP_LINK_BASE = process.env["APP_BASE_URL"] ?? "https://aigo-x.io";

export interface BrowserCheckAlertPayload {
  runId:         string;
  checkId:       string;
  checkName:     string;
  url:           string;
  verdict:       "fail" | "error";
  controlRef:    string;
  screenshotUrl: string | null;
  errorMessage?: string | null;
  /** Previous lastStatus value before this run — used for transition gating */
  previousStatus?: string | null;
}

export interface PerCheckAlertConfig {
  slackWebhookUrl:  string | null | undefined;
  emailRecipients:  string[] | null | undefined;
}

// ── Slack blocks ──────────────────────────────────────────────────────────────

function buildSlackBlocks(p: BrowserCheckAlertPayload): object[] {
  const deepLink = `${DEEP_LINK_BASE}/grc-platform/govops/controls/${encodeURIComponent(p.controlRef)}`;
  const icon = p.verdict === "error" ? "🔴" : "❌";

  const blocks: object[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "AIGO Browser Check Alert", emoji: true },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${icon} *Browser check transitioned to ${p.verdict.toUpperCase()}* — \`${p.checkName}\``,
      },
    },
    { type: "divider" },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Check:*\n${p.checkName}` },
        { type: "mrkdwn", text: `*Verdict:*\n\`${p.verdict.toUpperCase()}\`` },
        { type: "mrkdwn", text: `*Control:*\n${p.controlRef}` },
        { type: "mrkdwn", text: `*Run ID:*\n\`${p.runId}\`` },
      ],
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*URL:*\n<${p.url}|${p.url}>` },
    },
  ];

  if (p.errorMessage) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Error:*\n\`\`\`${p.errorMessage.slice(0, 300)}\`\`\`` },
    });
  }

  if (p.screenshotUrl) {
    const screenshotViewUrl = `${DEEP_LINK_BASE}/api${p.screenshotUrl}`;
    blocks.push({
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Screenshot URL:*\n<${screenshotViewUrl}|${p.screenshotUrl}>` },
      ],
    });
  }

  blocks.push({ type: "divider" });
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `<${deepLink}|→ Open Control in AIGO>`,
    },
  });

  return blocks;
}

// ── Email HTML ────────────────────────────────────────────────────────────────

function buildEmailHtml(p: BrowserCheckAlertPayload): { subject: string; html: string; text: string } {
  const deepLink = `${DEEP_LINK_BASE}/grc-platform/govops/controls/${encodeURIComponent(p.controlRef)}`;
  const verdictLabel = p.verdict === "error" ? "ERROR" : "FAIL";
  const verdictColor = p.verdict === "error" ? "#DC2626" : "#EA580C";
  const verdictBg    = p.verdict === "error" ? "#FEE2E2" : "#FFF7ED";
  const subject = `[AIGO Alert] Browser check "${p.checkName}" transitioned to ${verdictLabel}`;

  const screenshotViewUrl = p.screenshotUrl ? `${DEEP_LINK_BASE}/api${p.screenshotUrl}` : null;
  const screenshotRow = screenshotViewUrl
    ? `<tr style="border-bottom:1px solid #E2E8F0;"><td style="padding:10px 12px;font-weight:600;color:#64748B;width:140px;">Screenshot</td><td style="padding:10px 12px;font-family:monospace;font-size:12px;"><a href="${screenshotViewUrl}" style="color:#1E3A5F;">${p.screenshotUrl}</a></td></tr>`
    : "";

  const errorRow = p.errorMessage
    ? `<tr style="border-bottom:1px solid #E2E8F0;"><td style="padding:10px 12px;font-weight:600;color:#64748B;">Error</td><td style="padding:10px 12px;font-family:monospace;font-size:12px;color:#DC2626;">${p.errorMessage.slice(0, 300)}</td></tr>`
    : "";

  const html = `<html><body style="font-family:Arial,sans-serif;max-width:720px;margin:40px auto;color:#1E293B;background:#F8FAFC;">
<div style="background:#1E3A5F;padding:24px 32px;border-radius:12px 12px 0 0;">
  <h1 style="color:#fff;margin:0;font-size:20px;">❌ AIGO Browser Check Alert</h1>
  <p style="color:#94A3B8;margin:6px 0 0;font-size:13px;">A browser check has transitioned to a failed verdict</p>
</div>
<div style="background:#fff;padding:24px 32px;border:1px solid #E2E8F0;border-top:none;">
  <div style="display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap;">
    <div style="flex:1;min-width:120px;background:${verdictBg};border:1px solid ${verdictColor}33;border-radius:8px;padding:14px 18px;text-align:center;">
      <div style="font-size:22px;font-weight:800;color:${verdictColor};">${verdictLabel}</div>
      <div style="font-size:11px;color:${verdictColor};font-weight:600;">Verdict</div>
    </div>
    <div style="flex:2;min-width:200px;background:#F0F9FF;border:1px solid #BAE6FD;border-radius:8px;padding:14px 18px;">
      <div style="font-size:14px;font-weight:700;color:#0369A1;">${p.checkName}</div>
      <div style="font-size:12px;color:#64748B;margin-top:4px;">Run: <code>${p.runId}</code></div>
    </div>
  </div>
  <h2 style="font-size:15px;color:#1E3A5F;border-bottom:2px solid #E2E8F0;padding-bottom:8px;">Check Details</h2>
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    <tbody>
      <tr style="border-bottom:1px solid #E2E8F0;"><td style="padding:10px 12px;font-weight:600;color:#64748B;width:140px;">Check</td><td style="padding:10px 12px;font-weight:700;color:#1E3A5F;">${p.checkName}</td></tr>
      <tr style="border-bottom:1px solid #E2E8F0;"><td style="padding:10px 12px;font-weight:600;color:#64748B;">URL</td><td style="padding:10px 12px;"><a href="${p.url}" style="color:#1E3A5F;">${p.url}</a></td></tr>
      <tr style="border-bottom:1px solid #E2E8F0;"><td style="padding:10px 12px;font-weight:600;color:#64748B;">Control Ref</td><td style="padding:10px 12px;font-family:monospace;">${p.controlRef}</td></tr>
      <tr style="border-bottom:1px solid #E2E8F0;"><td style="padding:10px 12px;font-weight:600;color:#64748B;">Verdict</td><td style="padding:10px 12px;"><span style="background:${verdictBg};color:${verdictColor};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;">${verdictLabel}</span></td></tr>
      <tr style="border-bottom:1px solid #E2E8F0;"><td style="padding:10px 12px;font-weight:600;color:#64748B;">Run ID</td><td style="padding:10px 12px;font-family:monospace;font-size:12px;">${p.runId}</td></tr>
      ${errorRow}
      ${screenshotRow}
    </tbody>
  </table>
  <div style="margin-top:28px;text-align:center;">
    <a href="${deepLink}" style="background:#1E3A5F;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">Open Control in AIGO →</a>
  </div>
</div>
<div style="background:#F8FAFC;padding:16px 32px;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px;text-align:center;">
  <p style="font-size:12px;color:#94A3B8;margin:0;">Delivered by AIGO-X GRC Platform · Browser Check Alert Service</p>
</div>
</body></html>`;

  const text = `AIGO Browser Check Alert\n\nCheck: ${p.checkName}\nURL: ${p.url}\nControl: ${p.controlRef}\nVerdict: ${verdictLabel}\nRun ID: ${p.runId}${p.errorMessage ? `\nError: ${p.errorMessage}` : ""}${p.screenshotUrl ? `\nScreenshot: ${screenshotViewUrl}` : ""}\n\nOpen in AIGO: ${deepLink}`;

  return { subject, html, text };
}

// ── Deliver a single alert ────────────────────────────────────────────────────

async function deliverAlert(
  tenantId: number,
  channel: "email" | "slack",
  destination: string,
  payload: BrowserCheckAlertPayload
): Promise<void> {
  const [histRow] = await db
    .insert(browserCheckAlertHistoryTable)
    .values({
      tenantId,
      runId:         payload.runId,
      checkId:       payload.checkId,
      checkName:     payload.checkName,
      url:           payload.url,
      verdict:       payload.verdict,
      controlRef:    payload.controlRef,
      screenshotUrl: payload.screenshotUrl,
      channel,
      destination,
      status: "pending",
    })
    .returning();

  let status = "sent";
  let error: string | null = null;

  try {
    if (channel === "slack") {
      const validation = validateSlackWebhookUrl(destination);
      if (!validation.valid) throw new Error(`Invalid Slack webhook: ${validation.reason}`);

      const blocks = buildSlackBlocks(payload);
      const fallbackText = `AIGO Alert: Browser check "${payload.checkName}" transitioned to ${payload.verdict.toUpperCase()} (run ${payload.runId})`;

      const response = await fetch(destination, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: fallbackText, blocks }),
      });

      if (!response.ok) {
        throw new Error(`Slack webhook returned ${response.status}: ${await response.text()}`);
      }
    } else {
      const apiKey = process.env["SENDGRID_API_KEY"];
      if (!apiKey) throw new Error("SENDGRID_API_KEY is not configured — email delivery unavailable");

      const { subject, html, text } = buildEmailHtml(payload);
      const emailPayload = {
        personalizations: [{ to: [{ email: destination }] }],
        from: {
          email: process.env["SENDGRID_FROM_EMAIL"] ?? "noreply@aigo-x.com",
          name: "AIGO Browser Check Alerts",
        },
        subject,
        content: [
          { type: "text/plain", value: text },
          { type: "text/html",  value: html },
        ],
      };

      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(emailPayload),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`SendGrid returned ${response.status}: ${body}`);
      }
    }

    console.log(`[browser-check-alert] Delivered ${channel} alert for run ${payload.runId} → ${destination}`);
  } catch (err) {
    status = "failed";
    error  = err instanceof Error ? err.message : String(err);
    console.error(`[browser-check-alert] Failed to deliver ${channel} alert for run ${payload.runId}:`, error);
  }

  await db
    .update(browserCheckAlertHistoryTable)
    .set({ status, error, sentAt: status === "sent" ? new Date() : undefined })
    .where(eq(browserCheckAlertHistoryTable.id, histRow!.id));
}

// ── Transition gate ───────────────────────────────────────────────────────────
// Returns true when the verdict represents a state *transition* into fail/error.
// Prevents alert spam when a check is already known-failing.

export function isAlertTransition(
  newVerdict: "fail" | "error",
  previousStatus: string | null | undefined
): boolean {
  const _ = newVerdict; void _;
  return previousStatus !== "fail" && previousStatus !== "error";
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function sendBrowserCheckAlerts(
  tenantId: number,
  payload: BrowserCheckAlertPayload,
  perCheckConfig?: PerCheckAlertConfig
): Promise<void> {
  // Transition gate: only alert when the verdict is a new failure (not a repeated one)
  if (!isAlertTransition(payload.verdict, payload.previousStatus)) {
    console.log(`[browser-check-alert] Suppressed repeat-failure alert for run ${payload.runId} (previous: ${payload.previousStatus})`);
    return;
  }

  // Load global tenant settings
  const [settings] = await db
    .select()
    .from(browserCheckAlertSettingsTable)
    .where(eq(browserCheckAlertSettingsTable.tenantId, tenantId))
    .limit(1);

  if (!settings || !settings.enabled) return;

  // Resolve delivery destinations: per-check overrides take priority over global
  const hasPerCheckSlack = perCheckConfig?.slackWebhookUrl != null && perCheckConfig.slackWebhookUrl.trim() !== "";
  const hasPerCheckEmails = Array.isArray(perCheckConfig?.emailRecipients) && (perCheckConfig!.emailRecipients!.length > 0);

  const slackUrl   = hasPerCheckSlack  ? perCheckConfig!.slackWebhookUrl! : (settings.slackWebhookUrl ?? null);
  const emailList  = hasPerCheckEmails ? perCheckConfig!.emailRecipients! : ((settings.emailRecipients as string[]) ?? []);

  const deliveries: Promise<void>[] = [];

  if (slackUrl) {
    deliveries.push(deliverAlert(tenantId, "slack", slackUrl, payload));
  }

  for (const email of emailList) {
    if (email && typeof email === "string") {
      deliveries.push(deliverAlert(tenantId, "email", email, payload));
    }
  }

  if (deliveries.length === 0) {
    console.log(`[browser-check-alert] Alert triggered for run ${payload.runId} but no channels configured`);
    return;
  }

  await Promise.allSettled(deliveries);
}
