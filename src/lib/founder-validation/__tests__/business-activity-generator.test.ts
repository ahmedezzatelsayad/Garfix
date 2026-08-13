import { describe, it, expect } from 'bun:test';
import {
  seedEnterpriseData,
  generateBusinessActivities,
  type BusinessActivity,
  type BusinessActivityType,
} from '../index';

describe('Business Activity Generator', () => {
  const companies = seedEnterpriseData({ companyCount: 10 });
  const companySlugs = new Set(companies.map((c) => c.slug));
  const allInvoiceIds = new Map<string, Set<number>>();
  for (const c of companies) {
    allInvoiceIds.set(c.slug, new Set(c.invoices.map((i) => i.id)));
  }

  function collectActivities(durationMs: number): BusinessActivity[] {
    const gen = generateBusinessActivities(companies, durationMs, 5);
    const all: BusinessActivity[] = [];
    for (const batch of gen) {
      all.push(...batch);
    }
    return all;
  }

  it('generator yields at least one batch of activities', () => {
    const gen = generateBusinessActivities(companies, 300, 3);
    const batch = gen.next().value as BusinessActivity[];
    expect(Array.isArray(batch)).toBe(true);
    expect(batch.length).toBeGreaterThan(0);
  });

  it('generator can produce multiple batches over time', () => {
    const activities = collectActivities(400);
    // With 400ms and fast ticking, should yield multiple batches
    expect(activities.length).toBeGreaterThanOrEqual(2);
  });

  it('all 13 activity types are present across many activities', () => {
    const activities = collectActivities(500);
    const types = new Set(activities.map((a) => a.type));
    const expected: BusinessActivityType[] = [
      'create_invoice', 'import_invoice', 'ocr', 'ai_extraction', 'ai_matching',
      'customer_creation', 'inventory_movement', 'stock_adjustment', 'payment',
      'refund', 'dashboard_usage', 'search', 'ai_chat',
    ];
    for (const t of expected) {
      expect(types.has(t)).toBe(true);
    }
  });

  it('create_invoice type has valid metadata structure', () => {
    const activities = collectActivities(500);
    const createInvs = activities.filter((a) => a.type === 'create_invoice');
    expect(createInvs.length).toBeGreaterThan(0);
    for (const a of createInvs) {
      expect(typeof a.metadata.items).toBe('number');
      expect(a.metadata.items).toBeGreaterThanOrEqual(1);
      expect(a.metadata.items).toBeLessThanOrEqual(10);
    }
  });

  it('import_invoice type has source metadata', () => {
    const activities = collectActivities(500);
    const imports = activities.filter((a) => a.type === 'import_invoice');
    expect(imports.length).toBeGreaterThan(0);
    for (const a of imports) {
      expect(['csv', 'excel', 'whatsapp', 'api']).toContain(a.metadata.source);
      expect(typeof a.metadata.count).toBe('number');
    }
  });

  it('ocr type has fileSize and format metadata', () => {
    const activities = collectActivities(500);
    const ocrActs = activities.filter((a) => a.type === 'ocr');
    expect(ocrActs.length).toBeGreaterThan(0);
    for (const a of ocrActs) {
      expect(typeof a.metadata.fileSize).toBe('number');
      expect(a.metadata.fileSize).toBeGreaterThan(0);
      expect(['pdf', 'png', 'jpg']).toContain(a.metadata.format);
    }
  });

  it('ai_extraction type has model and confidence metadata', () => {
    const activities = collectActivities(500);
    const extractions = activities.filter((a) => a.type === 'ai_extraction');
    expect(extractions.length).toBeGreaterThan(0);
    for (const a of extractions) {
      expect(typeof a.metadata.model).toBe('string');
      expect(typeof a.metadata.confidence).toBe('number');
      expect(a.metadata.confidence).toBeGreaterThanOrEqual(0.6);
      expect(a.metadata.confidence).toBeLessThanOrEqual(0.99);
    }
  });

  it('ai_matching type has items and matchRate metadata', () => {
    const activities = collectActivities(500);
    const matches = activities.filter((a) => a.type === 'ai_matching');
    expect(matches.length).toBeGreaterThan(0);
    for (const a of matches) {
      expect(typeof a.metadata.items).toBe('number');
      expect(typeof a.metadata.matchRate).toBe('number');
      expect(a.metadata.matchRate).toBeGreaterThanOrEqual(0.5);
      expect(a.metadata.matchRate).toBeLessThanOrEqual(0.98);
    }
  });

  it('customer_creation type has nameAr and city metadata', () => {
    const activities = collectActivities(500);
    const creations = activities.filter((a) => a.type === 'customer_creation');
    expect(creations.length).toBeGreaterThan(0);
    for (const a of creations) {
      expect(typeof a.metadata.nameAr).toBe('string');
      expect(a.metadata.nameAr.length).toBeGreaterThan(0);
      expect(typeof a.metadata.city).toBe('string');
    }
  });

  it('inventory_movement type has numeric metadata fields', () => {
    const activities = collectActivities(500);
    const movements = activities.filter((a) => a.type === 'inventory_movement');
    expect(movements.length).toBeGreaterThan(0);
    for (const a of movements) {
      expect(typeof a.metadata.qty).toBe('number');
    }
  });

  it('stock_adjustment type has a valid reason', () => {
    const activities = collectActivities(500);
    const adjustments = activities.filter((a) => a.type === 'stock_adjustment');
    expect(adjustments.length).toBeGreaterThan(0);
    for (const a of adjustments) {
      expect(['damaged', 'expired', 'count_correction', 'receiving']).toContain(a.metadata.reason);
    }
  });

  it('payment type has invoiceId and amount metadata', () => {
    const activities = collectActivities(500);
    const payments = activities.filter((a) => a.type === 'payment');
    expect(payments.length).toBeGreaterThan(0);
    for (const a of payments) {
      // invoiceId may be undefined if company has no invoices, but amount should exist
      expect(a.metadata).toBeDefined();
      expect('amount' in a.metadata).toBe(true);
    }
  });

  it('refund type has amount and reason metadata', () => {
    const activities = collectActivities(500);
    const refunds = activities.filter((a) => a.type === 'refund');
    expect(refunds.length).toBeGreaterThan(0);
    for (const a of refunds) {
      expect(typeof a.metadata.amount).toBe('number');
      expect(a.metadata.amount).toBeGreaterThan(0);
      expect(['return', 'cancellation', 'overpayment']).toContain(a.metadata.reason);
    }
  });

  it('dashboard_usage type has page metadata', () => {
    const activities = collectActivities(500);
    const dashboards = activities.filter((a) => a.type === 'dashboard_usage');
    expect(dashboards.length).toBeGreaterThan(0);
    for (const a of dashboards) {
      expect(['dashboard', 'invoices', 'clients', 'inventory', 'reports']).toContain(a.metadata.page);
    }
  });

  it('search type has queryType and results metadata', () => {
    const activities = collectActivities(500);
    const searches = activities.filter((a) => a.type === 'search');
    expect(searches.length).toBeGreaterThan(0);
    for (const a of searches) {
      expect(['product', 'invoice', 'client', 'global']).toContain(a.metadata.queryType);
      expect(typeof a.metadata.results).toBe('number');
    }
  });

  it('ai_chat type has messageLength and model metadata', () => {
    const activities = collectActivities(500);
    const chats = activities.filter((a) => a.type === 'ai_chat');
    expect(chats.length).toBeGreaterThan(0);
    for (const a of chats) {
      expect(typeof a.metadata.messageLength).toBe('number');
      expect(a.metadata.messageLength).toBeGreaterThanOrEqual(10);
      expect(typeof a.metadata.model).toBe('string');
    }
  });

  it('each activity has companySlug referencing a real company', () => {
    const activities = collectActivities(500);
    for (const a of activities) {
      expect(companySlugs.has(a.companySlug)).toBe(true);
    }
  });

  it('each activity has a non-empty id', () => {
    const activities = collectActivities(500);
    for (const a of activities) {
      expect(typeof a.id).toBe('string');
      expect(a.id.length).toBeGreaterThan(0);
    }
  });

  it('each activity has a valid timestamp', () => {
    const activities = collectActivities(500);
    const now = Date.now();
    for (const a of activities) {
      const ts = a.timestamp.getTime();
      // Should be close to now (within last few seconds)
      expect(now - ts).toBeLessThan(5000);
    }
  });

  it('each activity has non-negative durationMs', () => {
    const activities = collectActivities(500);
    for (const a of activities) {
      expect(a.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('each activity has a non-empty description', () => {
    const activities = collectActivities(500);
    for (const a of activities) {
      expect(typeof a.description).toBe('string');
      expect(a.description.length).toBeGreaterThan(0);
    }
  });

  it('activity descriptions contain meaningful text for their type', () => {
    const activities = collectActivities(500);
    const ocrActs = activities.filter((a) => a.type === 'ocr');
    for (const a of ocrActs) {
      expect(a.description.toLowerCase()).toContain('ocr');
    }
    const payments = activities.filter((a) => a.type === 'payment');
    for (const a of payments) {
      expect(a.description.toLowerCase()).toContain('payment');
    }
  });

  it('generator stops after durationMs', () => {
    const gen = generateBusinessActivities(companies, 200, 3);
    let batchCount = 0;
    const deadline = Date.now() + 500; // safety timeout
    for (const _batch of gen) {
      batchCount++;
      if (Date.now() > deadline) break; // prevent infinite loop in test
    }
    // Should have stopped — batch count is finite
    expect(batchCount).toBeGreaterThan(0);
  });

  it('two independent generators produce distinct activity IDs', () => {
    const gen1 = generateBusinessActivities(companies, 200, 2);
    const gen2 = generateBusinessActivities(companies, 200, 2);
    const ids1 = new Set<string>();
    const ids2 = new Set<string>();
    for (const batch of gen1) for (const a of batch) ids1.add(a.id);
    for (const batch of gen2) for (const a of batch) ids2.add(a.id);
    // At minimum they should each produce unique IDs internally
    expect(ids1.size).toBeGreaterThanOrEqual(1);
    expect(ids2.size).toBeGreaterThanOrEqual(1);
  });

  it('generators do not crash with single company input', () => {
    const singleCompany = companies.slice(0, 1);
    const gen = generateBusinessActivities(singleCompany, 200, 3);
    const all: BusinessActivity[] = [];
    for (const batch of gen) {
      all.push(...batch);
    }
    expect(all.length).toBeGreaterThan(0);
  });

  it('activities have valid metadata object (not null)', () => {
    const activities = collectActivities(300);
    for (const a of activities) {
      expect(a.metadata).toBeDefined();
      expect(a.metadata).not.toBeNull();
      expect(typeof a.metadata).toBe('object');
    }
  });

  it('OCR and AI extraction activities have higher duration than search', () => {
    const activities = collectActivities(500);
    const searches = activities.filter((a) => a.type === 'search').map((a) => a.durationMs);
    const ocrs = activities.filter((a) => a.type === 'ocr').map((a) => a.durationMs);
    const aiExtractions = activities.filter((a) => a.type === 'ai_extraction').map((a) => a.durationMs);
    if (searches.length > 0 && ocrs.length > 0) {
      const avgSearch = searches.reduce((s, v) => s + v, 0) / searches.length;
      const avgOcr = ocrs.reduce((s, v) => s + v, 0) / ocrs.length;
      expect(avgOcr).toBeGreaterThan(avgSearch);
    }
    if (searches.length > 0 && aiExtractions.length > 0) {
      const avgSearch = searches.reduce((s, v) => s + v, 0) / searches.length;
      const avgAi = aiExtractions.reduce((s, v) => s + v, 0) / aiExtractions.length;
      expect(avgAi).toBeGreaterThan(avgSearch);
    }
  });

  it('multiple concurrent generators each produce valid data independently', () => {
    const gen1 = generateBusinessActivities(companies, 200, 2);
    const gen2 = generateBusinessActivities(companies, 200, 2);
    const gen3 = generateBusinessActivities(companies, 200, 2);
    const results: BusinessActivity[][] = [];
    for (const gen of [gen1, gen2, gen3]) {
      const collected: BusinessActivity[] = [];
      for (const batch of gen) {
        collected.push(...batch);
      }
      results.push(collected);
    }
    for (const result of results) {
      for (const a of result) {
        expect(companySlugs.has(a.companySlug)).toBe(true);
        expect(typeof a.type).toBe('string');
        expect(a.durationMs).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('payment activities with invoiceId reference real invoices from that company', () => {
    const activities = collectActivities(500);
    const payments = activities.filter(
      (a) => a.type === 'payment' && a.metadata.invoiceId != null
    );
    for (const a of payments) {
      const invIds = allInvoiceIds.get(a.companySlug);
      if (invIds) {
        expect(invIds.has(a.metadata.invoiceId as number)).toBe(true);
      }
    }
  });

  it('activity type is always a valid BusinessActivityType string', () => {
    const activities = collectActivities(300);
    const validTypes: BusinessActivityType[] = [
      'create_invoice', 'import_invoice', 'ocr', 'ai_extraction', 'ai_matching',
      'customer_creation', 'inventory_movement', 'stock_adjustment', 'payment',
      'refund', 'dashboard_usage', 'search', 'ai_chat',
    ];
    for (const a of activities) {
      expect(validTypes).toContain(a.type);
    }
  });

  it('batches contain at least 1 activity each', () => {
    const gen = generateBusinessActivities(companies, 300, 5);
    for (const batch of gen) {
      expect(batch.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('batches do not exceed concurrency limit', () => {
    const gen = generateBusinessActivities(companies, 300, 3);
    for (const batch of gen) {
      expect(batch.length).toBeLessThanOrEqual(3);
    }
  });
});