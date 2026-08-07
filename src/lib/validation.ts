/**
 * validation.ts — shared Zod validators for entity IDs.
 *
 * P0-10 (Engineering Audit): All GarfiX entity IDs (Account, Client,
 * Supplier, BankAccount, JournalEntry, …) are stored as String cuids
 * in the Prisma schema. However, many API routes validated incoming
 * IDs as `z.number().int()`, causing runtime 500s when the validated
 * number was passed to Prisma queries that expect a string.
 *
 * To preserve backward compatibility with API consumers that still
 * send numbers (e.g. legacy mobile clients, integration tests), these
 * helpers ACCEPT both string and number and TRANSFORM to string.
 */
import { z } from "zod";

/**
 * Zod schema for a Prisma cuid-style entity ID.
 *
 * Accepts:
 *   - string  (e.g. "clxxxxxxxxxxxxxxx")  — preferred
 *   - number  (e.g. 5)                    — accepted for backward compat
 *
 * Always transforms to string so downstream Prisma calls receive the
 * correct type.
 */
export const entityId = z
  .union([z.string().min(1), z.number().int()])
  .transform(String);

/**
 * Same as entityId but optional (for nullable FK columns).
 */
export const entityIdOptional = z
  .union([z.string().min(1), z.number().int()])
  .transform(String)
  .optional();

/**
 * Same as entityId but nullable (for fields that may be null).
 */
export const entityIdNullable = z
  .union([z.string().min(1), z.number().int(), z.null()])
  .transform((v) => (v === null ? null : String(v)))
  .optional()
  .nullable();
