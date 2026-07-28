// Script to convert mock.module() files to jest.mock() format
const fs = require('fs');

const stdMockTables = [
  'cacheEntry', 'aIRequestLog', 'ruleCandidate',
  'aIMemoryEntry', 'budgetConfig', 'notification',
  'company', 'companyRuntime', 'providerConfig',
  'globalPattern', 'profitSnapshot', 'aIScoreSnapshot',
  'jobQueue', 'inventoryItem', 'productCatalog', 'client',
  'compiledRule',
];

const dbMockBody = stdMockTables.map(t =>
  `    ${t}: { findUnique: jest.fn(() => Promise.resolve(null)), findMany: jest.fn(() => Promise.resolve([])), create: jest.fn(() => Promise.resolve({})), update: jest.fn(() => Promise.resolve({})), delete: jest.fn(() => Promise.resolve({})), deleteMany: jest.fn(() => Promise.resolve({ count: 0 })), upsert: jest.fn(() => Promise.resolve({})), aggregate: jest.fn(() => Promise.resolve({ _sum: { costUsd: 0 }, _count: 0 })), groupBy: jest.fn(() => Promise.resolve([])), count: jest.fn(() => Promise.resolve(0)), findFirst: jest.fn(() => Promise.resolve(null)) },`
).join('\n');

function convertFile(filepath) {
  const content = fs.readFileSync(filepath, 'utf8');
  const lines = content.split('\n');

  // Find the import under test line
  let importUnderTestIdx = -1;
  let importUnderTestLine = '';
  let additionalImports = [];

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (l.startsWith('import {') && !l.includes('bun:test') && !l.includes('mock') && i > 30) {
      importUnderTestIdx = i;
      importUnderTestLine = l;
      // Check for additional imports right after
      for (let j = i + 1; j < lines.length; j++) {
        const lj = lines[j].trim();
        if (lj.startsWith('import {') && !lj.includes('bun:test') && !lj.includes('mock')) {
          additionalImports.push(lj);
        } else {
          break;
        }
      }
      break;
    }
  }

  // Find describe start
  let describeStartIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('describe(')) {
      describeStartIdx = i;
      break;
    }
  }

  // Get test body
  const testBody = lines.slice(describeStartIdx).join('\n');

  // Get helpers between import and describe
  const helperStart = importUnderTestIdx + 1 + additionalImports.length;
  const helperSection = lines.slice(helperStart, describeStartIdx).join('\n');

  // Build new content
  const newContent = `// @ts-nocheck
/**
 * Converted from bun:test to Jest.
 */

import { describe, it, expect, beforeEach } from "bun:test";

// ─── Mock setup ─────────────────────────────────────────────────────────

jest.mock("@/lib/db", () => ({
  db: {
${dbMockBody}
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

${importUnderTestLine}
${additionalImports.join('\n')}

// Get mock references
const { db: mockDb } = jest.requireMock("@/lib/db");
const { logger: mockLogger } = jest.requireMock("@/lib/logger");

${helperSection}

${testBody}`;

  fs.writeFileSync(filepath, newContent);
  console.log('Converted:', filepath, 'length:', newContent.length);
}

const files = [
  'src/lib/ai-fabric/__tests__/cost-optimizer-advanced.test.ts',
  'src/lib/ai-fabric/__tests__/budget-engine-advanced.test.ts',
  'src/lib/ai-fabric/__tests__/economy-engine-observatory.test.ts',
  'src/lib/ai-fabric/__tests__/learning-engine-advanced.test.ts',
];

for (const f of files) {
  convertFile(f);
}
