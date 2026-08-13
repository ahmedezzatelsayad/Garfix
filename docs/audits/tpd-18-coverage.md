# TPD-18 FIX (Audit v2 · Phase 4): Test Coverage Threshold

## Configuration
Coverage threshold: 70% on `src/lib` + `src/app/api`

## Implementation
The `test:ci` script in `package.json` runs with `--coverage`.
Coverage is reported by Bun's built-in coverage collector.

## Current State
- 108 production test files (founder-validation excluded from CI)
- Coverage measurement requires running full test suite with `--coverage`
- The threshold is documented but not yet enforced as a hard gate
- Phase 5 will add a coverage gate script that fails CI if below 70%

## Plan
1. Run `bun test --coverage` to get baseline
2. Add `scripts/check-coverage.mjs` that parses coverage and exits 1 if < 70%
3. Wire into CI as a required check
