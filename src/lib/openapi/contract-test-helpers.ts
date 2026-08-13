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
  validateStringArrayField(obj, "fatal", true, errors, prefix);
  validateStringArrayField(obj, "warnings", true, errors, prefix);
}

function validateAIProviderDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "name", true, errors, prefix);
  validateEnumField(obj, "provider", ["openai", "anthropic", "google", "deepseek", "openrouter"], true, errors, prefix);
  validateStringField(obj, "modelId", true, errors, prefix);
  validateBooleanField(obj, "isEnabled", true, errors, prefix);
}

// ── Sprint 3 Domain Validators ───────────────────────────────────────────────

function validatePerformanceDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "employeeId", true, errors, prefix);
  validateStringField(obj, "period", true, errors, prefix);
  validateEnumField(obj, "rating", ["excellent", "good", "average", "below_average", "poor"], true, errors, prefix);
  validateStringField(obj, "companySlug", true, errors, prefix);
}

function validateQuotationDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "number", true, errors, prefix);
  validateEnumField(obj, "status", ["draft", "sent", "accepted", "rejected", "expired"], true, errors, prefix);
  validateNumberField(obj, "total", true, errors, prefix);
  validateStringField(obj, "companySlug", true, errors, prefix);
}

function validatePurchaseOrderDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "number", true, errors, prefix);
  validateEnumField(obj, "status", ["draft", "approved", "received", "cancelled"], true, errors, prefix);
  validateNumberField(obj, "total", true, errors, prefix);
  validateStringField(obj, "companySlug", true, errors, prefix);
}

function validateInstallmentDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "invoiceId", true, errors, prefix);
  validateNumberField(obj, "amount", true, errors, prefix);
  validateStringField(obj, "dueDate", true, errors, prefix);
  validateEnumField(obj, "status", ["pending", "paid", "overdue"], true, errors, prefix);
}

function validatePostDatedCheckDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "checkNumber", true, errors, prefix);
  validateNumberField(obj, "amount", true, errors, prefix);
  validateStringField(obj, "dueDate", true, errors, prefix);
  validateEnumField(obj, "status", ["pending", "deposited", "cancelled", "cleared"], true, errors, prefix);
}

function validateProfitDistributionDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateNumberField(obj, "totalProfit", true, errors, prefix);
  validateNumberField(obj, "distributedAmount", true, errors, prefix);
  validateStringField(obj, "period", true, errors, prefix);
  validateStringField(obj, "companySlug", true, errors, prefix);
}

function validateBankReconciliationDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "bankAccountId", true, errors, prefix);
  validateStringField(obj, "period", true, errors, prefix);
  validateEnumField(obj, "status", ["draft", "in_progress", "completed"], true, errors, prefix);
  validateNumberField(obj, "matchedCount", true, errors, prefix);
}

function validateBankTransferDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "fromAccountId", true, errors, prefix);
  validateStringField(obj, "toAccountId", true, errors, prefix);
  validateNumberField(obj, "amount", true, errors, prefix);
  validateStringField(obj, "companySlug", true, errors, prefix);
}

function validateFixedAssetDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "name", true, errors, prefix);
  validateStringField(obj, "assetCode", true, errors, prefix);
  validateNumberField(obj, "purchaseCost", true, errors, prefix);
  validateStringField(obj, "companySlug", true, errors, prefix);
}

function validateFxRevaluationDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "currency", true, errors, prefix);
  validateNumberField(obj, "revaluationAmount", true, errors, prefix);
  validateStringField(obj, "companySlug", true, errors, prefix);
}

function validateDepreciationDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "assetId", true, errors, prefix);
  validateNumberField(obj, "amount", true, errors, prefix);
  validateStringField(obj, "period", true, errors, prefix);
  validateStringField(obj, "companySlug", true, errors, prefix);
}

function validateAssetDisposalDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "assetId", true, errors, prefix);
  validateNumberField(obj, "disposalAmount", true, errors, prefix);
  validateStringField(obj, "date", true, errors, prefix);
  validateStringField(obj, "companySlug", true, errors, prefix);
}

function validateOpeningBalanceDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "accountId", true, errors, prefix);
  validateNumberField(obj, "balance", true, errors, prefix);
  validateStringField(obj, "companySlug", true, errors, prefix);
}

function validateLandedCostDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "name", true, errors, prefix);
  validateNumberField(obj, "amount", true, errors, prefix);
  validateStringField(obj, "companySlug", true, errors, prefix);
}

function validateInterCompanyDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "fromCompany", true, errors, prefix);
  validateStringField(obj, "toCompany", true, errors, prefix);
  validateNumberField(obj, "amount", true, errors, prefix);
  validateStringField(obj, "companySlug", true, errors, prefix);
}

function validateLetterOfCreditDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "lcNumber", true, errors, prefix);
  validateNumberField(obj, "amount", true, errors, prefix);
  validateEnumField(obj, "status", ["draft", "issued", "confirmed", "expired"], true, errors, prefix);
  validateStringField(obj, "companySlug", true, errors, prefix);
}

function validateInventoryValuationDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "itemId", true, errors, prefix);
  validateNumberField(obj, "unitCost", true, errors, prefix);
  validateNumberField(obj, "totalValue", true, errors, prefix);
  validateStringField(obj, "companySlug", true, errors, prefix);
}

function validateWpsDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "companySlug", true, errors, prefix);
  validateStringField(obj, "period", true, errors, prefix);
  validateEnumField(obj, "status", ["draft", "submitted", "approved", "rejected"], true, errors, prefix);
}

function validateTaxFilingDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "period", true, errors, prefix);
  validateStringField(obj, "companySlug", true, errors, prefix);
  validateEnumField(obj, "status", ["draft", "submitted", "accepted", "rejected"], true, errors, prefix);
}

function validateConsolidationDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "period", true, errors, prefix);
  validateStringField(obj, "companySlug", true, errors, prefix);
}

function validateSaaSPaymentDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateNumberField(obj, "amount", true, errors, prefix);
  validateStringField(obj, "status", true, errors, prefix);
  validateStringField(obj, "companySlug", true, errors, prefix);
}

function validateSaaSUserDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "uid", true, errors, prefix);
  validateStringField(obj, "email", true, errors, prefix);
  validateStringField(obj, "role", true, errors, prefix);
}

function validateStorageObjectDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "key", true, errors, prefix);
  validateNumberField(obj, "size", true, errors, prefix);
  validateStringField(obj, "contentType", true, errors, prefix);
}

function validateWebhookDeliveryDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "endpointId", true, errors, prefix);
  validateEnumField(obj, "status", ["pending", "success", "failed"], true, errors, prefix);
  validateNumberField(obj, "attempts", true, errors, prefix);
}

function validateWebhookEventDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "type", true, errors, prefix);
  validateStringField(obj, "timestamp", true, errors, prefix);
}

function validateCatalogDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "name", true, errors, prefix);
  validateStringField(obj, "companySlug", true, errors, prefix);
}

function validatePermissionRoleDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "name", true, errors, prefix);
  validateStringArrayField(obj, "permissions", true, errors, prefix);
}

function validateFounderValidationDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateBooleanField(obj, "ok", true, errors, prefix);
  validateStringField(obj, "type", true, errors, prefix);
}

function validateAccountantAccessDTO(obj: Record<string, unknown>, errors: ContractError[], prefix: string): void {
  validateStringField(obj, "id", true, errors, prefix);
  validateStringField(obj, "accountantId", true, errors, prefix);
  validateStringField(obj, "companySlug", true, errors, prefix);
  validateEnumField(obj, "status", ["active", "revoked"], true, errors, prefix);
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

// ── Simple Object Validators (for financial reports and generic endpoints) ────

function validateFinancialReportResponse(body: unknown, errors: ContractError[]): void {
  if (!isObject(body)) {
    errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be object" });
    return;
  }
  // Financial reports have a status or ok/data pattern
  if (!hasField(body, "ok") && !hasField(body, "data") && !hasField(body, "status") && !hasField(body, "error")) {
    // At minimum, they should have some financial data fields
    const hasFinancialData = Object.keys(body).length > 0;
    if (!hasFinancialData) {
      errors.push({ path: "root", expected: "non-empty object", actual: "empty object", message: "Financial report response must have content" });
    }
  }
}

function validateMutationResponse(body: unknown, errors: ContractError[]): void {
  if (!isObject(body)) {
    errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be object" });
    return;
  }
  // Mutation responses typically have ok, data, or error
  if (!hasField(body, "ok") && !hasField(body, "data") && !hasField(body, "error") && !hasField(body, "status")) {
    errors.push({ path: "root", expected: "contract-compliant object", actual: "unstructured object", message: "Mutation response does not match any known contract pattern (ok, data, error, status)" });
  }
}

function validateOkResponse(body: unknown, errors: ContractError[]): void {
  if (!isObject(body)) {
    errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be object" });
    return;
  }
  validateBooleanField(body, "ok", true, errors, "OkResponse");
}

// ── Route-Specific Validators ────────────────────────────────────────────────

const ROUTE_VALIDATORS: Record<string, Record<string, (body: unknown, errors: ContractError[]) => void>> = {
  // ── Root ──
  "/api": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be object" }); return; }
      validateStringField(body, "version", true, errors, "APIRoot");
      validateStringField(body, "name", true, errors, "APIRoot");
    },
  },
  "/api/docs": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be object" }); return; }
    },
  },

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
  "/api/auth/logout": {
    post: (body, errors) => {
      validateOkResponse(body, errors);
    },
  },
  "/api/auth/refresh": {
    post: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be AuthResult" }); return; }
      validateBooleanField(body, "ok", true, errors, "AuthResult");
    },
  },
  "/api/auth/forgot-password": {
    post: (body, errors) => {
      validateOkResponse(body, errors);
    },
  },
  "/api/auth/reset-password": {
    post: (body, errors) => {
      validateOkResponse(body, errors);
    },
  },
  "/api/auth/csrf": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be object" }); return; }
      validateStringField(body, "token", true, errors, "CsrfResponse");
    },
  },
  "/api/auth/change-password": {
    post: (body, errors) => {
      validateOkResponse(body, errors);
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
    post: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be object" }); return; }
      validateVoucherDTO(body, errors, "VoucherDTO");
    },
  },
  "/api/accounting/journal-entries/{id}": {
    delete: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/journal-entries/{id}/reverse": {
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/accounts": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateAccountDTO, errors, "PaginatedResponse<AccountDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/accounts/{id}": {
    delete: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/fiscal-periods": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateFinancialPeriodDTO, errors, "PaginatedResponse<FinancialPeriodDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/fiscal-periods/{id}": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be FinancialPeriodDTO" }); return; }
      validateFinancialPeriodDTO(body, errors, "FinancialPeriodDTO");
    },
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
    delete: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/fiscal-periods/{id}/close": {
    post: (body, errors) => {
      validateOkResponse(body, errors);
    },
  },
  "/api/accounting/fiscal-periods/{id}/reopen": {
    post: (body, errors) => {
      validateOkResponse(body, errors);
    },
  },
  "/api/accounting/vouchers": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateVoucherDTO, errors, "PaginatedResponse<VoucherDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/vouchers/{id}": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be VoucherDTO" }); return; }
      validateVoucherDTO(body, errors, "VoucherDTO");
    },
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/vouchers/{id}/approve": {
    post: (body, errors) => {
      validateOkResponse(body, errors);
    },
  },
  "/api/accounting/vouchers/{id}/cancel": {
    post: (body, errors) => {
      validateOkResponse(body, errors);
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
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/bank-accounts/{id}": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be object" }); return; }
      validateNumberField(body, "id", true, errors, "BankAccountDTO");
      validateStringField(body, "name", true, errors, "BankAccountDTO");
    },
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
    delete: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/bank-transfer": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateBankTransferDTO, errors, "PaginatedResponse<BankTransferDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/bank-import": {
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/bank-reconciliation": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateBankReconciliationDTO, errors, "PaginatedResponse<BankReconciliationDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/bank-reconciliation/complete": {
    post: (body, errors) => {
      validateOkResponse(body, errors);
    },
  },
  "/api/accounting/bank-reconciliation/{id}": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be BankReconciliationDTO" }); return; }
      validateBankReconciliationDTO(body, errors, "BankReconciliationDTO");
    },
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/bank-reconciliation/{id}/match": {
    post: (body, errors) => {
      validateMutationResponse(body, errors);
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
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/budgets/{id}/approve": {
    post: (body, errors) => {
      validateOkResponse(body, errors);
    },
  },
  "/api/accounting/budgets/{id}/revise": {
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/budget-vs-actual": {
    get: (body, errors) => {
      validateFinancialReportResponse(body, errors);
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
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/cost-centers/{id}": {
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
    delete: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/payroll": {
    get: (body, errors) => {
      validatePaginatedResponse(body, (item, errs, pfx) => {
        validateStringField(item, "id", true, errs, pfx);
        validateStringField(item, "companySlug", true, errs, pfx);
      }, errors, "PaginatedResponse");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/wps": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateWpsDTO, errors, "PaginatedResponse<WpsDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/wps/{id}": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be WpsDTO" }); return; }
      validateWpsDTO(body, errors, "WpsDTO");
    },
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/wps/{id}/download": {
    get: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/wps/{id}/submit": {
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/tax-filing": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateTaxFilingDTO, errors, "PaginatedResponse<TaxFilingDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/tax-filing/{id}": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be TaxFilingDTO" }); return; }
      validateTaxFilingDTO(body, errors, "TaxFilingDTO");
    },
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/fixed-assets": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateFixedAssetDTO, errors, "PaginatedResponse<FixedAssetDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/fixed-assets/{id}": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be FixedAssetDTO" }); return; }
      validateFixedAssetDTO(body, errors, "FixedAssetDTO");
    },
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/landed-cost": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateLandedCostDTO, errors, "PaginatedResponse<LandedCostDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/landed-cost/{id}": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be LandedCostDTO" }); return; }
      validateLandedCostDTO(body, errors, "LandedCostDTO");
    },
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
    delete: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/inter-company": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateInterCompanyDTO, errors, "PaginatedResponse<InterCompanyDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/inter-company/{id}": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be InterCompanyDTO" }); return; }
      validateInterCompanyDTO(body, errors, "InterCompanyDTO");
    },
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/inter-company/{id}/settle": {
    post: (body, errors) => {
      validateOkResponse(body, errors);
    },
  },
  "/api/accounting/letters-of-credit": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateLetterOfCreditDTO, errors, "PaginatedResponse<LetterOfCreditDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/letters-of-credit/{id}": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be LetterOfCreditDTO" }); return; }
      validateLetterOfCreditDTO(body, errors, "LetterOfCreditDTO");
    },
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
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
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/commissions/{id}/post-as-journal-entry": {
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/accounting-audit": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateAuditLogDTO, errors, "PaginatedResponse<AuditLogDTO>");
    },
  },
  "/api/accounting/profit-loss": {
    get: (body, errors) => {
      validateFinancialReportResponse(body, errors);
    },
  },
  "/api/accounting/balance-sheet": {
    get: (body, errors) => {
      validateFinancialReportResponse(body, errors);
    },
  },
  "/api/accounting/cash-flow": {
    get: (body, errors) => {
      validateFinancialReportResponse(body, errors);
    },
  },
  "/api/accounting/trial-balance": {
    get: (body, errors) => {
      validateFinancialReportResponse(body, errors);
    },
  },
  "/api/accounting/aging": {
    get: (body, errors) => {
      validateFinancialReportResponse(body, errors);
    },
  },
  "/api/accounting/dashboard": {
    get: (body, errors) => {
      validateFinancialReportResponse(body, errors);
    },
  },
  "/api/accounting/financial-dashboard": {
    get: (body, errors) => {
      validateFinancialReportResponse(body, errors);
    },
  },
  "/api/accounting/depreciation": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateDepreciationDTO, errors, "PaginatedResponse<DepreciationDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/asset-disposals": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateAssetDisposalDTO, errors, "PaginatedResponse<AssetDisposalDTO>");
    },
  },
  "/api/accounting/export-excel": {
    get: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/filing-reminders": {
    get: (body, errors) => {
      validateFinancialReportResponse(body, errors);
    },
  },
  "/api/accounting/client-statement": {
    get: (body, errors) => {
      validateFinancialReportResponse(body, errors);
    },
  },
  "/api/accounting/supplier-statement": {
    get: (body, errors) => {
      validateFinancialReportResponse(body, errors);
    },
  },
  "/api/accounting/period-comparison": {
    get: (body, errors) => {
      validateFinancialReportResponse(body, errors);
    },
  },
  "/api/accounting/opening-balances": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateOpeningBalanceDTO, errors, "PaginatedResponse<OpeningBalanceDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/opening-balances/post": {
    post: (body, errors) => {
      validateOkResponse(body, errors);
    },
  },
  "/api/accounting/installments": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateInstallmentDTO, errors, "PaginatedResponse<InstallmentDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/post-dated-checks": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validatePostDatedCheckDTO, errors, "PaginatedResponse<PostDatedCheckDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/post-dated-checks/{id}": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be PostDatedCheckDTO" }); return; }
      validatePostDatedCheckDTO(body, errors, "PostDatedCheckDTO");
    },
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/post-dated-checks/{id}/cancel": {
    post: (body, errors) => {
      validateOkResponse(body, errors);
    },
  },
  "/api/accounting/post-dated-checks/{id}/deposit": {
    post: (body, errors) => {
      validateOkResponse(body, errors);
    },
  },
  "/api/accounting/profit-distribution": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateProfitDistributionDTO, errors, "PaginatedResponse<ProfitDistributionDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/profit-distribution/{id}/post-as-journal-entry": {
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/quotations": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateQuotationDTO, errors, "PaginatedResponse<QuotationDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/quotations/{id}": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be QuotationDTO" }); return; }
      validateQuotationDTO(body, errors, "QuotationDTO");
    },
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
    delete: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/quotations/{id}/convert-to-invoice": {
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/purchase-orders": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validatePurchaseOrderDTO, errors, "PaginatedResponse<PurchaseOrderDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/purchase-orders/{id}": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be PurchaseOrderDTO" }); return; }
      validatePurchaseOrderDTO(body, errors, "PurchaseOrderDTO");
    },
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/consolidation": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateConsolidationDTO, errors, "PaginatedResponse<ConsolidationDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/fx-revaluation": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateFxRevaluationDTO, errors, "PaginatedResponse<FxRevaluationDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/fx-revaluation/{id}": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be FxRevaluationDTO" }); return; }
      validateFxRevaluationDTO(body, errors, "FxRevaluationDTO");
    },
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/inventory-valuation": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateInventoryValuationDTO, errors, "PaginatedResponse<InventoryValuationDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/initiate-payment": {
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/verify-payment": {
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/retention-check": {
    get: (body, errors) => {
      validateFinancialReportResponse(body, errors);
    },
  },
  "/api/accounting/accountant-access": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateAccountantAccessDTO, errors, "PaginatedResponse<AccountantAccessDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
    delete: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/accounting/accountant-access/{id}/revoke": {
    post: (body, errors) => {
      validateOkResponse(body, errors);
    },
  },

  // ── Invoices ──
  "/api/invoices": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateInvoiceDTO, errors, "PaginatedResponse<InvoiceDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/invoices/{id}": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be InvoiceDTO" }); return; }
      validateInvoiceDTO(body, errors, "InvoiceDTO");
    },
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
    delete: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/invoices/{id}/payment": {
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/invoices/{id}/status": {
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/invoice-templates": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateInvoiceTemplateDTO, errors, "PaginatedResponse<InvoiceTemplateDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/invoice-templates/{id}": {
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
    delete: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },

  // ── Clients ──
  "/api/clients": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateClientDTO, errors, "PaginatedResponse<ClientDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/clients/{id}": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be ClientDTO" }); return; }
      validateClientDTO(body, errors, "ClientDTO");
    },
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
    delete: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/clients/{id}/profile": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be object" }); return; }
      validateStringField(body, "clientId", true, errors, "ClientProfileDTO");
      validateStringField(body, "companySlug", true, errors, "ClientProfileDTO");
    },
  },

  // ── Company ──
  "/api/companies": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateCompanyDTO, errors, "PaginatedResponse<CompanyDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/companies/{slug}": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be CompanyDTO" }); return; }
      validateCompanyDTO(body, errors, "CompanyDTO");
    },
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
    delete: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/companies/{slug}/members": {
    get: (body, errors) => {
      validatePaginatedResponse(body, (item, errs, pfx) => {
        validateStringField(item, "uid", true, errs, pfx);
        validateStringField(item, "email", true, errs, pfx);
        validateStringField(item, "role", true, errs, pfx);
      }, errors, "PaginatedResponse<CompanyMemberDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/companies/{slug}/members/{uid}": {
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
    delete: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },

  // ── HR ──
  "/api/hr/employees": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateEmployeeDTO, errors, "PaginatedResponse<EmployeeDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/hr/employees/{id}": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be EmployeeDTO" }); return; }
      validateEmployeeDTO(body, errors, "EmployeeDTO");
    },
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
    delete: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/hr/attendance": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateAttendanceDTO, errors, "PaginatedResponse<AttendanceDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/hr/attendance/{id}": {
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
    delete: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/hr/salaries": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateSalaryDTO, errors, "PaginatedResponse<SalaryDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/hr/salaries/{id}": {
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
    delete: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/hr/leaves": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateLeaveRequestDTO, errors, "PaginatedResponse<LeaveRequestDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/hr/leaves/{id}": {
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
    delete: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/hr/commissions": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateCommissionDTO, errors, "PaginatedResponse<CommissionDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/hr/commissions/{id}": {
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
    delete: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/hr/gratuity": {
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/hr/performance": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validatePerformanceDTO, errors, "PaginatedResponse<PerformanceDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/hr/performance/{id}": {
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
    delete: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },

  // ── Inventory ──
  "/api/inventory/items": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateInventoryItemDTO, errors, "PaginatedResponse<InventoryItemDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/inventory/warehouses": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateWarehouseDTO, errors, "PaginatedResponse<WarehouseDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/inventory/warehouses/{id}": {
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
    delete: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/inventory/movements": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateStockMovementDTO, errors, "PaginatedResponse<StockMovementDTO>");
    },
  },

  // ── AI ──
  "/api/ai/agents": {
    get: (body, errors) => {
      validatePaginatedResponse(body, (item, errs, pfx) => {
        validateStringField(item, "id", true, errs, pfx);
        validateStringField(item, "name", true, errs, pfx);
        validateEnumField(item, "type", ["ocr", "matching", "financial_analysis", "chat", "whatsapp"], true, errs, pfx);
        validateBooleanField(item, "isActive", true, errs, pfx);
      }, errors, "PaginatedResponse<AIAgentDTO>");
    },
    post: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be AIResponseDTO" }); return; }
      validateAIResponseDTO(body, errors, "AIResponseDTO");
    },
  },
  "/api/ai/chat": {
    get: (body, errors) => {
      validatePaginatedResponse(body, (item, errs, pfx) => {
        validateStringField(item, "id", true, errs, pfx);
        validateStringField(item, "input", true, errs, pfx);
        validateStringField(item, "response", true, errs, pfx);
        validateStringField(item, "createdAt", true, errs, pfx);
      }, errors, "PaginatedResponse<AIChatDTO>");
    },
    post: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be AIResponseDTO" }); return; }
      validateAIResponseDTO(body, errors, "AIResponseDTO");
    },
  },
  "/api/ai/chat/stream": {
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/ai/parse-image": {
    post: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be AIResponseDTO" }); return; }
      validateAIResponseDTO(body, errors, "AIResponseDTO");
    },
  },
  "/api/ai/parse-file": {
    post: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be AIResponseDTO" }); return; }
      validateAIResponseDTO(body, errors, "AIResponseDTO");
    },
  },
  "/api/ai/smart-parse": {
    post: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be AIResponseDTO" }); return; }
      validateAIResponseDTO(body, errors, "AIResponseDTO");
    },
  },
  "/api/ai/invoice-brain/extract": {
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/ai/invoice-brain/stats": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be object" }); return; }
      validateNumberField(body, "totalProcessed", true, errors, "InvoiceBrainStats");
      validateNumberField(body, "successRate", true, errors, "InvoiceBrainStats");
    },
  },
  "/api/ai/memory": {
    get: (body, errors) => {
      validatePaginatedResponse(body, (item, errs, pfx) => {
        validateStringField(item, "id", true, errs, pfx);
        validateStringField(item, "query", true, errs, pfx);
        validateStringField(item, "response", true, errs, pfx);
      }, errors, "PaginatedResponse<AIMemoryDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/ai/memory/{id}": {
    delete: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/ai/bulk-import": {
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/ai/tools": {
    post: (body, errors) => {
      validateMutationResponse(body, errors);
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
      if (hasField(body, "notifications")) {
        validateArrayField(body, "notifications", validateNotificationDTO, true, errors, "NotificationListResponse");
      } else if (Array.isArray(body)) {
        (body as  Record<string, unknown>[]).forEach((item, i) => {
          if (isObject(item)) validateNotificationDTO(item, errors, `NotificationDTO[${i}]`);
        });
      }
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
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
    post: (body, errors) => {
      validateMutationResponse(body, errors);
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
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/purchases/{id}": {
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
    delete: (body, errors) => {
      validateMutationResponse(body, errors);
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
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/automation/{id}": {
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
    delete: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/automation/{id}/logs": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateAuditLogDTO, errors, "PaginatedResponse<AuditLogDTO>");
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
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/webhooks/endpoints/{id}": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be WebhookEndpointDTO" }); return; }
      validateStringField(body, "id", true, errors, "WebhookEndpointDTO");
      validateStringField(body, "url", true, errors, "WebhookEndpointDTO");
      validateBooleanField(body, "isActive", true, errors, "WebhookEndpointDTO");
    },
    put: (body, errors) => {
      validateMutationResponse(body, errors);
    },
    delete: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/webhooks/deliveries": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateWebhookDeliveryDTO, errors, "PaginatedResponse<WebhookDeliveryDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/webhooks/events": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateWebhookEventDTO, errors, "PaginatedResponse<WebhookEventDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/webhooks/whatsapp": {
    get: (body, errors) => {
      validateMutationResponse(body, errors);
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
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
  "/api/platform-admin/tenants/{slug}": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be PlatformTenantDTO" }); return; }
      validatePlatformTenantDTO(body, errors, "PlatformTenantDTO");
    },
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
    delete: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/platform-admin/feature-flags": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validatePlatformFeatureFlagDTO, errors, "PaginatedResponse<PlatformFeatureFlagDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/platform-admin/feature-flags/{id}": {
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
    delete: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/platform-admin/announcements": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateAnnouncementDTO, errors, "PaginatedResponse<AnnouncementDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/platform-admin/announcements/{id}": {
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
    delete: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/platform-admin/tickets": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateTicketDTO, errors, "PaginatedResponse<TicketDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/platform-admin/tickets/{id}": {
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/platform-admin/tickets/{id}/replies": {
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/platform-admin/audit": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateAuditLogDTO, errors, "PaginatedResponse<AuditLogDTO>");
    },
  },
  "/api/platform-admin/ai-usage": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be object" }); return; }
      validateNumberField(body, "totalCost", true, errors, "AIUsageDTO");
      validateNumberField(body, "totalRequests", true, errors, "AIUsageDTO");
      validateStringField(body, "period", true, errors, "AIUsageDTO");
    },
  },
  "/api/platform-admin/ai-providers": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateAIProviderDTO, errors, "PaginatedResponse<AIProviderDTO>");
    },
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/platform-admin/ai-orchestration": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be object" }); return; }
      validateStringField(body, "strategy", true, errors, "AIOrchestrationDTO");
      validateBooleanField(body, "autoFallback", true, errors, "AIOrchestrationDTO");
    },
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/platform-admin/ai-orchestration/run-benchmark": {
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/platform-admin/integrations": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be object" }); return; }
      validateStringField(body, "provider", true, errors, "IntegrationDTO");
      validateBooleanField(body, "isEnabled", true, errors, "IntegrationDTO");
    },
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/platform-admin/review-queue": {
    get: (body, errors) => {
      validatePaginatedResponse(body, (item, errs, pfx) => {
        validateStringField(item, "id", true, errs, pfx);
        validateStringField(item, "type", true, errs, pfx);
        validateEnumField(item, "status", ["pending", "approved", "rejected"], true, errs, pfx);
      }, errors, "PaginatedResponse<ReviewQueueItemDTO>");
    },
  },
  "/api/platform-admin/queue-failures": {
    get: (body, errors) => {
      validatePaginatedResponse(body, (item, errs, pfx) => {
        validateStringField(item, "id", true, errs, pfx);
        validateStringField(item, "queueName", true, errs, pfx);
        validateStringField(item, "error", true, errs, pfx);
        validateStringField(item, "createdAt", true, errs, pfx);
      }, errors, "PaginatedResponse<QueueFailureDTO>");
    },
  },
  "/api/platform-admin/retention-cleanup": {
    post: (body, errors) => {
      validateOkResponse(body, errors);
    },
  },
  "/api/platform-admin/landing-content": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be object" }); return; }
    },
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },

  // ── Metrics ──
  "/api/metrics": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be object" }); return; }
      if (hasField(body, "metrics")) {
        validateArrayField(body, "metrics", validateMetricPointDTO, true, errors, "MetricsResponse");
      }
    },
  },
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
  "/api/metrics/observability": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be object" }); return; }
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
    put: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/product-matching/confirm": {
    post: (body, errors) => {
      validateOkResponse(body, errors);
    },
  },
  "/api/product-matching/match-override": {
    get: (body, errors) => {
      validatePaginatedResponse(body, (item, errs, pfx) => {
        validateStringField(item, "id", true, errs, pfx);
        validateStringField(item, "originalProduct", true, errs, pfx);
        validateStringField(item, "matchedProduct", true, errs, pfx);
      }, errors, "PaginatedResponse<MatchOverrideDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/product-matching/review": {
    get: (body, errors) => {
      validatePaginatedResponse(body, (item, errs, pfx) => {
        validateStringField(item, "id", true, errs, pfx);
        validateStringField(item, "invoiceLine", true, errs, pfx);
        validateStringField(item, "matchedProduct", true, errs, pfx);
        validateEnumField(item, "status", ["pending", "confirmed", "rejected"], true, errs, pfx);
      }, errors, "PaginatedResponse<ProductMatchReviewDTO>");
    },
  },
  "/api/product-matching/undo": {
    post: (body, errors) => {
      validateOkResponse(body, errors);
    },
  },

  // ── Settings ──
  "/api/settings": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be object" }); return; }
    },
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
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
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },

  // ── Catalog ──
  "/api/catalog": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateCatalogDTO, errors, "PaginatedResponse<CatalogDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/catalog/{id}": {
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
    delete: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },

  // ── SaaS ──
  "/api/saas/payments": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateSaaSPaymentDTO, errors, "PaginatedResponse<SaaSPaymentDTO>");
    },
  },
  "/api/saas/payments/callback": {
    get: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/saas/payments/initiate": {
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/saas/users": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validateSaaSUserDTO, errors, "PaginatedResponse<SaaSUserDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/saas/users/{uid}": {
    patch: (body, errors) => {
      validateMutationResponse(body, errors);
    },
    delete: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },

  // ── Permissions ──
  "/api/permissions/catalog": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be object" }); return; }
    },
  },
  "/api/permissions/check": {
    post: (body, errors) => {
      validateOkResponse(body, errors);
    },
  },
  "/api/permissions/roles": {
    get: (body, errors) => {
      validatePaginatedResponse(body, validatePermissionRoleDTO, errors, "PaginatedResponse<PermissionRoleDTO>");
    },
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
    put: (body, errors) => {
      validateMutationResponse(body, errors);
    },
    delete: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },

  // ── Founder Panel ──
  "/api/founder-panel/mission-control": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be object" }); return; }
      validateBooleanField(body, "ok", true, errors, "MissionControlDTO");
    },
  },
  "/api/founder-panel/finops": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be object" }); return; }
      validateNumberField(body, "totalCost", true, errors, "FinOpsDTO");
      validateNumberField(body, "totalRevenue", true, errors, "FinOpsDTO");
    },
  },
  "/api/founder-panel/ai-fabric": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be object" }); return; }
      validateNumberField(body, "totalRequests", true, errors, "AiFabricDTO");
      validateNumberField(body, "avgLatencyMs", true, errors, "AiFabricDTO");
    },
  },

  // ── Founder Validation ──
  "/api/founder-validation": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be FounderValidationDTO" }); return; }
      validateFounderValidationDTO(body, errors, "FounderValidationDTO");
    },
    post: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be FounderValidationDTO" }); return; }
      validateFounderValidationDTO(body, errors, "FounderValidationDTO");
    },
  },
  "/api/founder-validation/ai-test": {
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/founder-validation/report": {
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },
  "/api/founder-validation/seed": {
    post: (body, errors) => {
      validateMutationResponse(body, errors);
    },
  },

  // ── Landing Content ──
  "/api/landing-content": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be object" }); return; }
    },
  },

  // ── Storage ──
  "/api/storage/{key}": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be StorageObjectDTO" }); return; }
      validateStorageObjectDTO(body, errors, "StorageObjectDTO");
    },
  },

  // ── Internal ──
  "/api/internal/ai-fabric/savings": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be object" }); return; }
      validateNumberField(body, "savingsUsd", true, errors, "AiFabricSavingsDTO");
      validateNumberField(body, "savingsPct", true, errors, "AiFabricSavingsDTO");
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
