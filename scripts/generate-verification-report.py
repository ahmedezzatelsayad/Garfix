#!/usr/bin/env python3
"""
Invoice Brain Verification Suite Report Generator
=================================================
Generates professional PDF report for Benchmark Verification Suite v4.0
"""

import json
import os
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, cm, mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, 
    PageBreak, Image, ListFlowable, ListItem, KeepTogether
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.enums import TA_RIGHT, TA_CENTER, TA_LEFT, TA_JUSTIFY

# Font registration
FONT_DIR = '/usr/share/fonts'

# Register Chinese fonts (Noto Serif SC for all text)
pdfmetrics.registerFont(TTFont('NotoSerifSC', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('NotoSerifSC-Bold', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf'))
# Use Noto Serif SC as fallback for sans (variable fonts not compatible with ReportLab)


# Register English fonts for any Latin text
pdfmetrics.registerFont(TTFont('LiberationSans', f'{FONT_DIR}/truetype/liberation/LiberationSans-Regular.ttf'))
pdfmetrics.registerFont(TTFont('LiberationSans-Bold', f'{FONT_DIR}/truetype/liberation/LiberationSans-Bold.ttf'))

def create_styles():
    """Create custom paragraph styles for the report"""
    styles = getSampleStyleSheet()
    
    # Title style
    styles.add(ParagraphStyle(
        name='ArabicTitle',
        fontName='NotoSerifSC-Bold',
        fontSize=24,
        leading=32,
        alignment=TA_CENTER,
        spaceAfter=12,
        textColor=colors.HexColor('#1e293b')
    ))
    
    # Subtitle style
    styles.add(ParagraphStyle(
        name='ArabicSubtitle',
        fontName='NotoSerifSC',
        fontSize=14,
        leading=20,
        alignment=TA_CENTER,
        spaceAfter=24,
        textColor=colors.HexColor('#64748b')
    ))
    
    # Section heading
    styles.add(ParagraphStyle(
        name='SectionHeading',
        fontName='NotoSerifSC-Bold',
        fontSize=16,
        leading=24,
        spaceBefore=18,
        spaceAfter=12,
        textColor=colors.HexColor('#0f172a'),
        borderPadding=(0, 0, 4, 0),
        borderWidth=0,
        borderColor=colors.HexColor('#3b82f6')
    ))
    
    # Subsection heading
    styles.add(ParagraphStyle(
        name='SubsectionHeading',
        fontName='NotoSerifSC-Bold',
        fontSize=13,
        leading=18,
        spaceBefore=12,
        spaceAfter=8,
        textColor=colors.HexColor('#334155')
    ))
    
    # Body text - Arabic
    styles.add(ParagraphStyle(
        name='ArabicBody',
        fontName='NotoSerifSC',
        fontSize=10,
        leading=16,
        alignment=TA_JUSTIFY,
        spaceBefore=4,
        spaceAfter=8,
        textColor=colors.HexColor('#1e293b'),
        firstLineIndent=0
    ))
    
    # Body text - English
    styles.add(ParagraphStyle(
        name='EnglishBody',
        fontName='LiberationSans',
        fontSize=10,
        leading=15,
        alignment=TA_LEFT,
        spaceBefore=4,
        spaceAfter=8,
        textColor=colors.HexColor('#1e293b')
    ))
    
    # Code/Technical style
    styles.add(ParagraphStyle(
        name='CodeText',
        fontName='LiberationSans',
        fontSize=9,
        leading=12,
        spaceBefore=2,
        spaceAfter=2,
        leftIndent=20,
        textColor=colors.HexColor('#374151'),
        backColor=colors.HexColor('#f3f4f6')
    ))
    
    # Highlight box
    styles.add(ParagraphStyle(
        name='HighlightBox',
        fontName='NotoSerifSC',
        fontSize=10,
        leading=15,
        alignment=TA_CENTER,
        spaceBefore=8,
        spaceAfter=8,
        textColor=colors.HexColor('#1e40af'),
        backColor=colors.HexColor('#dbeafe'),
        borderPadding=8
    ))
    
    # Warning box
    styles.add(ParagraphStyle(
        name='WarningBox',
        fontName='NotoSerifSC',
        fontSize=10,
        leading=15,
        alignment=TA_LEFT,
        spaceBefore=8,
        spaceAfter=8,
        textColor=colors.HexColor('#92400e'),
        backColor=colors.HexColor('#fef3c7'),
        borderPadding=8,
        leftIndent=10
    ))
    
    return styles


class VerificationReportGenerator:
    def __init__(self, output_path, data_path=None):
        self.output_path = output_path
        self.data_path = data_path or '/home/z/my-project/download/verification-suite-results.json'
        self.styles = create_styles()
        self.data = None
        
    def load_data(self):
        """Load verification results from JSON"""
        if os.path.exists(self.data_path):
            with open(self.data_path, 'r', encoding='utf-8') as f:
                self.data = json.load(f)
            return True
        return False
    
    def generate_report(self):
        """Generate the complete PDF report"""
        if not self.load_data():
            print("Warning: Could not load verification data, generating template report")
        
        doc = SimpleDocTemplate(
            self.output_path,
            pagesize=A4,
            rightMargin=2*cm,
            leftMargin=2*cm,
            topMargin=2*cm,
            bottomMargin=2*cm
        )
        
        story = []
        
        # Build sections
        story.extend(self.create_cover_section())
        story.append(PageBreak())
        
        story.extend(self.create_executive_summary())
        story.append(PageBreak())
        
        story.extend(self.create_invariant_check_section())
        story.append(PageBreak())
        
        story.extend(self.create_root_cause_section())
        story.append(PageBreak())
        
        story.extend(self.create_confusion_matrix_section())
        story.append(PageBreak())
        
        story.extend(self.create_decision_trace_section())
        story.append(PageBreak())
        
        story.extend(self.create_golden_dataset_section())
        story.append(PageBreak())
        
        story.extend(self.create_recommendations_section())
        
        # Build PDF
        doc.build(story)
        print(f"Report generated: {self.output_path}")
        return self.output_path
    
    def create_cover_section(self):
        """Create cover page content"""
        elements = []
        
        elements.append(Spacer(1, 2*cm))
        
        # Main title
        elements.append(Paragraph(
            "Invoice Brain",
            self.styles['ArabicTitle']
        ))
        
        elements.append(Paragraph(
            "Benchmark Verification Suite v4.0",
            self.styles['ArabicTitle']
        ))
        
        elements.append(Spacer(1, 0.5*cm))
        
        # Subtitle
        elements.append(Paragraph(
            "Auditing the Measurement System Before Judging the Engine",
            self.styles['ArabicSubtitle']
        ))
        
        elements.append(Spacer(1, 1*cm))
        
        # Key metrics box
        if self.data:
            verdict = self.data.get('overallVerdict', {})
            status = verdict.get('status', 'UNKNOWN')
            methodology_score = verdict.get('methodologyScore', 'N/A')
            confidence_score = verdict.get('confidenceScore', 'N/A')
            
            metrics_data = [
                ['Status', 'Methodology Score', 'Confidence in Numbers'],
                [status, f"{methodology_score}/10", f"{confidence_score}/10"]
            ]
            
            metrics_table = Table(metrics_data, colWidths=[4*cm, 4*cm, 4*cm])
            metrics_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e40af')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'NotoSerifSC-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 11),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                ('TOPPADDING', (0, 0), (-1, 0), 12),
                ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#eff6ff')),
                ('TEXTCOLOR', (0, 1), (-1, -1), colors.HexColor('#1e40af')),
                ('FONTNAME', (0, 1), (-1, -1), 'NotoSerifSC'),
                ('FONTSIZE', (0, 1), (-1, -1), 12),
                ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#bfdbfe')),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ]))
            elements.append(metrics_table)
        
        elements.append(Spacer(1, 1.5*cm))
        
        # Date and version info
        elements.append(Paragraph(
            f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}",
            self.styles['ArabicSubtitle']
        ))
        
        elements.append(Paragraph(
            "Version 4.0-Audit | Confidential",
            self.styles['ArabicSubtitle']
        ))
        
        return elements
    
    def create_executive_summary(self):
        """Create executive summary section"""
        elements = []
        
        elements.append(Paragraph("Executive Summary", self.styles['SectionHeading']))
        
        if self.data:
            verdict = self.data.get('overallVerdict', {})
            
            # What we proved
            elements.append(Paragraph("What This Audit Proved", self.styles['SubsectionHeading']))
            
            for item in verdict.get('whatWasProved', []):
                elements.append(Paragraph(f"✓ {item}", self.styles['ArabicBody']))
            
            elements.append(Spacer(1, 0.3*cm))
            
            # What remains
            elements.append(Paragraph("What Remains to Be Done", self.styles['SubsectionHeading']))
            
            for item in verdict.get('whatRemains', []):
                elements.append(Paragraph(f"○ {item}", self.styles['ArabicBody']))
        
        elements.append(Spacer(1, 0.5*cm))
        
        # Key insight box
        elements.append(Paragraph(
            "The real progress here is not reaching specific numbers, but starting to distinguish "
            "between system errors and measurement tool errors.",
            self.styles['HighlightBox']
        ))
        
        return elements
    
    def create_invariant_check_section(self):
        """Create invariant check results section"""
        elements = []
        
        elements.append(Paragraph("Phase 1: Benchmark Invariant Checks", self.styles['SectionHeading']))
        
        elements.append(Paragraph(
            "Benchmark Invariants are mathematical assertions that MUST hold true for any valid benchmark. "
            "If any invariant fails, the benchmark results are UNTRUSTWORTHY and should NOT be used for decision-making. "
            "This is analogous to unit tests for your measurement system - they catch bugs before they propagate to conclusions.",
            self.styles['ArabicBody']
        ))
        
        if self.data:
            inv_check = self.data.get('invariantCheck', {})
            summary = inv_check.get('summary', {})
            verdict = inv_check.get('verdict', {})
            
            # Summary table
            elements.append(Paragraph("Invariant Check Summary", self.styles['SubsectionHeading']))
            
            summary_data = [
                ['Metric', 'Value'],
                ['Total Invariants', str(summary.get('passed', 0) + summary.get('violations', 0) + summary.get('warnings', 0))],
                ['Passed', str(summary.get('passed', 0))],
                ['Violations', str(summary.get('violations', 0))],
                ['Warnings', str(summary.get('warnings', 0))],
                ['Validity Score', str(summary.get('validityScore', 'N/A'))],
                ['Overall Status', verdict.get('status', 'UNKNOWN')]
            ]
            
            summary_table = Table(summary_data, colWidths=[7*cm, 6*cm])
            summary_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#334155')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'NotoSerifSC-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
            ]))
            elements.append(summary_table)
            elements.append(Spacer(1, 0.3*cm))
            
            # Warnings detail
            warnings = inv_check.get('warnings', [])
            if warnings:
                elements.append(Paragraph("Warnings Detected", self.styles['SubsectionHeading']))
                
                for warning in warnings:
                    warning_text = f"[{warning.get('id', '')}] {warning.get('reason', '')}"
                    elements.append(Paragraph(warning_text, self.styles['WarningBox']))
                    
                    if warning.get('details'):
                        details = warning.get('details')
                        if isinstance(details, dict):
                            for key, value in details.items():
                                elements.append(Paragraph(
                                    f"  • {key}: {value}",
                                    self.styles['CodeText']
                                ))
                    
                    recommendation = warning.get('recommendation')
                    if recommendation:
                        elements.append(Paragraph(
                            f"Recommendation: {recommendation}",
                            self.styles['EnglishBody']
                        ))
        
        # Invariants list explanation
        elements.append(Spacer(1, 0.3*cm))
        elements.append(Paragraph("Invariant Definitions", self.styles['SubsectionHeading']))
        
        invariants_list = [
            ("MATRIX_COMPLETENESS", "TP + FP + FN + TN must equal total invoices"),
            ("PRECISION_CONSISTENCY", "Reported Precision must match matrix calculation"),
            ("RECALL_CONSISTENCY", "Reported Recall must match matrix calculation"),
            ("FMR_DUAL_CALCULATION", "FMR calculated two ways must agree"),
            ("OUTCOME_EXHAUSTIVENESS", "Every invoice has exactly one outcome"),
            ("AI_ROUTING_MATCH", "Reported AI rate equals actual AI fallbacks"),
            ("NO_NEGATIVE_COUNTS", "All confusion matrix values are non-negative"),
            ("TN_NOT_ALWAYS_ZERO", "System must have some correct rejections (TN > 0)"),
            ("FN_NOT_ALWAYS_ZERO", "System must miss some matches (not 100% recall)"),
            ("CONFIDENCE_RANGE", "All confidences are in valid range [0, 1]"),
            ("SPLIT_TOTALS_MATCH", "Sum of splits equals total invoices"),
            ("GROUND_TRUTH_COVERAGE", "Every invoice has ground truth")
        ]
        
        for code, desc in invariants_list:
            elements.append(Paragraph(f"• <b>{code}</b>: {desc}", self.styles['ArabicBody']))
        
        return elements
    
    def create_root_cause_section(self):
        """Create root cause attribution section"""
        elements = []
        
        elements.append(Paragraph("Phase 2: Root Cause Attribution System", self.styles['SectionHeading']))
        
        elements.append(Paragraph(
            "Every False Match must have EXACTLY ONE root cause. No more grouping everything under vague categories like "
            "'Semantic Scoring Issues'. This system provides per-invoice failure diagnosis that enables targeted fixes rather than "
            "guesswork-based optimization. The root causes are organized by pipeline stage, making it clear WHERE in the processing "
            "flow failures occur, not just THAT they occur.",
            self.styles['ArabicBody']
        ))
        
        if self.data:
            rca = self.data.get('rootCauseAnalysis', {})
            
            # Summary stats
            total_fm = rca.get('totalFalseMatches', 0)
            elements.append(Paragraph(f"Total False Matches Attributed: {total_fm}", self.styles['SubsectionHeading']))
            
            # Breakdown table
            breakdown = rca.get('breakdown', {})
            if breakdown:
                breakdown_data = [['Root Cause', 'Count', '%', 'Stage', 'Severity']]
                
                for code, info in breakdown.items():
                    breakdown_data.append([
                        info.get('code', code)[:30],
                        str(info.get('count', 0)),
                        info.get('percentage', '0%'),
                        info.get('stage', ''),
                        info.get('severity', '')
                    ])
                
                if len(breakdown_data) > 1:
                    breakdown_table = Table(breakdown_data, colWidths=[4.5*cm, 1.5*cm, 1.5*cm, 3*cm, 2*cm])
                    breakdown_table.setStyle(TableStyle([
                        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#7c3aed')),
                        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                        ('ALIGN', (0, 1), (0, -1), 'LEFT'),
                        ('FONTNAME', (0, 0), (-1, 0), 'NotoSerifSC-Bold'),
                        ('FONTSIZE', (0, 0), (-1, -1), 8),
                        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
                        ('TOPPADDING', (0, 0), (-1, -1), 5),
                        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#ddd6fe')),
                        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f3ff')]),
                    ]))
                    elements.append(breakdown_table)
            
            # By Stage grouping
            by_stage = rca.get('byStage', {})
            if by_stage:
                elements.append(Spacer(1, 0.3*cm))
                elements.append(Paragraph("Breakdown by Pipeline Stage", self.styles['SubsectionHeading']))
                
                stage_data = [['Stage', 'False Matches', 'Causes']]
                for stage, info in by_stage.items():
                    stage_data.append([
                        stage,
                        str(info.get('count', 0)),
                        ', '.join(info.get('causes', []))
                    ])
                
                stage_table = Table(stage_data, colWidths=[4*cm, 2.5*cm, 6*cm])
                stage_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#059669')),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                    ('FONTNAME', (0, 0), (-1, 0), 'NotoSerifSC-Bold'),
                    ('FONTSIZE', (0, 0), (-1, -1), 9),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                    ('TOPPADDING', (0, 0), (-1, -1), 6),
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#a7f3d0')),
                    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#ecfdf5')]),
                ]))
                elements.append(stage_table)
        
        # Root cause categories explanation
        elements.append(Spacer(1, 0.3*cm))
        elements.append(Paragraph("Root Cause Categories Defined", self.styles['SubsectionHeading']))
        
        categories = [
            ("CANDIDATE_SELECTION", [
                ("SUPPLIER_GATE_BYPASS", "Supplier Ownership Gate was bypassed - cross-supplier candidate allowed"),
                ("CANDIDATE_POOL_BUG", "Wrong candidates in pool - tenant isolation failed")
            ]),
            ("SEMANTIC_RANKING", [
                ("SEMANTIC_SCORE_SELECTED_WRONG", "Semantic scoring ranked wrong candidate highest"),
                ("TIE_BREAKING_FAILURE", "Tie-breaking logic selected wrong candidate"),
                ("SIMILARITY_BUG", "String similarity calculation error")
            ]),
            ("DECISION_POLICY", [
                ("THRESHOLD_TOO_LOW", "Confidence threshold too low - accepted bad match"),
                ("THRESHOLD_TOO_HIGH", "Confidence threshold too high - rejected good match"),
                ("DECISION_POLICY_ERROR", "Decision policy routed incorrectly")
            ]),
            ("DATA_QUALITY", [
                ("SHARED_LAYOUT_COLLISION", "Multiple suppliers share same layout (ERP collision)"),
                ("OCR_NOISE_IMPACT", "OCR errors caused incorrect scoring"),
                ("DATASET_BIAS", "Synthetic dataset bias caused unrealistic scenario")
            ])
        ]
        
        for stage, causes in categories:
            elements.append(Paragraph(f"<b>{stage}</b>", self.styles['EnglishBody']))
            for code, desc in causes:
                elements.append(Paragraph(f"  • {code}: {desc}", self.styles['CodeText']))
        
        return elements
    
    def create_confusion_matrix_section(self):
        """Create fixed confusion matrix section"""
        elements = []
        
        elements.append(Paragraph("Phase 3: Fixed Confusion Matrix", self.styles['SectionHeading']))
        
        elements.append(Paragraph(
            "The original Confusion Matrix had critical definition flaws that led to TN=0 and FN=0 anomalies. "
            "These anomalies made it appear that the system never correctly rejected to AI (TN=0) and never missed "
            "any matches (FN=0). Both of these are unrealistic for any production system and indicate measurement bugs, "
            "not perfect performance. The fixed matrix properly distinguishes between:",
            self.styles['ArabicBody']
        ))
        
        definitions = [
            "<b>TP (True Positive)</b>: Correctly matched to pattern - invoice went to correct supplier via pattern matching",
            "<b>FP (False Positive / FALSE MATCH)</b>: Incorrectly matched to pattern - WRONG supplier selected (the critical metric!)",
            "<b>FN (False Negative)</b>: Had correct pattern available but system chose AI instead (missed opportunity)",
            "<b>TN (True Negative)</b>: Correctly sent to AI - either no pattern existed OR confidence was genuinely low"
        ]
        
        for defn in definitions:
            elements.append(Paragraph(defn, self.styles['ArabicBody']))
        
        elements.append(Spacer(1, 0.3*cm))
        
        if self.data:
            matrix_demo = self.data.get('fixedConfusionMatrixDemo', {})
            
            if matrix_demo:
                elements.append(Paragraph("Demonstration Results", self.styles['SubsectionHeading']))
                
                # Matrix visualization
                m = matrix_demo.get('matrix', {})
                matrix_data = [
                    ['', 'Predicted: Pattern', 'Predicted: AI', 'Total'],
                    ['Actual: Matchable', str(m.get('tp', 0)), str(m.get('fn', 0)), str((m.get('tp', 0) or 0) + (m.get('fn', 0) or 0))],
                    ['Actual: Not Matchable', str(m.get('fp', 0)), str(m.get('tn', 0)), str((m.get('fp', 0) or 0) + (m.get('tn', 0) or 0))],
                    ['Total', str((m.get('tp', 0) or 0) + (m.get('fp', 0) or 0)), 
                     str((m.get('fn', 0) or 0) + (m.get('tn', 0) or 0)), 
                     str((m.get('tp', 0) or 0) + (m.get('fp', 0) or 0) + (m.get('fn', 0) or 0) + (m.get('tn', 0) or 0))]
                ]
                
                matrix_table = Table(matrix_data, colWidths=[4*cm, 3.5*cm, 3*cm, 2.5*cm])
                matrix_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#dc2626')),
                    ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#dc2626')),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                    ('TEXTCOLOR', (0, 0), (0, -1), colors.white),
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                    ('FONTNAME', (0, 0), (-1, 0), 'NotoSerifSC-Bold'),
                    ('FONTNAME', (0, 0), (0, -1), 'NotoSerifSC-Bold'),
                    ('FONTSIZE', (0, 0), (-1, -1), 9),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
                    ('TOPPADDING', (0, 0), (-1, -1), 8),
                    ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#fecaca')),
                    ('BACKGROUND', (1, 1), (1, 1), colors.HexColor('#dcfce7')),  # TP - green
                    ('BACKGROUND', (2, 1), (2, 1), colors.HexColor('#fef3c7')),  # FN - yellow
                    ('BACKGROUND', (1, 2), (1, 2), colors.HexColor('#fee2e2')),  # FP - red
                    ('BACKGROUND', (2, 2), (2, 2), colors.HexColor('#dbeafe')),  # TN - blue
                ]))
                elements.append(matrix_table)
                
                elements.append(Spacer(1, 0.3*cm))
                
                # Key improvements
                elements.append(Paragraph("Key Fixes Demonstrated:", self.styles['SubsectionHeading']))
                
                improvements = [
                    f"TP={m.get('tp', 0)} FP={m.get('fp', 0)} FN={m.get('fn', 0)} TN={m.get('tn', 0)}",
                    f"TN is now {'NON-ZERO' if m.get('tn', 0) > 0 else 'ZERO'} (was always 0 before!)",
                    f"FN is now {'NON-ZERO' if m.get('fn', 0) > 0 else 'ZERO'} (was always 0 before!)",
                    f"FMR: {(matrix_demo.get('falseMatchRate', 0) * 100):.1f}%",
                    f"Recall: {(matrix_demo.get('recall', 0) * 100):.1f}% (no longer 100%!)",
                    f"AI Routing Rate: {(matrix_demo.get('aiRoutingRate', 0) * 100):.1f}%",
                    f"Correct AI Rate: {(matrix_demo.get('correctAiRate', 0) * 100):.1f}%"
                ]
                
                for imp in improvements:
                    elements.append(Paragraph(f"✓ {imp}", self.styles['ArabicBody']))
                
                # Health check
                health = matrix_demo.get('summary', {}).get('healthCheck', {})
                if health:
                    elements.append(Spacer(1, 0.2*cm))
                    health_status = "HEALTHY" if health.get('healthy') else "ISSUES DETECTED"
                    elements.append(Paragraph(f"Health Check: {health_status}", self.styles['HighlightBox'] if health.get('healthy') else self.styles['WarningBox']))
        
        return elements
    
    def create_decision_trace_section(self):
        """Create per-candidate decision trace section"""
        elements = []
        
        elements.append(Paragraph("Phase 4: Per-Candidate Decision Trace", self.styles['SectionHeading']))
        
        elements.append(Paragraph(
            "The Per-Candidate Decision Trace provides full visibility into every stage of candidate filtering. "
            "Instead of only seeing the final decision, we can now see exactly how many candidates existed at each stage, "
            "which ones were filtered out, why they were filtered, and what scores were assigned. This level of transparency "
            "is essential for debugging production issues and understanding system behavior on edge cases.",
            self.styles['ArabicBody']
        ))
        
        elements.append(Paragraph("Pipeline Stages Traced:", self.styles['SubsectionHeading']))
        
        stages = [
            ("<b>Stage 1: Initial Pool</b>", "All candidates with matching layout hash before any filtering"),
            ("<b>Stage 2: Tenant Filter</b>", "Candidates from wrong tenant removed (tenant isolation)"),
            ("<b>Stage 3: Supplier Gate</b>", "Ownership verification - ensures no cross-supplier leakage"),
            ("<b>Stage 4: Semantic Ranking</b>", "Candidates scored and ranked by similarity"),
            ("<b>Stage 5: Final Decision</b>", "Pattern match, AI fallback, or false match determination")
        ]
        
        for title, desc in stages:
            elements.append(Paragraph(f"{title}: {desc}", self.styles['ArabicBody']))
        
        if self.data:
            trace_analysis = self.data.get('decisionTraceAnalysis', {})
            
            if trace_analysis:
                # Sample trace display
                sample_trace = trace_analysis.get('sampleTrace')
                if sample_trace:
                    elements.append(Spacer(1, 0.3*cm))
                    elements.append(Paragraph("Sample Decision Trace Output", self.styles['SubsectionHeading']))
                    
                    # Extract key info from trace
                    invoice_id = sample_trace.get('invoiceId', 'N/A')
                    s1 = sample_trace.get('stage1_initialPool', {})
                    s2 = sample_trace.get('stage2_tenantFilter', {})
                    s3 = sample_trace.get('stage3_supplierGate', {})
                    s4 = sample_trace.get('stage4_semanticRanking', {})
                    s5 = sample_trace.get('stage5_finalDecision', {})
                    
                    trace_data = [
                        ['Stage', 'Input Count', 'Output Count', 'Key Event'],
                        ['Initial Pool', '-', str(s1.get('totalCount', 0)), f"{s1.get('totalCount', 0)} candidates found"],
                        ['Tenant Filter', str(s1.get('totalCount', 0)), str(s2.get('outputCount', 0)), f"{len(s2.get('filteredOut', []))} filtered out"],
                        ['Supplier Gate', str(s2.get('outputCount', 0)), str(s3.get('outputCount', 0)), s3.get('gateDecision', '-')],
                        ['Semantic Rank', str(s3.get('outputCount', 0)), '1 (top)', f"Top score: {s4.get('topCandidate', {}).get('score', 'N/A')}"],
                        ['Final Decision', '1', '-', f"{s5.get('outcome', 'N/A')} (correct: {s5.get('isCorrectMatch', 'N/A')})"]
                    ]
                    
                    trace_table = Table(trace_data, colWidths=[3*cm, 2.5*cm, 2.5*cm, 5*cm])
                    trace_table.setStyle(TableStyle([
                        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0891b2')),
                        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                        ('ALIGN', (3, 1), (3, -1), 'LEFT'),
                        ('FONTNAME', (0, 0), (-1, 0), 'NotoSerifSC-Bold'),
                        ('FONTSIZE', (0, 0), (-1, -1), 8),
                        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                        ('TOPPADDING', (0, 0), (-1, -1), 6),
                        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cffafe')),
                        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#ecfeff')]),
                    ]))
                    elements.append(trace_table)
                
                # Funnel statistics
                funnel_stats = trace_analysis.get('funnelStats')
                if funnel_stats:
                    elements.append(Spacer(1, 0.3*cm))
                    elements.append(Paragraph("Aggregate Funnel Statistics", self.styles['SubsectionHeading']))
                    
                    avg_funnel = funnel_stats.get('averageFunnel', {})
                    funnel_data = [
                        ['Metric', 'Average Value'],
                        ['Initial Candidates', avg_funnel.get('initial', 'N/A')],
                        ['After Tenant Filter', avg_funnel.get('afterTenantFilter', 'N/A')],
                        ['After Supplier Gate', avg_funnel.get('afterSupplierGate', 'N/A')],
                        ['Final Selection', avg_funnel.get('final', 'N/A')]
                    ]
                    
                    funnel_table = Table(funnel_data, colWidths=[5*cm, 4*cm])
                    funnel_table.setStyle(TableStyle([
                        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#6366f1')),
                        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                        ('FONTNAME', (0, 0), (-1, 0), 'NotoSerifSC-Bold'),
                        ('FONTSIZE', (0, 0), (-1, -1), 9),
                        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                        ('TOPPADDING', (0, 0), (-1, -1), 6),
                        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#c7d2fe')),
                        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#eef2ff')]),
                    ]))
                    elements.append(funnel_table)
        
        return elements
    
    def create_golden_dataset_section(self):
        """Create golden dataset framework section"""
        elements = []
        
        elements.append(Paragraph("Phase 5: Golden Dataset Framework", self.styles['SectionHeading']))
        
        elements.append(Paragraph(
            "The Golden Dataset is the immutable test standard for Invoice Brain benchmarking. Unlike synthetic datasets "
            "that may have hidden biases or unrealistic distributions, the Golden Dataset contains REAL invoices with "
            "HUMAN-VERIFIED ground truth. This is essential for obtaining trustworthy benchmark results that reflect actual "
            "production performance, detecting overfitting to synthetic patterns, supporting regulatory audits, and enabling "
            "consistent comparison between engine versions over time.",
            self.styles['ArabicBody']
        ))
        
        if self.data:
            golden_spec = self.data.get('goldenDatasetSpecification', {})
            
            if golden_spec:
                # Size requirements
                size_spec = golden_spec.get('sizeSpecification', {})
                if size_spec:
                    elements.append(Paragraph("Size Requirements", self.styles['SubsectionHeading']))
                    
                    size_data = [
                        ['Requirement', 'Minimum', 'Target', 'Maximum'],
                        ['Suppliers', str(size_spec.get('minSuppliers', 'N/A')), '-', '-'],
                        ['Invoices per Supplier', 
                         str(size_spec.get('invoicesPerSupplier', {}).get('min', 'N/A')),
                         str(size_spec.get('invoicesPerSupplier', {}).get('target', 'N/A')),
                         str(size_spec.get('invoicesPerSupplier', {}).get('max', 'N/A'))],
                        ['Total Invoices',
                         str(size_spec.get('totalInvoices', {}).get('min', 'N/A')),
                         str(size_spec.get('totalInvoices', {}).get('target', 'N/A')),
                         str(size_spec.get('totalInvoices', {}).get('max', 'N/A'))]
                    ]
                    
                    size_table = Table(size_data, colWidths=[4.5*cm, 3*cm, 3*cm, 3*cm])
                    size_table.setStyle(TableStyle([
                        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#ea580c')),
                        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                        ('FONTNAME', (0, 0), (-1, 0), 'NotoSerifSC-Bold'),
                        ('FONTSIZE', (0, 0), (-1, -1), 9),
                        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                        ('TOPPADDING', (0, 0), (-1, -1), 6),
                        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#fed7aa')),
                        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#fff7ed')]),
                    ]))
                    elements.append(size_table)
                
                # Diversity requirements
                diversity = golden_spec.get('diversityRequirements', {})
                if diversity:
                    elements.append(Spacer(1, 0.3*cm))
                    elements.append(Paragraph("Diversity Requirements", self.styles['SubsectionHeading']))
                    
                    for category, values in diversity.items():
                        elements.append(Paragraph(f"<b>{category.replace('_', ' ').title()}</b>: {', '.join(values[:5])}{'...' if len(values) > 5 else ''}", self.styles['EnglishBody']))
                
                # Required scenarios
                scenarios = golden_spec.get('requiredScenarios', {})
                if scenarios:
                    elements.append(Spacer(1, 0.3*cm))
                    elements.append(Paragraph("Required Test Scenarios", self.styles['SubsectionHeading']))
                    
                    scenario_data = [['Scenario', 'Description', 'Min Instances']]
                    for scenario_name, scenario_info in scenarios.items():
                        scenario_data.append([
                            scenario_name.replace('_', ' ').title()[:25],
                            scenario_info.get('description', 'N/A')[:40] + ('...' if len(scenario_info.get('description', '')) > 40 else ''),
                            str(scenario_info.get('minInstances', 'N/A'))
                        ])
                    
                    if len(scenario_data) > 1:
                        scenario_table = Table(scenario_data, colWidths=[3.5*cm, 7*cm, 2.5*cm])
                        scenario_table.setStyle(TableStyle([
                            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#16a34a')),
                            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                            ('ALIGN', (2, 0), (2, -1), 'CENTER'),
                            ('FONTNAME', (0, 0), (-1, 0), 'NotoSerifSC-Bold'),
                            ('FONTSIZE', (0, 0), (-1, -1), 8),
                            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
                            ('TOPPADDING', (0, 0), (-1, -1), 5),
                            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#bbf7d0')),
                            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f0fdf4')]),
                        ]))
                        elements.append(scenario_table)
        
        # Collection checklist summary
        elements.append(Spacer(1, 0.3*cm))
        elements.append(Paragraph("Collection Process Overview", self.styles['SubsectionHeading']))
        
        collection_steps = [
            ("Step 1: Data Export (2 days)", "Export random sample from production covering all suppliers"),
            ("Step 2: Initial Screening (3 days)", "Remove duplicates, corrupted files, incomplete invoices"),
            ("Step 3: Ground Truth Annotation (15 days)", "Domain experts verify each invoice's correct classification"),
            ("Step 4: Quality Assurance (5 days)", "Second reviewer validates 20% sample, calculate inter-rater reliability"),
            ("Step 5: Dataset Locking (2 days)", "Generate hashes, make immutable, store securely")
        ]
        
        for step, desc in collection_steps:
            elements.append(Paragraph(f"<b>{step}</b>: {desc}", self.styles['ArabicBody']))
        
        return elements
    
    def create_recommendations_section(self):
        """Create recommendations section"""
        elements = []
        
        elements.append(Paragraph("Recommendations & Next Steps", self.styles['SectionHeading']))
        
        if self.data:
            recommendations = self.data.get('recommendations', [])
            
            if recommendations:
                # Priority table
                rec_data = [['Priority', 'Action', 'Effort', 'Status']]
                
                for rec in recommendations:
                    priority = rec.get('priority', '')
                    title = rec.get('title', '')
                    effort = rec.get('effort', '')
                    status = rec.get('status', '')
                    
                    # Determine status icon/color
                    if status == 'READY_TO_RUN':
                        status_display = 'READY'
                    elif status == 'BLOCKED':
                        status_display = 'BLOCKED'
                    elif status == 'NOT_STARTED':
                        status_display = 'PENDING'
                    else:
                        status_display = status
                    
                    rec_data.append([priority, title, effort, status_display])
                
                rec_table = Table(rec_data, colWidths=[3.5*cm, 6*cm, 2*cm, 2.5*cm])
                rec_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e293b')),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                    ('ALIGN', (2, 0), (3, -1), 'CENTER'),
                    ('FONTNAME', (0, 0), (-1, 0), 'NotoSerifSC-Bold'),
                    ('FONTSIZE', (0, 0), (-1, -1), 9),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                    ('TOPPADDING', (0, 0), (-1, -1), 6),
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#94a3b8')),
                    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
                ]))
                elements.append(rec_table)
        
        elements.append(Spacer(1, 0.5*cm))
        
        # Final assessment
        elements.append(Paragraph("Current Assessment", self.styles['SubsectionHeading']))
        
        assessment_text = """
The Verification Suite v4.0 successfully addresses the CTO's concerns about measurement system validity. 
We have proven that the previous benchmark reports contained genuine flaws (Answer Leakage, Confusion Matrix 
definition errors, missing Root Cause Attribution) and have built infrastructure to prevent these issues 
from recurring. However, the work is not complete - the Golden Dataset must be collected before we can have 
full confidence in benchmark numbers reflecting real-world performance.
"""
        elements.append(Paragraph(assessment_text.strip(), self.styles['ArabicBody']))
        
        elements.append(Spacer(1, 0.3*cm))
        
        # Verdict box
        if self.data:
            verdict = self.data.get('overallVerdict', {})
            status = verdict.get('status', 'UNKNOWN')
            
            if 'VALID' in status:
                elements.append(Paragraph(
                    f"Benchmark Status: {status} - Metrics can be used with appropriate caution",
                    self.styles['HighlightBox']
                ))
            else:
                elements.append(Paragraph(
                    f"Benchmark Status: {status} - Address violations before using metrics",
                    self.styles['WarningBox']
                ))
        
        return elements


def main():
    """Main entry point"""
    output_path = '/home/z/my-project/download/Invoice-Brain-Verification-Suite-Report.pdf'
    data_path = '/home/z/my-project/download/verification-suite-results.json'
    
    generator = VerificationReportGenerator(output_path, data_path)
    result = generator.generate_report()
    
    return result


if __name__ == '__main__':
    main()
