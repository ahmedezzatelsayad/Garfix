/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX DS v4.0 - Founder Panel: API Key Pool Management
 * 
 * نظام إدارة مجمع مفاتيح API
 *
 * Endpoints:
 * - GET    /api/founder-panel/api-key-pool      → Get keys + stats
 * - POST   /api/founder-panel/api-key-pool      → Add new keys
 * - DELETE /api/founder-panel/api-key-pool/:id  → Revoke key
 * - POST   /api/assign-api-key                  → Auto-assign to user
 *
 * ═════════════════════════════════════════════════════════════
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireFounder } from '@/lib/middleware';
import { z } from 'zod';
import { apiError, withErrorHandler } from '@/lib/api';
import { logger } from '@/lib/logger';

// ── Types ───────────────────────────────────────────────────

type AIProvider = 'openrouter' | 'gemini' | 'openai';

// ── Schemas ─────────────────────────────────────────────────

const AddKeysSchema = z.object({
  keys: z.array(z.string().min(10)).max(100), // Max 100 keys at once
  provider: z.enum(['openrouter', 'gemini', 'openai']).default('openrouter'),
  model: z.string().default('deepseek/deepseek-chat-v3-0324'),
  notes: z.string().optional(),
});

// ── Provider Detection ─────────────────────────────────────

function detectProviderFromKey(key: string): AIProvider {
  if (key.startsWith('sk-or-')) return 'openrouter';
  if (key.startsWith('sk-')) return 'openai';
  if (key.startsWith('AI') || key.includes('google')) return 'gemini';
  return 'openrouter'; // default
}

// ── Helper Functions ────────────────────────────────────────

/**
 * Mask API key for display
 */
function maskKey(key: string): string {
  if (!key || key.length <= 12) return key || '';
  return `${key.substring(0, 8)}${'•'.repeat(12)}${key.substring(key.length - 4)}`;
}

/**
 * Calculate pool statistics
 */
async function calculatePoolStats() {
  const [
    total,
    available,
    assigned,
    exhausted,
    revoked,
    totalUsageToday,
  ] = await Promise.all([
    db.apiKeyPool.count(),
    db.apiKeyPool.count({ where: { status: 'available' } }),
    db.apiKeyPool.count({ where: { status: 'assigned' } }),
    db.apiKeyPool.count({ where: { status: 'exhausted' } }),
    db.apiKeyPool.count({ where: { status: 'revoked' } }),
    // Sum of usedToday for active keys
    db.apiKeyPool.aggregate({
      _sum: { usedToday: true },
      where: {
        status: { in: ['available', 'assigned'] },
      },
    }),
  ]);

  const availableCount = available;
  const isRunningLow = availableCount < 5; // Alert when less than 5 keys

  return {
    totalKeys: total,
    availableKeys: availableCount,
    assignedKeys: assigned,
    exhaustedKeys: exhausted,
    revokedKeys: revoked,
    totalUsageToday: Number(totalUsageToday._sum.usedToday || 0),
    keysRunningLow: isRunningLow,
    lowThreshold: 5,
  };
}

/**
 * Assign an available key to a user
 */
export async function assignKeyToUser(userId: string, companyId?: string) {
  try {
    // Find first available key
    const availableKey = await db.apiKeyPool.findFirst({
      where: { status: 'available' },
      orderBy: { priority: 'desc' },
    });

    if (!availableKey) {
      return { success: false, error: 'No available keys in pool' };
    }

    // Assign the key to user
    const updatedKey = await db.apiKeyPool.update({
      where: { id: availableKey.id },
      data: {
        status: 'assigned',
        assignedToUserId: userId,
        assignedToCompanyId: companyId || null,
        assignedAt: new Date(),
      },
    });

    logger.info(`[ApiKeyPool] Assigned key ${updatedKey.id} to user ${userId}`);

    return { 
      success: true, 
      keyValue: updatedKey.keyValue,
      provider: updatedKey.provider,
      model: updatedKey.model,
      keyId: updatedKey.id,
    };
  } catch (error) {
    logger.error('[ApiKeyPool] Error assigning key to user', { userId, error });
    return { success: false, error: 'Failed to assign key' };
  }
}

// ── API Route Handlers ─────────────────────────────────────

/**
 * GET /api/founder-panel/api-key-pool
 */
export async function GET(request: NextRequest) {
  return withErrorHandler(async () => {
    // P0-03: Require founder authorization (not just any authenticated user).
    const founderAccess = await requireFounder(request);
    if (founderAccess instanceof NextResponse) return founderAccess;

    // Fetch all keys with relations
    const keys = await db.apiKeyPool.findMany({
      include: {
        assignedUser: {
          select: { uid: true, email: true, displayName: true },
        },
        assignedCompany: {
          select: { id: true, name: true, nameAr: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200, // Limit to last 200 keys
    });

    // Calculate stats
    const stats = await calculatePoolStats();

    // Format response (mask keys)
    const formattedKeys = keys.map(key => ({
      ...key,
      keyValue: maskKey(key.keyValue),
      assignedToUserName: key.assignedUser?.displayName || key.assignedUser?.email,
      assignedToCompanyName: key.assignedCompany?.nameAr || key.assignedCompany?.name,
      timesUsed: Number(key.timesUsed),
      usedToday: Number(key.usedToday),
    }));

    return NextResponse.json({
      success: true,
      data: {
        keys: formattedKeys,
        stats,
      },
    });
  })();
}

/**
 * POST /api/founder-panel/api-key-pool
 */
export async function POST(request: NextRequest) {
  return withErrorHandler(async () => {
    // P0-03: Require founder authorization (not just any authenticated user).
    const founderAccess = await requireFounder(request);
    if (founderAccess instanceof NextResponse) return founderAccess;
    const user = founderAccess.user;

    // Parse body
    const body = await request.json().catch(() => ({}));
    const validated = AddKeysSchema.safeParse(body);

    if (!validated.success) {
      return apiError('Validation failed', 400, validated.error.issues);
    }

    const { keys, provider, model, notes } = validated.data;

    // Check for duplicates
    const existingKeys = await db.apiKeyPool.findMany({
      where: { keyValue: { in: keys } },
      select: { keyValue: true },
    });
    
    const existingKeyValues = new Set(existingKeys.map(k => k.keyValue));
    const newKeys = keys.filter(k => !existingKeyValues.has(k));

    if (newKeys.length === 0) {
      return apiError('All keys already exist in pool', 409);
    }

    // Create key records
    const createdKeys = await Promise.all(
      newKeys.map(key =>
        db.apiKeyPool.create({
          data: {
            keyValue: key,
            provider: detectProviderFromKey(key), // Auto-detect from key format
            model,
            status: 'available',
            addedBy: user.uid,
            notes,
            rpmLimit: getRpmLimitForProvider(detectProviderFromKey(key)),
            dailyLimit: getDailyLimitForProvider(detectProviderFromKey(key)),
            resetAt: getNextDayReset(),
          },
        })
      )
    );

    logger.info(`[ApiKeyPool] Added ${createdKeys.length} keys by founder ${user.email}`);

    return NextResponse.json({
      success: true,
      message: `Added ${createdKeys.length} keys to pool`,
      data: {
        addedCount: createdKeys.length,
        duplicatesSkipped: keys.length - newKeys.length,
      },
    });
  })();
}

/**
 * DELETE /api/founder-panel/api-key-pool/:id
 *
 * NOTE: This handler was a duplicate of the one in `[id]/route.ts`.
 * The parent route `/api/founder-panel/api-key-pool` has no `[id]` URL
 * segment, so declaring `params: Promise<{ id: string }>` here caused
 * a RouteHandlerConfig type mismatch (Next.js expected `Promise<{}>`).
 * The actual DELETE endpoint lives at `[id]/route.ts` and the frontend
 * correctly calls `DELETE /api/founder-panel/api-key-pool/${keyId}`.
 * Removed the duplicate to fix `next build` type check.
 */

// ── Public Assignment Endpoint ─────────────────────────────

/**
 * POST /api/assign-api-key
 * 
 * This endpoint can be called during user registration
 * to automatically assign an API key to the new user.
 */
export async function ASSIGN_KEY_API(request: NextRequest) {
  return withErrorHandler(async () => {
    // Can be called with session token or internal token
    const body = await request.json().catch(() => ({}));
    const { userId, companyId } = body;

    if (!userId) {
      return apiError('userId is required', 400);
    }

    const result = await assignKeyToUser(userId, companyId);

    if (!result.success) {
      return apiError(result.error || 'Failed to assign key', 503);
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  })();
}

// ── Provider Limits ─────────────────────────────────────────

function getRpmLimitForProvider(provider: AIProvider): number {
  switch (provider) {
    case 'openrouter':
      return 60; // OpenRouter typically allows 60 RPM
    case 'gemini':
      return 60; // Gemini Flash free tier
    case 'openai':
      return 500; // OpenAI higher limits for paid
    default:
      return 60;
  }
}

function getDailyLimitForProvider(provider: AIProvider): number {
  switch (provider) {
    case 'openrouter':
      return 1000; // Generous limit
    case 'gemini':
      return 1500; // Free tier daily
    case 'openai':
      return 10000; // Paid tier
    default:
      return 1000;
  }
}

function getNextDayReset(): Date {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow;
}
