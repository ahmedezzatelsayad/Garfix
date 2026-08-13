/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX AI - Advanced Load Balancer with Enterprise Features
 * 
 * تحسينات متقدمة على نظام توزيع الحمل:
 * - ✅ Health Check لكل مفتاح (كل 30 ثانية)
 * - ✅ Quota Tracking (استهلاك يومي لكل مفتاح)
 * - ✅ Weighted Load Balancing (حسب السعة المتبقية)
 * - ✅ Automatic Failover (انتقال فوري عند الفشل)
 * - ✅ Circuit Breaker (عزل المفاتيح المتعطلة)
 * - ✅ Metrics Dashboard (بيانات لحظية)
 * 
 * ═════════════════════════════════════════════════════════════
 */

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { AIProviderConfig, KeyPoolStatus } from './types';
import { logger } from "@/lib/logger";

// ── Types ───────────────────────────────────────────────────

export interface KeyHealthStatus {
  keyId: string;
  keyName: string;
  
  // Health
  isHealthy: boolean;
  lastCheckTime: Date;
  consecutiveFailures: number;
  lastError?: string;
  lastSuccessTime?: Date;
  
  // Quota
  requestsToday: number;
  tokensToday: number;
  maxTokensPerDay: number; // 1M for free tier
  
  // Rate Limiting
  rpmCurrent: number;
  rpmLimit: number;
  rpmWindowStart: Date;
  rpmWindowRequests: number[];
  
  // Performance
  avgLatencyMs: number;
  totalRequests: number;
  successRate: number;
  
  // Circuit Breaker
  circuitState: 'closed' | 'open' | 'half-open';
  circuitOpenUntil?: Date;
}

export interface PoolMetrics {
  timestamp: Date;
  
  // Pool Level
  totalRPM: number;
  availableRPM: number;
  utilizationPct: number;
  
  // Keys Status
  healthyKeys: number;
  totalKeys: number;
  
  // Today's Usage
  totalRequestsToday: number;
  totalTokensToday: number;
  
  // Queue
  pendingJobs: number;
  estimatedWaitTimeMs: number;
  
  // Per-Key Details
  keys: KeyHealthStatus[];
}

export type BalancingStrategy = 
  | 'round-robin'       // دوري بسيط
  | 'weighted'          // مرجح بالسعة المتبقية ⭐
  | 'least-connections' // أقل استخدام
  | 'least-latency'     // أقل تأخير
  | 'priority';         // حسب الأولوية

// ── Constants ────────────────────────────────────────────────

// AI-15 FIX (Audit v2 · Phase 4): Per the audit, the previous 30s interval
// combined with the lack of failure-driven auto-unhealthy marking meant
// unhealthy keys weren't detected fast enough — they continued receiving
// traffic until the next 30s tick. We split the two concerns:
//
//   1. HEALTH_CHECK_INTERVAL: periodic ping interval set to 60s. This is the
//      "is the key alive?" probe — runs regardless of traffic. Lower values
//      waste API quota (each ping costs 1 token); higher values mean slower
//      recovery detection. 60s is the spec'd target.
//
//   2. UNHEALTHY_FAILURE_THRESHOLD: 2 consecutive request failures mark a
//      key unhealthy IMMEDIATELY (no waiting for the next periodic tick).
//      The previous value was 3, which let two failed requests slip through
//      before the key was quarantined. Now: failure #2 → instant
//      quarantine + alert.
//
//   3. addHealthAlert() / emitHealthAlert(): new alert hook — every time a
//      key is auto-marked unhealthy, an alert event is emitted so
//      monitoring/alert-manager.ts can fire a Slack/email/notification.
//
// The auto-mark-unhealthy-on-failure logic lives in recordFailure() below,
// NOT in the periodic timer — failure-driven marking is synchronous.
const HEALTH_CHECK_INTERVAL = 60_000;          // 60s — AI-15 FIX (was 30_000)
const UNHEALTHY_FAILURE_THRESHOLD = 2;          // AI-15 FIX: 2 failures → unhealthy (was 3)
const CIRCUIT_BREAKER_THRESHOLD = 3;            // Failures before opening circuit (full isolation)
const CIRCUIT_RESET_TIMEOUT = 60_000;           // 60s before half-open
const RPM_WINDOW_SIZE = 60;                     // 60 data points for RPM calculation
const MAX_TOKENS_PER_KEY_PER_DAY = 1_000_000;   // Free tier limit

// AI-15 FIX (Audit v2 · Phase 4): alert hook registry.
// Health-alert subscribers (e.g. alert-manager.ts) register a callback that
// fires whenever a key is auto-marked unhealthy. The hook is invoked
// synchronously with the keyId + reason so alerts can be dispatched
// immediately without waiting for the next metrics scrape.
type HealthAlertHandler = (alert: {
  keyId: string;
  keyName?: string;
  reason: "consecutive_failures" | "circuit_opened" | "quota_exhausted";
  consecutiveFailures: number;
  lastError?: string;
  timestamp: Date;
}) => void;

const healthAlertHandlers: Set<HealthAlertHandler> = new Set();

/**
 * Register a handler that fires whenever a provider key is auto-marked
 * unhealthy. Returns an unsubscribe function.
 *
 * AI-15 FIX (Audit v2 · Phase 4): the alert-manager / monitoring system
 * uses this to push Slack/email notifications when a key goes down.
 */
export function onProviderHealthAlert(handler: HealthAlertHandler): () => void {
  healthAlertHandlers.add(handler);
  return () => healthAlertHandlers.delete(handler);
}

/** Internal: dispatch a health alert to all registered handlers. */
function emitHealthAlert(alert: Parameters<HealthAlertHandler>[0]): void {
  if (healthAlertHandlers.size === 0) {
    // No subscribers — still log so it's visible in the operator console.
    logger.warn("[AdvancedLB] HEALTH ALERT (no subscribers)", alert);
    return;
  }
  for (const handler of healthAlertHandlers) {
    try {
      handler(alert);
    } catch (err) {
      // Don't let a faulty handler break the alert dispatch loop.
      logger.error("[AdvancedLB] health alert handler threw", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// ── Advanced Load Balancer Class ─────────────────────────────

export class AdvancedGeminiLoadBalancer {
  private keys: Map<string, AIProviderConfig & {
    genAI: GoogleGenerativeAI;
    health: KeyHealthStatus;
    weight: number;
  }> = new Map();
  
  private currentIndex = 0;
  private strategy: BalancingStrategy = 'weighted';
  private healthCheckTimer?: ReturnType<typeof setInterval>;
  
  // Callbacks for metrics/alerting
  private onKeyFailure?: (keyId: string, error: string) => void;
  private onKeyRecovery?: (keyId: string) => void;
  private onPoolDegraded?: (metrics: PoolMetrics) => void;

  constructor(config?: {
    strategy?: BalancingStrategy;
    onKeyFailure?: (keyId: string, error: string) => void;
    onKeyRecovery?: (keyId: string) => void;
    onPoolDegraded?: (metrics: PoolMetrics) => void;
  }) {
    this.strategy = config?.strategy || 'weighted';
    this.onKeyFailure = config?.onKeyFailure;
    this.onKeyRecovery = config?.onKeyRecovery;
    this.onPoolDegraded = config?.onPoolDegraded;
  }

  /**
   * Add a new API key with full monitoring
   */
  addKey(config: AIProviderConfig & { name?: string }): void {
    const genAI = new GoogleGenerativeAI(config.apiKey);
    
    const health: KeyHealthStatus = {
      keyId: config.id,
      keyName: config.name || config.id,
      isHealthy: true,
      lastCheckTime: new Date(),
      consecutiveFailures: 0,
      requestsToday: 0,
      tokensToday: 0,
      maxTokensPerDay: MAX_TOKENS_PER_KEY_PER_DAY,
      rpmCurrent: 0,
      rpmLimit: config.maxRpm || 15,
      rpmWindowStart: new Date(),
      rpmWindowRequests: [],
      avgLatencyMs: 0,
      totalRequests: 0,
      successRate: 100,
      circuitState: 'closed',
    };

    // Calculate initial weight based on RPM limit
    const weight = config.maxRpm || 15;

    this.keys.set(config.id, {
      ...config,
      genAI,
      health,
      weight,
    });

    logger.info("[AdvancedLB] Key added", { keyId: config.id, name: config.name, weight });
  }

  /**
   * Get the best available key using selected strategy
   */
  async getNextKey(): Promise<AIProviderConfig | null> {
    const healthyKeys = this.getHealthyKeys();
    
    if (healthyKeys.length === 0) {
      logger.error("[AdvancedLB] No healthy keys available");
      return null;
    }

    let selected: AIProviderConfig;

    switch (this.strategy) {
      case 'weighted':
        selected = this.selectWeighted(healthyKeys);
        break;
      
      case 'least-connections':
        selected = this.selectLeastConnections(healthyKeys);
        break;
      
      case 'least-latency':
        selected = this.selectLeastLatency(healthyKeys);
        break;
      
      case 'priority':
        selected = this.selectByPriority(healthyKeys);
        break;
      
      case 'round-robin':
      default:
        selected = this.selectRoundRobin(healthyKeys);
        break;
    }

    return selected;
  }

  /**
   * Record a successful API call
   */
  recordSuccess(keyId: string, tokens: number, latencyMs: number): void {
    const keyData = this.keys.get(keyId);
    if (!keyData) return;

    const { health } = keyData;

    // Update health
    health.isHealthy = true;
    health.consecutiveFailures = 0;
    health.lastSuccessTime = new Date();
    health.lastCheckTime = new Date();

    // Update quota
    health.requestsToday++;
    health.tokensToday += tokens;

    // Update RPM window
    this.updateRPMWindow(health);

    // Update performance
    const alpha = 0.3; // Smoothing factor for exponential moving average
    health.avgLatencyMs = Math.round(
      alpha * latencyMs + (1 - alpha) * (health.avgLatencyMs || latencyMs)
    );
    health.totalRequests++;
    
    // Recalculate success rate
    const totalAttempts = health.totalRequests + health.consecutiveFailures;
    health.successRate = Math.round((health.totalRequests / totalAttempts) * 100);

    // Check if circuit was open and should close
    if (health.circuitState === 'half-open') {
      health.circuitState = 'closed';
      this.onKeyRecovery?.(keyId);
      logger.info("[AdvancedLB] Key recovered", { keyId });
    }
  }

  /**
   * Record a failed API call with automatic failover
   *
   * Returns a Promise that resolves to an alternative healthy key (or null if
   * none are available) so callers can `await` the failover target. The
   * underlying `getNextKey` is async because the health-check / selection
   * strategy may need to await I/O.
   *
   * AI-15 FIX (Audit v2 · Phase 4): auto-marks the key unhealthy (sets
   * `health.isHealthy = false`) at UNHEALTHY_FAILURE_THRESHOLD (2)
   * consecutive failures — DOWN from the previous behavior which only
   * quarantined the key when CIRCUIT_BREAKER_THRESHOLD (3) was reached.
   * This means a flaky key is removed from the active rotation on the
   * 2nd failure, not the 3rd. An alert is also emitted via
   * emitHealthAlert() so subscribers (alert-manager / Slack / email) get
   * notified without waiting for the next 60s periodic health-check tick.
   */
  async recordFailure(keyId: string, error: string): Promise<AIProviderConfig | null> {
    const keyData = this.keys.get(keyId);
    if (!keyData) return null;

    const { health } = keyData;

    // Update failure tracking
    health.consecutiveFailures++;
    health.lastError = error;
    health.lastCheckTime = new Date();

    // Recalculate success rate
    health.successRate = Math.round(
      (health.totalRequests / (health.totalRequests + health.consecutiveFailures)) * 100
    );

    // AI-15 FIX (Audit v2 · Phase 4): auto-mark unhealthy at LOWER threshold
    // (2 consecutive failures) — do NOT wait for the circuit breaker (3).
    // This removes the key from the active rotation immediately so it stops
    // receiving traffic while still being polled by the periodic health
    // check for recovery.
    if (health.consecutiveFailures >= UNHEALTHY_FAILURE_THRESHOLD && health.isHealthy) {
      health.isHealthy = false;
      const alertPayload = {
        keyId,
        keyName: keyData.name,
        reason: "consecutive_failures" as const,
        consecutiveFailures: health.consecutiveFailures,
        lastError: error,
        timestamp: new Date(),
      };
      logger.warn("[AdvancedLB] Key auto-marked unhealthy (AI-15)", alertPayload);
      emitHealthAlert(alertPayload);
      this.onKeyFailure?.(keyId, error);
    }

    // Check circuit breaker — full isolation + half-open recovery
    if (health.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
      this.openCircuit(keyId);
      // AI-15 FIX: alert subscribers that the circuit opened (harder failure)
      emitHealthAlert({
        keyId,
        keyName: keyData.name,
        reason: "circuit_opened",
        consecutiveFailures: health.consecutiveFailures,
        lastError: error,
        timestamp: new Date(),
      });
    }

    // Alert callback (always — even if not yet unhealthy, this is a real failure)
    if (health.consecutiveFailures < UNHEALTHY_FAILURE_THRESHOLD) {
      this.onKeyFailure?.(keyId, error);
    }

    // Automatic failover - get next healthy key
    logger.warn("[AdvancedLB] Key failed", { keyId, consecutiveFailures: health.consecutiveFailures });
    
    return this.getNextKey(); // Return alternative key
  }

  /**
   * Get comprehensive pool metrics
   */
  getMetrics(): PoolMetrics {
    const now = new Date();
    const allKeys = Array.from(this.keys.values());
    const healthyKeys = allKeys.filter(k => k.health.isHealthy);
    
    // Calculate pool-level RPM
    let totalRPM = 0;
    let availableRPM = 0;
    
    for (const key of allKeys) {
      if (key.health.isHealthy) {
        totalRPM += this.calculateCurrentRPM(key.health);
        availableRPM += (key.health.rpmLimit - this.calculateCurrentRPM(key.health));
      }
    }

    const maxRPM = allKeys.reduce((sum, k) => sum + k.health.rpmLimit, 0);

    return {
      timestamp: now,
      totalRPM: Math.min(totalRPM, maxRPM),
      availableRPM: Math.max(0, availableRPM),
      utilizationPct: maxRPM > 0 ? Math.round((totalRPM / maxRPM) * 100) : 0,
      healthyKeys: healthyKeys.length,
      totalKeys: allKeys.length,
      totalRequestsToday: allKeys.reduce((sum, k) => sum + k.health.requestsToday, 0),
      totalTokensToday: allKeys.reduce((sum, k) => sum + k.health.tokensToday, 0),
      pendingJobs: 0, // Would come from queue system
      estimatedWaitTimeMs: this.calculateEstimatedWaitTime(allKeys),
      keys: allKeys.map(k => k.health),
    };
  }

  /**
   * Get status of a specific key
   */
  getKeyStatus(keyId: string): KeyHealthStatus | null {
    const keyData = this.keys.get(keyId);
    return keyData ? keyData.health : null;
  }

  /**
   * Start health check interval
   */
  startHealthChecks(): void {
    if (this.healthCheckTimer) return; // Already running

    logger.info("[AdvancedLB] Starting health checks", { intervalMs: HEALTH_CHECK_INTERVAL });

    this.healthCheckTimer = setInterval(async () => {
      await this.runHealthChecks();
    }, HEALTH_CHECK_INTERVAL);

    // Run immediately on start
    this.runHealthChecks();
  }

  /**
   * Stop health check interval
   */
  stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
      logger.info("[AdvancedLB] Health checks stopped");
    }
  }

  /**
   * Reset daily quotas (call at midnight)
   */
  resetDailyQuotas(): void {
    for (const [, keyData] of this.keys) {
      keyData.health.requestsToday = 0;
      keyData.health.tokensToday = 0;
    }
    logger.info("[AdvancedLB] Daily quotas reset");
  }

  // ── Private Methods ──────────────────────────────────────

  private getHealthyKeys(): Array<AIProviderConfig & { health: KeyHealthStatus; weight: number }> {
    return Array.from(this.keys.values()).filter(k => 
      k.health.isHealthy && k.health.circuitState !== 'open'
    );
  }

  private selectRoundRobin(keys: Array<AIProviderConfig & { weight: number }>): AIProviderConfig {
    const selected = keys[this.currentIndex % keys.length];
    this.currentIndex++;
    return selected;
  }

  private selectWeighted(keys: Array<AIProviderConfig & { health: KeyHealthStatus; weight: number }>): AIProviderConfig {
    // Calculate weights based on remaining capacity
    const weightedKeys = keys.map(k => {
      const remainingCapacity = k.health.rpmLimit - this.calculateCurrentRPM(k.health);
      const quotaRemaining = k.health.maxTokensPerDay - k.health.tokensToday;
      
      // Combined score: RPM capacity + token quota
      const score = (remainingCapacity / k.health.rpmLimit) * 0.7 + 
                    (quotaRemaining / k.health.maxTokensPerDay) * 0.3;
      
      return { key: k, weight: Math.max(0.1, score) }; // Minimum weight to prevent division by zero
    });

    // Normalize weights
    const totalWeight = weightedKeys.reduce((sum, wk) => sum + wk.weight, 0);
    const normalized = weightedKeys.map(wk => ({
      key: wk.key,
      normalizedWeight: wk.weight / totalWeight,
    }));

    // Random selection based on weights
    let random = Math.random();
    for (const { key, normalizedWeight } of normalized) {
      random -= normalizedWeight;
      if (random <= 0) return key;
    }

    // Fallback to first key
    return keys[0];
  }

  private selectLeastConnections(keys: Array<AIProviderConfig & { health: KeyHealthStatus }>): AIProviderConfig {
    return keys.reduce((min, k) => 
      this.calculateCurrentRPM(k.health) < this.calculateCurrentRPM(min.health) ? k : min
    , keys[0]);
  }

  private selectLeastLatency(keys: Array<AIProviderConfig & { health: KeyHealthStatus }>): AIProviderConfig {
    return keys.reduce((min, k) => 
      (k.health.avgLatencyMs || Infinity) < (min.health.avgLatencyMs || Infinity) ? k : min
    , keys[0]);
  }

  private selectByPriority(keys: Array<AIProviderConfig & { priority: number }>): AIProviderConfig {
    return keys.sort((a, b) => a.priority - b.priority)[0];
  }

  private updateRPMWindow(health: KeyHealthStatus): void {
    const now = Date.now();
    const windowStart = now - 60_000; // 1 minute ago
    
    // Remove old entries
    health.rpmWindowRequests = health.rpmWindowRequests.filter(t => t > windowStart);
    
    // Add current request
    health.rpmWindowRequests.push(now);
    
    // Update current RPM
    health.rpmCurrent = health.rpmWindowRequests.length;
  }

  private calculateCurrentRPM(health: KeyHealthStatus): number {
    const now = Date.now();
    const windowStart = now - 60_000;
    return health.rpmWindowRequests.filter(t => t > windowStart).length;
  }

  private openCircuit(keyId: string): void {
    const keyData = this.keys.get(keyId);
    if (!keyData) return;

    keyData.health.circuitState = 'open';
    keyData.health.circuitOpenUntil = new Date(Date.now() + CIRCUIT_RESET_TIMEOUT);
    keyData.health.isHealthy = false;

    logger.error("[AdvancedLB] Circuit OPENED", { keyId });

    // Schedule half-open state
    setTimeout(() => {
      this.tryHalfOpen(keyId);
    }, CIRCUIT_RESET_TIMEOUT);

    // Check if pool is degraded
    const metrics = this.getMetrics();
    if (metrics.healthyKeys < metrics.totalKeys * 0.5) {
      this.onPoolDegraded?.(metrics);
    }
  }

  private tryHalfOpen(keyId: string): void {
    const keyData = this.keys.get(keyId);
    if (!keyData || keyData.health.circuitState !== 'open') return;

    logger.info("[AdvancedLB] Circuit HALF-OPEN", { keyId });
    keyData.health.circuitState = 'half-open';
    keyData.health.isHealthy = true; // Allow limited traffic
  }

  private calculateEstimatedWaitTime(keys: Array<{ health: KeyHealthStatus }>): number {
    const avgRPM = keys.reduce((sum, k) => sum + this.calculateCurrentRPM(k.health), 0) / keys.length;
    if (avgRPM === 0) return 0;
    
    // Rough estimate: if at 80% capacity, wait time increases
    const utilization = avgRPM / (keys[0]?.health.rpmLimit || 15);
    if (utilization < 0.8) return 0;
    
    return Math.round((utilization - 0.8) * 10_000); // Scales up as utilization increases
  }

  private async runHealthChecks(): Promise<void> {
    logger.info("[AdvancedLB] Running health checks", { keyCount: this.keys.size });

    for (const [keyId, keyData] of this.keys) {
      await this.checkSingleKeyHealth(keyId, keyData);
    }

    // Log summary
    const metrics = this.getMetrics();
    logger.info("[AdvancedLB] Health check complete", { healthyKeys: metrics.healthyKeys, totalKeys: metrics.totalKeys, utilizationPct: metrics.utilizationPct });
  }

  private async checkSingleKeyHealth(keyId: string, keyData: AIProviderConfig & { genAI: GoogleGenerativeAI; health: KeyHealthStatus }): Promise<void> {
    // Skip if circuit is open and not yet half-open time
    if (keyData.health.circuitState === 'open') {
      if (keyData.health.circuitOpenUntil && new Date() < keyData.health.circuitOpenUntil) {
        return; // Still in cooldown
      }
    }

    try {
      // Simple health check - minimal API call
      const model = keyData.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
        generationConfig: { maxOutputTokens: 1 },
      });

      // Success - ensure healthy
      if (!keyData.health.isHealthy) {
        logger.info("[AdvancedLB] Key recovered", { keyId });
        this.onKeyRecovery?.(keyId);
      }
      
      keyData.health.isHealthy = true;
      keyData.health.lastCheckTime = new Date();
      keyData.health.lastSuccessTime = new Date();
      
      // Reset failures if in half-open
      if (keyData.health.circuitState === 'half-open') {
        keyData.health.consecutiveFailures = 0;
        keyData.health.circuitState = 'closed';
      }

    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.warn("[AdvancedLB] Health check failed", { keyId, err: error });

      keyData.health.lastError = error;
      keyData.health.lastCheckTime = new Date();
      keyData.health.consecutiveFailures++;

      // AI-15 FIX (Audit v2 · Phase 4): auto-mark unhealthy after
      // UNHEALTHY_FAILURE_THRESHOLD (2) consecutive failures — DON'T wait
      // for the circuit-breaker threshold (3) to trip. This way, a flaky
      // key is removed from the active rotation immediately on the 2nd
      // failure, while the circuit breaker (which fully isolates + enters
      // half-open recovery) still trips at 3 for the harder-failure case.
      if (keyData.health.consecutiveFailures >= UNHEALTHY_FAILURE_THRESHOLD
          && keyData.health.isHealthy) {
        keyData.health.isHealthy = false;
        const alertPayload = {
          keyId,
          keyName: keyData.name,
          reason: "consecutive_failures" as const,
          consecutiveFailures: keyData.health.consecutiveFailures,
          lastError: error,
          timestamp: new Date(),
        };
        logger.warn("[AdvancedLB] Key auto-marked unhealthy (AI-15)", alertPayload);
        emitHealthAlert(alertPayload);
        this.onKeyFailure?.(keyId, error);
      }

      // Open circuit if threshold reached (full isolation + half-open recovery)
      if (keyData.health.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
        this.openCircuit(keyId);
        // AI-15 FIX: also emit an alert for the circuit-opened event.
        emitHealthAlert({
          keyId,
          keyName: keyData.name,
          reason: "circuit_opened",
          consecutiveFailures: keyData.health.consecutiveFailures,
          lastError: error,
          timestamp: new Date(),
        });
      }
    }
  }
}

// ── Singleton Instance ─────────────────────────────────────

let advancedLoadBalancer: AdvancedGeminiLoadBalancer | null = null;

export function getAdvancedLoadBalancer(): AdvancedGeminiLoadBalancer {
  if (!advancedLoadBalancer) {
    advancedLoadBalancer = new AdvancedGeminiLoadBalancer({
      strategy: 'weighted',
      onKeyFailure: (keyId, error) => {
        logger.error("[AdvancedLB] ALERT: Key failed", { keyId, err: error });
        // Could send to alerting system, Slack, etc.
      },
      onKeyRecovery: (keyId) => {
        logger.info("[AdvancedLB] Key recovered", { keyId });
      },
      onPoolDegraded: (metrics) => {
        logger.warn("[AdvancedLB] POOL DEGRADED", { healthyKeys: metrics.healthyKeys, totalKeys: metrics.totalKeys });
        // Could trigger auto-scale-up or alert admin
      },
    });
  }
  return advancedLoadBalancer;
}

export function initAdvancedLoadBalancer(keys: Array<{
  id: string;
  apiKey: string;
  name?: string;
  maxRpm?: number;
}>): AdvancedGeminiLoadBalancer {
  const lb = getAdvancedLoadBalancer();
  
  for (const key of keys) {
    lb.addKey({
      id: key.id,
      type: 'gemini',
      name: key.name || key.id,
      apiKey: key.apiKey,
      model: 'gemini-2.0-flash',
      maxRpm: key.maxRpm || 15,
      maxTokens: 8192,
      priority: 1,
      enabled: true,
    });
  }

  // Start health checks
  lb.startHealthChecks();

  logger.info("[AdvancedLB] Initialized", { keyCount: keys.length });
  
  return lb;
}
