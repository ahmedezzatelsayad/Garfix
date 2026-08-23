/**
 * P2 Typed Prisma — regression tests for bugs surfaced by switching from
 * `db: any` to `dbTyped` in 5 security-critical lib files.
 *
 * The whole point of P2 is: every place that used `db: any` was hiding real
 * production bugs. Each fix below documents a bug that was actually caught
 * by the typed client and verifies the fix stays in place.
 *
 * These tests are STATIC (no DB) — they verify the source code patterns
 * rather than runtime behavior, because the schema-vs-DB drift on the
 * broader codebase means we can't run an actual Prisma query against
 * every model in CI yet.
 */

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

function readSrc(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

function liveLines(src: string): string[] {
  // Strip /* */ block comments and // line comments before pattern matching,
  // so that references inside comments don't count as live code.
  const noBlocks = src.replace(/\/\*[\s\S]*?\*\//g, "");
  return noBlocks
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .filter((l) => l.trim().length > 0);
}

describe("P2 Typed Prisma — migration invariants", () => {
  it("auth.ts imports dbTyped (not the untyped db)", () => {
    const src = readSrc("auth.ts");
    expect(src).toContain('import { dbTyped as db } from "@/lib/db";');
    expect(src).not.toMatch(/^import { db } from "@\/lib\/db";/m);
  });

  it("observatory.ts imports dbTyped (not the untyped db)", () => {
    const src = readSrc("observatory.ts");
    expect(src).toContain('import { dbTyped as db } from "@/lib/db";');
  });

  it("tamperAudit.ts imports dbTyped (not the untyped db)", () => {
    const src = readSrc("tamperAudit.ts");
    expect(src).toContain('import { dbTyped as db } from "@/lib/db";');
  });

  it("webhooks.ts imports dbTyped (not the untyped db)", () => {
    const src = readSrc("webhooks.ts");
    expect(src).toContain('import { dbTyped as db } from "@/lib/db";');
  });

  it("ai-provisioning.ts imports dbTyped (not the untyped db)", () => {
    const src = readSrc("services/ai-provisioning.ts");
    // P2 relaxation: يقبل الاستيراد مع رموز إضافية (withTenantTx) — المهم أنه
    // dbTyped وليس الـ db غير المُنمّط.
    expect(src).toMatch(/import\s*\{[^}]*dbTyped\s+as\s+db[^}]*\}\s*from\s*['"]@\/lib\/db['"]/);
  });
});

describe("P2 Typed Prisma — production bugs fixed", () => {
  it("tamperAudit.ts: ChainEntry fields are nullable (matching schema)", () => {
    // Schema declares contentHash/prevHash/chainOrder/entryId as nullable
    // (String? / Int?). The previous ChainEntry interface declared them as
    // non-nullable strings/numbers, which let verifyChain() do
    //   entry.prevHash.substring(0, 12)
    // without a null check — NPE on any legacy row with a null prevHash.
    const src = readSrc("tamperAudit.ts");
    expect(src).toMatch(/entryId:\s*string \| null/);
    expect(src).toMatch(/contentHash:\s*string \| null/);
    expect(src).toMatch(/prevHash:\s*string \| null/);
    expect(src).toMatch(/chainOrder:\s*number \| null/);
  });

  it("tamperAudit.ts: lastEntry.chainOrder uses nullish coalescing (no silent null+1=1)", () => {
    // Before: `const chainOrder = lastEntry ? lastEntry.chainOrder + 1 : 0;`
    // If lastEntry existed but chainOrder was null (legacy row), this
    // evaluated to `null + 1 = 1` — silent corruption of the chain order.
    // After: `(lastEntry?.chainOrder ?? -1) + 1` → null becomes -1, +1 = 0.
    const src = readSrc("tamperAudit.ts");
    expect(src).toContain("(lastEntry?.chainOrder ?? -1) + 1");
    expect(src).toContain('lastEntry?.contentHash ?? "GENESIS"');
  });

  it("tamperAudit.ts: verifyChain handles null prevHash/contentHash as tamper evidence", () => {
    // A null prevHash on a non-genesis row is itself evidence of tampering
    // or legacy data — we now treat it as a chain break, not an NPE.
    const src = readSrc("tamperAudit.ts");
    expect(src).toContain('const entryPrev = entry.prevHash ?? "";');
    expect(src).toMatch(/entry\.contentHash == null/);
  });

  it("webhooks.ts: db.webhookDelivery.create sets the required `event` field", () => {
    // Schema: WebhookDelivery.event is NOT NULL.
    // Previous code only set `eventType` (the optional library-only field)
    // and omitted `event` entirely — every create would throw at runtime.
    // Fix: set BOTH (event for the schema constraint, eventType for the
    // X-Garfix-Event header at delivery time).
    const src = readSrc("webhooks.ts");
    const lines = liveLines(src);
    const createBlock = lines.find((l) => l.includes("event: payload.event"));
    expect(createBlock).toBeDefined();
    const eventTypeBlock = lines.find((l) =>
      l.includes("eventType: payload.event"),
    );
    expect(eventTypeBlock).toBeDefined();
  });

  it("webhooks.ts: X-Garfix-Event header coalesces null eventType to event", () => {
    // eventType is `string | null` in schema. Headers can't accept null.
    // Before: `delivery.eventType` directly — TS error + runtime would
    // set the header to "null" string. After: coalesce to the always-
    // non-null `event` field.
    const src = readSrc("webhooks.ts");
    expect(src).toContain(
      '"X-Garfix-Event": delivery.event ?? delivery.eventType ?? ""',
    );
  });

  it("ai-provisioning.ts: uses db.platformSettings (plural) — not platformSetting", () => {
    // Prisma auto-generates `db.platformSettings` from model `PlatformSettings`.
    // The previous `db.platformSetting` (singular) was undefined at runtime —
    // every platform settings lookup silently threw.
    const src = readSrc("services/ai-provisioning.ts");
    expect(src).toMatch(/db\.platformSettings\.findUnique/);
    expect(src).toMatch(/db\.platformSettings\.upsert/);
    expect(src).not.toMatch(/db\.platformSetting\./);
  });

  it("ai-provisioning.ts: admin role check uses db.appUser (not db.user)", () => {
    // Schema model is `AppUser` → accessor `db.appUser`. The previous
    // `db.user` was undefined at runtime, meaning the admin role check
    // silently never executed — leaving the platform API key update
    // unguarded.
    const src = readSrc("services/ai-provisioning.ts");
    expect(src).toMatch(/db\.appUser\.findUnique/);
    expect(src).not.toMatch(/db\.user\.findUnique/);
  });

  it("ai-provisioning.ts: appUser lookup uses `uid` (the @id field), not `id`", () => {
    // Schema: AppUser.uid is the @id field. The previous code queried
    // by `id` (which doesn't exist) — Prisma would have thrown at runtime
    // or silently returned null (depending on the any-typed vs typed path).
    const src = readSrc("services/ai-provisioning.ts");
    expect(src).toMatch(/where:\s*\{\s*uid:\s*adminUserId\s*\}/);
    expect(src).not.toMatch(/where:\s*\{\s*id:\s*adminUserId\s*\}/);
  });

  it("ai-provisioning.ts: CompanyAIConfig create uses <feature>Enabled (schema field names)", () => {
    // Schema fields: chatEnabled / parseEnabled / invoiceEnabled / memoryEnabled.
    // Previous code wrote enableChat / enableSmartParse / enableInvoiceExtraction
    // / enableMemory — keys that don't exist on the schema, silently ignored
    // by the any-typed db. Net effect: features were left DISABLED even after
    // provisioning claimed to enable them.
    const src = readSrc("services/ai-provisioning.ts");
    expect(src).toMatch(/chatEnabled:\s*true/);
    expect(src).toMatch(/parseEnabled:\s*true/);
    expect(src).toMatch(/invoiceEnabled:\s*true/);
    expect(src).toMatch(/memoryEnabled:\s*true/);
    expect(src).not.toMatch(/enableChat:/);
    expect(src).not.toMatch(/enableSmartParse:/);
    expect(src).not.toMatch(/enableInvoiceExtraction:/);
    expect(src).not.toMatch(/enableMemory:/);
  });

  it("ai-provisioning.ts: platformSettings.upsert create does not pass nonexistent `isPublic` column", () => {
    // Schema: PlatformSettings has no `isPublic` column. Previous code
    // passed `isPublic: false` in the create payload — Prisma's any-typed
    // path silently dropped it; the typed path errors.
    const src = readSrc("services/ai-provisioning.ts");
    // Make sure isPublic is NOT in any live create payload (comments OK).
    const lines = liveLines(src);
    const liveIsPublic = lines.find((l) => l.includes("isPublic:"));
    expect(liveIsPublic).toBeUndefined();
  });
});

describe("P2 Typed Prisma — graduated migration discipline", () => {
  it("db.ts keeps dbTyped export available for new code", () => {
    const src = readSrc("db.ts");
    expect(src).toMatch(/export const dbTyped/);
  });

  it("db.ts keeps dbAsAny escape hatch for documented exceptions only", () => {
    const src = readSrc("db.ts");
    // P2: النوع رُقّي من any إلى unknown (أكثر أماناً) — نقبل كليهما.
    expect(src).toMatch(/export const dbAsAny:\s*(any|unknown)/);
  });

  it("db.ts retains the graduated-migration commentary (so future agents don't re-introduce any)", () => {
    const src = readSrc("db.ts");
    expect(src).toContain("P1-4 (Typed PrismaClient)");
    expect(src).toContain("graduated");
  });
});

describe("P2-Reconciliation — schema.prisma aligned with actual DB", () => {
  it("schema.prisma has the reconciliation marker comment", () => {
    // The apply-reconciliation-patches.py script inserts this comment header
    // before each block of added columns. If it's gone, the reconciliation
    // was reverted.
    const schema = readFileSync(
      resolve(import.meta.dir, "../../../prisma/schema.prisma"),
      "utf8",
    );
    expect(schema).toContain("P2-Reconciliation");
  });

  it("PlatformSettings model has the `valueType` column (was missing pre-reconciliation)", () => {
    // DB has `valueType TEXT NOT NULL DEFAULT 'string'` but schema.prisma
    // didn't declare it. The reconciliation script should have added it.
    const schema = readFileSync(
      resolve(import.meta.dir, "../../../prisma/schema.prisma"),
      "utf8",
    );
    const modelMatch = schema.match(
      /model\s+PlatformSettings\s*\{([^}]+)\}/,
    );
    expect(modelMatch).not.toBeNull();
    const body = modelMatch![1];
    expect(body).toMatch(/valueType\s+String/);
  });

  it("ProductMatchAudit model has the `tier` column (was missing pre-reconciliation)", () => {
    // DB has `tier TEXT NOT NULL` but schema.prisma declared `matchTier`
    // (which doesn't exist in DB). The reconciliation should have added `tier`
    // alongside (we don't remove matchTier — that's a separate cleanup).
    const schema = readFileSync(
      resolve(import.meta.dir, "../../../prisma/schema.prisma"),
      "utf8",
    );
    const modelMatch = schema.match(
      /model\s+ProductMatchAudit\s*\{([^}]+)\}/,
    );
    expect(modelMatch).not.toBeNull();
    const body = modelMatch![1];
    expect(body).toMatch(/tier\s+String/);
  });

  it("ai-provisioning.ts: platformSettings.create passes the required `valueType` field", () => {
    // After reconciliation, `valueType` is NOT NULL in schema. The previous
    // create call would now throw a TS error. Verify the fix is in place.
    const src = readSrc("services/ai-provisioning.ts");
    expect(src).toMatch(/valueType:\s*['"]string['"]/);
  });
});

describe("P2-Sprint-3 — additional file migrations post-reconciliation", () => {
  // After schema reconciliation (adding 223 missing columns to schema.prisma),
  // 11 additional files became safe to migrate from `db: any` to `dbTyped`.
  // These tests verify those migrations stay in place.

  const migratedFiles = [
    "src/app/api/accounting/accountant-access/route.ts",
    "src/app/api/accounting/bank-transfer/route.ts",
    "src/app/api/accounting/tax-filing/route.ts",
    "src/app/api/accounting/vouchers/route.ts",
    "src/app/api/feature-flags/route.ts",
    "src/app/api/invoice-templates/[id]/route.ts",
    "src/app/api/platform-admin/ai-providers/route.ts",
    "src/app/api/product-matching/review/route.ts",
    "src/lib/ai/costOptimizer.ts",
    "src/lib/integrations/registry.ts",
  ];

  for (const file of migratedFiles) {
    it(`${file} imports dbTyped (not the untyped db)`, () => {
      const abs = resolve(import.meta.dir, "../../../", file);
      const src = readFileSync(abs, "utf8");
      // Allow either single or double quote style
      const hasDbTyped =
        src.includes('import { dbTyped as db } from "@/lib/db"') ||
        src.includes("import { dbTyped as db } from '@/lib/db'");
      expect(hasDbTyped).toBe(true);
    });
  }
});

// ─── P2-Sprint-4 — subscription-engine + payment + inter-company migrations ───
describe("P2-Sprint-4 — subscription-engine + payment + inter-company migrations", () => {
  // These files were migrated after fixing the SubscriptionSchedule,
  // PaymentTransaction, RefundTransaction, and InterCompanyTransaction
  // schemas to match the actual DB + code expectations.

  const migratedFiles = [
    "src/lib/billing/subscription-engine.ts",
    "src/app/api/saas/payments/callback/route.ts",
    "src/app/api/saas/payments/initiate/route.ts",
    "src/app/api/saas/payments/route.ts",
    "src/lib/e-invoicing/retention.ts",
    "src/app/api/accounting/inter-company/route.ts",
    "src/app/api/accounting/inter-company/[id]/settle/route.ts",
    "src/lib/integrations/myfatoorah-webhook.ts",
  ];

  for (const file of migratedFiles) {
    it(`${file} imports dbTyped (not the untyped db)`, () => {
      const abs = resolve(import.meta.dir, "../../../", file);
      const src = readFileSync(abs, "utf8");
      // P2 relaxation: يقبل الاستيراد مع رموز إضافية (مثل withTenantTx) — المهم
      // أنه dbTyped وليس الـ db غير المُنمّط.
      const hasDbTyped = /import\s*\{[^}]*dbTyped\s+as\s+db[^}]*\}\s*from\s*['"]@\/lib\/db['"]/.test(src);
      expect(hasDbTyped).toBe(true);
    });
  }

  // ── Schema alignment regression tests ──

  it("SubscriptionSchedule schema has billingCycle (not billingPeriod)", () => {
    const schema = readFileSync(resolve(import.meta.dir, "../../../prisma/schema.prisma"), "utf8");
    expect(schema).toContain("billingCycle");
    expect(schema).not.toContain("billingPeriod =");
  });

  it("SubscriptionSchedule schema has nextBillingDate (not nextChargeDate)", () => {
    const schema = readFileSync(resolve(import.meta.dir, "../../../prisma/schema.prisma"), "utf8");
    expect(schema).toContain("nextBillingDate");
  });

  it("SubscriptionSchedule schema has dunning fields (retryCount, maxRetries, downgradePlan)", () => {
    const schema = readFileSync(resolve(import.meta.dir, "../../../prisma/schema.prisma"), "utf8");
    const ssBlock = schema.match(/model SubscriptionSchedule \{[\s\S]*?\}/)?.[0] || "";
    expect(ssBlock).toContain("retryCount");
    expect(ssBlock).toContain("maxRetries");
    expect(ssBlock).toContain("downgradePlan");
    expect(ssBlock).toContain("provider");
    expect(ssBlock).toContain("paymentMethod");
  });

  it("PaymentTransaction schema has provider tracking fields", () => {
    const schema = readFileSync(resolve(import.meta.dir, "../../../prisma/schema.prisma"), "utf8");
    const ptBlock = schema.match(/model PaymentTransaction \{[\s\S]*?\}/)?.[0] || "";
    expect(ptBlock).toContain("providerPaymentId");
    expect(ptBlock).toContain("providerOrderId");
    expect(ptBlock).toContain("checkoutUrl");
    expect(ptBlock).toContain("failureReason");
    expect(ptBlock).toContain("metadata");
  });

  it("RefundTransaction schema has paymentTransactionId + providerRefundId", () => {
    const schema = readFileSync(resolve(import.meta.dir, "../../../prisma/schema.prisma"), "utf8");
    const rtBlock = schema.match(/model RefundTransaction \{[\s\S]*?\}/)?.[0] || "";
    expect(rtBlock).toContain("paymentTransactionId");
    expect(rtBlock).toContain("providerRefundId");
    expect(rtBlock).toContain("processedAt");
  });

  it("InterCompanyTransaction schema uses companySlugFrom/To (not fromCompanyId/toCompanyId)", () => {
    const schema = readFileSync(resolve(import.meta.dir, "../../../prisma/schema.prisma"), "utf8");
    const ictBlock = schema.match(/model InterCompanyTransaction \{[\s\S]*?\}/)?.[0] || "";
    expect(ictBlock).toContain("companySlugFrom");
    expect(ictBlock).toContain("companySlugTo");
    expect(ictBlock).not.toContain("fromCompanyId");
    expect(ictBlock).not.toContain("toCompanyId");
  });

  it("JournalEntry schema has sourceType + sourceId (String, not Int)", () => {
    const schema = readFileSync(resolve(import.meta.dir, "../../../prisma/schema.prisma"), "utf8");
    const jeBlock = schema.match(/model JournalEntry \{[\s\S]*?\}/)?.[0] || "";
    expect(jeBlock).toContain("sourceType");
    expect(jeBlock).toContain("sourceId");
    // sourceId should be String? (not Int?) — cuid-based polymorphic FK
    expect(jeBlock).toMatch(/sourceId\s+String\?/);
  });

  it("subscription-engine.ts uses billingCycle (DB field name) not billingPeriod in Prisma calls", () => {
    const src = readSrc("billing/subscription-engine.ts");
    // In create/update data, the code should use billingCycle (the DB column name)
    expect(src).toContain("billingCycle: billingPeriod");
    expect(src).toContain("nextBillingDate");
    // The Prisma field 'billingCycle' should appear in create/update data blocks.
    // The old code used 'billingPeriod' as the Prisma field name (which doesn't exist in DB).
    // Now only the local variable / interface property keeps the name 'billingPeriod'.
    expect(src).toContain("billingCycle: schedule.billingCycle");
  });

  it("inter-company settle route does NOT parseInt the transactionId (it's a cuid string)", () => {
    const src = readSrc("../app/api/accounting/inter-company/[id]/settle/route.ts");
    // The old code did `parseInt(id, 10)` which would break with cuid string IDs
    expect(src).not.toContain("parseInt(id, 10)");
  });

  it("migration file 20260805020000_add_subscription_dunning_fields exists", () => {
    const migration = readFileSync(
      resolve(import.meta.dir, "../../../prisma/migrations/20260805020000_add_subscription_dunning_fields/migration.sql"),
      "utf8"
    );
    expect(migration).toContain("subscription_schedules");
    expect(migration).toContain("payment_transactions");
    expect(migration).toContain("refund_transactions");
    expect(migration).toContain("inter_company_transactions");
    expect(migration).toContain("currentBillingCycleEnd");
  });
});
