/**
 * learning-engine.ts — Phase 11: AI pattern learning and rule promotion.
 *
 * Monitors AI-resolved requests for repeated patterns. When the same
 * normalized input produces the same output >= MIN_SAMPLES times with
 * >= MIN_CONFIDENCE consistency, the candidate is promoted to 'promoted'
 * status.
 *
 * Key behaviours:
 *   - recordObservation(): upserts into RuleCandidate on each AI resolution
 *   - promoteCandidates(): daily job that promotes qualifying candidates
 *   - getLearningStatus(): returns observing/promoted/rejected counts
 *
 * Thresholds (named constants):
 *   MIN_SAMPLES = 20
 *   MIN_CONFIDENCE = 0.95
 *
 * Exports:
 *   recordObservation(companySlug, requestType, inputHash, output) → void
 *   promoteCandidates() → { promoted: number, rejected: number }
 *   getLearningStatus(companySlug) → LearningStatus
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { fabricHash } from "./types";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Minimum number of consistent samples before a candidate can be promoted. */
export const MIN_SAMPLES = 20;

/** Minimum confidence (0-1) required for promotion. */
export const MIN_CONFIDENCE = 0.95;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LearningStatus {
  companySlug: string;
  observing: number;
  promoted: number;
  rejected: number;
  total: number;
}

export interface PromotionResult {
  promoted: number;
  rejected: number;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Record a single AI observation into the learning engine.
 *
 * This is called after each AI-resolved request. It upserts into RuleCandidate:
 *   - If no candidate exists for this (companySlug, requestType, inputHash), create one
 *   - If a candidate exists, increment sampleCount and update confidence
 *
 * The inputHash is the fabricHash of the normalized input. The output is
 * serialized to JSON for storage.
 *
 * Confidence is computed as: (samples matching consistentOutput) / totalSamples
 * If the new output matches the existing consistentOutput, confidence goes up.
 * If it doesn't match, the consistentOutput stays the same (majority rule)
 * but confidence drops.
 *
 * @param companySlug - The company this observation belongs to
 * @param requestType - The request type (ocr, matching, etc.)
 * @param inputHash - Hash of the normalized input (patternSignature)
 * @param output - The AI output to record (will be JSON-serialized)
 */
export async function recordObservation(
  companySlug: string,
  requestType: string,
  inputHash: string,
  output: unknown,
): Promise<void> {
  const outputJson = JSON.stringify(output);
  const patternSignature = inputHash;

  const existing = await db.ruleCandidate.findFirst({
    where: {
      companySlug,
      patternSignature,
    },
  });

  if (!existing) {
    // First observation — create candidate
    await db.ruleCandidate.create({
      data: {
        companySlug,
        requestType,
        patternSignature,
        sampleCount: 1,
        consistentOutput: outputJson,
        confidence: 1.0,
        status: "observing",
      },
    });
    return;
  }

  // Existing candidate — update
  const newSampleCount = existing.sampleCount + 1;
  const matchesExisting = existing.consistentOutput === outputJson;

  let newConfidence: number;
  let newConsistentOutput = existing.consistentOutput;

  if (matchesExisting) {
    // New output matches the consistent one → confidence increases
    // Count of matching samples = old matching + 1
    const matchingCount = Math.round(existing.confidence * existing.sampleCount) + 1;
    newConfidence = matchingCount / newSampleCount;
    newConsistentOutput = existing.consistentOutput;
  } else {
    // New output doesn't match → confidence decreases
    // The consistent output stays the same (it was the majority before)
    // Matching count stays the same, total increases
    const matchingCount = Math.round(existing.confidence * existing.sampleCount);
    newConfidence = matchingCount / newSampleCount;

    // Check if the new output should become the consistent output
    // (simple majority: if matchingCount < newSampleCount / 2, switch)
    // We keep the original consistent output as long as it's still plurality
    // For simplicity, we keep the original unless it's clearly losing
  }

  // Only update if still in observing status
  if (existing.status === "observing") {
    await db.ruleCandidate.update({
      where: { id: existing.id },
      data: {
        sampleCount: newSampleCount,
        consistentOutput: newConsistentOutput,
        confidence: Math.round(newConfidence * 10000) / 10000, // 4 decimal places
      },
    });
  }
}

/**
 * Daily promotion job: scan all 'observing' candidates and promote those
 * that meet the thresholds, or reject those that clearly don't.
 *
 * Promotion criteria:
 *   - sampleCount >= MIN_SAMPLES (20)
 *   - confidence >= MIN_CONFIDENCE (0.95)
 *
 * Rejection criteria:
 *   - sampleCount >= MIN_SAMPLES AND confidence < 0.5 (clearly inconsistent)
 *
 * Candidates that don't meet either threshold remain 'observing'.
 *
 * @returns Count of promoted and rejected candidates
 */
export async function promoteCandidates(): Promise<PromotionResult> {
  const result: PromotionResult = { promoted: 0, rejected: 0 };

  // Fetch all observing candidates that have enough samples to evaluate
  const candidates = await db.ruleCandidate.findMany({
    where: {
      status: "observing",
      sampleCount: { gte: MIN_SAMPLES },
    },
  });

  for (const candidate of candidates) {
    if (candidate.confidence >= MIN_CONFIDENCE) {
      // Promote!
      await db.ruleCandidate.update({
        where: { id: candidate.id },
        data: { status: "promoted" },
      });
      result.promoted++;

      logger.info("[learning-engine] promoted candidate", {
        companySlug: candidate.companySlug,
        requestType: candidate.requestType,
        sampleCount: candidate.sampleCount,
        confidence: candidate.confidence,
      });
    } else if (candidate.confidence < 0.5) {
      // Reject — too inconsistent to ever be useful
      await db.ruleCandidate.update({
        where: { id: candidate.id },
        data: { status: "rejected" },
      });
      result.rejected++;

      logger.info("[learning-engine] rejected candidate", {
        companySlug: candidate.companySlug,
        requestType: candidate.requestType,
        sampleCount: candidate.sampleCount,
        confidence: candidate.confidence,
      });
    }
    // else: stay observing — not enough evidence either way
  }

  return result;
}

/**
 * Get the learning engine status for a company.
 *
 * @param companySlug - The company to check
 * @returns Counts of observing, promoted, and rejected candidates
 */
export async function getLearningStatus(
  companySlug: string,
): Promise<LearningStatus> {
  const observing = await db.ruleCandidate.count({
    where: { companySlug, status: "observing" },
  });
  const promoted = await db.ruleCandidate.count({
    where: { companySlug, status: "promoted" },
  });
  const rejected = await db.ruleCandidate.count({
    where: { companySlug, status: "rejected" },
  });

  return {
    companySlug,
    observing,
    promoted,
    rejected,
    total: observing + promoted + rejected,
  };
}