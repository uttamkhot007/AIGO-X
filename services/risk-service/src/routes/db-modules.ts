/**
 * db-modules.ts — DB-backed routes for all extended GRC tables
 * Covers: risk appetite/cascades/treatments/vendors, compliance maturity/gaps,
 * audit programs/evidence, governance policies, CAASM assets, cloud resources/findings,
 * SaaS apps, network zones/rules, RoPA/consent, data stores/findings, agent records, people
 */
import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import dns from "dns";
const dnsP = dns.promises;
import { db } from "@workspace/service-kit";
import {
  riskAppetiteTable, riskTreatmentsTable, riskVendorsTable,
  auditProgramsTable,
  grcPoliciesTable,
  grcAssetsTable, assetRelationshipsTable,
  cloudResourcesTable, cloudFindingsTable,
  saasAppsTable,
  networkZonesTable, firewallRulesTable,
  ropaRecordsTable, consentRecordsTable,
  dataStoresTable, dataFindingsDspmTable,
  agentRecordsTable,
  integrationConnectionsTable, webhooksCfgTable,
  peopleTable, ticketCommentsTable,
} from "@workspace/db";
import { requireAuth } from "@workspace/service-kit";
import type { JwtPayload } from "@workspace/service-kit";

const router = Router();
const tid = (req: Parameters<typeof requireAuth>[0]) =>
  (req as typeof req & { user: JwtPayload }).user.tenantId;

// ── Risk Appetite (GET handled by riskmap.ts) ──────────────────────────────────
router.put("/risks/appetite/:domain", requireAuth, async (req, res) => {
  try {
    const domain = decodeURIComponent(String(req.params["domain"] ?? ""));
    const body = req.body as { appetite?: string; threshold?: number; current?: number; breached?: boolean };
    const [row] = await db.update(riskAppetiteTable)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(riskAppetiteTable.tenantId, tid(req)))
      .returning();
    res.json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Risk Cascades (GET handled by riskmap.ts) ──────────────────────────────────

// ── Risk Treatments ────────────────────────────────────────────────────────────
router.get("/risks/treatments", requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(riskTreatmentsTable).where(eq(riskTreatmentsTable.tenantId, tid(req))).orderBy(desc(riskTreatmentsTable.createdAt));
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/risks/treatments", requireAuth, async (req, res) => {
  try {
    const body = req.body as typeof riskTreatmentsTable.$inferInsert;
    const [row] = await db.insert(riskTreatmentsTable).values({ ...body, tenantId: tid(req) }).returning();
    res.status(201).json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.put("/risks/treatments/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const body = req.body as Partial<typeof riskTreatmentsTable.$inferInsert>;
    const [row] = await db.update(riskTreatmentsTable).set({ ...body, updatedAt: new Date() }).where(eq(riskTreatmentsTable.id, id)).returning();
    res.json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Risk Vendors (TPRM) ────────────────────────────────────────────────────────
router.get("/risks/vendors", requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(riskVendorsTable).where(eq(riskVendorsTable.tenantId, tid(req))).orderBy(desc(riskVendorsTable.createdAt));
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/risks/vendors", requireAuth, async (req, res) => {
  try {
    const body = req.body as typeof riskVendorsTable.$inferInsert;
    const [row] = await db.insert(riskVendorsTable).values({ ...body, tenantId: tid(req) }).returning();
    res.status(201).json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.put("/risks/vendors/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const body = req.body as Partial<typeof riskVendorsTable.$inferInsert>;
    const [row] = await db.update(riskVendorsTable).set({ ...body, updatedAt: new Date() }).where(eq(riskVendorsTable.id, id)).returning();
    res.json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Vendor DNS / Email Security check ─────────────────────────────────────────
router.get("/risks/vendors/:vendorId/dns", requireAuth, async (req, res) => {
  try {
    const vendorId = String(req.params["vendorId"] ?? "");
    const [vendor] = await db
      .select({ contact: riskVendorsTable.contact, name: riskVendorsTable.name })
      .from(riskVendorsTable)
      .where(and(eq(riskVendorsTable.vendorId, vendorId), eq(riskVendorsTable.tenantId, tid(req))))
      .limit(1);
    if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }

    const emailDomain = vendor.contact.split("@")[1]?.toLowerCase() ?? "";
    if (!emailDomain) { res.status(400).json({ error: "No domain for vendor" }); return; }

    const result: Record<string, unknown> = { domain: emailDomain, checkedAt: new Date().toISOString() };

    // SPF
    try {
      const txts = await dnsP.resolveTxt(emailDomain);
      const spf = txts.map(r => r.join("")).find(r => r.startsWith("v=spf1"));
      result["spf"] = spf ? { status: "found", record: spf } : { status: "missing", record: null };
    } catch { result["spf"] = { status: "missing", record: null }; }

    // DMARC
    try {
      const txts = await dnsP.resolveTxt(`_dmarc.${emailDomain}`);
      const dmarc = txts.map(r => r.join("")).find(r => r.startsWith("v=DMARC1"));
      if (dmarc) {
        const policy = dmarc.match(/p=(\w+)/)?.[1] ?? "none";
        const rua = dmarc.match(/rua=([^;]+)/)?.[1] ?? null;
        result["dmarc"] = { status: "found", record: dmarc, policy, rua };
      } else {
        result["dmarc"] = { status: "missing", record: null };
      }
    } catch { result["dmarc"] = { status: "missing", record: null }; }

    // DKIM — probe common selectors in parallel
    const SELECTORS = ["google", "selector1", "selector2", "default", "mail", "k1", "dkim", "smtp", "mta", "s1", "s2", "em", "mandrill", "mailchimp", "sendgrid"];
    const dkimHits: { selector: string; record: string }[] = [];
    await Promise.allSettled(SELECTORS.map(async sel => {
      try {
        const txts = await dnsP.resolveTxt(`${sel}._domainkey.${emailDomain}`);
        const rec = txts.map(r => r.join("")).find(r => r.includes("v=DKIM1") || r.includes("k=rsa") || r.includes("p="));
        if (rec) dkimHits.push({ selector: sel, record: rec });
      } catch { /* not found */ }
    }));
    result["dkim"] = dkimHits.length > 0
      ? { status: "found", selectors: dkimHits }
      : { status: "missing", selectors: [] };

    // MX
    try {
      const mx = await dnsP.resolveMx(emailDomain);
      result["mx"] = { status: "found", records: mx.sort((a, b) => a.priority - b.priority).slice(0, 5) };
    } catch { result["mx"] = { status: "missing", records: [] }; }

    // BIMI
    try {
      const txts = await dnsP.resolveTxt(`default._bimi.${emailDomain}`);
      const bimi = txts.map(r => r.join("")).find(r => r.startsWith("v=BIMI1"));
      result["bimi"] = bimi ? { status: "found", record: bimi } : { status: "missing", record: null };
    } catch { result["bimi"] = { status: "missing", record: null }; }

    // MTA-STS
    try {
      const txts = await dnsP.resolveTxt(`_mta-sts.${emailDomain}`);
      const sts = txts.map(r => r.join("")).find(r => r.startsWith("v=STSv1"));
      result["mtaSts"] = sts ? { status: "found", record: sts } : { status: "missing", record: null };
    } catch { result["mtaSts"] = { status: "missing", record: null }; }

    // TLS-RPT
    try {
      const txts = await dnsP.resolveTxt(`_smtp._tls.${emailDomain}`);
      const tlsrpt = txts.map(r => r.join("")).find(r => r.startsWith("v=TLSRPTv1"));
      result["tlsRpt"] = tlsrpt ? { status: "found", record: tlsrpt } : { status: "missing", record: null };
    } catch { result["tlsRpt"] = { status: "missing", record: null }; }

    res.json(result);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Audit Programs ─────────────────────────────────────────────────────────────
router.get("/audit/programs", requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(auditProgramsTable).where(eq(auditProgramsTable.tenantId, tid(req))).orderBy(desc(auditProgramsTable.createdAt));
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/audit/programs", requireAuth, async (req, res) => {
  try {
    const body = req.body as typeof auditProgramsTable.$inferInsert;
    const [row] = await db.insert(auditProgramsTable).values({ ...body, tenantId: tid(req) }).returning();
    res.status(201).json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.put("/audit/programs/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const body = req.body as Partial<typeof auditProgramsTable.$inferInsert>;
    const [row] = await db.update(auditProgramsTable).set({ ...body, updatedAt: new Date() }).where(eq(auditProgramsTable.id, id)).returning();
    res.json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Audit Evidence (GET handled by audit.ts — uses auditEvidenceRequestsTable) ─

// ── Governance Policies (GET/POST/GET-by-id handled by governance.ts) ──────────
router.put("/governance/policies/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const body = req.body as Partial<typeof grcPoliciesTable.$inferInsert>;
    const [row] = await db.update(grcPoliciesTable).set({ ...body, updatedAt: new Date() }).where(eq(grcPoliciesTable.id, id)).returning();
    res.json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── CAASM Assets ───────────────────────────────────────────────────────────────
router.get("/caasm/db/assets", requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(grcAssetsTable).where(eq(grcAssetsTable.tenantId, tid(req))).orderBy(desc(grcAssetsTable.exposureScore));
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/caasm/db/assets/:assetId", requireAuth, async (req, res) => {
  try {
    const assetId = String(req.params["assetId"] ?? "");
    const [row] = await db.select().from(grcAssetsTable).where(eq(grcAssetsTable.assetId, assetId)).limit(1);
    if (!row) { res.status(404).json({ error: "Asset not found" }); return; }
    const relations = await db.select().from(assetRelationshipsTable).where(eq(assetRelationshipsTable.sourceId, assetId));
    res.json({ ...row, relations });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Cloud Resources (CSPM DB) ──────────────────────────────────────────────────
router.get("/cspm/db/resources", requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(cloudResourcesTable).where(eq(cloudResourcesTable.tenantId, tid(req)));
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/cspm/db/findings", requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(cloudFindingsTable).where(eq(cloudFindingsTable.tenantId, tid(req))).orderBy(desc(cloudFindingsTable.createdAt));
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.put("/cspm/db/findings/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const body = req.body as Partial<typeof cloudFindingsTable.$inferInsert>;
    const [row] = await db.update(cloudFindingsTable).set({ ...body, updatedAt: new Date() }).where(eq(cloudFindingsTable.id, id)).returning();
    res.json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── SaaS Apps (SSPM DB) ────────────────────────────────────────────────────────
router.get("/sspm/db/apps", requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(saasAppsTable).where(eq(saasAppsTable.tenantId, tid(req))).orderBy(desc(saasAppsTable.usersConnected));
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.put("/sspm/db/apps/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const body = req.body as Partial<typeof saasAppsTable.$inferInsert>;
    const [row] = await db.update(saasAppsTable).set({ ...body, updatedAt: new Date() }).where(eq(saasAppsTable.id, id)).returning();
    res.json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Network Zones & Firewall Rules ─────────────────────────────────────────────
router.get("/network/db/zones", requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(networkZonesTable).where(eq(networkZonesTable.tenantId, tid(req)));
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/network/db/rules", requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(firewallRulesTable).where(eq(firewallRulesTable.tenantId, tid(req))).orderBy(desc(firewallRulesTable.hits));
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.put("/network/db/rules/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const body = req.body as Partial<typeof firewallRulesTable.$inferInsert>;
    const [row] = await db.update(firewallRulesTable).set({ ...body, updatedAt: new Date() }).where(eq(firewallRulesTable.id, id)).returning();
    res.json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── RoPA Records ───────────────────────────────────────────────────────────────
router.get("/privacy/ropa", requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(ropaRecordsTable).where(eq(ropaRecordsTable.tenantId, tid(req))).orderBy(desc(ropaRecordsTable.updatedAt));
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/privacy/ropa", requireAuth, async (req, res) => {
  try {
    const body = req.body as typeof ropaRecordsTable.$inferInsert;
    const [row] = await db.insert(ropaRecordsTable).values({ ...body, tenantId: tid(req) }).returning();
    res.status(201).json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.put("/privacy/ropa/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const body = req.body as Partial<typeof ropaRecordsTable.$inferInsert>;
    const [row] = await db.update(ropaRecordsTable).set({ ...body, updatedAt: new Date() }).where(eq(ropaRecordsTable.id, id)).returning();
    res.json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Consent Records ────────────────────────────────────────────────────────────
router.get("/privacy/consent", requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(consentRecordsTable).where(eq(consentRecordsTable.tenantId, tid(req)));
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Data Stores (DSPM DB) ──────────────────────────────────────────────────────
router.get("/dspm/db/stores", requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(dataStoresTable).where(eq(dataStoresTable.tenantId, tid(req)));
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/dspm/db/findings", requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(dataFindingsDspmTable).where(eq(dataFindingsDspmTable.tenantId, tid(req))).orderBy(desc(dataFindingsDspmTable.createdAt));
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Agent Records ──────────────────────────────────────────────────────────────
router.get("/agents/db/records", requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(agentRecordsTable).where(eq(agentRecordsTable.tenantId, tid(req))).orderBy(desc(agentRecordsTable.lastSeen));
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.put("/agents/db/records/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const body = req.body as Partial<typeof agentRecordsTable.$inferInsert>;
    const [row] = await db.update(agentRecordsTable).set({ ...body, updatedAt: new Date() }).where(eq(agentRecordsTable.id, id)).returning();
    res.json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Integration Connections ────────────────────────────────────────────────────
router.get("/integrations/db/connections", requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(integrationConnectionsTable).where(eq(integrationConnectionsTable.tenantId, tid(req)));
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Webhooks Config ────────────────────────────────────────────────────────────
router.get("/integrations/db/webhooks", requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(webhooksCfgTable).where(eq(webhooksCfgTable.tenantId, tid(req)));
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── People ─────────────────────────────────────────────────────────────────────
router.get("/people", requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(peopleTable).where(eq(peopleTable.tenantId, tid(req))).orderBy(desc(peopleTable.riskScore));
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/people/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const [row] = await db.select().from(peopleTable).where(eq(peopleTable.id, id)).limit(1);
    if (!row) { res.status(404).json({ error: "Person not found" }); return; }
    res.json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.put("/people/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const body = req.body as Partial<typeof peopleTable.$inferInsert>;
    const [row] = await db.update(peopleTable).set({ ...body, updatedAt: new Date() }).where(eq(peopleTable.id, id)).returning();
    res.json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Ticket Comments ────────────────────────────────────────────────────────────
router.get("/tickets/:ticketId/comments", requireAuth, async (req, res) => {
  try {
    const ticketId = String(req.params["ticketId"] ?? "");
    const rows = await db.select().from(ticketCommentsTable)
      .where(eq(ticketCommentsTable.ticketId, ticketId))
      .orderBy(ticketCommentsTable.createdAt);
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/tickets/:ticketId/comments", requireAuth, async (req, res) => {
  try {
    const ticketId = String(req.params["ticketId"] ?? "");
    const body = req.body as { author: string; content: string; type?: string };
    const [row] = await db.insert(ticketCommentsTable).values({ tenantId: tid(req), ticketId, ...body }).returning();
    res.status(201).json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Seed endpoint ──────────────────────────────────────────────────────────────
router.post("/seed", requireAuth, async (_req, res) => {
  res.json({ message: "Use 'pnpm --filter @workspace/api-server run seed' to seed the database." });
});

export default router;
