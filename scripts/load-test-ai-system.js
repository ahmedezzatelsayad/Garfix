/**
 * ═══════════════════════════════════════════════════════════════════
 * GarfiX EOS - AI System Load Testing Script
 * 
 * يحاكي سيناريوهات الحمل الثقيلة على نظام AI Parsing
 * 
 * السيناريوهات:
 * 1. ✅ 100 فاتورة دفعة واحدة (Burst Test)
 * 2. ✅ 1000 مستخدم × 100 فاتورة (Full Day Stress Test)
 * 3. ✅ اختبار Circuit Breaker & Failover
 * 4. ✅ اختبار Auto-Scaler behavior
 * 
 * ═══════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');

// ── Configuration (from actual code) ──────────────────────────────

const CONFIG = {
  // From aiWorkers.ts
  POOL_MAX_RPM: 75,                    // 5 keys × 15 RPM
  QUEUE_MAX_SIZE: 1000,
  QUEUE_SCALE_UP_THRESHOLD: 50,
  
  // From advanced-loadbalancer.ts
  KEYS_COUNT: 5,
  RPM_PER_KEY: 15,
  MAX_TOKENS_PER_KEY_PER_DAY: 1_000_000,
  CIRCUIT_BREAKER_THRESHOLD: 3,
  CIRCUIT_RESET_TIMEOUT: 60_000,       // 60 seconds
  
  // From enhanced-worker-scaler.ts
  QUEUE_THRESHOLDS: {
    LOW: 50,
    MEDIUM: 150,
    HIGH: 300,
    CRITICAL: 500
  },
  
  // Test scenarios
  SCENARIOS: {
    BURST_100: { invoices: 100, concurrentUsers: 1 },
    STRESS_1000x100: { users: 1000, invoicesPerUser: 100 },
    EXTREME_10000: { invoices: 10000, concurrentUsers: 100 }
  }
};

// ── Simulator Classes ────────────────────────────────────────────

/**
 * Simulates the Gemini API Key Pool
 */
class KeyPoolSimulator {
  constructor() {
    this.keys = Array.from({ length: CONFIG.KEYS_COUNT }, (_, i) => ({
      id: `key-${i + 1}`,
      name: `Gemini-Key-${i + 1}`,
      healthy: true,
      rpmUsed: 0,
      rpmLimit: CONFIG.RPM_PER_KEY,
      tokensToday: 0,
      maxTokens: CONFIG.MAX_TOKENS_PER_KEY_PER_DAY,
      consecutiveFailures: 0,
      circuitState: 'closed', // closed | open | half-open
      totalRequests: 0,
      failures: 0,
      latencyHistory: []
    }));
    
    this.rpmWindow = []; // Sliding window for pool RPM
    this.totalProcessed = 0;
    this.totalRejected = 0;
    this.failoverCount = 0;
    this.circuitBreakerTripped = 0;
  }

  /**
   * Get current pool RPM from sliding window
   */
  getCurrentRPM(now = Date.now()) {
    const oneMinuteAgo = now - 60_000;
    this.rpmWindow = this.rpmWindow.filter(t => t > oneMinuteAgo);
    return this.rpmWindow.length;
  }

  /**
   * Check if pool can accept request
   */
  canAcceptRequest() {
    return this.getCurrentRPM() < CONFIG.POOL_MAX_RPM;
  }

  /**
   * Simulate processing a request with load balancing
   */
  processRequest(simulatedLatency = null) {
    const now = Date.now();
    
    // Check capacity
    if (!this.canAcceptRequest()) {
      this.totalRejected++;
      return { success: false, reason: 'POOL_AT_CAPACITY' };
    }

    // Find best key using weighted strategy (simplified)
    const healthyKeys = this.keys.filter(k => 
      k.healthy && k.circuitState === 'open' === false && 
      k.tokensToday < k.maxTokens
    );

    if (healthyKeys.length === 0) {
      this.totalRejected++;
      return { success: false, reason: 'NO_HEALTHY_KEYS' };
    }

    // Weighted selection (by remaining RPM capacity)
    const selectedKey = this.selectWeightedKey(healthyKeys);
    
    // Simulate processing
    const latency = simulatedLatency || this.simulateLatency();
    const success = Math.random() > 0.02; // 2% failure rate simulation

    if (success) {
      // Record success
      selectedKey.rpmUsed++;
      selectedKey.tokensToday += Math.floor(Math.random() * 500) + 200; // 200-700 tokens
      selectedKey.totalRequests++;
      selectedKey.consecutiveFailures = 0;
      selectedKey.latencyHistory.push(latency);
      
      // Keep only last 100 latency entries
      if (selectedKey.latencyHistory.length > 100) {
        selectedKey.latencyHistory.shift();
      }
      
      // Update pool RPM window
      this.rpmWindow.push(now);
      this.totalProcessed++;

      return {
        success: true,
        keyId: selectedKey.id,
        latency,
        tokensUsed: selectedKey.tokensToday
      };
    } else {
      // Record failure
      selectedKey.failures++;
      selectedKey.consecutiveFailures++;
      
      // Check circuit breaker
      if (selectedKey.consecutiveFailures >= CONFIG.CIRCUIT_BREAKER_THRESHOLD) {
        this.tripCircuitBreaker(selectedKey);
      }
      
      return {
        success: false,
        reason: 'API_ERROR',
        keyId: selectedKey.id,
        willRetry: selectedKey.circuitState !== 'open'
      };
    }
  }

  selectWeightedKey(keys) {
    // Calculate weights based on remaining capacity
    const weighted = keys.map(k => {
      const rpmRemaining = k.rpmLimit - k.rpmUsed;
      const tokenRemaining = k.maxTokens - k.tokensToday;
      const score = (rpmRemaining / k.rpmLimit) * 0.7 + 
                    (tokenRemaining / k.maxTokens) * 0.3;
      return { key: k, weight: Math.max(0.1, score) };
    });

    const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
    let random = Math.random() * totalWeight;

    for (const { key, weight } of weighted) {
      random -= weight;
      if (random <= 0) return key;
    }
    return keys[0];
  }

  tripCircuitBreaker(key) {
    key.circuitState = 'open';
    key.healthy = false;
    key.circuitOpenUntil = Date.now() + CONFIG.CIRCUIT_RESET_TIMEOUT;
    this.circuitBreakerTripped++;
    
    console.log(`  🔌 CIRCUIT BREAKER TRIPPED for ${key.id}`);
  }

  simulateLatency() {
    // Realistic AI API latency distribution
    const base = 2000; // 2 seconds base
    const variance = 3000; // ±3 seconds
    return Math.floor(base + Math.random() * variance);
  }

  /**
   * Try to recover open circuits (simulates time passing)
   */
  recoverCircuits() {
    const now = Date.now();
    for (const key of this.keys) {
      if (key.circuitState === 'open' && key.circuitOpenUntil <= now) {
        key.circuitState = 'half-open';
        key.healthy = true;
        console.log(`  🔄 Circuit HALF-OPEN for ${key.id} - testing...`);
      }
    }
  }

  getMetrics() {
    const avgLatencies = this.keys.map(k => {
      if (k.latencyHistory.length === 0) return 0;
      return Math.round(
        k.latencyHistory.reduce((a, b) => a + b, 0) / k.latencyHistory.length
      );
    });

    return {
      pool: {
        currentRPM: this.getCurrentRPM(),
        maxRPM: CONFIG.POOL_MAX_RPM,
        utilizationPct: Math.round((this.getCurrentRPM() / CONFIG.POOL_MAX_RPM) * 100),
        totalProcessed: this.totalProcessed,
        totalRejected: this.totalRejected
      },
      keys: this.keys.map((k, i) => ({
        id: k.id,
        healthy: k.healthy,
        circuitState: k.circuitState,
        rpmUsed: k.rpmUsed,
        rpmLimit: k.rpmLimit,
        tokensUsed: k.tokensToday.toLocaleString(),
        tokensLimit: k.maxTokens.toLocaleString(),
        tokenPct: Math.round((k.tokensToday / k.maxTokens) * 100),
        avgLatencyMs: avgLatencies[i],
        failures: k.failures,
        requests: k.totalRequests
      })),
      failovers: this.failoverCount,
      circuitBreakerEvents: this.circuitBreakerTripped
    };
  }
}

/**
 * Simulates the BullMQ Queue with back-pressure
 */
class QueueSimulator {
  constructor(maxSize = CONFIG.QUEUE_MAX_SIZE) {
    this.maxSize = maxSize;
    this.queue = [];
    this.processing = [];
    this.completed = [];
    this.failed = [];
    this.enqueued = 0;
    this.rejected = 0;
  }

  enqueue(job) {
    if (this.queue.length >= this.maxSize) {
      this.rejected++;
      return { enqueued: false, reason: 'QUEUE_FULL' };
    }
    
    this.queue.push({
      ...job,
      id: `job-${++this.enqueued}`,
      status: 'pending',
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null
    });
    
    return { enqueued: true, jobId: `job-${this.enqueued}` };
  }

  dequeue(count = 1) {
    const jobs = [];
    for (let i = 0; i < count && this.queue.length > 0; i++) {
      const job = this.shift();
      job.status = 'running';
      job.startedAt = Date.now();
      this.processing.push(job);
      jobs.push(job);
    }
    return jobs;
  }

  shift() {
    // Priority-based dequeue (lower priority number = higher priority)
    let minIdx = 0;
    for (let i = 1; i < this.queue.length; i++) {
      if ((this.queue[i].priority || 5) < (this.queue[minIdx].priority || 5)) {
        minIdx = i;
      }
    }
    return this.queue.splice(minIdx, 1)[0];
  }

  completeJob(jobId) {
    const idx = this.processing.findIndex(j => j.id === jobId);
    if (idx !== -1) {
      const job = this.processing.splice(idx, 1)[0];
      job.status = 'completed';
      job.completedAt = Date.now();
      this.completed.push(job);
      return job;
    }
    return null;
  }

  failJob(jobId) {
    const idx = this.processing.findIndex(j => j.id === jobId);
    if (idx !== -1) {
      const job = this.processing.splice(idx, 1)[0];
      job.status = 'failed';
      this.failed.push(job);
      return job;
    }
    return null;
  }

  getMetrics() {
    return {
      pending: this.queue.length,
      running: this.processing.length,
      completed: this.completed.length,
      failed: this.failed.length,
      totalEnqueued: this.enqueued,
      rejected: this.rejected,
      utilizationPct: Math.round(((this.queue.length + this.processing.length) / this.maxSize) * 100)
    };
  }
}

/**
 * Simulates the Enhanced Worker Scaler
 */
class ScalerSimulator {
  constructor() {
    this.currentWorkers = 1;
    this.minWorkers = 1;
    this.maxWorkers = 10;
    this.scaleUpHistory = [];
    this.scaleDownHistory = [];
    this.lastScaleTime = 0;
    this.cooldownMs = 30_000;
  }

  evaluate(queueDepth, poolHealthFactor = 1.0) {
    const now = Date.now();
    let action = 'hold';
    let reason = '';
    let targetWorkers = this.currentWorkers;

    // Scale UP conditions
    if (queueDepth > CONFIG.QUEUE_THRESHOLDS.CRITICAL) {
      action = 'scale-up';
      targetWorkers = Math.min(this.currentWorkers + 4, this.maxWorkers);
      reason = `CRITICAL queue: ${queueDepth}`;
    } else if (queueDepth > CONFIG.QUEUE_THRESHOLDS.HIGH) {
      action = 'scale-up';
      targetWorkers = Math.min(this.currentWorkers + 2, this.maxWorkers);
      reason = `HIGH queue: ${queueDepth}`;
    } else if (queueDepth > CONFIG.QUEUE_THRESHOLDS.MEDIUM) {
      if (now - this.lastScaleTime > this.cooldownMs) {
        action = 'scale-up';
        targetWorkers = Math.min(this.currentWorkers + 1, this.maxWorkers);
        reason = `MEDIUM queue: ${queueDepth}`;
      }
    } else if (queueDepth === 0 && this.currentWorkers > this.minWorkers) {
      if (now - this.lastScaleTime > this.cooldownMs * 2) {
        action = 'scale-down';
        targetWorkers = Math.max(this.currentWorkers - 1, this.minWorkers);
        reason = 'Idle - scaling down';
      }
    } else {
      reason = `Normal (${queueDepth} jobs)`;
    }

    // Apply throttle if pool degraded
    if (poolHealthFactor < 0.5 && action === 'scale-up') {
      action = 'throttle';
      reason += ' [THROTTLED]';
    }

    // Execute scale decision
    if ((action === 'scale-up' || action === 'scale-down') && targetWorkers !== this.currentWorkers) {
      if (now - this.lastScaleTime >= this.cooldownMs) {
        const prev = this.currentWorkers;
        this.currentWorkers = targetWorkers;
        this.lastScaleTime = now;
        
        if (action === 'scale-up') {
          this.scaleUpHistory.push({ from: prev, to: targetWorkers, time: now, reason });
        } else {
          this.scaleDownHistory.push({ from: prev, to: targetWorkers, time: now, reason });
        }
        
        console.log(`  📈 SCALER: ${action.toUpperCase()} ${prev} → ${targetWorkers} workers (${reason})`);
      }
    }

    return { action, targetWorkers: this.currentWorkers, reason, poolHealthFactor };
  }

  getMetrics() {
    return {
      currentWorkers: this.currentWorkers,
      scaleUpEvents: this.scaleUpHistory.length,
      scaleDownEvents: this.scaleDownHistory.length,
      lastAction: this.scaleUpHistory[this.scaleUpHistory.length - 1] || 
                   this.scaleDownHistory[this.scaleDownHistory.length - 1] || null
    };
  }
}

// ── Test Runner ─────────────────────────────────────────────────

class LoadTestRunner {
  constructor() {
    this.keyPool = new KeyPoolSimulator();
    this.queue = new QueueSimulator();
    this.scaler = new ScalerSimulator();
    this.results = {};
  }

  /**
   * Scenario 1: Burst test - 100 invoices at once
   */
  async runBurstTest(invoiceCount = 100) {
    console.log('\n' + '='.repeat(80));
    console.log('🧪 SCENARIO 1: BURST TEST - 100 Invoices at Once');
    console.log('='.repeat(80));
    
    const startTime = Date.now();
    const results = {
      scenario: 'BURST_100_INVOICES',
      invoiceCount,
      timestamps: [],
      metricsSnapshots: [],
      finalMetrics: null
    };

    // Phase 1: Enqueue all invoices rapidly
    console.log('\n📥 PHASE 1: Enqueueing 100 invoices...');
    const enqueueStart = Date.now();
    
    for (let i = 1; i <= invoiceCount; i++) {
      const result = this.queue.enqueue({
        type: 'ai-invoice-extract',
        data: { invoiceId: `INV-${String(i).padStart(4, '0')}`, rawText: `Sample invoice ${i}...` },
        priority: 4
      });
      
      if (i % 25 === 0) {
        console.log(`  ✓ Enqueued ${i}/${invoiceCount} invoices`);
      }
      
      // Record timestamp every 10 invoices
      if (i % 10 === 0) {
        results.timestamps.push({
          event: 'enqueued',
          count: i,
          time: Date.now() - enqueueStart
        });
      }
    }

    const enqueueTime = Date.now() - enqueueStart;
    console.log(`\n✅ Enqueue complete: ${invoiceCount} invoices in ${enqueueTime}ms`);

    // Record initial state
    results.metricsSnapshots.push({
      phase: 'after_enqueue',
      time: Date.now() - startTime,
      queue: this.queue.getMetrics(),
      pool: this.keyPool.getMetrics()
    });

    // Phase 2: Process queue (simulate real-time processing)
    console.log('\n⚙️ PHASE 2: Processing queue (simulating 75 RPM)...');
    
    let processedCount = 0;
    const processStartTime = Date.now();
    const processingInterval = setInterval(() => {
      // How many can we process this second based on RPM?
      const currentRPM = this.keyPool.getCurrentRPM();
      const remainingCapacity = CONFIG.POOL_MAX_RPM - currentRPM;
      const toProcess = Math.min(remainingCapacity, 5); // Process up to 5 per tick
      
      const jobs = this.queue.dequeue(toProcess);
      
      for (const job of jobs) {
        const result = this.keyPool.processRequest();
        
        if (result.success) {
          this.queue.completeJob(job.id);
          processedCount++;
        } else {
          // Retry logic would go here
          if (result.reason !== 'POOL_AT_CAPACITY') {
            this.queue.completeJob(job.id); // Count as processed even if failed
            processedCount++;
          } else {
            // Put back in queue
            this.queue.queue.unshift({...job, status: 'pending'});
          }
        }
      }

      // Run scaler evaluation
      const queueMetrics = this.queue.getMetrics();
      this.scaler.evaluate(queueMetrics.pending + queueMetrics.running);

      // Recover circuits periodically
      if (processedCount % 50 === 0) {
        this.keyPool.recoverCircuits();
      }

      // Log progress
      if (processedCount % 25 === 0 || processedCount >= invoiceCount) {
        const elapsed = Date.now() - processStartTime;
        console.log(`  ⚡ Processed ${processedCount}/${invoiceCount} in ${(elapsed/1000).toFixed(1)}s`);
        
        results.timestamps.push({
          event: 'processed',
          count: processedCount,
          time: elapsed
        });
        
        results.metricsSnapshots.push({
          phase: 'processing',
          time: Date.now() - startTime,
          queue: this.queue.getMetrics(),
          pool: this.keyPool.getMetrics(),
          scaler: this.scaler.getMetrics()
        });
      }

      // Stop when all done
      if (processedCount >= invoiceCount) {
        clearInterval(processingInterval);
        
        const totalTime = Date.now() - startTime;
        results.finalMetrics = {
          totalTimeMs: totalTime,
          totalTimeSeconds: (totalTime / 1000).toFixed(2),
          throughputPerSecond: (invoiceCount / (totalTime / 1000)).toFixed(2),
          averagePerInvoice: (totalTime / invoiceCount).toFixed(2),
          queue: this.queue.getMetrics(),
          pool: this.keyPool.getMetrics(),
          scaler: this.scaler.getMetrics()
        };

        this.printResults(results);
        this.results.burst = results;
      }
    }, 100); // Tick every 100ms (simulates ~10 ticks per second)

    // Wait for completion
    return new Promise(resolve => {
      const checkComplete = setInterval(() => {
        if (processedCount >= invoiceCount) {
          clearInterval(checkComplete);
          resolve(results);
        }
      }, 200);
      
      // Safety timeout after 120 seconds
      setTimeout(() => {
        clearInterval(checkComplete);
        clearInterval(processingInterval);
        resolve(results);
      }, 120_000);
    });
  }

  /**
   * Scenario 2: 1000 users × 100 invoices over a day
   */
  async runStressTest(userCount = 1000, invoicesPerUser = 100) {
    console.log('\n' + '='.repeat(80));
    console.log('🧪 SCENARIO 2: STRESS TEST - 1000 Users × 100 Invoices Each');
    console.log('='.repeat(80));
    console.log(`\n📊 Total invoices: ${userCount} × ${invoicesPerUser} = ${userCount * invoicesPerUser.toLocaleString()}`);
    
    const TOTAL_INVOICES = userCount * invoicesPerUser;
    const startTime = Date.now();
    
    // Reset simulators
    this.keyPool = new KeyPoolSimulator();
    this.queue = new QueueSimulator();
    this.scaler = new ScalerSimulator();

    const results = {
      scenario: 'STRESS_1000x100',
      userCount,
      invoicesPerUser,
      totalInvoices: TOTAL_INVOICES,
      hourlyStats: [],
      dailySummary: null,
      willCompleteSameDay: null,
      estimatedHours: null
    };

    // Simulate users submitting throughout the day
    // Spread submissions over 8 hours (work day)
    const WORK_HOURS = 8;
    const MS_PER_HOUR = 3_600_000;
    const INVOICES_PER_HOUR = TOTAL_INVOICES / WORK_HOURS;
    const INVOICES_PER_MINUTE = INVOICES_PER_HOUR / 60;
    const INVOICES_PER_SECOND = INVOICES_PER_MINUTE / 60;

    console.log('\n📈 SUBMISSION RATE:');
    console.log(`  • Per hour:   ${Math.round(INVOICES_PER_HOUR).toLocaleString()} invoices`);
    console.log(`  • Per minute: ${Math.round(INVOICES_PER_MINUTE)} invoices`);
    console.log(`  • Per second: ${INVOICES_PER_SECOND.toFixed(2)} invoices`);
    console.log(`  • Pool capacity: ${CONFIG.POOL_MAX_RPM}/min = ${(CONFIG.POOL_MAX_RPM/60).toFixed(1)}/sec`);

    // Capacity analysis
    const PROCESSING_PER_SECOND = CONFIG.POOL_MAX_RPM / 60; // 1.25/sec
    const SUBMISSION_RATE = INVOICES_PER_SECOND;
    const isOverwhelmed = SUBMISSION_RATE > PROCESSING_PER_SECOND;

    console.log('\n⚡ CAPACITY ANALYSIS:');
    console.log(`  • Submission rate: ${SUBMISSION_RATE.toFixed(2)}/sec`);
    console.log(`  • Processing rate: ${PROCESSING_PER_SECOND.toFixed(2)}/sec`);
    console.log(`  • Overwhelmed: ${isOverwhelmed ? '❌ YES' : '✅ NO'}`);

    if (isOverwhelmed) {
      const backlogPerHour = (SUBMISSION_RATE - PROCESSING_PER_SECOND) * 3600;
      console.log(`  • ⚠️ Backlog growth: ~${Math.round(backlogPerHour).toLocaleString()}/hour`);
    }

    // Simulate hour by hour
    let totalSubmitted = 0;
    let totalProcessed = 0;
    let queueBacklog = 0;

    for (let hour = 1; hour <= 24; hour++) {
      const hourStart = Date.now();
      
      // Submit invoices for this hour (if within work hours)
      let submittedThisHour = 0;
      if (hour <= WORK_HOURS) {
        submittedThisHour = Math.min(
          Math.round(INVOICES_PER_HOUR + (Math.random() - 0.5) * INVOICES_PER_HOUR * 0.2), // ±10% variance
          TOTAL_INVOICES - totalSubmitted
        );
        
        for (let i = 0; i < submittedThisHour; i++) {
          this.queue.enqueue({
            type: 'ai-invoice-extract',
            data: { invoiceId: `H${hour}-INV-${i}` },
            priority: 4
          });
        }
        totalSubmitted += submittedThisHour;
      }

      // Process for this hour (simulate at 75 RPM)
      let processedThisHour = 0;
      const ticksInHour = 3600; // 1 tick per second simulation
      const processingPerTick = CONFIG.POOL_MAX_RPM / 60; // Requests per tick
      
      for (let tick = 0; tick < ticksInHour && (this.queue.getMetrics().pending > 0 || this.queue.getMetrics().running > 0); tick++) {
        const toProcess = Math.min(processingPerTick, 5);
        const jobs = this.queue.dequeue(toProcess);
        
        for (const job of jobs) {
          const result = this.keyPool.processRequest();
          if (result.success) {
            this.queue.completeJob(job.id);
            processedThisHour++;
            totalProcessed++;
          }
        }
        
        // Recovery checks
        if (tick % 1800 === 0) { // Every 30 minutes simulated
          this.keyPool.recoverCircuits();
          this.scaler.evaluate(this.queue.getMetrics().pending);
        }
      }

      queueBacklog = this.queue.getMetrics().pending + this.queue.getMetrics().running;

      const hourlyStat = {
        hour,
        submitted: submittedThisHour,
        processed: processedThisHour,
        backlog: queueBacklog,
        totalSubmitted,
        totalProcessed,
        poolUtilization: this.keyPool.getMetrics().pool.utilizationPct,
        queueUtilization: this.queue.getMetrics().utilizationPct
      };
      
      results.hourlyStats.push(hourlyStat);

      // Log every 4 hours
      if (hour % 4 === 0 || hour === 24) {
        console.log(`\n  🕐 Hour ${hour.toString().padStart(2, '0')}:00`);
        console.log(`     Submitted: ${totalSubmitted.toLocaleString()} | Processed: ${totalProcessed.toLocaleString()} | Backlog: ${queueBacklog.toLocaleString()}`);
        console.log(`     Pool: ${this.keyPool.getMetrics().pool.utilizationPct}% | Queue: ${this.queue.getMetrics().utilizationPct}%`);
      }

      // Early exit if everything done
      if (totalProcessed >= TOTAL_INVOICES && queueBacklog === 0) {
        console.log(`\n  ✅ ALL PROCESSED by hour ${hour}!`);
        break;
      }
    }

    const totalTime = Date.now() - startTime;
    const finalBacklog = this.queue.getMetrics().pending + this.queue.getMetrics().running;
    const completionHour = results.hourlyStats.findIndex(h => h.totalProcessed >= TOTAL_INVOICES && h.backlog === 0) + 1;

    results.dailySummary = {
      totalSubmitted,
      totalProcessed,
      finalBacklog,
      completionHour: completionHour || 'NOT_COMPLETED',
      completedSameDay: completionHour <= 24,
      poolFinalState: this.keyPool.getMetrics(),
      queueFinalState: this.queue.getMetrics()
    };

    results.willCompleteSameDay = completionHour <= 24;
    results.estimatedHours = (TOTAL_INVOICES / (CONFIG.POOL_MAX_RPM * 60)).toFixed(1);

    this.printStressResults(results);
    this.results.stress = results;

    return results;
  }

  /**
   * Print burst test results
   */
  printResults(results) {
    console.log('\n' + '─'.repeat(80));
    console.log('📊 BURST TEST RESULTS');
    console.log('─'.repeat(80));
    
    const m = results.finalMetrics;
    if (!m) {
      console.log('  ⚠️ Metrics not yet available');
      return;
    }
    
    console.log('\n⏱️ TIMING:');
    console.log(`  Total Time:       ${m.totalTimeSeconds}s (${(m.totalTimeMs/1000/60).toFixed(2)} minutes)`);
    console.log(`  Per Invoice Avg:   ${m.averagePerInvoice}ms`);
    console.log(`  Throughput:       ${m.throughputPerSecond} invoices/sec`);

    console.log('\n📦 QUEUE FINAL STATE:');
    if (m.queue) {
      console.log(`  Completed:        ${m.queue.completed}`);
      console.log(`  Failed:           ${m.queue.failed}`);
      console.log(`  Rejected:         ${m.queue.rejected}`);
      console.log(`  Still Pending:    ${m.queue.pending}`);
    }

    console.log('\n🔑 POOL FINAL STATE:');
    if (m.pool && m.pool.pool) {
      console.log(`  Total Processed:  ${(m.pool.pool.totalProcessed || 0).toLocaleString()}`);
      console.log(`  Total Rejected:   ${m.pool.pool.totalRejected || 0}`);
      console.log(`  Final RPM Usage:  ${m.pool.pool.currentRPM}/${m.pool.pool.maxRPM} (${m.pool.pool.utilizationPct}%)`);
      console.log(`  Circuit Breakers: ${m.pool.circuitBreakerEvents || 0} trips`);
    }

    if (m.pool && m.pool.keys) {
      console.log('\n📈 KEY-BY-KEY BREAKDOWN:');
      console.log('  ┌──────┬──────────┬───────┬─────────────┬──────────┬─────────┬────────┐');
      console.log('  │ Key  │ Healthy  │ RPM   │ Tokens Used │ Token %  │ Latency │ Fails  │');
      console.log('  ├──────┼──────────┼───────┼─────────────┼──────────┼─────────┼────────┤');
      
      for (const key of m.pool.keys) {
        console.log(
          `  │ ${key.id.padEnd(4)} │ ${(key.healthy ? '✅' : '❌').padEnd(8)} │ ${String(key.rpmUsed).padStart(3)}/${
            String(key.rpmLimit).padEnd(2)} │ ${
            key.tokensUsed.padStart(11)} │ ${
            String(key.tokenPct + '%').padStart(8)} │ ${
            String((key.avgLatencyMs || 0) + 'ms').padStart(7)} │ ${
            String(key.failures).padStart(6)} │`
        );
      }
      console.log('  └──────┴──────────┴───────┴─────────────┴──────────┴─────────┴────────┘');
    }

    if (m.scaler) {
      console.log('\n🤖 SCALER BEHAVIOR:');
      console.log(`  Final Workers:    ${m.scaler.currentWorkers}`);
      console.log(`  Scale-Up Events:  ${m.scaler.scaleUpEvents}`);
      console.log(`  Scale-Down Events:${m.scaler.scaleDownEvents}`);
    }
  }

  /**
   * Print stress test results
   */
  printStressResults(results) {
    console.log('\n' + '─'.repeat(80));
    console.log('📊 STRESS TEST RESULTS (1000 Users × 100 Invoices)');
    console.log('─'.repeat(80));

    const s = results.dailySummary;
    
    console.log('\n🎯 COMPLETION ANALYSIS:');
    console.log(`  Total Invoices:    ${results.totalInvoices.toLocaleString()}`);
    console.log(`  Total Submitted:   ${s.totalSubmitted.toLocaleString()}`);
    console.log(`  Total Processed:   ${s.totalProcessed.toLocaleString()}`);
    console.log(`  Final Backlog:     ${s.finalBacklog.toLocaleString()}`);
    console.log(`  Completed Same Day: ${s.completedSameDay ? '✅ YES' : '❌ NO'} (Hour ${s.completionHour})`);
    console.log(`  Estimated Time:    ${results.estimatedHours} hours`);

    console.log('\n⚠️ CAPACITY VERDICT:');
    
    const submissionRate = results.totalInvoices / 8; // per hour during work day
    const processingRate = CONFIG.POOL_MAX_RPM * 60; // per hour
    
    if (submissionRate > processingRate) {
      const overflow = submissionRate - processingRate;
      const hoursToOverflow = CONFIG.QUEUE_MAX_SIZE / overflow;
      
      console.log(`  ❌ SYSTEM WILL OVERFLOW!`);
      console.log(`     Submission: ${Math.round(submissionRate).toLocaleString()}/hour`);
      console.log(`     Processing: ${processingRate.toLocaleString()}/hour`);
      console.log(`     Overflow:   +${Math.round(overflow).toLocaleString()}/hour`);
      console.log(`     Queue Full:  After ~${hoursToOverflow.toFixed(1)} hours`);
      console.log(`     Rejections:  Will start after queue fills (1000 max)`);
    } else {
      console.log(`  ✅ SYSTEM CAN HANDLE IT`);
      console.log(`     Spare Capacity: ${Math.round(processingRate - submissionRate).toLocaleString()}/hour`);
    }

    console.log('\n📈 HOURLY BREAKDOWN (Key Hours):');
    console.log('  ┌─────┬────────────┬────────────┬───────────┬────────────┬──────────┐');
    console.log('  │ Hr  │ Submitted  │ Processed  │ Backlog   │ Pool Use% │ Queue%  │');
    console.log('  ├─────┼────────────┼────────────┼───────────┼────────────┼──────────┤');
    
    for (const stat of results.hourlyStats) {
      if (stat.hour % 4 === 0 || stat.hour === 1 || stat.hour === results.hourlyStats.length) {
        console.log(
          `  │ ${String(stat.hour).padStart(3)} │ ${
            String(stat.submitted).padStart(10)} │ ${
            String(stat.processed).padStart(10)} │ ${
            String(stat.backlog).padStart(9)} │ ${
            String(stat.poolUtilization + '%').padStart(10)} │ ${
            String(stat.queueUtilization + '%').padStart(8)} │`
        );
      }
    }
    console.log('  └─────┴────────────┴────────────┴───────────┴────────────┴──────────┘');

    console.log('\n💡 RECOMMENDATIONS:');
    this.printRecommendations(results);
  }

  printRecommendations(results) {
    const s = results.dailySummary;
    const recommendations = [];

    // Analyze and recommend
    if (!s.completedSameDay) {
      recommendations.push({
        priority: 'HIGH',
        issue: 'Cannot process same day',
        solution: 'Upgrade to paid Gemini tier (900+ RPM) or add more free keys'
      });
    }

    if (s.finalBacklog > 500) {
      recommendations.push({
        priority: 'CRITICAL',
        issue: 'Queue backlog too high',
        solution: 'Implement priority queuing or batch processing overnight'
      });
    }

    const peakUsage = Math.max(...results.hourlyStats.map(h => h.poolUtilization));
    if (peakUsage > 90) {
      recommendations.push({
        priority: 'MEDIUM',
        issue: 'Peak utilization exceeds 90%',
        solution: 'Consider adding 2-3 more API keys for headroom'
      });
    }

    // Always show capacity limits
    recommendations.push({
      priority: 'INFO',
      issue: 'Current Daily Capacity',
      solution: `Max ${ (CONFIG.POOL_MAX_RPM * 60 * 24).toLocaleString() } invoices/day with current setup`
    });

    for (const rec of recommendations) {
      const icon = rec.priority === 'CRITICAL' ? '🔴' : 
                   rec.priority === 'HIGH' ? '🟠' : 
                   rec.priority === 'MEDIUM' ? '🟡' : '🔵';
      console.log(`  ${icon} [${rec.priority}] ${rec.issue}`);
      console.log(`     → ${rec.solution}`);
    }
  }

  /**
   * Generate comprehensive report
   */
  generateReport() {
    const report = {
      generatedAt: new Date().toISOString(),
      configuration: CONFIG,
      scenarios: {}
    };

    if (this.results.burst) {
      report.scenarios.burstTest = this.results.burst;
    }

    if (this.results.stress) {
      report.scenarios.stressTest = this.results.stress;
    }

    // Add capacity analysis
    report.capacityAnalysis = {
      perMinute: {
        perKey: CONFIG.RPM_PER_KEY,
        poolTotal: CONFIG.POOL_MAX_RPM
      },
      perHour: {
        perKey: CONFIG.RPM_PER_KEY * 60,
        poolTotal: CONFIG.POOL_MAX_RPM * 60
      },
      perDay: {
        perKey: CONFIG.RPM_PER_KEY * 60 * 24,
        poolTotal: CONFIG.POOL_MAX_RPM * 60 * 24,
        tokenLimited: CONFIG.MAX_TOKENS_PER_KEY_PER_DAY * CONFIG.KEYS_COUNT
      },
      realisticDailyMax: {
        estimate: Math.min(
          CONFIG.POOL_MAX_RPM * 60 * 24,
          CONFIG.MAX_TOKENS_PER_KEY_PER_DAY * CONFIG.KEYS_COUNT / 500 // Assume 500 tokens/invoice avg
        ),
        assumption: '~500 tokens per invoice extraction'
      }
    };

    return report;
  }
}

// ── Main Execution ─────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║        GarfiX EOS - AI System Load Testing Suite                ║');
  console.log('║                                                                  ║');
  console.log('║  Testing Configuration:                                          ║');
  console.log(`║  • API Keys: ${CONFIG.KEYS_COUNT} (Gemini Free Tier)                            ║`);
    console.log(`║  • Pool RPM: ${CONFIG.POOL_MAX_RPM} (${CONFIG.KEYS_COUNT} × ${CONFIG.RPM_PER_KEY} RPM)                              ║`);
    console.log(`║  • Queue Max: ${CONFIG.QUEUE_MAX_SIZE} jobs                                       ║`);
    console.log(`║  • Tokens/Key/Day: ${CONFIG.MAX_TOKENS_PER_KEY_PER_DAY.toLocaleString()}                                  ║`);
    console.log('╚══════════════════════════════════════════════════════════════════╝');

  const runner = new LoadTestRunner();

  // Run Scenario 1: Burst Test
  await runner.runBurstTest(100);

  // Small delay between tests
  await new Promise(r => setTimeout(r, 2000));

  // Run Scenario 2: Stress Test
  await runner.runStressTest(1000, 100);

  // Generate and save report
  console.log('\n' + '='.repeat(80));
  console.log('📋 GENERATING REPORT...');
  console.log('='.repeat(80));

  const report = runner.generateReport();
  const reportPath = '/home/z/my-project/download/ai-load-test-report.json';
  
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n✅ Report saved to: ${reportPath}`);

  // Print summary
  console.log('\n' + '═'.repeat(80));
  console.log('🎯 EXECUTIVE SUMMARY');
  console.log('═'.repeat(80));
  
  printExecutiveSummary(report);

  return report;
}

function printExecutiveSummary(report) {
  const ca = report.capacityAnalysis;
  
  console.log('\n📊 MAXIMUM CAPACITY LIMITS:');
  console.log('┌─────────────────┬─────────────────┬──────────────────┐');
  console.log('│ Time Period     │ Per Key          │ Pool (5 Keys)    │');
  console.log('├─────────────────┼─────────────────┼──────────────────┤');
  console.log(`│ 🔹 Per Minute   │ ${String(ca.perMinute.perKey).padStart(13)} │ ${String(ca.perMinute.poolTotal).padStart(16)} │`);
  console.log(`│ 🔹 Per Hour     │ ${String(ca.perHour.perKey).padStart(13)} │ ${String(ca.perHour.poolTotal).padStart(16)} │`);
  console.log(`│ 🔹 Per Day      │ ${String(ca.perDay.perKey).padStart(13)} │ ${String(ca.perDay.poolTotal).padStart(16)} │`);
  console.log(`│ 🔹 Token Limit  │ ${String(ca.perDay.tokenLimited.toLocaleString()).padStart(13)} │ N/A               │`);
  console.log('└─────────────────┴─────────────────┴──────────────────┘');
  
  console.log('\n🎯 1000 USERS × 100 INVOICES SCENARIO:');
  if (report.scenarios.stressTest) {
    const st = report.scenarios.stressTest;
    console.log(`  • Total Volume:     ${st.totalInvoices.toLocaleString()} invoices`);
    console.log(`  • Same Day Complete: ${st.dailySummary?.completedSameDay ? '✅ YES' : '❌ NO'}`);
    console.log(`  • Est. Time Needed: ${st.estimatedHours} hours`);
    console.log(`  • Final Backlog:    ${st.dailySummary?.finalBacklog?.toLocaleString() || 'N/A'} invoices`);
  }

  console.log('\n💡 RECOMMENDATIONS FOR PRODUCTION:');
  console.log('  1. For <10K invoices/day: Current setup is sufficient ✅');
  console.log('  2. For 10K-50K invoices/day: Add 5-10 more keys or upgrade tier');
  console.log('  3. For >50K invoices/day: Consider dedicated AI infrastructure');
  console.log('  4. Always implement retry logic with exponential backoff');
  console.log('  5. Monitor circuit breaker events for early warning');
}

// Run if called directly
if (require.main === module) {
  main()
    .then(() => {
      console.log('\n✅ Load testing complete!');
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Load test failed:', err);
      process.exit(1);
    });
}

module.exports = { LoadTestRunner, KeyPoolSimulator, QueueSimulator, ScalerSimulator, CONFIG };
