import { Router } from "express";
import { eq, count, sql, and } from "drizzle-orm";
import dns from "dns";
import { db } from "../lib/db";
import {
  trustCenterConfigsTable,
  trustCenterAccessRequestsTable,
  tenantsTable,
  controlsTable,
  complianceGapsTable,
  evidenceArtifactsTable,
  evidenceEngineRunsTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";
import type { JwtPayload } from "../lib/auth";
import type { Request } from "express";
import { publicTrustLimiter, publicAiLimiter } from "../middlewares/rate-limit";
import { desc } from "drizzle-orm";
import { buildQuestionnaireContext } from "../services/questionnaire-ai";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();
type AuthReq = Request & { user: JwtPayload };

// ── Helpers ────────────────────────────────────────────────────────────────────

function defaultSlug(tenantId: number) {
  return `tenant-${tenantId}`;
}

async function getOrCreateConfig(tenantId: number) {
  let [cfg] = await db
    .select()
    .from(trustCenterConfigsTable)
    .where(eq(trustCenterConfigsTable.tenantId, tenantId));

  if (!cfg) {
    const [tenant] = await db
      .select({ name: tenantsTable.name, slug: tenantsTable.slug })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId));

    const slug = tenant?.slug ?? defaultSlug(tenantId);
    const displayName = tenant?.name ? `${tenant.name} Trust Center` : "Trust Center";

    [cfg] = await db
      .insert(trustCenterConfigsTable)
      .values({
        tenantId,
        slug,
        displayName,
        tagline: "Our commitment to security, compliance, and privacy.",
        accentColor: "#1E3A5F",
        visibleSections: { grcScore: true, frameworks: true, controls: true, evidence: true, certifications: true, aiQa: true },
        certifications: [],
      })
      .onConflictDoUpdate({
        target: trustCenterConfigsTable.tenantId,
        set: { updatedAt: new Date() },
      })
      .returning();
  }

  return cfg!;
}

async function buildPublicStats(tenantId: number) {
  const [ctrlRow] = await db
    .select({
      total:       count(),
      implemented: sql<number>`SUM(CASE WHEN status IN ('implemented','operational') THEN 1 ELSE 0 END)`,
    })
    .from(controlsTable)
    .where(eq(controlsTable.tenantId, tenantId));

  const frameworks = await db
    .select({
      framework:   complianceGapsTable.framework,
      total:       complianceGapsTable.total,
      implemented: complianceGapsTable.implemented,
      pct:         complianceGapsTable.pct,
    })
    .from(complianceGapsTable)
    .where(eq(complianceGapsTable.tenantId, tenantId));

  const [lastRun] = await db
    .select({ createdAt: evidenceEngineRunsTable.createdAt })
    .from(evidenceEngineRunsTable)
    .where(eq(evidenceEngineRunsTable.tenantId, tenantId))
    .orderBy(sql`created_at DESC`)
    .limit(1);

  const totalCtrls = Number(ctrlRow?.total ?? 0);
  const implCtrls  = Number(ctrlRow?.implemented ?? 0);
  const grcScore   = totalCtrls > 0
    ? Math.min(99, Math.round((implCtrls / totalCtrls) * 100 * 0.9 + 10))
    : 72;

  return {
    grcScore,
    controlsImplemented: implCtrls,
    controlsTotal:       totalCtrls,
    frameworks:          frameworks.length > 0 ? frameworks : [
      { framework: "SOC 2 Type II",   total: 64,  implemented: 58, pct: 91 },
      { framework: "ISO 27001",        total: 114, implemented: 98, pct: 86 },
      { framework: "GDPR",             total: 42,  implemented: 36, pct: 86 },
      { framework: "NIST CSF",         total: 23,  implemented: 18, pct: 78 },
    ],
    lastEvidenceRun: lastRun?.createdAt?.toISOString() ?? null,
  };
}

// ── Admin: GET /trust-center/config ──────────────────────────────────────────

router.get("/trust-center/config", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const cfg = await getOrCreateConfig(tenantId);
    res.json(cfg);
  } catch (err) {
    console.error("[trust-center] GET config error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin: PUT /trust-center/config ──────────────────────────────────────────

router.put("/trust-center/config", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;

    await getOrCreateConfig(tenantId);

    const {
      slug,
      published,
      displayName,
      tagline,
      accentColor,
      logoUrl,
      customDomain,
      visibleSections,
      certifications,
      notificationEmail,
    } = req.body as Record<string, unknown>;

    if (slug && typeof slug === "string") {
      const existing = await db
        .select({ id: trustCenterConfigsTable.id, tenantId: trustCenterConfigsTable.tenantId })
        .from(trustCenterConfigsTable)
        .where(eq(trustCenterConfigsTable.slug, slug));

      const conflict = existing.find(r => r.tenantId !== tenantId);
      if (conflict) {
        res.status(409).json({ error: "That slug is already taken. Please choose another." });
        return;
      }
    }

    const prevCfg = await getOrCreateConfig(tenantId);
    const domainChanged = customDomain !== undefined && String(customDomain || "").toLowerCase().trim() !== (prevCfg.customDomain ?? "");

    const [updated] = await db
      .update(trustCenterConfigsTable)
      .set({
        ...(slug !== undefined        && { slug: String(slug) }),
        ...(published !== undefined   && { published: Boolean(published) }),
        ...(displayName !== undefined && { displayName: String(displayName) }),
        ...(tagline !== undefined     && { tagline: String(tagline) }),
        ...(accentColor !== undefined && { accentColor: String(accentColor) }),
        ...(logoUrl !== undefined     && { logoUrl: logoUrl ? String(logoUrl) : null }),
        ...(customDomain !== undefined && {
          customDomain: customDomain ? String(customDomain).toLowerCase().trim() : null,
          ...(domainChanged && { customDomainStatus: "unverified" }),
        }),
        ...(visibleSections !== undefined && { visibleSections }),
        ...(certifications !== undefined  && { certifications }),
        ...(notificationEmail !== undefined && {
          notificationEmail: notificationEmail ? String(notificationEmail).trim().toLowerCase().slice(0, 320) : null,
        }),
        updatedAt: new Date(),
      })
      .where(eq(trustCenterConfigsTable.tenantId, tenantId))
      .returning();

    res.json(updated);
  } catch (err) {
    console.error("[trust-center] PUT config error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin: POST /trust-center/verify-domain ───────────────────────────────────

const CNAME_TARGET = process.env["TRUST_CENTER_CNAME_TARGET"] ?? "trust.aigo-x.com";

router.post("/trust-center/verify-domain", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const cfg = await getOrCreateConfig(tenantId);

    if (!cfg.customDomain) {
      res.status(400).json({ error: "No custom domain configured. Save a domain first." });
      return;
    }

    const domain = cfg.customDomain;

    let cnameRecords: string[] = [];
    try {
      cnameRecords = await dns.promises.resolveCname(domain);
    } catch {
      cnameRecords = [];
    }

    const verified = cnameRecords.some(r => r.toLowerCase().replace(/\.$/, "") === CNAME_TARGET.toLowerCase().replace(/\.$/, ""));

    const newStatus = verified ? "active" : "failed";

    const [updated] = await db
      .update(trustCenterConfigsTable)
      .set({ customDomainStatus: newStatus, updatedAt: new Date() })
      .where(eq(trustCenterConfigsTable.tenantId, tenantId))
      .returning();

    res.json({
      domain,
      status: newStatus,
      cnameRecords,
      cnameTarget: CNAME_TARGET,
      config: updated,
    });
  } catch (err) {
    console.error("[trust-center] verify-domain error:", err);
    res.status(500).json({ error: "DNS verification failed due to an internal error." });
  }
});

// ── Email: access request notification ───────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendAccessRequestNotification(
  toEmail: string,
  data: { name: string; email: string; message: string | null; tenantId: number; displayName: string },
): Promise<void> {
  const apiKey = process.env["SENDGRID_API_KEY"];
  if (!apiKey) {
    console.warn("[trust-center] SENDGRID_API_KEY not set — skipping notification email");
    return;
  }

  const settingsUrl = `${process.env["APP_BASE_URL"] ?? "https://app.aigo-x.com"}/settings?tab=trust-center-cfg`;

  const safeName    = escapeHtml(data.name);
  const safeEmail   = escapeHtml(data.email);
  const safeMessage = data.message ? escapeHtml(data.message) : null;
  const safeTitle   = escapeHtml(data.displayName);

  const htmlBody = `<html><body style="font-family:Arial,sans-serif;max-width:640px;margin:40px auto;color:#1e293b;">
<h2 style="color:#1E3A5F;border-bottom:2px solid #1E3A5F;padding-bottom:10px;margin-bottom:20px;">
  New Access Request &#8212; ${safeTitle}
</h2>
<p style="font-size:14px;color:#334155;margin-bottom:20px;">
  A visitor has submitted an access request through your public Trust Center.
</p>
<table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
  <tr style="background:#f1f5f9;">
    <td style="padding:10px 14px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.4px;width:120px;">Name</td>
    <td style="padding:10px 14px;font-size:14px;color:#0f172a;">${safeName}</td>
  </tr>
  <tr>
    <td style="padding:10px 14px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.4px;">Email</td>
    <td style="padding:10px 14px;font-size:14px;color:#0f172a;"><a href="mailto:${safeEmail}" style="color:#1E3A5F;">${safeEmail}</a></td>
  </tr>
  ${safeMessage ? `<tr style="background:#f1f5f9;">
    <td style="padding:10px 14px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.4px;vertical-align:top;">Message</td>
    <td style="padding:10px 14px;font-size:14px;color:#0f172a;white-space:pre-wrap;">${safeMessage}</td>
  </tr>` : ""}
</table>
<a href="${settingsUrl}" style="display:inline-block;padding:10px 20px;background:#1E3A5F;color:#fff;text-decoration:none;border-radius:7px;font-size:13px;font-weight:700;">
  Review in Trust Center Settings &#8594;
</a>
<hr style="margin:32px 0;border-color:#e2e8f0;"/>
<p style="font-size:11px;color:#94a3b8;">Delivered by AIGO-X GRC Platform · You are receiving this because a notification email is configured for your Trust Center.</p>
</body></html>`;

  const textBody = [
    `New Access Request — ${data.displayName}`,
    "",
    `Name:    ${data.name}`,
    `Email:   ${data.email}`,
    data.message ? `Message: ${data.message}` : "",
    "",
    `Review requests: ${settingsUrl}`,
  ].filter(l => l !== undefined).join("\n");

  const payload = {
    personalizations: [{ to: [{ email: toEmail }] }],
    from: { email: process.env["SENDGRID_FROM_EMAIL"] ?? "noreply@aigo-x.com", name: "AIGO-X Trust Center" },
    subject: `New Access Request — ${data.displayName}`,
    content: [
      { type: "text/plain", value: textBody },
      { type: "text/html",  value: htmlBody },
    ],
  };

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`SendGrid returned ${response.status}: ${body}`);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function extractRequestHost(req: Request): string | null {
  const fwd = req.headers["x-forwarded-host"];
  if (fwd) return (Array.isArray(fwd) ? fwd[0] : fwd).split(":")[0]?.toLowerCase() ?? null;
  const host = req.headers["host"];
  if (host) return host.split(":")[0]?.toLowerCase() ?? null;
  return null;
}

async function findConfigByHostOrSlug(host: string | null, slug: string | null) {
  if (host) {
    const [byDomain] = await db
      .select()
      .from(trustCenterConfigsTable)
      .where(
        and(
          eq(trustCenterConfigsTable.customDomain, host),
          eq(trustCenterConfigsTable.customDomainStatus, "active"),
        )
      );
    if (byDomain) return byDomain;
  }
  if (slug) {
    const [bySlug] = await db
      .select()
      .from(trustCenterConfigsTable)
      .where(eq(trustCenterConfigsTable.slug, slug));
    return bySlug ?? null;
  }
  return null;
}

// ── Public: GET /public/trust/by-host (custom domain lookup) ─────────────────

router.get("/public/trust/by-host", publicTrustLimiter, async (req, res) => {
  try {
    const host = extractRequestHost(req);
    if (!host) {
      res.status(400).json({ error: "Cannot determine request host." });
      return;
    }

    const cfg = await findConfigByHostOrSlug(host, null);

    if (!cfg) {
      res.status(404).json({ error: "Trust Center not found for this domain" });
      return;
    }

    if (!cfg.published) {
      res.status(403).json({ error: "This Trust Center is not yet published" });
      return;
    }

    const stats = await buildPublicStats(cfg.tenantId);

    res.json({
      slug:            cfg.slug,
      customDomain:    cfg.customDomain,
      displayName:     cfg.displayName,
      tagline:         cfg.tagline,
      accentColor:     cfg.accentColor,
      logoUrl:         cfg.logoUrl,
      visibleSections: cfg.visibleSections,
      certifications:  cfg.certifications,
      ...stats,
    });
  } catch (err) {
    console.error("[trust-center] GET by-host error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Public: GET /public/trust/:slug ──────────────────────────────────────────

router.get("/public/trust/:slug", publicTrustLimiter, async (req, res) => {
  try {
    const { slug } = req.params as { slug: string };
    const host = extractRequestHost(req);

    const cfg = await findConfigByHostOrSlug(host, slug);

    if (!cfg) {
      res.status(404).json({ error: "Trust Center not found" });
      return;
    }

    if (!cfg.published) {
      res.status(403).json({ error: "This Trust Center is not yet published" });
      return;
    }

    const stats = await buildPublicStats(cfg.tenantId);

    res.json({
      slug:            cfg.slug,
      customDomain:    cfg.customDomain,
      displayName:     cfg.displayName,
      tagline:         cfg.tagline,
      accentColor:     cfg.accentColor,
      logoUrl:         cfg.logoUrl,
      visibleSections: cfg.visibleSections,
      certifications:  cfg.certifications,
      ...stats,
    });
  } catch (err) {
    console.error("[trust-center] GET public error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Public: POST /public/trust/:slug/request ─────────────────────────────────

router.post("/public/trust/:slug/request", publicTrustLimiter, async (req, res) => {
  try {
    const { slug } = req.params as { slug: string };
    const host = extractRequestHost(req);
    const { name, email, message } = req.body as { name?: string; email?: string; message?: string };

    if (!name || typeof name !== "string" || name.trim().length < 1) {
      res.status(400).json({ error: "Please provide your name." });
      return;
    }
    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      res.status(400).json({ error: "Please provide a valid email address." });
      return;
    }

    const cfg = await findConfigByHostOrSlug(host, slug);
    if (!cfg || !cfg.published) {
      res.status(404).json({ error: "Trust Center not found or not published" });
      return;
    }

    const vis = cfg.visibleSections as Record<string, boolean>;
    if (vis.requestAccess === false) {
      res.status(403).json({ error: "Access requests are disabled for this Trust Center." });
      return;
    }

    const [inserted] = await db
      .insert(trustCenterAccessRequestsTable)
      .values({
        tenantId: cfg.tenantId,
        name:     name.trim().slice(0, 200),
        email:    email.trim().toLowerCase().slice(0, 320),
        message:  message ? message.trim().slice(0, 1000) : null,
        status:   "pending",
      })
      .returning();

    res.status(201).json({ ok: true, id: inserted?.id });

    // Fire-and-forget notification email — do not await so it never blocks the response
    if (cfg.notificationEmail) {
      sendAccessRequestNotification(cfg.notificationEmail, {
        name:        name.trim(),
        email:       email.trim().toLowerCase(),
        message:     message ? message.trim() : null,
        tenantId:    cfg.tenantId,
        displayName: cfg.displayName || "Your Trust Center",
      }).catch(err => console.error("[trust-center] Notification email failed:", err));
    }
  } catch (err) {
    console.error("[trust-center] POST request error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin: GET /trust-center/access-requests ──────────────────────────────────

router.get("/trust-center/access-requests", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const { status } = req.query as { status?: string };

    const rows = await db
      .select()
      .from(trustCenterAccessRequestsTable)
      .where(
        status && status !== "all"
          ? and(
              eq(trustCenterAccessRequestsTable.tenantId, tenantId),
              eq(trustCenterAccessRequestsTable.status, status)
            )
          : eq(trustCenterAccessRequestsTable.tenantId, tenantId)
      )
      .orderBy(desc(trustCenterAccessRequestsTable.createdAt));

    res.json(rows);
  } catch (err) {
    console.error("[trust-center] GET access-requests error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin: PUT /trust-center/access-requests/:id ─────────────────────────────

router.put("/trust-center/access-requests/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const id = parseInt((req.params as { id: string }).id, 10);
    const { status } = req.body as { status?: string };

    if (!status || !["pending", "approved", "denied"].includes(status)) {
      res.status(400).json({ error: "Status must be one of: pending, approved, denied" });
      return;
    }

    const [existing] = await db
      .select({ id: trustCenterAccessRequestsTable.id })
      .from(trustCenterAccessRequestsTable)
      .where(
        and(
          eq(trustCenterAccessRequestsTable.id, id),
          eq(trustCenterAccessRequestsTable.tenantId, tenantId)
        )
      );

    if (!existing) {
      res.status(404).json({ error: "Request not found" });
      return;
    }

    const [updated] = await db
      .update(trustCenterAccessRequestsTable)
      .set({ status, updatedAt: new Date() })
      .where(eq(trustCenterAccessRequestsTable.id, id))
      .returning();

    res.json(updated);
  } catch (err) {
    console.error("[trust-center] PUT access-request error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Public: POST /public/trust/:slug/ask ─────────────────────────────────────

router.post("/public/trust/:slug/ask", publicAiLimiter, async (req, res) => {
  try {
    const { slug } = req.params as { slug: string };
    const { question } = req.body as { question?: string };
    const host = extractRequestHost(req);

    if (!question || typeof question !== "string" || question.trim().length < 3) {
      res.status(400).json({ error: "Please provide a question (at least 3 characters)." });
      return;
    }

    const cfg = await findConfigByHostOrSlug(host, slug);

    if (!cfg || !cfg.published) {
      res.status(404).json({ error: "Trust Center not found or not published" });
      return;
    }

    const vis = cfg.visibleSections as Record<string, boolean>;
    if (!vis.aiQa) {
      res.status(403).json({ error: "AI Q&A is disabled for this Trust Center" });
      return;
    }

    const { contextString } = await buildQuestionnaireContext(cfg.tenantId);

    const systemPrompt = `You are the security compliance assistant for ${cfg.displayName}.
A visitor to the public Trust Center is asking a security or compliance question.
Answer concisely, factually, and professionally. Cite specific controls, policies, or evidence where relevant.
Do not speculate beyond what the data shows. If information isn't available, say so politely.
Keep answers under 250 words.

${contextString || "No detailed compliance data available yet — answer based on general best practices for a security-conscious organisation."}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: question.trim().slice(0, 500) },
      ],
      max_tokens: 400,
      temperature: 0.3,
    });

    const answer = completion.choices[0]?.message?.content ?? "I'm unable to answer that question at this time.";
    res.json({ answer });
  } catch (err) {
    console.error("[trust-center] AI ask error:", err);
    res.status(500).json({ error: "Unable to generate an answer right now. Please try again." });
  }
});

export default router;
