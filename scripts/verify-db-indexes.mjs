#!/usr/bin/env node
/**
 * verify-db-indexes.mjs — P2-A verification gate for DB indexes.
 *
 * The user's audit plan states: "لا يكفي إضافتها" (it's not enough to just
 * add indexes) — we must run EXPLAIN ANALYZE before AND after, on heavy
 * queries, and verify PostgreSQL actually USES the new indexes (Seq Scan →
 * Index Scan), with measurable cost / rows / execution-time improvements.
 *
 * Since we don't have a live PostgreSQL DB at dev time (local .env is a
 * SQLite placeholder), this script is designed to be run AGAINST STAGING
 * or PRODUCTION read-replica. It:
 *
 *   1. Connects to DATABASE_URL (must be a real PostgreSQL connection).
 *   2. For each heavy query defined below, runs EXPLAIN (ANALYZE, BUFFERS).
 *   3. Parses the output to detect:
 *        - Seq Scan → BAD (full table scan, no index used)
 *        - Index Scan / Index Only Scan → GOOD (index used)
 *        - Execution Time (ms)
 *   4. Compares against target thresholds (Dashboard <300ms, Invoice Search
 *      <150ms, Aging Reports <500ms — per the user's success criteria).
 *   5. Exits 0 if all queries use indexes AND meet thresholds, else 1.
 *
 * Usage:
 *   DATABASE_URL=postgresql://user:pass@host/db node verify-db-indexes.mjs
 *
 * To compare BEFORE/AFTER the migration:
 *   1. Run BEFORE deploying migration 20260805010000 → save output to
 *      /tmp/explain-before.json
 *   2. Deploy migration (prisma migrate deploy)
 *   3. Run AFTER → save to /tmp/explain-after.json
 *   4. Use --diff mode to compare:
 *      node verify-db-indexes.mjs --diff /tmp/explain-before.json /tmp/explain-after.json
 */

import { Pool } from "pg";
import { readFileSync, writeFileSync } from "node:fs";

// ── Heavy queries to benchmark ──────────────────────────────────────────
// Each query targets a known hot path in the app and the indexes that
// migration 20260805010000 adds. The "expected_index" field documents
// which index we expect PostgreSQL to use after the migration.

const HEAVY_QUERIES = [
  {
    name: "Dashboard: outstanding invoices by company (soft-delete filtered)",
    sql: `
      SELECT status, COUNT(*), SUM(totalAmount)
      FROM "invoices"
      WHERE "companySlug" = 'demo-co'
        AND "deletedAt" IS NULL
      GROUP BY status
    `,
    expected_index: "invoices_companySlug_deletedAt_idx",
    target_ms: 300,
    rationale:
      "Dashboard renders outstanding-invoices widget. Composite index on " +
      "(companySlug, deletedAt) lets PG seek directly to the company's " +
      "non-deleted rows instead of seq-scanning the whole invoices table.",
  },
  {
    name: "Invoice Search: by status + createdAt range",
    sql: `
      SELECT id, invoiceNumber, totalAmount, status, createdAt
      FROM "invoices"
      WHERE "companySlug" = 'demo-co'
        AND "deletedAt" IS NULL
        AND status = 'PENDING'
        AND "createdAt" >= NOW() - INTERVAL '30 days'
      ORDER BY "createdAt" DESC
      LIMIT 50
    `,
    expected_index: "invoices_status_createdAt_idx",
    target_ms: 150,
    rationale:
      "Invoice list page filters by status + date range. Index on " +
      "(status, createdAt) makes the ORDER BY + WHERE seekable.",
  },
  {
    name: "Aging Report: journal entries by company + date range",
    sql: `
      SELECT id, date, memo, totalCredit
      FROM "journal_entries"
      WHERE "companySlug" = 'demo-co'
        AND "deletedAt" IS NULL
        AND date >= NOW() - INTERVAL '90 days'
      ORDER BY date DESC
      LIMIT 200
    `,
    expected_index: "journal_entries_companySlug_deletedAt_idx",
    target_ms: 500,
    rationale:
      "Aging report queries 90 days of journal entries for a company. " +
      "Composite (companySlug, deletedAt) index is more selective than " +
      "standalone (deletedAt).",
  },
  {
    name: "Audit Trail UI: recent audit logs for a user",
    sql: `
      SELECT id, entity, entityId, action, createdAt
      FROM "audit_logs"
      WHERE "userUid" = 'user-example-uid'
      ORDER BY "createdAt" DESC
      LIMIT 100
    `,
    expected_index: "audit_logs_userUid_idx",
    target_ms: 200,
    rationale:
      "Admin 'User Activity' page. Without the userUid index, this is a " +
      "full scan of audit_logs (which can grow to millions of rows).",
  },
  {
    name: "Admin Audit: target company activity",
    sql: `
      SELECT id, adminEmail, action, createdAt
      FROM "admin_audit_logs"
      WHERE "targetSlug" = 'demo-co'
      ORDER BY "createdAt" DESC
      LIMIT 100
    `,
    expected_index: "admin_audit_logs_targetSlug_idx",
    target_ms: 200,
    rationale:
      "Platform-admin 'tenant activity' view. AdminAuditLog had ZERO " +
      "indexes before the migration — every query was a full scan.",
  },
  {
    name: "Automation Dashboard: recent executions by status",
    sql: `
      SELECT id, ruleId, status, triggeredAt, durationMs
      FROM "automation_execution_logs"
      WHERE status = 'FAILED'
        AND "triggeredAt" >= NOW() - INTERVAL '24 hours'
      ORDER BY "triggeredAt" DESC
      LIMIT 100
    `,
    expected_index: "automation_execution_logs_status_triggeredAt_idx",
    target_ms: 200,
    rationale:
      "Automation monitoring page filters by status + recent time window. " +
      "Composite (status, triggeredAt) is the right access pattern.",
  },
  {
    name: "JournalEntryLine: lines by parent entry (N+1 defense)",
    sql: `
      SELECT id, accountId, debit, credit
      FROM "journal_entry_lines"
      WHERE "journalEntryId" = 'je-example-id'
    `,
    expected_index: "journal_entry_lines_journalEntryId_idx",
    target_ms: 50,
    rationale:
      "Every journal entry detail view fetches its lines via this query. " +
      "Without the FK index, it's a full scan of journal_entry_lines " +
      "(which can be 10-100x larger than journal_entries itself).",
  },
  {
    name: "SessionRegistry: enforceSessionLimit on login",
    sql: `
      SELECT id, jti, "userAgent", "expiresAt", "createdAt"
      FROM "SessionRegistry"
      WHERE "userUid" = 'user-example-uid'
      ORDER BY "createdAt" ASC
    `,
    expected_index: "SessionRegistry_userUid_idx",
    target_ms: 50,
    rationale:
      "Called on EVERY login. Without the index it's a full scan of " +
      "SessionRegistry (which grows with every active user).",
  },
];

// ── EXPLAIN output parser ───────────────────────────────────────────────

function parseExplainOutput(explainRows) {
  // pg returns EXPLAIN output as a single text column, one row per line.
  const text = explainRows.map((r) => r["QUERY PLAN"] ?? r.query_plan ?? r[0]).join("\n");

  const plan_type = /Index (?:Only )?Scan/.test(text)
    ? "index_scan"
    : /Seq Scan/.test(text)
      ? "seq_scan"
      : /Bitmap (?:Index|Heap) Scan/.test(text)
        ? "bitmap_scan"
        : "unknown";

  const exec_time_match = text.match(/Execution Time:\s*([\d.]+)\s*ms/);
  const planning_time_match = text.match(/Planning Time:\s*([\d.]+)\s*ms/);
  const cost_match = text.match(/cost=([\d.]+)\.\.([\d.]+)\s/);
  const rows_match = text.match(/rows=([\d]+)/);

  const index_used_match = text.match(/Index (?:Only )?Scan using\s+(\w+)/);
  const bitmap_index_match = text.match(/Bitmap Index Scan on\s+(\w+)/);
  const index_used = index_used_match?.[1] ?? bitmap_index_match?.[1] ?? null;

  return {
    plan_type,
    index_used,
    execution_time_ms: exec_time_match ? parseFloat(exec_time_match[1]) : null,
    planning_time_ms: planning_time_match ? parseFloat(planning_time_match[1]) : null,
    cost_start: cost_match ? parseFloat(cost_match[1]) : null,
    cost_total: cost_match ? parseFloat(cost_match[2]) : null,
    rows_estimated: rows_match ? parseInt(rows_match[1], 10) : null,
    raw_text: text,
  };
}

// ── Main runner ─────────────────────────────────────────────────────────

async function runExplain(pool, query) {
  // Use a transaction so ANALYZE doesn't actually commit any changes (it
  // won't anyway for SELECTs, but this is defensive).
  const client = await pool.connect();
  try {
    const explainSql = `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${query.sql}`;
    const result = await client.query(explainSql);
    return parseExplainOutput(result.rows);
  } finally {
    client.release();
  }
}

async function main() {
  const args = process.argv.slice(2);

  // ── Diff mode ──
  if (args[0] === "--diff") {
    if (args.length < 3) {
      console.error("Usage: verify-db-indexes.mjs --diff <before.json> <after.json>");
      process.exit(2);
    }
    return diffMode(args[1], args[2]);
  }

  // ── Normal mode ──
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("ERROR: DATABASE_URL env var is required.");
    console.error("       It must point to a real PostgreSQL database (staging or prod read-replica).");
    console.error("");
    console.error("Usage: DATABASE_URL=postgresql://user:pass@host:5432/db node verify-db-indexes.mjs");
    process.exit(2);
  }

  if (databaseUrl.startsWith("file:")) {
    console.error("ERROR: DATABASE_URL is a SQLite path (file:...).");
    console.error("       This script requires PostgreSQL to run EXPLAIN ANALYZE.");
    console.error("       Run against your Neon staging database instead.");
    process.exit(2);
  }

  console.log(`\n═══════════════════════════════════════════════════════════════════════════`);
  console.log(`  P2-A DB Index Verification — EXPLAIN ANALYZE on ${HEAVY_QUERIES.length} heavy queries`);
  console.log(`═══════════════════════════════════════════════════════════════════════════\n`);

  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  const results = [];

  try {
    for (const query of HEAVY_QUERIES) {
      process.stdout.write(`▶ ${query.name}... `);
      try {
        const r = await runExplain(pool, query);
        const uses_index = r.plan_type === "index_scan" || r.plan_type === "bitmap_scan";
        const index_matches = r.index_used === query.expected_index;
        const meets_target = r.execution_time_ms !== null && r.execution_time_ms <= query.target_ms;

        const status = uses_index && meets_target ? "✓ PASS" : "✗ FAIL";
        console.log(
          `${status}  [${r.plan_type}] index=${r.index_used ?? "—"}  ` +
          `exec=${r.execution_time_ms?.toFixed(2) ?? "?"}ms (target ≤${query.target_ms}ms)  ` +
          `rows≈${r.rows_estimated ?? "?"}  cost=${r.cost_total ?? "?"}`,
        );

        if (!index_matches && r.index_used) {
          console.log(`    ⚠️  Expected index ${query.expected_index} but used ${r.index_used}`);
        }
        if (!meets_target) {
          console.log(`    ⚠️  Exceeds target: ${r.execution_time_ms}ms > ${query.target_ms}ms`);
          console.log(`    Rationale: ${query.rationale}`);
        }

        results.push({ ...query, result: r, uses_index, meets_target, index_matches });
      } catch (err) {
        console.log(`✗ ERROR  ${err.message}`);
        results.push({ ...query, result: null, error: err.message });
      }
    }
  } finally {
    await pool.end();
  }

  // ── Summary ──
  const pass_count = results.filter((r) => r.uses_index && r.meets_target).length;
  const fail_count = results.length - pass_count;

  console.log(`\n═══════════════════════════════════════════════════════════════════════════`);
  console.log(`  SUMMARY: ${pass_count}/${results.length} passed, ${fail_count} failed`);
  console.log(`═══════════════════════════════════════════════════════════════════════════\n`);

  // Save results to a JSON file for later diffing
  const outPath = `/tmp/explain-${Date.now()}.json`;
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`Results saved to: ${outPath}\n`);

  process.exit(fail_count === 0 ? 0 : 1);
}

function diffMode(beforePath, afterPath) {
  const before = JSON.parse(readFileSync(beforePath, "utf8"));
  const after = JSON.parse(readFileSync(afterPath, "utf8"));

  console.log(`\n═══════════════════════════════════════════════════════════════════════════`);
  console.log(`  EXPLAIN ANALYZE — BEFORE vs AFTER migration`);
  console.log(`═══════════════════════════════════════════════════════════════════════════\n`);

  console.log(
    "query".padEnd(60) +
    "before_plan".padEnd(15) +
    "after_plan".padEnd(15) +
    "before_ms".padStart(12) +
    "after_ms".padStart(12) +
    "delta".padStart(12),
  );
  console.log("─".repeat(126));

  for (const a of after) {
    const b = before.find((x) => x.name === a.name);
    if (!b || !b.result || !a.result) {
      console.log(`${a.name.padEnd(60)} — missing data —`);
      continue;
    }
    const delta = (a.result.execution_time_ms ?? 0) - (b.result.execution_time_ms ?? 0);
    const delta_str = delta > 0 ? `+${delta.toFixed(2)}ms` : `${delta.toFixed(2)}ms`;
    console.log(
      a.name.slice(0, 58).padEnd(60) +
      b.result.plan_type.padEnd(15) +
      a.result.plan_type.padEnd(15) +
      (b.result.execution_time_ms?.toFixed(2) ?? "?").padStart(12) +
      (a.result.execution_time_ms?.toFixed(2) ?? "?").padStart(12) +
      delta_str.padStart(12),
    );
  }
  console.log("");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
