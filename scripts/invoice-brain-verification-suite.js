/**
 * Invoice Brain Benchmark Verification Suite v1.0
 * ==================================================
 * PRODUCTION-GRADE VERIFICATION FRAMEWORK
 * 
 * Implements CTO-mandated verification components:
 * 
 * 1. THREE-LAYER INVARIANT SYSTEM:
 *    - Layer 1: Mathematical (Confusion Matrix consistency)
 *    - Layer 2: Pipeline (Flow integrity)
 *    - Layer 3: Business (Domain rules)
 * 
 * 2. TREE-STRUCTURED ROOT CAUSE ATTRIBUTION:
 *    - FALSE_MATCH → Candidate Selection / Ranking / Validation
 *    - Each leaf node is actionable root cause
 * 
 * 3. DETAILED DECISION TRACE:
 *    - Every stage logged
 *    - Rejected candidates with scores & thresholds
 *    - Full explainability for CTO-level debugging
 * 
 * 4. PROPERTY-BASED TESTING:
 *    - 100k+ random scenarios
 *    - Automatic invariant validation
 *    - CI-ready failure detection
 * 
 * 5. BENCHMARK CONFIDENCE SCORE:
 *    - Multi-factor confidence calculation
 *    - Prevents "0.00% FMR ready for production" traps
 * 
 * @version 1.0.0-Verification
 * @status: PRODUCTION-READY (after property-based testing passes)
 */

// ============================================================
// SECTION 1: THREE-LAYER INVARIANT SYSTEM
// ============================================================

/**
 * BenchmarkInvariantChecker - 3-Layer Self-Consistency Validation
 * 
 * LAYER 1 - MATHEMATICAL INVARIANTS:
 *   - TP + FP + FN + TN === totalInvoices
 *   - Precision_computed === TP/(TP+FP)
 *   - Recall_computed === TP/(TP+FN)
 *   - F1_computed === 2*(P*R)/(P+R)
 * 
 * LAYER 2 - PIPELINE INVARIANTS:
 *   - Input count === Output count
 *   - Candidate counts never negative
 *   - Exactly one decision per invoice
 *   - Every invoice has a trace
 * 
 * LAYER 3 - BUSINESS INVARIANTS:
 *   - TRN mismatch → NO pattern match allowed
 *   - Tenant isolation never violated
 *   - Currency mismatch below threshold
 *   - Layout hash consistency
 */
class BenchmarkInvariantChecker {
  constructor() {
    this.results = {
      layer1: { passed: [], failed: [], warnings: [] },
      layer2: { passed: [], failed: [], warnings: [] },
      layer3: { passed: [], failed: [], warnings: [] }
    };
    
    this.invariants = {
      mathematical: [
        { id: 'M001', name: 'ConfusionMatrixCompleteness', severity: 'CRITICAL' },
        { id: 'M002', name: 'PrecisionConsistency', severity: 'CRITICAL' },
        { id: 'M003', name: 'RecallConsistency', severity: 'CRITICAL' },
        { id: 'M004', name: 'F1Consistency', severity: 'HIGH' },
        { id: 'M005', name: 'FMRConsistency', severity: 'CRITICAL' },
        { id: 'M006', name: 'NoImpossibleStates', severity: 'CRITICAL' },
        { id: 'M007', name: 'SpecificityConsistency', severity: 'MEDIUM' },
        { id: 'M008', name: 'NPVConsistency', severity: 'MEDIUM' }
      ],
      pipeline: [
        { id: 'P001', name: 'InputOutputCountMatch', severity: 'CRITICAL' },
        { id: 'P002', name: 'NonNegativeCandidateCounts', severity: 'CRITICAL' },
        { id: 'P003', name: 'SingleDecisionPerInvoice', severity: 'CRITICAL' },
        { id: 'P004', name: 'EveryInvoiceHasTrace', severity: 'HIGH' },
        { id: 'P005', name: 'NoOrphanDecisions', severity: 'HIGH' },
        { id: 'P006', name: 'StageMonotonicity', severity: 'MEDIUM' },
        { id: 'P007', name: 'TimestampOrdering', severity: 'LOW' }
      ],
      business: [
        { id: 'B001', name: 'TRNMismatchBlocksMatch', severity: 'CRITICAL' },
        { id: 'B002', name: 'TenantIsolationIntegrity', severity: 'CRITICAL' },
        { id: 'B003', name: 'CurrencyMismatchThreshold', severity: 'HIGH' },
        { id: 'B004', name: 'LayoutHashConsistency', severity: 'HIGH' },
        { id: 'B005', name: 'SupplierIdentityGate', severity: 'CRITICAL' },
        { id: 'B006', name: 'CrossFieldValidation', severity: 'HIGH' },
        { id: 'B007', name: 'NoGhostPatterns', severity: 'MEDIUM' },
        { id: 'B008', name: 'VersionCompatibility', severity: 'MEDIUM' }
      ]
    };
  }

  /**
   * Run all invariants and return comprehensive result
   */
  runAllInvariants(benchmarkResult) {
    console.log('═'.repeat(80));
    console.log('  BENCHMARK INVARIANT CHECKER - FULL SUITE');
    console.log('═'.repeat(80));
    
    // Reset results
    this.results = {
      layer1: { passed: [], failed: [], warnings: [] },
      layer2: { passed: [], failed: [], warnings: [] },
      layer3: { passed: [], failed: [], warnings: [] }
    };

    // Layer 1: Mathematical Invariants
    console.log('\n📐 LAYER 1: MATHEMATICAL INVARIANTS');
    console.log('─'.repeat(60));
    this._runMathematicalInvariants(benchmarkResult);
    
    // Layer 2: Pipeline Invariants  
    console.log('\n🔧 LAYER 2: PIPELINE INVARIANTS');
    console.log('─'.repeat(60));
    this._runPipelineInvariants(benchmarkResult);
    
    // Layer 3: Business Invariants
    console.log('\n🏢 LAYER 3: BUSINESS INVARIANTS');
    console.log('─'.repeat(60));
    this._runBusinessInvariants(benchmarkResult);

    return this.generateReport();
  }

  // ============================================================
  // LAYER 1: MATHEMATICAL INVARIANTS
  // ============================================================

  _runMathematicalInvariants(result) {
    const matrix = result.confusionMatrix || {};
    const metrics = result.metrics || {};
    const total = result.totalInvoices || 0;

    // M001: Confusion Matrix Completeness
    this._checkInvariant('layer1', 'M001', 'ConfusionMatrixCompleteness', () => {
      const tp = matrix.tp || 0;
      const fp = matrix.fp || 0;
      const fn = matrix.fn || 0;
      const tn = matrix.tn || 0;
      const sum = tp + fp + fn + tn;
      
      if (sum !== total) {
        throw new InvariantViolationError(
          `TP(${tp}) + FP(${fp}) + FN(${fn}) + TN(${tn}) = ${sum}, expected ${total}`,
          { actual: sum, expected: total, delta: sum - total }
        );
      }
      return { tp, fp, fn, tn, total, match: true };
    });

    // M002: Precision Consistency
    this._checkInvariant('layer1', 'M002', 'PrecisionConsistency', () => {
      const computedPrecision = metrics.precision || 0;
      const tp = matrix.tp || 0;
      const fp = matrix.fp || 0;
      
      if (tp + fp > 0) {
        const expectedPrecision = tp / (tp + fp);
        const diff = Math.abs(computedPrecision - expectedPrecision);
        
        if (diff > 0.0001) { // Allow floating point tolerance
          throw new InvariantViolationError(
            `Reported Precision ${computedPrecision} ≠ Matrix-derived ${expectedPrecision}`,
            { reported: computedPrecision, expected: expectedPrecision, diff }
          );
        }
        return { reported: computedPrecision, expected: expectedPrecision, match: true };
      }
      return { note: 'Cannot compute precision (TP+FP=0)' };
    });

    // M003: Recall Consistency
    this._checkInvariant('layer1', 'M003', 'RecallConsistency', () => {
      const computedRecall = metrics.recall || 0;
      const tp = matrix.tp || 0;
      const fn = matrix.fn || 0;
      
      if (tp + fn > 0) {
        const expectedRecall = tp / (tp + fn);
        const diff = Math.abs(computedRecall - expectedRecall);
        
        if (diff > 0.0001) {
          throw new InvariantViolationError(
            `Reported Recall ${computedRecall} ≠ Matrix-derived ${expectedRecall}`,
            { reported: computedRecall, expected: expectedRecall, diff }
          );
        }
        return { reported: computedRecall, expected: expectedRecall, match: true };
      }
      return { note: 'Cannot compute recall (TP+FN=0)' };
    });

    // M004: F1 Consistency
    this._checkInvariant('layer1', 'M004', 'F1Consistency', () => {
      const computedF1 = metrics.f1Score || 0;
      const precision = metrics.precision || 0;
      const recall = metrics.recall || 0;
      
      if (precision + recall > 0) {
        const expectedF1 = 2 * (precision * recall) / (precision + recall);
        const diff = Math.abs(computedF1 - expectedF1);
        
        if (diff > 0.0001) {
          throw new InvariantViolationError(
            `Reported F1 ${computedF1} ≠ Derived from P(${precision})*R(${recall}) = ${expectedF1}`,
            { reported: computedF1, expected: expectedF1, diff }
          );
        }
        return { reported: computedF1, expected: expectedF1, match: true };
      }
      return { note: 'Cannot compute F1 (P+R=0)' };
    });

    // M005: FMR Consistency (CRITICAL for Invoice Brain)
    this._checkInvariant('layer1', 'M005', 'FMRConsistency', () => {
      const computedFMR = metrics.fmr || 0;
      const tp = matrix.tp || 0;
      const fp = matrix.fp || 0;
      
      if (tp + fp > 0) {
        const expectedFMR = fp / (tp + fp);
        const diff = Math.abs(computedFMR - expectedFMR);
        
        if (diff > 0.0001) {
          throw new InvariantViolationError(
            `Reported FMR ${(computedFMR*100).toFixed(2)}% ≠ Matrix-derived ${(expectedFMR*100).toFixed(2)}%`,
            { reported: computedFMR, expected: expectedFMR, diff, impact: 'CRITICAL' }
          );
        }
        return { reportedFMR: `${(computedFMR*100).toFixed(2)}%`, expectedFMR: `${(expectedFMR*100).toFixed(2)}%`, match: true };
      }
      return { note: 'Cannot compute FMR (TP+FP=0)' };
    });

    // M006: No Impossible States
    this._checkInvariant('layer1', 'M006', 'NoImpossibleStates', () => {
      const issues = [];
      const tp = matrix.tp || 0;
      const fp = matrix.fp || 0;
      const fn = matrix.fn || 0;
      const tn = matrix.tn || 0;
      const fmr = metrics.fmr || 0;

      // DANGER: FN=0 means system NEVER rejects anything
      if (fn === 0 && total > 0) {
        issues.push({
          type: 'DANGER',
          message: 'FN=0: System NEVER rejects any invoice (Recall=100%)',
          implication: 'This explains high FP - Decision Policy always routes to pattern',
          recommendation: 'Investigate threshold configuration'
        });
      }

      // WARNING: TN=0 when AI fallback exists
      if (tn === 0 && result.aiFallbackCount > 0) {
        issues.push({
          type: 'WARNING',
          message: 'TN=0 but AI fallback cases exist',
          implication: 'AI fallback not properly classified as TN',
          recommendation: 'Review TN classification logic'
        });
      }

      // CRITICAL: FP>0 but FMR=0
      if (fp > 0 && fmr === 0) {
        issues.push({
          type: 'CRITICAL',
          message: `FP=${fp} but FMR reported as 0%`,
          implication: 'FMR calculation is broken or wrong metric used',
          recommendation: 'Fix FMR computation immediately'
        });
      }

      // IMPOSSIBLE: All zeros with non-zero total
      if (tp === 0 && fp === 0 && fn === 0 && tn === 0 && total > 0) {
        issues.push({
          type: 'IMPOSSIBLE',
          message: 'All confusion matrix values are zero but total > 0',
          implication: 'Benchmark did not run or results corrupted',
          recommendation: 'Re-run benchmark completely'
        });
      }

      if (issues.length > 0) {
        throw new InvariantViolationError(
          `Found ${issues.length} impossible/dangerous states`,
          { issues }
        );
      }

      return { status: 'All states valid', checksPerformed: 4 };
    });

    // M007: Specificity Consistency
    this._checkInvariant('layer1', 'M007', 'SpecificityConsistency', () => {
      const computedSpecificity = metrics.specificity || 0;
      const tn = matrix.tn || 0;
      const fp = matrix.fp || 0;
      
      if (tn + fp > 0) {
        const expectedSpecificity = tn / (tn + fp);
        const diff = Math.abs(computedSpecificity - expectedSpecificity);
        
        if (diff > 0.0001) {
          throw new InvariantViolationError(
            `Specificity mismatch: ${computedSpecificity} vs ${expectedSpecificity}`,
            { reported: computedSpecificity, expected: expectedSpecificity }
          );
        }
      }
      return { specificity: computedSpecificity };
    });

    // M008: NPV (Negative Predictive Value) Consistency
    this._checkInvariant('layer1', 'M008', 'NPVConsistency', () => {
      const computedNPV = metrics.npv || 0;
      const tn = matrix.tn || 0;
      const fn = matrix.fn || 0;
      
      if (tn + fn > 0) {
        const expectedNPV = tn / (tn + fn);
        const diff = Math.abs(computedNPV - expectedNPV);
        
        if (diff > 0.0001) {
          throw new InvariantViolationError(
            `NPV mismatch: ${computedNPV} vs ${expectedNPV}`,
            { reported: computedNPV, expected: expectedNPV }
          );
        }
      }
      return { npv: computedNPV };
    });
  }

  // ============================================================
  // LAYER 2: PIPELINE INVARIANTS
  // ============================================================

  _runPipelineInvariants(result) {
    const pipelineData = result.pipelineData || {};
    const decisions = result.decisions || [];
    const traces = result.traces || [];

    // P001: Input/Output Count Match
    this._checkInvariant('layer2', 'P001', 'InputOutputCountMatch', () => {
      const inputCount = pipelineData.inputCount || 0;
      const outputCount = decisions.length;
      
      if (inputCount !== outputCount) {
        throw new InvariantViolationError(
          `Pipeline input (${inputCount}) ≠ output (${outputCount})`,
          { inputCount, outputCount, lost: inputCount - outputCount },
          'CRITICAL'
        );
      }
      return { inputCount, outputCount, integrity: 'PASSED' };
    });

    // P002: Non-Negative Candidate Counts
    this._checkInvariant('layer2', 'P002', 'NonNegativeCandidateCounts', () => {
      const stages = pipelineData.stageCounts || {};
      const violations = [];
      
      for (const [stage, count] of Object.entries(stages)) {
        if (count < 0) {
          violations.push({ stage, count });
        }
      }
      
      if (violations.length > 0) {
        throw new InvariantViolationError(
          `Negative candidate counts detected`,
          { violations },
          'CRITICAL'
        );
      }
      
      return { stages, status: 'All counts non-negative' };
    });

    // P003: Single Decision Per Invoice
    this._checkInvariant('layer2', 'P003', 'SingleDecisionPerInvoice', () => {
      const decisionMap = new Map();
      const duplicates = [];
      
      for (const decision of decisions) {
        const invoiceId = decision.invoiceId;
        if (decisionMap.has(invoiceId)) {
          duplicates.push({
            invoiceId,
            firstDecision: decisionMap.get(invoiceId).decision,
            secondDecision: decision.decision
          });
        } else {
          decisionMap.set(invoiceId, decision);
        }
      }
      
      if (duplicates.length > 0) {
        throw new InvariantViolationError(
          `${duplicates.length} invoices have multiple decisions`,
          { samples: duplicates.slice(0, 5) },
          'CRITICAL'
        );
      }
      
      return { uniqueInvoices: decisionMap.size, totalDecisions: decisions.length };
    });

    // P004: Every Invoice Has Trace
    this._checkInvariant('layer2', 'P004', 'EveryInvoiceHasTrace', () => {
      const tracedIds = new Set(traces.map(t => t.invoiceId));
      const decisionIds = new Set(decisions.map(d => d.invoiceId));
      const missingTraces = [];
      
      for (const invoiceId of decisionIds) {
        if (!tracedIds.has(invoiceId)) {
          missingTraces.push(invoiceId);
        }
      }
      
      if (missingTraces.length > 0) {
        throw new InvariantViolationError(
          `${missingTraces.length} invoices missing decision traces`,
          { missingCount: missingTraces.length, samples: missingTraces.slice(0, 10) },
          'HIGH'
        );
      }
      
      return { tracedInvoices: tracedIds.size, totalInvoices: decisionIds.size };
    });

    // P005: No Orphan Decisions (decisions without corresponding input)
    this._checkInvariant('layer2', 'P005', 'NoOrphanDecisions', () => {
      const inputIds = new Set(pipelineData.inputIds || []);
      const orphanDecisions = [];
      
      for (const decision of decisions) {
        if (!inputIds.has(decision.invoiceId)) {
          orphanDecisions.push(decision.invoiceId);
        }
      }
      
      if (orphanDecisions.length > 0) {
        throw new InvariantViolationError(
          `${orphanDecisions.length} orphan decisions found`,
          { orphans: orphanDecisions.slice(0, 10) },
          'HIGH'
        );
      }
      
      return { status: 'No orphans found' };
    });

    // P006: Stage Monotonicity (candidates should decrease or stay same through pipeline)
    this._checkInvariant('layer2', 'P006', 'StageMonotonicity', () => {
      const stageCounts = pipelineData.stageCounts || {};
      const stageOrder = ['initial', 'afterTenantFilter', 'afterSupplierGate', 'afterSemanticRank', 'final'];
      const violations = [];
      
      let prevCount = Infinity;
      for (const stage of stageOrder) {
        const count = stageCounts[stage];
        if (count !== undefined && count > prevCount) {
          violations.push({
            stage,
            count,
            previousStageCount: prevCount,
            increase: count - prevCount
          });
        }
        prevCount = count || prevCount;
      }
      
      if (violations.length > 0) {
        // Warning only - some stages might add candidates (e.g., fuzzy matching)
        this._addWarning('layer2', 'P006', 'StageMonotonicity', 
          `Candidate count increased at ${violations.length} stage(s)`, { violations });
      } else {
        return { status: 'Monotonicity preserved' };
      }
    });

    // P007: Timestamp Ordering
    this._checkInvariant('layer2', 'P007', 'TimestampOrdering', () => {
      // Check that traces are in chronological order per invoice
      let orderingIssues = 0;
      
      for (const trace of traces) {
        const stages = trace.stages || [];
        for (let i = 1; i < stages.length; i++) {
          if (new Date(stages[i].timestamp) < new Date(stages[i-1].timestamp)) {
            orderingIssues++;
          }
        }
      }
      
      if (orderingIssues > 0) {
        this._addWarning('layer2', 'P007', 'TimestampOrdering',
          `${orderingIssues} timestamp ordering issues found`);
      }
      
      return { orderingIssues };
    });
  }

  // ============================================================
  // LAYER 3: BUSINESS INVARIANTS
  // ============================================================

  _runBusinessInvariants(result) {
    const decisions = result.decisions || [];
    const traces = result.traces || [];

    // B001: TRN Mismatch Blocks Pattern Match (MOST CRITICAL BUSINESS RULE)
    this._checkInvariant('layer3', 'B001', 'TRNMismatchBlocksMatch', () => {
      const violations = [];
      
      for (const decision of decisions) {
        const trace = traces.find(t => t.invoiceId === decision.invoiceId);
        if (!trace) continue;
        
        const invoiceTRN = trace.invoiceDetails?.trn;
        const matchedPatternTRN = trace.matchedPattern?.trn;
        
        // If TRNs don't match but system still made a pattern match
        if (invoiceTRN && matchedPatternTRN && 
            invoiceTRN !== matchedPatternTRN && 
            decision.decision === 'PATTERN_MATCH') {
          violations.push({
            invoiceId: decision.invoiceId,
            invoiceTRN,
            patternTRN: matchedPatternTRN,
            decision: decision.decision,
            matchedSupplier: decision.supplierId
          });
        }
      }
      
      if (violations.length > 0) {
        throw new InvariantViolationError(
          `${violations.length} pattern matches with TRN mismatch!`,
          { violations: violations.slice(0, 10), impact: 'FALSE MATCH RISK' },
          'CRITICAL'
        );
      }
      
      return { status: 'All pattern matches have matching TRN', checks: decisions.length };
    });

    // B002: Tenant Isolation Integrity
    this._checkInvariant('layer3', 'B002', 'TenantIsolationIntegrity', () => {
      const violations = [];
      
      for (const decision of decisions) {
        const trace = traces.find(t => t.invoiceId === decision.invoiceId);
        if (!trace) continue;
        
        const invoiceTenantId = trace.invoiceDetails?.tenantId;
        const matchedTenantId = trace.matchedPattern?.tenantId;
        
        if (invoiceTenantId && matchedTenantId && 
            invoiceTenantId !== matchedTenantId &&
            decision.decision === 'PATTERN_MATCH') {
          violations.push({
            invoiceId: decision.invoiceId,
            invoiceTenant: invoiceTenantId,
            patternTenant: matchedTenantId,
            violationType: 'TENANT_LEAK'
          });
        }
      }
      
      if (violations.length > 0) {
        throw new InvariantViolationError(
          `${violations.length} tenant isolation violations!`,
          { violations: violations.slice(0, 10), impact: 'SECURITY BREACH' },
          'CRITICAL'
        );
      }
      
      return { status: 'Tenant isolation preserved' };
    });

    // B003: Currency Mismatch Threshold
    this._checkInvariant('layer3', 'B003', 'CurrencyMismatchThreshold', () => {
      const currencyThreshold = 0.85; // Minimum similarity for currency match
      const violations = [];
      
      for (const trace of traces) {
        if (trace.decision !== 'PATTERN_MATCH') continue;
        
        const invoiceCurrency = trace.invoiceDetails?.currency;
        const patternCurrency = trace.matchedPattern?.currency;
        const currencyScore = trace.scores?.currency || 0;
        
        if (invoiceCurrency && patternCurrency && 
            invoiceCurrency !== patternCurrency && 
            currencyScore >= currencyThreshold) {
          violations.push({
            invoiceId: trace.invoiceId,
            invoiceCurrency,
            patternCurrency,
            currencyScore,
            threshold: currencyThreshold
          });
        }
      }
      
      if (violations.length > 0) {
        throw new InvariantViolationError(
          `${violations.length} currency mismatches scored above threshold`,
          { violations: violations.slice(0, 5) },
          'HIGH'
        );
      }
      
      return { threshold: currencyThreshold, status: 'OK' };
    });

    // B004: Layout Hash Consistency
    this._checkInvariant('layer3', 'B004', 'LayoutHashConsistency', () => {
      const suspiciousMatches = [];
      
      for (const trace of traces) {
        if (trace.decision !== 'PATTERN_MATCH') continue;
        
        const invoiceLayoutHash = trace.invoiceDetails?.layoutHash;
        const patternLayoutHash = trace.matchedPattern?.layoutHash;
        const layoutScore = trace.scores?.layout || 0;
        
        // If layout hashes differ completely but scored high
        if (invoiceLayoutHash && patternLayoutHash && 
            invoiceLayoutHash !== patternLayoutHash && 
            layoutScore > 0.9) {
          suspiciousMatches.push({
            invoiceId: trace.invoiceId,
            invoiceHash: invoiceLayoutHash.substring(0, 8),
            patternHash: patternLayoutHash.substring(0, 8),
            layoutScore
          });
        }
      }
      
      if (suspiciousMatches.length > 0) {
        this._addWarning('layer3', 'B004', 'LayoutHashConsistency',
          `${suspiciousMatches.length} matches with different hashes but high scores`,
          { samples: suspiciousMatches.slice(0, 5) }
        );
      } else {
        return { status: 'Layout hashes consistent' };
      }
    });

    // B005: Supplier Identity Gate
    this._checkInvariant('layer3', 'B005', 'SupplierIdentityGate', () => {
      const gateViolations = [];
      const supplierThreshold = 0.80;
      
      for (const trace of traces) {
        const rejectedCandidates = trace.rejectedCandidates || [];
        
        for (const rejected of rejectedCandidates) {
          if (rejected.reason === 'SupplierIdentityFailed') {
            // Verify rejection was justified
            if (rejected.score >= supplierThreshold) {
              gateViolations.push({
                invoiceId: trace.invoiceId,
                candidateId: rejected.candidateId,
                score: rejected.score,
                threshold: supplierThreshold,
                issue: 'Valid candidate wrongly rejected by Supplier Gate'
              });
            }
          }
        }
      }
      
      if (gateViolations.length > 0) {
        throw new InvariantViolationError(
          `${gateViolations.length} Supplier Gate violations`,
          { violations: gateViolations.slice(0, 5) },
          'HIGH'
        );
      }
      
      return { threshold: supplierThreshold, status: 'Gate operating correctly' };
    });

    // B006: Cross-Field Validation
    this._checkInvariant('layer3', 'B006', 'CrossFieldValidation', () => {
      const crossFieldIssues = [];
      
      for (const trace of traces) {
        if (trace.decision !== 'PATTERN_MATCH') continue;
        
        // Check: Total should be consistent with line items
        const invoiceTotal = trace.invoiceDetails?.total;
        const lineItemsTotal = trace.invoiceDetails?.lineItemsTotal;
        const matchedTotal = trace.matchedPattern?.total;
        
        if (invoiceTotal && lineItemsTotal) {
          const variance = Math.abs(invoiceTotal - lineItemsTotal) / Math.max(invoiceTotal, 1);
          if (variance > 0.05) { // 5% tolerance
            crossFieldIssues.push({
              invoiceId: trace.invoiceId,
              type: 'TOTAL_MISMATCH',
              invoiceTotal,
              lineItemsTotal,
              variance: `${(variance * 100).toFixed(1)}%`
            });
          }
        }
      }
      
      if (crossFieldIssues.length > 10) {
        this._addWarning('layer3', 'B006', 'CrossFieldValidation',
          `${crossFieldIssues.length} cross-field inconsistencies found`,
          { samples: crossFieldIssues.slice(0, 5) }
        );
      }
      
      return { issuesFound: crossFieldIssues.length };
    });

    // B007: No Ghost Patterns
    this._checkInvariant('layer3', 'B007', 'NoGhostPatterns', () => {
      const patternStore = result.patternStore || new Map();
      const usedPatternIds = new Set();
      const ghostPatterns = [];
      
      // Collect all referenced pattern IDs
      for (const trace of traces) {
        if (trace.matchedPattern?.id) {
          usedPatternIds.add(trace.matchedPattern.id);
        }
        for (const rejected of (trace.rejectedCandidates || [])) {
          if (rejected.patternId) {
            usedPatternIds.add(rejected.patternId);
          }
        }
      }
      
      // Check for patterns that exist but were never referenced
      // (This is informational, not necessarily an error)
      const unreferencedCount = patternStore.size - usedPatternIds.size;
      
      if (unreferencedCount > patternStore.size * 0.5) {
        this._addWarning('layer3', 'B007', 'NoGhostPatterns',
          `${unreferencedCount} patterns never referenced (possible ghost patterns)`);
      }
      
      return { totalPatterns: patternStore.size, referencedPatterns: usedPatternIds.size };
    });

    // B008: Version Compatibility
    this._checkInvariant('layer3', 'B008', 'VersionCompatibility', () => {
      const versionIssues = [];
      
      for (const trace of traces) {
        const patternVersion = trace.matchedPattern?.version;
        const minCompatibleVersion = trace.minCompatibleVersion || '1.0.0';
        
        if (patternVersion && this._compareVersions(patternVersion, minCompatibleVersion) < 0) {
          versionIssues.push({
            invoiceId: trace.invoiceId,
            patternVersion,
            minRequired: minCompatibleVersion
          });
        }
      }
      
      if (versionIssues.length > 0) {
        throw new InvariantViolationError(
          `${versionIssues.length} version compatibility issues`,
          { issues: versionIssues.slice(0, 5) },
          'MEDIUM'
        );
      }
      
      return { status: 'All versions compatible' };
    });
  }

  // ============================================================
  // HELPER METHODS
  // ============================================================

  _checkInvariant(layer, id, name, testFn, defaultSeverity = 'CRITICAL') {
    try {
      const result = testFn();
      this.results[layer].passed.push({ id, name, result, timestamp: new Date().toISOString() });
      console.log(`  ✅ ${id}: ${name}`);
    } catch (error) {
      const failure = {
        id, 
        name, 
        error: error.message,
        details: error.details || {},
        severity: error.severity || defaultSeverity,
        timestamp: new Date().toISOString()
      };
      this.results[layer].failed.push(failure);
      
      const icon = error.severity === 'CRITICAL' ? '❌' : 
                   error.severity === 'HIGH' ? '⚠️' : '⚡';
      console.log(`  ${icon} ${id}: ${name} - ${error.message}`);
    }
  }

  _addWarning(layer, id, name, message, details = {}) {
    this.results[layer].warnings.push({
      id, name, message, details, timestamp: new Date().toISOString()
    });
    console.log(`  ⚡ ${id}: ${name} - ${message}`);
  }

  _compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    const maxLen = Math.max(parts1.length, parts2.length);
    
    for (let i = 0; i < maxLen; i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 < p2) return -1;
      if (p1 > p2) return 1;
    }
    return 0;
  }

  generateReport() {
    const totalPassed = this.results.layer1.passed.length + 
                       this.results.layer2.passed.length + 
                       this.results.layer3.passed.length;
    const totalFailed = this.results.layer1.failed.length + 
                       this.results.layer2.failed.length + 
                       this.results.layer3.failed.length;
    const totalWarnings = this.results.layer1.warnings.length + 
                         this.results.layer2.warnings.length + 
                         this.results.layer3.warnings.length;
    
    const overallStatus = totalFailed === 0 ? 'PASSED' : 'FAILED';
    const criticalFailures = [...this.results.layer1.failed, ...this.results.layer2.failed, ...this.results.layer3.failed]
      .filter(f => f.severity === 'CRITICAL');

    return {
      summary: {
        overallStatus,
        totalInvariants: totalPassed + totalFailed,
        passed: totalPassed,
        failed: totalFailed,
        warnings: totalWarnings,
        criticalFailures: criticalFailures.length,
        canProceedToProduction: totalFailed === 0 && criticalFailures.length === 0
      },
      layers: this.results,
      recommendations: this._generateRecommendations(),
      generatedAt: new Date().toISOString()
    };
  }

  _generateRecommendations() {
    const recommendations = [];
    
    // Check for specific patterns
    const hasCriticalFailure = this.results.layer1.failed.some(f => f.severity === 'CRITICAL') ||
                               this.results.layer2.failed.some(f => f.severity === 'CRITICAL') ||
                               this.results.layer3.failed.some(f => f.severity === 'CRITICAL');
    
    if (hasCriticalFailure) {
      recommendations.push({
        priority: 'P0',
        action: 'STOP - Do not proceed until critical failures resolved',
        reason: 'Critical invariant violations indicate fundamental measurement errors'
      });
    }

    const fnZeroIssue = this.results.layer1.failed.find(f => f.id === 'M006');
    if (fnZeroIssue) {
      recommendations.push({
        priority: 'P0',
        action: 'Investigate FN=0 condition - Decision Policy always accepting',
        reason: 'System never rejects, which explains inflated FP count'
      });
    }

    const trnViolations = this.results.layer3.failed.find(f => f.id === 'B001');
    if (trnViolations) {
      recommendations.push({
        priority: 'P0',
        action: 'Immediate investigation of TRN mismatch pattern matches',
        reason: 'Business rule violation - potential false matches in production'
      });
    }

    return recommendations;
  }
}

// ============================================================
// SECTION 2: TREE-STRUCTURED ROOT CAUSE ATTRIBUTION
// ============================================================

/**
 * RootCauseAttributor - Tree-Structured Error Analysis
 * 
 * Structure:
 * FALSE_MATCH (root)
 * ├── Candidate Selection
 * │   ├── Wrong Supplier Pool
 * │   │   └── cause: supplier_gate_failed
 * │   ├── Tenant Leak
 * │   │   └── cause: tenant_isolation_failed
 * │   └── Empty Candidate Pool
 *       └── cause: candidate_pool_corrupted
 * ├── Ranking
 * │   ├── Semantic Score Issue
 * │   │   ├── cause: semantic_score_selected_wrong_candidate
 * │   │   └── cause: semantic_features_corrupted
 * │   └── Threshold Issue
 * │       ├── cause: threshold_too_low
 * │       └── cause: threshold_bypassed
 * └── Validation
 *     ├── Supplier Gate Failed
 *     │   └── cause: supplier_gate_bypassed
 *     └── Cross-Field Failed
 *         └── cause: cross_field_validation_failed
 * 
 * FALSE_NEGATIVE (missed match)
 * ├── Pattern Not Found
 * │   └── cause: pattern_not_in_store
 * ├── Filtered Too Early
 * │   └── cause: over_aggressive_filtering
 * └── Score Below Threshold
 *     └── cause: threshold_too_high
 */
class RootCauseAttributor {
  constructor() {
    // Root cause tree definition
    this.causeTree = {
      FALSE_MATCH: {
        description: 'System matched to wrong supplier/pattern',
        children: {
          candidate_selection: {
            description: 'Wrong candidates presented to ranking',
            causes: ['supplier_gate_failed', 'tenant_isolation_failed', 'candidate_pool_corrupted']
          },
          ranking: {
            description: 'Ranking selected wrong candidate',
            causes: ['semantic_score_selected_wrong_candidate', 'semantic_features_corrupted', 'threshold_too_low', 'threshold_bypassed']
          },
          validation: {
            description: 'Validation gates failed',
            causes: ['supplier_gate_bypassed', 'cross_field_validation_failed', 'tie_breaking_error']
          }
        }
      },
      FALSE_NEGATIVE: {
        description: 'System missed a valid match opportunity',
        children: {
          pattern_availability: {
            description: 'Pattern not available for matching',
            causes: ['pattern_not_in_store', 'pattern_version_mismatch']
          },
          filtering: {
            description: 'Correct pattern filtered out',
            causes: ['over_aggressive_filtering', 'layout_hash_mismatch']
          },
          scoring: {
            description: 'Correct pattern scored too low',
            causes: ['threshold_too_high', 'ocr_noise_impact', 'feature_extraction_error']
          }
        }
      },
      TRUE_POSITIVE: {
        description: 'Correct match (for analysis)',
        children: {
          confident_match: {
            description: 'High confidence correct match',
            causes: ['strong_semantic_match', 'exact_layout_match', 'trn_confirmation']
          },
          borderline_match: {
            description: 'Low confidence but correct',
            causes: ['lucky_threshold_pass', 'tie_break_correct']
          }
        }
      }
    };

    // Attribution rules engine
    this.attributionRules = [
      this._checkSupplierGateBypass.bind(this),
      this._checkTenantIsolation.bind(this),
      this._checkSemanticSelection.bind(this),
      this._checkThresholdIssue.bind(this),
      this._checkTieBreaking.bind(this),
      this._checkCandidatePool.bind(this),
      this._checkPatternAvailability.bind(this),
      this._checkFilteringAggression.bind(this)
    ];
  }

  /**
   * Analyze single invoice and assign root cause
   */
  analyzeInvoice(invoiceResult) {
    const { invoiceId, decision, trace, groundTruth, expectedSupplierId } = invoiceResult;
    
    // Determine error type
    let errorType;
    if (decision === 'PATTERN_MATCH' && expectedSupplierId && decision.supplierId !== expectedSupplierId) {
      errorType = 'FALSE_MATCH';
    } else if (decision === 'AI_FALLBACK' || decision === 'NO_PATTERN' && expectedSupplierId) {
      errorType = 'FALSE_NEGATIVE';
    } else if (decision === 'PATTERN_MATCH' && (!expectedSupplierId || decision.supplierId === expectedSupplierId)) {
      errorType = 'TRUE_POSITIVE';
    } else {
      errorType = 'TRUE_NEGATIVE'; // Correctly rejected
    }

    // Apply attribution rules
    const attribution = this._applyRules(invoiceResult, errorType);

    return {
      invoiceId,
      errorType,
      decision: decision.decision || decision,
      assignedSupplier: decision.supplierId,
      expectedSupplier: expectedSupplierId,
      rootCause: attribution.cause,
      category: attribution.category,
      subcategory: attribution.subcategory,
      confidence: attribution.confidence,
      evidence: attribution.evidence,
      treePath: attribution.treePath
    };
  }

  /**
   * Analyze batch of invoices
   */
  analyzeBatch(invoiceResults) {
    const attributions = [];
    const summary = {
      total: invoiceResults.length,
      byErrorType: {},
      byRootCause: {},
      byCategory: {}
    };

    for (const result of invoiceResults) {
      const attribution = this.analyzeInvoice(result);
      attributions.push(attribution);

      // Update summaries
      summary.byErrorType[attribution.errorType] = (summary.byErrorType[attribution.errorType] || 0) + 1;
      summary.byRootCause[attribution.rootCause] = (summary.byRootCause[attribution.rootCause] || 0) + 1;
      summary.byCategory[attribution.category] = (summary.byCategory[attribution.category] || 0) + 1;
    }

    // Calculate percentages
    summary.byErrorTypePercent = {};
    summary.byRootCausePercent = {};
    
    for (const [type, count] of Object.entries(summary.byErrorType)) {
      summary.byErrorTypePercent[type] = ((count / summary.total) * 100).toFixed(1) + '%';
    }
    for (const [cause, count] of Object.entries(summary.byRootCause)) {
      summary.byRootCausePercent[cause] = ((count / summary.total) * 100).toFixed(1) + '%';
    }

    return {
      attributions,
      summary,
      causeTree: this.causeTree,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Generate tree visualization for report
   */
  generateTreeVisualization(attributions) {
    const lines = ['ROOT CAUSE TREE ANALYSIS', '═'.repeat(50)];
    
    // Group by error type then by category
    const grouped = {};
    for (const attr of attributions) {
      const key = `${attr.errorType}|${attr.category}|${attr.subcategory}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(attr);
    }

    for (const [key, items] of Object.entries(grouped).sort((a, b) => b[1].length - a[1].length)) {
      const [errorType, category, subcategory] = key.split('|');
      lines.push('');
      lines.push(`📁 ${errorType}`);
      lines.push(`  📂 ${category}`);
      lines.push(`    📄 ${subcategory}: ${items.length} invoices (${((items.length/attributions.length)*100).toFixed(1)}%)`);
      
      // Show sample invoice IDs
      if (items.length <= 5) {
        for (const item of items) {
          lines.push(`       • ${item.invoiceId}`);
        }
      } else {
        lines.push(`       • Samples: ${items.slice(0,3).map(i => i.invoiceId).join(', ')}`);
        lines.push(`       • ... and ${items.length - 3} more`);
      }
    }

    return lines.join('\n');
  }

  // ============================================================
  // ATTRIBUTION RULES
  // ============================================================

  _applyRules(invoiceResult, errorType) {
    for (const rule of this.attributionRules) {
      const result = rule(invoiceResult, errorType);
      if (result) return result;
    }

    // Default if no rule matched
    return {
      cause: 'unknown_cause',
      category: 'unclassified',
      subcategory: 'unknown',
      confidence: 0.1,
      evidence: ['No attribution rule matched'],
      treePath: ['UNKNOWN']
    };
  }

  _checkSupplierGateBypass(invoiceResult, errorType) {
    const { trace } = invoiceResult;
    if (!trace) return null;

    const rejectedByGate = (trace.rejectedCandidates || [])
      .filter(r => r.reason === 'SupplierIdentityFailed' && r.score >= 0.80);

    // If a valid candidate was rejected by gate, and we got wrong match
    if (errorType === 'FALSE_MATCH' && rejectedByGate.length > 0) {
      return {
        cause: 'supplier_gate_bypassed',
        category: 'validation',
        subcategory: 'Supplier Gate Failed',
        confidence: 0.95,
        evidence: [
          `${rejectedByGate.length} valid candidates rejected by Supplier Gate`,
          `Highest rejected score: ${Math.max(...rejectedByGate.map(r => r.score)).toFixed(2)}`
        ],
        treePath: ['FALSE_MATCH', 'validation', 'supplier_gate_bypassed']
      };
    }

    // If correct candidate was rejected by gate (false negative)
    if (errorType === 'FALSE_NEGATIVE' && rejectedByGate.length > 0) {
      return {
        cause: 'supplier_gate_failed',
        category: 'candidate_selection',
        subcategory: 'Wrong Supplier Pool',
        confidence: 0.90,
        evidence: [
          `Expected supplier rejected by gate`,
          `Rejected candidates: ${rejectedByGate.map(r => r.candidateId).join(', ')}`
        ],
        treePath: ['FALSE_NEGATIVE', 'pattern_availability', 'supplier_gate_failed']
      };
    }

    return null;
  }

  _checkTenantIsolation(invoiceResult, errorType) {
    const { trace, groundTruth } = invoiceResult;
    if (!trace || !groundTruth) return null;

    const invoiceTenant = trace.invoiceDetails?.tenantId;
    const expectedTenant = groundTruth.tenantId;
    const matchedTenant = trace.matchedPattern?.tenantId;

    // Check for tenant leak in false matches
    if (errorType === 'FALSE_MATCH' && invoiceTenant && expectedTenant && matchedTenant) {
      if (matchedTenant !== expectedTenant) {
        return {
          cause: 'tenant_isolation_failed',
          category: 'candidate_selection',
          subcategory: 'Tenant Leak',
          confidence: 0.99,
          evidence: [
            `Invoice tenant: ${invoiceTenant}`,
            `Expected tenant: ${expectedTenant}`,
            `Matched to tenant: ${matchedTenant}`
          ],
          treePath: ['FALSE_MATCH', 'candidate_selection', 'tenant_isolation_failed']
        };
      }
    }

    return null;
  }

  _checkSemanticSelection(invoiceResult, errorType) {
    const { trace } = invoiceResult;
    if (!trace || errorType !== 'FALSE_MATCH') return null;

    const scores = trace.scores || {};
    const semanticScore = scores.semantic || scores.total || 0;
    const candidates = trace.candidateScores || [];

    // If semantic score was high but wrong candidate selected
    if (semanticScore > 0.85 && candidates.length > 1) {
      const sortedCandidates = [...candidates].sort((a, b) => (b.score || 0) - (a.score || 0));
      const topCandidate = sortedCandidates[0];
      
      // Check if there were close competitors
      const closeCompetitors = sortedCandidates.filter(c => 
        c.candidateId !== topCandidate.candidateId && 
        (topCandidate.score - c.score) < 0.1
      );

      if (closeCompetitors.length > 0) {
        return {
          cause: 'semantic_score_selected_wrong_candidate',
          category: 'ranking',
          subcategory: 'Semantic Score Issue',
          confidence: 0.85,
          evidence: [
            `Semantic score: ${semanticScore.toFixed(2)}`,
            `Selected: ${topCandidate.candidateId} (${(topCandidate.score || 0).toFixed(2)})`,
            `Close competitors: ${closeCompetitors.map(c => `${c.candidateId}(${(c.score || 0).toFixed(2)})`).join(', ')}`
          ],
          treePath: ['FALSE_MATCH', 'ranking', 'semantic_score_selected_wrong_candidate']
        };
      }
    }

    return null;
  }

  _checkThresholdIssue(invoiceResult, errorType) {
    const { trace } = invoiceResult;
    if (!trace) return null;

    const finalScore = trace.finalScore || trace.scores?.total || 0;
    const threshold = trace.threshold || 0.70;

    // False match with low score (barely passed threshold)
    if (errorType === 'FALSE_MATCH' && finalScore < threshold + 0.05) {
      return {
        cause: 'threshold_too_low',
        category: 'ranking',
        subcategory: 'Threshold Issue',
        confidence: 0.88,
        evidence: [
          `Final score: ${finalScore.toFixed(2)}`,
          `Threshold: ${threshold.toFixed(2)}`,
          `Margin: ${(finalScore - threshold).toFixed(2)}`
        ],
        treePath: ['FALSE_MATCH', 'ranking', 'threshold_too_low']
      };
    }

    // False negative with score close to threshold
    if (errorType === 'FALSE_NEGATIVE' && finalScore >= threshold - 0.05) {
      return {
        cause: 'threshold_too_high',
        category: 'scoring',
        subcategory: 'Score Below Threshold',
        confidence: 0.82,
        evidence: [
          `Final score: ${finalScore.toFixed(2)}`,
          `Threshold: ${threshold.toFixed(2)}`,
          `Gap: ${(threshold - finalScore).toFixed(2)}`
        ],
        treePath: ['FALSE_NEGATIVE', 'scoring', 'threshold_too_high']
      };
    }

    return null;
  }

  _checkTieBreaking(invoiceResult, errorType) {
    const { trace } = invoiceResult;
    if (!trace || errorType !== 'FALSE_MATCH') return null;

    const candidates = trace.candidateScores || [];
    const scores = candidates.map(c => c.score || 0);
    
    // Check for ties (scores within 0.01 of each other)
    if (scores.length >= 2) {
      const sorted = [...scores].sort((a, b) => b - a);
      if (Math.abs(sorted[0] - sorted[1]) < 0.01) {
        return {
          cause: 'tie_breaking_error',
          category: 'validation',
          subcategory: 'Tie-Breaking Failed',
          confidence: 0.75,
          evidence: [
            `Tie detected between top candidates`,
            `Top scores: ${sorted.slice(0, 3).map(s => s.toFixed(3)).join(', ')}`,
            `Selected: ${trace.selectedCandidate}`
          ],
          treePath: ['FALSE_MATCH', 'validation', 'tie_breaking_error']
        };
      }
    }

    return null;
  }

  _checkCandidatePool(invoiceResult, errorType) {
    const { trace } = invoiceResult;
    if (!trace) return null;

    const initialCandidates = trace.pipelineStats?.initialCandidates || 0;
    const finalCandidates = trace.pipelineStats?.finalCandidates || 0;

    // Suspicious: started with many, ended with few/nothing
    if (initialCandidates > 10 && finalCandidates <= 1) {
      return {
        cause: initialCandidates === 0 ? 'candidate_pool_corrupted' : 'over_aggressive_filtering',
        category: errorType === 'FALSE_MATCH' ? 'candidate_selection' : 'filtering',
        subcategory: 'Candidate Pool Issue',
        confidence: 0.70,
        evidence: [
          `Initial candidates: ${initialCandidates}`,
          `After filtering: ${finalCandidates}`,
          `Filter rate: ${((1 - finalCandidates/initialCandidates) * 100).toFixed(1)}%`
        ],
        treePath: [errorType, errorType === 'FALSE_MATCH' ? 'candidate_selection' : 'filtering', 
                   initialCandidates === 0 ? 'candidate_pool_corrupted' : 'over_aggressive_filtering']
      };
    }

    return null;
  }

  _checkPatternAvailability(invoiceResult, errorType) {
    const { trace, groundTruth } = invoiceResult;
    if (!trace || errorType !== 'FALSE_NEGATIVE' || !groundTruth) return null;

    const expectedSupplierId = groundTruth.supplierId;
    const patternExists = trace.patternAvailability?.[expectedSupplierId];

    if (patternExists === false) {
      return {
        cause: 'pattern_not_in_store',
        category: 'pattern_availability',
        subcategory: 'Pattern Not Found',
        confidence: 0.95,
        evidence: [
          `Expected supplier: ${expectedSupplierId}`,
          'Pattern not found in store'
        ],
        treePath: ['FALSE_NEGATIVE', 'pattern_availability', 'pattern_not_in_store']
      };
    }

    return null;
  }

  _checkFilteringAggression(invoiceResult, errorType) {
    const { trace } = invoiceResult;
    if (!trace || errorType !== 'FALSE_NEGATIVE') return null;

    const filterStages = trace.filterStages || [];
    const aggressiveFilters = filterStages.filter(stage => 
      stage.removalRate > 0.8 && stage.candidatesBefore > 5
    );

    if (aggressiveFilters.length > 0) {
      return {
        cause: 'over_aggressive_filtering',
        category: 'filtering',
        subcategory: 'Filtered Too Early',
        confidence: 0.78,
        evidence: [
          `${aggressiveFilters.length} aggressive filter(s) detected`,
          ...aggressiveFilters.map(f => `${f.stageName}: removed ${(f.removalRate*100).toFixed(0)}%`)
        ],
        treePath: ['FALSE_NEGATIVE', 'filtering', 'over_aggressive_filtering']
      };
    }

    return null;
  }
}

// ============================================================
// SECTION 3: DETAILED DECISION TRACE SYSTEM
// ============================================================

/**
 * DecisionTraceLogger - Comprehensive Pipeline Tracing
 * 
 * For EVERY invoice, records:
 * 1. All pipeline stages with timestamps
 * 2. ALL candidates considered (not just winner)
 * 3. Rejected candidates with EXACT reasons and scores
 * 4. Final decision with confidence breakdown
 * 
 * This enables CTO-level debugging: find any invoice issue in <1 minute
 */
class DecisionTraceLogger {
  constructor() {
    this.traces = new Map(); // invoiceId -> Trace object
    this.currentTrace = null;
  }

  /**
   * Start tracing a new invoice
   */
  beginTrace(invoiceId, invoiceMetadata) {
    this.currentTrace = {
      invoiceId,
      startTime: new Date().toISOString(),
      invoiceDetails: {
        ...invoiceMetadata,
        recordedAt: new Date().toISOString()
      },
      stages: [],
      candidates: [],
      rejectedCandidates: [],
      scores: {},
      filterStages: [],
      finalDecision: null,
      finalScore: null,
      selectedPattern: null,
      metadata: {
        processingTimeMs: null,
        memoryUsage: null,
        version: '1.0.0'
      }
    };
    return this;
  }

  /**
   * Record a pipeline stage
   */
  recordStage(stageName, data) {
    if (!this.currentTrace) throw new Error('No active trace - call beginTrace first');

    this.currentTrace.stages.push({
      stage: stageName,
      timestamp: new Date().toISOString(),
      ...data
    });
    return this;
  }

  /**
   * Record candidate consideration
   */
  recordCandidate(candidateId, score, details = {}) {
    if (!this.currentTrace) throw new Error('No active trace');

    this.currentTrace.candidates.push({
      candidateId,
      score,
      consideredAt: new Date().toISOString(),
      ...details
    });
    return this;
  }

  /**
   * Record candidate REJECTION with detailed reason
   * THIS IS THE KEY METHOD FOR DEBUGGING
   */
  recordRejection(candidateId, reason, score, threshold, additionalInfo = {}) {
    if (!this.currentTrace) throw new Error('No active trace');

    this.currentTrace.rejectedCandidates.push({
      candidateId,
      reason, // e.g., 'SupplierIdentityFailed', 'BelowThreshold', 'TenantMismatch'
      score,
      threshold,
      gap: threshold - score,
      gapPercentage: ((threshold - score) / threshold * 100).toFixed(1) + '%',
      rejectedAt: new Date().toISOString(),
      ...additionalInfo
    });
    return this;
  }

  /**
   * Record filter stage statistics
   */
  recordFilterStage(stageName, beforeCount, afterCount, filterReason) {
    if (!this.currentTrace) throw new Error('No active trace');

    this.currentTrace.filterStages.push({
      stageName,
      candidatesBefore: beforeCount,
      candidatesAfter: afterCount,
      removed: beforeCount - afterCount,
      removalRate: (beforeCount - afterCount) / beforeCount,
      filterReason,
      timestamp: new Date().toISOString()
    });
    return this;
  }

  /**
   * Record final scores breakdown
   */
  recordScores(scores) {
    if (!this.currentTrace) throw new Error('No active trace');

    this.currentTrace.scores = {
      ...scores,
      recordedAt: new Date().toISOString()
    };
    return this;
  }

  /**
   * Finalize trace with decision
   */
  finalize(decision, patternId, finalScore, additionalData = {}) {
    if (!this.currentTrace) throw new Error('No active trace');

    this.currentTrace.finalDecision = decision;
    this.currentTrace.finalScore = finalScore;
    this.currentTrace.selectedPattern = patternId;
    this.currentTrace.endTime = new Date().toISOString();
    this.currentTrace.metadata.processingTimeMs = 
      new Date(this.currentTrace.endTime) - new Date(this.currentTrace.startTime);
    
    // Merge any additional data
    Object.assign(this.currentTrace.metadata, additionalData);

    // Store the completed trace
    this.traces.set(this.currentTrace.invoiceId, this.currentTrace);
    
    const completedTrace = this.currentTrace;
    this.currentTrace = null;
    
    return completedTrace;
  }

  /**
   * Get trace for specific invoice
   */
  getTrace(invoiceId) {
    return this.traces.get(invoiceId);
  }

  /**
   * Get all traces
   */
  getAllTraces() {
    return Array.from(this.traces.values());
  }

  /**
   * Generate human-readable trace report for single invoice
   * Format optimized for CTO-level debugging (<1 minute)
   */
  generateDebugReport(invoiceId) {
    const trace = this.traces.get(invoiceId);
    if (!trace) return `No trace found for invoice ${invoiceId}`;

    const lines = [];
    lines.push('═'.repeat(70));
    lines.push(`INVOICE TRACE: ${invoiceId}`);
    lines.push('═'.repeat(70));
    lines.push('');

    // Basic info
    lines.push('📋 BASIC INFO:');
    lines.push(`  Invoice ID: ${trace.invoiceId}`);
    lines.push(`  Processing Time: ${trace.metadata.processingTimeMs}ms`);
    lines.push(`  Start: ${trace.startTime}`);
    lines.push(`  End: ${trace.endTime || 'In progress'}`);
    lines.push('');

    // Final decision
    lines.push('🎯 FINAL DECISION:');
    lines.push(`  Decision: ${trace.finalDecision || 'PENDING'}`);
    lines.push(`  Selected Pattern: ${trace.selectedPattern || 'NONE'}`);
    lines.push(`  Final Score: ${trace.finalScore !== null ? trace.finalScore.toFixed(4) : 'N/A'}`);
    lines.push('');

    // Score breakdown
    if (Object.keys(trace.scores).length > 0) {
      lines.push('📊 SCORE BREAKDOWN:');
      for (const [component, value] of Object.entries(trace.scores)) {
        if (typeof value === 'number') {
          const bar = '█'.repeat(Math.round(value * 20)) + '░'.repeat(20 - Math.round(value * 20));
          lines.push(`  ${component.padEnd(20)}: ${(value * 100).toFixed(1).padStart(6)}% ${bar}`);
        }
      }
      lines.push('');
    }

    // Pipeline stages
    if (trace.stages.length > 0) {
      lines.push('🔄 PIPELINE STAGES:');
      for (const stage of trace.stages) {
        const icon = stage.success !== false ? '✅' : '❌';
        lines.push(`  ${icon} ${stage.stage}: ${stage.status || 'completed'} (${stage.durationMs || '?'}ms)`);
        if (stage.note) lines.push(`     └─ ${stage.note}`);
      }
      lines.push('');
    }

    // REJECTED CANDIDATES - THE MOST IMPORTANT SECTION FOR DEBUGGING
    if (trace.rejectedCandidates.length > 0) {
      lines.push('🚫 REJECTED CANDIDATES:');
      lines.push('─'.repeat(70));
      
      for (let i = 0; i < trace.rejectedCandidates.length; i++) {
        const rejected = trace.rejectedCandidates[i];
        lines.push('');
        lines.push(`  #${i + 1} Candidate: ${rejected.candidateId}`);
        lines.push(`     Reason: ${rejected.reason}`);
        const scoreVal = typeof rejected.score === 'number' ? rejected.score.toFixed(2) : (rejected.score || 'N/A');
        const thresholdVal = typeof rejected.threshold === 'number' ? rejected.threshold.toFixed(2) : (rejected.threshold || 'N/A');
        const gapVal = typeof rejected.gap === 'number' ? rejected.gap.toFixed(2) : (rejected.gap || 'N/A');
        
        lines.push(`     Score: ${scoreVal} (required: ${thresholdVal})`);
        lines.push(`     Gap: ${gapVal} (${rejected.gapPercentage || 'N/A'} below threshold)`);
        
        if (rejected.additionalContext) {
          lines.push(`     Context: ${JSON.stringify(rejected.additionalContext)}`);
        }
      }
      lines.push('');
    }

    // Filter stages summary
    if (trace.filterStages.length > 0) {
      lines.push('🔽 FILTER FUNNEL:');
      let prevCount = null;
      for (const fs of trace.filterStages) {
        const arrow = prevCount !== null ? ' ▼' : '';
        const removalStr = fs.removed > 0 ? ` (-${fs.removed}, ${(fs.removalRate * 100).toFixed(0)}%)` : '';
        lines.push(`  ${fs.stageName}:${arrow} ${fs.candidatesAfter}${removalStr}`);
        prevCount = fs.candidatesAfter;
      }
      lines.push('');
    }

    // All candidates considered
    if (trace.candidates.length > 0) {
      lines.push('📑 ALL CANDIDATES CONSIDERED:');
      const sorted = [...trace.candidates].sort((a, b) => (b.score || 0) - (a.score || 0));
      for (let i = 0; i < sorted.length; i++) {
        const c = sorted[i];
        const isSelected = c.candidateId === trace.selectedPattern;
        const marker = isSelected ? ' 👑' : '';
        lines.push(`  ${i + 1}. ${c.candidateId}: ${(c.score || 0).toFixed(3)}${marker}`);
      }
    }

    lines.push('');
    lines.push('═'.repeat(70));

    return lines.join('\n');
  }

  /**
   * Generate summary statistics across all traces
   */
  generateSummaryStats() {
    const traces = this.getAllTraces();
    if (traces.length === 0) return null;

    const stats = {
      totalTraces: traces.length,
      decisions: {},
      averageProcessingTime: 0,
      averageRejectedPerInvoice: 0,
      rejectionReasons: {},
      filterEfficiency: {},
      scoreDistributions: {}
    };

    let totalTime = 0;
    let totalRejected = 0;

    for (const trace of traces) {
      // Decision distribution
      stats.decisions[trace.finalDecision] = (stats.decisions[trace.finalDecision] || 0) + 1;
      
      // Timing
      totalTime += trace.metadata.processingTimeMs || 0;
      
      // Rejections
      totalRejected += trace.rejectedCandidates.length;
      for (const rejected of trace.rejectedCandidates) {
        stats.rejectionReasons[rejected.reason] = (stats.rejectionReasons[rejected.reason] || 0) + 1;
      }

      // Filter efficiency
      for (const fs of trace.filterStages) {
        if (!stats.filterEfficiency[fs.stageName]) {
          stats.filterEfficiency[fs.stageName] = { totalRemoved: 0, totalCount: 0 };
        }
        stats.filterEfficiency[fs.stageName].totalRemoved += fs.removed;
        stats.filterEfficiency[fs.stageName].totalCount += fs.candidatesBefore;
      }

      // Score distributions
      for (const [component, value] of Object.entries(trace.scores)) {
        if (typeof value === 'number') {
          if (!stats.scoreDistributions[component]) {
            stats.scoreDistributions[component] = { min: 1, max: 0, sum: 0, count: 0 };
          }
          const dist = stats.scoreDistributions[component];
          dist.min = Math.min(dist.min, value);
          dist.max = Math.max(dist.max, value);
          dist.sum += value;
          dist.count += 1;
        }
      }
    }

    stats.averageProcessingTime = totalTime / traces.length;
    stats.averageRejectedPerInvoice = totalRejected / traces.length;

    // Compute averages for score distributions
    for (const [component, dist] of Object.entries(stats.scoreDistributions)) {
      dist.avg = dist.sum / dist.count;
    }

    return stats;
  }
}

// ============================================================
// SECTION 4: PROPERTY-BASED TESTING FRAMEWORK
// ============================================================

/**
 * PropertyBasedTester - Automated Scenario Generation & Validation
 * 
 * Generates 100k+ random scenarios covering:
 * - Shared layouts between suppliers
 * - Missing/corrupt OCR fields
 * - Duplicate TRNs
 * - Currency mismatches
 * - Various noise levels
 * - Edge cases (empty fields, unicode, etc.)
 * 
 * Validates ALL invariants pass for every scenario
 * CI-ready: fails build if ANY invariant violated
 */
class PropertyBasedTester {
  constructor(options = {}) {
    this.invariantChecker = new BenchmarkInvariantChecker();
    this.scenariosGenerated = 0;
    this.scenariosPassed = 0;
    this.scenariosFailed = 0;
    this.failures = [];
    this.options = {
      maxScenarios: options.maxScenarios || 100000,
      failFast: options.failFast || false, // Stop on first failure
      parallelWorkers: options.parallelWorkers || 4,
      seed: options.seed || Date.now(),
      verbose: options.verbose || false
    };
    
    // Scenario generators registry
    this.scenarioGenerators = [
      this._generateSharedLayoutScenario.bind(this),
      this._generateMissingOCRScenario.bind(this),
      this._generateDuplicateTRNScenario.bind(this),
      this._generateCurrencyMismatchScenario.bind(this),
      this._generateHighNoiseScenario.bind(this),
      this._generateEdgeCaseScenario.bind(this),
      this._generateMultiLanguageScenario.bind(this),
      this._generateVersionConflictScenario.bind(this),
      this._generateTenantBoundaryScenario.bind(this),
      this._generateThresholdBoundaryScenario.bind(this)
    ];
  }

  /**
   * Run full property-based test suite
   */
  async runFullSuite() {
    console.log('═'.repeat(80));
    console.log('  PROPERTY-BASED TESTING FRAMEWORK');
    console.log('═'.repeat(80));
    console.log(`  Target Scenarios: ${this.options.maxScenarios.toLocaleString()}`);
    console.log(`  Fail Fast: ${this.options.failFast}`);
    console.log(`  Seed: ${this.options.seed}`);
    console.log('');

    const startTime = Date.now();

    // Generate and test scenarios
    for (let i = 0; i < this.options.maxScenarios; i++) {
      if (i % 10000 === 0 && i > 0) {
        console.log(`  Progress: ${i.toLocaleString()}/${this.options.maxScenarios.toLocaleString()} (${(i/this.options.maxScenarios*100).toFixed(0)}%)`);
      }

      try {
        const scenario = this._generateRandomScenario(i);
        const result = this._executeScenario(scenario);
        const validationResult = this.invariantChecker.runAllInvariants(result);

        if (validationResult.summary.overallStatus === 'FAILED') {
          this.scenariosFailed++;
          this.failures.push({
            scenarioIndex: i,
            scenarioType: scenario.type,
            failures: validationResult.summary.layers
              ? Object.values(validationResult.summary.layers)
                .flatMap(l => l.failed || [])
              : []
          });

          if (this.options.failFast) {
            console.log(`\n  ❌ FAIL FAST at scenario #${i}`);
            break;
          }
        } else {
          this.scenariosPassed++;
        }
      } catch (error) {
        this.scenariosFailed++;
        this.failures.push({
          scenarioIndex: i,
          error: error.message,
          stack: error.stack
        });

        if (this.options.failFast) break;
      }

      this.scenariosGenerated++;
    }

    const elapsed = Date.now() - startTime;

    return this._generateTestReport(elapsed);
  }

  /**
   * Run targeted test for specific invariant
   */
  testInvariant(invariantId, scenarioCount = 1000) {
    console.log(`\n  Testing Invariant: ${invariantId} with ${scenarioCount} scenarios...`);
    
    let passed = 0;
    let failed = 0;
    const failures = [];

    for (let i = 0; i < scenarioCount; i++) {
      const scenario = this._generateTargetedScenario(invariantId, i);
      const result = this._executeScenario(scenario);
      const checkResult = this.invariantChecker.runAllInvariants(result);

      if (checkResult.summary.overallStatus === 'FAILED') {
        failed++;
        failures.push({ scenarioIndex: i, type: scenario.type });
      } else {
        passed++;
      }
    }

    return {
      invariantId,
      total: scenarioCount,
      passed,
      failed,
      passRate: `${((passed/scenarioCount)*100).toFixed(2)}%`,
      failures: failures.slice(0, 10)
    };
  }

  // ============================================================
  // SCENARIO GENERATORS
  // ============================================================

  _generateRandomScenario(seed) {
    // Pick random generator based on seed
    const generatorIndex = seed % this.scenarioGenerators.length;
    return this.scenarioGenerators[generatorIndex](seed);
  }

  _generateTargetedScenario(invariantId, seed) {
    // Map invariants to scenario types that should trigger them
    const invariantScenarioMap = {
      'M001': () => this._generateEdgeCaseScenario(seed), // Confusion matrix completeness
      'M005': () => this._generateSharedLayoutScenario(seed), // FMR consistency
      'M006': () => this._generateThresholdBoundaryScenario(seed), // Impossible states
      'B001': () => this._generateDuplicateTRNScenario(seed), // TRN mismatch
      'B002': () => this._generateTenantBoundaryScenario(seed), // Tenant isolation
      'P003': () => this._generateEdgeCaseScenario(seed), // Single decision
    };

    const generator = invariantScenarioMap[invariantId] || (() => this._generateEdgeCaseScenario(seed));
    return generator();
  }

  _generateSharedLayoutScenario(seed) {
    // Multiple suppliers share same ERP layout (common real-world case)
    const baseLayoutHash = `layout_shared_${seed % 50}`;
    const supplierCount = 2 + (seed % 5); // 2-6 suppliers share layout
    
    const suppliers = Array.from({ length: supplierCount }, (_, i) => ({
      id: `supplier_${seed}_${i}`,
      layoutHash: baseLayoutHash,
      trn: `TRN_${seed}_${i}_${this._randomString(8)}`,
      tenantId: `tenant_${seed % 10}`,
      currency: ['SAR', 'AED', 'USD'][seed % 3]
    }));

    const invoices = suppliers.flatMap((supplier, idx) => 
      Array.from({ length: 5 + (seed % 10) }, (_, j) => ({
        id: `invoice_${seed}_${idx}_${j}`,
        supplierId: supplier.id,
        layoutHash: baseLayoutHash,
        trn: supplier.trn,
        tenantId: supplier.tenantId,
        currency: supplier.currency,
        ocrQuality: 0.7 + Math.random() * 0.3,
        isCorrectMatch: idx === 0 ? (Math.random() > 0.3) : (Math.random() > 0.9) // First supplier usually correct
      }))
    );

    return {
      type: 'SHARED_LAYOUT',
      seed,
      suppliers,
      invoices,
      expectedChallenge: 'System must distinguish suppliers with identical layouts'
    };
  }

  _generateMissingOCRScenario(seed) {
    // Simulate OCR failures - missing critical fields
    const fieldTypes = ['supplierName', 'trn', 'total', 'date', 'lineItems'];
    const missingFields = fieldTypes.filter(() => Math.random() < 0.3); // 30% chance each field missing
    
    return {
      type: 'MISSING_OCR',
      seed,
      invoice: {
        id: `invoice_missing_ocr_${seed}`,
        supplierId: `supplier_${seed}`,
        trn: missingFields.includes('trn') ? null : `TRN_${seed}`,
        total: missingFields.includes('total') ? null : 1000 + Math.random() * 10000,
        supplierName: missingFields.includes('supplierName') ? null : `Supplier ${seed}`,
        date: missingFields.includes('date') ? null : new Date().toISOString(),
        lineItems: missingFields.includes('lineItems') ? [] : this._generateLineItems(1 + seed % 10),
        ocrConfidence: 0.3 + Math.random() * 0.4
      },
      missingFields,
      expectedChallenge: 'Handle incomplete OCR data gracefully'
    };
  }

  _generateDuplicateTRNScenario(seed) {
    // Different suppliers with same TRN (data quality issue)
    const sharedTRN = `DUPLICATE_TRN_${seed}`;
    
    return {
      type: 'DUPLICATE_TRN',
      seed,
      suppliers: [
        { id: `supplier_a_${seed}`, trn: sharedTRN, name: 'Company A', isValid: true },
        { id: `supplier_b_${seed}`, trn: sharedTRN, name: 'Company B', isValid: false } // Duplicate
      ],
      invoice: {
        id: `invoice_dup_trn_${seed}`,
        trn: sharedTRN,
        expectedSupplier: `supplier_a_${seed}`
      },
      expectedChallenge: 'Detect and handle TRN duplicates correctly'
    };
  }

  _generateCurrencyMismatchScenario(seed) {
    // Invoice currency differs from pattern currency
    const currencies = ['SAR', 'AED', 'USD', 'EUR', 'GBP', 'QAR', 'KWD', 'BHD'];
    const invoiceCurrency = currencies[seed % currencies.length];
    const patternCurrency = currencies[(seed + 3) % currencies.length]; // Usually different
    
    return {
      type: 'CURRENCY_MISMATCH',
      seed,
      invoice: {
        id: `invoice_currency_${seed}`,
        currency: invoiceCurrency,
        total: 1000 + seed * 100
      },
      pattern: {
        currency: patternCurrency,
        total: 1000 + seed * 100
      },
      isMismatch: invoiceCurrency !== patternCurrency,
      expectedChallenge: 'Detect currency mismatches and adjust scoring'
    };
  }

  _generateHighNoiseScenario(seed) {
    // Heavy OCR noise, garbled text
    const noiseLevel = 0.3 + (seed % 7) * 0.1; // 30%-90% noise
    
    return {
      type: 'HIGH_NOISE',
      seed,
      noiseLevel,
      invoice: {
        id: `invoice_noise_${seed}`,
        supplierName: this._applyNoise(`Supplier Company ${seed}`, noiseLevel),
        trn: this._applyNoise(`TRN${seed.toString().padStart(10, '0')}`, noiseLevel * 0.5), // TRN less noisy
        total: 1000 + Math.random() * 5000,
        ocrConfidence: 1 - noiseLevel
      },
      expectedChallenge: 'Maintain accuracy despite heavy OCR noise'
    };
  }

  _generateEdgeCaseScenario(seed) {
    // Boundary values and edge cases
    const edgeCases = [
      { type: 'EMPTY_FIELDS', invoice: { id: `edge_empty_${seed}`, supplierName: '', trn: '', total: 0 } },
      { type: 'UNICODE_SPECIAL', invoice: { id: `edge_unicode_${seed}`, supplierName: 'شركة ألف-باء ⚡️🔥', trn: '٣٠٠١٢٣٤٥٦' } },
      { type: 'VERY_LONG_TEXT', invoice: { id: `edge_long_${seed}`, supplierName: 'A'.repeat(500) } },
      { type: 'SPECIAL_CHARS', invoice: { id: `edge_special_${seed}`, supplierName: '<script>alert("xss")</script>' } },
      { type: 'NULL_VALUES', invoice: { id: `edge_null_${seed}`, supplierName: null, trn: null, total: null } },
      { type: 'NEGATIVE_TOTAL', invoice: { id: `edge_negative_${seed}`, total: -1000 } }, // Credit note
      { type: 'ZERO_TOTAL', invoice: { id: `edge_zero_${seed}`, total: 0 } },
      { type: 'EXTREME_TOTAL', invoice: { id: `edge_extreme_${seed}`, total: 999999999.99 } }
    ];

    return {
      type: 'EDGE_CASE',
      seed,
      edgeCase: edgeCases[seed % edgeCases.length],
      expectedChallenge: 'Handle edge cases without crashing'
    };
  }

  _generateMultiLanguageScenario(seed) {
    // Mixed language content
    const languages = [
      { lang: 'arabic', text: 'فاتورة ضريبية من شركة الرياض للمقاولات', direction: 'rtl' },
      { lang: 'english', text: 'Tax Invoice from Riyadh Construction Co.', direction: 'ltr' },
      { lang: 'mixed', text: 'فاتورة Invoice ضريبية Tax من from الشركة Company', direction: 'mixed' },
      { lang: 'french', text: 'Facture fiscale de Construction Paris', direction: 'ltr' },
      { lang: 'chinese', text: '北京建筑公司税务发票', direction: 'ltr' }
    ];

    const langConfig = languages[seed % languages.length];

    return {
      type: 'MULTI_LANGUAGE',
      seed,
      language: langConfig.lang,
      invoice: {
        id: `invoice_lang_${seed}`,
        supplierName: langConfig.text,
        textDirection: langConfig.direction
      },
      expectedChallenge: 'Process multi-language content correctly'
    };
  }

  _generateVersionConflictScenario(seed) {
    // Pattern version conflicts
    const versions = ['1.0.0', '1.1.0', '2.0.0', '2.1.0-beta', '3.0.0-rc'];
    
    return {
      type: 'VERSION_CONFLICT',
      seed,
      patternVersion: versions[seed % versions.length],
      engineMinVersion: versions[Math.max(0, (seed % versions.length) - 1)],
      isCompatible: seed % 5 !== 0, // Most are compatible
      expectedChallenge: 'Handle version compatibility correctly'
    };
  }

  _generateTenantBoundaryScenario(seed) {
    // Test tenant isolation at boundaries
    const tenants = [`tenant_alpha_${seed % 5}`, `tenant_beta_${seed % 5}`];
    
    return {
      type: 'TENANT_BOUNDARY',
      seed,
      invoice: {
        id: `invoice_tenant_${seed}`,
        tenantId: tenants[0],
        supplierId: `supplier_${seed}`
      },
      availablePatterns: [
        { tenantId: tenants[0], supplierId: `supplier_${seed}` }, // Correct tenant
        { tenantId: tenants[1], supplierId: `supplier_${seed}` }, // Wrong tenant!
        { tenantId: tenants[0], supplierId: `supplier_other` } // Wrong supplier
      ],
      expectedChallenge: 'Never cross tenant boundaries'
    };
  }

  _generateThresholdBoundaryScenario(seed) {
    // Test exact boundary conditions around thresholds
    const baseThreshold = 0.70;
    const offset = (seed % 20 - 10) / 100; // -0.10 to +0.09
    
    return {
      type: 'THRESHOLD_BOUNDARY',
      seed,
      score: baseThreshold + offset,
      threshold: baseThreshold,
      isAboveThreshold: offset >= 0,
      margin: Math.abs(offset),
      expectedChallenge: 'Correctly handle boundary conditions'
    };
  }

  // ============================================================
  // SCENARIO EXECUTION
  // ============================================================

  _executeScenario(scenario) {
    // Create mock benchmark result from scenario
    const mockResult = this._buildMockResult(scenario);
    return mockResult;
  }

  _buildMockResult(scenario) {
    // Build a realistic benchmark result structure based on scenario type
    const baseResult = {
      totalInvoices: 0,
      confusionMatrix: { tp: 0, fp: 0, fn: 0, tn: 0 },
      metrics: {},
      decisions: [],
      traces: [],
      pipelineData: { inputCount: 0, stageCounts: {} },
      generatedAt: new Date().toISOString()
    };

    switch (scenario.type) {
      case 'SHARED_LAYOUT':
        return this._buildSharedLayoutResult(scenario, baseResult);
      case 'MISSING_OCR':
        return this._buildMissingOCRResult(scenario, baseResult);
      case 'DUPLICATE_TRN':
        return this._buildDuplicateTRNResult(scenario, baseResult);
      case 'CURRENCY_MISMATCH':
        return this._buildCurrencyMismatchResult(scenario, baseResult);
      case 'HIGH_NOISE':
        return this._buildHighNoiseResult(scenario, baseResult);
      case 'EDGE_CASE':
        return this._buildEdgeCaseResult(scenario, baseResult);
      case 'MULTI_LANGUAGE':
        return this._buildMultiLanguageResult(scenario, baseResult);
      case 'VERSION_CONFLICT':
        return this._buildVersionConflictResult(scenario, baseResult);
      case 'TENANT_BOUNDARY':
        return this._buildTenantBoundaryResult(scenario, baseResult);
      case 'THRESHOLD_BOUNDARY':
        return this._buildThresholdBoundaryResult(scenario, baseResult);
      default:
        return baseResult;
    }
  }

  _buildSharedLayoutResult(scenario, base) {
    // Simulate matching with shared layouts
    let tp = 0, fp = 0, fn = 0, tn = 0;
    const decisions = [];
    const traces = [];

    for (const invoice of scenario.invoices) {
      const isCorrect = invoice.isCorrectMatch;
      
      if (isCorrect) {
        tp++;
        decisions.push({ invoiceId: invoice.id, decision: 'PATTERN_MATCH', supplierId: invoice.supplierId });
      } else if (Math.random() > 0.7) { // 30% chance of false match due to shared layout
        fp++;
        const wrongSupplier = scenario.suppliers.find(s => s.id !== invoice.supplierId);
        decisions.push({ invoiceId: invoice.id, decision: 'PATTERN_MATCH', supplierId: wrongSupplier?.id });
      } else {
        fn++; // Missed opportunity
        decisions.push({ invoiceId: invoice.id, decision: 'AI_FALLBACK' });
      }

      traces.push({
        invoiceId: invoice.id,
        decision: decisions[decisions.length - 1].decision,
        invoiceDetails: { layoutHash: invoice.layoutHash, trn: invoice.trn },
        matchedPattern: { layoutHash: invoice.layoutHash },
        rejectedCandidates: scenario.suppliers
          .filter(s => s.id !== (isCorrect ? invoice.supplierId : scenario.suppliers[1]?.id))
          .slice(0, 3)
          .map(s => ({
            candidateId: s.id,
            reason: 'LowerSemanticScore',
            score: 0.3 + Math.random() * 0.4,
            threshold: 0.70
          }))
      });
    }

    base.totalInvoices = scenario.invoices.length;
    base.confusionMatrix = { tp, fp, fn, tn };
    base.metrics = {
      precision: tp + fp > 0 ? tp / (tp + fp) : 0,
      recall: tp + fn > 0 ? tp / (tp + fn) : 0,
      fmr: tp + fp > 0 ? fp / (tp + fp) : 0,
      f1Score: 0
    };
    if (base.metrics.precision + base.metrics.recall > 0) {
      base.metrics.f1Score = 2 * (base.metrics.precision * base.metrics.recall) / 
                             (base.metrics.precision + base.metrics.recall);
    }
    base.decisions = decisions;
    base.traces = traces;
    base.pipelineData = {
      inputCount: scenario.invoices.length,
      inputIds: scenario.invoices.map(i => i.id),
      stageCounts: {
        initial: scenario.suppliers.length * 2,
        afterTenantFilter: scenario.suppliers.length,
        afterSupplierGate: Math.ceil(scenario.suppliers.length / 2),
        afterSemanticRank: 2,
        final: 1
      }
    };

    return base;
  }

  _buildMissingOCRResult(scenario, base) {
    const hasMissingFields = scenario.missingFields.length > 0;
    base.totalInvoices = 1;
    base.confusionMatrix = hasMissingFields ? { tp: 0, fp: 0, fn: 1, tn: 0 } : { tp: 1, fp: 0, fn: 0, tn: 0 };
    base.metrics = {
      precision: hasMissingFields ? 0 : 1,
      recall: hasMissingFields ? 0 : 1,
      fmr: 0,
      f1Score: hasMissingFields ? 0 : 1
    };
    base.decisions = [{
      invoiceId: scenario.invoice.id,
      decision: hasMissingFields ? 'AI_FALLBACK' : 'PATTERN_MATCH'
    }];
    base.traces = [{
      invoiceId: scenario.invoice.id,
      decision: base.decisions[0].decision,
      invoiceDetails: scenario.invoice,
      rejectedCandidates: scenario.missingFields.map(f => ({
        candidateId: `candidate_${f}`,
        reason: `MissingField:${f}`,
        score: 0,
        threshold: 0.70
      }))
    }];
    base.pipelineData = { inputCount: 1, inputIds: [scenario.invoice.id], stageCounts: { initial: 5, final: 0 } };
    return base;
  }

  _buildDuplicateTRNResult(scenario, base) {
    base.totalInvoices = 1;
    // Should detect duplicate and either reject or flag
    const detectedDuplicate = Math.random() > 0.3; // 70% detection rate
    base.confusionMatrix = detectedDuplicate ? 
      { tp: 0, fp: 0, fn: 1, tn: 0 } : // Correctly avoided match
      { tp: 0, fp: 1, fn: 0, tn: 0 };  // False match with duplicate TRN
    base.metrics = {
      precision: detectedDuplicate ? 0 : 0,
      recall: detectedDuplicate ? 0 : 1,
      fmr: detectedDuplicate ? 0 : 1,
      f1Score: 0
    };
    base.decisions = [{
      invoiceId: scenario.invoice.id,
      decision: detectedDuplicate ? 'AI_FALLBACK' : 'PATTERN_MATCH',
      supplierId: detectedDuplicate ? null : scenario.suppliers[1].id
    }];
    base.traces = [{
      invoiceId: scenario.invoice.id,
      decision: base.decisions[0].decision,
      invoiceDetails: { trn: scenario.invoice.trn },
      matchedPattern: detectedDuplicate ? null : { trn: scenario.sharedTRN },
      rejectedCandidates: scenario.suppliers.map(s => ({
        candidateId: s.id,
        reason: s.isValid ? 'TRNDuplicateDetected' : 'InvalidSupplier',
        score: 0.5,
        threshold: 0.80
      }))
    }];
    base.pipelineData = { inputCount: 1, inputIds: [scenario.invoice.id], stageCounts: { initial: 2, final: detectedDuplicate ? 0 : 1 } };
    return base;
  }

  _buildCurrencyMismatchResult(scenario, base) {
    base.totalInvoices = 1;
    const handledCorrectly = !scenario.isMismatch || Math.random() > 0.4;
    base.confusionMatrix = handledCorrectly ?
      { tp: 0, fp: 0, fn: scenario.isMismatch ? 1 : 0, tn: 0 } :
      { tp: 0, fp: 1, fn: 0, tn: 0 };
    base.metrics = {
      precision: handledCorrectly ? 0 : 0,
      recall: handledCorrectly ? (scenario.isMismatch ? 0 : 1) : 1,
      fmr: handledCorrectly ? 0 : 1,
      f1Score: 0
    };
    base.decisions = [{
      invoiceId: scenario.invoice.id,
      decision: handledCorrectly ? (scenario.isMismatch ? 'AI_FALLBACK' : 'PATTERN_MATCH') : 'PATTERN_MATCH'
    }];
    base.traces = [{
      invoiceId: scenario.invoice.id,
      decision: base.decisions[0].decision,
      invoiceDetails: { currency: scenario.invoice.currency },
      matchedPattern: { currency: scenario.pattern.currency },
      scores: { currency: scenario.isMismatch ? 0.2 : 0.95 },
      rejectedCandidates: scenario.isMismatch ? [{
        candidateId: 'pattern_1',
        reason: 'CurrencyMismatch',
        score: 0.2,
        threshold: 0.85
      }] : []
    }];
    base.pipelineData = { inputCount: 1, inputIds: [scenario.invoice.id], stageCounts: { initial: 1, final: handledCorrectly && !scenario.isMismatch ? 1 : 0 } };
    return base;
  }

  _buildHighNoiseResult(scenario, base) {
    base.totalInvoices = 1;
    const recoveredCorrectly = scenario.noiseLevel < 0.6 || Math.random() > 0.5;
    base.confusionMatrix = recoveredCorrectly ?
      { tp: 1, fp: 0, fn: 0, tn: 0 } :
      { tp: 0, fp: 1, fn: 0, tn: 0 };
    base.metrics = {
      precision: recoveredCorrectly ? 1 : 0,
      recall: 1,
      fmr: recoveredCorrectly ? 0 : 1,
      f1Score: recoveredCorrectly ? 1 : 0
    };
    base.decisions = [{
      invoiceId: scenario.invoice.id,
      decision: recoveredCorrectly ? 'PATTERN_MATCH' : 'AI_FALLBACK',
      confidence: 1 - scenario.noiseLevel
    }];
    base.traces = [{
      invoiceId: scenario.invoice.id,
      decision: base.decisions[0].decision,
      invoiceDetails: { ocrConfidence: scenario.invoice.ocrConfidence },
      scores: { overall: 1 - scenario.noiseLevel },
      rejectedCandidates: recoveredCorrectly ? [] : [{
        candidateId: 'likely_supplier',
        reason: 'BelowConfidenceThreshold',
        score: 1 - scenario.noiseLevel,
        threshold: 0.50
      }]
    }];
    base.pipelineData = { inputCount: 1, inputIds: [scenario.invoice.id], stageCounts: { initial: 5, final: recoveredCorrectly ? 1 : 0 } };
    return base;
  }

  _buildEdgeCaseResult(scenario, base) {
    base.totalInvoices = 1;
    // Most edge cases should not crash, may result in AI_FALLBACK
    const handledGracefully = !['NULL_VALUES', 'NEGATIVE_TOTAL'].includes(scenario.edgeCase.type) || Math.random() > 0.1;
    base.confusionMatrix = handledGracefully ?
      { tp: 0, fp: 0, fn: 1, tn: 0 } :
      { tp: 0, fp: 0, fn: 0, tn: 0 }; // Crashed/invalid
    base.metrics = { precision: 0, recall: 0, fmr: 0, f1Score: 0 };
    base.decisions = [{
      invoiceId: scenario.edgeCase.invoice.id,
      decision: handledGracefully ? 'AI_FALLBACK' : 'ERROR'
    }];
    base.traces = [{
      invoiceId: scenario.edgeCase.invoice.id,
      decision: base.decisions[0].decision,
      invoiceDetails: scenario.edgeCase.invoice,
      rejectedCandidates: handledGracefully ? [{
        candidateId: 'default',
        reason: `EdgeCase:${scenario.edgeCase.type}`,
        score: 0,
        threshold: 0.70
      }] : []
    }];
    base.pipelineData = { inputCount: 1, inputIds: [scenario.edgeCase.invoice.id], stageCounts: { initial: 1, final: 0 } };
    return base;
  }

  _buildMultiLanguageResult(scenario, base) {
    base.totalInvoices = 1;
    const processedCorrectly = ['arabic', 'english', 'mixed'].includes(scenario.language);
    base.confusionMatrix = processedCorrectly ?
      { tp: 1, fp: 0, fn: 0, tn: 0 } :
      { tp: 0, fp: 0, fn: 1, tn: 0 };
    base.metrics = {
      precision: processedCorrectly ? 1 : 0,
      recall: processedCorrectly ? 1 : 0,
      fmr: 0,
      f1Score: processedCorrectly ? 1 : 0
    };
    base.decisions = [{
      invoiceId: scenario.invoice.id,
      decision: processedCorrectly ? 'PATTERN_MATCH' : 'AI_FALLBACK'
    }];
    base.traces = [{
      invoiceId: scenario.invoice.id,
      decision: base.decisions[0].decision,
      invoiceDetails: { language: scenario.language, textDirection: scenario.invoice.textDirection }
    }];
    base.pipelineData = { inputCount: 1, inputIds: [scenario.invoice.id], stageCounts: { initial: 3, final: processedCorrectly ? 1 : 0 } };
    return base;
  }

  _buildVersionConflictResult(scenario, base) {
    base.totalInvoices = 1;
    base.confusionMatrix = scenario.isCompatible ?
      { tp: 1, fp: 0, fn: 0, tn: 0 } :
      { tp: 0, fp: 0, fn: 1, tn: 0 };
    base.metrics = {
      precision: scenario.isCompatible ? 1 : 0,
      recall: scenario.isCompatible ? 1 : 0,
      fmr: 0,
      f1Score: scenario.isCompatible ? 1 : 0
    };
    base.decisions = [{
      invoiceId: `invoice_version_${scenario.seed}`,
      decision: scenario.isCompatible ? 'PATTERN_MATCH' : 'AI_FALLBACK'
    }];
    base.traces = [{
      invoiceId: `invoice_version_${scenario.seed}`,
      decision: base.decisions[0].decision,
      matchedPattern: { version: scenario.patternVersion },
      minCompatibleVersion: scenario.engineMinVersion
    }];
    base.pipelineData = { inputCount: 1, inputIds: [`invoice_version_${scenario.seed}`], stageCounts: { initial: 1, final: scenario.isCompatible ? 1 : 0 } };
    return base;
  }

  _buildTenantBoundaryResult(scenario, base) {
    base.totalInvoices = 1;
    // CRITICAL: Must never match across tenant boundary
    const tenantViolation = Math.random() < 0.1; // 10% chance of bug
    base.confusionMatrix = tenantViolation ?
      { tp: 0, fp: 1, fn: 0, tn: 0 } : // SECURITY VIOLATION
      { tp: 0, fp: 0, fn: 1, tn: 0 };   // Correctly blocked
    base.metrics = {
      precision: 0,
      recall: tenantViolation ? 1 : 0,
      fmr: tenantViolation ? 1 : 0,
      f1Score: 0
    };
    base.decisions = [{
      invoiceId: scenario.invoice.id,
      decision: tenantViolation ? 'PATTERN_MATCH' : 'AI_FALLBACK',
      supplierId: tenantViolation ? scenario.availablePatterns[1].supplierId : null
    }];
    base.traces = [{
      invoiceId: scenario.invoice.id,
      decision: base.decisions[0].decision,
      invoiceDetails: { tenantId: scenario.invoice.tenantId },
      matchedPattern: tenantViolation ? scenario.availablePatterns[1] : null,
      rejectedCandidates: tenantViolation ? [] : scenario.availablePatterns.map(p => ({
        candidateId: p.supplierId,
        reason: p.tenantId === scenario.invoice.tenantId ? 'OtherReason' : 'TenantMismatch',
        score: p.tenantId === scenario.invoice.tenantId ? 0.6 : 0.9,
        threshold: 0.95 // High threshold for tenant check
      }))
    }];
    base.pipelineData = { 
      inputCount: 1, 
      inputIds: [scenario.invoice.id], 
      stageCounts: { 
        initial: scenario.availablePatterns.length, 
        afterTenantFilter: scenario.availablePatterns.length,
        final: tenantViolation ? 1 : 0 
      } 
    };
    return base;
  }

  _buildThresholdBoundaryResult(scenario, base) {
    base.totalInvoices = 1;
    base.confusionMatrix = scenario.isAboveThreshold ?
      { tp: 1, fp: 0, fn: 0, tn: 0 } :
      { tp: 0, fp: 0, fn: 1, tn: 0 };
    base.metrics = {
      precision: scenario.isAboveThreshold ? 1 : 0,
      recall: scenario.isAboveThreshold ? 1 : 0,
      fmr: 0,
      f1Score: scenario.isAboveThreshold ? 1 : 0
    };
    base.decisions = [{
      invoiceId: `invoice_threshold_${scenario.seed}`,
      decision: scenario.isAboveThreshold ? 'PATTERN_MATCH' : 'AI_FALLBACK'
    }];
    base.traces = [{
      invoiceId: `invoice_threshold_${scenario.seed}`,
      decision: base.decisions[0].decision,
      finalScore: scenario.score,
      threshold: scenario.threshold,
      rejectedCandidates: scenario.isAboveThreshold ? [] : [{
        candidateId: 'candidate_1',
        reason: 'BelowThreshold',
        score: scenario.score,
        threshold: scenario.threshold
      }]
    }];
    base.pipelineData = { inputCount: 1, inputIds: [`invoice_threshold_${scenario.seed}`], stageCounts: { initial: 1, final: scenario.isAboveThreshold ? 1 : 0 } };
    return base;
  }

  // ============================================================
  // UTILITY FUNCTIONS
  // ============================================================

  _randomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  _applyNoise(text, level) {
    if (!text) return text;
    
    const operations = [
      // Character substitution
      () => {
        const pos = Math.floor(Math.random() * text.length);
        return text.substring(0, pos) + '?' + text.substring(pos + 1);
      },
      // Character deletion
      () => {
        const pos = Math.floor(Math.random() * text.length);
        return text.substring(0, pos) + text.substring(pos + 1);
      },
      // Character duplication
      () => {
        const pos = Math.floor(Math.random() * text.length);
        return text.substring(0, pos) + text[pos] + text.substring(pos);
      },
      // Swap adjacent characters
      () => {
        const pos = Math.floor(Math.random() * (text.length - 1));
        return text.substring(0, pos) + text[pos + 1] + text[pos] + text.substring(pos + 2);
      }
    ];

    let noisyText = text;
    const numOperations = Math.floor(text.length * level);
    
    for (let i = 0; i < numOperations; i++) {
      const operation = operations[Math.floor(Math.random() * operations.length)];
      noisyText = operation();
    }

    return noisyText;
  }

  _generateLineItems(count) {
    return Array.from({ length: count }, (_, i) => ({
      description: `Item ${i + 1}`,
      quantity: 1 + Math.floor(Math.random() * 10),
      unitPrice: 10 + Math.random() * 1000
    }));
  }

  _generateTestReport(elapsedMs) {
    const passRate = (this.scenariosPassed / this.scenariosGenerated * 100).toFixed(2);
    
    return {
      summary: {
        totalScenarios: this.scenariosGenerated,
        passed: this.scenariosPassed,
        failed: this.scenariosFailed,
        passRate: `${passRate}%`,
        elapsedTime: `${(elapsedMs / 1000).toFixed(1)}s`,
        scenariosPerSecond: Math.round(this.scenariosGenerated / (elapsedMs / 1000)),
        status: this.scenariosFailed === 0 ? 'ALL_PASSED' : 'FAILURES_DETECTED'
      },
      failures: this.failures.slice(0, 20), // Limit output size
      recommendations: this._generateRecommendations(),
      generatedAt: new Date().toISOString()
    };
  }

  _generateRecommendations() {
    const recs = [];

    if (this.scenariosFailed === 0) {
      recs.push({
        priority: 'INFO',
        message: 'All property-based tests passed! Verification Suite is robust.'
      });
    } else {
      const failureRate = this.scenariosFailed / this.scenariosGenerated;
      
      if (failureRate > 0.01) {
        recs.push({
          priority: 'P0',
          message: `High failure rate (${(failureRate*100).toFixed(2)}%). Do not proceed to production.`
        });
      }

      // Categorize failures
      const failureTypes = {};
      for (const f of this.failures) {
        const type = f.scenarioType || f.error ? 'UNKNOWN' : 'INVARIANT_VIOLATION';
        failureTypes[type] = (failureTypes[type] || 0) + 1;
      }

      for (const [type, count] of Object.entries(failureTypes).sort((a, b) => b[1] - a[1])) {
        recs.push({
          priority: count > 10 ? 'P0' : 'P1',
          message: `${count} failures from ${type} scenarios`
        });
      }
    }

    return recs;
  }
}

// ============================================================
// SECTION 5: BENCHMARK CONFIDENCE SCORE
// ============================================================

/**
 * BenchmarkConfidenceCalculator - Multi-Factor Confidence Assessment
 * 
 * Instead of reporting just "FMR = 0.74", reports:
 * FMR = 0.74
 * Confidence = 61%
 * 
 * Factors:
 * - Dataset authenticity (real vs synthetic)
 * - Scale (suppliers, invoices)
 * - OCR realism
 * - Template diversity
 * - Shared layout coverage
 * - Language diversity
 * - Invariant compliance
 * - Historical accuracy
 */
class BenchmarkConfidenceCalculator {
  constructor() {
    this.factors = [
      { id: 'dataset_authenticity', name: 'Dataset Authenticity', weight: 0.25, maxScore: 100 },
      { id: 'scale', name: 'Dataset Scale', weight: 0.15, maxScore: 100 },
      { id: 'ocr_realism', name: 'OCR Realism', weight: 0.15, maxScore: 100 },
      { id: 'template_diversity', name: 'Template Diversity', weight: 0.12, maxScore: 100 },
      { id: 'shared_layout_coverage', name: 'Shared Layout Coverage', weight: 0.10, maxScore: 100 },
      { id: 'language_diversity', name: 'Language Diversity', weight: 0.08, maxScore: 100 },
      { id: 'invariant_compliance', name: 'Invariant Compliance', weight: 0.15, maxScore: 100 }
    ];
    
    this.benchmarks = {
      scale: {
        idealSuppliers: 100,
        idealInvoices: 10000,
        minimumSuppliers: 20,
        minimumInvoices: 1000
      },
      diversity: {
        idealTemplates: 20,
        idealLanguages: 5,
        idealSharedLayoutGroups: 15
      }
    };
  }

  /**
   * Calculate comprehensive confidence score
   */
  calculate(benchmarkData) {
    const factorScores = {};

    // Evaluate each factor
    factorScores.dataset_authenticity = this._evaluateDatasetAuthenticity(benchmarkData);
    factorScores.scale = this._evaluateScale(benchmarkData);
    factorScores.ocr_realism = this._evaluateOCRRealism(benchmarkData);
    factorScores.template_diversity = this._evaluateTemplateDiversity(benchmarkData);
    factorScores.shared_layout_coverage = this._evaluateSharedLayoutCoverage(benchmarkData);
    factorScores.language_diversity = this._evaluateLanguageDiversity(benchmarkData);
    factorScores.invariant_compliance = this._evaluateInvariantCompliance(benchmarkData);

    // Calculate weighted average
    let totalWeightedScore = 0;
    let totalWeight = 0;

    for (const factor of this.factors) {
      const score = factorScores[factor.id];
      totalWeightedScore += score * factor.weight;
      totalWeight += factor.weight;
    }

    const rawConfidence = totalWeightedScore / totalWeight;
    const confidence = Math.max(0, Math.min(100, rawConfidence));

    // Determine confidence level
    let level, color, interpretation;
    if (confidence >= 90) {
      level = 'PRODUCTION_READY';
      color = 'GREEN';
      interpretation = 'Results are highly reliable for production decisions';
    } else if (confidence >= 75) {
      level = 'HIGH_CONFIDENCE';
      color = 'BLUE';
      interpretation = 'Results are reliable for most decisions, minor caveats may apply';
    } else if (confidence >= 60) {
      level = 'MODERATE_CONFIDENCE';
      color = 'YELLOW';
      interpretation = 'Results provide useful signal but should not be sole basis for production decisions';
    } else if (confidence >= 40) {
      level = 'LOW_CONFIDENCE';
      color = 'ORANGE';
      interpretation = 'Results are indicative only; significant gaps exist in methodology';
    } else {
      level = 'NOT_PRODUCTION_READY';
      color = 'RED';
      interpretation = 'Results should NOT be used for production decisions; major methodology gaps';
    }

    return {
      confidence: Math.round(confidence),
      level,
      color,
      interpretation,
      factorBreakdown: factorScores,
      factors: this.factors.map(f => ({
        ...f,
        score: factorScores[f.id],
        contribution: (factorScores[f.id] * f.weight).toFixed(1)
      })),
      recommendation: this._generateRecommendation(confidence, factorScores),
      warningFlags: this._identifyWarningFlags(factorScores),
      calculatedAt: new Date().toISOString()
    };
  }

  // ============================================================
  // FACTOR EVALUATORS
  // ============================================================

  _evaluateDatasetAuthenticity(data) {
    // Check if dataset is real (golden) or synthetic
    const isGolden = data.datasetType === 'GOLDEN' || data.isGoldenDataset === true;
    const source = data.dataSource || 'synthetic';
    const hasHumanVerification = data.humanVerified === true;
    const collectionMethod = data.collectionMethod || 'generated';

    let score = 0;

    if (isGolden && hasHumanVerification) {
      score = 95; // Near-perfect golden dataset
    } else if (isGolden) {
      score = 85; // Golden but maybe not fully verified
    } else if (source.includes('production')) {
      score = 60; // Production data but maybe not curated
    } else if (source.includes('synthetic') || source.includes('generated')) {
      score = 25; // Synthetic data - significant limitation
    } else {
      score = 40; // Unknown source
    }

    // Adjustments
    if (collectionMethod === 'manual_entry') score -= 10;
    if (data.syntheticAugmentation) score -= 5;
    if (data.dataLineage) score += 5; // Good data lineage helps

    return Math.max(0, Math.min(100, score));
  }

  _evaluateScale(data) {
    const supplierCount = data.supplierCount || 0;
    const invoiceCount = data.totalInvoices || data.invoiceCount || 0;
    
    const { idealSuppliers, idealInvoices, minimumSuppliers, minimumInvoices } = this.benchmarks.scale;

    // Calculate scale score based on logarithmic curve
    const supplierScore = Math.min(100, (Math.log10(1 + supplierCount) / Math.log10(1 + idealSuppliers)) * 100);
    const invoiceScore = Math.min(100, (Math.log10(1 + invoiceCount) / Math.log10(1 + idealInvoices)) * 100);

    // Weight invoices more than suppliers
    let combinedScore = supplierScore * 0.3 + invoiceScore * 0.7;

    // Penalty for being below minimum
    if (supplierCount < minimumSuppliers) combinedScore *= 0.5;
    if (invoiceCount < minimumInvoices) combinedScore *= 0.5;

    return Math.round(combinedScore);
  }

  _evaluateOCRRealism(data) {
    const ocrSource = data.ocrSource || 'none';
    const ocrErrorRate = data.ocrErrorRate || 0;
    const hasRealOCRErrors = data.hasRealOCRErrors === true;
    const ocrEngine = data.ocrEngine || 'none';

    let score = 0;

    if (hasRealOCRErrors && ocrEngine !== 'none') {
      score = 90; // Real OCR from actual engine
    } else if (ocrSource === 'simulated' && ocrErrorRate > 0.10) {
      score = 55; // Simulated but realistic error rate
    } else if (ocrSource === 'simulated' && ocrErrorRate > 0) {
      score = 40; // Simulated but low error rate
    } else if (ocrErrorRate === 0) {
      score = 15; // Perfect OCR - unrealistic
    } else {
      score = 30; // Unknown
    }

    // Adjustments
    if (data.ocrEngineIncludesArabic) score += 5;
    if (data.ocrEngineIncludesHandwriting) score += 5;
    if (data.ocrQualityDistribution) score += 5; // Has variety of quality levels

    return Math.max(0, Math.min(100, score));
  }

  _evaluateTemplateDiversity(data) {
    const templateCount = data.templateCount || data.formatTypes?.length || 1;
    const { idealTemplates } = this.benchmarks.diversity;

    // Logarithmic scaling
    const score = Math.min(100, (Math.log10(1 + templateCount) / Math.log10(1 + idealTemplates)) * 100);

    // Bonus for specific important template types
    const hasImportantTypes = [
      'tax_invoice', 'commercial', 'proforma', 'credit_note', 'debit_note'
    ].some(type => 
      data.formatTypes?.some(ft => ft.includes(type)) || 
      data.templateTypes?.some(t => t.includes(type))
    );

    return Math.round(hasImportantTypes ? Math.min(100, score + 10) : score);
  }

  _evaluateSharedLayoutCoverage(data) {
    const sharedLayoutGroups = data.sharedLayoutGroups || data.similarLayoutGroups || 0;
    const { idealSharedLayoutGroups } = this.benchmarks.diversity;
    const totalInvoices = data.totalInvoices || 0;

    // What percentage of invoices are in shared-layout groups?
    const sharedLayoutInvoiceRatio = data.sharedLayoutInvoiceRatio || (sharedLayoutGroups > 0 ? 0.3 : 0);

    // Score based on number of groups AND coverage ratio
    const groupScore = Math.min(100, (sharedLayoutGroups / idealSharedLayoutGroups) * 100);
    const coverageScore = sharedLayoutInvoiceRatio * 100;

    // Combine: groups matter, but coverage matters more
    return Math.round(groupScore * 0.4 + coverageScore * 0.6);
  }

  _evaluateLanguageDiversity(data) {
    const languages = data.languages || ['en'];
    const { idealLanguages } = this.benchmarks.diversity;

    // Base score on count
    const countScore = Math.min(100, (languages.length / idealLanguages) * 100);

    // Bonus for Arabic (critical for KSA/UAE market)
    const hasArabic = languages.some(lang => 
      lang.toLowerCase().includes('ar') || 
      lang.toLowerCase().includes('arabic')
    );
    const arabicBonus = hasArabic ? 15 : 0;

    // Bonus for mixed language support
    const hasMixed = data.supportsMixedLanguage === true;
    const mixedBonus = hasMixed ? 10 : 0;

    return Math.min(100, Math.round(countScore + arabicBonus + mixedBonus));
  }

  _evaluateInvariantCompliance(data) {
    const invariantResult = data.invariantResult || data.invariantCheckResult;
    
    if (!invariantResult) {
      return 50; // Unknown - medium score
    }

    const totalInvariants = invariantResult.summary?.totalInvariants || 1;
    const passed = invariantResult.summary?.passed || 0;
    const failed = invariantResult.summary?.failed || 0;
    const criticalFailures = invariantResult.summary?.criticalFailures || 0;

    // Base score on pass rate
    const passRate = passed / totalInvariants;

    // Heavy penalty for critical failures
    if (criticalFailures > 0) {
      return Math.max(0, Math.round(passRate * 40)); // Cap at 40% with critical failures
    }

    // Slight penalty for any failures
    if (failed > 0) {
      return Math.round(passRate * 85); // 15% penalty for non-critical failures
    }

    return Math.round(passRate * 100); // Perfect score if all pass
  }

  // ============================================================
  // REPORT GENERATION
  // ============================================================

  _generateRecommendation(confidence, factorScores) {
    if (confidence >= 90) {
      return {
        action: 'APPROVE_FOR_PRODUCTION',
        message: 'Benchmark results are reliable enough for production deployment decisions.',
        caveats: []
      };
    } else if (confidence >= 75) {
      return {
        action: 'CONDITIONAL_APPROVAL',
        message: 'Results are generally reliable but review low-scoring factors.',
        caveats: this._getWeakFactors(factorScores, 60)
      };
    } else if (confidence >= 60) {
      return {
        action: 'NEEDS_IMPROVEMENT',
        message: 'Results provide directional signal but require improvement before production use.',
        caveats: this._getWeakFactors(factorScores, 50)
      };
    } else {
      return {
        action: 'DO_NOT_USE_FOR_PRODUCTION',
        message: 'Benchmark results should NOT drive production decisions. Address critical gaps first.',
        caveats: this._getWeakFactors(factorScores, 40)
      };
    }
  }

  _getWeakFactors(factorScores, threshold) {
    return Object.entries(factorScores)
      .filter(([_, score]) => score < threshold)
      .map(([factor, score]) => {
        const factorInfo = this.factors.find(f => f.id === factor);
        return {
          factor: factorInfo?.name || factor,
          score,
          gap: threshold - score
        };
      })
      .sort((a, b) => a.gap - b.gap);
  }

  _identifyWarningFlags(factorScores) {
    const flags = [];

    // Critical warnings
    if (factorScores.dataset_authenticity < 30) {
      flags.push({
        level: 'CRITICAL',
        message: 'Synthetic dataset - results may not reflect real-world performance'
      });
    }

    if (factorScores.invariant_compliance < 50) {
      flags.push({
        level: 'CRITICAL',
        message: 'Invariant violations detected - measurement reliability compromised'
      });
    }

    if (factorScores.scale < 30) {
      flags.push({
        level: 'WARNING',
        message: 'Small dataset size - statistical significance limited'
      });
    }

    if (factorScores.ocr_realism < 30) {
      flags.push({
        level: 'WARNING',
        message: 'No realistic OCR simulation - performance may be overstated'
      });
    }

    return flags;
  }

  /**
   * Generate human-readable confidence report
   */
  generateReport(confidenceResult, fmr) {
    const lines = [];
    
    lines.push('═'.repeat(70));
    lines.push('  BENCHMARK CONFIDENCE ASSESSMENT');
    lines.push('═'.repeat(70));
    lines.push('');
    lines.push(`  FMR: ${(fmr * 100).toFixed(2)}%`);
    lines.push(`  Confidence: ${confidenceResult.confidence}% (${confidenceResult.level})`);
    lines.push(`  Interpretation: ${confidenceResult.interpretation}`);
    lines.push('');
    lines.push('─'.repeat(70));
    lines.push('  FACTOR BREAKDOWN');
    lines.push('─'.repeat(70));

    for (const factor of confidenceResult.factors) {
      const bar = '█'.repeat(Math.round(factor.score / 5)) + '░'.repeat(20 - Math.round(factor.score / 5));
      lines.push(`  ${factor.name.padEnd(25)} ${factor.score.toString().padStart(3)}% ${bar} (${factor.contribution} pts)`);
    }

    if (confidenceResult.warningFlags.length > 0) {
      lines.push('');
      lines.push('⚠️  WARNING FLAGS:');
      for (const flag of confidenceResult.warningFlags) {
        const icon = flag.level === 'CRITICAL' ? '🔴' : '🟡';
        lines.push(`  ${icon} ${flag.message}`);
      }
    }

    lines.push('');
    lines.push('─'.repeat(70));
    lines.push(`  RECOMMENDATION: ${confidenceResult.recommendation.action}`);
    lines.push(`  ${confidenceResult.recommendation.message}`);
    
    if (confidenceResult.recommendation.caveats.length > 0) {
      lines.push('');
      lines.push('  Areas needing attention:');
      for (const caveat of confidenceResult.recommendation.caveats) {
        lines.push(`    • ${caveat.factor}: ${caveat.score}% (gap: ${caveat.gap.toFixed(0)})`);
      }
    }

    lines.push('');
    lines.push('═'.repeat(70));

    return lines.join('\n');
  }
}

// ============================================================
// SECTION 6: CUSTOM ERROR CLASS
// ============================================================

class InvariantViolationError extends Error {
  constructor(message, details = {}, severity = 'CRITICAL') {
    super(message);
    this.name = 'InvariantViolationError';
    this.details = details;
    this.severity = severity;
    this.timestamp = new Date().toISOString();
  }
}

// ============================================================
// SECTION 7: UNIFIED VERIFICATION SUITE ORCHESTRATOR
// ============================================================

/**
 * VerificationSuite - Main entry point for all verification
 * 
 * Orchestrates:
 * 1. Invariant Checking (3 layers)
 * 2. Root Cause Attribution (tree-structured)
 * 3. Decision Trace Analysis
 * 4. Property-Based Testing
 * 5. Confidence Score Calculation
 */
class VerificationSuite {
  constructor(options = {}) {
    this.options = {
      runPropertyBasedTests: options.runPropertyBasedTests !== false,
      propertyTestCount: options.propertyTestCount || 10000,
      generateReport: options.generateReport !== false,
      verbose: options.verbose || false,
      ...options
    };

    this.invariantChecker = new BenchmarkInvariantChecker();
    this.rootCauseAttributor = new RootCauseAttributor();
    this.traceLogger = new DecisionTraceLogger();
    this.propertyTester = new PropertyBasedTester({
      maxScenarios: this.options.propertyTestCount
    });
    this.confidenceCalculator = new BenchmarkConfidenceCalculator();

    this.results = {
      invariants: null,
      rootCauses: null,
      traces: null,
      propertyTests: null,
      confidence: null,
      overallStatus: null
    };
  }

  /**
   * Run complete verification suite on benchmark results
   */
  async verify(benchmarkResult) {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║     INVOICE BRAIN BENCHMARK VERIFICATION SUITE v1.0           ║');
    console.log('║     Complete Verification Pipeline                            ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('');

    const startTime = Date.now();

    // Phase 1: Invariant Checking
    console.log('📋 PHASE 1: INVARIANT CHECKING (3-Layer System)');
    this.results.invariants = this.invariantChecker.runAllInvariants(benchmarkResult);
    this._printPhaseSummary('Invariants', this.results.invariants);

    // Phase 2: Root Cause Attribution
    console.log('\n🔍 PHASE 2: ROOT CAUSE ATTRIBUTION (Tree-Structured)');
    const invoiceResults = this._prepareInvoiceResults(benchmarkResult);
    this.results.rootCauses = this.rootCauseAttributor.analyzeBatch(invoiceResults);
    this._printRootCauseSummary(this.results.rootCauses);

    // Phase 3: Decision Trace Analysis
    console.log('\n📝 PHASE 3: DECISION TRACE ANALYSIS');
    if (benchmarkResult.traces) {
      for (const trace of benchmarkResult.traces) {
        this.traceLogger.traces.set(trace.invoiceId, trace);
      }
    }
    this.results.traces = this.traceLogger.generateSummaryStats();
    this._printTraceSummary(this.results.traces);

    // Phase 4: Property-Based Testing
    if (this.options.runPropertyBasedTests) {
      console.log('\n🧪 PHASE 4: PROPERTY-BASED TESTING');
      this.results.propertyTests = await this.propertyTester.runFullSuite();
      this._printPropertyTestSummary(this.results.propertyTests);
    }

    // Phase 5: Confidence Score Calculation
    console.log('\n📊 PHASE 5: CONFIDENCE SCORE CALCULATION');
    const benchmarkData = {
      ...benchmarkResult,
      invariantResult: this.results.invariants
    };
    this.results.confidence = this.confidenceCalculator.calculate(benchmarkData);
    
    const fmr = benchmarkResult.metrics?.fmr || 0;
    console.log(this.confidenceCalculator.generateReport(this.results.confidence, fmr));

    // Overall Status
    this.results.overallStatus = this._determineOverallStatus();
    this.results.elapsedTime = Date.now() - startTime;

    // Final Summary
    this._printFinalSummary();

    return this.results;
  }

  /**
   * Get detailed debug report for specific invoice
   */
  getInvoiceDebugReport(invoiceId) {
    return this.traceLogger.generateDebugReport(invoiceId);
  }

  /**
   * Export complete verification report as JSON
   */
  exportReport() {
    return {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      overallStatus: this.results.overallStatus,
      ...this.results,
      recommendation: this._generateOverallRecommendation()
    };
  }

  // ============================================================
  // PRIVATE METHODS
  // ============================================================

  _prepareInvoiceResults(benchmarkResult) {
    const decisions = benchmarkResult.decisions || [];
    const traces = benchmarkResult.traces || [];
    const groundTruth = benchmarkResult.groundTruth || new Map();

    return decisions.map(decision => {
      const trace = traces.find(t => t.invoiceId === decision.invoiceId);
      const truth = groundTruth.get(decision.invoiceId);

      return {
        invoiceId: decision.invoiceId,
        decision: decision,
        trace: trace,
        groundTruth: truth,
        expectedSupplierId: truth?.supplierId
      };
    });
  }

  _printPhaseSummary(phaseName, result) {
    if (!result?.summary) return;

    const { passed, failed, warnings, overallStatus, criticalFailures } = result.summary;
    const icon = overallStatus === 'PASSED' ? '✅' : '❌';

    console.log(`  ${icon} ${phaseName}: ${overallStatus}`);
    console.log(`     Passed: ${passed} | Failed: ${failed} | Warnings: ${warnings}`);
    if (criticalFailures > 0) {
      console.log(`     🔴 CRITICAL FAILURES: ${criticalFailures}`);
    }
  }

  _printRootCauseSummary(rootCauseResult) {
    if (!rootCauseResult?.summary) return;

    console.log(`  📊 Analyzed ${rootCauseResult.summary.total} invoices`);

    console.log('\n  By Error Type:');
    for (const [type, pct] of Object.entries(rootCauseResult.summary.byErrorTypePercent || {})) {
      console.log(`    ${type}: ${pct}`);
    }

    console.log('\n  By Root Cause:');
    const sortedCauses = Object.entries(rootCauseResult.summary.byRootCausePercent || {})
      .sort((a, b) => parseFloat(b[1]) - parseFloat(a[1]));
    for (const [cause, pct] of sortedCauses.slice(0, 10)) {
      console.log(`    ${cause}: ${pct}`);
    }

    // Print tree visualization
    console.log('\n' + this.rootCauseAttributor.generateTreeVisualization(rootCauseResult.attributions));
  }

  _printTraceSummary(stats) {
    if (!stats) {
      console.log('  ⚠️ No trace data available');
      return;
    }

    console.log(`  📈 Trace Statistics:`);
    console.log(`     Total Traces: ${stats.totalTraces}`);
    console.log(`     Avg Processing Time: ${stats.averageProcessingTime.toFixed(1)}ms`);
    console.log(`     Avg Rejections/Invoice: ${stats.averageRejectedPerInvoice.toFixed(1)}`);

    console.log('\n  Top Rejection Reasons:');
    const sortedReasons = Object.entries(stats.rejectionReasons || {})
      .sort((a, b) => b[1] - a[1]);
    for (const [reason, count] of sortedReasons.slice(0, 5)) {
      console.log(`    ${reason}: ${count}`);
    }
  }

  _printPropertyTestSummary(testResult) {
    if (!testResult?.summary) return;

    const { totalScenarios, passed, failed, passRate, status } = testResult.summary;
    const icon = status === 'ALL_PASSED' ? '✅' : '❌';

    console.log(`  ${icon} Property Tests: ${status}`);
    console.log(`     Scenarios: ${totalScenarios.toLocaleString()} | Passed: ${passed.toLocaleString()} | Failed: ${failed.toLocaleString()}`);
    console.log(`     Pass Rate: ${passRate}`);

    if (failed > 0 && testResult.failures.length > 0) {
      console.log('\n  Sample Failures:');
      for (const failure of testResult.failures.slice(0, 5)) {
        console.log(`    • Scenario #${failure.scenarioIndex}: ${failure.scenarioType || 'Unknown'}`);
      }
    }
  }

  _determineOverallStatus() {
    const { invariants, propertyTests, confidence } = this.results;

    // Critical: Invariants must pass
    if (invariants?.summary?.overallStatus === 'FAILED') {
      return {
        status: 'FAILED',
        reason: 'Invariant violations detected',
        canProceedToProduction: false
      };
    }

    // Important: Property tests should pass
    if (propertyTests?.summary?.status === 'FAILURES_DETECTED') {
      return {
        status: 'CONDITIONAL',
        reason: 'Property-based test failures detected',
        canProceedToProduction: false
      };
    }

    // Confidence-based assessment
    if (confidence?.confidence >= 90) {
      return { status: 'PASSED', canProceedToProduction: true };
    } else if (confidence?.confidence >= 75) {
      return { status: 'CONDITIONAL', canProceedToProduction: false, needsReview: true };
    } else {
      return { 
        status: 'LOW_CONFIDENCE', 
        canProceedToProduction: false,
        reason: `Confidence score ${confidence?.confidence || 0}% below production threshold`
      };
    }
  }

  _printFinalSummary() {
    console.log('\n' + '═'.repeat(70));
    console.log('  FINAL VERIFICATION SUMMARY');
    console.log('═'.repeat(70));

    const status = this.results.overallStatus;
    const icon = status.canProceedToProduction ? '✅' : 
                 status.status === 'CONDITIONAL' ? '⚠️' : '❌';

    console.log(`  Overall Status: ${icon} ${status.status.toUpperCase()}`);
    console.log(`  Can Proceed to Production: ${status.canProceedToProduction ? 'YES ✅' : 'NO ❌'}`);
    
    if (status.reason) {
      console.log(`  Reason: ${status.reason}`);
    }

    if (this.results.confidence) {
      console.log(`  Confidence Score: ${this.results.confidence.confidence}% (${this.results.confidence.level})`);
    }

    console.log(`  Elapsed Time: ${(this.results.elapsedTime / 1000).toFixed(1)}s`);
    console.log('═'.repeat(70));
  }

  _generateOverallRecommendation() {
    const status = this.results.overallStatus;
    const confidence = this.results.confidence;

    if (status.canProceedToProduction) {
      return {
        action: 'APPROVED',
        message: 'Verification suite passed. Benchmark results are reliable.',
        nextSteps: ['Proceed with production readiness review', 'Schedule go-live decision meeting']
      };
    } else if (status.status === 'CONDITIONAL') {
      return {
        action: 'CONDITIONAL',
        message: 'Some concerns identified. Review recommended before proceeding.',
        nextSteps: [
          'Address invariant violations if any',
          'Review property test failures',
          'Consider expanding dataset'
        ]
      };
    } else {
      return {
        action: 'REJECTED',
        message: 'Verification suite failed. Do not use these benchmark results for production decisions.',
        nextSteps: [
          'Fix all critical invariant violations',
          'Re-run property-based tests',
          'Improve dataset quality',
          'Re-run verification after fixes'
        ]
      };
    }
  }
}

// ============================================================
// EXPORTS
// ============================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    BenchmarkInvariantChecker,
    RootCauseAttributor,
    DecisionTraceLogger,
    PropertyBasedTester,
    BenchmarkConfidenceCalculator,
    VerificationSuite,
    InvariantViolationError
  };
}
