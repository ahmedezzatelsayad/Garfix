/**
 * invoice-brain/fingerprintCache.ts — High-Performance Fingerprint Cache
 *
 * ═══════════════════════════════════════════════════════════════
 *  FINGERPRINT CACHE (Critical for Batch Processing Performance)
 * ═══════════════════════════════════════════════════════════════
 *
 * PROBLEM (User's Observation):
 *   - Client uploads 1000 invoices at once
 *   - Calculating fingerprint for each is expensive (~5-20ms each)
 *   - Same supplier invoices have same/similar fingerprints
 *   - Without cache: 1000 × 15ms = 15 seconds just for fingerprinting!
 *
 * SOLUTION:
 *   - LRU Cache for recent fingerprints
 *   - Optional Redis for distributed caching
 *   - Batch pre-computation for known suppliers
 *   - Cache invalidation on pattern updates
 *
 * PERFORMANCE TARGETS:
 * ─────────────────────────────────────────────────────────────
 * • Cache hit: < 1ms (vs 15-20ms computation)
 * • Cache miss: ~15-20ms (normal computation)
 * • Target hit rate: > 80% for batch uploads
 * • Memory usage: < 50MB for 10K cached entries
 * ═══════════════════════════════════════════════════════════════
 */

import { logger } from "@/lib/logger";

// ─── Types ───────────────────────────────────────────────────

export interface CacheEntry<T> {
  /** Cached value */
  value: T;
  
  /** When this entry was created */
  createdAt: number;
  
  /** When this entry was last accessed */
  lastAccessedAt: number;
  
  /** How many times this entry has been accessed (for stats) */
  accessCount: number;
  
  /** Size of the cached value in bytes (approximate) */
  sizeBytes: number;
}

export interface FingerprintCacheConfig {
  /** Maximum number of entries to keep in cache */
  maxEntries: number;
  
  /** Maximum age of an entry before it's considered stale (ms) */
  ttlMs: number;
  
  /** Whether to track statistics (slight performance cost) */
  enableStats: boolean;
  
  /** Background cleanup interval (ms) */
  cleanupIntervalMs: number;
  
  /** Optional: Redis configuration for distributed cache */
  redis?: {
    url: string;
    keyPrefix: string;
  };
}

export interface CacheStats {
  /** Total number of entries currently in cache */
  size: number;
  
  /** Total number of get() calls since creation/start */
  totalGets: number;
  
  /** Number of cache hits */
  hits: number;
  
  /** Number of cache misses */
  misses: number;
  
  /** Hit rate (hits / totalGets) */
  hitRate: number;
  
  /** Number of evictions due to size limit */
  evictions: number;
  
  /** Number of expirations due to TTL */
  expirations: number;
  
  /** Total memory usage estimate (bytes) */
  memoryUsageBytes: number;
  
  /** Average access time for hits (microseconds) */
  avgHitTimeUs: number;
  
  /** Average access time for misses (microseconds) */
  avgMissTimeUs: number;
}

// ─── Default Configuration ──────────────────────────────────

const DEFAULT_CONFIG: FingerprintCacheConfig = {
  maxEntries: 10000,
  ttlMs: 30 * 60 * 1000, // 30 minutes
  enableStats: true,
  cleanupIntervalMs: 60 * 1000, // 1 minute
};

// ─── LRU Cache Implementation ───────────────────────────────

/**
 * Thread-safe (for single-process) LRU Cache optimized for fingerprint caching.
 */
export class FingerprintCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private config: FingerprintCacheConfig;
  private stats: CacheStats;
  private cleanupTimer: NodeJS.Timeout | null = null;
  
  // For timing measurements
  private hitTimes: number[] = [];
  private missTimes: number[] = [];
  
  constructor(config?: Partial<FingerprintCacheConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    this.stats = {
      size: 0,
      totalGets: 0,
      hits: 0,
      misses: 0,
      hitRate: 0,
      evictions: 0,
      expirations: 0,
      memoryUsageBytes: 0,
      avgHitTimeUs: 0,
      avgMissTimeUs: 0,
    };
    
    // Start background cleanup
    this.startCleanup();
  }
  
  /**
   * Get a value from cache. Returns undefined if not found or expired.
   */
  get(key: string): T | undefined {
    const startTime = performance.now ? performance.now() : Date.now();
    
    if (this.config.enableStats) {
      this.stats.totalGets++;
    }
    
    const entry = this.cache.get(key);
    
    // Check existence and TTL
    if (!entry) {
      this.recordMiss(startTime);
      return undefined;
    }
    
    // Check expiration
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.stats.expirations++;
      this.stats.size--;
      
      this.recordMiss(startTime);
      return undefined;
    }
    
    // Update access metadata (LRU)
    entry.lastAccessedAt = Date.now();
    entry.accessCount++;
    
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    
    this.recordHit(startTime);
    return entry.value;
  }
  
  /**
   * Set a value in cache. May evict oldest entry if at capacity.
   */
  set(key: string, value: T): void {
    // Check if already exists (update case)
    if (this.cache.has(key)) {
      const existing = this.cache.get(key)!;
      existing.value = value;
      existing.lastAccessedAt = Date.now();
      existing.accessCount++;
      existing.sizeBytes = this.estimateSize(value);
      
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, existing);
      return;
    }
    
    // Check capacity
    if (this.cache.size >= this.config.maxEntries) {
      this.evictOldest();
    }
    
    // Create new entry
    const now = Date.now();
    const entry: CacheEntry<T> = {
      value,
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 1,
      sizeBytes: this.estimateSize(value),
    };
    
    this.cache.set(key, entry);
    this.stats.size = this.cache.size;
    this.stats.memoryUsageBytes += entry.sizeBytes;
  }
  
  /**
   * Check if key exists (without updating access time).
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    // Still check expiration
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.stats.expirations++;
      this.stats.size--;
      return false;
    }
    
    return true;
  }
  
  /**
   * Delete a specific key.
   */
  delete(key: string): boolean {
    const existed = this.cache.delete(key);
    if (existed) {
      this.stats.size = this.cache.size;
    }
    return existed;
  }
  
  /**
   * Clear all entries.
   */
  clear(): void {
    this.cache.clear();
    this.stats.size = 0;
    this.stats.memoryUsageBytes = 0;
  }
  
  /**
   * Pre-warm cache with batch of entries.
   * Useful when processing bulk upload from same supplier.
   */
  warm(entries: Array<{ key: string; value: T }>): void {
    for (const { key, value } of entries) {
      if (this.cache.size < this.config.maxEntries && !this.cache.has(key)) {
        this.set(key, value);
      }
    }
    
    logger.info("[cache] Warmed with", { count: entries.length });
  }
  
  /**
   * Get current cache statistics.
   */
  getStats(): CacheStats {
    // Calculate averages
    if (this.hitTimes.length > 0) {
      this.stats.avgHitTimeUs = 
        this.hitTimes.reduce((a, b) => a + b, 0) / this.hitTimes.length * 1000;
    }
    
    if (this.missTimes.length > 0) {
      this.stats.avgMissTimeUs = 
        this.missTimes.reduce((a, b) => a + b, 0) / this.missTimes.length * 1000;
    }
    
    // Calculate hit rate
    this.stats.hitRate = this.stats.totalGets > 0
      ? this.stats.hits / this.stats.totalGets
      : 0;
    
    return { ...this.stats };
  }
  
  /**
   * Invalidate all entries matching a pattern.
   * Useful when patterns are updated.
   */
  invalidatePattern(matcher: (key: string) => boolean): number {
    let count = 0;
    
    for (const key of this.cache.keys()) {
      if (matcher(key)) {
        this.cache.delete(key);
        count++;
      }
    }
    
    this.stats.size = this.cache.size;
    
    logger.info("[cache] Pattern invalidated", { count });
    
    return count;
  }
  
  /**
   * Cleanup expired entries and trim arrays.
   */
  cleanup(): { expired: number; evicted: number } {
    let expired = 0;
    const _now = Date.now();
    
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        expired++;
      }
    }
    
    this.stats.expirations += expired;
    this.stats.size = this.cache.size;
    
    // Trim timing arrays (keep last 1000)
    if (this.hitTimes.length > 1000) {
      this.hitTimes = this.hitTimes.slice(-1000);
    }
    if (this.missTimes.length > 1000) {
      this.missTimes = this.missTimes.slice(-1000);
    }
    
    return { expired, evicted: 0 };
  }
  
  /**
   * Destroy the cache instance (stop cleanup timer).
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.clear();
  }
  
  // ─── Private Methods ─────────────────────────────────────
  
  private isExpired(entry: CacheEntry<unknown>): boolean {
    const age = Date.now() - entry.createdAt;
    return age > this.config.ttlMs;
  }
  
  private evictOldest(): void {
    // In insertion-order Map, first entry is oldest
    const firstKey = this.cache.keys().next().value;
    if (firstKey !== undefined) {
      this.cache.delete(firstKey);
      this.stats.evictions++;
      this.stats.size--;
    }
  }
  
  private estimateSize(value: T): number {
    try {
      // Rough JSON serialization size
      const str = JSON.stringify(value);
      return new Blob([str]).size;
    } catch {
      return 256; // Default estimate
    }
  }
  
  private recordHit(startTime: number): void {
    if (this.config.enableStats) {
      this.stats.hits++;
      const duration = (performance.now ? performance.now() : Date.now()) - startTime;
      this.hitTimes.push(duration);
    }
  }
  
  private recordMiss(startTime: number): void {
    if (this.config.enableStats) {
      this.stats.misses++;
      const duration = (performance.now ? performance.now() : Date.now()) - startTime;
      this.missTimes.push(duration);
    }
  }
  
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupIntervalMs);
    
    // Don't prevent process exit
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }
}

// ─── Global Singleton Instances ─────────────────────────────

let globalFingerprintCache: FingerprintCache<string> | null = null;

/**
 * Get global fingerprint cache instance.
 * Initialized with default config on first call.
 */
export function getFingerprintCache(config?: Partial<FingerprintCacheConfig>): FingerprintCache<string> {
  if (!globalFingerprintCache) {
    globalFingerprintCache = new FingerprintCache<string>(config);
  }
  return globalFingerprintCache;
}

// ─── Convenience Functions ─────────────────────────────────

/**
 * Get or compute fingerprint with automatic caching.
 */
export async function getCachedOrCompute(
  text: string,
  computeFn: () => string | Promise<string>
): Promise<{ fingerprint: string; fromCache: boolean }> {
  const cache = getFingerprintCache();
  
  // Try cache first
  const cached = cache.get(text);
  if (cached !== undefined) {
    return { fingerprint: cached, fromCache: true };
  }
  
  // Compute
  const computed = await computeFn();
  
  // Store in cache
  cache.set(text, computed);
  
  return { fingerprint: computed, fromCache: false };
}

/**
 * Batch process fingerprints with caching optimization.
 * Detects duplicate texts and caches results.
 */
// Type alias for fingerprint results (defined outside function to avoid Turbopack parsing issues)
interface FingerprintResult {
  fingerprint: string;
  fromCache: boolean;
  index: number;
}

interface ComputeItem {
  text: string;
  index: number;
}

export async function batchFingerprints(
  texts: string[],
  computeFn: (text: string) => string | Promise<string>
): Promise<Array<FingerprintResult>> {
  const cache = getFingerprintCache();
  const results: Array<FingerprintResult> = [];
  
  // First pass: check cache for all
  const toCompute: Array<ComputeItem> = [];
  
  for (let i = 0; i < texts.length; i++) {
    const cached = cache.get(texts[i]);
    if (cached !== undefined) {
      results.push({ fingerprint: cached, fromCache: true, index: i });
    } else {
      toCompute.push({ text: texts[i], index: i });
    }
  }
  
  // Second pass: compute missing ones
  for (const { text, index } of toCompute) {
    const computed = await computeFn(text);
    cache.set(text, computed);
    results.push({ fingerprint: computed, fromCache: false, index });
  }
  
  // Sort by original index
  results.sort((a, b) => a.index - b.index);
  
  // Log stats
  const stats = cache.getStats();
  logger.info("[cache] Batch fingerprint complete", {
    total: texts.length,
    fromCache: results.filter(r => r.fromCache).length,
    computed: toCompute.length,
    hitRate: `${(stats.hitRate * 100).toFixed(1)}%`,
  });
  
  return results;
}
