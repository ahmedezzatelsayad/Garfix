/**
 * ============================================================================
 * INVOICE BRAIN - GOLDEN DATASET SPECIFICATION & BENCHMARK MANIFEST
 * ============================================================================
 * 
 * This file defines:
 * 1. Golden Dataset Distribution Requirements (CTO-approved)
 * 2. Benchmark Manifest Template (for reproducibility)
 * 
 * Version: 1.0.0
 * Status: READY_FOR_DATA_COLLECTION
 * 
 * @author Invoice Brain Team
 * @version 1.0.0
 * ============================================================================
 */

// ============================================================================
// SECTION 1: GOLDEN DATASET DISTRIBUTION SPECIFICATION
// ============================================================================

const GOLDEN_DATASET_SPEC = {
  version: '1.0.0',
  status: 'READY_FOR_DATA_COLLECTION',
  
  // Minimum dataset size for statistical significance
  minimumSize: {
    totalInvoices: 5000,
    uniqueSuppliers: 100,
    uniqueTemplates: 30,
    dateRangeMonths: 12 // At least 12 months of data
  },
  
  // CTO-APPROVED distribution requirements
  // These ensure the dataset is representative of production conditions
  requiredDistribution: [
    {
      category: 'shared_erp_layout',
      name: 'Shared ERP Templates',
      description: 'Invoices from multiple suppliers using identical ERP systems (SAP, Oracle, etc.)',
      targetPercentage: 30,        // 30% of dataset
      minimumPercentage: 20,       // At least 20%
      maximumPercentage: 40,       // At most 40%
      difficultyImpact: 'HIGH',    // High confusion risk
      examples: ['SAP Standard Template', 'Oracle EBS Default', 'Microsoft Dynamics']
    },
    {
      category: 'ocr_noise',
      name: 'OCR Quality Issues',
      description: 'Invoices with OCR errors due to scan quality, handwriting, stamps, etc.',
      targetPercentage: 25,
      minimumPercentage: 15,
      maximumPercentage: 35,
      difficultyImpact: 'MEDIUM-HIGH',
      subcategories: {
        low_noise: { level: '<5%', target: 10 },   // Minor character errors
        medium_noise: { level: '5-15%', target: 10 }, // Frequent substitutions
        high_noise: { level: '>15%', target: 5 }   // Significant corruption
      }
    },
    {
      category: 'arabic_only',
      name: 'Arabic-Only Invoices',
      description: 'Invoices entirely in Arabic language (RTL)',
      targetPercentage: 20,
      minimumPercentage: 15,
      maximumPercentage: 30,
      difficultyImpact: 'HIGH',
      challenges: ['RTL text direction', 'Arabic numerals vs Hindi numerals', 'Mixed diacritics']
    },
    {
      category: 'arabic_english_mixed',
      name: 'Arabic + English Mixed',
      description: 'Invoices with both Arabic and English content (common in MENA region)',
      targetPercentage: 30,
      minimumPercentage: 20,
      maximumPercentage: 40,
      difficultyImpact: 'HIGH',
      patterns: ['Arabic body with English headers', 'Bilingual line items', 'Currency in English, text in Arabic']
    },
    {
      category: 'multi_page',
      name: 'Multi-Page Invoices',
      description: 'Invoices spanning multiple pages with continued data',
      targetPercentage: 15,
      minimumPercentage: 10,
      maximumPercentage: 25,
      difficultyImpact: 'MEDIUM',
      pageRanges: { '2 pages': 10, '3-5 pages': 4, '6+ pages': 1 }
    },
    {
      category: 'low_quality_scan',
      name: 'Low-Quality Scans',
      description: 'Scanned invoices with quality issues (faded, skewed, rotated)',
      targetPercentage: 20,
      minimumPercentage: 15,
      maximumPercentage: 30,
      difficultyImpact: 'HIGH',
      qualityIssues: ['Faded text', 'Skewed alignment', 'Rotation >5°', 'Background noise', 'Stamps/annotations overlapping text']
    },
    {
      category: 'duplicate_suppliers',
      name: 'Duplicate Supplier Variations',
      description: 'Same supplier with different name variations across invoices',
      targetPercentage: 10,
      minimumPercentage: 5,
      maximumPercentage: 15,
      difficultyImpact: 'CRITICAL',
      variationTypes: [
        'Legal name vs Trade name',
        'With/without "Ltd", "LLC", "Co."',
        'Spelling variations (El-/Al-, spaces)',
        'English transliteration differences'
      ]
    },
    {
      category: 'similar_supplier_names',
      name: 'Similar-Sounding Suppliers',
      description: 'Different suppliers with very similar names (confusion risk)',
      targetPercentage: 15,
      minimumPercentage: 10,
      maximumPercentage: 20,
      difficultyImpact: 'CRITICAL',
      examples: [
        '"Al Futtaim" vs "Al-Futtaim Group"',
        '"Emirates Electrics" vs "Emirates Electric"',
        '"ABC Trading" vs "ABC Trade"'
      ]
    }
  ],
  
  // Additional metadata requirements
  metadataRequirements: {
    perInvoice: [
      'invoice_id (unique identifier)',
      'supplier_id (ground truth supplier)',
      'supplier_name_variations (all known name variations)',
      'invoice_date',
      'total_amount',
      'currency',
      'line_items_count',
      'template_type',
      'ocr_confidence_score',
      'scan_quality_score',
      'language_detected',
      'is_rtl',
      'page_count',
      'ground_truth_match_status (correct/wrong/partial)'
    ],
    perSupplier: [
      'supplier_id',
      'legal_name',
      'trade_names[]',
      'active_periods',
      'typical_template_types',
      'known_similar_suppliers[]'
    ]
  },
  
  // Validation checks before accepting dataset
  validationChecks: [
    {
      check: 'minimum_size_met',
      description: 'Dataset meets minimum size requirements',
      severity: 'CRITICAL'
    },
    {
      check: 'distribution_coverage',
      description: 'All categories meet minimum percentage thresholds',
      severity: 'CRITICAL'
    },
    {
      check: 'no_single_supplier_dominance',
      description: 'No single supplier >10% of total invoices',
      severity: 'WARNING'
    },
    {
      check: 'temporal_distribution',
      description: 'Invoices distributed across required date range',
      severity: 'WARNING'
    },
    {
      check: 'ground_truth_completeness',
      description: 'All required metadata fields populated',
      severity: 'CRITICAL'
    }
  ]
};

// ============================================================================
// SECTION 2: BENCHMARK MANIFEST TEMPLATE (Reproducibility)
// ============================================================================

class BenchmarkManifestBuilder {
  constructor() {
    this.manifest = {
      protocol_version: null,
      manifest_version: '1.0.0',
      created_at: null,
      created_by: null,
      
      // Dataset info
      dataset: {
        version: null,
        source: null,
        total_invoices: null,
        date_range: { start: null, end: null },
        languages: [],
        has_rtl: null,
        distribution: {}
      },
      
      // Technical environment
      environment: {
        ocr_engine: null,
        ocr_version: null,
        node_version: null,
        os: null,
        cpu_info: null,
        memory_gb: null
      },
      
      // Model/config info
      configuration: {
        seed: null,
        thresholds: {},
        model_versions: {}
      },
      
      // Code identity
      code_identity: {
        commit_hash: null,
        branch: null,
        build_number: null,
        build_timestamp: null
      },
      
      // Results reference
      results: {
        report_path: null,
        gate_verdicts: {},
        generated_at: null
      }
    };
  }

  /**
   * Create a new manifest for a benchmark run
   */
  createManifest(config = {}) {
    const now = new Date();
    
    this.manifest = {
      ...this.manifest,
      
      protocol_version: config.protocolVersion || '1.0.0',
      manifest_version: '1.0.0',
      created_at: now.toISOString(),
      created_by: config.createdBy || process.env.USER || 'unknown',
      
      dataset: {
        version: config.datasetVersion || 'golden-v1',
        source: config.datasetSource || 'PRODUCTION_EXPORT',
        total_invoices: config.totalInvoices || null,
        date_range: config.dateRange || { start: null, end: null },
        languages: config.languages || ['ar', 'en'],
        has_rtl: config.hasRtl != null ? config.hasRtl : true,
        distribution: config.distribution || {}
      },
      
      environment: {
        ocr_engine: config.ocrEngine || 'tesseract',
        ocr_version: config.ocrVersion || '5.4.0',
        node_version: process.version,
        os: `${process.platform}-${process.arch}`,
        cpu_info: config.cpuInfo || null,
        memory_gb: config.memoryGb || null
      },
      
      configuration: {
        seed: config.seed || 12345,
        thresholds: config.thresholds || {
          supplier_gate: 0.80,
          semantic_similarity: 0.72,
          pattern_match: 0.85,
          fmr_threshold: 0.005
        },
        model_versions: config.modelVersions || {
          embedding_model: 'text-embedding-v1',
          classifier_model: 'invoice-classifier-v2'
        }
      },
      
      code_identity: {
        commit_hash: config.commitHash || this._getGitCommit(),
        branch: config.branch || this._getGitBranch(),
        build_number: config.buildNumber || `build-${now.getTime()}`,
        build_timestamp: now.toISOString()
      },
      
      results: {
        report_path: null,  // To be filled after run
        gate_verdicts: {},  // To be filled after run
        generated_at: null  // To be filled after run
      }
    };

    return this.manifest;
  }

  /**
   * Update results section after benchmark completes
   */
  updateResults(results) {
    this.manifest.results = {
      report_path: results.reportPath || null,
      gate_verdicts: {
        gate0_measurementValidity: results.gate0 || 'NOT_EXECUTED',
        gate1_independentImprovement: results.gate1 || 'NOT_EXECUTED',
        gate15_robustness: results.gate15 || 'NOT_EXECUTED',
        gate2_realWorld: results.gate2 || 'NOT_EXECUTED'
      },
      generated_at: new Date().toISOString()
    };

    return this.manifest;
  }

  /**
   * Validate manifest completeness
   */
  validate() {
    const required = [
      'protocol_version',
      'dataset.version',
      'dataset.source',
      'dataset.total_invoices',
      'environment.ocr_engine',
      'configuration.seed',
      'code_identity.commit_hash'
    ];

    const missing = [];
    for (const field of required) {
      const value = field.split('.').reduce((obj, key) => obj?.[key], this.manifest);
      if (!value) {
        missing.push(field);
      }
    }

    return {
      isValid: missing.length === 0,
      missingFields: missing,
      message: missing.length === 0 
        ? 'Manifest is complete and valid for reproduction' 
        : `Missing ${missing.length} required fields: ${missing.join(', ')}`
    };
  }

  /**
   * Export manifest as JSON string
   */
  exportJSON(pretty = true) {
    return pretty 
      ? JSON.stringify(this.manifest, null, 2)
      : JSON.stringify(this.manifest);
  }

  /**
   * Generate human-readable summary
   */
  generateSummary() {
    const m = this.manifest;
    return `
╔══════════════════════════════════════════════════════════════════╗
║              BENCHMARK MANIFEST - REPRODUCTION GUIDE             ║
╠══════════════════════════════════════════════════════════════════╣
║ Protocol Version:  ${m.protocol_version?.padEnd(42)} ║
║ Dataset Version:   ${m.dataset?.version?.padEnd(42)} ║
║ Created:           ${m.created_at?.substring(0, 19)?.padEnd(42)} ║
╠══════════════════════════════════════════════════════════════════╣
║ ENVIRONMENT                                                        ║
║   OCR Engine:  ${m.environment?.ocr_engine?.padEnd(44)} ║
║   Node:       ${m.environment?.node_version?.padEnd(44)} ║
║   OS:         ${m.environment?.os?.padEnd(44)} ║
╠══════════════════════════════════════════════════════════════════╣
║ CONFIGURATION                                                      ║
║   Seed:       ${String(m.configuration?.seed)?.padEnd(44)} ║
║   Commit:     ${m.code_identity?.commit_hash?.padEnd(44)} ║
║   Build:      ${m.code_identity?.build_number?.padEnd(44)} ║
╚══════════════════════════════════════════════════════════════════╝

To reproduce this benchmark run:
1. Checkout commit: ${m.code_identity?.commit_hash || 'UNKNOWN'}
2. Use dataset: ${m.dataset?.version || 'UNKNOWN'}
3. Set seed: ${m.configuration?.seed || 'UNKNOWN'}
4. Run: node scripts/invoice-brain-gate15-robustness.js
`.trim();
  }

  // Helper methods
  _getGitCommit() {
    try {
      const { execSync } = require('child_process');
      return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim().substring(0, 8);
    } catch {
      return 'LOCAL-NO-GIT';
    }
  }

  _getGitBranch() {
    try {
      const { execSync } = require('child_process');
      return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    } catch {
      return 'unknown';
    }
  }
}

// ============================================================================
// SECTION 3: DATASET VALIDATOR
// ============================================================================

class GoldenDatasetValidator {
  constructor(spec = GOLDEN_DATASET_SPEC) {
    this.spec = spec;
  }

  /**
   * Validate a candidate golden dataset against the spec
   */
  validateDataset(datasetInfo) {
    const results = {
      isValid: true,
      checks: [],
      distributionGaps: [],
      warnings: []
    };

    // Check minimum size
    results.checks.push(this._checkSize(datasetInfo));
    
    // Check distribution coverage
    const distCheck = this._checkDistribution(datasetInfo);
    results.checks.push(distCheck);
    results.distributionGaps = distCheck.gaps || [];

    // Check temporal distribution
    results.checks.push(this._checkTemporalDistribution(datasetInfo));

    // Check ground truth completeness
    results.checks.push(this._checkMetadataCompleteness(datasetInfo));

    // Overall validity
    results.isValid = results.checks.every(c => c.passed || c.severity !== 'CRITICAL');

    return results;
  }

  _checkSize(dataset) {
    const minSize = this.spec.minimumSize;
    const actual = {
      totalInvoices: dataset.totalInvoices || 0,
      uniqueSuppliers: dataset.uniqueSuppliers || 0,
      uniqueTemplates: dataset.uniqueTemplates || 0
    };

    const passed = actual.totalInvoices >= minSize.totalInvoices &&
                   actual.uniqueSuppliers >= minSize.uniqueSuppliers &&
                   actual.uniqueTemplates >= minSize.uniqueTemplates;

    return {
      check: 'minimum_size_met',
      passed,
      severity: 'CRITICAL',
      details: { required: minSize, actual },
      message: passed 
        ? 'Dataset meets minimum size requirements'
        : `Too small: need ≥${minSize.totalInvoices} invoices, have ${actual.totalInvoices}`
    };
  }

  _checkDistribution(dataset) {
    const dist = dataset.distribution || {};
    const gaps = [];
    let allMet = true;

    for (const req of this.spec.requiredDistribution) {
      const actual = dist[req.category] || 0;
      
      if (actual < req.minimumPercentage) {
        allMet = false;
        gaps.push({
          category: req.category,
          name: req.name,
          required: req.minimumPercentage,
          actual,
          deficit: req.minimumPercentage - actual
        });
      }
    }

    return {
      check: 'distribution_coverage',
      passed: allMet,
      severity: 'CRITICAL',
      gaps,
      message: allMet 
        ? 'All distribution categories meet minimum thresholds'
        : `${gaps.length} categories below minimum threshold`
    };
  }

  _checkTemporalDistribution(dataset) {
    const range = dataset.dateRange || {};
    const months = this._monthDiff(range.start, range.end);
    const required = this.spec.minimumSize.dateRangeMonths;

    return {
      check: 'temporal_distribution',
      passed: months >= required,
      severity: 'WARNING',
      details: { monthsInRange: months, requiredMonths: required },
      message: months >= required
        ? `Data spans ${months} months (≥${required} required)`
        : `Data only spans ${months} months (need ≥${required})`
    };
  }

  _checkMetadataCompleteness(dataset) {
    const required = this.spec.metadataRequirements.perInvoice;
    const sample = dataset.sampleInvoice || {};
    const missing = required.filter(field => !(field.split(' ')[0] in sample));

    return {
      check: 'ground_truth_completeness',
      passed: missing.length === 0,
      severity: 'CRITICAL',
      missingFields: missing,
      message: missing.length === 0
        ? 'All required metadata fields present'
        : `Missing ${missing.length} fields: ${missing.join(', ')}`
    };
  }

  _monthDiff(start, end) {
    if (!start || !end) return 0;
    const s = new Date(start);
    const e = new Date(end);
    return Math.max(0, (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()));
  }
}

// Export for use
export {
  GOLDEN_DATASET_SPEC,
  BenchmarkManifestBuilder,
  GoldenDatasetValidator
};

// Also export for direct use
if (typeof globalThis !== 'undefined') {
  globalThis.GOLDEN_DATASET_SPEC = GOLDEN_DATASET_SPEC;
  globalThis.BenchmarkManifestBuilder = BenchmarkManifestBuilder;
  globalThis.GoldenDatasetValidator = GoldenDatasetValidator;
}
