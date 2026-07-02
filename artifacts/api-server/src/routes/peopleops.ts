import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "../lib/db";
import { requireAuth } from "../lib/auth";
import type { JwtPayload } from "../lib/auth";
import type { Request } from "express";
import { eventBus, Events } from "../lib/event-bus";

const router = Router();
type AuthReq = Request & { user: JwtPayload };

// POST /peopleops/training/assign — persists to training_assignments table (DB-backed)
router.post("/peopleops/training/assign", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const body = req.body as { course?: string; courses?: string[]; assignees?: string[]; dueDate?: string };
    const courses = body.courses ?? (body.course ? [body.course] : []);
    const assignees = body.assignees ?? [];
    if (courses.length === 0 || assignees.length === 0) {
      res.status(400).json({ error: "courses and assignees are required" }); return;
    }
    const dueDate = body.dueDate ?? new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const created: unknown[] = [];
    for (const course of courses) {
      for (const assignee of assignees) {
        const rows = await db.execute(sql`
          INSERT INTO training_assignments (tenant_id, course, assignee, due_date, status)
          VALUES (${tenantId}, ${course}, ${assignee}, ${dueDate}::date, 'assigned')
          RETURNING *
        `);
        if (rows.rows[0]) created.push(rows.rows[0]);
      }
    }
    res.status(201).json({ success: true, assigned: created.length, assignments: created });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /peopleops/training/assignments
router.get("/peopleops/training/assignments", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const rows = await db.execute(sql`
      SELECT * FROM training_assignments WHERE tenant_id = ${tenantId} ORDER BY assigned_at DESC
    `);
    res.json(rows.rows);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /peopleops/training/complete — mark assignment completed + publish domain event
router.post("/peopleops/training/complete", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const body = req.body as { userId?: string; trainingId?: string; courseType?: string; completionDate?: string };
    if (!body.userId || !body.trainingId) {
      res.status(400).json({ error: "userId and trainingId are required" });
      return;
    }
    const trainingId     = body.trainingId;
    const courseType     = body.courseType ?? "security_awareness";
    const completionDate = body.completionDate ?? new Date().toISOString().slice(0, 10);

    // Update assignment status in DB if a matching row exists
    await db.execute(sql`
      UPDATE training_assignments
      SET status = 'completed', completed_at = NOW()
      WHERE tenant_id = ${tenantId}
        AND (id::text = ${trainingId} OR course = ${trainingId} OR assignee = ${body.userId})
        AND status != 'completed'
    `);

    // Publish domain event — orchestration updates linked compliance controls
    eventBus.publish(Events.TRAINING_COMPLETED, {
      userId:          body.userId,
      trainingId,
      courseType,
      completionDate,
    }, tenantId);

    res.status(200).json({ success: true, trainingId, courseType, completionDate, eventPublished: true });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /peopleops/invite — persists to people_invites table
router.post("/peopleops/invite", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const { email, role } = req.body as { email?: string; role?: string };
    if (!email || !email.includes("@")) { res.status(400).json({ error: "A valid email is required" }); return; }
    const rows = await db.execute(sql`
      INSERT INTO people_invites (tenant_id, email, role)
      VALUES (${tenantId}, ${email}, ${role ?? "analyst"})
      ON CONFLICT (tenant_id, email) DO NOTHING
      RETURNING *
    `);
    if (!rows.rows[0]) {
      res.status(409).json({ error: "User already invited" }); return;
    }
    res.status(201).json({
      success: true,
      invite: rows.rows[0],
      note: "Invite recorded — email delivery requires the SMTP subsystem to be configured.",
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /peopleops/invites
router.get("/peopleops/invites", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const rows = await db.execute(sql`
      SELECT * FROM people_invites WHERE tenant_id = ${tenantId} ORDER BY invited_at DESC
    `);
    res.json(rows.rows);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
