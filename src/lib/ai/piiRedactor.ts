/**
 * PII Redactor — strips personally identifiable information from AI prompts.
 *
 * Phase 8 P1 fix: the chat system prompt included user.uid (cuid — not PII),
 * user.email (PII —GDPR/KSA PDPL sensitive), user.role, companySlug, and
 * recentInvoices with real client names and invoice amounts. These were sent
 * to third-party LLM providers (OpenAI, Anthropic, DeepSeek, Google) without
 * consent or DPA. This module redacts PII before the prompt is constructed.
 *
 * What gets redacted:
 *   - Email addresses → [EMAIL_REDACTED]
 *   - Phone numbers (+9665xxxxxxxx, +20xxxxxxxxxxx, etc.) → [PHONE_REDACTED]
 *   - Saudi National IDs (10 digits) → [ID_REDACTED]
 *   - Egyptian National IDs (14 digits) → [ID_REDACTED]
 *   - Credit card numbers (16 digits) → [CARD_REDACTED]
 *   - VAT numbers (15 digits starting with 3) → [VAT_REDACTED]
 *
 * What is NOT redacted (needed for the LLM to function):
 *   - Company slug (not PII — it's a tenant identifier)
 *   - User role (not PII — it's a permission level)
 *   - Invoice numbers (business data, not personal data)
 *   - Amounts (business data)
 *
 * Usage:
 *   import { redactPii } from "@/lib/ai/piiRedactor";
 *   const safePrompt = redactPii(promptText);
 *   // or for structured user context:
 *   const safeContext = redactUserContext(user);
 */

// Regex patterns for PII detection
const PII_PATTERNS: Array<{ pattern: RegExp; replacement: string; name: string }> = [
  // Email addresses
  {
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    replacement: "[EMAIL_REDACTED]",
    name: "email",
  },
  // Phone numbers — international format (+countrycode + digits)
  {
    pattern: /\+\d{1,4}[\s-]?\d{4,}[\s-]?\d{4,}/g,
    replacement: "[PHONE_REDACTED]",
    name: "phone",
  },
  // Saudi National ID (10 digits, often starting with 1)
  {
    pattern: /\b1\d{9}\b/g,
    replacement: "[ID_REDACTED]",
    name: "saudi_id",
  },
  // Egyptian National ID (14 digits)
  {
    pattern: /\b2\d{13}\b/g,
    replacement: "[ID_REDACTED]",
    name: "egyptian_id",
  },
  // Credit card numbers (16 digits)
  {
    pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    replacement: "[CARD_REDACTED]",
    name: "credit_card",
  },
  // VAT numbers (15 digits starting with 3 — SA VAT format)
  {
    pattern: /\b3\d{14}\b/g,
    replacement: "[VAT_REDACTED]",
    name: "vat_number",
  },
];

/**
 * Redact PII from a text string.
 * Returns the text with all PII patterns replaced by [TYPE_REDACTED] markers.
 */
export function redactPii(text: string): string {
  if (!text || typeof text !== "string") return text;
  let result = text;
  for (const { pattern, replacement } of PII_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Redact PII from user context before injecting into AI prompts.
 * Returns a new object with email/phone redacted; keeps uid, role, companies.
 */
export function redactUserContext(user: {
  uid: string;
  email: string;
  role: string;
  companies: string[];
}): { uid: string; email: string; role: string; companies: string[] } {
  return {
    uid: user.uid, // cuid — not PII, needed for audit trail
    email: redactPii(user.email), // redact email
    role: user.role, // not PII
    companies: user.companies, // tenant slugs — not PII
  };
}

/**
 * Redact PII from a structured prompt (array of messages).
 * Only redacts the `content` field; preserves role.
 */
export function redactPiiFromMessages(
  messages: Array<{ role: string; content: string }>,
): Array<{ role: string; content: string }> {
  return messages.map((m) => ({
    role: m.role,
    content: redactPii(m.content),
  }));
}

/**
 * Check if a string contains PII (for audit/logging purposes).
 * Returns the count of PII patterns found.
 */
export function countPii(text: string): number {
  if (!text) return 0;
  let count = 0;
  for (const { pattern } of PII_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}
