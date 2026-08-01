#!/usr/bin/env python3
"""
Invoice Brain FALSE MATCH ANALYSIS REPORT
Comprehensive report on False Match Rate reduction strategy
"""

import json
import os
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, ListFlowable, ListItem
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ─── Font Registration ──────────────────────────────────────────

FONT_DIR = '/usr/share/fonts'

pdfmetrics.registerFont(TTFont('NotoSerifSC', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('NotoSerifSC-Bold', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans', f'{FONT_DIR}/truetype/dejavu/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans-Bold', f'{FONT_DIR}/truetype/dejavu/DejaVuSans-Bold.ttf'))

# ─── Load Analysis Results ──────────────────────────────────────

ANALYSIS_PATH = '/home/z/my-project/download/false-match-analysis.json'
BENCHMARK_PATH = '/home/z/my-project/download/benchmark-results.json'
OUTPUT_PATH = '/home/z/my-project/download/False-Match-Analysis-Report.pdf'

def load_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

# ─── Styles ─────────────────────────────────────────────────────

def create_styles():
    styles = getSampleStyleSheet()
    
    styles.add(ParagraphStyle(
        name='MainTitle',
        fontName='NotoSerifSC-Bold',
        fontSize=22,
        leading=28,
        alignment=1,
        spaceAfter=15,
        textColor=colors.HexColor('#0f172a'),
    ))
    
    styles.add(ParagraphStyle(
        name='SubTitle',
        fontName='NotoSerifSC',
        fontSize=12,
        leading=16,
        alignment=1,
        spaceAfter=25,
        textColor=colors.HexColor('#64748b'),
    ))
    
    styles.add(ParagraphStyle(
        name='SectionHead',
        fontName='NotoSerifSC-Bold',
        fontSize=14,
        leading=20,
        spaceBefore=18,
        spaceAfter=10,
        textColor=colors.HexColor('#1e293b'),
    ))
    
    styles.add(ParagraphStyle(
        name='SubSection',
        fontName='NotoSerifSC-Bold',
        fontSize=11,
        leading=15,
        spaceBefore=12,
        spaceAfter=6,
        textColor=colors.HexColor('#334155'),
    ))
    
    styles.add(ParagraphStyle(
        name='Body',
        fontName='DejaVuSans',
        fontSize=9.5,
        leading=14,
        spaceAfter=6,
        textColor=colors.HexColor('#334155'),
    ))
    
    styles.add(ParagraphStyle(
        name='CriticalText',
        fontName='DejaVuSans-Bold',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#dc2626'),
    ))
    
    styles.add(ParagraphStyle(
        name='SuccessText',
        fontName='DejaVuSans-Bold',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#16a34a'),
    ))
    
    return styles

# ─── Table Style ───────────────────────────────────────────────

def table_style():
    return TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e293b')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'NotoSerifSC-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
        ('TOPPADDING', (0, 0), (-1, 0), 10),
        ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#f8fafc')),
        ('TEXTCOLOR', (0, 1), (-1, -1), colors.HexColor('#334155')),
        ('FONTNAME', (0, 1), (-1, -1), 'DejaVuSans'),
        ('FONTSIZE', (0, 1), (-1, -1), 8.5),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f1f5f9')]),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 1), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 6),
    ])

# ─── Report Builder ────────────────────────────────────────────

def build_report():
    doc = SimpleDocTemplate(
        OUTPUT_PATH,
        pagesize=A4,
        rightMargin=18*mm,
        leftMargin=18*mm,
        topMargin=22*mm,
        bottomMargin=22*mm,
    )
    
    styles = create_styles()
    story = []
    
    # ════════════════════════════════════════════════════════════
    # COVER
    # ════════════════════════════════════════════════════════════
    story.append(Spacer(1, 30))
    story.append(Paragraph("Invoice Brain", styles['MainTitle']))
    story.append(Paragraph("False Match Deep Analysis Report", styles['MainTitle']))
    story.append(Spacer(1, 15))
    story.append(Paragraph("Root Cause Analysis & Validation Layer Impact Assessment", styles['SubTitle']))
    story.append(Spacer(1, 25))
    
    # Key metrics box
    try:
        analysis_data = load_json(ANALYSIS_PATH)
        gt = analysis_data.get('results', {}).get('groundTruth', {})
        fmr = gt.get('actualRate', 'N/A')
        validation = analysis_data.get('results', {}).get('validationImpact', {})
        
        summary = [
            ['Metric', 'Value', 'Target', 'Gap'],
            ['False Match Rate', fmr, '<0.5%', 'CRITICAL' if float(fmr.replace('%','')) > 0.5 else 'OK'],
            ['Total Analyzed', str(gt.get('totalInvoices', 'N/A')), '-', '-'],
            ['False Matches', str(gt.get('falseMatchCount', 'N/A')), 'Minimize', '-'],
            ['Validation Catches', str(validation.get('wouldBeCaughtByValidation', 'N/A')), 'Maximize', '-'],
            ['Projected w/ Validation', validation.get('projectedRateWithValidation', 'N/A'), '<0.5%', 'NEEDS WORK'],
        ]
        
        t = Table(summary, colWidths=[120, 90, 80, 80])
        t.setStyle(table_style())
        story.append(t)
    except Exception as e:
        story.append(Paragraph(f"Error loading data: {e}", styles['Body']))
    
    story.append(PageBreak())
    
    # ════════════════════════════════════════════════════════════
    # SECTION 1: EXECUTIVE SUMMARY
    # ════════════════════════════════════════════════════════════
    story.append(Paragraph("1. Executive Summary", styles['SectionHead']))
    
    exec_text = """
    This report presents a deep-dive analysis of False Match occurrences in the Invoice Brain extraction system. 
    A False Match occurs when the system applies a learned pattern from Supplier A to an invoice from Supplier B, 
    resulting in incorrect data extraction without detection. This is significantly more dangerous than AI Fallback 
    because it produces confidently wrong results that bypass normal error handling.
    
    The analysis was conducted using a controlled simulation environment with 10,000 invoices across 100 suppliers, 
    intentionally creating fingerprint collisions to measure real-world false match scenarios. The results reveal 
    that the primary cause of false matches is SIMILAR_LAYOUT collisions where different suppliers use identical 
    or highly similar invoice templates from the same ERP system or industry standard format.
    """
    story.append(Paragraph(exec_text.strip(), styles['Body']))
    story.append(Spacer(1, 12))
    
    # Key findings
    story.append(Paragraph("Critical Findings:", styles['SubSection']))
    
    findings = [
        "<b>Primary Root Cause:</b> 100% of false matches are attributed to SIMILAR_LAYOUT - suppliers sharing identical template structures",
        "<b>Current Validation Weakness:</b> Existing Field Validation catches only ~4.7% of false matches - needs significant enhancement",
        "<b>Top Problematic Patterns:</b> Individual fingerprints responsible for 100+ false matches each indicate systematic collision issues",
        "<b>Required Fix:</b> Semantic Fingerprinting (field positions + content hashing) needed alongside Layout Fingerprinting",
    ]
    
    for f in findings:
        story.append(Paragraph(f"• {f}", styles['Body']))
    
    story.append(Spacer(1, 15))
    
    # ════════════════════════════════════════════════════════════
    # SECTION 2: DETAILED METRICS
    # ════════════════════════════════════════════════════════════
    story.append(Paragraph("2. Detailed Metrics Analysis", styles['SectionHead']))
    
    try:
        report = analysis_data.get('results', {}).get('report', {})
        summary_stats = report.get('summary', {})
        
        # Main metrics table
        story.append(Paragraph("Ground Truth Results:", styles['SubSection']))
        
        metrics_data = [
            ['Metric', 'Value', 'Assessment'],
            ['Total Invoices Analyzed', str(summary_stats.get('totalAnalyzed', 'N/A')), 'Complete dataset'],
            ['True Matches (Correct)', str(summary_stats.get('trueMatches', 'N/A')), 'Good'],
            ['False Matches (Incorrect)', str(summary_stats.get('falseMatches', 'N/A')), styles['CriticalText']],
            ['False Match Rate', summary_stats.get('falseMatchRate', 'N/A'), styles['CriticalText']],
            ['Target Rate', '<0.5%', 'Production requirement'],
            ['Gap to Target', summary_stats.get('gap', 'N/A'), 'Requires action'],
        ]
        
        m_table = Table(metrics_data, colWidths=[140, 100, 130])
        ts = table_style()
        m_table.setStyle(ts)
        story.append(m_table)
        story.append(Spacer(1, 15))
        
        # Category breakdown
        categories = report.get('categoryBreakdown', [])
        if categories:
            story.append(Paragraph("False Match Category Distribution:", styles['SubSection']))
            
            cat_data = [['Category', 'Count', 'Percentage', 'Priority']]
            for cat in categories:
                priority = 'HIGH' if cat['category'] == 'SIMILAR_LAYOUT' else 'MEDIUM'
                cat_data.append([
                    cat['category'],
                    str(cat['count']),
                    cat['percentage'] + '%',
                    priority
                ])
            
            c_table = Table(cat_data, colWidths=[120, 70, 80, 100])
            c_table.setStyle(table_style())
            story.append(c_table)
            
            story.append(Spacer(1, 10))
            cat_interp = """
            The category distribution reveals that all false matches stem from layout similarity between suppliers. 
            This confirms that pure Layout-based Fingerprinting is insufficient for production deployment when multiple 
            suppliers may use identical or similar invoice templates from common ERP systems or industry-standard formats.
            """
            story.append(Paragraph(cat_interp.strip(), styles['Body']))
        
        story.append(Spacer(1, 15))
        
        # Validation impact
        validation = report.get('validationImpact', {})
        if validation:
            story.append(Paragraph("Current Validation Layer Effectiveness:", styles['SubSection']))
            
            val_data = [
                ['Validation Metric', 'Value', 'Assessment'],
                ['Total False Matches', str(validation.get('totalFalseMatches', 'N/A')), 'Baseline'],
                ['Caught by Validation', str(validation.get('wouldBeCaughtByValidation', 'N/A')), 'Too Low'],
                ['Effectiveness', validation.get('validationEffectiveness', 'N/A'), styles['CriticalText']],
                ['Remaining After Validation', str(validation.get('remainingAfterValidation', 'N/A')), 'Still High'],
                ['Projected Rate with Validation', validation.get('projectedRateWithValidation', 'N/A'), styles['CriticalText']],
            ]
            
            v_table = Table(val_data, colWidths=[140, 100, 130])
            v_table.setStyle(table_style())
            story.append(v_table)
            
            story.append(Spacer(1, 10))
            val_interp = """
            The current Field Validation layer demonstrates insufficient effectiveness at catching false matches. 
            With only 4.7% detection rate, the validation checks are too permissive or do not adequately verify 
            supplier identity against pattern ownership. Enhanced validation must include supplier name verification, 
            field position consistency checks, and cross-reference validation against known supplier patterns.
            """
            story.append(Paragraph(val_interp.strip(), styles['Body']))
    
    except Exception as e:
        story.append(Paragraph(f"Error in section 2: {e}", styles['Body']))
    
    story.append(PageBreak())
    
    # ════════════════════════════════════════════════════════════
    # SECTION 3: TOP PROBLEMATIC PATTERNS
    # ════════════════════════════════════════════════════════════
    story.append(Paragraph("3. Top Problematic Patterns", styles['SectionHead']))
    
    problem_text = """
    The following patterns exhibit the highest false match counts and represent priority targets for remediation. 
    Each problematic fingerprint indicates a template structure shared across multiple suppliers without sufficient 
    disambiguation features. These patterns should be flagged for enhanced monitoring or semantic enrichment.
    """
    story.append(Paragraph(problem_text.strip(), styles['Body']))
    story.append(Spacer(1, 10))
    
    try:
        top_patterns = report.get('topProblemPatterns', [])
        if top_patterns:
            for idx, pattern in enumerate(top_patterns[:5], 1):
                story.append(Paragraph(f"Pattern #{idx}: {pattern['fingerprint']}", styles['SubSection']))
                
                pat_data = [
                    ['Attribute', 'Value'],
                    ['False Match Count', str(pattern['count'])],
                    ['Severity', 'CRITICAL' if pattern['count'] > 150 else 'HIGH' if pattern['count'] > 50 else 'MEDIUM'],
                ]
                
                p_table = Table(pat_data, colWidths=[150, 220])
                p_table.setStyle(table_style())
                story.append(p_table)
                
                # Sample cases
                samples = pattern.get('fingerprints', [])[:2]
                for s in samples:
                    sample_text = f"<b>Case:</b> Invoice {s['invoiceId']} | Expected: [{', '.join(s.get('expectedSuppliers', []))}] | Got: \"{s['actualSupplier']}\" | Type: {s.get('category', 'N/A')}"
                    story.append(Paragraph(sample_text, styles['Body']))
                
                story.append(Spacer(1, 8))
    except Exception as e:
        story.append(Paragraph(f"Error in section 3: {e}", styles['Body']))
    
    story.append(Spacer(1, 15))
    
    # ════════════════════════════════════════════════════════════
    # SECTION 4: RECOMMENDED ACTIONS
    # ════════════════════════════════════════════════════════════
    story.append(Paragraph("4. Recommended Actions (Priority Order)", styles['SectionHead']))
    
    actions_intro = """
    Based on the analysis findings, the following actions are recommended in strict priority order to reduce 
    False Match Rate from current levels to below the 0.5% production target. Each action includes estimated 
    impact and implementation complexity assessment.
    """
    story.append(Paragraph(actions_intro.strip(), styles['Body']))
    story.append(Spacer(1, 10))
    
    # Action items
    actions = [
        {
            'priority': 'P0 - CRITICAL',
            'action': 'Implement Semantic Fingerprinting',
            'description': 'Enhance fingerprint to include field positions, label text hashes, and structural metadata beyond token types alone.',
            'estimated_impact': '60-70% reduction in FMR',
            'complexity': 'Medium (2-3 weeks)',
            'reason': 'Addresses root cause of 100% of current false matches',
        },
        {
            'priority': 'P0 - CRITICAL',
            'action': 'Add Supplier Name Verification Gate',
            'description': 'Before accepting pattern extraction, verify extracted supplier name against pattern owner list. Reject or flag mismatches.',
            'estimated_impact': '20-25% additional reduction',
            'complexity': 'Low (2-3 days)',
            'reason': 'Simple check with high catch rate for cross-supplier errors',
        },
        {
            'priority': 'P1 - HIGH',
            'action': 'Enhance Field Position Validation',
            'description': 'Store expected field line positions in pattern. Validate extracted field positions match within tolerance.',
            'estimated_impact': '10-15% additional reduction',
            'complexity': 'Medium (1 week)',
            'reason': 'Catches format drift and edge cases',
        },
        {
            'priority': 'P1 - HIGH',
            'action': 'Implement Pattern Ownership Scoping',
            'description': 'Restrict pattern application to invoices from the supplier(s) who created it. Require explicit association for new suppliers.',
            'estimated_impact': 'Prevents new false matches',
            'complexity': 'Low (3-5 days)',
            'reason': 'Fundamental architectural fix',
        },
        {
            'priority': 'P2 - MEDIUM',
            'action': 'Add Cross-Field Consistency Checks',
            'description': 'Validate relationships between extracted fields (total >= subtotal, tax rates reasonable, dates valid).',
            'estimated_impact': '5-10% additional reduction',
            'complexity': 'Low (2-3 days)',
            'reason': 'Catches corrupted extractions',
        },
    ]
    
    for act in actions:
        story.append(Paragraph(f"{act['priority']}: {act['action']}", styles['SubSection']))
        
        act_data = [
            ['Attribute', 'Detail'],
            ['Description', act['description']],
            ['Est. Impact', act['estimated_impact']],
            ['Complexity', act['complexity']],
            ['Rationale', act['reason']],
        ]
        
        a_table = Table(act_data, colWidths=[100, 270])
        a_table.setStyle(table_style())
        story.append(a_table)
        story.append(Spacer(1, 10))
    
    story.append(PageBreak())
    
    # ════════════════════════════════════════════════════════════
    # SECTION 5: BENCHMARK CLARIFICATION
    # ════════════════════════════════════════════════════════════
    story.append(Paragraph("5. Benchmark Classification (Important)", styles['SectionHead']))
    
    bench_text = """
    As correctly identified in the review, previous benchmark numbers require clarification regarding scope and 
    applicability. This section explicitly categorizes each metric to prevent misinterpretation by stakeholders, 
    investors, or technical leadership.
    """
    story.append(Paragraph(bench_text.strip(), styles['Body']))
    story.append(Spacer(1, 10))
    
    story.append(Paragraph("Benchmark Type Definitions:", styles['SubSection']))
    
    bench_types = [
        ['Type', 'Scope', 'Examples', 'Use Case'],
        ['Micro Benchmark', 'Single function/unit', 'Fingerprint generation only\nCache lookup speed\nPattern matching logic', 'Code optimization\nAlgorithm comparison'],
        ['Component Benchmark', 'Module-level', 'Fingerprint + Pattern store\nSmart Split + Extract\nValidation layer', 'Module performance\nRegression detection'],
        ['End-to-End Benchmark', 'Full pipeline', 'OCR → Queue → Extract → DB\nAPI request → Response\n100 users × 100 invoices', 'Production readiness\nCapacity planning\nSLA validation'],
    ]
    
    b_table = Table(bench_types, colWidths=[85, 95, 130, 90])
    b_table.setStyle(table_style())
    story.append(b_table)
    story.append(Spacer(1, 12))
    
    story.append(Paragraph("Previous Results Reclassification:", styles['SubSection']))
    
    reclass = [
        ['Previously Reported Metric', 'Actual Classification', 'Notes'],
        ['0.01ms processing time', 'MICRO (Fingerprint only)', 'Not full extraction pipeline'],
        ['300K invoices/sec throughput', 'MICRO (in-memory)', 'No I/O, no AI, no DB'],
        ['92.77% Pattern Hit Rate', 'COMPONENT', 'Pattern matching accuracy'],
        ['1.90% False Match Rate', 'COMPONENT', 'Based on simulated ground truth'],
        ['Load Test latencies', 'COMPONENT', 'Extraction layer only'],
    ]
    
    r_table = Table(reclass, colWidths=[130, 110, 140])
    r_table.setStyle(table_style())
    story.append(r_table)
    story.append(Spacer(1, 12))
    
    rec_text = """
    <b>Recommendation:</b> All future reports and presentations must clearly label benchmark types. Production 
    readiness claims should be based exclusively on End-to-End Benchmarks that include all system components: OCR 
    preprocessing, queue management, database operations, AI API calls (with realistic latency), serialization, 
    and network overhead. Micro and Component benchmarks are valuable for development optimization but should not 
    be used alone for production go/no-go decisions.
    """
    story.append(Paragraph(rec_text.strip(), styles['Body']))
    
    story.append(Spacer(1, 15))
    
    # ════════════════════════════════════════════════════════════
    # SECTION 6: CONCLUSION
    # ════════════════════════════════════════════════════════════
    story.append(Paragraph("6. Conclusion & Next Steps", styles['SectionHead']))
    
    conclusion = """
    The False Match Rate analysis reveals a critical gap between current system behavior and production requirements. 
    While Pattern Hit Rate (92.77%) and AI Fallback Rate (4.56%) meet targets, the False Match Rate represents an 
    unacceptable risk for financial document processing where incorrect extraction can lead to business decisions based 
    on wrong data.
    
    The root cause analysis conclusively identifies SIMILAR_LAYOUT collisions as the sole source of false matches in 
    this test scenario. This indicates that Layout-based Fingerprinting, while effective for pattern hit rate optimization, 
    is insufficient as the sole disambiguation mechanism when multiple suppliers share template structures.
    
    The recommended action plan prioritizes Semantic Fingerprinting and Supplier Verification as P0 items that together 
    can potentially reduce False Match Rate by 80-95%. These should be implemented before any production deployment consideration.
    
    <b>Immediate Next Steps:</b>
    1. Implement P0 actions (Semantic FP + Supplier Gate) - estimated 3 weeks
    2. Re-run analysis with enhanced system to validate improvement
    3. Develop End-to-End Benchmark suite with realistic AI latency
    4. Target: False Match Rate <0.5% before production evaluation
    """
    story.append(Paragraph(conclusion.strip(), styles['Body']))
    
    # Build PDF
    doc.build(story)
    return OUTPUT_PATH

# ─── MAIN ───────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("False Match Analysis Report Generator")
    print("=" * 60)
    
    print(f"\nLoading analysis from: {ANALYSIS_PATH}")
    
    output = build_report()
    
    size_mb = os.path.getsize(output) / (1024 * 1024)
    print(f"\n✅ Report generated: {output}")
    print(f"   Size: {size_mb:.2f} MB")
    
    return output

if __name__ == '__main__':
    main()
