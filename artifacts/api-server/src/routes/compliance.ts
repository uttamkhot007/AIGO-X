import { Router } from "express";
import { eq, and, sql, inArray } from "drizzle-orm";
import { db } from "../lib/db";
import { controlsTable, complianceMaturityTable, complianceMaturityHistoryTable, complianceGapsTable, governanceControlsLibraryTable, frameworkLibraryTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import type { JwtPayload } from "../lib/auth";

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

// Static metadata enrichment map keyed by the framework name stored in compliance_controls
const FW_META: Record<string, { shortCode: string; version: string; category: string; region: string; description: string; color: string }> = {
  "ISO 27001":   { shortCode:"ISO27001",  version:"2022", category:"Security",    region:"Global",       color:"#1E3A5F", description:"Information Security Management System — risk assessment, treatment and continual improvement per ISO/IEC 27001:2022 (93 Annex A controls)." },
  "SOC 2":       { shortCode:"SOC2",      version:"2017", category:"Security",    region:"USA",          color:"#065F46", description:"AICPA Trust Services Criteria — Security, Availability, Confidentiality, Processing Integrity and Privacy." },
  "GDPR":        { shortCode:"GDPR",      version:"2018", category:"Privacy",     region:"EU",           color:"#4338CA", description:"EU General Data Protection Regulation — personal data processing obligations, consent, DSAR and breach notification." },
  "HIPAA":       { shortCode:"HIPAA",     version:"2013", category:"Healthcare",  region:"USA",          color:"#92400E", description:"Health Insurance Portability and Accountability Act — Administrative, Physical and Technical safeguards for ePHI." },
  "PCI DSS 4.0": { shortCode:"PCIDSS4",   version:"4.0",  category:"Financial",   region:"Global",       color:"#B45309", description:"Payment Card Industry Data Security Standard v4.0 — 12 requirements for protecting cardholder data environments." },
  "NIST CSF":    { shortCode:"NISTCSF",   version:"2.0",  category:"Security",    region:"USA",          color:"#1D4ED8", description:"NIST Cybersecurity Framework v2.0 — Govern, Identify, Protect, Detect, Respond and Recover functions." },
  "NIS2":        { shortCode:"NIS2",      version:"2022", category:"Regulatory",  region:"EU",           color:"#0C4A6E", description:"EU Network and Information Security Directive 2 — cybersecurity measures for essential and important entities." },
  "CIS Controls":{ shortCode:"CIS18",     version:"18",   category:"Security",    region:"Global",       color:"#065F46", description:"CIS Critical Security Controls v18 — prioritised set of actions to protect against the most pervasive cyber-attacks." },
  "ISO 22301":   { shortCode:"ISO22301",  version:"2019", category:"Operational", region:"Global",       color:"#7C3AED", description:"Business Continuity Management System — ISO 22301:2019 requirements for planning, establishing and maintaining BCM." },
  "DORA":        { shortCode:"DORA",      version:"2022", category:"Financial",   region:"EU",           color:"#9D174D", description:"Digital Operational Resilience Act — ICT risk, incident reporting, testing and third-party risk for financial entities." },
  "SAMA CSF":    { shortCode:"SAMACF",    version:"2017", category:"Financial",   region:"Saudi Arabia", color:"#065F46", description:"Saudi Arabian Monetary Authority Cyber Security Framework — governance, protection, detection and recovery controls." },
  "SWIFT CSCF":  { shortCode:"SWIFTCSCF", version:"2024", category:"Financial",   region:"Global",       color:"#1E3A5F", description:"SWIFT Customer Security Controls Framework — mandatory and advisory controls for SWIFT messaging environments." },
  "CMMC 2.0":    { shortCode:"CMMC2",     version:"2.0",  category:"Government",  region:"USA",          color:"#7C3AED", description:"Cybersecurity Maturity Model Certification Level 2 — 110 practices aligned to NIST SP 800-171 for defence contractors." },
  "EU AI Act":   { shortCode:"EUAIACT",   version:"2024", category:"AI/Emerging", region:"EU",           color:"#4338CA", description:"EU Artificial Intelligence Act — risk classification, conformity assessment and governance for high-risk AI systems." },
  "ISO 42001":   { shortCode:"ISO42001",  version:"2023", category:"AI/Emerging", region:"Global",       color:"#0891B2", description:"AI Management System — ISO/IEC 42001:2023 requirements for responsible development and use of AI." },
  "FedRAMP":     { shortCode:"FEDRAMP",   version:"2024", category:"Government",  region:"USA",          color:"#DC2626", description:"Federal Risk and Authorization Management Program (Moderate) — NIST SP 800-53 controls for federal cloud systems." },
  "ISO 31000":   { shortCode:"ISO31000",  version:"2018", category:"Security",    region:"Global",       color:"#065F46", description:"Risk Management — ISO 31000:2018 principles, framework and process for enterprise-wide risk management." },
  "CSA CCM":     { shortCode:"CSACCM",    version:"4.0",  category:"Cloud",       region:"Global",       color:"#0C4A6E", description:"Cloud Security Alliance Cloud Controls Matrix v4.0 — security controls for cloud infrastructure and services." },
  "CCPA":        { shortCode:"CCPA",      version:"2023", category:"Privacy",     region:"USA",          color:"#7C3AED", description:"California Consumer Privacy Act / CPRA — consumer rights, data handling obligations and opt-out requirements." },
  "ISO 27701":   { shortCode:"ISO27701",  version:"2019", category:"Privacy",     region:"Global",       color:"#9D174D", description:"Privacy Information Management System — ISO/IEC 27701:2019 extension to ISO 27001 for GDPR and privacy compliance." },
  // === INDIA ===
  "RBI Cybersecurity Framework": { shortCode:"RBICSF",  version:"2021", category:"Financial", region:"India",        color:"#7C3AED", description:"Reserve Bank of India Master Directions on IT — cybersecurity governance, risk management, SOC and 6-hour incident reporting for regulated entities." },
  "SEBI CSCRF":                  { shortCode:"SEBICS",  version:"2023", category:"Financial", region:"India",        color:"#0891B2", description:"SEBI Cyber Security & Cyber Resilience Framework — mandatory controls for stock exchanges, depositories, brokers and market infrastructure institutions." },
  "DPDP Act 2023":               { shortCode:"DPDPA",   version:"2023", category:"Privacy",   region:"India",        color:"#9D174D", description:"India Digital Personal Data Protection Act 2023 — consent, data principal rights, fiduciary obligations, breach notification and cross-border transfer controls." },
  "CERT-In Directions":          { shortCode:"CERTIN",  version:"2022", category:"Security",  region:"India",        color:"#1D4ED8", description:"CERT-In Directions on Information Security — mandatory 6-hour incident reporting, 180-day log retention, synchronized clocks and VPN subscriber records." },
  // === KSA ===
  "NCA ECC":                     { shortCode:"NCAECC",  version:"2020", category:"Security",  region:"Saudi Arabia", color:"#065F46", description:"NCA Essential Cybersecurity Controls — baseline controls across 4 domains for Saudi government and private-sector entities under NCA oversight." },
  "NCA CCC":                     { shortCode:"NCACCC",  version:"2020", category:"Cloud",     region:"Saudi Arabia", color:"#0C4A6E", description:"NCA Cloud Cybersecurity Controls — governance, data sovereignty, identity and network security for Saudi organisations consuming cloud services." },
  "PDPL Saudi Arabia":           { shortCode:"PDPLSA",  version:"2021", category:"Privacy",   region:"Saudi Arabia", color:"#7C3AED", description:"Saudi Arabia Personal Data Protection Law — consent, data subject rights, processor obligations, cross-border transfer controls and NDMO enforcement." },
  // === BAHRAIN ===
  "CBB Cybersecurity":           { shortCode:"CBBCS",   version:"2019", category:"Financial", region:"Bahrain",      color:"#B45309", description:"Central Bank of Bahrain Cybersecurity Module — governance, ICT risk, access controls, incident response and outsourcing requirements for CBB licensees." },
  "PDPL Bahrain":                { shortCode:"PDPLBH",  version:"2018", category:"Privacy",   region:"Bahrain",      color:"#4338CA", description:"Bahrain Personal Data Protection Law — data controller registration with PDPEA, consent, data subject rights, cross-border transfers and breach notification." },
  // === AUSTRALIA ===
  "ASD Essential Eight":         { shortCode:"ASD8",    version:"2023", category:"Security",  region:"Australia",    color:"#1E3A5F", description:"ASD Essential Eight Mitigation Strategies — 8 baseline controls at 4 maturity levels to protect against common attack vectors for Australian organisations." },
  "APRA CPS 234":                { shortCode:"CPS234",  version:"2019", category:"Financial", region:"Australia",    color:"#065F46", description:"APRA Prudential Standard CPS 234 — information security capability, policy framework, incident notification and third-party management for APRA-regulated entities." },
  "Privacy Act 1988 (APPs)":     { shortCode:"AUSAPP",  version:"1988", category:"Privacy",   region:"Australia",    color:"#9D174D", description:"Australian Privacy Act 1988 — 13 Australian Privacy Principles governing collection, use, disclosure, security and access to personal information." },
  "ISM Australia":               { shortCode:"AUSISM",  version:"2024", category:"Government",region:"Australia",    color:"#DC2626", description:"Australian Government Information Security Manual — risk-based controls for government agencies and technology partners across all security domains." },
  // === UAE ===
  "UAE NESA IA Standards":       { shortCode:"NESIAA",  version:"2014", category:"Security",  region:"UAE",          color:"#1D4ED8", description:"UAE National Electronic Security Authority IA Standards — governance, risk, access control and incident management for UAE critical infrastructure operators." },
  "CBUAE Cybersecurity":         { shortCode:"CBUAE",   version:"2021", category:"Financial", region:"UAE",          color:"#065F46", description:"Central Bank of UAE Cybersecurity Framework — ICT risk governance, threat intelligence, incident response and third-party risk for CBUAE-regulated entities." },
  "DIFC Data Protection":        { shortCode:"DIFCDP",  version:"2020", category:"Privacy",   region:"UAE",          color:"#4338CA", description:"DIFC Data Protection Law 2020 — data controller/processor obligations, consent, data subject rights, cross-border transfers and 72-hour breach notification." },
  "UAE PDPL":                    { shortCode:"UAEPDPL", version:"2021", category:"Privacy",   region:"UAE",          color:"#7C3AED", description:"UAE Federal Decree-Law No. 45 of 2021 on Personal Data Protection — controller obligations, consent, data subject rights, cross-border transfers and enforcement." },
  // === KENYA ===
  "Kenya DPA 2019":              { shortCode:"KENYAP",  version:"2019", category:"Privacy",   region:"Kenya",        color:"#9D174D", description:"Kenya Data Protection Act 2019 — data controller ODPC registration, consent, data principal rights, cross-border controls and 72-hour breach notification." },
  "CBK Cybersecurity":           { shortCode:"CBKCS",   version:"2021", category:"Financial", region:"Kenya",        color:"#B45309", description:"Central Bank of Kenya Cybersecurity Guidance — ICT risk governance, access control, incident response and 24-hour reporting for CBK-licensed institutions." },
};

// GET /compliance/frameworks
// Derives active frameworks from compliance_controls rows for this tenant,
// enriched with static metadata. Falls back gracefully when no controls exist.
router.get("/compliance/frameworks", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;

    // Aggregate distinct frameworks + control counts from compliance_controls
    const rows = await db
      .select({
        framework:   controlsTable.framework,
        total:       sql<number>`COUNT(*)::int`,
        implemented: sql<number>`SUM(CASE WHEN ${controlsTable.status} = 'implemented' THEN 1 ELSE 0 END)::int`,
        partial:     sql<number>`SUM(CASE WHEN ${controlsTable.status} = 'partial' THEN 1 ELSE 0 END)::int`,
      })
      .from(controlsTable)
      .where(eq(controlsTable.tenantId, tenantId))
      .groupBy(controlsTable.framework)
      .orderBy(controlsTable.framework);

    const libRows = await db.select({ id: frameworkLibraryTable.id, shortCode: frameworkLibraryTable.shortCode }).from(frameworkLibraryTable);
    const libIdByShortCode: Record<string, number> = Object.fromEntries(libRows.map(r => [r.shortCode, r.id]));

    const result = rows.map((r: any) => {
      const meta = FW_META[r.framework] ?? {
        shortCode: r.framework.replace(/\s+/g, "").toUpperCase().slice(0, 12),
        version: "",
        category: "Security",
        region: "Global",
        description: "",
        color: "#1E3A5F",
      };
      const total = Number(r.total) || 0;
      const impl  = Number(r.implemented) || 0;
      const pct   = total > 0 ? Math.round((impl / total) * 100) : 0;
      return {
        id:           meta.shortCode,
        libraryId:    libIdByShortCode[meta.shortCode] ?? null,
        shortCode:    meta.shortCode,
        name:         r.framework,
        version:      meta.version,
        category:     meta.category,
        region:       meta.region,
        description:  meta.description,
        color:        meta.color,
        controlsCount: total,
        implemented:  impl,
        partial:      Number(r.partial) || 0,
        pct,
        isBeta:       false,
        assignedAt:   new Date().toISOString(),
      };
    });

    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /compliance/controls
router.get("/compliance/controls", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const fwParam = (req.query.frameworks as string | undefined)?.trim();
    const fwNames = fwParam ? fwParam.split(",").map(s => s.trim()).filter(Boolean) : [];
    const rows = await db.select().from(controlsTable).where(
      fwNames.length > 0
        ? and(eq(controlsTable.tenantId, tenantId), inArray(controlsTable.framework, fwNames))
        : eq(controlsTable.tenantId, tenantId)
    );
    return res.json(rows.map(ctrlRow));
  } catch {
    return res.status(500).json({ error: "Internal server error" });
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
    return res.status(201).json(ctrlRow(ctrl!));
  } catch {
    return res.status(500).json({ error: "Internal server error" });
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
    if (!ctrl) return res.status(404).json({ error: "Control not found" });

    // Fire-and-forget: keep maturity + gaps in sync
    Promise.all([
      syncMaturityForDomain(tenantId, ctrl.domain),
      syncGapsForFramework(tenantId, ctrl.framework),
    ]).catch(() => {});

    return res.json(ctrlRow(ctrl));
  } catch {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Resolve ?frameworkIds=1,2,3 → framework name array (for tables that store framework as name text).
async function resolveFrameworkNames(ids: number[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await db.select({ name: frameworkLibraryTable.name }).from(frameworkLibraryTable).where(inArray(frameworkLibraryTable.id, ids));
  return rows.map(r => r.name);
}

// GET /compliance/gaps — optional ?frameworkIds=1,2 or ?frameworks=ISO+27001,SOC+2
router.get("/compliance/gaps", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;

    // Prefer frameworkIds (ID-based gating), fall back to name-based filter for compatibility
    const idsParam = (req.query.frameworkIds as string | undefined)?.trim();
    const namesParam = (req.query.frameworks as string | undefined)?.trim();
    let fwNames: string[] = [];
    if (idsParam) {
      const ids = idsParam.split(",").map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
      fwNames = await resolveFrameworkNames(ids);
    } else if (namesParam) {
      fwNames = namesParam.split(",").map(s => s.trim()).filter(Boolean);
    }

    // Deny-by-default: if a filter param was provided but resolved to nothing → return empty
    const filterRequested = !!(idsParam || namesParam);
    if (filterRequested && fwNames.length === 0) {
      return res.json([]);
    }
    const rows = await db.select().from(complianceGapsTable).where(
      fwNames.length > 0
        ? and(eq(complianceGapsTable.tenantId, tenantId), inArray(complianceGapsTable.framework, fwNames))
        : eq(complianceGapsTable.tenantId, tenantId)
    );
    return res.json(rows.map(r => ({
      framework: r.framework, total: r.total ?? 0, implemented: r.implemented ?? 0,
      partial: r.partial ?? 0, notStarted: r.notStarted ?? 0, pct: r.pct ?? 0,
    })));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /compliance/maturity — optional ?frameworkIds=1,2 (filters to domains used by those frameworks)
router.get("/compliance/maturity", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;

    const idsParam = (req.query.frameworkIds as string | undefined)?.trim();
    let fwNames: string[] = [];
    if (idsParam) {
      const ids = idsParam.split(",").map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
      fwNames = await resolveFrameworkNames(ids);
    }

    // Deny-by-default: frameworkIds provided but resolved to nothing → return empty
    if (idsParam && fwNames.length === 0) {
      return res.json([]);
    }

    let rows;
    if (fwNames.length > 0) {
      // Filter maturity rows to domains that appear in compliance_controls for these frameworks
      const domainRows = await db
        .selectDistinct({ domain: controlsTable.domain })
        .from(controlsTable)
        .where(and(eq(controlsTable.tenantId, tenantId), inArray(controlsTable.framework, fwNames)));
      const domains = domainRows.map(r => r.domain).filter(Boolean) as string[];
      rows = domains.length > 0
        ? await db.select().from(complianceMaturityTable).where(
            and(eq(complianceMaturityTable.tenantId, tenantId), inArray(complianceMaturityTable.domain, domains))
          )
        : [];
    } else {
      rows = await db.select().from(complianceMaturityTable).where(eq(complianceMaturityTable.tenantId, tenantId));
    }

    return res.json(rows.map(r => ({
      domain: r.domain, score: Number(r.score) || 0, prev: Number(r.prev) || 0,
      target: Number(r.target) || 0, controls: Number(r.controls) || 0,
      implemented: Number(r.implemented) || 0,
    })));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
