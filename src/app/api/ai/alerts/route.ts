/**
 * GarfiX EOS - AI Alerts API Endpoint
 *
 * REST API for managing AI system alerts
 *
 * Endpoints:
 * GET /api/ai/alerts - List all active alerts with optional filters
 * POST /api/ai/alerts - Perform actions on alerts (acknowledge, resolve, suppress)
 *
 * P5-C2 (Production Readiness Sprint): both endpoints were completely
 * unauthenticated. Anyone could read critical AI alerts, and anyone could
 * acknowledge / resolve / suppress them — silently corrupting the AI
 * ops surface. We now:
 *   - Gate both handlers behind requireFounder (which itself calls
 *     requireAuth + isFounderEmail + emailVerified DB check). AI alerts
 *     are platform-wide signals, so founder-only is the correct scope
 *     (mirrors the founder-panel/ai-fabric and platform-admin/ai-usage
 *     routes). The `manage_ai_alerts` permission key does not exist in
 *     src/lib/permissions.ts, so requireFounder is the safe default
 *     per the task instructions.
 *   - Rate-limit GET (API_READ) and POST (API_WRITE) per-user via
 *     rateLimitResponse, mirroring the /api/ai/chat pattern. Note: the
 *     task description referenced a `withRateLimit(config, req)` helper
 *     that does not exist in src/lib/rateLimit.ts — the actual exported
 *     helper is `rateLimitResponse(req, keyPrefix, config, identifier?)`,
 *     which is what we use here.
 *   - Replace console.error with logger.error (structured logging).
 *   - Log an audit entry for every state-transitioning POST action
 *     (acknowledge / resolve / suppress) via logAudit, so there is a
 *     tamper-evident trail of who dismissed which alert.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getAlertManager,
  type AlertSeverity,
  type AlertStatus
} from '@/lib/ai/alert-manager';
import { requireFounder } from '@/lib/middleware';
import { rateLimitResponse, LIMITS } from '@/lib/rateLimit';
import { logAudit } from '@/lib/audit';
import { logger } from '@/lib/logger';

/**
 * GET /api/ai/alerts
 * Query params:
 * - severity: Filter by severity (info, warning, error, critical)
 * - status: Filter by status (active, acknowledged, resolved, suppressed)
 * - limit: Max number of results (default: 50)
 * - action: 'stats' | 'history'
 */
export async function GET(request: NextRequest) {
  // P5-C2: auth + founder gate (requireFounder internally calls requireAuth).
  const authResult = await requireFounder(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult.user;

  // P5-C2: per-user read rate limit (60/min). Founder-only audience so the
  // per-user key is appropriate; mirrors /api/ai/chat's rate-limit pattern.
  const rlErr = await rateLimitResponse(request, 'ai:alerts:read', LIMITS.API_READ, user.uid);
  if (rlErr) return rlErr;

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    // Handle different actions
    if (action === 'stats') {
      return handleGetStats();
    }

    if (action === 'history') {
      return handleGetHistory(searchParams);
    }

    // Default: get active alerts
    const manager = getAlertManager();
    const severity = searchParams.get('severity') as AlertSeverity | null;
    const status = searchParams.get('status') as AlertStatus | null;
    const limit = parseInt(searchParams.get('limit') || '50');

    const alerts = manager.getActiveAlerts({
      severity: severity || undefined,
      status: status || undefined
    }).slice(0, limit);

    return NextResponse.json({
      success: true,
      alerts,
      stats: manager.getStats(),
      timestamp: new Date().toISOString()
    });

  } catch (error: unknown) {
    logger.error('[ai/alerts] GET failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch alerts' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ai/alerts
 * Body:
 * - action: 'acknowledge' | 'resolve' | 'suppress'
 * - alertId: The ID of the alert
 * - user: User who is performing the action (legacy field — ignored; we use the authed user)
 * - message: Optional message for resolve/suppress actions
 */
export async function POST(request: NextRequest) {
  // P5-C2: auth + founder gate. Anyone could previously acknowledge /
  // resolve / suppress critical AI alerts — this gate closes that.
  const authResult = await requireFounder(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult.user;

  // P5-C2: per-user write rate limit (30/min) — mutating endpoint.
  const rlErr = await rateLimitResponse(request, 'ai:alerts:write', LIMITS.API_WRITE, user.uid);
  if (rlErr) return rlErr;

  try {
    const body = await request.json();
    const { action, alertId, message } = body;
    const manager = getAlertManager();

    // P5-C2: use the authenticated user's email rather than the body-supplied
    // `user` field — the body field was a spoofing vector (any caller could
    // claim to be anyone). The authed user is the source of truth.
    const actorEmail = user.email;

    switch (action) {
      case 'acknowledge': {
        if (!alertId) {
          return NextResponse.json(
            { success: false, error: 'alertId is required' },
            { status: 400 }
          );
        }

        const ackAlert = manager.acknowledgeAlert(alertId, actorEmail);
        if (ackAlert) {
          // P5-C2: audit trail for the state transition.
          void logAudit({
            userEmail: user.email,
            userUid: user.uid,
            action: 'ai_alert_acknowledge',
            entity: 'ai_alert',
            entityId: String(alertId),
            companySlug: null,
            details: { alertId, fromStatus: 'active', toStatus: 'acknowledged' },
          }).catch((err: unknown) => {
            logger.error('[ai/alerts] audit log failed (acknowledge)', {
              err: err instanceof Error ? err.message : String(err),
              alertId,
            });
          });
          return NextResponse.json({ success: true, alert: ackAlert });
        }
        return NextResponse.json(
          { success: false, error: 'Alert not found or not active' },
          { status: 404 }
        );
      }

      case 'resolve': {
        if (!alertId) {
          return NextResponse.json(
            { success: false, error: 'alertId is required' },
            { status: 400 }
          );
        }

        const resolvedAlert = await manager.resolveAlert(alertId, message);
        if (resolvedAlert) {
          void logAudit({
            userEmail: user.email,
            userUid: user.uid,
            action: 'ai_alert_resolve',
            entity: 'ai_alert',
            entityId: String(alertId),
            companySlug: null,
            details: { alertId, message: message ?? null, toStatus: 'resolved' },
          }).catch((err: unknown) => {
            logger.error('[ai/alerts] audit log failed (resolve)', {
              err: err instanceof Error ? err.message : String(err),
              alertId,
            });
          });
          return NextResponse.json({ success: true, alert: resolvedAlert });
        }
        return NextResponse.json(
          { success: false, error: 'Alert not found' },
          { status: 404 }
        );
      }

      case 'suppress': {
        if (!alertId || !message) {
          return NextResponse.json(
            { success: false, error: 'alertId and message (reason) are required' },
            { status: 400 }
          );
        }

        const suppressedAlert = manager.suppressAlert(alertId, message, body.durationMs);
        if (suppressedAlert) {
          void logAudit({
            userEmail: user.email,
            userUid: user.uid,
            action: 'ai_alert_suppress',
            entity: 'ai_alert',
            entityId: String(alertId),
            companySlug: null,
            details: {
              alertId,
              reason: message,
              durationMs: body.durationMs ?? null,
              toStatus: 'suppressed',
            },
          }).catch((err: unknown) => {
            logger.error('[ai/alerts] audit log failed (suppress)', {
              err: err instanceof Error ? err.message : String(err),
              alertId,
            });
          });
          return NextResponse.json({ success: true, alert: suppressedAlert });
        }
        return NextResponse.json(
          { success: false, error: 'Alert not found' },
          { status: 404 }
        );
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

  } catch (error: unknown) {
    logger.error('[ai/alerts] POST failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Handle GET /api/ai/alerts?action=stats
 */
async function handleGetStats() {
  const manager = getAlertManager();
  const stats = manager.getStats();

  return NextResponse.json({
    success: true,
    stats,
    timestamp: new Date().toISOString()
  });
}

/**
 * Handle GET /api/ai/alerts?action=history
 */
async function handleGetHistory(searchParams: URLSearchParams) {
  const manager = getAlertManager();
  const severity = searchParams.get('severity') as AlertSeverity | null;
  const limit = parseInt(searchParams.get('limit') || '100');

  const history = manager.getHistory(limit, {
    severity: severity || undefined
  });

  return NextResponse.json({
    success: true,
    history,
    count: history.length,
    timestamp: new Date().toISOString()
  });
}
