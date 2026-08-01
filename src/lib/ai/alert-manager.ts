/**
 * GarfiX EOS - Enterprise AI Alerting System
 * 
 * Comprehensive alerting and notification system for AI infrastructure monitoring.
 * Supports multiple channels, severity levels, aggregation, and escalation.
 * 
 * Features:
 * - Threshold-based alert generation
 * - Multi-channel notifications (In-App, Email, Webhook, Slack)
 * - Alert aggregation and deduplication
 * - Severity-based routing and escalation
 * - Acknowledgment and resolution tracking
 * - Rate limiting to prevent alert storms
 */

import { EventEmitter } from 'events';

// ============== Types & Interfaces ==============

export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';
export type AlertStatus = 'active' | 'acknowledged' | 'resolved' | 'suppressed';
export type NotificationChannel = 'in-app' | 'email' | 'webhook' | 'slack' | 'all';

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  
  // Condition configuration
  metricPath: string;          // e.g., 'pool.healthFactor', 'keys[0].latencyMs'
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'between' | 'outside';
  threshold: number | number[];
  durationMs?: number;         // How long condition must persist before alerting
  
  // Alert configuration
  severity: AlertSeverity;
  messageTemplate: string;     // Can use {{metric}}, {{threshold}}, {{value}} placeholders
  
  // Routing
  channels: NotificationChannel[];
  cooldownMs: number;          // Minimum time between repeat alerts
  
  // Escalation
  escalateAfterMs?: number;
  escalationSeverity?: AlertSeverity;
}

export interface Alert {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: AlertSeverity;
  status: AlertStatus;
  message: string;
  source: string;
  metricPath: string;
  currentValue: number;
  threshold: number | number[];
  
  // Timestamps
  triggeredAt: Date;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  lastSentAt?: Date;
  
  // Metadata
  acknowledgedBy?: string;
  resolveMessage?: string;
  sendCount: number;
  suppressionReason?: string;
  
  // Context
  context: Record<string, any>;
}

export interface AlertStats {
  totalAlerts: number;
  activeAlerts: number;
  bySeverity: Record<AlertSeverity, number>;
  byStatus: Record<AlertStatus, number>;
  avgResolutionTimeMs: number;
  alertsToday: number;
  alertsThisHour: number;
}

export interface NotificationPayload {
  alert: Alert;
  channel: NotificationChannel;
  recipient?: string;
  template?: string;
}

export interface ChannelConfig {
  enabled: boolean;
  rateLimitPerMinute: number;
  maxRetries: number;
  retryDelayMs: number;
  
  // Email specific
  emailConfig?: {
    smtpHost: string;
    smtpPort: number;
    username: string;
    password: string;
    fromAddress: string;
    adminEmails: string[];
  };
  
  // Webhook/Slack specific
  webhookConfig?: {
    url: string;
    secret?: string;
    method?: 'POST' | 'PUT';
    headers?: Record<string, string>;
  };
}

// ============== Default Alert Rules ==============

const DEFAULT_ALERT_RULES: AlertRule[] = [
  // Pool-level alerts
  {
    id: 'pool-health-critical',
    name: 'Pool Health Critical',
    description: 'Alert when pool health factor drops below 0.3',
    enabled: true,
    metricPath: 'pool.healthFactor',
    operator: 'lt',
    threshold: 0.3,
    durationMs: 30000,
    severity: 'critical',
    messageTemplate: '🚨 CRITICAL: Pool health critically low ({{value}}). System may be unstable.',
    channels: ['in-app', 'email', 'slack'],
    cooldownMs: 60000,
    escalateAfterMs: 300000,
    escalationSeverity: 'critical'
  },
  {
    id: 'pool-health-degraded',
    name: 'Pool Health Degraded',
    description: 'Alert when pool health factor drops below 0.7',
    enabled: true,
    metricPath: 'pool.healthFactor',
    operator: 'lt',
    threshold: 0.7,
    durationMs: 60000,
    severity: 'warning',
    messageTemplate: '⚠️ WARNING: Pool health degraded ({{value}}). Performance may be affected.',
    channels: ['in-app', 'slack'],
    cooldownMs: 300000
  },
  {
    id: 'pool-rpm-high',
    name: 'High RPM Usage',
    description: 'Alert when RPM usage exceeds 80%',
    enabled: true,
    metricPath: 'pool.totalRPM',
    operator: 'gt',
    threshold: 60,
    severity: 'warning',
    messageTemplate: '📊 High RPM usage: {{value}}/{{threshold}} requests/min. Approaching capacity limit.',
    channels: ['in-app'],
    cooldownMs: 120000
  },
  {
    id: 'queue-depth-high',
    name: 'Queue Depth High',
    description: 'Alert when queue depth exceeds HIGH threshold',
    enabled: true,
    metricPath: 'pool.queueDepth',
    operator: 'gt',
    threshold: 150,
    severity: 'warning',
    messageTemplate: '📋 Queue depth elevated: {{value}} jobs waiting. Processing delayed.',
    channels: ['in-app', 'slack'],
    cooldownMs: 180000
  },
  {
    id: 'queue-depth-critical',
    name: 'Queue Depth Critical',
    description: 'Alert when queue depth approaches max',
    enabled: true,
    metricPath: 'pool.queueDepth',
    operator: 'gt',
    threshold: 400,
    severity: 'critical',
    messageTemplate: '🚨 CRITICAL queue depth: {{value}} jobs. Near maximum capacity!',
    channels: ['in-app', 'email', 'slack', 'webhook'],
    cooldownMs: 60000
  },

  // Key-level alerts
  {
    id: 'key-latency-high',
    name: 'Key Latency High',
    description: 'Alert when any key latency exceeds 500ms',
    enabled: true,
    metricPath: 'keys.*.latencyMs',
    operator: 'gt',
    threshold: 500,
    durationMs: 45000,
    severity: 'warning',
    messageTemplate: '⏱️ High latency on {{source}}: {{value}}ms (> {{threshold}}ms)',
    channels: ['in-app'],
    cooldownMs: 240000
  },
  {
    id: 'key-circuit-open',
    name: 'Circuit Breaker Opened',
    description: 'Alert immediately when a circuit breaker opens',
    enabled: true,
    metricPath: 'keys.*.circuitState',
    operator: 'eq',
    threshold: 'open',
    severity: 'error',
    messageTemplate: '🔌 Circuit breaker OPENED for key: {{source}}. Traffic rerouted.',
    channels: ['in-app', 'email', 'slack'],
    cooldownMs: 0,  // Always alert on circuit open
    escalateAfterMs: 180000
  },
  {
    id: 'key-quota-high',
    name: 'Key Quota Usage High',
    description: 'Alert when key token quota exceeds 80%',
    enabled: true,
    metricPath: 'keys.*.tokenUsagePercent',
    operator: 'gt',
    threshold: 80,
    severity: 'info',
    messageTemplate: '💳 Key {{source}} at {{value}}% daily token quota.',
    channels: ['in-app'],
    cooldownMs: 3600000
  },
  {
    id: 'key-success-rate-low',
    name: 'Key Success Rate Low',
    description: 'Alert when key success rate drops below 95%',
    enabled: true,
    metricPath: 'keys.*.successRate',
    operator: 'lt',
    threshold: 95,
    durationMs: 60000,
    severity: 'error',
    messageTemplate: '❌ Low success rate on {{source}}: {{value}}%. Check for errors.',
    channels: ['in-app', 'slack'],
    cooldownMs: 180000
  },

  // Worker-level alerts
  {
    id: 'worker-error-spike',
    name: 'Worker Error Spike',
    description: 'Alert when worker error rate exceeds 5%',
    enabled: true,
    metricPath: 'workers.*.errorRate',
    operator: 'gt',
    threshold: 5,
    severity: 'warning',
    messageTemplate: '⚙️ Worker {{source}} error rate elevated: {{value}}%',
    channels: ['in-app'],
    cooldownMs: 300000
  },
  {
    id: 'worker-stalled',
    name: 'Worker Stalled',
    description: 'Alert when worker hasn\'t processed jobs in 5 minutes',
    enabled: true,
    metricPath: 'workers.*.idleTimeMs',
    operator: 'gt',
    threshold: 300000,
    severity: 'info',
    messageTemplate: '💤 Worker {{source}} idle for > 5 minutes with queued jobs.',
    channels: ['in-app'],
    cooldownMs: 600000
  }
];

// ============== Helper Functions ==============

function generateId(): string {
  return `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function evaluateCondition(
  currentValue: number,
  operator: AlertRule['operator'],
  threshold: number | number[]
): boolean {
  switch (operator) {
    case 'gt': return currentValue > (threshold as number);
    case 'gte': return currentValue >= (threshold as number);
    case 'lt': return currentValue < (threshold as number);
    case 'lte': return currentValue <= (threshold as number);
    case 'eq': return currentValue === (threshold as number);
    case 'between':
      const [min, max] = threshold as [number, number];
      return currentValue >= min && currentValue <= max;
    case 'outside':
      const [low, high] = threshold as [number, number];
      return currentValue < low || currentValue > high;
    default:
      return false;
  }
}

function getNestedValue(obj: any, path: string): { value: any; source?: string } {
  // Handle wildcard paths like 'keys.*.latencyMs'
  if (path.includes('*')) {
    const [arrayPath, ...rest] = path.split('.*.');
    const array = getNestedValue(obj, arrayPath).value;
    
    if (Array.isArray(array)) {
      // Return first matching value (for simple evaluation)
      // The evaluator should iterate through all items
      return { value: array[0], source: array[0]?.keyName || arrayPath };
    }
  }

  const parts = path.split('.');
  let current = obj;
  
  for (const part of parts) {
    if (current === undefined || current === null) {
      return { value: undefined };
    }
    current = current[part];
  }
  
  return { value: current };
}

function formatMessage(template: string, vars: Record<string, any>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
  }
  return result;
}

// ============== Main Alert Manager Class ==============

export class AIAlertManager extends EventEmitter {
  private rules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private alertHistory: Alert[] = [];
  private channelConfigs: Map<NotificationChannel, ChannelConfig> = new Map();
  
  // Condition tracking for duration-based rules
  private conditionStartTimes: Map<string, number> = new Map();
  
  // Rate limiting per channel
  private channelSendCounts: Map<string, { count: number; resetAt: number }> = new Map();
  
  // Max history size
  private readonly MAX_HISTORY_SIZE = 10000;

  constructor() {
    super();
    this.initializeDefaultRules();
    this.initializeChannelConfigs();
  }

  /**
   * Initialize default alert rules
   */
  private initializeDefaultRules(): void {
    for (const rule of DEFAULT_ALERT_RULES) {
      this.rules.set(rule.id, { ...rule });
    }
  }

  /**
   * Initialize default channel configurations
   */
  private initializeChannelConfigs(): void {
    this.channelConfigs.set('in-app', {
      enabled: true,
      rateLimitPerMinute: 100,
      maxRetries: 3,
      retryDelayMs: 1000
    });

    this.channelConfigs.set('email', {
      enabled: false,  // Disabled by default, needs SMTP config
      rateLimitPerMinute: 10,
      maxRetries: 3,
      retryDelayMs: 5000
    });

    this.channelConfigs.set('webhook', {
      enabled: false,  // Disabled by default, needs URL config
      rateLimitPerMinute: 30,
      maxRetries: 3,
      retryDelayMs: 2000
    });

    this.channelConfigs.set('slack', {
      enabled: false,  // Disabled by default, needs webhook config
      rateLimitPerMinute: 20,
      maxRetries: 3,
      retryDelayMs: 3000
    });
  }

  /**
   * Add or update an alert rule
   */
  addRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule);
    this.emit('rule-updated', rule);
  }

  /**
   * Remove an alert rule
   */
  removeRule(ruleId: string): boolean {
    const deleted = this.rules.delete(ruleId);
    if (deleted) {
      this.emit('rule-removed', ruleId);
    }
    return deleted;
  }

  /**
   * Get all rules
   */
  getRules(): AlertRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get a specific rule
   */
  getRule(ruleId: string): AlertRule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * Enable/disable a rule
   */
  setRuleEnabled(ruleId: string, enabled: boolean): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = enabled;
      this.emit('rule-updated', rule);
    }
  }

  /**
   * Configure a notification channel
   */
  configureChannel(channel: NotificationChannel, config: Partial<ChannelConfig>): void {
    const current = this.channelConfigs.get(channel) || {};
    this.channelConfigs.set(channel, { ...current, ...config });
    this.emit('channel-configured', channel);
  }

  /**
   * Evaluate metrics against all rules and generate alerts
   */
  async evaluateMetrics(metrics: any): Promise<Alert[]> {
    const newAlerts: Alert[] = [];
    const now = Date.now();

    for (const [ruleId, rule] of this.rules.entries()) {
      if (!rule.enabled) continue;

      try {
        const { value: currentValue, source } = getNestedValue(metrics, rule.metricPath);
        
        if (currentValue === undefined || currentValue === null) continue;

        // Handle numeric conversion for string values (like circuit state)
        let numericValue = typeof currentValue === 'number' 
          ? currentValue 
          : currentValue === rule.threshold ? 1 : 0;

        const conditionMet = evaluateCondition(
          numericValue,
          rule.operator,
          rule.threshold
        );

        if (conditionMet) {
          // Track condition start time for duration-based rules
          const trackingKey = `${ruleId}:${rule.metricPath}`;
          
          if (!this.conditionStartTimes.has(trackingKey)) {
            this.conditionStartTimes.set(trackingKey, now);
          }

          const conditionStartTime = this.conditionStartTimes.get(trackingKey)!;
          const conditionDuration = now - conditionStartTime;

          // Check if condition has persisted long enough
          if (!rule.durationMs || conditionDuration >= rule.durationMs) {
            // Check for existing alert
            const existingAlert = this.findActiveAlertForRule(ruleId);

            if (!existingAlert) {
              // Create new alert
              const alert: Alert = {
                id: generateId(),
                ruleId: rule.id,
                ruleName: rule.name,
                severity: rule.severity,
                status: 'active',
                message: formatMessage(rule.messageTemplate, {
                  metric: rule.metricPath,
                  threshold: rule.threshold,
                  value: numericValue,
                  source: source || 'system'
                }),
                source: source || 'system',
                metricPath: rule.metricPath,
                currentValue: numericValue,
                threshold: rule.threshold,
                triggeredAt: new Date(now),
                sendCount: 0,
                context: { originalMetrics: metrics }
              };

              this.activeAlerts.set(alert.id, alert);
              this.addToHistory(alert);
              newAlerts.push(alert);

              // Send notifications
              await this.sendNotifications(alert, rule.channels);

              this.emit('alert-triggered', alert);
            } else {
              // Check for escalation
              if (rule.escalateAfterMs && rule.escalationSeverity) {
                const timeSinceTrigger = now - existingAlert.triggeredAt.getTime();
                
                if (timeSinceTrigger >= rule.escalateAfterMs && 
                    existingAlert.severity !== rule.escalationSeverity) {
                  
                  // Escalate alert
                  existingAlert.severity = rule.escalationSeverity;
                  existingAlert.message = `[ESCALATED] ${existingAlert.message}`;
                  
                  this.emit('alert-escalated', existingAlert);
                  await this.sendNotifications(existingAlert, rule.channels);
                }
              }

              // Check for re-notification (cooldown expired)
              if (existingAlert.lastSentAt) {
                const timeSinceLastSend = now - existingAlert.lastSentAt.getTime();
                
                if (timeSinceLastSend >= rule.cooldownMs) {
                  await this.sendNotifications(existingAlert, rule.channels);
                }
              }
            }
          }
        } else {
          // Condition not met - clear tracking time and potentially resolve alert
          const trackingKey = `${ruleId}:${rule.metricPath}`;
          this.conditionStartTimes.delete(trackingKey);

          // Find and resolve active alert for this rule
          const existingAlert = this.findActiveAlertForRule(ruleId);
          if (existingAlert && existingAlert.status === 'active') {
            await this.resolveAlert(existingAlert.id, 'Condition returned to normal');
          }
        }
      } catch (error) {
        console.error(`Error evaluating rule ${ruleId}:`, error);
      }
    }

    return newAlerts;
  }

  /**
   * Find active alert for a rule
   */
  private findActiveAlertForRule(ruleId: string): Alert | undefined {
    for (const alert of this.activeAlerts.values()) {
      if (alert.ruleId === ruleId && alert.status === 'active') {
        return alert;
      }
    }
    return undefined;
  }

  /**
   * Send notifications for an alert
   */
  private async sendNotifications(alert: Alert, channels: NotificationChannel[]): Promise<void> {
    const now = new Date();

    for (const channel of channels) {
      // Check if channel is enabled
      const config = this.channelConfigs.get(channel);
      if (!config?.enabled) continue;

      // Check rate limiting
      if (!this.checkRateLimit(channel, config)) {
        console.warn(`Rate limit exceeded for channel: ${channel}`);
        continue;
      }

      // Create notification payload
      const payload: NotificationPayload = {
        alert,
        channel
      };

      try {
        await this.sendToChannel(payload, config);
        
        // Update alert metadata
        alert.lastSentAt = now;
        alert.sendCount++;
        
        this.emit('notification-sent', { alertId: alert.id, channel });
      } catch (error) {
        console.error(`Failed to send notification via ${channel}:`, error);
        this.emit('notification-failed', { alertId: alert.id, channel, error });
      }
    }
  }

  /**
   * Check and update rate limit for a channel
   */
  private checkRateLimit(channel: NotificationChannel, config: ChannelConfig): boolean {
    const key = `channel:${channel}`;
    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window
    
    let state = this.channelSendCounts.get(key);
    
    if (!state || state.resetAt < now) {
      state = { count: 0, resetAt: now + 60000 };
      this.channelSendCounts.set(key, state);
    }
    
    if (state.count >= config.rateLimitPerMinute) {
      return false;
    }
    
    state.count++;
    return true;
  }

  /**
   * Send notification to a specific channel
   */
  private async sendToChannel(payload: NotificationPayload, config: ChannelConfig): Promise<void> {
    switch (payload.channel) {
      case 'in-app':
        // In-app notifications are emitted as events
        this.emit('in-app-notification', payload.alert);
        break;

      case 'email':
        await this.sendEmailNotification(payload, config);
        break;

      case 'webhook':
      case 'slack':
        await this.sendWebhookNotification(payload, config);
        break;

      default:
        throw new Error(`Unknown channel: ${payload.channel}`);
    }
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(payload: NotificationPayload, config: ChannelConfig): Promise<void> {
    if (!config.emailConfig) {
      throw new Error('Email not configured');
    }

    // In production, integrate with nodemailer or similar
    console.log(`[EMAIL] Would send to ${config.emailConfig.adminEmails.join(', ')}`);
    console.log(`  Subject: [GarfiX AI Alert] [${payload.alert.severity.toUpperCase()}] ${payload.alert.ruleName}`);
    console.log(`  Body: ${payload.alert.message}`);

    // Placeholder for actual email implementation
    // const transporter = nodemailer.createTransport({
    //   host: config.emailConfig.smtpHost,
    //   port: config.emailConfig.smtpPort,
    //   auth: { user: config.emailConfig.username, pass: config.emailConfig.password }
    // });
    // await transporter.sendMail({ ... });
  }

  /**
   * Send webhook/Slack notification
   */
  private async sendWebhookNotification(payload: NotificationPayload, config: ChannelConfig): Promise<void> {
    if (!config.webhookConfig?.url) {
      throw new Error('Webhook URL not configured');
    }

    const webhookBody = {
      text: `[${payload.alert.severity.toUpperCase()}] ${payload.alert.message}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `🤖 GarfiX AI Alert: ${payload.alert.ruleName}` }
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Severity:*\n${payload.alert.severity.toUpperCase()}` },
            { type: 'mrkdwn', text: `*Status:*\n${payload.alert.status}` },
            { type: 'mrkdwn', text: `*Source:*\n${payload.alert.source}` },
            { type: 'mrkdwn', text: `*Time:*\n${payload.alert.triggeredAt.toISOString()}` }
          ]
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: payload.alert.message }
        }
      ]
    };

    const response = await fetch(config.webhookConfig.url, {
      method: config.webhookConfig.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.webhookConfig.headers || {})
      },
      body: JSON.stringify(webhookBody)
    });

    if (!response.ok) {
      throw new Error(`Webhook returned status ${response.status}`);
    }
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string, acknowledgedBy: string): Alert | null {
    const alert = this.activeAlerts.get(alertId);
    
    if (!alert || alert.status !== 'active') {
      return null;
    }

    alert.status = 'acknowledged';
    alert.acknowledgedAt = new Date();
    alert.acknowledgedBy = acknowledgedBy;

    this.emit('alert-acknowledged', alert);
    return alert;
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string, message?: string): Promise<Alert | null> {
    const alert = this.activeAlerts.get(alertId);
    
    if (!alert) {
      return null;
    }

    alert.status = 'resolved';
    alert.resolvedAt = new Date();
    alert.resolveMessage = message || 'Resolved';

    // Send resolution notification
    await this.sendNotifications(alert, ['in-app']);

    // Move from active to history after a delay
    setTimeout(() => {
      this.activeAlerts.delete(alertId);
    }, 300000); // Keep in active map for 5 minutes after resolution

    this.emit('alert-resolved', alert);
    return alert;
  }

  /**
   * Suppress an alert (temporarily disable notifications)
   */
  suppressAlert(alertId: string, reason: string, durationMs?: number): Alert | null {
    const alert = this.activeAlerts.get(alertId);
    
    if (!alert) {
      return null;
    }

    alert.status = 'suppressed';
    alert.suppressionReason = reason;

    this.emit('alert-suppressed', alert);

    // Auto-unsuppress after duration
    if (durationMs) {
      setTimeout(() => {
        if (this.activeAlerts.get(alertId)?.status === 'suppressed') {
          alert.status = 'active';
          alert.suppressionReason = undefined;
          this.emit('alert-unsuppressed', alert);
        }
      }, durationMs);
    }

    return alert;
  }

  /**
   * Get all active alerts
   */
  getActiveAlerts(options?: { severity?: AlertSeverity; status?: AlertStatus }): Alert[] {
    let alerts = Array.from(this.activeAlerts.values());

    if (options?.severity) {
      alerts = alerts.filter(a => a.severity === options.severity);
    }

    if (options?.status) {
      alerts = alerts.filter(a => a.status === options.status);
    }

    return alerts.sort((a, b) => b.triggeredAt.getTime() - a.triggeredAt.getTime());
  }

  /**
   * Get alert statistics
   */
  getStats(): AlertStats {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const todayStart = new Date().setHours(0, 0, 0, 0);

    const activeAlerts = this.getActiveAlerts();

    const bySeverity: Record<AlertSeverity, number> = {
      info: 0,
      warning: 0,
      error: 0,
      critical: 0
    };

    const byStatus: Record<AlertStatus, number> = {
      active: 0,
      acknowledged: 0,
      resolved: 0,
      suppressed: 0
    };

    for (const alert of activeAlerts) {
      bySeverity[alert.severity]++;
      byStatus[alert.status]++;
    }

    // Calculate average resolution time from history
    const resolvedAlerts = this.alertHistory.filter(a => a.resolvedAt);
    const avgResolutionTime = resolvedAlerts.length > 0
      ? resolvedAlerts.reduce((sum, a) => sum + (a.resolvedAt!.getTime() - a.triggeredAt.getTime()), 0) / resolvedAlerts.length
      : 0;

    return {
      totalAlerts: this.alertHistory.length,
      activeAlerts: activeAlerts.length,
      bySeverity,
      byStatus,
      avgResolutionTimeMs: avgResolutionTime,
      alertsToday: this.alertHistory.filter(a => a.triggeredAt.getTime() >= todayStart).length,
      alertsThisHour: this.alertHistory.filter(a => a.triggeredAt.getTime() >= oneHourAgo).length
    };
  }

  /**
   * Get recent alert history
   */
  getHistory(limit: number = 50, options?: { severity?: AlertSeverity }): Alert[] {
    let history = [...this.alertHistory].reverse(); // Most recent first

    if (options?.severity) {
      history = history.filter(a => a.severity === options.severity);
    }

    return history.slice(0, limit);
  }

  /**
   * Clear alert history (use carefully)
   */
  clearHistory(): void {
    this.alertHistory = [];
    this.emit('history-cleared');
  }

  /**
   * Add alert to history
   */
  private addToHistory(alert: Alert): void {
    this.alertHistory.push(alert);
    
    // Trim history if needed
    if (this.alertHistory.length > this.MAX_HISTORY_SIZE) {
      this.alertHistory = this.alertHistory.slice(-this.MAX_HISTORY_SIZE);
    }
  }

  /**
   * Export current state (for persistence/debugging)
   */
  exportState(): {
    rules: AlertRule[];
    activeAlerts: Alert[];
    stats: AlertStats;
  } {
    return {
      rules: this.getRules(),
      activeAlerts: this.getActiveAlerts(),
      stats: this.getStats()
    };
  }

  /**
   * Shutdown and cleanup
   */
  shutdown(): void {
    this.conditionStartTimes.clear();
    this.channelSendCounts.clear();
    this.removeAllListeners();
  }
}

// ============== Singleton Instance ==============

let alertManagerInstance: AIAlertManager | null = null;

export function getAlertManager(): AIAlertManager {
  if (!alertManagerInstance) {
    alertManagerInstance = new AIAlertManager();
  }
  return alertManagerInstance;
}

export function resetAlertManager(): void {
  if (alertManagerInstance) {
    alertManagerInstance.shutdown();
    alertManagerInstance = null;
  }
}

// ============== API Route Integration Helpers ==============

/**
 * Express/Next.js route handler helper for getting alerts
 */
export function handleGetAlerts(req: any, res: any): void {
  const manager = getAlertManager();
  const { severity, status, limit } = req.query;
  
  const alerts = manager.getActiveAlerts({
    severity: severity as AlertSeverity,
    status: status as AlertStatus
  }).slice(0, parseInt(limit as string) || 50);
  
  res.json({ alerts, stats: manager.getStats() });
}

/**
 * Express/Next.js route handler for acknowledging alerts
 */
export async function handleAcknowledgeAlert(req: any, res: any): Promise<void> {
  const manager = getAlertManager();
  const { alertId } = req.params;
  const { user } = req.body || {};
  
  const alert = manager.acknowledgeAlert(alertId, user || 'anonymous');
  
  if (alert) {
    res.json({ success: true, alert });
  } else {
    res.status(404).json({ success: false, error: 'Alert not found or not active' });
  }
}

/**
 * Express/Next.js route handler for resolving alerts
 */
export async function handleResolveAlert(req: any, res: any): Promise<void> {
  const manager = getAlertManager();
  const { alertId } = req.params;
  const { message } = req.body || {};
  
  const alert = await manager.resolveAlert(alertId, message);
  
  if (alert) {
    res.json({ success: true, alert });
  } else {
    res.status(404).json({ success: false, error: 'Alert not found' });
  }
}
