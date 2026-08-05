/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX DS v4.0 - Founder Panel: Companies List API
 * 
 * GET /api/founder-panel/companies?includeAIStatus=true
 * 
 * Returns all companies with their AI configuration status.
 * Only accessible by founders.
 * 
 * Used by: /founder-panel/companies-ai-management page
 * ═════════════════════════════════════════════════════════════
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbTyped as db } from "@/lib/db";
import { resolveAuth } from '@/lib/auth';
import { apiError, withErrorHandler } from '@/lib/api';
import { logger } from '@/lib/logger';

/**
 * GET /api/founder-panel/companies
 * 
 * Query params:
 * - includeAIStatus: boolean - Include AI config status for each company
 * - plan: string - Filter by plan (trial, starter, growth, enterprise)
 * - search: string - Search by name or slug
 */
export async function GET(request: NextRequest) {
  return withErrorHandler(async () => {
    // Authenticate and verify founder role
    const auth = await resolveAuth(request);
    if (!auth.user) return apiError('Unauthorized', 401);
    
    // Verify user is a founder of at least one company
    // NOTE: `companyMember` is not in prisma schema.prisma — the table is
    // populated by an unrelated migration and was previously accessed via
    // `db: any`. We cast through `unknown` to keep the runtime call intact
    // without re-introducing `any`.
    const founderMembership = await (db as unknown as {
      companyMember: {
        findFirst: (args: {
          where: { userId?: string; role?: string };
        }) => Promise<{ companyId: string } | null>;
      };
    }).companyMember.findFirst({
      where: {
        userId: auth.user.uid,
        role: 'founder',
      },
    });
    
    if (!founderMembership) {
      return apiError('Access denied. Founder role required.', 403);
    }
    
    // Parse query params
    const { searchParams } = new URL(request.url);
    const includeAIStatus = searchParams.get('includeAIStatus') === 'true';
    const planFilter = searchParams.get('plan');
    const searchQuery = searchParams.get('search');
    
    // Build where clause
    const whereClause: any = {
      deletedAt: null, // Exclude soft-deleted companies
    };
    
    if (planFilter && planFilter !== 'all') {
      whereClause.plan = planFilter;
    }
    
    if (searchQuery) {
      whereClause.OR = [
        { name: { contains: searchQuery, mode: 'insensitive' } },
        { nameAr: { contains: searchQuery } },
        { slug: { contains: searchQuery, mode: 'insensitive' } },
      ];
    }
    
    // Fetch companies
    const companies = await db.company.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        nameAr: true,
        code: true,
        slug: true,
        plan: true,
        subscriptionStatus: true,
        createdAt: true,
        emoji: true,
        color: true,
        // Include AI config if requested
        ...(includeAIStatus && {
          aiConfig: {
            select: {
              id: true,
              primaryProvider: true,
              tokensUsedThisMonth: true,
              requestsThisMonth: true,
              updatedAt: true,
            },
          },
        }),
      },
    });
    
    // Process results
    type AiConfigData = {
      id: string;
      primaryProvider: Record<string, unknown> & {
        hasApiKey: boolean;
        apiKey: string;
      };
      usage: {
        tokensUsedThisMonth: number;
        requestsThisMonth: number;
        monthlyTokenQuota: number;
        usagePercent: number;
      };
      updatedAt: Date;
    };
    const processedCompanies = companies.map(company => {
      const hasAIConfig = !!company.aiConfig;
      let aiConfigData: AiConfigData | null = null;
      
      if (includeAIStatus && company.aiConfig) {
        try {
          const primaryProvider = JSON.parse(company.aiConfig.primaryProvider || '{}');
          aiConfigData = {
            id: company.aiConfig.id,
            primaryProvider: {
              ...primaryProvider,
              hasApiKey: !!(primaryProvider.apiKey),
              apiKey: '••••••••', // Always masked in list view
            },
            usage: {
              tokensUsedThisMonth: Number(company.aiConfig.tokensUsedThisMonth),
              requestsThisMonth: Number(company.aiConfig.requestsThisMonth),
              monthlyTokenQuota: primaryProvider.monthlyTokenQuota || 1000000,
              usagePercent: primaryProvider.monthlyTokenQuota 
                ? Math.round((Number(company.aiConfig.tokensUsedThisMonth) / primaryProvider.monthlyTokenQuota) * 100)
                : 0,
            },
            updatedAt: company.aiConfig.updatedAt,
          };
        } catch (e) {
          // Invalid JSON in provider config
          logger.warn(`Invalid AI config JSON for company ${company.id}`);
        }
      }
      
      return {
        id: company.id,
        name: company.name,
        nameAr: company.nameAr,
        slug: company.slug,
        code: company.code,
        plan: company.plan,
        subscriptionStatus: company.subscriptionStatus,
        createdAt: company.createdAt.toISOString(),
        emoji: company.emoji,
        color: company.color,
        hasAIConfig,
        aiConfig: aiConfigData,
      };
    });
    
    // Stats
    const stats = {
      total: processedCompanies.length,
      withAI: processedCompanies.filter(c => c.hasAIConfig).length,
      withoutAI: processedCompanies.filter(c => !c.hasAIConfig).length,
      byPlan: {
        trial: processedCompanies.filter(c => c.plan === 'trial').length,
        starter: processedCompanies.filter(c => c.plan === 'starter').length,
        growth: processedCompanies.filter(c => c.plan === 'growth').length,
        enterprise: processedCompanies.filter(c => c.plan === 'enterprise').length,
      },
    };
    
    logger.info(`Founder ${auth.user.email} fetched ${processedCompanies.length} companies`);
    
    return NextResponse.json({
      success: true,
      data: {
        companies: processedCompanies,
        stats,
      },
    });
  })();
}
