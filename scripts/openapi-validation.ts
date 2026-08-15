/**
 * openapi-validation.ts — Validates that OpenAPI spec paths match actual route files 1:1.
 *
 * This is NOT a unit test — it's a documentation integrity check that:
 *   1. Scans all route.ts files and extracts their API paths
 *   2. Reads the generated OpenAPI spec and extracts its paths
 *   3. Compares the two sets
 *   4. Reports missing/extra paths
 *
 * Expected result: Missing = 0, Extra = 0
 *
 * Usage: bun run scripts/openapi-validation.ts
 */
import fs from "node:fs";
import path from "node:path";

const ROUTES_DIR = path.join(process.cwd(), "src/app/api");
const OPENAPI_FILE = path.join(process.cwd(), "docs/api/openapi.yaml");

// Extract API path from a route.ts file path
function routeFilePathToApiPath(filePath: string): string {
  // src/app/api/accounting/accounts/route.ts → /api/accounting/accounts
  // src/app/api/invoices/[id]/route.ts → /api/invoices/{id}
  let p = filePath
    .replace(ROUTES_DIR, "")
    .replace(/\/route\.ts$/, "")
    .replace(/\\/g, "/");

  // Convert [param] to {param} (OpenAPI style)
  p = p.replace(/\[([^\]]+)\]/g, "{$1}");

  return "/api" + p;
}

// Extract paths from OpenAPI YAML (simple parse — just find path keys)
function extractOpenApiPaths(yamlContent: string): Set<string> {
  const paths = new Set<string>();
  const lines = yamlContent.split("\n");
  let inPaths = false;
  let pathIndent = -1;

  for (const line of lines) {
    // Detect "paths:" at top level
    if (/^paths:\s*$/.test(line)) {
      inPaths = true;
      pathIndent = 0;
      continue;
    }

    if (inPaths) {
      // Detect path entries like "  /api/auth/login:" or "  /api:"
      const match = line.match(/^(\s+)(\/api[^\s]*):\s*$/);
      if (match) {
        const indent = match[1].length;
        // Only top-level paths (indent should be consistent)
        if (pathIndent === 0 || indent === pathIndent || pathIndent === -1) {
          if (pathIndent === -1 || indent <= pathIndent) {
            pathIndent = indent;
          }
          // Clean up the path — remove any trailing content after the path
          const p = match[2].trim();
          // Only add if it looks like a path (starts with / and no spaces)
          if (p.startsWith("/") && !p.includes(" ")) {
            paths.add(p);
          }
        }
      }
      // Exit paths section when we hit a non-indented line
      if (line.length > 0 && !line.startsWith(" ") && !line.startsWith("#")) {
        inPaths = false;
      }
    }
  }

  return paths;
}

// Main
function main() {
  // 1. Scan route files
  const routePaths = new Set<string>();

  function scanDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.name === "route.ts") {
        const apiPath = routeFilePathToApiPath(fullPath);
        routePaths.add(apiPath);
      }
    }
  }

  scanDir(ROUTES_DIR);

  // 2. Read OpenAPI spec
  const yamlContent = fs.readFileSync(OPENAPI_FILE, "utf-8");
  const openApiPaths = extractOpenApiPaths(yamlContent);

  // 3. Compare
  const missingFromOpenApi = [...routePaths].filter((p) => !openApiPaths.has(p));
  const extraInOpenApi = [...openApiPaths].filter((p) => !routePaths.has(p));

  // 4. Report
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("OpenAPI Path-Set Validation");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`Route files:      ${routePaths.size}`);
  console.log(`OpenAPI paths:    ${openApiPaths.size}`);
  console.log(`Missing from OpenAPI: ${missingFromOpenApi.length}`);
  console.log(`Extra in OpenAPI:     ${extraInOpenApi.length}`);

  if (missingFromOpenApi.length > 0) {
    console.log("\n❌ Missing from OpenAPI:");
    for (const p of missingFromOpenApi.sort()) {
      console.log(`   ${p}`);
    }
  }

  if (extraInOpenApi.length > 0) {
    console.log("\n⚠️  Extra in OpenAPI (not in route files):");
    for (const p of extraInOpenApi.sort()) {
      console.log(`   ${p}`);
    }
  }

  if (missingFromOpenApi.length === 0 && extraInOpenApi.length === 0) {
    console.log("\n✅ PASS — Route files and OpenAPI paths match 1:1");
    process.exit(0);
  } else {
    console.log("\n❌ FAIL — Path sets do not match");
    process.exit(1);
  }
}

main();
