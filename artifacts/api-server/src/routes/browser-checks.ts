/**
 * Browser Check API
 *
 * Routes:
 *   GET    /api/browser-check-templates                              — list pre-built templates
 *   GET    /api/controls/:controlId/browser-checks                  — list checks for a control
 *   POST   /api/controls/:controlId/browser-checks                  — create OR update a check definition
 *   PUT    /api/controls/:controlId/browser-checks/:checkId         — update a specific check
 *   DELETE /api/controls/:controlId/browser-checks/:checkId         — delete a check definition
 *   POST   /api/controls/:controlId/browser-checks/:checkId/run     — trigger on-demand run
 *   GET    /api/controls/:controlId/browser-checks/runs             — list runs for a control
 *   GET    /api/controls/:controlId/browser-checks/export/pdf       — export evidence package as PDF
 *   GET    /api/browser-check-runs/:runId                           — poll a specific run
 *   GET    /api/objects/*                                           — serve tenant-scoped screenshots
 */

import { Router } from "express";
import { eq, and, desc, inArray } from "drizzle-orm";
import PDFDocument from "pdfkit";
import { db } from "../lib/db";
import {
  browserChecksTable,
  browserCheckRunsTable,
  controlsTable,
  evidenceArtifactsTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";
import type { JwtPayload } from "../lib/auth";
import type { Request, Response } from "express";
import { runBrowserCheck, validateUrl } from "../services/browser-verification/BrowserVerificationService";
import { BROWSER_CHECK_TEMPLATES } from "../services/browser-verification/BrowserCheckTemplates";
import { objectStorage, ObjectNotFoundError } from "../lib/objectStorage";
import { writeBrowserCheckEvidenceArtifact } from "../services/browser-verification/BrowserCheckEvidenceWriter";
import { sendEvidenceAlerts } from "../services/evidence-alert";
import { sendBrowserCheckAlerts } from "../services/browser-check-alert";
import { validateSlackWebhookUrl } from "../services/briefing-generator";

const router = Router();
type AuthReq = Request & { user: JwtPayload };

// ── In-flight run guard (prevent concurrent runs for same check) ───────────────
const runningChecks = new Set<string>();

// ── Template listing ──────────────────────────────────────────────────────────

router.get("/browser-check-templates", requireAuth, (_req, res) => {
  res.json(BROWSER_CHECK_TEMPLATES);
});

// ── Tenant-scoped screenshot serving ─────────────────────────────────────────
// Validates that the requested screenshot path is associated with the requesting
// tenant's browser check runs before serving — prevents cross-tenant exposure.

router.get(/^\/objects\/(.+)$/, requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const tid = Number(tenantId);
    const filePath = (req.params as Record<string, string>)[0] ?? "";
    const objectPath = `/objects/${filePath}`;

    // Authorization: verify this path is referenced by a run or evidence artifact
    // belonging to the requesting tenant before serving.
    const [run] = await db
      .select({ id: browserCheckRunsTable.id })
      .from(browserCheckRunsTable)
      .where(and(
        eq(browserCheckRunsTable.tenantId, tid),
        eq(browserCheckRunsTable.screenshotUrl, objectPath),
      ))
      .limit(1);

    const [artifact] = run ? [run] : await db
      .select({ id: evidenceArtifactsTable.id })
      .from(evidenceArtifactsTable)
      .where(and(
        eq(evidenceArtifactsTable.tenantId, tid),
        eq(evidenceArtifactsTable.screenshotUrl, objectPath),
      ))
      .limit(1);

    if (!artifact) {
      res.status(403).json({ error: "Forbidden: object does not belong to your tenant" });
      return;
    }

    const file = await objectStorage.getObjectEntityFile(objectPath);
    const response = await objectStorage.downloadObject(file);
    const headers: Record<string, string> = {};
    response.headers.forEach((val: string, key: string) => { headers[key] = val; });
    res.set(headers).status(200);
    const reader = response.body!.getReader();
    const pump = async (): Promise<void> => {
      const { done, value } = await reader.read();
      if (done) { res.end(); return; }
      res.write(Buffer.from(value));
      return pump();
    };
    await pump();
  } catch (err) {
    if (err instanceof ObjectNotFoundError) { res.status(404).json({ error: "Not found" }); return; }
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "403") { res.status(403).json({ error: "Forbidden" }); return; }
    res.status(500).json({ error: "Storage error" });
  }
});

// ── Helper: resolve a numeric or text controlId to a DB row ──────────────────
async function resolveControl(tenantId: number, controlId: string) {
  const numId = parseInt(controlId, 10);
  if (!isNaN(numId)) {
    const [ctrl] = await db.select().from(controlsTable)
      .where(and(eq(controlsTable.id, numId), eq(controlsTable.tenantId, tenantId)));
    return ctrl ?? null;
  }
  const [ctrl] = await db.select().from(controlsTable)
    .where(and(eq(controlsTable.controlId, controlId), eq(controlsTable.tenantId, tenantId)));
  return ctrl ?? null;
}

// ── List checks for a control ─────────────────────────────────────────────────

router.get("/controls/:controlId/browser-checks", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const tid = Number(tenantId);
    const ctrl = await resolveControl(tid, String(req.params.controlId ?? ""));
    if (!ctrl) return res.status(404).json({ error: "Control not found" });

    const checks = await db.select().from(browserChecksTable)
      .where(and(eq(browserChecksTable.tenantId, tid), eq(browserChecksTable.controlId, ctrl.id)))
      .orderBy(desc(browserChecksTable.createdAt));

    return res.json(checks.map(c => ({
      id:                   c.id,
      checkId:              c.checkId,
      name:                 c.name,
      url:                  c.url,
      instruction:          c.instruction,
      templateId:           c.templateId,
      scheduleCron:         c.scheduleCron,
      enabled:              c.enabled,
      lastRunAt:            c.lastRunAt?.toISOString() ?? null,
      lastStatus:           c.lastStatus,
      lastError:            c.lastError,
      alertSlackWebhookUrl: c.alertSlackWebhookUrl ?? null,
      alertEmailRecipients: (c.alertEmailRecipients as string[] | null) ?? [],
      createdAt:            c.createdAt.toISOString(),
    })));
  } catch { return res.status(500).json({ error: "Internal server error" }); }
});

// ── Create OR update a check definition (POST = upsert by checkId) ────────────
// If `checkId` is provided in the body and matches an existing check owned by
// this tenant, the existing record is updated. Otherwise a new check is created.

router.post("/controls/:controlId/browser-checks", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const tid = Number(tenantId);
    const ctrl = await resolveControl(tid, String(req.params.controlId ?? ""));
    if (!ctrl) return res.status(404).json({ error: "Control not found" });

    const { checkId: existingCheckId, name, url, instruction, templateId, scheduleCron, enabled } = req.body as {
      checkId?: string; name: string; url: string; instruction: string;
      templateId?: string; scheduleCron?: string; enabled?: boolean;
    };

    if (!name || !url || !instruction) {
      return res.status(400).json({ error: "name, url, and instruction are required" });
    }

    // SSRF protection: DNS-resolved URL validation at save time
    try { await validateUrl(url); } catch (e) {
      return res.status(400).json({ error: (e as Error).message });
    }

    // If an existing checkId is provided, attempt an update first
    if (existingCheckId) {
      const [existing] = await db.select().from(browserChecksTable)
        .where(and(eq(browserChecksTable.tenantId, tid), eq(browserChecksTable.checkId, existingCheckId)));

      if (existing) {
        const [updated] = await db.update(browserChecksTable)
          .set({
            name,
            url,
            instruction,
            templateId: templateId ?? existing.templateId,
            scheduleCron: scheduleCron ?? existing.scheduleCron,
            enabled: enabled !== undefined ? enabled : existing.enabled,
            updatedAt: new Date(),
          })
          .where(and(eq(browserChecksTable.tenantId, tid), eq(browserChecksTable.checkId, existingCheckId)))
          .returning();

        return res.json({
          id:           updated!.id,
          checkId:      updated!.checkId,
          name:         updated!.name,
          url:          updated!.url,
          instruction:  updated!.instruction,
          templateId:   updated!.templateId,
          scheduleCron: updated!.scheduleCron,
          enabled:      updated!.enabled,
          lastRunAt:    updated!.lastRunAt?.toISOString() ?? null,
          lastStatus:   updated!.lastStatus,
          createdAt:    updated!.createdAt.toISOString(),
        });
      }
    }

    // Insert new check
    const newCheckId = `bc-${ctrl.controlId}-${Date.now()}`;
    const [row] = await db.insert(browserChecksTable).values({
      tenantId: tid,
      checkId: newCheckId,
      controlId: ctrl.id,
      controlRef: ctrl.controlId,
      name,
      url,
      instruction,
      templateId: templateId ?? null,
      scheduleCron: scheduleCron ?? "0 8 * * *",
      enabled: enabled !== false,
    }).returning();

    return res.status(201).json({
      id:           row!.id,
      checkId:      row!.checkId,
      name:         row!.name,
      url:          row!.url,
      instruction:  row!.instruction,
      templateId:   row!.templateId,
      scheduleCron: row!.scheduleCron,
      enabled:      row!.enabled,
      lastRunAt:    null,
      lastStatus:   null,
      createdAt:    row!.createdAt.toISOString(),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── PUT — explicit update of a specific check definition ─────────────────────

router.put("/controls/:controlId/browser-checks/:checkId", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const tid = Number(tenantId);
    const { checkId } = req.params as { checkId: string };

    const { name, url, instruction, templateId, scheduleCron, enabled } = req.body as {
      name?: string; url?: string; instruction?: string;
      templateId?: string; scheduleCron?: string; enabled?: boolean;
    };

    if (url) {
      try { await validateUrl(url); } catch (e) {
        return res.status(400).json({ error: (e as Error).message });
      }
    }

    const [existing] = await db.select().from(browserChecksTable)
      .where(and(eq(browserChecksTable.tenantId, tid), eq(browserChecksTable.checkId, checkId)));
    if (!existing) return res.status(404).json({ error: "Check not found" });

    const [updated] = await db.update(browserChecksTable)
      .set({
        ...(name        !== undefined && { name }),
        ...(url         !== undefined && { url }),
        ...(instruction !== undefined && { instruction }),
        ...(templateId  !== undefined && { templateId }),
        ...(scheduleCron !== undefined && { scheduleCron }),
        ...(enabled     !== undefined && { enabled }),
        updatedAt: new Date(),
      })
      .where(and(eq(browserChecksTable.tenantId, tid), eq(browserChecksTable.checkId, checkId)))
      .returning();

    return res.json({
      id:           updated!.id,
      checkId:      updated!.checkId,
      name:         updated!.name,
      url:          updated!.url,
      instruction:  updated!.instruction,
      templateId:   updated!.templateId,
      scheduleCron: updated!.scheduleCron,
      enabled:      updated!.enabled,
      lastRunAt:    updated!.lastRunAt?.toISOString() ?? null,
      lastStatus:   updated!.lastStatus,
      createdAt:    updated!.createdAt.toISOString(),
    });
  } catch { return res.status(500).json({ error: "Internal server error" }); }
});

// ── Delete a check definition ─────────────────────────────────────────────────

router.delete("/controls/:controlId/browser-checks/:checkId", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const tid = Number(tenantId);
    await db.delete(browserChecksTable)
      .where(and(
        eq(browserChecksTable.tenantId, tid),
        eq(browserChecksTable.checkId, String(req.params.checkId ?? "")),
      ));
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: "Internal server error" }); }
});

// ── List runs for a control ───────────────────────────────────────────────────

router.get("/controls/:controlId/browser-checks/runs", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const tid = Number(tenantId);
    const ctrl = await resolveControl(tid, String(req.params.controlId ?? ""));
    if (!ctrl) return res.status(404).json({ error: "Control not found" });

    const checks = await db.select({ checkId: browserChecksTable.checkId })
      .from(browserChecksTable)
      .where(and(eq(browserChecksTable.tenantId, tid), eq(browserChecksTable.controlId, ctrl.id)));

    const checkIds = checks.map(c => c.checkId);
    if (checkIds.length === 0) return res.json([]);

    // Filter by checkIds at DB level before applying the limit so run history is accurate
    const runs = await db.select().from(browserCheckRunsTable)
      .where(and(
        eq(browserCheckRunsTable.tenantId, tid),
        inArray(browserCheckRunsTable.checkId, checkIds),
      ))
      .orderBy(desc(browserCheckRunsTable.createdAt))
      .limit(50);

    return res.json(runs.map(r => ({
      id:            r.id,
      runId:         r.runId,
      checkId:       r.checkId,
      controlRef:    r.controlRef,
      status:        r.status,
      screenshotUrl: r.screenshotUrl,
      verdict:       r.verdict,
      errorMessage:  r.errorMessage,
      durationMs:    r.durationMs,
      triggeredBy:   r.triggeredBy,
      createdAt:     r.createdAt.toISOString(),
    })));
  } catch { return res.status(500).json({ error: "Internal server error" }); }
});

// ── PDF Evidence Package Export ───────────────────────────────────────────────
// GET /controls/:controlId/browser-checks/export/pdf
// Generates a PDF evidence package containing check definitions and run history
// (verdict, screenshot, timestamp) for all browser checks on a control.

router.get("/controls/:controlId/browser-checks/export/pdf", requireAuth, async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const tid = Number(tenantId);
    const ctrl = await resolveControl(tid, String(req.params.controlId ?? ""));
    if (!ctrl) { res.status(404).json({ error: "Control not found" }); return; }

    const checks = await db.select().from(browserChecksTable)
      .where(and(eq(browserChecksTable.tenantId, tid), eq(browserChecksTable.controlId, ctrl.id)))
      .orderBy(desc(browserChecksTable.createdAt));

    const checkIds = checks.map(c => c.checkId);

    const allRuns = checkIds.length > 0
      ? await db.select().from(browserCheckRunsTable)
          .where(and(
            eq(browserCheckRunsTable.tenantId, tid),
            inArray(browserCheckRunsTable.checkId, checkIds),
          ))
          .orderBy(desc(browserCheckRunsTable.createdAt))
          .limit(200)
      : [];

    // Pre-download all unique screenshot blobs from object storage
    const screenshotUrls = [...new Set(allRuns.map(r => r.screenshotUrl).filter((u): u is string => !!u))];
    const screenshotBuffers = new Map<string, Buffer>();
    await Promise.all(
      screenshotUrls.map(async (objPath) => {
        try {
          const file = await objectStorage.getObjectEntityFile(objPath);
          const [buf] = await file.download();
          if (buf) screenshotBuffers.set(objPath, buf);
        } catch {
          // Skip missing screenshots — continue building PDF
        }
      })
    );

    const safeControlRef = ctrl.controlId.replace(/[^a-z0-9_-]/gi, "_");
    const filename = `${safeControlRef}_browser_check_evidence.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ margin: 50, size: "A4", autoFirstPage: true });
    doc.pipe(res);

    const PAGE_W = 595 - 100; // A4 width minus margins
    const BLUE = "#3B82F6";
    const GREEN = "#059669";
    const RED = "#DC2626";
    const AMBER = "#D97706";
    const GRAY = "#6B7280";
    const DARK = "#1E293B";

    // ── Cover ──────────────────────────────────────────────────────────────────
    doc.rect(0, 0, 595, 180).fill("#0F172A");
    doc.fontSize(9).font("Helvetica").fillColor("#94A3B8").text("DUFENSE GRC PLATFORM", 50, 40, { align: "left" });
    doc.fontSize(22).font("Helvetica-Bold").fillColor("#FFFFFF").text("Browser Check Evidence Package", 50, 60, { width: PAGE_W });
    doc.fontSize(11).font("Helvetica").fillColor("#94A3B8").text(`Control: ${ctrl.controlId}`, 50, 100);
    doc.text(`Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}`, 50, 118);
    doc.text(`Checks: ${checks.length}   |   Runs: ${allRuns.length}`, 50, 136);

    doc.fillColor(DARK).moveDown(0);
    doc.y = 200;

    // ── Summary table ──────────────────────────────────────────────────────────
    const passCount = allRuns.filter(r => r.verdict === "pass").length;
    const failCount = allRuns.filter(r => r.verdict === "fail").length;
    const errCount  = allRuns.filter(r => r.verdict === "error").length;

    doc.fontSize(13).font("Helvetica-Bold").fillColor(DARK).text("Summary", 50, doc.y);
    doc.moveDown(0.4);
    doc.fontSize(10).font("Helvetica").fillColor(GRAY);
    doc.text(`Total checks defined: ${checks.length}`, { indent: 12 });
    doc.text(`Total runs recorded: ${allRuns.length}`, { indent: 12 });
    doc.fillColor(GREEN).text(`Pass: ${passCount}`, { indent: 12 });
    doc.fillColor(RED).text(`Fail: ${failCount}`, { indent: 12 });
    doc.fillColor(AMBER).text(`Error: ${errCount}`, { indent: 12 });
    doc.fillColor(DARK);
    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#E2E8F0").lineWidth(1).stroke();
    doc.moveDown(1);

    // ── One section per browser check ─────────────────────────────────────────
    for (const check of checks) {
      // Add a new page for each check (except the first section which follows summary)
      if (doc.y > 650) doc.addPage();

      doc.fontSize(13).font("Helvetica-Bold").fillColor(BLUE).text(`🤖 ${check.name}`, 50, doc.y, { width: PAGE_W });
      doc.moveDown(0.3);

      doc.fontSize(9).font("Helvetica").fillColor(GRAY);
      doc.text(`Control Ref: ${check.controlRef}   |   Check ID: ${check.checkId}`, { indent: 0 });
      doc.text(`URL: ${check.url}`, { indent: 0 });
      doc.text(`Schedule: ${check.scheduleCron}   |   Enabled: ${check.enabled ? "Yes" : "No"}   |   Created: ${new Date(check.createdAt).toLocaleDateString("en-US")}`, { indent: 0 });
      if (check.templateId) doc.text(`Template: ${check.templateId}`, { indent: 0 });
      doc.moveDown(0.4);

      doc.fontSize(9).font("Helvetica-Bold").fillColor(DARK).text("Verification Instruction:", { indent: 0 });
      doc.fontSize(9).font("Helvetica").fillColor(DARK).text(check.instruction, { indent: 12, width: PAGE_W - 12, lineGap: 2 });
      doc.moveDown(0.6);

      const checkRuns = allRuns.filter(r => r.checkId === check.checkId);

      if (checkRuns.length === 0) {
        doc.fontSize(9).font("Helvetica").fillColor(GRAY).text("No runs recorded for this check.", { indent: 12 });
        doc.moveDown(0.8);
      } else {
        doc.fontSize(9).font("Helvetica-Bold").fillColor(DARK).text(`Run History (${checkRuns.length} run${checkRuns.length !== 1 ? "s" : ""}):`);
        doc.moveDown(0.3);

        for (const run of checkRuns) {
          if (doc.y > 700) doc.addPage();

          const verdictColor = run.verdict === "pass" ? GREEN : run.verdict === "fail" ? RED : run.verdict === "error" ? AMBER : GRAY;
          const verdictLabel = (run.verdict ?? run.status ?? "unknown").toUpperCase();
          const runDate = new Date(run.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
          const duration = run.durationMs != null ? `${(run.durationMs / 1000).toFixed(1)}s` : "—";

          doc.fontSize(9).font("Helvetica-Bold").fillColor(verdictColor).text(`▸ ${verdictLabel}`, 62, doc.y, { continued: true });
          doc.font("Helvetica").fillColor(GRAY).text(`   ${runDate}   duration: ${duration}   by: ${run.triggeredBy ?? "—"}`, { continued: false });
          doc.moveDown(0.2);

          if (run.errorMessage) {
            doc.fontSize(8.5).font("Helvetica").fillColor(RED).text(`  Error: ${run.errorMessage}`, { indent: 24, width: PAGE_W - 24 });
            doc.moveDown(0.2);
          }

          // Embed screenshot if we have it
          const screenshotUrl = run.screenshotUrl;
          if (screenshotUrl) {
            const imgBuf = screenshotBuffers.get(screenshotUrl);
            if (imgBuf) {
              if (doc.y > 650) doc.addPage();
              try {
                doc.image(imgBuf, 74, doc.y, { width: Math.min(PAGE_W - 24, 420) });
                doc.moveDown(0.5);
              } catch {
                doc.fontSize(8).font("Helvetica").fillColor(GRAY).text("  [Screenshot could not be embedded]", { indent: 24 });
                doc.moveDown(0.2);
              }
            } else {
              doc.fontSize(8).font("Helvetica").fillColor(GRAY).text("  [Screenshot not available]", { indent: 24 });
              doc.moveDown(0.2);
            }
          }
          doc.moveDown(0.3);
        }
      }

      // Separator between checks
      doc.moveDown(0.4);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#E2E8F0").lineWidth(1).stroke();
      doc.moveDown(0.8);
    }

    // ── Footer ─────────────────────────────────────────────────────────────────
    doc.moveDown(1);
    doc.fontSize(8).font("Helvetica").fillColor(GRAY)
      .text(`Generated by AIGO-X GRC Platform — ${new Date().toISOString()} — Confidential`, { align: "center" });

    doc.end();
    return;
  } catch (err) {
    console.error("[browser-checks] PDF export failed:", err);
    if (!res.headersSent) res.status(500).json({ error: "PDF export failed" });
  }
});

// ── Control-level run trigger (POST /controls/:controlId/browser-checks/run) ──
// Runs the first enabled check for the control, or the one specified by
// optional body.checkId. Satisfies the documented control-level trigger contract.

router.post("/controls/:controlId/browser-checks/run", requireAuth, async (req: Request, res: Response) => {
  const { tenantId, email } = (req as AuthReq).user;
  const tid = Number(tenantId);
  const ctrl = await resolveControl(tid, String(req.params.controlId ?? ""));
  if (!ctrl) return res.status(404).json({ error: "Control not found" });

  const { checkId: requestedCheckId } = (req.body ?? {}) as { checkId?: string };

  // Resolve which check to run
  let check;
  if (requestedCheckId) {
    const [row] = await db.select().from(browserChecksTable)
      .where(and(eq(browserChecksTable.tenantId, tid), eq(browserChecksTable.checkId, requestedCheckId)));
    check = row;
  } else {
    const [row] = await db.select().from(browserChecksTable)
      .where(and(eq(browserChecksTable.tenantId, tid), eq(browserChecksTable.controlId, ctrl.id), eq(browserChecksTable.enabled, true)))
      .limit(1);
    check = row;
  }

  if (!check) return res.status(404).json({ error: "No enabled browser check found for this control" });
  if (runningChecks.has(check.checkId)) {
    return res.status(409).json({ error: "Check already running. Please wait." });
  }

  const runId = `bcr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await db.insert(browserCheckRunsTable).values({
    tenantId: tid,
    runId,
    checkId: check.checkId,
    controlRef: check.controlRef,
    status: "running",
    triggeredBy: String(email ?? "user"),
  });

  res.status(202).json({
    runId,
    checkId: check.checkId,
    status: "running",
    message: "Browser check started. Poll /browser-check-runs/:runId to see result.",
  });

  runningChecks.add(check.checkId);
  const capturedCheck = check;
  const previousStatus1 = check.lastStatus;
  const perCheckConfig1 = {
    slackWebhookUrl: capturedCheck.alertSlackWebhookUrl ?? null,
    emailRecipients: (capturedCheck.alertEmailRecipients as string[] | null) ?? null,
  };
  (async () => {
    try {
      const result = await runBrowserCheck(capturedCheck.url, capturedCheck.instruction);
      await db.update(browserCheckRunsTable)
        .set({ status: result.verdict, screenshotUrl: result.screenshotPath, verdict: result.verdict, errorMessage: result.verdict === "error" ? result.summary : null, durationMs: result.durationMs })
        .where(and(eq(browserCheckRunsTable.tenantId, tid), eq(browserCheckRunsTable.runId, runId)));
      await db.update(browserChecksTable)
        .set({ lastRunAt: new Date(), lastStatus: result.verdict, lastError: result.verdict === "error" ? result.summary : null, updatedAt: new Date() })
        .where(and(eq(browserChecksTable.tenantId, tid), eq(browserChecksTable.checkId, capturedCheck.checkId)));
      try {
        const { artifactRunId, failed } = await writeBrowserCheckEvidenceArtifact({ tenantId: tid, check: capturedCheck, result, triggeredBy: String(email ?? "user") });
        if (failed > 0) sendEvidenceAlerts(tid, artifactRunId, failed, 0, 1).catch(e => console.error("[browser-checks] Alert failed:", e));
      } catch (e) { console.error("[browser-checks] Evidence write failed:", e); }
      if (result.verdict === "fail" || result.verdict === "error") {
        sendBrowserCheckAlerts(tid, {
          runId,
          checkId:        capturedCheck.checkId,
          checkName:      capturedCheck.name,
          url:            capturedCheck.url,
          verdict:        result.verdict as "fail" | "error",
          controlRef:     capturedCheck.controlRef,
          screenshotUrl:  result.screenshotPath ?? null,
          errorMessage:   result.verdict === "error" ? result.summary : null,
          previousStatus: previousStatus1,
        }, perCheckConfig1).catch(e => console.error("[browser-checks] Browser check alert failed:", e));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await db.update(browserCheckRunsTable).set({ status: "error", errorMessage: msg, durationMs: 0 }).where(and(eq(browserCheckRunsTable.tenantId, tid), eq(browserCheckRunsTable.runId, runId)));
      await db.update(browserChecksTable).set({ lastRunAt: new Date(), lastStatus: "error", lastError: msg, updatedAt: new Date() }).where(and(eq(browserChecksTable.tenantId, tid), eq(browserChecksTable.checkId, capturedCheck.checkId)));
      sendBrowserCheckAlerts(tid, {
        runId, checkId: capturedCheck.checkId, checkName: capturedCheck.name,
        url: capturedCheck.url, verdict: "error", controlRef: capturedCheck.controlRef,
        screenshotUrl: null, errorMessage: msg,
        previousStatus: previousStatus1,
      }, perCheckConfig1).catch(e => console.error("[browser-checks] Browser check alert (catch) failed:", e));
    } finally { runningChecks.delete(capturedCheck.checkId); }
  })();
  return;
});

// ── Trigger an on-demand run ──────────────────────────────────────────────────

router.post("/controls/:controlId/browser-checks/:checkId/run", requireAuth, async (req: Request, res: Response) => {
  const { tenantId, email } = (req as AuthReq).user;
  const tid = Number(tenantId);
  const { checkId } = req.params as { checkId: string };

  if (runningChecks.has(checkId)) {
    return res.status(409).json({ error: "Check already running. Please wait." });
  }

  const [check] = await db.select().from(browserChecksTable)
    .where(and(eq(browserChecksTable.tenantId, tid), eq(browserChecksTable.checkId, checkId)));
  if (!check) return res.status(404).json({ error: "Check not found" });

  const runId = `bcr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await db.insert(browserCheckRunsTable).values({
    tenantId: tid,
    runId,
    checkId: check.checkId,
    controlRef: check.controlRef,
    status: "running",
    triggeredBy: String(email ?? "user"),
  });

  res.status(202).json({
    runId,
    status: "running",
    message: "Browser check started. Poll /runs to see result.",
  });

  const previousStatus2 = check.lastStatus;
  const perCheckConfig2 = {
    slackWebhookUrl: check.alertSlackWebhookUrl ?? null,
    emailRecipients: (check.alertEmailRecipients as string[] | null) ?? null,
  };
  runningChecks.add(checkId);
  (async () => {
    try {
      const result = await runBrowserCheck(check.url, check.instruction);

      await db.update(browserCheckRunsTable)
        .set({
          status:        result.verdict,
          screenshotUrl: result.screenshotPath,
          verdict:       result.verdict,
          errorMessage:  result.verdict === "error" ? result.summary : null,
          durationMs:    result.durationMs,
        })
        .where(and(eq(browserCheckRunsTable.tenantId, tid), eq(browserCheckRunsTable.runId, runId)));

      await db.update(browserChecksTable)
        .set({
          lastRunAt:  new Date(),
          lastStatus: result.verdict,
          lastError:  result.verdict === "error" ? result.summary : null,
          updatedAt:  new Date(),
        })
        .where(and(eq(browserChecksTable.tenantId, tid), eq(browserChecksTable.checkId, checkId)));

      // Write evidence artifact → Evidence Library + alert pipeline
      try {
        const { artifactRunId, failed } = await writeBrowserCheckEvidenceArtifact({
          tenantId: tid, check, result, triggeredBy: String(email ?? "user"),
        });
        if (failed > 0) {
          sendEvidenceAlerts(tid, artifactRunId, failed, 0, 1).catch((e) =>
            console.error(`[browser-checks] Alert dispatch failed for run ${runId}:`, e)
          );
        }
      } catch (e) {
        console.error(`[browser-checks] Evidence artifact write failed for run ${runId}:`, e);
      }
      // Browser-check alert — only fires on verdict transition to fail/error
      if (result.verdict === "fail" || result.verdict === "error") {
        sendBrowserCheckAlerts(tid, {
          runId,
          checkId:        check.checkId,
          checkName:      check.name,
          url:            check.url,
          verdict:        result.verdict as "fail" | "error",
          controlRef:     check.controlRef,
          screenshotUrl:  result.screenshotPath ?? null,
          errorMessage:   result.verdict === "error" ? result.summary : null,
          previousStatus: previousStatus2,
        }, perCheckConfig2).catch((e) =>
          console.error(`[browser-checks] Browser check alert failed for run ${runId}:`, e)
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await db.update(browserCheckRunsTable)
        .set({ status: "error", errorMessage: msg, durationMs: 0 })
        .where(and(eq(browserCheckRunsTable.tenantId, tid), eq(browserCheckRunsTable.runId, runId)));
      await db.update(browserChecksTable)
        .set({ lastRunAt: new Date(), lastStatus: "error", lastError: msg, updatedAt: new Date() })
        .where(and(eq(browserChecksTable.tenantId, tid), eq(browserChecksTable.checkId, checkId)));
      sendBrowserCheckAlerts(tid, {
        runId, checkId: check.checkId, checkName: check.name,
        url: check.url, verdict: "error", controlRef: check.controlRef,
        screenshotUrl: null, errorMessage: msg,
        previousStatus: previousStatus2,
      }, perCheckConfig2).catch((e) =>
        console.error(`[browser-checks] Browser check alert (catch) failed for run ${runId}:`, e)
      );
    } finally {
      runningChecks.delete(checkId);
    }
  })();
  return;
});

// ── Per-check alert destination override ─────────────────────────────────────
// PUT /controls/:controlId/browser-checks/:checkId/alert-config
// Saves per-check Slack webhook and/or email recipients. When set, these are
// used instead of the tenant-global defaults. Pass null/empty to fall back.

router.put("/controls/:controlId/browser-checks/:checkId/alert-config", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const tid = Number(tenantId);
    const { checkId } = req.params as { checkId: string };
    const { slackWebhookUrl, emailRecipients } = req.body as {
      slackWebhookUrl?: string | null;
      emailRecipients?: string[];
    };

    // Validate inputs before touching the DB
    if (slackWebhookUrl) {
      const v = validateSlackWebhookUrl(slackWebhookUrl);
      if (!v.valid) return res.status(400).json({ error: `Invalid Slack webhook URL: ${v.reason}` });
    }
    if (emailRecipients !== undefined && !Array.isArray(emailRecipients)) {
      return res.status(400).json({ error: "emailRecipients must be an array of strings" });
    }
    if (Array.isArray(emailRecipients)) {
      const invalid = emailRecipients.filter(e => typeof e !== "string" || !e.includes("@"));
      if (invalid.length > 0) return res.status(400).json({ error: `Invalid email addresses: ${invalid.join(", ")}` });
    }

    const [check] = await db.select().from(browserChecksTable)
      .where(and(eq(browserChecksTable.tenantId, tid), eq(browserChecksTable.checkId, checkId)));
    if (!check) return res.status(404).json({ error: "Check not found" });

    const [updated] = await db.update(browserChecksTable)
      .set({
        alertSlackWebhookUrl: slackWebhookUrl !== undefined ? (slackWebhookUrl || null) : check.alertSlackWebhookUrl,
        alertEmailRecipients: emailRecipients !== undefined
          ? emailRecipients.filter(e => typeof e === "string" && e.trim())
          : (check.alertEmailRecipients as string[] | null),
        updatedAt: new Date(),
      })
      .where(and(eq(browserChecksTable.tenantId, tid), eq(browserChecksTable.checkId, checkId)))
      .returning();

    return res.json({
      checkId:              updated!.checkId,
      alertSlackWebhookUrl: updated!.alertSlackWebhookUrl ?? null,
      alertEmailRecipients: (updated!.alertEmailRecipients as string[] | null) ?? [],
    });
  } catch (e) {
    console.error("[browser-checks] Per-check alert config update failed:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── Poll a specific run ───────────────────────────────────────────────────────

router.get("/browser-check-runs/:runId", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const tid = Number(tenantId);
    const [run] = await db.select().from(browserCheckRunsTable)
      .where(and(
        eq(browserCheckRunsTable.tenantId, tid),
        eq(browserCheckRunsTable.runId, String(req.params.runId ?? "")),
      ));
    if (!run) return res.status(404).json({ error: "Run not found" });
    return res.json({
      runId:         run.runId,
      checkId:       run.checkId,
      status:        run.status,
      screenshotUrl: run.screenshotUrl,
      verdict:       run.verdict,
      errorMessage:  run.errorMessage,
      durationMs:    run.durationMs,
      triggeredBy:   run.triggeredBy,
      createdAt:     run.createdAt.toISOString(),
    });
  } catch { return res.status(500).json({ error: "Internal server error" }); }
});

export default router;
