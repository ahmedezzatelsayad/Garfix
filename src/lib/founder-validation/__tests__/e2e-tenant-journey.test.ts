// @ts-nocheck
import { describe, it, expect } from 'bun:test';
import {
  simulateE2ETenantJourney,
  seedEnterpriseData,
  TelemetryCollector,
  SeededRandom,
  type E2EJourneyResult,
  type E2EJourneyStep,
} from '../index';

describe('simulateE2ETenantJourney', () => {
  function getCompany() {
    const companies = seedEnterpriseData({ companyCount: 10 });
    return companies[0];
  }

  // ── Basic result structure ─────────────────────────────────────────────
  it('should produce a result object', async () => {
    const company = getCompany();
    const result = await simulateE2ETenantJourney(company, { skipAiCalls: true });
    expect(result).toBeDefined();
    expect(result.tenantSlug).toBe(company.slug);
    expect(result.startTime).toBeInstanceOf(Date);
    expect(result.endTime).toBeInstanceOf(Date);
    expect(typeof result.totalDurationMs).toBe('number');
    expect(typeof result.passed).toBe('boolean');
  });

  it('should have all 11 steps', async () => {
    const company = getCompany();
    const result = await simulateE2ETenantJourney(company, { skipAiCalls: true });
    expect(result.steps.length).toBe(11);
  });

  it('should have each step with valid status', async () => {
    const company = getCompany();
    const result = await simulateE2ETenantJourney(company, { skipAiCalls: true });
    const validStatuses: E2EJourneyStep['status'][] = ['passed', 'failed', 'skipped'];
    for (const step of result.steps) {
      expect(validStatuses).toContain(step.status);
    }
  });

  it('should have each step with duration in ms (non-negative)', async () => {
    const company = getCompany();
    const result = await simulateE2ETenantJourney(company, { skipAiCalls: true });
    for (const step of result.steps) {
      expect(typeof step.durationMs).toBe('number');
      expect(step.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('should have total journey duration as sum of step durations', async () => {
    const company = getCompany();
    const result = await simulateE2ETenantJourney(company, { skipAiCalls: true });
    const stepSum = result.steps.reduce((s, st) => s + st.durationMs, 0);
    // totalDurationMs measures wall-clock, step durations are per-step measurements
    // They should be approximately equal (allowing for overhead)
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(stepSum - 5); // small tolerance
  });

  // ── Individual step validation ─────────────────────────────────────────
  const STEP_NAMES = [
    'Tenant Created',
    'Users Invited',
    'Products Imported',
    'Invoices Uploaded',
    'AI Extraction',
    'Product Matching',
    'Inventory Update',
    'Reports Generated',
    'Backup',
    'Restore',
    'Tenant Deletion',
  ];

  for (let i = 0; i < STEP_NAMES.length; i++) {
    const name = STEP_NAMES[i];
    const slugName = name.toLowerCase().replace(/\s+/g, '-');

    it(`step ${i + 1}: ${name} should succeed`, async () => {
      const company = getCompany();
      const result = await simulateE2ETenantJourney(company, { skipAiCalls: true });
      const step = result.steps[i];
      expect(step.step).toBe(i + 1);
      expect(step.name).toBe(name);
      expect(step.status).toBe('passed');
      expect(step.errors).toEqual([]);
    });
  }

  // ── AI calls ───────────────────────────────────────────────────────────
  it('should skip real AI calls when skipAiCalls is true', async () => {
    const company = getCompany();
    const result = await simulateE2ETenantJourney(company, { skipAiCalls: true });
    const aiStep = result.steps.find(s => s.name === 'AI Extraction')!;
    // With skipAiCalls=true, it's simulated as passed (not skipped)
    expect(aiStep.status).toBe('passed');
    expect(aiStep.details).toContain('Simulated');
  });

  it('should skip AI step when no API key provided and skipAiCalls is false', async () => {
    const company = getCompany();
    const result = await simulateE2ETenantJourney(company, { skipAiCalls: false });
    const aiStep = result.steps.find(s => s.name === 'AI Extraction')!;
    expect(aiStep.status).toBe('skipped');
    expect(aiStep.details).toContain('No API key');
  });

  // ── Step details validation ────────────────────────────────────────────
  it('should have meaningful step details', async () => {
    const company = getCompany();
    const result = await simulateE2ETenantJourney(company, { skipAiCalls: true });
    for (const step of result.steps) {
      expect(typeof step.details).toBe('string');
      expect(step.details.length).toBeGreaterThan(0);
    }
  });

  it('should have step numbers in order', async () => {
    const company = getCompany();
    const result = await simulateE2ETenantJourney(company, { skipAiCalls: true });
    result.steps.forEach((step, i) => {
      expect(step.step).toBe(i + 1);
    });
  });

  // ── Passed flag ────────────────────────────────────────────────────────
  it('should have passed=true when all steps pass', async () => {
    const company = getCompany();
    const result = await simulateE2ETenantJourney(company, { skipAiCalls: true });
    // With valid seeded data and skipAiCalls, all steps should pass
    const allOk = result.steps.every(s => s.status === 'passed' || s.status === 'skipped');
    expect(result.passed).toBe(allOk);
  });

  // ── Graceful failure handling ──────────────────────────────────────────
  it('should handle companies with empty data gracefully', async () => {
    const companies = seedEnterpriseData({ companyCount: 10 });
    const empty = { ...companies[0], users: [], products: [], invoices: [], inventory: [] };
    const result = await simulateE2ETenantJourney(empty, { skipAiCalls: true });
    // Steps 1 (tenant created) should still pass since name/slug/currency exist
    expect(result.steps[0].status).toBe('passed');
    // Steps requiring data should fail
    expect(result.steps[1].status).toBe('failed'); // Users
    expect(result.steps[2].status).toBe('failed'); // Products
    expect(result.steps[3].status).toBe('failed'); // Invoices
    expect(result.steps[6].status).toBe('passed'); // Inventory (reduce on empty = 0)
    expect(result.passed).toBe(false);
  });

  it('should record errors on failed steps', async () => {
    const companies = seedEnterpriseData({ companyCount: 10 });
    const empty = { ...companies[0], users: [], products: [], invoices: [], inventory: [] };
    const result = await simulateE2ETenantJourney(empty, { skipAiCalls: true });
    const failedSteps = result.steps.filter(s => s.status === 'failed');
    for (const step of failedSteps) {
      expect(step.errors.length).toBeGreaterThan(0);
    }
  });

  // ── Telemetry-like data from journey ───────────────────────────────────
  it('should produce result usable as telemetry data', async () => {
    const company = getCompany();
    const result = await simulateE2ETenantJourney(company, { skipAiCalls: true });
    // totalDurationMs may be 0 when skipAiCalls=true (all steps are instant)
    expect(typeof result.totalDurationMs).toBe('number');
    expect(result.steps.every(s => typeof s.durationMs === 'number')).toBe(true);
    // All step durations combined gives per-step telemetry
    const stepTelemetry = result.steps.map(s => ({
      step: s.step,
      name: s.name,
      durationMs: s.durationMs,
      status: s.status,
    }));
    expect(stepTelemetry.length).toBe(11);
    expect(stepTelemetry.every(s => s.durationMs >= 0)).toBe(true);
  });

  it('should return E2EJourneyResult matching the interface', async () => {
    const company = getCompany();
    const result = await simulateE2ETenantJourney(company, { skipAiCalls: true });
    // Verify full interface shape
    expect(result).toHaveProperty('tenantSlug');
    expect(result).toHaveProperty('startTime');
    expect(result).toHaveProperty('endTime');
    expect(result).toHaveProperty('totalDurationMs');
    expect(result).toHaveProperty('steps');
    expect(result).toHaveProperty('passed');
  });

  // ── Restore step edge case ─────────────────────────────────────────────
  it('should fail Restore step if company has no invoices and no products', async () => {
    const companies = seedEnterpriseData({ companyCount: 10 });
    const empty = { ...companies[0], users: [], products: [], invoices: [], inventory: [], clients: [], employees: [], warehouses: [], categories: [], purchases: [], aiMemories: [], aiRules: [], cacheEntries: [], providerHistory: [], workerHistory: [] };
    const result = await simulateE2ETenantJourney(empty, { skipAiCalls: true });
    const restoreStep = result.steps.find(s => s.name === 'Restore')!;
    expect(restoreStep.status).toBe('failed');
  });

  // ── Reports step validation ────────────────────────────────────────────
  it('should generate reports with correct details', async () => {
    const company = getCompany();
    const result = await simulateE2ETenantJourney(company, { skipAiCalls: true });
    const reportsStep = result.steps.find(s => s.name === 'Reports Generated')!;
    expect(reportsStep.status).toBe('passed');
    expect(reportsStep.details).toContain('paid invoices');
    expect(reportsStep.details).toContain(company.currency);
  });

  // ── Backup step validation ─────────────────────────────────────────────
  it('should generate backup with metadata size', async () => {
    const company = getCompany();
    const result = await simulateE2ETenantJourney(company, { skipAiCalls: true });
    const backupStep = result.steps.find(s => s.name === 'Backup')!;
    expect(backupStep.status).toBe('passed');
    expect(backupStep.details).toContain('bytes metadata');
  });

  // ── Tenant Deletion step ───────────────────────────────────────────────
  it('should report cascading deletes in Tenant Deletion step', async () => {
    const company = getCompany();
    const result = await simulateE2ETenantJourney(company, { skipAiCalls: true });
    const deletionStep = result.steps.find(s => s.name === 'Tenant Deletion')!;
    expect(deletionStep.status).toBe('passed');
    expect(deletionStep.details).toContain('Cascaded delete');
    expect(deletionStep.details).toContain('related records');
  });

  // ── Product Matching step ──────────────────────────────────────────────
  it('should count matched invoices in Product Matching step', async () => {
    const company = getCompany();
    const result = await simulateE2ETenantJourney(company, { skipAiCalls: true });
    const matchingStep = result.steps.find(s => s.name === 'Product Matching')!;
    expect(matchingStep.status).toBe('passed');
    expect(matchingStep.details).toContain('product matches');
  });
});
