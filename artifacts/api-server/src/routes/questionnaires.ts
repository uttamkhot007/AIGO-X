import { Router, RequestHandler } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "../lib/db";
import {
  questionnairesTable,
  questionnaireQuestionsTable,
  questionnaireAnswersTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";
import type { JwtPayload } from "../lib/auth";
import type { Request } from "express";
import * as XLSX from "xlsx";
import PDFDocument from "pdfkit";
import multer from "multer";
import {
  buildQuestionnaireContext,
  streamQuestionAnswer,
  autofillQuestionnaire,
  computeConfidence,
  countMatchingControls,
} from "../services/questionnaire-ai";

const router = Router();
type AuthReq = Request & { user: JwtPayload };

// ── Types ─────────────────────────────────────────────────────────────────────

interface Question {
  id: string;        // questionId (stable string)
  number: string;
  category: string;
  question: string;
  source?: string;
  answer: string;
  confidence?: number | null; // AI confidence 0.0–1.0
  answerSource: "manual" | "ai-draft";
  status: "unanswered" | "ai-draft" | "reviewed";
}

// ── Template library (static) ─────────────────────────────────────────────────

const TEMPLATES: Record<string, Omit<Question, "answer" | "status" | "confidence" | "answerSource">[]> = {
  "SIG Lite 2024": [
    { id: "sig-a1",  number: "A.1",  category: "Risk Management",        question: "Does your organization have a documented risk management program that identifies, assesses, and treats information security risks?", source: "ISO 27001 A.6.1.1" },
    { id: "sig-a2",  number: "A.2",  category: "Risk Management",        question: "How often is your risk assessment reviewed or updated?", source: "ISO 27001 A.6.1.2" },
    { id: "sig-b1",  number: "B.1",  category: "Security Policy",        question: "Does your organization have a documented information security policy approved by executive management?", source: "ISO 27001 A.5.1.1" },
    { id: "sig-b2",  number: "B.2",  category: "Security Policy",        question: "How frequently is the information security policy reviewed?", source: "ISO 27001 A.5.1.2" },
    { id: "sig-c1",  number: "C.1",  category: "Asset Management",       question: "Does your organization maintain an inventory of information assets (hardware, software, data)?", source: "ISO 27001 A.8.1.1" },
    { id: "sig-c2",  number: "C.2",  category: "Asset Management",       question: "How is data classified and labeled within your organization?", source: "ISO 27001 A.8.2.1" },
    { id: "sig-d1",  number: "D.1",  category: "Human Resources",        question: "Are background checks performed on employees prior to employment?", source: "ISO 27001 A.7.1.1" },
    { id: "sig-d2",  number: "D.2",  category: "Human Resources",        question: "Do employees receive security awareness training upon hire and annually?", source: "ISO 27001 A.7.2.2" },
    { id: "sig-e1",  number: "E.1",  category: "Physical Security",      question: "Are physical security controls in place to protect data centers and office facilities?", source: "ISO 27001 A.11.1.1" },
    { id: "sig-e2",  number: "E.2",  category: "Physical Security",      question: "Is visitor access to secure facilities logged and monitored?", source: "ISO 27001 A.11.1.2" },
    { id: "sig-f1",  number: "F.1",  category: "Access Control",         question: "Does your organization enforce a principle of least privilege for system access?", source: "ISO 27001 A.9.2.3" },
    { id: "sig-f2",  number: "F.2",  category: "Access Control",         question: "Is multi-factor authentication (MFA) required for remote access and privileged accounts?", source: "ISO 27001 A.9.4.2" },
    { id: "sig-f3",  number: "F.3",  category: "Access Control",         question: "How often are user access rights reviewed and recertified?", source: "ISO 27001 A.9.2.5" },
    { id: "sig-g1",  number: "G.1",  category: "Cryptography",           question: "Are encryption standards defined and enforced for data at rest and in transit?", source: "ISO 27001 A.10.1.1" },
    { id: "sig-g2",  number: "G.2",  category: "Cryptography",           question: "How are cryptographic keys managed, protected, and rotated?", source: "ISO 27001 A.10.1.2" },
    { id: "sig-h1",  number: "H.1",  category: "Operations Security",    question: "Are change management procedures in place to control modifications to production systems?", source: "ISO 27001 A.12.1.2" },
    { id: "sig-h2",  number: "H.2",  category: "Operations Security",    question: "What vulnerability scanning and patch management processes are in place?", source: "ISO 27001 A.12.6.1" },
    { id: "sig-i1",  number: "I.1",  category: "Incident Management",    question: "Does your organization have a documented incident response plan?", source: "ISO 27001 A.16.1.1" },
    { id: "sig-i2",  number: "I.2",  category: "Incident Management",    question: "What is your organization's mean time to detect (MTTD) and respond (MTTR) to security incidents?", source: "ISO 27001 A.16.1.5" },
    { id: "sig-j1",  number: "J.1",  category: "Business Continuity",   question: "Does your organization have a business continuity / disaster recovery plan?", source: "ISO 27001 A.17.1.1" },
    { id: "sig-j2",  number: "J.2",  category: "Business Continuity",   question: "How frequently is the BCP/DR plan tested?", source: "ISO 27001 A.17.1.3" },
    { id: "sig-k1",  number: "K.1",  category: "Compliance",             question: "What regulatory frameworks and standards does your organization comply with?", source: "ISO 27001 A.18.1.1" },
    { id: "sig-k2",  number: "K.2",  category: "Compliance",             question: "Has your organization undergone a third-party security audit or obtained a certification (ISO 27001, SOC 2, etc.) in the past 12 months?", source: "ISO 27001 A.18.2.2" },
    { id: "sig-l1",  number: "L.1",  category: "Third-Party Management", question: "Does your organization assess the security posture of third-party vendors and suppliers?", source: "ISO 27001 A.15.1.1" },
    { id: "sig-l2",  number: "L.2",  category: "Third-Party Management", question: "Are vendor security requirements defined in contracts and reviewed periodically?", source: "ISO 27001 A.15.1.2" },
  ],
  "CAIQ v4.0": [
    { id: "caiq-ais-01", number: "AIS-01", category: "Application Security", question: "Do you use an automated source code analysis tool to detect security defects in code prior to production?", source: "CCM AIS-01" },
    { id: "caiq-ais-02", number: "AIS-02", category: "Application Security", question: "Do you use application vulnerability scanning tools as part of your SDLC?", source: "CCM AIS-02" },
    { id: "caiq-iam-01", number: "IAM-01", category: "Identity & Access Mgmt", question: "Do you have policies and procedures for user access provisioning, de-provisioning, and review?", source: "CCM IAM-01" },
    { id: "caiq-iam-02", number: "IAM-02", category: "Identity & Access Mgmt", question: "Is MFA enforced for all remote and privileged access?", source: "CCM IAM-02" },
    { id: "caiq-iam-03", number: "IAM-03", category: "Identity & Access Mgmt", question: "Are access reviews conducted at least annually for all user accounts?", source: "CCM IAM-03" },
    { id: "caiq-eks-01", number: "EKS-01", category: "Encryption",             question: "Are all data stores that contain sensitive data encrypted at rest?", source: "CCM EKS-01" },
    { id: "caiq-eks-02", number: "EKS-02", category: "Encryption",             question: "Is data in transit encrypted using TLS 1.2 or higher?", source: "CCM EKS-02" },
    { id: "caiq-grc-01", number: "GRC-01", category: "Governance",             question: "Do you have an information security management system (ISMS) in place?", source: "CCM GRC-01" },
    { id: "caiq-grc-02", number: "GRC-02", category: "Governance",             question: "Are information security roles and responsibilities clearly defined?", source: "CCM GRC-02" },
    { id: "caiq-irl-01", number: "IRL-01", category: "Incident Response",      question: "Do you have a formal incident response plan that is tested at least annually?", source: "CCM IRL-01" },
    { id: "caiq-irl-02", number: "IRL-02", category: "Incident Response",      question: "Do you provide incident notification to affected customers within 72 hours?", source: "CCM IRL-02" },
    { id: "caiq-dsp-01", number: "DSP-01", category: "Data Security",          question: "Do you have a data classification policy and enforce appropriate handling?", source: "CCM DSP-01" },
    { id: "caiq-dsp-02", number: "DSP-02", category: "Data Security",          question: "What data loss prevention (DLP) controls are implemented?", source: "CCM DSP-02" },
    { id: "caiq-ist-01", number: "IST-01", category: "Infrastructure Security", question: "Are network security controls (firewalls, IDS/IPS) in place and monitored?", source: "CCM IST-01" },
    { id: "caiq-ist-02", number: "IST-02", category: "Infrastructure Security", question: "Is network traffic segmented between production, development, and management networks?", source: "CCM IST-02" },
    { id: "caiq-bcr-01", number: "BCR-01", category: "Business Continuity",    question: "Do you have a tested business continuity plan that includes your cloud-hosted services?", source: "CCM BCR-01" },
    { id: "caiq-sos-01", number: "SOS-01", category: "Supply Chain",           question: "Do you conduct security due diligence on your supply chain and critical third parties?", source: "CCM SOS-01" },
    { id: "caiq-tvm-01", number: "TVM-01", category: "Vulnerability Management", question: "Do you conduct regular vulnerability scans and penetration tests?", source: "CCM TVM-01" },
    { id: "caiq-tvm-02", number: "TVM-02", category: "Vulnerability Management", question: "What is your SLA for patching critical vulnerabilities?", source: "CCM TVM-02" },
  ],
  "VSA Standard": [
    { id: "vsa-1",  number: "1",  category: "General Security",    question: "Do you have an ISO 27001 or SOC 2 Type II certification? If so, please provide the most recent report.", source: "VSA Section 1" },
    { id: "vsa-2",  number: "2",  category: "General Security",    question: "Do you have cyber liability insurance? What are the coverage limits?", source: "VSA Section 1" },
    { id: "vsa-3",  number: "3",  category: "Data Handling",       question: "What categories of our data does your service process, store, or transmit?", source: "VSA Section 2" },
    { id: "vsa-4",  number: "4",  category: "Data Handling",       question: "Where is our data stored (geographic location/cloud provider)?", source: "VSA Section 2" },
    { id: "vsa-5",  number: "5",  category: "Data Handling",       question: "What is your data retention policy and how is our data deleted upon termination?", source: "VSA Section 2" },
    { id: "vsa-6",  number: "6",  category: "Access Control",      question: "Who in your organization has access to our data? Is access based on least privilege?", source: "VSA Section 3" },
    { id: "vsa-7",  number: "7",  category: "Access Control",      question: "Do all personnel with access to our data use MFA?", source: "VSA Section 3" },
    { id: "vsa-8",  number: "8",  category: "Security Operations", question: "Do you have 24/7 security monitoring and alerting? What is your mean time to detect/respond?", source: "VSA Section 4" },
    { id: "vsa-9",  number: "9",  category: "Security Operations", question: "When was your most recent penetration test and can you share the executive summary?", source: "VSA Section 4" },
    { id: "vsa-10", number: "10", category: "Incident Response",   question: "What is your breach notification process and SLA for notifying affected customers?", source: "VSA Section 5" },
    { id: "vsa-11", number: "11", category: "Subprocessors",       question: "Do you use subprocessors or third-party sub-services? Please list the critical ones.", source: "VSA Section 6" },
    { id: "vsa-12", number: "12", category: "Subprocessors",       question: "How do you manage and monitor the security of your subprocessors?", source: "VSA Section 6" },
  ],
};

// ── DB helpers ────────────────────────────────────────────────────────────────

/**
 * Load questions + answers for a questionnaire.
 *
 * Primary path: reads from the normalized `questionnaire_questions` /
 * `questionnaire_answers` tables (canonical since migration).
 *
 * Legacy fallback: if no normalized rows exist (pre-migration records), reads
 * from the `questionnaires.questions` JSONB column and backfills the normalized
 * tables so subsequent reads use the fast path.
 */
async function loadQuestions(tenantId: number, questionnaireId: string): Promise<Question[]> {
  const [qs, as] = await Promise.all([
    db.select().from(questionnaireQuestionsTable)
      .where(and(
        eq(questionnaireQuestionsTable.tenantId, tenantId),
        eq(questionnaireQuestionsTable.questionnaireId, questionnaireId),
      ))
      .orderBy(questionnaireQuestionsTable.orderIdx),
    // Scope answers to this specific questionnaire — prevents cross-questionnaire leakage
    db.select().from(questionnaireAnswersTable)
      .where(and(
        eq(questionnaireAnswersTable.tenantId, tenantId),
        eq(questionnaireAnswersTable.questionnaireId, questionnaireId),
      )),
  ]);

  // ── Fast path: normalized tables already populated ──────────────────────
  if (qs.length) {
    const answerMap = new Map(as.map(a => [a.questionId, a]));
    return qs.map(q => {
      const ans = answerMap.get(q.questionId);
      return {
        id:           q.questionId,
        number:       q.number,
        category:     q.category,
        question:     q.question,
        source:       q.source ?? undefined,
        answer:       ans?.answer ?? "",
        confidence:   ans?.confidence ?? null,
        answerSource: (ans?.answerSource ?? "manual") as "manual" | "ai-draft",
        status:       (ans?.status ?? "unanswered") as "unanswered" | "ai-draft" | "reviewed",
      };
    });
  }

  // ── Legacy fallback: read from JSONB column and backfill ─────────────────
  const [row] = await db.select({ questions: questionnairesTable.questions })
    .from(questionnairesTable)
    .where(and(
      eq(questionnairesTable.tenantId, tenantId),
      eq(questionnairesTable.qId, questionnaireId),
    ))
    .limit(1);

  if (!row) return [];

  type LegacyQ = {
    id?: string; number?: string; category?: string; question?: string;
    source?: string; answer?: string; confidence?: number | null;
    answerSource?: string; status?: string;
  };
  const legacyQs = (row.questions as LegacyQ[]) ?? [];
  if (!legacyQs.length) return [];

  // Backfill normalized tables from legacy JSONB so future reads use the fast path
  const mapped: Question[] = legacyQs.map((q, i) => ({
    id:           q.id ?? `q-${i + 1}`,
    number:       q.number ?? String(i + 1),
    category:     q.category ?? "General",
    question:     q.question ?? "",
    source:       q.source,
    answer:       q.answer ?? "",
    confidence:   q.confidence ?? null,
    answerSource: (q.answerSource ?? "manual") as "manual" | "ai-draft",
    status:       (q.status ?? "unanswered") as "unanswered" | "ai-draft" | "reviewed",
  }));

  // Fire-and-forget backfill — non-blocking, best-effort
  (async () => {
    try {
      await insertQuestions(tenantId, questionnaireId, mapped, 0);
      // Also persist existing answers from legacy data
      const answered = mapped.filter(q => q.answer);
      if (answered.length) {
        await Promise.all(answered.map(q =>
          upsertAnswer(tenantId, questionnaireId, q.id, q.answer, q.status, q.confidence, q.answerSource)
        ));
      }
    } catch {
      // Backfill failure is non-fatal — legacy data still returned to caller
    }
  })();

  return mapped;
}

/** Persist a batch of question inserts + empty answer rows. */
async function insertQuestions(
  tenantId: number,
  questionnaireId: string,
  newQs: Array<Omit<Question, "answer" | "status" | "confidence" | "answerSource">>,
  offsetIdx: number,
): Promise<void> {
  if (!newQs.length) return;
  await db.insert(questionnaireQuestionsTable)
    .values(newQs.map((q, i) => ({
      tenantId,
      questionnaireId,
      questionId: q.id,
      number:     q.number,
      category:   q.category,
      question:   q.question,
      source:     q.source ?? null,
      orderIdx:   offsetIdx + i,
    })))
    .onConflictDoNothing();

  await db.insert(questionnaireAnswersTable)
    .values(newQs.map(q => ({
      tenantId,
      questionnaireId,         // scoped to this questionnaire
      questionId:   q.id,
      answer:       "",
      answerSource: "manual",
      status:       "unanswered",
    })))
    .onConflictDoNothing();
}

/**
 * Upsert a single answer.
 * Conflict target is (tenantId, questionnaireId, questionId) — fully scoped to prevent
 * cross-questionnaire or cross-tenant overwrites when template question IDs are reused.
 */
async function upsertAnswer(
  tenantId: number,
  questionnaireId: string,
  questionId: string,
  answer: string,
  status: "unanswered" | "ai-draft" | "reviewed",
  confidence?: number | null,
  answerSource?: "manual" | "ai-draft",
): Promise<void> {
  await db.insert(questionnaireAnswersTable)
    .values({
      tenantId,
      questionnaireId,
      questionId,
      answer,
      status,
      confidence:   confidence ?? null,
      answerSource: answerSource ?? "manual",
      updatedAt:    new Date(),
    })
    .onConflictDoUpdate({
      target: [
        questionnaireAnswersTable.tenantId,
        questionnaireAnswersTable.questionnaireId,
        questionnaireAnswersTable.questionId,
      ],
      set: {
        answer,
        status,
        confidence:   confidence ?? null,
        answerSource: answerSource ?? "manual",
        updatedAt:    new Date(),
      },
    });
}

// ── Progress and mapping ──────────────────────────────────────────────────────

function getProgress(qs: Question[]): number {
  if (!qs.length) return 0;
  return Math.round(qs.filter(q => q.status !== "unanswered").length / qs.length * 100);
}

function mapQuestionnaire(
  r: typeof questionnairesTable.$inferSelect,
  questions: Question[],
  includeQuestions = false,
) {
  const base = {
    id:            r.qId,
    name:          r.name,
    type:          r.type,
    recipient:     r.recipient,
    status:        r.status,
    dueDate:       r.dueDate,
    createdAt:     r.createdAt,
    updatedAt:     r.updatedAt,
    questionCount: questions.length,
    progress:      getProgress(questions),
  };
  if (!includeQuestions) return base;
  return { ...base, questions };
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get("/questionnaires", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const rows = await db.select().from(questionnairesTable)
      .where(eq(questionnairesTable.tenantId, Number(tenantId)));
    const results = await Promise.all(rows.map(async r => {
      const qs = await loadQuestions(Number(tenantId), r.qId);
      return mapQuestionnaire(r, qs, false);
    }));
    res.json(results);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/questionnaires", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const { name, type = "SIG Lite 2024", recipient = "" } = req.body as { name: string; type?: string; recipient?: string };
    if (!name?.trim()) { res.status(400).json({ error: "name is required" }); return; }

    const qId = `QST-${Date.now()}`;
    const dueDate = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().split("T")[0]!;
    const [row] = await db.insert(questionnairesTable)
      .values({ tenantId: Number(tenantId), qId, name, type, recipient, status: "draft", dueDate, questions: [] })
      .returning();

    const templateQs = TEMPLATES[type] ?? TEMPLATES["SIG Lite 2024"]!;
    await insertQuestions(Number(tenantId), qId, templateQs, 0);
    const questions = await loadQuestions(Number(tenantId), qId);
    res.status(201).json(mapQuestionnaire(row, questions, true));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/questionnaires/templates", requireAuth, (_req, res) => {
  res.json(
    Object.entries(TEMPLATES).map(([name, qs]) => ({
      name,
      questionCount: qs.length,
      categories: [...new Set(qs.map(q => q.category))],
      description: name === "SIG Lite 2024" ? "Standardized Information Gathering — 25 key questions across 12 domains"
        : name === "CAIQ v4.0"   ? "Cloud Controls Assurance Initiative — 19 CCM-aligned questions"
        : "Vendor Security Assessment — 12 essential vendor evaluation questions",
    }))
  );
});

router.get("/questionnaires/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const qId = String(req.params["id"] ?? "");
    const [row] = await db.select().from(questionnairesTable)
      .where(and(eq(questionnairesTable.tenantId, Number(tenantId)), eq(questionnairesTable.qId, qId)))
      .limit(1);
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    const questions = await loadQuestions(Number(tenantId), qId);
    res.json(mapQuestionnaire(row, questions, true));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.patch("/questionnaires/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const qId = String(req.params["id"] ?? "");
    const body = req.body as {
      name?: string;
      recipient?: string;
      status?: string;
      dueDate?: string;
      questions?: Question[]; // backward-compat: frontend sends updated question list
    };

    // Update questionnaire metadata
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name)                    updates.name      = body.name;
    if (body.recipient !== undefined) updates.recipient = body.recipient;
    if (body.status)                  updates.status    = body.status;
    if (body.dueDate)                 updates.dueDate   = body.dueDate;

    const [row] = await db.update(questionnairesTable)
      .set(updates)
      .where(and(eq(questionnairesTable.tenantId, Number(tenantId)), eq(questionnairesTable.qId, qId)))
      .returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }

    // Backward compat: if frontend sends updated questions list, upsert answers
    if (body.questions?.length) {
      await Promise.all(body.questions.map(q =>
        upsertAnswer(
          Number(tenantId),
          qId,
          q.id,
          q.answer ?? "",
          (q.status as "unanswered" | "ai-draft" | "reviewed") ?? "reviewed",
          q.confidence ?? null,
          q.answerSource ?? "manual",
        )
      ));
    }

    const questions = await loadQuestions(Number(tenantId), qId);
    res.json(mapQuestionnaire(row, questions, true));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── PATCH single question answer ──────────────────────────────────────────────

router.patch("/questionnaires/:id/questions/:questionId", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const qId = String(req.params["id"] ?? "");
    const questionId = String(req.params["questionId"] ?? "");
    const body = req.body as { answer?: string; status?: string };

    const [row] = await db.select().from(questionnairesTable)
      .where(and(eq(questionnairesTable.tenantId, Number(tenantId)), eq(questionnairesTable.qId, qId)))
      .limit(1);
    if (!row) { res.status(404).json({ error: "Not found" }); return; }

    // Validate question belongs to this questionnaire before updating
    const [qRow] = await db.select({ questionId: questionnaireQuestionsTable.questionId })
      .from(questionnaireQuestionsTable)
      .where(and(
        eq(questionnaireQuestionsTable.tenantId, Number(tenantId)),
        eq(questionnaireQuestionsTable.questionnaireId, qId),
        eq(questionnaireQuestionsTable.questionId, questionId),
      ))
      .limit(1);
    if (!qRow) { res.status(404).json({ error: "Question not found" }); return; }

    await upsertAnswer(
      Number(tenantId),
      qId,
      questionId,
      body.answer ?? "",
      (body.status as "unanswered" | "ai-draft" | "reviewed") ?? "reviewed",
      null,
      "manual",
    );
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/questionnaires/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const qId = String(req.params["id"] ?? "");

    // Delete answers scoped by (tenantId, questionnaireId) — no inArray needed
    await db.delete(questionnaireAnswersTable)
      .where(and(
        eq(questionnaireAnswersTable.tenantId, Number(tenantId)),
        eq(questionnaireAnswersTable.questionnaireId, qId),
      ));
    await db.delete(questionnaireQuestionsTable)
      .where(and(
        eq(questionnaireQuestionsTable.tenantId, Number(tenantId)),
        eq(questionnaireQuestionsTable.questionnaireId, qId),
      ));
    const [row] = await db.delete(questionnairesTable)
      .where(and(eq(questionnairesTable.tenantId, Number(tenantId)), eq(questionnairesTable.qId, qId)))
      .returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.status(204).send();
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── multer: multipart XLSX uploads (up to 10 MB) ─────────────────────────────

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const xlsxUpload: RequestHandler = upload.single("file");

// ── Helpers: CSV parser and XLSX extractor ────────────────────────────────────

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 2; }
      else if (ch === '"') { inQuotes = false; i++; }
      else { field += ch; i++; }
    } else {
      if (ch === '"') { inQuotes = true; i++; }
      else if (ch === ',') { row.push(field.trim()); field = ""; i++; }
      else if (ch === '\r' && text[i + 1] === '\n') { row.push(field.trim()); field = ""; rows.push(row); row = []; i += 2; }
      else if (ch === '\n' || ch === '\r') { row.push(field.trim()); field = ""; rows.push(row); row = []; i++; }
      else { field += ch; i++; }
    }
  }
  if (field.trim() || row.length) { row.push(field.trim()); if (row.some(f => f.length > 0)) rows.push(row); }
  return rows;
}

type RawQ = Omit<Question, "answer" | "status" | "confidence" | "answerSource">;

function extractQuestionsFromCSV(text: string, offset: number): RawQ[] {
  const rows = parseCSV(text).filter(r => r.some(f => f.length > 0));
  if (!rows.length) return [];
  const firstCell = (rows[0]?.[0] ?? "").toLowerCase();
  const isHeader = /^(question|q#|q no|text|description|item)/.test(firstCell);
  const dataRows = isHeader ? rows.slice(1) : rows;
  return dataRows
    .map((parts, i) => ({
      id: `import-${Date.now()}-${offset + i}`,
      number: parts[2]?.trim() || String(offset + i + 1),
      category: parts[1]?.trim() || "Custom",
      question: parts[0]?.trim() || "",
    }))
    .filter(q => q.question.length > 2);
}

function extractQuestionsFromPlainText(text: string, offset: number): RawQ[] {
  return text
    .split("\n")
    .map(l => l.trim().replace(/^\d+[\.\)]\s*/, ""))
    .filter(l => l.length > 2)
    .map((line, i) => ({
      id: `import-${Date.now()}-${offset + i}`,
      number: String(offset + i + 1),
      category: "Custom",
      question: line,
    }));
}

function extractQuestionsFromXlsx(buf: Buffer, offset: number): RawQ[] {
  const workbook = XLSX.read(buf, { type: "buffer" });
  const allQs: RawQ[] = [];
  let idx = offset;
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]!;
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    if (rows.length < 2) continue;
    const headerRow = rows[0] as string[];
    let qCol = 0, catCol = -1, numCol = -1;
    for (let c = 0; c < headerRow.length; c++) {
      const h = String(headerRow[c] ?? "").toLowerCase();
      if (h.match(/question|text|description|item/)) qCol = c;
      if (h.match(/category|domain|area|section/)) catCol = c;
      if (h.match(/number|no\.|id|ref/)) numCol = c;
    }
    for (const row of rows.slice(1)) {
      const questionText = String((row as unknown[])[qCol] ?? "").trim();
      if (questionText.length < 3) continue;
      allQs.push({
        id: `import-${Date.now()}-${idx}`,
        number: numCol >= 0 ? String((row as unknown[])[numCol] ?? "").trim() || String(idx + 1) : String(idx + 1),
        category: catCol >= 0 ? String((row as unknown[])[catCol] ?? "Custom").trim() : "Custom",
        question: questionText,
      });
      idx++;
    }
  }
  return allQs;
}

// ── Import: add questions from CSV / XLSX / plain-text ────────────────────────

router.post(
  "/questionnaires/:id/import",
  requireAuth,
  (req, res, next) => {
    const ct = req.headers["content-type"] ?? "";
    if (ct.includes("multipart/form-data")) xlsxUpload(req, res, next);
    else next();
  },
  async (req, res) => {
    try {
      const { tenantId } = (req as AuthReq).user;
      const qId = String(req.params["id"] ?? "");
      const [row] = await db.select().from(questionnairesTable)
        .where(and(eq(questionnairesTable.tenantId, Number(tenantId)), eq(questionnairesTable.qId, qId)))
        .limit(1);
      if (!row) { res.status(404).json({ error: "Not found" }); return; }

      const existing = await loadQuestions(Number(tenantId), qId);
      let newQs: RawQ[] = [];

      const multerFile = (req as unknown as { file?: Express.Multer.File }).file;
      if (multerFile) {
        newQs = extractQuestionsFromXlsx(multerFile.buffer, existing.length);
      } else {
        const { text, mode, questions: rawQs } = req.body as {
          text?: string;
          mode?: "csv" | "text";
          questions?: Array<{ question: string; category?: string; number?: string }>;
        };
        if (rawQs && Array.isArray(rawQs)) {
          newQs = rawQs.map((q, i) => ({
            id: `import-${Date.now()}-${existing.length + i}`,
            number: q.number ?? String(existing.length + i + 1),
            category: q.category ?? "Custom",
            question: q.question.trim(),
          }));
        } else if (text) {
          newQs = mode === "csv"
            ? extractQuestionsFromCSV(text, existing.length)
            : extractQuestionsFromPlainText(text, existing.length);
        }
      }

      if (!newQs.length) { res.status(400).json({ error: "No valid questions found in the imported content" }); return; }

      await insertQuestions(Number(tenantId), qId, newQs, existing.length);
      const questions = await loadQuestions(Number(tenantId), qId);
      res.json({ imported: newQs.length, questionnaire: mapQuestionnaire(row, questions, true) });
    } catch (err) {
      console.error("Import error:", err);
      res.status(500).json({ error: "Import failed" });
    }
  }
);

// ── Export: CSV ───────────────────────────────────────────────────────────────

router.get("/questionnaires/:id/export", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const qId = String(req.params["id"] ?? "");
    const [row] = await db.select().from(questionnairesTable)
      .where(and(eq(questionnairesTable.tenantId, Number(tenantId)), eq(questionnairesTable.qId, qId)))
      .limit(1);
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    const questions = await loadQuestions(Number(tenantId), qId);
    const csvRow = (fields: string[]) => fields.map(f => `"${(f ?? "").replace(/"/g, '""')}"`).join(",");
    const lines = [
      csvRow(["Number", "Category", "Question", "Answer", "Status", "Confidence", "Source"]),
      ...questions.map(q => csvRow([
        q.number, q.category, q.question, q.answer, q.status,
        q.confidence != null ? `${Math.round(q.confidence * 100)}%` : "",
        q.source ?? "",
      ])),
    ];
    const filename = `${row.name.replace(/[^a-z0-9_-]/gi, "_")}_questionnaire.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(lines.join("\r\n"));
  } catch { res.status(500).json({ error: "Export failed" }); }
});

// ── AI: answer single question (streaming) ────────────────────────────────────

router.post("/questionnaires/:id/ai-answer/:questionId", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const qId = String(req.params["id"] ?? "");
    const questionId = String(req.params["questionId"] ?? "");

    const [row] = await db.select().from(questionnairesTable)
      .where(and(eq(questionnairesTable.tenantId, Number(tenantId)), eq(questionnairesTable.qId, qId)))
      .limit(1);
    if (!row) { res.status(404).json({ error: "Not found" }); return; }

    const questions = await loadQuestions(Number(tenantId), qId);
    const question = questions.find(x => x.id === questionId);
    if (!question) { res.status(404).json({ error: "Question not found" }); return; }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const { contextString, controls } = await buildQuestionnaireContext(Number(tenantId));
    let fullText = "";
    for await (const chunk of streamQuestionAnswer(question.question, question.category ?? "General", contextString)) {
      fullText += chunk;
      res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
    }

    const matchCount = countMatchingControls(controls, question.category ?? "General", question.question);
    const confidence = computeConfidence(contextString, fullText, matchCount);
    await upsertAnswer(Number(tenantId), qId, questionId, fullText, "ai-draft", confidence, "ai-draft");

    res.write(`data: ${JSON.stringify({ done: true, confidence })}\n\n`);
    res.end();
  } catch {
    res.write(`data: ${JSON.stringify({ error: "AI answer failed" })}\n\n`);
    res.end();
  }
});

// ── AI autofill: answer ALL unanswered questions ──────────────────────────────
// POST /questionnaires/:id/autofill  — canonical endpoint per spec
// POST /questionnaires/:id/ai-answer-all — backward-compatible alias

async function runAutofill(req: AuthReq, res: import("express").Response): Promise<void> {
  try {
    const { tenantId } = req.user;
    const qId = String(req.params["id"] ?? "");
    const [row] = await db.select().from(questionnairesTable)
      .where(and(eq(questionnairesTable.tenantId, Number(tenantId)), eq(questionnairesTable.qId, qId)))
      .limit(1);
    if (!row) { res.status(404).json({ error: "Not found" }); return; }

    const questions = await loadQuestions(Number(tenantId), qId);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const { contextString, controls } = await buildQuestionnaireContext(Number(tenantId));
    const results = await autofillQuestionnaire(
      questions.map(q => ({ id: q.id, question: q.question, category: q.category, status: q.status, answer: q.answer })),
      contextString,
      controls,
      (p) => res.write(`data: ${JSON.stringify(p)}\n\n`)
    );

    // Persist answers with confidence scores
    await Promise.all(results.map(r =>
      upsertAnswer(Number(tenantId), qId, r.id, r.answer, "ai-draft", r.confidence, "ai-draft")
    ));

    // Advance questionnaire status: draft → in_review
    const newStatus = row.status === "draft" ? "in_review" : row.status;
    await db.update(questionnairesTable)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(and(eq(questionnairesTable.tenantId, Number(tenantId)), eq(questionnairesTable.qId, qId)));

    res.write(`data: ${JSON.stringify({ done: true, processed: results.length })}\n\n`);
    res.end();
  } catch {
    res.write(`data: ${JSON.stringify({ error: "Autofill failed" })}\n\n`);
    res.end();
  }
}

router.post("/questionnaires/:id/autofill",      requireAuth, (req, res) => runAutofill(req as AuthReq, res));
router.post("/questionnaires/:id/ai-answer-all", requireAuth, (req, res) => runAutofill(req as AuthReq, res));

// ── Export: PDF ───────────────────────────────────────────────────────────────

router.get("/questionnaires/:id/export/pdf", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const qId = String(req.params["id"] ?? "");
    const [row] = await db.select().from(questionnairesTable)
      .where(and(eq(questionnairesTable.tenantId, Number(tenantId)), eq(questionnairesTable.qId, qId)))
      .limit(1);
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    const questions = await loadQuestions(Number(tenantId), qId);
    const filename = `${row.name.replace(/[^a-z0-9_-]/gi, "_")}_questionnaire.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    doc.pipe(res);
    doc.fontSize(20).font("Helvetica-Bold").text(row.name, { align: "center" });
    doc.moveDown(0.4);
    doc.fontSize(11).font("Helvetica").fillColor("#555555")
      .text(`Type: ${row.type}   |   Recipient: ${row.recipient || "—"}   |   Status: ${row.status}`, { align: "center" });
    doc.moveDown(0.4);
    doc.fontSize(10).fillColor("#888888")
      .text(`Exported: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}   |   ${questions.length} questions`, { align: "center" });
    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#DDDDDD").stroke();
    doc.moveDown(1);

    const byCategory: Record<string, Question[]> = {};
    for (const q of questions) {
      const cat = q.category || "Uncategorized";
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat]!.push(q);
    }

    let idx = 0;
    for (const [category, qs] of Object.entries(byCategory)) {
      doc.fontSize(13).font("Helvetica-Bold").fillColor("#1E293B").text(category);
      doc.moveDown(0.5);
      for (const q of qs) {
        idx++;
        doc.fontSize(10).font("Helvetica-Bold").fillColor("#1E293B").text(`${q.number || idx}. ${q.question}`, { lineGap: 2 });
        if (q.answer) {
          doc.fontSize(9.5).font("Helvetica").fillColor("#374151").text(`Answer: ${q.answer}`, { indent: 16, lineGap: 2 });
        } else {
          doc.fontSize(9.5).font("Helvetica").fillColor("#9CA3AF").text("Answer: (not yet answered)", { indent: 16 });
        }
        const confidenceStr = q.confidence != null ? `  |  AI Confidence: ${Math.round(q.confidence * 100)}%` : "";
        const statusColors: Record<string, string> = { reviewed: "#059669", "ai-draft": "#3B82F6" };
        doc.fontSize(8).fillColor(statusColors[q.status] ?? "#9CA3AF")
          .text(`[${q.status.toUpperCase().replace("-", " ")}]${confidenceStr}`, { indent: 16 });
        doc.moveDown(0.6);
      }
      doc.moveDown(0.4);
    }
    doc.end();
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: "PDF export failed" });
  }
});

export default router;
