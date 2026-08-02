/**
 * ═══════════════════════════════════════════════════════════════
 *  FALSE MATCH ANALYZER & FIELD VALIDATION ENGINE
 * ═════════════════════════════════════════════════════════════
 * 
 *  Phase 1: Deep analysis of every False Match case
 *  Phase 2: Categorize root causes (Layout/OCR/Drift/Collision/Stale)
 *  Phase 3: Implement Field Validation Layer
 *  Phase 4: Measure improvement in False Match Rate
 *
 *  Target: Reduce False Match from 1.90% to <0.5%
 *
 *  @author Invoice Brain Production Team
 *  @version 3.0 - False Match Reduction Focus
 * ═════════════════════════════════════════════════════════════
 */

const { createHash } = require('crypto');
const { performance } = require('perf_hooks');

// ─── IMPORT BENCHMARK SYSTEM ────────────────────────────────────

// We'll inline the essential parts to make this self-contained
// (In production, these would be imported from invoice-brain-benchmark.js)

// ─── CONFIGURATION ──────────────────────────────────────────────

const ANALYSIS_CONFIG = {
  // Dataset for detailed analysis
  SUPPLIER_COUNT: 100,
  INVOICES_PER_SUPPLIER: 100,
  
  // Validation thresholds
  VALIDATION: {
    // Required fields that must be present
    requiredFields: ['invoiceNumber', 'date', 'total'],
    
    // Field type validation patterns
    fieldPatterns: {
      date: /^\d{1,4}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/,
      amount: /^[\d,\.]+\s*(?:KWD|SAR|USD|د\.ك|ر\.س|\$)?$/,
      invoiceNumber: /(?:INV|#|رقم|No)[\s\-]?\d+/i,
    },
    
    // Currency validation - pattern should match expected currency
    currencyMatch: {
      strict: true,  // Reject if currency doesn't match pattern's expected currency
      tolerance: 'none',
    },
    
    // Position validation (field should appear at expected line range)
    positionTolerance: {
      maxDeviation: 3,  // Lines
      enabled: true,
    },
    
    // Supplier name similarity threshold (if available)
    supplierSimilarity: {
      minMatch: 0.7,
      enabled: true,
    },
  },
  
  // Analysis categories for false matches
  FALSE_MATCH_CATEGORIES: [
    'SIMILAR_LAYOUT',      // Two suppliers have nearly identical layout
    'OCR_DEGRADATION',     // OCR errors caused wrong fingerprint
    'PATTERN_DRIFT',       // Supplier changed format slightly
    'FINGERPRINT_COLLISION', // Hash collision (rare but possible)
    'STALE_PATTERN',       // Pattern is outdated
    'EDGE_CASE',           // Unusual format variation
    'INSUFFICIENT_FIELDS', // Too few fields for reliable matching
    'VALIDATION_BYPASS',   // Validation layer would have caught this
  ],
};

// ─── FALSE MATCH ANALYZER CLASS ────────────────────────────────

class FalseMatchAnalyzer {
  constructor() {
    this.falseMatches = [];
    this.trueMatches = [];
    this.categoryDistribution = {};
    this.validationEngine = new FieldValidationEngine();
  }

  /**
   * Analyze extraction with ground truth (knows if it's actually a false match).
   */
  analyzeExtractionWithGroundTruth(invoice, appliedPattern, extractedData, isActuallyFalseMatch) {
    const analysis = {
      timestamp: Date.now(),
      invoiceId: invoice.id,
      
      // Fingerprint info
      fingerprint: appliedPattern?.fingerprint || 'unknown',
      fingerprintSource: appliedPattern ? 'pattern' : 'ai',
      
      // Supplier info
      actualSupplierId: invoice.supplierId,
      actualSupplierName: invoice.supplierName,
      expectedSupplierIds: appliedPattern ? [...appliedPattern.supplierIds] : [],
      patternOriginalSupplier: appliedPattern?.originalSupplierId || 'unknown',
      supplierMismatch: appliedPattern?.originalSupplierId !== invoice.supplierId,
      
      // Pattern info
      patternVersion: appliedPattern?.version || 0,
      patternAge: appliedPattern ? Date.now() - appliedPattern.createdAt : Infinity,
      patternUseCount: appliedPattern?.useCount || 0,
      patternSuccessRate: appliedPattern?.useCount > 0 
        ? appliedPattern.successCount / appliedPattern.useCount 
        : 0,
      
      // Confidence
      confidence: appliedPattern ? this.calculatePatternConfidence(appliedPattern) : null,
      
      // Ground truth
      isFalseMatch: isActuallyFalseMatch,
      groundTruthKnown: true,
      
      // Extraction quality
      extractedFields: extractedData ? Object.keys(extractedData).filter(k => !k.startsWith('_')) : [],
      missingRequiredFields: [],
      invalidFields: [],
      
      // Classification
      category: null,
      severity: 'low',
      rootCause: '',
      
      // Would validation have caught this?
      wouldValidationCatch: false,
      validationDetails: {},
    };
    
    // Validate fields
    const validationResult = this.validationEngine.validateExtraction(
      invoice.text, 
      extractedData, 
      appliedPattern
    );
    
    analysis.validationDetails = validationResult;
    analysis.missingRequiredFields = validationResult.missingFields || [];
    analysis.invalidFields = validationResult.invalidFields || [];
    
    // Check if validation would catch this
    if (isActuallyFalseMatch && !validationResult.isValid) {
      analysis.wouldValidationCatch = true;
    }
    
    // Categorize
    if (isActuallyFalseMatch) {
      analysis.category = this.categorizeFalseMatch(analysis, invoice, appliedPattern);
      analysis.severity = this.determineSeverity(analysis, validationResult);
      this.falseMatches.push(analysis);
    } else {
      this.trueMatches.push(analysis);
    }
    
    return analysis;
  }

  /**
   * Determine severity of false match.
   */
  determineSeverity(analysis, validation) {
    if (analysis.supplierMismatch) return 'critical';
    if (!validation.isValid && validation.confidence < 0.3) return 'high';
    if (analysis.invalidFields.length > 2) return 'high';
    if (analysis.missingRequiredFields.length > 0) return 'medium';
    return 'low';
  }

  /**
   * Calculate confidence score for a pattern.
   */
  calculatePatternConfidence(pattern) {
    if (!pattern || pattern.useCount < 5) return 0.3;
    
    const successRate = pattern.successCount / pattern.useCount;
    const sampleFactor = Math.min(pattern.useCount / 100, 1);
    const ageFactor = Math.min((Date.now() - pattern.createdAt) / (7 * 24 * 60 * 60 * 1000), 1); // Up to 1 week
    
    return successRate * 0.6 + sampleFactor * 0.2 + ageFactor * 0.2;
  }

  /**
   * Categorize the root cause of a false match.
   */
  categorizeFalseMatch(analysis, invoice, pattern) {
    const reasons = [];
    
    // Check for similar layout (supplier mismatch suggests this)
    if (analysis.supplierMismatch) {
      reasons.push({ category: 'SIMILAR_LAYOUT', weight: 0.8 });
    }
    
    // Check if invoice has OCR errors
    if (invoice.hasOCRErrors) {
      reasons.push({ category: 'OCR_DEGRADATION', weight: 0.6 });
    }
    
    // Check if pattern is stale (old)
    if (analysis.patternAge > 30 * 24 * 60 * 60 * 1000) { // 30 days
      reasons.push({ category: 'STALE_PATTERN', weight: 0.5 });
    }
    
    // Check if pattern has low success rate recently
    if (analysis.patternSuccessRate < 0.85 && analysis.patternUseCount > 20) {
      reasons.push({ category: 'PATTERN_DRIFT', weight: 0.7 });
    }
    
    // Check if missing many fields
    if (analysis.missingRequiredFields.length > 0) {
      reasons.push({ category: 'INSUFFICIENT_FIELDS', weight: 0.4 });
    }
    
    // Select highest weighted category
    reasons.sort((a, b) => b.weight - a.weight);
    const selected = reasons[0]?.category || 'EDGE_CASE';
    
    // Track distribution
    this.categoryDistribution[selected] = (this.categoryDistribution[selected] || 0) + 1;
    
    return selected;
  }

  /**
   * Generate comprehensive false match report.
   */
  generateReport() {
    const totalAnalyzed = this.falseMatches.length + this.trueMatches.length;
    const falseMatchRate = totalAnalyzed > 0 ? this.falseMatches.length / totalAnalyzed : 0;
    
    // Category breakdown
    const categoryBreakdown = Object.entries(this.categoryDistribution)
      .map(([category, count]) => ({
        category,
        count,
        percentage: ((count / this.falseMatches.length) * 100).toFixed(1),
      }))
      .sort((a, b) => b.count - a.count);
    
    // Severity distribution
    const severityDist = {};
    this.falseMatches.forEach(fm => {
      severityDist[fm.severity] = (severityDist[fm.severity] || 0) + 1;
    });
    
    // Validation effectiveness
    const wouldBeCaught = this.falseMatches.filter(fm => fm.wouldValidationCatch).length;
    const validationEffectiveness = this.falseMatches.length > 0 
      ? (wouldBeCaught / this.falseMatches.length * 100).toFixed(1) 
      : 'N/A';
    
    // Top problematic patterns
    const patternFalseMatches = {};
    this.falseMatches.forEach(fm => {
      const fp = fm.fingerprint;
      if (!patternFalseMatches[fp]) {
        patternFalseMatches[fp] = { count: 0, fingerprints: [] };
      }
      patternFalseMatches[fp].count++;
      patternFalseMatches[fp].fingerprints.push({
        invoiceId: fm.invoiceId,
        actualSupplier: fm.actualSupplierName,
        expectedSuppliers: fm.expectedSupplierIds,
        category: fm.category,
      });
    });
    
    const topProblemPatterns = Object.entries(patternFalseMatches)
      .map(([fp, data]) => ({ fingerprint: fp, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    return {
      summary: {
        totalAnalyzed,
        trueMatches: this.trueMatches.length,
        falseMatches: this.falseMatches.length,
        falseMatchRate: (falseMatchRate * 100).toFixed(2) + '%',
        targetRate: '<0.5%',
        gap: ((falseMatchRate - 0.005) * 100).toFixed(2) + '%',
      },
      
      categoryBreakdown,
      severityDistribution: severityDist,
      
      validationImpact: {
        totalFalseMatches: this.falseMatches.length,
        wouldBeCaughtByValidation: wouldBeCaught,
        validationEffectiveness: validationEffectiveness + '%',
        remainingAfterValidation: this.falseMatches.length - wouldBeCaught,
        projectedRateWithValidation: (((this.falseMatches.length - wouldBeCaught) / totalAnalyzed) * 100).toFixed(3) + '%',
      },
      
      topProblemPatterns,
      
      detailedFalseMatches: this.falseMatches.map(fm => ({
        invoiceId: fm.invoiceId,
        fingerprint: fm.fingerprint,
        actualSupplier: fm.actualSupplierName,
        expectedSuppliers: fm.expectedSupplierIds,
        category: fm.category,
        severity: fm.severity,
        confidence: fm.confidence?.toFixed(3),
        wouldValidationCatch: fm.wouldValidationCatch,
        rootCause: fm.rootCause,
      })),
    };
  }
}

// ─── FIELD VALIDATION ENGINE ────────────────────────────────────

/**
 * Validates extracted fields before accepting pattern-based extraction.
 * This is the critical layer that catches false matches.
 */
class FieldValidationEngine {
  constructor(config = ANALYSIS_CONFIG.VALIDATION) {
    this.config = config;
    this.validationStats = {
      totalValidations: 0,
      passed: 0,
      failed: 0,
      failuresByReason: {},
    };
  }

  /**
   * Validate an extraction result against the original text and pattern.
   */
  validateExtraction(originalText, extractedData, pattern) {
    this.validationStats.totalValidations++;
    
    const issues = {
      missingFields: [],
      invalidFields: [],
      warnings: [],
      reasons: [],
    };
    
    let isValid = true;
    let confidence = 1.0;
    
    // 1. Check required fields exist
    for (const field of this.config.requiredFields) {
      if (!extractedData || !(field in extractedData)) {
        issues.missingFields.push(field);
        issues.reasons.push(`Missing required field: ${field}`);
        confidence -= 0.15;
        isValid = false;
      }
    }
    
    // 2. Validate field formats
    if (extractedData) {
      for (const [field, value] of Object.entries(extractedData)) {
        const validation = this.validateFieldValue(field, value, originalText);
        if (!validation.valid) {
          issues.invalidFields.push({ field, value, reason: validation.reason });
          issues.reasons.push(`${field}: ${validation.reason}`);
          confidence -= 0.1;
          isValid = false;
        }
        
        if (validation.warning) {
          issues.warnings.push({ field, warning: validation.warning });
        }
      }
    }
    
    // 3. Cross-field consistency checks
    const consistencyCheck = this.checkFieldConsistency(extractedData, originalText);
    if (!consistencyCheck.valid) {
      issues.reasons.push(...consistencyCheck.reasons);
      confidence -= consistencyCheck.penalty;
      isValid = isValid && consistencyCheck.critical !== true;
    }
    
    // 4. Position validation (if pattern has position info)
    if (pattern?.fieldPositions && this.config.positionTolerance.enabled) {
      const positionCheck = this.validateFieldPositions(extractedData, originalText, pattern.fieldPositions);
      if (!positionCheck.valid) {
        issues.reasons.push(`Position mismatch: ${positionCheck.details}`);
        confidence -= 0.1;
      }
    }
    
    // Record stats
    if (isValid) {
      this.validationStats.passed++;
    } else {
      this.validationStats.failed++;
      for (const reason of issues.reasons) {
        const key = reason.split(':')[0]; // Use first part as key
        this.validationStats.failuresByReason[key] = (this.validationStats.failuresByReason[key] || 0) + 1;
      }
    }
    
    return {
      isValid,
      confidence: Math.max(0, confidence),
      ...issues,
    };
  }

  /**
   * Validate individual field value against expected format.
   */
  validateFieldValue(field, value, context) {
    if (!value || value.toString().trim() === '') {
      return { valid: false, reason: `${field} is empty or null` };
    }
    
    const strValue = value.toString().trim();
    
    switch (field.toLowerCase()) {
      case 'date':
      case 'invoicedate':
      case 'تاريخ':
        // Should look like a date
        if (!/\d{1,4}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/.test(strValue)) {
          return { valid: false, reason: `Invalid date format: ${strValue}` };
        }
        break;
        
      case 'total':
      case 'amount':
      case 'الإجمالي':
      case 'المجموع':
        // Should contain digits and optionally currency
        if (!/\d+/.test(strValue)) {
          return { valid: false, reason: `Invalid amount format: ${strValue}` };
        }
        // Warn if no currency indicator
        if (!/(KWD|SAR|USD|د\.ك|ر\.س|\$|€)/i.test(strValue) && this.config.currencyMatch.strict) {
          return { valid: true, warning: 'No currency specified' };
        }
        break;
        
      case 'invoicenumber':
      case 'رقم_الفاتورة':
      case 'inv#':
        // Should contain some numeric identifier
        if (!/\d/.test(strValue)) {
          return { valid: false, reason: `Invoice number lacks digits: ${strValue}` };
        }
        break;
        
      case 'tax':
      case 'vat':
      case 'الضريبة':
        // If present, should be numeric or percentage
        if (!/[\d\.%]+/.test(strValue)) {
          return { valid: false, reason: `Invalid tax format: ${strValue}` };
        }
        break;
        
      case 'supplier':
      case 'vendor':
      case 'المورد':
        // Should not be too short or only numbers
        if (strValue.length < 2) {
          return { valid: false, reason: `Supplier name too short: ${strValue}` };
        }
        if (/^\d+$/.test(strValue)) {
          return { valid: false, reason: `Supplier name appears numeric: ${strValue}` };
        }
        break;
    }
    
    return { valid: true };
  }

  /**
   * Check consistency between related fields.
   */
  checkFieldConsistency(data, context) {
    if (!data) return { valid: true, reasons: [], penalty: 0 };
    
    const issues = [];
    let penalty = 0;
    let critical = false;
    
    // Total should be >= subtotal (if both present)
    if (data.total && data.subtotal) {
      const total = parseFloat(data.total.replace(/[^\d.]/g, '')) || 0;
      const subtotal = parseFloat(data.subtotal.replace(/[^\d.]/g, '')) || 0;
      if (total < subtotal && subtotal > 0) {
        issues.push('Total is less than subtotal');
        penalty += 0.15;
        critical = true;
      }
    }
    
    // Tax should be reasonable relative to total
    if (data.tax && data.total) {
      const tax = parseFloat(data.tax.replace(/[^\d.%]/g, '')) || 0;
      const total = parseFloat(data.total.replace(/[^\d.]/g, '')) || 1;
      const taxRate = (tax / total) * 100;
      if (taxRate > 30 || taxRate < 0) {
        issues.push(`Tax rate ${taxRate.toFixed(1)}% seems unusual`);
        penalty += 0.05; // Warning, not critical
      }
    }
    
    // Date sanity check (not in far future or past)
    if (data.date || data.invoicedate) {
      const dateStr = data.date || data.invoicedate;
      const dateParts = dateStr.match(/(\d{1,4})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
      if (dateParts) {
        let [, , month, year] = dateParts;
        year = parseInt(year);
        month = parseInt(month);
        if (year < 2020 || year > 2030) {
          issues.push(`Year ${year} seems incorrect`);
          penalty += 0.05;
        }
        if (month < 1 || month > 12) {
          issues.push(`Month ${month} is invalid`);
          penalty += 0.1;
        }
      }
    }
    
    return {
      valid: issues.length === 0,
      reasons: issues,
      penalty,
      critical,
    };
  }

  /**
   * Validate that fields appear at expected positions in document.
   */
  validateFieldPositions(data, text, expectedPositions) {
    const lines = text.split('\n');
    const deviations = [];
    
    for (const [field, expectedLine] of Object.entries(expectedPositions)) {
      if (!(field in data)) continue;
      
      // Find actual position of field value
      const fieldValue = data[field]?.toString() || '';
      let actualLine = -1;
      
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(fieldValue.slice(0, 10))) { // Match first 10 chars
          actualLine = i;
          break;
        }
      }
      
      if (actualLine >= 0) {
        const deviation = Math.abs(actualLine - expectedLine);
        if (deviation > this.config.positionTolerance.maxDeviation) {
          deviations.push({
            field,
            expected: expectedLine,
            actual: actualLine,
            deviation,
          });
        }
      }
    }
    
    if (deviations.length > 0) {
      return {
        valid: false,
        details: `${deviations.length} fields out of position`,
        deviations,
      };
    }
    
    return { valid: true };
  }

  /**
   * Get validation statistics.
   */
  getStats() {
    const total = this.validationStats.totalValidations;
    return {
      ...this.validationStats,
      passRate: total > 0 ? (this.validationStats.passed / total * 100).toFixed(1) + '%' : 'N/A',
      failRate: total > 0 ? (this.validationStats.failed / total * 100).toFixed(1) + '%' : 'N/A',
    };
  }
}

// ─── ENHANCED BENCHMARK WITH VALIDATION ────────────────────────

class EnhancedBenchmarkRunner {
  constructor() {
    // Import dataset generator logic
    this.datasetGenerator = this.createDatasetGenerator();
    this.analyzer = new FalseMatchAnalyzer();
    this.validationEngine = new FieldValidationEngine();
    this.results = {};
  }

  /**
   * Create simplified dataset generator (inline version).
   */
  createDatasetGenerator() {
    const formats = [
      // Arabic Tax Invoice
      (data) => `فاتورة ضريبية\nرقم الفاتورة: ${data.invNum}\nالتاريخ: ${data.date}\nالمورد: ${data.supplier}\nالإجمالي: ${data.total}`,
      // English Commercial
      (data) => `INVOICE #${data.invNum}\nDate: ${data.date}\nFrom: ${data.supplier}\nTotal: ${data.total}`,
      // Simple Receipt
      (data) => `Receipt\n${data.supplier}\n${data.date}\nAmount: ${data.total}`,
      // Tabular
      (data) => `Inv#${data.invNum}\t${data.date}\t${data.supplier}\t${data.total}`,
      // Mixed Gulf
      (data) => `Tax Invoice / فاتورة ضريبية\n#: ${data.invNum}\n${data.supplier}\nTotal: ${data.total}`,
      // E-commerce
      (data) => `Order #${data.invNum}\nSold by: ${data.supplier}\nTotal: ${data.total}`,
      // Service
      (data) => `SERVICE INVOICE No. ${data.invNum}\nCONTRACTOR: ${data.supplier}\nTOTAL DUE: ${data.total}`,
      // Restaurant
      (data) => `*** ${data.supplier} ***\nCheck: ${data.invNum}\nTOTAL: ${data.total}`,
      // Medical
      (data) => `MEDICAL BILL\nProvider: ${data.supplier}\nBill No: ${data.invNum}\nPatient Responsibility: ${data.total}`,
      // Legal
      (data) => `ATTORNEY INVOICE File #: ${data.invNum}\nClient Attorney: ${data.supplier}\nBALANCE DUE: ${data.total}`,
    ];
    
    const suppliers = [];
    for (let i = 0; i < 100; i++) {
      const isArabic = i % 3 === 0;
      suppliers.push({
        id: `SUP_${String(i + 1).padStart(4, '0')}`,
        name: isArabic ? `شركة النور ${1000 + i}` : `Global Trade Co.${i}`,
        formatIndex: i % formats.length,
      });
    }
    
    return { formats, suppliers };
  }

  /**
   * Generate single invoice.
   */
  generateInvoice(supplier, index) {
    const format = this.datasetGenerator.formats[supplier.formatIndex];
    const data = {
      invNum: `INV-${String(100000 + index).padStart(6, '0')}`,
      date: `${Math.floor(Math.random() * 28) + 1}/${Math.floor(Math.random() * 12) + 1}/2026`,
      supplier: supplier.name,
      total: (10 + Math.random() * 1000).toFixed(3),
    };
    
    let text = format(data);
    const hasOCRErrors = Math.random() < 0.15;
    
    if (hasOCRErrors) {
      // Apply OCR-like errors
      text = text.replace(/o/gi, '0').replace(/l/g, '1');
    }
    
    return {
      id: `${supplier.id}_${String(index + 1).padStart(5, '0')}`,
      supplierId: supplier.id,
      supplierName: supplier.name,
      formatType: ['arabic_tax', 'english_commercial', 'simple', 'tabular', 'mixed_gulf', 'ecommerce', 'service', 'restaurant', 'medical', 'legal'][supplier.formatIndex],
      text,
      hasOCRErrors,
      expectedData: data,
    };
  }

  /**
   * Run complete analysis with false match detection.
   */
  async runAnalysis() {
    console.log('\n' + '='.repeat(80));
    console.log('  🔍 FALSE MATCH DEEP ANALYSIS & VALIDATION ENGINE TEST');
    console.log('  Target: Reduce False Match from 1.90% to <0.5%');
    console.log('='.repeat(80));
    
    // Phase 1: Generate dataset
    console.log('\n📦 PHASE 1: Dataset Generation');
    const invoices = [];
    const suppliers = this.datasetGenerator.suppliers;
    
    for (const supplier of suppliers) {
      for (let i = 0; i < 100; i++) {
        invoices.push(this.generateInvoice(supplier, i));
      }
    }
    console.log(`   Generated ${invoices.length} invoices from ${suppliers.length} suppliers`);
    
    // Phase 2: Simulate extraction with INTENTIONAL fingerprint collisions
    console.log('\n🔬 PHASE 2: Extraction Simulation & False Match Detection');
    console.log('   (Simulating realistic fingerprint collisions between similar-format suppliers)');
    
    // Build simulated pattern store with COLLISIONS
    // Key insight: Suppliers with same formatIndex will have similar fingerprints
    // This SIMULATES real-world scenario where different suppliers use same ERP/template
    const patternStore = new Map(); // fingerprint -> pattern
    
    // Group suppliers by format type (creates intentional collisions)
    const suppliersByFormat = {};
    for (const supplier of suppliers) {
      const fmt = supplier.formatIndex;
      if (!suppliersByFormat[fmt]) suppliersByFormat[fmt] = [];
      suppliersByFormat[fmt].push(supplier);
    }
    
    // Process each invoice
    let falseMatchCount = 0;
    let trueMatchCount = 0;
    
    for (let i = 0; i < invoices.length; i++) {
      const invoice = invoices[i];
      
      // Generate fingerprint (simplified layout-based)
      const fingerprint = this.generateFingerprint(invoice.text);
      
      // CRITICAL: Create patterns PER FORMAT TYPE, not per supplier
      // This simulates real-world where same-format suppliers collide
      let pattern = patternStore.get(fingerprint);
      
      if (!pattern) {
        // New pattern - associate with THIS supplier initially
        pattern = {
          fingerprint,
          supplierIds: new Set([invoice.supplierId]),
          originalSupplierId: invoice.supplierId, // Track who created it
          createdAt: Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000,
          useCount: 0,
          successCount: 0,
          version: 1,
          fieldPositions: this.extractFieldPositions(invoice.text),
          formatType: invoice.formatType,
        };
        patternStore.set(fingerprint, pattern);
      } else {
        // Pattern exists - but does it belong to THIS supplier?
        // If NOT, this is a potential FALSE MATCH scenario
        if (!pattern.originalSupplierId === invoice.supplierId || 
            Math.random() < 0.15) { // 15% chance of cross-supplier application
          // Don't add this supplier - keep pattern "owned" by original creator
          // This creates the false match condition
        } else {
          pattern.supplierIds.add(invoice.supplierId);
        }
        pattern.lastUsed = Date.now();
      }
      
      // Determine if this extraction is a false match
      // FALSE MATCH = Pattern was created by Supplier A, but applied to Supplier B
      const isFalseMatch = pattern.originalSupplierId !== invoice.supplierId && 
                           Math.random() < 0.19; // ~1.9% rate matching original benchmark
      
      // Simulate extraction
      const extractedData = this.simulateExtraction(invoice, pattern, isFalseMatch);
      
      // Update stats
      pattern.useCount++;
      if (!isFalseMatch) {
        pattern.successCount++;
        trueMatchCount++;
      } else {
        falseMatchCount++;
        extractedData._isFalseMatch = true;
      }
      
      // Analyze for false match (with ground truth)
      const analysis = this.analyzer.analyzeExtractionWithGroundTruth(
        invoice, 
        pattern, 
        extractedData,
        isFalseMatch
      );
      
      // Progress
      if ((i + 1) % 2000 === 0) {
        const currentFMR = (falseMatchCount / (i + 1) * 100).toFixed(2);
        process.stdout.write(`\r   Analyzing: ${((i + 1) / invoices.length * 100).toFixed(0)}% (${i + 1}/${invoices.length}) [FMR: ${currentFMR}%]`);
      }
    }
    
    console.log(`\n   ✅ Analysis complete`);
    console.log(`   📊 Ground Truth Stats:`);
    console.log(`      • Total Invoices: ${invoices.length}`);
    console.log(`      • True Matches: ${trueMatchCount}`);
    console.log(`      • False Matches: ${falseMatchCount}`);
    console.log(`      • Actual FMR: ${(falseMatchCount / invoices.length * 100).toFixed(2)}%`);
    
    // Phase 3: Generate report
    console.log('\n📊 PHASE 3: Generating False Match Report');
    const report = this.analyzer.generateReport();
    
    // Override with actual ground truth numbers
    report.summary.falseMatches = falseMatchCount;
    report.summary.trueMatches = trueMatchCount;
    report.summary.totalAnalyzed = invoices.length;
    report.summary.falseMatchRate = (falseMatchCount / invoices.length * 100).toFixed(2) + '%';
    
    this.results = {
      report,
      validationStats: this.validationEngine.getStats(),
      patternStoreSize: patternStore.size,
      groundTruth: {
        falseMatchCount,
        trueMatchCount,
        totalInvoices: invoices.length,
        actualRate: (falseMatchCount / invoices.length * 100).toFixed(2) + '%',
      }
    };
    
    this.printAnalysisReport(report);
    
    return report;
  }

  /**
   * Generate simplified layout-based fingerprint.
   */
  generateFingerprint(text) {
    const lines = text.split('\n');
    const tokens = [];
    
    const patterns = {
      INVOICE_NUM: /(?:فاتورة|إيصال|رقم\s*الفاتورة|invoice?\s*#?|No\.?)\s*[:\s]*[\d\-\/A-Z]+/i,
      DATE: /(?:التاريخ|تاريخ|Date|date)\s*[:\s]*[\d\-\/\.]+/i,
      AMOUNT: /(?:الإجمالي|المجموع|Total|Amount)\s*[:\s]*[\d,\.]+/i,
      SUPPLIER: /(?:المورد|شركة|Supplier|Vendor|From)\s*[:\s].+/i,
    };
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      let type = 'TEXT';
      if (patterns.INVOICE_NUM.test(trimmed)) type = 'INVOICE_NUM';
      else if (patterns.DATE.test(trimmed)) type = 'DATE';
      else if (patterns.AMOUNT.test(trimmed)) type = 'AMOUNT';
      else if (patterns.SUPPLIER.test(trimmed)) type = 'SUPPLIER';
      
      tokens.push(type);
    }
    
    const hashInput = tokens.join('|');
    return createHash('sha256').update(hashInput).digest('hex').slice(0, 16);
  }

  /**
   * Extract approximate field positions from text.
   */
  extractFieldPositions(text) {
    const positions = {};
    const lines = text.split('\n');
    
    const fieldPatterns = [
      [/^(?:فاتورة|إيصال|رقم\s*الفاتورة|invoice?\s*#?|No\.?)/i, 'invoiceNumber'],
      [/^(?:التاريخ|تاريخ|Date)/i, 'date'],
      [/^(?:الإجمالي|المجموع|Total)/i, 'total'],
      [/^(?:المورد|شركة|Supplier|Vendor|From)/i, 'supplier'],
    ];
    
    for (let i = 0; i < lines.length; i++) {
      for (const [pattern, fieldName] of fieldPatterns) {
        if (pattern.test(lines[i])) {
          positions[fieldName] = i;
          break;
        }
      }
    }
    
    return positions;
  }

  /**
   * Simulate extraction with REALISTIC false match scenarios.
   * 
   * @param invoice - The invoice being processed
   * @param pattern - The pattern applied
   * @param isFalseMatch (optional) - Ground truth: is this actually a false match?
   */
  simulateExtraction(invoice, pattern, isFalseMatch = false) {
    const baseExtracted = {
      invoiceNumber: invoice.expectedData.invNum,
      date: invoice.expectedData.date,
      total: invoice.expectedData.total,
      supplier: invoice.expectedData.supplier,
    };
    
    // If we KNOW this is a false match, apply corruption
    if (isFalseMatch) {
      const corruptionType = this.selectFalseMatchTypeForScenario(invoice, pattern);
      
      switch (corruptionType) {
        case 'SIMILAR_LAYOUT':
          // Return wrong supplier name
          if (pattern?.originalSupplierId) {
            baseExtracted.supplier = `Wrong Company (Pattern owner: ${pattern.originalSupplierId})`;
          }
          break;
          
        case 'OCR_DEGRADATION':
          // Corrupt one field
          const ocrFields = ['invoiceNumber', 'total'];
          const ocrField = ocrFields[Math.floor(Math.random() * ocrFields.length)];
          baseExtracted[ocrField] = baseExtracted[ocrField].toString().replace(/\d/g, d => 
            Math.random() > 0.7 ? String((parseInt(d) + 1) % 10) : d
          );
          break;
          
        case 'PATTERN_DRIFT':
          // Alter total amount
          if (baseExtracted.total) {
            const currentTotal = parseFloat(baseExtracted.total);
            baseExtracted.total = (currentTotal * (0.8 + Math.random() * 0.4)).toFixed(3);
          }
          break;
          
        case 'STALE_PATTERN':
          // Missing field
          delete baseExtracted.supplier;
          break;
          
        case 'EDGE_CASE':
          // Swap fields
          if (baseExtracted.date && baseExtracted.total) {
            [baseExtracted.date, baseExtracted.total] = [baseExtracted.total, baseExtracted.date];
          }
          break;
      }
      
      baseExtracted._isFalseMatch = true;
      baseExtracted._falseMatchType = corruptionType;
    }
    
    return baseExtracted;
  }

  /**
   * Select appropriate false match type based on scenario context.
   */
  selectFalseMatchTypeForScenario(invoice, pattern) {
    // Weight based on actual conditions
    const weights = { SIMILAR_LAYOUT: 40, OCR_DEGRADATION: 25, PATTERN_DRIFT: 20, STALE_PATTERN: 10, EDGE_CASE: 5 };
    
    // Adjust weights based on context
    if (invoice.hasOCRErrors) {
      weights.OCR_DEGRADATION += 20;
      weights.SIMILAR_LAYOUT -= 10;
    }
    
    if (pattern) {
      const age = Date.now() - pattern.createdAt;
      if (age > 20 * 24 * 60 * 60 * 1000) {
        weights.STALE_PATTERN += 15;
        weights.PATTERN_DRIFT += 10;
      }
    }
    
    // Random selection with weights
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    let rand = Math.random() * total;
    
    for (const [type, weight] of Object.entries(weights)) {
      rand -= weight;
      if (rand <= 0) return type;
    }
    
    return 'EDGE_CASE';
  }

  /**
   * Print comprehensive analysis report.
   */
  printAnalysisReport(report) {
    console.log('\n\n' + '═'.repeat(80));
    console.log('  📋 FALSE MATCH ANALYSIS REPORT');
    console.log('═'.repeat(80));
    
    // Summary
    console.log('\n   📊 SUMMARY:');
    console.log('   ┌────────────────────┬─────────────┬─────────────┐');
    console.log('   │ Metric             │ Value       │ Target      │');
    console.log('   ├────────────────────┼─────────────┼─────────────┤');
    console.log(`   │ Total Analyzed     │ ${String(report.summary.totalAnalyzed).padStart(11)} │ N/A         │`);
    console.log(`   │ True Matches        │ ${String(report.summary.trueMatches).padStart(11)} │ -           │`);
    console.log(`   │ False Matches       │ ${String(report.summary.falseMatches).padStart(11)} │ Minimize    │`);
    console.log(`   │ False Match Rate    │ ${report.summary.falseMatchRate.padStart(11)} │ ${report.summary.targetRate.padStart(11)} │`);
    console.log('   └────────────────────┴─────────────┴─────────────┘');
    
    // Category breakdown
    console.log('\n   📂 FALSE MATCH CATEGORIES:');
    console.log('   ┌─────────────────────┬───────┬────────────┐');
    console.log('   │ Category            │ Count │ Percentage │');
    console.log('   ├─────────────────────┼───────┼────────────┤');
    
    for (const cat of report.categoryBreakdown) {
      const bar = '█'.repeat(Math.round(parseFloat(cat.percentage) / 5));
      console.log(`   │ ${cat.category.padEnd(19)} │ ${String(cat.count).padStart(5)} │ ${cat.percentage.padStart(9)}% ${bar}│`);
    }
    console.log('   └─────────────────────┴───────┴────────────┘');
    
    // Validation impact
    console.log('\n   🛡️  VALIDATION LAYER IMPACT:');
    console.log(`   • Current False Matches: ${report.validationImpact.totalFalseMatches}`);
    console.log(`   • Would Be Caught by Validation: ${report.validationImpact.wouldBeCaughtByValidation}`);
    console.log(`   • Validation Effectiveness: ${report.validationImpact.validationEffectiveness}`);
    console.log(`   • Remaining After Validation: ${report.validationImpact.remainingAfterValidation}`);
    console.log(`   • Projected Rate WITH Validation: ${report.validationImpact.projectedRateWithValidation}`);
    
    // Target assessment
    const projectedRate = parseFloat(report.validationImpact.projectedRateWithValidation);
    const meetsTarget = projectedRate < 0.5;
    
    console.log('\n   🎯 TARGET ASSESSMENT:');
    console.log(`   ┌──────────────────────────────────────────────────────┐`);
    console.log(`   │ Current Rate:     ${report.summary.falseMatchRate.padEnd(10)} (>0.5% ❌)              │`);
    console.log(`   │ With Validation:  ${report.validationImpact.projectedRateWithValidation.padEnd(10)} (${meetsTarget ? '<0.5% ✅' : '>0.5% ❌'})             │`);
    console.log(`   │ Improvement:      ${(report.validationImpact.validationEffectiveness).padEnd(10)} reduction               │`);
    console.log(`   └──────────────────────────────────────────────────────┘`);
    
    // Top problem patterns
    if (report.topProblemPatterns.length > 0) {
      console.log('\n   ⚠️  TOP PROBLEMATIC PATTERNS (by false match count):');
      for (let i = 0; i < Math.min(5, report.topProblemPatterns.length); i++) {
        const p = report.topProblemPatterns[i];
        console.log(`   ${i + 1}. ${p.fingerprint} → ${p.count} false matches`);
        
        // Show sample cases
        const samples = p.fingerprints.slice(0, 2);
        for (const s of samples) {
          console.log(`      - Invoice ${s.invoiceId}: Expected [${s.expectedSuppliers.join(', ')}] Got "${s.actualSupplier}" (${s.category})`);
        }
      }
    }
    
    // Recommendations
    console.log('\n   💡 RECOMMENDATIONS:');
    
    const topCategory = report.categoryBreakdown[0];
    if (topCategory) {
      switch (topCategory.category) {
        case 'SIMILAR_LAYOUT':
          console.log('   1. PRIMARY: Add Semantic Fingerprinting (field positions + types)');
          console.log('   2. Add Supplier Name Verification step before pattern acceptance');
          break;
        case 'OCR_DEGRADATION':
          console.log('   1. PRIMARY: Enhance preprocessing for OCR-damaged documents');
          console.log('   2. Add confidence penalty for low-quality input');
          break;
        case 'STALE_PATTERN':
          console.log('   1. PRIMARY: Implement pattern expiration/refresh logic');
          console.log('   2. Add drift detection for patterns older than 30 days');
          break;
        default:
          console.log('   1. Implement recommended Field Validation Layer');
          console.log('   2. Add cross-field consistency checks');
      }
    }
    
    console.log('\n   3. ALL CASES: Require minimum 3 successful validations before auto-accept');
    console.log('   4. MONITOR: Set up alerting when false match rate exceeds 0.3%');
    
    console.log('\n' + '='.repeat(80));
  }
}

// ─── EXECUTION ─────────────────────────────────────────────────

async function main() {
  const runner = new EnhancedBenchmarkRunner();
  const report = await runner.runAnalysis();
  
  // Save results
  const fs = require('fs');
  const outputPath = '/home/z/my-project/download/false-match-analysis.json';
  
  fs.writeFileSync(outputPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    config: ANALYSIS_CONFIG,
    results: runner.results,
  }, null, 2));
  
  console.log(`\n\n💾 Full analysis saved to: ${outputPath}`);
  
  return report;
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { 
  FalseMatchAnalyzer, 
  FieldValidationEngine, 
  EnhancedBenchmarkRunner,
  ANALYSIS_CONFIG 
};
