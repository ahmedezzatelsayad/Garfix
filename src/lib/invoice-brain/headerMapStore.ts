/**
 * invoice-brain/headerMapStore.ts — header-mapping memory for tabular sources.
 *
 * Same dual-impl pattern as patternStore.ts: JSON file (dev) + Prisma (GarfiX).
 * Backed by the HeaderMapping table (see prisma/schema.prisma).
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { InvoiceField } from "./schema";

export interface HeaderMapping {
  headerFingerprint: string;
  mapping: Record<string, InvoiceField>;
  sampleCount: number;
  createdAt: string;
  lastUsedAt: string;
}

export interface HeaderMapStore {
  get(fingerprint: string): Promise<HeaderMapping | null>;
  save(mapping: HeaderMapping): Promise<void>;
  touch(fingerprint: string): Promise<void>;
}

/** Fingerprint a set of column headers, order-independent. */
export function fingerprintHeaders(headers: string[]): string {
  const key = headers.map((h) => h.trim().toLowerCase()).sort().join("|");
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

// ── JSON file impl ───────────────────────────────────────────────────────────

export class JsonFileHeaderMapStore implements HeaderMapStore {
  private cache: Record<string, HeaderMapping> | null = null;
  constructor(private filePath: string) {}

  private async load(): Promise<Record<string, HeaderMapping>> {
    if (this.cache) return this.cache;
    try {
      this.cache = JSON.parse(await readFile(this.filePath, "utf-8"));
    } catch {
      this.cache = {};
    }
    return this.cache!;
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.cache, null, 2), "utf-8");
  }

  async get(fingerprint: string): Promise<HeaderMapping | null> {
    return (await this.load())[fingerprint] ?? null;
  }

  async save(mapping: HeaderMapping): Promise<void> {
    const db = await this.load();
    db[mapping.headerFingerprint] = mapping;
    await this.persist();
  }

  async touch(fingerprint: string): Promise<void> {
    const db = await this.load();
    const m = db[fingerprint];
    if (!m) return;
    m.sampleCount += 1;
    m.lastUsedAt = new Date().toISOString();
    await this.persist();
  }
}

// ── Prisma impl ──────────────────────────────────────────────────────────────

export class PrismaHeaderMapStore implements HeaderMapStore {
  async get(fingerprint: string): Promise<HeaderMapping | null> {
    const row = await db.invoiceBrainHeaderMap.findUnique({ where: { headerFingerprint: fingerprint } });
    if (!row) return null;
    return {
      headerFingerprint: row.headerFingerprint,
      mapping: typeof row.mapping === "string" ? JSON.parse(row.mapping) : row.mapping,
      sampleCount: row.sampleCount,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastUsedAt.toISOString(),
    };
  }

  async save(mapping: HeaderMapping): Promise<void> {
    const now = new Date();
    await db.invoiceBrainHeaderMap.upsert({
      where: { headerFingerprint: mapping.headerFingerprint },
      create: {
        headerFingerprint: mapping.headerFingerprint,
        mapping: JSON.stringify(mapping.mapping),
        sampleCount: mapping.sampleCount,
        createdAt: now,
        lastUsedAt: now,
      },
      update: {
        mapping: JSON.stringify(mapping.mapping),
        lastUsedAt: now,
      },
    });
  }

  async touch(fingerprint: string): Promise<void> {
    try {
      await db.invoiceBrainHeaderMap.update({
        where: { headerFingerprint: fingerprint },
        data: {
          sampleCount: { increment: 1 },
          lastUsedAt: new Date(),
        },
      });
    } catch (err) {
      logger.debug("[brain] header touch missed", { fingerprint, err: (err as Error).message });
    }
  }
}
