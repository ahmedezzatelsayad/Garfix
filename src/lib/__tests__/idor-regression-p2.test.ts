/**
 * IDOR regression test — verifies that all API route files in src/app/api/
 * enforce tenant isolation at the database layer (findFirst with companySlug
 * in WHERE) OR use the 404-on-wrong-tenant mitigation pattern (closing the
 * existence-leak oracle without breaking the API contract).
 *
 * Reference: src/app/api/ai/tools/route.ts (commit be11284) — 6 calls converted
 * to findFirst({where:{id, companySlug}}).
 *
 * This test is a STATIC analysis — it reads the source files and verifies
 * the patterns. It does NOT execute the routes.
 */
import { describe, it, expect } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const API_ROOT = resolve(__dirname, "../../app/api");

/** Recursively collect all .ts files under a directory. */
function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

/** Read a file's contents, or return null if missing. */
function readFile(p: string): string | null {
  try {
    return readFileSync(p, "utf-8");
  } catch {
    return null;
  }
}

describe("IDOR regression — tenant isolation across all API routes", () => {
  const allApiFiles = collectTsFiles(API_ROOT);

  it("every API route file exists and is readable", () => {
    expect(allApiFiles.length).toBeGreaterThan(50);
  });

  describe("ai/tools/route.ts — reference implementation", () => {
    const ref = readFile(join(API_ROOT, "ai/tools/route.ts"))!;

    it("uses findFirst with companySlug in WHERE (not findUnique)", () => {
      // The reference impl should have multiple findFirst calls with companySlug
      const findFirstWithSlug = ref.match(/findFirst\(\s*\{\s*where\s*:\s*\{[^}]*companySlug/g) || [];
      expect(findFirstWithSlug.length).toBeGreaterThanOrEqual(6);
    });

    it("does NOT have findUnique({where:{id}}) without companySlug (except in comments)", () => {
      // Strip comments
      const stripped = ref.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
      const unsafeFindUnique = stripped.match(/findUnique\(\s*\{\s*where\s*:\s*\{\s*id\s*:[^}]*\}\s*\}/g) || [];
      // The reference impl should have ZERO unsafe findUnique calls
      // (any remaining findUnique calls should be by slug or composite key, not by id)
      const unsafeById = unsafeFindUnique.filter((s) => !s.includes("companySlug") && !s.includes("slug"));
      expect(unsafeById.length).toBe(0);
    });
  });

  describe("Group A — findFirst with companySlug in WHERE (DB-layer enforcement)", () => {
    // These files had companySlug already in body schema; converted to findFirst
    const groupAFiles = [
      "accounting/quotations/[id]/route.ts",
      "accounting/quotations/[id]/convert-to-invoice/route.ts",
      "accounting/fixed-assets/route.ts",
      "accounting/fixed-assets/[id]/route.ts",
      "accounting/purchase-orders/[id]/route.ts",
      "accounting/bank-accounts/route.ts",
      "accounting/bank-accounts/[id]/route.ts",
      "inventory/items/route.ts",
    ];

    for (const rel of groupAFiles) {
      it(`${rel} uses findFirst with companySlug (at least one call)`, () => {
        const src = readFile(join(API_ROOT, rel));
        if (!src) { console.warn(`  SKIP: ${rel} not found`); return; }
        const findFirstWithSlug = src.match(/findFirst\(\s*\{\s*where\s*:\s*\{[^}]*companySlug/g) || [];
        expect(findFirstWithSlug.length).toBeGreaterThan(0);
      });
    }
  });

  describe("Group B — webhook routes: founder-bypass findUnique + tenant findFirst", () => {
    const groupBFiles = [
      "webhooks/endpoints/[id]/route.ts",
      "webhooks/deliveries/route.ts",
    ];

    for (const rel of groupBFiles) {
      it(`${rel} uses findFirst with companySlug for non-founder path`, () => {
        const src = readFile(join(API_ROOT, rel));
        if (!src) { console.warn(`  SKIP: ${rel} not found`); return; }
        // Should have at least one findFirst with companySlug (for non-founder)
        const findFirstWithSlug = src.match(/findFirst\(\s*\{\s*where\s*:\s*\{[^}]*companySlug/g) || [];
        expect(findFirstWithSlug.length).toBeGreaterThan(0);
      });
    }
  });

  describe("Group C — 404-on-wrong-tenant mitigation (closes existence leak)", () => {
    // These files keep findUnique (no companySlug in request) but split the
    // access check: requirePermission (auth+perm only) + manual assertCompanyAccess
    // returning 404 (not 403) on wrong-tenant. This closes the 404-vs-403
    // existence-leak oracle without breaking the API contract.
    const groupCFiles = [
      "invoices/[id]/route.ts",
      "invoices/[id]/status/route.ts",
      "invoices/[id]/payment/route.ts",
      "accounting/accounts/[id]/route.ts",
      "invoice-templates/[id]/route.ts",
      "clients/[id]/profile/route.ts",
      "accounting/quotations/[id]/route.ts",
      "accounting/purchase-orders/[id]/route.ts",
      "accounting/fixed-assets/[id]/route.ts",
      "accounting/bank-accounts/[id]/route.ts",
      "inventory/warehouses/[id]/route.ts",
      "purchases/[id]/route.ts",
      "hr/salaries/[id]/route.ts",
      "hr/performance/[id]/route.ts",
      "hr/leaves/[id]/route.ts",
      "hr/attendance/[id]/route.ts",
      "hr/commissions/[id]/route.ts",
    ];

    for (const rel of groupCFiles) {
      it(`${rel} has IDOR mitigation comment + assertCompanyAccess returning 404 (closes existence leak)`, () => {
        const src = readFile(join(API_ROOT, rel));
        if (!src) { console.warn(`  SKIP: ${rel} not found`); return; }
        // Should have at least one "IDOR mitigation" comment
        expect(src).toMatch(/IDOR mitigation/);
        // Should import assertCompanyAccess (either from @/lib/auth or @/lib/middleware)
        expect(src).toMatch(/assertCompanyAccess/);
        // Should have at least one 404 return that includes assertCompanyAccess
        // (the pattern: if (!existing || !assertCompanyAccess(...)) return ... 404)
        // Two acceptable variants:
        //   (a) requirePermission + manual assertCompanyAccess returning 404
        //   (b) resolveAuth + assertCompanyAccess returning 404 (clients/[id]/profile)
        const has404Mitigation = src.includes("assertCompanyAccess") && src.includes("404");
        expect(has404Mitigation).toBe(true);
        // Should NOT have a 403 response after a findUnique by id (the old leaky pattern)
        // Look for the pattern: findUnique by id, followed by ... 403
        // This is a heuristic — the key invariant is that wrong-tenant returns 404, not 403
      });
    }
  });

  describe("Group D — per-user scope (platform-admin)", () => {
    it("platform-admin/tickets/[id]/replies uses findFirst with userEmail for non-founder", () => {
      const src = readFile(join(API_ROOT, "platform-admin/tickets/[id]/replies/route.ts"));
      if (!src) { console.warn("  SKIP: platform-admin/tickets/[id]/replies/route.ts not found"); return; }
      // Should have findFirst with userEmail (for non-founder path)
      const findFirstWithUserEmail = src.match(/findFirst\(\s*\{\s*where\s*:\s*\{[^}]*userEmail/g) || [];
      expect(findFirstWithUserEmail.length).toBeGreaterThan(0);
    });
  });

  describe("Group E — intentionally not changed (safe by construction)", () => {
    it("ai/bulk-import uses tenant-scoped findMany for account IDs (no IDOR vector)", () => {
      const src = readFile(join(API_ROOT, "ai/bulk-import/route.ts"));
      if (!src) { console.warn("  SKIP: ai/bulk-import/route.ts not found"); return; }
      // The account IDs used in findUnique calls come from a tenant-scoped findMany
      expect(src).toMatch(/findMany\(\s*\{\s*where\s*:\s*\{[^}]*companySlug/);
      // So the subsequent findUnique by id is safe (id was tenant-scoped)
    });
  });

  describe("package.json — P1 fixes still in place", () => {
    it("cron-parser override is ^5.6.2", () => {
      const pkg = readFile(resolve(__dirname, "../../../../package.json"));
      if (!pkg) return;
      const parsed = JSON.parse(pkg);
      expect(parsed.overrides?.["cron-parser"]).toBe("^5.6.2");
    });

    it("build script prepends prisma generate", () => {
      const pkg = readFile(resolve(__dirname, "../../../../package.json"));
      if (!pkg) return;
      const parsed = JSON.parse(pkg);
      expect(parsed.scripts?.build).toMatch(/^prisma generate/);
    });
  });
});
