/**
 * invoice-brain/patternVersioning.ts — Pattern Versioning & Evolution
 *
 * ═══════════════════════════════════════════════════════════════
 *  PATTERN VERSIONING (Critical for Production Readiness)
 * ═══════════════════════════════════════════════════════════════
 *
 * PROBLEM (User's Observation):
 *   - Suppliers change invoice formats over time
 *   - Old patterns become invalid
 *   - Learning history is lost if we overwrite
 *
 * SOLUTION:
 *   - Each Pattern has multiple versions (v1, v2, v3...)
 *   - Versions are immutable once created
 *   - New versions don't destroy old ones
 *   - Automatic version promotion based on success rate
 *
 * DATA STRUCTURE:
 * ─────────────────────────────────────────────────────────────
 * Pattern {
 *   fingerprint: "abc123...",
 *   currentVersion: 3,
 *   versions: [
 *     { v1: { fields: [...], createdAt: '...', stats: {...} },
 *     { v2: { fields: [...], createdAt: '...', stats: {...} },
 *     { v3: { fields: [...], createdAt: '...', stats: {...}, active: true }
 *   ]
 * }
 * ═══════════════════════════════════════════════════════════════
 */

import { logger } from "@/lib/logger";
import type { FieldTemplate, InvoiceTemplate } from "./patternStore";

// ─── Types ───────────────────────────────────────────────────

export interface PatternVersion {
  /** Version number (starts at 1) */
  version: number;
  
  /** Fields/regex for this version */
  fields: FieldTemplate[];
  
  /** When this version was created */
  createdAt: string;
  
  /** When this version was last used */
  lastUsedAt: string;
  
  /** Usage statistics */
  stats: VersionStats;
  
  /** Whether this is the currently active version */
  isActive: boolean;
  
  /** Why this version was created */
  reason: "initial" | "drift_detected" | "low_confidence" | "manual" | "evolution";
  
  /** Schema version for migration tracking */
  schemaVersion: number;
}

export interface VersionStats {
  /** Total times this version was used */
  totalUses: number;
  
  /** Successful extractions */
  successCount: number;
  
  /** Failed extractions (verification failures) */
  failureCount: number;
  
  /** Average confidence score */
  avgConfidence: number;
  
  /** Source of the learning data */
  learnedFrom: "ai_extraction" | "human_correction" | "migration";
}

export interface VersionedPattern {
  /** Unique identifier for this pattern */
  id: string;
  
  /** Layout fingerprint */
  fingerprint: string;
  
  /** Company slug for multi-tenant isolation */
  companySlug: string;
  
  /** Current active version number */
  currentVersion: number;
  
  /** All versions (immutable history) */
  versions: PatternVersion[];
  
  /** Metadata */
  metadata: PatternMetadata;
}

export interface PatternMetadata {
  /** When the pattern was first created */
  createdAt: string;
  
  /** When any version was last updated */
  updatedAt: string;
  
  /** Total uses across all versions */
  totalUses: number;
  
  /** Number of versions created */
  versionCount: number;
  
  /** Supplier/customer this pattern belongs to (if known) */
  associatedSupplier?: string;
  
  /** Tags for categorization */
  tags: string[];
  
  /** Status */
  status: "active" | "deprecated" | "archived";
}

export interface VersionTransition {
  fromVersion: number;
  toVersion: number;
  reason: string;
  triggeredBy: "automatic" | "manual";
  timestamp: string;
  confidenceBefore: number;
  confidenceAfter: number;
}

// ─── Configuration ───────────────────────────────────────────

const VERSIONING_CONFIG = {
  // Maximum versions to keep per pattern
  maxVersionsPerPattern: 10,
  
  // Minimum uses before considering version upgrade
  minUsesForEvolution: 20,
  
  // Confidence threshold for automatic evolution
  evolutionConfidenceThreshold: 0.70,
  
  // How many consecutive failures trigger evolution review
  failureThresholdForReview: 5,
  
  // Schema version (increment when structure changes)
  currentSchemaVersion: 1,
};

// ─── Main Versioned Pattern Manager ──────────────────────────

/**
 * Manages pattern versioning lifecycle.
 */
export class PatternVersionManager {
  private patterns: Map<string, VersionedPattern> = new Map();
  private transitions: VersionTransition[] = [];
  
  /**
   * Create a new pattern with initial version.
   */
  createPattern(
    fingerprint: string,
    initialFields: FieldTemplate[],
    companySlug: string,
    options?: {
      supplierName?: string;
      tags?: string[];
      learnedFrom?: VersionStats["learnedFrom"];
    }
  ): VersionedPattern {
    const now = new Date().toISOString();
    
    const initialVersion: PatternVersion = {
      version: 1,
      fields: initialFields,
      createdAt: now,
      lastUsedAt: now,
      stats: {
        totalUses: 0,
        successCount: 0,
        failureCount: 0,
        avgConfidence: 0.5, // Start neutral
        learnedFrom: options?.learnedFrom || "ai_extraction",
      },
      isActive: true,
      reason: "initial",
      schemaVersion: VERSIONING_CONFIG.currentSchemaVersion,
    };
    
    const pattern: VersionedPattern = {
      id: `PAT-${Date.now()}-${fingerprint.slice(0,8)}`,
      fingerprint,
      companySlug,
      currentVersion: 1,
      versions: [initialVersion],
      metadata: {
        createdAt: now,
        updatedAt: now,
        totalUses: 0,
        versionCount: 1,
        associatedSupplier: options?.supplierName,
        tags: options?.tags || [],
        status: "active",
      },
    };
    
    this.patterns.set(fingerprint, pattern);
    
    logger.info("[versioning] Created new pattern", {
      patternId: pattern.id,
      fingerprint: fingerprint.slice(0, 12),
      version: 1,
      companySlug,
    });
    
    return pattern;
  }
  
  /**
   * Get the active version of a pattern.
   */
  getActiveVersion(fingerprint: string): PatternVersion | null {
    const pattern = this.patterns.get(fingerprint);
    if (!pattern || pattern.metadata.status !== "active") return null;
    
    return pattern.versions.find(v => v.isActive) || null;
  }
  
  /**
   * Get all versions of a pattern.
   */
  getAllVersions(fingerprint: string): PatternVersion[] {
    const pattern = this.patterns.get(fingerprint);
    return pattern ? [...pattern.versions] : [];
  }
  
  /**
   * Get the versioned pattern record itself (including metadata and versions).
   */
  getPattern(fingerprint: string): VersionedPattern | null {
    return this.patterns.get(fingerprint) ?? null;
  }
  
  /**
   * Record usage of current version and update stats.
   */
  recordUsage(
    fingerprint: string,
    success: boolean,
    confidence?: number
  ): void {
    const pattern = this.patterns.get(fingerprint);
    if (!pattern) return;
    
    const activeVersion = this.getActiveVersion(fingerprint);
    if (!activeVersion) return;
    
    // Update version stats
    activeVersion.stats.totalUses++;
    activeVersion.lastUsedAt = new Date().toISOString();
    
    if (success) {
      activeVersion.stats.successCount++;
    } else {
      activeVersion.stats.failureCount++;
    }
    
    // Update running average confidence
    if (confidence !== undefined) {
      const n = activeVersion.stats.totalUses;
      const prevAvg = activeVersion.stats.avgConfidence;
      activeVersion.stats.avgConfidence = prevAvg + ((confidence - prevAvg) / n);
    }
    
    // Update pattern metadata
    pattern.metadata.totalUses++;
    pattern.metadata.updatedAt = new Date().toISOString();
    
    // Check if evolution is needed
    this.checkForEvolution(fingerprint);
  }
  
  /**
   * Create a new version of an existing pattern.
   */
  createNewVersion(
    fingerprint: string,
    newFields: FieldTemplate[],
    reason: PatternVersion["reason"],
    options?: {
      triggeredBy?: "automatic" | "manual";
      learnedFrom?: VersionStats["learnedFrom"];
    }
  ): PatternVersion | null {
    const pattern = this.patterns.get(fingerprint);
    if (!pattern) return null;
    
    // Check max versions limit
    if (pattern.versions.length >= VERSIONING_CONFIG.maxVersionsPerPattern) {
      logger.warn("[versioning] Max versions reached, archiving oldest", {
        fingerprint: fingerprint.slice(0, 12),
        currentVersions: pattern.versions.length,
      });
      
      // Archive oldest version (deactivate but keep)
      const oldestVersion = pattern.versions[0];
      oldestVersion.isActive = false;
    }
    
    // Deactivate current version
    const currentActive = pattern.versions.find(v => v.isActive);
    if (currentActive) {
      currentActive.isActive = false;
      
      // Record transition
      this.transitions.push({
        fromVersion: currentActive.version,
        toVersion: pattern.currentVersion + 1,
        reason: `New version: ${reason}`,
        triggeredBy: options?.triggeredBy || "automatic",
        timestamp: new Date().toISOString(),
        confidenceBefore: currentActive.stats.avgConfidence,
        confidenceAfter: 0.5, // Will be updated as new version is used
      });
    }
    
    // Create new version
    const newVersion: PatternVersion = {
      version: pattern.currentVersion + 1,
      fields: newFields,
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
      stats: {
        totalUses: 0,
        successCount: 0,
        failureCount: 0,
        avgConfidence: 0.5,
        learnedFrom: options?.learnedFrom || "ai_extraction",
      },
      isActive: true,
      reason,
      schemaVersion: VERSIONING_CONFIG.currentSchemaVersion,
    };
    
    // Add to versions array
    pattern.versions.push(newVersion);
    pattern.currentVersion = newVersion.version;
    pattern.metadata.versionCount = pattern.versions.length;
    pattern.metadata.updatedAt = new Date().toISOString();
    
    logger.info("[versioning] Created new pattern version", {
      patternId: pattern.id,
      fingerprint: fingerprint.slice(0, 12),
      oldVersion: currentActive?.version,
      newVersion: newVersion.version,
      reason,
    });
    
    return newVersion;
  }
  
  /**
   * Check if pattern should evolve based on performance.
   */
  private checkForEvolution(fingerprint: string): void {
    const pattern = this.patterns.get(fingerprint);
    if (!pattern) return;
    
    const activeVersion = this.getActiveVersion(fingerprint);
    if (!activeVersion) return;
    
    // Need minimum usage before considering evolution
    if (activeVersion.stats.totalUses < VERSIONING_CONFIG.minUsesForEvolution) return;
    
    // Check for low confidence
    if (
      activeVersion.stats.avgConfidence < VERSIONING_CONFIG.evolutionConfidenceThreshold &&
      activeVersion.stats.totalUses >= VERSIONING_CONFIG.minUsesForEvolution
    ) {
      logger.info("[versioning] Low confidence detected, evolution recommended", {
        fingerprint: fingerprint.slice(0, 12),
        version: activeVersion.version,
        confidence: activeVersion.stats.avgConfidence,
        totalUses: activeVersion.stats.totalUses,
      });
      
      // Emit event (would be handled by external system in production)
      this.emitEvolutionEvent(fingerprint, "low_confidence", activeVersion);
    }
    
    // Check for consecutive failures
    const recentFailures = this.getRecentFailureStreak(fingerprint);
    if (recentFailures >= VERSIONING_CONFIG.failureThresholdForReview) {
      logger.warn("[versioning] High failure streak detected", {
        fingerprint: fingerprint.slice(0, 12),
        version: activeVersion.version,
        recentFailures,
      });
      
      this.emitEvolutionEvent(fingerprint, "high_failure_rate", activeVersion);
    }
  }
  
  /**
   * Get recent failure streak count.
   */
  private getRecentFailureStreak(_fingerprint: string): number {
    // In real implementation, would check recent usage records
    // For now, return 0 (placeholder)
    return 0;
  }
  
  /**
   * Emit evolution event for external handling.
   */
  private emitEvolutionEvent(
    fingerprint: string,
    reason: string,
    currentVersion: PatternVersion
  ): void {
    // In production, this would:
    // 1. Send to message queue for AI re-learning
    // 2. Notify admin dashboard
    // 3. Log to telemetry system
    
    const eventData = {
      eventType: "pattern_evolution_suggested",
      fingerprint,
      currentVersion: currentVersion.version,
      confidence: currentVersion.stats.avgConfidence,
      totalUses: currentVersion.stats.totalUses,
      reason,
      suggestedAction: "review_and_potentially_create_new_version",
      timestamp: new Date().toISOString(),
    };
    
    logger.info("[versioning] Evolution event emitted", eventData);
  }
  
  /**
   * Get pattern history/transitions.
   */
  getTransitions(_fingerprint: string): VersionTransition[] {
    return this.transitions.filter(_t => {
      // Would need to store fingerprint in transition - simplified here
      return true; // Return all for now
    });
  }
  
  /**
   * Deprecate a pattern (disable but keep history).
   */
  deprecatePattern(fingerprint: string, reason: string): boolean {
    const pattern = this.patterns.get(fingerprint);
    if (!pattern) return false;
    
    pattern.metadata.status = "deprecated";
    
    // Deactivate all versions
    pattern.versions.forEach(v => { v.isActive = false; });
    
    logger.info("[versioning] Pattern deprecated", {
      fingerprint: fingerprint.slice(0, 12),
      reason,
    });
    
    return true;
  }
  
  /**
   * Get statistics about all patterns.
   */
  getStats(): {
    totalPatterns: number;
    activePatterns: number;
    deprecatedPatterns: number;
    totalVersions: number;
    averageVersionsPerPattern: number;
    patternsNeedingAttention: number;
  } {
    let active = 0;
    let deprecated = 0;
    let needingAttention = 0;
    let totalVersions = 0;
    
    for (const pattern of this.patterns.values()) {
      totalVersions += pattern.versions.length;
      
      if (pattern.metadata.status === "active") {
        active++;
        
        // Check if needs attention (low confidence or high failures)
        const activeV = this.getActiveVersion(pattern.fingerprint);
        if (activeV && activeV.stats.avgConfidence < 0.7) {
          needingAttention++;
        }
      } else if (pattern.metadata.status === "deprecated") {
        deprecated++;
      }
    }
    
    return {
      totalPatterns: this.patterns.size,
      activePatterns: active,
      deprecatedPatterns: deprecated,
      totalVersions,
      averageVersionsPerPattern: this.patterns.size > 0 ? totalVersions / this.patterns.size : 0,
      patternsNeedingAttention: needingAttention,
    };
  }
}

// ─── Singleton Instance ─────────────────────────────────────

let globalInstance: PatternVersionManager | null = null;

/**
 * Get global pattern version manager instance.
 */
export function getPatternVersionManager(): PatternVersionManager {
  if (!globalInstance) {
    globalInstance = new PatternVersionManager();
  }
  return globalInstance;
}

// ─── Integration Helpers ────────────────────────────────────

/**
 * Convert legacy InvoiceTemplate to VersionedPattern.
 */
export function migrateToVersioned(
  legacyTemplate: InvoiceTemplate,
  companySlug: string
): VersionedPattern {
  const manager = getPatternVersionManager();
  
  // Check if already migrated
  const existing = manager.getAllVersions(legacyTemplate.fingerprint);
  if (existing.length > 0) {
    const pattern = manager.getPattern(legacyTemplate.fingerprint);
    if (pattern) return pattern;
  }
  
  // Create new versioned pattern from legacy
  return manager.createPattern(
    legacyTemplate.fingerprint,
    legacyTemplate.fields,
    companySlug,
    {
      learnedFrom: "migration",
    }
  );
}
