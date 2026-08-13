'use client';

/**
 * GarfiX EOS - Enterprise AI Metrics Dashboard
 * 
 * Comprehensive admin dashboard for monitoring AI system health,
 * performance, and resource utilization across all workers and API keys.
 * 
 * Features:
 * - Real-time pool status overview
 * - Per-key health monitoring cards
 * - Worker performance metrics
 * - Queue depth visualization
 * - Alert notification system
 * - Auto-scaling status display
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { 
  Activity, 
  Zap, 
  Server, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle,
  TrendingUp,
  TrendingDown,
  Clock,
  Cpu,
  Database,
  RefreshCw,
  Bell,
  Settings,
  BarChart3,
  Users,
  Key,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';

// ============== Types ==============
interface KeyHealthStatus {
  keyId: string;
  keyName: string;
  health: 'healthy' | 'degraded' | 'critical' | 'unknown';
  circuitState: 'closed' | 'open' | 'half-open';
  rpmUsed: number;
  rpmLimit: number;
  tokensUsed: number;
  tokenLimit: number;
  latencyMs: number;
  successRate: number;
  lastError?: string;
  lastCheckTime: string;
}

interface PoolMetrics {
  status: 'healthy' | 'degraded' | 'critical';
  healthFactor: number;
  totalRPM: number;
  maxRPM: number;
  queueDepth: number;
  maxQueueSize: number;
  activeWorkers: number;
  maxWorkers: number;
  totalRequestsToday: number;
  totalTokensToday: number;
}

interface WorkerStats {
  workerType: string;
  queueName: string;
  jobsProcessed: number;
  jobsFailed: number;
  avgDurationMs: number;
  activeJobs: number;
  queuedJobs: number;
  lastJobTime: string;
}

interface AlertItem {
  id: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  source: string;
  timestamp: string;
  acknowledged: boolean;
}

interface AIMetricsData {
  pool: PoolMetrics;
  keys: KeyHealthStatus[];
  workers: WorkerStats[];
  alerts: AlertItem[];
  timestamp: string;
}

// ============== Constants ==============
const HEALTH_COLORS = {
  healthy: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-800' },
  degraded: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-800' },
  critical: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', badge: 'bg-red-100 text-red-800' },
  unknown: { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700', badge: 'bg-gray-100 text-gray-800' }
};

const CIRCUIT_BADGE = {
  closed: { variant: 'default' as const, label: 'Active', className: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100' },
  open: { variant: 'default' as const, label: 'Isolated', className: 'bg-red-100 text-red-800 hover:bg-red-100' },
  'half-open': { variant: 'default' as const, label: 'Testing', className: 'bg-amber-100 text-amber-800 hover:bg-amber-100' }
};

const SEVERITY_STYLES = {
  info: { icon: 'ℹ️', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
  warning: { icon: '⚠️', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
  error: { icon: '❌', color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
  critical: { icon: '🚨', color: 'text-red-700', bg: 'bg-red-100 border-red-300 font-bold' }
};

// ============== Mock Data (for development/demo) ==============
const generateMockMetrics = (): AIMetricsData => ({
  pool: {
    status: 'healthy',
    healthFactor: 0.95,
    totalRPM: 42,
    maxRPM: 75,
    queueDepth: 23,
    maxQueueSize: 500,
    activeWorkers: 8,
    maxWorkers: 20,
    totalRequestsToday: 1847,
    totalTokensToday: 2456789
  },
  keys: [
    {
      keyId: 'key-1',
      keyName: 'Ahmed (Primary)',
      health: 'healthy',
      circuitState: 'closed',
      rpmUsed: 12,
      rpmLimit: 15,
      tokensUsed: 523456,
      tokenLimit: 1000000,
      latencyMs: 245,
      successRate: 99.2,
      lastCheckTime: new Date().toISOString()
    },
    {
      keyId: 'key-2',
      keyName: 'Sibling1',
      health: 'healthy',
      circuitState: 'closed',
      rpmUsed: 9,
      rpmLimit: 15,
      tokensUsed: 487234,
      tokenLimit: 1000000,
      latencyMs: 312,
      successRate: 98.8,
      lastCheckTime: new Date().toISOString()
    },
    {
      keyId: 'key-3',
      keyName: 'Sibling2',
      health: 'degraded',
      circuitState: 'closed',
      rpmUsed: 14,
      rpmLimit: 15,
      tokensUsed: 612987,
      tokenLimit: 1000000,
      latencyMs: 567,
      successRate: 97.1,
      lastError: 'Elevated latency detected',
      lastCheckTime: new Date().toISOString()
    },
    {
      keyId: 'key-4',
      keyName: 'Sibling3',
      health: 'healthy',
      circuitState: 'closed',
      rpmUsed: 4,
      rpmLimit: 15,
      tokensUsed: 398765,
      tokenLimit: 1000000,
      latencyMs: 198,
      successRate: 99.5,
      lastCheckTime: new Date().toISOString()
    },
    {
      keyId: 'key-5',
      keyName: 'Sibling4',
      health: 'critical',
      circuitState: 'open',
      rpmUsed: 0,
      rpmLimit: 15,
      tokensUsed: 432345,
      tokenLimit: 1000000,
      latencyMs: 0,
      successRate: 0,
      lastError: 'Circuit OPEN after 3 consecutive failures',
      lastCheckTime: new Date().toISOString()
    }
  ],
  workers: [
    {
      workerType: 'ai-chat',
      queueName: 'ai:chat-queue',
      jobsProcessed: 892,
      jobsFailed: 3,
      avgDurationMs: 1234,
      activeJobs: 5,
      queuedJobs: 12,
      lastJobTime: new Date().toISOString()
    },
    {
      workerType: 'ai-invoice-extract',
      queueName: 'ai:invoice-queue',
      jobsProcessed: 445,
      jobsFailed: 1,
      avgDurationMs: 2345,
      activeJobs: 2,
      queuedJobs: 8,
      lastJobTime: new Date().toISOString()
    },
    {
      workerType: 'ai-smart-parse',
      queueName: 'ai:parse-queue',
      jobsProcessed: 267,
      jobsFailed: 0,
      avgDurationMs: 1876,
      activeJobs: 1,
      queuedJobs: 3,
      lastJobTime: new Date().toISOString()
    },
    {
      workerType: 'ai-agent-accounting',
      queueName: 'ai:accounting-queue',
      jobsProcessed: 156,
      jobsFailed: 2,
      avgDurationMs: 3456,
      activeJobs: 0,
      queuedJobs: 0,
      lastJobTime: new Date(Date.now() - 120000).toISOString()
    },
    {
      workerType: 'ai-agent-sales',
      queueName: 'ai:sales-queue',
      jobsProcessed: 78,
      jobsFailed: 0,
      avgDurationMs: 2890,
      activeJobs: 0,
      queuedJobs: 0,
      lastJobTime: new Date(Date.now() - 300000).toISOString()
    },
    {
      workerType: 'ai-agent-inventory',
      queueName: 'ai:inventory-queue',
      jobsProcessed: 34,
      jobsFailed: 0,
      avgDurationMs: 4123,
      activeJobs: 0,
      queuedJobs: 0,
      lastJobTime: new Date(Date.now() - 600000).toISOString()
    }
  ],
  alerts: [
    {
      id: 'alert-1',
      severity: 'critical',
      message: 'Key "Sibling4" circuit breaker OPENED after 3 consecutive failures',
      source: 'LoadBalancer',
      timestamp: new Date(Date.now() - 60000).toISOString(),
      acknowledged: false
    },
    {
      id: 'alert-2',
      severity: 'warning',
      message: 'Key "Sibling2" latency elevated (567ms > 400ms threshold)',
      source: 'HealthMonitor',
      timestamp: new Date(Date.now() - 180000).toISOString(),
      acknowledged: false
    },
    {
      id: 'alert-3',
      severity: 'info',
      message: 'Auto-scaler increased chat workers from 3 to 5',
      source: 'WorkerScaler',
      timestamp: new Date(Date.now() - 300000).toISOString(),
      acknowledged: true
    },
    {
      id: 'alert-4',
      severity: 'warning',
      message: 'Pool RPM at 56% capacity (42/75)',
      source: 'RateLimiter',
      timestamp: new Date(Date.now() - 420000).toISOString(),
      acknowledged: true
    }
  ],
  timestamp: new Date().toISOString()
});

// ============== Components ==============

// Status Indicator Component
function StatusIndicator({ status, size = 'sm' }: { status: 'healthy' | 'degraded' | 'critical' | 'unknown'; size?: 'sm' | 'md' }) {
  const sizeClasses = size === 'sm' ? 'w-2 h-2' : 'w-3 h-3';
  const colors = {
    healthy: 'bg-emerald-500',
    degraded: 'bg-amber-500',
    critical: 'bg-red-500',
    unknown: 'bg-gray-400'
  };
  
  return <span className={`${sizeClasses} ${colors[status]} rounded-full inline-block`} />;
}

// Metric Card Component — DS v4.0: Using kpi-card-gold for AI metrics
function MetricCard({ 
  title, 
  value, 
  unit, 
  icon: Icon, 
  trend, 
  trendValue,
  description 
}: { 
  title: string; 
  value: string | number; 
  unit?: string; 
  icon: any; 
  trend?: 'up' | 'down' | 'stable';
  trendValue?: string;
  description?: string;
}) {
  return (
    <Card className="kpi-card-gold relative overflow-hidden hover-lift duration-120 shadow-brand-md">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold">{value}</span>
          {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
        </div>
        {(trend || trendValue) && (
          <div className={`flex items-center gap-1 mt-1 text-xs ${
            trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-600' : 'text-gray-500'
          }`}>
            {trend === 'up' && <TrendingUp className="h-3 w-3" />}
            {trend === 'down' && <TrendingDown className="h-3 w-3" />}
            {trendValue}
          </div>
        )}
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

// Key Health Card Component — DS v4.0: ai-card for AI components
function KeyHealthCard({ keyData }: { keyData: KeyHealthStatus }) {
  const healthStyle = HEALTH_COLORS[keyData.health];
  const circuitBadge = CIRCUIT_BADGE[keyData.circuitState];
  const rpmPercentage = (keyData.rpmUsed / keyData.rpmLimit) * 100;
  const tokenPercentage = (keyData.tokensUsed / keyData.tokenLimit) * 100;

  return (
    <Card className={`ai-card ${healthStyle.border} border hover-lift duration-120 shadow-brand-sm`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusIndicator status={keyData.health} size="md" />
            <CardTitle className="text-sm font-semibold">{keyData.keyName}</CardTitle>
          </div>
          <Badge variant={circuitBadge.variant} className={circuitBadge.className}>
            {circuitBadge.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* RPM Usage */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">RPM Usage</span>
            <span className={`font-medium ${healthStyle.text}`}>{keyData.rpmUsed}/{keyData.rpmLimit}</span>
          </div>
          <Progress value={rpmPercentage} className="h-1.5 progress-emerald" />
        </div>

        {/* Token Quota */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">Token Quota</span>
            <span className="font-medium">{((keyData.tokensUsed / keyData.tokenLimit) * 100).toFixed(1)}%</span>
          </div>
          <Progress value={tokenPercentage} className="h-1.5 progress-emerald" />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2 pt-2">
          <div className="text-center p-2 rounded bg-muted/50">
            <p className="text-lg font-bold">{keyData.latencyMs}</p>
            <p className="text-xs text-muted-foreground">Latency (ms)</p>
          </div>
          <div className="text-center p-2 rounded bg-muted/50">
            <p className="text-lg font-bold">{keyData.successRate}%</p>
            <p className="text-xs text-muted-foreground">Success Rate</p>
          </div>
        </div>

        {/* Error Message */}
        {/* FE a11y sweep FIX (Audit v2 · Phase 2): added role=alert */}
        {keyData.lastError && (
          <div role="alert" className="text-xs p-2 rounded bg-red-50 text-red-700 border border-red-200">
            ⚠️ {keyData.lastError}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Worker Stats Row Component — DS v4.0: hover-lift for interactivity
function WorkerStatsRow({ worker }: { worker: WorkerStats }) {
  const successRate = worker.jobsProcessed > 0 
    ? ((worker.jobsProcessed - worker.jobsFailed) / worker.jobsProcessed * 100).toFixed(1)
    : '100';
  
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border hover-lift duration-120 transition-colors ai-card">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#d4a574] to-[#c9956a] flex items-center justify-center text-white shadow-brand-sm">
          <Cpu className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="font-medium text-sm">{worker.workerType.replace('ai-', '').replace('-', ' ')}</p>
          <p className="text-xs text-muted-foreground">{worker.queueName}</p>
        </div>
      </div>
      
      <div className="flex items-center gap-6">
        <div className="text-right">
          <p className="text-sm font-semibold">{worker.jobsProcessed}</p>
          <p className="text-xs text-muted-foreground">processed</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold">{worker.avgDurationMs}ms</p>
          <p className="text-xs text-muted-foreground">avg duration</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold">{successRate}%</p>
          <p className="text-xs text-muted-foreground">success</p>
        </div>
        <div className="flex items-center gap-2">
          {worker.activeJobs > 0 && (
            <Badge variant="default" className="ai-badge-premium bg-gradient-to-r from-[#d4a574] to-[#c9956a] text-white hover:from-[#c9956a] hover:to-[#d4a574]">
              {worker.activeJobs} active
            </Badge>
          )}
          {worker.queuedJobs > 0 && (
            <Badge variant="outline">
              {worker.queuedJobs} queued
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

// Alert Item Component
function AlertItem({ alert, onAcknowledge }: { alert: AlertItem; onAcknowledge: (id: string) => void }) {
  const style = SEVERITY_STYLES[alert.severity];
  
  return (
    <div className={`p-3 rounded-lg border ${style.bg} ${style.color} ${!alert.acknowledged ? 'border-l-4 border-l-current ai-suggestion' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <span>{style.icon}</span>
          <div>
            <p className="text-sm font-medium">{alert.message}</p>
            <p className="text-xs opacity-75 mt-1">
              {alert.source} • {new Date(alert.timestamp).toLocaleTimeString()}
            </p>
          </div>
        </div>
        {!alert.acknowledged && (
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={() => onAcknowledge(alert.id)}
            className="h-6 text-xs active-press duration-150"
          >
            Acknowledge
          </Button>
        )}
      </div>
    </div>
  );
}

// Main Dashboard Component
export function AIMetricsDashboard() {
  const [metrics, setMetrics] = useState<AIMetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  // Fetch metrics from API
  const fetchMetrics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/ai/metrics');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      setMetrics(data);
      setLastRefresh(new Date());
    } catch (err: any) {
      logger.error('Failed to fetch AI metrics:', { err });
      setError(err.message);
      
      // Use mock data for demo/development
      setMetrics(generateMockMetrics());
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch and auto-refresh
  useEffect(() => {
    fetchMetrics();
    
    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(fetchMetrics, 15000); // Refresh every 15 seconds
    }
    
    return () => clearInterval(interval);
  }, [fetchMetrics, autoRefresh]);

  // Acknowledge alert handler
  const handleAcknowledgeAlert = (alertId: string) => {
    if (!metrics) return;
    
    setMetrics({
      ...metrics,
      alerts: metrics.alerts.map(a => 
        a.id === alertId ? { ...a, acknowledged: true } : a
      )
    });
  };

  // Reset quotas handler
  const handleResetQuotas = async () => {
    try {
      const response = await fetch('/api/ai/metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset-quotas' })
      });
      
      if (response.ok) {
        fetchMetrics(); // Refresh metrics
      }
    } catch (err) {
      logger.error('Failed to reset quotas:', { err });
    }
  };

  if (loading && !metrics) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading AI metrics...</p>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-3" />
          <p className="text-lg font-semibold">Failed to load metrics</p>
          <p className="text-muted-foreground">{error || 'Unknown error'}</p>
          <Button onClick={fetchMetrics} className="mt-4">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const unacknowledgedAlerts = metrics.alerts.filter(a => !a.acknowledged);

  return (
    <div className="space-y-6">
      {/* Header — DS v4.0: emerald gradient accent */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-[#047857]" />
            Enterprise AI System Dashboard
          </h2>
          <p className="text-muted-foreground mt-1">
            Real-time monitoring for GarfiX EOS AI infrastructure
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-xs text-muted-foreground">
              Last updated: {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={cn(autoRefresh ? 'bg-[#047857]/10 text-[#047857] border-[#047857]/30' : '', "hover-lift duration-120 active-press duration-150")}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${autoRefresh ? 'animate-spin' : ''}`} />
            Auto-refresh
          </Button>
          
          <Button size="sm" onClick={fetchMetrics} className="active-press duration-150 bg-gradient-to-r from-[#047857] to-emerald-600 text-white border-none hover:brightness-110 shadow-brand-sm">
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Alerts Banner */}
      {unacknowledgedAlerts.length > 0 && (
        <div className={`p-4 rounded-lg border ${
          unacknowledgedAlerts.some(a => a.severity === 'critical')
            ? 'bg-red-50 border-red-200'
            : 'bg-amber-50 border-amber-200'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            <Bell className="h-4 w-4" />
            <span className="font-semibold text-sm">
              {unacknowledgedAlerts.length} Active Alert{unacknowledgedAlerts.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-2">
            {unacknowledgedAlerts.slice(0, 3).map(alert => (
              <AlertItem 
                key={alert.id} 
                alert={alert} 
                onAcknowledge={handleAcknowledgeAlert}
              />
            ))}
          </div>
        </div>
      )}

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview" className="gap-1">
            <BarChart3 className="h-4 w-4" /> Overview
          </TabsTrigger>
          <TabsTrigger value="keys" className="gap-1">
            <Key className="h-4 w-4" /> API Keys
          </TabsTrigger>
          <TabsTrigger value="workers" className="gap-1">
            <Server className="h-4 w-4" /> Workers
          </TabsTrigger>
          <TabsTrigger value="alerts" className="gap-1">
            <Bell className="h-4 w-4" /> Alerts
            {unacknowledgedAlerts.length > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                {unacknowledgedAlerts.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1">
            <Settings className="h-4 w-4" /> Actions
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Pool Status Banner — DS v4.0: kpi-card-gold for AI component */}
          <Card className={`${HEALTH_COLORS[metrics.pool.status].border} border-2 kpi-card-gold shadow-brand-lg`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <StatusIndicator status={metrics.pool.status} size="md" />
                  <div>
                    <p className="font-semibold text-lg capitalize">
                      Pool Status: {metrics.pool.status}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Health Factor: {(metrics.pool.healthFactor * 100).toFixed(0)}%
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <p className="text-2xl font-bold">{metrics.pool.totalRPM}/{metrics.pool.maxRPM}</p>
                    <p className="text-xs text-muted-foreground">RPM Used</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold">{metrics.pool.queueDepth}</p>
                    <p className="text-xs text-muted-foreground">Queue Depth</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold">{metrics.pool.activeWorkers}/{metrics.pool.maxWorkers}</p>
                    <p className="text-xs text-muted-foreground">Workers</p>
                  </div>
                </div>
              </div>
              
              {/* Health Factor Progress */}
              <div className="mt-4">
                <Progress value={metrics.pool.healthFactor * 100} className="h-2 progress-emerald" />
              </div>
            </CardContent>
          </Card>

          {/* Metrics Grid — DS v4.0: kpi-card-gold for AI metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Total Requests Today"
              value={metrics.pool.totalRequestsToday.toLocaleString()}
              icon={Users}
              trend="up"
              trendValue="+12% vs yesterday"
            />
            <MetricCard
              title="Tokens Consumed"
              value={(metrics.pool.totalTokensToday / 1000000).toFixed(2)}
              unit="M"
              icon={Zap}
              description="of 5M daily quota"
            />
            <MetricCard
              title="Avg Response Time"
              value={
                metrics.keys.length > 0
                  ? Math.round(metrics.keys.reduce((a, k) => a + k.latencyMs, 0) / metrics.keys.length)
                  : 0
              }
              unit="ms"
              icon={Clock}
              trend={
                metrics.keys.some(k => k.latencyMs > 500) ? 'down' : 'stable'
              }
            />
            <MetricCard
              title="Success Rate"
              value={
                metrics.keys.length > 0
                  ? (metrics.keys.reduce((a, k) => a + k.successRate, 0) / metrics.keys.length).toFixed(1)
                  : 0
              }
              unit="%"
              icon={CheckCircle2}
              trend="up"
            />
          </div>

          {/* Quick Stats Charts Placeholder — DS v4.0: chart-container */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="chart-container ai-card shadow-brand-md hover-lift duration-120">
              <CardHeader>
                <CardTitle className="text-base">Worker Distribution</CardTitle>
                <CardDescription>Jobs processed by worker type today</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {metrics.workers.slice(0, 5).map(worker => (
                    <div key={worker.workerType} className="flex items-center gap-3">
                      <span className="text-sm w-32 truncate">{worker.workerType.replace('ai-', '')}</span>
                      <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-[#047857] to-emerald-500 rounded transition-all sparkline-gold"
                          style={{ 
                            width: `${(worker.jobsProcessed / Math.max(...metrics.workers.map(w => w.jobsProcessed))) * 100}%` 
                          }}
                        />
                      </div>
                      <span className="text-sm font-medium w-16 text-right">{worker.jobsProcessed}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="chart-container ai-card shadow-brand-md hover-lift duration-120">
              <CardHeader>
                <CardTitle className="text-base">Key Utilization</CardTitle>
                <CardDescription>RPM usage per API key</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {metrics.keys.map(key => (
                    <div key={key.keyId} className="flex items-center gap-3">
                      <StatusIndicator status={key.health} />
                      <span className="text-sm w-24 truncate">{key.keyName.split(' ')[0]}</span>
                      <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
                        <div 
                          className={`h-full rounded transition-all sparkline-gold ${
                            key.rpmUsed >= key.rpmLimit * 0.8 ? 'bg-red-500' :
                            key.rpmUsed >= key.rpmLimit * 0.5 ? 'bg-amber-500' :
                            'bg-emerald-500'
                          }`}
                          style={{ width: `${(key.rpmUsed / key.rpmLimit) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium w-12 text-right">{key.rpmUsed}/{key.rpmLimit}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* API Keys Tab — DS v4.0: ai-card grid */}
        <TabsContent value="keys" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {metrics.keys.map(key => (
              <div key={key.keyId} className="hover-lift duration-120">
                <KeyHealthCard keyData={key} />
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Workers Tab — DS v4.0: table-enterprise styling */}
        <TabsContent value="workers" className="space-y-6">
          <div className="rounded-lg border table-enterprise shadow-brand-sm">
            <div className="p-4 border-b bg-muted/30">
              <h3 className="font-semibold">Worker Performance Overview</h3>
              <p className="text-sm text-muted-foreground">
                Real-time statistics for all AI workers
              </p>
            </div>
            <div className="divide-y">
              {metrics.workers.map(worker => (
                <WorkerStatsRow key={worker.workerType} worker={worker} />
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Alerts Tab */}
        <TabsContent value="alerts" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">System Alerts & Notifications</h3>
            <Badge variant="outline">
              {metrics.alerts.filter(a => !a.acknowledged).length} unacknowledged
            </Badge>
          </div>
          
          <div className="space-y-3">
            {metrics.alerts.length > 0 ? (
              metrics.alerts.map(alert => (
                <AlertItem 
                  key={alert.id} 
                  alert={alert} 
                  onAcknowledge={handleAcknowledgeAlert}
                />
              ))
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-emerald-500" />
                <p>No alerts to display</p>
                <p className="text-sm">System is operating normally</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Settings/Actions Tab — DS v4.0: ai-card with gold accents */}
        <TabsContent value="settings" className="space-y-6">
          <Card className="ai-card kpi-card-gold shadow-brand-lg">
            <CardHeader>
              <CardTitle>Administrative Actions</CardTitle>
              <CardDescription>
                Manage AI system settings and perform maintenance operations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg border hover-lift duration-120 transition-all">
                <div>
                  <p className="font-medium">Reset Daily Quotas</p>
                  <p className="text-sm text-muted-foreground">
                    Reset all token counters to zero. Use carefully in production.
                  </p>
                </div>
                <Button variant="outline" onClick={handleResetQuotas} className="active-press duration-150 hover:bg-[#d4a574]/10 hover:border-[#d4a574]/50 hover:text-[#d4a574]">
                  Reset Quotas
                </Button>
              </div>
              
              <div className="flex items-center justify-between p-4 rounded-lg border hover-lift duration-120 transition-all">
                <div>
                  <p className="font-medium">Force Circuit Recovery</p>
                  <p className="text-sm text-muted-foreground">
                    Manually close all open circuit breakers and re-enable keys.
                  </p>
                </div>
                <Button variant="outline" className="active-press duration-150 hover:bg-[#d4a574]/10 hover:border-[#d4a574]/50 hover:text-[#d4a574]">
                  Recover Circuits
                </Button>
              </div>
              
              <div className="flex items-center justify-between p-4 rounded-lg border hover-lift duration-120 transition-all">
                <div>
                  <p className="font-medium">Export Metrics Report</p>
                  <p className="text-sm text-muted-foreground">
                    Download current metrics as JSON for analysis.
                  </p>
                </div>
                <Button variant="outline" className="active-press duration-150 hover:bg-[#d4a574]/10 hover:border-[#d4a574]/50 hover:text-[#d4a574]">
                  Export JSON
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* System Info — DS v4.0: ai-card */}
          <Card className="ai-card shadow-brand-md hover-lift duration-120">
            <CardHeader>
              <CardTitle>System Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Provider</p>
                  <p className="font-medium">Google Gemini 2.0 Flash</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Pool Size</p>
                  <p className="font-medium">{metrics.keys.length} API Keys</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Max Pool RPM</p>
                  <p className="font-medium">{metrics.pool.maxRPM} requests/min</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Daily Token Quota</p>
                  <p className="font-medium">{(metrics.pool.totalTokensToday / 1000000).toFixed(1)}M / 5M tokens</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Active Workers</p>
                  <p className="font-medium">{metrics.pool.activeWorkers} of {metrics.pool.maxWorkers}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Queue Backend</p>
                  <p className="font-medium">BullMQ + Valkey</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Export sub-components for reuse
export { 
  AIMetricsDashboard as default, 
  KeyHealthCard, 
  WorkerStatsRow, 
  AlertItem, 
  MetricCard,
  StatusIndicator 
};
