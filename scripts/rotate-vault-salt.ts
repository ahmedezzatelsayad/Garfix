/**
 * scripts/rotate-vault-salt.ts — VAULT_SALT rotation script (SEC-02 / Appendix D)
 *
 * Phase 0 T2: Rotates the crypto vault salt from the legacy hardcoded
 * "garfix-vault-salt" to a new random salt. Re-encrypts ALL stored secrets
 * (API keys, WhatsApp tokens, e-invoicing credentials, payment provider
 * keys) within a single $transaction for atomicity.
 *
 * SAFETY:
 *   --dry-run (default): Shows what would be rotated WITHOUT writing anything.
 *   --execute:           Performs the actual rotation inside a $transaction.
 *   --rollback-log:      Writes a rollback log to docs/audits/vault-salt-rotation.log
 *                        containing the old encrypted values for manual restore.
 *
 * PREREQUISITE:
 *   1. Set VAULT_SALT=garfix-vault-salt in .env FIRST (backward compat —
 *      current secrets decrypt with the old salt).
 *   2. Run this script with --dry-run to preview.
 *   3. Run with --execute to perform the rotation.
 *   4. Update VAULT_SALT in .env to the new salt shown in the output.
 *   5. Restart the application.
 *
 * If anything goes wrong after --execute:
 *   - Restore VAULT_SALT=garfix-vault-salt in .env
 *   - Restart the app (old encrypted values are in the rollback log)
 *   - Run the script again with --restore-from-log=<path>
 *
 * Usage:
 *   bun run scripts/rotate-vault-salt.ts --dry-run
 *   bun run scripts/rotate-vault-salt.ts --execute --rollback-log
 *   bun run scripts/rotate-vault-salt.ts --restore-from-log=docs/audits/vault-salt-rotation.log
 */

import { randomBytes, scryptSync } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// ── Argument parsing ──────────────────────────────────────────────────
const args = process.argv.slice(2);
const isDryRun = !args.includes("--execute");
const wantRollbackLog = args.includes("--rollback-log");
const restoreArg = args.find((a) => a.startsWith("--restore-from-log="));
const restoreLogPath = restoreArg ? restoreArg.split("=")[1] : null;

if (isDryRun && !restoreLogPath) {
  console.log("🔒 VAULT_SALT ROTATION — DRY RUN MODE\n");
  console.log("No changes will be written. Use --execute to perform the rotation.\n");
} else if (restoreLogPath) {
  console.log("🔄 VAULT_SALT ROTATION — RESTORE MODE\n");
} else {
  console.log("⚡ VAULT_SALT ROTATION — EXECUTE MODE\n");
  console.log("⚠️  This will re-encrypt ALL stored secrets. Ensure you have a backup.\n");
}

// ── Vault constants (must match src/lib/cryptoVault.ts) ──────────────
const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;
const SCRYPT_N = 16384;
const OLD_SALT = "garfix-vault-salt";

// ── Lazy imports (avoid loading cryptoVault before env is set) ────────
async function getPrismaClient() {
  const { dbTyped } = await import("../src/lib/db");
  return dbTyped;
}

async function getVaultFunctions() {
  return await import("../src/lib/cryptoVault");
}

// ── Key derivation (matches cryptoVault internals) ────────────────────
function deriveKey(passphrase: string, salt: string): Buffer {
  const saltBuffer = scryptSync(passphrase, salt, KEY_LEN, { N: SCRYPT_N }).slice(0, 16);
  return scryptSync(passphrase, saltBuffer, KEY_LEN, { N: SCRYPT_N });
}

function decryptWithKey(stored: string, key: Buffer): string {
  const [ivB64, tagB64, dataB64] = stored.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed encrypted value");
  }
  const crypto = require("node:crypto");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}

function encryptWithKey(plaintext: string, key: Buffer): string {
  const crypto = require("node:crypto");
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

function isLikelyEncrypted(value: string): boolean {
  return /^[A-Za-z0-9+/=]{16,}\.[A-Za-z0-9+/=]{22,}\.[A-Za-z0-9+/=]+$/.test(value);
}

// ── Find all encrypted-secret columns in the schema ──────────────────
// These are the tables/columns that store AES-256-GCM encrypted values
// (identified by the encryptSecret() calls in the codebase).
const SECRET_COLUMNS: Array<{ table: string; column: string; model: string }> = [
  { table: "company", column: "whatsappAppSecretEnc", model: "company" },
  { table: "company_ai_config", column: "apiKeyEnc", model: "companyAIConfig" },
  { table: "api_key_pool", column: "keyEnc", model: "apiKeyPool" },
  { table: "integration_configs", column: "configEnc", model: "integrationConfig" },
  { table: "e_invoice_receipts", column: "certificateEnc", model: "eInvoiceReceipt" },
  { table: "payment_provider_configs", column: "secretKeyEnc", model: "paymentProviderConfig" },
  { table: "whatsapp_templates", column: "tokenEnc", model: "whatsappTemplate" },
];

// ── Main rotation logic ───────────────────────────────────────────────
async function rotateSalt() {
  const db = await getPrismaClient();
  const currentPassphrase = process.env.PAYMENTS_ENC_KEY || process.env.VAULT_ENCRYPTION_KEY;
  if (!currentPassphrase) {
    throw new Error("PAYMENTS_ENC_KEY (or VAULT_ENCRYPTION_KEY) must be set");
  }

  // Generate new salt
  const newSalt = randomBytes(32).toString("hex");
  console.log(`📋 Current VAULT_SALT: ${OLD_SALT}`);
  console.log(`📋 New VAULT_SALT:     ${newSalt}\n`);

  const oldKey = deriveKey(currentPassphrase, OLD_SALT);
  const newKey = deriveKey(currentPassphrase, newSalt);

  // Scan all secret columns
  type SecretRecord = { table: string; column: string; id: string; oldValue: string; newValue: string; plaintext: string };
  const toRotate: SecretRecord[] = [];
  const alreadyNew: SecretRecord[] = [];
  const notEncrypted: SecretRecord[] = [];
  const failedDecrypt: Array<{ table: string; column: string; id: string; error: string }> = [];

  console.log("── Scanning secret columns ──");
  for (const { table, column, model } of SECRET_COLUMNS) {
    try {
      // Use $queryRaw to dynamically query each table/column
      const rows = await (db as unknown as {
        $queryRawUnsafe: (sql: string, ...params: unknown[]) => Promise<Array<{ id: string; value: string | null }>>;
      }).$queryRawUnsafe(`SELECT id, "${column}" AS value FROM "${table}" WHERE "${column}" IS NOT NULL`);

      console.log(`  ${table}.${column}: ${rows.length} rows`);

      for (const row of rows) {
        if (!row.value) continue;
        if (!isLikelyEncrypted(row.value)) {
          notEncrypted.push({ table, column, id: row.id, oldValue: row.value, newValue: "", plaintext: "" });
          continue;
        }
        try {
          const plaintext = decryptWithKey(row.value, oldKey);
          const newValue = encryptWithKey(plaintext, newKey);
          toRotate.push({ table, column, id: row.id, oldValue: row.value, newValue, plaintext: `[REDACTED ${plaintext.length} chars]` });
        } catch (err) {
          // Maybe already encrypted with the new salt?
          try {
            const plaintext = decryptWithKey(row.value, newKey);
            alreadyNew.push({ table, column, id: row.id, oldValue: row.value, newValue: row.value, plaintext: `[ALREADY NEW]` });
          } catch {
            failedDecrypt.push({ table, column, id: row.id, error: err instanceof Error ? err.message : String(err) });
          }
        }
      }
    } catch (err) {
      console.log(`  ⚠ ${table}.${column}: table not found or query failed — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`\n── Summary ──`);
  console.log(`  To rotate (old salt): ${toRotate.length}`);
  console.log(`  Already on new salt:  ${alreadyNew.length}`);
  console.log(`  Plaintext (legacy):   ${notEncrypted.length}`);
  console.log(`  Failed to decrypt:    ${failedDecrypt.length}`);

  if (failedDecrypt.length > 0) {
    console.log("\n⚠  Some secrets failed to decrypt with the old salt.");
    console.log("  These may be corrupted or encrypted with a different key.");
    failedDecrypt.slice(0, 5).forEach((f) => {
      console.log(`    ${f.table}.${f.column} [${f.id.slice(0, 8)}]: ${f.error.slice(0, 80)}`);
    });
  }

  if (isDryRun) {
    console.log("\n── Dry run complete — no changes written ──");
    console.log("\nTo execute the rotation:");
    console.log(`  bun run scripts/rotate-vault-salt.ts --execute --rollback-log`);
    console.log(`\nAfter execution, set VAULT_SALT=${newSalt} in your .env and restart.`);
    return;
  }

  // ── Execute mode: rotate inside a $transaction ──
  const rollbackLog: Array<{ table: string; column: string; id: string; oldValue: string }> = [];

  console.log("\n── Executing rotation inside $transaction ──");
  await (db as unknown as { $transaction: (fn: (tx: unknown) => Promise<void>) => Promise<void> }).$transaction(
    async (tx: unknown) => {
      const txDb = tx as {
        $executeRawUnsafe: (sql: string, ...params: unknown[]) => Promise<number>;
      };
      for (const rec of toRotate) {
        await txDb.$executeRawUnsafe(
          `UPDATE "${rec.table}" SET "${rec.column}" = $1 WHERE id = $2`,
          rec.newValue,
          rec.id,
        );
        rollbackLog.push({ table: rec.table, column: rec.column, id: rec.id, oldValue: rec.oldValue });
      }
    },
  );

  console.log(`✓ Rotated ${toRotate.length} secrets`);

  // Write rollback log
  if (wantRollbackLog) {
    const logDir = join(process.cwd(), "docs", "audits");
    if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
    const logPath = join(logDir, "vault-salt-rotation.log");
    const logContent = [
      `# VAULT_SALT Rotation Rollback Log`,
      `# Date: ${new Date().toISOString()}`,
      `# Old salt: ${OLD_SALT}`,
      `# New salt: ${newSalt}`,
      `# Secrets rotated: ${toRotate.length}`,
      ``,
      `# To rollback: set VAULT_SALT=${OLD_SALT} in .env, restart app, then run:`,
      `# bun run scripts/rotate-vault-salt.ts --restore-from-log=${logPath}`,
      ``,
      ...rollbackLog.map((r) => `${r.table}|${r.column}|${r.id}|${r.oldValue}`),
    ].join("\n");
    writeFileSync(logPath, logContent, "utf8");
    console.log(`✓ Rollback log written: ${logPath}`);
  }

  console.log(`\n✅ Rotation complete. Set VAULT_SALT=${newSalt} in your .env and restart.`);
}

// ── Restore logic ─────────────────────────────────────────────────────
async function restoreFromLog(logPath: string) {
  if (!existsSync(logPath)) {
    throw new Error(`Rollback log not found: ${logPath}`);
  }
  const db = await getPrismaClient();
  const lines = readFileSync(logPath, "utf8").split("\n").filter((l) => l && !l.startsWith("#"));
  console.log(`Restoring ${lines.length} secrets from ${logPath}...\n`);

  await (db as unknown as { $transaction: (fn: (tx: unknown) => Promise<void>) => Promise<void> }).$transaction(
    async (tx: unknown) => {
      const txDb = tx as { $executeRawUnsafe: (sql: string, ...params: unknown[]) => Promise<number> };
      for (const line of lines) {
        const [table, column, id, oldValue] = line.split("|");
        await txDb.$executeRawUnsafe(
          `UPDATE "${table}" SET "${column}" = $1 WHERE id = $2`,
          oldValue,
          id,
        );
        console.log(`  ✓ Restored ${table}.${column} [${id.slice(0, 8)}]`);
      }
    },
  );
  console.log(`\n✅ Restored ${lines.length} secrets. Set VAULT_SALT=garfix-vault-salt in .env and restart.`);
}

// ── Entry point ───────────────────────────────────────────────────────
async function main() {
  try {
    if (restoreLogPath) {
      await restoreFromLog(restoreLogPath);
    } else {
      await rotateSalt();
    }
    process.exit(0);
  } catch (err) {
    console.error("\n❌ Fatal:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
