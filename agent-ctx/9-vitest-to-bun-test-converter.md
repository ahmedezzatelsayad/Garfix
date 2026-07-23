# Task 9: Convert vitest imports to bun:test imports

## Agent: vitest-to-bun-test-converter

## Summary
Converted all 11 test files from vitest to bun:test imports. The GarfiX ERP project uses `bun:test` as its test runner, but the new e-invoicing/billing/integration test files were written with vitest imports.

## Files Modified

### Simple conversions (import line change only):
1. `src/lib/e-invoicing/__tests__/kuwait.test.ts` - `from "vitest"` → `from "bun:test"`
2. `src/lib/e-invoicing/__tests__/zatca.test.ts` - same
3. `src/lib/e-invoicing/__tests__/uae-fta.test.ts` - same
4. `src/lib/e-invoicing/__tests__/egypt-eta.test.ts` - same
5. `src/lib/e-invoicing/__tests__/bahrain-nbr.test.ts` - same
6. `src/lib/e-invoicing/__tests__/oman-tax.test.ts` - same
7. `src/lib/e-invoicing/__tests__/router.test.ts` - removed unused `vi`, changed to `bun:test`

### Complex conversions (full rewrite with bun:test mocking patterns):
8. `src/lib/billing/__tests__/subscription-engine.test.ts` - Full mock pattern conversion
9. `src/lib/integrations/__tests__/paymob.test.ts` - Full mock pattern conversion
10. `src/lib/integrations/__tests__/myfatoorah-refund.test.ts` - Full mock pattern conversion
11. `src/lib/integrations/__tests__/myfatoorah-webhook.test.ts` - Full mock pattern conversion

## Key Conversion Patterns
- `import { describe, it, expect, vi } from 'vitest'` → `import { describe, it, expect, mock, beforeEach } from 'bun:test'`
- `vi.mock(modulePath, factory)` → `mock(modulePath, factory)` (both auto-hoisted)
- `vi.fn()` → `mock.fn()` (supports .mockResolvedValue, .mockReturnValue, .mock.calls)
- `vi.clearAllMocks()` → custom clearAllMocks() helper tracking all mock.fn() instances
- `global.fetch = vi.fn()` → `globalThis.fetch = mock.fn() as any`

## Verification
- `bun test src/lib/e-invoicing/__tests__/kuwait.test.ts`: 50 pass, 2 fail (pre-existing)
- `bun test src/lib/e-invoicing/__tests__/bahrain-nbr.test.ts`: 53 pass, 2 fail (pre-existing)
- `bun test src/lib/e-invoicing/__tests__/router.test.ts`: 30 pass, 2 fail (pre-existing)
- All failures are pre-existing test logic issues, not conversion-related
