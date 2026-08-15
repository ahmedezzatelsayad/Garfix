/**
 * generate-openapi-spec.ts — Generates OpenAPI 3.1 specification from GarfiX API routes.
 *
 * Strategy: Scans all Next.js Route Handlers, extracts path/method info,
 * and builds a structured OpenAPI spec. The spec covers the 181 API endpoints
 * and provides the foundation for:
 *   - SDK type generation
 *   - Contract testing
 *   - API documentation (/api/docs)
 *   - Validation middleware
 *
 * Usage: bun run scripts/generate-openapi-spec.ts
 * Output: src/lib/openapi/openapi.yaml + src/lib/openapi/openapi.json
 */

import fs from "node:fs";
import path from "node:path";

// ── OpenAPI 3.1 Base Structure ──────────────────────────────────────────────

const BASE_SPEC = {
  openapi: "3.1.0",
  info: {
    title: "GarfiX EOS API",
    version: "12.1.0",
    description:
      "GarfiX Enterprise Operating System — Multi-tenant ERP + AI Fabric API for MENA businesses. " +
      "Includes accounting, invoicing, inventory, HR, AI intelligence, payments, and platform admin. " +
      "All endpoints require authentication (JWT access token via cookie) unless marked as public.",
    contact: {
      name: "GarfiX Engineering",
      email: "engineering@garfix.app",
    },
    license: {
      name: "Proprietary",
    },
  },
  servers: [
    { url: "https://api.garfix.app", description: "Production" },
    { url: "http://localhost:3000", description: "Development" },
  ],
  security: [
    { cookieAuth: [] },
    { bearerAuth: [] },
  ],
  components: {
    securitySchemes: {
      cookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "access_token",
        description: "JWT access token stored in cookie. Refresh token in 'refresh_token' cookie.",
      },
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "JWT access token as Authorization header (alternative to cookie).",
      },
    },
    schemas: {
      // ── Common Domain Schemas ──
      Error: {
        type: "object",
        properties: {
          error: { type: "string", description: "Error message" },
          code: { type: "string", description: "Error code (e.g., 'UNAUTHORIZED', 'NOT_FOUND')" },
          details: { type: "object", additionalProperties: true, description: "Additional error context" },
        },
        required: ["error"],
      },
      Company: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          nameAr: { type: "string" },
          slug: { type: "string" },
          plan: { type: "string", enum: ["starter", "business", "enterprise"] },
          currency: { type: "string", enum: ["SAR", "AED", "KWD", "BHD", "QAR", "OMR", "EGP"] },
          subscriptionStatus: { type: "string", enum: ["active", "trial", "suspended", "cancelled"] },
          createdAt: { type: "string", format: "date-time" },
        },
        required: ["id", "name", "slug", "currency"],
      },
      Invoice: {
        type: "object",
        properties: {
          id: { type: "string" },
          number: { type: "string" },
          status: { type: "string", enum: ["draft", "sent", "paid", "overdue", "cancelled"] },
          subtotal: { type: "number" },
          taxAmount: { type: "number" },
          total: { type: "number" },
          currency: { type: "string" },
          issueDate: { type: "string", format: "date" },
          dueDate: { type: "string", format: "date" },
          clientId: { type: "string" },
          lineItems: {
            type: "array",
            items: { $ref: "#/components/schemas/LineItem" },
          },
        },
        required: ["id", "number", "status", "total", "currency"],
      },
      LineItem: {
        type: "object",
        properties: {
          id: { type: "string" },
          productId: { type: "string" },
          description: { type: "string" },
          quantity: { type: "number" },
          unitPrice: { type: "number" },
          total: { type: "number" },
          discount: { type: "number" },
        },
        required: ["description", "quantity", "unitPrice", "total"],
      },
      User: {
        type: "object",
        properties: {
          id: { type: "string" },
          uid: { type: "string" },
          email: { type: "string", format: "email" },
          displayName: { type: "string" },
          role: { type: "string", enum: ["admin", "editor", "employee", "viewer"] },
          companies: { type: "array", items: { type: "string" } },
          tokenVersion: { type: "integer" },
        },
        required: ["id", "uid", "email", "role"],
      },
      Voucher: {
        type: "object",
        properties: {
          id: { type: "string" },
          number: { type: "string" },
          date: { type: "string", format: "date" },
          description: { type: "string" },
          lines: { type: "array", items: { $ref: "#/components/schemas/VoucherLine" } },
          status: { type: "string", enum: ["draft", "posted", "reversed"] },
        },
        required: ["id", "number", "date", "status"],
      },
      VoucherLine: {
        type: "object",
        properties: {
          id: { type: "string" },
          accountId: { type: "string" },
          debit: { type: "number" },
          credit: { type: "number" },
          description: { type: "string" },
        },
        required: ["accountId"],
      },
      FinancialPeriod: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          startDate: { type: "string", format: "date" },
          endDate: { type: "string", format: "date" },
          status: { type: "string", enum: ["open", "closed", "locked"] },
          companySlug: { type: "string" },
        },
        required: ["id", "name", "startDate", "endDate", "status", "companySlug"],
      },
      AuthResult: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          user: { $ref: "#/components/schemas/User" },
          error: { type: "string" },
        },
      },
      PaginatedResponse: {
        type: "object",
        properties: {
          data: { type: "array", items: {} },
          total: { type: "integer" },
          page: { type: "integer" },
          pageSize: { type: "integer" },
          hasMore: { type: "boolean" },
        },
      },
      AIRequest: {
        type: "object",
        properties: {
          input: { type: "string" },
          requestType: { type: "string", enum: ["ocr", "matching", "financial_analysis", "chat", "whatsapp"] },
          companySlug: { type: "string" },
          context: { type: "object", additionalProperties: true },
        },
        required: ["input", "requestType", "companySlug"],
      },
      AIResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          resolvedBy: { type: "string", enum: ["cache", "pattern", "rule", "memory", "budget", "provider_routing", "ai"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          costUsd: { type: "number" },
          latencyMs: { type: "integer" },
          result: { type: "object", additionalProperties: true },
        },
      },
      AuditLog: {
        type: "object",
        properties: {
          id: { type: "string" },
          action: { type: "string" },
          actor: { type: "string" },
          companySlug: { type: "string" },
          details: { type: "object", additionalProperties: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      WebhookEndpoint: {
        type: "object",
        properties: {
          id: { type: "string" },
          url: { type: "string", format: "uri" },
          events: { type: "array", items: { type: "string" } },
          secret: { type: "string" },
          isActive: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      HealthCheck: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["healthy", "degraded", "down"] },
          version: { type: "string" },
          uptime: { type: "number" },
          checks: {
            type: "object",
            properties: {
              database: { type: "string", enum: ["ok", "error"] },
              cache: { type: "string", enum: ["ok", "error", "not_configured"] },
              aiFabric: { type: "string", enum: ["ok", "error", "not_configured"] },
              queues: { type: "string", enum: ["ok", "error", "not_configured"] },
            },
          },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      // ── Sprint 2: HR & People Schemas ──
      Employee: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          email: { type: "string", format: "email" },
          department: { type: "string" },
          position: { type: "string" },
          companySlug: { type: "string" },
          hireDate: { type: "string", format: "date" },
          status: { type: "string", enum: ["active", "terminated", "on_leave"] },
        },
        required: ["id", "name", "email", "companySlug", "status"],
      },
      Attendance: {
        type: "object",
        properties: {
          id: { type: "string" },
          employeeId: { type: "string" },
          date: { type: "string", format: "date" },
          checkIn: { type: "string", format: "time" },
          checkOut: { type: "string", format: "time" },
          status: { type: "string", enum: ["present", "absent", "late", "half_day"] },
          companySlug: { type: "string" },
        },
        required: ["id", "employeeId", "date", "status"],
      },
      Salary: {
        type: "object",
        properties: {
          id: { type: "string" },
          employeeId: { type: "string" },
          baseSalary: { type: "number" },
          allowances: { type: "number" },
          deductions: { type: "number" },
          netSalary: { type: "number" },
          period: { type: "string" },
          status: { type: "string", enum: ["pending", "processed", "paid"] },
          companySlug: { type: "string" },
        },
        required: ["id", "employeeId", "baseSalary", "netSalary", "period", "status"],
      },
      LeaveRequest: {
        type: "object",
        properties: {
          id: { type: "string" },
          employeeId: { type: "string" },
          type: { type: "string", enum: ["annual", "sick", "maternity", "emergency"] },
          startDate: { type: "string", format: "date" },
          endDate: { type: "string", format: "date" },
          status: { type: "string", enum: ["pending", "approved", "rejected", "cancelled"] },
          companySlug: { type: "string" },
        },
        required: ["id", "employeeId", "type", "startDate", "endDate", "status"],
      },
      Commission: {
        type: "object",
        properties: {
          id: { type: "string" },
          employeeId: { type: "string" },
          amount: { type: "number" },
          period: { type: "string" },
          status: { type: "string", enum: ["pending", "approved", "paid"] },
          companySlug: { type: "string" },
        },
        required: ["id", "employeeId", "amount", "period", "status"],
      },
      Performance: {
        type: "object",
        properties: {
          id: { type: "string" },
          employeeId: { type: "string" },
          rating: { type: "number", minimum: 1, maximum: 5 },
          period: { type: "string" },
          goals: { type: "string" },
          companySlug: { type: "string" },
        },
        required: ["id", "employeeId", "rating", "period"],
      },
      GratuityRecord: {
        type: "object",
        properties: {
          id: { type: "string" },
          employeeId: { type: "string" },
          totalGratuity: { type: "number" },
          yearsOfService: { type: "number" },
          monthlyGratuity: { type: "number" },
          companySlug: { type: "string" },
        },
        required: ["id", "employeeId", "totalGratuity", "yearsOfService"],
      },
      // ── Sprint 2: Platform Admin Schemas ──
      PlatformTenant: {
        type: "object",
        properties: {
          slug: { type: "string" },
          name: { type: "string" },
          plan: { type: "string", enum: ["starter", "business", "enterprise"] },
          status: { type: "string", enum: ["active", "trial", "suspended", "cancelled"] },
          createdAt: { type: "string", format: "date-time" },
        },
        required: ["slug", "name", "plan", "status"],
      },
      PlatformStats: {
        type: "object",
        properties: {
          totalTenants: { type: "integer" },
          activeTenants: { type: "integer" },
          totalRevenue: { type: "number" },
          monthlyRevenue: { type: "number" },
          aiCostMtd: { type: "number" },
          totalRequestsMtd: { type: "integer" },
        },
        required: ["totalTenants", "activeTenants", "totalRevenue"],
      },
      PlatformFeatureFlag: {
        type: "object",
        properties: {
          id: { type: "string" },
          key: { type: "string" },
          enabled: { type: "boolean" },
          description: { type: "string" },
          rolloutPct: { type: "number", minimum: 0, maximum: 100 },
        },
        required: ["id", "key", "enabled"],
      },
      // ── Sprint 2: Support Schemas ──
      Announcement: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          body: { type: "string" },
          type: { type: "string", enum: ["info", "warning", "critical"] },
          active: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
        },
        required: ["id", "title", "body", "type", "active"],
      },
      Ticket: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          status: { type: "string", enum: ["open", "in_progress", "resolved", "closed"] },
          priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
          category: { type: "string" },
          tenantSlug: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
        required: ["id", "title", "status", "priority"],
      },
      // ── Sprint 2: AI Provider Schema ──
      AIProvider: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          provider: { type: "string", enum: ["openai", "anthropic", "google", "deepseek", "openrouter"] },
          modelId: { type: "string" },
          isEnabled: { type: "boolean" },
          costPer1kTokens: { type: "number" },
          latencyMs: { type: "number" },
        },
        required: ["id", "name", "provider", "modelId", "isEnabled"],
      },
      // ── Sprint 2: Dashboard & Notification Schemas ──
      DashboardStats: {
        type: "object",
        properties: {
          totalRevenue: { type: "number" },
          outstanding: { type: "number" },
          totalClients: { type: "integer" },
          totalInvoices: { type: "integer" },
          paidCount: { type: "integer" },
          overdueCount: { type: "integer" },
        },
        required: ["totalRevenue", "outstanding", "totalClients", "totalInvoices"],
      },
      Notification: {
        type: "object",
        properties: {
          id: { type: "integer" },
          title: { type: "string" },
          message: { type: "string" },
          read: { type: "boolean" },
          companySlug: { type: "string" },
          type: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
        required: ["id", "title", "message", "read"],
      },
      // ── Sprint 2: Client & Inventory Schemas ──
      Client: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          nameAr: { type: "string" },
          email: { type: "string", format: "email" },
          phone: { type: "string" },
          companySlug: { type: "string" },
          balance: { type: "number" },
        },
        required: ["id", "name", "companySlug"],
      },
      InventoryItem: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          sku: { type: "string" },
          quantity: { type: "number" },
          unitPrice: { type: "number" },
          companySlug: { type: "string" },
          warehouseId: { type: "string" },
        },
        required: ["id", "name", "sku", "quantity", "companySlug"],
      },
      Warehouse: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          location: { type: "string" },
          companySlug: { type: "string" },
          capacity: { type: "number" },
        },
        required: ["id", "name", "companySlug"],
      },
      StockMovement: {
        type: "object",
        properties: {
          id: { type: "string" },
          itemId: { type: "string" },
          type: { type: "string", enum: ["in", "out", "transfer"] },
          quantity: { type: "number" },
          reference: { type: "string" },
          companySlug: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
        required: ["id", "itemId", "type", "quantity", "companySlug"],
      },
      // ── Sprint 2: Automation & Feature Flag Schemas ──
      AutomationRule: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          trigger: { type: "string" },
          action: { type: "string" },
          isActive: { type: "boolean" },
          companySlug: { type: "string" },
          lastRunAt: { type: "string", format: "date-time" },
        },
        required: ["id", "name", "trigger", "action", "isActive"],
      },
      FeatureFlag: {
        type: "object",
        properties: {
          key: { type: "string" },
          enabled: { type: "boolean" },
          description: { type: "string" },
          companySlug: { type: "string" },
        },
        required: ["key", "enabled"],
      },
      Module: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          enabled: { type: "boolean" },
          companySlug: { type: "string" },
        },
        required: ["id", "name", "enabled"],
      },
      // ── Sprint 2: Invoice Template & Purchase Schemas ──
      InvoiceTemplate: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          layout: { type: "string" },
          companySlug: { type: "string" },
          isDefault: { type: "boolean" },
        },
        required: ["id", "name", "companySlug"],
      },
      Purchase: {
        type: "object",
        properties: {
          id: { type: "integer" },
          description: { type: "string" },
          amount: { type: "number" },
          date: { type: "string", format: "date" },
          companySlug: { type: "string" },
          status: { type: "string", enum: ["pending", "approved", "received", "cancelled"] },
        },
        required: ["id", "description", "amount", "date", "companySlug"],
      },
      // ── Sprint 2: Product Matching Schema ──
      ProductMatchConfig: {
        type: "object",
        properties: {
          id: { type: "string" },
          threshold: { type: "number", minimum: 0, maximum: 1 },
          algorithm: { type: "string", enum: ["fuzzy", "exact", "semantic"] },
          companySlug: { type: "string" },
          isActive: { type: "boolean" },
        },
        required: ["id", "threshold", "algorithm", "companySlug"],
      },
      // ── Sprint 2: Storage Schema ──
      StorageObject: {
        type: "object",
        properties: {
          key: { type: "string" },
          size: { type: "integer" },
          contentType: { type: "string" },
          url: { type: "string", format: "uri" },
          createdAt: { type: "string", format: "date-time" },
        },
        required: ["key", "size", "contentType"],
      },
      // ── Sprint 2: Report & Backup Schemas ──
      Report: {
        type: "object",
        properties: {
          id: { type: "integer" },
          title: { type: "string" },
          type: { type: "string", enum: ["financial", "tax", "audit", "custom"] },
          createdAt: { type: "string", format: "date-time" },
          companySlug: { type: "string" },
        },
        required: ["id", "title", "type", "companySlug"],
      },
      Backup: {
        type: "object",
        properties: {
          id: { type: "integer" },
          filename: { type: "string" },
          size: { type: "integer" },
          createdAt: { type: "string", format: "date-time" },
          companySlug: { type: "string" },
        },
        required: ["id", "filename", "size", "companySlug"],
      },
      // ── Sprint 2: Onboarding Schema ──
      OnboardingStep: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          order: { type: "integer" },
          isCompleted: { type: "boolean" },
          companySlug: { type: "string" },
        },
        required: ["id", "title", "order", "isCompleted"],
      },
      // ── Sprint 2: Startup & Metrics Schemas ──
      StartupCheckResult: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          fatal: { type: "array", items: { type: "string" } },
          warnings: { type: "array", items: { type: "string" } },
          env: { type: "object", additionalProperties: { type: "boolean" } },
        },
        required: ["ok", "fatal", "warnings"],
      },
      // ── Sprint 2: ZATCA E-Invoicing Schema ──
      ZATCAInvoice: {
        type: "object",
        properties: {
          invoiceNumber: { type: "string" },
          sellerVAT: { type: "string" },
          buyerVAT: { type: "string" },
          totalAmount: { type: "number" },
          vatAmount: { type: "number" },
          issueDate: { type: "string", format: "date" },
          status: { type: "string", enum: ["draft", "submitted", "cleared", "rejected"] },
          companySlug: { type: "string" },
        },
        required: ["invoiceNumber", "sellerVAT", "totalAmount", "vatAmount", "status"],
      },
      // ── Sprint 2: Metrics & SLO Schemas ──
      MetricPoint: {
        type: "object",
        properties: {
          timestamp: { type: "string", format: "date-time" },
          value: { type: "number" },
          labels: { type: "object", additionalProperties: { type: "string" } },
        },
        required: ["timestamp", "value"],
      },
      SLODefinition: {
        type: "object",
        properties: {
          name: { type: "string" },
          targetPct: { type: "number", minimum: 0, maximum: 100 },
          currentPct: { type: "number", minimum: 0, maximum: 100 },
          window: { type: "string", enum: ["7d", "30d", "90d"] },
          status: { type: "string", enum: ["healthy", "at_risk", "breached"] },
        },
        required: ["name", "targetPct", "currentPct", "window", "status"],
      },
    },
    parameters: {
      companySlug: {
        name: "companySlug",
        in: "query",
        required: true,
        schema: { type: "string" },
        description: "Tenant company slug for multi-tenant isolation",
      },
      idParam: {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string" },
        description: "Resource ID",
      },
    },
    responses: {
      Unauthorized: {
        description: "Authentication required",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
            example: { error: "Unauthorized", code: "UNAUTHORIZED" },
          },
        },
      },
      Forbidden: {
        description: "Insufficient permissions",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
            example: { error: "Forbidden — founder only", code: "FORBIDDEN" },
          },
        },
      },
      NotFound: {
        description: "Resource not found",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
            example: { error: "Not found", code: "NOT_FOUND" },
          },
        },
      },
      ValidationError: {
        description: "Request validation failed",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
            example: { error: "Validation failed", code: "VALIDATION_ERROR", details: { field: "required" } },
          },
        },
      },
      RateLimited: {
        description: "Rate limit exceeded",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
            example: { error: "Rate limit exceeded", code: "RATE_LIMITED" },
          },
        },
      },
      InternalError: {
        description: "Internal server error",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
    },
  },
  tags: [
    { name: "auth", description: "Authentication & session management" },
    { name: "accounting", description: "Journal entries, fiscal periods, balance sheet, P&L" },
    { name: "invoices", description: "Invoice CRUD, E-invoicing (ZATCA), OCR parsing" },
    { name: "inventory", description: "Products, stock movements, warehouses" },
    { name: "clients", description: "Client management" },
    { name: "hr", description: "Employee management, payroll, attendance, leaves" },
    { name: "ai", description: "AI Fabric — cascade pipeline, agents, cost optimization" },
    { name: "payments", description: "Payment rails, MyFatoorah integration" },
    { name: "reports", description: "Financial reports, export" },
    { name: "webhooks", description: "Webhook endpoints & deliveries" },
    { name: "settings", description: "Company settings, feature flags" },
    { name: "platform-admin", description: "Founder/admin platform management" },
    { name: "health", description: "Health check & startup diagnostics" },
    { name: "audit", description: "Audit trail & tamper detection" },
    { name: "dashboard", description: "Dashboard metrics & KPIs" },
    { name: "notifications", description: "Notification management" },
    { name: "catalog", description: "Product catalog management" },
    { name: "automation", description: "Automation rules & workflows" },
    { name: "permissions", description: "RBAC roles & permission catalog" },
    { name: "onboarding", description: "Company onboarding wizard" },
    { name: "saas", description: "SaaS billing, payments, users" },
    { name: "modules", description: "Module management" },
    { name: "feature-flags", description: "Feature flag toggles" },
    { name: "product-matching", description: "AI product matching, config, review" },
    { name: "founder-panel", description: "Founder panel dashboards (mission control, finops, AI fabric)" },
    { name: "founder-validation", description: "Founder identity validation" },
    { name: "storage", description: "File storage management" },
    { name: "metrics", description: "Observability metrics & SLO definitions" },
    { name: "company-management", description: "Company CRUD, members, settings" },
    { name: "backups", description: "Database backup management" },
    { name: "purchases", description: "Purchase order management" },
    { name: "invoice-templates", description: "Invoice template management" },
    { name: "e-invoicing", description: "ZATCA / MENA e-invoicing compliance" },
    { name: "accounting-banking", description: "Bank accounts, reconciliation, transfers" },
    { name: "accounting-ar-ap", description: "Accounts receivable & payable, aging" },
    { name: "accounting-budgets", description: "Budget management & budget-vs-actual" },
    { name: "accounting-payroll-wps", description: "Payroll & WPS processing" },
    { name: "accounting-tax", description: "Tax filing & compliance" },
    { name: "accounting-vouchers", description: "Voucher management, approve, cancel" },
    { name: "accounting-fixed-assets", description: "Fixed assets & depreciation" },
    { name: "accounting-cost-centers", description: "Cost center management" },
    { name: "accounting-trade-finance", description: "Letters of credit & trade finance" },
  ],
};

// ── API Route Scanner ───────────────────────────────────────────────────────

const API_DIR = path.join(process.cwd(), "src/app/api");
const paths: Record<string, Record<string, object>> = {};

function scanApiRoutes(dir: string, basePath: string = ""): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const routePath = basePath + "/" + entry.name;

    if (entry.isDirectory()) {
      // Check if this is a dynamic route segment
      const isDynamic = entry.name.startsWith("[") && entry.name.endsWith("]");
      const openApiPath = isDynamic
        ? routePath.replace(/\[([^\]]+)\]/g, "{$1}")
        : routePath;

      scanApiRoutes(fullPath, openApiPath);
    } else if (entry.name === "route.ts" || entry.name === "route.js") {
      // Read the route file and extract HTTP methods
      const content = fs.readFileSync(fullPath, "utf-8");
      const methods: string[] = [];

      const methodPatterns = [
        { regex: /export\s+(?:const|async\s+function)\s+GET\b/g, method: "get" },
        { regex: /export\s+(?:const|async\s+function)\s+POST\b/g, method: "post" },
        { regex: /export\s+(?:const|async\s+function)\s+PUT\b/g, method: "put" },
        { regex: /export\s+(?:const|async\s+function)\s+PATCH\b/g, method: "patch" },
        { regex: /export\s+(?:const|async\s+function)\s+DELETE\b/g, method: "delete" },
      ];

      for (const { regex, method } of methodPatterns) {
        if (regex.test(content)) {
          methods.push(method);
        }
      }

      if (methods.length > 0) {
        // Convert filesystem path to OpenAPI path
        const openApiPath = basePath
          .replace(/\[([^\]]+)\]/g, "{$1}")
          .replace(/\/route\.ts$/, "")
          .replace(/\/route\.js$/, "");

        // Determine tag from path — use second segment for domain (first is always "api")
        const pathSegments = openApiPath.split("/").filter(Boolean);
        const tag = pathSegments.length > 1 ? pathSegments[1] : pathSegments[0] || "default";

        // Determine if this is a public or authenticated endpoint
        const isPublic =
          content.includes("/api/health") ||
          content.includes("/api/webhooks/whatsapp") ||
          content.includes("/api/saas/payments/callback") ||
          content.includes("public") ||
          (!content.includes("resolveAuth") && !content.includes("withErrorHandler"));

        // Extract description from file comments
        const docComment = content.match(/\/\*\*([\s\S]*?)\*\//);
        const description = docComment
          ? docComment[1]
              .trim()
              .split("\n")
              .map((l: string) => l.trim().replace(/^\*\s?/, ""))
              .filter((l: string) => l && !l.startsWith("@"))
              .join(" ")
              .substring(0, 200)
          : `${methods.join("/")} ${openApiPath}`;

        // Build operation for each method
        const operationObj: Record<string, object> = {};

        for (const method of methods) {
          const isIdempotent = method === "get" || method === "put" || method === "delete";
          const hasRequestBody = method === "post" || method === "put" || method === "patch";

          const operation: Record<string, any> = {
            operationId: `${method}_${pathSegments.join("_").replace(/\{/g, "by_").replace(/\}/g, "")}`,
            summary: description.substring(0, 80),
            description,
            tags: [tag],
            responses: {
              "200": {
                description: "Successful response",
                content: {
                  "application/json": {
                    schema: { type: "object", additionalProperties: true },
                  },
                },
              },
              ...(isPublic ? {} : {
                "401": { $ref: "#/components/responses/Unauthorized" },
                "403": { $ref: "#/components/responses/Forbidden" },
              }),
              "404": { $ref: "#/components/responses/NotFound" },
              "429": { $ref: "#/components/responses/RateLimited" },
              "500": { $ref: "#/components/responses/InternalError" },
            },
          };

          // Add security requirement for non-public endpoints
          if (!isPublic) {
            operation.security = [{ cookieAuth: [] }, { bearerAuth: [] }];
          }

          // Add request body for POST/PUT/PATCH
          if (hasRequestBody) {
            operation.requestBody = {
              required: true,
              content: {
                "application/json": {
                  schema: { type: "object", additionalProperties: true },
                },
              },
            };
          }

          // Add path parameters for dynamic segments
          const pathParams = openApiPath.match(/\{([^}]+)\}/g);
          if (pathParams) {
            operation.parameters = pathParams.map((param: string) => ({
              name: param.replace(/\{/g, "").replace(/\}/g, ""),
              in: "path",
              required: true,
              schema: { type: "string" },
              description: `Resource ${param.replace(/\{/g, "").replace(/\}/g, "")}`,
            }));
          }

          // Add companySlug query parameter for multi-tenant routes
          if (!isPublic && !pathParams) {
            if (!operation.parameters) operation.parameters = [];
            operation.parameters.push({
              name: "companySlug",
              in: "query",
              required: tag !== "auth" && tag !== "health",
              schema: { type: "string" },
              description: "Tenant company slug",
            });
          }

          operationObj[method] = operation;
        }

        paths[openApiPath] = operationObj;
      }
    }
  }
}

// ── Generate the Spec ────────────────────────────────────────────────────────

console.log("[openapi] Scanning API routes...");
scanApiRoutes(API_DIR, "/api");
console.log(`[openapi] Found ${Object.keys(paths).length} paths`);

const spec = {
  ...BASE_SPEC,
  paths,
};

// ── Write Output Files ───────────────────────────────────────────────────────

const OUTPUT_DIR = path.join(process.cwd(), "src/lib/openapi");

// JSON output
const jsonPath = path.join(OUTPUT_DIR, "openapi.json");
fs.writeFileSync(jsonPath, JSON.stringify(spec, null, 2));
console.log(`[openapi] Written: ${jsonPath}`);

// YAML output (simple conversion — no external dependency needed)
const yamlPath = path.join(OUTPUT_DIR, "openapi.yaml");
function toYaml(obj: any, indent: number = 0): string {
  const pad = "  ".repeat(indent);
  if (obj === null || obj === undefined) return "null";
  if (typeof obj === "boolean") return obj ? "true" : "false";
  if (typeof obj === "number") return obj.toString();
  if (typeof obj === "string") {
    if (obj.includes("\n") || obj.includes(":") || obj.includes("#") || obj.includes("'") || obj.includes('"') || obj.includes("{") || obj.includes("}")) {
      return `|-\n${pad}  ${obj.split("\n").join(`\n${pad}  `)}`;
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    if (obj.length === 0) return "[]";
    return obj.map((item: any) => `${pad}- ${toYaml(item, indent + 1).trimStart()}`).join("\n");
  }
  if (typeof obj === "object") {
    const entries = Object.entries(obj);
    if (entries.length === 0) return "{}";
    return entries.map(([key, value]) => {
      const yamlValue = toYaml(value, indent + 1);
      if (typeof value === "object" && !Array.isArray(value) && value !== null) {
        if (Object.keys(value).length === 0) return `${pad}${key}: {}`;
        return `${pad}${key}:\n${yamlValue}`;
      }
      if (Array.isArray(value) && value.length > 0) {
        return `${pad}${key}:\n${yamlValue}`;
      }
      return `${pad}${key}: ${yamlValue.trimStart()}`;
    }).join("\n");
  }
  return String(obj);
}

fs.writeFileSync(yamlPath, toYaml(spec));
console.log(`[openapi] Written: ${yamlPath}`);

// ── Generate TypeScript SDK Types ───────────────────────────────────────────

const tsContent = `/**
 * api-types.ts — Auto-generated TypeScript types from GarfiX OpenAPI spec.
 *
 * GENERATED BY: scripts/generate-openapi-spec.ts
 * DO NOT EDIT MANUALLY — regenerate after API changes.
 *
 * These types form the SDK contract between frontend and backend.
 * Contract tests validate that the actual API responses match these types.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Domain Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface ErrorResult {
  error: string;
  code?: string;
  details?: Record<string, unknown>;
}

export interface AuthResult {
  ok: boolean;
  user?: UserDTO;
  error?: string;
}

export interface UserDTO {
  id: string;
  uid: string;
  email: string;
  displayName: string;
  role: "admin" | "editor" | "employee" | "viewer";
  companies: string[];
  tokenVersion: number;
}

export interface CompanyDTO {
  id: string;
  name: string;
  nameAr?: string;
  slug: string;
  plan: "starter" | "business" | "enterprise";
  currency: "SAR" | "AED" | "KWD" | "BHD" | "QAR" | "OMR" | "EGP";
  subscriptionStatus: "active" | "trial" | "suspended" | "cancelled";
  createdAt?: string;
}

export interface InvoiceDTO {
  id: string;
  number: string;
  status: "draft" | "sent" | "paid" | "overdue" | "cancelled";
  subtotal: number;
  taxAmount: number;
  total: number;
  currency: string;
  issueDate: string;
  dueDate: string;
  clientId: string;
  lineItems: LineItemDTO[];
}

export interface LineItemDTO {
  id: string;
  productId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  discount: number;
}

export interface VoucherDTO {
  id: string;
  number: string;
  date: string;
  description?: string;
  lines: VoucherLineDTO[];
  status: "draft" | "posted" | "reversed";
}

export interface VoucherLineDTO {
  id: string;
  accountId: string;
  debit: number;
  credit: number;
  description?: string;
}

export interface FinancialPeriodDTO {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: "open" | "closed" | "locked";
  companySlug: string;
}

export interface AIRequestDTO {
  input: string;
  requestType: "ocr" | "matching" | "financial_analysis" | "chat" | "whatsapp";
  companySlug: string;
  context?: Record<string, unknown>;
}

export interface AIResponseDTO {
  ok: boolean;
  resolvedBy: "cache" | "pattern" | "rule" | "memory" | "budget" | "provider_routing" | "ai";
  confidence: number;
  costUsd: number;
  latencyMs: number;
  result?: Record<string, unknown>;
}

export interface AuditLogDTO {
  id: string;
  action: string;
  actor: string;
  companySlug: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

export interface WebhookEndpointDTO {
  id: string;
  url: string;
  events: string[];
  secret?: string;
  isActive: boolean;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface HealthCheckDTO {
  status: "healthy" | "degraded" | "down";
  version: string;
  uptime: number;
  checks: {
    database: "ok" | "error";
    cache: "ok" | "error" | "not_configured";
    aiFabric: "ok" | "error" | "not_configured";
    queues: "ok" | "error" | "not_configured";
  };
  timestamp: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sprint 2 — New Domain Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface EmployeeDTO {
  id: string;
  name: string;
  email: string;
  department?: string;
  position?: string;
  companySlug: string;
  hireDate?: string;
  status: "active" | "terminated" | "on_leave";
}

export interface AttendanceDTO {
  id: string;
  employeeId: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  status: "present" | "absent" | "late" | "half_day";
  companySlug?: string;
}

export interface SalaryDTO {
  id: string;
  employeeId: string;
  baseSalary: number;
  allowances?: number;
  deductions?: number;
  netSalary: number;
  period: string;
  status: "pending" | "processed" | "paid";
  companySlug?: string;
}

export interface LeaveRequestDTO {
  id: string;
  employeeId: string;
  type: "annual" | "sick" | "maternity" | "emergency";
  startDate: string;
  endDate: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  companySlug?: string;
}

export interface CommissionDTO {
  id: string;
  employeeId: string;
  amount: number;
  period: string;
  status: "pending" | "approved" | "paid";
  companySlug?: string;
}

export interface GratuityRecordDTO {
  id: string;
  employeeId: string;
  totalGratuity: number;
  yearsOfService: number;
  monthlyGratuity?: number;
  companySlug?: string;
}

export interface PlatformTenantDTO {
  slug: string;
  name: string;
  plan: "starter" | "business" | "enterprise";
  status: "active" | "trial" | "suspended" | "cancelled";
  createdAt?: string;
}

export interface PlatformStatsDTO {
  totalTenants: number;
  activeTenants: number;
  totalRevenue: number;
  monthlyRevenue?: number;
  aiCostMtd?: number;
  totalRequestsMtd?: number;
}

export interface PlatformFeatureFlagDTO {
  id: string;
  key: string;
  enabled: boolean;
  description?: string;
  rolloutPct?: number;
}

export interface AnnouncementDTO {
  id: string;
  title: string;
  body: string;
  type: "info" | "warning" | "critical";
  active: boolean;
  createdAt?: string;
}

export interface TicketDTO {
  id: string;
  title: string;
  description?: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "critical";
  category?: string;
  tenantSlug?: string;
  createdAt?: string;
}

export interface AIProviderDTO {
  id: string;
  name: string;
  provider: "openai" | "anthropic" | "google" | "deepseek" | "openrouter";
  modelId: string;
  isEnabled: boolean;
  costPer1kTokens?: number;
  latencyMs?: number;
}

export interface DashboardStatsDTO {
  totalRevenue: number;
  outstanding: number;
  totalClients: number;
  totalInvoices: number;
  paidCount?: number;
  overdueCount?: number;
}

export interface NotificationDTO {
  id: number;
  title: string;
  message: string;
  read: boolean;
  companySlug?: string;
  type?: string;
  createdAt?: string;
}

export interface ClientDTO {
  id: number;
  name: string;
  nameAr?: string;
  email?: string;
  phone?: string;
  companySlug: string;
  balance?: number;
}

export interface InventoryItemDTO {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  unitPrice?: number;
  companySlug: string;
  warehouseId?: string;
}

export interface WarehouseDTO {
  id: string;
  name: string;
  location?: string;
  companySlug: string;
  capacity?: number;
}

export interface StockMovementDTO {
  id: string;
  itemId: string;
  type: "in" | "out" | "transfer";
  quantity: number;
  reference?: string;
  companySlug: string;
  createdAt?: string;
}

export interface AutomationRuleDTO {
  id: string;
  name: string;
  trigger: string;
  action: string;
  isActive: boolean;
  companySlug?: string;
  lastRunAt?: string;
}

export interface FeatureFlagDTO {
  key: string;
  enabled: boolean;
  description?: string;
  companySlug?: string;
}

export interface ModuleDTO {
  id: string;
  name: string;
  enabled: boolean;
  companySlug?: string;
}

export interface InvoiceTemplateDTO {
  id: string;
  name: string;
  layout?: string;
  companySlug: string;
  isDefault?: boolean;
}

export interface PurchaseDTO {
  id: number;
  description: string;
  amount: number;
  date: string;
  companySlug: string;
  status?: "pending" | "approved" | "received" | "cancelled";
}

export interface ProductMatchConfigDTO {
  id: string;
  threshold: number;
  algorithm: "fuzzy" | "exact" | "semantic";
  companySlug: string;
  isActive?: boolean;
}

export interface StorageObjectDTO {
  key: string;
  size: number;
  contentType: string;
  url?: string;
  createdAt?: string;
}

export interface ReportDTO {
  id: number;
  title: string;
  type: "financial" | "tax" | "audit" | "custom";
  createdAt?: string;
  companySlug: string;
}

export interface BackupDTO {
  id: number;
  filename: string;
  size: number;
  createdAt?: string;
  companySlug: string;
}

export interface OnboardingStepDTO {
  id: string;
  title: string;
  description?: string;
  order: number;
  isCompleted: boolean;
  companySlug?: string;
}

export interface StartupCheckResultDTO {
  ok: boolean;
  fatal: string[];
  warnings: string[];
  env?: Record<string, boolean>;
}

export interface ZATCAInvoiceDTO {
  invoiceNumber: string;
  sellerVAT: string;
  buyerVAT?: string;
  totalAmount: number;
  vatAmount: number;
  issueDate?: string;
  status: "draft" | "submitted" | "cleared" | "rejected";
  companySlug?: string;
}

export interface MetricPointDTO {
  timestamp: string;
  value: number;
  labels?: Record<string, string>;
}

export interface SLODefinitionDTO {
  name: string;
  targetPct: number;
  currentPct: number;
  window: "7d" | "30d" | "90d";
  status: "healthy" | "at_risk" | "breached";
}

// ═══════════════════════════════════════════════════════════════════════════════
// API Path Types (Contract Layer)
// ═══════════════════════════════════════════════════════════════════════════════

/** Maps API paths to their response types for contract testing */
export interface APIContractMap {
  "/api/health": { GET: HealthCheckDTO };
  "/api/startup-check": { GET: StartupCheckResultDTO };
  "/api/metrics": { GET: { metrics: MetricPointDTO[] } };
  "/api/metrics/slo": { GET: { slos: SLODefinitionDTO[] } };
  "/api/auth/login": { POST: AuthResult };
  "/api/auth/register": { POST: AuthResult };
  "/api/auth/refresh": { POST: AuthResult };
  "/api/auth/logout": { POST: { ok: boolean } };
  "/api/auth/me": { GET: UserDTO };
  "/api/auth/change-password": { POST: { ok: boolean } };
  "/api/auth/forgot-password": { POST: { ok: boolean } };
  "/api/auth/reset-password": { POST: { ok: boolean } };
  "/api/accounting/journal-entries": { GET: PaginatedResponse<VoucherDTO>; POST: VoucherDTO };
  "/api/accounting/fiscal-periods": { GET: PaginatedResponse<FinancialPeriodDTO>; POST: FinancialPeriodDTO };
  "/api/accounting/accounts": { GET: PaginatedResponse<Record<string, unknown>> };
  "/api/accounting/balance-sheet": { GET: Record<string, unknown> };
  "/api/accounting/profit-loss": { GET: Record<string, unknown> };
  "/api/accounting/cash-flow": { GET: Record<string, unknown> };
  "/api/accounting/trial-balance": { GET: Record<string, unknown> };
  "/api/accounting/dashboard": { GET: Record<string, unknown> };
  "/api/accounting/aging": { GET: Record<string, unknown> };
  "/api/accounting/bank-accounts": { GET: PaginatedResponse<Record<string, unknown>> };
  "/api/accounting/bank-transfer": { POST: Record<string, unknown> };
  "/api/accounting/bank-reconciliation": { GET: PaginatedResponse<Record<string, unknown>> };
  "/api/accounting/post-dated-checks": { GET: PaginatedResponse<Record<string, unknown>> };
  "/api/accounting/installments": { GET: PaginatedResponse<Record<string, unknown>> };
  "/api/accounting/budgets": { GET: PaginatedResponse<Record<string, unknown>> };
  "/api/accounting/cost-centers": { GET: PaginatedResponse<Record<string, unknown>> };
  "/api/accounting/payroll": { GET: PaginatedResponse<Record<string, unknown>> };
  "/api/accounting/wps": { GET: PaginatedResponse<Record<string, unknown>> };
  "/api/accounting/tax-filing": { GET: PaginatedResponse<Record<string, unknown>> };
  "/api/accounting/vouchers": { GET: PaginatedResponse<VoucherDTO> };
  "/api/accounting/quotations": { GET: PaginatedResponse<Record<string, unknown>> };
  "/api/accounting/purchase-orders": { GET: PaginatedResponse<Record<string, unknown>> };
  "/api/accounting/fixed-assets": { GET: PaginatedResponse<Record<string, unknown>> };
  "/api/accounting/depreciation": { GET: Record<string, unknown> };
  "/api/accounting/inventory-valuation": { GET: Record<string, unknown> };
  "/api/accounting/landed-cost": { GET: PaginatedResponse<Record<string, unknown>> };
  "/api/accounting/inter-company": { GET: PaginatedResponse<Record<string, unknown>> };
  "/api/accounting/letters-of-credit": { GET: PaginatedResponse<Record<string, unknown>> };
  "/api/accounting/fx-revaluation": { GET: PaginatedResponse<Record<string, unknown>> };
  "/api/accounting/payment-methods": { GET: PaginatedResponse<Record<string, unknown>> };
  "/api/accounting/opening-balances": { GET: Record<string, unknown> };
  "/api/accounting/consolidation": { GET: Record<string, unknown> };
  "/api/accounting/commissions": { GET: PaginatedResponse<Record<string, unknown>> };
  "/api/accounting/profit-distribution": { GET: PaginatedResponse<Record<string, unknown>> };
  "/api/accounting/client-statement": { GET: Record<string, unknown> };
  "/api/accounting/supplier-statement": { GET: Record<string, unknown> };
  "/api/accounting/budget-vs-actual": { GET: Record<string, unknown> };
  "/api/accounting/period-comparison": { GET: Record<string, unknown> };
  "/api/accounting/cash-flow": { GET: Record<string, unknown> };
  "/api/accounting/export-excel": { POST: Record<string, unknown> };
  "/api/accounting/financial-dashboard": { GET: Record<string, unknown> };
  "/api/accounting/accounting-audit": { GET: PaginatedResponse<AuditLogDTO> };
  "/api/accounting/filing-reminders": { GET: Record<string, unknown> };
  "/api/accounting/initiate-payment": { POST: Record<string, unknown> };
  "/api/accounting/verify-payment": { POST: Record<string, unknown> };
  "/api/accounting/retention-check": { GET: Record<string, unknown> };
  "/api/accounting/asset-disposals": { GET: PaginatedResponse<Record<string, unknown>> };
  "/api/invoices": { GET: PaginatedResponse<InvoiceDTO>; POST: InvoiceDTO };
  "/api/invoice-templates": { GET: PaginatedResponse<InvoiceTemplateDTO> };
  "/api/clients": { GET: PaginatedResponse<ClientDTO>; POST: ClientDTO };
  "/api/companies": { GET: PaginatedResponse<CompanyDTO>; POST: CompanyDTO };
  "/api/ai/agents": { POST: AIResponseDTO };
  "/api/ai/chat": { POST: AIResponseDTO };
  "/api/ai/memory": { GET: Record<string, unknown> };
  "/api/ai/smart-parse": { POST: AIResponseDTO };
  "/api/ai/parse-file": { POST: AIResponseDTO };
  "/api/ai/parse-image": { POST: AIResponseDTO };
  "/api/ai/bulk-import": { POST: Record<string, unknown> };
  "/api/ai/invoice-brain/stats": { GET: Record<string, unknown> };
  "/api/audit": { GET: PaginatedResponse<AuditLogDTO> };
  "/api/webhooks/endpoints": { GET: PaginatedResponse<WebhookEndpointDTO>; POST: WebhookEndpointDTO };
  "/api/webhooks/events": { GET: Record<string, unknown> };
  "/api/webhooks/deliveries": { GET: Record<string, unknown> };
  "/api/dashboard/stats": { GET: DashboardStatsDTO };
  "/api/notifications": { GET: NotificationDTO[] };
  "/api/hr/employees": { GET: PaginatedResponse<EmployeeDTO> };
  "/api/hr/attendance": { GET: PaginatedResponse<AttendanceDTO> };
  "/api/hr/salaries": { GET: PaginatedResponse<SalaryDTO> };
  "/api/hr/leaves": { GET: PaginatedResponse<LeaveRequestDTO> };
  "/api/hr/commissions": { GET: PaginatedResponse<CommissionDTO> };
  "/api/hr/performance": { GET: PaginatedResponse<Record<string, unknown>> };
  "/api/hr/gratuity": { GET: PaginatedResponse<GratuityRecordDTO> };
  "/api/inventory/items": { GET: PaginatedResponse<InventoryItemDTO> };
  "/api/inventory/warehouses": { GET: PaginatedResponse<WarehouseDTO> };
  "/api/inventory/movements": { GET: PaginatedResponse<StockMovementDTO> };
  "/api/catalog": { GET: PaginatedResponse<Record<string, unknown>> };
  "/api/automation": { GET: PaginatedResponse<AutomationRuleDTO> };
  "/api/feature-flags": { GET: PaginatedResponse<FeatureFlagDTO> };
  "/api/modules": { GET: PaginatedResponse<ModuleDTO> };
  "/api/settings": { GET: Record<string, unknown> };
  "/api/reports": { GET: PaginatedResponse<ReportDTO> };
  "/api/backups": { GET: PaginatedResponse<BackupDTO> };
  "/api/purchases": { GET: PaginatedResponse<PurchaseDTO> };
  "/api/product-matching/review": { GET: PaginatedResponse<Record<string, unknown>> };
  "/api/product-matching/config": { GET: ProductMatchConfigDTO };
  "/api/platform-admin/tenants": { GET: PaginatedResponse<PlatformTenantDTO> };
  "/api/platform-admin/stats": { GET: PlatformStatsDTO };
  "/api/platform-admin/feature-flags": { GET: PaginatedResponse<PlatformFeatureFlagDTO> };
  "/api/platform-admin/announcements": { GET: PaginatedResponse<AnnouncementDTO> };
  "/api/platform-admin/tickets": { GET: PaginatedResponse<TicketDTO> };
  "/api/platform-admin/ai-providers": { GET: PaginatedResponse<AIProviderDTO> };
  "/api/platform-admin/audit": { GET: PaginatedResponse<AuditLogDTO> };
  "/api/founder-panel/mission-control": { GET: Record<string, unknown> };
  "/api/founder-panel/finops": { GET: Record<string, unknown> };
  "/api/founder-panel/ai-fabric": { GET: Record<string, unknown> };
  "/api/onboarding": { GET: PaginatedResponse<OnboardingStepDTO> };
  "/api/permissions/roles": { GET: Record<string, unknown> };
  "/api/permissions/catalog": { GET: Record<string, unknown> };
  "/api/saas/payments": { GET: PaginatedResponse<Record<string, unknown>> };
  "/api/saas/users": { GET: PaginatedResponse<Record<string, unknown>> };
}

/** Type-safe API client — validates response shapes at compile time */
export type APIResponse<Path extends keyof APIContractMap, Method extends keyof APIContractMap[Path]> =
  APIContractMap[Path][Method];
`;

const tsPath = path.join(OUTPUT_DIR, "api-types.ts");
fs.writeFileSync(tsPath, tsContent);
console.log(`[openapi] Written: ${tsPath}`);

// ── Stats ────────────────────────────────────────────────────────────────────

const pathCount = Object.keys(paths).length;
const methodCount = Object.values(paths).reduce((sum, ops) => sum + Object.keys(ops).length, 0);
const tagCount = new Set(
  Object.values(paths)
    .flatMap((ops) => Object.values(ops))
    .flatMap((op: any) => op.tags || [])
).size;

console.log(`\n[openapi] ═══════════════════════════════════════════════════════`);
console.log(`[openapi] OpenAPI 3.1 Specification Generated`);
console.log(`[openapi] Paths:      ${pathCount}`);
console.log(`[openapi] Operations: ${methodCount}`);
console.log(`[openapi] Tags:       ${tagCount}`);
console.log(`[openapi] Schemas:    ${Object.keys(BASE_SPEC.components.schemas).length}`);
console.log(`[openapi] ═══════════════════════════════════════════════════════`);
