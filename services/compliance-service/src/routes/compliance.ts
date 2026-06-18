import { Router } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@workspace/service-kit";
import { controlsTable, complianceMaturityTable, complianceMaturityHistoryTable, complianceGapsTable, governanceControlsLibraryTable } from "@workspace/db";
import { requireAuth } from "@workspace/service-kit";
import type { JwtPayload } from "@workspace/service-kit";

const router = Router();

function ctrlRow(c: typeof controlsTable.$inferSelect) {
  return {
    id: c.id, controlId: c.controlId, framework: c.framework, domain: c.domain,
    name: c.name, status: c.status, owner: c.owner, evidence: c.evidence, dueDate: c.dueDate,
  };
}

function pctToScore(implemented: number, total: number): number {
  if (total === 0) return 1;
  const pct = implemented / total;
  if (pct >= 0.9) return 5;
  if (pct >= 0.7) return 4;
  if (pct >= 0.5) return 3;
  if (pct >= 0.25) return 2;
  return 1;
}

/**
 * Re-aggregate controlsTable + governanceControlsLibraryTable for the given
 * domain/category and upsert the complianceMaturityTable row.
 */
async function syncMaturityForDomain(tenantId: number, domain: string): Promise<void> {
  const [[ctrlAgg], [govAgg]] = await Promise.all([
    db
      .select({
        total:       sql<number>`COUNT(*)::int`,
        implemented: sql<number>`SUM(CASE WHEN ${controlsTable.status} = 'implemented' THEN 1 ELSE 0 END)::int`,
      })
      .from(controlsTable)
      .where(and(eq(controlsTable.tenantId, tenantId), eq(controlsTable.domain, domain))),
    db
      .select({
        total:       sql<number>`COUNT(*)::int`,
        implemented: sql<number>`SUM(CASE WHEN ${governanceControlsLibraryTable.status} = 'implemented' THEN 1 ELSE 0 END)::int`,
      })
      .from(governanceControlsLibraryTable)
      .where(and(eq(governanceControlsLibraryTable.tenantId, tenantId), eq(governanceControlsLibraryTable.category, domain))),
  ]);

  const total       = Number(ctrlAgg?.total ?? 0) + Number(govAgg?.total ?? 0);
  const implemented = Number(ctrlAgg?.implemented ?? 0) + Number(govAgg?.implemented ?? 0);
  const newScore    = pctToScore(implemented, total);

  const [existing] = await db
    .select({ score: complianceMaturityTable.score })
    .from(complianceMaturityTable)
    .where(and(eq(complianceMaturityTable.tenantId, tenantId), eq(complianceMaturityTable.domain, domain)))
    .limit(1);

  if (existing) {
    await db
      .update(complianceMaturityTable)
      .set({ prev: existing.score, score: newScore, controls: total, implemented, updatedAt: new Date() })
      .where(and(eq(complianceMaturityTable.tenantId, tenantId), eq(complianceMaturityTable.domain, domain)));
  } else {
    await db.insert(complianceMaturityTable).values({
      tenantId, domain, score: newScore, prev: newScore, target: 5, controls: total, implemented,
    });
  }

  // Record a snapshot in history only when the score actually changed
  if (!existing || existing.score !== newScore) {
    await db.insert(complianceMaturityHistoryTable).values({ tenantId, domain, score: newScore });
  }
}

/**
 * Re-aggregate controlsTable for the given framework and upsert the
 * complianceGapsTable row so persisted data stays in sync.
 */
async function syncGapsForFramework(tenantId: number, framework: string): Promise<void> {
  const [agg] = await db
    .select({
      total:       sql<number>`COUNT(*)::int`,
      implemented: sql<number>`SUM(CASE WHEN ${controlsTable.status} = 'implemented' THEN 1 ELSE 0 END)::int`,
      partial:     sql<number>`SUM(CASE WHEN ${controlsTable.status} = 'partial' THEN 1 ELSE 0 END)::int`,
      notStarted:  sql<number>`SUM(CASE WHEN ${controlsTable.status} = 'not-started' THEN 1 ELSE 0 END)::int`,
    })
    .from(controlsTable)
    .where(and(eq(controlsTable.tenantId, tenantId), eq(controlsTable.framework, framework)));

  if (!agg) return;
  const total      = Number(agg.total);
  const implemented = Number(agg.implemented);
  const partial     = Number(agg.partial);
  const notStarted  = Number(agg.notStarted);
  const pct         = total > 0 ? Math.round((implemented / total) * 100) : 0;

  const [existing] = await db
    .select({ id: complianceGapsTable.id })
    .from(complianceGapsTable)
    .where(and(eq(complianceGapsTable.tenantId, tenantId), eq(complianceGapsTable.framework, framework)))
    .limit(1);

  if (existing) {
    await db
      .update(complianceGapsTable)
      .set({ total, implemented, partial, notStarted, pct, updatedAt: new Date() })
      .where(and(eq(complianceGapsTable.tenantId, tenantId), eq(complianceGapsTable.framework, framework)));
  } else {
    await db.insert(complianceGapsTable).values({
      tenantId, framework, total, implemented, partial, notStarted, pct,
    });
  }
}

// GET /compliance/frameworks
// Returns library-assigned frameworks for the tenant (from tenant_frameworks join framework_library).
// Falls back to aggregated control data if tenant_frameworks table is empty for this tenant.
router.get("/compliance/frameworks", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;

    // Primary: return frameworks from the library that have been assigned to this tenant
    const libraryRows = await db.select({
      id:            sql`fl.id`,
      shortCode:     sql`fl.short_code`,
      name:          sql`fl.name`,
      version:       sql`fl.version`,
      category:      sql`fl.category`,
      region:        sql`fl.region`,
      controlsCount: sql`fl.controls_count`,
      isBeta:        sql`fl.is_beta`,
      description:   sql`fl.description`,
      assignedAt:    sql`tf.assigned_at`,
    }).from(sql`tenant_frameworks tf`)
      .innerJoin(sql`framework_library fl`, sql`tf.framework_id = fl.id`)
      .where(sql`tf.tenant_id = ${tenantId} AND tf.status = 'active' AND fl.is_active = true`)
      .orderBy(sql`fl.name`);

    // Always return strictly what is assigned — empty array when none assigned.
    // No fallback to compliance_controls: tenant isolation requires assignment-driven sourcing.
    res.json(libraryRows.map((r: any) => ({
      ...r,
      assignedAt: r.assignedAt instanceof Date ? r.assignedAt.toISOString() : r.assignedAt,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /compliance/controls
router.get("/compliance/controls", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const rows = await db.select().from(controlsTable).where(eq(controlsTable.tenantId, tenantId));
    res.json(rows.map(ctrlRow));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /compliance/controls
router.post("/compliance/controls", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const body = req.body as {
      controlId: string; framework: string; domain: string;
      name: string; status: string; owner: string; dueDate: string;
    };
    const [ctrl] = await db.insert(controlsTable).values({ tenantId, ...body }).returning();
    // Fire-and-forget: keep maturity + gaps in sync
    Promise.all([
      syncMaturityForDomain(tenantId, ctrl!.domain),
      syncGapsForFramework(tenantId, ctrl!.framework),
    ]).catch(() => {});
    res.status(201).json(ctrlRow(ctrl!));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /compliance/controls/:id
router.patch("/compliance/controls/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const id   = Number(req.params["id"]);
    const body = req.body as Partial<{ status: string; owner: string; evidence: number; dueDate: string }>;
    const [ctrl] = await db
      .update(controlsTable)
      .set(body)
      .where(and(eq(controlsTable.id, id), eq(controlsTable.tenantId, tenantId)))
      .returning();
    if (!ctrl) { res.status(404).json({ error: "Control not found" }); return; }

    // Fire-and-forget: keep maturity + gaps in sync
    Promise.all([
      syncMaturityForDomain(tenantId, ctrl.domain),
      syncGapsForFramework(tenantId, ctrl.framework),
    ]).catch(() => {});

    res.json(ctrlRow(ctrl));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
