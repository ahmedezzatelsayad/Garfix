#!/usr/bin/env python3
"""
HONEST Invoice Brain Benchmark Report Generator v3.0
=====================================================
Shows REAL metrics - No artificial inflation
Includes: Confusion Matrix, Overfitting Analysis, Honest Assessment
"""

import json
import os
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, cm
from reportlab.lib.colors import HexColor, black, white, grey, red, orange
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, ListFlowable, ListItem, KeepTogether
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY

# Output path
OUTPUT_PATH = '/home/z/my-project/download/Invoice-Brain-Rigorous-Benchmark-Report.pdf'
DATA_PATH = '/home/z/my-project/download/rigorous-benchmark-results.json'

# Color palette - using WARNING colors since results are concerning
COLORS = {
    'primary': HexColor('#742a2a'),      # Dark red (concerning)
    'secondary': HexColor('#c53030'),    # Medium red
    'accent': HexColor('#fc8181'),       # Light red
    'danger_bg': HexColor('#fed7d7'),    # Light red bg
    'warning': HexColor('#744210'),      # Dark orange
    'warning_bg': HexColor('#feebc8'),   # Light orange bg
    'success': HexColor('#22543d'),      # Dark green
    'success_bg': HexColor('#c6f6d5'),   # Light green bg
    'light_bg': HexColor('#f7fafc'),     # Light gray background
    'border': HexColor('#e2e8f0'),       # Border gray
    'black': black,
    'white': white,
}

def create_styles():
    """Create custom paragraph styles"""
    styles = getSampleStyleSheet()
    
    styles.add(ParagraphStyle(
        name='MainTitle',
        parent=styles['Title'],
        fontSize=26,
        textColor=COLORS['primary'],
        spaceAfter=15,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold'
    ))
    
    styles.add(ParagraphStyle(
        name='Subtitle',
        parent=styles['Normal'],
        fontSize=12,
        textColor=COLORS['secondary'],
        spaceAfter=25,
        alignment=TA_CENTER,
        fontName='Helvetica'
    ))
    
    styles.add(ParagraphStyle(
        name='SectionHeader',
        parent=styles['Heading1'],
        fontSize=16,
        textColor=COLORS['primary'],
        spaceBefore=18,
        spaceAfter=10,
        fontName='Helvetica-Bold'
    ))
    
    styles.add(ParagraphStyle(
        name='SubsectionHeader',
        parent=styles['Heading2'],
        fontSize=13,
        textColor=COLORS['warning'],
        spaceBefore=12,
        spaceAfter=8,
        fontName='Helvetica-Bold'
    ))
    
    styles.add(ParagraphStyle(
        name='CustomBodyText',
        parent=styles['Normal'],
        fontSize=10,
        textColor=black,
        spaceAfter=8,
        alignment=TA_JUSTIFY,
        fontName='Helvetica',
        leading=14
    ))
    
    styles.add(ParagraphStyle(
        name='CriticalText',
        parent=styles['Normal'],
        fontSize=14,
        textColor=HexColor('#742a2a'),
        fontName='Helvetica-Bold',
        alignment=TA_CENTER,
        spaceBefore=10,
        spaceAfter=10
    ))
    
    styles.add(ParagraphStyle(
        name='CodeStyle',
        parent=styles['Normal'],
        fontSize=8,
        fontName='Courier',
        textColor=HexColor('#2d3748'),
        backColor=HexColor('#edf2f7'),
        spaceAfter=10,
        leftIndent=10,
        rightIndent=10
    ))
    
    return styles


def create_cover_page(styles):
    """Create cover page with CRITICAL status"""
    elements = []
    
    elements.append(Spacer(1, 1.5*inch))
    
    elements.append(Paragraph(
        "RIGOROUS BENCHMARK REPORT",
        styles['MainTitle']
    ))
    
    elements.append(Paragraph(
        "Invoice Brain Enhancement Assessment<br/>Honest Metrics | Confusion Matrix | Overfitting Detection",
        styles['Subtitle']
    ))
    
    # Critical status box
    status_data = [[Paragraph(
        '<b>⚠️ CRITICAL FINDINGS</b><br/><font size="10">False Match Rate: 92.09% | Target: &lt;0.5%</font>',
        ParagraphStyle('StatusBox', fontSize=12, textColor=white, alignment=TA_CENTER, fontName='Helvetica-Bold', leading=16)
    )]]
    status_table = Table(status_data, colWidths=[3.5*inch])
    status_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), COLORS['primary']),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 15),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 15),
        ('LEFTPADDING', (0, 0), (-1, -1), 20),
        ('RIGHTPADDING', (0, 0), (-1, -1), 20),
    ]))
    elements.append(status_table)
    
    elements.append(Spacer(1, 0.4*inch))
    
    # Verdict box
    verdict_data = [[Paragraph(
        '<b>Verdict: NO_IMPROVEMENT_OR_REGRESSION</b><br/><font size="9">Enhancement did not reduce false matches as expected</font>',
        ParagraphStyle('VerdictBox', fontSize=11, textColor=HexColor('#744210'), alignment=TA_CENTER, fontName='Helvetica-Bold', leading=14)
    )]]
    verdict_table = Table(verdict_data, colWidths=[4*inch])
    verdict_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), COLORS['warning_bg']),
        ('BOX', (0, 0), (-1, -1), 2, COLORS['warning']),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 12),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
    ]))
    elements.append(verdict_table)
    
    elements.append(Spacer(1, 0.5*inch))
    
    elements.append(Paragraph(
        f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        ParagraphStyle('Date', fontSize=10, textColor=grey, alignment=TA_CENTER)
    ))
    
    elements.append(Paragraph(
        "Benchmark Suite v3.0-Rigorous",
        ParagraphStyle('Version', fontSize=10, textColor=grey, alignment=TA_CENTER)
    ))
    
    elements.append(PageBreak())
    
    return elements


def create_executive_summary(styles, data):
    """Create brutally honest executive summary"""
    elements = []
    
    elements.append(Paragraph("1. Executive Summary", styles['SectionHeader']))
    
    # The brutal truth
    truth_text = """
    <b>The previous benchmark showing 0.00% False Match Rate was ARTIFICIAL.</b><br/><br/>
    
    This rigorous benchmark reveals the true performance of the enhanced Invoice Brain system.
    Instead of improvement, we found <b>significant regression</b>: the False Match Rate increased 
    from the baseline of <b>16.35%</b> to <b>92.09%</b> - a <b>463% worsening</b>.
    """
    elements.append(Paragraph(truth_text, styles['CustomBodyText']))
    elements.append(Spacer(1, 0.15*inch))
    
    # Key metrics table - showing the bad news
    agg = data.get('aggregatedMetrics', {})
    baseline = data.get('baselineComparison', {})
    
    metrics_data = [
        ['Metric', 'Baseline\n(Original)', 'Current\n(Enhanced)', 'Change', 'Status'],
        [
            'False Match Rate',
            f"{baseline.get('previousFalseMatchRate', 0) * 100:.2f}%",
            f"{agg.get('falseMatchRate', 0) * 100:.2f}%",
            f"+{baseline.get('percentChange', 'N/A')}%",
            '❌ CRITICAL'
        ],
        [
            'F1 Score',
            'N/A',
            f"{agg.get('f1Score', 0) * 100:.1f}%",
            'New Metric',
            '❌ POOR' if agg.get('f1Score', 0) < 0.3 else '⚠️ FAIR'
        ],
        [
            'Precision',
            'N/A',
            f"{agg.get('precision', 0) * 100:.1f}%",
            'New Metric',
            '❌ CRITICAL' if agg.get('precision', 0) < 0.1 else '⚠️ LOW'
        ],
        [
            'Recall',
            'N/A',
            f"{agg.get('recall', 0) * 100:.1f}%",
            'New Metric',
            '❌ VERY LOW' if agg.get('recall', 0) < 0.2 else '⚠️ LOW'
        ]
    ]
    
    metrics_table = Table(metrics_data, colWidths=[1.4*inch, 1*inch, 1*inch, 0.9*inch, 1.1*inch])
    metrics_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), COLORS['primary']),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BACKGROUND', (0, 1), (-1, -1), COLORS['danger_bg']),
        ('GRID', (0, 0), (-1, -1), 0.5, COLORS['border']),
        ('TOPPADDING', (0, 0), (-1, -1), 7),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
    ]))
    elements.append(metrics_table)
    elements.append(Spacer(1, 0.2*inch))
    
    # Why did this happen?
    why_text = """
    <b>Root Cause Analysis:</b><br/><br/>
    
    <b>1. Artificial Advantage in Previous Test:</b> The 0.00% FMR was achieved because the 
    enhanced benchmark was passing <code>knownSupplierCandidates</code> to the engine - essentially 
    giving away the answer before matching began.<br/><br/>
    
    <b>2. Shared Layout Catastrophe:</b> When multiple suppliers use the same ERP/template 
    (simulated by shared_layout_erp), the semantic scoring cannot distinguish between them 
    correctly 92% of the time.<br/><br/>
    
    <b>3. Missing Supplier Ownership:</b> Despite implementing Supplier Ownership Gate in code, 
    it's not being enforced when candidates come from shared layouts.
    """
    elements.append(Paragraph(why_text, styles['CustomBodyText']))
    
    return elements


def create_confusion_matrix_section(styles, data):
    """Create detailed confusion matrix analysis"""
    elements = []
    
    elements.append(PageBreak())
    elements.append(Paragraph("2. Confusion Matrix Analysis", styles['SectionHeader']))
    
    intro_text = """
    The confusion matrix provides complete visibility into how the system classifies invoices. 
    Unlike simple "accuracy" metrics, this shows exactly where failures occur.
    """
    elements.append(Paragraph(intro_text, styles['CustomBodyText']))
    elements.append(Spacer(1, 0.15*inch))
    
    # Get aggregated matrix data
    splits = data.get('splitResults', {})
    total_tp, total_fp, total_fn, total_tn = 0, 0, 0, 0
    
    for split_result in splits.values():
        m = split_result.get('metrics', {}).get('matrix', {})
        total_tp += m.get('tp', 0)
        total_fp += m.get('fp', 0)
        total_fn += m.get('fn', 0)
        total_tn += m.get('tn', 0)
    
    # Confusion matrix visualization
    matrix_data = [
        ['', 'Predicted:\nPATTERN', 'Predicted:\nAI FALLBACK', 'Total'],
        [
            'Actual:\nCOULD MATCH',
            f'TP: {total_tp}\n(Correct)',
            f'FN: {total_fn}\n(Missed)',
            total_tp + total_fn
        ],
        [
            'Actual:\nWRONG MATCH',
            f'FP: {total_fp}\n(FALSE MATCH!)',
            f'TN: {total_tn}\n(Correct Reject)',
            total_fp + total_tn
        ],
        ['Total', total_tp + total_fp, total_fn + total_tn, total_tp + total_fp + total_fn + total_tn]
    ]
    
    matrix_table = Table(matrix_data, colWidths=[1.5*inch, 1.5*inch, 1.5*inch, 1*inch])
    matrix_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), COLORS['secondary']),
        ('BACKGROUND', (0, 0), (0, -1), COLORS['secondary']),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('TEXTCOLOR', (0, 0), (0, -1), white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        # Highlight the FP cell (FALSE MATCHES) in red
        ('BACKGROUND', (1, 2), (1, 2), HexColor('#feb2b2')),  # FP cell - DANGER
        ('BACKGROUND', (0, 1), (0, 1), COLORS['success_bg']),   # TP row header
        ('BACKGROUND', (1, 1), (1, 1), COLORS['success_bg']),   # TP cell
        ('BACKGROUND', (2, 2), (2, 2), COLORS['light_bg']),     # TN cell
        ('GRID', (0, 0), (-1, -1), 1, COLORS['border']),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
    ]))
    elements.append(matrix_table)
    elements.append(Spacer(1, 0.2*inch))
    
    # Interpretation
    interpretation = f"""
    <b>Matrix Interpretation:</b><br/><br/>
    
    <b>True Positives ({total_tp}):</b> Invoices correctly matched to their supplier's pattern.<br/>
    → Only {total_tp} out of {total_tp + total_fp + total_fn + total_tn} invoices were correctly processed!<br/><br/>
    
    <b>False Positives ({total_fp}) ⚠️ CRITICAL:</b> Invoices matched to the WRONG supplier pattern.<br/>
    → This represents a <b>{(total_fp / (total_fp + total_tp) * 100 if (total_fp + total_tp) > 0 else 0):.1f}% false match rate</b> among pattern-matched invoices.<br/>
    → Each of these would result in incorrect financial data extraction!<br/><br/>
    
    <b>False Negatives ({total_fn}):</b> Invoices that could have been matched but were sent to AI.<br/>
    → These represent missed cost savings opportunities.<br/><br/>
    
    <b>True Negatives ({total_tn}):</b> Correctly identified as needing AI processing.
    """
    elements.append(Paragraph(interpretation, styles['CustomBodyText']))
    
    return elements


def create_split_analysis(styles, data):
    """Create train/validation/holdout comparison for overfitting detection"""
    elements = []
    
    elements.append(PageBreak())
    elements.append(Paragraph("3. Overfitting Detection (Split Analysis)", styles['SectionHeader']))
    
    intro = """
    To detect overfitting, the dataset was split into Training (60%), Validation (20%), and 
    Holdout (20%) sets. If the model performs significantly worse on Holdout data, it indicates 
    memorization rather than learning generalizable patterns.
    """
    elements.append(Paragraph(intro, styles['CustomBodyText']))
    elements.append(Spacer(1, 0.15*inch))
    
    # Split performance table
    splits = data.get('splitResults', {})
    split_data = [['Split', 'Invoices', 'FMR (%)', 'F1 (%)', 'Precision (%)', 'Recall (%)']]
    
    for split_name, result in splits.items():
        m = result.get('metrics', {})
        count = result.get('invoiceCount', 0)
        split_data.append([
            split_name.upper(),
            str(count),
            f"{m.get('falseMatchRate', 0) * 100:.2f}",
            f"{m.get('f1Score', 0) * 100:.1f}",
            f"{m.get('precision', 0) * 100:.1f}",
            f"{m.get('recall', 0) * 100:.1f}"
        ])
    
    split_table = Table(split_data, colWidths=[1.1*inch, 0.9*inch, 0.9*inch, 0.85*inch, 1*inch, 0.9*inch])
    split_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), COLORS['warning']),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BACKGROUND', (0, 1), (-1, -1), COLORS['light_bg']),
        ('GRID', (0, 0), (-1, -1), 0.5, COLORS['border']),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(split_table)
    elements.append(Spacer(1, 0.2*inch))
    
    # Overfitting analysis
    overfit = data.get('overfittingAnalysis', {})
    
    overfit_status = overfit.get('overfittingDetected', None)
    if overfit_status:
        status_box_content = f"""
        <b>Status: POTENTIAL OVERFITTING DETECTED</b><br/><br/>
        """
        for issue in overfit.get('issues', []):
            status_box_content += f"• [{issue.get('severity')}] {issue.get('message')}<br/>"
        
        status_box_content += f"<br/>Recommendation: {overfit.get('recommendation', '')}"
    else:
        status_box_content = "<b>Status: NO OVERFITTING DETECTED</b><br/><br/>Model generalizes consistently across all splits."
    
    status_data = [[Paragraph(status_box_content, styles['CustomBodyText'])]]
    status_table = Table(status_data, colWidths=[5.5*inch])
    bg_color = COLORS['warning_bg'] if overfit_status else COLORS['success_bg']
    border_color = COLORS['warning'] if overfit_status else COLORS['success']
    status_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), bg_color),
        ('BOX', (0, 0), (-1, -1), 2, border_color),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
    ]))
    elements.append(status_table)
    
    return elements


def create_recommendations(styles, data):
    """Create actionable recommendations based on findings"""
    elements = []
    
    elements.append(PageBreak())
    elements.append(Paragraph("4. Recommendations", styles['SectionHeader']))
    
    # P0 items
    elements.append(Paragraph("P0 - CRITICAL (Must Fix Before Any Production)", styles['SubsectionHeader']))
    
    p0_items = """
    <b>1. Fix Shared Layout Logic:</b><br/>
    When multiple suppliers share the same layout (same ERP), the current semantic scoring 
    picks the wrong supplier 92% of the time. The Supplier Ownership Gate must be enforced 
    BEFORE candidate selection, not after.<br/><br/>
    
    <b>2. Implement Hard Supplier Identity Check:</b><br/>
    Before accepting any pattern match, verify supplier name similarity > 80% AND TRN exact match. 
    If either fails, reject the pattern match regardless of semantic score.<br/><br/>
    
    <b>3. Add Pattern Scoping:</b><br/>
    Patterns should only be considered if they belong to the same tenant AND the supplier is in 
    the allowed candidate list (from invoice metadata or recent history).
    """
    elements.append(Paragraph(p0_items, styles['CustomBodyText']))
    elements.append(Spacer(1, 0.15*inch))
    
    # P1 items
    elements.append(Paragraph("P1 - HIGH (Fix Before Pilot)", styles['SubsectionHeader']))
    
    p1_items = """
    <b>1. Build Golden Dataset:</b><br/>
    Create a dataset of 100+ real suppliers with 50-100 human-verified invoices each. This becomes 
    the single source of truth for all metric tracking.<br/><br/>
    
    <b>2. Implement CI Quality Gate:</b><br/>
    Any code change that degrades FMR beyond threshold should automatically fail CI. Use the 
    Golden Dataset as the test suite.<br/><br/>
    
    <b>3. Add Field-Level Validation:</b><br/>
    Beyond layout matching, validate extracted field values (amount ranges, date reasonableness, 
    currency consistency) before accepting pattern output.
    """
    elements.append(Paragraph(p1_items, styles['CustomBodyText']))
    elements.append(Spacer(1, 0.15*inch))
    
    # P2 items  
    elements.append(Paragraph("P2 - MEDIUM (Post-Pilot)", styles['SubsectionHeader']))
    
    p2_items = """
    <b>1. End-to-End Benchmark:</b><br/>
    Include real OCR latency, database queries, and AI API calls in timing measurements.<br/><br/>
    
    <b>2. Shadow Mode Deployment:</b><br/>
    Run enhanced system alongside production on 1-5% of traffic without acting on results.<br/><br/>
    
    <b>3. Supplier Reputation Scoring:</b><br/>
    Track per-supplier accuracy over time and weight pattern selection accordingly.
    """
    elements.append(Paragraph(p2_items, styles['CustomBodyText']))
    
    return elements


def create_conclusion(styles, data):
    """Create honest conclusion"""
    elements = []
    
    elements.append(PageBreak())
    elements.append(Paragraph("5. Conclusion", styles['SectionHeader']))
    
    verdict = data.get('baselineComparison', {}).get('honestVerdict', {})
    assessment = data.get('honestAssessment', {})
    
    conclusion_text = f"""
    <b>Honest Assessment:</b><br/><br/>
    
    The Invoice Brain enhancement project has revealed critical flaws through rigorous testing. 
    While the architectural improvements (Supplier Ownership Gate, Semantic Fingerprinting, 
    Multi-Stage Validation) are sound in theory, their implementation has not achieved the 
    intended goal of reducing False Match Rate below 0.5%.<br/><br/>
    
    <b>Key Findings:</b><br/>
    • Previous 0.00% FMR was artificial - achieved by leaking ground truth to the matcher<br/>
    • Real FMR is 92.09% - significantly WORSE than the 16.35% baseline<br/>
    • System fails catastrophically when suppliers share layouts (same ERP scenario)<br/>
    • Precision of 7.9% means 92% of pattern matches are INCORRECT<br/><br/>
    
    <b>What Went Right:</b><br/>
    • Rigorous methodology with Train/Validation/Holdout splits<br/>
    • Confusion Matrix provides complete failure visibility<br/>
    • Overfitting detection working correctly<br/>
    • Honest reporting prevents dangerous production deployment<br/><br/>
    
    <b>Verdict: {verdict.get('verdict', 'UNKNOWN')}</b><br/>
    Confidence: {verdict.get('confidence', 'UNKNOWN')}<br/>
    Caveat: {verdict.get('caveat', 'None')}<br/><br/>
    
    <b>Next Steps:</b><br/>
    Do NOT proceed to production or pilot. Return to implementation phase and fix the 
    core matching logic before re-benchmarking. The target remains: FMR &lt; 0.5% on Holdout set.
    """
    elements.append(Paragraph(conclusion_text, styles['CustomBodyText']))
    
    return elements


def generate_report():
    """Main function to generate the PDF report"""
    print("📄 Generating RIGOROUS Benchmark Report...")
    
    # Load data
    try:
        with open(DATA_PATH, 'r') as f:
            data = json.load(f)
        print(f"   ✓ Loaded data from {DATA_PATH}")
    except Exception as e:
        print(f"   ✗ Error loading data: {e}")
        return None
    
    # Create document
    doc = SimpleDocTemplate(
        OUTPUT_PATH,
        pagesize=A4,
        rightMargin=0.75*inch,
        leftMargin=0.75*inch,
        topMargin=0.75*inch,
        bottomMargin=0.75*inch
    )
    
    styles = create_styles()
    
    # Build sections
    elements = []
    elements.extend(create_cover_page(styles))
    elements.extend(create_executive_summary(styles, data))
    elements.extend(create_confusion_matrix_section(styles, data))
    elements.extend(create_split_analysis(styles, data))
    elements.extend(create_recommendations(styles, data))
    elements.extend(create_conclusion(styles, data))
    
    # Build PDF
    doc.build(elements)
    
    print(f"   ✓ Report saved to {OUTPUT_PATH}")
    return OUTPUT_PATH


if __name__ == '__main__':
    output = generate_report()
    if output:
        print("\n✅ Rigorous report generation complete!")
        print("⚠️  Results show CRITICAL issues - review report before any production decisions")
    else:
        print("\n❌ Report generation failed!")
