/**
 * Invoice Brain Verification Suite - Test Runner
 * ================================================
 * Demonstrates the complete verification framework
 * 
 * Run: node run-verification-suite.js
 */

const {
  BenchmarkInvariantChecker,
  RootCauseAttributor,
  DecisionTraceLogger,
  PropertyBasedTester,
  BenchmarkConfidenceCalculator,
  VerificationSuite,
  InvariantViolationError
} = require('./invoice-brain-verification-suite');

// ============================================================
// SAMPLE BENCHMARK DATA (Simulating real benchmark output)
// ============================================================

function createSampleBenchmarkResult() {
  // Create realistic-looking benchmark result with intentional issues
  // to demonstrate verification capabilities
  
  const totalInvoices = 100;
  const decisions = [];
  const traces = [];
  const groundTruth = new Map();

  // Generate sample data
  for (let i = 0; i < totalInvoices; i++) {
    const supplierId = `supplier_${Math.floor(i / 10)}`; // 10 suppliers, 10 invoices each
    const invoiceId = `invoice_${i.toString().padStart(4, '0')}`;
    const tenantId = `tenant_${Math.floor(i / 25)}`; // 4 tenants
    
    // Ground truth
    groundTruth.set(invoiceId, { supplierId, tenantId });
    
    // Simulate various outcomes
    let decision, matchedSupplier;
    const rand = Math.random();
    
    if (rand < 0.65) {
      // True Positive: Correct match
      decision = 'PATTERN_MATCH';
      matchedSupplier = supplierId;
    } else if (rand < 0.82) {
      // False Positive: Wrong match (shared layout issue)
      decision = 'PATTERN_MATCH';
      matchedSupplier = `supplier_${(Math.floor(i / 10) + 1) % 10}`;
    } else if (rand < 0.94) {
      // False Negative: Should have matched but didn't
      decision = 'AI_FALLBACK';
      matchedSupplier = null;
    } else {
      // True Negative: Correctly no match
      decision = 'NO_PATTERN';
      matchedSupplier = null;
    }

    decisions.push({
      invoiceId,
      decision,
      supplierId: matchedSupplier,
      confidence: 0.5 + Math.random() * 0.5
    });

    // Create detailed trace
    const trace = {
      invoiceId,
      decision,
      invoiceDetails: {
        trn: `TRN${(1000000000 + i).toString()}`,
        tenantId,
        layoutHash: `layout_${Math.floor(i / 20)}`, // Shared layouts
        currency: ['SAR', 'AED', 'USD'][i % 3],
        total: 1000 + Math.random() * 50000
      },
      matchedPattern: matchedSupplier ? {
        id: `pattern_${matchedSupplier}`,
        supplierId: matchedSupplier,
        tenantId,
        trn: `TRN${(1000000000 + Math.floor(i / 10) * 111).toString()}`,
        layoutHash: `layout_${Math.floor(i / 20)}`,
        currency: ['SAR', 'AED', 'USD'][i % 3]
      } : null,
      scores: {
        layout: 0.7 + Math.random() * 0.3,
        semantic: 0.6 + Math.random() * 0.4,
        currency: Math.random() > 0.1 ? 0.95 : 0.3, // Some currency mismatches
        total: 0.5 + Math.random() * 0.5
      },
      finalScore: 0.5 + Math.random() * 0.5,
      threshold: 0.70,
      
      // REJECTED CANDIDATES - KEY FOR DEBUGGING
      rejectedCandidates: generateRejectedCandidates(supplierId, i),
      
      filterStages: [
        { stageName: 'TenantFilter', candidatesBefore: 50, candidatesAfter: 15, removalRate: 0.7, filterReason: 'TenantMismatch' },
        { stageName: 'SupplierGate', candidatesBefore: 15, candidatesAfter: 5, removalRate: 0.67, filterReason: 'SupplierIdentityCheck' },
        { stageName: 'SemanticRank', candidatesBefore: 5, candidatesAfter: 2, removalRate: 0.6, filterReason: 'BelowSemanticThreshold' }
      ],
      
      pipelineStats: {
        initialCandidates: 50,
        finalCandidates: matchedSupplier ? 1 : 0
      }
    };

    traces.push(trace);
  }

  // Calculate confusion matrix from decisions vs ground truth
  let tp = 0, fp = 0, fn = 0, tn = 0;
  
  for (const decision of decisions) {
    const truth = groundTruth.get(decision.invoiceId);
    const isCorrectMatch = decision.decision === 'PATTERN_MATCH' && decision.supplierId === truth?.supplierId;
    const isWrongMatch = decision.decision === 'PATTERN_MATCH' && decision.supplierId !== truth?.supplierId;
    const isMissedOpportunity = (decision.decision === 'AI_FALLBACK' || decision.decision === 'NO_PATTERN') && truth?.supplierId;
    const isCorrectReject = (decision.decision === 'AI_FALLBACK' || decision.decision === 'NO_PATTERN') && !truth?.supplierId;

    if (isCorrectMatch) tp++;
    else if (isWrongMatch) fp++;
    else if (isMissedOpportunity) fn++;
    else tn++;
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const fmr = tp + fp > 0 ? fp / (tp + fp) : 0;
  const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;

  return {
    totalInvoices,
    confusionMatrix: { tp, fp, fn, tn },
    metrics: {
      precision,
      recall,
      fmr,
      f1Score: f1,
      specificity: tn + fp > 0 ? tn / (tn + fp) : 0,
      npv: tn + fn > 0 ? tn / (tn + fn) : 0
    },
    decisions,
    traces,
    groundTruth,
    pipelineData: {
      inputCount: totalInvoices,
      inputIds: decisions.map(d => d.invoiceId),
      stageCounts: {
        initial: 50,
        afterTenantFilter: 15,
        afterSupplierGate: 5,
        afterSemanticRank: 2,
        final: 1
      }
    },
    aiFallbackCount: decisions.filter(d => d.decision === 'AI_FALLBACK').length,
    
    // Metadata for confidence calculation
    datasetType: 'SYNTHETIC', // IMPORTANT: This will lower confidence score
    dataSource: 'generated',
    supplierCount: 10,
    templateCount: 5,
    formatTypes: ['arabic_tax', 'english_commercial', 'mixed_gulf'],
    languages: ['ar', 'en'],
    ocrErrorRate: 0.15,
    ocrSource: 'simulated',
    hasRealOCRErrors: false,
    sharedLayoutGroups: 5,
    humanVerified: false,
    generatedAt: new Date().toISOString()
  };
}

function generateRejectedCandidates(correctSupplierId, index) {
  const candidates = [];
  const numCandidates = 3 + Math.floor(Math.random() * 5); // 3-7 rejected candidates

  for (let i = 0; i < numCandidates; i++) {
    const candidateId = `supplier_${(index + i) % 10}`;
    const score = 0.3 + Math.random() * 0.5;
    const threshold = 0.70 + Math.random() * 0.15;

    // Determine rejection reason based on score and context
    let reason;
    if (candidateId === correctSupplierId && score < threshold) {
      reason = 'BelowSemanticThreshold'; // Correct supplier but low score
    } else if (score < 0.5) {
      reason = 'LowSimilarityScore';
    } else if (Math.random() > 0.7) {
      reason = 'SupplierIdentityFailed';
    } else if (Math.random() > 0.7) {
      reason = 'TenantMismatch';
    } else {
      reason = 'LayoutHashMismatch';
    }

    candidates.push({
      candidateId,
      reason,
      score: parseFloat(score.toFixed(3)),
      threshold: parseFloat(threshold.toFixed(3)),
      gap: parseFloat((threshold - score).toFixed(3)),
      gapPercentage: `${(((threshold - score) / threshold) * 100).toFixed(1)}%`,
      additionalContext: {
        semanticDetails: {
          layoutScore: parseFloat((0.3 + Math.random() * 0.7).toFixed(3)),
          headerScore: parseFloat((0.2 + Math.random() * 0.8).toFixed(3))
        }
      }
    });
  }

  return candidates;
}

// ============================================================
// DEMONSTRATION FUNCTIONS
// ============================================================

async function demonstrateInvariantChecker() {
  console.log('\n\n' + '═'.repeat(80));
  console.log('  DEMONSTRATION 1: THREE-LAYER INVARIANT CHECKER');
  console.log('═'.repeat(80));

  const checker = new BenchmarkInvariantChecker();
  const benchmarkData = createSampleBenchmarkResult();

  // Intentionally introduce some issues to demonstrate detection
  // Issue 1: Slight FMR mismatch to show detection
  benchmarkData.metrics.fmr += 0.01; // Off by 1%

  return checker.runAllInvariants(benchmarkData);
}

async function demonstrateRootCauseAttribution() {
  console.log('\n\n' + '═'.repeat(80));
  console.log('  DEMONSTRATION 2: TREE-STRUCTURED ROOT CAUSE ATTRIBUTION');
  console.log('═'.repeat(80));

  const attributor = new RootCauseAttributor();
  const benchmarkData = createSampleBenchmarkResult();

  // Prepare invoice results for attribution
  const invoiceResults = benchmarkData.decisions.map(decision => ({
    invoiceId: decision.invoiceId,
    decision: decision,
    trace: benchmarkData.traces.find(t => t.invoiceId === decision.invoiceId),
    groundTruth: benchmarkData.groundTruth.get(decision.invoiceId),
    expectedSupplierId: benchmarkData.groundTruth.get(decision.invoiceId)?.supplierId
  }));

  const result = attributor.analyzeBatch(invoiceResults);

  // Print tree visualization
  console.log('\n' + attributor.generateTreeVisualization(result.attributions));

  return result;
}

async function demonstrateDecisionTrace() {
  console.log('\n\n' + '═'.repeat(80));
  console.log('  DEMONSTRATION 3: DETAILED DECISION TRACE (CTO Debug View)');
  console.log('═'.repeat(80));

  const logger = new DecisionTraceLogger();
  const benchmarkData = createSampleBenchmarkResult();

  // Build a comprehensive trace manually for one invoice
  const sampleInvoiceId = 'invoice_0042'; // A specific invoice to examine

  logger.beginTrace(sampleInvoiceId, {
    supplierName: 'Riyadh Construction Company',
    trn: 'TRN1000042001',
    total: 25000.00,
    currency: 'SAR',
    date: '2025-01-15',
    ocrQuality: 0.87
  })
  .recordStage('TenantFilter', { 
    status: 'completed', 
    durationMs: 2, 
    inputCandidates: 50, 
    outputCandidates: 12,
    note: 'Filtered to same tenant'
  })
  .recordStage('SupplierGate', { 
    status: 'completed', 
    durationMs: 5, 
    inputCandidates: 12, 
    outputCandidates: 4,
    note: 'Identity validation passed for 4 suppliers'
  })
  .recordStage('SemanticRanking', { 
    status: 'completed', 
    durationMs: 15, 
    inputCandidates: 4, 
    outputCandidates: 2,
    note: 'Top 2 by semantic similarity'
  })
  .recordStage('FinalSelection', { 
    status: 'completed', 
    durationMs: 1, 
    selected: 'supplier_4',
    note: 'Selected highest scoring candidate'
  })
  // Record ALL candidates considered
  .recordCandidate('supplier_1', 0.45, { layoutMatch: 0.60, semanticMatch: 0.30 })
  .recordCandidate('supplier_2', 0.52, { layoutMatch: 0.75, semanticMatch: 0.40 })
  .recordCandidate('supplier_3', 0.68, { layoutMatch: 0.90, semanticMatch: 0.55 })
  .recordCandidate('supplier_4', 0.84, { layoutMatch: 0.95, semanticMatch: 0.78 }) // Winner
  .recordCandidate('supplier_7', 0.41, { layoutMatch: 0.55, semanticMatch: 0.28 })
  // Record rejections WITH DETAILED REASONS
  .recordRejection('supplier_1', 'LowSemanticScore', 0.45, 0.70, {
    breakdown: { layout: 0.60, semantic: 0.30, header: 0.45 }
  })
  .recordRejection('supplier_2', 'BelowThreshold', 0.52, 0.70, {
    breakdown: { layout: 0.75, semantic: 0.40, header: 0.50 }
  })
  .recordRejection('supplier_3', 'SupplierIdentityFailed', 0.68, 0.80, {
    supplierScore: 0.68,
    requiredForGate: 0.80,
    gap: 'Supplier name similarity too low'
  })
  .recordRejection('supplier_7', 'TenantMismatch', 0.41, 0.95, {
    candidateTenant: 'tenant_2',
    invoiceTenant: 'tenant_1',
    bypassAttempted: false
  })
  // Record filter stages
  .recordFilterStage('TenantFilter', 50, 12, 'Different tenant')
  .recordFilterStage('SupplierGate', 12, 4, 'Identity check failed')
  .recordFilterStage('SemanticRank', 4, 2, 'Below semantic threshold')
  // Record scores
  .recordScores({
    layout: 0.95,
    semantic: 0.78,
    headerSignature: 0.85,
    currency: 1.00,
    taxStructure: 0.90,
    anchorWords: 0.72,
    total: 0.84
  })
  // Finalize
  .finalize('PATTERN_MATCH', 'pattern_supplier_4', 0.84, {
    engineVersion: '2.0.0',
    modelVersion: 'semantic-v1.2'
  });

  // Print the debug report
  console.log(logger.generateDebugReport(sampleInvoiceId));
  
  return logger.generateSummaryStats();
}

async function demonstratePropertyBasedTesting() {
  console.log('\n\n' + '═'.repeat(80));
  console.log('  DEMONSTRATION 4: PROPERTY-BASED TESTING (10k scenarios)');
  console.log('═'.repeat(80));

  const tester = new PropertyBasedTester({
    maxScenarios: 10000, // Reduced for demo speed
    failFast: false,
    verbose: true
  });

  return await tester.runFullSuite();
}

async function demonstrateConfidenceScore() {
  console.log('\n\n' + '═'.repeat(80));
  console.log('  DEMONSTRATION 5: BENCHMARK CONFIDENCE SCORE');
  console.log('═'.repeat(80));

  const calculator = new BenchmarkConfidenceCalculator();
  
  // Scenario 1: Synthetic dataset (current state)
  const syntheticBenchmark = {
    datasetType: 'SYNTHETIC',
    dataSource: 'generated',
    supplierCount: 10,
    totalInvoices: 100,
    templateCount: 5,
    languages: ['ar', 'en'],
    ocrSource: 'simulated',
    ocrErrorRate: 0.15,
    hasRealOCRErrors: false,
    sharedLayoutGroups: 5,
    humanVerified: false,
    invariantResult: {
      summary: { totalInvariants: 23, passed: 22, failed: 1, criticalFailures: 0 }
    }
  };

  const confidence1 = calculator.calculate(syntheticBenchmark);
  console.log(calculator.generateReport(confidence1, 0.74));

  // Scenario 2: What a production-ready benchmark would look like
  console.log('\n--- COMPARISON: Production-Ready Benchmark ---\n');
  const goldenBenchmark = {
    datasetType: 'GOLDEN',
    dataSource: 'production_export',
    isGoldenDataset: true,
    humanVerified: true,
    collectionMethod: 'manual_curation',
    dataLineage: true,
    supplierCount: 100,
    totalInvoices: 10000,
    templateCount: 18,
    languages: ['ar', 'en', 'fr', 'ur'],
    ocrSource: 'real_engine',
    ocrEngine: 'tesseract_ar_v4',
    ocrEngineIncludesArabic: true,
    hasRealOCRErrors: true,
    ocrErrorRate: 0.18,
    ocrQualityDistribution: true,
    sharedLayoutGroups: 15,
    sharedLayoutInvoiceRatio: 0.35,
    supportsMixedLanguage: true,
    invariantResult: {
      summary: { totalInvariants: 23, passed: 23, failed: 0, criticalFailures: 0 }
    }
  };

  const confidence2 = calculator.calculate(goldenBenchmark);
  console.log(calculator.generateReport(confidence2, 0.003)); // Hypothetical good FMR

  return { synthetic: confidence1, golden: confidence2 };
}

async function runFullVerificationSuite() {
  console.log('\n\n' + '═'.repeat(80));
  console.log('  DEMONSTRATION 6: FULL VERIFICATION SUITE (ORCHESTRATED)');
  console.log('═'.repeat(80));

  const suite = new VerificationSuite({
    runPropertyBasedTests: true,
    propertyTestCount: 5000, // Reduced for demo
    verbose: true
  });

  const benchmarkData = createSampleBenchmarkResult();
  return await suite.verify(benchmarkData);
}

// ============================================================
// MAIN EXECUTION
// ============================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                  ║');
  console.log('║   INVOICE BRAIN VERIFICATION SUITE - COMPLETE DEMONSTRATION     ║');
  console.log('║                                                                  ║');
  console.log('║   Components:                                                   ║');
  console.log('║   1. Three-Layer Invariant System (Math/Pipeline/Business)       ║');
  console.log('║   2. Tree-Structured Root Cause Attribution                      ║');
  console.log('║   3. Detailed Decision Trace with Rejected Candidates            ║');
  console.log('║   4. Property-Based Testing Framework                            ║');
  console.log('║   5. Benchmark Confidence Score Calculator                       ║');
  console.log('║                                                                  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  const results = {};

  try {
    // Run all demonstrations
    results.invariants = await demonstrateInvariantChecker();
    results.rootCauses = await demonstrateRootCauseAttribution();
    results.traces = await demonstrateDecisionTrace();
    results.propertyTests = await demonstratePropertyBasedTesting();
    results.confidence = await demonstrateConfidenceScore();
    results.fullSuite = await runFullVerificationSuite();

    // Save complete results
    saveResults(results);

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
  }
}

function saveResults(results) {
  const fs = require('fs');
  const outputPath = '/home/z/my-project/download/verification-suite-results.json';

  const exportableResults = {
    generatedAt: new Date().toISOString(),
    version: '1.0.0',
    summary: {
      invariantStatus: results.invariants?.summary?.overallStatus,
      rootCausesAnalyzed: results.rootCauses?.summary?.total,
      propertyTestPassRate: results.propertyTests?.summary?.passRate,
      syntheticConfidence: results.confidence?.synthetic?.confidence,
      goldenConfidence: results.confidence?.golden?.confidence,
      fullSuiteStatus: results.fullSuite?.overallStatus?.status
    },
    details: {
      invariants: results.invariants,
      rootCauses: {
        summary: results.rootCauses?.summary,
        topCauses: Object.entries(results.rootCauses?.summary?.byRootCausePercent || {})
          .sort((a, b) => parseFloat(b[1]) - parseFloat(a[1]))
          .slice(0, 5)
      },
      traceStats: results.traces,
      propertyTests: results.propertyTests?.summary,
      confidence: {
        synthetic: results.confidence?.synthetic,
        golden: results.confidence?.golden
      },
      fullSuite: results.fullSuite
    }
  };

  fs.writeFileSync(outputPath, JSON.stringify(exportableResults, null, 2));
  console.log(`\n✅ Results saved to: ${outputPath}`);
}

// Run
main().catch(console.error);
