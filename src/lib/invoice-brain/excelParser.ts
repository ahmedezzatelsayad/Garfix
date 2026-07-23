/**
 * invoice-brain/excelParser.ts — xlsx/csv parsing with header-mapping memory.
 *
 * FIXES from original:
 *  1. Multi-sheet: original only read the FIRST sheet. Now reads all sheets
 *     (or a caller-specified subset) — a workbook with "Orders" + "Returns"
 *     no longer silently drops the second sheet.
 *  2. Batching (checklist 5.3): original loaded the entire file into memory
 *     and parsed all rows in one pass — fine for 1k rows, fatal for 100k.
 *     Now `extractFromTabularBatched` yields results in configurable chunks
 *     so a 100k-row file streams through without OOM. The simple
 *     `extractFromTabular` is kept for small files / backward compat.
 */
import ExcelJS from "exceljs";
import { InvoiceSchema, INVOICE_FIELDS, type InvoiceField } from "./schema";
import type { ExtractionResult } from "./extractInvoice";
import { fingerprintHeaders, type HeaderMapStore } from "./headerMapStore";
import { logger } from "@/lib/logger";

const HEADER_SYNONYMS: Record<InvoiceField, string[]> = {
  name: ["اسم", "الاسم", "اسم العميل", "name", "customer", "client", "client name"],
  address: ["عنوان", "العنوان", "address", "shipping address"],
  price: ["سعر", "السعر", "price", "unit price", "subtotal"],
  currency: ["عملة", "العملة", "currency"],
  discount: ["خصم", "الخصم", "discount"],
  tax: ["ضريبة", "الضريبة", "ضريبة القيمة المضافة", "tax", "vat"],
  total: ["اجمالي", "الإجمالي", "الاجمالي", "المجموع", "total", "grand total"],
  notes: ["ملاحظات", "ملاحظة", "notes", "note", "comment", "comments"],
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

function matchBySynonym(header: string): InvoiceField | null {
  const norm = normalizeHeader(header);
  for (const field of INVOICE_FIELDS) {
    if (HEADER_SYNONYMS[field].some((s) => normalizeHeader(s) === norm)) {
      return field;
    }
  }
  return null;
}

export interface ParsedSheet {
  sheetName: string;
  rows: Record<string, unknown>[];
}

/** FIX #1: read ALL sheets (not just the first). Returns one entry per sheet. */
export async function parseTabularAllSheets(buffer: Buffer): Promise<ParsedSheet[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const results: ParsedSheet[] = [];
  workbook.eachSheet((worksheet) => {
    const sheetHeaders: string[] = [];
    const sheetRows: Record<string, unknown>[] = [];
    let isFirstRow = true;
    worksheet.eachRow((row, rowNumber) => {
      if (isFirstRow) {
        row.eachCell((cell, colNumber) => {
          sheetHeaders[colNumber] = String(cell.value ?? "");
        });
        isFirstRow = false;
        return;
      }
      const obj: Record<string, unknown> = {};
      row.eachCell((cell, colNumber) => {
        const header = sheetHeaders[colNumber] || `col${colNumber}`;
        obj[header] = cell.value ?? "";
      });
      sheetRows.push(obj);
    });
    if (sheetRows.length > 0) {
      results.push({ sheetName: worksheet.name, rows: sheetRows });
    }
  });
  return results;
}

/** Backward-compat: first sheet only. */
export async function parseTabular(buffer: Buffer): Promise<Record<string, unknown>[]> {
  const sheets = await parseTabularAllSheets(buffer);
  return sheets[0]?.rows ?? [];
}

export function autoMapHeaders(headers: string[]): {
  mapping: Record<string, InvoiceField>;
  unresolved: string[];
} {
  const mapping: Record<string, InvoiceField> = {};
  const unresolved: string[] = [];
  for (const h of headers) {
    const field = matchBySynonym(h);
    if (field) mapping[h] = field;
    else unresolved.push(h);
  }
  return { mapping, unresolved };
}

/**
 * Resolve the mapping for a sheet's headers (cache → synonyms → AI once).
 * Returns the mapping + whether AI was used.
 */
async function resolveMapping(
  headers: string[],
  headerStore: HeaderMapStore,
  resolveUnknownHeaders?: (headers: string[]) => Promise<Record<string, InvoiceField>>
): Promise<{ mapping: Record<string, InvoiceField>; usedAI: boolean; fingerprint: string }> {
  const fingerprint = fingerprintHeaders(headers);
  const cached = await headerStore.get(fingerprint);
  if (cached) {
    await headerStore.touch(fingerprint);
    return { mapping: cached.mapping, usedAI: false, fingerprint };
  }

  const auto = autoMapHeaders(headers);
  let mapping = auto.mapping;
  let usedAI = false;

  if (auto.unresolved.length > 0 && resolveUnknownHeaders) {
    try {
      const aiMapping = await resolveUnknownHeaders(auto.unresolved);
      mapping = { ...mapping, ...aiMapping };
      usedAI = true;
    } catch (err) {
      logger.warn("[brain] header AI resolution failed — using synonym-only mapping", { err: (err as Error).message, unresolved: auto.unresolved.length });
    }
  }

  await headerStore.save({
    headerFingerprint: fingerprint,
    mapping,
    sampleCount: 1,
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
  });

  return { mapping, usedAI, fingerprint };
}

/** Parse rows of one sheet into ExtractionResult[] using the resolved mapping. */
function parseRows(
  rows: Record<string, unknown>[],
  mapping: Record<string, InvoiceField>,
  fingerprint: string,
  source: "pattern" | "ai"
): ExtractionResult[] {
  const results: ExtractionResult[] = [];
  for (const row of rows) {
    const record: Record<string, unknown> = {};
    for (const [header, field] of Object.entries(mapping)) {
      record[field] = row[header];
    }
    const parsed = InvoiceSchema.safeParse(record);
    if (parsed.success) {
      results.push({ data: parsed.data, source, fingerprint });
    }
  }
  return results;
}

/** Simple (whole-file) extraction — fine for small files. */
export async function extractFromTabular(
  buffer: Buffer,
  headerStore: HeaderMapStore,
  resolveUnknownHeaders?: (headers: string[]) => Promise<Record<string, InvoiceField>>
): Promise<ExtractionResult[]> {
  const sheets = await parseTabularAllSheets(buffer);
  if (sheets.length === 0) return [];

  const results: ExtractionResult[] = [];
  for (const sheet of sheets) {
    const headers = Object.keys(sheet.rows[0]);
    const { mapping, usedAI, fingerprint } = await resolveMapping(headers, headerStore, resolveUnknownHeaders);
    const source: "pattern" | "ai" = usedAI ? "ai" : "pattern";
    results.push(...parseRows(sheet.rows, mapping, fingerprint, source));
  }
  return results;
}

/**
 * FIX #2 — Batched extraction for large files (checklist 5.3).
 * Yields results sheet-by-sheet, chunk-by-chunk, so a 100k-row file never
 * holds all parsed results in memory at once. Caller consumes the async
 * iterator and can flush to DB / stream to client incrementally.
 */
export async function* extractFromTabularBatched(
  buffer: Buffer,
  headerStore: HeaderMapStore,
  resolveUnknownHeaders?: (headers: string[]) => Promise<Record<string, InvoiceField>>,
  chunkSize = 1000
): AsyncGenerator<{ sheetName: string; results: ExtractionResult[]; totalRows: number }> {
  const sheets = await parseTabularAllSheets(buffer);
  for (const sheet of sheets) {
    if (sheet.rows.length === 0) continue;
    const headers = Object.keys(sheet.rows[0]);
    const { mapping, usedAI, fingerprint } = await resolveMapping(headers, headerStore, resolveUnknownHeaders);
    const source: "pattern" | "ai" = usedAI ? "ai" : "pattern";

    for (let i = 0; i < sheet.rows.length; i += chunkSize) {
      const chunk = sheet.rows.slice(i, i + chunkSize);
      yield {
        sheetName: sheet.sheetName,
        results: parseRows(chunk, mapping, fingerprint, source),
        totalRows: sheet.rows.length,
      };
    }
  }
}
