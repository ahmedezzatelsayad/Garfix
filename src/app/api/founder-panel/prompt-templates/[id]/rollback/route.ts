/**
 * POST /api/founder-panel/prompt-templates/[id]/rollback
 *
 * AI-12 FIX (Audit v2 · Phase 3): PromptTemplate rollback endpoint.
 *
 * Problem: PromptTemplate had no version column and no rollback endpoint.
 * A bad prompt edit (e.g. a typo that breaks the JSON-only contract for
 * invoice-extract) could not be reverted without a manual DB restore.
 *
 * Fix: founder-only endpoint that rolls a prompt back to a previous version
 * by creating a NEW row at version N+1 with the content of the target
 * version, then deactivating the current row. This preserves the full
 * history (no destructive UPDATE) and matches the append-only contract
 * enforced by the unique constraint on (name, version).
 *
 * Request body:
 *   { "targetVersion": number } — required, the version to roll back to.
 *   The target must be < the current active version (you can't roll
 *   "back" to the current version — that's a no-op).
 *
 * Response 200:
 *   {
 *     "success": true,
 *     "newVersion": <number>,            // the new row's version (current + 1)
 *     "rolledBackFrom": <number>,        // the previous active version
 *     "rolledBackTo": <number>,          // the target version's content (now at newVersion)
 *     "template": { id, name, version, content, changeLog, active, ... }
 *   }
 *
 * Response 400: bad input (missing targetVersion, targetVersion >= current).
 * Response 403: caller is not a founder.
 * Response 404: prompt template id not found, or target version not found.
 * Response 429: rate-limited.
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbTyped as db } from '@/lib/db';
import { requireFounder } from '@/lib/middleware';
import { apiError, withErrorHandler } from '@/lib/api';
import { logger } from '@/lib/logger';
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";
import { logAudit } from '@/lib/audit';
import { invalidatePromptCache } from '@/lib/promptTemplate';
import { z } from 'zod';

const RollbackSchema = z.object({
  targetVersion: z.number().int().min(1),
  changeLog: z.string().max(500).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // AI-12: rate limit the rollback endpoint (30/min/IP — API_WRITE).
  const rl = await rateLimitResponse(request, "post:founder-panel-prompt-templates-rollback", LIMITS.API_WRITE);
  if (rl) return rl;

  return withErrorHandler(async () => {
    // AI-12: founder-only gate. Prompt templates affect EVERY tenant's AI
    // behaviour, so only the founder can roll them back.
    const founderAccess = await requireFounder(request);
    if (founderAccess instanceof NextResponse) return founderAccess;

    const { id } = await params;

    // Parse + validate the body.
    const body = await request.json().catch(() => null);
    const parsed = RollbackSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
    }
    const { targetVersion, changeLog } = parsed.data;

    // 1. Fetch the CURRENT active row for this id.
    const current = await db.promptTemplate.findUnique({ where: { id } });
    if (!current) {
      return apiError('Prompt template not found', 404);
    }
    if (!current.active) {
      return apiError('Cannot roll back from an inactive template (find the active one first)', 400);
    }
    if (targetVersion === current.version) {
      return apiError('targetVersion equals current version — nothing to roll back', 400);
    }
    if (targetVersion > current.version) {
      return apiError(`targetVersion (${targetVersion}) must be less than current (${current.version})`, 400);
    }

    // 2. Fetch the TARGET version's content (the content we want to restore).
    const target = await db.promptTemplate.findFirst({
      where: { name: current.name, version: targetVersion },
    });
    if (!target) {
      return apiError(`Target version ${targetVersion} not found for prompt "${current.name}"`, 404);
    }

    // 3. Compute the new version number (current.version + 1).
    const newVersion = current.version + 1;

    // 4. Append-only rollback: create a NEW row at newVersion with the
    //    target's content, then deactivate the current row. This preserves
    //    the full history and respects the unique(name, version) constraint.
    const [newRow] = await db.$transaction([
      // 4a. Create the new row.
      db.promptTemplate.create({
        data: {
          name: current.name,
          version: newVersion,
          content: target.content,
          changeLog: changeLog ?? `Rollback from v${current.version} to v${targetVersion} content`,
          active: true,
          createdBy: founderAccess.user.email,
        },
      }),
      // 4b. Deactivate the previously-active row.
      db.promptTemplate.update({
        where: { id: current.id },
        data: { active: false },
      }),
    ]);

    // 5. Invalidate the in-process prompt cache so the next getPrompt()
    //    call picks up the new content.
    invalidatePromptCache(current.name);

    // 6. Audit trail — who rolled back what, from where, to where.
    void logAudit({
      userEmail: founderAccess.user.email,
      userUid: founderAccess.user.uid,
      action: 'prompt_template_rollback',
      entity: 'prompt_template',
      entityId: id,
      companySlug: null,
      details: {
        name: current.name,
        rolledBackFrom: current.version,
        rolledBackToContentOf: targetVersion,
        newVersion,
        newRowId: newRow.id,
        deactivatedRowId: current.id,
      },
    }).catch((err: unknown) => {
      logger.error('[prompt-templates/rollback] audit log failed', {
        err: err instanceof Error ? err.message : String(err),
        promptId: id,
      });
    });

    logger.info('[prompt-templates/rollback] rolled back', {
      promptId: id,
      name: current.name,
      from: current.version,
      toContentOf: targetVersion,
      newVersion,
    });

    return NextResponse.json({
      success: true,
      newVersion,
      rolledBackFrom: current.version,
      rolledBackTo: targetVersion, // the content of this version is now at newVersion
      template: {
        id: newRow.id,
        name: newRow.name,
        version: newRow.version,
        content: newRow.content,
        changeLog: newRow.changeLog,
        active: newRow.active,
        createdBy: newRow.createdBy,
        createdAt: newRow.createdAt,
        updatedAt: newRow.updatedAt,
      },
    });
  })();
}
