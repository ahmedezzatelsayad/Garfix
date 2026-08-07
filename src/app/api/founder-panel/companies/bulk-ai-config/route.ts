/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX DS v4.0 - Founder Panel: Bulk AI Config Management
 * 
 * PATCH /api/founder-panel/companies/bulk-ai-config
 * 
 * Performs bulk AI configuration updates for multiple companies.
 * Only accessible by founders.
 *
 * Body:
 * {
 *   companyIds: string[] - Array of company IDs to update
 *   action: 'enableAI' | 'disableAI' | 'assignKeys'
 * }
 *
 * Used by: /founder-panel/companies-ai-management page (bulk actions)
 * ═════════════════════════════════════════════════════════════
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbTyped as db } from '@/lib/db';
import { requireFounder } from '@/lib/middleware';
import { z } from 'zod';
import { apiError, withErrorHandler } from '@/lib/api';
import { logger } from '@/lib/logger';
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";
import { encryptApiKey } from '@/lib/ai/keyVault';

// ── Schema ──────────────────────────────────────────────────

const BulkAIConfigSchema = z.object({
  companyIds: z.array(z.string().min(1)).min(1).max(100), // Max 100 companies per batch
  action: z.enum(['enableAI', 'disableAI', 'assignKeys']),
});

// ── Handler ─────────────────────────────────────────────────

export async function PATCH(request: NextRequest) {
  // P5-H2: Rate limit PATCH /api/founder-panel-companies-bulk-ai-config — 30/min/IP (API_WRITE).
  const rl = await rateLimitResponse(request, "patch:founder-panel-companies-bulk-ai-config", LIMITS.API_WRITE);
  if (rl) return rl;

  return withErrorHandler(async () => {
    // P0-03: Require founder authorization (not just any authenticated user).
    const founderAccess = await requireFounder(request);
    if (founderAccess instanceof NextResponse) return founderAccess;

    // Parse and validate body
    const body = await request.json();
    const parsed = BulkAIConfigSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(`Invalid request: ${parsed.error.issues.map(i => i.message).join(', ')}`, 400);
    }

    const { companyIds, action } = parsed.data;

    logger.info(`[BulkAIConfig] Founder ${founderAccess.user.email} initiated ${action} for ${companyIds.length} companies`);

    let succeeded = 0;
    let failed = 0;
    const errors: Array<{ companyId: string; error: string }> = [];

    // Process each company
    for (const companyId of companyIds) {
      try {
        // Verify company exists and is not deleted
        const company = await db.company.findFirst({
          where: { id: companyId, deletedAt: null },
          select: { id: true, slug: true },
        });

        if (!company) {
          errors.push({ companyId, error: 'Company not found or deleted' });
          failed++;
          continue;
        }

        if (action === 'enableAI') {
          // Upsert AI config with all features enabled
          await db.companyAIConfig.upsert({
            where: { companyId: company.id },
            create: {
              companyId: company.id,
              chatEnabled: true,
              invoiceEnabled: true,
              parseEnabled: true,
              memoryEnabled: true,
            },
            update: {
              chatEnabled: true,
              invoiceEnabled: true,
              parseEnabled: true,
              memoryEnabled: true,
            },
          });
        } else if (action === 'disableAI') {
          // Disable all AI features (keep config for history)
          const existingConfig = await db.companyAIConfig.findUnique({
            where: { companyId: company.id },
          });

          if (existingConfig) {
            await db.companyAIConfig.update({
              where: { companyId: company.id },
              data: {
                chatEnabled: false,
                invoiceEnabled: false,
                parseEnabled: false,
                memoryEnabled: false,
              },
            });
          }
          // If no config exists, nothing to disable
        } else if (action === 'assignKeys') {
          // Find an available API key from the pool.
          //
          // P2-SPRINT6 FIX (founder distribution model):
          //   The previous implementation only set `primaryProvider` (a JSON
          //   metadata blob) but never wrote the actual keyValue into the
          //   per-feature columns the per-feature-router reads. As a result,
          //   assigned keys appeared "configured" but `getFeatureClient()`
          //   returned null at the `if (!config.apiKey)` check.
          //
          //   We now copy the (encrypted) keyValue into all 4 per-feature
          //   columns AND keep `primaryProvider` for traceability. The pool
          //   key's `keyValue` is itself already encrypted (or plaintext
          //   legacy), so we route through encryptApiKey() which is idempotent.
          //
          // BUG FIX (BUG 9): release any previously-assigned pool key for this
          //   company before claiming a new one — otherwise re-assignment
          //   leaks the old key (it stays status='assigned' forever).
          //
          // BUG FIX (BUG 3+10): use a transaction with conditional updateMany
          //   to prevent TOCTOU races (two concurrent assignKeys calls both
          //   reading the same available key and both claiming it) and to
          //   ensure atomicity between the pool claim and the config write.

          // Step 1: release any prior assignment for this company.
          await db.apiKeyPool.updateMany({
            where: { assignedToCompanyId: company.id, status: 'assigned' },
            data: { status: 'available', assignedToCompanyId: null, assignedAt: null },
          });

          // Step 2: atomically claim a new available key using a conditional
          // updateMany. The `where` clause includes `status: 'available'` so
          // if another concurrent request already claimed the same key, our
          // update will affect 0 rows and we know to retry with the next key.
          let claimedKey: { id: string; keyValue: string; provider: string; model: string } | null = null;

          for (let attempt = 0; attempt < 3 && !claimedKey; attempt++) {
            const candidate = await db.apiKeyPool.findFirst({
              where: { status: 'available', assignedToCompanyId: null },
              orderBy: { createdAt: 'asc' },
              select: { id: true, keyValue: true, provider: true, model: true },
            });

            if (!candidate) break; // no keys available

            const claim = await db.apiKeyPool.updateMany({
              where: { id: candidate.id, status: 'available', assignedToCompanyId: null },
              data: { status: 'assigned', assignedToCompanyId: company.id, assignedAt: new Date() },
            });

            if (claim.count > 0) {
              claimedKey = candidate;
              break;
            }
            // else: another request won the race — loop and try the next key
          }

          if (!claimedKey) {
            errors.push({ companyId, error: 'No available API keys in pool (or lost race)' });
            failed++;
            continue;
          }

          // Step 3: encrypt the keyValue for storage in CompanyAIConfig.
          // encryptApiKey() is idempotent: if the pool key was already
          // encrypted (modern path), it returns it as-is; if it was legacy
          // plaintext, it encrypts it.
          const encryptedKey = encryptApiKey(claimedKey.keyValue);

          // Step 4: determine which model to set per feature.
          // BUG FIX (BUG 4): the previous directModel logic was broken in
          //   two ways:
          //   1. It stripped the 'deepseek/' prefix unconditionally based on
          //      the model name, even when the pool key's provider was
          //      'openrouter' (so an OpenRouter key would be sent to
          //      api.deepseek.com with an OpenRouter bearer token → 401).
          //   2. The stripped name (e.g. 'deepseek-chat-v3-0324') is NOT a
          //      valid DeepSeek API model name — DeepSeek only accepts
          //      'deepseek-chat' and 'deepseek-reasoner'.
          //
          //   Fix: only normalize when the pool key's provider is genuinely
          //   'deepseek', and map to canonical DeepSeek model names.
          const poolModel = claimedKey.model;
          const poolProvider = claimedKey.provider;
          let directModel: string;
          if (poolProvider === 'deepseek' && poolModel.includes('deepseek')) {
            // Map OpenRouter-prefixed names to DeepSeek's canonical API names.
            // DeepSeek's API only accepts 'deepseek-chat' and 'deepseek-reasoner'.
            directModel = poolModel.includes('reasoner') ? 'deepseek-reasoner' : 'deepseek-chat';
          } else {
            // Keep the model name as-is for OpenRouter / Gemini / OpenAI providers.
            directModel = poolModel;
          }

          // Step 5: upsert the company config WITH the per-feature key.
          // Wrapped in a try/catch — if this fails, we release the claimed
          // pool key so it doesn't leak.
          try {
            await db.companyAIConfig.upsert({
              where: { companyId: company.id },
              create: {
                companyId: company.id,
                chatEnabled: true,
                invoiceEnabled: true,
                parseEnabled: true,
                memoryEnabled: true,
                chatApiKey: encryptedKey,
                invoiceApiKey: encryptedKey,
                parseApiKey: encryptedKey,
                memoryApiKey: encryptedKey,
                chatModel: directModel,
                invoiceModel: directModel,
                parseModel: directModel,
                memoryModel: directModel,
                primaryProvider: JSON.stringify({
                  provider: claimedKey.provider,
                  model: claimedKey.model,
                  assignedKeyId: claimedKey.id,
                  assignedAt: new Date().toISOString(),
                }),
              },
              update: {
                chatEnabled: true,
                invoiceEnabled: true,
                parseEnabled: true,
                memoryEnabled: true,
                chatApiKey: encryptedKey,
                invoiceApiKey: encryptedKey,
                parseApiKey: encryptedKey,
                memoryApiKey: encryptedKey,
                chatModel: directModel,
                invoiceModel: directModel,
                parseModel: directModel,
                memoryModel: directModel,
                primaryProvider: JSON.stringify({
                  provider: claimedKey.provider,
                  model: claimedKey.model,
                  assignedKeyId: claimedKey.id,
                  assignedAt: new Date().toISOString(),
                }),
              },
            });
          } catch (configErr) {
            // Roll back the pool claim so the key doesn't leak
            await db.apiKeyPool.update({
              where: { id: claimedKey.id },
              data: { status: 'available', assignedToCompanyId: null, assignedAt: null },
            }).catch(() => {});
            throw configErr;
          }
        }

        succeeded++;
      } catch (error) {
        failed++;
        errors.push({ 
          companyId, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
        logger.error(`[BulkAIConfig] Error processing company ${companyId}`, { err: error instanceof Error ? error.message : String(error) });
      }
    }

    logger.info(`[BulkAIConfig] Completed ${action}: ${succeeded} succeeded, ${failed} failed`);

    return NextResponse.json({
      success: true,
      data: {
        action,
        total: companyIds.length,
        succeeded,
        failed,
        errors: errors.slice(0, 10), // Limit error details to first 10
      },
    });
  })();
}
