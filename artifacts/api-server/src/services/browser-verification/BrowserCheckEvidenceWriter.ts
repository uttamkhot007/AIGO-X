/**
 * BrowserCheckEvidenceWriter
 *
 * After a browser check run completes, this module writes an evidence_artifact
 * record so that:
 *   1. The result appears in the Evidence Library alongside integration-collected evidence.
 *   2. The existing alert pipeline (sendEvidenceAlerts) picks up failures automatically.
 *
 * Each run upserts one artifact per check (artifactId = `bc:<checkId>`) so the
 * Evidence Library always shows the latest result without accumulating duplicates.
 */

import { randomUUID } from "crypto";
import { db } from "../../lib/db";
import {
  evidenceArtifactsTable,
  controlsTable,
  browserChecksTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import type { VerificationResult } from "./BrowserVerificationService";

// Shape that matches what the DB returns for a browserChecksTable row
type BrowserCheckRow = typeof browserChecksTable.$inferSelect;

export interface EvidenceWriteResult {
  /** The runId used for the evidence artifact — used to trigger alerts */
  artifactRunId: string;
  /** 1 if the verdict was fail/error (enables alert threshold logic), 0 if pass */
  failed: number;
}

/**
 * Write a browser check result as an evidence_artifact.
 * Uses ON CONFLICT DO UPDATE so each check always has exactly one current artifact.
 */
export async function writeBrowserCheckEvidenceArtifact(opts: {
  tenantId: number;
  check: BrowserCheckRow;
  result: VerificationResult;
  triggeredBy: string;
}): Promise<EvidenceWriteResult> {
  const { tenantId, check, result, triggeredBy } = opts;

  // Resolve the integer control DB id from the control_ref text (e.g. "A.9.4.2")
  const [control] = await db
    .select({ id: controlsTable.id })
    .from(controlsTable)
    .where(
      and(
        eq(controlsTable.tenantId, tenantId),
        eq(controlsTable.controlId, check.controlRef)
      )
    )
    .limit(1);

  if (!control) {
    // Control not in DB for this tenant — skip artifact write (control not imported)
    return { artifactRunId: `bc-noref-${randomUUID()}`, failed: 0 };
  }

  const artifactRunId = `bcr-${check.checkId}-${Date.now()}`;
  const artifactId = `bc:${check.checkId}`; // stable per-check key for upsert

  const artifactStatus =
    result.verdict === "pass" ? "fresh" : "failed";

  const rawPayload = {
    checkId:       check.checkId,
    checkName:     check.name,
    url:           check.url,
    instruction:   check.instruction,
    verdict:       result.verdict,
    screenshotUrl: result.screenshotPath,
    durationMs:    result.durationMs,
    triggeredBy,
    runAt:         new Date().toISOString(),
  };

  // 30-day expiry — artifact becomes "stale" after a month without re-run
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await db
    .insert(evidenceArtifactsTable)
    .values({
      tenantId,
      artifactId,
      controlId:        control.id,
      controlRef:       check.controlRef,
      sourceIntegration: "browser-check",
      status:           artifactStatus,
      rawPayload,
      summary:          result.summary,
      collectorVersion: "1.0",
      runId:            artifactRunId,
      screenshotUrl:    result.screenshotPath,
      verificationType: "browser",
      expiresAt,
    })
    .onConflictDoUpdate({
      target: [evidenceArtifactsTable.tenantId, evidenceArtifactsTable.artifactId],
      set: {
        status:           artifactStatus,
        rawPayload,
        summary:          result.summary,
        runId:            artifactRunId,
        screenshotUrl:    result.screenshotPath,
        verificationType: "browser",
        collectedAt:      new Date(),
        expiresAt,
      },
    });

  return {
    artifactRunId,
    failed: artifactStatus === "failed" ? 1 : 0,
  };
}
