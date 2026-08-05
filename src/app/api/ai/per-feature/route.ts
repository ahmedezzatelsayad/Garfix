/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX DS v4.0 - Per-Feature AI API Endpoint
 * 
 * Unified endpoint for all AI features using isolated connections
 * 
 * POST /api/ai/per-feature
 * 
 * Body:
 * {
 *   feature: 'chat' | 'invoice' | 'parse' | 'memory',
 *   action: 'generate' | 'extract' | 'status',
 *   ...action-specific params
 * }
 *
 * Each request uses the company's dedicated API key for that feature,
 * with independent rate limiting and usage tracking.
 *
 * ═════════════════════════════════════════════════════════════
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveAuth } from '@/lib/auth';
import { dbTyped as db } from "@/lib/db";
import {
  generateWithFeature,
  extractWithFeature,
  getCompanyFeaturesStatus,
  type FeatureType,
} from '@/lib/ai/per-feature-router';
import { apiError, withErrorHandler } from '@/lib/api';
import { logger } from '@/lib/logger';
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

// ── Helper Functions ────────────────────────────────────────

/**
 * Get company ID from authenticated user
 */
async function getCompanyId(request: NextRequest): Promise<{ companyId: string; error?: NextResponse }> {
  const auth = await resolveAuth(request);
  
  if (!auth.ok || !auth.user) {
    return { companyId: '', error: apiError('Unauthorized', 401) };
  }
  
  // Get user's company membership via AppUser.companies (JSON array of slugs)
  const appUser = await db.appUser.findUnique({
    where: { uid: auth.user.uid },
    select: { companies: true },
  });

  if (!appUser) {
    return { companyId: '', error: apiError('No company found for this user', 404) };
  }

  let slugs: string[] = [];
  try {
    slugs = JSON.parse(appUser.companies || '[]');
  } catch {
    slugs = [];
  }
  const slug = slugs[0];
  if (!slug) {
    return { companyId: '', error: apiError('No company found for this user', 404) };
  }

  const company = await db.company.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true },
  });

  if (!company) {
    return { companyId: '', error: apiError('No company found for this user', 404) };
  }
  
  return { companyId: company.id };
}

// ── API Route Handler ───────────────────────────────────────

/**
 * POST /api/ai/per-feature
 * 
 * Main entry point for per-feature AI requests
 */
export async function POST(request: NextRequest) {
  // P5-H2: Rate limit POST /api/ai-per-feature — 30/min/IP (API_WRITE).
  const rl = await rateLimitResponse(request, "post:ai-per-feature", LIMITS.API_WRITE);
  if (rl) return rl;

  return withErrorHandler(async () => {
    // Authenticate and get company
    const { companyId, error } = await getCompanyId(request);
    if (error) return error;
    
    // Parse request body
    const body = await request.json().catch(() => ({}));
    const { action, feature, ...params } = body;
    
    // Validate action
    if (!action || !['generate', 'extract', 'status'].includes(action)) {
      return apiError('Invalid action. Must be: generate, extract, or status', 400);
    }
    
    // Handle status check (doesn't require a specific feature)
    if (action === 'status') {
      const status = await getCompanyFeaturesStatus(companyId);
      
      return NextResponse.json({
        success: true,
        data: status,
        companyId,
      });
    }
    
    // Validate feature for other actions
    const validFeatures: FeatureType[] = ['chat', 'invoice', 'parse', 'memory'];
    if (!feature || !validFeatures.includes(feature)) {
      return apiError(`Invalid feature. Must be one of: ${validFeatures.join(', 400, ')}`);
    }
    
    // Log the request
    logger.info(`[PerFeatureAPI] ${action} request`, {
      companyId,
      feature,
      hasMessages: !!params.messages,
      hasText: !!params.text,
    });
    
    // Route to appropriate handler
    switch (action) {
      case 'generate':
        return handleGenerate(companyId, feature, params);
        
      case 'extract':
        return handleExtract(companyId, feature, params);
        
      default:
        return apiError('Unknown action', 400);
    }
  })();
}

/**
 * Handle generate action (chat, memory)
 */
async function handleGenerate(
  companyId: string,
  feature: FeatureType,
  params: any
): Promise<NextResponse> {
  // Validate messages
  if (!params.messages || !Array.isArray(params.messages) || params.messages.length === 0) {
    return apiError('messages array is required', 400);
  }
  
  // Call the per-feature router
  const result = await generateWithFeature(companyId, feature, {
    messages: params.messages,
    temperature: params.temperature,
    maxTokens: params.maxTokens,
    jsonMode: params.jsonMode,
  });
  
  // Return response
  return NextResponse.json({
    success: result.success,
    data: result.success ? {
      content: result.content,
      usage: result.usage,
      model: result.model,
    } : null,
    meta: {
      latencyMs: result.latencyMs,
      feature,
      rateLimited: result.rateLimited,
    },
    error: result.error,
  });
}

/**
 * Handle extract action (invoice, parse)
 */
async function handleExtract(
  companyId: string,
  feature: FeatureType,
  params: any
): Promise<NextResponse> {
  // Validate text
  if (!params.text || typeof params.text !== 'string') {
    return apiError('text is required', 400);
  }
  
  // Call the per-feature router
  const result = await extractWithFeature(companyId, feature, {
    text: params.text,
    schema: params.schema,
    instructions: params.instructions,
  });
  
  // Return response
  return NextResponse.json({
    success: result.success,
    data: result.success ? {
      extracted: result.data,
      rawText: result.rawText,
      confidence: result.confidence,
    } : null,
    meta: {
      latencyMs: result.latencyMs,
      feature,
    },
    error: result.error,
  });
}

/**
 * GET /api/ai/per-feature
 * 
 * Get current status of all features for the authenticated user's company
 */
export async function GET(request: NextRequest) {
  return withErrorHandler(async () => {
    // Authenticate and get company
    const { companyId, error } = await getCompanyId(request);
    if (error) return error;
    
    // Get status of all features
    const status = await getCompanyFeaturesStatus(companyId);
    
    return NextResponse.json({
      success: true,
      data: status,
      companyId,
    });
  })();
}

// ── Export for use in other endpoints ───────────────────────
// NOTE: getCompanyId is only used internally in this file. Do NOT re-export
// it from a route.ts file — Next.js App Router route files may only export
// HTTP method handlers (GET/POST/PUT/DELETE/etc.) and a few config exports
// (dynamic, revalidate, runtime, maxDuration). Extra named exports break
// the RouteHandlerConfig type constraint and cause `next build` to fail.
