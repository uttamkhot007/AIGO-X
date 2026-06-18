import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { onboardingSessionsTable, risksTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import type { JwtPayload } from "../lib/auth";
import type { Request, Response } from "express";

const router = Router();
type AuthReq = Request & { user: JwtPayload };

router.get("/onboarding", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { tenantId } = (req as AuthReq).user;
  try {
    const [session] = await db.select().from(onboardingSessionsTable)
      .where(eq(onboardingSessionsTable.tenantId, tenantId));
    if (!session) {
      const [created] = await db.insert(onboardingSessionsTable)
        .values({ tenantId, currentStage: 1, completed: false, stagesData: {} })
        .returning();
      res.json(created);
      return;
    }
    res.json(session);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/onboarding/stage/:n", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { tenantId } = (req as AuthReq).user;
  const raw = req.params["n"];
  const stageNum = parseInt(typeof raw === "string" ? raw : String(raw), 10);
  if (isNaN(stageNum) || stageNum < 1 || stageNum > 13) {
    res.status(400).json({ error: "Invalid stage number" });
    return;
  }
  try {
    const [session] = await db.select().from(onboardingSessionsTable)
      .where(eq(onboardingSessionsTable.tenantId, tenantId));

    const existing = (session?.stagesData as Record<string, unknown>) ?? {};
    const updatedData = { ...existing, [`stage${stageNum}`]: req.body };
    const nextStage = Math.max(session?.currentStage ?? 1, stageNum + 1);

    if (!session) {
      const [created] = await db.insert(onboardingSessionsTable)
        .values({ tenantId, currentStage: nextStage, stagesData: updatedData })
        .returning();
      res.json(created);
      return;
    }
    const [updated] = await db.update(onboardingSessionsTable)
      .set({ stagesData: updatedData, currentStage: nextStage, updatedAt: new Date() })
      .where(eq(onboardingSessionsTable.tenantId, tenantId))
      .returning();
    res.json(updated);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/onboarding/complete", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { tenantId } = (req as AuthReq).user;
  try {
    const [session] = await db.select().from(onboardingSessionsTable)
      .where(eq(onboardingSessionsTable.tenantId, tenantId));
    if (!session) {
      res.status(404).json({ error: "No session" });
      return;
    }

    const data = (session.stagesData as Record<string, Record<string, unknown>>) ?? {};
    const s6 = data["stage6"] as { topThreats?: string[] } | undefined;

    if (s6?.topThreats?.length) {
      const threatMeta: Record<string, { category: string; severity: string }> = {
        "Ransomware":             { category: "Malware",           severity: "Critical" },
        "Phishing":               { category: "Human Factor",      severity: "High"     },
        "Insider Threat":         { category: "Human Factor",      severity: "High"     },
        "DDoS":                   { category: "Network Security",  severity: "Medium"   },
        "Supply Chain Attack":    { category: "Third-Party Risk",  severity: "High"     },
        "Data Breach":            { category: "Data Security",     severity: "Critical" },
        "Cloud Misconfiguration": { category: "Cloud Security",    severity: "High"     },
        "Credential Theft":       { category: "Identity & Access", severity: "High"     },
        "Social Engineering":     { category: "Human Factor",      severity: "Medium"   },
        "Physical Theft":         { category: "Physical Security", severity: "Medium"   },
      };
      let idx = 5000;
      for (const threat of s6.topThreats) {
        const meta = threatMeta[threat];
        if (!meta) continue;
        await db.insert(risksTable).values({
          tenantId,
          riskId: `RK-${++idx}`,
          name: `${threat} Risk`,
          severity: meta.severity,
          category: meta.category,
          score: meta.severity === "Critical" ? 16 : meta.severity === "High" ? 12 : 8,
          owner: "TBD",
          ownerFull: "To Be Assigned",
          trend: "flat",
          status: "open",
          description: "Identified during ISMS onboarding risk assessment.",
        }).onConflictDoNothing();
      }
    }

    await db.update(onboardingSessionsTable)
      .set({ completed: true, updatedAt: new Date() })
      .where(eq(onboardingSessionsTable.tenantId, tenantId));

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/onboarding/context", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { tenantId } = (req as AuthReq).user;
  try {
    const [session] = await db.select().from(onboardingSessionsTable)
      .where(eq(onboardingSessionsTable.tenantId, tenantId));
    if (!session) {
      res.json({ configured: false });
      return;
    }

    const d = (session.stagesData as Record<string, Record<string, unknown>>) ?? {};
    const s1 = d["stage1"] ?? {};
    const s2 = d["stage2"] ?? {};
    const s4 = d["stage4"] ?? {};

    res.json({
      configured: session.currentStage > 1 || session.completed,
      completed: session.completed,
      currentStage: session.currentStage,
      orgName: s1["orgName"],
      industry: s1["industry"],
      employeeCount: s1["employeeCount"],
      cisoName: s1["cisoName"],
      regulations: Array.isArray(s2["regulations"]) ? s2["regulations"] : [],
      riskAppetite: s4["riskAppetite"],
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
