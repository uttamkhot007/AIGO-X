/**
 * Questionnaire AI Service
 *
 * Provides tenant-grounded AI answering for security questionnaires.
 * Context is drawn from the tenant's real compliance data:
 *   - Compliance controls (controlsTable)        — framework/domain/name/status/owner
 *   - GRC policies (grcPoliciesTable)             — title, type, owner, content excerpts
 *   - Governance processes (governanceProcessesTable) — additional process policies
 *   - Compliance gap summary (complianceGapsTable) — framework maturity scores
 *   - Evidence artifacts (evidenceArtifactsTable) — observed automated evidence
 */

import { eq } from "drizzle-orm";
import { db } from "@workspace/service-kit";
import {
  controlsTable,
  grcPoliciesTable,
  governanceProcessesTable,
  complianceGapsTable,
  evidenceArtifactsTable,
} from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";

export interface QuestionAnswer {
  questionId: string;
  answer: string;
  confidence: number; // 0–1
}

// ── Internal control row (used for per-question matching) ─────────────────────

interface ControlRow {
  controlId: string;
  framework: string;
  domain: string;
  name: string;
  status: string;
  owner: string;
}

// ── Return type from buildQuestionnaireContext ────────────────────────────────

export interface QuestionnaireContext {
  /** Formatted string injected into the AI system prompt */
  contextString: string;
  /** Raw controls array for per-question matching confidence scoring */
  controls: ControlRow[];
}

// ── Tenant context builder ────────────────────────────────────────────────────

/**
 * Fetches and formats all compliance-relevant tenant data into a compact
 * context string for use in AI system prompts, plus the raw controls list
 * used by the confidence scorer.
 *
 * Sources:
 *   - compliance_controls (name, status, owner, framework, domain)
 *   - grc_policies (title, type, owner, content excerpt — published/approved only)
 *   - governance_processes (supplemental process policies)
 *   - compliance_gaps (framework-level maturity percentages)
 *   - evidence_artifacts (automated per-control evidence)
 */
export async function buildQuestionnaireContext(tenantId: number): Promise<QuestionnaireContext> {
  const [controls, policies, processes, gaps, evidence] = await Promise.all([
    db.select({
      controlId: controlsTable.controlId,
      framework: controlsTable.framework,
      domain: controlsTable.domain,
      name: controlsTable.name,
      status: controlsTable.status,
      owner: controlsTable.owner,
    }).from(controlsTable).where(eq(controlsTable.tenantId, tenantId)).limit(150),

    // GRC policies — fetch published/approved policies with content for excerpts
    db.select({
      policyId: grcPoliciesTable.policyId,
      title: grcPoliciesTable.title,
      type: grcPoliciesTable.type,
      status: grcPoliciesTable.status,
      owner: grcPoliciesTable.owner,
      dept: grcPoliciesTable.dept,
      version: grcPoliciesTable.version,
      content: grcPoliciesTable.content,
    }).from(grcPoliciesTable)
      .where(eq(grcPoliciesTable.tenantId, tenantId))
      .limit(50),

    db.select({
      name: governanceProcessesTable.name,
      category: governanceProcessesTable.category,
      status: governanceProcessesTable.status,
      maturity: governanceProcessesTable.maturity,
      description: governanceProcessesTable.description,
    }).from(governanceProcessesTable).where(eq(governanceProcessesTable.tenantId, tenantId)).limit(30),

    db.select({
      framework: complianceGapsTable.framework,
      total: complianceGapsTable.total,
      implemented: complianceGapsTable.implemented,
      pct: complianceGapsTable.pct,
    }).from(complianceGapsTable).where(eq(complianceGapsTable.tenantId, tenantId)),

    db.select({
      controlRef:        evidenceArtifactsTable.controlRef,
      sourceIntegration: evidenceArtifactsTable.sourceIntegration,
      status:            evidenceArtifactsTable.status,
      summary:           evidenceArtifactsTable.summary,
    }).from(evidenceArtifactsTable)
      .where(eq(evidenceArtifactsTable.tenantId, tenantId))
      .limit(60),
  ]);

  const sections: string[] = [
    "TENANT SECURITY POSTURE — use this real data exclusively to ground your answers:",
  ];

  // ── Controls by framework (with owner) ────────────────────────────────────
  if (controls.length) {
    const byFw: Record<string, { done: string[]; wip: string[]; todo: string[] }> = {};
    for (const c of controls) {
      if (!byFw[c.framework]) byFw[c.framework] = { done: [], wip: [], todo: [] };
      const g = byFw[c.framework]!;
      const label = `${c.controlId} ${c.name} (owner: ${c.owner})`;
      if (c.status === "implemented" || c.status === "operational") g.done.push(label);
      else if (c.status === "in-progress") g.wip.push(label);
      else g.todo.push(label);
    }
    sections.push("\nCOMPLIANCE CONTROLS:");
    for (const [fw, g] of Object.entries(byFw)) {
      sections.push(`  ${fw}:`);
      if (g.done.length) sections.push(`    Implemented (${g.done.length}): ${g.done.slice(0, 12).join("; ")}`);
      if (g.wip.length) sections.push(`    In-progress (${g.wip.length}): ${g.wip.slice(0, 8).join("; ")}`);
      if (g.todo.length && g.todo.length <= 3) sections.push(`    Not started (${g.todo.length}): ${g.todo.join("; ")}`);
    }
  }

  // ── Framework maturity from gap table ─────────────────────────────────────
  if (gaps.length) {
    sections.push("\nFRAMEWORK MATURITY:");
    for (const g of gaps) {
      sections.push(`  ${g.framework}: ${g.pct}% implemented (${g.implemented}/${g.total} controls)`);
    }
  }

  // ── GRC policies (the tenant's actual policy library) ─────────────────────
  const activePolicies = policies.filter(p => p.status === "published" || p.status === "approved" || p.status === "active");
  if (activePolicies.length) {
    sections.push(`\nGRC POLICIES (${activePolicies.length} active/published):`);
    for (const p of activePolicies.slice(0, 20)) {
      // Include up to 200 chars of policy content as an excerpt when available
      const excerpt = p.content ? ` — "${p.content.replace(/\s+/g, " ").trim().slice(0, 200)}"` : "";
      sections.push(`  • [${p.policyId}] ${p.title} [${p.type} · v${p.version} · owner: ${p.owner}]${excerpt}`);
    }
  }

  // ── Draft/pending policies (listed by name only, flagged as not yet active) ─
  const draftPolicies = policies.filter(p => p.status === "draft" || p.status === "pending");
  if (draftPolicies.length) {
    sections.push(`\nPOLICIES IN PROGRESS (${draftPolicies.length} draft/pending — not yet effective):`);
    for (const p of draftPolicies.slice(0, 10)) {
      sections.push(`  • ${p.title} [${p.type} · owner: ${p.owner}]`);
    }
  }

  // ── Governance processes (supplemental) ───────────────────────────────────
  const activeProcs = processes.filter(p => p.status === "active");
  if (activeProcs.length) {
    sections.push(`\nGOVERNANCE PROCESSES (${activeProcs.length} active):`);
    for (const p of activeProcs.slice(0, 10)) {
      const desc = p.description ? ` — ${p.description.slice(0, 100)}` : "";
      sections.push(`  • ${p.name} [${p.category} · maturity: ${p.maturity}]${desc}`);
    }
  }

  // ── Compliance evidence artifacts ─────────────────────────────────────────
  if (evidence.length) {
    const fresh = evidence.filter(e => e.status === "fresh" && e.summary);
    if (fresh.length) {
      sections.push(`\nCOMPLIANCE EVIDENCE (${fresh.length} fresh artifacts):`);
      for (const e of fresh.slice(0, 20)) {
        sections.push(`  • [${e.controlRef}] via ${e.sourceIntegration}: ${e.summary.slice(0, 120)}`);
      }
    }
  }

  const contextString = sections.length === 1 ? "" : sections.join("\n");
  return { contextString, controls };
}

// ── Matching control count (per-question confidence signal) ───────────────────

/**
 * Counts how many tenant controls are relevant to a specific question.
 * Relevance is determined by keyword overlap between the question text / category
 * and the control's domain and name.
 *
 * Returns a count in [0, N]; used to derive a confidence bonus in computeConfidence.
 */
export function countMatchingControls(
  controls: ControlRow[],
  category: string,
  questionText: string
): number {
  if (!controls.length) return 0;

  // Build a normalised keyword set from category + question words (≥4 chars)
  const combined = `${category} ${questionText}`.toLowerCase();
  const keywords = [...new Set(
    combined.split(/\W+/).filter(w => w.length >= 4)
  )];

  if (!keywords.length) return 0;

  return controls.filter(c => {
    const haystack = `${c.domain} ${c.name} ${c.framework}`.toLowerCase();
    return keywords.some(kw => haystack.includes(kw));
  }).length;
}

// ── System prompt builder ─────────────────────────────────────────────────────

function buildSystemPrompt(contextString: string, category?: string): string {
  const posture = contextString || "No specific compliance data found — answer based on security best practices, noting where evidence is unavailable.";
  return `You are a security compliance expert helping complete a vendor security questionnaire on behalf of this organisation.

${posture}

INSTRUCTIONS:
- Answer based solely on the tenant data above. Do not invent certifications, frameworks, tools, or policies not listed.
- If a control or policy is not yet implemented or is still in draft, state that clearly rather than claiming it exists.
- Be concise (3-5 sentences), specific, and professional.
- Reference specific control IDs, policy names, or owner names when relevant.
- Category context: ${category ?? "General security"}`;
}

// ── Answer single question (streaming) ───────────────────────────────────────

/**
 * Streams an AI answer for a single questionnaire question.
 * Yields text chunks as they arrive from the model.
 */
export async function* streamQuestionAnswer(
  question: string,
  category: string,
  contextString: string
): AsyncGenerator<string> {
  const stream = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    max_completion_tokens: 512,
    messages: [
      { role: "system", content: buildSystemPrompt(contextString, category) },
      { role: "user", content: `Question: ${question}` },
    ],
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) yield content;
  }
}

// ── Answer all unanswered questions (batch, non-streaming) ────────────────────

export interface AutofillProgress {
  questionId: string;
  answer?: string;
  confidence?: number;
  error?: string;
  processed: number;
  total: number;
}

export interface AutofillResult {
  id: string;
  answer: string;
  confidence: number; // 0.0–1.0; derived from matching controls + context richness
}

/**
 * Compute a confidence score based on:
 *   - How many tenant controls matched this specific question        (primary signal)
 *   - Whether context is present at all                              (baseline)
 *   - Whether the answer references a control ID or policy name      (bonus)
 *   - Whether the answer is non-trivially long                       (minor bonus)
 *
 * Rules:
 *   - No context at all               → 0.40 (answering blind)
 *   - Context present, 0 matches      → 0.55
 *   - 1–2 matching controls           → 0.65
 *   - 3–5 matching controls           → 0.75
 *   - 6+ matching controls            → 0.82
 *   - Answer references a control ID or policy name → +0.10
 *   - Answer length > 150 chars       → +0.05
 *   - Capped at 0.95
 */
export function computeConfidence(
  contextString: string,
  answer: string,
  matchingControlCount = 0
): number {
  if (!contextString || contextString.length < 50) return 0.40;

  let score: number;
  if (matchingControlCount >= 6)      score = 0.82;
  else if (matchingControlCount >= 3) score = 0.75;
  else if (matchingControlCount >= 1) score = 0.65;
  else                                score = 0.55;

  if (/\b[A-Z]{1,5}-\d+|[A-Z]{2,6}\.\d+\b/.test(answer)) score += 0.10;
  if (answer.length > 150) score += 0.05;
  return Math.min(parseFloat(score.toFixed(2)), 0.95);
}

/**
 * Auto-answers all unanswered questions in a questionnaire.
 * Uses structured JSON output to capture confidence alongside the answer.
 * Calls `onProgress` for each question as it completes.
 * Returns the array of completed answers with confidence scores for persistence.
 */
export async function autofillQuestionnaire(
  questions: Array<{ id: string; question: string; category: string; status: string; answer: string }>,
  contextString: string,
  controls: ControlRow[],
  onProgress: (p: AutofillProgress) => void
): Promise<AutofillResult[]> {
  const unanswered = questions.filter(q => q.status === "unanswered");
  const results: AutofillResult[] = [];
  const systemPrompt = buildSystemPrompt(contextString)
    + "\n\nIMPORTANT: Reply with valid JSON only: {\"answer\": \"<your answer>\"}";
  let processed = 0;

  for (const q of unanswered) {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        max_completion_tokens: 400,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Category: ${q.category}\nQuestion: ${q.question}` },
        ],
      });
      const raw = completion.choices[0]?.message?.content ?? "{}";
      let answer = "";
      try { answer = (JSON.parse(raw) as { answer?: string }).answer ?? raw; } catch { answer = raw; }

      // Confidence is grounded in how many controls actually matched this question
      const matchCount = countMatchingControls(controls, q.category, q.question);
      const confidence = computeConfidence(contextString, answer, matchCount);

      results.push({ id: q.id, answer, confidence });
      processed++;
      onProgress({ questionId: q.id, answer, confidence, processed, total: unanswered.length });
    } catch {
      processed++;
      onProgress({ questionId: q.id, error: "failed", processed, total: unanswered.length });
    }
  }

  return results;
}
