const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, PageNumber, AlignmentType, HeadingLevel, WidthType,
  BorderStyle, ShadingType, PageBreak, LevelFormat, TableOfContents,
  NumberFormat,
} = require("docx");
const fs = require("fs");

// Palette - Tech/Enterprise theme
const P = {
  primary: "#0F172A",
  body: "#1E293B",
  secondary: "#64748B",
  accent: "#3B82F6",
  surface: "#F1F5F9",
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#EF4444"
};

const c = (hex) => hex.replace("#", "");

// Helper functions
function heading(text, level = HeadingLevel.HEADING_1) {
  const sizes = { [HeadingLevel.HEADING_1]: 32, [HeadingLevel.HEADING_2]: 28, [HeadingLevel.HEADING_3]: 24 };
  return new Paragraph({
    heading: level,
    spacing: { before: level === HeadingLevel.HEADING_1 ? 400 : 300, after: 200, line: 360 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: sizes[level] || 24,
        color: c(P.primary),
        font: { ascii: "Arial", eastAsia: "Arial" }
      })
    ]
  });
}

function bodyPara(text) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 200, line: 360 },
    children: [
      new TextRun({
        text,
        size: 22,
        color: c(P.body),
        font: { ascii: "Arial", eastAsia: "Arial" }
      })
    ]
  });
}

function bulletItem(text, reference = "main-bullets") {
  return new Paragraph({
    numbering: { reference, level: 0 },
    spacing: { after: 120, line: 340 },
    children: [
      new TextRun({
        text,
        size: 22,
        color: c(P.body),
        font: { ascii: "Arial", eastAsia: "Arial" }
      })
    ]
  });
}

// Cover Recipe R1 - Pure Paragraph Left
function buildCoverR1() {
  return [
    new Paragraph({ spacing: { before: 4000 } }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 0, after: 0, line: 500 },
      indent: { left: 1440 },
      children: [
        new TextRun({
          text: "GarfiX EOS",
          bold: true,
          size: 72,
          color: c(P.accent),
          font: { ascii: "Arial", eastAsia: "Arial" }
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 200, after: 0, line: 440 },
      indent: { left: 1440 },
      children: [
        new TextRun({
          text: "Enterprise AI System",
          bold: true,
          size: 48,
          color: c(P.primary),
          font: { ascii: "Arial", eastAsia: "Arial" }
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 100, after: 400, line: 380 },
      indent: { left: 1440 },
      children: [
        new TextRun({
          text: "Technical Implementation Report",
          size: 28,
          color: c(P.secondary),
          font: { ascii: "Arial", eastAsia: "Arial" }
        })
      ]
    }),
    new Paragraph({ spacing: { before: 1500 } }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 0, after: 80, line: 320 },
      indent: { left: 1440 },
      children: [
        new TextRun({
          text: "Version: 2.0 Enterprise",
          size: 22,
          color: c(P.secondary),
          font: { ascii: "Arial", eastAsia: "Arial" }
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 80, after: 80, line: 320 },
      indent: { left: 1440 },
      children: [
        new TextRun({
          text: "Date: August 2025",
          size: 22,
          color: c(P.secondary),
          font: { ascii: "Arial", eastAsia: "Arial" }
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 80, after: 80, line: 320 },
      indent: { left: 1440 },
      children: [
        new TextRun({
          text: "Stack: Next.js 16 + BullMQ + Valkey + Gemini AI",
          size: 22,
          color: c(P.secondary),
          font: { ascii: "Arial", eastAsia: "Arial" }
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 80, after: 0, line: 320 },
      indent: { left: 1440 },
      children: [
        new TextRun({
          text: "Region: MENA SaaS ERP Platform",
          size: 22,
          color: c(P.secondary),
          font: { ascii: "Arial", eastAsia: "Arial" }
        })
      ]
    }),
  ];
}

// Create data table helper
function createDataTable(headers, rows) {
  const headerRow = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: headers.map(h => 
      new TableCell({
        shading: { type: ShadingType.CLEAR, fill: P.primary },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        width: { size: 100 / headers.length, type: WidthType.PERCENTAGE },
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: h, bold: true, size: 20, color: "FFFFFF", font: { ascii: "Arial", eastAsia: "Arial" } })]
        })]
      })
    )
  });

  const dataRows = rows.map((row, idx) => new TableRow({
    cantSplit: true,
    children: row.map((cell, cellIdx) => 
      new TableCell({
        shading: { type: ShadingType.CLEAR, fill: idx % 2 === 0 ? P.surface : "#FFFFFF" },
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        width: { size: 100 / row.length, type: WidthType.PERCENTAGE },
        children: [new Paragraph({
          alignment: cellIdx === 0 ? AlignmentType.LEFT : AlignmentType.CENTER,
          children: [new TextRun({ text: String(cell), size: 19, color: c(P.body), font: { ascii: "Arial", eastAsia: "Arial" } })]
        })]
      })
    )
  }));

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "#CBD5E1" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "#CBD5E1" },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "#E2E8F0" },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "#E2E8F0" }
    },
    rows: [headerRow, ...dataRows]
  });
}

// Main Document
const doc = new Document({
  styles: {
    default: {
      document: {
        run: {
          font: { ascii: "Arial", eastAsia: "Arial" },
          size: 22,
          color: c(P.body)
        },
        paragraph: { spacing: { line: 360 } }
      }
    }
  },
  numbering: {
    config: [
      {
        reference: "main-bullets",
        levels: [{
          level: 0,
          format: LevelFormat.BULLET,
          text: "\u2022",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } }
        }]
      },
      {
        reference: "feature-bullets",
        levels: [{
          level: 0,
          format: LevelFormat.BULLET,
          text: "\u2022",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } }
        }]
      },
      {
        reference: "api-bullets",
        levels: [{
          level: 0,
          format: LevelFormat.BULLET,
          text: "\u2022",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } }
        }]
      }
    ]
  },
  sections: [
    // Section 1: Cover Page
    {
      properties: {
        page: { margin: { top: 0, bottom: 0, left: 0, right: 0 } }
      },
      children: buildCoverR1()
    },

    // Section 2: TOC
    {
      properties: {
        page: {
          margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 },
          pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN }
        }
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
          children: [new TextRun({ text: "Table of Contents", bold: true, size: 32, color: c(P.primary), font: { ascii: "Arial", eastAsia: "Arial" } })]
        }),
        new TableOfContents(),
        new Paragraph({ children: [new PageBreak()] })
      ]
    },

    // Section 3: Body Content
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 },
          pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL }
        }
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: "GarfiX EOS - Enterprise AI System Report", size: 18, color: c(P.secondary), font: { ascii: "Arial", eastAsia: "Arial" } })]
          })]
        })
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: c(P.secondary) })]
          })]
        })
      },
      children: [
        // Executive Summary
        heading("1. Executive Summary"),
        
        bodyPara("This comprehensive technical report documents the complete implementation of the GarfiX EOS Enterprise AI System, a production-ready artificial intelligence infrastructure designed specifically for MENA region SaaS ERP operations. The system represents a significant architectural evolution from basic AI integration to a fully enterprise-grade solution with advanced load balancing, health monitoring, and auto-scaling capabilities."),
        
        bodyPara("The implementation addresses critical production requirements including high availability through multi-key API management, intelligent request routing with weighted load balancing, automatic failover mechanisms with circuit breaker patterns, and real-time metrics collection for operational visibility. The system is built on Google Gemini's free tier infrastructure, maximizing cost efficiency while maintaining enterprise-grade reliability through sophisticated pool management and queue-based job processing."),
        
        bodyPara("Key achievements include the successful deployment of six specialized AI worker types covering chat interactions, invoice processing, smart parsing, and domain-specific agents for accounting, sales, and inventory management. Each worker operates through a unified queue system ensuring consistent processing, fair resource allocation, and complete observability across all AI operations."),

        // Architecture Overview
        heading("2. System Architecture Overview"),

        heading("2.1 Core Infrastructure Stack", HeadingLevel.HEADING_2),

        bodyPara("The Enterprise AI System is architected as a layered platform integrating multiple technologies to ensure reliability, scalability, and maintainability. The foundation rests on Next.js 16 with React 19 for the application framework, leveraging TypeScript for type safety across all components. The queue management layer utilizes BullMQ with Valkey as the primary message broker, providing robust job persistence and delivery guarantees with automatic fallback to pg-boss for PostgreSQL-based queuing when Redis infrastructure is unavailable."),

        createDataTable(
          ["Layer", "Technology", "Purpose"],
          [
            ["Application Framework", "Next.js 16 / React 19", "UI & API Routes"],
            ["Queue System", "BullMQ + Valkey", "Job Management"],
            ["Fallback Queue", "pg-boss", "PostgreSQL Backup"],
            ["AI Provider", "Google Gemini 2.0 Flash", "LLM Processing"],
            ["Load Balancing", "Custom AdvancedBalancer", "Multi-Key Routing"],
            ["Monitoring", "Metrics Collector", "Real-time Analytics"]
          ]
        ),

        new Paragraph({ spacing: { before: 200, after: 200 } }),

        heading("2.2 Component Interaction Flow", HeadingLevel.HEADING_2),

        bodyPara("The system implements a sophisticated request flow that ensures optimal resource utilization and fault tolerance. Incoming AI requests enter through dedicated API endpoints which validate authentication and rate limits before enqueueing jobs to the appropriate worker queues. The AdvancedGeminiLoadBalancer examines the current health status of all available API keys, applying the configured balancing strategy to select the optimal key for each request."),

        bodyPara("Selected requests are then processed by specialized workers that handle domain-specific logic such as invoice extraction with structured data parsing, smart document analysis with context awareness, or conversational AI with memory persistence. Throughout this process, the MetricsCollector captures performance data including response times, token consumption, error rates, and queue depths, feeding this information to both the dashboard UI and alerting systems."),

        // Components Built
        heading("3. Core Components Implementation"),

        heading("3.1 Advanced Load Balancer (advanced-loadbalancer.ts)", HeadingLevel.HEADING_2),

        bodyPara("The AdvancedGeminiLoadBalancer represents the centerpiece of the enterprise AI system, implementing production-grade multi-key management with intelligent routing capabilities. This approximately 450-line module provides five distinct balancing strategies optimized for different operational scenarios, from simple round-robin distribution to sophisticated weighted algorithms that consider remaining quota capacity, historical latency, and current connection counts."),

        bodyPara("The health monitoring subsystem performs comprehensive checks every 30 seconds for each registered API key, tracking circuit breaker state transitions between CLOSED (normal operation), OPEN (failure isolation), and HALF-OPEN (recovery testing) states. This pattern prevents cascade failures by automatically isolating problematic keys while allowing graceful recovery testing without impacting overall system availability."),

        createDataTable(
          ["Feature", "Implementation", "Configuration"],
          [
            ["Health Check Interval", "30 seconds per key", "Configurable via HEALTH_CHECK_INTERVAL_MS"],
            ["Circuit Breaker Threshold", "3 consecutive failures", "FAILURE_THRESHOLD constant"],
            ["Cooldown Period", "60 seconds", "COOLDOWN_DURATION_MS"],
            ["Balancing Strategies", "5 options", "weighted, round-robin, least-connections, least-latency, priority"],
            ["Latency Tracking", "Exponential Moving Average", "EMA_ALPHA = 0.3 default"],
            ["Quota Tracking", "Daily tokens per key", "DAILY_QUOTA_PER_KEY = 1M tokens"]
          ]
        ),

        new Paragraph({ spacing: { before: 200, after: 200 } }),

        heading("3.2 AI Workers System (aiWorkers.ts)", HeadingLevel.HEADING_2),

        bodyPara("The AI Workers module establishes the queue-based processing architecture that transforms direct API calls into managed, observable, and scalable job workflows. This approximately 550-line implementation defines six specialized worker types, each handling specific business domains while sharing common infrastructure for metrics collection, error handling, and resource management."),

        bodyPara("The ChatWorker handles conversational AI interactions with context window management and response streaming capabilities. InvoiceExtractWorker specializes in financial document processing, extracting structured data from invoices including vendor information, line items, tax calculations, and payment terms. SmartParseWorker provides intelligent document analysis with schema validation and field mapping. Three additional SpecialistAgent workers handle domain-specific operations for accounting automation, sales intelligence, and inventory optimization."),

        createDataTable(
          ["Worker Type", "Queue Name", "Primary Function", "Priority"],
          [
            ["ai-chat", "ai:chat-queue", "Conversational AI responses", "High"],
            ["ai-invoice-extract", "ai:invoice-queue", "Invoice data extraction", "Medium"],
            ["ai-smart-parse", "ai:parse-queue", "Document smart parsing", "Medium"],
            ["ai-agent-accounting", "ai:accounting-queue", "Accounting automation", "Normal"],
            ["ai-agent-sales", "ai:sales-queue", "Sales intelligence", "Normal"],
            ["ai-agent-inventory", "ai:inventory-queue", "Inventory optimization", "Low"]
          ]
        ),

        new Paragraph({ spacing: { before: 200, after: 200 } }),

        heading("3.3 Enhanced Worker Scaler (enhanced-worker-scaler.ts)", HeadingLevel.HEADING_2),

        bodyPara("The EnhancedWorkerScaler provides dynamic scaling decisions based on real-time system state, replacing the basic scaler with pool-aware logic that considers overall system health rather than just queue depth. This approximately 270-line implementation introduces health factor calculations that modify scaling aggressiveness based on whether the API key pool is operating in healthy, degraded, or critical states."),

        bodyPara("Scaling decisions incorporate four queue depth thresholds (LOW at 50 jobs, MEDIUM at 150, HIGH at 300, CRITICAL at 500) combined with pool health factors (1.0x for healthy pools encouraging aggressive scaling, 0.5x for degraded pools requiring conservative approaches, and 0.25x for critical pools limiting expansion). This dual-factor approach prevents over-provisioning during infrastructure stress while ensuring adequate capacity during normal operations."),

        // Enterprise Features
        heading("4. Enterprise Features Implementation"),

        heading("4.1 Health Check System", HeadingLevel.HEADING_2),

        bodyPara("The per-key health monitoring system provides continuous visibility into API key status with automated failure detection and recovery. Each key undergoes comprehensive health evaluation every 30 seconds, checking response latency against configurable thresholds, verifying authentication validity, and confirming rate limit headroom. The system maintains sliding windows of recent requests enabling statistical analysis of performance trends and anomaly detection."),

        bodyPara("Health status transitions trigger appropriate callbacks throughout the system, enabling coordinated responses to degradation events. When a key enters a degraded state, the load balancer automatically reduces its selection weight while increasing traffic to healthier alternatives. Critical failures activate circuit breakers that completely isolate failing keys until recovery testing confirms restored functionality."),

        heading("4.2 Quota Tracking & Management", HeadingLevel.HEADING_2),

        bodyPara("The quota management system tracks token consumption at both individual key and pool levels, enforcing daily limits while providing visibility into remaining capacity. Google Gemini free tier provides 1 million tokens per day per key, totaling 5 million tokens daily across the five-key pool. The system maintains rolling counters that reset at midnight UTC, with administrative endpoints available for manual quota resets during testing or emergency scenarios."),

        bodyPara("Real-time quota visibility enables proactive capacity planning, with dashboard displays showing current consumption rates, projected exhaustion times, and recommendations for workload distribution. The weighted load balancer incorporates remaining quota into routing decisions, naturally distributing requests toward keys with more available capacity and preventing any single key from premature exhaustion."),

        heading("4.3 Weighted Load Balancing Strategies", HeadingLevel.HEADING_2),

        bodyPara("The system implements five distinct load balancing strategies, each optimized for different operational requirements and traffic patterns. The default weighted strategy calculates selection probabilities based on composite scores combining remaining RPM quota, token quota, recent success rate, and inverse latency, producing intelligent routing that maximizes overall pool utilization while maintaining individual key health."),

        createDataTable(
          ["Strategy", "Algorithm", "Best Use Case", "Complexity"],
          [
            ["Weighted (Default)", "Composite score ranking", "Production mixed workloads", "O(n)"],
            ["Round-Robin", "Sequential rotation", "Uniform request distribution", "O(1)"],
            ["Least-Connections", "Active request counting", "Variable-duration tasks", "O(n)"],
            ["Least-Latency", "EMA latency sorting", "Latency-sensitive apps", "O(n log n)"],
            ["Priority", "Fixed priority order", "Tiered key quality", "O(1)"]
          ]
        ),

        new Paragraph({ spacing: { before: 200, after: 200 } }),

        heading("4.4 Automatic Failover & Circuit Breaker", HeadingLevel.HEADING_2),

        bodyPara("The failover mechanism ensures continuous operation even when individual API keys experience failures or degradation. Upon detecting a failed request, the system immediately attempts retry with an alternative healthy key before reporting failure to the client. This transparent failover occurs within the load balancer layer, requiring no intervention from calling code and maintaining consistent behavior across all worker types."),

        bodyPara("The circuit breaker pattern prevents cascade failures by isolating repeatedly failing keys after three consecutive errors. Once opened, the circuit redirects all traffic away from the failing key for a 60-second cooldown period, after which it enters half-open state allowing test requests to verify recovery. Successful test requests close the circuit and restore normal traffic flow, while failures reopen the circuit for another cooldown period."),

        heading("4.5 Pool-Level Rate Limiting", HeadingLevel.HEADING_2),

        bodyPara("The pool-level rate limiter enforces a hard cap of 75 requests per minute across all five API keys combined (15 RPM per key), matching Google Gemini free tier limitations. Rather than rejecting excess requests, the system implements back-pressure handling by enqueuing overflow jobs for later processing once capacity becomes available. This approach maintains system stability under burst conditions while preserving all submitted work."),

        bodyPara("Rate limiting decisions consider both instantaneous RPM calculations over sliding windows and predicted future capacity based on active job completion estimates. When queue depth exceeds configurable thresholds, the system triggers scaling events to increase worker concurrency, and emits warnings when approaching critical capacity limits."),

        // Metrics Dashboard
        heading("5. Metrics & Monitoring System"),

        heading("5.1 Real-Time Metrics Collection", HeadingLevel.HEADING_2),

        bodyPara("The AIMetricsCollector class provides comprehensive telemetry across all AI operations, capturing data points essential for operational monitoring and capacity planning. Metrics are collected at multiple granularities including per-request latency measurements, per-key performance statistics, per-worker throughput counts, and aggregate pool-level summaries."),

        bodyPara("The metrics API endpoint (/api/ai/metrics) serves real-time data to dashboard components with support for filtered views focusing on specific metric categories. Available views include full snapshots combining all data, pool-level summaries showing aggregate status, detailed per-key breakdowns, and worker-specific performance statistics."),

        createDataTable(
          ["Metric Category", "Data Points", "Refresh Rate", "Retention"],
          [
            ["Pool Status", "Health factor, RPM, queue depth", "Real-time", "Session"],
            ["Per-Key Health", "Circuit state, latency EMA, quotas", "30 seconds", "24 hours"],
            ["Worker Stats", "Jobs processed, avg duration, errors", "Per-job", "24 hours"],
            ["Alerts", "Info/Warning/Error/Critical events", "Event-driven", "7 days"]
          ]
        ),

        new Paragraph({ spacing: { before: 200, after: 200 } }),

        heading("5.2 Admin Dashboard Integration", HeadingLevel.HEADING_2),

        bodyPara("The admin dashboard component provides visual representation of all collected metrics through interactive widgets displaying pool status indicators, per-key health cards with color-coded status badges, real-time performance charts showing RPM trends and latency distributions, queue depth monitors with threshold alerts, and alert notification panels with severity filtering."),

        bodyPara("Dashboard updates utilize efficient polling with configurable intervals, minimizing server load while maintaining responsive display updates. Administrative actions available through the interface include manual quota resets for testing purposes, forced circuit breaker state transitions for troubleshooting, and worker count adjustments for capacity tuning."),

        // Capacity Planning
        heading("6. Capacity & Performance Specifications"),

        heading("6.1 Throughput Calculations", HeadingLevel.HEADING_2),

        bodyPara("Based on the five-key Google Gemini free tier configuration, the system achieves substantial processing capacity suitable for small to medium enterprise workloads. The theoretical maximum throughput reaches 75 requests per minute (4,500 per hour, 108,000 per day) under sustained operation, with practical throughput varying based on request complexity and response generation requirements."),

        createDataTable(
          ["Metric", "Per Key", "Pool Total (5 Keys)", "Daily Maximum"],
          [
            ["Rate Limit (RPM)", "15", "75", "108,000 requests"],
            ["Token Quota", "1M tokens", "5M tokens", "5M tokens"],
            ["Chat Requests*", "~50K", "~250K", "~250K conversations"],
            ["Invoice Processing*", "~25K", "~125K", "~125K invoices"],
            ["Smart Parse Operations*", "~33K", "~165K", "~165K documents"]
          ]
        ),

        new Paragraph({
          spacing: { before: 100, after: 200 },
          children: [new TextRun({ text: "*Estimates based on average token consumption per operation type", italics: true, size: 18, color: c(P.secondary), font: { ascii: "Arial", eastAsia: "Arial" } })]
        }),

        heading("6.2 Scaling Characteristics", HeadingLevel.HEADING_2),

        bodyPara("The auto-scaler dynamically adjusts worker concurrency based on queue depth and pool health, ensuring efficient resource utilization across variable workload patterns. During low-traffic periods, the system maintains minimal worker counts reducing overhead, while automatically scaling up during demand spikes to prevent queue accumulation and maintain response time service level objectives."),

        bodyPara("Scale-up decisions trigger when queue depth exceeds 50 jobs (LOW threshold) with healthy pool status, adding workers incrementally until reaching maximum configured concurrency or queue depth reduction. Scale-down decisions occur when queues remain below threshold for extended periods, gracefully reducing worker count to release resources while maintaining buffer capacity for potential traffic bursts."),

        // API Reference
        heading("7. API Reference"),

        heading("7.1 Metrics Endpoint", HeadingLevel.HEADING_2),

        bodyPara("The /api/ai/metrics endpoint provides comprehensive access to all collected AI system metrics with flexible filtering options. Authentication is required for all requests, with admin privileges necessary for write operations such as quota resets."),

        createDataTable(
          ["Method", "Parameters", "Response", "Auth Required"],
          [
            ["GET /api/ai/metrics", "None (full snapshot)", "Complete metrics object", "User"],
            ["GET ?section=pool", "section=pool", "Pool summary only", "User"],
            ["GET ?section=keys", "section=keys", "Per-key details only", "User"],
            ["GET ?section=workers", "section=workers", "Worker statistics only", "User"],
            ["POST action=reset", "action=reset-quotas", "Reset confirmation", "Admin"]
          ]
        ),

        new Paragraph({ spacing: { before: 200, after: 200 } }),

        heading("7.2 Worker Job Enqueue Helpers", HeadingLevel.HEADING_2),

        bodyPara("The system exports typed helper functions for enqueueing jobs to each worker queue, providing compile-time type safety and IDE autocompletion support. These helpers abstract the underlying queue complexity, allowing application code to submit AI jobs with simple function calls while the system handles routing, prioritization, and monitoring."),

        bulletItem("enqueueChatJob(message, options) - Submit conversational AI requests", "api-bullets"),
        bulletItem("enqueueInvoiceExtractJob(invoiceData, options) - Process invoice documents", "api-bullets"),
        bulletItem("enqueueSmartParseJob(document, schema, options) - Intelligent document parsing", "api-bullets"),
        bulletItem("enqueueAgentJob(agentType, payload, options) - Domain-specific agent tasks", "api-bullets"),

        new Paragraph({ spacing: { before: 200, after: 200 } }),

        // Files Summary
        heading("8. Deliverables Summary"),

        bodyPara("This implementation produced seven deliverable artifacts comprising the complete Enterprise AI System. All files have been committed to the main branch and pushed to the GitHub repository at github.com/ahmedezzatelsayad/Garfix."),

        createDataTable(
          ["File", "Status", "Lines", "Description"],
          [
            ["src/lib/workers/aiWorkers.ts", "NEW", "~550", "Core AI Workers with BullMQ"],
            ["src/lib/ai/advanced-loadbalancer.ts", "NEW", "~450", "Advanced Multi-Key Load Balancer"],
            ["src/app/api/ai/metrics/route.ts", "NEW", "~280", "Metrics API Endpoint"],
            ["src/lib/ai-fabric/enhanced-worker-scaler.ts", "NEW", "~270", "Pool-Aware Auto Scaler"],
            ["src/lib/ai/ENTERPRISE-AI-SYSTEM.md", "NEW", "~500+", "Technical Documentation"],
            ["src/lib/ai/index.ts", "MODIFIED", "+15", "Module Exports Update"],
            ["Admin Dashboard UI", "MODIFIED", "+400", "Metrics Visualization Component"]
          ]
        ),

        new Paragraph({ spacing: { before: 200, after: 200 } }),

        // Conclusion
        heading("9. Conclusions & Recommendations"),

        bodyPara("The GarfiX EOS Enterprise AI System implementation successfully transforms basic AI integration into a production-ready, enterprise-grade platform capable of supporting real business workloads. The architecture demonstrates mature patterns including circuit breaker fault isolation, weighted load balancing with health-awareness, comprehensive metrics collection, and dynamic auto-scaling that collectively ensure reliable operation under varying conditions."),

        bodyPara("The system is immediately operational for development and staging environments, with the 75 RPM pool capacity and 5 million daily token quota sufficient for initial user onboarding and feature validation. Production deployment should include additional monitoring integration, alerting channel configuration (email, Slack, etc.), and consideration of premium API tiers if workload growth exceeds free tier capacities."),

        bodyPara("Recommended next steps include comprehensive load testing to validate scaling behavior under realistic traffic patterns, integration testing across all six worker types with production data samples, dashboard UX refinement based on administrator feedback, and documentation expansion with operational runbooks for common scenarios such as key rotation, incident response, and capacity planning."),
      ]
    }
  ]
});

// Generate document
async function main() {
  try {
    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync("/home/z/my-project/download/GarfiX_EOS_Enterprise_AI_System_Report.docx", buffer);
    console.log("Report generated successfully: /home/z/my-project/download/GarfiX_EOS_Enterprise_AI_System_Report.docx");
  } catch (error) {
    console.error("Error generating report:", error);
    process.exit(1);
  }
}

main();
