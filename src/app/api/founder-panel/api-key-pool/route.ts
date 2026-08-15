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
import { dbTyped as db } from '@/lib/db';
import { requireFounder } from '@/lib/middleware';
import { z } from 'zod';
import { apiError, withErrorHandler } from '@/lib/api';
import { logger } from '@/lib/logger';
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

// ── Types ───────────────────────────────────────────────────

type AIProvider = 'openrouter' | 'gemini' | 'openai' | 'deepseek';

// ── Schemas ─────────────────────────────────────────────────

// P0 FIX: Added 'deepseek' to enum (was missing — DeepSeek keys couldn't be added)
const AddKeysSchema = z.object({
  keys: z.array(z.string().min(10)).max(100),
  provider: z.enum(['openrouter', 'gemini', 'openai', 'deepseek']).default('deepseek'),
  model: z.string().default('deepseek-chat'), // P1: DeepSeek Direct API is default
  notes: z.string().optional(),
});

// ── Provider Detection ─────────────────────────────────────

// P0 FIX: DeepSeek keys (sk- without -or- prefix) are now detected correctly.
// Note: DeepSeek and OpenAI both use 'sk-' prefix — we can't distinguish them
// from the key alone. The caller must pass provider='deepseek' explicitly
// when adding DeepSeek keys. detectProviderFromKey is a best-effort fallback.
function detectProviderFromKey(key: string, explicitProvider?: AIProvider): AIProvider {
  // If caller specified provider explicitly, use that (trusted input from founder)
  if (explicitProvider) return explicitProvider;
  // Auto-detect from key format
  if (key.startsWith('sk-or-')) return 'openrouter';
  if (key.startsWith('AI') || key.includes('google')) return 'gemini';
  // sk- without -or- could be OpenAI OR DeepSeek — default to deepseek
  // since that's GarfiX's primary provider (P1 decision 2026-08)
  if (key.startsWith('sk-')) return 'deepseek';
  return 'deepseek'; // default
}

// ── Helper Functions ────────────────────────────────────────

/**
 * Mask API key for display
 */
// P2 FIX: Always mask, even for short keys (was returning full key for <=12 chars)
function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '•'.repeat(key.length);
  return `${key.substring(0, 4)}${'•'.repeat(Math.min(key.length - 8, 16))}${key.substring(key.length - 4)}`;
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
async function assignKeyToUser(userId: string, companyId?: string) {
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

    // P0 FIX: Never return plaintext keyValue in API response.
    // The assignKeyToUser helper is dead code (not exported as a route)
    // but if ever wired up, it must not leak the key.
    return { 
      success: true, 
      keyValue: undefined, // P0: never return plaintext key
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

    // P0 FIX: Keys are now stored encrypted. Decrypt then mask for display.
    const { decryptSecret } = await import('@/lib/cryptoVault');
    const formattedKeys = keys.map(key => {
      let maskedKey = '••••';
      try {
        const decrypted = decryptSecret(key.keyValue);
        maskedKey = maskKey(decrypted);
      } catch {
        // Decryption failed (corrupted or legacy plaintext) — mask raw
        maskedKey = maskKey(key.keyValue);
      }
      return {
        ...key,
        keyValue: maskedKey,
        assignedToUserName: key.assignedUser?.displayName || key.assignedUser?.email,
        assignedToCompanyName: key.assignedCompany?.nameAr || key.assignedCompany?.name,
        timesUsed: Number(key.timesUsed),
        usedToday: Number(key.usedToday),
      };
    });

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
  // P5-H2: Rate limit POST /api/founder-panel-api-key-pool — 30/min/IP (API_WRITE).
  const rl = await rateLimitResponse(request, "post:founder-panel-api-key-pool", LIMITS.API_WRITE);
  if (rl) return rl;

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

    // P0 FIX: Check for duplicates by encrypting input keys and comparing.
    // Since keys are now stored encrypted, we must encrypt the input keys
    // with the same algorithm to find duplicates.
    const { encryptSecret: encryptForDupCheck } = await import('@/lib/cryptoVault');
    const encryptedInputKeys = keys.map(k => encryptForDupCheck(k));
    const existingKeys = await db.apiKeyPool.findMany({
      where: { keyValue: { in: encryptedInputKeys } },
      select: { keyValue: true },
    });
    
    const existingKeyValues = new Set(existingKeys.map(k => k.keyValue));
    const newKeys = keys.filter((k, i) => !existingKeyValues.has(encryptedInputKeys[i]));

    if (newKeys.length === 0) {
      return apiError('All keys already exist in pool', 409);
    }

    // P0 FIX: Encrypt keys at rest before storing in DB.
    // Previously keys were stored in plaintext — anyone with DB read access
    // could steal all API keys. Now they're AES-256-GCM encrypted via cryptoVault.
    const { encryptSecret } = await import('@/lib/cryptoVault');
    const createdKeys = await Promise.all(
      newKeys.map(async key => {
        const detectedProvider = detectProviderFromKey(key, provider);
        const encryptedKey = encryptSecret(key);
        return db.apiKeyPool.create({
          data: {
            keyValue: encryptedKey, // P0: encrypted at rest
            provider: detectedProvider,
            model,
            status: 'available',
            addedBy: user.uid,
            notes,
            rpmLimit: getRpmLimitForProvider(detectedProvider),
            dailyLimit: getDailyLimitForProvider(detectedProvider),
            resetAt: getNextDayReset(),
          },
        });
      })
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
async function _ASSIGN_KEY_API(request: NextRequest) {
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
    case 'deepseek':
      return 60; // DeepSeek default RPM
    case 'openrouter':
      return 60;
    case 'gemini':
      return 60;
    case 'openai':
      return 500;
    default:
      return 60;
  }
}

function getDailyLimitForProvider(provider: AIProvider): number {
  switch (provider) {
    case 'deepseek':
      return 1000; // DeepSeek daily limit
    case 'openrouter':
      return 1000;
    case 'gemini':
      return 1500;
    case 'openai':
      return 10000;
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
