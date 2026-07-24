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

// ── Route-Specific Validators ────────────────────────────────────────────────

const ROUTE_VALIDATORS: Record<string, Record<string, (body: unknown, errors: ContractError[]) => void>> = {
  "/api/health": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be object" }); return; }
      validateHealthCheckDTO(body, errors, "HealthCheckDTO");
    },
  },
  "/api/auth/login": {
    post: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be object" }); return; }
      validateBooleanField(body, "ok", true, errors, "AuthResult");
      if (body.ok && isObject(body.user)) {
        validateUserDTO(body.user, errors, "AuthResult.user");
      }
    },
  },
  "/api/accounting/journal-entries": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be PaginatedResponse" }); return; }
      validateArrayField(body, "data", validateVoucherDTO, true, errors, "PaginatedResponse<VoucherDTO>");
      validateNumberField(body, "total", true, errors, "PaginatedResponse");
      validateNumberField(body, "page", true, errors, "PaginatedResponse");
      validateBooleanField(body, "hasMore", true, errors, "PaginatedResponse");
    },
  },
  "/api/invoices": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be PaginatedResponse" }); return; }
      validateArrayField(body, "data", validateInvoiceDTO, true, errors, "PaginatedResponse<InvoiceDTO>");
      validateNumberField(body, "total", true, errors, "PaginatedResponse");
      validateBooleanField(body, "hasMore", true, errors, "PaginatedResponse");
    },
  },
  "/api/companies": {
    get: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be PaginatedResponse" }); return; }
      validateArrayField(body, "data", validateCompanyDTO, true, errors, "PaginatedResponse<CompanyDTO>");
      validateNumberField(body, "total", true, errors, "PaginatedResponse");
    },
  },
  "/api/ai/agents": {
    post: (body, errors) => {
      if (!isObject(body)) { errors.push({ path: "root", expected: "object", actual: typeof body, message: "Response must be AIResponseDTO" }); return; }
      validateAIResponseDTO(body, errors, "AIResponseDTO");
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
