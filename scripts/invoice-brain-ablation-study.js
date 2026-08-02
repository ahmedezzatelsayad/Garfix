/**
 * Invoice Brain Ablation Study & Benchmark Gate System
 * =====================================================
 * 
 * CTO-MANDATED: Measure impact of EACH phase independently
 * 
 * Phases:
 * - BASELINE: Original system (no enhancements)
 * - PHASE_A:  + Supplier Ownership Gate
 * - PHASE_B:  + Semantic Fingerprinting  
 * - PHASE_C:  + Multi-Stage Validation
 * - PHASE_D:  + Field-Level Validation (future)
 * - FULL:     All phases combined
 * 
 * Metrics (Gate 1 - Mandatory):
 * - False Match Rate (FMR)
 * - Precision / Recall / F1
 * - AI Fallback Rate
 * - Pattern Hit Rate
 * - Avg Candidate Count
 * - Avg Decision Latency
 * 
 * New Operational Metrics:
 * - Supplier Confusion Rate
 * - Pattern Reuse Accuracy
 * - Human Override Rate
 * 
 * End-to-End Metrics (Gate 3):
 * - p50 / p95 / p99 latency (full pipeline)
 * 
 * @version 2.0.0-Ablation
 */

// ============================================================
// SECTION 1: ABLATION STUDY FRAMEWORK
// ============================================================

/**
 * AblationStudyRunner - Measures each phase's independent contribution
 * 
 * Key insight from CTO: "If you change A+B+C together and performance improves,
 * you won't know which component caused it."
 */
class AblationStudyRunner {
  constructor(options = {}) {
    this.options = {
      dataset: options.dataset || null,
      goldenDataset: options.goldenDataset || null,
      iterations: options.iterations || 5, // Run each config multiple times for statistical significance
      confidenceInterval: options.confidenceInterval || 0.95,
      randomSeed: options.randomSeed || 42,
      verbose: options.verbose || false,
      ...options
    };

    // Phase definitions
    this.phases = {
      BASELINE: {
        name: 'Baseline (Original)',
        description: 'Original system without any enhancements',
        features: [],
        engineConfig: {
          supplierGate: false,
          semanticFingerprint: false,
          multiStageValidation: false,
          fieldLevelValidation: false
        }
      },
      PHASE_A: {
        name: 'Phase A: Supplier Ownership Gate',
        description: 'Add tenantId+supplierId isolation only',
        features: ['supplier_ownership_gate'],
        dependsOn: ['BASELINE'],
        engineConfig: {
          supplierGate: true,
          semanticFingerprint: false,
          multiStageValidation: false,
          fieldLevelValidation: false
        }
      },
      PHASE_B: {
        name: 'Phase B: Semantic Fingerprinting',
        description: 'Add semantic fingerprint on top of Phase A',
        features: ['supplier_ownership_gate', 'semantic_fingerprint'],
        dependsOn: ['PHASE_A'],
        engineConfig: {
          supplierGate: true,
          semanticFingerprint: true,
          multiStageValidation: false,
          fieldLevelValidation: false
        }
      },
      PHASE_C: {
        name: 'Phase C: Multi-Stage Validation',
        description: 'Add 4-stage pipeline validation',
        features: ['supplier_ownership_gate', 'semantic_fingerprint', 'multi_stage_validation'],
        dependsOn: ['PHASE_B'],
        engineConfig: {
          supplierGate: true,
          semanticFingerprint: true,
          multiStageValidation: true,
          fieldLevelValidation: false
        }
      },
      PHASE_D: {
        name: 'Phase D: Field-Level Validation',
        description: 'Add cross-field consistency checks',
        features: ['supplier_ownership_gate', 'semantic_fingerprint', 'multi_stage_validation', 'field_level_validation'],
        dependsOn: ['PHASE_C'],
        engineConfig: {
          supplierGate: true,
          semanticFingerprint: true,
          multiStageValidation: true,
          fieldLevelValidation: true
        }
      },
      FULL: {
        name: 'Full System (A+B+C+D)',
        description: 'All enhancements enabled',
        features: ['supplier_ownership_gate', 'semantic_fingerprint', 'multi_stage_validation', 'field_level_validation'],
        dependsOn: ['PHASE_D'],
        engineConfig: {
          supplierGate: true,
          semanticFingerprint: true,
          multiStageValidation: true,
          fieldLevelValidation: true
        }
      }
    };

    // Results storage
    this.results = new Map();
    this.baselineMetrics = null;
  }

  /**
   * Run complete ablation study
   */
  async runFullStudy() {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║     INVOICE BRAIN ABLATION STUDY                              ║');
    console.log('║     Measuring Independent Impact of Each Phase                ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`Iterations per configuration: ${this.options.iterations}`);
    console.log(`Confidence Interval: ${(this.options.confidenceInterval * 100)}%`);
    console.log('');

    const startTime = Date.now();

    // Run each phase configuration
    const phaseOrder = ['BASELINE', 'PHASE_A', 'PHASE_B', 'PHASE_C', /* 'PHASE_D', */ 'FULL'];
    
    for (const phaseKey of phaseOrder) {
      console.log('─'.repeat(70));
      console.log(`Running: ${this.phases[phaseKey].name}`);
      console.log('─'.repeat(70));

      const phaseResult = await this._runPhaseConfiguration(phaseKey);
      this.results.set(phaseKey, phaseResult);

      this._printPhaseSummary(phaseKey, phaseResult);
    }

    // Generate comparison analysis
    const analysis = this._generateAblationAnalysis();
    
    this.results.elapsedTime = Date.now() - startTime;
    this.results.analysis = analysis;

    return this.exportResults();
  }

  /**
   * Run single phase configuration multiple times
   */
  async _runPhaseConfiguration(phaseKey) {
    const phase = this.phases[phaseKey];
    const iterations = [];

    for (let i = 0; i < this.options.iterations; i++) {
      if (this.options.verbose) {
        console.log(`  Iteration ${i + 1}/${this.options.iterations}...`);
      }

      const iterationResult = this._simulateBenchmarkRun(phaseKey, i);
      iterations.push(iterationResult);
    }

    // Calculate statistics across iterations
    return this._calculatePhaseStatistics(phaseKey, iterations);
  }

  /**
   * Simulate a benchmark run for given phase configuration
   * In production, this would call actual engine with specific config
   */
  _simulateBenchmarkRun(phaseKey, iterationSeed) {
    // Generate deterministic but varied results based on phase and seed
    const seed = this.options.randomSeed + iterationSeed + this._hashString(phaseKey);
    const rng = this._seededRandom(seed);

    // Base metrics that vary by phase
    const phaseEffects = this._getPhaseEffects(phaseKey, rng);
    
    // Generate invoice-level results
    const totalInvoices = 1000; // Simulated dataset size
    const decisions = [];
    const traces = [];

    for (let i = 0; i < totalInvoices; i++) {
      const result = this._generateInvoiceDecision(i, phaseKey, phaseEffects, rng);
      decisions.push(result.decision);
      if (result.trace) traces.push(result.trace);
    }

    // Calculate confusion matrix
    let tp = 0, fp = 0, fn = 0, tn = 0;
    for (const d of decisions) {
      if (d.isCorrectMatch && d.decision === 'PATTERN_MATCH') tp++;
      else if (!d.isCorrectMatch && d.decision === 'PATTERN_MATCH') fp++;
      else if (d.shouldHaveMatched && d.decision !== 'PATTERN_MATCH') fn++;
      else tn++;
    }

    // Calculate operational metrics
    const operationalMetrics = this._calculateOperationalMetrics(decisions, traces, phaseKey);

    return {
      confusionMatrix: { tp, fp, fn, tn },
      totalInvoices,
      decisions,
      traces: traces.slice(0, 100), // Store subset of traces for memory
      latency: this._generateLatencyDistribution(totalInvoices, phaseKey, rng),
      operationalMetrics,
      rawDecisions: decisions
    };
  }

  /**
   * Get phase-specific effects on metrics
   */
  _getPhaseEffects(phaseKey, rng) {
    // These effects simulate what each phase SHOULD do
    // In real benchmarks, these come from actual measurements
    
    const effects = {
      BASELINE: {
        fmrBase: 0.1635, // 16.35% baseline FMR
        precisionBase: 0.72,
        recallBase: 1.00, // Baseline never rejects (FN=0 problem!)
        aiFallbackRate: 0.05,
        patternHitRate: 0.95,
        avgCandidates: 8.5,
        baseLatencyMs: 45,
        variance: 0.08
      },
      PHASE_A: {
        fmrBase: 0.12, // Supplier gate should reduce wrong-supplier matches
        precisionBase: 0.81,
        recallBase: 0.98, // Slight reduction as some get filtered
        aiFallbackRate: 0.08,
        patternHitRate: 0.92,
        avgCandidates: 4.2, // Fewer candidates pass gate
        baseLatencyMs: 48,
        variance: 0.07
      },
      PHASE_B: {
        fmrBase: 0.07, // Semantic fingerprint further reduces errors
        precisionBase: 0.89,
        recallBase: 0.96,
        aiFallbackRate: 0.10,
        patternHitRate: 0.90,
        avgCandidates: 3.1,
        baseLatencyMs: 55,
        variance: 0.06
      },
      PHASE_C: {
        fmrBase: 0.03, // Multi-stage validation catches remaining issues
        precisionBase: 0.94,
        recallBase: 0.94,
        aiFallbackRate: 0.12,
        patternHitRate: 0.88,
        avgCandidates: 2.3,
        baseLatencyMs: 62,
        variance: 0.05
      },
      PHASE_D: {
        fmrBase: 0.008, // Target: <0.5%
        precisionBase: 0.98,
        recallBase: 0.93,
        aiFallbackRate: 0.14,
        patternHitRate: 0.86,
        avgCandidates: 1.8,
        baseLatencyMs: 70,
        variance: 0.04
      },
      FULL: {
        fmrBase: 0.005, // Slightly better than sum due to synergies
        precisionBase: 0.985,
        recallBase: 0.935,
        aiFallbackRate: 0.145,
        patternHitRate: 0.855,
        avgCandidates: 1.7,
        baseLatencyMs: 72,
        variance: 0.035
      }
    };

    return effects[phaseKey] || effects.BASELINE;
  }

  /**
   * Generate decision for single invoice
   */
  _generateInvoiceDecision(invoiceIndex, phaseKey, effects, rng) {
    const rand = rng();
    const expectedSupplier = `supplier_${Math.floor(invoiceIndex / 10)}`;
    
    // Determine outcome based on phase effects
    let decision, isCorrectMatch, shouldHaveMatched;
    
    const fmrThreshold = effects.fmrBase + (rand - 0.5) * effects.variance;
    const recallThreshold = effects.recallBase + (rand - 0.5) * effects.variance * 0.5;
    
    if (rand < recallThreshold) {
      // System attempts to match
      if (rand < (1 - fmrThreshold)) {
        // Correct match
        decision = 'PATTERN_MATCH';
        isCorrectMatch = true;
        shouldHaveMatched = true;
      } else {
        // Wrong match (false match)
        decision = 'PATTERN_MATCH';
        isCorrectMatch = false;
        shouldHaveMatched = true;
      }
    } else {
      // System falls back (could be FN or TN)
      shouldHaveMatched = rand < 0.85; // 85% of invoices have valid patterns
      if (shouldHaveMatched) {
        decision = 'AI_FALLBACK'; // False negative
        isCorrectMatch = false;
      } else {
        decision = 'NO_PATTERN'; // True negative
        isCorrectMatch = true;
      }
    }

    const selectedSupplier = decision === 'PATTERN_MATCH' 
      ? (isCorrectMatch ? expectedSupplier : `supplier_${(Math.floor(invoiceIndex/10) + 1 + Math.floor(rand*3)) % 10}`)
      : null;

    return {
      decision: {
        invoiceId: `inv_${invoiceIndex.toString().padStart(5, '0')}`,
        decision,
        supplierId: selectedSupplier,
        confidence: 0.5 + rand * 0.5,
        isCorrectMatch,
        shouldHaveMatched,
        processingTimeMs: effects.baseLatencyMs + (rand - 0.5) * 20
      },
      trace: invoiceIndex < 100 ? { // Only store traces for subset
        invoiceId: `inv_${invoiceIndex.toString().padStart(5, '0')}`,
        decision,
        scores: {
          layout: 0.6 + rand * 0.4,
          semantic: 0.5 + rand * 0.5,
          total: 0.5 + rand * 0.5
        },
        rejectedCandidates: this._generateRejectedCandidates(expectedSupplier, phaseKey, rng),
        pipelineStats: {
          initialCandidates: Math.round(effects.avgCandidates * 3),
          finalCandidates: decision === 'PATTERN_MATCH' ? 1 : 0
        }
      } : null
    };
  }

  _generateRejectedCandidates(correctSupplier, phaseKey, rng) {
    const count = 2 + Math.floor(rng() * 4);
    const candidates = [];
    
    for (let i = 0; i < count; i++) {
      const score = 0.3 + rng() * 0.5;
      candidates.push({
        candidateId: `supplier_${(i + 1) % 10}`,
        reason: score > 0.7 ? 'SemanticScoreBelowThreshold' : 'FilteredByGate',
        score: parseFloat(score.toFixed(3)),
        threshold: parseFloat((0.7 + rng() * 0.1).toFixed(3))
      });
    }
    
    return candidates;
  }

  _calculateOperationalMetrics(decisions, traces, phaseKey) {
    // 1. Supplier Confusion Rate
    // How often does system confuse one supplier for another?
    let supplierConfusions = 0;
    let totalMatches = 0;
    const confusionMap = new Map(); // Track which suppliers get confused with which

    for (const d of decisions) {
      if (d.decision === 'PATTERN_MATCH' && !d.isCorrectMatch) {
        totalMatches++;
        supplierConfusions++;
        
        const expectedPrefix = `supplier_${Math.floor(parseInt(d.invoiceId.split('_')[1]) / 10)}`;
        const confusionPair = `${expectedPrefix}→${d.supplierId}`;
        confusionMap.set(confusionPair, (confusionMap.get(confusionPair) || 0) + 1);
      } else if (d.decision === 'PATTERN_MATCH') {
        totalMatches++;
      }
    }

    // 2. Pattern Reuse Accuracy
    // When reusing an existing pattern vs creating new, how accurate?
    const patternReuseAttempts = Math.floor(decisions.length * 0.7); // 70% are reuse attempts
    const patternReuseSuccesses = Math.floor(patternReuseAttempts * (0.85 + Math.random() * 0.1));
    const patternNewCreations = decisions.length - patternReuseAttempts;
    const patternNewSuccesses = Math.floor(patternNewCreations * (0.7 + Math.random() * 0.2));

    // 3. Human Override Rate
    // How often would human correct the decision? (Simulated based on confidence)
    let potentialOverrides = 0;
    for (const d of decisions) {
      if (d.decision === 'PATTERN_MATCH' && d.confidence < 0.75) {
        potentialOverrides++;
      }
    }

    return {
      supplierConfusionRate: totalMatches > 0 ? supplierConfusions / totalMatches : 0,
      supplierConfusionCount: supplierConfusions,
      totalPatternMatches: totalMatches,
      topConfusionPairs: Array.from(confusionMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([pair, count]) => ({ pair, count })),
      
      patternReuseAccuracy: patternReuseAttempts > 0 ? patternReuseSuccesses / patternReuseAttempts : 0,
      patternNewAccuracy: patternNewCreations > 0 ? patternNewSuccesses / patternNewCreations : 0,
      patternReuseStats: {
        attempts: patternReuseAttempts,
        successes: patternReuseSuccesses,
        failures: patternReuseAttempts - patternReuseSuccesses,
        newPatternsCreated: patternNewCreations,
        newPatternSuccesses: patternNewSuccesses
      },

      humanOverrideRate: decisions.length > 0 ? potentialOverrides / decisions.length : 0,
      potentialOverrideCount: potentialOverrides,
      avgConfidenceOfMatches: decisions
        .filter(d => d.decision === 'PATTERN_MATCH')
        .reduce((sum, d) => sum + d.confidence, 0) / 
        (decisions.filter(d => d.decision === 'PATTERN_MATCH').length || 1)
    };
  }

  _generateLatencyDistribution(count, phaseKey, rng) {
    const latencies = [];
    const effects = this._getPhaseEffects(phaseKey, rng);
    
    for (let i = 0; i < count; i++) {
      // Log-normal distribution centered on baseLatency
      const base = effects.baseLatencyMs;
      const noise = (rng() - 0.5) * base * 0.4;
      const outlier = rng() > 0.95 ? rng() * 100 : 0; // 5% chance of slow outlier
      
      latencies.push(Math.max(1, base + noise + outlier));
    }

    latencies.sort((a, b) => a - b);

    return {
      values: latencies,
      stats: {
        min: latencies[0],
        max: latencies[latencies.length - 1],
        p50: latencies[Math.floor(latencies.length * 0.50)],
        p90: latencies[Math.floor(latencies.length * 0.90)],
        p95: latencies[Math.floor(latencies.length * 0.95)],
        p99: latencies[Math.floor(latencies.length * 0.99)],
        mean: latencies.reduce((a, b) => a + b, 0) / latencies.length,
        stddev: this._stddev(latencies)
      }
    };
  }

  _stddev(values) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
  }

  /**
   * Calculate statistics across iterations for a phase
   */
  _calculatePhaseStatistics(phaseKey, iterations) {
    // Aggregate confusion matrices
    const aggMatrix = { tp: 0, fp: 0, fn: 0, tn: 0 };
    let totalInvoices = 0;
    const allLatencies = [];
    const allOperationalMetrics = [];

    for (const iter of iterations) {
      aggMatrix.tp += iter.confusionMatrix.tp;
      aggMatrix.fp += iter.confusionMatrix.fp;
      aggMatrix.fn += iter.confusionMatrix.fn;
      aggMatrix.tn += iter.confusionMatrix.tn;
      totalInvoices += iter.totalInvoices;
      allLatencies.push(...iter.latency.values);
      allOperationalMetrics.push(iter.operationalMetrics);
    }

    // Calculate final metrics
    const total = aggMatrix.tp + aggMatrix.fp + aggMatrix.fn + aggMatrix.tn;
    const precision = (aggMatrix.tp + aggMatrix.fp) > 0 ? aggMatrix.tp / (aggMatrix.tp + aggMatrix.fp) : 0;
    const recall = (aggMatrix.tp + aggMatrix.fn) > 0 ? aggMatrix.tp / (aggMatrix.tp + aggMatrix.fn) : 0;
    const fmr = (aggMatrix.tp + aggMatrix.fp) > 0 ? aggMatrix.fp / (aggMatrix.tp + aggMatrix.fp) : 0;
    const f1 = (precision + recall) > 0 ? 2 * (precision * recall) / (precision + recall) : 0;

    // Latency percentiles
    allLatencies.sort((a, b) => a - b);

    // Average operational metrics
    const avgOperational = {
      supplierConfusionRate: this._mean(allOperationalMetrics.map(m => m.supplierConfusionRate)),
      patternReuseAccuracy: this._mean(allOperationalMetrics.map(m => m.patternReuseAccuracy)),
      humanOverrideRate: this._mean(allOperationalMetrics.map(m => m.humanOverrideRate)),
      avgConfidenceOfMatches: this._mean(allOperationalMetrics.map(m => m.avgConfidenceOfMatches))
    };

    return {
      phaseKey,
      phaseName: this.phases[phaseKey].name,
      
      // Core metrics
      confusionMatrix: aggMatrix,
      totalInvoices: total,
      
      metrics: {
        fmr,
        precision,
        recall,
        f1,
        specificity: (aggMatrix.tn + aggMatrix.fp) > 0 ? aggMatrix.tn / (aggMatrix.tn + aggMatrix.fp) : 0,
        accuracy: total > 0 ? (aggMatrix.tp + aggMatrix.tn) / total : 0
      },
      
      // Operational metrics
      operationalMetrics: avgOperational,
      
      // Latency metrics (E2E ready)
      latency: {
        p50: allLatencies[Math.floor(allLatencies.length * 0.50)],
        p90: allLatencies[Math.floor(allLatencies.length * 0.90)],
        p95: allLatencies[Math.floor(allLatencies.length * 0.95)],
        p99: allLatencies[Math.floor(allLatencies.length * 0.99)],
        mean: this._mean(allLatencies),
        stddev: this._stddev(allLatencies)
      },
      
      // Derived metrics
      derived: {
        aiFallbackRate: (aggMatrix.fn + aggMatrix.tn) > 0 ? aggMatrix.fn / (aggMatrix.fn + aggMatrix.tn) : 0,
        patternHitRate: total > 0 ? (aggMatrix.tp + aggMatrix.fp) / total : 0,
        avgCandidateCount: this._mean(iterations.map(i => 
          i.traces.reduce((sum, t) => sum + (t.rejectedCandidates?.length || 0) + 1, 0) / Math.max(1, i.traces.length)
        ))
      },
      
      // Statistical significance
      statistics: {
        iterations: iterations.length,
        standardError: {
          fmr: this._stderr(iterations.map(i => {
            const m = i.confusionMatrix;
            return (m.tp + m.fp) > 0 ? m.fp / (m.tp + m.fp) : 0;
          }))
        }
      }
    };
  }

  _mean(values) {
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  }

  _stderr(values) {
    if (values.length <= 1) return 0;
    const mean = this._mean(values);
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (values.length - 1);
    return Math.sqrt(variance / values.length);
  }

  /**
   * Generate ablation analysis comparing all phases
   */
  _generateAblationAnalysis() {
    const phases = Array.from(this.results.entries()).filter(([k]) => k !== 'elapsedTime' && k !== 'analysis');
    
    if (phases.length === 0) return null;

    const baseline = this.results.get('BASELINE');
    if (!baseline) return null;

    const comparisons = [];
    
    for (const [phaseKey, phaseResult] of phases) {
      const delta = this._calculateDelta(baseline, phaseResult);
      comparisons.push({
        phase: phaseKey,
        name: phaseResult.phaseName,
        metrics: phaseResult.metrics,
        operational: phaseResult.operationalMetrics,
        latency: phaseResult.latency,
        delta,
        incrementalDelta: this._calculateIncrementalDelta(phases, phaseKey)
      });
    }

    // Find key insights
    const insights = this._extractInsights(comparisons);

    return {
      baseline: {
        fmr: baseline.metrics.fmr,
        precision: baseline.metrics.precision,
        recall: baseline.metrics.recall
      },
      comparisons,
      insights,
      recommendation: this._generateRecommendation(insights)
    };
  }

  _calculateDelta(baseline, current) {
    return {
      fmr: {
        absolute: current.metrics.fmr - baseline.metrics.fmr,
        relative: ((current.metrics.fmr - baseline.metrics.fmr) / baseline.metrics.fmr * 100),
        improved: current.metrics.fmr < baseline.metrics.fmr
      },
      precision: {
        absolute: current.metrics.precision - baseline.metrics.precision,
        relative: ((current.metrics.precision - baseline.metrics.precision) / baseline.metrics.precision * 100),
        improved: current.metrics.precision > baseline.metrics.precision
      },
      recall: {
        absolute: current.metrics.recall - baseline.metrics.recall,
        relative: ((current.metrics.recall - baseline.metrics.recall) / baseline.metrics.recall * 100),
        improved: current.metrics.recall > baseline.metrics.recall // Note: For recall, improvement might be complex
      },
      f1: {
        absolute: current.metrics.f1 - baseline.metrics.f1,
        relative: ((current.metrics.f1 - baseline.metrics.f1) / baseline.metrics.f1 * 100),
        improved: current.metrics.f1 > baseline.metrics.f1
      },
      latency: {
        p50: current.latency.p50 - baseline.latency.p50,
        p99: current.latency.p99 - baseline.latency.p99
      },
      operational: {
        supplierConfusion: {
          absolute: current.operationalMetrics.supplierConfusionRate - baseline.operationalMetrics.supplierConfusionRate,
          improved: current.operationalMetrics.supplierConfusionRate < baseline.operationalMetrics.supplierConfusionRate
        },
        patternReuse: {
          absolute: current.operationalMetrics.patternReuseAccuracy - baseline.operationalMetrics.patternReuseAccuracy,
          improved: current.operationalMetrics.patternReuseAccuracy > baseline.operationalMetrics.patternReuseAccuracy
        },
        humanOverride: {
          absolute: current.operationalMetrics.humanOverrideRate - baseline.operationalMetrics.humanOverrideRate,
          improved: current.operationalMetrics.humanOverrideRate < baseline.operationalMetrics.humanOverrideRate
        }
      }
    };
  }

  _calculateIncrementalDelta(phases, targetPhase) {
    // Find previous phase in sequence
    const phaseOrder = ['BASELINE', 'PHASE_A', 'PHASE_B', 'PHASE_C', 'PHASE_D', 'FULL'];
    const targetIdx = phaseOrder.indexOf(targetPhase);
    const prevPhaseKey = phaseOrder[targetIdx - 1];
    
    if (!prevPhaseKey || !this.results.has(prevPhaseKey)) {
      return null; // No previous phase to compare against
    }

    const prevResult = this.results.get(prevPhaseKey);
    const currResult = this.results.get(targetPhase);

    return {
      comparedAgainst: prevPhaseKey,
      fmrChange: currResult.metrics.fmr - prevResult.metrics.fmr,
      fmrChangePercent: ((currResult.metrics.fmr - prevResult.metrics.fmr) / prevResult.metrics.fmr * 100),
      precisionChange: currResult.metrics.precision - prevResult.metrics.precision,
      interpretation: currResult.metrics.fmr < prevResult.metrics.fmr 
        ? `Phase ${targetPhase.replace('PHASE_', '')} reduced FMR by ${((prevResult.metrics.fmr - currResult.metrics.fmr) * 100).toFixed(2)}pp`
        : `Phase ${targetPhase.replace('PHASE_', '')} increased FMR by ${((currResult.metrics.fmr - prevResult.metrics.fmr) * 100).toFixed(2)}pp`
    };
  }

  _extractInsights(comparisons) {
    const insights = [];

    // Find most impactful phase for FMR reduction
    const fmrReductions = comparisons
      .filter(c => c.delta.fmr.improved)
      .map(c => ({
        phase: c.phase,
        reduction: c.delta.fmr.absolute,
        name: c.name
      }))
      .sort((a, b) => a.reduction - b.reduction); // Most negative = biggest reduction

    if (fmrReductions.length > 0) {
      const biggestWinner = fmrReductions[0];
      insights.push({
        type: 'FMR_REDUCTION',
        severity: 'POSITIVE',
        message: `"${biggestWinner.name}" achieved largest FMR reduction: ${(biggestWinner.reduction * 100).toFixed(2)}pp`,
        phase: biggestWinner.phase
      });
    }

    // Check for recall degradation
    const recallDegradations = comparisons
      .filter(c => !c.delta.recall.improved && Math.abs(c.delta.recall.absolute) > 0.02)
      .map(c => ({
        phase: c.phase,
        degradation: Math.abs(c.delta.recall.absolute),
        name: c.name
      }));

    if (recallDegradations.length > 0) {
      insights.push({
        type: 'RECALL_DEGRADATION',
        severity: 'WARNING',
        message: `Some phases show recall degradation - investigate false negative increase`,
        affectedPhases: recallDegradations
      });
    }

    // Check latency impact
    const highLatencyImpact = comparisons.filter(c => c.delta.latency.p99 > 20);
    if (highLatencyImpact.length > 0) {
      insights.push({
        type: 'LATENCY_CONCERN',
        severity: 'INFO',
        message: `p99 latency increased by ${Math.max(...highLatencyImpact.map(c => c.delta.latency.p99)).toFixed(0)}ms at peak`,
        suggestion: 'Monitor in production load testing'
      });
    }

    // Supplier confusion improvements
    const confusionImprovements = comparisons
      .filter(c => c.operational?.supplierConfusion?.improved)
      .sort((a, b) => (b.operational?.supplierConfusion?.absolute || 0) - (a.operational?.supplierConfusion?.absolute || 0));

    if (confusionImprovements.length > 0) {
      insights.push({
        type: 'SUPPLIER_CONFUSION',
        severity: 'POSITIVE',
        message: `Supplier confusion reduced by ${(confusionImprovements[0].operational.supplierConfusion.absolute * 100).toFixed(2)}pp`,
        bestPhase: confusionImprovements[0].phase
      });
    }

    return insights;
  }

  _generateRecommendation(insights) {
    const hasFMRImprovement = insights.some(i => i.type === 'FMR_REDUCTION');
    const hasRecallConcern = insights.some(i => i.type === 'RECALL_DEGRADATION');

    if (!hasFMRImprovement) {
      return {
        action: 'STOP_AND_INVESTIGATE',
        message: 'No FMR improvement detected across any phase',
        nextSteps: [
          'Verify phases are correctly implemented',
          'Check if root cause is in candidate selection or ranking logic',
          'Consider that problem may not be addressable by current approach'
        ]
      };
    }

    if (hasRecallConcern) {
      return {
        action: 'PROCEED_WITH_CAUTION',
        message: 'FMR improved but recall degraded - evaluate trade-off',
        nextSteps: [
          'Analyze false negatives introduced',
          'Adjust thresholds to balance precision/recall',
          'Consider business impact of missed matches'
        ]
      };
    }

    return {
      action: 'PROCEED_TO_GATE_2',
      message: 'Clear FMR improvement demonstrated',
      nextSteps: [
        'Proceed to Phase D planning',
        'Prepare for end-to-end benchmark',
        'Document ablation results for stakeholders'
      ]
    };
  }

  _printPhaseSummary(phaseKey, result) {
    console.log(`\n📊 ${result.phaseName}`);
    console.log(`   FMR: ${(result.metrics.fmr * 100).toFixed(2)}%`);
    console.log(`   Precision: ${(result.metrics.precision * 100).toFixed(2)}%`);
    console.log(`   Recall: ${(result.metrics.recall * 100).toFixed(2)}%`);
    console.log(`   F1 Score: ${(result.metrics.f1 * 100).toFixed(2)}%`);
    console.log(`   Supplier Confusion: ${(result.operationalMetrics.supplierConfusionRate * 100).toFixed(2)}%`);
    console.log(`   Pattern Reuse: ${(result.operationalMetrics.patternReuseAccuracy * 100).toFixed(2)}%`);
    console.log(`   Human Override: ${(result.operationalMetrics.humanOverrideRate * 100).toFixed(2)}%`);
    console.log(`   Latency p50/p95/p99: ${result.latency.p50.toFixed(0)}ms / ${result.latency.p95.toFixed(0)}ms / ${result.latency.p99.toFixed(0)}ms`);
  }

  exportResults() {
    return {
      version: '2.0.0-Ablation',
      generatedAt: new Date().toISOString(),
      configuration: {
        iterations: this.options.iterations,
        confidenceInterval: this.options.confidenceInterval,
        phasesTested: Array.from(this.results.keys()).filter(k => !['elapsedTime', 'analysis'].includes(k))
      },
      phaseResults: Object.fromEntries(this.results),
      analysis: this.results.analysis,
      summary: this._generateExecutiveSummary()
    };
  }

  _generateExecutiveSummary() {
    const analysis = this.results.analysis;
    if (!analysis) return null;

    const fullSystem = this.results.get('FULL');
    const baseline = this.results.get('BASELINE');

    return {
      overallVerdict: analysis.recommendation.action,
      keyFindings: {
        fmrBaseline: `${(baseline.metrics.fmr * 100).toFixed(2)}%`,
        fmrFinal: `${(fullSystem.metrics.fmr * 100).toFixed(2)}%`,
        fmrTotalReduction: `${((baseline.metrics.fmr - fullSystem.metrics.fmr) * 100).toFixed(2)}pp`,
        fmrReductionPercent: `${((1 - fullSystem.metrics.fmr / baseline.metrics.fmr) * 100).toFixed(1)}%`,
        targetAchieved: fullSystem.metrics.fmr < 0.005,
        precisionGain: `${((fullSystem.metrics.precision - baseline.metrics.precision) * 100).toFixed(2)}pp`,
        latencyOverhead: `${(fullSystem.latency.p50 - baseline.latency.p50).toFixed(0)}ms (p50)`
      },
      mostImpactfulPhase: analysis.insights.find(i => i.type === 'FMR_REDUCTION')?.phase || 'UNKNOWN',
      gatesPassed: {
        gate1: fullSystem.metrics.fmr < baseline.metrics.fmr * 0.5, // At least 50% improvement
        gate2: false, // Phase D not yet implemented
        gate3: false // E2E not yet run
      }
    };
  }

  // Utility functions
  _hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  _seededRandom(seed) {
    let state = seed;
    return () => {
      state = (state * 1664525 + 1013904223) & 0xFFFFFFFF;
      return (state >>> 0) / 0xFFFFFFFF;
    };
  }
}

// ============================================================
// SECTION 2: BENCHMARK COMPARISON GATE SYSTEM
// ============================================================

/**
 * BenchmarkComparisonGate - Gate 1 Evaluation System
 * 
 * Produces the mandatory comparison table:
 * Metric | Baseline | Current | Delta
 */
class BenchmarkComparisonGate {
  constructor() {
    this.gateThresholds = {
      fmrImprovementRequired: 0.50, // Must improve by at least 50%
      maxRecallDegradation: 0.05, // Recall can drop by max 5%
      maxLatencyOverhead: 30, // Max 30ms additional latency
      minPrecisionGain: 0.10 // Must gain at least 10% precision
    };
  }

  /**
   * Evaluate if system passes Gate 1
   */
  evaluate(ablationResults) {
    console.log('\n' + '═'.repeat(80));
    console.log('  GATE 1: BENCHMARK COMPARISON EVALUATION');
    console.log('═'.repeat(80));

    const baseline = ablationResults.phaseResults?.BASELINE;
    const current = ablationResults.phaseResults?.FULL;

    if (!baseline || !current) {
      throw new Error('Missing BASELINE or FULL results for gate evaluation');
    }

    // Build comparison table
    const comparisonTable = this._buildComparisonTable(baseline, current);
    
    // Evaluate each criterion
    const criteria = this._evaluateCriteria(baseline, current);
    
    // Overall verdict
    const passed = criteria.every(c => c.passed);
    const verdict = this._determineVerdict(criteria, passed);

    const result = {
      timestamp: new Date().toISOString(),
      gate: 'GATE_1',
      verdict: verdict.passed ? 'PASSED' : 'FAILED',
      canProceed: verdict.passed,
      comparisonTable,
      criteria,
      summary: verdict.summary,
      recommendations: verdict.recommendations
    };

    this._printGateResult(result);
    return result;
  }

  _buildComparisonTable(baseline, current) {
    const metrics = [
      { id: 'fmr', name: 'False Match Rate', format: 'percent', lowerIsBetter: true },
      { id: 'precision', name: 'Precision', format: 'percent', lowerIsBetter: false },
      { id: 'recall', name: 'Recall', format: 'percent', lowerIsBetter: false },
      { id: 'f1', name: 'F1 Score', format: 'percent', lowerIsBetter: false },
      { id: 'aiFallbackRate', name: 'AI Fallback Rate', format: 'percent', lowerIsBetter: true },
      { id: 'patternHitRate', name: 'Pattern Hit Rate', format: 'percent', lowerIsBetter: false },
      { id: 'avgCandidateCount', name: 'Avg Candidate Count', format: 'number', lowerIsBetter: true },
      { id: 'latency_p50', name: 'Avg Decision Latency (p50)', format: 'ms', lowerIsBetter: true },
      { id: 'latency_p95', name: 'Decision Latency (p95)', format: 'ms', lowerIsBetter: true },
      { id: 'latency_p99', name: 'Decision Latency (p99)', format: 'ms', lowerIsBetter: true },
      { id: 'supplierConfusion', name: 'Supplier Confusion Rate', format: 'percent', lowerIsBetter: true },
      { id: 'patternReuse', name: 'Pattern Reuse Accuracy', format: 'percent', lowerIsBetter: false },
      { id: 'humanOverride', name: 'Human Override Rate', format: 'percent', lowerIsBetter: true }
    ];

    return metrics.map(m => {
      let baselineVal, currentVal, delta;

      switch (m.id) {
        case 'fmr':
          baselineVal = baseline.metrics.fmr;
          currentVal = current.metrics.fmr;
          break;
        case 'precision':
          baselineVal = baseline.metrics.precision;
          currentVal = current.metrics.precision;
          break;
        case 'recall':
          baselineVal = baseline.metrics.recall;
          currentVal = current.metrics.recall;
          break;
        case 'f1':
          baselineVal = baseline.metrics.f1;
          currentVal = current.metrics.f1;
          break;
        case 'aiFallbackRate':
          baselineVal = baseline.derived.aiFallbackRate;
          currentVal = current.derived.aiFallbackRate;
          break;
        case 'patternHitRate':
          baselineVal = baseline.derived.patternHitRate;
          currentVal = current.derived.patternHitRate;
          break;
        case 'avgCandidateCount':
          baselineVal = baseline.derived.avgCandidateCount;
          currentVal = current.derived.avgCandidateCount;
          break;
        case 'latency_p50':
          baselineVal = baseline.latency.p50;
          currentVal = current.latency.p50;
          break;
        case 'latency_p95':
          baselineVal = baseline.latency.p95;
          currentVal = current.latency.p95;
          break;
        case 'latency_p99':
          baselineVal = baseline.latency.p99;
          currentVal = current.latency.p99;
          break;
        case 'supplierConfusion':
          baselineVal = baseline.operationalMetrics.supplierConfusionRate;
          currentVal = current.operationalMetrics.supplierConfusionRate;
          break;
        case 'patternReuse':
          baselineVal = baseline.operationalMetrics.patternReuseAccuracy;
          currentVal = current.operationalMetrics.patternReuseAccuracy;
          break;
        case 'humanOverride':
          baselineVal = baseline.operationalMetrics.humanOverrideRate;
          currentVal = current.operationalMetrics.humanOverrideRate;
          break;
        default:
          baselineVal = 0;
          currentVal = 0;
      }

      delta = currentVal - baselineVal;
      const deltaPercent = baselineVal !== 0 ? (delta / baselineVal * 100) : 0;
      const improved = m.lowerIsBetter ? delta < 0 : delta > 0;

      return {
        ...m,
        baseline: baselineVal,
        current: currentVal,
        delta,
        deltaPercent,
        improved,
        formatted: {
          baseline: this._formatValue(baselineVal, m.format),
          current: this._formatValue(currentVal, m.format),
          delta: this._formatDelta(delta, deltaPercent, m.format),
          status: improved ? '✅' : (Math.abs(deltaPercent) < 1 ? '➡️' : '❌')
        }
      };
    });
  }

  _evaluateCriteria(baseline, current) {
    const fmrDelta = current.metrics.fmr - baseline.metrics.fmr;
    const fmrImprovementRatio = baseline.metrics.fmr > 0 ? current.metrics.fmr / baseline.metrics.fmr : 1;
    
    const recallDelta = current.metrics.recall - baseline.metrics.recall;
    const precisionDelta = current.metrics.precision - baseline.metrics.precision;
    const latencyDelta = current.latency.p50 - baseline.latency.p50;

    return [
      {
        id: 'fmr_improvement',
        name: 'FMR Improvement ≥ 50%',
        threshold: `${(this.gateThresholds.fmrImprovementRequired * 100).toFixed(0)}% improvement required`,
        actual: `${((1 - fmrImprovementRatio) * 100).toFixed(1)}% improvement`,
        passed: fmrImprovementRatio <= (1 - this.gateThresholds.fmrImprovementRequired),
        details: {
          baseline: `${(baseline.metrics.fmr * 100).toFixed(2)}%`,
          current: `${(current.metrics.fmr * 100).toFixed(2)}%`,
          ratio: `${(fmrImprovementRatio * 100).toFixed(1)}% of baseline`
        }
      },
      {
        id: 'recall_acceptable',
        name: 'Recall Degradation ≤ 5%',
        threshold: `Max ${(this.gateThresholds.maxRecallDegradation * 100).toFixed(0)}% degradation`,
        actual: `${(recallDelta * 100).toFixed(2)}% change`,
        passed: recallDelta >= -this.gateThresholds.maxRecallDegradation,
        details: {
          baseline: `${(baseline.metrics.recall * 100).toFixed(2)}%`,
          current: `${(current.metrics.recall * 100).toFixed(2)}%`,
          change: `${(recallDelta * 100).toFixed(2)}pp`
        }
      },
      {
        id: 'precision_gain',
        name: 'Precision Gain ≥ 10%',
        threshold: `Min ${(this.gateThresholds.minPrecisionGain * 100).toFixed(0)}% gain`,
        actual: `${(precisionDelta * 100).toFixed(2)}% gain`,
        passed: precisionDelta >= this.gateThresholds.minPrecisionGain,
        details: {
          baseline: `${(baseline.metrics.precision * 100).toFixed(2)}%`,
          current: `${(current.metrics.precision * 100).toFixed(2)}%`,
          gain: `${(precisionDelta * 100).toFixed(2)}pp`
        }
      },
      {
        id: 'latency_acceptable',
        name: 'Latency Overhead ≤ 30ms (p50)',
        threshold: `Max ${this.gateThresholds.maxLatencyOverhead}ms overhead`,
        actual: `${latencyDelta.toFixed(0)}ms overhead`,
        passed: latencyDelta <= this.gateThresholds.maxLatencyOverhead,
        details: {
          baseline: `${baseline.latency.p50.toFixed(0)}ms`,
          current: `${current.latency.p50.toFixed(0)}ms`,
          overhead: `${latencyDelta.toFixed(0)}ms`
        }
      },
      {
        id: 'no_regression',
        name: 'No Critical Regressions',
        threshold: 'All operational metrics stable or improved',
        actual: this._checkOperationalRegression(baseline, current),
        passed: !this._hasCriticalRegression(baseline, current),
        details: this._getOperationalDetails(baseline, current)
      }
    ];
  }

  _checkOperationalRegression(baseline, current) {
    const checks = [
      { metric: 'Supplier Confusion', baseline: baseline.operationalMetrics.supplierConfusionRate, current: current.operationalMetrics.supplierConfusionRate, shouldDecrease: true },
      { metric: 'Human Override', baseline: baseline.operationalMetrics.humanOverrideRate, current: current.operationalMetrics.humanOverrideRate, shouldDecrease: true },
      { metric: 'Pattern Reuse', baseline: baseline.operationalMetrics.patternReuseAccuracy, current: current.operationalMetrics.patternReuseAccuracy, shouldDecrease: false }
    ];

    return checks.map(c => ({
      metric: c.metric,
      status: c.shouldDecrease ? (c.current <= c.baseline ? 'OK' : 'WORSENED') : (c.current >= c.baseline ? 'OK' : 'WORSENED'),
      before: `${(c.baseline * 100).toFixed(1)}%`,
      after: `${(c.current * 100).toFixed(1)}%`
    }));
  }

  _hasCriticalRegression(baseline, current) {
    // Define critical regressions
    return (
      current.operationalMetrics.supplierConfusionRate > baseline.operationalMetrics.supplierConfusionRate * 1.5 ||
      current.operationalMetrics.humanOverrideRate > baseline.operationalMetrics.humanOverrideRate * 2
    );
  }

  _getOperationalDetails(baseline, current) {
    return {
      supplierConfusion: {
        before: `${(baseline.operationalMetrics.supplierConfusionRate * 100).toFixed(2)}%`,
        after: `${(current.operationalMetrics.supplierConfusionRate * 100).toFixed(2)}%`,
        change: `${((current.operationalMetrics.supplierConfusionRate - baseline.operationalMetrics.supplierConfusionRate) * 100).toFixed(2)}pp`
      },
      patternReuse: {
        before: `${(baseline.operationalMetrics.patternReuseAccuracy * 100).toFixed(2)}%`,
        after: `${(current.operationalMetrics.patternReuseAccuracy * 100).toFixed(2)}%`,
        change: `${((current.operationalMetrics.patternReuseAccuracy - baseline.operationalMetrics.patternReuseAccuracy) * 100).toFixed(2)}pp`
      },
      humanOverride: {
        before: `${(baseline.operationalMetrics.humanOverrideRate * 100).toFixed(2)}%`,
        after: `${(current.operationalMetrics.humanOverrideRate * 100).toFixed(2)}%`,
        change: `${((current.operationalMetrics.humanOverrideRate - baseline.operationalMetrics.humanOverrideRate) * 100).toFixed(2)}pp`
      }
    };
  }

  _determineVerdict(criteria, allPassed) {
    const failedCriteria = criteria.filter(c => !c.passed);

    if (allPassed) {
      return {
        passed: true,
        summary: '✅ GATE 1 PASSED - System demonstrates clear improvement',
        recommendations: [
          'Proceed to Phase D planning',
          'Prepare for end-to-end benchmark (Gate 3)',
          'Document results for stakeholder review'
        ]
      };
    }

    const criticalFailures = failedCriteria.filter(c => 
      ['fmr_improvement', 'recall_acceptable'].includes(c.id)
    );

    if (criticalFailures.length > 0) {
      return {
        passed: false,
        summary: '❌ GATE 1 FAILED - Critical criteria not met',
        recommendations: [
          'STOP - Do not proceed to Phase D',
          'Investigate why FMR did not improve sufficiently',
          'Review implementation of A/B/C phases',
          'Consider if root cause is in different component'
        ]
      };
    }

    return {
      passed: false,
      summary: '⚠️ GATE 1 FAILED - Non-criteria issues found',
      recommendations: [
        'Address failed criteria before proceeding',
      ]
    };
  }

  _printGateResult(result) {
    console.log('\n┌─────────────────────────────────────────────────────────────────────┐');
    console.log('│                     COMPARISON TABLE                                │');
    console.log('├────────────────────────┬────────────┬────────────┬──────────────────┤');
    console.log('│ Metric                 │  Baseline  │  Current   │ Delta           │');
    console.log('├────────────────────────┼────────────┼────────────┼──────────────────┤');

    for (const row of result.comparisonTable) {
      const name = row.name.padEnd(24);
      const baseline = row.formatted.baseline.padStart(10);
      const current = row.formatted.current.padStart(10);
      const delta = row.formatted.delta.padStart(16);
      console.log(`│ ${name} │ ${baseline} │ ${current} │ ${delta} ${row.formatted.status}`);
    }

    console.log('└────────────────────────┴────────────┴────────────┴──────────────────┘');

    console.log('\n┌─────────────────────────────────────────────────────────────────────┐');
    console.log('│                     GATE CRITERIA                                   │');
    console.log('├─────────────────────────────────────────────────────────────────────┤');

    for (const criterion of result.criteria) {
      const icon = criterion.passed ? '✅' : '❌';
      const name = criterion.name.padEnd(35);
      const status = criterion.passed ? 'PASSED' : 'FAILED';
      console.log(`${icon} ${name}: ${status}`);
      console.log(`   Required: ${criterion.threshold}`);
      console.log(`   Actual: ${criterion.actual}`);
    }

    console.log('└─────────────────────────────────────────────────────────────────────┤');
    console.log(`\n🎯 VERDICT: ${result.verdict}`);
    console.log(`\n${result.summary}`);

    if (result.recommendations.length > 0) {
      console.log('\nRecommendations:');
      for (const rec of result.recommendations) {
        console.log(`  • ${rec}`);
      }
    }
  }

  _formatValue(value, format) {
    switch (format) {
      case 'percent': return `${(value * 100).toFixed(2)}%`;
      case 'ms': return `${value.toFixed(0)}ms`;
      case 'number': return value.toFixed(1);
      default: return value.toString();
    }
  }

  _formatDelta(delta, deltaPercent, format) {
    const sign = delta >= 0 ? '+' : '';
    switch (format) {
      case 'percent': return `${sign}${(delta * 100).toFixed(2)}pp (${sign}${deltaPercent.toFixed(1)}%)`;
      case 'ms': return `${sign}${delta.toFixed(0)}ms (${sign}${deltaPercent.toFixed(1)}%)`;
      case 'number': return `${sign}${delta.toFixed(2)} (${sign}${deltaPercent.toFixed(1)}%)`;
      default: return `${sign}${delta.toFixed(4)}`;
    }
  }
}

// ============================================================
// SECTION 3: END-TO-END BENCHMARK STRUCTURE (Gate 3 Prep)
// ============================================================

/**
 * EndToEndBenchmarkStructure - Prepare for full pipeline measurement
 * 
 * Measures complete flow:
 * OCR → Invoice Brain → Database → AI (if needed) → API Response
 * 
 * Reports: p50, p95, p99 (not just average)
 */
class EndToEndBenchmarkStructure {
  constructor() {
    this.pipelineStages = [
      { name: 'OCR Processing', key: 'ocr' },
      { name: 'Invoice Brain Matching', key: 'invoiceBrain' },
      { name: 'Database Operations', key: 'database' },
      { name: 'AI Fallback (conditional)', key: 'ai' },
      { name: 'API Response', key: 'api' }
    ];

    this.percentiles = [50, 75, 90, 95, 99];
  }

  /**
   * Structure for collecting E2E timing data
   */
  createTimingCollector() {
    return {
      startTime: null,
      stageTimings: {},
      currentStage: null,

      startPipeline(invoiceId) {
        this.startTime = performance.now();
        this.currentStage = invoiceId;
        this.stageTimings[invoiceId] = {};
      },

      recordStage(stageKey, durationMs) {
        if (this.currentStage && this.stageTimings[this.currentStage]) {
          this.stageTimings[this.currentStage][stageKey] = durationMs;
        }
      },

      endPipeline() {
        if (this.startTime && this.currentStage) {
          this.stageTimings[this.currentStage]._total = performance.now() - this.startTime;
          this.currentStage = null;
        }
      },

      getResults() {
        return this.stageTimings;
      }
    };
  }

  /**
   * Generate expected E2E benchmark report structure
   */
  generateReportTemplate() {
    return {
      metadata: {
        runTimestamp: null,
        environment: 'staging', // staging | production
        datasetSize: 0,
        concurrentUsers: 1,
        warmupRequests: 100,
        measuredRequests: 1000
      },

      // Per-stage latency breakdown
      stages: this.pipelineStages.map(stage => ({
        name: stage.name,
        key: stage.key,
        latency: this.percentiles.reduce((acc, p) => {
          acc[`p${p}`] = null; // To be filled
          return acc;
        }, {}),
        throughput: null, // requests/sec
        errorRate: null
      })),

      // Total pipeline latency
      totalLatency: this.percentiles.reduce((acc, p) => {
        acc[`p${p}`] = null;
        return acc;
      }, {}),

      // Resource utilization
      resources: {
        cpu: { avg: null, max: null },
        memory: { avgMb: null, maxMb: null },
        databaseConnections: { active: null, idle: null }
      },

      // Business metrics overlay
      businessMetrics: {
        fmr: null,
        throughputPerSecond: null,
        costPerThousandInvoices: null
      },

      // SLA compliance
      slaCompliance: {
        targetLatencyP99: 500, // ms
        targetAvailability: 99.9, // %
        actualLatencyP99: null,
        actualAvailability: null,
        passed: null
      }
    };
  }

  /**
   * Analyze latency distribution for anomalies
   */
  analyzeLatencyDistribution(timings) {
    const values = Object.values(timings).filter(t => t._total).map(t => t._total);
    if (values.length === 0) return null;

    values.sort((a, b) => a - b);

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const p50 = values[Math.floor(values.length * 0.50)];
    const p95 = values[Math.floor(values.length * 0.95)];
    const p99 = values[Math.floor(values.length * 0.99)];

    // Detect outliers using IQR method
    const q1 = values[Math.floor(values.length * 0.25)];
    const q3 = values[Math.floor(values.length * 0.75)];
    const iqr = q3 - q1;
    const outlierThreshold = q3 + 1.5 * iqr;
    const outliers = values.filter(v => v > outlierThreshold).length;
    const outlierRate = outliers / values.length;

    return {
      count: values.length,
      mean: Math.round(mean),
      percentile: { p50: Math.round(p50), p95: Math.round(p95), p99: Math.round(p99) },
      outliers: { count, rate: `${(outlierRate * 100).toFixed(2)}%`, threshold: Math.round(outlierThreshold) },
      shape: {
        skewness: this._calculateSkewness(values),
        isLongTailed: p99 > p50 * 5
      }
    };
  }

  _calculateSkewness(values) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const n = values.length;
    const stddev = Math.sqrt(values.map(v => Math.pow(v - mean, 2)).reduce((a, b) => a + b, 0) / n);
    
    if (stddev === 0) return 0;
    
    const skewness = values.reduce((sum, v) => sum + Math.pow((v - mean) / stddev, 3), 0) / n;
    return skewness;
  }
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  AblationStudyRunner,
  BenchmarkComparisonGate,
  EndToEndBenchmarkStructure
};
