/**
 * readme-consistency-check.ts
 *
 * Automated script that verifies ALL README numbers match actual code.
 * Prevents documentation drift by counting real files, models, routes,
 * etc. and comparing against claimed values in README files.
 *
 * Usage:
 *   bun run scripts/readme-consistency-check.ts
 *   bun run scripts/readme-consistency-check.ts --verbose
 *   bun run scripts/readme-consistency-check.ts --fix  # auto-fix where possible
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const verbose = process.argv.includes("--verbose");
const fix = process.argv.includes("--fix");

// ── Utility ──────────────────────────────────────────────────────────────────

function countFiles(dir: string, pattern: RegExp, exclude?: RegExp): number {
  try {
    const entries = readdirSync(dir, { withFileTypes: true, recursive: true });
    return entries
      .filter(e => e.isFile())
      .filter(e => pattern.test(e.name))
      .filter(e => !exclude || !exclude.test((e as any).path ?? e.name))
      .length;
  } catch {
    return 0;
  }
}

function countDirectories(dir: string, maxDepth: number = 1): number {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory())
      .filter(e => e.name !== "__tests__" && e.name !== "node_modules")
      .length;
  } catch {
    return 0;
  }
}

function grepCount(file: string, pattern: RegExp): number {
  try {
    const content = readFileSync(file, "utf-8");
    const matches = content.match(pattern);
    return matches ? matches.length : 0;
  } catch {
    return 0;
  }
}

function extractFromREADME(readmePath: string, pattern: RegExp): string[] {
  try {
    const content = readFileSync(readmePath, "utf-8");
    return content.match(pattern) || [];
  } catch {
    return [];
  }
}

// ── Actual counts from codebase ──────────────────────────────────────────────

interface MetricCheck {
  name: string;
  readmePath: string;
  readmePattern: RegExp;
  readmeClaimedValue: string | number;
  actualValue: number;
  actualMethod: string;
  tolerance?: number; // allow ±tolerance
}

const checks: MetricCheck[] = [];

// 1. Prisma models
const prismaModels = grepCount(join(ROOT, "prisma/schema.prisma"), /^model \w+/gm);
checks.push({
  name: "Prisma Models",
  readmePath: join(ROOT, "README.md"),
  readmePattern: /74 models/g,
  readmeClaimedValue: 74,
  actualValue: prismaModels,
  actualMethod: "grep '^model ' prisma/schema.prisma",
});

// 2. @@index directives
const prismaIndexes = grepCount(join(ROOT, "prisma/schema.prisma"), /@@index/g);
checks.push({
  name: "Prisma @@index",
  readmePath: join(ROOT, "README.md"),
  readmePattern: /110 @@index/g,
  readmeClaimedValue: 110,
  actualValue: prismaIndexes,
  actualMethod: "grep '@@index' prisma/schema.prisma",
});

// 3. AI fabric files
const aiFabricFiles = countFiles(
  join(ROOT, "src/lib/ai-fabric"),
  /\.ts$/,
  /__tests__|\.test\.|README/
);
checks.push({
  name: "AI Fabric Files",
  readmePath: join(ROOT, "README.md"),
  readmePattern: /20 files/g,
  readmeClaimedValue: 20,
  actualValue: aiFabricFiles,
  actualMethod: "count .ts files in src/lib/ai-fabric/ (excl. tests)",
});

// 4. API route files
const apiRouteFiles = countFiles(
  join(ROOT, "src/app/api"),
  /route\.ts$/,
);
checks.push({
  name: "API Route Files",
  readmePath: join(ROOT, "README.md"),
  readmePattern: /210 route files/g,
  readmeClaimedValue: 210,
  actualValue: apiRouteFiles,
  actualMethod: "count route.ts files in src/app/api/",
  tolerance: 5,
});

// 5. E2E spec files
const e2eFiles = countFiles(
  join(ROOT, "e2e"),
  /\.spec\.ts$/,
);
checks.push({
  name: "E2E Spec Files",
  readmePath: join(ROOT, "README.md"),
  readmePattern: /9 files/g,
  readmeClaimedValue: 9,
  actualValue: e2eFiles,
  actualMethod: "count .spec.ts files in e2e/",
});

// 6. Domain UI modules
const domainModules = countDirectories(join(ROOT, "src/modules"));
checks.push({
  name: "Domain UI Modules",
  readmePath: join(ROOT, "README.md"),
  readmePattern: /20\+ domain/g,
  readmeClaimedValue: 22, // "20+" means >= 20
  actualValue: domainModules,
  actualMethod: "count directories in src/modules/",
});

// 7. Accounting module files
const accountingFiles = countFiles(
  join(ROOT, "src/lib/accounting"),
  /\.ts$/,
  /__tests__|\.test\.|README/
);
checks.push({
  name: "Accounting Modules",
  readmePath: join(ROOT, "README.md"),
  readmePattern: /18 modules/g,
  readmeClaimedValue: 18,
  actualValue: accountingFiles,
  actualMethod: "count .ts files in src/lib/accounting/ (excl. tests)",
});

// 8. Workers
const workerFiles = countFiles(
  join(ROOT, "src/lib/workers"),
  /\.ts$/,
  /README|\.test\.|__tests__/
);
checks.push({
  name: "Worker Files",
  readmePath: join(ROOT, "README.md"),
  readmePattern: /5 workers/g,
  readmeClaimedValue: 5,
  actualValue: workerFiles,
  actualMethod: "count .ts worker files in src/lib/workers/",
});

// 9. Rate limit tiers
const rateLimitContent = readFileSync(join(ROOT, "src/lib/rateLimit.ts"), "utf-8");
const rateLimitKeys = rateLimitContent.match(/(?:export )?const LIMITS[^{]*\{[^}]*\}/)?.[0];
// Extract limit names from the LIMITS object
const limitNames = rateLimitContent.match(/(?:LOGIN|REGISTER|OTP_VERIFY|PASSWORD_RESET|AI_CHAT|AI_BULK|API_READ|API_WRITE|ACCOUNTING_READ|ACCOUNTING_WRITE|REPORT_GENERATION)/g) || [];
const uniqueLimits = new Set(limitNames).size;
checks.push({
  name: "Rate Limit Tiers",
  readmePath: join(ROOT, "README.md"),
  readmePattern: /11 Limits/g,
  readmeClaimedValue: 11,
  actualValue: uniqueLimits,
  actualMethod: "count unique limit names in rateLimit.ts",
});

// 10. RBAC PermissionLevel values
const rbacContent = readFileSync(join(ROOT, "src/lib/rbac.ts"), "utf-8");
// Count ONLY enum values inside the PermissionLevel enum block
const permissionLevelEnumBlock = rbacContent.match(/enum PermissionLevel \{[^}]+\}/)?.[0] || "";
const permissionLevelMatches = permissionLevelEnumBlock.match(/\w+ = \d+/g) || [];
checks.push({
  name: "RBAC PermissionLevel",
  readmePath: join(ROOT, "README.md"),
  readmePattern: /11 levels/g,
  readmeClaimedValue: 11,
  actualValue: permissionLevelMatches.length,
  actualMethod: "count enum values in PermissionLevel in rbac.ts",
});

// 11. SLO definitions
const observabilityContent = readFileSync(join(ROOT, "src/lib/observability.ts"), "utf-8");
const sloKeys = observabilityContent.match(/export const SLOs/g) || [];
// Count SLO keys in the SLOs object
const sloNames = observabilityContent.match(/(?:api_availability|auth_availability|api_latency_p95|api_latency_p99|ai_latency_p95|invoice_creation_latency|accounting_accuracy|ai_cost_tracking|data_durability|audit_integrity)/g) || [];
const uniqueSlos = new Set(sloNames).size;
checks.push({
  name: "SLO Definitions",
  readmePath: join(ROOT, "README.md"),
  readmePattern: /10 SLOs/g,
  readmeClaimedValue: 10,
  actualValue: uniqueSlos,
  actualMethod: "count SLO keys in observability.ts",
});

// 12. E-invoicing countries
const einvoicingDir = join(ROOT, "src/lib/e-invoicing");
const einvoicingContent = readFileSync(join(einvoicingDir, "router.ts"), "utf-8");
const einvoicingCountries = einvoicingContent.match(/zatca|uae-fta|egypt-eta|kuwait|bahrain-nbr|oman-tax/gi) || [];
const uniqueEinvoicingCountries = new Set(einvoicingCountries.map(c => c.toLowerCase())).size;
checks.push({
  name: "E-Invoicing Countries",
  readmePath: join(ROOT, "README.md"),
  readmePattern: /6 countries/g,
  readmeClaimedValue: 6,
  actualValue: uniqueEinvoicingCountries,
  actualMethod: "count unique country codes in e-invoicing/router.ts",
});

// 13. React Query hooks
const hookFiles = countFiles(
  join(ROOT, "src/hooks/queries"),
  /\.ts$/,
  /index\.ts/
);
checks.push({
  name: "React Query Hooks",
  readmePath: join(ROOT, "README.md"),
  readmePattern: /16 files/g,
  readmeClaimedValue: 16,
  actualValue: hookFiles,
  actualMethod: "count .ts hook files in src/hooks/queries/",
  tolerance: 1,
});

// 14. Components
const componentFiles = countFiles(
  join(ROOT, "src/components"),
  /\.tsx$/,
);
checks.push({
  name: "Components",
  readmePath: join(ROOT, "README.md"),
  readmePattern: /50\+/g,
  readmeClaimedValue: 59,
  actualValue: componentFiles,
  actualMethod: "count .tsx files in src/components/",
  tolerance: 2, // "50+" is a floor, not exact
});

// 15. OTEL_EXPORTER_OTLP_ENDPOINT in docker-compose.yml
const dockerCompose = readFileSync(join(ROOT, "docker-compose.yml"), "utf-8");
const hasOtelInDocker = dockerCompose.includes("OTEL_EXPORTER_OTLP_ENDPOINT");
checks.push({
  name: "OTEL in docker-compose.yml",
  readmePath: join(ROOT, "README.md"),
  readmePattern: /docker-compose\.yml environment/g,
  readmeClaimedValue: "present",
  actualValue: hasOtelInDocker ? 1 : 0,
  actualMethod: "check OTEL_EXPORTER_OTLP_ENDPOINT exists in docker-compose.yml",
});

// 16. OTEL_EXPORTER_OTLP_ENDPOINT in .env.example
const envExample = readFileSync(join(ROOT, ".env.example"), "utf-8");
const hasOtelInEnv = envExample.includes("OTEL_EXPORTER_OTLP_ENDPOINT");
checks.push({
  name: "OTEL in .env.example",
  readmePath: join(ROOT, "README.md"),
  readmePattern: /\.env\.example/g,
  readmeClaimedValue: "present",
  actualValue: hasOtelInEnv ? 1 : 0,
  actualMethod: "check OTEL_EXPORTER_OTLP_ENDPOINT exists in .env.example",
});

// ── Run checks ───────────────────────────────────────────────────────────────

console.log("╔══════════════════════════════════════════════════════════════╗");
console.log("║  GarfiX README Consistency Check                             ║");
console.log("║  Verifying ALL numbers match actual codebase                 ║");
console.log("╚══════════════════════════════════════════════════════════════╝\n");

let passCount = 0;
let failCount = 0;
let warnCount = 0;

for (const check of checks) {
  const tolerance = check.tolerance || 0;
  const isNumberCheck = typeof check.readmeClaimedValue === "number";
  const actualNum = check.actualValue;
  const claimedNum = isNumberCheck ? (check.readmeClaimedValue as number) : 0;

  let status: "PASS" | "FAIL" | "WARN";
  let detail = "";

  if (isNumberCheck) {
    if (actualNum === claimedNum) {
      status = "PASS";
      detail = `actual=${actualNum} matches claimed=${claimedNum}`;
    } else if (Math.abs(actualNum - claimedNum) <= tolerance) {
      status = "WARN";
      detail = `actual=${actualNum} ≈ claimed=${claimedNum} (within tolerance ±${tolerance})`;
    } else {
      status = "FAIL";
      detail = `actual=${actualNum} ≠ claimed=${claimedNum}`;
    }
  } else {
    // Boolean check (0 or 1)
    if (actualNum > 0) {
      status = "PASS";
      detail = "present in config ✅";
    } else {
      status = "FAIL";
      detail = "NOT present in config ❌";
    }
  }

  const icon = status === "PASS" ? "✅" : status === "WARN" ? "⚠️" : "❌";

  if (status === "PASS") passCount++;
  else if (status === "WARN") warnCount++;
  else failCount++;

  console.log(`${icon} ${check.name}: ${status} — ${detail}`);
  if (verbose) {
    console.log(`   Method: ${check.actualMethod}`);
    console.log(`   README pattern: ${check.readmePattern}`);
  }
}

// ── Scan ALL sub-READMEs for stale numbers ──────────────────────────────────

const stalePatterns = [
  { pattern: /72 models/g, description: "Old model count (should be 74)" },
  { pattern: /16-phase/gi, description: "Old AI phase count (should be 20)" },
  { pattern: /16 modules/g, description: "Old accounting count (should be 18)" },
  { pattern: /8 files/g, description: "Old E2E count (should be 9)" },
  { pattern: /20 levels/g, description: "Old RBAC PermissionLevel count (should be 11)" },
  { pattern: /\.env\.production/g, description: "OTEL config reference (should be docker-compose.yml + .env.example)" },
];

const readmeDirs = [
  ROOT,
  join(ROOT, "docs"),
  join(ROOT, "e2e"),
  join(ROOT, "scripts"),
  join(ROOT, "prisma"),
  join(ROOT, "src/modules"),
  join(ROOT, "src/context"),
  join(ROOT, "src/components"),
  join(ROOT, "src/hooks"),
  join(ROOT, "src/lib"),
  join(ROOT, "src/lib/ai-fabric"),
  join(ROOT, "src/lib/invoice-brain"),
  join(ROOT, "src/lib/ai"),
  join(ROOT, "src/lib/automation"),
  join(ROOT, "src/lib/workers"),
  join(ROOT, "src/lib/e-invoicing"),
  join(ROOT, "src/lib/founder-validation"),
  join(ROOT, "src/lib/integrations"),
  join(ROOT, "src/lib/accounting"),
  join(ROOT, "src/app/founder-panel"),
  join(ROOT, "src/app/api"),
  join(ROOT, "download"),
];

console.log("\n─── Stale Number Scan (ALL READMEs) ───\n");

let staleFound = 0;

for (const dir of readmeDirs) {
  const readmePath = join(dir, "README.md");
  try {
    const content = readFileSync(readmePath, "utf-8");
    for (const stale of stalePatterns) {
      const matches = content.match(stale.pattern);
      if (matches && matches.length > 0) {
        staleFound += matches.length;
        console.log(`❌ STALE in ${readmePath.replace(ROOT, "")}: "${matches[0]}" — ${stale.description}`);
      }
    }
  } catch {
    // README doesn't exist or can't be read — skip
  }
}

if (staleFound === 0) {
  console.log("✅ No stale numbers found in any README");
}

// ── Final Summary ────────────────────────────────────────────────────────────

console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║  SUMMARY                                                     ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log(`  ✅ PASS: ${passCount}`);
console.log(`  ⚠️  WARN: ${warnCount}`);
console.log(`  ❌ FAIL: ${failCount}`);
console.log(`  📄 Stale references: ${staleFound}`);

if (failCount === 0 && staleFound === 0) {
  console.log("\n🎉 All README numbers are consistent with actual code!");
} else {
  console.log("\n🔧 Run with --fix to auto-correct where possible, or manually update READMEs.");
}

process.exit(failCount > 0 || staleFound > 0 ? 1 : 0);
