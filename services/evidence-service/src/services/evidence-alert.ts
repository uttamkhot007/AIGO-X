/**
 * Evidence Alert Service
 *
 * Sends email and/or Slack notifications when evidence collection runs
 * detect controls with "failed" or "stale" status.
 */

import { db } from "@workspace/service-kit";
import {
  evidenceAlertSettingsTable,
  evidenceAlertHistoryTable,
  controlsTable,
  evidenceArtifactsTable,
} from "@workspace/db";
import { eq, and, inArray, or } from "drizzle-orm";
import { validateSlackWebhookUrl } from "./briefing-generator";

const DEEP_LINK_BASE = process.env["APP_BASE_URL"] ?? "https://dufense.io";

export interface FailedControlInfo {
  controlRef: string;
  name: string;
  framework: string;
  sourceIntegration: string;
  status: "failed" | "stale";
  summary: string;
}

export interface AlertRunSummary {
  runId: string;
  tenantId: number;
  total: number;
  failed: number;
  stale: number;
  failedControls: FailedControlInfo[];
}

// ── Build alert message text ──────────────────────────────────────────────────

function buildSlackBlocks(summary: AlertRunSummary): object[] {
  const { runId, failed, stale, failedControls } = summary;
  const deepLink = `${DEEP_LINK_BASE}/grc-platform/evidence-engine`;
  const hasFailed = failed > 0;
  const hasStale  = stale > 0;

  const headerText = hasFailed
    ? `⚠️ *Evidence Collection Alert* — ${failed} control${failed !== 1 ? "s" : ""} failed`
    : `🕐 *Evidence Collection Alert* — ${stale} control${stale !== 1 ? "s" : ""} stale`;

  const blocks: object[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "DuFense Evidence Alert", emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: headerText },
    },
    { type: "divider" },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Run ID:*\n\`${runId}\`` },
        { type: "mrkdwn", text: `*Failed:* ${failed}  |  *Stale:* ${stale}` },
      ],
    },
  ];

  // List up to 8 failed/stale controls
  const toShow = failedControls.slice(0, 8);
  if (toShow.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "*Affected Controls:*" },
    });

    for (const ctrl of toShow) {
      const icon = ctrl.status === "failed" ? "🔴" : "🟡";
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${icon} *${ctrl.name}* (${ctrl.controlRef})\n_Framework: ${ctrl.framework} · Integration: ${ctrl.sourceIntegration}_\n${ctrl.summary}`,
        },
      });
    }

    if (failedControls.length > 8) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `_…and ${failedControls.length - 8} more. Log in to view all._`,
        },
      });
    }
  }

  blocks.push({ type: "divider" });
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `<${deepLink}|→ Open Evidence Engine in DuFense>`,
    },
  });

  return blocks;
}

function buildEmailHtml(summary: AlertRunSummary): { subject: string; html: string; text: string } {
  const { runId, failed, stale, failedControls } = summary;
  const deepLink = `${DEEP_LINK_BASE}/grc-platform/evidence-engine`;

  const subject = failed > 0
    ? `[DuFense Alert] ${failed} control${failed !== 1 ? "s" : ""} failed evidence collection`
    : `[DuFense Alert] ${stale} control${stale !== 1 ? "s" : ""} have stale evidence`;

  const controlRows = failedControls.slice(0, 15).map((ctrl) => {
    const badge = ctrl.status === "failed"
      ? `<span style="background:#FEE2E2;color:#DC2626;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;">FAILED</span>`
      : `<span style="background:#FEF3C7;color:#D97706;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;">STALE</span>`;
    return `
      <tr style="border-bottom:1px solid #E2E8F0;">
        <td style="padding:10px 12px;font-weight:600;color:#1E3A5F;">${ctrl.name}</td>
        <td style="padding:10px 12px;font-family:monospace;font-size:12px;color:#64748B;">${ctrl.controlRef}</td>
        <td style="padding:10px 12px;color:#64748B;">${ctrl.framework}</td>
        <td style="padding:10px 12px;color:#64748B;">${ctrl.sourceIntegration}</td>
        <td style="padding:10px 12px;">${badge}</td>
        <td style="padding:10px 12px;font-size:12px;color:#64748B;max-width:280px;">${ctrl.summary}</td>
      </tr>`;
  }).join("");

  const html = `<html><body style="font-family:Arial,sans-serif;max-width:900px;margin:40px auto;color:#1E293B;background:#F8FAFC;">
<div style="background:#1E3A5F;padding:24px 32px;border-radius:12px 12px 0 0;">
  <h1 style="color:#fff;margin:0;font-size:22px;">⚠️ DuFense Evidence Alert</h1>
  <p style="color:#94A3B8;margin:6px 0 0;font-size:14px;">Automated evidence collection found compliance gaps</p>
</div>
<div style="background:#fff;padding:24px 32px;border:1px solid #E2E8F0;border-top:none;">
  <div style="display:flex;gap:24px;margin-bottom:24px;flex-wrap:wrap;">
    <div style="flex:1;min-width:120px;background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:14px 18px;text-align:center;">
      <div style="font-size:28px;font-weight:800;color:#DC2626;">${failed}</div>
      <div style="font-size:12px;color:#DC2626;font-weight:600;">Controls Failed</div>
    </div>
    <div style="flex:1;min-width:120px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:14px 18px;text-align:center;">
      <div style="font-size:28px;font-weight:800;color:#D97706;">${stale}</div>
      <div style="font-size:12px;color:#D97706;font-weight:600;">Controls Stale</div>
    </div>
    <div style="flex:1;min-width:120px;background:#F0F9FF;border:1px solid #BAE6FD;border-radius:8px;padding:14px 18px;text-align:center;">
      <div style="font-size:14px;font-weight:600;color:#0369A1;word-break:break-all;">${runId}</div>
      <div style="font-size:12px;color:#0369A1;">Run ID</div>
    </div>
  </div>

  <h2 style="font-size:16px;color:#1E3A5F;border-bottom:2px solid #E2E8F0;padding-bottom:8px;">Affected Controls</h2>
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    <thead>
      <tr style="background:#F8FAFC;border-bottom:2px solid #E2E8F0;">
        <th style="padding:10px 12px;text-align:left;color:#64748B;font-weight:600;">Control Name</th>
        <th style="padding:10px 12px;text-align:left;color:#64748B;font-weight:600;">Ref</th>
        <th style="padding:10px 12px;text-align:left;color:#64748B;font-weight:600;">Framework</th>
        <th style="padding:10px 12px;text-align:left;color:#64748B;font-weight:600;">Integration</th>
        <th style="padding:10px 12px;text-align:left;color:#64748B;font-weight:600;">Status</th>
        <th style="padding:10px 12px;text-align:left;color:#64748B;font-weight:600;">Summary</th>
      </tr>
    </thead>
    <tbody>${controlRows}</tbody>
  </table>
  ${failedControls.length > 15 ? `<p style="color:#64748B;font-size:13px;margin-top:12px;">…and ${failedControls.length - 15} more. Log in to view all.</p>` : ""}

  <div style="margin-top:28px;text-align:center;">
    <a href="${deepLink}" style="background:#1E3A5F;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">Open Evidence Engine →</a>
  </div>
</div>
<div style="background:#F8FAFC;padding:16px 32px;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px;text-align:center;">
  <p style="font-size:12px;color:#94A3B8;margin:0;">Delivered by DuFense GRC Platform · Evidence Alert Service</p>
</div>
</body></html>`;

  const text = `DuFense Evidence Alert\n\nFailed: ${failed} | Stale: ${stale} | Run: ${runId}\n\nAffected Controls:\n${
    failedControls.slice(0, 15).map(c => `- [${c.status.toUpperCase()}] ${c.name} (${c.controlRef}) — ${c.framework} / ${c.sourceIntegration}\n  ${c.summary}`).join("\n")
  }\n\nOpen Evidence Engine: ${deepLink}`;

  return { subject, html, text };
}

// ── Collect failed/stale controls from the DB for an evidence run ────────────
//
// Failed artifacts are collected in the current run and carry the new runId.
// Stale artifacts are marked by markStaleArtifacts() BEFORE collection begins,
// so they keep their previous runId — they must be queried by status, not runId.

async function loadFailedControls(
  tenantId: number,
  runId: string,
  includeStale: boolean
): Promise<FailedControlInfo[]> {
  // Build a filter that catches:
  //   - failed artifacts from the current run (runId matches)
  //   - stale artifacts for the tenant (any runId, current status = stale)
  const whereClause = includeStale
    ? and(
        eq(evidenceArtifactsTable.tenantId, tenantId),
        or(
          and(eq(evidenceArtifactsTable.runId, runId), eq(evidenceArtifactsTable.status, "failed")),
          eq(evidenceArtifactsTable.status, "stale")
        )
      )
    : and(
        eq(evidenceArtifactsTable.tenantId, tenantId),
        eq(evidenceArtifactsTable.runId, runId),
        eq(evidenceArtifactsTable.status, "failed")
      );

  const artifacts = await db
    .select()
    .from(evidenceArtifactsTable)
    .where(whereClause);

  // Deduplicate: keep one artifact per controlId (prefer failed over stale)
  const byControl = new Map<number, typeof artifacts[number]>();
  for (const a of artifacts) {
    const existing = byControl.get(a.controlId);
    if (!existing || (a.status === "failed" && existing.status !== "failed")) {
      byControl.set(a.controlId, a);
    }
  }
  const filtered = [...byControl.values()];

  if (filtered.length === 0) return [];

  const controlIds = [...new Set(filtered.map((a) => a.controlId))];
  const controls = await db
    .select()
    .from(controlsTable)
    .where(
      and(
        eq(controlsTable.tenantId, tenantId),
        inArray(controlsTable.id, controlIds)
      )
    );

  const controlMap = new Map(controls.map((c) => [c.id, c]));

  return filtered.map((a) => {
    const ctrl = controlMap.get(a.controlId);
    return {
      controlRef:        a.controlRef,
      name:              ctrl?.name ?? a.controlRef,
      framework:         ctrl?.framework ?? "Unknown",
      sourceIntegration: a.sourceIntegration,
      status:            a.status as "failed" | "stale",
      summary:           a.summary,
    };
  });
}

// ── Send a single alert delivery ──────────────────────────────────────────────

async function deliverAlert(
  tenantId: number,
  runId: number,
  channel: "email" | "slack",
  destination: string,
  summary: AlertRunSummary
): Promise<void> {
  const [histRow] = await db
    .insert(evidenceAlertHistoryTable)
    .values({
      tenantId,
      runId: summary.runId,
      channel,
      destination,
      failedCount:    summary.failed,
      staleCount:     summary.stale,
      failedControls: summary.failedControls,
      status:         "pending",
    })
    .returning();

  let status = "sent";
  let error: string | null = null;

  try {
    if (channel === "slack") {
      const validation = validateSlackWebhookUrl(destination);
      if (!validation.valid) throw new Error(`Invalid Slack webhook: ${validation.reason}`);

      const blocks = buildSlackBlocks(summary);
      const fallbackText = `DuFense Alert: ${summary.failed} control(s) failed evidence collection (run ${summary.runId})`;

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
      if (!apiKey) {
        throw new Error("SENDGRID_API_KEY is not configured — email delivery unavailable");
      }
      const { subject, html, text } = buildEmailHtml(summary);
      const payload = {
        personalizations: [{ to: [{ email: destination }] }],
        from: { email: process.env["SENDGRID_FROM_EMAIL"] ?? "noreply@dufense.io", name: "DuFense Evidence Alerts" },
        subject,
        content: [
          { type: "text/plain", value: text },
          { type: "text/html", value: html },
        ],
      };
      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`SendGrid returned ${response.status}: ${body}`);
      }
    }

    console.log(`[evidence-alert] Delivered ${channel} alert for run ${summary.runId} → ${destination}`);
  } catch (err) {
    status = "failed";
    error = err instanceof Error ? err.message : String(err);
    console.error(`[evidence-alert] Failed to deliver ${channel} alert for run ${summary.runId}:`, error);
  }

  await db
    .update(evidenceAlertHistoryTable)
    .set({ status, error, sentAt: status === "sent" ? new Date() : undefined })
    .where(eq(evidenceAlertHistoryTable.id, histRow!.id));
}

// ── Main entry point — called after each evidence run ────────────────────────

export async function sendEvidenceAlerts(
  tenantId: number,
  runId: string,
  failed: number,
  stale: number,
  total: number
): Promise<void> {
  // Load settings
  const [settings] = await db
    .select()
    .from(evidenceAlertSettingsTable)
    .where(eq(evidenceAlertSettingsTable.tenantId, tenantId))
    .limit(1);

  if (!settings || !settings.enabled) return;

  const shouldAlert =
    (settings.alertOnFailed && failed >= settings.minFailedCount) ||
    (settings.alertOnStale  && stale  >= settings.minFailedCount);

  if (!shouldAlert) return;

  // Load detailed control info
  const failedControls = await loadFailedControls(tenantId, runId, settings.alertOnStale);

  if (failedControls.length === 0) return;

  const summary: AlertRunSummary = { runId, tenantId, total, failed, stale, failedControls };

  const deliveries: Promise<void>[] = [];

  // Slack
  if (settings.slackWebhookUrl) {
    deliveries.push(deliverAlert(tenantId, 0, "slack", settings.slackWebhookUrl, summary));
  }

  // Email — emailRecipients is stored as JSON array of strings
  const recipients = (settings.emailRecipients as string[]) ?? [];
  for (const email of recipients) {
    if (email && typeof email === "string") {
      deliveries.push(deliverAlert(tenantId, 0, "email", email, summary));
    }
  }

  if (deliveries.length === 0) {
    console.log(`[evidence-alert] Alert triggered for run ${runId} but no channels configured`);
    return;
  }

  await Promise.allSettled(deliveries);
}
