/**
 * fix-unknown-as.ts — Systematically replace `as unknown as` with proper TypeScript.
 *
 * Categories:
 *   A. Query data already typed (modules/*.tsx) → remove cast or narrow to `as Type`
 *   B. DataTable data prop → remove cast (types have [key: string]: unknown)
 *   C. Founder-panel companyMember → companyMembership (BUG + type fix)
 *   D. retry.ts TAckState → `as string as TAckState`
 *   E. Workers message typing → define interface
 *   F. E-invoicing Record casts → narrow with `as`
 *   G. Legitimate patterns (db.ts, db-rls.ts) → keep but add rationale comment
 *   H. Test files → narrow to `as` instead of `as unknown as`
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = "/home/z/my-project/src";

// ── Helpers ────────────────────────────────────────────────────────────────

let totalFixes = 0;
let filesModified = 0;
const skipFiles = new Set<string>([
  // Legitimate patterns that should NOT be changed
  join(ROOT, "lib/db.ts"),          // globalThis singleton — standard Next.js pattern
  join(ROOT, "lib/db-rls.ts"),      // Proxy for tenant scoping — necessary
]);

function fixFile(filePath: string, fixes: Array<(content: string) => string>) {
  if (skipFiles.has(filePath)) return false;
  let content = readFileSync(filePath, "utf-8");
  const original = content;
  for (const fix of fixes) {
    content = fix(content);
  }
  if (content !== original) {
    writeFileSync(filePath, content, "utf-8");
    filesModified++;
    return true;
  }
  return false;
}

/**
 * Pattern A: Query data extraction — hooks are already properly typed.
 * (queryVar.data?.field ?? []) as unknown as LocalType[]
 * → (queryVar.data?.field ?? []) as LocalType[]
 *
 * Also handles:
 * (queryVar.data as unknown as { field?: Type[] })?.field ?? [] as Type[]
 * → (queryVar.data?.field ?? []) as Type[]
 */
function fixQueryDataCast(content: string): string {
  // Pattern A1: (expr ?? []) as unknown as Type[]
  content = content.replace(
    /(\([^)]+\))\s+as\s+unknown\s+as\s+(\w+\[\])/g,
    (_, expr, type) => {
      totalFixes++;
      return `${expr} as ${type}`;
    }
  );

  // Pattern A2: (expr as unknown as { field?: Type[] })?.field ?? [] as Type[]
  // This is a more complex pattern found in HRView.tsx
  content = content.replace(
    /(\w+Query\.data\s+)as\s+unknown\s+as\s+\{\s*(\w+)\?:\s*(\w+)\[\]\s*\}\)\?\.\2\s*\?\?\s*\[\]\s*as\s*\3\[\]/g,
    (_, queryData, field, type) => {
      totalFixes++;
      return `${queryData}?.${field} ?? [] as ${type}[]`;
    }
  );

  return content;
}

/**
 * Pattern B: DataTable data={X as unknown as Record<string, unknown>[]}
 * → data={X as Record<string, unknown>[]}
 * The types have [key: string]: unknown so they ARE Record<string, unknown> compatible.
 */
function fixDataTableCast(content: string): string {
  content = content.replace(
    /(data=\{[^}]+)\s+as\s+unknown\s+as\s+Record<string,\s*unknown>\[\]/g,
    (_, prefix) => {
      totalFixes++;
      return `${prefix} as Record<string, unknown>[]`;
    }
  );
  return content;
}

/**
 * Pattern C: Founder panel — companyMember doesn't exist in schema,
 * the real model is CompanyMembership (mapped to company_memberships).
 * Replace db as unknown as { companyMember: ... } with db.companyMembership
 */
function fixFounderPanelCast(content: string): string {
  // Replace the inline type with direct db.companyMembership usage
  const companyMemberPattern =
    /await\s+\(db\s+as\s+unknown\s+as\s*\{\s*companyMember:\s*\{\s*findFirst:\s*\([^)]*\)\s*=>\s*Promise<[^>]+>\s*;?\s*\}\s*;?\s*\}\)\.companyMember\.findFirst\(/g;
  
  if (companyMemberPattern.test(content)) {
    totalFixes++;
    content = content.replace(
      companyMemberPattern,
      "await db.companyMembership.findFirst("
    );
  }

  return content;
}

/**
 * Pattern D: retry.ts — `as unknown as TAckState` → `as string as TAckState`
 * Both TSubmitState and TAckState extend string, so casting through string
 * is safe and narrower than going through unknown.
 */
function fixRetryCast(content: string): string {
  content = content.replace(
    /as\s+unknown\s+as\s+TAckState/g,
    () => { totalFixes++; return "as string as TAckState"; }
  );
  return content;
}

/**
 * Pattern E: Workers — message/context typing
 * (d.messages as unknown as { role: ...; content: string }[])
 * → Define a proper interface and use `as` instead.
 */
function fixWorkerCast(content: string): string {
  // Add interface at top if not already present
  const chatMsgInterface = `interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}`;

  if (content.includes("as unknown as { role:") && !content.includes("interface ChatMessage")) {
    // Find the last import line and add the interface after it
    const lastImport = content.lastIndexOf("import ");
    const importEnd = content.indexOf("\n", content.indexOf(";", lastImport));
    if (importEnd !== -1) {
      content = content.slice(0, importEnd + 1) +
        "\n" + chatMsgInterface + "\n" +
        content.slice(importEnd + 1);
    }
  }

  // Replace the inline type with the interface
  content = content.replace(
    /as\s+unknown\s+as\s*\{\s*role:\s*"user"\s*\|\s*"assistant"\s*\|\s*"system"\s*;\s*content:\s*string\s*\}\[\]/g,
    () => { totalFixes++; return "as ChatMessage[]"; }
  );

  return content;
}

/**
 * Pattern F: E-invoicing — `x as unknown as Record<string, unknown>`
 * → `x as Record<string, unknown>` (single assertion through compatible type)
 */
function fixEInvoicingCast(content: string): string {
  // General: as unknown as Record<string, unknown> → as Record<string, unknown>
  content = content.replace(
    /as\s+unknown\s+as\s+Record<string,\s*unknown>/g,
    () => { totalFixes++; return "as Record<string, unknown"; }
  );

  // ZATCA-specific: invoice/company as Record<string, unknown> for helper fns
  // These helper functions accept Record<string, unknown> — the Prisma types
  // have string/number/Date fields that ARE assignable to unknown.
  // Single `as Record<string, unknown>` suffices.

  return content;
}

/**
 * Pattern G: Automation engine — provider method calls
 * (provider as unknown as { send: ... }).send(...) → use a typed interface
 */
function fixAutomationCast(content: string): string {
  // sendgridProvider
  content = content.replace(
    /(sendgridProvider|twilioProvider)\s+as\s+unknown\s+as\s*\{([^}]+)\}/g,
    (_, provider, methods) => {
      totalFixes++;
      return `${provider} as { ${methods} }`;
    }
  );
  return content;
}

/**
 * Pattern H: Various lib file patterns
 */
function fixLibCast(content: string): string {
  // email.ts: input as unknown as Record<string, unknown>
  // The input type should be compatible with Record<string, unknown>
  // since it's a plain object being passed to nodemailer.
  // Use single assertion.

  // productMatcher.ts: action as unknown as LiteralUnion
  // → action as ActionUnionType (define the type if needed)

  // excelParser.ts: buffer as unknown as ArrayBuffer
  // → new Uint8Array(buffer).buffer (proper conversion)
  content = content.replace(
    /(\w+)\s+as\s+unknown\s+as\s+ArrayBuffer/g,
    (_, buf) => {
      totalFixes++;
      return `new Uint8Array(${buf}).buffer`;
    }
  );

  // aiFallback.ts: result as unknown as Invoice
  content = content.replace(
    /as\s+unknown\s+as\s+Invoice(?!\[)/g,
    () => { totalFixes++; return "as Invoice"; }
  );

  // gemini-loadbalancer: as unknown as (AIProviderConfig & { genAI: ... })
  content = content.replace(
    /as\s+unknown\s+as\s+\((AIProviderConfig[^)]+)\)/g,
    (_, type) => { totalFixes++; return `as (${type})`; }
  );

  // driftDetection: as unknown as { mean: number; ... }
  content = content.replace(
    /as\s+unknown\s+as\s+\{\s*mean:\s*number;\s*stdDev:[^}]+\}/g,
    (match) => { totalFixes++; return match.replace("as unknown as ", "as "); }
  );

  // aiProvider.ts: entry as unknown as AiProviderConfig
  content = content.replace(
    /as\s+unknown\s+as\s+AiProviderConfig/g,
    () => { totalFixes++; return "as AiProviderConfig"; }
  );

  // openapi/contract-test-helpers.ts: body as unknown as Record<string, unknown>[]
  // Test helper — use single assertion

  return content;
}

/**
 * Pattern I: Test files — narrow `as unknown as` to `as`
 * In test code, some type assertions are acceptable but should use
 * single assertion (as X) instead of double (as unknown as X).
 */
function fixTestCast(content: string): string {
  // For test files, replace as unknown as with as (single assertion)
  // This is safer than removing entirely and still catches type mismatches
  const testPattern = /as\s+unknown\s+as\s+/g;
  let match;
  while ((match = testPattern.exec(content)) !== null) {
    // Check if this is in a test file
    if (content.includes(".test.") || content.includes("__tests__")) {
      totalFixes++;
    }
  }
  // Replace all in test files
  content = content.replace(/as\s+unknown\s+as\s+/g, "as ");
  return content;
}

// ── Main ──────────────────────────────────────────────────────────────────

import { execSync } from "node:child_process";

// Get all files with 'as unknown as'
const { stdout } = execSync(
  `rg -l 'as unknown as' ${ROOT} --type ts --type tsx 2>/dev/null || true`,
  { encoding: "utf-8" }
);
const files = stdout.trim().split("\n").filter(Boolean);

console.log(`Found ${files.length} files with 'as unknown as'`);

for (const file of files) {
  const isTest = file.includes(".test.") || file.includes("__tests__");
  const isModule = file.includes("/modules/");
  const isLib = file.includes("/lib/") && !isTest;
  const isApi = file.includes("/api/");
  const isWorker = file.includes("/workers/");
  const isEInvoicing = file.includes("/e-invoicing/");
  const isRetry = file.endsWith("retry.ts");
  const isFounderPanel = file.includes("/founder-panel/");
  const isAutomation = file.includes("/automation/");

  const fixes: Array<(content: string) => string> = [];

  // Every file gets Pattern A (query data) and Pattern B (DataTable) fixes
  if (isModule) {
    fixes.push(fixQueryDataCast, fixDataTableCast);
  }

  // Specific patterns
  if (isRetry) fixes.push(fixRetryCast);
  if (isWorker) fixes.push(fixWorkerCast);
  if (isEInvoicing) fixes.push(fixEInvoicingCast);
  if (isAutomation) fixes.push(fixAutomationCast);
  if (isFounderPanel) fixes.push(fixFounderPanelCast);
  if (isLib && !isEInvoicing && !isWorker && !isRetry && !isAutomation && !isFounderPanel) {
    fixes.push(fixLibCast);
  }
  if (isTest) fixes.push(fixTestCast);
  if (isApi && !isFounderPanel && !isEInvoicing) {
    fixes.push(fixEInvoicingCast, fixLibCast);
  }

  if (fixes.length > 0) {
    const modified = fixFile(file, fixes);
    if (modified) {
      console.log(`  ✓ ${file.replace(ROOT + "/", "")}`);
    }
  }
}

console.log(`\nTotal fixes: ${totalFixes}`);
console.log(`Files modified: ${filesModified}`);
