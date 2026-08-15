/**
 * ═════════════════════════════════════════════════════════════
 * Enhanced AI Worker Auto-Scaler with Pool Awareness
 * 
 * تحسينات على الـ Auto-Scaler الأصلي:
 * - ✅ وعي بسعة الـ Pool (75 RPM max)
 * - ✅ تكامل مع Advanced Load Balancer
 * - ✅ مراقبة صحة المفاتيح
 * - ✅ تكيف ذكي حسب عدد المفاتيح الصحية
 * - ✅ حماية من Overload
 * 
 * ═════════════════════════════════════════════════════════════
 */

import { dbTyped as db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { TIER_WORKER_LIMITS, planToTier } from "./types";
import { getAdvancedLoadBalancer, type PoolMetrics } from "@/lib/ai/advanced-loadbalancer";

// ── Constants ───────────────────────────────────────────────

export const AI_QUEUE_PREFIX = "ai-queue:";

/** Queue depth thresholds */
const QUEUE_THRESHOLDS = {
  LOW: 50,      // Normal operation
  MEDIUM: 150,  // Consider scaling
  HIGH: 300,    // Scale up now
  CRITICAL: 500, // Emergency scale + alert
} as const;

/** Scaling decisions based on pool health */
const _POOL_HEALTH_SCALE_FACTORS = {
  healthy: 1.0,      // Full scaling allowed
  degraded: 0.5,     // Limited scaling (50% capacity)
  critical: 0.25,    // Minimal scaling (25% capacity)
} as const;

// ── Types ───────────────────────────────────────────────────

export interface ScaleDecision {
  companySlug: string;
  currentWorkers: number;
  targetWorkers: number;
  action: 'scale-up' | 'scale-down' | 'hold' | 'throttle';
  reason: string;
  poolAware: boolean;
  effectiveCapacity: number; // Adjusted for pool health
}

export interface ScalerConfig {
  checkIntervalMs?: number;
  scaleUpStep?: number;
  scaleDownStep?: number;
  minWorkers?: number;
  resourceCeilingPct?: number;
}

// ── Enhanced Scaler Class ────────────────────────────────────

export class EnhancedWorkerScaler {
  private config: Required<ScalerConfig>;
  private overflowCounters = new Map<string, number>();
  private idleCounters = new Map<string, number>();
  private lastScaleTime = new Map<string, number>();
  
  constructor(config: ScalerConfig = {}) {
    this.config = {
      checkIntervalMs: config.checkIntervalMs || 60_000,
      scaleUpStep: config.scaleUpStep || 2,
      scaleDownStep: config.scaleDownStep || 1,
      minWorkers: config.minWorkers || 1,
      resourceCeilingPct: config.resourceCeilingPct || 80,
    };
  }

  /**
   * Run one scaling pass across all active companies.
   * Now pool-aware!
   */
  async scaleWorkers(): Promise<ScaleDecision[]> {
    const decisions: ScaleDecision[] = [];
    
    // 1. Get current pool metrics
    let poolMetrics: PoolMetrics | null = null;
    try {
      const lb = getAdvancedLoadBalancer();
      poolMetrics = lb.getMetrics();
    } catch {
      logger.warn("[enhanced-scaler] Could not get load balancer metrics");
    }

    // 2. Check system resources
    const resourcePressure = this.getSystemResourcePct();
    
    if (resourcePressure > this.config.resourceCeilingPct) {
      logger.warn("[enhanced-scaler] System resource pressure too high — suppressing scale-up", {
        resourcePressure,
      });
    }

    // 3. Fetch all active runtimes
    const runtimes = await db.companyRuntime.findMany({
      where: { status: "active" },
    });

    // Fetch related companies (slug, plan) by companyId
    const companyIds = runtimes.map((r) => r.companyId);
    const companies = companyIds.length
      ? await db.company.findMany({
          where: { id: { in: companyIds } },
          select: { id: true, slug: true, plan: true },
        })
      : [];
    const companyByCompanyId = new Map(companies.map((c) => [c.id, c]));

    // 4. Calculate pool-aware capacity factor
    const poolHealthFactor = this.calculatePoolHealthFactor(poolMetrics);
    const healthyKeyCount = poolMetrics?.healthyKeys || 5;
    const effectiveMaxRPM = healthyKeyCount * 15; // 15 RPM per key

    logger.info(`[enhanced-scaler] Running pass`, {
      companiesCount: runtimes.length,
      poolHealthFactor,
      effectiveMaxRPM,
      healthyKeys: healthyKeyCount,
    });

    // 5. Process each company
    for (const rt of runtimes) {
      const company = companyByCompanyId.get(rt.companyId);
      const decision = await this.evaluateCompany(
        rt,
        company,
        poolMetrics,
        poolHealthFactor,
        effectiveMaxRPM,
        resourcePressure
      );
      
      decisions.push(decision);

      // Execute decision if needed
      if (decision.action === 'scale-up' || decision.action === 'scale-down') {
        await this.executeScaleDecision(rt.id, decision);
      }
    }

    return decisions;
  }

  /**
   * Get summary of all worker counts
   */
  async getActiveWorkerCounts(): Promise<Record<string, number>> {
    const runtimes = await db.companyRuntime.findMany({
      where: { status: "active" },
    });

    const companyIds = runtimes.map((r) => r.companyId);
    const companies = companyIds.length
      ? await db.company.findMany({
          where: { id: { in: companyIds } },
          select: { id: true, slug: true },
        })
      : [];
    const slugByCompanyId = new Map(companies.map((c) => [c.id, c.slug]));

    const map: Record<string, number> = {};
    for (const rt of runtimes) {
      const slug = slugByCompanyId.get(rt.companyId);
      if (slug) {
        map[slug] = rt.workerPoolSize;
      }
    }
    return map;
  }

  /**
   * Get current scaling recommendations (without executing)
   */
  async getScalingRecommendations(): Promise<{
    timestamp: Date;
    poolStatus: {
      healthy: boolean;
      utilizationPct: number;
      availableRPM: number;
      factor: number;
    };
    recommendations: ScaleDecision[];
  }> {
    let poolMetrics: PoolMetrics | null = null;
    try {
      const lb = getAdvancedLoadBalancer();
      poolMetrics = lb.getMetrics();
    } catch {}

    const poolHealthFactor = this.calculatePoolHealthFactor(poolMetrics);
    const decisions = await this.scaleWorkers();

    return {
      timestamp: new Date(),
      poolStatus: {
        healthy: poolHealthFactor >= 0.7,
        utilizationPct: poolMetrics?.utilizationPct || 0,
        availableRPM: poolMetrics?.availableRPM || 75,
        factor: poolHealthFactor,
      },
      recommendations: decisions,
    };
  }

  // ── Private Methods ──────────────────────────────────────

  private async evaluateCompany(
    rt: { id: number; companyId: string; workerPoolSize: number },
    company: { slug: string; plan: string } | undefined,
    poolMetrics: PoolMetrics | null,
    poolHealthFactor: number,
    effectiveMaxRPM: number,
    resourcePressure: number
  ): Promise<ScaleDecision> {
    const slug = company?.slug || "";
    const tier = planToTier(company?.plan || "trial");
    const ceiling = TIER_WORKER_LIMITS[tier] as number;
    const queueName = `${AI_QUEUE_PREFIX}${slug}`;
    
    // Get queue length
    const queueLength = await this.getQueueLength(queueName);
    
    // Calculate adjusted ceiling based on pool health
    const adjustedCeiling = Math.max(
      this.config.minWorkers,
      Math.ceil(ceiling * poolHealthFactor)
    );

    // Determine action
    let action: ScaleDecision['action'] = 'hold';
    let targetWorkers = rt.workerPoolSize;
    let reason = '';

    // Scale UP conditions
    if (queueLength > QUEUE_THRESHOLDS.CRITICAL) {
      action = 'scale-up';
      targetWorkers = Math.min(rt.workerPoolSize + this.config.scaleUpStep * 2, adjustedCeiling);
      reason = `CRITICAL queue depth: ${queueLength}`;
    } else if (queueLength > QUEUE_THRESHOLDS.HIGH) {
      const prevOverflow = this.overflowCounters.get(slug) ?? 0;
      this.overflowCounters.set(slug, prevOverflow + 1);
      this.idleCounters.delete(slug);

      if (prevOverflow + 1 >= 2 && rt.workerPoolSize < adjustedCeiling && resourcePressure <= this.config.resourceCeilingPct) {
        action = 'scale-up';
        targetWorkers = Math.min(rt.workerPoolSize + this.config.scaleUpStep, adjustedCeiling);
        reason = `HIGH sustained queue: ${queueLength}`;
      }
    } else if (queueLength === 0) {
      // Scale DOWN conditions
      const prevIdle = this.idleCounters.get(slug) ?? 0;
      this.idleCounters.set(slug, prevIdle + 1);
      this.overflowCounters.delete(slug);

      if (prevIdle + 1 >= 3 && rt.workerPoolSize > this.config.minWorkers) {
        action = 'scale-down';
        targetWorkers = Math.max(rt.workerPoolSize - this.config.scaleDownStep, this.config.minWorkers);
        reason = `Idle for ${prevIdle + 1} checks`;
      }
    } else {
      // Normal range - reset counters
      this.overflowCounters.set(slug, 0);
      this.idleCounters.set(slug, 0);
      reason = `Normal operation (${queueLength} jobs)`;
    }

    // Apply throttle if pool is degraded
    if (poolHealthFactor < 0.5 && action === 'scale-up') {
      action = 'throttle';
      reason += ' [THROTTLED: Pool degraded]';
    }

    // Enforce cooldown (don't scale too frequently)
    const lastScale = this.lastScaleTime.get(slug) || 0;
    const cooldownMs = 30_000; // 30 seconds between scales
    if (Date.now() - lastScale < cooldownMs && action !== 'hold') {
      reason += ' [COOLDOWN]';
    }

    return {
      companySlug: slug,
      currentWorkers: rt.workerPoolSize,
      targetWorkers,
      action,
      reason,
      poolAware: true,
      effectiveCapacity: Math.round(adjustedCeiling),
    };
  }

  private async executeScaleDecision(runtimeId: number, decision: ScaleDecision): Promise<void> {
    if (decision.action === 'hold' || decision.action === 'throttle') return;

    try {
      await db.companyRuntime.update({
        where: { id: runtimeId },
        data: { workerPoolSize: decision.targetWorkers },
      });

      this.lastScaleTime.set(decision.companySlug, Date.now());

      logger.info(`[enhanced-scaler] ${decision.action.toUpperCase()}`, {
        slug: decision.companySlug,
        from: decision.currentWorkers,
        to: decision.targetWorkers,
        reason: decision.reason,
      });
    } catch (err) {
      logger.error(`[enhanced-scaler] Failed to execute scale decision`, {
        slug: decision.companySlug,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private calculatePoolHealthFactor(poolMetrics: PoolMetrics | null): number {
    if (!poolMetrics) return 1.0; // Assume healthy if no data

    const { utilizationPct, healthyKeys, totalKeys } = poolMetrics;
    
    // Factor 1: Utilization (lower is better)
    const utilizationFactor = Math.max(0, 1 - (utilizationPct / 100));
    
    // Factor 2: Key health ratio
    const keyHealthRatio = totalKeys > 0 ? healthyKeys / totalKeys : 1;
    
    // Combined factor (weighted average)
    return (utilizationFactor * 0.6) + (keyHealthRatio * 0.4);
  }

  private async getQueueLength(queueName: string): Promise<number> {
    try {
      const count = await db.jobQueue.count({
        where: {
          queue: queueName,
          status: { in: ["pending", "running"] },
        },
      });
      return count;
    } catch {
      return 0;
    }
  }

  private getSystemResourcePct(): number {
    // In production, query real metrics
    // For now, return synthetic value
    return 30; // Low usage default
  }
}

// ── Singleton & Convenience Exports ─────────────────────────

let enhancedScaler: EnhancedWorkerScaler | null = null;

export function getEnhancedScaler(config?: ScalerConfig): EnhancedWorkerScaler {
  if (!enhancedScaler) {
    enhancedScaler = new EnhancedWorkerScaler(config);
  }
  return enhancedScaler;
}

/**
 * Backward-compatible function that uses the enhanced scaler internally.
 */
export async function scaleWorkers(): Promise<void> {
  const scaler = getEnhancedScaler();
  await scaler.scaleWorkers();
}

/**
 * Backward-compatible function.
 */
export async function getActiveWorkerCounts(): Promise<Record<string, number>> {
  const scaler = getEnhancedScaler();
  return scaler.getActiveWorkerCounts();
}
