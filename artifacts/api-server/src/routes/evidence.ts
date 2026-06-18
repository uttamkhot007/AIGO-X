/**
 * Evidence Artifacts API
 *
 * Route contract:
 *   GET    /api/evidence/summary                  — per-control evidence status for the tenant
 *   GET    /api/evidence/runs                     — collection run history (last 20 runs)
 *   POST   /api/evidence/collect                  — trigger evidence collection for caller's tenant
 *   POST   /api/evidence/manual                   — manual evidence upload for a specific control
 *   GET    /api/evidence/bulk-export              — ZIP/PDF export for all evidence in a framework
 *   GET    /api/evidence/control-ref/:ref         — artifacts by control text ref (e.g. "A.9.4.2")
 *   GET    /api/evidence/settings                 — tenant evidence settings (stale threshold, cron)
 *   PUT    /api/evidence/settings                 — update tenant evidence settings
 *   GET    /api/evidence/:controlId               — artifacts by integer DB id (MUST be last)
 *   GET    /api/evidence/:controlId/export        — PDF/ZIP export for a single control
 */

import { Router } from "express";
import { eq, and, desc, inArray } from "drizzle-orm";
import { db } from "../lib/db";
import {
  evidenceArtifactsTable,
  evidenceEngineRunsTable,
  controlsTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";
import type { JwtPayload } from "../lib/auth";
import type { Request } from "express";
import {
  collectEvidence,
  buildManualArtifact,
  getTenantEvidenceSettings,
  setTenantEvidenceSettings,
  markStaleArtifacts,
  getCredentialStatuses,
  testCredential,
} from "../services/evidence-collector";
import { uploadBufferToStorage } from "../lib/objectStorage";
import PDFDocument from "pdfkit";
import AdmZip from "adm-zip";
import multer from "multer";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const router = Router();
type AuthReq = Request & { user: JwtPayload };

function fmtArtifact(row: typeof evidenceArtifactsTable.$inferSelect) {
  return {
    id:                row.id,
    artifactId:        row.artifactId,
    controlId:         row.controlId,
    controlRef:        row.controlRef,
    sourceIntegration: row.sourceIntegration,
    status:            row.status,
    rawPayload:        row.rawPayload,
    summary:           row.summary,
    collectorVersion:  row.collectorVersion,
    runId:             row.runId,
    collectedAt:       row.collectedAt.toISOString(),
    expiresAt:         row.expiresAt?.toISOString() ?? null,
  };
}

// ── Specific paths MUST precede /:controlId ───────────────────────────────────

// GET /evidence/summary — per-control evidence status for the tenant
// Also dynamically evaluates stale status against tenant threshold so the
// summary is always accurate even between scheduled sweeps.
router.get("/evidence/summary", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const tid = Number(tenantId);

    // Run a non-destructive stale sweep so summary reflects current age
    await markStaleArtifacts(tid);

    const { staleThresholdDays } = getTenantEvidenceSettings(tid);
    const staleBoundary = new Date();
    staleBoundary.setDate(staleBoundary.getDate() - staleThresholdDays);

    const controls = await db
      .select()
      .from(controlsTable)
      .where(eq(controlsTable.tenantId, tid));

    const artifacts = await db
      .select()
      .from(evidenceArtifactsTable)
      .where(eq(evidenceArtifactsTable.tenantId, tid));

    // Build per-control map: keep the most recently collected artifact per control
    const artifactByControl = new Map<number, typeof evidenceArtifactsTable.$inferSelect>();
    for (const a of artifacts) {
      const existing = artifactByControl.get(a.controlId);
      if (!existing || a.collectedAt > existing.collectedAt) {
        artifactByControl.set(a.controlId, a);
      }
    }

    const summary = controls.map((c) => {
      const art = artifactByControl.get(c.id);
      // Dynamically classify stale: if stored status is "fresh" but the artifact
      // is older than the tenant threshold, treat it as stale in the summary.
      let evidenceStatus = art ? art.status : "missing";
      if (evidenceStatus === "fresh" && art && art.collectedAt < staleBoundary) {
        evidenceStatus = "stale";
      }
      return {
        controlId:         c.id,
        controlRef:        c.controlId,
        name:              c.name,
        framework:         c.framework,
        evidenceStatus,
        sourceIntegration: art?.sourceIntegration ?? null,
        collectedAt:       art?.collectedAt.toISOString() ?? null,
        summary:           art?.summary ?? null,
      };
    });

    const freshCount   = summary.filter((s) => s.evidenceStatus === "fresh").length;
    const staleCount   = summary.filter((s) => s.evidenceStatus === "stale").length;
    const missingCount = summary.filter((s) => s.evidenceStatus === "missing").length;
    const failedCount  = summary.filter((s) => s.evidenceStatus === "failed").length;

    res.json({
      controls: summary,
      stats:    { fresh: freshCount, stale: staleCount, missing: missingCount, failed: failedCount, total: controls.length },
      settings: { staleThresholdDays },
    });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// GET /evidence/runs — collection run history (last 20)
router.get("/evidence/runs", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const rows = await db
      .select()
      .from(evidenceEngineRunsTable)
      .where(eq(evidenceEngineRunsTable.tenantId, Number(tenantId)))
      .orderBy(desc(evidenceEngineRunsTable.createdAt))
      .limit(20);

    res.json(rows.map((r) => ({
      id:          r.runId,
      timestamp:   r.createdAt.toISOString(),
      duration:    r.duration,
      total:       r.total,
      passed:      r.passed,
      failed:      r.failed,
      stale:       r.warnings,   // warnings column repurposed as stale count
      triggeredBy: r.triggeredBy,
    })));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// GET /evidence/settings — tenant evidence settings
router.get("/evidence/settings", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    res.json(getTenantEvidenceSettings(Number(tenantId)));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// PUT /evidence/settings — update tenant evidence settings
router.put("/evidence/settings", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const { staleThresholdDays, cronSchedule } = req.body as Partial<{
      staleThresholdDays: number;
      cronSchedule: string;
    }>;

    const update: Record<string, unknown> = {};
    if (typeof staleThresholdDays === "number" && staleThresholdDays > 0) update["staleThresholdDays"] = staleThresholdDays;
    if (typeof cronSchedule === "string" && cronSchedule.trim()) update["cronSchedule"] = cronSchedule.trim();

    if (Object.keys(update).length === 0) {
      res.status(400).json({ error: "No valid settings provided" });
      return;
    }

    setTenantEvidenceSettings(Number(tenantId), update as never);
    res.json(getTenantEvidenceSettings(Number(tenantId)));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// GET /evidence/credentials — which integration secrets are configured + account info
router.get("/evidence/credentials", requireAuth, async (_req, res) => {
  try {
    const statuses = await getCredentialStatuses();
    res.json(statuses);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// POST /evidence/credentials/test/:integration — live connection test
router.post("/evidence/credentials/test/:integration", requireAuth, async (req, res) => {
  try {
    const integration = req.params["integration"] as "github" | "aws" | "okta";
    if (!["github", "aws", "okta"].includes(integration)) {
      res.status(400).json({ error: "Unknown integration. Must be github, aws, or okta." });
      return;
    }
    const result = await testCredential(integration);
    res.json(result);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// POST /evidence/collect — manual trigger for evidence collection
router.post("/evidence/collect", requireAuth, async (req, res) => {
  try {
    const { tenantId, email } = (req as AuthReq).user;
    const result = await collectEvidence(Number(tenantId), String(email ?? "Admin"));
    res.json({ success: true, ...result });
  } catch {
    res.status(500).json({ error: "Collection failed" });
  }
});

// POST /documents/upload — multipart file upload saved to object storage + evidence_artifacts
router.post("/documents/upload", requireAuth, upload.single("file"), async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const tid = Number(tenantId);
    const file = (req as any).file as Express.Multer.File | undefined;

    if (!file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }

    const controlDbId  = req.body["controlDbId"]  ? Number(req.body["controlDbId"])  : null;
    const controlRef   = req.body["controlRef"]   ? String(req.body["controlRef"])   : "general";
    const evidenceType = req.body["evidenceType"] ? String(req.body["evidenceType"]) : "Document";
    const description  = req.body["description"]  ? String(req.body["description"])  : "";

    // Upload buffer to object storage (GCS via sidecar)
    const storageUrl = await uploadBufferToStorage(file.buffer, file.mimetype);

    const { staleThresholdDays } = getTenantEvidenceSettings(tid);
    const now = new Date();
    const exp = new Date(now);
    exp.setDate(exp.getDate() + staleThresholdDays);

    const artifactId  = `doc-${tid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const effectiveControlId = controlDbId ?? 0;

    const [row] = await db
      .insert(evidenceArtifactsTable)
      .values({
        tenantId:          tid,
        artifactId,
        controlId:         effectiveControlId,
        controlRef,
        sourceIntegration: "file-upload",
        status:            "fresh",
        rawPayload:        {
          fileName:     file.originalname,
          fileSize:     file.size,
          mimeType:     file.mimetype,
          storageUrl,
          evidenceType,
          description,
        },
        summary:           `${evidenceType}: ${file.originalname}${description ? " — " + description : ""}`,
        collectorVersion:  "1.0",
        collectedAt:       now,
        expiresAt:         exp,
      })
      .returning();

    res.status(201).json(fmtArtifact(row!));
  } catch (err: any) {
    console.error("Document upload error:", err);
    res.status(500).json({ error: err?.message ?? "Upload failed" });
  }
});

// GET /documents — list all file-upload artifacts for the tenant
router.get("/documents", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const rows = await db
      .select()
      .from(evidenceArtifactsTable)
      .where(
        and(
          eq(evidenceArtifactsTable.tenantId, Number(tenantId)),
          eq(evidenceArtifactsTable.sourceIntegration, "file-upload")
        )
      )
      .orderBy(desc(evidenceArtifactsTable.collectedAt));
    res.json(rows.map(fmtArtifact));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// POST /evidence/manual — manual evidence upload for a specific control
router.post("/evidence/manual", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const { controlDbId, controlRef, payload } = req.body as {
      controlDbId: number;
      controlRef: string;
      payload: Record<string, unknown>;
    };

    if (!controlDbId || !controlRef) {
      res.status(400).json({ error: "controlDbId and controlRef are required" });
      return;
    }

    const artifact   = buildManualArtifact(controlRef, payload ?? {});
    const artifactId = `ev-${tenantId}-${controlDbId}-manual`;
    const { staleThresholdDays } = getTenantEvidenceSettings(Number(tenantId));
    const now = new Date();
    const exp = new Date(now);
    exp.setDate(exp.getDate() + staleThresholdDays);

    const [row] = await db
      .insert(evidenceArtifactsTable)
      .values({
        tenantId:          Number(tenantId),
        artifactId,
        controlId:         controlDbId,
        controlRef,
        sourceIntegration: "manual",
        status:            "fresh",
        rawPayload:        artifact.rawPayload,
        summary:           artifact.summary,
        collectorVersion:  "1.0",
        collectedAt:       now,
        expiresAt:         exp,
      })
      .onConflictDoUpdate({
        target: [evidenceArtifactsTable.tenantId, evidenceArtifactsTable.artifactId],
        set: {
          status:      "fresh",
          rawPayload:  artifact.rawPayload,
          summary:     artifact.summary,
          collectedAt: now,
          expiresAt:   exp,
        },
      })
      .returning();

    res.status(201).json(fmtArtifact(row!));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Export helpers ────────────────────────────────────────────────────────────

type EvidenceRow = typeof evidenceArtifactsTable.$inferSelect;

function buildEvidencePdf(
  doc: InstanceType<typeof PDFDocument>,
  title: string,
  subtitle: string,
  groups: { controlRef: string; controlName: string; artifacts: EvidenceRow[] }[]
) {
  const exportDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const totalArtifacts = groups.reduce((n, g) => n + g.artifacts.length, 0);

  doc.fontSize(20).font("Helvetica-Bold").fillColor("#1E293B").text(title, { align: "center" });
  doc.moveDown(0.3);
  doc.fontSize(11).font("Helvetica").fillColor("#555555").text(subtitle, { align: "center" });
  doc.moveDown(0.3);
  doc.fontSize(9).fillColor("#888888")
    .text(`Exported: ${exportDate}   |   ${groups.length} control(s)   |   ${totalArtifacts} artifact(s)`, { align: "center" });
  doc.moveDown(0.8);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#DDDDDD").stroke();
  doc.moveDown(0.8);

  for (const group of groups) {
    doc.fontSize(12).font("Helvetica-Bold").fillColor("#1E40AF")
      .text(`${group.controlRef}  —  ${group.controlName}`);
    doc.moveDown(0.3);

    if (group.artifacts.length === 0) {
      doc.fontSize(9).font("Helvetica").fillColor("#9CA3AF").text("No artifacts collected for this control.", { indent: 12 });
      doc.moveDown(0.6);
      continue;
    }

    for (const art of group.artifacts) {
      const statusLabel = art.status === "fresh" ? "✓ Collected" : art.status === "stale" ? "⚠ Stale" : art.status === "failed" ? "✕ Failed" : "— Missing";
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#374151")
        .text(`${art.sourceIntegration?.toUpperCase() ?? "UNKNOWN"} Collector  [${statusLabel}]`, { indent: 12 });
      doc.fontSize(8.5).font("Helvetica").fillColor("#6B7280")
        .text(`Collected: ${art.collectedAt.toISOString()}   |   Collector v${art.collectorVersion ?? "—"}   |   Run: ${art.runId ?? "—"}`, { indent: 12 });
      if (art.expiresAt) {
        doc.fontSize(8.5).fillColor("#6B7280")
          .text(`Expires: ${art.expiresAt.toISOString()}`, { indent: 12 });
      }
      if (art.summary) {
        doc.moveDown(0.2);
        doc.fontSize(9).font("Helvetica").fillColor("#1E293B").text(`Summary: ${art.summary}`, { indent: 12, lineGap: 1 });
      }
      doc.moveDown(0.3);
      doc.fontSize(8.5).font("Helvetica-Bold").fillColor("#6B7280").text("Raw Payload:", { indent: 12 });
      const payloadStr = JSON.stringify(art.rawPayload, null, 2);
      const truncated = payloadStr.length > 1200 ? payloadStr.slice(0, 1200) + "\n… (truncated)" : payloadStr;
      doc.fontSize(7.5).font("Courier").fillColor("#374151").text(truncated, { indent: 20, lineGap: 0.5 });
      doc.moveDown(0.5);
      doc.moveTo(62, doc.y).lineTo(533, doc.y).strokeColor("#F0F0F0").stroke();
      doc.moveDown(0.4);
    }
    doc.moveDown(0.4);
  }
}

function buildEvidenceZip(
  title: string,
  groups: { controlRef: string; controlName: string; artifacts: EvidenceRow[] }[]
): Buffer {
  const zip = new AdmZip();
  const manifest: object[] = [];

  for (const group of groups) {
    const safeRef = group.controlRef.replace(/[^a-z0-9._-]/gi, "_");
    for (const art of group.artifacts) {
      const ts = art.collectedAt.toISOString().replace(/[:.]/g, "-");
      const fname = `${safeRef}/${art.sourceIntegration ?? "unknown"}_${ts}.json`;
      const entry = {
        controlRef:        group.controlRef,
        controlName:       group.controlName,
        artifactId:        art.artifactId,
        sourceIntegration: art.sourceIntegration,
        status:            art.status,
        summary:           art.summary,
        collectorVersion:  art.collectorVersion,
        runId:             art.runId,
        collectedAt:       art.collectedAt.toISOString(),
        expiresAt:         art.expiresAt?.toISOString() ?? null,
        rawPayload:        art.rawPayload,
      };
      zip.addFile(fname, Buffer.from(JSON.stringify(entry, null, 2), "utf-8"));
      manifest.push({ file: fname, controlRef: group.controlRef, sourceIntegration: art.sourceIntegration, collectedAt: art.collectedAt.toISOString(), status: art.status });
    }
  }

  zip.addFile(
    "manifest.json",
    Buffer.from(JSON.stringify({ title, exportedAt: new Date().toISOString(), totalControls: groups.length, totalArtifacts: groups.reduce((n, g) => n + g.artifacts.length, 0), files: manifest }, null, 2), "utf-8")
  );

  return zip.toBuffer();
}

// GET /evidence/bulk-export?framework=<name>&format=pdf|zip
router.get("/evidence/bulk-export", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const tid = Number(tenantId);
    const framework = String(req.query["framework"] ?? "").trim();
    const format    = String(req.query["format"]    ?? "pdf").toLowerCase() === "zip" ? "zip" : "pdf";

    const allControls = await db
      .select()
      .from(controlsTable)
      .where(eq(controlsTable.tenantId, tid));

    const filtered = framework
      ? allControls.filter(c => c.framework?.toLowerCase().includes(framework.toLowerCase()))
      : allControls;

    if (filtered.length === 0) {
      res.status(404).json({ error: "No controls found for the given framework" });
      return;
    }

    const controlIds = filtered.map(c => c.id);
    const artifacts = controlIds.length > 0
      ? await db
          .select()
          .from(evidenceArtifactsTable)
          .where(
            and(
              eq(evidenceArtifactsTable.tenantId, tid),
              inArray(evidenceArtifactsTable.controlId, controlIds)
            )
          )
          .orderBy(desc(evidenceArtifactsTable.collectedAt))
      : [];

    const artByControl = new Map<number, EvidenceRow[]>();
    for (const a of artifacts) {
      if (!artByControl.has(a.controlId)) artByControl.set(a.controlId, []);
      artByControl.get(a.controlId)!.push(a);
    }

    const groups = filtered.map(c => ({
      controlRef:  c.controlId,
      controlName: c.name,
      artifacts:   artByControl.get(c.id) ?? [],
    }));

    const safeFramework  = (framework || "all-frameworks").replace(/[^a-z0-9_-]/gi, "_");
    const title          = `Evidence Pack — ${framework || "All Frameworks"}`;
    const subtitle       = `Tenant ${tid} · ${filtered.length} control(s)`;

    if (format === "zip") {
      const buf = buildEvidenceZip(title, groups);
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="evidence_pack_${safeFramework}.zip"`);
      res.send(buf);
    } else {
      const filename = `evidence_pack_${safeFramework}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      doc.pipe(res);
      buildEvidencePdf(doc, title, subtitle, groups);
      doc.end();
    }
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: "Bulk export failed" });
  }
});

// GET /evidence/control-ref/:ref — artifacts by control text ref (e.g. "A.9.4.2")
router.get("/evidence/control-ref/:ref", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const ref = decodeURIComponent(String(req.params["ref"] ?? ""));

    const rows = await db
      .select()
      .from(evidenceArtifactsTable)
      .where(
        and(
          eq(evidenceArtifactsTable.tenantId, Number(tenantId)),
          eq(evidenceArtifactsTable.controlRef, ref)
        )
      )
      .orderBy(desc(evidenceArtifactsTable.collectedAt))
      .limit(10);

    res.json(rows.map(fmtArtifact));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// GET /evidence/:controlId/export?format=pdf|zip — export single control evidence pack
router.get("/evidence/:controlId/export", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const tid = Number(tenantId);
    const controlDbId = Number(req.params["controlId"]);
    const format = String(req.query["format"] ?? "pdf").toLowerCase() === "zip" ? "zip" : "pdf";

    if (isNaN(controlDbId)) { res.status(400).json({ error: "Invalid controlId" }); return; }

    const [ctrl] = await db
      .select()
      .from(controlsTable)
      .where(and(eq(controlsTable.tenantId, tid), eq(controlsTable.id, controlDbId)))
      .limit(1);

    if (!ctrl) { res.status(404).json({ error: "Control not found" }); return; }

    const artifacts = await db
      .select()
      .from(evidenceArtifactsTable)
      .where(
        and(
          eq(evidenceArtifactsTable.tenantId, tid),
          eq(evidenceArtifactsTable.controlId, controlDbId)
        )
      )
      .orderBy(desc(evidenceArtifactsTable.collectedAt));

    const groups = [{ controlRef: ctrl.controlId, controlName: ctrl.name, artifacts }];
    const safeRef = ctrl.controlId.replace(/[^a-z0-9._-]/gi, "_");
    const title   = `Evidence Pack — ${ctrl.controlId}`;
    const subtitle = `${ctrl.name}   ·   ${ctrl.framework ?? ""}`;

    if (format === "zip") {
      const buf = buildEvidenceZip(title, groups);
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="evidence_${safeRef}.zip"`);
      res.send(buf);
    } else {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="evidence_${safeRef}.pdf"`);
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      doc.pipe(res);
      buildEvidencePdf(doc, title, subtitle, groups);
      doc.end();
    }
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: "Export failed" });
  }
});

// GET /evidence/:controlId — artifacts by integer DB id (MUST be last)
router.get("/evidence/:controlId", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const controlDbId = Number(req.params["controlId"]);

    if (isNaN(controlDbId)) { res.status(400).json({ error: "Invalid controlId" }); return; }

    const rows = await db
      .select()
      .from(evidenceArtifactsTable)
      .where(
        and(
          eq(evidenceArtifactsTable.tenantId, Number(tenantId)),
          eq(evidenceArtifactsTable.controlId, controlDbId)
        )
      )
      .orderBy(desc(evidenceArtifactsTable.collectedAt));

    res.json(rows.map(fmtArtifact));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

export default router;
