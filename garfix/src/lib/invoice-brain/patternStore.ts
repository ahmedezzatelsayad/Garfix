/**
 * invoice-brain/patternStore.ts — template memory (interface + 2 impls).
 *
 * Two implementations:
 *   - JsonFilePatternStore: dev/standalone (JSON file, in-process cache)
 *   - PrismaPatternStore: GarfiX production (InvoiceTemplate table)
 *
 * Both implement the same interface, so extractInvoice.ts doesn't change
 * when you swap stores (checklist 2.2).
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { InvoiceField } from "./schema";

export interface FieldTemplate {
  field: InvoiceField;
  label: string; // the label text next to the value (documentation only)
  regex: string; // the extraction pattern
}

export interface InvoiceTemplate {
  fingerprint: string;
  fields: FieldTemplate[];
  sampleCount: number;
  createdAt: string;
  lastUsedAt: string;
}

export interface PatternStore {
  get(fingerprint: string): Promise<InvoiceTemplate | null>;
  save(template: InvoiceTemplate): Promise<void>;
  touch(fingerprint: string): Promise<void>;
  stats(): Promise<{ totalTemplates: number; totalHits: number }>;
}

// ── JSON file impl (dev / standalone) ────────────────────────────────────────

export class JsonFilePatternStore implements PatternStore {
  private cache: Record<string, InvoiceTemplate> | null = null;
  constructor(private filePath: string) {}

  private async load(): Promise<Record<string, InvoiceTemplate>> {
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

  async get(fingerprint: string): Promise<InvoiceTemplate | null> {
    return (await this.load())[fingerprint] ?? null;
  }

  async save(template: InvoiceTemplate): Promise<void> {
    const db = await this.load();
    db[template.fingerprint] = template;
    await this.persist();
  }

  async touch(fingerprint: string): Promise<void> {
    const db = await this.load();
    const t = db[fingerprint];
    if (!t) return;
    t.sampleCount += 1;
    t.lastUsedAt = new Date().toISOString();
    await this.persist();
  }

  async stats(): Promise<{ totalTemplates: number; totalHits: number }> {
    const db = await this.load();
    const templates = Object.values(db);
    return {
      totalTemplates: templates.length,
      totalHits: templates.reduce((sum, t) => sum + t.sampleCount, 0),
    };
  }
}

// ── Prisma impl (GarfiX production) ──────────────────────────────────────────
// Backed by the InvoiceTemplate table (see prisma/schema.prisma, P1-invoice-brain).
// fields[] is stored as a JSON string (SQLite-compatible; PostgreSQL Json type
// works too — see P1-A schema comment).

export class PrismaPatternStore implements PatternStore {
  async get(fingerprint: string): Promise<InvoiceTemplate | null> {
    const row = await db.invoiceBrainTemplate.findUnique({ where: { fingerprint } });
    if (!row) return null;
    return {
      fingerprint: row.fingerprint,
      fields: typeof row.fields === "string" ? JSON.parse(row.fields) : row.fields,
      sampleCount: row.sampleCount,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastUsedAt.toISOString(),
    };
  }

  async save(template: InvoiceTemplate): Promise<void> {
    const now = new Date();
    await db.invoiceBrainTemplate.upsert({
      where: { fingerprint: template.fingerprint },
      create: {
        fingerprint: template.fingerprint,
        fields: JSON.stringify(template.fields),
        sampleCount: template.sampleCount,
        createdAt: now,
        lastUsedAt: now,
      },
      update: {
        fields: JSON.stringify(template.fields),
        sampleCount: template.sampleCount,
        lastUsedAt: now,
      },
    });
  }

  async touch(fingerprint: string): Promise<void> {
    // Atomic increment to avoid lost updates under concurrency
    try {
      await db.invoiceBrainTemplate.update({
        where: { fingerprint },
        data: {
          sampleCount: { increment: 1 },
          lastUsedAt: new Date(),
        },
      });
    } catch (err) {
      // fingerprint not found → nothing to touch (can happen if template was pruned)
      logger.debug("[brain] touch missed", { fingerprint, err: (err as Error).message });
    }
  }

  async stats(): Promise<{ totalTemplates: number; totalHits: number }> {
    const agg = await db.invoiceBrainTemplate.aggregate({
      _count: { fingerprint: true },
      _sum: { sampleCount: true },
    });
    return {
      totalTemplates: agg._count.fingerprint,
      totalHits: agg._sum.sampleCount ?? 0,
    };
  }
}
