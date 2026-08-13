#!/usr/bin/env node
/**
 * scripts/codemod-withTenantScope.js
 *
 * FC-1 (CP-1 RLS COVERAGE): Converts tenant-scoped API routes from
 * the old `withErrorHandler(requireAuth(...))` pattern to the new
 * `withTenantScope(...)` pattern that wraps every handler in a
 * tenant-scoped RLS transaction.
 *
 * This is a SEMI-AUTOMATIC codemod. It handles the common pattern:
 *
 *   export const GET = withErrorHandler(async (req) => {
 *     const authResult = await requireAuth(req);
 *     if (authResult instanceof NextResponse) return authResult;
 *     const user = authResult.user;
 *     ...handler body...
 *   });
 *
 * And converts it to:
 *
 *   export const GET = withTenantScope(async (req, ctx) => {
 *     const user = ctx.user;
 *     ...handler body...
 *   });
 *
 * Routes that don't match the common pattern are skipped and listed
 * for manual conversion.
 *
 * Usage:
 *   node scripts/codemod-withTenantScope.js --dry-run    # preview
 *   node scripts/codemod-withTenantScope.js --execute     # apply
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const DRY_RUN = !process.argv.includes("--execute");

// Exempt routes — these don't need withTenantScope
const EXEMPT_PATTERNS = [
  /auth\/(login|register|refresh|forgot-password|reset-password|me|mfa|csrf)/,
  /webhooks\/(whatsapp|paymob|myfatoorah|stripe)/,
  /e-invoicing\/webhooks\//,
  /\/health$/,
  /\/status$/,
  /\/startup-check$/,
  /robots/,
  /sitemap/,
  /\/docs$/,
  /\/metrics/,
  /internal\//,
  /founder-panel\//,
  /\/ai\/ml-learning$/,
  /\/ai\/chat\/stream$/,
  /platform-admin\/queue-failures/,
  /\/api\/route\.ts$/, // root API route
];

function isExempt(filePath) {
  return EXEMPT_PATTERNS.some((p) => p.test(filePath));
}

function findRouteFiles() {
  const result = execSync("find src/app/api -name 'route.ts'", { encoding: "utf8" });
  return result.trim().split("\n").filter(Boolean);
}

function convertFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const original = content;

  // Pattern 1: export const METHOD = withErrorHandler(async (req) => {
  //   const authResult = await requireAuth(req);
  //   if (authResult instanceof NextResponse) return authResult;
  //   const user = authResult.user;
  const pattern1 = /export const (GET|POST|PUT|PATCH|DELETE)\s*=\s*withErrorHandler\(async \(req(?::\s*NextRequest)?\)\s*=>\s*\{[\s\S]*?const authResult\s*=\s*await requireAuth\(req\);\s*if \(authResult instanceof NextResponse\) return authResult;\s*(?:const \{ user \}\s*=\s*authResult;|const user\s*=\s*authResult\.user;)/g;

  let converted = content;
  let count = 0;

  // Replace pattern 1: wrap in withTenantScope, remove requireAuth boilerplate
  converted = converted.replace(pattern1, (match, method) => {
    count++;
    // Extract the body after the requireAuth block
    const bodyStart = match.indexOf("=>") + 2;
    const fullBody = match.slice(bodyStart);
    // Remove the requireAuth lines
    const cleanedBody = fullBody
      .replace(/const authResult\s*=\s*await requireAuth\(req\);\s*/g, "")
      .replace(/if \(authResult instanceof NextResponse\) return authResult;\s*/g, "")
      .replace(/const \{ user \}\s*=\s*authResult;\s*/g, "")
      .replace(/const user\s*=\s*authResult\.user;\s*/g, "");

    return `export const ${method} = withTenantScope(async (req, ctx) => {\n    const user = ctx.user;${cleanedBody}`;
  });

  // Update imports: replace withErrorHandler + requireAuth with withTenantScope
  if (count > 0) {
    // Add withTenantScope import
    if (!converted.includes("withTenantScope")) {
      converted = converted.replace(
        /import \{ ([^}]+) \} from "@\/lib\/api";/,
        (m, imports) => {
          const cleaned = imports
            .replace(/withErrorHandler/g, "")
            .replace(/requireAuth/g, "")
            .replace(/,\s*,/g, ",")
            .replace(/^,\s*/, "")
            .replace(/,\s*$/, "");
          return `import { withTenantScope } from "@/lib/api/tenant-middleware";`;
        }
      );
    }
  }

  return { converted, count, changed: converted !== original };
}

// Main
const files = findRouteFiles();
let totalConverted = 0;
let totalSkipped = 0;
let totalExempt = 0;
const skippedFiles = [];

console.log(`FC-1 Codemod: ${DRY_RUN ? "DRY RUN" : "EXECUTE"} mode`);
console.log(`Found ${files.length} route.ts files\n`);

for (const file of files) {
  if (isExempt(file)) {
    totalExempt++;
    continue;
  }

  try {
    const { converted, count, changed } = convertFile(file);
    if (changed && count > 0) {
      totalConverted++;
      if (!DRY_RUN) {
        fs.writeFileSync(file, converted, "utf8");
      }
      console.log(`  ${DRY_RUN ? "[DRY]" : "[OK]"} ${file} (${count} handlers)`);
    } else {
      totalSkipped++;
      skippedFiles.push(file);
    }
  } catch (err) {
    totalSkipped++;
    skippedFiles.push(file);
  }
}

console.log(`\n=== Summary ===`);
console.log(`Total routes: ${files.length}`);
console.log(`Exempt (public/inbound): ${totalExempt}`);
console.log(`Auto-converted: ${totalConverted}`);
console.log(`Skipped (manual conversion needed): ${totalSkipped}`);
console.log(`Coverage: ${totalConverted + totalExempt}/${files.length} (${Math.round((totalConverted + totalExempt) / files.length * 100)}%)`);

if (skippedFiles.length > 0) {
  console.log(`\n=== Skipped files (need manual review) ===`);
  skippedFiles.slice(0, 20).forEach((f) => console.log(`  ${f}`));
  if (skippedFiles.length > 20) console.log(`  ... and ${skippedFiles.length - 20} more`);
}
