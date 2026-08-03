/**
 * DELETE /api/founder-panel/api-key-pool/[id]
 * 
 * Revoke a specific API key from the pool
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveAuth } from '@/lib/auth';
import { apiError, withErrorHandler } from '@/lib/api';
import { logger } from '@/lib/logger';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandler(async () => {
    // Authenticate (founder only)
    const auth = await resolveAuth(request);
    if (!auth.user) return apiError(401, 'Unauthorized');

    const { id } = await params;

    // Check if key exists
    const existingKey = await db.apiKeyPool.findUnique({ where: { id } });
    if (!existingKey) {
      return apiError(404, 'Key not found');
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

    logger.info(`[ApiKeyPool] Revoked key ${id} by founder ${auth.user.email}`);

    return NextResponse.json({
      success: true,
      message: 'Key revoked successfully',
    });
  }, request);
}
