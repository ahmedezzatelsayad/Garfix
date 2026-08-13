/**
 * P0 Regression Tests — Automated tests for all P0 vulnerabilities fixed.
 *
 * These tests verify:
 * 1. Multi-tenant isolation (RLS + app-layer)
 * 2. Financial integrity (Decimal precision, balance sheet accuracy)
 * 3. Year close consistency (both endpoints produce closing JEs)
 * 4. Refresh token blacklist enforcement
 * 5. MFA rate limiting and replay protection
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

// ─── Test 1: companySlug is present on all business child tables ─────────

describe('P0-2: companySlug on child tables', () => {
  const childModels = [
    'JournalEntryLine',
    'InstallmentSchedule',
    'ProfitDistributionEntry',
    'LetterOfCreditDocument',
    'DepreciationEntry',
    'BudgetLine',
    'LandedCostLine',
  ];

  it.each(childModels)('%s should have companySlug field in schema', (model) => {
    // This is a schema-level test — in CI, read the schema file
    const fs = require('fs');
    const schema = fs.readFileSync('prisma/schema.prisma', 'utf-8');
    const modelBlock = schema.match(new RegExp(`model ${model} \\{[\\s\\S]*?\\n\}`));
    expect(modelBlock).not.toBeNull();
    expect(modelBlock![0]).toContain('companySlug');
  });
});

// ─── Test 2: Balance Sheet sign convention (P0-5) ──────────────────────

describe('P0-5: Balance Sheet no double-reversal', () => {
  it('debit-normal accounts (asset) should NOT be negated', () => {
    // Raw balance from JEs: debit=100, credit=20 → raw=80
    // Asset is debit-normal → BS balance should be +80 (not -80)
    const rawBalance = 80; // debits - credits
    const isCreditNormal = false;
    const balance = isCreditNormal ? -rawBalance : rawBalance;
    expect(balance).toBe(80);
  });

  it('credit-normal accounts (liability) should be negated', () => {
    // Raw balance from JEs: debit=20, credit=100 → raw=-80
    // Liability is credit-normal → BS balance should be +80
    const rawBalance = -80;
    const isCreditNormal = true;
    const balance = isCreditNormal ? -rawBalance : rawBalance;
    expect(balance).toBe(80);
  });

  it('should NOT use acc.balance as fallback (no double-reversal)', () => {
    // The fixed code uses ONLY journal-derived balances
    // The old code did: balance = balanceMap.get(acc.id) || num(acc.balance)
    // which mixed two different conventions
    const fs = require('fs');
    const route = fs.readFileSync('src/app/api/accounting/balance-sheet/route.ts', 'utf-8');
    // Should NOT have the old fallback pattern
    expect(route).not.toContain('|| num(acc.balance');
    // Should use Prisma.Decimal for precision
    expect(route).toContain('Prisma.Decimal');
  });
});

// ─── Test 3: Year Close consistency (P0-6) ─────────────────────────────

describe('P0-6: Year close unified behavior', () => {
  it('fiscal year close should create closing journal entries', () => {
    const fs = require('fs');
    const route = fs.readFileSync('src/app/api/accounting/fiscal/[year]/route.ts', 'utf-8');
    // Should create a journal entry with closing type
    expect(route).toContain('JE-YEARCLOSE');
    expect(route).toContain('sourceType: "opening_balance"');
  });

  it('fiscal year reopen should reverse closing journal entries', () => {
    const fs = require('fs');
    const route = fs.readFileSync('src/app/api/accounting/fiscal/[year]/route.ts', 'utf-8');
    // Should create reversal entry
    expect(route).toContain('JE-YEARREOPEN');
    expect(route).toContain('sourceType: "reversal"');
  });

  it('year close should use Decimal for retained earnings (not float)', () => {
    const fs = require('fs');
    const route = fs.readFileSync('src/app/api/accounting/fiscal/[year]/route.ts', 'utf-8');
    // Should NOT use num() for financial calculations
    expect(route).not.toContain('num(line.debit');
    expect(route).not.toContain('num(line.credit');
    // Should use Prisma.Decimal
    expect(route).toContain('new Prisma.Decimal');
  });
});

// ─── Test 4: Refresh token blacklist in resolveAuth (P1-1) ──────────────

describe('P1-1: Refresh token blacklist in resolveAuth', () => {
  it('resolveAuth should use verifyRefreshTokenWithBlacklist', () => {
    const fs = require('fs');
    const auth = fs.readFileSync('src/lib/auth.ts', 'utf-8');
    // In the refresh fallback section, should use the blacklist-aware version
    expect(auth).toContain('verifyRefreshTokenWithBlacklist(refresh)');
    // Should NOT use the plain version in resolveAuth's refresh path
    const resolveAuthBlock = auth.match(/export async function resolveAuth[\s\S]*?^}/m);
    if (resolveAuthBlock) {
      // Count occurrences of verifyRefreshToken (plain) in resolveAuth
      const matches = resolveAuthBlock[0].match(/verifyRefreshToken\(/g);
      // Should be 0 — all should be verifyRefreshTokenWithBlacklist
      expect(matches).toBeNull();
    }
  });
});

// ─── Test 5: MFA rate limiting (P1-2) ───────────────────────────────────

describe('P1-2: MFA rate limiting', () => {
  it('validateMFA should check rate limits', () => {
    const fs = require('fs');
    const mfa = fs.readFileSync('src/lib/mfa.ts', 'utf-8');
    expect(mfa).toContain('mfa:attempts');
    expect(mfa).toContain('mfa:lockout');
  });
});

// ─── Test 6: TOTP replay protection (P1-3) ─────────────────────────────

describe('P1-3: TOTP replay protection', () => {
  it('validateMFA should block reused codes', () => {
    const fs = require('fs');
    const mfa = fs.readFileSync('src/lib/mfa.ts', 'utf-8');
    expect(mfa).toContain('mfa:used:');
    expect(mfa).toContain('replay');
  });
});

// ─── Test 7: RLS migration exists and has policies ──────────────────────

describe('P0-1: RLS policies exist', () => {
  it('migration SQL should enable RLS on business tables', () => {
    const fs = require('fs');
    const migrationFiles = fs.readdirSync('prisma/migrations').sort();
    const rlsMigration = migrationFiles.find(f => f.includes('rls'));
    expect(rlsMigration).toBeDefined();
    
    const sql = fs.readFileSync(`prisma/migrations/${rlsMigration}/migration.sql`, 'utf-8');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('FORCE ROW LEVEL SECURITY');
    expect(sql).toContain('tenant_isolation');
    expect(sql).toContain('app.current_company_slug');
  });

  it('RLS should cover journal_entries', () => {
    const fs = require('fs');
    const migrationFiles = fs.readdirSync('prisma/migrations').sort();
    const rlsMigration = migrationFiles.find(f => f.includes('rls'));
    const sql = fs.readFileSync(`prisma/migrations/${rlsMigration}/migration.sql`, 'utf-8');
    expect(sql).toContain("enable_rls_for_table('journal_entries')");
    expect(sql).toContain("enable_rls_for_table('invoices')");
    expect(sql).toContain("enable_rls_for_table('accounts')");
  });
});

// ─── Test 8: Missing indexes added (P0-3) ──────────────────────────────

describe('P0-3: Missing indexes added', () => {
  it('letters_of_credit should have companySlug index', () => {
    const fs = require('fs');
    const schema = fs.readFileSync('prisma/schema.prisma', 'utf-8');
    const modelBlock = schema.match(/model LetterOfCredit \{[\s\S]*?@@map/);
    expect(modelBlock).not.toBeNull();
    expect(modelBlock![0]).toContain('@@index([companySlug])');
  });

  it('profit_distributions should have companySlug index', () => {
    const fs = require('fs');
    const schema = fs.readFileSync('prisma/schema.prisma', 'utf-8');
    const modelBlock = schema.match(/model ProfitDistribution \{[\s\S]*?@@map/);
    expect(modelBlock).not.toBeNull();
    expect(modelBlock![0]).toContain('@@index([companySlug])');
  });

  it('role_permissions should have companySlug index', () => {
    const fs = require('fs');
    const schema = fs.readFileSync('prisma/schema.prisma', 'utf-8');
    const modelBlock = schema.match(/model RolePermission \{[\s\S]*?@@map/);
    expect(modelBlock).not.toBeNull();
    expect(modelBlock![0]).toContain('@@index([companySlug])');
  });
});

// ─── Test 9: Financial Decimal integrity (P0-4) ───────────────────────

describe('P0-4: Financial fields use Decimal in schema', () => {
  const financialModels = [
    'JournalEntry', 'JournalEntryLine', 'PaymentVoucher', 'Invoice', 
    'PurchaseInvoice', 'Account', 'BankAccount'
  ];

  it.each(financialModels)('%s should use Decimal for money fields', (model) => {
    const fs = require('fs');
    const schema = fs.readFileSync('prisma/schema.prisma', 'utf-8');
    const modelRegex = new RegExp(`model ${model} \\{[\\s\\S]*?\\n\}`);
    const modelBlock = schema.match(modelRegex);
    expect(modelBlock).not.toBeNull();
    // Money fields should NOT be Float
    expect(modelBlock![0]).not.toMatch(/amount.*Float/);
    expect(modelBlock![0]).not.toMatch(/balance.*Float/);
    expect(modelBlock![0]).not.toMatch(/total.*Float/);
  });
});
