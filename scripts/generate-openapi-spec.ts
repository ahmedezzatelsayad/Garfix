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
    { name: "hr", description: "Employee management, payroll" },
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
        { regex: /export\s+const\s+GET\s*=/g, method: "get" },
        { regex: /export\s+const\s+POST\s*=/g, method: "post" },
        { regex: /export\s+const\s+PUT\s*=/g, method: "put" },
        { regex: /export\s+const\s+PATCH\s*=/g, method: "patch" },
        { regex: /export\s+const\s+DELETE\s*=/g, method: "delete" },
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

        // Determine tag from path
        const pathSegments = openApiPath.split("/").filter(Boolean);
        const tag = pathSegments[0] || "default";

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
// API Path Types (Contract Layer)
// ═══════════════════════════════════════════════════════════════════════════════

/** Maps API paths to their response types for contract testing */
export interface APIContractMap {
  "/api/health": { GET: HealthCheckDTO };
  "/api/startup-check": { GET: { ok: boolean; fatal: string[]; warnings: string[]; env: Record<string, boolean> } };
  "/api/auth/login": { POST: AuthResult };
  "/api/auth/refresh": { POST: AuthResult };
  "/api/auth/logout": { POST: { ok: boolean } };
  "/api/accounting/journal-entries": { GET: PaginatedResponse<VoucherDTO>; POST: VoucherDTO };
  "/api/accounting/fiscal-periods": { GET: PaginatedResponse<FinancialPeriodDTO>; POST: FinancialPeriodDTO };
  "/api/accounting/balance-sheet": { GET: Record<string, unknown> };
  "/api/accounting/profit-loss": { GET: Record<string, unknown> };
  "/api/invoices": { GET: PaginatedResponse<InvoiceDTO>; POST: InvoiceDTO };
  "/api/companies": { GET: PaginatedResponse<CompanyDTO>; POST: CompanyDTO };
  "/api/ai/agents": { POST: AIResponseDTO };
  "/api/audit": { GET: PaginatedResponse<AuditLogDTO> };
  "/api/webhooks/endpoints": { GET: PaginatedResponse<WebhookEndpointDTO>; POST: WebhookEndpointDTO };
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
