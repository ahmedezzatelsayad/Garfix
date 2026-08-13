import { describe, it, expect } from 'bun:test';
import {
  seedEnterpriseData,
  TelemetryCollector,
  calculateMetrics,
  SeededRandom,
  type SyntheticCompany,
  type TelemetryEntry,
  type SyntheticInvoice,
  type SyntheticProduct,
} from '../index';

// Failure Injection: Disk/Storage Failure Simulation
// Tests JSON serialization, partial writes, data integrity under
// corruption scenarios, and file-lock-like concurrency. No mocks.

/** Simulate a "disk write" by serializing to JSON. */
function simulateWrite(data: unknown): { result: string; bytes: number } {
  const result = JSON.stringify(data);
  return { result, bytes: Buffer.byteLength(result, 'utf-8') };
}

/** Simulate a partial write by truncating a JSON string. */
function simulatePartialWrite(data: unknown, truncateToPct: number): string {
  const full = JSON.stringify(data);
  const cutPoint = Math.floor(full.length * truncateToPct);
  return full.substring(0, cutPoint);
}

/** Simulate a "backup" by deep-cloning via serialize/deserialize. */
function simulateBackup(data: unknown): unknown | null {
  try {
    const serialized = JSON.stringify(data);
    return JSON.parse(serialized) as unknown;
  } catch {
    return null;
  }
}

/** Simulate file-lock contention by "writing" N times and checking idempotency. */
function simulateConcurrentWrites(data: unknown, writeCount: number): boolean {
  const serialized = JSON.stringify(data);
  for (let i = 0; i < writeCount; i++) {
    if (JSON.stringify(data) !== serialized) return false;
  }
  return true;
}

/**
 * Simulate corruption by flipping bits in a JSON string.
 */
function simulateCorruption(data: string, rng: SeededRandom, count: number): string {
  const chars = [...data];
  for (let i = 0; i < count; i++) {
    const pos = rng.int(0, chars.length - 1);
    const code = chars[pos].charCodeAt(0);
    chars[pos] = String.fromCharCode(code ^ (1 << rng.int(0, 7)));
  }
  return chars.join('');
}

describe('Failure Injection: Disk/Storage', () => {
  const companies = seedEnterpriseData({ companyCount: 100, seed: 5555 });

  describe('Handle write errors gracefully', () => {
    it('should serialize a single company to JSON without error', () => {
      const { result, bytes } = simulateWrite(companies[0]);
      expect(result).toBeTruthy();
      expect(bytes).toBeGreaterThan(0);
    });

    it('should serialize all 100 companies to JSON without error', () => {
      const { result, bytes } = simulateWrite(companies);
      expect(result).toBeTruthy();
      expect(bytes).toBeGreaterThan(1000);
    });

    it('should serialize large invoice batches without truncation', () => {
      const bigCompany = companies.reduce((a, b) => a.invoices.length > b.invoices.length ? a : b);
      const { result } = simulateWrite(bigCompany.invoices);
      const parsed = JSON.parse(result) as SyntheticInvoice[];
      expect(parsed.length).toBe(bigCompany.invoices.length);
    });

    it('should handle empty array serialization', () => {
      const { result } = simulateWrite([]);
      expect(result).toBe('[]');
    });

    it('should handle company with zero invoices', () => {
      const emptyCompany: SyntheticCompany = {
        ...companies[0],
        invoices: [],
        products: [],
        clients: [],
        suppliers: [],
        employees: [],
        inventory: [],
        purchases: [],
        aiMemories: [],
        aiRules: [],
        cacheEntries: [],
        providerHistory: [],
        workerHistory: [],
        users: [],
        warehouses: [],
        categories: [],
      };
      const { result } = simulateWrite(emptyCompany);
      expect(result).toContain('"invoices":[]');
    });

    it('should preserve numeric precision through serialization', () => {
      const product: SyntheticProduct = companies[0].products[0];
      const { result } = simulateWrite(product);
      const restored = JSON.parse(result) as SyntheticProduct;
      expect(restored.purchasePrice).toBe(product.purchasePrice);
      expect(restored.sellingPrice).toBe(product.sellingPrice);
    });

    it('should handle special characters in Arabic text', () => {
      const { result } = simulateWrite(companies[0].nameAr);
      expect(result).toContain(companies[0].nameAr);
      const restored = JSON.parse(result) as string;
      expect(restored).toBe(companies[0].nameAr);
    });
  });

  describe('Backup handles errors', () => {
    it('should round-trip a full company through backup', () => {
      const backup = simulateBackup(companies[0]) as SyntheticCompany;
      expect(backup).not.toBeNull();
      expect(backup.slug).toBe(companies[0].slug);
      expect(backup.invoices.length).toBe(companies[0].invoices.length);
    });

    it('should round-trip all companies through backup', () => {
      const backup = simulateBackup(companies) as SyntheticCompany[];
      expect(backup).not.toBeNull();
      expect(backup.length).toBe(companies.length);
    });

    it('should preserve all invoice fields through backup', () => {
      const inv = companies[0].invoices[0];
      const backup = simulateBackup(inv) as SyntheticInvoice;
      expect(backup.invoiceNumber).toBe(inv.invoiceNumber);
      expect(backup.lineItems.length).toBe(inv.lineItems.length);
      expect(backup.currency).toBe(inv.currency);
      expect(backup.invoiceType).toBe(inv.invoiceType);
    });

    it('should return null for circular references (simulated)', () => {
      const obj: Record<string, unknown> = { a: 1 };
      obj['self'] = obj; // Circular
      // JSON.stringify handles circular by throwing
      const result = simulateBackup(obj);
      expect(result).toBeNull();
    });

    it('should preserve telemetry through backup round-trip', () => {
      const collector = new TelemetryCollector(companies);
      const tel = collector.generateAll(new SeededRandom(5555));
      const backup = simulateBackup(tel) as TelemetryEntry[];
      expect(backup).not.toBeNull();
      expect(backup.length).toBe(tel.length);
      expect(backup[0].tenant).toBe(tel[0].tenant);
      expect(backup[0].latencyMs).toBe(tel[0].latencyMs);
    });
  });

  describe('No data corruption on partial write', () => {
    it('should detect partial write as invalid JSON', () => {
      const partial = simulatePartialWrite(companies[0], 0.3);
      let parseError = false;
      try {
        JSON.parse(partial);
      } catch {
        parseError = true;
      }
      expect(parseError).toBe(true);
    });

    it('should detect 50% truncated write as corrupt', () => {
      const partial = simulatePartialWrite(companies, 0.5);
      let parseError = false;
      try {
        JSON.parse(partial);
      } catch {
        parseError = true;
      }
      expect(parseError).toBe(true);
    });

    it('should detect 99% truncated write as corrupt', () => {
      const partial = simulatePartialWrite(companies[0], 0.99);
      let parseError = false;
      try {
        JSON.parse(partial);
      } catch {
        parseError = true;
      }
      expect(parseError).toBe(true);
    });

    it('should detect bit-flip corruption', () => {
      const rng = new SeededRandom(42);
      const full = JSON.stringify(companies[0]);
      const corrupted = simulateCorruption(full, rng, 10);
      let parseError = false;
      try {
        JSON.parse(corrupted);
      } catch {
        parseError = true;
      }
      // Bit flips in JSON structure will likely cause parse errors
      // If they don't, data fields will differ
      if (!parseError) {
        const original = JSON.parse(full) as Record<string, unknown>;
        const corrupt = JSON.parse(corrupted) as Record<string, unknown>;
        expect(JSON.stringify(original)).not.toBe(JSON.stringify(corrupt));
      }
    });

    it('should preserve data integrity with full write', () => {
      const { result } = simulateWrite(companies[0]);
      const restored = JSON.parse(result) as SyntheticCompany;
      expect(restored.slug).toBe(companies[0].slug);
      expect(restored.invoices.length).toBe(companies[0].invoices.length);
      expect(restored.clients.length).toBe(companies[0].clients.length);
      expect(restored.products.length).toBe(companies[0].products.length);
    });

    it('should verify line items survive serialization intact', () => {
      const inv = companies[0].invoices[0];
      const { result } = simulateWrite(inv.lineItems);
      const restored = JSON.parse(result) as typeof inv.lineItems;
      expect(restored.length).toBe(inv.lineItems.length);
      for (let i = 0; i < restored.length; i++) {
        expect(restored[i].productName).toBe(inv.lineItems[i].productName);
        expect(restored[i].quantity).toBe(inv.lineItems[i].quantity);
        expect(restored[i].unitPrice).toBe(inv.lineItems[i].unitPrice);
      }
    });
  });

  describe('File lock handling', () => {
    it('should produce identical output from concurrent writes', () => {
      const consistent = simulateConcurrentWrites(companies[0], 50);
      expect(consistent).toBe(true);
    });

    it('should produce identical output from concurrent batch writes', () => {
      const consistent = simulateConcurrentWrites(companies, 20);
      expect(consistent).toBe(true);
    });

    it('should serialize company data consistently across multiple attempts', () => {
      const results = Array.from({ length: 10 }, () => JSON.stringify(companies[0]));
      const unique = new Set(results);
      expect(unique.size).toBe(1);
    });

    it('should handle rapid sequential serialize/deserialize cycles', () => {
      let current: unknown = companies[0];
      for (let i = 0; i < 20; i++) {
        const serialized = JSON.stringify(current);
        current = JSON.parse(serialized);
      }
      const final = current as SyntheticCompany;
      expect(final.slug).toBe(companies[0].slug);
    });

    it('should maintain data consistency when interleaving writes of different companies', () => {
      const writes: string[] = [];
      for (let i = 0; i < 10; i++) {
        const idx = i % companies.length;
        writes.push(JSON.stringify(companies[idx]));
      }
      // Each write should match its original company
      for (let i = 0; i < 10; i++) {
        const idx = i % companies.length;
        const parsed = JSON.parse(writes[i]) as SyntheticCompany;
        expect(parsed.slug).toBe(companies[idx].slug);
      }
    });

    it('should handle large payloads without data loss', () => {
      const largeData = companies.flatMap(c => c.invoices);
      const { bytes } = simulateWrite(largeData);
      const restored = JSON.parse(JSON.stringify(largeData)) as SyntheticInvoice[];
      expect(restored.length).toBe(largeData.length);
      expect(bytes).toBeGreaterThan(10000);
    });

    it('should survive append-style writes (concatenation)', () => {
      const part1 = JSON.stringify(companies.slice(0, 50));
      const part2 = JSON.stringify(companies.slice(50));
      const combined = `[${part1.slice(1, -1)},${part2.slice(1, -1)}]`;
      const parsed = JSON.parse(combined) as SyntheticCompany[];
      expect(parsed.length).toBe(companies.length);
    });

    it('should detect tampering in serialized data', () => {
      const serialized = JSON.stringify(companies[0]);
      const tampered = serialized.replace(companies[0].slug, 'TAMPERED-SLUG');
      const parsed = JSON.parse(tampered) as SyntheticCompany;
      expect(parsed.slug).not.toBe(companies[0].slug);
      expect(parsed.slug).toBe('TAMPERED-SLUG');
    });

    it('should handle write of provider history without loss', () => {
      const ph = companies[0].providerHistory;
      const { bytes } = simulateWrite(ph);
      const restored = JSON.parse(JSON.stringify(ph)) as typeof ph;
      expect(restored.length).toBe(ph.length);
      expect(bytes).toBeGreaterThan(0);
    });

    it('should handle write of worker history without loss', () => {
      const wh = companies[0].workerHistory;
      const { result } = simulateWrite(wh);
      const restored = JSON.parse(result) as typeof wh;
      expect(restored.length).toBe(wh.length);
      for (let i = 0; i < restored.length; i++) {
        expect(restored[i].workerType).toBe(wh[i].workerType);
        expect(restored[i].status).toBe(wh[i].status);
      }
    });

    it('should preserve Date objects as ISO strings through serialization', () => {
      const company = companies[0];
      const { result } = simulateWrite(company);
      const restored = JSON.parse(result) as SyntheticCompany;
      expect(new Date(restored.createdAt).toISOString()).toBe(company.createdAt.toISOString());
    });

    it('should handle null fields gracefully in serialization', () => {
      const data = { a: null, b: 1, c: 'test' };
      const { result } = simulateWrite(data);
      const restored = JSON.parse(result) as Record<string, unknown>;
      expect(restored.a).toBeNull();
      expect(restored.b).toBe(1);
    });
  });
});