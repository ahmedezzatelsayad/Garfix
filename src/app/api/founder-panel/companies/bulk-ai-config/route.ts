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
          const availableKey = await db.apiKeyPool.findFirst({
            where: {
              status: 'available',
              assignedToCompanyId: null,
            },
            orderBy: { createdAt: 'asc' }, // FIFO assignment
          });

          if (!availableKey) {
            errors.push({ companyId, error: 'No available API keys in pool' });
            failed++;
            continue;
          }

          // Encrypt the keyValue once for storage in CompanyAIConfig.
          // encryptApiKey() is idempotent: if the pool key was already
          // encrypted (modern path), it returns it as-is; if it was legacy
          // plaintext, it encrypts it.
          const encryptedKey = encryptApiKey(availableKey.keyValue);

          // Determine which model to set per feature.
          // If the pool key's model is a DeepSeek variant, prefer the direct
          // `deepseek-chat` form (routed to api.deepseek.com) over the
          // OpenRouter-prefixed form — saves intermediary fees.
          const poolModel = availableKey.model;
          const directModel = poolModel.startsWith('deepseek/')
            ? poolModel.split('/')[1] // e.g. 'deepseek-chat-v3-0324' → still works with DeepSeek API
            : poolModel;

          // Assign the key to this company
          await db.apiKeyPool.update({
            where: { id: availableKey.id },
            data: {
              status: 'assigned',
              assignedToCompanyId: company.id,
              assignedAt: new Date(),
            },
          });

          // Ensure AI config exists and is enabled — now WITH the actual
          // per-feature API key populated (encrypted at rest).
          await db.companyAIConfig.upsert({
            where: { companyId: company.id },
            create: {
              companyId: company.id,
              chatEnabled: true,
              invoiceEnabled: true,
              parseEnabled: true,
              memoryEnabled: true,
              // Per-feature keys (encrypted)
              chatApiKey: encryptedKey,
              invoiceApiKey: encryptedKey,
              parseApiKey: encryptedKey,
              memoryApiKey: encryptedKey,
              // Per-feature models — use the pool key's model
              chatModel: directModel,
              invoiceModel: directModel,
              parseModel: directModel,
              memoryModel: directModel,
              // Traceability: which pool key was assigned
              primaryProvider: JSON.stringify({
                provider: availableKey.provider,
                model: availableKey.model,
                assignedKeyId: availableKey.id,
                assignedAt: new Date().toISOString(),
              }),
            },
            update: {
              chatEnabled: true,
              invoiceEnabled: true,
              parseEnabled: true,
              memoryEnabled: true,
              // Per-feature keys (encrypted)
              chatApiKey: encryptedKey,
              invoiceApiKey: encryptedKey,
              parseApiKey: encryptedKey,
              memoryApiKey: encryptedKey,
              // Per-feature models — use the pool key's model
              chatModel: directModel,
              invoiceModel: directModel,
              parseModel: directModel,
              memoryModel: directModel,
              // Traceability: which pool key was assigned
              primaryProvider: JSON.stringify({
                provider: availableKey.provider,
                model: availableKey.model,
                assignedKeyId: availableKey.id,
                assignedAt: new Date().toISOString(),
              }),
            },
          });
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
