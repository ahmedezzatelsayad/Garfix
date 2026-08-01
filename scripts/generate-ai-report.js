/**
 * GarfiX AI Enterprise System - Comprehensive Report Generator
 * 
 * Generates a detailed technical report about the AI system implementation
 */

const { Document, Packer, Paragraph, TextRun, Header, Footer,
        AlignmentType, HeadingLevel, PageNumber, Table, TableRow, TableCell,
        WidthType, BorderStyle, ShadingType, PageBreak, SectionType,
        TableOfContents } = require("docx");
const fs = require("fs");

// ── Palette (Professional Tech Report) ──────────────────────
const P = {
  primary: "#7C3AED",    // Violet/Purple
  secondary: "#1E293B",  // Dark slate
  accent: "#06B6D4",     // Cyan
  success: "#10B981",    // Green
  warning: "#F59E0B",    // Amber
  danger: "#EF4444",     // Red
  body: "#334155",       // Slate
  light: "#F8FAFC",      // Light background
};

const c = (hex) => hex.replace("#", "");

// ── Component Builders ─────────────────────────────────────

function heading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({
    heading: level,
    spacing: { before: level === HeadingLevel.HEADING_1 ? 400 : 300, after: 200 },
    children: [
      new TextRun({ 
        text, 
        bold: true, 
        color: c(P.primary),
        font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" },
        size: level === HeadingLevel.HEADING_1 ? 36 : level === HeadingLevel.HEADING_2 ? 28 : 24
      })
    ]
  });
}

function body(text) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 360, after: 200 },
    indent: { firstLine: 480 },
    children: [
      new TextRun({ 
        text, 
        size: 24, 
        color: c(P.body),
        font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" }
      })
    ]
  });
}

function bullet(text) {
  return new Paragraph({
    spacing: { line: 320, after: 120 },
    indent: { left: 720 },
    children: [
      new TextRun({ text: "• ", size: 24, color: c(P.accent) }),
      new TextRun({ 
        text, 
        size: 24, 
        color: c(P.body),
        font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" }
      })
    ]
  });
}

function metricCard(title, value, subtitle, color = P.accent) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [2500, 7500],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 25, type: WidthType.PERCENTAGE },
            shading: { fill: color, type: ShadingType.CLEAR },
            borders: {
              top: { style: BorderStyle.NONE },
              bottom: { style: BorderStyle.NONE },
              left: { style: BorderStyle.NONE },
              right: { style: BorderStyle.NONE }
            },
            children: [new Paragraph({ children: [] })]
          }),
          new TableCell({
            width: { size: 75, type: WidthType.PERCENTAGE },
            shading: { fill: color + "20", type: ShadingType.CLEAR },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 1, color: color },
              bottom: { style: BorderStyle.SINGLE, size: 1, color: color },
              left: { style: BorderStyle.SINGLE, size: 1, color: color },
              right: { style: BorderStyle.SINGLE, size: 1, color: color }
            },
            children: [
              new Paragraph({ spacing: { before: 100, after: 50 }, children: [
                new TextRun({ text: title, bold: true, size: 20, color: c(color) })
              ]}),
              new Paragraph({ spacing: { after: 100 }, children: [
                new TextRun({ text: value, bold: true, size: 32, color: c(P.secondary) })
              ]}),
              ...(subtitle ? [new Paragraph({ spacing: { after: 100 }, children: [
                new TextRun({ text: subtitle, size: 18, color: c(P.body) })
              ]})] : [])
            ]
          })
        ]
      })
    ]
  });
}

function infoBox(title, content, type = 'info') {
  const colors = {
    info: { bg: "#EFF6FF", border: "#3B82F6", title: "#1D4ED8" },
    warning: { bg: "#FFFBEB", border: "#F59E0B", title: "#D97706" },
    success: { bg: "#ECFDF5", border: "#10B981", title: "#059669" },
    danger: { bg: "#FEF2F2", border: "#EF4444", title: "#DC2626" }
  };
  const theme = colors[type] || colors.info;
  
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 100, type: WidthType.PERCENTAGE },
            shading: { fill: theme.bg, type: ShadingType.CLEAR },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 8, color: theme.border },
              bottom: { style: BorderStyle.SINGLE, size: 8, color: theme.border },
              left: { style: BorderStyle.SINGLE, size: 8, color: theme.border },
              right: { style: BorderStyle.SINGLE, size: 8, color: theme.border }
            },
            margins: { top: 200, bottom: 200, left: 300, right: 300 },
            children: [
              new Paragraph({ spacing: { after: 100 }, alignment: AlignmentType.CENTER, children: [
                new TextRun({ text: title, bold: true, size: 22, color: c(theme.title) })
              ]}),
              ...content.split('\n').map(line => new Paragraph({
                spacing: { after: 80 },
                children: [new TextRun({ text: line, size: 20, color: c(P.body) })]
              }))
            ]
          })
        ]
      })
    ]
  });
}

function codeBlock(code) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 100, type: WidthType.PERCENTAGE },
            shading: { fill: "#1E293B", type: ShadingType.CLEAR },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 1, color: "#334155" },
              bottom: { style: BorderStyle.SINGLE, size: 1, color: "#334155" },
              left: { style: BorderStyle.SINGLE, size: 1, color: "#334155" },
              right: { style: BorderStyle.SINGLE, size: 1, color: "#334155" }
            },
            margins: { top: 150, bottom: 150, left: 200, right: 200 },
            children: code.split('\n').map(line => new Paragraph({
              spacing: { after: 40, line: 276 },
              children: [new TextRun({ 
                text: line || " ", 
                size: 18, 
                font: "Consolas",
                color: c("#E2E8F0")
              })]
            }))
          })
        ]
      })
    ]
  });
}

// ── Document Content ───────────────────────────────────────

const doc = new Document({
  styles: {
    default: {
      document: {
        run: { 
          font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" }, 
          size: 24, 
          color: c(P.body) 
        },
        paragraph: { spacing: { line: 360 } }
      }
    }
  },
  sections: [
    // ── Cover Section ───────────────────────────────────
    {
      properties: {
        page: { margin: { top: 0, bottom: 0, left: 0, right: 0 } }
      },
      children: [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          columnWidths: [10000],
          rows: [
            // Spacer
            new TableRow({ height: { value: 2000, rule: "exact" }, children: [
              new TableCell({ shading: { fill: P.primary, type: ShadingType.CLEAR }, children: [new Paragraph({ children: [new TextRun("")] })] })
            ] }),
            // Title area
            new TableRow({ children: [
              new TableCell({ 
                shading: { fill: P.primary, type: ShadingType.CLEAR },
                margins: { top: 400, bottom: 400, left: 600, right: 600 },
                children: [
                  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [
                    new TextRun({ text: "GARFIX EOS", bold: true, size: 48, color: c("#FFFFFF"), font: "Calibri" })
                  ]}),
                  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [
                    new TextRun({ text: "Enterprise SaaS ERP System", size: 28, color: c("#C4B5FD"), font: "Calibri" })
                  ]}),
                  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [
                    new TextRun({ text: "━━━━━━━━━━━━━━━━━━━━━", size: 20, color: c("#A78BFA") })
                  ]}),
                  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [
                    new TextRun({ text: "GarfiX AI Enterprise System", bold: true, size: 40, color: c("#FFFFFF"), font: "Calibri" })
                  ]}),
                  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [
                    new TextRun({ text: "Comprehensive Technical Report v2.0", size: 24, color: c("#DDD6FE"), font: "Calibri" })
                  ]})
                ]
              })
            ]}),
            // Bottom info
            new TableRow({ height: { value: 2400, rule: "exact" }, children: [
              new TableCell({ 
                shading: { fill: P.primary, type: ShadingType.CLEAR },
                margins: { left: 600, right: 600 },
                verticalAlign: "bottom",
                children: [
                  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [
                    new TextRun({ text: "Multi-Key Gemini Integration | Queue-Based Workers | Auto-Scaling", size: 20, color: c("#C4B5FD") })
                  ]}),
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [
                    new TextRun({ text: `Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, size: 18, color: c("#A78BFA") })
                  ]})
                ]
              })
            ]})
          ]
        })
      ]
    },

    // ── Body Section ─────────────────────────────────────
    {
      properties: {
        page: { margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 } }
      },
      headers: {
        default: new Header({
          children: [new Paragraph({ 
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: "GarfiX AI Enterprise System | Technical Report", size: 18, color: c("#94A3B8") })] 
          })]
        })
      },
      children: [
        // ── Executive Summary ─────────────────────────
        heading("Executive Summary"),
        
        body("This comprehensive report documents the complete implementation of GarfiX AI Enterprise System, a sophisticated multi-key load balancing and queue-based processing architecture designed for the MENA region's ERP platform. The system leverages Google Gemini Free Tier API keys distributed across five family member accounts to achieve a combined capacity of 75 requests per minute (RPM), enabling enterprise-grade artificial intelligence capabilities without incurring any costs."),

        body("The implementation addresses critical challenges including rate limiting at the pool level, automatic failover mechanisms, health monitoring for each API key, quota tracking, weighted load balancing strategies, and real-time metrics visualization through an intuitive dashboard interface. The architecture follows enterprise patterns with circuit breakers, back-pressure handling, and pool-aware auto-scaling that respects overall system capacity rather than allowing individual components to over-commit resources."),

        infoBox("Key Achievements", "✅ 5 Gemini API Keys Integrated (75 RPM Total Capacity)\n✅ Zero-Cost Operation (Google Free Tier)\n✅ Queue-Based Processing (No Request Rejection)\n✅ Real-Time Health Monitoring & Alerts\n✅ Automatic Failover with Circuit Breakers\n✅ Pool-Aware Auto-Scaling\n✅ Arabic RTL Dashboard Interface\n✅ Comprehensive Metrics API", "success"),

        // ── System Architecture ─────────────────────────
        heading("System Architecture Overview"),
        
        heading("High-Level Architecture", HeadingLevel.HEADING_2),
        
        body("The GarfiX AI system follows a layered architecture pattern that separates concerns across multiple abstraction levels. At the foundation lies the Google Generative AI SDK which provides direct access to Gemini models. Above this sits the Advanced Load Balancer component that manages key distribution, health monitoring, and circuit breaker logic. The Worker Router layer handles job classification and routing to specialized processing functions. Finally, the Rate Limiter component enforces pool-level constraints to prevent overload conditions."),

        body("The integration with BullMQ queue system ensures that all AI operations are processed asynchronously, providing resilience against temporary failures and enabling back-pressure handling when demand exceeds capacity. This design choice means that the system will never reject incoming requests due to rate limiting; instead, excess requests are queued for later processing with estimated wait times provided to clients."),

        codeBlock(`┌─────────────────────────────────────────────────────────┐
│                 GarfiX AI Architecture               │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Client → API → RateLimiter → BullMQ → WorkerRouter   │
│                                        │                │
│                              ┌───────┴───────┐         │
│                              │   Workers     │         │
│                              │ ├─ Chat       │         │
│                              │ ├─ Invoice    │         │
│                              │ ├─ Parse      │         │
│                              │ ├─ Accounting │         │
│                              │ ├─ Sales      │         │
│                              │ └─ Inventory  │         │
│                              └───────┬───────┘         │
│                                      │                 │
│                         ┌────────────▼────────────┐    │
│                         │ Advanced Load Balancer  │    │
│                         │ • Weighted Strategy    │    │
│                         │ • Health Checks        │    │
│                         │ • Circuit Breakers     │    │
│                         └────────────┬────────────┘    │
│                                      │                 │
│                    ┌─────────────────┼─────────────┐  │
│                    ▼                 ▼              ▼  │
│               ┌────────┐    ┌────────┐    ┌────────┐│
│               │ Key 1  │    │ Key 2  │...│ Key 5  ││
│               │ 15 RPM │    │ 15 RPM │   │ 15 RPM ││
│               └────────┘    └────────┘    └────────┘│
│                                                         │
│              Total: 75 RPM | 5M Tokens/Day           │
└─────────────────────────────────────────────────────────┘`),

        // ── Components Deep Dive ────────────────────────
        heading("Core Components Implementation", HeadingLevel.HEADING_2),
        
        heading("1. Advanced Load Balancer (advanced-loadbalancer.ts)", HeadingLevel.HEADING_3),
        
        body("The Advanced Load Balancer represents a significant enhancement over basic round-robin distribution. It implements five distinct balancing strategies that can be selected based on operational requirements. The weighted strategy, configured as the default, calculates a composite score for each key based on remaining RPM capacity (70% weight) and available token quota (30% weight), then probabilistically routes requests to favor healthier keys."),

        bullet("Health Check System: Every 30 seconds, each key receives a minimal ping request to verify connectivity. The system tracks consecutive failures, last error messages, and response latency using exponential moving averages with a smoothing factor of 0.3."),

        bullet("Circuit Breaker Pattern: When a key accumulates 3 consecutive failures, its circuit transitions from CLOSED to OPEN state, blocking all traffic for 60 seconds. After cooldown, it enters HALF-OPEN state allowing limited test traffic before full recovery or re-opening."),

        bullet("Quota Tracking: The balancer maintains daily counters for requests and tokens per key, enabling proactive alerting when consumption approaches the 1 million token daily limit imposed by Google's free tier."),

        heading("2. AI Queue Workers System (aiWorkers.ts)", HeadingLevel.HEADING_3),
        
        body("The Queue Workers system transforms all AI operations from synchronous API calls into asynchronous background jobs processed through BullMQ. This architectural decision provides several critical benefits: resilience against transient failures, natural back-pressure handling, priority-based execution, and horizontal scaling capability across multiple server instances."),

        body("Six specialized workers handle different aspects of AI processing. The Chat Agent manages conversational interactions with memory persistence and context awareness. The Invoice Brain performs intelligent extraction with pattern learning that reduces API calls over time as it recognizes recurring invoice formats. The Smart Parse worker handles multi-format document analysis including PDF optical character recognition and WhatsApp message parsing. Three specialist agents provide domain-specific expertise for accounting, sales, and inventory operations."),

        heading("3. Pool-Level Rate Limiter", HeadingLevel.HEADING_3),
        
        body("Unlike traditional per-client rate limiting, the Pool-Level Rate Limiter enforces constraints on aggregate system capacity rather than individual user quotas. This prevents the scenario where multiple healthy agents collectively overwhelm the shared key pool. The limiter maintains a sliding window of request timestamps spanning 60 seconds, providing accurate real-time RPM calculations."),

        body("When the pool approaches its 75 RPM capacity limit, the limiter automatically transitions from immediate processing to queue-based deferral. Requests are never rejected due to rate limiting; instead, they enter the BullMQ queue with estimated wait times calculated based on current depth and historical processing rates. Only when the queue exceeds 1000 pending jobs does the system return a polite retry recommendation to prevent unbounded memory growth."),

        heading("4. Enhanced Auto-Scaler (enhanced-worker-scaler.ts)", HeadingLevel.HEADING_3),
        
        body("The Enhanced Auto-Scaler introduces pool-awareness to the worker scaling decisions. Traditional scalers might increase worker count based solely on queue depth, potentially exacerbating overload situations. This enhanced version calculates a health factor combining pool utilization percentage (60% weight) and key health ratio (40% weight), then applies multiplicative scaling factors: 1.0x for healthy pools, 0.5x for degraded pools, and 0.25x for critical pools."),

        body("The scaler implements graduated response thresholds. Queue depths below 50 trigger no action (normal operation). Depths between 150-300 initiate monitoring with scale-up consideration after two consecutive checks. Depths exceeding 300 trigger immediate emergency scaling with doubled step sizes. Conversely, three consecutive checks showing empty queues initiate gradual scale-down to conserve resources during low-demand periods."),

        // ── Capacity Planning ────────────────────────────
        heading("Capacity & Performance Analysis", HeadingLevel.HEADING_2),
        
        heading("Theoretical Maximum Capacity", HeadingLevel.HEADING_3),

        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          columnWidths: [3500, 3000, 3500],
          rows: [
            new TableRow({
              tableHeader: true,
              children: ["Metric", "Value", "Notes"].map(h => 
                new TableCell({
                  shading: { fill: P.primary, type: ShadingType.CLEAR },
                  children: [new Paragraph({ 
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: h, bold: true, size: 22, color: c("#FFFFFF") })] 
                  })]
                })
              )
            }),
            new TableRow({ children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Total RPM Capacity", size: 20 })] })] }),
              new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "75 RPM", bold: true, size: 22, color: c(P.success) })] })] }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "5 keys × 15 RPM each", size: 18, color: c("#64748B") })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Hourly Capacity", size: 20 })] })] }),
              new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "4,500 requests", bold: true, size: 22, color: c(P.success) })] })] }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Sustained throughput", size: 18, color: c("#64748B") })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Daily Capacity", size: 20 })] })] }),
              new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "108,000 requests", bold: true, size: 22, color: c(P.success) })] })] }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "24-hour continuous", size: 18, color: c("#64748B") })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Token Quota (Total)", size: 20 })] })] }),
              new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "5 Million/day", bold: true, size: 22, color: c(P.success) })] })] }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "1M per key free tier", size: 18, color: c("#64748B") })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Invoice Processing", size: 20 })] })] }),
              new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "36,000-108,000/day", bold: true, size: 22, color: c(P.success) })] })] }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Depends on complexity", size: 18, color: c("#64748B") })] })] })
            ]})
          ]
        }),

        new Paragraph({ spacing: { before: 300, after: 200 }, children: [] }),

        heading("Real-World Scenarios", HeadingLevel.HEADING_3),

        body("For a medium-sized Egyptian company with 50 employees processing approximately 50 invoices daily, the system operates at less than 1% of its total capacity. Even large enterprises with 500+ employees generating 500+ invoices daily would utilize only 5-15% of available capacity. This substantial headroom ensures consistent performance even during peak periods such as month-end closing or promotional campaigns."),

        infoBox("Capacity Example: Medium Company (50 Employees)", "• Daily Invoices: 50-100\n• Monthly Volume: 1,000-2,500\n• Annual Estimate: 12,000-30,000\n• System Utilization: < 1%\n• Headroom Available: 99%+\n\nConclusion: More than sufficient for normal operations with ample room for growth.", "info"),

        // ── Risk Mitigation ────────────────────────────────
        heading("Risk Assessment & Mitigation Strategies", HeadingLevel.HEADING_2),

        heading("Identified Risks", HeadingLevel.HEADING_3),

        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          columnWidths: [3000, 2500, 4500],
          rows: [
            new TableRow({
              tableHeader: true,
              children: ["Risk", "Severity", "Mitigation Strategy"].map(h => 
                new TableCell({
                  shading: { fill: P.secondary, type: ShadingType.CLEAR },
                  children: [new Paragraph({ 
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: h, bold: true, size: 20, color: c("#FFFFFF") })] 
                  })]
                })
              )
            }),
            new TableRow({ children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Key Account Suspension", size: 18 })] })] }),
              new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "HIGH", bold: true, size: 18, color: c(P.danger) })] })] }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Circuit breaker isolates failed keys; automatic failover to remaining keys reduces capacity gracefully (75→60→45→30→15 RPM)", size: 18 })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Pool Overload (>75 RPM)", size: 18 })] })] }),
              new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "MEDIUM", bold: true, size: 18, color: c(P.warning) })] })] }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Hard cap enforcement; excess requests queue instead of failing; back-pressure with wait time estimates", size: 18 })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Regional Service Disruption", size: 18 })] })] }),
              new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "MEDIUM", bold: true, size: 18, color: c(P.warning) })] })] }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Queue-based processing survives temporary outages; jobs persist until service restoration", size: 18 })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Quota Exhaustion (Tokens)", size: 18 })] })] }),
              new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "LOW", bold: true, size: 18, color: c(P.success) })] })] }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Per-key tracking with alerts at 90%; daily automatic reset; weighted balancing distributes load", size: 18 })] })] })
            ]})
          ]
        }),

        new Paragraph({ spacing: { before: 300, after: 200 }, children: [] }),

        // ── Dashboard UI ───────────────────────────────────
        heading("Dashboard Interface", HeadingLevel.HEADING_2),

        body("The administrative dashboard provides real-time visibility into all aspects of the AI system's operation. Accessible at /founder-panel/ai-dashboard within the founder panel, the interface features an Arabic-first RTL design with comprehensive monitoring capabilities."),

        body("The dashboard implements four main views accessible via tab navigation. The Overview tab presents a high-level utilization gauge alongside summary metric cards for today's activity, active workers, and queue status. The Keys tab displays individual health cards for each of the five Gemini API keys, showing RPM utilization progress bars, token quota consumption, latency statistics, and consecutive failure counts. The Workers tab provides performance breakdowns for all six AI worker types with active job counts and average processing times. The Queue tab visualizes pending and running job counts with success rate indicators."),

        bullet("Auto-refresh functionality updates data every 10 seconds when enabled, ensuring administrators have near-real-time visibility into system health without manual intervention."),

        bullet("Alert system categorizes notifications by severity: informational status updates (blue), warnings for elevated metrics (amber), errors for individual component failures (red), and critical alerts requiring immediate attention (dark red with emphasis)."),

        bullet("Administrative controls include manual refresh triggers, daily quota reset capability (with confirmation dialog), and auto-refresh toggle for bandwidth-constrained environments."),

        // ── Files Created ────────────────────────────────
        heading("Deliverables & File Structure", HeadingLevel.HEADING_2),

        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          columnWidths: [4500, 2000, 3500],
          rows: [
            new TableRow({
              tableHeader: true,
              children: ["File Path", "Size", "Purpose"].map(h => 
                new TableCell({
                  shading: { fill: P.primary, type: ShadingType.CLEAR },
                  children: [new Paragraph({ 
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: h, bold: true, size: 20, color: c("#FFFFFF") })] 
                  })]
                })
              )
            }),
            new TableRow({ children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "src/lib/workers/aiWorkers.ts", font: "Consolas", size: 18 })] })] }),
              new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "~22 KB", size: 18 })] })] }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Queue Workers + Rate Limiter + Metrics", size: 18 })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "src/lib/ai/advanced-loadbalancer.ts", font: "Consolas", size: 18 })] })] }),
              new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "~19 KB", size: 18 })] })] }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Advanced LB + Health Checks + Circuit Breaker", size: 18 })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "src/lib/ai-fabric/enhanced-worker-scaler.ts", font: "Consolas", size: 18 })] })] }),
              new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "~12 KB", size: 18 })] })] }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Pool-Aware Auto-Scaler", size: 18 })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "src/app/api/ai/metrics/route.ts", font: "Consolas", size: 18 })] })] }),
              new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "~12 KB", size: 18 })] })] }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Metrics Dashboard API Endpoint", size: 18 })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "src/app/founder-panel/ai-dashboard/page.tsx", font: "Consolas", size: 18 })] })] }),
              new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "~27 KB", size: 18 })] })] }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Admin Dashboard UI (RTL Arabic)", size: 18 })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "src/lib/ai/ENTERPRISE-AI-SYSTEM.md", font: "Consolas", size: 18 })] })] }),
              new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "~27 KB", size: 18 })] })] }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Complete Technical Documentation", size: 18 })] })] })
            ]})
          ]
        }),

        new Paragraph({ spacing: { before: 300, after: 200 }, children: [] }),

        // ── Conclusion ────────────────────────────────────
        heading("Conclusion & Recommendations", HeadingLevel.HEADING_2),

        body("The GarfiX AI Enterprise System represents a production-ready implementation of sophisticated AI infrastructure specifically tailored for the MENA region's ERP market. By leveraging multiple free-tier API accounts with intelligent load balancing, the system achieves enterprise-grade capacity at zero operational cost for AI services."),

        body("The queue-based architecture ensures reliability under varying load conditions, while the comprehensive monitoring dashboard provides administrators with the visibility needed to maintain optimal performance. The automatic failover mechanisms and circuit breakers protect against individual key failures, and the pool-aware auto-scaling prevents cascading overload scenarios."),

        infoBox("Recommendations for Production Deployment", "1. Deploy from Egypt/MENA region for optimal API latency\n2. Configure webhook notifications for critical alerts\n3. Set up automated daily quota reset via cron job\n4. Monitor initial usage patterns for 2 weeks before adjusting thresholds\n5. Consider adding notification channels (Slack/Email) for admin alerts\n6. Implement backup provider integration (OpenRouter) for additional redundancy", "warning"),

        body("Future enhancements may include integration with additional AI providers beyond Google Gemini, implementation of predictive scaling based on historical patterns, addition of cost tracking for potential paid-tier upgrades, and development of tenant-specific AI customization options allowing companies to fine-tune behavior for their specific use cases.")
      ]
    }
  ]
});

// ── Generate Document ─────────────────────────────────────

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("/home/z/my-project/download/GarfiX_AI_Enterprise_System_Report.docx", buffer);
  console.log("✅ Report generated successfully!");
  console.log("📄 Location: /home/z/my-project/download/GarfiX_AI_Enterprise_System_Report.docx");
}).catch(err => {
  console.error("❌ Error generating report:", err);
});
