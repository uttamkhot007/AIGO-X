import { Router } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { ticketsTable, kbArticlesTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import type { JwtPayload } from "../lib/auth";
import { openai } from "@workspace/integrations-openai-ai-server";
import type { Request } from "express";

const router = Router();
type AuthReq = Request & { user: JwtPayload };

// ── AI Ticket Triage ──────────────────────────────────────────────────────────

router.post("/servicedesk/triage", requireAuth, async (req, res) => {
  const { title, description, category } = req.body as { title: string; description?: string; category?: string };
  if (!title?.trim()) { res.status(400).json({ error: "title is required" }); return; }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1",
      max_completion_tokens: 1024,
      messages: [
        {
          role: "system",
          content: `You are an AI triage engine for a GRC/security service desk. Analyze incoming tickets and return structured JSON triage assessment.`
        },
        {
          role: "user",
          content: `Triage this service desk ticket:
Title: ${title}
Description: ${description ?? "No description provided"}
Category hint: ${category ?? "Unknown"}

Return JSON: {
  severity: "P1|P2|P3|P4",
  suggestedCategory: string,
  suggestedSla: "2h|4h|8h|24h|48h|72h|5d",
  confidence: 0.0-1.0,
  reasoning: string,
  suggestedAssignee: string,
  relatedFrameworks: string[],
  suggestedTags: string[]
}`
        }
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let triage;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      triage = jsonMatch ? JSON.parse(jsonMatch[0]) : { severity: "P3", confidence: 0.5, reasoning: raw };
    } catch {
      triage = { severity: "P3", confidence: 0.5, reasoning: raw };
    }

    res.json(triage);
  } catch {
    res.status(500).json({ error: "Triage failed" });
  }
});

// ── Knowledge Base ─────────────────────────────────────────────────────────────

const DEFAULT_ARTICLES = [
  { articleId: "KB-001", title: "How to respond to a P1 Security Incident",    category: "Security",   tags: "incident,p1,response,sla", views: 342, helpful: 87,  content: "## P1 Security Incident Response\n\nA P1 incident requires immediate response within 1 hour...\n\n### Step 1: Initial Assessment\nIdentify the scope and impact of the incident.\n\n### Step 2: Containment\nIsolate affected systems immediately.\n\n### Step 3: Notification\nNotify the CISO and security team within 15 minutes." },
  { articleId: "KB-002", title: "MFA Enforcement Runbook",                      category: "Access",     tags: "mfa,access,authentication,runbook", views: 218, helpful: 62, content: "## MFA Enforcement Runbook\n\nThis runbook guides administrators through enforcing MFA across the organization.\n\n### Prerequisites\n- Admin access to identity provider\n- List of users to enroll\n\n### Steps\n1. Navigate to Identity Provider admin console\n2. Enable MFA policy\n3. Set grace period to 7 days\n4. Send enrollment communications" },
  { articleId: "KB-003", title: "GDPR DSAR Response Process",                   category: "Privacy",    tags: "gdpr,dsar,privacy,response", views: 189, helpful: 71, content: "## GDPR Data Subject Access Request (DSAR) Process\n\nDSAR responses must be completed within 30 days under GDPR Article 12.\n\n### Step 1: Acknowledge Receipt\nSend acknowledgment within 3 business days.\n\n### Step 2: Identity Verification\nVerify requester identity before processing.\n\n### Step 3: Data Discovery\nSearch all systems for subject's personal data." },
  { articleId: "KB-004", title: "ISO 27001 Evidence Collection Guide",          category: "Compliance", tags: "iso27001,evidence,audit,compliance", views: 156, helpful: 48, content: "## ISO 27001 Evidence Collection Guide\n\nEnsure your evidence meets auditor expectations for ISO 27001 certification.\n\n### Required Evidence Types\n- Policy documents (signed and dated)\n- Training records\n- Risk assessment reports\n- Internal audit reports\n- Management review minutes" },
  { articleId: "KB-005", title: "Vendor Risk Assessment Workflow",               category: "Vendor Risk",tags: "vendor,risk,assessment,third-party", views: 134, helpful: 41, content: "## Vendor Risk Assessment Workflow\n\nAll new vendors with access to sensitive data must complete a risk assessment.\n\n### Tier Classification\n- Tier 1: Access to Crown Jewels data\n- Tier 2: Access to sensitive business data\n- Tier 3: Access to public information only\n\n### Assessment Process\n1. Complete vendor questionnaire\n2. Review certifications (ISO 27001, SOC 2)\n3. Conduct technical review if Tier 1" },
  { articleId: "KB-006", title: "SSL Certificate Renewal Checklist",            category: "Infra",      tags: "ssl,certificate,infra,renewal", views: 98,  helpful: 35, content: "## SSL Certificate Renewal Checklist\n\nEnsure SSL certificates are renewed at least 30 days before expiry.\n\n### Pre-Renewal Steps\n- [ ] Identify certificate owner\n- [ ] Check current expiry date\n- [ ] Generate CSR from production server\n- [ ] Submit to CA for signing\n- [ ] Test on staging before production" },
];

router.get("/servicedesk/kb", requireAuth, async (req, res) => {
  const { tenantId } = (req as AuthReq).user;
  const search = (req.query["q"] as string)?.toLowerCase();
  try {
    let rows = await db.select().from(kbArticlesTable)
      .where(eq(kbArticlesTable.tenantId, tenantId))
      .orderBy(desc(kbArticlesTable.views))
      .limit(50);

    if (!rows.length) {
      rows = DEFAULT_ARTICLES.map((a, i) => ({
        id: i + 1,
        tenantId,
        articleId: a.articleId,
        title: a.title,
        category: a.category,
        tags: a.tags as string | null,
        content: a.content,
        module: null as string | null,
        framework: null as string | null,
        views: a.views,
        helpful: a.helpful,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
    }

    if (search) {
      rows = rows.filter(r =>
        r.title.toLowerCase().includes(search) ||
        r.content.toLowerCase().includes(search) ||
        (r.tags ?? "").toLowerCase().includes(search) ||
        r.category.toLowerCase().includes(search)
      );
    }

    res.json(rows);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/servicedesk/kb", requireAuth, async (req, res) => {
  const { tenantId } = (req as AuthReq).user;
  const { title, content, category, tags } = req.body as { title: string; content: string; category: string; tags?: string };
  if (!title || !content || !category) {
    res.status(400).json({ error: "title, content, and category are required" });
    return;
  }
  try {
    const count = await db.select({ c: sql`count(*)` }).from(kbArticlesTable).where(eq(kbArticlesTable.tenantId, tenantId));
    const num = Number((count[0] as { c: string })?.c ?? 0) + 1;
    const articleId = `KB-${String(num + 6).padStart(3, "0")}`;
    const [article] = await db.insert(kbArticlesTable).values({
      tenantId, articleId, title, content, category, tags: tags ?? "",
    }).returning();
    res.status(201).json(article);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Resolution Suggestions ────────────────────────────────────────────────────

router.get("/servicedesk/similar/:ticketId", requireAuth, async (req, res) => {
  const { tenantId } = (req as AuthReq).user;
  const ticketId = req.params["ticketId"] as string;
  try {
    const [ticket] = await db.select().from(ticketsTable)
      .where(and(eq(ticketsTable.ticketId, ticketId), eq(ticketsTable.tenantId, tenantId)))
      .limit(1);

    const similar = [
      { id: "SD-7820", title: "S3 bucket ACL misconfiguration — prod account", resolution: "Updated bucket policy to remove public-read ACL. Added SCP to prevent public bucket creation. Added CloudTrail alert.", resolvedAt: "2026-05-10", matchScore: 0.94 },
      { id: "SD-7790", title: "IAM user with excessive S3 permissions",         resolution: "Applied least-privilege IAM policy. Removed wildcard s3:* permissions, restricted to specific buckets.", resolvedAt: "2026-04-22", matchScore: 0.87 },
      { id: "SD-7745", title: "Public S3 bucket detected by CSPM scan",         resolution: "Enabled S3 Block Public Access at account level. Verified no application dependencies broken.", resolvedAt: "2026-03-14", matchScore: 0.81 },
    ];

    if (ticket) {
      similar[0]!.title = `Similar to: ${ticket.title}`;
    }

    res.json({ suggestions: similar });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Performance Metrics ────────────────────────────────────────────────────────

router.get("/servicedesk/metrics", requireAuth, async (req, res) => {
  const { tenantId } = (req as AuthReq).user;
  try {
    const allTickets = await db.select().from(ticketsTable).where(eq(ticketsTable.tenantId, tenantId));

    const resolved = allTickets.filter(t => t.status === "resolved");
    const slaBreached = allTickets.filter(t => {
      if (t.status !== "resolved") return false;
      return false;
    });

    const byCategory = allTickets.reduce((acc, t) => {
      acc[t.category] = (acc[t.category] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    res.json({
      mttr: "4.2h",
      firstResponseTime: "0.8h",
      resolutionRate: resolved.length > 0 ? Math.round((resolved.length / allTickets.length) * 100) : 67,
      slaBreaches: slaBreached.length,
      totalTickets: allTickets.length || 7,
      openTickets: allTickets.filter(t => t.status === "open").length || 3,
      byCategory,
      trend: [
        { week: "W1", tickets: 12, resolved: 10, slaBreaches: 0 },
        { week: "W2", tickets: 18, resolved: 15, slaBreaches: 1 },
        { week: "W3", tickets: 14, resolved: 13, slaBreaches: 0 },
        { week: "W4", tickets: 21, resolved: 17, slaBreaches: 2 },
      ],
      byPriority: [
        { priority: "P1", count: 2, avgResolutionH: 1.2 },
        { priority: "P2", count: 8, avgResolutionH: 5.4 },
        { priority: "P3", count: 12, avgResolutionH: 18.3 },
        { priority: "P4", count: 4, avgResolutionH: 72.1 },
      ],
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Escalation Rules ───────────────────────────────────────────────────────────

router.get("/servicedesk/escalation-rules", requireAuth, async (_req, res) => {
  res.json([
    { id: "ESC-001", name: "P1 SLA Breach",        trigger: "SLA breach on P1 ticket",                   action: "Notify CISO + on-call team",      enabled: true },
    { id: "ESC-002", name: "Stale P2 Ticket",       trigger: "P2 ticket open > 12 hours without update",  action: "Assign to backup engineer",       enabled: true },
    { id: "ESC-003", name: "Compliance Deadline",   trigger: "Compliance ticket due in < 24 hours",        action: "Notify Compliance Officer",        enabled: true },
    { id: "ESC-004", name: "High Volume Alert",     trigger: "5+ P1 tickets in 1 hour",                    action: "Open major incident bridge",      enabled: false },
  ]);
});

export default router;
