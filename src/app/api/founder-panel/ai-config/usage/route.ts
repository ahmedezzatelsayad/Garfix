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
import { db } from '@/lib/db';
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
        include: { members: { where: { userId: auth.user.uid } } },
      });
      
      if (!company || company.members.length === 0) {
        return apiError('Company not found or access denied', 404);
      }
      
      companyId = company.id;
    } else {
      const membership = await db.companyMember.findFirst({
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
      Math.round((config.tokensUsedThisMonth / monthlyQuota) * 100)
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
      
      // Simulate daily usage distribution
      const baseUsage = Math.floor(config.tokensUsedThisMonth / Math.max(1, days));
      const variance = Math.floor(baseUsage * (0.3 + Math.random() * 0.7));
      
      dailyUsage.push({
        date: format(date, 'yyyy-MM-dd'),
        day: format(date, 'EEE', { locale: undefined }),
        tokens: Math.max(0, baseUsage + variance),
        requests: Math.max(0, Math.floor(variance / 150)),
      });
    }
    
    // Calculate cost estimate
    const estimatedCostUSD = (config.tokensUsedThisMonth / 1000000) * 
      (primaryProvider.provider?.includes('gemini') ? 0.25 : 2.5);
    
    return NextResponse.json({
      success: true,
      data: {
        overview: {
          totalTokensUsed: config.tokensUsedThisMonth,
          totalRequests: config.requestsThisMonth,
          monthlyQuota,
          usagePercent,
          remainingTokens: Math.max(0, monthlyQuota - config.tokensUsedThisMonth),
          estimatedCostUSD: Math.round(estimatedCostUSD * 100) / 100,
          lastResetAt: config.lastResetAt,
        },
        provider: {
          name: primaryProvider.provider || 'unknown',
          model: primaryProvider.model || 'default',
          enabled: primaryProvider.enabled !== false,
        },
        features: {
          chat: config.enableChat,
          smartParse: config.enableSmartParse,
          invoiceExtraction: config.enableInvoiceExtraction,
          memory: config.enableMemory,
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
