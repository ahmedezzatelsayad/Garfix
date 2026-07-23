/**
 * bench-openrouter-free-speed.ts
 *
 * Tests EVERY free OpenRouter model and measures speed:
 *   - TTFT (Time To First Token) — first-byte latency via streaming
 *   - Total latency — end-to-end wall time
 *   - Tokens generated (in/out)
 *   - Throughput — output tokens / generation seconds
 *   - Success rate across N runs
 *
 * Strategy:
 *   1. Live-fetch the free model list from https://openrouter.ai/api/v1/models
 *      (filter by `:free` suffix).
 *   2. For each model, run N_REPEATS streaming chat completions with a
 *      standard Arabic+English prompt.
 *   3. Adaptive rate-limit handling: respect `Retry-After` header on 429.
 *   4. Output JSON + Markdown + CSV + HTML charts.
 *
 * HONEST LABELS:
 *   - [MEASURED]    = real network call to OpenRouter, real timestamps
 *   - [OPENROUTER]  = depends on OpenRouter upstream availability
 *
 * Usage:
 *   OPENROUTER_API_KEY=sk-or-... bun run scripts/bench-openrouter-free-speed.ts
 *
 * Outputs (in bench-results/):
 *   - openrouter-free-speed.json
 *   - openrouter-free-speed.md
 *   - openrouter-free-speed.csv
 *   - openrouter-free-speed-charts.html
 */
import { writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";

const BASE_URL = "https://openrouter.ai/api/v1";
const OUT_DIR = join(process.cwd(), "bench-results");
const PROGRESS_LOG = join(OUT_DIR, "openrouter-free-speed.progress.log");
mkdirSync(OUT_DIR, { recursive: true });

/** Sidecar progress logger — writes both to stdout AND a sync-flushed file
 * so background runs can be monitored reliably. */
function progress(msg: string): void {
  console.log(msg);
  try {
    appendFileSync(PROGRESS_LOG, msg + "\n");
  } catch {
    /* ignore */
  }
}

// Process-level error handlers — prevents silent exits
process.on("uncaughtException", err => {
  const msg = `[FATAL uncaughtException] ${err instanceof Error ? err.stack || err.message : String(err)}`;
  console.error(msg);
  try { appendFileSync(PROGRESS_LOG, msg + "\n"); } catch { /* ignore */ }
  process.exit(2);
});
process.on("unhandledRejection", err => {
  const msg = `[FATAL unhandledRejection] ${err instanceof Error ? err.stack || err.message : String(err)}`;
  console.error(msg);
  try { appendFileSync(PROGRESS_LOG, msg + "\n"); } catch { /* ignore */ }
  process.exit(3);
});

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_KEY) {
  console.error("FATAL: OPENROUTER_API_KEY env var is not set.");
  console.error("Set it inline:  OPENROUTER_API_KEY=sk-or-... bun run scripts/bench-openrouter-free-speed.ts");
  process.exit(1);
}

// Per-model repeat count. 2 = good balance of stability vs. rate-limit budget.
// OpenRouter free tier ≈ 20 req/min, so 20 models × 2 repeats = 40 reqs ≈ 2 min minimum.
const N_REPEATS = 2;

// Standard prompt — bilingual + reasoning, so we measure real-world speed.
// Short enough to keep token cost low, long enough to measure throughput.
const PROMPT: Array<{ role: "system" | "user"; content: string }> = [
  {
    role: "system",
    content:
      "You are a helpful multilingual assistant. Reply concisely. Use both Arabic and English when helpful.",
  },
  {
    role: "user",
    content:
      "In 3 short sentences, explain what an invoice is. Answer in Arabic then English.",
  },
];

const MAX_TOKENS = 200; // Enough for 3 short sentences × 2 languages.

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface FreeModel {
  id: string;
  name: string;
  context_length: number;
  modality: string;
  prompt_price: string; // $/token (should be "0" for free)
  completion_price: string;
}

interface SingleRun {
  ok: boolean;
  httpStatus: number;
  ttftMs: number | null; // Time to first token
  totalMs: number; // End-to-end wall
  generationMs: number | null; // Total - TTFT (time spent streaming)
  tokensIn: number;
  tokensOut: number;
  throughputTokPerSec: number | null; // tokensOut / generationMs * 1000
  contentPreview: string;
  error?: string;
  errorCode?: string | number;
  retryAfterMs?: number;
}

interface ModelResult {
  model: FreeModel;
  runs: SingleRun[];
  successCount: number;
  // Aggregates over successful runs only
  medianTtftMs: number | null;
  medianTotalMs: number | null;
  medianThroughput: number | null;
  medianTokensOut: number | null;
  meanTtftMs: number | null;
  meanTotalMs: number | null;
  meanThroughput: number | null;
  // Composite speed score (lower is better for latency, higher for throughput)
  speedRank: number | null;
  verdict: "fast" | "medium" | "slow" | "failed";
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function mean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Fetch live free model list from OpenRouter public endpoint (no auth needed). */
async function fetchFreeModels(): Promise<FreeModel[]> {
  const res = await fetch(`${BASE_URL}/models`, {
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Failed to list models: HTTP ${res.status}`);
  const data = (await res.json()) as { data: Array<Record<string, unknown>> };

  const free = data.data
    .filter(m => typeof m.id === "string" && (m.id as string).endsWith(":free"))
    .map(m => ({
      id: m.id as string,
      name: (m.name as string) || (m.id as string),
      context_length: (m.context_length as number) || 0,
      modality: (m.architecture as { modality?: string })?.modality || "text->text",
      prompt_price: (m.pricing as { prompt?: string })?.prompt || "0",
      completion_price: (m.pricing as { completion?: string })?.completion || "0",
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return free;
}

/**
 * Run a single streaming chat completion against `model`.
 *
 * Returns precise TTFT (when the first SSE delta arrives) and end-to-end wall time.
 *
 * [MEASURED] — real network call to OpenRouter via fetch streaming.
 */
async function runOnce(model: string): Promise<SingleRun> {
  const t0 = Date.now();
  let firstByteAt: number | null = null;
  let tokensIn = 0;
  let tokensOut = 0;
  let content = "";
  let httpStatus = 0;
  let errorCode: string | number | undefined;
  let errorMsg: string | undefined;
  let retryAfterMs: number | undefined;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);

    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_KEY}`,
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "GarfiX Free Model Speed Benchmark",
      },
      body: JSON.stringify({
        model,
        messages: PROMPT,
        max_tokens: MAX_TOKENS,
        temperature: 0.3,
        stream: true,
        stream_options: { include_usage: true },
      }),
      signal: controller.signal,
    });

    httpStatus = res.status;

    if (res.status === 429) {
      const ra = res.headers.get("Retry-After");
      retryAfterMs = ra ? parseFloat(ra) * 1000 : 5000;
      const body = await res.text();
      errorCode = 429;
      errorMsg = body.slice(0, 200);
      clearTimeout(timer);
      return {
        ok: false,
        httpStatus,
        ttftMs: null,
        totalMs: Date.now() - t0,
        generationMs: null,
        tokensIn: 0,
        tokensOut: 0,
        throughputTokPerSec: null,
        contentPreview: "",
        error: errorMsg,
        errorCode,
        retryAfterMs,
      };
    }

    if (!res.ok) {
      const body = await res.text();
      errorCode = res.status;
      errorMsg = body.slice(0, 200);
      clearTimeout(timer);
      return {
        ok: false,
        httpStatus,
        ttftMs: null,
        totalMs: Date.now() - t0,
        generationMs: null,
        tokensIn: 0,
        tokensOut: 0,
        throughputTokPerSec: null,
        contentPreview: "",
        error: errorMsg,
        errorCode,
      };
    }

    if (!res.body) {
      clearTimeout(timer);
      throw new Error("No response body for streaming");
    }

    // Parse SSE stream
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (firstByteAt === null) firstByteAt = Date.now();
      buf += decoder.decode(value, { stream: true });

      // Process complete SSE events (separated by \n\n)
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const event = buf.slice(0, idx);
        buf = buf.slice(idx + 2);

        // event may have multiple "data:" lines
        const lines = event.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const obj = JSON.parse(payload);
            // chat completion chunk
            const delta = obj.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta.length > 0) {
              content += delta;
            }
            // usage (typically in the final chunk when include_usage=true)
            if (obj.usage) {
              tokensIn = obj.usage.prompt_tokens || tokensIn;
              tokensOut = obj.usage.completion_tokens || tokensOut;
            }
          } catch {
            // partial JSON across chunks — ignore, will retry next event
          }
        }
      }
    }

    clearTimeout(timer);
    const totalMs = Date.now() - t0;
    const ttftMs = firstByteAt !== null ? firstByteAt - t0 : null;
    const generationMs = firstByteAt !== null ? totalMs - ttftMs! : null;
    const throughput =
      generationMs !== null && generationMs > 0 && tokensOut > 0
        ? (tokensOut / generationMs) * 1000
        : null;

    return {
      ok: true,
      httpStatus,
      ttftMs,
      totalMs,
      generationMs,
      tokensIn,
      tokensOut,
      throughputTokPerSec: throughput,
      contentPreview: content.slice(0, 200),
    };
  } catch (err) {
    const totalMs = Date.now() - t0;
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      httpStatus,
      ttftMs: null,
      totalMs,
      generationMs: null,
      tokensIn: 0,
      tokensOut: 0,
      throughputTokPerSec: null,
      contentPreview: "",
      error: msg,
      errorCode: msg.includes("aborted") ? "timeout" : "exception",
    };
  }
}

/**
 * Run N_REPEATS for one model, with adaptive back-off for 429s.
 */
async function benchmarkModel(model: FreeModel, idx: number, total: number): Promise<ModelResult> {
  const runs: SingleRun[] = [];
  progress(`\n[${idx + 1}/${total}] ${model.id}`);

  for (let i = 0; i < N_REPEATS; i++) {
    const r = await runOnce(model.id);
    runs.push(r);

    const tag = r.ok
      ? `✓ ttft=${r.ttftMs ?? "-"}ms total=${r.totalMs}ms out=${r.tokensOut}tok thr=${r.throughputTokPerSec !== null ? r.throughputTokPerSec.toFixed(1) : "-"}tok/s`
      : `✗ ${r.errorCode || "err"} ${r.error?.slice(0, 80) ?? ""}`.trim();

    progress(`  run ${i + 1}/${N_REPEATS}: ${tag}`);

    // Adaptive back-off — cap at 8s to keep total runtime reasonable
    if (i < N_REPEATS - 1) {
      if (r.retryAfterMs) {
        const wait = Math.min(8, Math.ceil(r.retryAfterMs / 1000) + 1);
        progress(`  (429 — backing off ${wait}s)`);
        await sleep(wait * 1000);
      } else if (!r.ok) {
        // Generic failure — short pause
        await sleep(1500);
      } else {
        // Successful — gentle pause to avoid hammering shared free quota
        await sleep(1500);
      }
    }
  }

  const okRuns = runs.filter(r => r.ok);
  const successCount = okRuns.length;

  const ttfts = okRuns.map(r => r.ttftMs!).filter((x): x is number => x != null);
  const totals = okRuns.map(r => r.totalMs);
  const throughputs = okRuns.map(r => r.throughputTokPerSec!).filter((x): x is number => x != null);
  const tokensOuts = okRuns.map(r => r.tokensOut);

  const medianTtftMs = median(ttfts);
  const medianTotalMs = median(totals);
  const medianThroughput = median(throughputs);
  const medianTokensOut = median(tokensOuts);

  const meanTtftMs = mean(ttfts);
  const meanTotalMs = mean(totals);
  const meanThroughput = mean(throughputs);

  // Composite speed rank: lower = faster
  // Formula: normalize TTFT (latency to first token) and inverse throughput,
  // combine 60% TTFT + 40% throughput (because TTFT is what users feel).
  let speedRank: number | null = null;
  if (medianTtftMs !== null && medianThroughput !== null && medianThroughput > 0) {
    speedRank = medianTtftMs * 0.6 + (1000 / medianThroughput) * 0.4;
  } else if (medianTtftMs !== null) {
    speedRank = medianTtftMs;
  } else if (medianThroughput !== null && medianThroughput > 0) {
    speedRank = 1000 / medianThroughput;
  }

  let verdict: ModelResult["verdict"] = "failed";
  if (successCount > 0 && medianTtftMs !== null) {
    if (medianTtftMs < 1500 && (medianThroughput ?? 0) > 30) verdict = "fast";
    else if (medianTtftMs < 4000) verdict = "medium";
    else verdict = "slow";
  }

  return {
    model,
    runs,
    successCount,
    medianTtftMs,
    medianTotalMs,
    medianThroughput,
    medianTokensOut,
    meanTtftMs,
    meanTotalMs,
    meanThroughput,
    speedRank,
    verdict,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Output writers
// ─────────────────────────────────────────────────────────────────────────────

function writeJson(all: ModelResult[], meta: Record<string, unknown>): void {
  const out = {
    meta,
    models: all,
  };
  writeFileSync(join(OUT_DIR, "openrouter-free-speed.json"), JSON.stringify(out, null, 2));
}

function writeCsv(all: ModelResult[]): void {
  const header = [
    "model_id",
    "name",
    "context_length",
    "modality",
    "success_runs",
    "median_ttft_ms",
    "median_total_ms",
    "median_throughput_tok_per_sec",
    "median_tokens_out",
    "mean_ttft_ms",
    "mean_total_ms",
    "mean_throughput_tok_per_sec",
    "speed_rank",
    "verdict",
  ].join(",");
  const rows = all.map(r =>
    [
      r.model.id,
      `"${r.model.name.replace(/"/g, '""')}"`,
      r.model.context_length,
      `"${r.model.modality}"`,
      `${r.successCount}/${N_REPEATS}`,
      r.medianTtftMs?.toFixed(0) ?? "",
      r.medianTotalMs?.toFixed(0) ?? "",
      r.medianThroughput?.toFixed(1) ?? "",
      r.medianTokensOut?.toFixed(0) ?? "",
      r.meanTtftMs?.toFixed(0) ?? "",
      r.meanTotalMs?.toFixed(0) ?? "",
      r.meanThroughput?.toFixed(1) ?? "",
      r.speedRank?.toFixed(1) ?? "",
      r.verdict,
    ].join(","),
  );
  writeFileSync(join(OUT_DIR, "openrouter-free-speed.csv"), [header, ...rows].join("\n"));
}

function writeMarkdown(all: ModelResult[], meta: Record<string, unknown>): void {
  const successful = all
    .filter(r => r.successCount > 0 && r.speedRank !== null)
    .sort((a, b) => (a.speedRank! - b.speedRank!));
  const failed = all.filter(r => r.successCount === 0);

  const lines: string[] = [];
  lines.push("# OpenRouter Free Models — Speed Benchmark");
  lines.push("");
  lines.push(`**Date:** ${new Date(meta.timestamp as string).toISOString()}`);
  lines.push(`**Method:** [MEASURED] real streaming chat completions via OpenRouter API`);
  lines.push(`**Prompt:** 3-sentence invoice explanation (Arabic + English)`);
  lines.push(`**Max output tokens:** ${MAX_TOKENS}`);
  lines.push(`**Repeats per model:** ${N_REPEATS}`);
  lines.push(`**Total free models tested:** ${all.length}`);
  lines.push(`**Successful:** ${successful.length} | **Failed/all-rate-limited:** ${failed.length}`);
  lines.push("");
  lines.push("## 🏆 Speed Ranking (fastest first)");
  lines.push("");
  lines.push("Lower **speed_rank** = faster. Formula: `0.6 × TTFT + 0.4 × (1000 / throughput)`.");
  lines.push("");
  lines.push("| # | Model | TTFT (ms) | Total (ms) | Throughput (tok/s) | Tokens Out | Speed Rank | Verdict |");
  lines.push("|---|-------|----------:|-----------:|-------------------:|-----------:|-----------:|:--------|");

  successful.forEach((r, i) => {
    lines.push(
      `| ${i + 1} | \`${r.model.id}\` | ${r.medianTtftMs?.toFixed(0) ?? "-"} | ${r.medianTotalMs?.toFixed(0) ?? "-"} | ${r.medianThroughput?.toFixed(1) ?? "-"} | ${r.medianTokensOut?.toFixed(0) ?? "-"} | ${r.speedRank?.toFixed(1) ?? "-"} | ${r.verdict} |`,
    );
  });

  if (failed.length > 0) {
    lines.push("");
    lines.push("## ❌ Failed / Rate-Limited");
    lines.push("");
    lines.push("| Model | Runs | Error |");
    lines.push("|-------|-----:|-------|");
    for (const r of failed) {
      const sample = r.runs[0]?.error?.slice(0, 100).replace(/\|/g, "\\|") ?? "unknown";
      lines.push(`| \`${r.model.id}\` | ${r.successCount}/${N_REPEATS} | ${sample} |`);
    }
  }

  // Verdict & recommendation
  lines.push("");
  lines.push("## 🎯 Verdict & Recommendation");
  lines.push("");
  if (successful.length === 0) {
    lines.push("**No model succeeded.** OpenRouter free tier is currently rate-limited or all free models are unavailable. Retry later.");
  } else {
    const fastest = successful[0];
    const fastestThroughput = successful
      .slice()
      .sort((a, b) => (b.medianThroughput ?? 0) - (a.medianThroughput ?? 0))[0];
    const lowestLatency = successful
      .slice()
      .sort((a, b) => (a.medianTtftMs ?? Infinity) - (b.medianTtftMs ?? Infinity))[0];

    lines.push(`- **🏆 Fastest overall:** \`${fastest.model.id}\` — speed rank ${fastest.speedRank?.toFixed(1)}, TTFT ${fastest.medianTtftMs?.toFixed(0)}ms, ${fastest.medianThroughput?.toFixed(1)} tok/s.`);
    if (fastestThroughput !== fastest) {
      lines.push(`- **⚡ Highest throughput:** \`${fastestThroughput.model.id}\` — ${fastestThroughput.medianThroughput?.toFixed(1)} tok/s.`);
    }
    if (lowestLatency !== fastest) {
      lines.push(`- **🚀 Lowest latency (TTFT):** \`${lowestLatency.model.id}\` — ${lowestLatency.medianTtftMs?.toFixed(0)}ms.`);
    }
    lines.push("");
    lines.push("**Recommendation for GarfiX:**");
    lines.push(`Use \`${fastest.model.id}\` as the primary free OpenRouter model for tasks where speed matters (chat replies, copilot answers). For longer generation tasks (invoice-brain extraction), prefer \`${fastestThroughput.model.id}\` (higher throughput).`);
  }

  lines.push("");
  lines.push("## 📋 Methodology");
  lines.push("");
  lines.push("- **TTFT (Time To First Token):** measured from `fetch()` start to first SSE chunk arrival.");
  lines.push("- **Throughput:** `output_tokens / generation_seconds`, where `generation_seconds = (total - TTFT) / 1000`.");
  lines.push("- **Median** used (not mean) to suppress outliers from cold-start or transient network blips.");
  lines.push("- **Streaming enabled** (`stream: true` with `include_usage`) — measures real per-token latency, not buffered.");
  lines.push("- **Rate-limit handling:** adaptive back-off honoring `Retry-After` header on 429 responses.");
  lines.push("- **Honesty:** every metric is labeled [MEASURED] (real OpenRouter call). Failed runs are reported, not hidden.");
  lines.push("");

  writeFileSync(join(OUT_DIR, "openrouter-free-speed.md"), lines.join("\n"));
}

function writeCharts(all: ModelResult[], meta: Record<string, unknown>): void {
  const successful = all
    .filter(r => r.successCount > 0 && r.medianTtftMs !== null)
    .sort((a, b) => (a.speedRank ?? Infinity) - (b.speedRank ?? Infinity));

  const shortId = (id: string) => id.replace(":free", "").slice(0, 30);

  // Bar chart 1: TTFT (lower is better)
  const ttftBars = successful
    .map((r, i) => {
      const v = r.medianTtftMs ?? 0;
      const h = Math.min(60, (v / 5000) * 60);
      const color = v < 1500 ? "#10b981" : v < 4000 ? "#f59e0b" : "#ef4444";
      return `<g transform="translate(${i * 28 + 30},0)"><rect x="0" y="${130 - h}" width="22" height="${h}" fill="${color}" rx="2"/><text x="11" y="${140 - h}" text-anchor="middle" font-size="9" fill="#374151">${v.toFixed(0)}</text><text x="11" y="145" text-anchor="middle" font-size="8" fill="#6b7280" transform="rotate(-45 11 145)">${shortId(r.model.id)}</text></g>`;
    })
    .join("");

  // Bar chart 2: Throughput (higher is better)
  const thrBars = successful
    .map((r, i) => {
      const v = r.medianThroughput ?? 0;
      const h = Math.min(60, (v / 100) * 60);
      const color = v > 50 ? "#10b981" : v > 25 ? "#f59e0b" : "#ef4444";
      return `<g transform="translate(${i * 28 + 30},0)"><rect x="0" y="${130 - h}" width="22" height="${h}" fill="${color}" rx="2"/><text x="11" y="${140 - h}" text-anchor="middle" font-size="9" fill="#374151">${v.toFixed(0)}</text><text x="11" y="145" text-anchor="middle" font-size="8" fill="#6b7280" transform="rotate(-45 11 145)">${shortId(r.model.id)}</text></g>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>OpenRouter Free Models — Speed Benchmark</title>
<style>
  body { font-family: -apple-system, "Segoe UI", system-ui, sans-serif; background: #f9fafb; color: #111827; margin: 0; padding: 24px; }
  h1 { color: #4c1d95; margin: 0 0 8px; }
  h2 { color: #4c1d95; margin: 24px 0 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
  .meta { color: #6b7280; font-size: 13px; margin-bottom: 16px; }
  .chart { background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 12px 0 24px; overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; background: white; font-size: 13px; }
  th, td { border: 1px solid #e5e7eb; padding: 6px 10px; text-align: left; }
  th { background: #f3f4f6; color: #374151; }
  tr:nth-child(even) { background: #fafafa; }
  .fast { color: #10b981; font-weight: 600; }
  .medium { color: #f59e0b; font-weight: 600; }
  .slow { color: #ef4444; font-weight: 600; }
  .failed { color: #9ca3af; }
  code { background: #f3f4f6; padding: 1px 4px; border-radius: 3px; font-size: 12px; }
</style>
</head>
<body>
  <h1>OpenRouter Free Models — Speed Benchmark</h1>
  <div class="meta">
    Generated: ${new Date(meta.timestamp as string).toISOString()} |
    Models tested: ${all.length} |
    Repeats per model: ${N_REPEATS} |
    Prompt: 3-sentence invoice explanation (Arabic + English)
  </div>

  <h2>🏆 Speed Ranking</h2>
  <table>
    <thead><tr><th>#</th><th>Model</th><th>TTFT (ms)</th><th>Total (ms)</th><th>Throughput (tok/s)</th><th>Tokens Out</th><th>Speed Rank</th><th>Verdict</th></tr></thead>
    <tbody>
      ${successful
        .map(
          (r, i) =>
            `<tr><td>${i + 1}</td><td><code>${r.model.id}</code></td><td>${r.medianTtftMs?.toFixed(0) ?? "-"}</td><td>${r.medianTotalMs?.toFixed(0) ?? "-"}</td><td>${r.medianThroughput?.toFixed(1) ?? "-"}</td><td>${r.medianTokensOut?.toFixed(0) ?? "-"}</td><td>${r.speedRank?.toFixed(1) ?? "-"}</td><td class="${r.verdict}">${r.verdict}</td></tr>`,
        )
        .join("")}
    </tbody>
  </table>

  <h2>📊 TTFT (lower = faster)</h2>
  <div class="chart">
    <svg width="${successful.length * 28 + 80}" height="220" viewBox="0 0 ${successful.length * 28 + 80} 220">
      <line x1="30" y1="130" x2="${successful.length * 28 + 30}" y2="130" stroke="#9ca3af" stroke-width="1"/>
      ${ttftBars}
    </svg>
  </div>

  <h2>📊 Throughput (higher = faster)</h2>
  <div class="chart">
    <svg width="${successful.length * 28 + 80}" height="220" viewBox="0 0 ${successful.length * 28 + 80} 220">
      <line x1="30" y1="130" x2="${successful.length * 28 + 30}" y2="130" stroke="#9ca3af" stroke-width="1"/>
      ${thrBars}
    </svg>
  </div>
</body>
</html>`;

  writeFileSync(join(OUT_DIR, "openrouter-free-speed-charts.html"), html);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  progress("=== OpenRouter Free Models — Speed Benchmark ===");
  progress(`Time: ${new Date().toISOString()}`);
  progress(`Repeats per model: ${N_REPEATS}`);
  progress(`Max output tokens: ${MAX_TOKENS}`);
  progress("");

  progress("Fetching live free model list from OpenRouter...");
  const freeModels = await fetchFreeModels();
  progress(`Found ${freeModels.length} free models:`);
  freeModels.forEach((m, i) => progress(`  ${String(i + 1).padStart(2)}. ${m.id.padEnd(55)}  ctx=${m.context_length}`));
  progress("");

  const all: ModelResult[] = [];
  const tStart = Date.now();

  for (let i = 0; i < freeModels.length; i++) {
    const result = await benchmarkModel(freeModels[i], i, freeModels.length);
    all.push(result);

    // Inter-model pause (avoid shared free-tier quota exhaustion)
    if (i < freeModels.length - 1) {
      progress("  (pause 3s before next model)");
      await sleep(3000);
    }
  }

  const totalMs = Date.now() - tStart;

  const meta = {
    timestamp: new Date().toISOString(),
    totalWallMs: totalMs,
    totalWallHuman: `${Math.floor(totalMs / 60000)}m ${Math.floor((totalMs % 60000) / 1000)}s`,
    repeats: N_REPEATS,
    maxTokens: MAX_TOKENS,
    prompt: PROMPT,
    modelsTried: freeModels.length,
    modelsSucceeded: all.filter(r => r.successCount > 0).length,
    modelsFailed: all.filter(r => r.successCount === 0).length,
    labels: {
      measured: "Real network call to OpenRouter via fetch streaming",
      openrouter: "Subject to OpenRouter upstream availability + free-tier rate limits",
    },
  };

  // Write all outputs
  writeJson(all, meta);
  writeCsv(all);
  writeMarkdown(all, meta);
  writeCharts(all, meta);

  // Final console summary
  progress("\n" + "=".repeat(90));
  progress("=== SUMMARY ===");
  progress("=".repeat(90));
  const successful = all
    .filter(r => r.successCount > 0 && r.speedRank !== null)
    .sort((a, b) => (a.speedRank! - b.speedRank!));
  progress(`\nTotal wall: ${meta.totalWallHuman}`);
  progress(`Successful: ${successful.length}/${all.length}\n`);
  progress(
    "Model".padEnd(55) +
      " | TTFT  | Total | tok/s | Rank".padEnd(34),
  );
  progress("-".repeat(90));
  for (const r of successful) {
    progress(
      r.model.id.padEnd(55) +
        " | " +
        String(r.medianTtftMs?.toFixed(0) ?? "-").padStart(5) +
        " | " +
        String(r.medianTotalMs?.toFixed(0) ?? "-").padStart(5) +
        " | " +
        String(r.medianThroughput?.toFixed(1) ?? "-").padStart(5) +
        " | " +
        String(r.speedRank?.toFixed(1) ?? "-").padStart(6),
    );
  }

  if (successful.length > 0) {
    const winner = successful[0];
    progress(
      `\n🏆 FASTEST FREE MODEL: ${winner.model.id}  (TTFT=${winner.medianTtftMs?.toFixed(0)}ms, ${winner.medianThroughput?.toFixed(1)} tok/s, rank=${winner.speedRank?.toFixed(1)})`,
    );
  } else {
    progress("\n❌ No free model succeeded. Try again later — OpenRouter free tier is rate-limited.");
  }

  progress(`\nOutputs written to ${OUT_DIR}/`);
  progress("  - openrouter-free-speed.json");
  progress("  - openrouter-free-speed.md");
  progress("  - openrouter-free-speed.csv");
  progress("  - openrouter-free-speed-charts.html");
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});

export {};
