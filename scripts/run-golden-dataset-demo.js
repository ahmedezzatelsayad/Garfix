/**
 * Golden Dataset Spec & Benchmark Manifest - Demo Runner
 * Shows the CTO-approved distribution requirements and reproducibility tools
 */

import { GOLDEN_DATASET_SPEC, BenchmarkManifestBuilder, GoldenDatasetValidator } from './invoice-brain-golden-dataset-spec.js';

console.log('╔═════════════════════════════════════════════════════════════════════╗');
console.log('║     INVOICE BRAIN - GOLDEN DATASET SPECIFICATION & MANIFEST        ║');
console.log('║                    CTO-APPROVED REQUIREMENTS                       ║');
console.log('╚═════════════════════════════════════════════════════════════════════╝');
console.log('');

// ============================================================================
// SECTION 1: DISPLAY DISTRIBUTION REQUIREMENTS
// ============================================================================

console.log('═════════════════════════════════════════════════════════════════════');
console.log('GOLDEN DATASET DISTRIBUTION REQUIREMENTS (CTO-Approved)');
console.log('═════════════════════════════════════════════════════════════════════');
console.log('');

console.log('┌─────────────────────────────┬─────────┬──────────┬──────────┬──────────────┐');
console.log('│ Category                    │ Target  │ Minimum  │ Maximum  │ Impact      │');
console.log('├─────────────────────────────┼─────────┼──────────┼──────────┼──────────────┤');

for (const cat of GOLDEN_DATASET_SPEC.requiredDistribution) {
  const name = cat.name.padEnd(27);
  const target = `${cat.targetPercentage}%`.padStart(7);
  const min = `${cat.minimumPercentage}%`.padStart(8);
  const max = `${cat.maximumPercentage}%`.padStart(8);
  const impact = cat.difficultyImpact.padEnd(12);
  
  console.log(`│ ${name} │ ${target} │ ${min} │ ${max} │ ${impact} │`);
}

console.log('└─────────────────────────────┴─────────┴──────────┴──────────┴──────────────┘');
console.log('');
console.log('Minimum Dataset Size:');
console.log(`  • Total Invoices: ≥${GOLDEN_DATASET_SPEC.minimumSize.totalInvoices.toLocaleString()}`);
console.log(`  • Unique Suppliers: ≥${GOLDEN_DATASET_SPEC.minimumSize.uniqueSuppliers}`);
console.log(`  • Unique Templates: ≥${GOLDEN_DATASET_SPEC.minimumSize.uniqueTemplates}`);
console.log(`  • Date Range: ≥${GOLDEN_DATASET_SPEC.minimumSize.dateRangeMonths} months`);
console.log('');

// ============================================================================
// SECTION 2: DEMONSTRATE BENCHMARK MANIFEST
// ============================================================================

console.log('═════════════════════════════════════════════════════════════════════');
console.log('BENCHMARK MANIFEST (Reproducibility Template)');
console.log('═════════════════════════════════════════════════════════════════════');
console.log('');

const manifestBuilder = new BenchmarkManifestBuilder();
const manifest = manifestBuilder.createManifest({
  datasetVersion: 'golden-v1-candidate',
  datasetSource: 'PRODUCTION_EXPORT_2025',
  totalInvoices: 5500,
  languages: ['ar', 'en'],
  hasRtl: true,
  ocrEngine: 'tesseract',
  ocrVersion: '5.4.0',
  seed: 12345,
  thresholds: {
    supplier_gate: 0.80,
    semantic_similarity: 0.72,
    pattern_match: 0.85,
    fmr_threshold: 0.005
  }
});

// Simulate completing a benchmark run
manifestBuilder.updateResults({
  reportPath: '/home/z/my-project/download/gate15-golden-validation-report.json',
  gate0: 'PASSED_GOLDEN',
  gate1: 'PASSED_GOLDEN',
  gate15: 'PASSED_GOLDEN',  // This is what we're aiming for!
  gate2: 'NOT_EXECUTED'
});

console.log(manifestBuilder.generateSummary());
console.log('');

// Validate the manifest
const validation = manifestBuilder.validate();
console.log('Manifest Validation:', validation.isValid ? '✅ VALID' : '❌ INVALID');
if (!validation.isValid) {
  console.log('Missing fields:', validation.missingFields.join(', '));
}
console.log('');

// ============================================================================
// SECTION 3: SAVE OUTPUTS
// ============================================================================

const fs = await import('fs');

// Save full manifest
fs.writeFileSync(
  '/home/z/my-project/download/benchmark-manifest-example.json',
  JSON.stringify(manifest, null, 2)
);
console.log('📄 Benchmark Manifest saved to: /home/z/my-project/download/benchmark-manifest-example.json');

// Save golden dataset spec
fs.writeFileSync(
  '/home/z/my-project/download/golden-dataset-specification.json',
  JSON.stringify(GOLDEN_DATASET_SPEC, null, 2)
);
console.log('📄 Golden Dataset Spec saved to: /home/z/my-project/download/golden-dataset-specification.json');

// ============================================================================
// SECTION 4: EXAMPLE VALIDATION CHECK
// ============================================================================

console.log('');
console.log('═════════════════════════════════════════════════════════════════════');
console.log('EXAMPLE: Validating a Candidate Dataset');
console.log('═════════════════════════════════════════════════════════════════════');
console.log('');

const validator = new GoldenDatasetValidator();

// Example: A dataset that ALMOST meets requirements
const candidateDataset = {
  totalInvoices: 4800,       // Just below minimum of 5000
  uniqueSuppliers: 95,       // Below minimum of 100
  uniqueTemplates: 28,       // Below minimum of 30
  dateRange: { start: '2024-06-01', end: '2025-08-02' },
  distribution: {
    shared_erp_layout: 25,   // Below 30% target but above 20% min ✓
    ocr_noise: 22,           // OK
    arabic_only: 18,         // OK
    arabic_english_mixed: 28,// OK
    multi_page: 12,          // Above 10% min ✓
    low_quality_scan: 18,    // OK
    duplicate_suppliers: 8,  // Above 5% min ✓
    similar_supplier_names: 14 // OK
  },
  sampleInvoice: {
    invoice_id: 'INV-001',
    supplier_id: 'SUP-001',
    supplier_name_variations: ['Acme Corp', 'Acme Corporation'],
    invoice_date: '2025-01-15',
    total_amount: 1500.00,
    currency: 'AED',
    line_items_count: 5,
    template_type: 'standard',
    ocr_confidence_score: 0.92,
    scan_quality_score: 0.88,
    language_detected: 'ar',
    is_rtl: true,
    page_count: 1,
    ground_truth_match_status: 'correct'
  }
};

const validationResult = validator.validateDataset(candidateDataset);

console.log('Dataset Validation Result:', validationResult.isValid ? '✅ PASSED' : '❌ FAILED');
console.log('');

for (const check of validationResult.checks) {
  const icon = check.passed ? '✅' : '❌';
  console.log(`${icon} [${check.severity}] ${check.check}: ${check.message}`);
  
  if (check.gaps && check.gaps.length > 0) {
    for (const gap of check.gaps) {
      console.log(`   ⚠️  ${gap.name}: need ${gap.required}%, have ${gap.actual}% (deficit: ${gap.deficit}%)`);
    }
  }
}

if (validationResult.distributionGaps.length > 0) {
  console.log('');
  console.log('Distribution gaps to address:');
  for (const gap of validationResult.distributionGaps) {
    console.log(`  • ${gap.name}: add ${gap.deficit}% more invoices in this category`);
  }
}

console.log('');
console.log('╔═════════════════════════════════════════════════════════════════════╗');
console.log('║  NEXT STEP: Collect real production data matching this spec         ║');
console.log('║  Then run: node scripts/invoice-brain-gate15-robustness.js         ║');
console.log('╚═════════════════════════════════════════════════════════════════════╝');
