/**
 * embeddingCache.ts — Embeddings Cache (Enterprise enhancement #4).
 *
 * PURPOSE
 * -------
 * In-process LRU cache for text embeddings, designed to back the
 * `semanticMatch` evidence signal in `productMatcher.ts` (currently always
 * `null` because no embeddings layer exists yet). When a real embeddings
 * provider is plugged in, `computeSemanticMatch()` in productMatcher.ts will
 * call `getEmbedding(text)` here, which returns either a cached vector (hot
 * path) or a freshly computed one (cold path), then store it for reuse.
 *
 * CURRENT STATE — NO-OP PLACEHOLDER
 * ---------------------------------
 * No embeddings provider is wired into the codebase yet, so the default
 * compute function (`defaultComputeFn`) returns `null`. As a consequence,
 * `getEmbedding()` always returns `null` today. This is intentional and
 * mirrors the current behaviour of `semanticMatch: null` in productMatcher.ts
 * — i.e. wiring up this cache changes nothing functionally until a provider
 * is added.
 *
 * WHEN A PROVIDER IS ADDED
 * ------------------------
 * The ONLY change required is to replace `defaultComputeFn` with a real
 * implementation that calls the provider (e.g. z-ai-web-dev-sdk embeddings,
 * OpenAI `text-embedding-3-small`, Cohere `embed-english-v3.0`, etc.) and
 * returns a `Float32Array`. The cache, LRU eviction, stats, and public API
 * stay identical — no other file in the codebase needs to change to start
 * benefiting from caching.
 *
 * CONSUMER
 * --------
 * Future `computeSemanticMatch()` in `src/lib/productMatcher.ts` will be the
 * primary consumer, feeding the `semanticMatch` evidence signal that
 * contributes to `evidenceScore` and the reasons[] explanation array.
 *
 * THREAD SAFETY
 * -------------
 * This is an in-process cache relying on the Node.js single-threaded event
 * loop. Concurrent await points are safe because the Map mutations happen
 * synchronously between awaits. For multi-instance deployments (e.g. multiple
 * pods / servers behind a load balancer), each instance maintains its own
 * cache — to share embeddings across instances, layer a Redis cache on top
 * (future work: check Redis first, then this in-process cache, then compute).
 *
 * No external packages are used — pure TypeScript + Node built-ins + the
 * project's own `./logger`.
 */

import { logger } from "./logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Result of an embedding lookup / computation.
 * - `vector`: the embedding (Float32Array for compact memory footprint).
 * - `fromCache`: true if served from the LRU cache, false if freshly computed.
 * - `model`: which model produced this vector (for audit / reproducibility).
 */
export interface EmbeddingResult {
  vector: Float32Array;
  fromCache: boolean;
  model: string;
}

/**
 * Compute function contract: given (text, model), return an embedding vector
 * or `null` if the text cannot be embedded (e.g. empty after normalization,
 * provider error, provider not configured). Returning `null` propagates up
 * through `getEmbedding` so callers can degrade gracefully (the semantic
 * signal simply stays `null`).
 */
export type ComputeFn = (text: string, model: string) => Promise<Float32Array | null>;

// ---------------------------------------------------------------------------
// Cache configuration
// ---------------------------------------------------------------------------

/**
 * Default maximum number of entries the LRU cache will hold before evicting
 * the least-recently-used entry. 1000 entries is a reasonable default for a
 * single-instance deployment; bump via `configureEmbeddingCache({ maxSize })`
 * if memory budget allows and the working set is larger.
 */
const DEFAULT_MAX_SIZE = 1000;

/**
 * Default model identifier. Used when `getEmbedding()` is called without an
 * explicit `opts.model`. Update this when a real default provider is chosen.
 */
const DEFAULT_MODEL = "placeholder-v0";

interface CacheConfig {
  maxSize: number;
}

const config: CacheConfig = {
  maxSize: DEFAULT_MAX_SIZE,
};

// ---------------------------------------------------------------------------
// Cache state
// ---------------------------------------------------------------------------

interface CacheEntry {
  vector: Float32Array;
}

/**
 * The LRU store. JavaScript `Map` preserves insertion order, which makes
 * LRU eviction trivial: the first iterated key is the oldest. To "touch" an
 * entry on read (true LRU), we delete + re-set it, which moves it to the end
 * (most-recently-used position).
 */
const store = new Map<string, CacheEntry>();

/**
 * Running stats for monitoring hit rate. Reset on `clearEmbeddingCache()`.
 */
let hits = 0;
let misses = 0;

// ---------------------------------------------------------------------------
// Cache key
// ---------------------------------------------------------------------------

/**
 * Build a stable cache key from (model, normalizedText).
 *
 * `normalizedText = text.trim().toLowerCase()` collapses the most common
 * trivial variations (leading/trailing whitespace, case). The key is the
 * plain string concatenation `model + "\0" + normalizedText` — the NUL
 * byte acts as a separator that cannot appear in normal text, preventing
 * collisions between e.g. model "a" + text "bc" vs model "ab" + text "c".
 *
 * NOTE: This intentionally does NOT use a crypto hash. The Map handles
 * arbitrary-length string keys efficiently, and avoiding a hash step keeps
 * the hot path (cache hit) as cheap as possible.
 *
 * FUTURE: When a real embeddings provider is integrated, consider replacing
 * this with a content hash (e.g. sha256 of normalized text) so that
 * whitespace-only variants ("hello   world" vs "hello world") dedupe to the
 * same key. For now, exact-normalized matching is sufficient.
 */
function buildCacheKey(model: string, normalizedText: string): string {
  return model + "\u0000" + normalizedText;
}

function normalizeText(text: string): string {
  return text.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Default compute function — PLACEHOLDER
// ---------------------------------------------------------------------------

/**
 * DEFAULT COMPUTE FUNCTION — PLACEHOLDER.
 *
 * Returns `null` unconditionally because no embeddings provider is wired
 * into the project yet. This keeps `getEmbedding()` returning `null`, which
 * matches the current behaviour of `semanticMatch: null` in productMatcher.ts.
 *
 * REPLACE THIS when an embeddings provider (e.g. z-ai-web-dev-sdk
 * embeddings, OpenAI `text-embedding-3-small`, Cohere `embed-english-v3.0`)
 * is integrated. The replacement should:
 *   1. Call the provider SDK with `text` and `model`.
 *   2. Convert the returned vector to `Float32Array` (for memory efficiency).
 *   3. Return `null` on error / empty input / provider-not-configured so the
 *      caller degrades gracefully (semantic signal stays `null`).
 *
 * Until replaced, this function is intentionally a no-op.
 */
const defaultComputeFn: ComputeFn = async (
  _text: string,
  _model: string,
): Promise<Float32Array | null> => {
  return null;
};

// ---------------------------------------------------------------------------
// LRU operations
// ---------------------------------------------------------------------------

/**
 * Touch an entry: move it to the most-recently-used position (end of Map).
 * No-op if the key is not present. This implements true LRU semantics on
 * read, so frequently-accessed embeddings survive eviction.
 */
function touch(key: string): void {
  const entry = store.get(key);
  if (entry === undefined) return;
  store.delete(key);
  store.set(key, entry); // re-insert at end (most-recently-used)
}

/**
 * Evict the oldest entry (first key in Map iteration order) if the cache
 * exceeds `config.maxSize`. Logs the eviction at info level so operators can
 * observe cache pressure. Called after every successful insert.
 */
function evictIfNeeded(): void {
  while (store.size > config.maxSize) {
    // Map iteration order = insertion order; first key is the oldest.
    const oldestKey = store.keys().next().value;
    if (oldestKey === undefined) break; // defensive — size should be > 0 here
    store.delete(oldestKey);
    logger.info("[embeddingCache] evicted entry (LRU)", {
      key: oldestKey,
      size: store.size,
      maxSize: config.maxSize,
    });
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get-or-compute an embedding.
 *
 * Flow:
 *   1. Normalize text + build cache key.
 *   2. If key is in the cache → return cached vector with `fromCache: true`
 *      (and touch the entry to mark it recently-used).
 *   3. Otherwise call `computeFn` (defaults to the placeholder
 *      `defaultComputeFn`, which returns `null`).
 *   4. If computeFn returns a vector → store it, return with
 *      `fromCache: false`. If it returns `null` → return `null` (caller
 *      degrades; semanticMatch stays null).
 *
 * Stats: hits and misses are incremented for monitoring; hit rate is
 * exposed via `embeddingCacheStats()`.
 *
 * @param text  The text to embed. Empty / whitespace-only input returns null.
 * @param opts.model      Override the model identifier (default `placeholder-v0`).
 * @param opts.computeFn  Override the compute function (for testing / provider
 *                        injection without editing this file).
 */
export async function getEmbedding(
  text: string,
  opts?: { model?: string; computeFn?: ComputeFn },
): Promise<EmbeddingResult | null> {
  // Guard against empty / non-string input.
  if (typeof text !== "string" || text.length === 0) {
    return null;
  }

  const model = opts?.model ?? DEFAULT_MODEL;
  const computeFn = opts?.computeFn ?? defaultComputeFn;

  const normalized = normalizeText(text);
  if (normalized.length === 0) {
    return null;
  }

  const key = buildCacheKey(model, normalized);

  // --- Cache hit (hot path) ---
  const cached = store.get(key);
  if (cached !== undefined) {
    hits++;
    logger.debug("[embeddingCache] cache hit", { model, textLen: text.length, size: store.size });
    touch(key); // mark most-recently-used
    return { vector: cached.vector, fromCache: true, model };
  }

  // --- Cache miss (cold path) ---
  misses++;
  logger.debug("[embeddingCache] cache miss", { model, textLen: text.length, size: store.size });

  const vector = await computeFn(normalized, model);
  if (vector === null) {
    // Provider (or placeholder) could not produce an embedding — degrade
    // gracefully. Do not cache the miss (so the next call retries).
    return null;
  }

  // Store + evict if over capacity. Inserting at the end makes this entry
  // the most-recently-used.
  store.set(key, { vector });
  evictIfNeeded();

  return { vector, fromCache: false, model };
}

/**
 * Clear the entire embedding cache and reset stats.
 *
 * Intended for:
 *   - Tests (start from a clean state).
 *   - Configuration changes (e.g. switching model — old vectors become stale).
 *   - Memory pressure recovery (operator-triggered flush).
 */
export function clearEmbeddingCache(): void {
  const size = store.size;
  store.clear();
  hits = 0;
  misses = 0;
  logger.info("[embeddingCache] cache cleared", { clearedEntries: size });
}

/**
 * Cache stats for monitoring dashboards / admin endpoints.
 *
 * - `size`: current number of cached vectors.
 * - `hits` / `misses`: cumulative counters since last `clearEmbeddingCache()`.
 * - `hitRate`: ratio in [0, 1]; 0 when there have been no lookups yet.
 */
export function embeddingCacheStats(): {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
} {
  const total = hits + misses;
  return {
    size: store.size,
    hits,
    misses,
    hitRate: total === 0 ? 0 : hits / total,
  };
}

/**
 * Invalidate a single cache entry by its source text.
 *
 * Uses the same normalization as `getEmbedding` so callers can pass the
 * raw (non-normalized) text. The `model` defaults to the same default model
 * used by `getEmbedding`; pass `opts.model` if you embedded with a
 * non-default model.
 *
 * @returns true if an entry was removed, false if it was not present.
 */
export function invalidateEmbedding(text: string, opts?: { model?: string }): boolean {
  if (typeof text !== "string" || text.length === 0) return false;
  const model = opts?.model ?? DEFAULT_MODEL;
  const normalized = normalizeText(text);
  if (normalized.length === 0) return false;
  const key = buildCacheKey(model, normalized);
  const deleted = store.delete(key);
  if (deleted) {
    logger.debug("[embeddingCache] invalidated entry", { model, textLen: text.length });
  }
  return deleted;
}

// ---------------------------------------------------------------------------
// Configuration (optional — for tests / ops tuning)
// ---------------------------------------------------------------------------

/**
 * Update cache configuration. Currently only `maxSize` is configurable.
 *
 * If the new `maxSize` is smaller than the current cache size, this will
 * eagerly evict the oldest entries down to the new limit.
 */
export function configureEmbeddingCache(opts: { maxSize?: number }): void {
  if (typeof opts.maxSize === "number" && Number.isFinite(opts.maxSize) && opts.maxSize > 0) {
    config.maxSize = Math.floor(opts.maxSize);
    logger.info("[embeddingCache] reconfigured", { maxSize: config.maxSize });
    evictIfNeeded();
  }
}
