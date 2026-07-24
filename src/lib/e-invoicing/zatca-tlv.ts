/**
 * zatca-tlv.ts — ZATCA TLV (Tag-Length-Value) encoding for e-invoicing QR codes.
 *
 * P0-7: Implements ZATCA Phase 2 QR code generation per the official specification.
 *
 * ZATCA requires that all Simplified (B2C) invoices include a Base64-encoded
 * QR code in the printed/PDF invoice. The QR content is encoded using TLV format:
 *
 * TLV format: [Tag (1 byte)] [Length (1 byte)] [Value (N bytes)]
 * Where:
 *   Tag 1 = Seller Name (Arabic + English, UTF-8)
 *   Tag 2 = VAT Registration Number (TRN, UTF-8)
 *   Tag 3 = Invoice Date (ISO 8601, UTF-8)
 *   Tag 4 = Invoice Total (with VAT, UTF-8)
 *   Tag 5 = VAT Amount (UTF-8)
 *
 * For Standard (B2B) invoices, additional tags are included:
 *   Tag 6 = Invoice Hash (SHA-256, hex)
 *   Tag 7 = ECDSA Signature (Base64)
 *   Tag 8 = X.509 Certificate (Base64)
 *   Tag 9 = Certificate Signature (Base64)
 *
 * The final QR content = Base64(TLV_bytes)
 *
 * Reference: ZATCA E-Invoicing Technical Specification v2.0
 * https://zatca.gov.sa/en/E-Invoicing/Regulations/Pages/default.aspx
 */

// ── TLV Encoding ──────────────────────────────────────────────────────────

/**
 * Encode a single TLV field: [Tag][Length][Value]
 * Tag: 1 byte (uint8)
 * Length: 1 byte (uint8, max 255 bytes per value — ZATCA spec limit)
 * Value: UTF-8 encoded bytes
 */
function encodeTLVField(tag: number, value: string): Buffer {
  const valueBytes = Buffer.from(value, "utf-8");
  if (valueBytes.length > 255) {
    throw new Error(`TLV value for tag ${tag} exceeds 255 bytes (got ${valueBytes.length}): ZATCA spec requires max 255`);
  }
  // [Tag (1 byte)] [Length (1 byte)] [Value (N bytes)]
  const result = Buffer.alloc(2 + valueBytes.length);
  result.writeUInt8(tag, 0);
  result.writeUInt8(valueBytes.length, 1);
  valueBytes.copy(result, 2);
  return result;
}

/**
 * Encode multiple TLV fields into a single buffer and return Base64.
 *
 * P0-7: This is the core function that produces the QR code content
 * for ZATCA-compliant e-invoices.
 */
export function encodeTLVToBase64(fields: { tag: number; value: string }[]): string {
  const buffers = fields.map(({ tag, value }) => encodeTLVField(tag, value));
  const combined = Buffer.concat(buffers);
  return combined.toString("base64");
}

// ── QR Code Content Generation ────────────────────────────────────────────

/**
 * Input data for Simplified Invoice QR (B2C — tags 1-5 only).
 * These are the mandatory fields per ZATCA Phase 2 Simplified Invoice spec.
 */
export interface SimplifiedInvoiceQRData {
  sellerName: string;        // Seller name (Arabic preferred, English fallback)
  vatRegistrationNumber: string;  // Seller TRN (15-digit Saudi VAT number)
  invoiceDate: string;       // ISO 8601 date: "2026-01-15T08:30:00Z"
  invoiceTotalWithVat: string;  // Total including VAT (SAR, 2 decimal places)
  vatAmount: string;         // VAT amount (SAR, 2 decimal places)
}

/**
 * Extended input for Standard Invoice QR (B2B — tags 1-9).
 * Standard invoices require cryptographic proof embedded in the QR.
 */
export interface StandardInvoiceQRData extends SimplifiedInvoiceQRData {
  invoiceHash: string;       // SHA-256 hash of the invoice XML (hex string)
  ecdsaSignature: string;    // ECDSA P-256 signature (Base64)
  certificate: string;       // X.509 certificate (Base64 DER)
  certificateSignature: string; // Certificate digital signature (Base64)
}

/**
 * P0-7: Generate ZATCA QR code Base64 content for Simplified (B2C) invoices.
 *
 * This produces the TLV-encoded Base64 string that should be embedded
 * in the printed/PDF invoice as a QR code. The QR code scanner reads
 * the Base64 content, decodes it, and extracts the 5 TLV fields.
 *
 * Tags used:
 *   1 = Seller Name
 *   2 = VAT Registration Number (TRN)
 *   3 = Invoice Date (ISO 8601)
 *   4 = Invoice Total with VAT
 *   5 = VAT Amount
 */
export function generateSimplifiedInvoiceQR(data: SimplifiedInvoiceQRData): string {
  // Validate mandatory fields
  if (!data.sellerName) throw new Error("P0-7: sellerName is required for ZATCA QR");
  if (!data.vatRegistrationNumber) throw new Error("P0-7: vatRegistrationNumber is required for ZATCA QR");
  if (!data.invoiceDate) throw new Error("P0-7: invoiceDate is required for ZATCA QR");
  if (!data.invoiceTotalWithVat) throw new Error("P0-7: invoiceTotalWithVat is required for ZATCA QR");
  if (!data.vatAmount) throw new Error("P0-7: vatAmount is required for ZATCA QR");

  // Validate TRN format: 15 digits starting with "3" for Saudi Arabia
  const trnRegex = /^3\d{14}$/;
  if (!trnRegex.test(data.vatRegistrationNumber)) {
    throw new Error(`P0-7: Invalid Saudi TRN format: "${data.vatRegistrationNumber}" — must be 15 digits starting with "3"`);
  }

  return encodeTLVToBase64([
    { tag: 1, value: data.sellerName },
    { tag: 2, value: data.vatRegistrationNumber },
    { tag: 3, value: data.invoiceDate },
    { tag: 4, value: data.invoiceTotalWithVat },
    { tag: 5, value: data.vatAmount },
  ]);
}

/**
 * P0-7: Generate ZATCA QR code Base64 content for Standard (B2B) invoices.
 *
 * Standard invoices include all 9 TLV tags — the 5 base tags plus
 * cryptographic proof (hash, signature, certificate). This allows
 * the buyer to verify the invoice authenticity by scanning the QR code.
 *
 * Tags used:
 *   1-5 = Same as Simplified
 *   6 = Invoice Hash (SHA-256 hex)
 *   7 = ECDSA Digital Signature (Base64)
 *   8 = X.509 Certificate (Base64 DER)
 *   9 = Certificate Signature (Base64)
 */
export function generateStandardInvoiceQR(data: StandardInvoiceQRData): string {
  // First validate the base fields
  const baseQR = generateSimplifiedInvoiceQR(data);

  // Validate cryptographic fields
  if (!data.invoiceHash) throw new Error("P0-7: invoiceHash is required for Standard invoice QR");
  if (!data.ecdsaSignature) throw new Error("P0-7: ecdsaSignature is required for Standard invoice QR");
  if (!data.certificate) throw new Error("P0-7: certificate is required for Standard invoice QR");
  if (!data.certificateSignature) throw new Error("P0-7: certificateSignature is required for Standard invoice QR");

  return encodeTLVToBase64([
    { tag: 1, value: data.sellerName },
    { tag: 2, value: data.vatRegistrationNumber },
    { tag: 3, value: data.invoiceDate },
    { tag: 4, value: data.invoiceTotalWithVat },
    { tag: 5, value: data.vatAmount },
    { tag: 6, value: data.invoiceHash },
    { tag: 7, value: data.ecdsaSignature },
    { tag: 8, value: data.certificate },
    { tag: 9, value: data.certificateSignature },
  ]);
}

// ── TLV Decoding (for verification/testing) ───────────────────────────────

/**
 * Decode a Base64 TLV string back into individual fields.
 * Used for testing and verification of QR content.
 */
export function decodeTLVFromBase64(base64Str: string): { tag: number; length: number; value: string }[] {
  const combined = Buffer.from(base64Str, "base64");
  const fields: { tag: number; length: number; value: string }[] = [];
  let offset = 0;

  while (offset < combined.length) {
    const tag = combined.readUInt8(offset);
    const length = combined.readUInt8(offset + 1);
    const valueBytes = combined.subarray(offset + 2, offset + 2 + length);
    fields.push({ tag, length, value: valueBytes.toString("utf-8") });
    offset += 2 + length;
  }

  return fields;
}
