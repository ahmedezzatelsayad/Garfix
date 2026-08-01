/**
 * GarfiX EOS - AI Alerts API Endpoint
 * 
 * REST API for managing AI system alerts
 * 
 * Endpoints:
 * GET /api/ai/alerts - List all active alerts with optional filters
 * POST /api/ai/alerts - Perform actions on alerts (acknowledge, resolve, suppress)
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  getAlertManager, 
  type AlertSeverity,
  type AlertStatus
} from '@/lib/ai/alert-manager';

/**
 * GET /api/ai/alerts
 * Query params:
 * - severity: Filter by severity (info, warning, error, critical)
 * - status: Filter by status (active, acknowledged, resolved, suppressed)
 * - limit: Max number of results (default: 50)
 * - action: 'stats' | 'history'
 */
export async function GET(request: NextRequest) {
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

  } catch (error: any) {
    console.error('Error fetching alerts:', error);
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
 * - user: User who is performing the action
 * - message: Optional message for resolve/suppress actions
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, alertId, user, message } = body;
    const manager = getAlertManager();

    switch (action) {
      case 'acknowledge':
        if (!alertId) {
          return NextResponse.json(
            { success: false, error: 'alertId is required' },
            { status: 400 }
          );
        }
        
        const ackAlert = manager.acknowledgeAlert(alertId, user || 'anonymous');
        if (ackAlert) {
          return NextResponse.json({ success: true, alert: ackAlert });
        }
        return NextResponse.json(
          { success: false, error: 'Alert not found or not active' },
          { status: 404 }
        );

      case 'resolve':
        if (!alertId) {
          return NextResponse.json(
            { success: false, error: 'alertId is required' },
            { status: 400 }
          );
        }
        
        const resolvedAlert = await manager.resolveAlert(alertId, message);
        if (resolvedAlert) {
          return NextResponse.json({ success: true, alert: resolvedAlert });
        }
        return NextResponse.json(
          { success: false, error: 'Alert not found' },
          { status: 404 }
        );

      case 'suppress':
        if (!alertId || !message) {
          return NextResponse.json(
            { success: false, error: 'alertId and message (reason) are required' },
            { status: 400 }
          );
        }
        
        const suppressedAlert = manager.suppressAlert(alertId, message, body.durationMs);
        if (suppressedAlert) {
          return NextResponse.json({ success: true, alert: suppressedAlert });
        }
        return NextResponse.json(
          { success: false, error: 'Alert not found' },
          { status: 404 }
        );

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

  } catch (error: any) {
    console.error('Error processing alert action:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
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
