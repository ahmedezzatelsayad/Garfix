/**
 * accounting-rate-limit-load-test.mjs
 *
 * Load test for ACCOUNTING_READ (40/min), ACCOUNTING_WRITE (15/min),
 * and REPORT_GENERATION (5/5min) rate limits.
 *
 * Strategy:
 *   1. Craft a valid JWT using the dev JWT_SECRET (since we're testing
 *      against dev server, not production).
 *   2. Send burst requests to accounting endpoints with auth cookie.
 *   3. Track when 429 responses start appearing, validate against
 *      expected limits.
 *   4. Measure latency distribution (p50, p95, p99).
 *
 * Uses Node.js `http` module directly (NOT fetch) because Bun's fetch()
 * strips Cookie headers (forbidden per Fetch spec).
 *
 * Usage:
 *   node scripts/accounting-rate-limit-load-test.mjs --url=http://localhost:3000
 *   node scripts/accounting-rate-limit-load-test.mjs --url=http://localhost:3000 --concurrency=5
 *   node scripts/accounting-rate-limit-load-test.mjs --url=http://localhost:3000 --skip-read
 */

// ── ESM-compatible require via createRequire ──────────────────────────────────

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const jwt = require("jsonwebtoken");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

// ── CLI argument parsing ─────────────────────────────────────────────────────

/**
 * @typedef {Object} TestConfig
 * @property {string} baseUrl
 * @property {number} concurrency
 * @property {boolean} skipRead
 * @property {boolean} skipWrite
 * @property {boolean} skipReport
 * @property {boolean} verbose
 */

/**
 * @param {string[]} args
 * @returns {TestConfig}
 */
function parseArgs(args) {
  const config = {
    baseUrl: "http://localhost:3000",
    concurrency: 1,
    skipRead: false,
    skipWrite: false,
    skipReport: false,
    verbose: false,
  };
  for (const arg of args) {
    if (arg.startsWith("--url=")) config.baseUrl = arg.split("=")[1];
    if (arg.startsWith("--concurrency=")) config.concurrency = parseInt(arg.split("=")[1], 10);
    if (arg === "--skip-read") config.skipRead = true;
    if (arg === "--skip-write") config.skipWrite = true;
    if (arg === "--skip-report") config.skipReport = true;
    if (arg === "--verbose") config.verbose = true;
  }
  return config;
}

const config = parseArgs(process.argv.slice(2));

// ── JWT crafting (dev mode) ──────────────────────────────────────────────────

const DEV_JWT_SECRET = "dev-only-jwt_secret-not-for-production-static-key-min-32chars-padding";
const DEV_JWT_REFRESH_SECRET = "dev-only-jwt_refresh_secret-not-for-production-static-key";

function craftAccessToken() {
  const payload = {
    uid: "load-test-user-001",
    email: "admin@garfix.com",
    role: "admin",
    companies: ["gfx-01"],
    permissions: { finance_access: 1 },
    tv: 1,
    type: "access",
    jti: crypto.randomUUID(),
  };
  return jwt.sign(payload, DEV_JWT_SECRET, { expiresIn: 1800 });
}

// ── HTTP helpers (using Node.js http module, NOT fetch) ──────────────────────

/**
 * @typedef {Object} RequestResult
 * @property {number} status
 * @property {number} latencyMs
 * @property {Record<string, string>} headers
 * @property {string} body
 * @property {string} [error]
 */

/**
 * Make an HTTP request using Node.js `http` module.
 * This ensures Cookie headers are NOT stripped (unlike fetch/Bun).
 *
 * @param {string} urlStr
 * @param {string} method
 * @param {string} token
 * @param {string} csrfValue
 * @param {Record<string, unknown>} [body]
 * @returns {Promise<RequestResult>}
 */
function makeRequest(urlStr, method, token, csrfValue, body) {
  const start = performance.now();

  return new Promise((resolve) => {
    try {
      const mutatingMethods = ["POST", "PUT", "PATCH", "DELETE"];

      // Build cookie string — must use http module because fetch() strips Cookie
      let cookieStr = `inv_token=${token}`;
      if (mutatingMethods.includes(method)) {
        cookieStr += `; inv_csrf=${csrfValue}`;
      }

      /** @type {Record<string, string>} */
      const reqHeaders = {
        "Cookie": cookieStr,
        "Content-Type": "application/json",
      };
      if (mutatingMethods.includes(method)) {
        reqHeaders["X-CSRF-Token"] = csrfValue;
      }

      // Parse URL
      const parsed = new URL(urlStr);
      const options = {
        hostname: parsed.hostname,
        port: parseInt(parsed.port, 10) || (parsed.protocol === "https:" ? 443 : 3000),
        path: parsed.pathname + parsed.search,
        method,
        headers: reqHeaders,
      };

      const req = http.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk.toString();
        });
        res.on("end", () => {
          const elapsed = performance.now() - start;

          // Flatten headers (some may be arrays, take first value)
          /** @type {Record<string, string>} */
          const respHeaders = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (v === undefined) continue;
            respHeaders[k] = Array.isArray(v) ? v[0] : v;
          }

          resolve({
            status: res.statusCode || 0,
            latencyMs: elapsed,
            headers: respHeaders,
            body: data,
          });
        });
      });

      req.on("error", (err) => {
        const elapsed = performance.now() - start;
        resolve({
          status: 0,
          latencyMs: elapsed,
          headers: {},
          body: "",
          error: err.message,
        });
      });

      // Set a timeout so we don't hang forever
      req.setTimeout(30_000, () => {
        req.destroy(new Error("Request timeout (30s)"));
      });

      if (body && method !== "GET") {
        req.write(JSON.stringify(body));
      }
      req.end();
    } catch (err) {
      const elapsed = performance.now() - start;
      resolve({
        status: 0,
        latencyMs: elapsed,
        headers: {},
        body: "",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

// ── Statistics ───────────────────────────────────────────────────────────────

/**
 * @param {number[]} sorted
 * @param {number} p
 * @returns {number}
 */
function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

/**
 * @typedef {Object} TestPhaseResult
 * @property {string} name
 * @property {string} endpoint
 * @property {string} method
 * @property {number} totalRequests
 * @property {number} successfulRequests
 * @property {number} rateLimitedRequests
 * @property {number} authFailures
 * @property {number} otherErrors
 * @property {number[]} latencies
 * @property {{ retryAfter: number; remaining: string; reset: string }[]} rateLimitHeaders
 * @property {number|null} first429AtRequest
 * @property {{ maxAttempts: number; windowMs: number }} limitConfig
 */

/**
 * @param {TestPhaseResult} result
 * @returns {string}
 */
function computeStats(result) {
  const sortedLat = [...result.latencies].sort((a, b) => a - b);

  const p50 = percentile(sortedLat, 50);
  const p90 = percentile(sortedLat, 90);
  const p95 = percentile(sortedLat, 95);
  const p99 = percentile(sortedLat, 99);
  const avg = sortedLat.length > 0
    ? sortedLat.reduce((a, b) => a + b, 0) / sortedLat.length
    : 0;

  const rate = result.totalRequests > 0
    ? ((result.rateLimitedRequests / result.totalRequests) * 100).toFixed(1)
    : "0";

  const passMarker = result.first429AtRequest !== null &&
    result.first429AtRequest <= result.limitConfig.maxAttempts + 2
    ? "PASS" : result.first429AtRequest === null ? "WARN (no 429 seen)" : "FAIL";

  return `
  ┌─────────────────────────────────────────────────────────────┐
  │  ${result.name}                                            │
  │  Endpoint: ${result.method} ${result.endpoint}                            │
  │  Limit: ${result.limitConfig.maxAttempts} req / ${result.limitConfig.windowMs / 1000}s              │
  ├─────────────────────────────────────────────────────────────┤
  │  Total requests:      ${result.totalRequests}                                │
  │  Successful (2xx):    ${result.successfulRequests}                                │
  │  Rate-limited (429):  ${result.rateLimitedRequests}                                │
  │  Auth failures:       ${result.authFailures}                                │
  │  Other errors:        ${result.otherErrors}                                │
  │  Rate-limit %:        ${rate}%                               │
  │  First 429 at req #:  ${result.first429AtRequest ?? "N/A"}                                │
  │  Result:              ${passMarker}                           │
  ├─────────────────────────────────────────────────────────────┤
  │  Latency (successful):                                      │
  │    avg:   ${avg.toFixed(1)} ms                                       │
  │    p50:   ${p50.toFixed(1)} ms                                       │
  │    p90:   ${p90.toFixed(1)} ms                                       │
  │    p95:   ${p95.toFixed(1)} ms                                       │
  │    p99:   ${p99.toFixed(1)} ms                                       │
  └─────────────────────────────────────────────────────────────┘`;
}

// ── Test phases ──────────────────────────────────────────────────────────────

/**
 * @param {string} baseUrl
 * @param {string} token
 * @param {string} csrf
 * @returns {Promise<TestPhaseResult>}
 */
async function testAccountingRead(baseUrl, token, csrf) {
  const endpoint = "/api/accounting/test-rate-limit";
  const limitConfig = { maxAttempts: 40, windowMs: 60_000 };
  // Send 50 requests — should see 429 starting around request #41
  const burstSize = 50;

  const result = {
    name: "ACCOUNTING_READ",
    endpoint,
    method: "GET",
    totalRequests: 0,
    successfulRequests: 0,
    rateLimitedRequests: 0,
    authFailures: 0,
    otherErrors: 0,
    latencies: [],
    rateLimitHeaders: [],
    first429AtRequest: null,
    limitConfig,
  };

  console.log(`\n🧪 Testing ACCOUNTING_READ: ${burstSize} GET requests to ${endpoint}`);
  console.log(`   Expected: first 40 succeed, then 429s`);

  for (let i = 0; i < burstSize; i++) {
    const url = `${baseUrl}${endpoint}?companySlug=gfx-01&limit=5`;
    const resp = await makeRequest(url, "GET", token, csrf);
    result.totalRequests++;

    if (resp.status >= 200 && resp.status < 300) {
      result.successfulRequests++;
      result.latencies.push(resp.latencyMs);
    } else if (resp.status === 429) {
      result.rateLimitedRequests++;
      result.latencies.push(resp.latencyMs);
      if (result.first429AtRequest === null) {
        result.first429AtRequest = i + 1;
      }
      const retryAfter = parseInt(resp.headers["retry-after"] || "0", 10);
      const remaining = resp.headers["x-ratelimit-remaining"] || "0";
      const reset = resp.headers["x-ratelimit-reset"] || "";
      result.rateLimitHeaders.push({ retryAfter, remaining, reset });
      if (config.verbose) {
        console.log(`   [${i + 1}] 429 — Retry-After: ${retryAfter}s, Remaining: ${remaining}`);
      }
    } else if (resp.status === 401 || resp.status === 403) {
      result.authFailures++;
      if (config.verbose) {
        console.log(`   [${i + 1}] ${resp.status} — Auth failure: ${resp.body.slice(0, 100)}`);
      }
    } else {
      result.otherErrors++;
      if (config.verbose) {
        console.log(`   [${i + 1}] ${resp.status} — Error: ${resp.body.slice(0, 100)}`);
      }
    }

    if (resp.status >= 200 && resp.status < 300 && config.verbose) {
      console.log(`   [${i + 1}] ${resp.status} — ${resp.latencyMs.toFixed(1)}ms`);
    }
  }

  return result;
}

/**
 * @param {string} baseUrl
 * @param {string} token
 * @param {string} csrf
 * @returns {Promise<TestPhaseResult>}
 */
async function testAccountingWrite(baseUrl, token, csrf) {
  const endpoint = "/api/accounting/test-rate-limit";
  const limitConfig = { maxAttempts: 15, windowMs: 60_000 };
  // Send 20 requests — should see 429 starting around request #16
  const burstSize = 20;

  const result = {
    name: "ACCOUNTING_WRITE",
    endpoint,
    method: "POST",
    totalRequests: 0,
    successfulRequests: 0,
    rateLimitedRequests: 0,
    authFailures: 0,
    otherErrors: 0,
    latencies: [],
    rateLimitHeaders: [],
    first429AtRequest: null,
    limitConfig,
  };

  console.log(`\n🧪 Testing ACCOUNTING_WRITE: ${burstSize} POST requests to ${endpoint}`);
  console.log(`   Expected: first 15 succeed (or fail validation), then 429s`);

  for (let i = 0; i < burstSize; i++) {
    const url = `${baseUrl}${endpoint}`;
    // Simple POST body for the test-rate-limit endpoint
    const body = { test: true, index: i + 1 };
    const resp = await makeRequest(url, "POST", token, csrf, body);
    result.totalRequests++;

    if (resp.status >= 200 && resp.status < 300) {
      result.successfulRequests++;
      result.latencies.push(resp.latencyMs);
    } else if (resp.status === 429) {
      result.rateLimitedRequests++;
      result.latencies.push(resp.latencyMs);
      if (result.first429AtRequest === null) {
        result.first429AtRequest = i + 1;
      }
      const retryAfter = parseInt(resp.headers["retry-after"] || "0", 10);
      const remaining = resp.headers["x-ratelimit-remaining"] || "0";
      const reset = resp.headers["x-ratelimit-reset"] || "";
      result.rateLimitHeaders.push({ retryAfter, remaining, reset });
      if (config.verbose) {
        console.log(`   [${i + 1}] 429 — Retry-After: ${retryAfter}s, Remaining: ${remaining}`);
      }
    } else if (resp.status === 401 || resp.status === 403) {
      result.authFailures++;
      if (config.verbose) {
        console.log(`   [${i + 1}] ${resp.status} — Auth failure: ${resp.body.slice(0, 100)}`);
      }
    } else if (resp.status === 400) {
      // Validation error — request was processed (rate limit counted) but body was invalid.
      // This still counts as a "successful" rate-limit pass — the 400 means the rate limit
      // wasn't triggered yet, the request just failed validation.
      result.successfulRequests++;
      result.latencies.push(resp.latencyMs);
      if (config.verbose) {
        console.log(`   [${i + 1}] 400 — Validation error (rate limit passed): ${resp.body.slice(0, 100)}`);
      }
    } else {
      result.otherErrors++;
      if (config.verbose) {
        console.log(`   [${i + 1}] ${resp.status} — Error: ${resp.body.slice(0, 100)}`);
      }
    }

    if (resp.status >= 200 && resp.status < 300 && config.verbose) {
      console.log(`   [${i + 1}] ${resp.status} — ${resp.latencyMs.toFixed(1)}ms`);
    }
  }

  return result;
}

/**
 * @param {string} baseUrl
 * @param {string} token
 * @param {string} csrf
 * @returns {Promise<TestPhaseResult>}
 */
async function testReportGeneration(baseUrl, token, csrf) {
  const endpoint = "/api/accounting/balance-sheet/test-rate-limit";
  const limitConfig = { maxAttempts: 5, windowMs: 300_000 }; // 5 per 5 minutes
  // Send 8 requests — should see 429 starting around request #6
  const burstSize = 8;

  const result = {
    name: "REPORT_GENERATION",
    endpoint,
    method: "GET",
    totalRequests: 0,
    successfulRequests: 0,
    rateLimitedRequests: 0,
    authFailures: 0,
    otherErrors: 0,
    latencies: [],
    rateLimitHeaders: [],
    first429AtRequest: null,
    limitConfig,
  };

  console.log(`\n🧪 Testing REPORT_GENERATION: ${burstSize} GET requests to ${endpoint}`);
  console.log(`   Expected: first 5 succeed, then 429s`);

  for (let i = 0; i < burstSize; i++) {
    const url = `${baseUrl}${endpoint}?companySlug=gfx-01`;
    const resp = await makeRequest(url, "GET", token, csrf);
    result.totalRequests++;

    if (resp.status >= 200 && resp.status < 300) {
      result.successfulRequests++;
      result.latencies.push(resp.latencyMs);
    } else if (resp.status === 429) {
      result.rateLimitedRequests++;
      result.latencies.push(resp.latencyMs);
      if (result.first429AtRequest === null) {
        result.first429AtRequest = i + 1;
      }
      const retryAfter = parseInt(resp.headers["retry-after"] || "0", 10);
      const remaining = resp.headers["x-ratelimit-remaining"] || "0";
      const reset = resp.headers["x-ratelimit-reset"] || "";
      result.rateLimitHeaders.push({ retryAfter, remaining, reset });
      if (config.verbose) {
        console.log(`   [${i + 1}] 429 — Retry-After: ${retryAfter}s, Remaining: ${remaining}`);
      }
    } else if (resp.status === 401 || resp.status === 403) {
      result.authFailures++;
      if (config.verbose) {
        console.log(`   [${i + 1}] ${resp.status} — Auth failure: ${resp.body.slice(0, 100)}`);
      }
    } else {
      result.otherErrors++;
      if (config.verbose) {
        console.log(`   [${i + 1}] ${resp.status} — Error: ${resp.body.slice(0, 100)}`);
      }
    }

    if (resp.status >= 200 && resp.status < 300 && config.verbose) {
      console.log(`   [${i + 1}] ${resp.status} — ${resp.latencyMs.toFixed(1)}ms`);
    }
  }

  return result;
}

// ── Health check (using Node.js http, NOT fetch) ─────────────────────────────

/**
 * @param {string} baseUrl
 * @returns {Promise<boolean>}
 */
async function healthCheck(baseUrl) {
  console.log(`\n🔍 Checking if server is reachable at ${baseUrl}...`);
  try {
    const resp = await makeRequest(`${baseUrl}/api/health`, "GET", "", "");
    if (resp.status >= 200 && resp.status < 500) {
      console.log(`   ✅ Server is running (${resp.status})`);
      return true;
    }
    // Even non-200 means the server is running
    console.log(`   ✅ Server is running (status: ${resp.status})`);
    return true;
  } catch (err) {
    console.log(`   ❌ Server not reachable: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  GarfiX Accounting Rate Limit Load Test                     ║");
  console.log("║  Testing: ACCOUNTING_READ (40/min), ACCOUNTING_WRITE (15/min),║");
  console.log("║           REPORT_GENERATION (5/5min)                         ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`\n  Base URL: ${config.baseUrl}`);
  console.log(`  Concurrency: ${config.concurrency}`);

  // 1. Health check
  const healthy = await healthCheck(config.baseUrl);
  if (!healthy) {
    console.error("\n❌ Server not reachable. Start the dev server first:");
    console.error("   bun run dev");
    process.exit(1);
  }

  // 2. Craft auth token
  console.log("\n🔑 Crafting JWT auth token (dev mode)...");
  const token = craftAccessToken();
  console.log(`   Token: ${token.slice(0, 40)}...`);

  // 3. Verify auth works by hitting the test-rate-limit endpoint with GET
  //    (GET requests don't require CSRF — the middleware only checks CSRF for POST/PUT/PATCH/DELETE)
  console.log("\n🔍 Verifying auth token works...");
  const verifyResp = await makeRequest(
    `${config.baseUrl}/api/accounting/test-rate-limit`,
    "GET",
    token,
    "", // CSRF not needed for GET
  );
  console.log(`   Status: ${verifyResp.status}`);

  // 4. Get CSRF token from the response's Set-Cookie header for POST requests
  //    The middleware issues a CSRF cookie on every authenticated response
  let csrfValue = "";
  const setCookie = verifyResp.headers["set-cookie"] || "";
  const csrfMatch = setCookie.match(/inv_csrf=([^;]+)/);
  if (csrfMatch) {
    csrfValue = csrfMatch[1];
    console.log(`   CSRF token obtained: ${csrfValue.slice(0, 20)}...`);
  } else {
    // Fallback: generate our own (the middleware will also issue one)
    csrfValue = crypto.randomUUID();
    console.log(`   CSRF token (generated): ${csrfValue.slice(0, 20)}...`);
  }

  if (verifyResp.status === 401) {
    console.error("   ❌ Auth token not accepted — 401 Unauthorized");
    console.error("   Response: " + verifyResp.body.slice(0, 200));
    console.error("\n   This may happen if the server uses a different JWT_SECRET.");
    console.error("   Ensure the server environment has the matching JWT_SECRET.");
    process.exit(1);
  }
  if (verifyResp.status === 429) {
    console.warn("   ⚠️  Already rate limited from previous test — waiting 60s...");
    await new Promise((r) => setTimeout(r, 60_000));
  }
  if (verifyResp.status >= 200 && verifyResp.status < 300) {
    console.log("   ✅ Auth works — proceeding with load test");
  } else if (verifyResp.status === 403) {
    console.log("   ✅ Auth accepted, but permission denied (still counted for rate limit)");
    console.log("   Response: " + verifyResp.body.slice(0, 200));
  } else {
    console.log(`   ⚠️  Unexpected status ${verifyResp.status} — continuing anyway`);
    console.log("   Response: " + verifyResp.body.slice(0, 200));
  }

  // 5. Wait a moment to clear any residual rate limits from the verify request
  console.log("\n⏳ Waiting 2s to clear rate limit window from verify request...");
  await new Promise((r) => setTimeout(r, 2000));

  // 6. Run test phases
  /** @type {TestPhaseResult[]} */
  const results = [];

  if (!config.skipRead) {
    const readResult = await testAccountingRead(config.baseUrl, token, csrfValue);
    results.push(readResult);
    console.log(computeStats(readResult));
  }

  // Wait 65s between phases to ensure rate limit window resets
  if (!config.skipRead && !config.skipWrite) {
    console.log("\n⏳ Waiting 65s for rate limit window to reset before WRITE test...");
    await new Promise((r) => setTimeout(r, 65_000));
  }

  if (!config.skipWrite) {
    const writeResult = await testAccountingWrite(config.baseUrl, token, csrfValue);
    results.push(writeResult);
    console.log(computeStats(writeResult));
  }

  if (!config.skipReport) {
    if (!config.skipWrite) {
      console.log("\n⏳ Waiting 65s for rate limit window to reset before REPORT test...");
      await new Promise((r) => setTimeout(r, 65_000));
    }
    const reportResult = await testReportGeneration(config.baseUrl, token, csrfValue);
    results.push(reportResult);
    console.log(computeStats(reportResult));
  }

  // 7. Summary
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  SUMMARY                                                     ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  let allPass = true;
  for (const r of results) {
    const expected429At = r.limitConfig.maxAttempts + 1;
    const actual429At = r.first429AtRequest ?? "never";
    const pass = r.first429AtRequest !== null &&
      r.first429AtRequest <= expected429At + 2;
    allPass = allPass && pass;
    const status = pass ? "✅ PASS" : "❌ FAIL";

    console.log(`  ${status} ${r.name}: limit=${r.limitConfig.maxAttempts}/min, first 429 at request #${actual429At} (expected ~#${expected429At})`);
    console.log(`       ${r.successfulRequests} succeeded, ${r.rateLimitedRequests} rate-limited, ${r.authFailures} auth failures`);
  }

  console.log(`\n  Overall: ${allPass ? "✅ ALL RATE LIMITS WORKING CORRECTLY" : "❌ SOME RATE LIMITS NOT ENFORCED"}`);

  // 8. Save results to JSON
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputDir = path.resolve(process.cwd(), "load-test-results");
  const outputPath = path.join(outputDir, `accounting-rate-limit-${timestamp}.json`);

  const outputData = {
    metadata: {
      version: "12.1.0",
      timestamp: new Date().toISOString(),
      config,
    },
    results: results.map((r) => ({
      name: r.name,
      endpoint: r.endpoint,
      method: r.method,
      totalRequests: r.totalRequests,
      successfulRequests: r.successfulRequests,
      rateLimitedRequests: r.rateLimitedRequests,
      authFailures: r.authFailures,
      otherErrors: r.otherErrors,
      first429AtRequest: r.first429AtRequest,
      limitConfig: r.limitConfig,
      avgLatencyMs: r.latencies.length > 0
        ? r.latencies.reduce((a, b) => a + b, 0) / r.latencies.length
        : 0,
      p50LatencyMs: percentile([...r.latencies].sort((a, b) => a - b), 50),
      p95LatencyMs: percentile([...r.latencies].sort((a, b) => a - b), 95),
      p99LatencyMs: percentile([...r.latencies].sort((a, b) => a - b), 99),
    })),
    overallPass: allPass,
  };

  // Ensure directory exists
  try {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
    console.log(`\n  💾 Results saved to: ${outputPath}`);
  } catch (err) {
    console.log(`\n  ⚠️ Could not save results file (non-critical): ${err instanceof Error ? err.message : String(err)}`);
  }

  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
