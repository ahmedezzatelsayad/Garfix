/**
 * invoice-brain/index.ts — public API of the invoice-brain module.
 */
export { InvoiceSchema, INVOICE_FIELDS } from "./schema";
export type { Invoice, InvoiceField } from "./schema";
export { fingerprintText, normalizeLabel } from "./fingerprint";
export {
  type PatternStore,
  type InvoiceTemplate,
  type FieldTemplate,
  JsonFilePatternStore,
  PrismaPatternStore,
} from "./patternStore";
export {
  type HeaderMapStore,
  type HeaderMapping,
  fingerprintHeaders,
  JsonFileHeaderMapStore,
  PrismaHeaderMapStore,
} from "./headerMapStore";
export { extractWithTemplate } from "./patternParser";
export { extractWithAI, resolveUnknownHeadersWithAI, deriveTemplateFields } from "./aiFallback";
export { verifyExtractedFields } from "./verifyExtraction";
export type { VerificationResult } from "./verifyExtraction";
export { extractInvoice } from "./extractInvoice";
export type { ExtractionResult, ExtractionSource } from "./extractInvoice";
export {
  parseTabular,
  parseTabularAllSheets,
  autoMapHeaders,
  extractFromTabular,
  extractFromTabularBatched,
} from "./excelParser";
export type { ParsedSheet } from "./excelParser";
export { ocrImageToText } from "./ocrAdapter";
export { extractFromSource, detectSourceKind } from "./extractFromSource";
export type { RawSource, SourceKind, Stores } from "./extractFromSource";
export {
  OrderSchema,
  mapBrainToOrder,
  normalizeCurrency,
  buildCompanyContext,
} from "./garfixAdapter";
export type { ParsedOrder, CompanyContext } from "./garfixAdapter";
