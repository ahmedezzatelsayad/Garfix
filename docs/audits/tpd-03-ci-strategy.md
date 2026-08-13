# TPD-03 — CI Test-File Strategy

> // TPD-03 FIX (Audit v2 · Phase 2)
>
> **Problem**: 1,628 of 1,742 test files in the repository are auto-generated
> duplicates that test the synthetic-data seeder under
> `src/lib/founder-validation/__tests__/`. They all use `@ts-nocheck` and
> contribute nothing to production-code regression coverage. Only 114 test
> files actually exercise production code paths. Running the full set in CI
> wastes ~80% of CI minutes and hides real failures behind thousands of
> green-check seeder tests.

## Decision

Split `bun test` into two scripts:

| Script          | Purpose                                | Target audience              |
| --------------- | -------------------------------------- | ---------------------------- |
| `test:ci`       | Runs **production-code** tests only    | CI pipeline (per-commit)     |
| `test:founder`  | Runs the founder-validation suite only | Founder / nightly validation |

### `test:ci`

```bash
bun test --isolate --coverage \
  $(find src __tests__ -type f \( -name '*.test.ts' -o -name '*.test.tsx' \) \
    -not -path '*/founder-validation/__tests__/*' 2>/dev/null | tr '\n' ' ')
```

- Uses POSIX `find` (available on Linux/macOS CI runners and on Windows via
  Git Bash / WSL).
- Excludes every test file under any `founder-validation/__tests__/` path.
- Includes `*.test.ts` and `*.test.tsx` from `src/` and the top-level
  `__tests__/` directory (regression suites for p0, accessibility, etc).
- `--coverage` is preserved so the production-code coverage report still
  reflects the full picture.

### `test:founder`

```bash
bun test --isolate --preload ./test.preload.ts \
  src/lib/founder-validation/__tests__/
```

- Explicit target for the synthetic-data-seeder validation suite.
- Run on a **nightly** schedule (not per-commit) — these tests do not gate
  production deploys; they validate the founder's data-seeding
  reproducibility.

## Why `--pattern` was not used

`bun test` does **not** support a `--pattern` flag for file-path negation.
Its `--filter` flag filters by test-name regex, not file-path globbing, so
it cannot exclude a directory. The `find` + positional-arg approach is the
canonical way to scope `bun test` to a subset of files.

## Migration plan for new test directories

When you add a new top-level test directory (e.g. `src/modules/billing/__tests__/`),
no change to `test:ci` is required — `find src ...` already picks it up.

If you add a **new seeder-style** directory that should be excluded from CI,
append another `-not -path '*/<dir>/*'` clause to the `test:ci` script.

## Verification (manual, after applying this fix)

```bash
# Should print a list with NO founder-validation paths:
find src __tests__ -type f \( -name '*.test.ts' -o -name '*.test.tsx' \) \
  -not -path '*/founder-validation/__tests__/*' | wc -l
# Expected: ~114 (the production-code test count)

# Founder-validation tests still run via:
bun run test:founder
```

## Phase 3 follow-up

- Add a CI step that asserts the production-test count stays under 200
  (guard against re-bloat).
- Investigate deleting the 1,628 generated duplicates entirely once the
  seeder stabilises — they are not unit tests in the traditional sense
  and their `@ts-nocheck` pragma masks real type drift in
  `src/lib/founder-validation/`.
