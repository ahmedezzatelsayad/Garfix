#!/usr/bin/env bash
set -euo pipefail

DIR="/home/z/my-project/Garfix/src/lib/founder-validation/__tests__"
mkdir -p "$DIR"

echo "Generating 200 test files..."

# We'll use a heredoc per file category for maintainability

#####################################################################
# CATEGORY 1: seeder-edge-case-01..20.test.ts
#####################################################################

for i in $(seq -w 1 20); do
  case $i in
    01) topic="zero-seed";;
    02) topic="minimum-config";;
    03) topic="employee-integrity";;
    04) topic="client-supplier-integrity";;
    05) topic="product-category-integrity";;
    06) topic="invoice-integrity";;
    07) topic="warehouse-inventory-integrity";;
    08) topic="purchase-integrity";;
    09) topic="ai-data-integrity";;
    10) topic="cache-provider-integrity";;
    11) topic="date-generation";;
    12) topic="boundary-values";;
    13) topic="user-integrity";;
    14) topic="worker-history-integrity";;
    15) topic="default-config";;
    16) topic="determinism";;
    17) topic="line-item-calc";;
    18) topic="model-assignment";;
    19) topic="company-metadata";;
    20) topic="state-mutations";;
  esac
done

cat > "$DIR/seeder-edge-case-01.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { SeededRandom, seedEnterpriseData } from "../index";

describe("SeededRandom zero seed edge cases", () => {
  it("should produce deterministic output with seed 0", () => {
    const a = new SeededRandom(0);
    const b = new SeededRandom(0);
    for (let i = 0; i < 50; i++) expect(a.next()).toBe(b.next());
  });

  it("should produce values in [0,1) with seed 0", () => {
    const rng = new SeededRandom(0);
    for (let i = 0; i < 100; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("should generate consistent int ranges", () => {
    const rng = new SeededRandom(0);
    for (let i = 0; i < 50; i++) {
      const v = rng.int(5, 10);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(10);
    }
  });

  it("should produce consistent float ranges", () => {
    const rng = new SeededRandom(0);
    for (let i = 0; i < 50; i++) {
      const v = rng.float(10, 20);
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThan(20);
    }
  });

  it("should pick elements from arrays correctly", () => {
    const rng = new SeededRandom(0);
    const arr = ["a", "b", "c", "d"];
    for (let i = 0; i < 20; i++) expect(arr).toContain(rng.pick(arr));
  });

  it("should pickN unique elements", () => {
    const rng = new SeededRandom(42);
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const picked = rng.pickN(arr, 3);
    expect(picked).toHaveLength(3);
    expect(new Set(picked).size).toBe(3);
  });

  it("should clamp pickN to array length", () => {
    const rng = new SeededRandom(1);
    const picked = rng.pickN([1, 2, 3], 10);
    expect(picked).toHaveLength(3);
  });

  it("should shuffle preserving elements", () => {
    const rng = new SeededRandom(123);
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const copy = [...arr];
    rng.shuffle(arr);
    expect(arr.sort((a, b) => a - b)).toEqual(copy);
  });

  it("should produce boolean with approximate probability", () => {
    const rng = new SeededRandom(0);
    let trues = 0;
    for (let i = 0; i < 1000; i++) if (rng.bool(0.3)) trues++;
    expect(trues).toBeGreaterThan(200);
    expect(trues).toBeLessThan(500);
  });

  it("should handle weighted selection with one zero-weight item", () => {
    const rng = new SeededRandom(42);
    const items: [string, number][] = [["a", 1], ["b", 0]];
    for (let i = 0; i < 10; i++) expect(rng.weighted(items)).toBe("a");
  });
});
EOF

echo "  seeder-edge-case-01 done"

cat > "$DIR/seeder-edge-case-02.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { seedEnterpriseData } from "../index";

describe("Seeder minimum config (10 companies)", () => {
  it("should generate exactly 10 companies", () => {
    const companies = seedEnterpriseData({ companyCount: 10 });
    expect(companies).toHaveLength(10);
  });

  it("should assign unique IDs to each company", () => {
    const companies = seedEnterpriseData({ companyCount: 10 });
    expect(new Set(companies.map(c => c.id)).size).toBe(10);
  });

  it("should assign unique slugs", () => {
    const companies = seedEnterpriseData({ companyCount: 10 });
    expect(new Set(companies.map(c => c.slug)).size).toBe(10);
  });

  it("should have valid Arabic names", () => {
    const companies = seedEnterpriseData({ companyCount: 10 });
    for (const c of companies) expect(c.nameAr.length).toBeGreaterThan(0);
  });

  it("should have at least one user per company", () => {
    const companies = seedEnterpriseData({ companyCount: 10 });
    for (const c of companies) expect(c.users.length).toBeGreaterThanOrEqual(1);
  });

  it("should have valid Gulf currencies", () => {
    const valid = ["SAR","AED","KWD","BHD","OMR","QAR","EGP","JOD"];
    const companies = seedEnterpriseData({ companyCount: 10 });
    for (const c of companies) expect(valid).toContain(c.currency);
  });

  it("should have valid plan assignments", () => {
    const valid = ["trial","starter","business","enterprise"];
    const companies = seedEnterpriseData({ companyCount: 10 });
    for (const c of companies) expect(valid).toContain(c.plan);
  });

  it("should generate createdAt dates within range", () => {
    const s = new Date("2024-01-01"), e = new Date("2024-12-31");
    const companies = seedEnterpriseData({ companyCount: 10, startDate: s, endDate: e });
    for (const c of companies) {
      expect(c.createdAt.getTime()).toBeGreaterThanOrEqual(s.getTime());
      expect(c.createdAt.getTime()).toBeLessThanOrEqual(e.getTime());
    }
  });

  it("should have non-empty VAT numbers", () => {
    for (const c of seedEnterpriseData({ companyCount: 10 }))
      expect(c.vatNumber.length).toBeGreaterThan(0);
  });

  it("should have non-empty commercial registration", () => {
    for (const c of seedEnterpriseData({ companyCount: 10 }))
      expect(c.commercialRegistration.length).toBeGreaterThan(0);
  });
});
EOF

echo "  seeder-edge-case-02 done"

cat > "$DIR/seeder-edge-case-03.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { seedEnterpriseData } from "../index";

describe("Seeder employee relational integrity", () => {
  const companies = seedEnterpriseData({ companyCount: 10 });

  it("employees should belong to valid company slugs", () => {
    const slugs = new Set(companies.map(c => c.slug));
    for (const c of companies)
      for (const emp of c.employees) expect(slugs.has(emp.companySlug)).toBe(true);
  });

  it("employees should have valid statuses", () => {
    const valid = ["active", "inactive", "terminated"];
    for (const c of companies)
      for (const emp of c.employees) expect(valid).toContain(emp.status);
  });

  it("employees should have positive base salaries", () => {
    for (const c of companies)
      for (const emp of c.employees) expect(parseFloat(emp.baseSalary)).toBeGreaterThan(0);
  });

  it("employees should have valid departments", () => {
    for (const c of companies)
      for (const emp of c.employees) expect(emp.department.length).toBeGreaterThan(0);
  });

  it("employees should have Arabic and English names", () => {
    for (const c of companies)
      for (const emp of c.employees) {
        expect(emp.nameAr.length).toBeGreaterThan(0);
        expect(emp.nameEn.length).toBeGreaterThan(0);
      }
  });

  it("employees should have valid join dates", () => {
    for (const c of companies)
      for (const emp of c.employees) expect(new Date(emp.joinDate).getTime()).not.toBeNaN();
  });

  it("employee currency should match company currency", () => {
    for (const c of companies)
      for (const emp of c.employees) expect(emp.currency).toBe(c.currency);
  });
});
EOF

echo "  seeder-edge-case-03 done"

cat > "$DIR/seeder-edge-case-04.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { seedEnterpriseData } from "../index";

describe("Seeder client and supplier integrity", () => {
  const companies = seedEnterpriseData({ companyCount: 10 });

  it("clients should belong to their company slug", () => {
    for (const c of companies)
      for (const cl of c.clients) expect(cl.companySlug).toBe(c.slug);
  });

  it("suppliers should belong to their company slug", () => {
    for (const c of companies)
      for (const s of c.suppliers) expect(s.companySlug).toBe(c.slug);
  });

  it("client IDs should be unique within company", () => {
    for (const c of companies) {
      const ids = c.clients.map(cl => cl.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("supplier IDs should be unique within company", () => {
    for (const c of companies) {
      const ids = c.suppliers.map(s => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("client emails should contain @", () => {
    for (const c of companies)
      for (const cl of c.clients) expect(cl.email).toContain("@");
  });

  it("supplier countries should be non-empty", () => {
    for (const c of companies)
      for (const s of c.suppliers) expect(s.country.length).toBeGreaterThan(0);
  });

  it("clients should have Arabic names", () => {
    for (const c of companies)
      for (const cl of c.clients) expect(cl.nameAr.length).toBeGreaterThan(0);
  });

  it("suppliers should have Arabic names", () => {
    for (const c of companies)
      for (const s of c.suppliers) expect(s.nameAr.length).toBeGreaterThan(0);
  });
});
EOF

echo "  seeder-edge-case-04 done"

cat > "$DIR/seeder-edge-case-05.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { seedEnterpriseData } from "../index";

describe("Seeder product and category integrity", () => {
  const companies = seedEnterpriseData({ companyCount: 10 });

  it("products should reference valid category IDs", () => {
    for (const c of companies) {
      const catIds = new Set(c.categories.map(cat => cat.id));
      for (const p of c.products) expect(catIds.has(p.categoryId)).toBe(true);
    }
  });

  it("product codes should be unique within company", () => {
    for (const c of companies) {
      const codes = c.products.map(p => p.code);
      expect(new Set(codes).size).toBe(codes.length);
    }
  });

  it("selling price >= purchase price", () => {
    for (const c of companies)
      for (const p of c.products)
        expect(parseFloat(p.sellingPrice)).toBeGreaterThanOrEqual(parseFloat(p.purchasePrice));
  });

  it("wholesale price between purchase and selling", () => {
    for (const c of companies)
      for (const p of c.products) {
        const s = parseFloat(p.sellingPrice), b = parseFloat(p.purchasePrice);
        const w = parseFloat(p.wholesalePrice);
        expect(w).toBeGreaterThanOrEqual(b);
        expect(w).toBeLessThanOrEqual(s);
      }
  });

  it("categories should have Arabic and English names", () => {
    for (const c of companies)
      for (const cat of c.categories) {
        expect(cat.name.length).toBeGreaterThan(0);
        expect(cat.nameAr.length).toBeGreaterThan(0);
      }
  });

  it("product currency should match company currency", () => {
    for (const c of companies)
      for (const p of c.products) expect(p.currency).toBe(c.currency);
  });
});
EOF

echo "  seeder-edge-case-05 done"

cat > "$DIR/seeder-edge-case-06.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { seedEnterpriseData } from "../index";

describe("Seeder invoice integrity", () => {
  const companies = seedEnterpriseData({ companyCount: 10 });

  it("invoices should reference valid client IDs or null", () => {
    for (const c of companies) {
      const ids = new Set(c.clients.map(cl => cl.id));
      for (const inv of c.invoices)
        if (inv.clientId !== null) expect(ids.has(inv.clientId)).toBe(true);
    }
  });

  it("line items should reference valid product IDs", () => {
    for (const c of companies) {
      const pids = new Set(c.products.map(p => p.id));
      for (const inv of c.invoices)
        for (const li of inv.lineItems) expect(pids.has(li.productId)).toBe(true);
    }
  });

  it("invoice numbers should be unique within company", () => {
    for (const c of companies) {
      const nums = c.invoices.map(i => i.invoiceNumber);
      expect(new Set(nums).size).toBe(nums.length);
    }
  });

  it("invoice subtotal should match line item totals", () => {
    for (const c of companies)
      for (const inv of c.invoices) {
        const sum = inv.lineItems.reduce((s, li) => s + parseFloat(li.total), 0);
        expect(Math.abs(sum - parseFloat(inv.subtotal))).toBeLessThan(0.01);
      }
  });

  it("invoices should have valid statuses", () => {
    const valid = ["draft","sent","paid","partial","overdue","cancelled"];
    for (const c of companies)
      for (const inv of c.invoices) expect(valid).toContain(inv.status);
  });

  it("invoice currency should match company", () => {
    for (const c of companies)
      for (const inv of c.invoices) expect(inv.currency).toBe(c.currency);
  });

  it("line item quantity should be positive", () => {
    for (const c of companies)
      for (const inv of c.invoices)
        for (const li of inv.lineItems) expect(li.quantity).toBeGreaterThan(0);
  });
});
EOF

echo "  seeder-edge-case-06 done"

cat > "$DIR/seeder-edge-case-07.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { seedEnterpriseData } from "../index";

describe("Seeder warehouse and inventory integrity", () => {
  const companies = seedEnterpriseData({ companyCount: 10 });

  it("inventory should reference valid warehouse IDs", () => {
    for (const c of companies) {
      const wids = new Set(c.warehouses.map(w => w.id));
      for (const inv of c.inventory) expect(wids.has(inv.warehouseId)).toBe(true);
    }
  });

  it("inventory should reference valid product IDs", () => {
    for (const c of companies) {
      const pids = new Set(c.products.map(p => p.id));
      for (const inv of c.inventory) expect(pids.has(inv.productId)).toBe(true);
    }
  });

  it("warehouse codes should be unique within company", () => {
    for (const c of companies) {
      const codes = c.warehouses.map(w => w.code);
      expect(new Set(codes).size).toBe(codes.length);
    }
  });

  it("inventory quantity should be non-negative", () => {
    for (const c of companies)
      for (const inv of c.inventory) expect(inv.quantity).toBeGreaterThanOrEqual(0);
  });

  it("min quantity should be non-negative", () => {
    for (const c of companies)
      for (const inv of c.inventory) expect(inv.minQuantity).toBeGreaterThanOrEqual(0);
  });

  it("warehouses should have city and country", () => {
    for (const c of companies)
      for (const w of c.warehouses) {
        expect(w.city.length).toBeGreaterThan(0);
        expect(w.country.length).toBeGreaterThan(0);
      }
  });
});
EOF

echo "  seeder-edge-case-07 done"

cat > "$DIR/seeder-edge-case-08.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { seedEnterpriseData } from "../index";

describe("Seeder purchase integrity", () => {
  const companies = seedEnterpriseData({ companyCount: 10 });

  it("purchases should reference valid supplier IDs", () => {
    for (const c of companies) {
      const sids = new Set(c.suppliers.map(s => s.id));
      for (const p of c.purchases) expect(sids.has(p.supplierId)).toBe(true);
    }
  });

  it("purchase numbers should be unique within company", () => {
    for (const c of companies) {
      const nums = c.purchases.map(p => p.invoiceNumber);
      expect(new Set(nums).size).toBe(nums.length);
    }
  });

  it("purchase line items should reference valid products", () => {
    for (const c of companies) {
      const pids = new Set(c.products.map(p => p.id));
      for (const purch of c.purchases)
        for (const li of purch.lineItems) expect(pids.has(li.productId)).toBe(true);
    }
  });

  it("purchase total should match line items", () => {
    for (const c of companies)
      for (const purch of c.purchases) {
        const sum = purch.lineItems.reduce((s, li) => s + parseFloat(li.total), 0);
        expect(Math.abs(sum - parseFloat(purch.subtotal))).toBeLessThan(0.01);
      }
  });

  it("purchase currency should match company", () => {
    for (const c of companies)
      for (const p of c.purchases) expect(p.currency).toBe(c.currency);
  });

  it("purchase dates should be valid ISO strings", () => {
    for (const c of companies)
      for (const p of c.purchases) {
        expect(new Date(p.issueDate).getTime()).not.toBeNaN();
        expect(new Date(p.dueDate).getTime()).not.toBeNaN();
      }
  });
});
EOF

echo "  seeder-edge-case-08 done"

cat > "$DIR/seeder-edge-case-09.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { seedEnterpriseData } from "../index";

describe("Seeder AI data integrity", () => {
  const companies = seedEnterpriseData({ companyCount: 10 });

  it("AI memories should belong to correct company", () => {
    for (const c of companies)
      for (const mem of c.aiMemories) expect(mem.companySlug).toBe(c.slug);
  });

  it("AI memories should have valid confidence range", () => {
    for (const c of companies)
      for (const mem of c.aiMemories) {
        expect(mem.confidence).toBeGreaterThanOrEqual(0);
        expect(mem.confidence).toBeLessThanOrEqual(1);
      }
  });

  it("AI memories should have non-negative hit counts", () => {
    for (const c of companies)
      for (const mem of c.aiMemories) expect(mem.hitCount).toBeGreaterThanOrEqual(0);
  });

  it("AI rules should belong to correct company", () => {
    for (const c of companies)
      for (const rule of c.aiRules) expect(rule.companySlug).toBe(c.slug);
  });

  it("AI rules should have non-negative priority", () => {
    for (const c of companies)
      for (const rule of c.aiRules) expect(rule.priority).toBeGreaterThanOrEqual(0);
  });

  it("AI rules should have valid active status", () => {
    for (const c of companies)
      for (const rule of c.aiRules) expect(typeof rule.isActive).toBe("boolean");
  });
});
EOF

echo "  seeder-edge-case-09 done"

cat > "$DIR/seeder-edge-case-10.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { seedEnterpriseData } from "../index";

describe("Seeder cache and provider history", () => {
  const companies = seedEnterpriseData({ companyCount: 10 });

  it("cache entries should belong to correct company", () => {
    for (const c of companies)
      for (const ce of c.cacheEntries) expect(ce.companySlug).toBe(c.slug);
  });

  it("cache entries should have positive TTL", () => {
    for (const c of companies)
      for (const ce of c.cacheEntries) expect(ce.ttlSeconds).toBeGreaterThan(0);
  });

  it("cache entries should have non-negative hit counts", () => {
    for (const c of companies)
      for (const ce of c.cacheEntries) expect(ce.hitCount).toBeGreaterThanOrEqual(0);
  });

  it("provider history should belong to correct company", () => {
    for (const c of companies)
      for (const ph of c.providerHistory) expect(ph.companySlug).toBe(c.slug);
  });

  it("provider history should have valid latency", () => {
    for (const c of companies)
      for (const ph of c.providerHistory) expect(ph.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("provider history should have valid token counts", () => {
    for (const c of companies)
      for (const ph of c.providerHistory) {
        expect(ph.promptTokens).toBeGreaterThanOrEqual(0);
        expect(ph.completionTokens).toBeGreaterThanOrEqual(0);
      }
  });

  it("provider history cost should be non-negative", () => {
    for (const c of companies)
      for (const ph of c.providerHistory) expect(ph.costUsd).toBeGreaterThanOrEqual(0);
  });
});
EOF

echo "  seeder-edge-case-10 done"

cat > "$DIR/seeder-edge-case-11.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { SeededRandom } from "../index";

describe("SeededRandom date generation", () => {
  it("should generate dates between start and end", () => {
    const rng = new SeededRandom(42);
    const s = new Date("2024-01-01"), e = new Date("2024-12-31");
    for (let i = 0; i < 100; i++) {
      const d = rng.dateBetween(s, e);
      expect(d.getTime()).toBeGreaterThanOrEqual(s.getTime());
      expect(d.getTime()).toBeLessThanOrEqual(e.getTime());
    }
  });

  it("should return start when start equals end", () => {
    const rng = new SeededRandom(42);
    const d = new Date("2024-06-15");
    expect(rng.dateBetween(d, d).getTime()).toBe(d.getTime());
  });

  it("should produce different dates with different seeds", () => {
    const d1 = new SeededRandom(1).dateBetween(new Date("2020-01-01"), new Date("2025-12-31"));
    const d2 = new SeededRandom(2).dateBetween(new Date("2020-01-01"), new Date("2025-12-31"));
    expect(d1.getTime()).not.toBe(d2.getTime());
  });

  it("should be deterministic with same seed", () => {
    const r1 = new SeededRandom(999), r2 = new SeededRandom(999);
    const s = new Date("2023-01-01"), e = new Date("2023-12-31");
    for (let i = 0; i < 20; i++)
      expect(r1.dateBetween(s, e).getTime()).toBe(r2.dateBetween(s, e).getTime());
  });

  it("should generate dates with millisecond precision", () => {
    const rng = new SeededRandom(42);
    const d = rng.dateBetween(new Date("2024-01-01"), new Date("2024-06-30"));
    expect(d.getMilliseconds()).toBeGreaterThanOrEqual(0);
    expect(d.getMilliseconds()).toBeLessThan(1000);
  });
});
EOF

echo "  seeder-edge-case-11 done"

cat > "$DIR/seeder-edge-case-12.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { SeededRandom } from "../index";

describe("SeededRandom boundary values", () => {
  it("int with same min/max returns that value", () => {
    const rng = new SeededRandom(42);
    for (let i = 0; i < 20; i++) expect(rng.int(7, 7)).toBe(7);
  });

  it("float with same min/max returns that value", () => {
    const rng = new SeededRandom(42);
    expect(rng.float(5.5, 5.5)).toBe(5.5);
  });

  it("pick from single-element array always returns it", () => {
    const rng = new SeededRandom(42);
    for (let i = 0; i < 20; i++) expect(rng.pick(["only"])).toBe("only");
  });

  it("pickN with n=0 returns empty", () => {
    const rng = new SeededRandom(42);
    expect(rng.pickN([1, 2, 3], 0)).toHaveLength(0);
  });

  it("pickN with n=1 returns single element", () => {
    const rng = new SeededRandom(42);
    expect(rng.pickN(["a", "b", "c"], 1)).toHaveLength(1);
  });

  it("weighted with single item always returns it", () => {
    const rng = new SeededRandom(42);
    for (let i = 0; i < 10; i++)
      expect(rng.weighted([["only", 1] as [string, number]])).toBe("only");
  });

  it("bool(0) always returns false", () => {
    const rng = new SeededRandom(42);
    for (let i = 0; i < 50; i++) expect(rng.bool(0)).toBe(false);
  });

  it("bool(1) always returns true", () => {
    const rng = new SeededRandom(42);
    for (let i = 0; i < 50; i++) expect(rng.bool(1)).toBe(true);
  });

  it("pickN from empty array returns empty", () => {
    const rng = new SeededRandom(42);
    expect(rng.pickN([], 5)).toHaveLength(0);
  });

  it("shuffle same seed produces same result", () => {
    const a = new SeededRandom(42), b = new SeededRandom(42);
    const a1 = [1,2,3,4,5], b1 = [1,2,3,4,5];
    a.shuffle(a1); b.shuffle(b1);
    expect(a1).toEqual(b1);
  });
});
EOF

echo "  seeder-edge-case-12 done"

cat > "$DIR/seeder-edge-case-13.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { seedEnterpriseData } from "../index";

describe("Seeder user integrity", () => {
  const companies = seedEnterpriseData({ companyCount: 10 });

  it("users should have valid email format", () => {
    for (const c of companies)
      for (const u of c.users) {
        expect(u.email).toContain("@");
        expect(u.email).toContain(".");
      }
  });

  it("users should have valid roles", () => {
    const valid = ["admin", "editor", "employee", "viewer"];
    for (const c of companies)
      for (const u of c.users) expect(valid).toContain(u.role);
  });

  it("each company should have at least one admin", () => {
    for (const c of companies)
      expect(c.users.some(u => u.role === "admin")).toBe(true);
  });

  it("user UIDs should be unique globally", () => {
    const uids = companies.flatMap(c => c.users.map(u => u.uid));
    expect(new Set(uids).size).toBe(uids.length);
  });

  it("user emails should be unique globally", () => {
    const emails = companies.flatMap(c => c.users.map(u => u.email));
    expect(new Set(emails).size).toBe(emails.length);
  });

  it("users should have Arabic and English display names", () => {
    for (const c of companies)
      for (const u of c.users) {
        expect(u.displayName.length).toBeGreaterThan(0);
        expect(u.displayNameAr.length).toBeGreaterThan(0);
      }
  });

  it("user company assignments should reference valid slugs", () => {
    const allSlugs = new Set(companies.map(c => c.slug));
    for (const c of companies)
      for (const u of c.users)
        for (const slug of u.companies) expect(allSlugs.has(slug)).toBe(true);
  });
});
EOF

echo "  seeder-edge-case-13 done"

cat > "$DIR/seeder-edge-case-14.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { seedEnterpriseData } from "../index";

describe("Seeder worker history integrity", () => {
  const companies = seedEnterpriseData({ companyCount: 10 });

  it("worker history should belong to correct company", () => {
    for (const c of companies)
      for (const w of c.workerHistory) expect(w.companySlug).toBe(c.slug);
  });

  it("worker history should have valid statuses", () => {
    const valid = ["completed", "failed", "timeout", "skipped"];
    for (const c of companies)
      for (const w of c.workerHistory) expect(valid).toContain(w.status);
  });

  it("execution time should be non-negative", () => {
    for (const c of companies)
      for (const w of c.workerHistory) expect(w.executionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("queue wait should be non-negative", () => {
    for (const c of companies)
      for (const w of c.workerHistory) expect(w.queueWaitMs).toBeGreaterThanOrEqual(0);
  });

  it("retries should be non-negative", () => {
    for (const c of companies)
      for (const w of c.workerHistory) expect(w.retries).toBeGreaterThanOrEqual(0);
  });

  it("worker types should be non-empty", () => {
    for (const c of companies)
      for (const w of c.workerHistory) expect(w.workerType.length).toBeGreaterThan(0);
  });
});
EOF

echo "  seeder-edge-case-14 done"

cat > "$DIR/seeder-edge-case-15.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { getDefaultSeederConfig } from "../index";

describe("Default seeder config", () => {
  it("should return valid config for 10 companies", () => {
    const cfg = getDefaultSeederConfig(10);
    expect(cfg.companyCount).toBe(10);
    expect(cfg.seed).toBeGreaterThan(0);
    expect(cfg.aiMemoryPerCompany).toBeGreaterThan(0);
  });

  it("should return valid config for 100 companies", () => {
    expect(getDefaultSeederConfig(100).companyCount).toBe(100);
  });

  it("should return valid config for 1000 companies", () => {
    expect(getDefaultSeederConfig(1000).companyCount).toBe(1000);
  });

  it("should return valid config for 5000 companies", () => {
    expect(getDefaultSeederConfig(5000).companyCount).toBe(5000);
  });

  it("start date should be before end date", () => {
    const cfg = getDefaultSeederConfig(10);
    expect(cfg.startDate.getTime()).toBeLessThan(cfg.endDate.getTime());
  });

  it("should have positive provider history count", () => {
    expect(getDefaultSeederConfig(10).providerHistoryPerCompany).toBeGreaterThan(0);
  });

  it("should have positive cache entries count", () => {
    expect(getDefaultSeederConfig(10).cacheEntriesPerCompany).toBeGreaterThan(0);
  });

  it("should have positive worker history count", () => {
    expect(getDefaultSeederConfig(10).workerHistoryPerCompany).toBeGreaterThan(0);
  });
});
EOF

echo "  seeder-edge-case-15 done"

cat > "$DIR/seeder-edge-case-16.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { seedEnterpriseData } from "../index";

describe("Seeder determinism across runs", () => {
  it("same seed produces identical slugs", () => {
    const a = seedEnterpriseData({ companyCount: 10, seed: 12345 });
    const b = seedEnterpriseData({ companyCount: 10, seed: 12345 });
    expect(a.map(c => c.slug)).toEqual(b.map(c => c.slug));
  });

  it("same seed produces identical names", () => {
    const a = seedEnterpriseData({ companyCount: 10, seed: 12345 });
    const b = seedEnterpriseData({ companyCount: 10, seed: 12345 });
    for (let i = 0; i < 10; i++) {
      expect(a[i].name).toBe(b[i].name);
      expect(a[i].nameAr).toBe(b[i].nameAr);
    }
  });

  it("different seeds produce different slugs", () => {
    const a = seedEnterpriseData({ companyCount: 10, seed: 1 });
    const b = seedEnterpriseData({ companyCount: 10, seed: 2 });
    expect(a.map(c => c.slug)).not.toEqual(b.map(c => c.slug));
  });

  it("same seed produces identical user emails", () => {
    const a = seedEnterpriseData({ companyCount: 10, seed: 999 });
    const b = seedEnterpriseData({ companyCount: 10, seed: 999 });
    for (let i = 0; i < 10; i++)
      expect(a[i].users.map(u => u.email)).toEqual(b[i].users.map(u => u.email));
  });

  it("same seed produces identical invoice counts", () => {
    const a = seedEnterpriseData({ companyCount: 10, seed: 42 });
    const b = seedEnterpriseData({ companyCount: 10, seed: 42 });
    for (let i = 0; i < 10; i++) expect(a[i].invoices.length).toBe(b[i].invoices.length);
  });

  it("deterministic at 100 company scale", () => {
    const a = seedEnterpriseData({ companyCount: 100, seed: 555 });
    const b = seedEnterpriseData({ companyCount: 100, seed: 555 });
    expect(a.map(c => c.slug)).toEqual(b.map(c => c.slug));
  });
});
EOF

echo "  seeder-edge-case-16 done"

cat > "$DIR/seeder-edge-case-17.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { seedEnterpriseData } from "../index";

describe("Seeder invoice line item calculations", () => {
  const companies = seedEnterpriseData({ companyCount: 10 });

  it("line total = qty * unitPrice - discount", () => {
    for (const c of companies)
      for (const inv of c.invoices)
        for (const li of inv.lineItems) {
          const exp = li.quantity * parseFloat(li.unitPrice) - parseFloat(li.discount);
          expect(Math.abs(parseFloat(li.total) - exp)).toBeLessThan(0.02);
        }
  });

  it("discount should be non-negative", () => {
    for (const c of companies)
      for (const inv of c.invoices)
        for (const li of inv.lineItems) expect(parseFloat(li.discount)).toBeGreaterThanOrEqual(0);
  });

  it("unit price should be positive", () => {
    for (const c of companies)
      for (const inv of c.invoices)
        for (const li of inv.lineItems) expect(parseFloat(li.unitPrice)).toBeGreaterThan(0);
  });

  it("tax amount = subtotal * taxRate / 100", () => {
    for (const c of companies)
      for (const inv of c.invoices) {
        const exp = parseFloat(inv.subtotal) * (parseFloat(inv.taxRate) / 100);
        expect(Math.abs(parseFloat(inv.taxAmount) - exp)).toBeLessThan(0.02);
      }
  });

  it("total = subtotal + tax - discount + shipping", () => {
    for (const c of companies)
      for (const inv of c.invoices) {
        const exp = parseFloat(inv.subtotal) + parseFloat(inv.taxAmount)
          - parseFloat(inv.discount) + parseFloat(inv.shipping);
        expect(Math.abs(parseFloat(inv.total) - exp)).toBeLessThan(0.02);
      }
  });

  it("paid should not exceed total", () => {
    for (const c of companies)
      for (const inv of c.invoices)
        expect(parseFloat(inv.paid)).toBeLessThanOrEqual(parseFloat(inv.total) + 0.01);
  });
});
EOF

echo "  seeder-edge-case-17 done"

cat > "$DIR/seeder-edge-case-18.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { seedEnterpriseData } from "../index";

describe("Seeder openrouter model assignment", () => {
  const companies = seedEnterpriseData({ companyCount: 10 });

  it("each company should have an openrouter model", () => {
    for (const c of companies) expect(c.openrouterModel.length).toBeGreaterThan(0);
  });

  it("model should contain a slash (provider/model format)", () => {
    for (const c of companies) expect(c.openrouterModel).toContain("/");
  });

  it("provider history should have valid providers", () => {
    const valid = ["openrouter", "anthropic", "openai", "google", "deepseek"];
    for (const c of companies)
      for (const ph of c.providerHistory) expect(valid).toContain(ph.provider);
  });

  it("provider history should have non-empty model", () => {
    for (const c of companies)
      for (const ph of c.providerHistory) expect(ph.model.length).toBeGreaterThan(0);
  });

  it("provider history request types should be known", () => {
    const valid = ["chat", "extraction", "matching", "classification", "summarization"];
    for (const c of companies)
      for (const ph of c.providerHistory) expect(valid).toContain(ph.requestType);
  });

  it("provider history success should be boolean", () => {
    for (const c of companies)
      for (const ph of c.providerHistory) expect(typeof ph.success).toBe("boolean");
  });
});
EOF

echo "  seeder-edge-case-18 done"

cat > "$DIR/seeder-edge-case-19.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { seedEnterpriseData } from "../index";

describe("Seeder company metadata completeness", () => {
  const companies = seedEnterpriseData({ companyCount: 10 });

  it("all companies should have email addresses", () => {
    for (const c of companies) expect(c.email).toContain("@");
  });

  it("all companies should have phone numbers", () => {
    for (const c of companies) expect(c.phone.length).toBeGreaterThan(5);
  });

  it("all companies should have addresses", () => {
    for (const c of companies) expect(c.address.length).toBeGreaterThan(5);
  });

  it("company countries should be GCC", () => {
    const gcc = ["SA", "AE", "KW", "BH", "OM", "QA"];
    for (const c of companies) expect(gcc).toContain(c.country);
  });

  it("slugs should be lowercase with hyphens", () => {
    for (const c of companies) expect(c.slug).toMatch(/^[a-z0-9-]+$/);
  });

  it("company names should not be empty", () => {
    for (const c of companies) expect(c.name.length).toBeGreaterThan(0);
  });

  it("VAT numbers should have reasonable length", () => {
    for (const c of companies) {
      expect(c.vatNumber.length).toBeGreaterThanOrEqual(10);
      expect(c.vatNumber.length).toBeLessThanOrEqual(30);
    }
  });
});
EOF

echo "  seeder-edge-case-19 done"

cat > "$DIR/seeder-edge-case-20.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { SeededRandom } from "../index";

describe("SeededRandom state isolation", () => {
  it("different instances with same seed advance independently", () => {
    const a = new SeededRandom(42), b = new SeededRandom(42);
    a.next(); a.next();
    expect(a.next()).not.toBe(b.next());
  });

  it("handles negative seed via bitwise OR", () => {
    const a = new SeededRandom(-1), b = new SeededRandom(-1);
    expect(a.next()).toBe(b.next());
  });

  it("handles very large seeds", () => {
    const a = new SeededRandom(2147483647), b = new SeededRandom(2147483647);
    expect(a.next()).toBe(b.next());
  });

  it("handles floating point seeds", () => {
    const a = new SeededRandom(3.14), b = new SeededRandom(3.14);
    expect(a.next()).toBe(b.next());
  });

  it("uniform distribution over many samples", () => {
    const rng = new SeededRandom(42);
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 10000; i++) buckets[Math.floor(rng.next() * 10)]++;
    expect(Math.max(...buckets) / Math.max(1, Math.min(...buckets))).toBeLessThan(2.0);
  });

  it("shuffle preserves element count", () => {
    const rng = new SeededRandom(42);
    const arr = Array.from({ length: 100 }, (_, i) => i);
    rng.shuffle(arr);
    expect(arr).toHaveLength(100);
    expect(new Set(arr).size).toBe(100);
  });

  it("int produces integers", () => {
    const rng = new SeededRandom(42);
    for (let i = 0; i < 100; i++) {
      const v = rng.int(0, 1000);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it("float produces floats", () => {
    const rng = new SeededRandom(42);
    for (let i = 0; i < 100; i++) {
      const v = rng.float(0, 1);
      expect(typeof v).toBe("number");
    }
  });
});
EOF

echo "  seeder-edge-case-20 done"
echo "Category 1 complete: 20 files"
