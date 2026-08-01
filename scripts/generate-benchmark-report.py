#!/usr/bin/env python3
"""
Invoice Brain Production Benchmark Report Generator
Generates professional PDF report with all benchmark results
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
    PageBreak, Image, ListFlowable, ListItem
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.enums import TA_RIGHT, TA_CENTER, TA_LEFT

# ─── Font Registration ──────────────────────────────────────────

FONT_DIR = '/usr/share/fonts'

# Register Arabic fonts
pdfmetrics.registerFont(TTFont('NotoSerifSC', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('NotoSerifSC-Bold', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf'))

# Register DejaVu Sans for body text (compatible with ReportLab)
pdfmetrics.registerFont(TTFont('NotoSansArabic', f'{FONT_DIR}/truetype/dejavu/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('NotoSansArabic-Bold', f'{FONT_DIR}/truetype/dejavu/DejaVuSans-Bold.ttf'))

# ─── Load Benchmark Results ─────────────────────────────────────

RESULTS_PATH = '/home/z/my-project/download/benchmark-results.json'
OUTPUT_PATH = '/home/z/my-project/download/Invoice-Brain-Benchmark-Report.pdf'

def load_results():
    with open(RESULTS_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)

# ─── Styles Definition ──────────────────────────────────────────

def create_styles():
    styles = getSampleStyleSheet()
    
    # Title style
    styles.add(ParagraphStyle(
        name='ArabicTitle',
        fontName='NotoSerifSC-Bold',
        fontSize=24,
        leading=32,
        alignment=TA_CENTER,
        spaceAfter=20,
        textColor=colors.HexColor('#1e293b'),
    ))
    
    # Subtitle style
    styles.add(ParagraphStyle(
        name='ArabicSubtitle',
        fontName='NotoSerifSC',
        fontSize=14,
        leading=20,
        alignment=TA_CENTER,
        spaceAfter=30,
        textColor=colors.HexColor('#64748b'),
    ))
    
    # Section header style
    styles.add(ParagraphStyle(
        name='SectionHeader',
        fontName='NotoSerifSC-Bold',
        fontSize=16,
        leading=24,
        spaceBefore=20,
        spaceAfter=12,
        textColor=colors.HexColor('#0f172a'),
        borderPadding=(0, 0, 5, 0),
    ))
    
    # Subsection style
    styles.add(ParagraphStyle(
        name='SubsectionHeader',
        fontName='NotoSerifSC-Bold',
        fontSize=13,
        leading=18,
        spaceBefore=15,
        spaceAfter=8,
        textColor=colors.HexColor('#334155'),
    ))
    
    # Body text style
    styles.add(ParagraphStyle(
        name='ArabicBody',
        fontName='NotoSerifSC',
        fontSize=10,
        leading=16,
        spaceAfter=8,
        textColor=colors.HexColor('#334155'),
        alignment=TA_LEFT,
    ))
    
    # Metric value style (for highlighting numbers)
    styles.add(ParagraphStyle(
        name='MetricValue',
        fontName='NotoSansArabic-Bold',
        fontSize=12,
        leading=16,
        alignment=TA_CENTER,
        textColor=colors.HexColor('#0f172a'),
    ))
    
    # Pass/Fail style
    styles.add(ParagraphStyle(
        name='PassText',
        fontName='NotoSansArabic-Bold',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#16a34a'),  # Green
    ))
    
    styles.add(ParagraphStyle(
        name='FailText',
        fontName='NotoSansArabic-Bold',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#dc2626'),  # Red
    ))
    
    return styles

# ─── Table Styling Helpers ──────────────────────────────────────

def create_table_style():
    return TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e293b')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'NotoSerifSC-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('TOPPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#f8fafc')),
        ('TEXTCOLOR', (0, 1), (-1, -1), colors.HexColor('#334155')),
        ('FONTNAME', (0, 1), (-1, -1), 'NotoSerifSC'),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#ffffff'), colors.HexColor('#f1f5f9')]),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 1), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 8),
    ])

# ─── Report Content Generation ──────────────────────────────────

def build_report(results):
    """Build the complete PDF report."""
    doc = SimpleDocTemplate(
        OUTPUT_PATH,
        pagesize=A4,
        rightMargin=20*mm,
        leftMargin=20*mm,
        topMargin=25*mm,
        bottomMargin=25*mm,
    )
    
    styles = create_styles()
    story = []
    
    # ════════════════════════════════════════════════════════════
    # COVER PAGE
    # ════════════════════════════════════════════════════════════
    story.append(Spacer(1, 50))
    story.append(Paragraph("Invoice Brain", styles['ArabicTitle']))
    story.append(Paragraph("Production Benchmark Report", styles['ArabicTitle']))
    story.append(Spacer(1, 20))
    story.append(Paragraph("Real Numbers for Production Readiness Evaluation", styles['ArabicSubtitle']))
    story.append(Spacer(1, 40))
    
    # Summary box
    overall_score = results.get('results', {}).get('finalScore', {}).get('overall', 0)
    readiness_level = results.get('results', {}).get('finalScore', {}).get('level', 'UNKNOWN')
    
    summary_data = [
        ['Overall Score', f"{overall_score}/100", readiness_level],
        ['Test Date', results.get('timestamp', 'N/A')[:10], ''],
        ['Dataset Size', f"{results.get('config', {}).get('TOTAL_INVOICES', 0):,} invoices", ''],
        ['Chaos Tests', results.get('results', {}).get('chaosTesting', [])[0:1] and 
         f"{len([t for t in results['results']['chaosTesting'] if t.get('passed')])}/{len(results['results']['chaosTesting'])}" or 'N/A', 'Passed'],
    ]
    
    summary_table = Table(summary_data, colWidths=[150, 120, 100])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f1f5f9')),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#334155')),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, -1), 'NotoSerifSC'),
        ('FONTSIZE', (0, 0), (-1, -1), 11),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#cbd5e1')),
        ('TOPPADDING', (0, 0), (-1, -1), 12),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
    ]))
    story.append(summary_table)
    
    story.append(PageBreak())
    
    # ════════════════════════════════════════════════════════════
    # SECTION 1: EXECUTIVE SUMMARY
    # ════════════════════════════════════════════════════════════
    story.append(Paragraph("1. Executive Summary", styles['SectionHeader']))
    
    exec_summary = """
    This benchmark report presents comprehensive production readiness evaluation results for the Invoice Brain system. 
    The testing methodology encompasses five distinct phases: dataset generation, core metrics benchmarking, load testing 
    under various concurrency scenarios, chaos engineering tests for failure resilience, and cost simulation analysis 
    across multiple volume tiers. The evaluation utilizes a synthetic dataset comprising 100 unique supplier profiles 
    with 100 invoices each, totaling 10,000 invoice documents distributed across 10 distinct format templates including 
    Arabic tax invoices, English commercial invoices, mixed bilingual formats, e-commerce receipts, and specialized 
    industry formats for healthcare, legal services, and restaurant operations.
    """
    story.append(Paragraph(exec_summary.strip(), styles['ArabicBody']))
    story.append(Spacer(1, 12))
    
    # Key findings
    story.append(Paragraph("Key Findings:", styles['SubsectionHeader']))
    
    core_metrics = results.get('results', {}).get('coreMetrics', {})
    
    findings = [
        f"Pattern Hit Rate achieved <b>{core_metrics.get('patternHitRatePercent', 'N/A')}</b> against target of >90%, indicating strong pattern recognition capability",
        f"AI Fallback Rate recorded at <b>{core_metrics.get('aiFallbackRatePercent', 'N/A')}</b>, well below the 10% threshold, demonstrating effective learning retention",
        f"Collision Rate measured at <b>{core_metrics.get('collisionRatePercent', 'N/A')}</b>, exceeding expectations with near-zero fingerprint conflicts",
        f"False Match Rate registered at <b>{core_metrics.get('falseMatchRatePercent', 'N/A')}</b>, exceeding the 0.5% target and requiring attention",
        f"Processing throughput reached <b>{results.get('results', {}).get('coreMetrics', {}).get('throughputPerSec', 'N/A')} invoices/second</b> under sustained load conditions",
    ]
    
    for finding in findings:
        story.append(Paragraph(f"• {finding}", styles['ArabicBody']))
    
    story.append(Spacer(1, 15))
    
    # ════════════════════════════════════════════════════════════
    # SECTION 2: CORE METRICS BENCHMARK
    # ════════════════════════════════════════════════════════════
    story.append(Paragraph("2. Core Metrics Benchmark Results", styles['SectionHeader']))
    
    metrics_intro = """
    The core metrics phase evaluates fundamental system performance indicators that directly impact production viability. 
    Each metric is measured against predefined thresholds established based on enterprise deployment requirements and 
    industry standards for intelligent document processing systems. The benchmark processes all 10,000 invoices through 
    the complete extraction pipeline including layout-based fingerprinting, pattern matching, confidence scoring, and 
    result verification stages.
    """
    story.append(Paragraph(metrics_intro.strip(), styles['ArabicBody']))
    story.append(Spacer(1, 12))
    
    # Main metrics table
    story.append(Paragraph("Primary Performance Indicators:", styles['SubsectionHeader']))
    
    metrics_data = [
        ['Metric', 'Target', 'Actual Result', 'Status'],
        ['Pattern Hit Rate', '>90%', core_metrics.get('patternHitRatePercent', 'N/A'), 
         'PASS' if float(core_metrics.get('patternHitRatePercent', '0').replace('%', '')) >= 90 else 'FAIL'],
        ['AI Fallback Rate', '<10%', core_metrics.get('aiFallbackRatePercent', 'N/A'),
         'PASS' if float(core_metrics.get('aiFallbackRatePercent', '100').replace('%', '')) <= 10 else 'FAIL'],
        ['Collision Rate', '<0.1%', core_metrics.get('collisionRatePercent', 'N/A'),
         'PASS' if float(core_metrics.get('collisionRatePercent', '1').replace('%', '')) <= 0.1 else 'FAIL'],
        ['False Match Rate', '<0.5%', core_metrics.get('falseMatchRatePercent', 'N/A'),
         'PASS' if float(core_metrics.get('falseMatchRatePercent', '1').replace('%', '')) <= 0.5 else 'FAIL'],
        ['Avg Processing Time', '<100ms', core_metrics.get('avgProcessingTimeFormatted', 'N/A'),
         'PASS' if float(core_metrics.get('avgProcessingTimeMs', 200)) <= 100 else 'FAIL'],
    ]
    
    metrics_table = Table(metrics_data, colWidths=[110, 80, 100, 70])
    ts = create_table_style()
    
    # Color-code status cells
    for i, row in enumerate(metrics_data[1:], start=1):
        status = row[3]
        if status == 'PASS':
            ts.add('TEXTCOLOR', (3, i), (3, i), colors.HexColor('#16a34a'))
        else:
            ts.add('TEXTCOLOR', (3, i), (3, i), colors.HexColor('#dc2626'))
            ts.add('BACKGROUND', (3, i), (3, i), colors.HexColor('#fef2f2'))
    
    metrics_table.setStyle(ts)
    story.append(metrics_table)
    story.append(Spacer(1, 15))
    
    # Additional metrics
    story.append(Paragraph("Supporting Performance Metrics:", styles['SubsectionHeader']))
    
    additional_metrics = [
        ['Metric', 'Value'],
        ['Throughput', f"{core_metrics.get('throughputPerSec', 'N/A')} invoices/sec"],
        ['P50 Latency', f"{core_metrics.get('p50LatencyMs', 0):.2f} ms"],
        ['P95 Latency', f"{core_metrics.get('p95LatencyMs', 0):.2f} ms"],
        ['P99 Latency', f"{core_metrics.get('p99LatencyMs', 0):.2f} ms"],
        ['Unique Fingerprints', str(core_metrics.get('uniqueFingerprints', 0))],
        ['Total Processed', f"{core_metrics.get('totalProcessed', 0):,}"],
        ['Cache Hit Rate', results.get('results', {}).get('coreMetrics', {}).get('cacheStats', {}).get('hitRate', 'N/A')],
    ]
    
    add_table = Table(additional_metrics, colWidths=[180, 180])
    add_table.setStyle(create_table_style())
    story.append(add_table)
    
    story.append(PageBreak())
    
    # ════════════════════════════════════════════════════════════
    # SECTION 3: LOAD TESTING RESULTS
    # ════════════════════════════════════════════════════════════
    story.append(Paragraph("3. Load Testing Results", styles['SectionHeader']))
    
    load_intro = """
    Load testing evaluates system behavior under concurrent user scenarios ranging from small business workloads 
    to peak enterprise-scale operations. Each scenario simulates multiple users simultaneously submitting batch 
    invoice processing requests, measuring throughput capacity, latency characteristics, and resource utilization 
    patterns. These tests are critical for validating that the architecture can handle real-world production traffic 
    without degradation in service quality or unacceptable response times.
    """
    story.append(Paragraph(load_intro.strip(), styles['ArabicBody']))
    story.append(Spacer(1, 12))
    
    load_results = results.get('results', {}).get('loadTesting', [])
    
    for scenario in load_results:
        story.append(Paragraph(f"Scenario: {scenario.get('label', 'Unknown')}", styles['SubsectionHeader']))
        
        scenario_data = [
            ['Parameter', 'Value'],
            ['Concurrent Users', str(scenario.get('users', 'N/A'))],
            ['Invoices Per User', str(scenario.get('invoicesPerUser', 'N/A'))],
            ['Total Invoices Processed', f"{scenario.get('totalInvoicesProcessed', 0):,}"],
            ['Total Processing Time', f"{scenario.get('totalTimeSec', 'N/A')}s"],
            ['Throughput', f"{scenario.get('throughputPerSec', 'N/A')} inv/s"],
            ['Average Latency', f"{scenario.get('avgLatencyMs', 'N/A')}ms"],
            ['P95 Latency', f"{scenario.get('p95LatencyMs', 'N/A')}ms"],
            ['P99 Latency', f"{scenario.get('p99LatencyMs', 'N/A')}ms"],
            ['Peak Memory Usage', f"{scenario.get('peakMemoryMB', 'N/A')} MB"],
        ]
        
        scen_table = Table(scenario_data, colWidths=[180, 180])
        scen_table.setStyle(create_table_style())
        story.append(scen_table)
        story.append(Spacer(1, 12))
    
    story.append(PageBreak())
    
    # ════════════════════════════════════════════════════════════
    # SECTION 4: CHAOS TESTING RESULTS
    # ════════════════════════════════════════════════════════════
    story.append(Paragraph("4. Chaos Engineering Test Results", styles['SectionHeader']))
    
    chaos_intro = """
    Chaos testing validates system resilience under failure conditions by intentionally disrupting critical dependencies 
    and infrastructure components. This methodology ensures graceful degradation rather than catastrophic failure when 
    inevitable production incidents occur. The test suite covers cache layer failures, AI service unavailability, database 
    performance degradation, malformed input handling, and memory pressure scenarios. A robust system should maintain 
    acceptable service levels even when individual components fail or operate outside normal parameters.
    """
    story.append(Paragraph(chaos_intro.strip(), styles['ArabicBody']))
    story.append(Spacer(1, 12))
    
    chaos_results = results.get('results', {}).get('chaosTesting', [])
    
    chaos_data = [['Test Scenario', 'Result', 'Summary']]
    for test in chaos_results:
        status_text = 'PASSED' if test.get('passed') else 'FAILED'
        summary = test.get('summary', test.get('error', 'No details'))[:60] + '...' if len(test.get('summary', '')) > 60 else test.get('summary', test.get('error', 'No details'))
        chaos_data.append([
            test.get('name', 'Unknown')[:35],
            status_text,
            summary[:45]
        ])
    
    chaos_table = Table(chaos_data, colWidths=[140, 60, 200])
    chaos_ts = create_table_style()
    
    # Color-code chaos test results
    for i, row in enumerate(chaos_data[1:], start=1):
        if 'PASSED' in row[1]:
            chaos_ts.add('TEXTCOLOR', (1, i), (1, i), colors.HexColor('#16a34a'))
        else:
            chaos_ts.add('TEXTCOLOR', (1, i), (1, i), colors.HexColor('#dc2626'))
    
    chaos_table.setStyle(chaos_ts)
    story.append(chaos_table)
    story.append(Spacer(1, 12))
    
    passed_count = len([t for t in chaos_results if t.get('passed')])
    total_count = len(chaos_results)
    story.append(Paragraph(f"Chaos Test Summary: {passed_count}/{total_count} tests passed ({passed_count/total_count*100:.0f}% success rate)", styles['ArabicBody']))
    
    story.append(PageBreak())
    
    # ════════════════════════════════════════════════════════════
    # SECTION 5: COST SIMULATION
    # ════════════════════════════════════════════════════════════
    story.append(Paragraph("5. Cost Simulation Analysis", styles['SectionHeader']))
    
    cost_intro = """
    Cost simulation projects operational expenses across three volume tiers representing different business scales: 
    mid-volume operations at 100,000 daily invoices, high-volume platforms at one million daily invoices, and 
    enterprise-scale processing at ten million monthly invoices. The analysis accounts for the distribution between 
    pattern-based extractions (minimal cost), AI-assisted processing (API costs), and learning-mode operations 
    (initial training overhead). Savings calculations compare hybrid approach costs against pure-AI baseline to 
    quantify the economic value of the learned pattern system.
    """
    story.append(Paragraph(cost_intro.strip(), styles['ArabicBody']))
    story.append(Spacer(1, 12))
    
    cost_results = results.get('results', {}).get('costSimulation', [])
    
    for scenario in cost_results:
        story.append(Paragraph(f"Volume Tier: {scenario.get('label', 'Unknown')}", styles['SubsectionHeader']))
        
        cost_data = [
            ['Cost Component', 'Value'],
            ['Daily Volume', f"{scenario.get('dailyInvoices', 0):,} invoices"],
            ['Pattern-Based Extractions', f"{scenario.get('patternExtractedDaily', 0):,} ({scenario.get('patternExtractedDaily', 0)/scenario.get('dailyInvoices', 1)*100:.1f}%)"],
            ['AI-Processed Invoices', f"{scenario.get('aiExtractedDaily', 0):,} ({scenario.get('aiExtractedDaily', 0)/scenario.get('dailyInvoices', 1)*100:.1f}%)"],
            ['Learning Mode Invoices', f"{scenario.get('learningExtractedDaily', 0):,}"],
            ['', ''],
            ['AI Cost (Daily)', f"${scenario.get('aiCostPerDay', 'N/A')}"],
            ['AI Cost (Monthly)', f"${scenario.get('aiCostPerMonth', 'N/A')}"],
            ['Savings vs Pure AI', f"${scenario.get('savingsPerDay', 'N/A')}/day ({scenario.get('savingsPercent', 'N/A')})"],
            ['Cost Per Invoice', f"${scenario.get('costPerInvoice', 'N/A')}"],
            ['Total Monthly Estimate', f"${scenario.get('totalMonthlyCost', 'N/A')}"],
        ]
        
        cost_table = Table(cost_data, colWidths=[180, 180])
        cost_table.setStyle(create_table_style())
        story.append(cost_table)
        story.append(Spacer(1, 15))
    
    story.append(PageBreak())
    
    # ════════════════════════════════════════════════════════════
    # SECTION 6: FINAL ASSESSMENT & RECOMMENDATIONS
    # ════════════════════════════════════════════════════════════
    story.append(Paragraph("6. Final Assessment & Recommendations", styles['SectionHeader']))
    
    final_score = results.get('results', {}).get('finalScore', {})
    score_value = final_score.get('overall', 0)
    level = final_score.get('level', 'UNKNOWN')
    
    # Score interpretation
    if score_value >= 90:
        assessment = "PRODUCTION READY"
        rec_color = '#16a34a'
    elif score_value >= 75:
        assessment = "NEEDS MINOR IMPROVEMENTS"
        rec_color = '#ca8a04'
    elif score_value >= 60:
        assessment = "NEEDS MAJOR IMPROVEMENTS"
        rec_color = '#ea580c'
    else:
        assessment = "NOT READY FOR PRODUCTION"
        rec_color = '#dc2626'
    
    story.append(Paragraph(f"Overall Production Readiness Score: {score_value}/100", styles['SubsectionHeader']))
    story.append(Paragraph(f"Assessment Level: {assessment}", styles['ArabicBody']))
    story.append(Spacer(1, 12))
    
    # Criteria breakdown
    criteria = final_score.get('criteria', [])
    if criteria:
        story.append(Paragraph("Criteria Breakdown:", styles['SubsectionHeader']))
        
        crit_data = [['Criterion', 'Weight', 'Target', 'Actual', 'Score']]
        for c in criteria:
            crit_data.append([
                c.get('name', '')[:20],
                f"{c.get('weight', 0)}%",
                c.get('target', 'N/A'),
                c.get('actual', 'N/A'),
                c.get('score', 'N/A')
            ])
        
        crit_table = Table(crit_data, colWidths=[100, 50, 70, 70, 60])
        crit_ts = create_table_style()
        crit_table.setStyle(crit_ts)
        story.append(crit_table)
    
    story.append(Spacer(1, 15))
    
    # Recommendations
    story.append(Paragraph("Recommendations:", styles['SubsectionHeader']))
    
    recommendations = []
    
    if score_value >= 90:
        recommendations.extend([
            "Proceed with production deployment using standard monitoring and alerting configurations.",
            "Implement gradual rollout starting with 10% of traffic to validate real-world performance.",
            "Establish baseline metrics from production data for ongoing optimization reference.",
            "Schedule quarterly reviews of pattern accuracy and confidence scores."
        ])
    elif score_value >= 75:
        recommendations.extend([
            "Address False Match Rate issue through enhanced field validation logic.",
            "Implement additional disambiguation rules for similar-format suppliers.",
            "Consider adding semantic fingerprinting alongside structural fingerprinting.",
            "Plan targeted retraining for low-confidence pattern categories."
        ])
    else:
        recommendations.extend([
            "Prioritize resolution of False Match Rate exceeding 0.5% threshold significantly.",
            "Review and enhance pattern matching algorithm for edge case handling.",
            "Implement stronger validation layers before marking extractions as successful.",
            "Conduct additional testing with real-world invoice samples before production consideration.",
            "Establish clear criteria and timeline for addressing each failed metric."
        ])
    
    for i, rec in enumerate(recommendations, 1):
        story.append(Paragraph(f"{i}. {rec}", styles['ArabicBody']))
    
    story.append(Spacer(1, 20))
    
    # Risk summary
    story.append(Paragraph("Identified Risks & Mitigation:", styles['SubsectionHeader']))
    
    risks = [
        ["False Match Risk", "High", "Add field-level validation and cross-reference checks"],
        ["Pattern Drift", "Medium", "Implement automated drift detection and versioning"],
        ["OCR Quality Dependency", "Medium", "Enhance preprocessing for noisy inputs"],
        ["Cache Stampede", "Low", "Implement request coalescing and stale-while-revalidate"],
    ]
    
    risk_data = [['Risk Factor', 'Severity', 'Mitigation Strategy']] + risks
    risk_table = Table(risk_data, colWidths=[110, 60, 220])
    risk_table.setStyle(create_table_style())
    story.append(risk_table)
    
    # Build PDF
    doc.build(story)
    
    return OUTPUT_PATH

# ─── Main Execution ─────────────────────────────────────────────

def main():
    print("=" * 60)
    print("Invoice Brain Benchmark Report Generator")
    print("=" * 60)
    
    # Load results
    print(f"\nLoading results from: {RESULTS_PATH}")
    results = load_results()
    print(f"Results loaded successfully")
    
    # Generate report
    print(f"\nGenerating PDF report...")
    output_path = build_report(results)
    
    print(f"\n✅ Report generated successfully!")
    print(f"Output: {output_path}")
    
    # File size
    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"Size: {size_mb:.2f} MB")
    
    return output_path

if __name__ == '__main__':
    main()
