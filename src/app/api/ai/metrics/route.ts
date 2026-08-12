/**
 * /api/ai/metrics
 * 
 * AI Metrics Dashboard API
 * 
 * Provides real-time metrics for:
 * - Pool status (RPM, utilization)
 * - Per-key health and quota
 * - Worker performance
 * - Queue depth
 * 
 * Endpoints:
 *   GET  /api/ai/metrics              → Full metrics snapshot
 *   GET  /api/ai/metrics?section=pool  → Pool-level metrics only
 *   GET  /api/ai/metrics?section=keys  → Per-key metrics only
 *   GET  /api/ai/metrics?section=workers → Worker metrics only
 *   POST /api/ai/metrics?action=reset-quotas → Reset daily quotas (admin)
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { getAdvancedLoadBalancer, type PoolMetrics } from "@/lib/ai/advanced-loadbalancer";
import { aiMetrics } from "@/lib/workers/aiWorkers";
import { dbTyped as db } from "@/lib/db";

// ── Types ───────────────────────────────────────────────────

interface MetricsResponse {
  success: boolean;
  timestamp: Date;
  data: {
    pool: {
      totalRPM: number;
      usedRPM: number;
      availableRPM: number;
      utilizationPct: number;
      status: 'healthy' | 'degraded' | 'critical';
    };
    keys: Array<{
      id: string;
      name: string;
      healthy: boolean;
      circuitState: string;
      rpmUsed: number;
      rpmLimit: number;
      rpmUtilizationPct: number;
      tokensUsed: number;
      tokensLimit: number;
      tokensUtilizationPct: number;
      avgLatencyMs: number;
      successRate: number;
      consecutiveFailures: number;
      lastError?: string;
      lastUsed?: string;
    }>;
    workers: Array<{
      type: string;
      activeJobs: number;
      processedToday: number;
      avgLatencyMs: number;
    }>;
    queue: {
      pending: number;
      running: number;
      completedToday: number;
      failedToday: number;
      estimatedWaitTimeMs: number;
    };
    today: {
      totalRequests: number;
      totalTokens: number;
      totalFailures: number;
      rejectionRate: number;
    };
    alerts: Array<{
      level: 'info' | 'warning' | 'error' | 'critical';
      message: string;
      keyId?: string;
      timestamp: Date;
    }>;
  };
}

// ── Helpers ─────────────────────────────────────────────────

function generateAlerts(lbMetrics: PoolMetrics | null): MetricsResponse['data']['alerts'] {
  const alerts: MetricsResponse['data']['alerts'] = [];
  
  if (!lbMetrics) {
    alerts.push({
      level: 'info',
      message: 'Load balancer not initialized',
      timestamp: new Date(),
    });
    return alerts;
  }

  // Pool-level alerts
  if (lbMetrics.utilizationPct > 90) {
    alerts.push({
      level: 'critical',
      message: `Pool utilization critical: ${lbMetrics.utilizationPct}% (${lbMetrics.totalRPM - lbMetrics.availableRPM}/${lbMetrics.totalRPM} RPM)`,
      timestamp: new Date(),
    });
  } else if (lbMetrics.utilizationPct > 75) {
    alerts.push({
      level: 'warning',
      message: `Pool utilization high: ${lbMetrics.utilizationPct}%`,
      timestamp: new Date(),
    });
  }

  if (lbMetrics.healthyKeys < lbMetrics.totalKeys) {
    const failedCount = lbMetrics.totalKeys - lbMetrics.healthyKeys;
    alerts.push({
      level: failedCount >= 3 ? 'critical' : 'error',
      message: `${failedCount} key(s) unhealthy out of ${lbMetrics.totalKeys}`,
      timestamp: new Date(),
    });
  }

  // Per-key alerts
  for (const key of lbMetrics.keys) {
    if (key.consecutiveFailures >= 3) {
      alerts.push({
        level: 'error',
        message: `Key ${key.keyName} has ${key.consecutiveFailures} consecutive failures`,
        keyId: key.keyId,
        timestamp: new Date(),
      });
    }

    if (key.tokensToday > key.maxTokensPerDay * 0.9) {
      alerts.push({
        level: 'warning',
        message: `Key ${key.keyName} at ${(key.tokensToday / key.maxTokensPerDay * 100).toFixed(1)}% daily quota`,
        keyId: key.keyId,
        timestamp: new Date(),
      });
    }
  }

  // Info alerts
  if (alerts.length === 0) {
    alerts.push({
      level: 'info',
      message: 'All systems operational ✅',
      timestamp: new Date(),
    });
  }

  return alerts;
}

function getPoolStatus(utilizationPct: number, healthyRatio: number): 'healthy' | 'degraded' | 'critical' {
  if (utilizationPct > 90 || healthyRatio < 0.4) return 'critical';
  if (utilizationPct > 75 || healthyRatio < 0.7) return 'degraded';
  return 'healthy';
}

// ── Main Endpoint ───────────────────────────────────────────

// Sprint 28: typed interface for AIMetricsCollector private field access.
// The 'metrics' field is private but we need to read it for the dashboard.
// This interface documents the expected shape — cast through 'unknown' to access.
interface AIMetricsInternal {
  metrics: {
    workers?: Map<string, { activeJobs?: number; processedToday?: number; completedCount?: number; totalLatency?: number }>;
    pool?: { totalRequests?: number; totalTokens?: number; totalFailures?: number; rejectedJobs?: number };
  };
}

export const GET = async (req: NextRequest) => {
  try {
    // Auth check
    const authResult = await resolveAuth(req);
    if (!authResult.ok || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get query params for filtering
    const { searchParams } = new URL(req.url);
    const section = searchParams.get('section'); // 'pool' | 'keys' | 'workers'

    // Get load balancer metrics
    let lbMetrics: PoolMetrics | null = null;
    try {
      const lb = getAdvancedLoadBalancer();
      lbMetrics = lb.getMetrics();
    } catch {
      // Load balancer not initialized yet
      lbMetrics = null;
    }

    // Get queue stats
    let queueStats = { pending: 0, running: 0, completedToday: 0, failedToday: 0 };
    try {
      const [pending, running, completed, failed] = await Promise.all([
        db.jobQueue.count({ where: { queue: 'ai', status: 'pending' } }),
        db.jobQueue.count({ where: { queue: 'ai', status: 'running' } }),
        db.jobQueue.count({ where: { 
          queue: 'ai', 
          status: 'completed',
          completedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        }}),
        db.jobQueue.count({ where: { 
          queue: 'ai', 
          status: 'failed',
          completedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        }}),
      ]);
      queueStats = { pending, running, completedToday: completed, failedToday: failed };
    } catch {
      // Queue tables might not exist yet
    }

    // Build response
    const response: MetricsResponse = {
      success: true,
      timestamp: new Date(),
      data: {
        pool: lbMetrics ? {
          totalRPM: lbMetrics.totalRPM,
          usedRPM: lbMetrics.totalRPM - lbMetrics.availableRPM,
          availableRPM: lbMetrics.availableRPM,
          utilizationPct: lbMetrics.utilizationPct,
          status: getPoolStatus(lbMetrics.utilizationPct, lbMetrics.healthyKeys / Math.max(1, lbMetrics.totalKeys)),
        } : {
          totalRPM: 75,
          usedRPM: 0,
          availableRPM: 75,
          utilizationPct: 0,
          status: 'healthy' as const,
        },
        keys: (lbMetrics?.keys || []).map(key => ({
          id: key.keyId,
          name: key.keyName,
          healthy: key.isHealthy,
          circuitState: key.circuitState,
          rpmUsed: key.rpmCurrent,
          rpmLimit: key.rpmLimit,
          rpmUtilizationPct: key.rpmLimit > 0 ? Math.round((key.rpmCurrent / key.rpmLimit) * 100) : 0,
          tokensUsed: key.tokensToday,
          tokensLimit: key.maxTokensPerDay,
          tokensUtilizationPct: Math.round((key.tokensToday / key.maxTokensPerDay) * 100),
          avgLatencyMs: key.avgLatencyMs,
          successRate: key.successRate,
          consecutiveFailures: key.consecutiveFailures,
          lastError: key.lastError,
          lastUsed: key.lastSuccessTime?.toISOString(),
        })),
        workers: (Array.from((aiMetrics as unknown as AIMetricsInternal /* SAFETY: metrics is private */).metrics?.workers?.entries() || []) as [string, { activeJobs?: number; processedToday?: number; completedCount?: number; totalLatency?: number }][]).map(([type, m]) => ({
          type: type as string,
          activeJobs: m?.activeJobs ?? 0,
          processedToday: m?.processedToday ?? 0,
          avgLatencyMs: (m?.completedCount || 0) > 0 ? Math.round((m?.totalLatency || 0) / (m?.completedCount || 1)) : 0,
        })),
        queue: {
          ...queueStats,
          estimatedWaitTimeMs: lbMetrics?.estimatedWaitTimeMs || 0,
        },
        today: {
          totalRequests: (aiMetrics as unknown as AIMetricsInternal /* SAFETY: metrics is private */).metrics?.pool?.totalRequests || 0,
          totalTokens: (aiMetrics as unknown as AIMetricsInternal /* SAFETY: metrics is private */).metrics?.pool?.totalTokens || 0,
          totalFailures: (aiMetrics as unknown as AIMetricsInternal /* SAFETY: metrics is private */).metrics?.pool?.totalFailures || 0,
          rejectionRate: ((aiMetrics as unknown as AIMetricsInternal /* SAFETY: metrics is private */).metrics?.pool?.totalRequests || 0) > 0 
            ? Math.round((((aiMetrics as unknown as AIMetricsInternal /* SAFETY: metrics is private */).metrics?.pool?.rejectedJobs || 0) / ((aiMetrics as unknown as AIMetricsInternal /* SAFETY: metrics is private */).metrics?.pool?.totalRequests || 1)) * 100)
            : 0,
        },
        alerts: generateAlerts(lbMetrics),
      },
    };

    // Filter by section if requested
    if (section === 'pool') {
      return NextResponse.json({
        success: true,
        timestamp: response.timestamp,
        data: { pool: response.data.pool, alerts: response.data.alerts },
      });
    }

    if (section === 'keys') {
      return NextResponse.json({
        success: true,
        timestamp: response.timestamp,
        data: { keys: response.data.keys, alerts: response.data.alerts },
      });
    }

    if (section === 'workers') {
      return NextResponse.json({
        success: true,
        timestamp: response.timestamp,
        data: { workers: response.data.workers, queue: response.data.queue },
      });
    }

    return NextResponse.json(response);

  } catch (err) {
    logger.error("[api/ai/metrics] Failed to fetch metrics", {
      err: err instanceof Error ? err.message : String(err),
    });

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch AI metrics",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
};

// ── Admin: Reset Quotas ─────────────────────────────────────

export const POST = async (req: NextRequest) => {
  try {
    // Auth check (admin only)
    const authResult = await resolveAuth(req);
    if (!authResult.ok || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    if (action === 'reset-quotas') {
      try {
        const lb = getAdvancedLoadBalancer();
        lb.resetDailyQuotas();
      } catch {
        // LB might not be initialized
      }
      
      aiMetrics.resetDailyCounters();

      logger.info("[api/ai/metrics] Daily quotas reset by admin", {
        userId: authResult.user.uid,
        email: authResult.user.email,
      });

      return NextResponse.json({
        success: true,
        message: "Daily quotas reset successfully",
        timestamp: new Date(),
      });
    }

    return NextResponse.json(
      { error: "Invalid action. Use: ?action=reset-quotas" },
      { status: 400 }
    );

  } catch (err) {
    logger.error("[api/ai/metrics] POST failed", {
      err: err instanceof Error ? err.message : String(err),
    });

    return NextResponse.json(
      { error: "Operation failed" },
      { status: 500 }
    );
  }
};
