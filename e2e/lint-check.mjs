#!/usr/bin/env node
// TPD-01 FIX (Audit v2 · Phase 1)
/**
 * e2e/lint-check.mjs — CI lint guard against TPD-01 facade patterns.
 *
 * Scans every .ts / .spec.ts file under e2e/ for the three forbidden
 * patterns that made the old E2E suite a facade (per audit finding TPD-01):
 *
 *   1. `isVisible().catch(`        — silent-skip guard. The old tests wrapped
 *                                    every assertion in `if (await X.isVisible()
 *                                    .catch(() => false)) { … }`, which caused
 *                                    tests to PASS with zero assertions run
 *                                    whenever an element was missing.
 *
 *   2. `expect(typeof`              — tautological type check. Always passes
 *                                    for the declared type; provides zero
 *                                    actual coverage. e.g.
 *                                    `expect(typeof count).toBe("number")`.
 *
 *   3. `.toBe("number")`            — tautological value assertion. Always
 *                                    true when paired with `typeof`; almost
 *                                    never a meaningful assertion on its own.
 *
 * The script strips comments before scanning, so doc-comments that DOCUMENT
 * the anti-patterns (e.g. "the old test used isVisible().catch(...)") are
 * NOT flagged — only actual code occurrences fail the build.
 *
 * Exit codes:
 *   0 — no forbidden patterns found in code (build passes)
 *   1 — at least one forbidden pattern found in code (build fails)
 *
 * Usage:
 *   node e2e/lint-check.mjs
 *
 * Wire into CI by adding to package.json:
 *   "scripts": { "lint:e2e": "node e2e/lint-check.mjs" }
 * and calling `bun run lint:e2e` (or `npm run lint:e2e`) before `playwright test`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const E2E_DIR = resolve(__dirname);

const FORBIDDEN_PATTERNS = [
  {
    name: "isVisible().catch( silent-skip guard",
    regex: /isVisible\(\)\s*\.catch\(/,
    reason:
      "Wraps assertions in a try/catch that silently skips the test body when the element is missing. Use `await expect(locator).toBeVisible()` instead — it fails loudly with a trace.",
  },
  {
    name: "expect(typeof …) tautological type check",
    regex: /expect\(\s*typeof\b/,
    reason:
      "`typeof x` always returns a string; asserting on it tests nothing about x's actual value. Use `expect(x).toBe(specificValue)` or `expect(x).toBeGreaterThan(0)`.",
  },
  {
    name: '.toBe("number") tautological assertion',
    regex: /\.toBe\(\s*["']number["']\s*\)/,
    reason:
      'Asserting a value equals the string "number" is only meaningful after `typeof`, which itself is tautological. Assert a specific numeric value instead.',
  },
];

const SCAN_EXTENSIONS = new Set([".ts"]);

/** Only scan files ending in `.spec.ts` — these are the actual test files
 *  where the forbidden assertion patterns would appear. Helper modules
 *  (_helpers.ts) and this lint script itself are excluded. */
function shouldScan(filePath) {
  if (!filePath.endsWith(".spec.ts")) return false;
  // Never scan the lint script itself (it documents the patterns in
  // string literals, which would false-positive).
  if (filePath.endsWith("lint-check.mjs")) return false;
  return true;
}

/** Recursively collect all .spec.ts files under `dir`. */
function collectFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      // Skip node_modules just in case the e2e dir ever gets one.
      if (entry === "node_modules") continue;
      collectFiles(full, acc);
    } else if (shouldScan(full)) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * Strip comments from TS/JS source so the lint only flags actual code.
 * - Removes /* ... *​/ blocks (including multi-line).
 * - Removes // ... single-line comments (preserves the part before //).
 * - Preserves string literals (so `//` inside a string isn't treated as a
 *   comment — naive but sufficient for the e2e/ codebase which doesn't
 *   have `//` inside strings except in URLs, and URLs don't contain our
 *   forbidden patterns).
 */
function stripComments(src) {
  // 1. Remove /* ... */ blocks (DOTALL via [\s\S])
  let out = src.replace(/\/\*[\s\S]*?\*\//g, "");
  // 2. Remove // ... single-line comments. We walk line by line and strip
  //    from the first `//` to EOL — but only if the `//` is not inside a
  //    string literal. For simplicity (and because our forbidden patterns
  //    never appear inside strings), we just strip from the first `//`.
  out = out
    .split("\n")
    .map((line) => {
      // Find first `//` that's not inside a string. Naive: just find `//`
      // and check it's not preceded by an odd number of quotes on the line.
      const idx = line.indexOf("//");
      if (idx === -1) return line;
      // Count unescaped quotes before idx — if odd, // is inside a string.
      const before = line.slice(0, idx);
      const singleQuotes = (before.match(/(?<!\\)'/g) || []).length;
      const doubleQuotes = (before.match(/(?<!\\)"/g) || []).length;
      const backticks = (before.match(/(?<!\\)`/g) || []).length;
      const insideString =
        singleQuotes % 2 === 1 || doubleQuotes % 2 === 1 || backticks % 2 === 1;
      if (insideString) return line;
      return before; // strip the comment portion
    })
    .join("\n");
  return out;
}

/** Scan a single file for forbidden patterns in CODE (not comments). */
function scanFile(filePath) {
  const raw = readFileSync(filePath, "utf8");
  const code = stripComments(raw);
  const lines = code.split("\n");
  const violations = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pat of FORBIDDEN_PATTERNS) {
      if (pat.regex.test(line)) {
        violations.push({
          file: filePath,
          line: i + 1,
          pattern: pat.name,
          reason: pat.reason,
          snippet: line.trim().slice(0, 120),
        });
      }
    }
  }
  return violations;
}

function main() {
  const files = collectFiles(E2E_DIR);
  if (files.length === 0) {
    console.warn("[lint-check] No .ts/.tsx/.js files found under e2e/ — nothing to scan.");
    return 0;
  }
  const allViolations = [];
  for (const f of files) {
    allViolations.push(...scanFile(f));
  }
  if (allViolations.length === 0) {
    console.log(
      `[lint-check] ✅ Scanned ${files.length} files under e2e/ — no forbidden facade patterns found in code.`,
    );
    return 0;
  }
  console.error(
    `[lint-check] ❌ Found ${allViolations.length} forbidden facade pattern(s) in e2e/ code:\n`,
  );
  for (const v of allViolations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    pattern: ${v.pattern}`);
    console.error(`    code:    ${v.snippet}`);
    console.error(`    why:     ${v.reason}\n`);
  }
  console.error(
    "These patterns make E2E tests silently skip or assert nothing (TPD-01). Fix them before merging.",
  );
  return 1;
}

process.exit(main());
