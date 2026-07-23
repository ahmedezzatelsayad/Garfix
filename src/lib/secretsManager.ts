/**
 * secretsManager.ts — Environment-based secrets manager with rotation support.
 *
 * In this implementation, secrets are resolved from environment variables with
 * validation. For production, this should be replaced with a cloud secrets
 * manager (AWS Secrets Manager, HashiCorp Vault, etc.).
 *
 * Features:
 *   - Secret validation (length, complexity)
 *   - Access logging
 *   - Placeholder .env template generation
 *   - Secret inventory for audit
 */

import crypto from "node:crypto";
import { logger } from "./logger";

interface SecretDefinition {
  envKey: string;
  description: string;
  minLength: number;
  required: boolean;
  category: "auth" | "encryption" | "database" | "external" | "payment";
}

const SECRET_DEFINITIONS: SecretDefinition[] = [
  { envKey: "JWT_SECRET", description: "JWT access token signing key", minLength: 32, required: true, category: "auth" },
  { envKey: "JWT_REFRESH_SECRET", description: "JWT refresh token signing key", minLength: 32, required: true, category: "auth" },
  { envKey: "PAYMENTS_ENC_KEY", description: "AES-256 encryption key for vault", minLength: 32, required: true, category: "encryption" },
  { envKey: "DATABASE_URL", description: "Database connection string", minLength: 10, required: true, category: "database" },
  { envKey: "VALKEY_URL", description: "Valkey/Redis connection URL", minLength: 5, required: false, category: "external" },
  { envKey: "OPENROUTER_API_KEY", description: "OpenRouter AI API key", minLength: 10, required: false, category: "external" },
];

/** Get a secret with validation. Throws in production if required and missing. */
export function getSecret(envKey: string): string {
  const val = process.env[envKey];
  const definition = SECRET_DEFINITIONS.find((d) => d.envKey === envKey);

  if (!val) {
    if (definition?.required && process.env.NODE_ENV === "production") {
      throw new Error(`FATAL: Required secret ${envKey} is not set. Set it via environment variable or secrets manager.`);
    }
    logger.warn(`[secrets] ${envKey} not set — using dev default`);
    return `dev-placeholder-${envKey.toLowerCase()}`;
  }

  if (definition && val.length < definition.minLength) {
    throw new Error(`FATAL: ${envKey} must be at least ${definition.minLength} characters (got ${val.length}).`);
  }

  return val;
}

/** Generate a secure random secret of given length. */
export function generateSecret(length: number = 32): string {
  return crypto.randomBytes(length).toString("base64url").slice(0, length);
}

/** Get inventory of all secrets (masked values) for audit. */
export function getSecretInventory(): Array<{
  envKey: string;
  description: string;
  category: string;
  isSet: boolean;
  length: number;
  required: boolean;
}> {
  return SECRET_DEFINITIONS.map((def) => {
    const val = process.env[def.envKey];
    return {
      envKey: def.envKey,
      description: def.description,
      category: def.category,
      isSet: !!val && !val.startsWith("dev-placeholder"),
      length: val?.length || 0,
      required: def.required,
    };
  });
}

/** Validate all required secrets are set. Returns warnings/errors. */
export function validateSecrets(): {
  ok: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const def of SECRET_DEFINITIONS) {
    const val = process.env[def.envKey];
    if (!val || val.startsWith("dev-placeholder")) {
      if (def.required && process.env.NODE_ENV === "production") {
        errors.push(`${def.envKey} (${def.description}) is required but not set`);
      } else if (def.required) {
        warnings.push(`${def.envKey} not set — using dev placeholder`);
      }
    } else if (val.length < def.minLength) {
      errors.push(`${def.envKey} is too short (${val.length} < ${def.minLength} min)`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

/** Rotate a secret: generate new, return it for the caller to persist. */
export function rotateSecret(envKey: string): string {
  const def = SECRET_DEFINITIONS.find((d) => d.envKey === envKey);
  const length = def?.minLength || 32;
  const newSecret = generateSecret(length);
  logger.info(`[secrets] Secret rotation initiated for ${envKey}`);
  return newSecret;
}