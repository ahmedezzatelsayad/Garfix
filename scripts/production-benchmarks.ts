/**
 * production-benchmarks.ts — Stage 2: Production Validation with Real Valkey
 *
 * Usage: VALKEY_URL=valkey://localhost:6379 bun run scripts/production-benchmarks.ts
 */

import { getValkeyClient, closeValkey, valkeyHealthCheck } from "../src/lib/valkey";

// -- helpers --
function pct(sorted: number[], p: number): number {
  const i = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(i, sorted.length - 1))];
}
function stats(lat: number[]) {
  const s = [...lat].sort((a, b) => a - b);
  const sum = s.reduce((a, b) => a + b, 0);
  return { ops: s.length, totalMs: sum.toFixed(1), avgUs: ((sum / s.length) * 1000).toFixed(1), p50Us: (pct(s, 50) * 1000).toFixed(1), p95Us: (pct(s, 95) * 1000).toFixed(1), p99Us: (pct(s, 99) * 1000).toFixed(1), maxUs: (s[s.length - 1] * 1000).toFixed(1), throughput: ((s.length / (sum / 1000))).toFixed(0) };
}
function mem() {
  const m = process.memoryUsage();
  return { rssMB: (m.rss / 1048576).toFixed(1), heapUsedMB: (m.heapUsed / 1048576).toFixed(1), heapTotalMB: (m.heapTotal / 1048576).toFixed(1), externalMB: (m.external / 1048576).toFixed(1) };
}
async function scanDel(c: import("ioredis").default, pattern: string) {
  let cursor = "0";
  const batch: string[] = [];
  do {
    const [nc, keys] = await c.scan(Number(cursor), "MATCH", pattern, "COUNT", 500);
    cursor = nc;
    batch.push(...keys);
  } while (cursor !== "0");
  if (batch.length > 0) await c.del(...batch);
  return batch.length;
}

async function benchCache(c: import("ioredis").default) {
  console.log("\n=== CACHE BENCHMARK (Real Valkey) ===");

  // 100K writes via pipeline
  console.log("[CACHE] Phase 1: 100,000 SETs (pipelined)...");
  const ws = performance.now();
  const p = c.pipeline();
  for (let i = 0; i < 100_000; i++) p.set("bench:c:" + i, JSON.stringify({ i }), "EX", 300);
  await p.exec();
  console.log("[CACHE] 100K SETs: " + (performance.now() - ws).toFixed(1) + "ms, " + ((100000 / ((performance.now() - ws) / 1000))).toFixed(0) + " ops/sec");

  // 1M individual GETs
  console.log("[CACHE] Phase 2: 1,000,000 GETs (individual, measuring P50/P95/P99)...");
  const lats: number[] = [];
  const rs = performance.now();
  for (let i = 0; i < 1_000_000; i++) {
    const t0 = performance.now();
    await c.get("bench:c:" + (i % 100_000));
    lats.push(performance.now() - t0);
    if (i > 0 && i % 200_000 === 0) console.log("[CACHE] " + i.toLocaleString() + " reads...");
  }
  const rm = performance.now() - rs;
  const s = stats(lats);
  console.log("[CACHE] 1M GETs: total=" + rm.toFixed(1) + "ms");
  console.log("  avg=" + s.avgUs + "us  p50=" + s.p50Us + "us  p95=" + s.p95Us + "us  p99=" + s.p99Us + "us  max=" + s.maxUs + "us  throughput=" + s.throughput + " ops/sec");

  // 100K DELs via pipeline
  console.log("[CACHE] Phase 3: 100,000 DELs (pipelined)...");
  const ds = performance.now();
  const dp = c.pipeline();
  for (let i = 0; i < 100_000; i++) dp.del("bench:c:" + i);
  await dp.exec();
  console.log("[CACHE] 100K DELs: " + (performance.now() - ds).toFixed(1) + "ms");

  await scanDel(c, "bench:c:*");
  return s;
}

async function benchPubSub(c: import("ioredis").default) {
  console.log("\n=== PUB/SUB BENCHMARK (Real Valkey) ===");
  const Redis = (await import("ioredis")).default;
  const sub = new Redis("redis://localhost:6379");
  let recv = 0;
  sub.subscribe("bench:ps");
  sub.on("message", () => { recv++; });

  console.log("[PUBSUB] 50,000 publish (pipelined)...");
  const ps = performance.now();
  const pp = c.pipeline();
  for (let i = 0; i < 50_000; i++) pp.publish("bench:ps", JSON.stringify({ i }));
  await pp.exec();
  console.log("[PUBSUB] 50K published: " + (performance.now() - ps).toFixed(1) + "ms, " + ((50000 / ((performance.now() - ps) / 1000))).toFixed(0) + " msg/sec");
  await new Promise((r) => setTimeout(r, 500));
  console.log("[PUBSUB] Received: " + recv + "/50,000");

  // Individual latency
  const lats: number[] = [];
  for (let i = 0; i < 1_000; i++) {
    const t0 = performance.now();
    await c.publish("bench:lat", "m");
    lats.push(performance.now() - t0);
  }
  const s = stats(lats);
  console.log("[PUBSUB] Individual: avg=" + s.avgUs + "us  p50=" + s.p50Us + "us  p95=" + s.p95Us + "us  p99=" + s.p99Us + "us");

  await sub.unsubscribe().catch(() => {});
  await sub.quit().catch(() => {});
  return s;
}

async function benchBullMQ() {
  console.log("\n=== BULLMQ BENCHMARK (Real Valkey) ===");
  const { Queue, Worker } = await import("bullmq");
  const conn = { connection: { host: "127.0.0.1", port: 6379 } };

  const q = new Queue("bench-q", conn);
  await q.obliterate({ force: true });

  let done = 0;
  const lats: number[] = [];
  const w = new Worker("bench-q", async () => {
    const t0 = performance.now();
    await new Promise((r) => setTimeout(r, 0));
    done++;
    lats.push(performance.now() - t0);
  }, { ...conn, concurrency: 50, autorun: true });

  // 100K enqueue
  console.log("[BULLMQ] Enqueuing 100,000 jobs...");
  const es = performance.now();
  for (let i = 0; i < 100_000; i++) {
    await q.add("j" + i, { i }, { attempts: 1, removeOnComplete: 100 });
    if (i > 0 && i % 10_000 === 0) console.log("[BULLMQ] Enqueued " + i.toLocaleString() + "...");
  }
  console.log("[BULLMQ] 100K enqueue: " + (performance.now() - es).toFixed(1) + "ms, " + ((100000 / ((performance.now() - es) / 1000))).toFixed(0) + " jobs/sec");

  // Wait
  console.log("[BULLMQ] Processing (concurrency=50)...");
  const ws = performance.now();
  while (done < 100_000) {
    const c = await q.getJobCounts("completed", "failed", "waiting", "active");
    process.stdout.write("\r[BULLMQ] Done: " + done.toLocaleString() + " | Wait: " + c.waiting + " | Active: " + c.active + " | Failed: " + c.failed + "     ");
    if (c.waiting === 0 && c.active === 0) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  console.log("\n[BULLMQ] All processed in " + (performance.now() - ws).toFixed(1) + "ms");
  const s = stats(lats);
  console.log("[BULLMQ] Processing latency: avg=" + s.avgUs + "us  p50=" + s.p50Us + "us  p95=" + s.p95Us + "us  p99=" + s.p99Us + "us");

  // Retry test
  console.log("\n[BULLMQ] Retry test (100 jobs, 3 attempts each)...");
  const rq = new Queue("bench-retry", conn);
  await rq.obliterate({ force: true });
  let attempts = 0;
  const rw = new Worker("bench-retry", async () => {
    attempts++;
    if (attempts <= 100) throw new Error("intentional " + attempts);
  }, { ...conn, concurrency: 5, autorun: true });
  for (let i = 0; i < 100; i++) await rq.add("r" + i, {}, { attempts: 3, backoff: { type: "fixed", delay: 50 } });
  await new Promise((r) => setTimeout(r, 5000));
  const rc = await rq.getJobCounts("completed", "failed");
  console.log("[BULLMQ] Retry: attempts=" + attempts + " completed=" + rc.completed + " failed=" + rc.failed);

  // Priority test
  console.log("\n[BULLMQ] Priority test...");
  const pq = new Queue("bench-prio", conn);
  await pq.obliterate({ force: true });
  const order: number[] = [];
  const pw = new Worker("bench-prio", async (job: any) => {
    order.push(job.data.p);
    await new Promise((r) => setTimeout(r, 1));
  }, { ...conn, concurrency: 1, autorun: true });
  for (const p of [3, 2, 1, 3, 2, 1, 3, 2, 1]) await pq.add("p" + p, { p }, { priority: p });
  await new Promise((r) => setTimeout(r, 3000));
  console.log("[BULLMQ] Order: " + order.join("->") + " | Highest first: " + (order[0] === 3 ? "YES" : "NO"));

  await w.close(); await rw.close(); await pw.close();
  await q.close(); await rq.close(); await pq.close();
  return s;
}

async function benchRateLimiter(c: import("ioredis").default) {
  console.log("\n=== RATE LIMITER BENCHMARK (Real Valkey) ===");
  const lats: number[] = [];

  console.log("[RL] 10,000 sequential INCR+PEXPIRE...");
  const ss = performance.now();
  for (let i = 0; i < 10_000; i++) {
    const k = "rl:b:" + i;
    const t0 = performance.now();
    const n = await c.incr("rl:w:" + k);
    if (n === 1) await c.pexpire("rl:w:" + k, 60000);
    lats.push(performance.now() - t0);
  }
  const s = stats(lats);
  console.log("[RL] Sequential: avg=" + s.avgUs + "us  p50=" + s.p50Us + "us  p95=" + s.p95Us + "us  p99=" + s.p99Us + "us  throughput=" + s.throughput + " ops/sec");

  // 1K concurrent
  console.log("[RL] 1,000 concurrent...");
  const cs = performance.now();
  await Promise.all(Array.from({ length: 1000 }, (_, i) =>
    (async () => { const n = await c.incr("rl:conc:" + (i % 100)); if (n === 1) await c.pexpire("rl:conc:" + (i % 100), 60000); })()
  ));
  console.log("[RL] 1K concurrent: " + (performance.now() - cs).toFixed(1) + "ms, " + ((1000 / ((performance.now() - cs) / 1000))).toFixed(0) + " ops/sec");

  await scanDel(c, "rl:b:*");
  await scanDel(c, "rl:w:*");
  await scanDel(c, "rl:conc:*");
  return s;
}

async function benchMemoryLeak(c: import("ioredis").default) {
  console.log("\n=== MEMORY LEAK TEST ===");
  const before = mem();
  console.log("[MEM] Before: RSS=" + before.rssMB + "MB, Heap=" + before.heapUsedMB + "MB");

  console.log("[MEM] 1,000,000 read/write cycles...");
  const ss = performance.now();
  for (let i = 0; i < 1_000_000; i++) {
    await c.set("mem:t:" + (i % 1000), "v" + i);
    await c.get("mem:t:" + (i % 1000));
    if (i > 0 && i % 200_000 === 0) {
      const m = mem();
      process.stdout.write("\r[MEM] " + i.toLocaleString() + "/1M | RSS=" + m.rssMB + "MB | Heap=" + m.heapUsedMB + "MB   ");
    }
  }
  const el = performance.now() - ss;
  console.log("\n[MEM] 1M cycles: " + el.toFixed(1) + "ms (" + ((1000000 / (el / 1000))).toFixed(0) + " cycles/sec)");

  await scanDel(c, "mem:t:*");
  const after = mem();
  const rssD = parseFloat(after.rssMB) - parseFloat(before.rssMB);
  const heapD = parseFloat(after.heapUsedMB) - parseFloat(before.heapUsedMB);
  const verdict = rssD < 50 && heapD < 20 ? "PASS" : "WARN";
  console.log("[MEM] After: RSS=" + after.rssMB + "MB, Heap=" + after.heapUsedMB + "MB");
  console.log("[MEM] Delta: RSS=" + (rssD > 0 ? "+" : "") + rssD.toFixed(1) + "MB, Heap=" + (heapD > 0 ? "+" : "") + heapD.toFixed(1) + "MB");
  console.log("[MEM] Verdict: " + verdict);
  return { before, after, rssDelta: rssD, heapDelta: heapD, verdict, elapsed: el.toFixed(1) };
}

async function benchChaos() {
  console.log("\n=== CHAOS TESTS (Real Valkey Kill + Restart) ===");
  const { execSync } = await import("node:child_process");
  const VBIN = "/tmp/valkey-io-valkey-9b4ab3b/src";
  const c = await getValkeyClient();
  if (!c) { console.log("[CHAOS] SKIP: no client"); return {}; }

  // Write 5K keys
  console.log("[CHAOS] Preloading 5,000 keys...");
  const pp = c.pipeline();
  for (let i = 0; i < 5000; i++) pp.set("chaos:k:" + i, "v" + i, "EX", 3600);
  await pp.exec();

  // Kill Valkey
  console.log("[CHAOS] *** KILLING VALKEY ***");
  try { execSync("kill $(cat /tmp/valkey.pid)"); } catch {}

  // Try 100 ops (should fail)
  let failCount = 0;
  for (let i = 0; i < 100; i++) {
    try { await c.ping(); } catch { failCount++; }
  }
  console.log("[CHAOS] Ops during downtime: " + failCount + "/100 failed (expected ~100)");

  // Restart
  console.log("[CHAOS] Restarting Valkey...");
  execSync(VBIN + "/valkey-server --daemonize yes --port 6379 --maxmemory 256mb --maxmemory-policy allkeys-lru --appendonly no --save '' --pidfile /tmp/valkey.pid --logfile /tmp/valkey.log");
  await new Promise((r) => setTimeout(r, 1500));

  // Wait for reconnection
  let reconnected = false;
  for (let i = 0; i < 20; i++) {
    try { const r = await c.ping(); if (r === "PONG") { reconnected = true; break; } } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log("[CHAOS] Reconnect: " + (reconnected ? "SUCCESS" : "FAILED"));

  // Post-restart ops
  let postOps = 0;
  for (let i = 0; i < 1000; i++) {
    try { await c.set("post:" + i, "ok"); await c.get("post:" + i); postOps++; } catch { break; }
  }
  console.log("[CHAOS] Post-restart ops: " + postOps + "/1,000");

  await scanDel(c, "post:*");
  return { reconnected: reconnected ? "PASS" : "FAIL", postOps: postOps + "/1000", dataSurvived: "N/A (AOF off)" };
}

async function main() {
  console.log("=".repeat(70));
  console.log("  GarfiX Production Validation - Real Valkey Benchmarks");
  console.log("=".repeat(70));
  console.log("  Time: " + new Date().toISOString());
  console.log("  Node: " + process.version + " | Bun: " + (process.versions.bun || "N/A"));
  console.log("  Memory: " + JSON.stringify(mem()));

  const h = await valkeyHealthCheck();
  console.log("  Valkey health: " + JSON.stringify(h));
  if (!h.ok) { console.error("FATAL: Valkey not reachable"); process.exit(1); }

  const c = await getValkeyClient();
  if (!c) { console.error("FATAL: No client"); process.exit(1); }
  await c.flushdb();
  console.log("  DB flushed. Starting...\n");

  const R: Record<string, any> = {};

  try { R.cache = await benchCache(c); } catch (e: any) { console.error("[ERR] cache:", e.message); R.cache = { error: e.message }; }
  try { R.pubsub = await benchPubSub(c); } catch (e: any) { console.error("[ERR] pubsub:", e.message); R.pubsub = { error: e.message }; }
  try { R.rateLimiter = await benchRateLimiter(c); } catch (e: any) { console.error("[ERR] rl:", e.message); R.rateLimiter = { error: e.message }; }
  try { R.bullmq = await benchBullMQ(); } catch (e: any) { console.error("[ERR] bullmq:", e.message); R.bullmq = { error: e.message }; }
  try { R.memoryLeak = await benchMemoryLeak(c); } catch (e: any) { console.error("[ERR] mem:", e.message); R.memoryLeak = { error: e.message }; }
  try { R.chaos = await benchChaos(); } catch (e: any) { console.error("[ERR] chaos:", e.message); R.chaos = { error: e.message }; }

  console.log("\n" + "=".repeat(70));
  console.log("  FINAL: " + JSON.stringify(mem()));
  console.log("=".repeat(70));
  console.log("  SUMMARY");
  console.log("=".repeat(70));
  for (const [k, v] of Object.entries(R)) {
    const ok = !v.error;
    console.log("  " + (ok ? "PASS" : "FAIL") + " " + k + ": " + (v.error || JSON.stringify(v).slice(0, 120)));
  }

  await closeValkey();
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });