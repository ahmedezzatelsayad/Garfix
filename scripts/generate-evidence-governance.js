const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        Header, Footer, AlignmentType, HeadingLevel, PageNumber, BorderStyle,
        WidthType, ShadingType, PageBreak, SectionType, NumberFormat } = require("docx");
const fs = require("fs");

// Palette: Legal Wood - Heavy, formal governance
const P = {
  primary: "#28201C",
  body: "#36302C",
  secondary: "#6E6560",
  accent: "#8B4513",
  surface: "#F5F0EB"
};
const c = (hex) => hex.replace("#", "");

// Safe text helper
function safeText(value, placeholder) {
  if (value === undefined || value === null || value === "" || String(value) === "NaN") {
    return placeholder || "\u3010Please fill in\u3011";
  }
  return String(value);
}

// Heading builder
function heading(text, level = HeadingLevel.HEADING_1) {
  const sizes = { [HeadingLevel.HEADING_1]: 32, [HeadingLevel.HEADING_2]: 30, [HeadingLevel.HEADING_3]: 28 };
  return new Paragraph({
    heading: level,
    spacing: { before: level === HeadingLevel.HEADING_1 ? 400 : 300, after: 200 },
    children: [new TextRun({ 
      text, 
      bold: true, 
      color: c(P.primary), 
      font: { ascii: "Times New Roman", eastAsia: "SimHei" },
      size: sizes[level] || 28
    })]
  });
}

// Body paragraph
function body(text) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { firstLine: 480 },
    spacing: { line: 312, after: 120 },
    children: [new TextRun({ 
      text, 
      size: 24, 
      color: c(P.body),
      font: { ascii: "Times New Roman", eastAsia: "SimSun" }
    })]
  });
}

// Table cell helper
function cell(text, options = {}) {
  const { bold = false, header = false, width, align = AlignmentType.LEFT, shading } = options;
  return new TableCell({
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    shading: shading ? { fill: shading, type: ShadingType.CLEAR } : undefined,
    children: [new Paragraph({
      alignment: align,
      spacing: { before: 60, after: 60 },
      children: [new TextRun({ 
        text: safeText(text), 
        bold: bold || header, 
        size: header ? 22 : 21,
        color: header ? c("#FFFFFF") : c(P.body),
        font: { ascii: "Times New Roman", eastAsia: header ? "SimHei" : "SimSun" }
      })]
    })]
  });
}

// Table builder
function createTable(headers, rows, colWidths) {
  const headerRow = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: headers.map((h, i) => cell(h, { header: true, width: colWidths[i], shading: c(P.accent) }))
  });
  const dataRows = rows.map(row => new TableRow({
    cantSplit: true,
    children: row.map((cellText, i) => cell(cellText, { width: colWidths[i] }))
  }));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows]
  });
}

// Section divider
function sectionDivider() {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: c(P.secondary) } },
    spacing: { before: 200, after: 200 }
  });
}

// ==================== COVER RECIPE R2 ====================
function buildCoverR2(config) {
  var title = config.title;
  var subtitle = config.subtitle;
  var metaLines = config.metaLines;
  var titleColor = "#FFFFFF";
  var subtitleColor = "#F5F0EB";
  var metaColor = "#D4C5B9";
  
  // Build rows array
  var rows = [];
  
  // Top border
  rows.push(new TableRow({ height: { value: 2500, rule: "exact" }, children: [
    new TableCell({ borders: { top: { style: BorderStyle.SINGLE, size: 24, color: c(P.accent) }, bottom: { style: BorderStyle.SINGLE, size: 12, color: c(P.accent) }, left: { style: BorderStyle.NIL }, right: { style: BorderStyle.NIL } }, width: { size: 100, type: WidthType.PERCENTAGE }, children: [] })
  ]}));
  
  // Subtitle row
  rows.push(new TableRow({ height: { value: 800, rule: "exact" }, children: [
    new TableCell({ borders: { top: { style: BorderStyle.NIL }, bottom: { style: BorderStyle.SINGLE, size: 4, color: c(P.accent) }, left: { style: BorderStyle.NIL }, right: { style: BorderStyle.NIL } }, width: { size: 100, type: WidthType.PERCENTAGE }, verticalAlign: "top", children: [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 100 }, children: [
          new TextRun({ text: subtitle || "", size: 22, color: c(subtitleColor), font: { ascii: "Times New Roman", eastAsia: "SimSun" } })
        ]})
      ]})
  ]}));
  
  // Title row
  rows.push(new TableRow({ height: { value: 3500, rule: "exact" }, children: [
    new TableCell({ borders: { top: { style: BorderStyle.NIL }, bottom: { style: BorderStyle.NIL }, left: { style: BorderStyle.NIL }, right: { style: BorderStyle.NIL } }, width: { size: 100, type: WidthType.PERCENTAGE }, verticalAlign: "top", children: [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400 }, children: [
          new TextRun({ text: title, bold: true, size: 44, color: c(titleColor), font: { ascii: "Times New Roman", eastAsia: "SimHei" } })
        ]})
      ]})
  ]}));
  
  // Meta lines row (if provided)
  if (metaLines && metaLines.length > 0) {
    var metaParagraphs = [];
    for (var i = 0; i < metaLines.length; i++) {
      var line = metaLines[i];
      var spacingBefore = (i === 0) ? 300 : 120;
      metaParagraphs.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: spacingBefore, after: 60 }, children: [
        new TextRun({ text: line, size: 21, color: c(metaColor), font: { ascii: "Times New Roman", eastAsia: "SimSun" } })
      ]}));
    }
    rows.push(new TableRow({ height: { value: 5000, rule: "exact" }, children: [
      new TableCell({ borders: { top: { style: BorderStyle.SINGLE, size: 4, color: c(P.accent) }, bottom: { style: BorderStyle.SINGLE, size: 24, color: c(P.accent) }, left: { style: BorderStyle.NIL }, right: { style: BorderStyle.NIL } }, width: { size: 100, type: WidthType.PERCENTAGE }, verticalAlign: "top", children: metaParagraphs })
    ]}));
  }
  
  // Bottom border
  rows.push(new TableRow({ height: { value: 5838, rule: "exact" }, children: [
    new TableCell({ borders: { top: { style: BorderStyle.SINGLE, size: 12, color: c(P.accent) }, bottom: { style: BorderStyle.NIL }, left: { style: BorderStyle.NIL }, right: { style: BorderStyle.NIL } }, width: { size: 100, type: WidthType.PERCENTAGE }, children: [] })
  ]}));
  
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows
  });
}

// ==================== DOCUMENT CONTENT ====================
async function generateDocument() {
  const doc = new Document({
    styles: { default: { document: {
      run: { font: { ascii: "Times New Roman", eastAsia: "SimSun" }, size: 24, color: c(P.body) },
      paragraph: { spacing: { line: 312 } }
    }}},
    sections: [
      // SECTION 1: COVER
      { properties: { page: { margin: { top: 0, bottom: 0, left: 0, right: 0 } } },
        children: [buildCoverR2({
          title: "Evidence Governance Framework",
          subtitle: "Invoice Brain \u2013 Golden Validation Phase",
          metaLines: [
            "Document Version: 1.0.0",
            "Classification: Internal Governance",
            "Status: CTO-Approved Draft",
            "Date: " + new Date().toISOString().split('T')[0]
          ]
        })]
      },
      // SECTION 2: BODY
      { properties: { 
        page: { 
          margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 },
          pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL }
        }
      },
      headers: { default: new Header({ children: [new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: "Evidence Governance Framework | Invoice Brain", size: 18, color: c(P.secondary), font: { ascii: "Times New Roman", eastAsia: "SimSun" } })]
      })]}) },
      footers: { default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ children: [PageNumber.CURRENT], size: 18 })]
      })]}) },
      children: [
        // ===== PART 1: GO/NO-GO DECISION MATRIX =====
        heading("Part 1: GO/NO-GO Decision Matrix"),
        sectionDivider(),
        
        body("This Decision Matrix establishes the complete criteria for determining Production Readiness of Invoice Brain. Unlike previous versions that relied on a single FMR threshold, this matrix requires ALL Hard Stop metrics to pass simultaneously, while Soft Warning metrics trigger remediation plans rather than automatic failure."),
        
        body("The fundamental principle is that production deployment of an ML-based invoice processing system cannot be justified by a single metric. A system may achieve excellent FMR while suffering from unacceptable latency, poor calibration, or high supplier confusion rates. Each metric represents a distinct dimension of quality that stakeholders care about independently."),
        
        heading("1.1 Metric Classification System", HeadingLevel.HEADING_2),
        
        body("Metrics are classified into two categories based on their impact on production viability. Hard Stop metrics represent non-negotiable requirements where failure in ANY single metric results in automatic NO-GO decision. Soft Warning metrics represent important quality indicators where deviation triggers a mandatory remediation plan but does not automatically prevent deployment."),
        
        createTable(
          ["Category", "Definition", "Decision Impact", "Example"],
          [
            ["Hard Stop", "Non-negotiable requirement for production", "Any fail = NO-GO", "FMR > 1.5%"],
            ["Soft Warning", "Quality indicator requiring action plan", "Fail + Plan = Conditional GO", "Latency > 300ms"],
            ["Informational", "Monitoring metric, no gate function", "Track and trend only", "CPU utilization"]
          ],
          [20, 35, 25, 20]
        ),
        
        new Paragraph({ spacing: { before: 200, after: 200 } }),
        
        heading("1.2 Complete GO/NO-GO Criteria Matrix", HeadingLevel.HEADING_2),
        
        body("The following table defines all metrics that must be evaluated before issuing a Production Sign-off. Each metric includes its target threshold, hard stop boundary, measurement method, and responsible owner. This matrix must be completed in full during M4 (Delta Decision) milestone."),
        
        createTable(
          ["Metric", "Target", "Hard Stop", "Soft Warning", "Owner", "Evidence Source"],
          [
            ["False Match Rate (FMR)", "\u22641.5%", ">2.0%", "1.5%-2.0%", "Benchmark Team", "EV-001 Golden Report"],
            ["Precision", "\u226595%", "<90%", "90%-95%", "Benchmark Team", "EV-001 Golden Report"],
            ["Recall", "\u226598%", "<95%", "95%-98%", "Benchmark Team", "EV-001 Golden Report"],
            ["F1 Score", "\u226496.5%", "<92%", "92%-96.5%", "Benchmark Team", "EV-001 Golden Report"],
            ["Supplier Confusion Rate", "\u22640.5%", ">1.5%", "0.5%-1.5%", "Data Team", "EV-003 Delta Report"],
            ["Human Override Rate", "\u22643%", ">8%", "3%-8%", "Operations", "EV-002 Usage Metrics"],
            ["P99 Latency", "\u2264200ms", ">500ms", "200ms-500ms", "SRE Team", "EV-004 Performance"],
            ["Error Budget Status", "\u226590% remaining", "<50% remaining", "50%-90%", "SRE Team", "EV-001 Golden Report"],
            ["Calibration Error (ECE)", "\u22642%", ">5%", "2%-5%", "ML Team", "EV-005 Calibration"],
            ["Dataset Drift Index", "\u22643%", ">10%", "3%-10%", "Data Team", "EV-006 Drift Analysis"],
            ["Wilson CI Upper Bound", "\u22642.0%", ">3.0%", "2.0%-3.0%", "Benchmark Team", "EV-001 Golden Report"],
            ["Template Coverage Gap", "\u22643 templates", "<25 templates", "25-29 templates", "Data Team", "EV-007 Coverage"]
          ],
          [18, 11, 13, 14, 12, 32]
        ),
        
        new Paragraph({ spacing: { before: 200, after: 200 } }),
        
        heading("1.3 Decision Logic Flow", HeadingLevel.HEADING_2),
        
        body("The GO/NO-GO decision follows a strict evaluation sequence. First, all Hard Stop metrics are evaluated. If ANY Hard Stop metric exceeds its threshold, the decision is immediately NO-GO regardless of other metric performance. This prevents compensating for critical failures with strong performance in less critical areas."),
        
        body("If all Hard Stop metrics pass, Soft Warning metrics are evaluated. Each Soft Warning failure requires a documented remediation plan with specific timeline and acceptance criteria. The CTO may issue a Conditional GO when Soft Warning failures exist, provided remediation plans are approved and tracked."),
        
        createTable(
          ["Scenario", "Hard Stops", "Soft Warnings", "Decision", "Required Action"],
          [
            ["Ideal GO", "All Pass", "All Pass", "GO", "Proceed to Production Sign-off"],
            ["Conditional GO", "All Pass", "1-2 Failures", "Conditional GO", "Approve Remediation Plans"],
            ["NO-GO (Critical)", "Any Failure", "N/A", "NO-GO", "Root Cause Analysis Required"],
            ["NO-GO (Multiple)", "All Pass", "\u22653 Failures", "NO-GO", "Systemic Issue Investigation"],
            ["Deferred", "Borderline", "Mixed", "DEFER", "Additional Data Collection"]
          ],
          [18, 15, 18, 18, 31]
        ),
        
        new Paragraph({ spacing: { before: 200, after: 200 } }),
        
        heading("1.4 Risk Acceptance Matrix", HeadingLevel.HEADING_2),
        
        body("When metrics fall within warning zones or when trade-offs exist between competing objectives, the Risk Acceptance Matrix provides guidance on acceptable compromises. This matrix explicitly documents which risk combinations are acceptable and which are not, preventing ad-hoc decision making during critical review moments."),
        
        body("For example, a scenario where FMR achieves 0.9% (excellent) but P99 Latency reaches 400ms (warning zone) requires explicit risk acceptance documentation. The matrix below defines pre-approved risk combinations that do not require escalation, versus combinations that require CTO-level approval."),
        
        createTable(
          ["Risk Combination", "Acceptable?", "Escalation Level", "Condition"],
          [
            ["FMR Excellent + Latency Warning", "Yes", "None", "SLA documented"],
            ["Precision High + Recall Slightly Low", "Yes", "Team Lead", "Business use case reviewed"],
            ["All Metrics Borderline", "No", "CTO", "Full evidence package required"],
            ["Single Critical Metric Fail", "No", "CTO + VP", "Root cause + rollback plan"],
            ["Error Budget Exhausted", "No", "VP Engineering", "Immediate investigation"],
            ["Calibration Fail + Any Other Fail", "No", "CTO", "Model retraining required"]
          ],
          [28, 12, 18, 42]
        ),
        
        new Paragraph({ spacing: { before: 300 } }),
        
        // ===== PART 2: ROOT CAUSE PLAYBOOK =====
        heading("Part 2: Root Cause Playbook"),
        sectionDivider(),
        
        body("This Playbook provides predefined response procedures for each potential failure mode discovered during Golden Validation. Instead of reacting ad-hoc to failures, teams follow established playbooks that ensure consistent, traceable, and accountable responses. Each playbook entry specifies the diagnostic steps, responsible team, resolution path, and escalation triggers."),
        
        body("The purpose of this playbook is to convert test results into actionable plans. When a failure occurs, the relevant section is activated immediately, eliminating debate about next steps and ensuring organizational learning is captured systematically."),
        
        heading("2.1 Failure Mode: Supplier Confusion Exceeded", HeadingLevel.HEADING_2),
        
        createTable(
          ["Attribute", "Specification"],
          [
            ["Trigger Condition", "Supplier Confusion Rate > 0.5% (Soft) or > 1.5% (Hard Stop)"],
            ["Severity", "Critical \u2013 Direct financial impact via misrouted invoices"],
            ["Primary Owner", "Data Team Lead"],
            ["Secondary Owner", "ML Engineering Lead"],
            ["Escalation Trigger", "Rate > 2.0% or increasing trend over 3 batches"]
          ],
          [25, 75]
        ),
        
        new Paragraph({ spacing: { before: 200 } }),
        body("Diagnostic Procedure: When supplier confusion exceeds thresholds, immediately isolate whether the confusion is concentrated in specific supplier pairs or distributed across many suppliers. Run the confusion matrix analysis to identify the top 5 confused supplier pairs. Check if confused suppliers share similar names, logos, or ERP systems."),
        
        body("Resolution Path A (Data Issue): If confusion correlates with visually similar suppliers, augment training data with hard negative examples for those specific pairs. Add explicit disambiguation features to the model input. Re-run validation on affected subset before full re-validation."),
        
        body("Resolution Path B (Model Issue): If confusion is distributed without clear pattern, investigate feature extraction layer for insufficient discriminative power. Consider adding supplier-specific embedding features. Evaluate whether the model architecture needs modification (requires Feature Freeze exit)."),
        
        body("Resolution Path C (Ground Truth Issue): If manual review shows GT errors, initiate Ground Truth correction process per Data Qualification Framework Section 4.2. Recalculate metrics after correction."),
        
        new Paragraph({ spacing: { before: 200 } }),
        
        heading("2.2 Failure Mode: OCR Quality Degradation", HeadingLevel.HEADING_2),
        
        createTable(
          ["Attribute", "Specification"],
          [
            ["Trigger Condition", "OCR Failure Rate > 5% or OCR Confidence < 85% on >10% of fields"],
            ["Severity", "Major \u2013 Cascading impact on all downstream extraction"],
            ["Primary Owner", "Platform Engineering"],
            ["Secondary Owner", "Vendor Management (if external OCR)"],
            ["Escalation Trigger", "OCR degradation affects > 2 template categories"]
          ],
          [25, 75]
        ),
        
        new Paragraph({ spacing: { before: 200 } }),
        body("Diagnostic Procedure: Segment OCR failures by template category, image quality tier, language, and field type. Determine if degradation is uniform or localized. Check OCR service health metrics if using external API. Compare current performance against baseline established during synthetic validation."),
        
        body("Resolution Path A (Image Quality): If failures correlate with low-quality scans, evaluate preprocessing pipeline enhancement. Consider adding super-resolution or denoising steps. Document minimum image quality requirements for production."),
        
        body("Resolution Path B (Template-Specific): If failures concentrate in specific templates, create template-specific OCR configurations. Fine-tune region detection for problematic layouts."),
        
        body("Resolution Path C (Service Issue): If using external OCR API, check SLA compliance. Engage vendor support. Evaluate fallback OCR options for affected document types."),
        
        new Paragraph({ spacing: { before: 200 } }),
        
        heading("2.3 Failure Mode: Ground Truth Quality Issues", HeadingLevel.HEADING_2),
        
        createTable(
          ["Attribute", "Specification"],
          [
            ["Trigger Condition", "GT Error Rate > 1% OR IAA < 95% OR Third Review > 3%"],
            ["Severity", "Critical \u2013 Invalidates all metrics derived from affected data"],
            ["Primary Owner", "Data Custodian"],
            ["Secondary Owner", "QA Lead (Labeling)"],
            ["Escalation Trigger", "Systematic bias detected in GT annotations"]
          ],
          [25, 75]
        ),
        
        new Paragraph({ spacing: { before: 200 } }),
        body("Diagnostic Procedure: Identify annotators associated with erroneous labels. Check for annotation fatigue patterns (accuracy decreasing over time). Verify annotation tool functionality. Review annotation guidelines for ambiguity. Sample 100 disputed cases for expert adjudication."),
        
        body("Resolution Path A (Annotator Issue): If specific annotators show elevated error rates, retrain or remove from pool. Increase QA sampling rate for remaining annotators. Add calibration test to daily workflow."),
        
        body("Resolution Path B (Guideline Issue): If errors cluster around ambiguous cases, update annotation guidelines with additional examples. Conduct guideline training session. Re-annotate affected subset."),
        
        body("Resolution Path C (Tool Issue): If tool malfunction contributed, fix tooling issues before proceeding. Implement automated consistency checks in annotation interface."),
        
        new Paragraph({ spacing: { before: 200 } }),
        
        heading("2.4 Failure Mode: Latency Budget Exceeded", HeadingLevel.HEADING_2),
        
        createTable(
          ["Attribute", "Specification"],
          [
            ["Trigger Condition", "P99 > 500ms (Hard) or P99 > 200ms (Soft)"],
            ["Severity", "Major \u2013 SLA impact, user experience degradation"],
            ["Primary Owner", "SRE Team / Performance Engineering"],
            ["Secondary Owner", "Infrastructure Team"],
            ["Escalation Trigger", "Latency regression > 50% from baseline"]
          ],
          [25, 75]
        ),
        
        new Paragraph({ spacing: { before: 200 } }),
        body("Diagnostic Procedure: Profile end-to-end pipeline to identify bottleneck stage. Separate network latency from computation latency. Check resource utilization (CPU, memory, GPU). Compare against synthetic benchmark latency. Analyze percentile distribution for outliers."),
        
        body("Resolution Path A (Resource Constraint): Scale horizontally or vertically. Optimize batch processing. Implement caching for repeated patterns."),
        
        body("Resolution Path B (Algorithm Inefficiency): Profile specific operations. Optimize hot paths. Consider model quantization or pruning (requires validation)."),
        
        body("Resolution Path C (Infrastructure): Check for network issues, cold starts, or resource contention. Load balance across available capacity."),
        
        new Paragraph({ spacing: { before: 200 } }),
        
        heading("2.5 Failure Mode: Dataset Drift Detected", HeadingLevel.HEADING_2),
        
        createTable(
          ["Attribute", "Specification"],
          [
            ["Trigger Condition", "Drift Index > 10% (Hard) or > 3% (Soft)"],
            ["Severity", "Critical \u2013 Model performance decay in production"],
            ["Primary Owner", "Data Team"],
            ["Secondary Owner", "ML Engineering"],
            ["Escalation Trigger", "Drift accelerating or affecting multiple dimensions"]
          ],
          [25, 75]
        ),
        
        new Paragraph({ spacing: { before: 200 } }),
        body("Diagnostic Procedure: Identify drifted dimensions (supplier distribution, template mix, language ratio, temporal patterns). Determine if drift represents permanent shift or temporary variation. Assess business impact of drift direction."),
        
        body("Resolution Path A (Natural Variation): If drift within historical bounds, monitor closely. Adjust acceptance criteria if permanently shifted."),
        
        body("Resolution Path B (Permanent Shift): Collect new representative data. Augment Golden Dataset. Retrain model. Full re-validation cycle."),
        
        body("Resolution Path C (Collection Bias): If original collection had bias, document bias source. Plan targeted collection for underrepresented segments."),
        
        new Paragraph({ spacing: { before: 300 } }),
        
        // ===== PART 3: EVIDENCE REGISTRY =====
        heading("Part 3: Evidence Registry"),
        sectionDivider(),
        
        body("The Evidence Registry establishes a standardized identification and tracking system for all artifacts produced during the Golden Validation phase. Each artifact receives a unique identifier (EV-XXX) that is used in Decision Logs, reports, and audit trails. This registry ensures complete traceability from raw data through final decision."),
        
        body("The registry follows a hierarchical structure where each artifact type has a defined format, content requirements, retention policy, and access controls. Artifacts cannot be referenced in official decisions unless they are registered with valid identifiers."),
        
        heading("3.1 Artifact ID Convention", HeadingLevel.HEADING_2),
        
        createTable(
          ["ID Range", "Artifact Type", "Responsible Party", "Retention"],
          [
            ["EV-001", "Golden Validation Report", "Benchmark Team", "Permanent"],
            ["EV-002", "Usage Metrics & Override Log", "Operations", "7 years"],
            ["EV-003", "Delta Analysis Report (Synthetic vs Golden)", "Benchmark Team", "Permanent"],
            ["EV-004", "Performance Benchmark (Latency/Throughput)", "SRE Team", "5 years"],
            ["EV-005", "Calibration Curve & Reliability Diagram", "ML Team", "Permanent"],
            ["EV-006", "Drift Analysis Report", "Data Team", "5 years"],
            ["EV-007", "Coverage & Representativeness Analysis", "Data Team", "Permanent"],
            ["EV-008", "Labeling Agreement Audit Report", "QA Team", "7 years"],
            ["EV-009", "Ground Truth Correction Log", "Data Custodian", "Permanent"],
            ["EV-010", "Milestone Decision Record (per milestone)", "CTO Office", "Permanent"],
            ["EV-011", "Risk Acceptance Documentation", "Decision Maker", "7 years"],
            ["EV-012", "External Audit Report (if applicable)", "Auditor", "Permanent"]
          ],
          [15, 38, 22, 25]
        ),
        
        new Paragraph({ spacing: { before: 200, after: 200 } }),
        
        heading("3.2 Artifact Content Requirements", HeadingLevel.HEADING_2),
        
        body("Each registered artifact must contain specific mandatory content elements to ensure completeness and auditability. Artifacts missing required elements are considered incomplete and cannot be used as basis for decisions."),
        
        createTable(
          ["Element", "Description", "Applies To"],
          [
            ["Executive Summary", "1-page summary suitable for CTO review", "All EV artifacts"],
            ["Methodology Statement", "How artifact was produced, tools used", "All analytical artifacts"],
            ["Raw Data Reference", "Link to source data with fingerprint", "All data-derived artifacts"],
            ["Confidence Intervals", "Statistical uncertainty quantification", "EV-001, EV-003, EV-005"],
            ["Timestamps", "Creation, last modified, approval dates", "All artifacts"],
            ["Approval Chain", "Who reviewed and approved", "All decision-critical artifacts"],
            ["Version History", "Changes from previous version", "All iterative artifacts"],
            ["Limitations", "Known gaps, caveats, assumptions", "All analytical artifacts"]
          ],
          [22, 45, 33]
        ),
        
        new Paragraph({ spacing: { before: 200, after: 200 } }),
        
        heading("3.3 Evidence-to-Decision Mapping", HeadingLevel.HEADING_2),
        
        body("The following table maps each decision point to its required evidence artifacts. Decisions cannot be made without the specified evidence being registered, complete, and approved. This mapping ensures no decision is made based on informal or undocumented analysis."),
        
        createTable(
          ["Decision Point", "Required Evidence", "Minimum EV Count"],
          [
            ["M1 Complete (Batch 1 PASS)", "EV-008, EV-010", "2 artifacts"],
            ["M2 Complete (Dataset Freeze)", "EV-007, EV-009, EV-010", "3 artifacts"],
            ["M3 Complete (Golden Validation)", "EV-001, EV-005, EV-008, EV-010", "4 artifacts"],
            ["M4 Complete (GO/NO-GO)", "EV-001 through EV-007, EV-010, EV-011", "9+ artifacts"],
            ["Production Sign-off", "ALL registered artifacts + EV-012", "Complete registry"],
            ["Feature Freeze Exit Request", "EV-003, Root Cause analysis, Impact assessment", "Variable"],
            ["Emergency Rollback", "EV-004, Incident report, Post-mortem", "Variable"]
          ],
          [28, 47, 25]
        ),
        
        new Paragraph({ spacing: { before: 300 } }),
        
        // ===== PART 4: SEVERITY CLASSIFICATION =====
        heading("Part 4: Severity Classification System"),
        sectionDivider(),
        
        body("Not all failures carry equal weight. The Severity Classification System categorizes failures into three levels based on their impact on production readiness, reversibility, and stakeholder consequences. This classification ensures appropriate response intensity and resource allocation."),
        
        heading("4.1 Severity Definitions", HeadingLevel.HEADING_2),
        
        createTable(
          ["Severity", "Definition", "Response Time", "Notification", "Example"],
          [
            ["CRITICAL", "Production-blocking; cannot proceed without resolution", "Immediate (< 4 hours)", "CTO + VP Engineering", "FMR > 2.0%, GT systematic error"],
            ["MAJOR", "Significant quality gap; requires remediation plan", "24-48 hours", "Team Leads + CTO", "Latency warning, Single soft metric fail"],
            ["MINOR", "Deviation from target; track and trend", "Next sprint boundary", "Team Lead", "Informational metric drift, Documentation gap"]
          ],
          [14, 32, 18, 22, 34]
        ),
        
        new Paragraph({ spacing: { before: 200, after: 200 } }),
        
        heading("4.2 Failure Mode Severity Mapping", HeadingLevel.HEADING_2),
        
        body("Each identified failure mode is pre-classified to enable rapid response. When a failure occurs, teams immediately know the severity level and can activate the appropriate response procedure without deliberation."),
        
        createTable(
          ["Failure Mode", "Default Severity", "Escalation Condition", "Downgrade Condition"],
          [
            ["False Match Rate exceed", "CRITICAL", "Always CRITICAL", "Never downgrade"],
            ["Ground Truth systematic error", "CRITICAL", "Affects > 100 samples", "Isolated annotator error (< 5 samples)"],
            ["Supplier Confusion exceed", "CRITICAL", "Rate > 1.5%", "Rate 0.5-1.5% with clear cause"],
            ["OCR degradation", "MAJOR", "Affects > 2 templates", "Single template, known workaround"],
            ["Latency exceed", "MAJOR", "P99 > 500ms", "P99 200-500ms, improving trend"],
            ["Calibration drift", "MAJOR", "ECE > 5%", "ECE 2-5%, monotonicity preserved"],
            ["Documentation incomplete", "MINOR", "Blocks audit", "Non-critical document"],
            ["Minor coverage gap", "MINOR", "Affects rare template", "Edge case, low volume"]
          ],
          [26, 17, 27, 30]
        ),
        
        new Paragraph({ spacing: { before: 300 } }),
        
        // ===== PART 5: MILESTONE OWNERSHIP =====
        heading("Part 5: Milestone Ownership & Accountability"),
        sectionDivider(),
        
        body("Clear ownership eliminates ambiguity about who is accountable for each phase of the Golden Validation. The following table assigns a Primary Owner (accountable for outcome) and Supporting Owners (responsible for deliverables) for each milestone."),
        
        createTable(
          ["Milestone", "Primary Owner", "Supporting Owners", "Success Criterion"],
          [
            ["M1: Batch 1 Complete", "Data Team Lead", "QA Lead, Annotation Vendor", "500 invoices, All 5 QGs PASS, IAA \u226595%"],
            ["M2: Dataset Freeze", "Data Custodian", "Data Team, ML Engineering", "5000+ invoices, SHA-256 fingerprint, Distribution met"],
            ["M3: Golden Validation", "Benchmark Team Lead", "SRE, ML Engineering, Data", "Protocol v1.0 executed AS-IS, EV-001 complete"],
            ["M4: Delta Decision", "CTO", "All Team Leads, Data Custodian", "GO/NO-GO issued with evidence package"],
            ["Post-Golden (if PASSED)", "VP Engineering", "Product, Operations", "Production deployment plan approved"]
          ],
          [22, 22, 28, 28]
        ),
        
        new Paragraph({ spacing: { before: 200, after: 200 } }),
        
        heading("5.1 RACI Matrix for Key Activities", HeadingLevel.HEADING_2),
        
        createTable(
          ["Activity", "Data Team", "Benchmark", "ML Eng", "SRE", "CTO"],
          [
            ["Batch Collection & QC", "R/A", "C", "I", "I", "I"],
            ["Annotation & Agreement Audit", "R/A", "C", "I", "I", "I"],
            ["Protocol Execution", "C", "R/A", "C", "C", "I"],
            ["Performance Measurement", "C", "R/A", "C", "R", "I"],
            ["Root Cause Analysis", "C", "R", "R", "C", "I"],
            ["GO/NO-GO Decision", "C", "R", "C", "C", "A"],
            ["Production Sign-off", "I", "R", "C", "C", "A"],
            ["Rollback Decision", "C", "R", "R", "R", "A"]
          ],
          [28, 14, 14, 14, 14, 16]
        ),
        
        new Paragraph({ spacing: { before: 100, after: 100 } }),
        body("Legend: R = Responsible (does work), A = Accountable (owns outcome), C = Consulted, I = Informed"),
        
        new Paragraph({ spacing: { before: 300 } }),
        
        // ===== PART 6: DATASET EXPIRATION =====
        heading("Part 6: Dataset Lifecycle & Expiration Policy"),
        sectionDivider(),
        
        body("Machine learning datasets have finite useful lifetimes due to changes in business processes, supplier populations, invoice formats, and regulatory requirements. This policy establishes when the Golden Dataset must be refreshed or retired, preventing silent degradation from stale validation data."),
        
        heading("6.1 Expiration Triggers", HeadingLevel.HEADING_2),
        
        createTable(
          ["Trigger", "Threshold", "Action", "Timeline"],
          [
            ["Temporal Age", "12 months from freeze date", "Initiate refresh cycle", "30 days prior"],
            ["Drift Index", "> 20% from original distribution", "Urgent refresh", "Immediate"],
            ["Template Coverage", "> 25% of production templates not represented", "Targeted collection", "14 days"],
            ["Supplier Population", "> 30% of active suppliers not in dataset", "Augmentation", "30 days"],
            ["Regulatory Change", "New invoicing requirements mandated", "Full refresh", "As required"],
            ["Business Process Change", "ERP migration or format change", "Impact assessment", "Within 7 days"]
          ],
          [22, 30, 22, 26]
        ),
        
        new Paragraph({ spacing: { before: 200, after: 200 } }),
        
        heading("6.2 Refresh Protocol", HeadingLevel.HEADING_2),
        
        body("When expiration triggers activate, the following protocol ensures orderly dataset refresh without disrupting ongoing validation or production operations. The protocol maintains version lineage and enables comparison across dataset generations."),
        
        body("Step 1 - Assessment: Document which dimensions have drifted and quantify the extent. Estimate effort for full refresh vs. targeted augmentation. Present recommendation to Data Governance Board."),
        
        body("Step 2 - Planning: Define new dataset specification incorporating learned requirements. Update distribution targets based on production experience. Establish new collection timeline with milestones."),
        
        body("Step 3 - Collection: Execute collection per updated spec. Maintain separation from active dataset until validated. Apply all 5 Quality Gates to new data."),
        
        body("Step 4 - Validation: Run current model against new dataset. Compare metrics to establish delta. Document any performance changes attributable to dataset improvement."),
        
        body("Step 5 - Transition: Freeze new dataset with new SHA-256 fingerprint. Archive old dataset with full provenance. Update all references in governance documents. Issue transition memo."),
        
        new Paragraph({ spacing: { before: 200, after: 200 } }),
        
        heading("6.3 Version Lineage Requirements", HeadingLevel.HEADING_2),
        
        createTable(
          ["Element", "Requirement", "Format"],
          [
            ["Version Identifier", "Sequential major.minor (e.g., 1.0, 1.1, 2.0)", "Semantic versioning"],
            ["Parent Reference", "Link to previous version this derives from", "SHA-256 + version"],
            ["Change Log", "What changed and why", "Structured markdown"],
            ["Fingerprint", "Unique hash of frozen dataset contents", "SHA-256 hex"],
            ["Freeze Date", "When version was declared immutable", "ISO 8601"],
            ["Retirement Date", "When version was superseded", "ISO 8601 or NULL"],
            ["Access Log", "Who accessed and when", "Append-only audit trail"]
          ],
          [22, 40, 38]
        ),
        
        new Paragraph({ spacing: { before: 300 } }),
        
        // ===== PART 7: M1 SUCCESS CHECKLIST =====
        heading("Part 7: Milestone 1 Success Checklist"),
        sectionDivider(),
        
        body("M1 (Batch 1 Completion) is the first concrete milestone in the Evidence Generation phase. Unlike later milestones that produce analytical outputs, M1 focuses on demonstrating that the data collection and quality assurance pipeline functions correctly at scale. This checklist defines the exact conditions that must be satisfied for M1 to be marked PASS."),
        
        heading("7.1 Quantitative Requirements (All Must Pass)", HeadingLevel.HEADING_2),
        
        createTable(
          ["Check ID", "Requirement", "Threshold", "Verification Method", "Status"],
          [
            ["M1-001", "Batch Size Met", "= 500 invoices (\u00b10 acceptable)", "Automated count", "\u2610"],
            ["M1-002", "PII Removal Gate", "100% clean (0 PII incidents)", "Automated scan + manual spot-check", "\u2610"],
            ["M1-003", "Ground Truth Completeness", "\u226599% fields annotated", "Completeness audit script", "\u2610"],
            ["M1-004", "Data Integrity (Corruption)", "<5% files with issues", "File validation suite", "\u2610"],
            ["M1-005", "Supplier Distribution", "No supplier >10% of batch", "Distribution analysis", "\u2610"],
            ["M1-006", "Template Compliance", "\u00b15% of spec targets", "Template counting", "\u2610"],
            ["M1-007", "Inter-Annotator Agreement", "\u226595% pairwise agreement", "IAA calculation", "\u2610"],
            ["M1-008", "Third Review Rate", "<3% require third review", "Dispute tracking", "\u2610"],
            ["M1-009", "Final Consensus", "\u226599% consensus achieved", "Consensus resolution log", "\u2610"],
            ["M1-010", "Temporal Coverage", "\u22656 months represented", "Date range analysis", "\u2610"]
          ],
          [12, 28, 22, 25, 13]
        ),
        
        new Paragraph({ spacing: { before: 200, after: 200 } }),
        
        heading("7.2 Qualitative Requirements", HeadingLevel.HEADING_2),
        
        createTable(
          ["Check ID", "Requirement", "Evidence Required", "Verifier", "Status"],
          [
            ["M1-Q1", "Annotation Guidelines Finalized", "Approved guidelines document v1.0", "Data Custodian", "\u2610"],
            ["M1-Q2", "Annotation Tool Validated", "Tool certification report", "QA Lead", "\u2610"],
            ["M1-Q3", "Annotators Trained & Calibrated", "Training completion records", "QA Lead", "\u2610"],
            ["M1-Q4", "Dispute Resolution Process Tested", "Log of resolved disputes with outcomes", "Data Team Lead", "\u2610"],
            ["M1-Q5", "Decision Log Initiated", "First entries for M1 decisions", "CTO Office", "\u2610"],
            ["M1-Q6", "Evidence Registry Started", "EV-008, EV-010 registered", "Benchmark Team", "\u2610"]
          ],
          [12, 28, 35, 18, 7]
        ),
        
        new Paragraph({ spacing: { before: 200, after: 200 } }),
        
        heading("7.3 M1 Decision Criteria", HeadingLevel.HEADING_2),
        
        body("M1 PASS: All quantitative checks (M1-001 through M1-010) show PASS AND all qualitative checks (M1-Q1 through M1-Q6) show PASS. The M1 Decision Record (EV-010) is completed and signed by Primary Owner (Data Team Lead)."),
        
        body("M1 FAIL: Any quantitative Hard Gate (M1-001 through M1-006) fails. Root cause must be documented, corrective action taken, and batch resubmitted. No progression to M2 until M1 passes."),
        
        body("M1 CONDITIONAL: All Hard Gates pass, but one or more Quality Gates (M1-007 through M1-010) or Qualitative checks show minor deviation. May proceed to M2 with documented risk acceptance and remediation plan for M2."),
        
        new Paragraph({ spacing: { before: 300 } }),
        
        // ===== APPENDIX: ROLLBACK DECISION FRAMEWORK =====
        heading("Appendix A: Rollback Decision Framework"),
        sectionDivider(),
        
        body("This appendix addresses the critical question: What happens when Golden Validation fails? The Rollback Decision Framework ensures that failure modes have predefined response paths, preventing both premature abandonment and stubborn persistence in doomed approaches."),
        
        heading("A.1 Rollback Trigger Conditions", HeadingLevel.HEADING_2),
        
        createTable(
          ["Scenario", "Symptom", "Recommended Action", "Decision Authority"],
          [
            ["Model Fundamentally Flawed", "FMR > 5% despite data quality confirmed", "Return to Phase B/C development", "CTO + VP Engineering"],
            ["Data Insurmountable", "Cannot meet distribution after 3 collection attempts", "Reduce scope or pause project", "Steering Committee"],
            ["GT Systematically Broken", "IAA cannot reach 95% after guideline revisions", "Rebuild annotation process", "Data Custodian + CTO"],
            ["Marginal Fail", "FMR 1.6-2.0%, clear improvement path", "Conditional GO with guardrails", "CTO"],
            ["Single Dimension Fail", "One metric fails, others excellent", "Risk acceptance or targeted fix", "CTO"],
            ["Environment Issue", "Infrastructure causing failures", "Fix environment, re-run", "VP Engineering"]
          ],
          [22, 30, 28, 20]
        ),
        
        new Paragraph({ spacing: { before: 200, after: 200 } }),
        
        heading("A.2 Rollback Options Matrix", HeadingLevel.HEADING_2),
        
        createTable(
          ["Option", "When Applicable", "Cost", "Timeline Impact", "Risk"],
          [
            ["Full Model Retrain", "Architecture sound, data now good", "High compute cost", "+2-4 weeks", "Low"],
            ["Data Recollection", "Original data biased/corrupted", "Annotation cost", "+3-6 weeks", "Medium"],
            ["Scope Reduction", "Cannot cover all edge cases", "Reduced value", "+1-2 weeks", "Business"],
            ["Threshold Adjustment", "Targets were unrealistic", "Governance change", "+1 week", "Stakeholder"],
            ["Project Pause", "Fundamental feasibility issue", "Opportunity cost", "Indefinite", "Strategic"],
            ["Production with Constraints", "Good enough for limited use", "Monitoring cost", "None", "Operational"]
          ],
          [20, 28, 17, 17, 18]
        ),
        
        new Paragraph({ spacing: { before: 200, after: 200 } }),
        
        heading("A.3 Rollback Decision Tree", HeadingLevel.HEADING_2),
        
        body("Step 1 - Confirm Failure: Verify that the failure is real and not a measurement artifact. Re-run validation with different random seed if applicable. Have results independently reviewed."),
        
        body("Step 2 - Classify Failure Type: Use Severity Classification (Part 4) to determine if this is CRITICAL, MAJOR, or MINOR. Map to Failure Mode (Part 2) to identify likely root cause."),
        
        body("Step 3 - Evaluate Options: For the classified failure, identify applicable rollback options from Matrix A.2. Estimate cost, timeline, and risk for each option."),
        
        body("Step 4 - Recommend Action: Prepare recommendation document with option analysis. Include evidence (EV-series artifacts). Present to Decision Authority."),
        
        body("Step 5 - Execute & Document: Upon approval, execute chosen option. Document all actions in Decision Log. Update Evidence Registry. Communicate to stakeholders."),
        
        new Paragraph({ spacing: { before: 300 } }),
        
        // ===== DOCUMENT CONTROL =====
        heading("Document Control"),
        sectionDivider(),
        
        createTable(
          ["Version", "Date", "Author", "Changes", "Approver"],
          [
            ["1.0.0", new Date().toISOString().split('T')[0], "Evidence Governance Team", "Initial release addressing CTO P0/P1/P2 feedback", "CTO Pending"]
          ],
          [12, 18, 25, 35, 10]
        ),
        
        new Paragraph({ spacing: { before: 200 } }),
        body("This document is part of the Invoice Brain Governance Framework and is controlled under Feature Freeze Protocol v1.0. Changes to this document require CTO approval and must be reflected in the Decision Log (EV-010).")
      ]
    }
  ]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync("/home/z/my-project/download/Evidence-Governance-Framework.docx", buffer);
  console.log("Document generated: /home/z/my-project/download/Evidence-Governance-Framework.docx");
}

generateDocument().catch(console.error);
