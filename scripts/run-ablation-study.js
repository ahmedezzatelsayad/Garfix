/**
 * Invoice Brain Ablation Study - Test Runner
 * ===========================================
 * 
 * Demonstrates:
 * 1. Ablation Study (Baseline → A → B → C → Full)
 * 2. Gate 1 Evaluation (Comparison Table)
 * 3. New Operational Metrics
 * 4. E2E Benchmark Structure
 */

const {
  AblationStudyRunner,
  BenchmarkComparisonGate,
  EndToEndBenchmarkStructure
} = require('./invoice-brain-ablation-study');

// ============================================================
// MAIN EXECUTION
// ============================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                  ║');
  console.log('║   INVOICE BRAIN ABLATION STUDY & GATE EVALUATION                ║');
  console.log('║                                                                  ║');
  console.log('║   CTO-Mandated: Measure EACH phase independently                 ║');
  console.log('║                                                                  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  // Run Ablation Study
  const ablationRunner = new AblationStudyRunner({
    iterations: 5,        // 5 runs per configuration for statistical significance
    confidenceInterval: 0.95,
    randomSeed: 42,       // Reproducible results
    verbose: false
  });

  console.log('\n📊 Running Ablation Study...\n');
  const ablationResults = await ablationRunner.runFullStudy();

  // Evaluate Gate 1
  const gate1 = new BenchmarkComparisonGate();
  const gateResult = gate1.evaluate(ablationResults);

  // Demonstrate E2E Structure
  console.log('\n\n' + '═'.repeat(70));
  console.log('  END-TO-END BENCHMARK STRUCTURE (Gate 3 Preparation)');
  console.log('═'.repeat(70));

  const e2eStructure = new EndToEndBenchmarkStructure();
  
  console.log('\nPipeline Stages to Measure:');
  for (const stage of e2eStructure.pipelineStages) {
    console.log(`  ${stage.key.padEnd(25)} ${stage.name}`);
  }

  console.log('\nPercentiles to Report:');
  console.log(`  ${e2eStructure.percentiles.map(p => `p${p}`).join(', ')}`);
  console.log('\n(Note: Not just average!)');

  // Generate final report
  generateFinalReport(ablationResults, gateResult);
}

function generateFinalReport(ablationResults, gateResult) {
  const fs = require('fs');

  const report = {
    version: '2.0.0',
    generatedAt: new Date().toISOString(),
    
    executiveSummary: ablationResults.summary,
    
    gate1Result: {
      verdict: gateResult.verdict,
      canProceed: gateResult.canProceed,
      criteriaSummary: gateResult.criteria.map(c => ({
        name: c.name,
        passed: c.passed
      }))
    },
    
    comparisonTable: gateResult.comparisonTable.map(row => ({
      metric: row.name,
      baseline: row.formatted.baseline,
      current: row.formatted.current,
      delta: row.formatted.delta,
      improved: row.improved
    })),
    
    phaseDetails: {},
    operationalMetrics: {}
  };

  // Add phase details
  for (const [phaseKey, phaseResult] of Object.entries(ablationResults.phaseResults || {})) {
    if (typeof phaseResult === 'object' && phaseResult.phaseName) {
      report.phaseDetails[phaseKey] = {
        name: phaseResult.phaseName,
        fmr: `${(phaseResult.metrics.fmr * 100).toFixed(2)}%`,
        precision: `${(phaseResult.metrics.precision * 100).toFixed(2)}%`,
        recall: `${(phaseResult.metrics.recall * 100).toFixed(2)}%`,
        f1: `${(phaseResult.metrics.f1 * 100).toFixed(2)}%`,
        supplierConfusion: `${(phaseResult.operationalMetrics.supplierConfusionRate * 100).toFixed(2)}%`,
        patternReuse: `${(phaseResult.operationalMetrics.patternReuseAccuracy * 100).toFixed(2)}%`,
        humanOverride: `${(phaseResult.operationalMetrics.humanOverrideRate * 100).toFixed(2)}%`,
        latencyP50: `${phaseResult.latency.p50.toFixed(0)}ms`,
        latencyP99: `${phaseResult.latency.p99.toFixed(0)}ms`
      };

      if (ablationResults.analysis?.comparisons) {
        const comp = ablationResults.analysis.comparisons.find(c => c.phase === phaseKey);
        if (comp?.incrementalDelta) {
          report.phaseDetails[phaseKey].incrementalImpact = {
            comparedTo: comp.incrementalDelta.comparedAgainst,
            fmrChange: `${comp.incrementalDelta.fmrChangePercent.toFixed(1)}%`,
            interpretation: comp.incrementalDelta.interpretation
          };
        }
      }
    }
  }

  // Save report
  const outputPath = '/home/z/my-project/download/ablation-study-report.json';
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

  // Print summary
  console.log('\n\n' + '═'.repeat(70));
  console.log('  FINAL REPORT SUMMARY');
  console.log('═'.repeat(70));

  console.log(`\n📁 Report saved to: ${outputPath}`);

  console.log('\n📊 KEY FINDINGS:');
  console.log(`   Baseline FMR:     ${ablationResults.summary?.keyFindings?.fmrBaseline || '?'}`);
  console.log(`   Final FMR:         ${ablationResults.summary?.keyFindings?.fmrFinal || '?'}`);
  console.log(`   Total Reduction:   ${ablationResults.summary?.keyFindings?.fmrTotalReduction || '?'}`);
  console.log(`   Reduction %:       ${ablationResults.summary?.keyFindings?.fmrReductionPercent || '?'}`);
  console.log(`   Target (<0.5%):    ${ablationResults.summary?.keyFindings?.targetAchieved ? '✅ YES' : '❌ NO'}`);

  console.log(`\n🚪 GATE 1 STATUS: ${gateResult.verdict}`);
  if (gateResult.canProceed) {
    console.log('   ✅ Can proceed to Phase D planning');
  } else {
    console.log('   ❌ STOP - Investigate before proceeding');
  }

  console.log('\n📈 OPERATIONAL METRICS (NEW):');
  const fullSystem = ablationResults.phaseResults?.FULL;
  if (fullSystem) {
    console.log(`   Supplier Confusion Rate: ${(fullSystem.operationalMetrics.supplierConfusionRate * 100).toFixed(2)}%`);
    console.log(`   Pattern Reuse Accuracy:  ${(fullSystem.operationalMetrics.patternReuseAccuracy * 100).toFixed(2)}%`);
    console.log(`   Human Override Rate:     ${(fullSystem.operationalMetrics.humanOverrideRate * 100).toFixed(2)}%`);
  }

  console.log('\n⏱️  LATENCY METRICS (p50/p95/p99):');
  if (fullSystem) {
    console.log(`   p50: ${fullSystem.latency.p50.toFixed(0)}ms`);
    console.log(`   p95: ${fullSystem.latency.p95.toFixed(0)}ms`);
    console.log(`   p99: ${fullSystem.latency.p99.toFixed(0)}ms`);
  }

  console.log('\n' + '═'.repeat(70));
}

// Run
main().catch(console.error);
