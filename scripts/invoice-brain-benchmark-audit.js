/**
 * Invoice Brain BENCHMARK AUDIT TOOL v4.0
 * ======================================
 * PURPOSE: Debug and validate the benchmark pipeline itself.
 * 
 * This tool will:
 * 1. Trace EVERY decision with full context
 * 2. Log candidate counts at each filter stage
 * 3. Validate Confusion Matrix logic (fix TN=0 bug)
 * 4. Reconcile AI Fallback discrepancies
 */

// ============================================================
// SECTION 1: DETAILED DECISION TRACER
// ============================================================

class DetailedDecisionTracer {
  constructor() {
    this.traces = new Map();
    this.pipelineStats = {
      totalInvoices: 0,
      layoutMatchFound: 0,
      layoutMatchNotFound: 0,
      beforeTenantFilter: 0,
      afterTenantFilter: 0,
      beforeSupplierGate: 0,
      afterSupplierGate: 0,
      semanticScored: 0,
      semanticPassedThreshold: 0,
      semanticFailedThreshold: 0,
      finalPatternMatch: 0,
      finalAiFallback: 0,
      finalFalseMatch: 0,
      correctDecisions: 0,
      incorrectDecisions: 0
    };
    
    this.candidateAnalysis = {
      singleCandidate: { total: 0, correct: 0, incorrect: 0 },
      multipleCandidates: { total: 0, correct: 0, incorrect: 0 },
      noCandidates: { total: 0, sentToAi: 0 }
    };
  }
  
  recordDecision(invoiceId, trace) {
    this.traces.set(invoiceId, trace);
    this.pipelineStats.totalInvoices++;
    
    if (trace.stages) {
      this.updateStageStats(trace);
    }
    
    if (trace.candidateAnalysis) {
      this.updateCandidateAnalysis(trace);
    }
    
    if (trace.finalOutcome) {
      this.updateOutcomeStats(trace);
    }
  }
  
  updateStageStats(trace) {
    const stages = trace.stages;
    
    if (stages.layout && stages.layout.candidatesFound > 0) {
      this.pipelineStats.layoutMatchFound++;
    } else if (stages.layout) {
      this.pipelineStats.layoutMatchNotFound++;
    }
    
    if (stages.tenantFilter) {
      this.pipelineStats.beforeTenantFilter += stages.tenantFilter.inputCount || 0;
      this.pipelineStats.afterTenantFilter += stages.tenantFilter.outputCount || 0;
    }
    
    if (stages.supplierGate) {
      this.pipelineStats.beforeSupplierGate += stages.supplierGate.inputCount || 0;
      this.pipelineStats.afterSupplierGate += stages.supplierGate.outputCount || 0;
    }
    
    if (stages.semantic) {
      this.pipelineStats.semanticScored++;
      if (stages.semantic.passed) {
        this.pipelineStats.semanticPassedThreshold++;
      } else {
        this.pipelineStats.semanticFailedThreshold++;
      }
    }
  }
  
  updateCandidateAnalysis(trace) {
    const ca = trace.candidateAnalysis;
    
    switch (ca.scenario) {
      case 'single_candidate':
        this.candidateAnalysis.singleCandidate.total++;
        if (ca.wasCorrect) {
          this.candidateAnalysis.singleCandidate.correct++;
        } else {
          this.candidateAnalysis.singleCandidate.incorrect++;
        }
        break;
        
      case 'multiple_candidates':
        this.candidateAnalysis.multipleCandidates.total++;
        if (ca.wasCorrect) {
          this.candidateAnalysis.multipleCandidates.correct++;
        } else {
          this.candidateAnalysis.multipleCandidates.incorrect++;
        }
        break;
        
      case 'no_candidates':
        this.candidateAnalysis.noCandidates.total++;
        break;
    }
  }
  
  updateOutcomeStats(trace) {
    const outcome = trace.finalOutcome;
    
    switch (outcome.type) {
      case 'PATTERN_MATCH':
        this.pipelineStats.finalPatternMatch++;
        if (outcome.isCorrect) {
          this.pipelineStats.correctDecisions++;
        } else {
          this.pipelineStats.incorrectDecisions++;
        }
        break;
        
      case 'AI_FALLBACK':
        this.pipelineStats.finalAiFallback++;
        if (outcome.wasCorrectDecision) {
          this.pipelineStats.correctDecisions++;
        } else {
          this.pipelineStats.incorrectDecisions++;
        }
        break;
        
      case 'FALSE_MATCH':
        this.pipelineStats.finalFalseMatch++;
        this.pipelineStats.incorrectDecisions++;
        break;
    }
  }
  
  getAuditReport() {
    return {
      pipelineStats: this.pipelineStats,
      candidateAnalysis: this.candidateAnalysis,
      issuesDetected: this.detectIssues()
    };
  }
  
  detectIssues() {
    const issues = [];
    const s = this.pipelineStats;
    const ca = this.candidateAnalysis;
    
    // Issue 1: Check for TN=0 anomaly
    if (s.finalAiFallback > 0) {
      issues.push({
        severity: 'CRITICAL',
        code: 'TN_ZERO_ANOMALY',
        message: 'AI Fallback count is ' + s.finalAiFallback + ' but TN in confusion matrix might be 0',
        likelyCause: 'Confusion Matrix definition error'
      });
    }
    
    // Issue 2: Check candidate distribution
    const totalWithCandidates = ca.singleCandidate.total + ca.multipleCandidates.total;
    if (totalWithCandidates === 0 && s.totalInvoices > 0) {
      issues.push({
        severity: 'CRITICAL',
        code: 'NO_CANDIDATES_FOUND',
        message: 'No invoices had any pattern candidates - pattern store may be empty or mismatched',
        likelyCause: 'Layout hash computation mismatch between invoices and patterns'
      });
    }
    
    // Issue 3: High false match rate in single candidate scenario
    if (ca.singleCandidate.total > 0) {
      const singleFMR = ca.singleCandidate.incorrect / ca.singleCandidate.total;
      if (singleFMR > 0.5) {
        issues.push({
          severity: 'HIGH',
          code: 'HIGH_SINGLE_CANDIDATE_FMR',
          message: 'Single candidate FMR is ' + (singleFMR * 100).toFixed(1) + '% - patterns may be assigned to wrong suppliers',
          likelyCause: 'Pattern store has wrong supplier mappings for layout hashes'
        });
      }
    }
    
    // Issue 4: All multiple candidates failing
    if (ca.multipleCandidates.total > 0) {
      const multiFMR = ca.multipleCandidates.incorrect / ca.multipleCandidates.total;
      if (multiFMR > 0.8) {
        issues.push({
          severity: 'HIGH',
          code: 'HIGH_MULTI_CANDIDATE_FMR',
          message: 'Multiple candidate FMR is ' + (multiFMR * 100).toFixed(1) + '% - semantic scoring not distinguishing suppliers',
          likelyCause: 'Semantic features insufficient or scoring weights wrong'
        });
      }
    }
    
    return issues;
  }
}

// ============================================================
// SECTION 2: CONFUSION MATRIX AUDITOR
// ============================================================

class ConfusionMatrixAuditor {
  constructor() {
    this.rawPredictions = [];
    this.matrixDefinitions = {};
    this.reconciliationResults = null;
  }
  
  defineMatrixTerms(definition) {
    this.matrixDefinitions = {
      positiveCondition: definition.positiveCondition || 'hasValidPatternAvailable',
      negativeCondition: definition.negativeCondition || 'noValidPatternAvailable',
      predictedPositive: definition.predictedPositive || 'systemUsedPattern',
      predictedNegative: definition.predictedNegative || 'systemUsedAI',
      timestamp: new Date().toISOString(),
      notes: definition.notes || ''
    };
  }
  
  recordPrediction(prediction) {
    this.rawPredictions.push(prediction);
  }
  
  calculateCorrectedMatrix() {
    let tp = 0, fp = 0, fn = 0, tn = 0;
    
    const reasons = {
      tp_reasons: {},
      fp_reasons: {},
      fn_reasons: {},
      tn_reasons: {}
    };
    
    for (const pred of this.rawPredictions) {
      const hadValidPattern = pred.hadValidPatternAvailable;
      const usedPattern = pred.outcome === 'PATTERN_MATCH' || pred.outcome === 'FALSE_MATCH';
      const wasCorrect = pred.outcome === 'PATTERN_MATCH' && 
                         pred.predictedSupplierId === pred.actualSupplierId;
      
      if (hadValidPattern && usedPattern && wasCorrect) {
        tp++;
        reasons.tp_reasons[pred.reason || 'standard_match'] = (reasons.tp_reasons[pred.reason || 'standard_match'] || 0) + 1;
      } 
      else if (usedPattern && !wasCorrect) {
        fp++;
        const reason = pred.falseMatchReason || this.classifyFalseMatchReason(pred);
        reasons.fp_reasons[reason] = (reasons.fp_reasons[reason] || 0) + 1;
      }
      else if (hadValidPattern && !usedPattern) {
        fn++;
        reasons.fn_reasons[pred.aiFallbackReason || 'unknown'] = (reasons.fn_reasons[pred.aiFallbackReason || 'unknown'] || 0) + 1;
      }
      else if (!hadValidPattern && !usedPattern) {
        tn++;
        reasons.tn_reasons[pred.noPatternReason || 'no_pattern_in_store'] = (reasons.tn_reasons[pred.noPatternReason || 'no_pattern_in_store'] || 0) + 1;
      }
    }
    
    return {
      matrix: { tp, fp, fn, tn },
      total: tp + fp + fn + tn,
      reasons,
      metrics: this.calculateMetrics({ tp, fp, fn, tn }),
      validation: this.validateMatrix({ tp, fp, fn, tn })
    };
  }
  
  classifyFalseMatchReason(pred) {
    if (!pred.candidateInfo) return 'unknown_no_info';
    
    const info = pred.candidateInfo;
    
    if (info.candidateCount === 1) {
      if (info.sharedLayout) {
        return 'single_wrong_pattern_shared_layout';
      }
      return 'single_wrong_pattern_assigned';
    }
    
    if (info.candidateCount > 1) {
      if (info.semanticScores) {
        const scores = Object.values(info.semanticScores);
        const maxScore = Math.max(...scores);
        const minDiff = this.getMinScoreDifference(scores);
        
        if (maxScore < 0.7) {
          return 'multi_low_confidence_guess';
        }
        if (minDiff < 0.05) {
          return 'multi_scores_too_close';
        }
        return 'multi_wrong_ranking';
      }
      return 'multi_candidate_no_score_info';
    }
    
    return 'unknown_classification';
  }
  
  getMinScoreDifference(scores) {
    if (scores.length < 2) return 0;
    const sorted = [...scores].sort((a, b) => b - a);
    return sorted[0] - sorted[1];
  }
  
  calculateMetrics(matrix) {
    const { tp, fp, fn, tn } = matrix;
    const total = tp + fp + fn + tn;
    
    const predictedPositives = tp + fp;
    const actualPositives = tp + fn;
    const actualNegatives = fp + tn;
    
    const precision = predictedPositives > 0 ? tp / predictedPositives : 0;
    const recall = actualPositives > 0 ? tp / actualPositives : 0;
    const specificity = actualNegatives > 0 ? tn / actualNegatives : 0;
    
    return {
      accuracy: total > 0 ? (tp + tn) / total : 0,
      precision: precision,
      recall: recall,
      specificity: specificity,
      f1Score: (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 0,
      falseMatchRate: predictedPositives > 0 ? fp / predictedPositives : 0,
      falseMatchRateOfTotal: total > 0 ? fp / total : 0,
      patternUtilization: actualPositives > 0 ? tp / actualPositives : 0,
      aiNecessityRate: total > 0 ? tn / total : 0,
      counts: { tp, fp, fn, tn, total }
    };
  }
  
  validateMatrix(matrix) {
    const { tp, fp, fn, tn } = matrix;
    const issues = [];
    
    // Validation 1: TN should not be zero if AI fallback exists
    if (tn === 0 && fn > 0) {
      issues.push({
        severity: 'CRITICAL',
        code: 'TN_ZERO_WITH_FN',
        message: 'TN=0 but FN>0 suggests misclassification',
        explanation: 'If system sent invoices to AI and they truly had no valid pattern, they should be TN'
      });
    }
    
    // Validation 2: Sum consistency
    const sum = tp + fp + fn + tn;
    if (sum !== this.rawPredictions.length) {
      issues.push({
        severity: 'ERROR',
        code: 'MATRIX_SUM_MISMATCH',
        message: 'Matrix sum (' + sum + ') != predictions count (' + this.rawPredictions.length + ')'
      });
    }
    
    // Validation 3: Sanity check on rates
    const fmr = (tp + fp) > 0 ? fp / (tp + fp) : 0;
    if (fmr > 0.95) {
      issues.push({
        severity: 'WARNING',
        code: 'EXTREME_FMR',
        message: 'FMR is ' + (fmr * 100).toFixed(1) + '% - verify this is intended'
      });
    }
    
    return {
      isValid: issues.length === 0,
      issueCount: issues.length,
      issues: issues
    };
  }
  
  reconcileWithPrevious(previousMatrix) {
    const current = this.calculateCorrectedMatrix();
    
    return {
      previous: previousMatrix,
      corrected: current.matrix,
      differences: {
        tpDelta: current.matrix.tp - (previousMatrix.tp || 0),
        fpDelta: current.matrix.fp - (previousMatrix.fp || 0),
        fnDelta: current.matrix.fn - (previousMatrix.fn || 0),
        tnDelta: current.matrix.tn - (previousMatrix.tn || 0)
      },
      rootCauseAnalysis: this.analyzeDiscrepancies(previousMatrix, current)
    };
  }
  
  analyzeDiscrepancies(prev, curr) {
    const analysis = [];
    
    if ((prev.tn || 0) === 0 && curr.matrix.tn > 0) {
      analysis.push({
        finding: 'TN_FIX_IDENTIFIED',
        impact: 'MAJOR',
        description: 'TN changed from 0 to ' + curr.matrix.tn + ' - previous audit was misclassifying AI fallbacks'
      });
    }
    
    const fpChange = Math.abs(curr.matrix.fp - (prev.fp || 0));
    if (fpChange > 100) {
      analysis.push({
        finding: 'FP_COUNT_CHANGED',
        impact: fpChange > 1000 ? 'CRITICAL' : 'MODERATE',
        description: 'FP changed by ' + fpChange + ' - false match counting method differed'
      });
    }
    
    return analysis;
  }
}

// ============================================================
// SECTION 3: UNIFIED AUDIT RUNNER
// ============================================================

class UnifiedBenchmarkAuditor {
  constructor(options = {}) {
    this.options = {
      supplierCount: options.supplierCount || 20,
      invoicesPerSupplier: options.invoicesPerSupplier || 50,
      verboseLogging: options.verboseLogging || true,
      ...options
    };
    
    this.tracer = new DetailedDecisionTracer();
    this.matrixAuditor = new ConfusionMatrixAuditor();
    
    this.auditResults = {
      timestamp: null,
      config: null,
      tracerResults: null,
      matrixResults: null,
      reconciliation: null,
      findings: [],
      recommendations: [],
      verdict: null
    };
  }
  
  async runFullAudit() {
    console.log('\n' + '═'.repeat(70));
    console.log('🔍 INVOICE BRAIN BENCHMARK AUDIT v4.0');
    console.log('   Validating the measurement system itself');
    console.log('═'.repeat(70) + '\n');
    
    this.auditResults.timestamp = new Date().toISOString();
    this.auditResults.config = this.options;
    
    console.log('📊 STEP 1: Running audited benchmark with detailed tracing...');
    await this.runAuditedBenchmark();
    
    console.log('\n🔬 STEP 2: Auditing confusion matrix logic...');
    this.auditMatrixLogic();
    
    console.log('\n⚖️  STEP 3: Reconciling with previous benchmarks...');
    this.reconcilePreviousResults();
    
    console.log('\n📋 STEP 4: Generating findings and recommendations...');
    this.generateFindingsAndRecommendations();
    
    this.printAuditReport();
    
    return this.auditResults;
  }
  
  async runAuditedBenchmark() {
    const invoices = [];
    const patterns = new Map();
    
    // Use SAME scale as rigorous benchmark for fair comparison
    for (let s = 0; s < this.options.supplierCount; s++) {
      const supplierId = 'supplier_' + s;
      const tenantId = 'tenant_' + ((s % 10) + 1); // 10 tenants like rigorous
      const formatType = ['arabic_tax', 'english_commercial', 'mixed_gulf', 'ecommerce', 'service'][s % 5];
      
      let hash = 0;
      for (let c of formatType) hash = ((hash << 5) - hash) + c.charCodeAt(0);
      const layoutHash = 'layout_' + Math.abs(hash).toString(16).padStart(8, '0');
      
      // CRITICAL: Same shared layout logic as rigorous benchmark
      const useSharedLayout = s < 16; // First 16 share layouts (like rigorous: 8 groups of ~2-4)
      const finalLayoutHash = useSharedLayout ? 'shared_layout_' + Math.floor(s / 2) : layoutHash;
      
      patterns.set(supplierId, {
        id: 'pattern_' + supplierId,
        supplierId: supplierId,
        supplierName: this.getRealSupplierName(s, useSharedLayout), // Use REAL names!
        tenantId: tenantId,
        trn: 'TRN' + String(1000000000000000 + s * 12345).slice(-15),
        layoutHash: finalLayoutHash,
        formatType: formatType,
        currency: this.getCurrencyForFormat(formatType)
      });
      
      for (let i = 0; i < this.options.invoicesPerSupplier; i++) {
        invoices.push({
          id: 'INV_' + String(1000 + s * this.options.invoicesPerSupplier + i),
          supplierId: supplierId,
          tenantId: tenantId,
          expectedSupplierName: this.getRealSupplierName(s, false), // Real name without suffix
          expectedTrn: patterns.get(supplierId).trn,
          amount: this.generateAmountForFormat(formatType),
          currency: patterns.get(supplierId).currency,
          formatType: formatType,
          layoutHash: finalLayoutHash,
          hasSharedLayout: useSharedLayout,
          hasOcrError: Math.random() < 0.15
        });
      }
    }
    
    console.log('   Generated ' + invoices.length + ' invoices, ' + patterns.size + ' patterns');
    console.log('   Shared layout suppliers: ~' + Math.floor(this.options.supplierCount / 2) + ' (using shared_layout_*)');
    console.log('   Using REAL Arabic/English supplier names');
    
    for (const invoice of invoices) {
      this.processInvoiceWithFullTracing(invoice, patterns);
    }
    
    this.auditResults.tracerResults = this.tracer.getAuditReport();
  }
  
  getCurrencyForFormat(formatType) {
    var map = {
      arabic_tax: 'SAR',
      english_commercial: 'AED',
      mixed_gulf: 'SAR',
      ecommerce: 'USD',
      service: 'SAR'
    };
    return map[formatType] || 'SAR';
  }
  
  getRealSupplierName(s, addSharedSuffix) {
    var arabicNames = [
      'شركة النور التجارية', 'المؤسسة العربية للتجارة', 'مجموعة الأمل الصناعية',
      'شركة الإبداع الرقمي', 'الشركة المتحدة للمقاولات', 'مؤسسة التقدم للخدمات',
      'شركة البناء الحديث', 'المجموعة الذهبية', 'شركة التقنية المتقدمة',
      'مؤسسة النجاح التجارية'
    ];
    
    var englishNames = [
      'Gulf Trading LLC', 'Arab Commerce Ltd', 'Future Tech Solutions',
      'Premier Services Inc', 'Global Trade Partners', 'Excellence Industries',
      'Innovation Hub Corp', 'Quality First Trading', 'Advanced Systems Co',
      'Reliable Suppliers Ltd'
    ];
    
    var isArabic = s % 2 === 0;
    var baseName = isArabic ? arabicNames[s % arabicNames.length] : englishNames[s % englishNames.length];
    var suffix = Math.floor(s / (isArabic ? arabicNames.length : englishNames.length));
    var name = suffix > 0 ? baseName + ' (' + (suffix + 1) + ')' : baseName;
    
    if (addSharedSuffix) {
      name += ' (Shared Template)';
    }
    
    return name;
  }
  
  generateAmountForFormat(formatType) {
    var ranges = {
      arabic_tax: [500, 50000],
      english_commercial: [1000, 100000],
      mixed_gulf: [200, 25000],
      ecommerce: [50, 5000],
      service: [1000, 20000]
    };
    var range = ranges[formatType] || [100, 10000];
    return Math.round((range[0] + Math.random() * (range[1] - range[0])) * 100) / 100;
  }
  
  processInvoiceWithFullTracing(invoice, patterns) {
    const allPatterns = Array.from(patterns.values());
    const layoutCandidates = allPatterns.filter(p => p.layoutHash === invoice.layoutHash);
    
    const tenantCandidates = layoutCandidates.filter(p => p.tenantId === invoice.tenantId);
    
    let selectedCandidate = null;
    let maxScore = -1;
    const scores = {};
    
    for (const candidate of tenantCandidates) {
      const score = this.calculateSemanticScore(invoice, candidate);
      scores[candidate.supplierId] = score;
      
      if (score > maxScore) {
        maxScore = score;
        selectedCandidate = candidate;
      }
    }
    
    let outcome;
    let isCorrect = false;
    let hadValidPattern = false;
    let falseMatchReason = null;
    let aiFallbackReason = null;
    
    // CRITICAL FIX: hadValidPattern means the CORRECT supplier's pattern was in the store
    // AND matched by layout hash, regardless of whether our selection logic found it
    const correctPatternExistsInStore = allPatterns.some(p => p.supplierId === invoice.supplierId && p.layoutHash === invoice.layoutHash);
    hadValidPattern = correctPatternExistsInStore;
    
    if (tenantCandidates.length === 0) {
      outcome = 'AI_FALLBACK';
      aiFallbackReason = 'no_candidates';
      isCorrect = true;
    } 
    else if (!selectedCandidate || maxScore < 0.5) {
      outcome = 'AI_FALLBACK';
      aiFallbackReason = 'low_confidence_' + maxScore.toFixed(2);
      isCorrect = !correctPatternExistsInStore;
    }
    else if (tenantCandidates.length === 1) {
      // Single candidate - use threshold of 0.7 like rigorous benchmark
      if (maxScore > 0.7 && selectedCandidate.supplierId === invoice.supplierId) {
        outcome = 'PATTERN_MATCH';
        isCorrect = true;
      } else if (maxScore > 0.7 && selectedCandidate.supplierId !== invoice.supplierId) {
        // High confidence but WRONG supplier = FALSE MATCH!
        outcome = 'FALSE_MATCH';
        isCorrect = false;
        falseMatchReason = 'single_wrong_high_confidence';
      } else {
        outcome = 'AI_FALLBACK';
        aiFallbackReason = 'single_low_confidence_' + maxScore.toFixed(2);
        isCorrect = !correctPatternExistsInStore;
      }
    }
    else {
      // Multiple candidates - use threshold of 0.85 like rigorous benchmark
      if (maxScore > 0.85 && selectedCandidate.supplierId === invoice.supplierId) {
        outcome = 'PATTERN_MATCH';
        isCorrect = true;
      } else if (maxScore > 0.85 && selectedCandidate.supplierId !== invoice.supplierId) {
        outcome = 'FALSE_MATCH';
        isCorrect = false;
        falseMatchReason = this.classifyFalseMatchReasonDetailed(invoice, selectedCandidate, tenantCandidates);
      } else if (maxScore > 0.7) {
        outcome = 'AI_FALLBACK';
        aiFallbackReason = 'multi_medium_confidence_' + maxScore.toFixed(2);
        isCorrect = false; // Should have been more careful
      } else {
        outcome = 'AI_FALLBACK';
        aiFallbackReason = 'multi_low_confidence_' + maxScore.toFixed(2);
        isCorrect = !correctPatternExistsInStore;
      }
    }
    
    this.tracer.recordDecision(invoice.id, {
      stages: {
        layout: { candidatesFound: layoutCandidates.length },
        tenantFilter: { inputCount: layoutCandidates.length, outputCount: tenantCandidates.length },
        supplierGate: { inputCount: tenantCandidates.length, outputCount: tenantCandidates.length },
        semantic: { passed: maxScore >= 0.5, score: maxScore }
      },
      candidateAnalysis: {
        scenario: tenantCandidates.length === 0 ? 'no_candidates' :
                  tenantCandidates.length === 1 ? 'single_candidate' : 'multiple_candidates',
        wasCorrect: isCorrect
      },
      finalOutcome: {
        type: outcome,
        isCorrect: isCorrect,
        wasCorrectDecision: isCorrect || (outcome === 'AI_FALLBACK' && !hadValidPattern)
      }
    });
    
    this.matrixAuditor.recordPrediction({
      invoiceId: invoice.id,
      actualSupplierId: invoice.supplierId,
      predictedSupplierId: selectedCandidate ? selectedCandidate.supplierId : null,
      outcome: outcome,
      hadValidPatternAvailable: hadValidPattern,
      confidence: maxScore,
      candidateCount: tenantCandidates.length,
      falseMatchReason: falseMatchReason,
      aiFallbackReason: aiFallbackReason,
      candidateInfo: {
        candidateCount: tenantCandidates.length,
        sharedLayout: invoice.hasSharedLayout,
        scores: scores
      }
    });
  }
  
  calculateSemanticScore(invoice, pattern) {
    // Use EXACT same logic as rigorous benchmark for fair comparison
    var score = 0.5; // Base score - start higher like rigorous
    
    // Supplier name similarity (strict - like rigorous)
    if (invoice.expectedSupplierName && pattern.supplierName) {
      var name1 = invoice.expectedSupplierName.toLowerCase().replace(/\(.*\)/, '').trim();
      var name2 = pattern.supplierName.toLowerCase().replace(/\(.*\)/, '').trim();
      
      // Strict similarity calculation
      if (name1 === name2) {
        score += 0.3; // Perfect match
      } else if (name1.indexOf(name2.split(' ')[1]) >= 0 || name2.indexOf(name1.split(' ')[1]) >= 0) {
        score += 0.15; // Partial match
      } else {
        score -= 0.2; // Penalty for mismatch (like rigorous)
      }
    }
    
    // Currency check (strict)
    if (invoice.currency === pattern.currency) {
      score += 0.15;
    } else {
      score -= 0.3; // Big penalty for currency mismatch (like rigorous)
    }
    
    // Tenant check
    if (invoice.tenantId === pattern.tenantId) {
      score += 0.15;
    } else {
      score -= 0.3; // Very bad if tenant doesn't match
    }
    
    // Format type check
    if (invoice.formatType === pattern.formatType) {
      score += 0.1;
    }
    
    // OCR error penalty
    if (invoice.hasOcrError) {
      score -= 0.15; // Bigger penalty than before
    }
    
    // Shared layout penalty (CRITICAL - this is what causes false matches!)
    if (invoice.hasSharedLayout) {
      score -= 0.1;
      
      // For shared layouts, add randomness to simulate confusion
      score += (Math.random() - 0.5) * 0.3;
    }
    
    // Random noise
    score += (Math.random() - 0.5) * 0.1;
    
    return Math.max(0, Math.min(1, score));
  }
  
  classifyFalseMatchReasonDetailed(invoice, wrongCandidate, allCandidates) {
    const correctWasInPool = allCandidates.some(p => p.supplierId === invoice.supplierId);
    
    if (!correctWasInPool) {
      return 'correct_pattern_not_in_pool';
    }
    
    if (invoice.hasSharedLayout) {
      return 'shared_layout_wrong_selection';
    }
    
    return 'semantic_scoring_error';
  }
  
  auditMatrixLogic() {
    this.matrixAuditor.defineMatrixTerms({
      positiveCondition: 'Invoice has a correct pattern available in the pattern store',
      negativeCondition: 'Invoice does NOT have a correct pattern available',
      predictedPositive: 'System uses Pattern matching (regardless of correctness)',
      predictedNegative: 'System uses AI Fallback',
      notes: 'This definition ensures TN captures correctly-rejected cases'
    });
    
    this.auditResults.matrixResults = this.matrixAuditor.calculateCorrectedMatrix();
    
    const validation = this.auditResults.matrixResults.validation;
    if (!validation.isValid) {
      this.auditResults.findings.push({
        severity: 'CRITICAL',
        category: 'MATRIX_LOGIC',
        message: 'Confusion matrix validation failed',
        details: validation.issues
      });
    }
  }
  
  reconcilePreviousResults() {
    const previousBuggyMatrix = {
      tp: 600,
      fp: 6400,
      fn: 3000,
      tn: 0
    };
    
    this.auditResults.reconciliation = this.matrixAuditor.reconcileWithPrevious(previousBuggyMatrix);
    
    if (this.auditResults.reconciliation.differences.tnDelta !== 0) {
      this.auditResults.findings.push({
        severity: 'INFO',
        category: 'RECONCILIATION',
        message: 'TN correction: ' + previousBuggyMatrix.tn + ' -> ' + this.auditResults.matrixResults.matrix.tn,
        detail: 'Previous audit was misclassifying AI fallbacks as non-TN'
      });
    }
  }
  
  generateFindingsAndRecommendations() {
    const metrics = this.auditResults.matrixResults?.metrics;
    const matrix = this.auditResults.matrixResults?.matrix;
    
    this.auditResults.findings.push({
      severity: (metrics?.falseMatchRate || 0) > 0.05 ? 'CRITICAL' : 'WARNING',
      category: 'CORE_METRIC',
      message: 'Corrected False Match Rate: ' + ((metrics?.falseMatchRate || 0) * 100).toFixed(2) + '%',
      detail: 'Of ' + (metrics?.counts?.tp + metrics?.counts?.fp || 0) + ' pattern matches, ' + (metrics?.counts?.fp || 0) + ' were incorrect'
    });
    
    if (matrix && matrix.tn > 0) {
      this.auditResults.findings.push({
        severity: 'SUCCESS',
        category: 'BUG_FIX',
        message: 'TN bug fixed: Now correctly reporting ' + matrix.tn + ' True Negatives',
        detail: 'These are invoices correctly sent to AI because no valid pattern existed'
      });
    }
    
    this.auditResults.recommendations = [
      {
        priority: 'P0',
        action: 'Implement hard supplier identity check BEFORE pattern acceptance',
        reason: 'Current semantic scoring cannot reliably distinguish same-ERP suppliers'
      },
      {
        priority: 'P0',
        action: 'Add post-match validation: verify extracted supplier name matches pattern',
        reason: 'Would catch most false matches before they cause damage'
      },
      {
        priority: 'P1',
        action: 'Build Golden Dataset with real invoices for validation',
        reason: 'Synthetic datasets cannot capture real-world complexity'
      },
      {
        priority: 'P2',
        action: 'Consider separate handling for shared-layout scenarios',
        reason: 'Same-ERP suppliers need different matching strategy'
      }
    ];
    
    const fmr = metrics?.falseMatchRate || 1;
    this.auditResults.verdict = {
      readyForProduction: fmr < 0.005,
      readyForPilot: fmr < 0.02,
      needsWork: fmr >= 0.02,
      honestAssessment: fmr < 0.1 
        ? 'Improvement needed but direction is correct' 
        : 'Fundamental redesign required before any production consideration',
      confidenceLevel: 'MEDIUM-HIGH',
      caveats: [
        'Using corrected confusion matrix methodology',
        'Still using synthetic data (smaller dataset for debugging)',
        'Real OCR behavior may differ significantly',
        'Golden Dataset validation strongly recommended before production'
      ]
    };
  }
  
  printAuditReport() {
    const r = this.auditResults;
    const matrix = r.matrixResults?.matrix;
    const metrics = r.matrixResults?.metrics;
    const tracer = r.tracerResults;
    
    console.log('\n' + '═'.repeat(70));
    console.log('🔍 AUDIT RESULTS REPORT');
    console.log('═'.repeat(70));
    
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│           CORRECTED CONFUSION MATRIX                      │');
    console.log('├──────────────────────┬──────────┬──────────┬───────────────┤');
    console.log('│                      │ Pattern  │ AI       │ Total         │');
    console.log('├──────────────────────┼──────────┼──────────┼───────────────┤');
    if (matrix) {
      console.log('│ Has Valid Pattern    │ TP: ' + String(matrix.tp).padEnd(5) + ' │ FN: ' + String(matrix.fn).padEnd(5) + ' │ ' + String(matrix.tp + matrix.fn).padEnd(13) + ' │');
      console.log('│ No Valid Pattern     │ FP: ' + String(matrix.fp).padEnd(5) + ' │ TN: ' + String(matrix.tn).padEnd(5) + ' │ ' + String(matrix.fp + matrix.tn).padEnd(13) + ' │');
      console.log('├──────────────────────┼──────────┼──────────┼───────────────┤');
      console.log('│ Total                 │ ' + String(matrix.tp + matrix.fp).padEnd(8) + ' │ ' + String(matrix.fn + matrix.tn).padEnd(8) + ' │ ' + String(matrix.tp + matrix.fp + matrix.fn + matrix.tn).padEnd(13) + ' │');
    }
    console.log('└──────────────────────┴──────────┴──────────┴───────────────┘');
    
    if (matrix && matrix.tn > 0) {
      console.log('\n✅ BUG FIXED: TN = ' + matrix.tn + ' (was 0 in previous audit)');
      console.log('   These ' + matrix.tn + ' invoices correctly went to AI (no valid pattern available)');
    }
    
    if (metrics) {
      console.log('\n┌─────────────────────────────────────────────────────────────┐');
      console.log('│                   CORRECTED METRICS                        │');
      console.log('├──────────────────────┬───────────────────────────────────────┤');
      console.log('│ False Match Rate      │ ' + (metrics.falseMatchRate * 100).toFixed(2) + '% (of pattern matches)       │');
      console.log('│ False Match (of total)│ ' + (metrics.falseMatchRateOfTotal * 100).toFixed(2) + '% (of all invoices)         │');
      console.log('│ Precision             │ ' + (metrics.precision * 100).toFixed(1) + '%                              │');
      console.log('│ Recall                │ ' + (metrics.recall * 100).toFixed(1) + '%                              │');
      console.log('│ F1 Score              │ ' + (metrics.f1Score * 100).toFixed(1) + '%                              │');
      console.log('│ Accuracy              │ ' + (metrics.accuracy * 100).toFixed(1) + '%                              │');
      console.log('└──────────────────────┴───────────────────────────────────────┘');
    }
    
    if (r.matrixResults?.reasons?.fp_reasons) {
      console.log('\n┌─────────────────────────────────────────────────────────────┐');
      console.log('│           FALSE MATCH REASON BREAKDOWN                     │');
      console.log('├─────────────────────────────────────────────────────────────┤');
      for (const [reason, count] of Object.entries(r.matrixResults.reasons.fp_reasons)) {
        const pct = (count / (matrix?.fp || 1) * 100).toFixed(1);
        console.log('│ ' + reason.padEnd(50) + ' │ ' + String(count).padEnd(5) + ' (' + pct + '%)    │');
      }
      console.log('└─────────────────────────────────────────────────────────────┘');
    }
    
    const verdict = r.verdict;
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│                    AUDIT VERDICT                           │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    console.log('   Ready for Production: ' + (verdict.readyForProduction ? '✅ YES' : '❌ NO'));
    console.log('   Ready for Pilot: ' + (verdict.readyForPilot ? '✅ YES' : '❌ NO'));
    console.log('   Assessment: ' + verdict.honestAssessment);
    console.log('   Confidence: ' + verdict.confidenceLevel);
    
    if (verdict.caveats && verdict.caveats.length > 0) {
      console.log('\n   Caveats:');
      for (const caveat of verdict.caveats) {
        console.log('   • ' + caveat);
      }
    }
    
    if (r.findings.length > 0) {
      console.log('\n┌─────────────────────────────────────────────────────────────┐');
      console.log('│                    KEY FINDINGS                             │');
      console.log('└─────────────────────────────────────────────────────────────┘');
      for (const finding of r.findings.slice(0, 5)) {
        var icon = finding.severity === 'CRITICAL' ? '🔴' :
                  finding.severity === 'WARNING' ? '🟡' :
                  finding.severity === 'SUCCESS' ? '🟢' : 'ℹ️';
        console.log('   ' + icon + ' [' + finding.severity + '] ' + finding.message);
      }
    }
    
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│                  RECOMMENDATIONS                             │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    for (var rec of r.recommendations) {
      console.log('   [' + rec.priority + '] ' + rec.action);
      console.log('         Reason: ' + rec.reason);
    }
    
    console.log('\n' + '═'.repeat(70));
  }
  
  getExportableResults() {
    return {
      version: '4.0-Audit',
      timestamp: this.auditResults.timestamp,
      config: this.auditResults.config,
      correctedConfusionMatrix: this.auditResults.matrixResults?.matrix,
      correctedMetrics: this.auditResults.matrixResults?.metrics,
      falseMatchBreakdown: this.auditResults.matrixResults?.reasons?.fp_reasons,
      tracerResults: this.auditResults.tracerResults,
      reconciliation: this.auditResults.reconciliation,
      findings: this.auditResults.findings,
      recommendations: this.auditResults.recommendations,
      verdict: this.auditResults.verdict
    };
  }
}

async function main() {
  console.log('🚀 Starting Invoice Brain Benchmark AUDIT...\n');
  
  var auditor = new UnifiedBenchmarkAuditor({
    supplierCount: 100,  // Same as rigorous benchmark
    invoicesPerSupplier: 100,  // Same as rigorous benchmark
    verboseLogging: true
  });
  
  var results = await auditor.runFullAudit();
  
  var fs = await import('fs');
  var outputPath = '/home/z/my-project/download/benchmark-audit-results.json';
  fs.writeFileSync(outputPath, JSON.stringify(auditor.getExportableResults(), null, 2));
  console.log('\n💾 Audit results saved to: ' + outputPath);
  
  return results;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DetailedDecisionTracer,
    ConfusionMatrixAuditor,
    UnifiedBenchmarkAuditor
  };
}

main().catch(console.error);
