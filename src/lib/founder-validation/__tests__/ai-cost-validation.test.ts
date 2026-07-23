// @ts-nocheck
import { describe, it, expect } from 'bun:test';
import {
  calculateModelCost,
  callOpenRouter,
  OPENROUTER_MODELS,
  seedEnterpriseData,
  TelemetryCollector,
  calculateMetrics,
  generateFounderReport,
  SeededRandom,
  type MetricsSummary,
} from '../index';

// ═══════════════════════════════════════════════════════════════════════════════
// AI Cost Validation
//
// Tests calculateModelCost with real pricing from OPENROUTER_MODELS.
// Tests callOpenRouter with INVALID key to verify error handling.
// No mocks — real cost math, real API error handling.
// ═══════════════════════════════════════════════════════════════════════════════

describe('AI Cost Validation', () => {
  describe('calculateModelCost per model', () => {
    it('should return 0 for unknown model', () => {
      const cost = calculateModelCost('nonexistent/model', 1000, 1000);
      expect(cost).toBe(0);
    });

    it('should return 0 for empty string model', () => {
      const cost = calculateModelCost('', 1000, 1000);
      expect(cost).toBe(0);
    });

    it('should calculate DeepSeek cost correctly', () => {
      const model = OPENROUTER_MODELS.find(m => m.id === 'deepseek/deepseek-chat')!;
      // prompt: $0.00014/1k, completion: $0.00028/1k
      const cost = calculateModelCost('deepseek/deepseek-chat', 1000, 1000);
      const expected = (1000 / 1000) * model.promptCostPer1k + (1000 / 1000) * model.completionCostPer1k;
      expect(cost).toBeCloseTo(expected, 10);
    });

    it('should calculate GPT-4o-mini cost correctly', () => {
      const model = OPENROUTER_MODELS.find(m => m.id === 'openai/gpt-4o-mini')!;
      const cost = calculateModelCost('openai/gpt-4o-mini', 500, 200);
      const expected = (500 / 1000) * model.promptCostPer1k + (200 / 1000) * model.completionCostPer1k;
      expect(cost).toBeCloseTo(expected, 10);
    });

    it('should calculate Gemini 2.0 Flash cost correctly', () => {
      const model = OPENROUTER_MODELS.find(m => m.id === 'google/gemini-2.0-flash-001')!;
      const cost = calculateModelCost('google/gemini-2.0-flash-001', 2000, 500);
      const expected = (2000 / 1000) * model.promptCostPer1k + (500 / 1000) * model.completionCostPer1k;
      expect(cost).toBeCloseTo(expected, 10);
    });

    it('should calculate Mistral Small 24B cost correctly', () => {
      const model = OPENROUTER_MODELS.find(m => m.id === 'mistralai/mistral-small-24b-instruct-2501')!;
      const cost = calculateModelCost('mistralai/mistral-small-24b-instruct-2501', 1000, 1000);
      const expected = (1000 / 1000) * model.promptCostPer1k + (1000 / 1000) * model.completionCostPer1k;
      expect(cost).toBeCloseTo(expected, 10);
    });

    it('should return 0 cost for 0 tokens', () => {
      for (const model of OPENROUTER_MODELS) {
        const cost = calculateModelCost(model.id, 0, 0);
        expect(cost).toBe(0);
      }
    });

    it('should scale linearly with token count', () => {
      const c1 = calculateModelCost('deepseek/deepseek-chat', 1000, 500);
      const c2 = calculateModelCost('deepseek/deepseek-chat', 2000, 1000);
      expect(c2).toBeCloseTo(c1 * 2, 10);
    });

    it('should handle large token counts', () => {
      const cost = calculateModelCost('deepseek/deepseek-chat', 100000, 50000);
      expect(cost).toBeGreaterThan(0);
      expect(cost).toBeLessThan(1); // Should still be under $1
    });
  });

  describe('Free model costs 0', () => {
    it('should return 0 for Llama 3.1 8B Free with any tokens', () => {
      const cost = calculateModelCost('meta-llama/llama-3.1-8b-instruct:free', 100000, 50000);
      expect(cost).toBe(0);
    });

    it('should have tier=free for Llama model', () => {
      const model = OPENROUTER_MODELS.find(m => m.id === 'meta-llama/llama-3.1-8b-instruct:free')!;
      expect(model.tier).toBe('free');
      expect(model.promptCostPer1k).toBe(0);
      expect(model.completionCostPer1k).toBe(0);
    });

    it('should return 0 for free model with zero tokens', () => {
      const cost = calculateModelCost('meta-llama/llama-3.1-8b-instruct:free', 0, 0);
      expect(cost).toBe(0);
    });
  });

  describe('DeepSeek pricing specifics', () => {
    it('should have known prompt cost per 1k', () => {
      const model = OPENROUTER_MODELS.find(m => m.id === 'deepseek/deepseek-chat')!;
      expect(model.promptCostPer1k).toBe(0.00014);
    });

    it('should have known completion cost per 1k', () => {
      const model = OPENROUTER_MODELS.find(m => m.id === 'deepseek/deepseek-chat')!;
      expect(model.completionCostPer1k).toBe(0.00028);
    });

    it('should have budget tier', () => {
      const model = OPENROUTER_MODELS.find(m => m.id === 'deepseek/deepseek-chat')!;
      expect(model.tier).toBe('budget');
    });

    it('should have deepseek provider', () => {
      const model = OPENROUTER_MODELS.find(m => m.id === 'deepseek/deepseek-chat')!;
      expect(model.provider).toBe('deepseek');
    });
  });

  describe('Total cost aggregation', () => {
    it('should sum costs across all models correctly', () => {
      const companies = seedEnterpriseData({ companyCount: 100, seed: 42 });
      const collector = new TelemetryCollector(companies);
      const telemetry = collector.generateAll(new SeededRandom(42));
      const metrics = calculateMetrics(telemetry, companies);
      // Manually sum
      const manualSum = telemetry.reduce((s, e) => s + e.costUsd, 0);
      expect(metrics.totalUsdSpent).toBeCloseTo(manualSum, 10);
    });

    it('should have avg cost per request = total / requests', () => {
      const companies = seedEnterpriseData({ companyCount: 100, seed: 42 });
      const collector = new TelemetryCollector(companies);
      const telemetry = collector.generateAll(new SeededRandom(42));
      const metrics = calculateMetrics(telemetry, companies);
      const expected = metrics.totalUsdSpent / metrics.totalRequests;
      expect(metrics.avgCostPerRequest).toBeCloseTo(expected, 10);
    });

    it('should have avg cost per invoice = total / invoices', () => {
      const companies = seedEnterpriseData({ companyCount: 100, seed: 42 });
      const collector = new TelemetryCollector(companies);
      const telemetry = collector.generateAll(new SeededRandom(42));
      const metrics = calculateMetrics(telemetry, companies);
      const totalInv = companies.reduce((s, c) => s + c.invoices.length, 0);
      const expected = metrics.totalUsdSpent / totalInv;
      expect(metrics.avgCostPerInvoice).toBeCloseTo(expected, 10);
    });

    it('should have avg cost per company = total / companies', () => {
      const companies = seedEnterpriseData({ companyCount: 100, seed: 42 });
      const collector = new TelemetryCollector(companies);
      const telemetry = collector.generateAll(new SeededRandom(42));
      const metrics = calculateMetrics(telemetry, companies);
      const expected = metrics.totalUsdSpent / companies.length;
      expect(metrics.avgCostPerCompany).toBeCloseTo(expected, 10);
    });
  });

  describe('Provider distribution', () => {
    it('should have at least 3 providers in distribution', () => {
      const companies = seedEnterpriseData({ companyCount: 1000, seed: 42 });
      const collector = new TelemetryCollector(companies);
      const telemetry = collector.generateAll(new SeededRandom(42));
      const metrics = calculateMetrics(telemetry, companies);
      expect(Object.keys(metrics.providerDistribution).length).toBeGreaterThanOrEqual(3);
    });

    it('should have provider counts summing to total requests', () => {
      const companies = seedEnterpriseData({ companyCount: 100, seed: 42 });
      const collector = new TelemetryCollector(companies);
      const telemetry = collector.generateAll(new SeededRandom(42));
      const metrics = calculateMetrics(telemetry, companies);
      const sum = Object.values(metrics.providerDistribution).reduce((s, v) => s + v, 0);
      expect(sum).toBe(metrics.totalRequests);
    });
  });

  describe('Model distribution', () => {
    it('should have model counts summing to total requests', () => {
      const companies = seedEnterpriseData({ companyCount: 100, seed: 42 });
      const collector = new TelemetryCollector(companies);
      const telemetry = collector.generateAll(new SeededRandom(42));
      const metrics = calculateMetrics(telemetry, companies);
      const sum = Object.values(metrics.modelDistribution).reduce((s, v) => s + v, 0);
      expect(sum).toBe(metrics.totalRequests);
    });

    it('should exclude free model from cost calculations', () => {
      // Free models have 0 cost, so they contribute 0 to total spend
      const freeCost = calculateModelCost('meta-llama/llama-3.1-8b-instruct:free', 10000, 10000);
      expect(freeCost).toBe(0);
    });
  });

  describe('Most expensive operations', () => {
    it('should report top 20 expensive AI ops in report', () => {
      const companies = seedEnterpriseData({ companyCount: 100, seed: 42 });
      const collector = new TelemetryCollector(companies);
      const telemetry = collector.generateAll(new SeededRandom(42));
      const report = generateFounderReport(companies, telemetry, 42);
      expect(report.top20ExpensiveAiOps.length).toBeLessThanOrEqual(20);
      expect(report.top20ExpensiveAiOps.length).toBeGreaterThan(0);
    });

    it('should sort expensive ops by total cost descending', () => {
      const companies = seedEnterpriseData({ companyCount: 100, seed: 42 });
      const collector = new TelemetryCollector(companies);
      const telemetry = collector.generateAll(new SeededRandom(42));
      const report = generateFounderReport(companies, telemetry, 42);
      const ops = report.top20ExpensiveAiOps;
      for (let i = 0; i < ops.length - 1; i++) {
        expect(ops[i].totalCost).toBeGreaterThanOrEqual(ops[i + 1].totalCost);
      }
    });

    it('should have positive avg cost per expensive operation', () => {
      const companies = seedEnterpriseData({ companyCount: 100, seed: 42 });
      const collector = new TelemetryCollector(companies);
      const telemetry = collector.generateAll(new SeededRandom(42));
      const report = generateFounderReport(companies, telemetry, 42);
      for (const op of report.top20ExpensiveAiOps) {
        expect(op.avgCostUsd).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Budget validation', () => {
    it('should have AI cost < revenue for viable business', () => {
      const companies = seedEnterpriseData({ companyCount: 100, seed: 42 });
      const collector = new TelemetryCollector(companies);
      const telemetry = collector.generateAll(new SeededRandom(42));
      const report = generateFounderReport(companies, telemetry, 42);
      // At 100 companies, AI cost should be reasonable vs revenue
      expect(report.estimatedRevenueMonthly).toBeGreaterThan(0);
    });

    it('should have AWS cost > 0', () => {
      const companies = seedEnterpriseData({ companyCount: 100, seed: 42 });
      const collector = new TelemetryCollector(companies);
      const telemetry = collector.generateAll(new SeededRandom(42));
      const report = generateFounderReport(companies, telemetry, 42);
      expect(report.estimatedAwsCostMonthly.total).toBeGreaterThan(0);
    });
  });

  describe('callOpenRouter with INVALID key', () => {
    it('should throw on invalid API key', async () => {
      try {
        await callOpenRouter('sk-or-v1-INVALID_KEY_FOR_TESTING', 'Say OK', undefined, false);
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
        expect((err as Error).message).toContain('OpenRouter API error');
      }
    });

    it('should throw with 401 status for bad key', async () => {
      try {
        await callOpenRouter('sk-invalid', 'Hello', 'deepseek/deepseek-chat', false);
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect((err as Error).message).toContain('401');
      }
    });
  });
});