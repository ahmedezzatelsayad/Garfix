/**
 * M1 Failure Classification Framework
 * Invoice Brain - Golden Validation Phase
 * 
 * Purpose: Classify Quality Gate failures WITHOUT modifying gate logic
 * Principle: Fix the data, don't move the goalposts
 * 
 * Feature Freeze: This classifier uses EXISTING gate outputs
 * Do NOT modify underlying Quality Gate Checker
 */

const fs = require('fs');
const path = require('path');

// ==================== FAILURE CLASSIFICATION ====================
class FailureClassifier {
  constructor(gateReport) {
    this.report = gateReport;
    this.classifications = [];
    this.decisions = [];
  }

  /**
   * Main classification method
   * Takes raw gate output and classifies root cause
   */
  classify() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     M1 Failure Classification - Root Cause Analysis       ║');
    console.log('║           Tool Output Interpretation (NOT Modification)  ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');

    const gates = this.report.gates || {};
    
    // Classify each failed gate
    Object.entries(gates).forEach(([gateKey, gateResult]) => {
      if (gateResult.status === 'FAIL' || gateResult.status === 'NO_DATA') {
        const classification = this.classifySingleGate(gateKey, gateResult);
        this.classifications.push(classification);
      }
    });

    // Generate summary
    this.generateClassificationSummary();
    
    return {
      classifications: this.classifications,
      decisions: this.decisions,
      timestamp: new Date().toISOString(),
      principle: 'FIX DATA, NOT GATES'
    };
  }

  /**
   * Classify individual gate failure
   */
  classifySingleGate(gateKey, gateResult) {
    const classification = {
      gate: gateKey,
      name: gateResult.name,
      originalVerdict: gateResult.verdict,
      category: null, // DATASET / PROTOCOL / INFRASTRUCTURE
      rootCause: null,
      severity: null, // CRITICAL / MAJOR / MINOR
      actionRequired: null,
      owner: null,
      canFixWithoutModifyingGate: true
    };

    switch (gateKey) {
      case 'piiRemoval':
        return this.classifyPIIFailure(classification, gateResult);
      
      case 'dataIntegrity':
        return this.classifyDataIntegrityFailure(classification, gateResult);
      
      case 'supplierDistribution':
        return this.classifySupplierDistributionFailure(classification, gateResult);
      
      case 'templateCompliance':
        return this.classifyTemplateComplianceFailure(classification, gateResult);
      
      default:
        return this.classifyGenericFailure(classification, gateResult);
    }
  }

  // ==================== SPECIFIC CLASSIFIERS ====================

  classifyPIIFailure(classification, result) {
    const piiIncidents = result.details?.piiIncidents || 0;
    
    // CTO Insight: PII in production backup is NORMAL
    // Real question: Will PII enter Engine during Evaluation?
    
    classification.category = 'DATASET_ISSUE';
    classification.rootCause = 'PRODUCTION_DATA_CONTAINS_PII';
    classification.severity = 'CRITICAL';
    classification.actionRequired = 'PRE_PROCESSING_REQUIRED';
    classification.owner = 'Data Engineering';
    
    // Detailed analysis
    classification.analysis = {
      incidentCount: piiIncidents,
      nature: 'Production backup contains real customer data',
      isThisExpected: 'YES - Production data normally has PII',
      realQuestion: 'Will masked/anonymized data be used for Evaluation?',
      
      decisionPoint: {
        ifMaskingPlanned: 'Re-classify as PRE_PROCESSING_REQUIRED (not FAIL)',
        ifNoMasking: 'Keep as FAIL - Security violation risk',
        recommendation: 'Document masking pipeline, re-run gate on masked data'
      }
    };

    this.decisions.push({
      type: 'PII_HANDLING_DECISION',
      currentStatus: 'FAIL (as reported)',
      recommendedStatus: 'PRE_PROCESSING_REQUIRED',
      rationale: 'CTO Guidance: PII in backup is normal, not a dataset defect',
      action: 'Implement PII Masking Pipeline → Re-run gate on masked output'
    });

    return classification;
  }

  classifyDataIntegrityFailure(classification, result) {
    const corruptionRate = result.details?.corruptionRate || 0;
    const issues = result.details?.issues || [];
    
    // CTO Insight: JSON format is valid if protocol supports it
    // File format ≠ Data corruption
    
    // Determine actual cause
    const isFormatIssue = issues.some(i => i.issue?.includes('Invalid') || i.issue?.includes('header'));
    const isEmptyFiles = issues.some(i => i.issue?.includes('Empty'));
    const isRealCorruption = corruptionRate > 50 && !isFormatIssue;

    if (isFormatIssue && !isRealCorruption) {
      // Format mismatch, not corruption
      classification.category = 'PROTOCOL_ISSUE';
      classification.rootCause = 'FORMAT_MISMATCH';
      classification.severity = 'MINOR';
      classification.actionRequired = 'PROTOCOL_CLARIFICATION';
      classification.owner = 'Benchmark Team';
      
      classification.analysis = {
        detectedAs: 'Data Corruption (by gate logic)',
        actuallyIs: 'Format Difference (JSON vs expected binary)',
        isThisProblem: 'DEPENDS_ON_PROTOCOL_REQUIREMENT',
        
        decisionPoint: {
          ifProtocolAcceptsJSON: 'Re-classify as PASS (format is acceptable)',
          ifProtocolRequiresPDF: 'Keep as FAIL (conversion needed)',
          recommendation: 'Clarify acceptable formats in Protocol v1.0'
        }
      };

      this.decisions.push({
        type: 'FORMAT_ACCEPTANCE_DECISION',
        currentStatus: 'FAIL (corruption detected)',
        recommendedStatus: 'CONDITIONAL_PASS',
        rationale: 'CTO Guidance: Format difference ≠ Data corruption',
        action: 'Document accepted formats in Protocol spec'
      });

    } else if (isEmptyFiles) {
      classification.category = 'DATASET_ISSUE';
      classification.rootCause = 'EMPTY_FILES_DETECTED';
      classification.severity = 'MAJOR';
      classification.actionRequired = 'DATA_COLLECTION_FIX';
      classification.owner = 'Data Team';

    } else {
      classification.category = 'DATASET_ISSUE';
      classification.rootCause = 'ACTUAL_CORRUPTION';
      classification.severity = 'CRITICAL';
      classification.actionRequired = 'DATA_RECOLLECTION';
      classification.owner = 'Data Team';
    }

    return classification;
  }

  classifySupplierDistributionFailure(classification, result) {
    const violations = result.details?.violations || [];
    const uniqueSuppliers = result.details?.uniqueSuppliers || 0;
    
    // CTO Insight: This is THE critical decision point
    // Is Golden Dataset for Benchmark Research OR Production Validation?
    
    classification.category = 'STRATEGIC_DECISION_REQUIRED';
    classification.rootCause = 'SUPPLIER_CONCENTRATION_IN_PRODUCTION_DATA';
    classification.severity = 'CRITICAL'; // Requires CTO decision
    classification.actionRequired = 'STRATEGIC_DECISION_BEFORE_M2';
    classification.owner = 'CTO / Steering Committee';
    
    classification.analysis = {
      uniqueSuppliers: uniqueSuppliers,
      violations: violations,
      
      // The two possible interpretations
      interpretationA: { // Benchmark Research mode
        name: 'BENCHMARK_RESEARCH_MODE',
        assumption: 'Goal is fair, unbiased model evaluation',
        requirement: 'No supplier > 10%',
        actionIfChosen: 'Resample to balanced distribution',
        risk: 'Less realistic evaluation, may not catch production issues'
      },
      
      interpretationB: { // Production Validation mode
        name: 'PRODUCTION_VALIDATION_MODE', 
        assumption: 'Goal is validate against real-world distribution',
        requirement: 'Match production distribution (even if skewed)',
        actionIfChosen: 'Accept current distribution as-is',
        risk: 'Model may overfit to major suppliers, miss edge cases'
      },
      
      // Current data reality
      productionReality: {
        topSuppliers: violations.map(v => ({ supplier: v.supplier, pct: v.percentage })),
        note: 'These ARE the real companies in production',
        question: 'Should validation reflect reality or ideal?'
      },

      decisionPoint: {
        mustDecideBefore: 'M2 (Dataset Freeze)',
        impacts: 'Definition of PASS/FAIL for M1-005 and all future sampling',
        recommendation: 'Document both options, decide based on project primary goal'
      }
    };

    this.decisions.push({
      type: 'GOLDEN_DATASET_PURPOSE_DECISION',
      currentStatus: 'FAIL (concentration > 10%)',
      optionA: 'BENCHMARK_MODE → Resample required',
      optionB: 'PRODUCTION_MODE → Accept as realistic',
      rationale: 'CTO Guidance: Different goals require different distributions',
      blockingMilestone: 'M2',
      urgency: 'HIGH'
    });

    return classification;
  }

  classifyTemplateComplianceFailure(classification, result) {
    const deviations = result.details?.deviations || {};
    
    classification.category = 'DATASET_ISSUE';
    classification.rootCause = 'TEMPLATE_DISTRIBUTION_SKEW';
    classification.severity = 'MAJOR';
    classification.actionRequired = 'TARGETED_COLLECTION_OR_ACCEPTANCE';
    classification.owner = 'Data Team';
    
    classification.analysis = {
      deviations: deviations,
      likelyCause: 'Production naturally generates more of certain template types',
      
      similarDecisionPoint: {
        likeSupplierDistribution: 'Same strategic question applies',
        benchmarkMode: 'Collect missing templates to meet spec targets',
        productionMode: 'Accept natural distribution as representative'
      }
    };

    // This is tied to the same strategic decision as supplier distribution
    this.decisions.push({
      type: 'TEMPLATE_DISTRIBUTION_DECISION',
      tiedTo: 'SUPPLIER_DISTRIBUTION_DECISION',
      willResolveWith: 'Same strategic choice (Benchmark vs Production mode)'
    });

    return classification;
  }

  classifyGenericFailure(classification, result) {
    classification.category = 'UNCLASSIFIED';
    classification.rootCause = 'UNKNOWN';
    classification.severity = 'MAJOR';
    classification.actionRequired = 'MANUAL_INVESTIGATION';
    classification.owner = 'Benchmark Team Lead';
    return classification;
  }

  // ==================== SUMMARY GENERATION ====================
  generateClassificationSummary() {
    console.log('─── Failure Classification Summary ───');
    console.log('');

    // Group by category
    const categories = {
      DATASET_ISSUE: [],
      PROTOCOL_ISSUE: [],
      INFRASTRUCTURE_ISSUE: [],
      STRATEGIC_DECISION_REQUIRED: []
    };

    this.classifications.forEach(c => {
      if (categories[c.category]) {
        categories[c.category].push(c);
      } else {
        categories.UNCLASSIFIED = categories.UNCLASSIFIED || [];
        categories.UNCLASSIFIED.push(c);
      }
    });

    // Print category summaries
    Object.entries(categories).forEach(([category, items]) => {
      if (items.length === 0) return;
      
      const icon = category === 'STRATEGIC_DECISION_REQUIRED' ? '🎯' :
                  category === 'DATASET_ISSUE' ? '📊' :
                  category === 'PROTOCOL_ISSUE' ? '📋' : '🔧';
      
      console.log(`${icon} ${category} (${items.length} items):`);
      items.forEach(item => {
        console.log(`   • [${item.gate}] ${item.rootCause}`);
        console.log(`     Action: ${item.actionRequired} | Owner: ${item.owner}`);
      });
      console.log('');
    });

    // Print decisions required
    if (this.decisions.length > 0) {
      console.log('═══════════════════════════════════════════════');
      console.log('📋 DECISIONS REQUIRED BEFORE M2:');
      console.log('═══════════════════════════════════════════════');
      this.decisions.forEach((d, i) => {
        console.log(``);
        console.log(`D${i+1}: ${d.type}`);
        console.log(`   Current: ${d.currentStatus}`);
        if (d.optionA) console.log(`   Option A: ${d.optionA}`);
        if (d.optionB) console.log(`   Option B: ${d.optionB}`);
        if (d.recommendedStatus) console.log(`   Recommended: ${d.recommendedStatus}`);
        console.log(`   Rationale: ${d.rationale}`);
      });
      console.log('');
    }

    // Print what CAN be fixed now vs what requires decision
    const fixableNow = this.classifications.filter(c => 
      c.category !== 'STRATEGIC_DECISION_REQUIRED'
    );
    const needsDecision = this.classifications.filter(c => 
      c.category === 'STRATEGIC_DECISION_REQUIRED'
    );

    console.log('═══════════════════════════════════════════════');
    console.log('⚡ ACTIONABLE NOW (fix data, re-run same gate):');
    fixableNow.forEach(c => {
      console.log(`   ✅ [${c.gate}] ${c.actionRequired}`);
    });
    
    if (needsDecision.length > 0) {
      console.log('');
      console.log('🎯 REQUIRES STRATEGIC DECISION:');
      needsDecision.forEach(c => {
        console.log(`   ⏸️  [${c.gate}] ${c.actionRequired}`);
      });
    }
    console.log('═══════════════════════════════════════════════');
  }

  // Generate report file
  generateReport() {
    const reportPath = '/home/z/my-project/download/m1-failure-classification.json';
    
    const report = {
      sourceReport: this.report.fingerprint,
      classifications: this.classifications,
      decisions: this.decisions,
      metadata: {
        generatedAt: new Date().toISOString(),
        principle: 'FIX_DATA_NOT_GATES',
        featureFreezeActive: true,
        toolModified: false,
        ctoGuidanceApplied: true
      }
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log('');
    console.log(`📄 Classification Report: ${reportPath}`);
    
    return report;
  }
}

// ==================== CLI ====================
if (require.main === module) {
  // Load the existing M1 report
  const reportPath = '/home/z/my-project/download/batch1-quality-gate-report.json';
  
  if (!fs.existsSync(reportPath)) {
    console.error('❌ M1 Quality Gate Report not found. Run batch1 checker first.');
    process.exit(1);
  }

  const gateReport = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  
  const classifier = new FailureClassifier(gateReport);
  const classification = classifier.classify();
  classifier.generateReport();

  console.log('');
  console.log('💡 Key Insight (from CTO):');
  console.log('   "قبل أسبوع: هل الـ Engine جيد؟"');
  console.log('   "اليوم: هل عملية إنتاج البيانات قابلة للثقة؟"');
  console.log('   → هذا انتقال صحي في نضج المشروع.');
  console.log('');
  console.log('✅ Next: Fix classified issues → Re-run SAME gate → Compare');
}

module.exports = FailureClassifier;
