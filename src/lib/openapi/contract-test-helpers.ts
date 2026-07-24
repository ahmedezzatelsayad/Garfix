/**
 * contract-test-helpers.ts — Contract testing utilities for GarfiX API.
 *
 * These helpers validate that API responses conform to the OpenAPI spec
 * (api-types.ts). Contract tests catch:
 *   - Missing required fields in responses
 *   - Type mismatches (string vs number, wrong enum values)
 *   - Undocumented response shapes
 *   - Breaking changes between API versions
 *
 * Usage in test files:
 *   import { validateContract, ContractValidator } from "@/lib/openapi/contract-test-helpers";
 *   const result = validateContract("/api/invoices", "GET", responseBody);
 *   expect(result.ok).toBe(true);
 *
 * Design principle: Contract tests should be FAST and deterministic.
 * No real HTTP calls — they validate response shapes from mock/test data.
 */

import type {
  ErrorResult,
  AuthResult,
  UserDTO,
  CompanyDTO,
  InvoiceDTO,
  VoucherDTO,
  FinancialPeriodDTO,
  AIResponseDTO,
  AuditLogDTO,
  HealthCheckDTO,
  PaginatedResponse,
  APIContractMap,
  APIResponse,
} from "./api-types";

// ── Validation Result ────────────────────────────────────────────────────────

export interface ContractValidationResult {
  ok: boolean;
  errors: ContractError[];
  warnings: string[];
}

export interface ContractError {
  path: string;
  expected: string;
  actual: string;
  message: string;
}

// ── Type Guards ──────────────────────────────────────────────────────────────

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasField<T extends Record<string, unknown>>(obj: T, field: string): boolean {
  return field in obj && obj[field] !== undefined && obj[field] !== null;
}

// ── Field Validators ─────────────────────────────────────────────────────────

function validateStringField(
  obj: Record<string, unknown>,
  field: string,
  required: boolean = true,
  errors: ContractError[],
  pathPrefix: string = "",
): void {
  const fullPath = `${pathPrefix}.${field}`;
  if (!hasField(obj, field)) {
    if (required) {
      errors.push({ path: fullPath, expected: "string", actual: "undefined", message: `Required field '${field}' is missing` });
    }
    return;
  }
  if (typeof obj[field] !== "string") {
    errors.push({ path: fullPath, expected: "string", actual: typeof obj[field], message: `Field '${field}' should be string, got ${typeof obj[field]}` });
  }
}

function validateNumberField(
  obj: Record<string, unknown>,
  field: string,
  required: boolean = true,
  errors: ContractError[],
  pathPrefix: string = "",
): void {
  const fullPath = `${pathPrefix}.${field}`;
  if (!hasField(obj, field)) {
    if (required) {
      errors.push({ path: fullPath, expected: "number", actual: "undefined", message: `Required field '${field}' is missing` });
    }
    return;
  }
  if (typeof obj[field] !== "number") {
    errors.push({ path: fullPath, expected: "number", actual: typeof obj[field], message: `Field '${field}' should be number, got ${typeof obj[field]}` });
  }
}

function validateBooleanField(
  obj: Record<string, unknown>,
  field: string,
  required: boolean = true,
  errors: ContractError[],
  pathPrefix: string = "",
): void {
  const fullPath = `${pathPrefix}.${field}`;
  if (!hasField(obj, field)) {
    if (required) {
      errors.push({ path: fullPath, expected: "boolean", actual: "undefined", message: `Required field '${field}' is missing` });
    }
    return;
  }
  if (typeof obj[field] !== "boolean") {
    errors.push({ path: fullPath, expected: "boolean", actual: typeof obj[field], message: `Field '${field}' should be boolean, got ${typeof obj[field]}` });
  }
}

function validateEnumField(
  obj: Record<string, unknown>,
  field: string,
  allowedValues: string[],
  required: boolean = true,
  errors: ContractError[],
  pathPrefix: string = "",
): void {
  const fullPath = `${pathPrefix}.${field}`;
  if (!hasField(obj, field)) {
    if (required) {
      errors.push({ path: fullPath, expected: `enum(${allowedValues.join("|")})`, actual: "undefined", message: `Required field '${field}' is missing` });
    }
    return;
  }
  if (typeof obj[field] !== "string") {
    errors.push({ path: fullPath, expected: `enum(${allowedValues.join("|")})`, actual: typeof obj[field], message: `Field '${field}' should be string enum` });
    return;
  }
  if (!allowedValues.includes(obj[field] as string)) {
    errors.push({ path: fullPath, expected: `enum(${allowedValues.join("|")})`, actual: obj[field] as string, message: `Field '${field}' value '${obj[field]}' not in allowed enum values` });
  }
}

function validateStringArrayField(
  obj: Record<string, unknown>,
  field: string,
  required: boolean = true,
  errors: ContractError[],
  pathPrefix: string = "",
): void {
  const fullPath = `${pathPrefix}.${field}`;
  if (!hasField(obj, field)) {
    if (required) {
      errors.push({ path: fullPath, expected: "string[]", actual: "undefined", message: `Required field '${field}' is missing` });
    }
    return;
  }
  if (!Array.isArray(obj[field])) {
    errors.push({ path: fullPath, expected: "string[]", actual: typeof obj[field], message: `Field '${field}' should be array, got ${typeof obj[field]}` });
    return;
  }
}

function validateArrayField(
  obj: Record<string, unknown>,
  field: string,
  itemValidator: (item: Record<string, unknown>, errors: ContractError[], prefix: string) => void,
  required: boolean = true,
  errors: ContractError[],
  pathPrefix: string = "",
): void {
  const fullPath = `${pathPrefix}.${field}`;
  if (!hasField(obj, field)) {
    if (required) {
      errors.push({ path: fullPath, expected: "array", actual: "undefined", message: `Required field '${field}' is missing` });
    }
    return;
  }
  if (!Array.isArray(obj[field])) {
    errors.push({ path: fullPath, expected: "array", actual: typeof obj[field], message: `Field '${field}' should be array, got ${typeof obj[field]}` });
    return;
  }
  const arr = obj[field] as Record<string, unknown>[];
  arr.forEach((item, i) => {
    if (isObject(item)) {
      itemValidator(item, errors, `${fullPath}[${i}]`);
    } else {
      errors.push({ path: `${fullPath}[${i}]`, expected: "object", actual: typeof item, message: `Array item at index ${i} should be object` });
    }
  });
}

// ── Domain Validators ────────────────────────────────────────────────────────

function validateErrorResult(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "error", true, errors, prefix);
}

function validateUserDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "uid", true, errors, prefix);
  validateStringField(obj, "email", true, errors, prefix);
  validateStringField(obj, "displayName", true, errors, prefix);
  validateEnumField(obj, "role", ["admin", "editor", "employee", "viewer"], true, errors, prefix);
  validateStringArrayField(obj, "companies", true, errors, prefix);
  validateNumberField(obj, "tokenVersion", true, errors, prefix);
}

function validateCompanyDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "name", true, errors, prefix);
  validateStringField(obj, "slug", true, errors, prefix);
  validateEnumField(obj, "plan", ["starter", "business", "enterprise"], true, errors, prefix);
  validateEnumField(obj, "currency", ["SAR", "AED", "KWD", "BHD", "QAR", "OMR", "EGP"], true, errors, prefix);
  validateEnumField(obj, "subscriptionStatus", ["active", "trial", "suspended", "cancelled"], true, errors, prefix);
}

function validateInvoiceDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "number", true, errors, prefix);
  validateEnumField(obj, "status", ["draft", "sent", "paid", "overdue", "cancelled"], true, errors, prefix);
  validateNumberField(obj, "total", true, errors, prefix);
  validateStringField(obj, "currency", true, errors, prefix);
  validateStringField(obj, "issueDate", true, errors, prefix);
  validateStringField(obj, "dueDate", true, errors, prefix);
}

function validateVoucherDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "number", true, errors, prefix);
  validateStringField(obj, "date", true, errors, prefix);
  validateEnumField(obj, "status", ["draft", "posted", "reversed"], true, errors, prefix);
}

function validateFinancialPeriodDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "name", true, errors, prefix);
  validateStringField(obj, "startDate", true, errors, prefix);
  validateStringField(obj, "endDate", true, errors, prefix);
  validateEnumField(obj, "status", ["open", "closed", "locked"], true, errors, prefix);
  validateStringField(obj, "companySlug", true, errors, prefix);
}

function validateAIResponseDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateBooleanField(obj, "ok", true, errors, prefix);
  validateEnumField(obj, "resolvedBy", ["cache", "pattern", "rule", "memory", "budget", "provider_routing", "ai"], true, errors, prefix);
  validateNumberField(obj, "confidence", true, errors, prefix);
  validateNumberField(obj, "costUsd", true, errors, prefix);
  validateNumberField(obj, "latencyMs", true, errors, prefix);
}

function validateHealthCheckDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateEnumField(obj, "status", ["healthy", "degraded", "down"], true, errors, prefix);
  validateStringField(obj, "version", true, errors, prefix);
  validateNumberField(obj, "uptime", true, errors, prefix);
  if (isObject(obj.checks)) {
    validateEnumField(obj.checks, "database", ["ok", "error"], true, errors, `${prefix}.checks`);
    validateEnumField(obj.checks, "cache", ["ok", "error", "not_configured"], true, errors, `${prefix}.checks`);
  }
  validateStringField(obj, "timestamp", true, errors, prefix);
}

// ── Sprint 2 Domain Validators ───────────────────────────────────────────────

function validateEmployeeDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "name", true, errors, prefix);
  validateStringField(obj, "email", true, errors, prefix);
  validateStringField(obj, "companySlug", true, errors, prefix);
  validateEnumField(obj, "status", ["active", "terminated", "on_leave"], true, errors, prefix);
}

function validateAttendanceDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "employeeId", true, errors, prefix);
  validateStringField(obj, "date", true, errors, prefix);
  validateEnumField(obj, "status", ["present", "absent", "late", "half_day"], true, errors, prefix);
}

function validateSalaryDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "employeeId", true, errors, prefix);
  validateNumberField(obj, "baseSalary", true, errors, prefix);
  validateNumberField(obj, "netSalary", true, errors, prefix);
  validateStringField(obj, "period", true, errors, prefix);
  validateEnumField(obj, "status", ["pending", "processed", "paid"], true, errors, prefix);
}

function validateLeaveRequestDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "employeeId", true, errors, prefix);
  validateEnumField(obj, "type", ["annual", "sick", "maternity", "emergency"], true, errors, prefix);
  validateStringField(obj, "startDate", true, errors, prefix);
  validateStringField(obj, "endDate", true, errors, prefix);
  validateEnumField(obj, "status", ["pending", "approved", "rejected", "cancelled"], true, errors, prefix);
}

function validateClientDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateNumberField(obj, "id", true, errors, prefix);
  validateStringField(obj, "name", true, errors, prefix);
  validateStringField(obj, "companySlug", true, errors, prefix);
}

function validateInventoryItemDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "name", true, errors, prefix);
  validateStringField(obj, "sku", true, errors, prefix);
  validateNumberField(obj, "quantity", true, errors, prefix);
  validateStringField(obj, "companySlug", true, errors, prefix);
}

function validateWarehouseDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "name", true, errors, prefix);
  validateStringField(obj, "companySlug", true, errors, prefix);
}

function validateDashboardStatsDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateNumberField(obj, "totalRevenue", true, errors, prefix);
  validateNumberField(obj, "outstanding", true, errors, prefix);
  validateNumberField(obj, "totalClients", true, errors, prefix);
  validateNumberField(obj, "totalInvoices", true, errors, prefix);
}

function validateNotificationDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateNumberField(obj, "id", true, errors, prefix);
  validateStringField(obj, "title", true, errors, prefix);
  validateStringField(obj, "message", true, errors, prefix);
  validateBooleanField(obj, "read", true, errors, prefix);
}

function validateFeatureFlagDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "key", true, errors, prefix);
  validateBooleanField(obj, "enabled", true, errors, prefix);
}

function validateModuleDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "name", true, errors, prefix);
  validateBooleanField(obj, "enabled", true, errors, prefix);
}

function validatePlatformTenantDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "slug", true, errors, prefix);
  validateStringField(obj, "name", true, errors, prefix);
  validateEnumField(obj, "plan", ["starter", "business", "enterprise"], true, errors, prefix);
  validateEnumField(obj, "status", ["active", "trial", "suspended", "cancelled"], true, errors, prefix);
}

function validatePlatformStatsDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateNumberField(obj, "totalTenants", true, errors, prefix);
  validateNumberField(obj, "activeTenants", true, errors, prefix);
  validateNumberField(obj, "totalRevenue", true, errors, prefix);
}

function validateAnnouncementDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "title", true, errors, prefix);
  validateStringField(obj, "body", true, errors, prefix);
  validateEnumField(obj, "type", ["info", "warning", "critical"], true, errors, prefix);
  validateBooleanField(obj, "active", true, errors, prefix);
}

function validateTicketDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "title", true, errors, prefix);
  validateEnumField(obj, "status", ["open", "in_progress", "resolved", "closed"], true, errors, prefix);
  validateEnumField(obj, "priority", ["low", "medium", "high", "critical"], true, errors, prefix);
}

function validateAutomationRuleDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "name", true, errors, prefix);
  validateStringField(obj, "trigger", true, errors, prefix);
  validateStringField(obj, "action", true, errors, prefix);
  validateBooleanField(obj, "isActive", true, errors, prefix);
}

function validateBackupDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateNumberField(obj, "id", true, errors, prefix);
  validateStringField(obj, "filename", true, errors, prefix);
  validateNumberField(obj, "size", true, errors, prefix);
  validateStringField(obj, "companySlug", true, errors, prefix);
}

function validatePurchaseDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateNumberField(obj, "id", true, errors, prefix);
  validateStringField(obj, "description", true, errors, prefix);
  validateNumberField(obj, "amount", true, errors, prefix);
  validateStringField(obj, "date", true, errors, prefix);
  validateStringField(obj, "companySlug", true, errors, prefix);
}

function validateZATCAInvoiceDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "invoiceNumber", true, errors, prefix);
  validateStringField(obj, "sellerVAT", true, errors, prefix);
  validateNumberField(obj, "totalAmount", true, errors, prefix);
  validateNumberField(obj, "vatAmount", true, errors, prefix);
  validateEnumField(obj, "status", ["draft", "submitted", "cleared", "rejected"], true, errors, prefix);
}

function validateAccountDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateNumberField(obj, "id", true, errors, prefix);
  validateStringField(obj, "code", true, errors, prefix);
  validateStringField(obj, "name", true, errors, prefix);
  validateStringField(obj, "type", true, errors, prefix);
  validateNumberField(obj, "balance", true, errors, prefix);
  validateStringField(obj, "companySlug", true, errors, prefix);
}

function validateCommissionDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "employeeId", true, errors, prefix);
  validateNumberField(obj, "amount", true, errors, prefix);
  validateStringField(obj, "period", true, errors, prefix);
  validateEnumField(obj, "status", ["pending", "approved", "paid"], true, errors, prefix);
}

function validateGratuityRecordDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "employeeId", true, errors, prefix);
  validateNumberField(obj, "totalGratuity", true, errors, prefix);
  validateNumberField(obj, "yearsOfService", true, errors, prefix);
}

function validateStockMovementDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "itemId", true, errors, prefix);
  validateEnumField(obj, "type", ["in", "out", "transfer"], true, errors, prefix);
  validateNumberField(obj, "quantity", true, errors, prefix);
  validateStringField(obj, "companySlug", true, errors, prefix);
}

function validateAuditLogDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "action", true, errors, prefix);
  validateStringField(obj, "actor", true, errors, prefix);
  validateStringField(obj, "companySlug", true, errors, prefix);
  validateStringField(obj, "createdAt", true, errors, prefix);
}

function validateInvoiceTemplateDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "name", true, errors, prefix);
  validateStringField(obj, "companySlug", true, errors, prefix);
}

function validateReportDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateNumberField(obj, "id", true, errors, prefix);
  validateStringField(obj, "title", true, errors, prefix);
  validateEnumField(obj, "type", ["financial", "tax", "audit", "custom"], true, errors, prefix);
  validateStringField(obj, "companySlug", true, errors, prefix);
}

function validatePlatformFeatureFlagDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "key", true, errors, prefix);
  validateBooleanField(obj, "enabled", true, errors, prefix);
}

function validateMetricPointDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "timestamp", true, errors, prefix);
  validateNumberField(obj, "value", true, errors, prefix);
}

function validateStartupCheckResultDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateBooleanField(obj, "ok", true, errors, prefix);
  // IMPORTANT: Use validateStringArrayField for "fatal" and "warnings"
  // (NOT validateArrayField which expects objects)
  validateStringArrayField(obj, "fatal", true, errors, prefix);
  validateStringArrayField(obj, "warnings", true, errors, prefix);
}

// ── Paginated Response Helper ────────────────────────────────────────────────

function validatePaginatedResponse(
  body: unknown,
  itemValidator: (item: Record<string, unknown>, errors: ContractError[], prefix: string) => void,
  errors: ContractError[],
  prefix: string = "PaginatedResponse",
): void {
  if (!isObject(body)) {
    errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be PaginatedResponse" });
    return;
  }
  validateArrayField(body, "data", itemValidator, true, errors, prefix);
  validateNumberField(body, "total", true, errors, prefix);
  validateNumberField(body, "page", true, errors, prefix);
  validateBooleanField(body, "hasMore", true, errors, prefix);
}

// ── Route-Specific Validators ────────────────────────────────────────────────

const ROUTE_VALIDATORS: Record<string, Record<string, (body: unknown, errors: ContractError[]) => void>> = {
  // ── Auth ──
  "/api/auth/login": {
    post: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be object" }); return; }
      validateBooleanField(body, "ok", true, errors, "AuthResult");
      if (body.ok && isObject(body.user)) {
        validateUserDTO(body.user as Record<string, unknown>, errors, "AuthResult.user");
      }
    },
  },
  "/api/auth/register": {
    post: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be object" }); return; }
      validateBooleanField(body, "ok", true, errors, "AuthResult");
    },
  },
  "/api/auth/me": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be UserDTO" }); return; }
      validateUserDTO(body, errors, "UserDTO");
    },
  },

  // ── Health ──
  "/api/health": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be object" }); return; }
      validateHealthCheckDTO(body, errors, "HealthCheckDTO");
    },
  },

  // ── Startup Check ──
  "/api/startup-check": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be object" }); return; }
      validateStartupCheckResultDTO(body, errors, "StartupCheckResultDTO");
    },
  },

  // ── Accounting ──
  "/api/accounting/journal-entries": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateVoucherDTO, errors, "PaginatedResponse<VoucherDTO>");
    },
  },
  "/api/accounting/accounts": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateAccountDTO, errors, "PaginatedResponse<AccountDTO>");
    },
  },
  "/api/accounting/fiscal-periods": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateFinancialPeriodDTO, errors, "PaginatedResponse<FinancialPeriodDTO>");
    },
  },
  "/api/accounting/vouchers": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateVoucherDTO, errors, "PaginatedResponse<VoucherDTO>");
    },
  },
  "/api/accounting/bank-accounts": {
    get: (body, errors) => {
      validatePaginatedResponse(body, (item, errs, pfx) => {
        validateNumberField(item, "id", true, errs, pfx);
        validateStringField(item, "name", true, errs, pfx);
        validateStringField(item, "companySlug", true, errs, pfx);
      }, errors, "PaginatedResponse");
    },
  },
  "/api/accounting/budgets": {
    get: (body, errors) => {
      validatePaginatedResponse(body, (item, errs, pfx) => {
        validateStringField(item, "id", true, errs, pfx);
        validateStringField(item, "name", true, errs, pfx);
        validateStringField(item, "companySlug", true, errs, pfx);
      }, errors, "PaginatedResponse");
    },
  },
  "/api/accounting/cost-centers": {
    get: (body, errors) => {
      validatePaginatedResponse(body, (item, errs, pfx) => {
        validateStringField(item, "id", true, errs, pfx);
        validateStringField(item, "name", true, errs, pfx);
        validateStringField(item, "companySlug", true, errs, pfx);
      }, errors, "PaginatedResponse");
    },
  },
  "/api/accounting/payroll": {
    get: (body, errors) => {
      validatePaginatedResponse(body, (item, errs, pfx) => {
        validateStringField(item, "id", true, errs, pfx);
        validateStringField(item, "companySlug", true, errs, pfx);
      }, errors, "PaginatedResponse");
    },
  },
  "/api/accounting/wps": {
    get: (body, errors) => {
      validatePaginatedResponse(body, (item, errs, pfx) => {
        validateStringField(item, "id", true, errs, pfx);
        validateStringField(item, "companySlug", true, errs, pfx);
      }, errors, "PaginatedResponse");
    },
  },
  "/api/accounting/tax-filing": {
    get: (body, errors) => {
      validatePaginatedResponse(body, (item, errs, pfx) => {
        validateStringField(item, "id", true, errs, pfx);
        validateStringField(item, "companySlug", true, errs, pfx);
      }, errors, "PaginatedResponse");
    },
  },
  "/api/accounting/fixed-assets": {
    get: (body, errors) => {
      validatePaginatedResponse(body, (item, errs, pfx) => {
        validateStringField(item, "id", true, errs, pfx);
        validateStringField(item, "name", true, errs, pfx);
        validateStringField(item, "companySlug", true, errs, pfx);
      }, errors, "PaginatedResponse");
    },
  },
  "/api/accounting/landed-cost": {
    get: (body, errors) => {
      validatePaginatedResponse(body, (item, errs, pfx) => {
        validateStringField(item, "id", true, errs, pfx);
        validateStringField(item, "companySlug", true, errs, pfx);
      }, errors, "PaginatedResponse");
    },
  },
  "/api/accounting/inter-company": {
    get: (body, errors) => {
      validatePaginatedResponse(body, (item, errs, pfx) => {
        validateStringField(item, "id", true, errs, pfx);
        validateStringField(item, "companySlug", true, errs, pfx);
      }, errors, "PaginatedResponse");
    },
  },
  "/api/accounting/letters-of-credit": {
    get: (body, errors) => {
      validatePaginatedResponse(body, (item, errs, pfx) => {
        validateStringField(item, "id", true, errs, pfx);
        validateStringField(item, "companySlug", true, errs, pfx);
      }, errors, "PaginatedResponse");
    },
  },
  "/api/accounting/payment-methods": {
    get: (body, errors) => {
      validatePaginatedResponse(body, (item, errs, pfx) => {
        validateStringField(item, "id", true, errs, pfx);
        validateStringField(item, "name", true, errs, pfx);
      }, errors, "PaginatedResponse");
    },
  },
  "/api/accounting/commissions": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateCommissionDTO, errors, "PaginatedResponse<CommissionDTO>");
    },
  },
  "/api/accounting/accounting-audit": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateAuditLogDTO, errors, "PaginatedResponse<AuditLogDTO>");
    },
  },

  // ── Invoices ──
  "/api/invoices": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateInvoiceDTO, errors, "PaginatedResponse<InvoiceDTO>");
    },
  },
  "/api/invoice-templates": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateInvoiceTemplateDTO, errors, "PaginatedResponse<InvoiceTemplateDTO>");
    },
  },

  // ── Clients ──
  "/api/clients": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateClientDTO, errors, "PaginatedResponse<ClientDTO>");
    },
  },

  // ── Company ──
  "/api/companies": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateCompanyDTO, errors, "PaginatedResponse<CompanyDTO>");
    },
  },

  // ── HR ──
  "/api/hr/employees": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateEmployeeDTO, errors, "PaginatedResponse<EmployeeDTO>");
    },
  },
  "/api/hr/attendance": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateAttendanceDTO, errors, "PaginatedResponse<AttendanceDTO>");
    },
  },
  "/api/hr/salaries": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateSalaryDTO, errors, "PaginatedResponse<SalaryDTO>");
    },
  },
  "/api/hr/leaves": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateLeaveRequestDTO, errors, "PaginatedResponse<LeaveRequestDTO>");
    },
  },
  "/api/hr/commissions": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateCommissionDTO, errors, "PaginatedResponse<CommissionDTO>");
    },
  },
  "/api/hr/gratuity": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateGratuityRecordDTO, errors, "PaginatedResponse<GratuityRecordDTO>");
    },
  },

  // ── Inventory ──
  "/api/inventory/items": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateInventoryItemDTO, errors, "PaginatedResponse<InventoryItemDTO>");
    },
  },
  "/api/inventory/warehouses": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateWarehouseDTO, errors, "PaginatedResponse<WarehouseDTO>");
    },
  },
  "/api/inventory/movements": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateStockMovementDTO, errors, "PaginatedResponse<StockMovementDTO>");
    },
  },

  // ── AI ──
  "/api/ai/agents": {
    post: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be AIResponseDTO" }); return; }
      validateAIResponseDTO(body, errors, "AIResponseDTO");
    },
  },

  // ── Dashboard ──
  "/api/dashboard/stats": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be DashboardStatsDTO" }); return; }
      validateDashboardStatsDTO(body, errors, "DashboardStatsDTO");
    },
  },

  // ── Notifications ──
  "/api/notifications": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be object" }); return; }
      // Notifications may come in various shapes
      if (hasField(body, "notifications")) {
        validateArrayField(body, "notifications", validateNotificationDTO, true, errors, "NotificationListResponse");
      } else if (Array.isArray(body)) {
        // Direct array
        (body as unknown as Record<string, unknown>[]).forEach((item, i) => {
          if (isObject(item)) validateNotificationDTO(item, errors, `NotificationDTO[${i}]`);
        });
      }
    },
  },

  // ── Audit ──
  "/api/audit": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateAuditLogDTO, errors, "PaginatedResponse<AuditLogDTO>");
    },
  },

  // ── Backups ──
  "/api/backups": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be object" }); return; }
      if (hasField(body, "backups")) {
        validateArrayField(body, "backups", validateBackupDTO, true, errors, "BackupListResponse");
      }
    },
  },

  // ── Purchases ──
  "/api/purchases": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be object" }); return; }
      if (hasField(body, "purchases")) {
        validateArrayField(body, "purchases", validatePurchaseDTO, true, errors, "PurchaseListResponse");
      }
    },
  },

  // ── Reports ──
  "/api/reports": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be object" }); return; }
      if (hasField(body, "reports")) {
        validateArrayField(body, "reports", validateReportDTO, true, errors, "ReportListResponse");
      }
    },
  },

  // ── Feature Flags ──
  "/api/feature-flags": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be object" }); return; }
      if (hasField(body, "flags")) {
        validateArrayField(body, "flags", validateFeatureFlagDTO, true, errors, "FeatureFlagListResponse");
      }
    },
  },

  // ── Modules ──
  "/api/modules": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be object" }); return; }
      if (hasField(body, "modules")) {
        validateArrayField(body, "modules", validateModuleDTO, true, errors, "ModuleListResponse");
      }
    },
  },

  // ── Automation ──
  "/api/automation": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateAutomationRuleDTO, errors, "PaginatedResponse<AutomationRuleDTO>");
    },
  },

  // ── Webhooks ──
  "/api/webhooks/endpoints": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be object" }); return; }
      if (hasField(body, "endpoints")) {
        validateArrayField(body, "endpoints", (item, errs, pfx) => {
          validateStringField(item, "id", true, errs, pfx);
          validateStringField(item, "url", true, errs, pfx);
          validateBooleanField(item, "isActive", true, errs, pfx);
        }, true, errors, "WebhookEndpointListResponse");
      }
    },
  },

  // ── Platform Admin ──
  "/api/platform-admin/stats": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be PlatformStatsDTO" }); return; }
      validatePlatformStatsDTO(body, errors, "PlatformStatsDTO");
    },
  },
  "/api/platform-admin/tenants": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validatePlatformTenantDTO, errors, "PaginatedResponse<PlatformTenantDTO>");
    },
  },
  "/api/platform-admin/feature-flags": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validatePlatformFeatureFlagDTO, errors, "PaginatedResponse<PlatformFeatureFlagDTO>");
    },
  },
  "/api/platform-admin/announcements": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateAnnouncementDTO, errors, "PaginatedResponse<AnnouncementDTO>");
    },
  },
  "/api/platform-admin/tickets": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateTicketDTO, errors, "PaginatedResponse<TicketDTO>");
    },
  },
  "/api/platform-admin/audit": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateAuditLogDTO, errors, "PaginatedResponse<AuditLogDTO>");
    },
  },

  // ── Metrics ──
  "/api/metrics/slo": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be object" }); return; }
      if (hasField(body, "slos")) {
        validateArrayField(body, "slos", (item, errs, pfx) => {
          validateStringField(item, "name", true, errs, pfx);
          validateNumberField(item, "targetPct", true, errs, pfx);
          validateNumberField(item, "currentPct", true, errs, pfx);
          validateEnumField(item, "window", ["7d", "30d", "90d"], true, errs, pfx);
          validateEnumField(item, "status", ["healthy", "at_risk", "breached"], true, errs, pfx);
        }, true, errors, "SLODefinitionListResponse");
      }
    },
  },

  // ── Product Matching ──
  "/api/product-matching/config": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be ProductMatchConfigDTO" }); return; }
      validateStringField(body, "id", true, errors, "ProductMatchConfigDTO");
      validateNumberField(body, "threshold", true, errors, "ProductMatchConfigDTO");
      validateEnumField(body, "algorithm", ["fuzzy", "exact", "semantic"], true, errors, "ProductMatchConfigDTO");
      validateStringField(body, "companySlug", true, errors, "ProductMatchConfigDTO");
    },
  },

  // ── Settings ──
  "/api/settings": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be object" }); return; }
    },
  },

  // ── Onboarding ──
  "/api/onboarding": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be object" }); return; }
      if (hasField(body, "steps")) {
        validateArrayField(body, "steps", (item, errs, pfx) => {
          validateStringField(item, "id", true, errs, pfx);
          validateStringField(item, "title", true, errs, pfx);
          validateNumberField(item, "order", true, errs, pfx);
          validateBooleanField(item, "isCompleted", true, errs, pfx);
        }, true, errors, "OnboardingStepListResponse");
      }
    },
  },
};

// ── Generic Fallback Validator ────────────────────────────────────────────────

function validateGenericResponse(body: unknown, errors: ContractError[]): void {
  if (!isObject(body)) {
    errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be object" });
    return;
  }
  // Basic shape check: should have at least one meaningful field
  if (Object.keys(body).length === 0) {
    errors.push({ path: "root", expected: "non-empty object", actual: "empty object", message: "Response is empty object" });
  }
  // If no error field and no known contract, the response must have some
  // indication of what it represents. Warn if it has no documented structure.
  if (!hasField(body, "ok") && !hasField(body, "data") && !hasField(body, "error") && !hasField(body, "status")) {
    errors.push({ path: "root", expected: "contract-compliant object", actual: "unstructured object", message: "Response does not match any known contract pattern (AuthResult, PaginatedResponse, ErrorResult, HealthCheckDTO)" });
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * validateContract — Validates a response body against the OpenAPI contract.
 *
 * @param path - API route path (e.g., "/api/invoices")
 * @param method - HTTP method (e.g., "GET", "POST")
 * @param body - Response body to validate
 * @returns ContractValidationResult with ok/errors/warnings
 */
export function validateContract(
  path: string,
  method: string,
  body: unknown,
): ContractValidationResult {
  const errors: ContractError[] = [];
  const warnings: string[] = [];

  const methodLower = method.toLowerCase();
  const routeValidators = ROUTE_VALIDATORS[path];

  // If response has an error field, validate as ErrorResult — error responses
  // are valid for ANY route, regardless of the route-specific contract.
  if (isObject(body) && hasField(body, "error")) {
    validateErrorResult(body, errors, "ErrorResult");
  } else if (routeValidators && routeValidators[methodLower]) {
    routeValidators[methodLower](body, errors);
  } else {
    // Use generic validator for routes without specific contract definitions
    validateGenericResponse(body, errors);
    warnings.push(`No specific contract validator for ${method} ${path} — using generic validation`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * ContractValidator — Builder pattern for contract test assertions.
 *
 * Usage:
 *   new ContractValidator("/api/invoices", "GET")
 *     .expectRequired("data", "total", "page", "hasMore")
 *     .expectArray("data")
 *     .expectNumber("total")
 *     .validate(responseBody);
 */
export class ContractValidator {
  private path: string;
  private method: string;
  private requiredFields: string[] = [];
  private typeChecks: Array<{ field: string; type: string }> = [];

  constructor(path: string, method: string) {
    this.path = path;
    this.method = method;
  }

  expectRequired(...fields: string[]): this {
    this.requiredFields.push(...fields);
    return this;
  }

  expectArray(field: string): this {
    this.typeChecks.push({ field, type: "array" });
    return this;
  }

  expectNumber(field: string): this {
    this.typeChecks.push({ field, type: "number" });
    return this;
  }

  expectString(field: string): this {
    this.typeChecks.push({ field, type: "string" });
    return this;
  }

  expectBoolean(field: string): this {
    this.typeChecks.push({ field, type: "boolean" });
    return this;
  }

  validate(body: unknown): ContractValidationResult {
    const errors: ContractError[] = [];
    const warnings: string[] = [];

    // First, run the built-in contract validator
    const baseResult = validateContract(this.path, this.method, body);
    errors.push(...baseResult.errors);
    warnings.push(...baseResult.warnings);

    // Then, run custom builder expectations
    if (!isObject(body)) {
      return { ok: false, errors, warnings };
    }

    for (const field of this.requiredFields) {
      if (!hasField(body, field)) {
        errors.push({ path: `.${field}`, expected: "required field", actual: "undefined", message: `Required field '${field}' is missing` });
      }
    }

    for (const { field, type } of this.typeChecks) {
      if (!hasField(body, field)) continue; // Already caught by required check
      const actualType = Array.isArray(body[field]) ? "array" : typeof body[field];
      if (actualType !== type) {
        errors.push({ path: `.${field}`, expected: type, actual: actualType, message: `Field '${field}' should be ${type}, got ${actualType}` });
      }
    }

    return { ok: errors.length === 0, errors, warnings };
  }
}

/**
 * assertContract — Test assertion helper.
 * Throws with a descriptive message if contract validation fails.
 */
export function assertContract(path: string, method: string, body: unknown): void {
  const result = validateContract(path, method, body);
  if (!result.ok) {
    const errorMessages = result.errors.map((e) => `  ${e.path}: ${e.message} (expected: ${e.expected}, actual: ${e.actual})`).join("\n");
    throw new Error(`Contract violation for ${method} ${path}:\n${errorMessages}`);
  }
}
