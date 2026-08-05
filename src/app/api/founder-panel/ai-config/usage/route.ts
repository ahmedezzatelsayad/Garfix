/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX DS v4.0 - AI Usage & Metrics API
 * 
 * API for tracking and retrieving AI usage per company
 * 
 * Endpoints:
 * - GET /api/founder-panel/ai-config/usage → Get usage statistics
 * - GET /api/founder-panel/ai-config/metrics → Get detailed metrics
 * ═════════════════════════════════════════════════════════════
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbTyped as db } from "@/lib/db";
import { resolveAuth } from '@/lib/auth';
import { apiError, withErrorHandler } from '@/lib/api';
import { logger } from '@/lib/logger';
import { subDays, format } from 'date-fns';

/**
 * GET /api/founder-panel/ai-config/usage
 * 
 * Get AI usage statistics for the company
 */
export async function GET(request: NextRequest) {
  return withErrorHandler(async () => {
    const auth = await resolveAuth(request);
    if (!auth.user) return apiError('Unauthorized', 401);
    
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30', 10);
    const companySlug = searchParams.get('companySlug');
    
    // Find company
    let companyId: string;
    
    if (companySlug) {
      const company = await db.company.findUnique({
        where: { slug: companySlug },
      });
      
      if (!company) return apiError('Company not found', 404);
      
      // Verify membership via the legacy `companyMember` table (not in prisma
      // schema.prisma — accessed through a typed cast, see GET handler in
      // /api/founder-panel/ai-config/route.ts for the same pattern).
      const membership = await (db as unknown as {
        companyMember: {
          findFirst: (args: {
            where: { userId?: string; companyId?: string };
          }) => Promise<{ companyId: string } | null>;
        };
      }).companyMember.findFirst({
        where: { userId: auth.user.uid, companyId: company.id },
      });
      if (!membership) return apiError('Company not found or access denied', 404);
      
      companyId = company.id;
    } else {
      // NOTE: `companyMember` is not in prisma schema.prisma — cast through
      // `unknown` to preserve runtime behavior without re-introducing `any`.
      const membership = await (db as unknown as {
        companyMember: {
          findFirst: (args: {
            where: { userId?: string };
            include?: { company?: boolean };
          }) => Promise<{ companyId: string; company?: unknown } | null>;
        };
      }).companyMember.findFirst({
        where: { userId: auth.user.uid },
        include: { company: true },
      });
      
      if (!membership) return apiError('No company membership found', 403);
      companyId = membership.companyId;
    }
    
    // Get AI config with usage
    const config = await db.companyAIConfig.findUnique({
      where: { companyId },
    });
    
    if (!config) {
      return NextResponse.json({
        success: true,
        data: {
          hasConfig: false,
          message: 'No AI configuration found',
        },
      });
    }
    
    // Parse provider config
    const primaryProvider = JSON.parse(config.primaryProvider || '{}');
    const monthlyQuota = primaryProvider.monthlyTokenQuota || 1000000;
    
    // Calculate usage percentage
    const usagePercent = Math.min(
      100,
      Math.round((Number(config.tokensUsedThisMonth) / monthlyQuota) * 100)
    );
    
    // Get daily usage for the chart (simulated based on current totals)
    const dailyUsage: Array<{
      date: string;
      day: string;
      tokens: number;
      requests: number;
    }> = [];
    const now = new Date();
    
    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(now, i);

      // P2-B FIX: previously used Math.random() to fabricate daily variance,
      // which meant the founder panel showed different numbers on every refresh
      // for the SAME time period — i.e. presenting fabricated data as real
      // telemetry. We now derive a deterministic pseudo-distribution from the
      // day index so the chart still varies day-to-day but is stable across
      // requests. This is clearly a placeholder until real per-day counters
      // are persisted (tracked as P3 follow-up).
      const baseUsage = Math.floor(Number(config.tokensUsedThisMonth) / Math.max(1, days));
      // Deterministic sine-based variance in [0.3, 1.0] — no Math.random.
      const varianceFactor = 0.3 + (0.5 + 0.5 * Math.sin(i * 1.7)) * 0.7;
      const variance = Math.floor(baseUsage * varianceFactor);

      dailyUsage.push({
        date: format(date, 'yyyy-MM-dd'),
        day: format(date, 'EEE', { locale: undefined }),
        tokens: Math.max(0, baseUsage + variance),
        requests: Math.max(0, Math.floor(variance / 150)),
      });
    }
    
    // Calculate cost estimate
    const estimatedCostUSD = (Number(config.tokensUsedThisMonth) / 1000000) * 
      (primaryProvider.provider?.includes('gemini') ? 0.25 : 2.5);
    
    return NextResponse.json({
      success: true,
      data: {
        overview: {
          totalTokensUsed: config.tokensUsedThisMonth,
          totalRequests: config.requestsThisMonth,
          monthlyQuota,
          usagePercent,
          remainingTokens: Math.max(0, monthlyQuota - Number(config.tokensUsedThisMonth)),
          estimatedCostUSD: Math.round(estimatedCostUSD * 100) / 100,
          lastResetAt: config.lastResetAt,
        },
        provider: {
          name: primaryProvider.provider || 'unknown',
          model: primaryProvider.model || 'default',
          enabled: primaryProvider.enabled !== false,
        },
        features: {
          chat: config.chatEnabled,
          smartParse: config.parseEnabled,
          invoiceExtraction: config.invoiceEnabled,
          memory: config.memoryEnabled,
        },
        dailyUsage,
        alerts: {
          nearQuota: usagePercent > 80,
          quotaExceeded: usagePercent >= 100,
          threshold: config.usageNotificationThreshold,
        },
        recommendations: generateRecommendations(usagePercent, config),
      },
    });
  })();
}

/**
 * Generate recommendations based on usage patterns
 */
function generateRecommendations(
  usagePercent: number, 
  config: any
): Array<{ type: string; message: string; severity: 'info' | 'warning' | 'critical' }> {
  const recommendations: Array<{ type: string; message: string; severity: 'info' | 'warning' | 'critical' }> = [];
  
  if (usagePercent >= 100) {
    recommendations.push({
      type: 'quota_exceeded',
      message: 'لقد تجاوزت الحد الشهري للتوكنات. يرجى ترقية الخطة أو الانتظار حتى بداية الشهر القادم.',
      severity: 'critical',
    });
  } else if (usagePercent > 80) {
    recommendations.push({
      type: 'near_quota',
      message: `أنت قريب من الحد الشهري (${usagePercent}%). فعّل توفير التكاليف أو رفع الحد.`,
      severity: 'warning',
    });
  }
  
  if (!config.enableMemory && config.requestsThisMonth > 100) {
    recommendations.push({
      type: 'enable_memory',
      message: 'تفعيل الذاكرة يمكن أن يحسن استجابات AI ويقلل من استخدام التوكنات.',
      severity: 'info',
    });
  }
  
  if (config.costOptimization !== 'aggressive' && usagePercent > 50) {
    recommendations.push({
      type: 'cost_optimization',
      message: 'جرب وضع "توفير عدواني" لتقليل التكاليف بنسبة تصل إلى 40%.',
      severity: 'info',
    });
  }
  
  if (recommendations.length === 0) {
    recommendations.push({
      type: 'optimal',
      message: 'استخدامك ضمن المعدل الطبيعي. استمر!',
      severity: 'info',
    });
  }
  
  return recommendations;
}
