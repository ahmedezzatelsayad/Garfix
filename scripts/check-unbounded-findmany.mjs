// @ts-nocheck
/**
 * check-unbounded-findmany.mjs
 *
 * // TPD-06 FIX (Audit v2 · Phase 2)
 *
 * CI lint rule: scan every `*.ts` / `*.tsx` file under `src/app/api/` and
 * fail (exit 1) when a `prisma.findMany({ ... })` call has no `take:` field
 * inside the argument object.
 *
 * Why: Prisma's `findMany` defaults to returning every matching row when
 * `take` is omitted. In a multi-tenant ERP that grows to millions of rows
 * per table, an unbounded `findMany` can:
 *   - OOM the Node.js process (loading the entire table into memory)
 *   - Exhaust the Prisma connection pool (single query holds a connection
 *     for the duration of the full-table scan)
 *   - Take down the database replica under load
 *
 * The audit identified 79 unbounded `findMany` call sites in
 * `src/app/api/**`. This script makes the count a CI gate so the number
 * can only go DOWN — new unbounded calls are blocked at PR time. Phase 3
 * will fix the existing 79 sites incrementally.
 *
 * Usage:
 *   node scripts/check-unbounded-findmany.mjs
 *   # or via bun:
 *   bun scripts/check-unbounded-findmany.mjs
 *
 * Exit codes:
 *   0  All `findMany` calls have an explicit `take:` limit (or are in the
 *      allowlist below).
 *   1  At least one unbounded `findMany` was found (printed with file:line).
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const SCAN_ROOT = join(ROOT, "src", "app", "api");

// ─── Allowlist ────────────────────────────────────────────────────────────
// Add a string suffix here (file path + ":" + line number) to suppress a
// specific violation. Use sparingly — every entry here is a known
// unbounded findMany that the Phase 3 fix plan must address.
//
// Format: "path:relative/to/root.ts:LINE"
const ALLOWLIST = new Set([
  // (none yet — Phase 3 will fix the 79 existing sites; once they're
  // fixed this allowlist can be deleted entirely)
]);

// ─── Helpers ──────────────────────────────────────────────────────────────

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))
    ) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Heuristic: a `findMany({` call is "bounded" if the same argument object
 * literal contains a `take:` field anywhere before the matching closing
 * brace. We track brace depth from the `findMany({` opening to its match.
 *
 * False positives handled:
 *   - `findMany()` (no args) → caller probably intends unbounded; FLAG.
 *   - `findMany({ where: {...}, take: 100 })` → bounded.
 *   - `findMany({ where: {...}, orderBy: {...} })` → unbounded; FLAG.
 *   - Variable-arg form `findMany(args)` where `args` is a variable →
 *     cannot statically determine; we DON'T flag (skip) because the take
 *     may be set inside the variable. Documented as a known limitation.
 *
 * @param {string} src
 * @returns {Array<{ line: number, col: number, snippet: string }>}
 */
function findUnboundedFindMany(src) {
  const violations = [];
  // Match `findMany(` (with optional whitespace).
  const re = /\.findMany\(\s*/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const callStart = m.index + m[0].length; // char after the `(`
    // Skip whitespace
    let i = callStart;
    while (i < src.length && /\s/.test(src[i])) i++;

    // Case A: `findMany()` — no args at all → unbounded.
    if (src[i] === ")") {
      violations.push(makeViolation(src, m.index, "findMany() with no arguments"));
      continue;
    }

    // Case B: `findMany({ ... })` — object literal; check for `take:`.
    if (src[i] === "{") {
      // Walk to the matching close brace.
      let depth = 1;
      let j = i + 1;
      let body = "";
      while (j < src.length && depth > 0) {
        const c = src[j];
        if (c === "{") depth++;
        else if (c === "}") depth--;
        if (depth > 0) body += c;
        j++;
      }
      // Look for `take:` (with optional whitespace/newlines around the colon).
      // Match either `take: 100` or `take:100` or `take : 100`.
      // Negative lookbehind not strictly needed — `take:` is a Prisma field
      // name and is unambiguous inside a findMany options object.
      const hasTake = /\btake\b\s*:/.test(body);
      if (!hasTake) {
        violations.push(
          makeViolation(src, m.index, "findMany({...}) without `take:` field")
        );
      }
      continue;
    }

    // Case C: `findMany(someVariable)` — can't statically determine;
    // skip (documented limitation).
  }
  return violations;
}

function makeViolation(src, offset, reason) {
  // Compute 1-based line/col.
  let line = 1;
  let col = 1;
  for (let k = 0; k < offset; k++) {
    if (src[k] === "\n") {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  // Extract a short snippet (current line, trimmed).
  const lineStart = src.lastIndexOf("\n", offset) + 1;
  const lineEnd = src.indexOf("\n", offset);
  const snippet = src.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim();
  return { line, col, reason, snippet: snippet.slice(0, 120) };
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  let rootStat;
  try {
    rootStat = await stat(SCAN_ROOT);
  } catch {
    console.error(`[check-unbounded-findmany] scan root not found: ${SCAN_ROOT}`);
    process.exit(2);
  }
  if (!rootStat.isDirectory()) {
    console.error(`[check-unbounded-findmany] scan root is not a directory: ${SCAN_ROOT}`);
    process.exit(2);
  }

  const files = await walk(SCAN_ROOT);
  const allViolations = [];
  for (const file of files) {
    const src = await readFile(file, "utf8");
    const violations = findUnboundedFindMany(src);
    for (const v of violations) {
      const rel = relative(ROOT, file);
      const key = `${rel}:${v.line}`;
      if (ALLOWLIST.has(key)) continue;
      allViolations.push({ ...v, file: rel });
    }
  }

  if (allViolations.length === 0) {
    console.log(
      `[check-unbounded-findmany] ✅ all ${files.length} scanned files have bounded findMany calls`
    );
    process.exit(0);
  }

  console.error(
    `[check-unbounded-findmany] ❌ ${allViolations.length} unbounded findMany call(s) found:\n`
  );
  for (const v of allViolations) {
    console.error(`  ${v.file}:${v.line}:${v.col} — ${v.reason}`);
    console.error(`    > ${v.snippet}\n`);
  }
  console.error(
    `Scan root: ${relative(ROOT, SCAN_ROOT)}\n` +
      `Files scanned: ${files.length}\n` +
      `Violations: ${allViolations.length}\n\n` +
      `To fix: add an explicit \`take:\` field (e.g. \`take: 100\`) to each\n` +
      `findMany options object. For paginated endpoints, use cursor pagination\n` +
      `with a sensible default page size.\n\n` +
      `If a violation is intentional (e.g. a maintenance script that must\n` +
      `scan every row), add its "file:line" key to the ALLOWLIST in\n` +
      `scripts/check-unbounded-findmany.mjs and document why in the commit\n` +
      `message.`
  );
  process.exit(1);
}

main().catch((err) => {
  console.error("[check-unbounded-findmany] unexpected error:", err);
  process.exit(2);
});
