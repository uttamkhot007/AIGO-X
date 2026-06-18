import { Router } from "express";
import PDFDocument from "pdfkit";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/service-kit";
import {
  auditProgramsTable,
  auditFindingsTable,
  auditEvidenceRequestsTable,
} from "@workspace/db";
import { requireAuth } from "@workspace/service-kit";
import type { JwtPayload } from "@workspace/service-kit";

const router = Router();
const user = (req: Parameters<typeof requireAuth>[0]) => {
  const u = (req as typeof req & { user: JwtPayload }).user;
  return { ...u, tenantId: Number(u.tenantId) };
};

// ── Audit plans CRUD — DB-backed ──────────────────────────────────────────────

router.get("/audit/plans", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const rows = await db.select().from(auditProgramsTable).where(eq(auditProgramsTable.tenantId, tenantId));
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/audit/plans", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const body = req.body as Partial<typeof auditProgramsTable.$inferInsert>;
    if (!body.name || !body.framework) {
      res.status(400).json({ error: "name and framework are required" }); return;
    }
    const programId = `AUD-${Date.now()}`;
    const [row] = await db.insert(auditProgramsTable)
      .values({
        tenantId,
        programId,
        name:         body.name,
        framework:    body.framework,
        type:         body.type ?? "Internal",
        auditor:      body.auditor ?? "",
        lead:         body.lead ?? "",
        scheduled:    body.scheduled ?? "",
        startDate:    body.startDate ?? "",
        endDate:      body.endDate ?? "",
        currentPhase: body.currentPhase ?? "initiation",
        phaseProgress: body.phaseProgress ?? {},
        status:       body.status ?? "planned",
        scope:        body.scope ?? "",
        findings:     0,
      })
      .returning();
    res.status(201).json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/audit/plans/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const programId = String(req.params["id"] ?? "");
    const [row] = await db.select().from(auditProgramsTable)
      .where(and(eq(auditProgramsTable.tenantId, tenantId), eq(auditProgramsTable.programId, programId)))
      .limit(1);
    if (!row) { res.status(404).json({ error: "Plan not found" }); return; }
    res.json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.patch("/audit/plans/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const programId = String(req.params["id"] ?? "");
    const b = req.body as Record<string, unknown>;
    const patch: Partial<typeof auditProgramsTable.$inferInsert> = {};
    if (b["name"]          !== undefined) patch.name          = b["name"]          as string;
    if (b["status"]        !== undefined) patch.status        = b["status"]        as string;
    if (b["scope"]         !== undefined) patch.scope         = b["scope"]         as string;
    if (b["type"]          !== undefined) patch.type          = b["type"]          as string;
    if (b["auditor"]       !== undefined) patch.auditor       = b["auditor"]       as string;
    if (b["lead"]          !== undefined) patch.lead          = b["lead"]          as string;
    if (b["scheduled"]     !== undefined) patch.scheduled     = b["scheduled"]     as string;
    if (b["startDate"]     !== undefined) patch.startDate     = b["startDate"]     as string;
    if (b["endDate"]       !== undefined) patch.endDate       = b["endDate"]       as string;
    if (b["currentPhase"]  !== undefined) patch.currentPhase  = b["currentPhase"]  as string;
    if (b["phaseProgress"] !== undefined) patch.phaseProgress = b["phaseProgress"];
    if (b["findings"]      !== undefined) patch.findings      = b["findings"]      as number;
    const [row] = await db.update(auditProgramsTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(auditProgramsTable.tenantId, tenantId), eq(auditProgramsTable.programId, programId)))
      .returning();
    if (!row) { res.status(404).json({ error: "Plan not found" }); return; }
    res.json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/audit/plans/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const programId = String(req.params["id"] ?? "");
    const [row] = await db.delete(auditProgramsTable)
      .where(and(eq(auditProgramsTable.tenantId, tenantId), eq(auditProgramsTable.programId, programId)))
      .returning();
    if (!row) { res.status(404).json({ error: "Plan not found" }); return; }
    res.status(204).send();
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Findings — DB-backed ──────────────────────────────────────────────────────

router.get("/audit/findings", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const { auditId } = req.query as { auditId?: string };
    let rows = await db.select().from(auditFindingsTable).where(eq(auditFindingsTable.tenantId, tenantId));
    if (auditId) rows = rows.filter(f => f.auditId === auditId);
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/audit/findings", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const body = req.body as Partial<typeof auditFindingsTable.$inferInsert>;
    if (!body.auditId || !body.title || !body.control) {
      res.status(400).json({ error: "auditId, title and control are required" }); return;
    }
    const findingId = `FND-${Date.now()}`;
    const [row] = await db.insert(auditFindingsTable)
      .values({
        tenantId,
        findingId,
        auditId:   body.auditId,
        title:     body.title,
        control:   body.control,
        severity:  body.severity  ?? "Medium",
        status:    body.status    ?? "open",
        owner:     body.owner     ?? "",
        dueDate:   body.dueDate   ?? "",
        description:    body.description    ?? "",
        recommendation: body.recommendation,
        category:       body.category,
        evidenceRequired: body.evidenceRequired ?? false,
        responses: [],
      })
      .returning();
    // bump findings count on the parent plan
    await db.update(auditProgramsTable)
      .set({ findings: (await db.select({ findings: auditProgramsTable.findings }).from(auditProgramsTable)
        .where(and(eq(auditProgramsTable.tenantId, tenantId), eq(auditProgramsTable.programId, body.auditId))).limit(1)
        .then(r => (r[0]?.findings ?? 0) + 1)) })
      .where(and(eq(auditProgramsTable.tenantId, tenantId), eq(auditProgramsTable.programId, body.auditId)));
    res.status(201).json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/audit/findings/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const findingId = String(req.params["id"] ?? "");
    const [row] = await db.select().from(auditFindingsTable)
      .where(and(eq(auditFindingsTable.tenantId, tenantId), eq(auditFindingsTable.findingId, findingId)))
      .limit(1);
    if (!row) { res.status(404).json({ error: "Finding not found" }); return; }
    res.json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.patch("/audit/findings/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const findingId = String(req.params["id"] ?? "");
    const b = req.body as Record<string, unknown>;
    const patch: Partial<typeof auditFindingsTable.$inferInsert> = {};
    if (b["title"]            !== undefined) patch.title            = b["title"]            as string;
    if (b["control"]          !== undefined) patch.control          = b["control"]          as string;
    if (b["severity"]         !== undefined) patch.severity         = b["severity"]         as string;
    if (b["status"]           !== undefined) patch.status           = b["status"]           as string;
    if (b["owner"]            !== undefined) patch.owner            = b["owner"]            as string;
    if (b["dueDate"]          !== undefined) patch.dueDate          = b["dueDate"]          as string;
    if (b["description"]      !== undefined) patch.description      = b["description"]      as string;
    if (b["recommendation"]   !== undefined) patch.recommendation   = b["recommendation"]   as string;
    if (b["category"]         !== undefined) patch.category         = b["category"]         as string;
    if (b["evidenceRequired"] !== undefined) patch.evidenceRequired = b["evidenceRequired"] as boolean;
    if (b["responses"]        !== undefined) patch.responses        = b["responses"];
    const [row] = await db.update(auditFindingsTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(auditFindingsTable.tenantId, tenantId), eq(auditFindingsTable.findingId, findingId)))
      .returning();
    if (!row) { res.status(404).json({ error: "Finding not found" }); return; }
    res.json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// Management response thread
router.post("/audit/findings/:id/respond", requireAuth, async (req, res) => {
  try {
    const { tenantId, email } = user(req);
    const findingId = String(req.params["id"] ?? "");
    const { text } = req.body as { text: string };
    if (!text) { res.status(400).json({ error: "Response text is required" }); return; }
    const [existing] = await db.select({ responses: auditFindingsTable.responses }).from(auditFindingsTable)
      .where(and(eq(auditFindingsTable.tenantId, tenantId), eq(auditFindingsTable.findingId, findingId)))
      .limit(1);
    if (!existing) { res.status(404).json({ error: "Finding not found" }); return; }
    const responses = (existing.responses as unknown[]) ?? [];
    const newResponse = { respondedBy: email ?? "Unknown", respondedAt: new Date().toISOString(), text };
    responses.push(newResponse);
    const [row] = await db.update(auditFindingsTable)
      .set({ responses, updatedAt: new Date() })
      .where(and(eq(auditFindingsTable.tenantId, tenantId), eq(auditFindingsTable.findingId, findingId)))
      .returning();
    res.json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Evidence requests — DB-backed ─────────────────────────────────────────────

router.post("/evidence/objects", requireAuth, async (req, res) => {
  try {
    const { tenantId, userId } = user(req);
    const { objectType, objectId, objectName, title, evidenceType, description, referenceUrl } = req.body as Record<string, string>;
    if (!title) { res.status(400).json({ error: "title is required" }); return; }
    const requestId = `EVD-${Date.now()}`;
    const auditId   = `obj:${objectType}:${objectId}`;
    const evRow = {
      tenantId:      Number(tenantId),
      requestId,
      auditId,
      control:       objectId || "",
      title:         title || "",
      description:   description || `Evidence for ${objectType}: ${objectName}`,
      requestedFrom: userId ? String(userId) : "system",
      dueDate:       String(new Date().toISOString().split("T")[0]),
      status:        "collected",
      type:          evidenceType || "Document",
      collectedBy:   userId ? String(userId) : undefined,
    };
    const [row] = await db.insert(auditEvidenceRequestsTable).values(evRow).returning();
    res.status(201).json({ ...row, referenceUrl });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/audit/evidence", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const { auditId } = req.query as { auditId?: string };
    let rows = await db.select().from(auditEvidenceRequestsTable).where(eq(auditEvidenceRequestsTable.tenantId, tenantId));
    if (auditId) rows = rows.filter(e => e.auditId === auditId);
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/audit/evidence", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const body = req.body as Partial<typeof auditEvidenceRequestsTable.$inferInsert>;
    if (!body.auditId || !body.control || !body.description || !body.requestedFrom) {
      res.status(400).json({ error: "auditId, control, description and requestedFrom are required" }); return;
    }
    const requestId = `EVR-${Date.now()}`;
    const [row] = await db.insert(auditEvidenceRequestsTable)
      .values({
        tenantId,
        requestId,
        auditId:       body.auditId,
        control:       body.control,
        description:   body.description,
        requestedFrom: body.requestedFrom,
        dueDate:       body.dueDate ?? "",
        status:        body.status ?? "pending",
        type:          body.type   ?? "Document",
        title:         body.title,
        collectedBy:   body.collectedBy,
      })
      .returning();
    res.status(201).json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.patch("/audit/evidence/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const requestId = String(req.params["id"] ?? "");
    const body = req.body as { status?: string; reason?: string } & Record<string, unknown>;
    if (!body.status) { res.status(400).json({ error: "status is required" }); return; }
    const updates: Record<string, unknown> = { updatedAt: new Date(), status: body.status };
    if (body.reason)  updates.rejectionReason = body.reason;
    if (body.status === "submitted") updates.submittedAt = new Date().toISOString();
    const [row] = await db.update(auditEvidenceRequestsTable)
      .set(updates)
      .where(and(eq(auditEvidenceRequestsTable.tenantId, tenantId), eq(auditEvidenceRequestsTable.requestId, requestId)))
      .returning();
    if (!row) { res.status(404).json({ error: "Evidence request not found" }); return; }
    res.json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Summary — DB-backed ───────────────────────────────────────────────────────

router.get("/audit/summary", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const [plans, findings, evidence] = await Promise.all([
      db.select().from(auditProgramsTable).where(eq(auditProgramsTable.tenantId, tenantId)),
      db.select().from(auditFindingsTable).where(eq(auditFindingsTable.tenantId, tenantId)),
      db.select().from(auditEvidenceRequestsTable).where(eq(auditEvidenceRequestsTable.tenantId, tenantId)),
    ]);
    res.json({
      plans:            plans.length,
      totalFindings:    findings.length,
      openFindings:     findings.filter(f => f.status === "open").length,
      criticalFindings: findings.filter(f => f.severity === "Critical").length,
      highFindings:     findings.filter(f => f.severity === "High").length,
      evidencePending:  evidence.filter(e => e.status === "pending").length,
      evidenceAccepted: evidence.filter(e => e.status === "accepted").length,
    });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── PDF Report — DB-backed ────────────────────────────────────────────────────

router.get("/audit/plans/:id/report", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const planId = String(req.params["id"] ?? "");

    const [plan] = await db.select().from(auditProgramsTable)
      .where(and(eq(auditProgramsTable.tenantId, tenantId), eq(auditProgramsTable.programId, planId)))
      .limit(1);
    if (!plan) { res.status(404).json({ error: "Audit plan not found" }); return; }

    const [findings, evidenceRequests] = await Promise.all([
      db.select().from(auditFindingsTable).where(and(eq(auditFindingsTable.tenantId, tenantId), eq(auditFindingsTable.auditId, planId))),
      db.select().from(auditEvidenceRequestsTable).where(and(eq(auditEvidenceRequestsTable.tenantId, tenantId), eq(auditEvidenceRequestsTable.auditId, planId))),
    ]);

    const summary = {
      totalFindings:    findings.length,
      openFindings:     findings.filter(f => f.status === "open").length,
      criticalFindings: findings.filter(f => f.severity === "Critical").length,
      highFindings:     findings.filter(f => f.severity === "High").length,
      evidencePending:  evidenceRequests.filter(e => e.status === "pending").length,
      evidenceAccepted: evidenceRequests.filter(e => e.status === "accepted").length,
    };

    const phaseProgress = (plan.phaseProgress as Record<string, { pct: number; startDate: string; endDate: string }>) ?? {};

    const now = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="audit-report-${planId}.pdf"`);

    const doc = new PDFDocument({ margin: 50, size: "A4", bufferPages: true });
    doc.pipe(res);

    // ── Cover page ──────────────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 140).fill("#1E3A5F");
    doc.fillColor("white").fontSize(22).font("Helvetica-Bold")
       .text("AUDIT REPORT", 50, 45, { align: "left" });
    doc.fontSize(14).font("Helvetica").text(plan.name, 50, 78, { align: "left" });
    doc.fontSize(10).fillColor("#B0C4DE").text(`Generated ${now}  ·  ${plan.framework}  ·  ${plan.auditor}`, 50, 110);

    doc.fillColor("#1E3A5F").moveDown(4);

    // ── Executive summary ───────────────────────────────────────────────────────
    doc.fontSize(14).font("Helvetica-Bold").fillColor("#1E3A5F").text("Executive Summary", { underline: true }).moveDown(0.5);
    doc.fontSize(10).font("Helvetica").fillColor("#333")
       .text(`Audit scope: ${plan.scope}`)
       .text(`Lead auditor: ${plan.lead}   ·   Period: ${plan.startDate} → ${plan.endDate}`)
       .text(`Status: ${plan.status.toUpperCase()}   ·   Current phase: ${plan.currentPhase}`)
       .moveDown(1);

    // ── KPI grid ───────────────────────────────────────────────────────────────
    const kpis = [
      ["Total Findings",    String(summary.totalFindings)],
      ["Open Findings",     String(summary.openFindings)],
      ["Critical",          String(summary.criticalFindings)],
      ["High",              String(summary.highFindings)],
      ["Evidence Pending",  String(summary.evidencePending)],
      ["Evidence Accepted", String(summary.evidenceAccepted)],
    ];
    const colW = 90, rowH = 40, startX = 50, startY = doc.y;
    kpis.forEach(([label, value], i) => {
      const x = startX + (i % 3) * (colW + 10);
      const y = startY + Math.floor(i / 3) * (rowH + 8);
      doc.rect(x, y, colW, rowH).fillAndStroke("#F0F4F8", "#1E3A5F");
      doc.fillColor("#1E3A5F").fontSize(18).font("Helvetica-Bold").text(value, x, y + 6, { width: colW, align: "center" });
      doc.fillColor("#555").fontSize(7).font("Helvetica").text(label!, x, y + 26, { width: colW, align: "center" });
    });
    doc.y = startY + 2 * (rowH + 8) + 20;

    // ── Phase progress table ────────────────────────────────────────────────────
    const phases = Object.entries(phaseProgress);
    if (phases.length > 0) {
      doc.addPage();
      doc.fontSize(14).font("Helvetica-Bold").fillColor("#1E3A5F").text("Audit Phase Progress", { underline: true }).moveDown(0.5);
      phases.forEach(([phase, prog]) => {
        const barW = 300; const filled = Math.round(barW * prog.pct / 100);
        const y = doc.y;
        doc.fontSize(9).font("Helvetica-Bold").fillColor("#1E3A5F").text(phase.charAt(0).toUpperCase() + phase.slice(1), 50, y);
        doc.rect(200, y, barW, 12).fillAndStroke("#E5E7EB", "#9CA3AF");
        doc.rect(200, y, filled, 12).fillAndStroke(prog.pct === 100 ? "#065F46" : "#1E3A5F", "#1E3A5F");
        doc.fillColor("#333").fontSize(9).font("Helvetica").text(`${prog.pct}%`, 510, y);
        doc.fontSize(8).fillColor("#777").text(`${prog.startDate} → ${prog.endDate}`, 50, y + 14).moveDown(0.6);
      });
    }

    // ── Findings table ──────────────────────────────────────────────────────────
    doc.addPage();
    doc.fontSize(14).font("Helvetica-Bold").fillColor("#1E3A5F").text("Audit Findings", { underline: true }).moveDown(0.5);
    const sevColors: Record<string, string> = { Critical:"#DC2626", High:"#D97706", Medium:"#CA8A04", Low:"#059669", Informational:"#6B7280" };
    findings.forEach((f, idx) => {
      if (doc.y > doc.page.height - 130) doc.addPage();
      const y = doc.y;
      doc.rect(50, y, doc.page.width - 100, 14).fillAndStroke(idx % 2 === 0 ? "#F9F8F6" : "#EEF2F7", "#D1D5DB");
      doc.fillColor(sevColors[f.severity] ?? "#333").fontSize(8).font("Helvetica-Bold")
         .text(`[${f.severity}]`, 55, y + 3, { width: 70 });
      doc.fillColor("#1E3A5F").fontSize(8).font("Helvetica-Bold")
         .text(f.title, 130, y + 3, { width: 260 });
      doc.fillColor("#555").fontSize(8).font("Helvetica")
         .text(f.control, 400, y + 3, { width: 60 });
      doc.fillColor("#777").fontSize(7)
         .text(f.status, 465, y + 3, { width: 80 });
      doc.y = y + 18;
      doc.fillColor("#444").fontSize(8).font("Helvetica").text(`  ${f.description}`, 55, doc.y, { width: doc.page.width - 110 }).moveDown(0.4);
      const responses = (f.responses as { respondedBy: string; respondedAt: string; text: string }[]) ?? [];
      responses.forEach(r => {
        if (doc.y > doc.page.height - 80) doc.addPage();
        doc.fillColor("#065F46").fontSize(7).font("Helvetica-Oblique")
           .text(`  ↳ [${r.respondedBy} · ${r.respondedAt}] ${r.text}`, 65, doc.y, { width: doc.page.width - 120 }).moveDown(0.3);
      });
      doc.moveDown(0.3);
    });

    // ── Evidence requests table ─────────────────────────────────────────────────
    if (evidenceRequests.length > 0) {
      doc.addPage();
      doc.fontSize(14).font("Helvetica-Bold").fillColor("#1E3A5F").text("Evidence Requests", { underline: true }).moveDown(0.5);
      const statusColors: Record<string, string> = { accepted:"#065F46", submitted:"#1D4ED8", pending:"#D97706", rejected:"#DC2626" };
      evidenceRequests.forEach((e, idx) => {
        if (doc.y > doc.page.height - 80) doc.addPage();
        const y = doc.y;
        doc.rect(50, y, doc.page.width - 100, 14).fillAndStroke(idx % 2 === 0 ? "#F9F8F6" : "#EEF2F7", "#D1D5DB");
        doc.fillColor(statusColors[e.status] ?? "#333").fontSize(8).font("Helvetica-Bold")
           .text(`[${e.status.toUpperCase()}]`, 55, y + 3, { width: 80 });
        doc.fillColor("#1E3A5F").fontSize(8).font("Helvetica-Bold")
           .text(e.control, 140, y + 3, { width: 70 });
        doc.fillColor("#444").fontSize(8).font("Helvetica")
           .text(e.description, 215, y + 3, { width: 260 });
        doc.fillColor("#777").fontSize(7).text(`Due: ${e.dueDate}`, 480, y + 3);
        doc.y = y + 18;
        doc.fillColor("#555").fontSize(8).font("Helvetica")
           .text(`  Requested from: ${e.requestedFrom}  ·  Type: ${e.type}`, 55, doc.y, { width: doc.page.width - 110 }).moveDown(0.5);
      });
    }

    // ── Footer on each page ─────────────────────────────────────────────────────
    const pages = doc.bufferedPageRange ? doc.bufferedPageRange() : { start: 0, count: 1 };
    for (let i = pages.start; i < pages.start + pages.count; i++) {
      doc.switchToPage(i);
      doc.fillColor("#9CA3AF").fontSize(7).font("Helvetica")
         .text(`DuFense GRC Platform  ·  Confidential  ·  Page ${i + 1}`, 50, doc.page.height - 30, { align: "center", width: doc.page.width - 100 });
    }

    doc.end();
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

export default router;
