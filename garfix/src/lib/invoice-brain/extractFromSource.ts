/**
 * invoice-brain/extractFromSource.ts — unified entry: text/image/excel/csv.
 *
 * Routes any source kind to the right pipeline:
 *   - text  → fingerprint + pattern + AI fallback (+ learning)
 *   - image → OCR (free, local) → same as text
 *   - excel/csv → header mapping (cached, AI once per column-set) → direct parse
 */
import { extractInvoice, type ExtractionResult } from "./extractInvoice";
import { extractFromTabular } from "./excelParser";
import { ocrImageToText } from "./ocrAdapter";
import { resolveUnknownHeadersWithAI } from "./aiFallback";
import type { PatternStore } from "./patternStore";
import type { HeaderMapStore } from "./headerMapStore";

export type SourceKind = "text" | "image" | "excel" | "csv";

export interface RawSource {
  kind: SourceKind;
  text?: string;
  buffer?: Buffer;
}

export interface Stores {
  patternStore: PatternStore;
  headerStore: HeaderMapStore;
}

export function detectSourceKind(filename: string): SourceKind {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "csv") return "csv";
  if (ext === "xlsx" || ext === "xls") return "excel";
  if (["png", "jpg", "jpeg", "webp", "heic"].includes(ext ?? "")) return "image";
  return "text";
}

export async function extractFromSource(
  source: RawSource,
  stores: Stores
): Promise<ExtractionResult[]> {
  switch (source.kind) {
    case "text": {
      if (!source.text) throw new Error("النص مفقود");
      return [await extractInvoice(source.text, stores.patternStore)];
    }
    case "image": {
      if (!source.buffer) throw new Error("بيانات الصورة مفقودة");
      const text = await ocrImageToText(source.buffer);
      return [await extractInvoice(text, stores.patternStore)];
    }
    case "excel":
    case "csv": {
      if (!source.buffer) throw new Error("بيانات الملف مفقودة");
      return extractFromTabular(source.buffer, stores.headerStore, resolveUnknownHeadersWithAI);
    }
    default: {
      const _exhaustive: never = source.kind;
      throw new Error(`نوع مصدر غير مدعوم: ${_exhaustive}`);
    }
  }
}
