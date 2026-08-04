/**
 * invoice-brain/telemetry.ts — Telemetry & Metrics Collection
 *
 * ═══════════════════════════════════════════════════════════════
 *  TELEMETRY SYSTEM (Critical for Production Monitoring)
 * ═══════════════════════════════════════════════════════════════
 *
 * METRICS TO COLLECT (User's Requirements):
 * ─────────────────────────────────────────────────────────────
 *
 * 1. PATTERN HIT RATE
 *    - How often do invoices match existing patterns?
 *    - Target: > 90% for known suppliers
 *
 * 2. PATTERN FAIL RATE
 *    - How often does pattern extraction fail verification?
 *    - Target: < 5%
 *
 * 3. FINGERPRINT COLLISIONS
 *    - How often do different invoices get same fingerprint?
 *    - Target: < 0.1%
 *
 * 4. AVERAGE CONFIDENCE
 *    - What's the average confidence score of extractions?
 *    - Target: > 0.85
 *
 * 5. AI COST
 *    - How much are we spending on AI calls?
 *    - Track per-day, per-company, per-model
 *
 * 6. PATTERNS CREATED PER DAY
 *    - How fast is our pattern library growing?
 *    - Indicates learning velocity
 *
 * 7. PATTERNS RETIRED
 *    - How many patterns become obsolete?
 *    - Indicates supplier format changes
 *
 * 8. LEARNING LATENCY
 *    - How long from first seeing a new format to having a reliable pattern?
 *    - Target: < 10 extractions
 *
 * DASHBOARD INTEGRATION:
 * ─────────────────────────────────────────────────────────────
 * This system is designed to feed into:
 * • Real-time monitoring dashboard
 * • Alert system (anomaly detection)
 * • Capacity planning tools
 * • Business intelligence reports
 * ═══════════════════════════════════════════════════════════════
 */

import { logger } from "@/lib/logger";

// ─── Types ───────────────────────────────────────────────────

export interface TelemetryEvent {
  /** Unique event ID */
  id: string;
  
  /** When this event occurred */
  timestamp: string;
  
  /** Event type/category */
  type: TelemetryEventType;
  
  /** Event data */
  data: Record<string, any>;
  
  /** Company slug (for multi-tenant analysis) */
  companySlug?: string;
  
  /** Session/correlation ID for tracing */
  correlationId?: string;
}

export type TelemetryEventType =
  // Extraction events
  | "extraction.started"
  | "extraction.completed"
  | "extraction.failed"
  | "extraction.pattern_hit"
  | "extraction.ai_fallback"
  
  // Pattern events
  | "pattern.created"
  | "pattern.updated"
  | "pattern.retired"
  | "pattern.version_created"
  | "pattern.confidence_changed"
  
  // Drift events
  | "drift.detected"
  | "drift.confirmed"
  | "drift.false_alarm"
  
  // Review events
  | "review.queued"
  | "review.completed"
  | "review.approved"
  | "review.corrected"
  
  // Performance events
  | "performance.slow_extraction"
  | "performance.cache_hit"
  | "performance.cache_miss"
  
  // Error events
  | "error.ai_timeout"
  | "error.ai_rate_limit"
  | "error.pattern_parse_failure"
  | "error.verification_failure";

export interface MetricDefinition {
  /** Metric name (dot-notation) */
  name: string;
  
  /** Display name for dashboards */
  displayName: string;
  
  /** Description of what this measures */
  description: string;
  
  /** Unit of measurement */
  unit: string;
  
  /** Type of metric */
  type: "counter" | "gauge" | "histogram" | "summary";
  
  /** Which dashboard(s) this belongs to */
  dashboards: string[];
}

// ─── Metric Definitions ─────────────────────────────────────

export const METRIC_DEFINITIONS: MetricDefinition[] = [
  // Pattern Performance Metrics
  {
    name: "invoice_brain.pattern.hit_rate",
    displayName: "Pattern Hit Rate",
    description: "Percentage of invoices that matched existing patterns",
    unit: "%",
    type: "gauge",
    dashboards: ["overview", "patterns", "quality"],
  },
  {
    name: "invoice_brain.pattern.fail_rate",
    displayName: "Pattern Fail Rate",
    description: "Percentage of pattern extractions that failed verification",
    unit: "%",
    type: "gauge",
    dashboards: ["overview", "patterns", "quality"],
  },
  {
    name: "invoice_brain.fingerprint.collision_rate",
    displayName: "Fingerprint Collision Rate",
    description: "Rate at which different invoices produce same fingerprint",
    unit: "%",
    type: "gauge",
    dashboards: ["patterns", "quality"],
  },
  
  // Confidence Metrics
  {
    name: "invoice_brain.confidence.average",
    displayName: "Average Confidence Score",
    description: "Mean confidence score across all extractions",
    unit: "",
    type: "gauge",
    dashboards: ["overview", "confidence"],
  },
  {
    name: "invoice_brain.confidence.distribution",
    displayName: "Confidence Distribution",
    description: "Distribution of confidence scores across tiers",
    unit: "",
    type: "summary",
    dashboards: ["confidence"],
  },
  
  // AI Usage & Cost Metrics
  {
    name: "invoice_brain.ai.calls_total",
    displayName: "Total AI Calls",
    description: "Total number of AI API calls made",
    unit: "count",
    type: "counter",
    dashboards: ["ai", "cost"],
  },
  {
    name: "invoice_brain.ai.fallback_rate",
    displayName: "AI Fallback Rate",
    description: "Percentage of extractions requiring AI",
    unit: "%",
    type: "gauge",
    dashboards: ["ai", "overview"],
  },
  {
    name: "invoice_brain.ai.cost_usd",
    displayName: "AI Cost (USD)",
    description: "Estimated cost of AI calls in USD",
    unit: "$",
    type: "counter",
    dashboards: ["cost"],
  },
  {
    name: "invoice_brain.ai.latency.avg",
    displayName: "Average AI Latency",
    description: "Mean response time for AI API calls",
    unit: "ms",
    type: "summary",
    dashboards: ["ai", "performance"],
  },
  
  // Learning Metrics
  {
    name: "invoice_brain.learning.patterns_created",
    displayName: "Patterns Created Today",
    description: "Number of new patterns learned today",
    unit: "count",
    type: "counter",
    dashboards: ["learning", "overview"],
  },
  {
    name: "invoice_brain.learning.patterns_retired",
    displayName: "Patterns Retired Today",
    description: "Number of patterns retired (obsolete) today",
    unit: "count",
    type: "counter",
    dashboards: ["learning"],
  },
  {
    name: "invoice_brain.learning.velocity",
    displayName: "Learning Velocity",
    description: "Average number of extractions before reliable pattern",
    unit: "extractions",
    type: "gauge",
    dashboards: ["learning"],
  },
  
  // Quality Metrics
  {
    name: "invoice_brain.quality.extraction_accuracy",
    displayName: "Extraction Accuracy",
    description: "Percentage of extractions passing all validation",
    unit: "%",
    type: "gauge",
    dashboards: ["quality", "overview"],
  },
  {
    name: "invoice_brain.quality.user_correction_rate",
    displayName: "User Correction Rate",
    description: "Percentage of human-reviewed items that needed correction",
    unit: "%",
    type: "gauge",
    dashboards: ["quality", "review"],
  },
  
  // Performance Metrics
  {
    name: "invoice_brain.performance.extraction_time.p50",
    displayName: "Extraction Time P50",
    description: "Median extraction time",
    unit: "ms",
    type: "summary",
    dashboards: ["performance"],
  },
  {
    name: "invoice_brain.performance.extraction_time.p95",
    displayName: "Extraction Time P95",
    description: "95th percentile extraction time",
    unit: "ms",
    type: "summary",
    dashboards: ["performance"],
  },
  {
    name: "invoice_brain.performance.cache_hit_rate",
    displayName: "Cache Hit Rate",
    description: "Percentage of fingerprint lookups served from cache",
    unit: "%",
    type: "gauge",
    dashboards: ["performance"],
  },
];

// ─── Main Telemetry Collector Class ─────────────────────────

/**
 * Collects, aggregates, and exposes telemetry data.
 */
export class TelemetryCollector {
  private events: TelemetryEvent[] = [];
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number[]> = new Map();
  private histograms: Map<string, number[]> = new Map();
  
  private config: {
    maxEventsInMemory: number;
    retentionPeriodMs: number;
    flushIntervalMs: number;
  };
  
  constructor(config?: Partial<typeof TelemetryCollector.prototype.config>) {
    this.config = {
      maxEventsInMemory: 10000,
      retentionPeriodMs: 24 * 60 * 60 * 1000, // 24 hours
      flushIntervalMs: 60000, // 1 minute
      ...config,
    };
    
    // Start periodic cleanup
    setInterval(() => this.cleanup(), this.config.flushIntervalMs);
  }
  
  /**
   * Record a telemetry event.
   */
  recordEvent(event: Omit<TelemetryEvent, 'id' | 'timestamp'>): void {
    const fullEvent: TelemetryEvent = {
      ...event,
      id: `TEL-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      timestamp: new Date().toISOString(),
    };
    
    this.events.push(fullEvent);
    
    // Update aggregated metrics
    this.updateAggregates(fullEvent);
    
    // Trim if necessary
    if (this.events.length > this.config.maxEventsInMemory) {
      this.events = this.events.slice(-this.config.maxEventsInMemory);
    }
  }
  
  /**
   * Increment a counter metric.
   */
  incrementCounter(name: string, value: number = 1): void {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + value);
  }
  
  /**
   * Record a gauge value.
   */
  recordGauge(name: string, value: number): void {
    if (!this.gauges.has(name)) {
      this.gauges.set(name, []);
    }
    this.gauges.get(name)!.push(value);
    
    // Keep only last 100 values
    const arr = this.gauges.get(name)!;
    if (arr.length > 100) {
      this.gauges.set(name, arr.slice(-100));
    }
  }
  
  /**
   * Record a histogram value.
   */
  recordHistogram(name: string, value: number): void {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, []);
    }
    this.histograms.get(name)!.push(value);
    
    // Keep last 1000 values
    const arr = this.histograms.get(name)!;
    if (arr.length > 1000) {
      this.histograms.set(name, arr.slice(-1000));
    }
  }
  
  /**
   * Get current snapshot of all metrics.
   */
  getMetricsSnapshot(): MetricsSnapshot {
    return {
      timestamp: new Date().toISOString(),
      counters: Object.fromEntries(this.counters),
      gauges: this.computeGaugeStats(),
      histograms: this.computeHistogramStats(),
      events: {
        totalRecorded: this.events.length,
        recentByType: this.getRecentEventsByType(10),
      },
    };
  }
  
  /**
   * Get dashboard-specific metrics.
   */
  getDashboardData(dashboard: string): DashboardData {
    const relevantMetrics = METRIC_DEFINITIONS.filter(m => 
      m.dashboards.includes(dashboard)
    );
    
    return {
      dashboard,
      metrics: relevantMetrics.map(m => ({
        ...m,
        value: this.getMetricValue(m.name),
      })),
      generatedAt: new Date().toISOString(),
    };
  }
  
  /**
   * Get health check status.
   */
  getHealthStatus(): HealthStatus {
    const now = Date.now();
    const recentErrors = this.events.filter(e => 
      e.type.startsWith("error.") && 
      new Date(e.timestamp).getTime() > now - 5 * 60 * 1000 // Last 5 minutes
    );
    
    const avgConfidence = this.getGaugeValue("invoice_brain.confidence.average");
    const aiFallbackRate = this.getGaugeValue("invoice_brain.ai.fallback_rate");
    
    let status: "healthy" | "degraded" | "unhealthy" = "healthy";
    const issues: string[] = [];
    
    if (recentErrors.length > 10) {
      status = "unhealthy";
      issues.push(`High error rate: ${recentErrors.length} errors in last 5 minutes`);
    } else if (recentErrors.length > 3) {
      status = "degraded";
      issues.push(`Elevated error rate: ${recentErrors.length} errors in last 5 minutes`);
    }
    
    if (avgConfidence !== null && avgConfidence < 0.7) {
      status = status === "healthy" ? "degraded" : status;
      issues.push(`Low average confidence: ${avgConfidence}`);
    }
    
    if (aiFallbackRate !== null && aiFallbackRate > 0.3) {
      status = status === "healthy" ? "degraded" : status;
      issues.push(`High AI fallback rate: ${(aiFallbackRate * 100).toFixed(1)}%`);
    }
    
    return {
      status,
      issues,
      checks: {
        errorRate: recentErrors.length <= 3 ? "pass" : recentErrors.length <= 10 ? "warn" : "fail",
        confidence: avgConfidence === null ? "unknown" : avgConfidence >= 0.7 ? "pass" : "warn",
        aiFallback: aiFallbackRate === null ? "unknown" : aiFallbackRate <= 0.2 ? "pass" : "warn",
      },
      timestamp: new Date().toISOString(),
    };
  }
  
  // ─── Private Methods ─────────────────────────────────────
  
  private updateAggregates(event: TelemetryEvent): void {
    // Update counters based on event type
    switch (event.type) {
      case "extraction.pattern_hit":
        this.incrementCounter("invoice_brain.pattern.hits");
        break;
        
      case "extraction.ai_fallback":
        this.incrementCounter("invoice_brain.ai.calls_total");
        break;
        
      case "pattern.created":
        this.incrementCounter("invoice_brain.learning.patterns_created");
        break;
        
      case "pattern.retired":
        this.incrementCounter("invoice_brain.learning.patterns_retired");
        break;
        
      case "error.ai_timeout":
      case "error.ai_rate_limit":
        this.incrementCounter("invoice_brain.errors.total");
        break;
      
      case "review.corrected":
        this.incrementCounter("invoice_brain.quality.corrections");
        break;
    }
    
    // Extract numeric data for gauges/histograms
    if (event.data.confidence !== undefined) {
      this.recordGauge("invoice_brain.confidence.average", event.data.confidence);
    }
    
    if (event.data.durationMs !== undefined) {
      this.recordHistogram("invoice_brain.performance.extraction_time", event.data.durationMs);
    }
    
    if (event.data.costUsd !== undefined) {
      this.incrementCounter("invoice_brain.ai.cost_usd", event.data.costUsd);
    }
  }
  
  private computeGaugeStats(): Record<string, { current: number; min: number; max: number; avg: number }> {
    const stats: Record<string, { current: number; min: number; max: number; avg: number }> = {};
    
    for (const [name, values] of this.gauges.entries()) {
      if (values.length === 0) continue;
      
      const current = values[values.length - 1];
      const min = Math.min(...values);
      const max = Math.max(...values);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      
      stats[name] = { current, min, max, avg };
    }
    
    return stats;
  }
  
  private computeHistogramStats(): Record<string, { count: number; p50: number; p95: number; p99: number; avg: number }> {
    const stats: Record<string, any> = {};
    
    for (const [name, values] of this.histograms.entries()) {
      if (values.length === 0) continue;
      
      const sorted = [...values].sort((a, b) => a - b);
      const count = sorted.length;
      const avg = sorted.reduce((a, b) => a + b, 0) / count;
      
      const p50 = sorted[Math.floor(count * 0.5)] || 0;
      const p95 = sorted[Math.floor(count * 0.95)] || 0;
      const p99 = sorted[Math.floor(count * 0.99)] || 0;
      
      stats[name] = { count, p50, p95, p99, avg };
    }
    
    return stats;
  }
  
  private getRecentEventsByType(limit: number): Record<string, number> {
    const byType: Record<string, number> = {};
    
    const recentEvents = this.events.slice(-1000); // Last 1000 events
    
    for (const event of recentEvents) {
      byType[event.type] = (byType[event.type] || 0) + 1;
    }
    
    return byType;
  }
  
  private getMetricValue(name: string): number | null {
    // Check gauge first
    const gaugeStats = this.computeGaugeStats();
    if (gaugeStats[name]) {
      return gaugeStats[name].current;
    }
    
    // Check counter
    const counterValue = this.counters.get(name);
    if (counterValue !== undefined) {
      return counterValue;
    }
    
    // Check histogram
    const histStats = this.computeHistogramStats();
    if (histStats[name]) {
      return histStats[name].avg;
    }
    
    return null;
  }
  
  private getGaugeValue(name: string): number | null {
    const gaugeStats = this.computeGaugeStats();
    return gaugeStats[name]?.current ?? null;
  }
  
  private cleanup(): void {
    const cutoff = Date.now() - this.config.retentionPeriodMs;
    
    // Remove old events
    this.events = this.events.filter(e => 
      new Date(e.timestamp).getTime() > cutoff
    );
  }
}

// ─── Type Exports ──────────────────────────────────────────

export interface MetricsSnapshot {
  timestamp: string;
  counters: Record<string, number>;
  gauges: Record<string, { current: number; min: number; max: number; avg: number }>;
  histograms: Record<string, { count: number; p50: number; p95: number; p99: number; avg: number }>;
  events: {
    totalRecorded: number;
    recentByType: Record<string, number>;
  };
}

export interface DashboardData {
  dashboard: string;
  metrics: Array<MetricDefinition & { value: number | null }>;
  generatedAt: string;
}

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  issues: string[];
  checks: Record<string, "pass" | "warn" | "fail" | "unknown">;
  timestamp: string;
}

// ─── Global Singleton ───────────────────────────────────────

let globalTelemetry: TelemetryCollector | null = null;

/**
 * Get global telemetry collector instance.
 */
export function getTelemetryCollector(): TelemetryCollector {
  if (!globalTelemetry) {
    globalTelemetry = new TelemetryCollector();
  }
  return globalTelemetry;
}

// ─── Convenience Functions ─────────────────────────────────

/**
 * Quick way to record an extraction event with all relevant data.
 */
export function recordExtraction(data: {
  success: boolean;
  source: "pattern" | "ai";
  confidence: number;
  durationMs: number;
  fingerprint: string;
  companySlug?: string;
  usedAi?: boolean;
  aiCost?: number;
}): void {
  const telemetry = getTelemetryCollector();
  
  telemetry.recordEvent({
    type: data.success ? "extraction.completed" : "extraction.failed",
    data: {
      source: data.source,
      confidence: data.confidence,
      durationMs: data.durationMs,
      fingerprint: data.fingerprint,
      usedAi: data.usedAi,
      costUsd: data.aiCost,
    },
    companySlug: data.companySlug,
  });
  
  if (data.source === "pattern") {
    telemetry.recordEvent({
      type: "extraction.pattern_hit",
      data: { confidence: data.confidence },
      companySlug: data.companySlug,
    });
  } else if (data.source === "ai") {
    telemetry.recordEvent({
      type: "extraction.ai_fallback",
      data: { confidence: data.confidence, costUsd: data.aiCost },
      companySlug: data.companySlug,
    });
  }
}
