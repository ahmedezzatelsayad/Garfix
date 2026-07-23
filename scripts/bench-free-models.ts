/**
 * bench-free-models.ts
 *
 * Tests multiple FREE OpenRouter models to find the best one for GarfiX's
 * use cases: Arabic chat + JSON extraction (invoice-brain).
 *
 * For each model, runs 3 tests:
 *   1. Arabic chat: "كم عدد العملاء؟" → must reply in Arabic, coherent
 *   2. JSON extraction: invoice text → must return valid JSON with fields
 *   3. Math/logic: "What is 15 * 12?" → must be correct
 *
 * Scores each model on:
 *   - Success rate (3/3 = best)
 *   - Arabic quality (subjective but checking for Arabic chars in reply)
 *   - JSON validity (parseable + has required fields)
 *   - Latency (lower = better)
 *   - Token usage (lower = better for free tier limits)
 */
import { db } from "../src/lib/db";

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY!;
const BASE_URL = "https://openrouter.ai/api/v1";

// Candidate free models — selected for multilingual / instruction-following ability
const CANDIDATE_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "google/gemma-4-31b-it:free",
  "openai/gpt-oss-20b:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
  "qwen/qwen3-coder:free",
  "meta-llama/llama-3.2-3b-instruct:free",
  "tencent/hy3:free",
];

interface TestResult {
  model: string;
  test1Arabic?: { ok: boolean; reply: string; ms: number; tokens: { in: number; out: number } };
  test2Json?: { ok: boolean; parsed: boolean; hasFields: boolean; reply: string; ms: number; tokens: { in: number; out: number } };
  test3Math?: { ok: boolean; correct: boolean; reply: string; ms: number; tokens: { in: number; out: number } };
  score: number;
  error?: string;
}

async function callModel(model: string, messages: Array<{ role: string; content: string }>, maxTokens: number = 300): Promise<{ content: string; usage: { prompt_tokens: number; completion_tokens: number }; ms: number }> {
  const t0 = Date.now();
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENROUTER_KEY}`,
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "GarfiX Model Benchmark",
    },
    body: JSON.stringify({ model, messages, temperature: 0.3, max_tokens: maxTokens }),
  });
  const ms = Date.now() - t0;
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HTTP ${res.status}: ${err.slice(0, 150)}`);
  }
  const data = await res.json();
  return {
    content: data.choices?.[0]?.message?.content || "",
    usage: data.usage || { prompt_tokens: 0, completion_tokens: 0 },
    ms,
  };
}

function stripFences(text: string): string {
  let t = text.trim();
  const fenceMatch = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) return fenceMatch[1].trim();
  const firstBrace = t.search(/[{[]/);
  const lastBrace = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (firstBrace >= 0 && lastBrace > firstBrace) t = t.slice(firstBrace, lastBrace + 1);
  return t.trim();
}

async function testModel(model: string): Promise<TestResult> {
  const result: TestResult = { model, score: 0 };

  // ── Test 1: Arabic chat ──
  try {
    const r = await callModel(model, [
      { role: "system", content: "أنت مساعد ذكي لمنصة ERP. أجب بالعربية بشكل مختصر وودود." },
      { role: "user", content: "كم عدد العملاء لدي؟ (افترض أنك تعرف العدد)" },
    ]);
    const hasArabic = /[\u0600-\u06FF]/.test(r.content);
    const isCoherent = r.content.length > 10 && !r.content.includes("error") && !r.content.includes("Error");
    result.test1Arabic = { ok: hasArabic && isCoherent, reply: r.content.slice(0, 100), ms: r.ms, tokens: { in: r.usage.prompt_tokens, out: r.usage.completion_tokens } };
    if (result.test1Arabic.ok) result.score += 1;
  } catch (e) {
    result.test1Arabic = { ok: false, reply: "", ms: 0, tokens: { in: 0, out: 0 } };
    result.error = `test1: ${(e as Error).message.slice(0, 80)}`;
  }

  await new Promise(r => setTimeout(r, 3000)); // respect free-tier rate limit

  // ── Test 2: JSON extraction ──
  const invoiceText = `العميل: أحمد محمد
العنوان: الكويت - حولي
السعر: 75
العملة: KWD
الخصم: 5
الضريبة: 0
الإجمالي: 70`;
  try {
    const r = await callModel(model, [
      { role: "system", content: 'أنت محرك استخلاص بيانات. اقرأ النص وارجع JSON فقط بالحقول: {"name":"","address":"","price":0,"currency":"","discount":0,"tax":0,"total":0}' },
      { role: "user", content: invoiceText },
    ]);
    let parsed = false;
    let hasFields = false;
    try {
      const cleaned = stripFences(r.content);
      const obj = JSON.parse(cleaned);
      parsed = true;
      hasFields = typeof obj.name === "string" && typeof obj.total === "number";
    } catch { /* parse failed */ }
    result.test2Json = { ok: parsed && hasFields, parsed, hasFields, reply: r.content.slice(0, 150), ms: r.ms, tokens: { in: r.usage.prompt_tokens, out: r.usage.completion_tokens } };
    if (result.test2Json.ok) result.score += 2; // JSON is critical — weight 2x
  } catch (e) {
    result.test2Json = { ok: false, parsed: false, hasFields: false, reply: "", ms: 0, tokens: { in: 0, out: 0 } };
    result.error = `${result.error || ""}; test2: ${(e as Error).message.slice(0, 80)}`;
  }

  await new Promise(r => setTimeout(r, 3000));

  // ── Test 3: Math/logic ──
  try {
    const r = await callModel(model, [
      { role: "user", content: "What is 15 * 12? Reply with just the number." },
    ], 50);
    const correct = r.content.includes("180");
    result.test3Math = { ok: correct, correct, reply: r.content.slice(0, 50), ms: r.ms, tokens: { in: r.usage.prompt_tokens, out: r.usage.completion_tokens } };
    if (result.test3Math.ok) result.score += 1;
  } catch (e) {
    result.test3Math = { ok: false, correct: false, reply: "", ms: 0, tokens: { in: 0, out: 0 } };
    result.error = `${result.error || ""}; test3: ${(e as Error).message.slice(0, 80)}`;
  }

  return result;
}

async function main() {
  console.log("=== Free Model Benchmark ===");
  console.log(`Testing ${CANDIDATE_MODELS.length} models × 3 tests each\n`);

  const results: TestResult[] = [];

  for (let i = 0; i < CANDIDATE_MODELS.length; i++) {
    const model = CANDIDATE_MODELS[i];
    console.log(`\n[${i + 1}/${CANDIDATE_MODELS.length}] Testing: ${model}`);
    const result = await testModel(model);

    console.log(`  Test 1 (Arabic chat): ${result.test1Arabic?.ok ? "✓" : "✗"} ${result.test1Arabic?.ms}ms tok=${result.test1Arabic?.tokens.in}/${result.test1Arabic?.tokens.out}`);
    if (result.test1Arabic?.reply) console.log(`    reply: "${result.test1Arabic.reply.replace(/\n/g, " ")}"`);
    console.log(`  Test 2 (JSON extract): ${result.test2Json?.ok ? "✓" : (result.test2Json?.parsed ? "~parsed" : "✗")} ${result.test2Json?.ms}ms tok=${result.test2Json?.tokens.in}/${result.test2Json?.tokens.out}`);
    if (result.test2Json?.reply) console.log(`    reply: "${result.test2Json.reply.replace(/\n/g, " ")}"`);
    console.log(`  Test 3 (Math 15*12):   ${result.test3Math?.ok ? "✓" : "✗"} ${result.test3Math?.ms}ms tok=${result.test3Math?.tokens.in}/${result.test3Math?.tokens.out}`);
    if (result.test3Math?.reply) console.log(`    reply: "${result.test3Math.reply.replace(/\n/g, " ")}"`);
    console.log(`  SCORE: ${result.score}/4 ${result.error ? `[${result.error}]` : ""}`);

    results.push(result);

    // Pause between models to respect free-tier rate limit
    if (i < CANDIDATE_MODELS.length - 1) {
      console.log("  (pausing 5s...)");
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  // ── Summary ──
  console.log("\n" + "=".repeat(90));
  console.log("=== SUMMARY: Free Model Comparison ===");
  console.log("=".repeat(90));
  console.log("\nModel | Score | Arabic | JSON | Math | AvgMs | AvgTokensOut");
  console.log("-".repeat(90));

  const sorted = [...results].sort((a, b) => b.score - a.score);
  for (const r of sorted) {
    const allMs = [r.test1Arabic?.ms, r.test2Json?.ms, r.test3Math?.ms].filter((m): m is number => typeof m === "number" && m > 0);
    const avgMs = allMs.length ? Math.round(allMs.reduce((s, m) => s + m, 0) / allMs.length) : 0;
    const allTokOut = [r.test1Arabic?.tokens.out, r.test2Json?.tokens.out, r.test3Math?.tokens.out].filter((t): t is number => typeof t === "number");
    const avgTokOut = allTokOut.length ? Math.round(allTokOut.reduce((s, t) => s + t, 0) / allTokOut.length) : 0;

    console.log(
      `${r.model.padEnd(48)} | ${r.score}/4   | ` +
      `${r.test1Arabic?.ok ? "✓" : "✗"}     | ` +
      `${r.test2Json?.ok ? "✓" : (r.test2Json?.parsed ? "~" : "✗")}    | ` +
      `${r.test3Math?.ok ? "✓" : "✗"}   | ` +
      `${String(avgMs).padStart(5)} | ${String(avgTokOut).padStart(5)}`,
    );
  }

  const winner = sorted[0];
  console.log(`\n🏆 WINNER: ${winner.model} (score ${winner.score}/4)`);
  if (winner.score >= 3) {
    console.log(`   → Recommended for GarfiX: passes Arabic + JSON + Math`);
  } else if (winner.score >= 2) {
    console.log(`   → Usable but partial — may need fallback for some tasks`);
  } else {
    console.log(`   → All free models scored poorly — consider keeping paid DeepSeek`);
  }

  await db.$disconnect();
}

main().catch(e => { console.error("FAILED:", e); process.exit(1); });

// Make this file a module to avoid global scope collisions
export {};
