/**
 * DELETE /api/founder-panel/api-key-pool/[id]
 * 
 * Revoke a specific API key from the pool
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbTyped as db } from '@/lib/db';
import { requireFounder } from '@/lib/middleware';
import { apiError, withErrorHandler } from '@/lib/api';
import { logger } from '@/lib/logger';
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // P5-H2: Rate limit DELETE /api/founder-panel-api-key-pool-id — 30/min/IP (API_WRITE).
  const rl = await rateLimitResponse(request, "delete:founder-panel-api-key-pool-id", LIMITS.API_WRITE);
  if (rl) return rl;

  return withErrorHandler(async () => {
    // P0-03: Require founder authorization (not just any authenticated user).
    const founderAccess = await requireFounder(request);
    if (founderAccess instanceof NextResponse) return founderAccess;

    const { id } = await params;

    // Check if key exists
    const existingKey = await db.apiKeyPool.findUnique({ where: { id } });
    if (!existingKey) {
      return apiError('Key not found', 404);
    }

    // Revoke the key (soft delete - mark as revoked)
    await db.apiKeyPool.update({
      where: { id },
      data: {
        status: 'revoked',
        assignedToUserId: null,
        assignedToCompanyId: null,
      },
    });

    logger.info(`[ApiKeyPool] Revoked key ${id} by founder ${founderAccess.user.email}`);

    return NextResponse.json({
      success: true,
      message: 'Key revoked successfully',
    });
  })();
}
