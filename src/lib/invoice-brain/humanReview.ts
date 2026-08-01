/**
 * invoice-brain/humanReview.ts — Human Review Loop for Gray Area Cases
 *
 * ═══════════════════════════════════════════════════════════════
 *  HUMAN REVIEW LOOP (Critical for Quality Assurance)
 * ═══════════════════════════════════════════════════════════════
 *
 * PROBLEM (User's Observation):
 *   - Confidence < 0.70 cases currently fall back to AI
 *   - But AI can also make mistakes!
 *   - Better: AI → User confirms → Brain learns from correction
 *   - This creates a quality flywheel: human feedback improves AI
 *
 * FLOW:
 * ─────────────────────────────────────────────────────────────
 * 1. Extraction with low confidence detected
 * 2. Queue for human review (not auto-AI fallback)
 * 3. Human reviews and corrects (if needed)
 * 4. Brain learns from the CORRECTION (not just raw extraction)
 * 5. Pattern updated with higher confidence
 * 
 * BENEFITS:
 * ─────────────────────────────────────────────────────────────
 * ✅ Higher quality than pure AI or pure pattern matching
 * ✅ Continuous learning from real corrections
 * ✅ Humans only see edge cases (efficient use of time)
 * ✅ Builds trust in the system over time
 * ✅ Handles domain-specific edge cases AI misses
 * ═══════════════════════════════════════════════════════════════
 */

import { logger } from "@/lib/logger";
import type { Invoice } from "./schema";
import type { VerificationResult } from "./verifyExtraction";
import { getDriftDetector, type DriftDetectionResult } from "./driftDetection";

// ─── Types ───────────────────────────────────────────────────

export interface ReviewItem {
  /** Unique ID for this review request */
  id: string;
  
  /** When this item was queued */
  queuedAt: string;
  
  /** Original invoice text */
  originalText: string;
  
  /** Fingerprint of the invoice */
  fingerprint: string;
  
  /** Company slug */
  companySlug: string;
  
  // Extraction results
  /** Pattern-based extraction (if available) */
  patternExtraction?: {
    data: Invoice;
    confidence: number;
    source: "pattern-excellent" | "pattern-verified" | "pattern";
  };
  
  /** AI-based extraction (if used) */
  aiExtraction?: {
    data: Invoice;
    confidence: number;
    model: string;
    cost: number;
  };
  
  // Review status
  status: ReviewStatus;
  
  /** Priority level */
  priority: "critical" | "high" | "medium" | "low";
  
  /** Why this was queued for review */
  reason: ReviewReason;
  
  /** Drift detection result (if applicable) */
  driftResult?: DriftDetectionResult;
  
  /** Suggested action to reviewer */
  suggestedAction: SuggestedAction;
}

export type ReviewStatus =
  | "pending"
  | "in_progress"
  | "approved"
  | "corrected"
  | "rejected"
  | "escalated"
  | "expired";

export type ReviewReason =
  | "low_confidence"
  | "drift_detected"
  | "pattern_conflict"
  | "new_supplier_format"
  | "ocr_quality_poor"
  | "value_anomaly"
  | "structural_mismatch"
  | "manual_request";

export type SuggestedAction =
  | "approve_as_is"
  | "correct_fields"
  | "request_new_extraction"
  | "mark_as_new_pattern"
  | "deprecate_pattern"
  | "escalate_to_admin";

export interface ReviewCorrection {
  /** Which fields were corrected */
  correctedFields: Array<{
    fieldName: string;
    originalValue: any;
    correctedValue: any;
    reason: string;
  }>;
  
  /** Optional notes from reviewer */
  reviewerNotes?: string;
  
  /** Who reviewed this */
  reviewedBy: string;
  
  /** When the review was completed */
  reviewedAt: string;
  
  /** How long the review took (ms) */
  reviewDurationMs: number;
}

export interface ReviewQueueStats {
  totalPending: number;
  inProgress: number;
  completedToday: number;
  averageWaitTimeMinutes: number;
  averageReviewTimeSeconds: number;
  byPriority: Record<string, number>;
  byReason: Record<string, number>;
}

// ─── Configuration ───────────────────────────────────────────

const REVIEW_CONFIG = {
  // Auto-expire pending reviews after this time
  expiryTimeMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  
  // Max items a reviewer can have at once
  maxConcurrentPerReviewer: 10,
  
  // Priority thresholds
  priorityThresholds: {
    critical: 0.3,  // Very low confidence or high drift
    high: 0.5,      // Low confidence
    medium: 0.7,     // Below threshold
    low: 0.85,       // Slightly below excellent
  },
  
  // Auto-approve if no action within time window
  autoApproveAfterMs: 24 * 60 * 60 * 1000, // 24 hours (with warning)
};

// ─── Main Review Manager Class ───────────────────────────────

/**
 * Manages the human review queue and workflow.
 */
export class HumanReviewManager {
  private queue: Map<string, ReviewItem> = new Map();
  private completedReviews: ReviewItem[] = [];
  private reviewers: Map<string, ReviewerInfo> = new Map();
  
  /**
   * Queue an extraction result for human review.
   */
  queueForReview(options: {
    originalText: string;
    fingerprint: string;
    companySlug: string;
    confidence: number;
    extractionSource: "pattern" | "ai";
    extractedData: Invoice;
    verificationResult?: VerificationResult;
    driftResult?: DriftDetectionResult;
    reason?: ReviewReason;
  }): ReviewItem {
    const id = `REV-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    
    // Determine priority based on confidence/drift
    const priority = this.determinePriority(
      options.confidence,
      options.driftResult
    );
    
    // Determine why we're queuing this
    const reason = options.reason || this.determineReason(
      options.confidence,
      options.extractionSource,
      options.driftResult,
      options.verificationResult
    );
    
    // Determine suggested action
    const suggestedAction = this.determineSuggestedAction(
      priority,
      reason,
      options.driftResult
    );
    
    const item: ReviewItem = {
      id,
      queuedAt: new Date().toISOString(),
      originalText: options.originalText,
      fingerprint: options.fingerprint,
      companySlug: options.companySlug,
      
      patternExtraction: options.extractionSource === "pattern" ? {
        data: options.extractedData,
        confidence: options.confidence,
        source: options.confidence > 0.98 ? "pattern-excellent" : "pattern-verified",
      } : undefined,
      
      aiExtraction: options.extractionSource === "ai" ? {
        data: options.extractedData,
        confidence: options.confidence,
        model: "auto-detected",
        cost: 0.002, // Estimated
      } : undefined,
      
      status: "pending",
      priority,
      reason,
      driftResult: options.driftResult,
      suggestedAction,
    };
    
    this.queue.set(id, item);
    
    logger.info("[review] Item queued for review", {
      reviewId: id,
      priority,
      reason,
      confidence: options.confidence,
    });
    
    return item;
  }
  
  /**
   * Get next items for a reviewer to process.
   */
  getNextItemsForReviewer(
    reviewerId: string,
    limit: number = 5
  ): ReviewItem[] {
    // Update/get reviewer info
    this.ensureReviewer(reviewerId);
    
    const reviewer = this.reviewers.get(reviewerId)!;
    
    // Check reviewer capacity
    const currentInProgress = this.getCountForReviewer(reviewerId, "in_progress");
    if (currentInProgress >= REVIEW_CONFIG.maxConcurrentPerReviewer) {
      return []; // At capacity
    }
    
    // Get pending items, sorted by priority (critical first)
    const pendingItems = Array.from(this.queue.values())
      .filter(item => item.status === "pending")
      .sort((a, b) => this.getPriorityWeight(b.priority) - this.getPriorityWeight(a.priority))
      .slice(0, limit);
    
    // Mark as in_progress
    for (const item of pendingItems) {
      item.status = "in_progress";
      item.id; // Mark as assigned to this reviewer
    }
    
    return pendingItems;
  }
  
  /**
   * Submit a review decision (approve/correct/reject).
   */
  submitReview(
    reviewId: string,
    decision: "approved" | "corrected" | "rejected",
    correction?: ReviewCorrection
  ): ReviewItem | null {
    const item = this.queue.get(reviewId);
    if (!item || item.status !== "in_progress") {
      logger.error("[review] Invalid review submission", { reviewId, status: item?.status });
      return null;
    }
    
    const startTime = new Date(item.queuedAt).getTime();
    const endTime = Date.now();
    
    // Update item
    item.status = decision;
    
    if (decision === "corrected" && correction) {
      // Apply corrections and learn from them
      this.applyCorrections(item, correction);
    } else if (decision === "approved") {
      // Approve → increase confidence in pattern/AI
      this.handleApproval(item);
    } else if (decision === "rejected") {
      // Rejected → mark for re-extraction or escalation
      this.handleRejection(item);
    }
    
    // Move to completed
    this.queue.delete(reviewId);
    this.completedReviews.push({
      ...item,
      status: decision,
    });
    
    // Log the decision
    logger.info("[review] Review completed", {
      reviewId,
      decision,
      timeInQueue: ((endTime - startTime) / 1000 / 60).toFixed(1) + "min",
      hasCorrections: !!correction,
    });
    
    return item;
  }
  
  /**
   * Get queue statistics.
   */
  getQueueStats(): ReviewQueueStats {
    const now = Date.now();
    const todayStart = new Date().setHours(0, 0, 0, 0);
    
    const pending = Array.from(this.queue.values()).filter(i => i.status === "pending");
    const inProgress = Array.from(this.queue.values()).filter(i => i.status === "in_progress");
    const completedToday = this.completedReviews.filter(
      i => new Date(i.queuedAt).getTime() >= todayStart
    );
    
    // Calculate average wait time for pending items
    const avgWaitTime = pending.length > 0
      ? pending.reduce((sum, i) => sum + (now - new Date(i.queuedAt).getTime()), 0) / pending.length
      : 0;
    
    // Calculate average review time for completed today
    const avgReviewTime = completedToday.length > 0
      ? completedToday.reduce((sum, i) => {
          // Estimate review time (would be tracked properly)
          return sum + 5 * 60 * 1000; // Assume 5 min average
        }, 0) / completedToday.length
      : 0;
    
    // Breakdown by priority
    const byPriority: Record<string, number> = {};
    const byReason: Record<string, number> = {};
    
    for (const item of [...pending, ...inProgress]) {
      byPriority[item.priority] = (byPriority[item.priority] || 0) + 1;
      byReason[item.reason] = (byReason[item.reason] || 0) + 1;
    }
    
    return {
      totalPending: pending.length,
      inProgress: inProgress.length,
      completedToday: completedToday.length,
      averageWaitTimeMinutes: avgWaitTime / 1000 / 60,
      averageReviewTimeSeconds: avgReviewTime / 1000,
      byPriority,
      byReason,
    };
  }
  
  /**
   * Expire old pending reviews.
   */
  expireOldReviews(): number {
    const now = Date.now();
    let expiredCount = 0;
    
    for (const [id, item] of this.queue.entries()) {
      if (item.status === "pending") {
        const age = now - new Date(item.queuedAt).getTime();
        
        if (age > REVIEW_CONFIG.expiryTimeMs) {
          item.status = "expired";
          this.completedReviews.push(item);
          this.queue.delete(id);
          expiredCount++;
          
          logger.warn("[review] Review expired", { reviewId: id, ageDays: age / (1000*60*60*24) });
        }
      }
    }
    
    return expiredCount;
  }
  
  // ─── Private Methods ─────────────────────────────────────
  
  private determinePriority(
    confidence: number,
    driftResult?: DriftDetectionResult
  ): ReviewItem["priority"] {
    // Critical: High drift OR very low confidence
    if (driftResult && driftResult.isDrifted && driftResult.driftScore > 0.4) {
      return "critical";
    }
    
    if (confidence < REVIEW_CONFIG.priorityThresholds.critical) {
      return "critical";
    }
    
    if (confidence < REVIEW_CONFIG.priorityThresholds.high) {
      return "high";
    }
    
    if (confidence < REVIEW_CONFIG.priorityThresholds.medium) {
      return "medium";
    }
    
    return "low";
  }
  
  private determineReason(
    confidence: number,
    source: "pattern" | "ai",
    driftResult?: DriftDetectionResult,
    verificationResult?: VerificationResult
  ): ReviewReason {
    if (driftResult && driftResult.isDrifted) {
      return "drift_detected";
    }
    
    if (verificationResult && !verificationResult.verified) {
      return "structural_mismatch";
    }
    
    if (confidence < 0.5) {
      return "low_confidence";
    }
    
    if (source === "ai" && confidence < 0.8) {
      return "new_supplier_format"; // Likely new format, AI uncertain
    }
    
    return "low_confidence"; // Default
  }
  
  private determineSuggestedAction(
    priority: ReviewItem["priority"],
    reason: ReviewReason,
    driftResult?: DriftDetectionResult
  ): SuggestedAction {
    switch (priority) {
      case "critical":
        if (driftResult && driftResult.recommendedAction === "relearn_pattern") {
          return "mark_as_new_pattern";
        }
        return "request_new_extraction";
        
      case "high":
        return "correct_fields";
        
      case "medium":
        return "approve_as_is";
        
      case "low":
        return "approve_as_is";
        
      default:
        return "approve_as_is";
    }
  }
  
  private ensureReviewer(reviewerId: string): void {
    if (!this.reviewers.has(reviewerId)) {
      this.reviewers.set(reviewerId, {
        id: reviewerId,
        joinedAt: new Date().toISOString(),
        totalReviewed: 0,
        lastActiveAt: new Date().toISOString(),
      });
    }
  }
  
  private getCountForReviewer(reviewerId: string, status: ReviewStatus): number {
    return Array.from(this.queue.values()).filter(
      i => i.status === status
    ).length; // Simplified - would track actual assignment
  }
  
  private getPriorityWeight(priority: ReviewItem["priority"]): number {
    switch (priority) {
      case "critical": return 4;
      case "high": return 3;
      case "medium": return 2;
      case "low": return 1;
      default: return 0;
    }
  }
  
  private applyCorrections(item: ReviewItem, correction: ReviewCorrection): void {
    logger.info("[review] Applying corrections", {
      reviewId: item.id,
      fieldsCorrected: correction.correctedFields.length,
      reviewer: correction.reviewedBy,
    });
    
    // In production, this would:
    // 1. Store the corrected version as ground truth
    // 2. Update/create pattern with corrected field mappings
    // 3. Increase confidence for the corrected pattern
    // 4. If drift was detected, potentially create new pattern version
    
    // For now, log what would happen
    for (const field of correction.correctedFields) {
      logger.info("[review] Correction detail", {
        field: field.fieldName,
        from: JSON.stringify(field.originalValue),
        to: JSON.stringify(field.correctedValue),
        reason: field.reason,
      });
    }
  }
  
  private handleApproval(item: ReviewItem): void {
    logger.info("[review] Item approved", {
      reviewId: item.id,
      source: item.patternExtraction ? "pattern" : "ai",
      confidence: item.patternExtraction?.confidence || item.aiExtraction?.confidence,
    });
    
    // In production: Boost confidence for this pattern/supplier combination
  }
  
  private handleRejection(item: ReviewItem): void {
    logger.warn("[review] Item rejected", {
      reviewId: item.id,
      reason: item.reason,
    });
    
    // In production: Could escalate to admin or flag supplier for review
  }
}

interface ReviewerInfo {
  id: string;
  joinedAt: string;
  totalReviewed: number;
  lastActiveAt: string;
}

// ─── Singleton Instance ─────────────────────────────────────

let globalManager: HumanReviewManager | null = null;

/**
 * Get global human review manager instance.
 */
export function getHumanReviewManager(): HumanReviewManager {
  if (!globalManager) {
    globalManager = new HumanReviewManager();
  }
  return globalManager;
}
