/**
 * Batch 1 Quality Gate Checker
 * Invoice Brain - Golden Validation Phase
 * 
 * Purpose: Automated validation of Batch 1 (500 invoices) against all 5 Quality Gates
 * Usage: node batch1-quality-gate-checker.js --batch-dir ./batch1-data
 * 
 * Feature Freeze: This script is part of frozen Protocol v1.0
 * Do NOT modify without CTO approval and Decision Log entry
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ==================== CONFIGURATION ====================
const BATCH1_REQUIREMENTS = {
  batchSize: { target: 500, tolerance: 10 }, // ±10 acceptable
  gates: {
    piiRemoval: { threshold: 100, name: 'PII Removal' },
    gtCompleteness: { threshold: 99, name: 'Ground Truth Completeness' },
    dataIntegrity: { threshold: 5, name: 'Data Integrity (max corruption %)' },
    supplierDistribution: { maxSingleSupplier: 10, name: 'Supplier Distribution' },
    templateCompliance: { tolerance: 5, name: 'Template Compliance (±%)' }
  },
  labelingAgreement: {
    minIAA: 95,
    maxThirdReview: 3,
    minConsensus: 99
  }
};

// ==================== QUALITY GATE IMPLEMENTATIONS ====================
class QualityGateChecker {
  constructor(batchDir) {
    this.batchDir = batchDir;
    this.results = {
      timestamp: new Date().toISOString(),
      batchDir: batchDir,
      gates: {},
      overall: null,
      artifacts: []
    };
  }

  // Gate 1: PII Removal - 100% clean required
  checkPIIRemoval(invoices) {
    const result = {
      gate: 'M1-002',
      name: BATCH1_REQUIREMENTS.gates.piiRemoval.name,
      threshold: `${BATCH1_REQUIREMENTS.gates.piiRemoval.threshold}%`,
      status: 'PENDING',
      details: { totalChecked: 0, piiIncidents: 0, cleanRate: 0 }
    };

    // Check for common PII patterns
    const piiPatterns = [
      /\d{3}-?\d{2}-?\d{4}/g,  // SSN pattern
      /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}/g,  // Email
      /\+?\d{1,3}[-.\s]?\(?\d{1,3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,  // Phone
      /\b\d{16}\b/g,  // Credit card
      /(?:account|acct)\s*(?:number|#|no)?\s*[:=]?\s*\d+/gi  // Account number
    ];

    let piiIncidents = 0;
    
    invoices.forEach((invoice, idx) => {
      if (!invoice.rawText) return;
      
      result.details.totalChecked++;
      
      const text = JSON.stringify(invoice);
      piiPatterns.forEach(pattern => {
        const matches = text.match(pattern);
        if (matches) {
          piiIncidents += matches.length;
          this.results.artifacts.push({
            type: 'PII_INCIDENT',
            file: invoice.filename || `invoice_${idx}`,
            pattern: pattern.toString(),
            count: matches.length
          });
        }
      });
    });

    result.details.piiIncidents = piiIncidents;
    result.details.cleanRate = result.details.totalChecked > 0 
      ? ((result.details.totalChecked - Math.min(piiIncidents, result.details.totalChecked)) / result.details.totalChecked * 100).toFixed(2)
      : 100;

    result.status = piiIncidents === 0 ? 'PASS' : 'FAIL';
    result.verdict = piiIncidents === 0 
      ? `✅ ${result.details.totalChecked} files checked, 0 PII incidents` 
      : `❌ ${piiIncidents} PII incidents found - REJECT BATCH`;

    this.results.gates.piiRemoval = result;
    return result;
  }

  // Gate 2: Ground Truth Completeness - ≥99% fields annotated
  checkGTCompleteness(invoices) {
    const result = {
      gate: 'M1-003',
      name: BATCH1_REQUIREMENTS.gates.gtCompleteness.name,
      threshold: `≥${BATCH1_REQUIREMENTS.gates.gtCompleteness}%`,
      status: 'PENDING',
      details: { totalFields: 0, annotatedFields: 0, completeness: 0, missingByField: {} }
    };

    const requiredFields = [
      'supplierName', 'invoiceNumber', 'totalAmount', 'date',
      'lineItems', 'taxAmount', 'currency'
    ];

    invoices.forEach((invoice, idx) => {
      requiredFields.forEach(field => {
        result.details.totalFields++;
        if (!result.details.missingByField[field]) {
          result.details.missingByField[field] = 0;
        }
        
        const value = invoice.groundTruth && invoice.groundTruth[field];
        if (value !== undefined && value !== null && value !== '') {
          result.details.annotatedFields++;
        } else {
          result.details.missingByField[field]++;
        }
      });
    });

    result.details.completeness = result.details.totalFields > 0
      ? (result.details.annotatedFields / result.details.totalFields * 100).toFixed(2)
      : 0;

    result.status = parseFloat(result.details.completeness) >= BATCH1_REQUIREMENTS.gates.gtCompleteness.threshold ? 'PASS' : 'FAIL';
    result.verdict = result.status === 'PASS'
      ? `✅ Completeness: ${result.details.completeness}%`
      : `❌ Completeness: ${result.details.completeness}% (need ≥${BATCH1_REQUIREMENTS.gates.gtCompleteness.threshold}%) - RE-ANNOTATE`;

    this.results.gates.gtCompleteness = result;
    return result;
  }

  // Gate 3: Data Integrity - <5% corrupted files
  checkDataIntegrity(files) {
    const result = {
      gate: 'M1-004',
      name: BATCH1_REQUIREMENTS.gates.dataIntegrity.name,
      threshold: `<${BATCH1_REQUIREMENTS.gates.dataIntegrity.threshold}%`,
      status: 'PENDING',
      details: { totalFiles: 0, corruptedFiles: 0, corruptionRate: 0, issues: [] }
    };

    result.details.totalFiles = files.length;

    files.forEach(file => {
      try {
        // Check file exists and is readable
        const stats = fs.statSync(file.path);
        
        // Check file size (corrupted files often have 0 or very small size for images)
        if (stats.size === 0) {
          result.details.corruptedFiles++;
          result.details.issues.push({ file: file.name, issue: 'Empty file' });
          return;
        }

        // Check JSON validity for annotation files
        if (file.name.endsWith('.json')) {
          JSON.parse(fs.readFileSync(file.path, 'utf8'));
        }

        // Basic image header check
        if (/\.(png|jpg|jpeg|tiff?)$/i.test(file.name)) {
          const buffer = fs.readFileSync(file.path);
          const header = buffer.slice(0, 4).toString('hex');
          
          // PNG: 89504E47, JPEG: FFD8FF, TIFF: 49492A00
          const validHeaders = ['89504e47', 'ffd8ff', '49492a00'];
          if (!validHeaders.includes(header.toLowerCase())) {
            result.details.corruptedFiles++;
            result.details.issues.push({ file: file.name, issue: 'Invalid image header' });
          }
        }
      } catch (error) {
        result.details.corruptedFiles++;
        result.details.issues.push({ file: file.name, issue: error.message });
      }
    });

    result.details.corruptionRate = result.details.totalFiles > 0
      ? (result.details.corruptedFiles / result.details.totalFiles * 100).toFixed(2)
      : 0;

    result.status = parseFloat(result.details.corruptionRate) < BATCH1_REQUIREMENTS.gates.dataIntegrity.threshold ? 'PASS' : 'FAIL';
    result.verdict = result.status === 'PASS'
      ? `✅ Corruption rate: ${result.details.corruptionRate}% (${result.details.corruptedFiles}/${result.details.totalFiles})`
      : `❌ Corruption rate: ${result.details.corruptionRate}% exceeds threshold - REMOVE BAD FILES`;

    this.results.gates.dataIntegrity = result;
    return result;
  }

  // Gate 4: Supplier Distribution - No supplier >10%
  checkSupplierDistribution(invoices) {
    const result = {
      gate: 'M1-005',
      name: BATCH1_REQUIREMENTS.gates.supplierDistribution.name,
      threshold: `No supplier >${BATCH1_REQUIREMENTS.gates.supplierDistribution.maxSingleSupplier}%`,
      status: 'PENDING',
      details: { uniqueSuppliers: 0, totalInvoices: 0, distribution: {}, violations: [] }
    };

    result.details.totalInvoices = invoices.length;

    invoices.forEach(invoice => {
      const supplier = invoice.groundTruth && invoice.groundTruth.supplierName;
      if (supplier) {
        result.details.distribution[supplier] = (result.details.distribution[supplier] || 0) + 1;
      }
    });

    result.details.uniqueSuppliers = Object.keys(result.details.distribution).length;

    const maxAllowed = result.details.totalInvoices * (BATCH1_REQUIREMENTS.gates.supplierDistribution.maxSingleSupplier / 100);

    Object.entries(result.details.distribution).forEach(([supplier, count]) => {
      const percentage = (count / result.details.totalInvoices * 100).toFixed(2);
      if (count > maxAllowed) {
        result.details.violations.push({
          supplier,
          count,
          percentage: `${percentage}%`
        });
      }
    });

    result.status = result.details.violations.length === 0 ? 'PASS' : 'FAIL';
    result.verdict = result.status === 'PASS'
      ? `✅ ${result.details.uniqueSuppliers} suppliers, max concentration acceptable`
      : `❌ ${result.details.violations.length} supplier(s) exceed 10% - RESAMPLE`;

    this.results.gates.supplierDistribution = result;
    return result;
  }

  // Gate 5: Template Compliance - ±5% of spec targets
  checkTemplateCompliance(invoices, specTargets) {
    const result = {
      gate: 'M1-006',
      name: BATCH1_REQUIREMENTS.gates.templateCompliance.name,
      threshold: `±${BATCH1_REQUIREMENTS.gates.templateCompliance.tolerance}% of spec`,
      status: 'PENDING',
      details: { actualDistribution: {}, deviations: {}, compliant: true }
    };

    // Default spec targets from Golden Dataset Spec
    const defaultSpec = {
      'Shared ERP': 30,
      'Arabic Only': 20,
      'Mixed Language': 30,
      'Low Quality': 20,
      'Similar Suppliers': 15
    };

    const targets = specTargets || defaultSpec;
    const totalCount = invoices.length;

    // Count actual templates
    invoices.forEach(invoice => {
      const template = invoice.metadata && invoice.metadata.templateType || 'Unknown';
      result.details.actualDistribution[template] = (result.details.actualDistribution[template] || 0) + 1;
    });

    // Calculate deviations
    Object.entries(targets).forEach(([template, targetPercent]) => {
      const actualCount = result.details.actualDistribution[template] || 0;
      const actualPercent = (actualCount / totalCount * 100).toFixed(2);
      const deviation = (parseFloat(actualPercent) - targetPercent).toFixed(2);
      
      result.details.deviations[template] = {
        target: `${targetPercent}%`,
        actual: `${actualPercent}%`,
        deviation: `${deviation}%`,
        withinTolerance: Math.abs(parseFloat(deviation)) <= BATCH1_REQUIREMENTS.gates.templateCompliance.tolerance
      };

      if (!result.details.deviations[template].withinTolerance) {
        result.details.compliant = false;
      }
    });

    result.status = result.details.compliant ? 'PASS' : 'FAIL';
    result.verdict = result.status === 'PASS'
      ? `✅ All templates within ±${BATCH1_REQUIREMENTS.gates.templateCompliance.tolerance}% of spec`
      : `❌ Template distribution out of tolerance - ADJUST MIX`;

    this.results.gates.templateCompliance = result;
    return result;
  }

  // Labeling Agreement Audit
  checkLabelingAgreement(annotationData) {
    const result = {
      gate: 'M1-QA',
      name: 'Labeling Agreement Audit',
      requirements: {
        iaa: `≥${BATCH1_REQUIREMENTS.labelingAgreement.minIAA}%`,
        thirdReview: `<${BATCH1_REQUIREMENTS.labelingAgreement.maxThirdReview}%`,
        consensus: `≥${BATCH1_REQUIREMENTS.labelingAgreement.minConsensus}%`
      },
      status: 'PENDING',
      details: {}
    };

    if (!annotationData || !annotationData.annotations) {
      result.status = 'NO_DATA';
      result.verdict = '⚠️ No annotation data provided';
      this.results.gates.labelingAgreement = result;
      return result;
    }

    const annotations = annotationData.annotations;
    
    // Calculate Inter-Annotator Agreement (simplified Cohen's Kappa approximation)
    let totalAgreements = 0;
    let totalComparisons = 0;
    let thirdReviewCount = 0;
    let consensusCount = 0;

    // Pairwise comparison
    for (let i = 0; i < annotations.length; i++) {
      const a1 = annotations[i];
      
      // Check if third review was needed
      if (a1.requiredThirdReview) thirdReviewCount++;

      // Check consensus achieved
      if (a1.consensusAchieved) consensusCount++;
      
      for (let j = i + 1; j < Math.min(i + 3, annotations.length); j++) {
        const a2 = annotations[j];
        
        if (a1.invoiceId !== a2.invoiceId) continue;
        
        totalComparisons++;
        const agreement = this.calculateAnnotationAgreement(a1, a2);
        totalAgreements += agreement;
      }
    }

    const iaa = totalComparisons > 0 ? (totalAgreements / totalComparisons * 100) : 100;
    const thirdReviewRate = annotations.length > 0 ? (thirdReviewCount / annotations.length * 100) : 0;
    const consensusRate = annotations.length > 0 ? (consensusCount / annotations.length * 100) : 100;

    result.details = {
      iaa: iaa.toFixed(2),
      thirdReviewRate: thirdReviewRate.toFixed(2),
      consensusRate: consensusRate.toFixed(2),
      totalAnnotations: annotations.length,
      pairwiseComparisons: totalComparisons
    };

    const iaaPass = parseFloat(result.details.iaa) >= BATCH1_REQUIREMENTS.labelingAgreement.minIAA;
    const thirdReviewPass = parseFloat(result.details.thirdReviewRate) <= BATCH1_REQUIREMENTS.labelingAgreement.maxThirdReview;
    const consensusPass = parseFloat(result.details.consensusRate) >= BATCH1_REQUIREMENTS.labelingAgreement.minConsensus;

    result.status = (iaaPass && thirdReviewPass && consensusPass) ? 'PASS' : 'FAIL';
    result.verdict = result.status === 'PASS'
      ? `✅ IAA: ${result.details.iaa}%, Third Review: ${result.details.thirdReviewRate}%, Consensus: ${result.details.consensusRate}%`
      : `❌ Labeling agreement below thresholds - REVIEW ANNOTATION PROCESS`;

    this.results.gates.labelingAgreement = result;
    return result;
  }

  calculateAnnotationAgreement(a1, a2) {
    if (!a1.fields || !a2.fields) return 1;
    
    const fields = Object.keys(a1.fields);
    if (fields.length === 0) return 1;

    let agreements = 0;
    fields.forEach(field => {
      if (a1.fields[field] === a2.fields[field]) {
        agreements++;
      }
    });

    return agreements / fields.length;
  }

  // Main execution
  async run(data) {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     Batch 1 Quality Gate Checker - Invoice Brain v1.0      ║');
    console.log('║           Feature Freeze Active - Protocol v1.0           ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');

    const invoices = data.invoices || [];
    const files = data.files || [];
    const annotationData = data.annotationData;

    console.log(`📊 Input: ${invoices.length} invoices, ${files.length} files`);
    console.log(`⏰ Timestamp: ${this.results.timestamp}`);
    console.log('');

    // Run all gates
    console.log('─── Running Quality Gates ───');
    console.log('');

    if (invoices.length > 0) {
      this.checkPIIRemoval(invoices);
      this.checkGTCompleteness(invoices);
      this.checkSupplierDistribution(invoices);
      this.checkTemplateCompliance(invoices);
    }

    if (files.length > 0) {
      this.checkDataIntegrity(files);
    }

    if (annotationData) {
      this.checkLabelingAgreement(annotationData);
    }

    // Determine overall result
    const gateResults = Object.values(this.results.gates);
    const hardGates = ['piiRemoval', 'gtCompleteness', 'dataIntegrity', 'supplierDistribution', 'templateCompliance'];
    
    const hardGateResults = hardGates.map(g => this.results.gates[g]).filter(g => g);
    const hardGatePasses = hardGateResults.filter(g => g.status === 'PASS').length;
    const hardGateFails = hardGateResults.filter(g => g.status === 'FAIL').length;

    if (hardGateFails > 0) {
      this.results.overall = 'FAIL';
    } else if (hardGatePasses === hardGates.filter(g => this.results.gates[g]).length) {
      this.results.overall = 'PASS';
    } else {
      this.results.overall = 'PARTIAL';
    }

    // Print results
    this.printResults();

    // Generate report
    return this.generateReport();
  }

  printResults() {
    console.log('─── Results Summary ───');
    console.log('');

    const gates = this.results.gates;
    Object.entries(gates).forEach(([key, gate]) => {
      const icon = gate.status === 'PASS' ? '✅' : gate.status === 'FAIL' ? '❌' : '⚠️';
      console.log(`${icon} [${gate.gate}] ${gate.name}: ${gate.verdict}`);
    });

    console.log('');
    console.log('═══════════════════════════════════════');
    const overallIcon = this.results.overall === 'PASS' ? '🎉' : this.results.overall === 'FAIL' ? '🚫' : '⚡';
    console.log(`${overallIcon} OVERALL M1 RESULT: ${this.results.overall}`);
    console.log('═══════════════════════════════════════');
  }

  generateReport() {
    const reportPath = '/home/z/my-project/download/batch1-quality-gate-report.json';
    
    // Add SHA-256 fingerprint of results
    const resultsString = JSON.stringify(this.results, null, 2);
    const hash = crypto.createHash('sha256').update(resultsString).digest('hex');
    this.results.fingerprint = hash;
    this.results.protocolVersion = '1.0.0';
    this.results.featureFreeze = true;

    fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
    
    console.log('');
    console.log(`📄 Report saved: ${reportPath}`);
    console.log(`🔐 Fingerprint: ${hash}`);

    return this.results;
  }
}

// ==================== CLI INTERFACE ====================
if (require.main === module) {
  const args = process.argv.slice(2);
  
  // Example usage with sample data
  const sampleData = {
    invoices: Array.from({ length: 500 }, (_, i) => ({
      filename: `invoice_${i + 1}.pdf`,
      groundTruth: {
        supplierName: `Supplier_${(i % 80) + 1}`,  // 80 unique suppliers
        invoiceNumber: `INV-${1000 + i}`,
        totalAmount: (Math.random() * 10000 + 100).toFixed(2),
        date: '2024-' + String(Math.floor(Math.random() * 12) + 1).padStart(2, '0') + '-' + String(Math.floor(Math.random() * 28) + 1).padStart(2, '0'),
        lineItems: [],
        taxAmount: (Math.random() * 1500).toFixed(2),
        currency: ['SAR', 'AED', 'USD'][i % 3]
      },
      metadata: {
        templateType: ['Shared ERP', 'Arabic Only', 'Mixed Language', 'Low Quality', 'Similar Suppliers'][i % 5]
      }
    })),
    files: Array.from({ length: 500 }, (_, i) => ({
      path: `/data/batch1/invoice_${i + 1}.pdf`,
      name: `invoice_${i + 1}.pdf`
    })),
    annotationData: {
      annotations: Array.from({ length: 500 }, (_, i) => ({
        invoiceId: `inv_${i + 1}`,
        requiredThirdReview: Math.random() < 0.02,  // ~2%
        consensusAchieved: Math.random() > 0.005,   // ~99.5%
        fields: {
          supplierName: `Supplier_${(i % 80) + 1}`,
          invoiceNumber: `INV-${1000 + i}`
        }
      }))
    }
  };

  const checker = new QualityGateChecker('./batch1-data');
  checker.run(sampleData).then(results => {
    console.log('');
    console.log('💡 To run with real data:');
    console.log('   node batch1-quality-gate-checker.js --batch-dir /path/to/batch1');
  }).catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}

module.exports = QualityGateChecker;
