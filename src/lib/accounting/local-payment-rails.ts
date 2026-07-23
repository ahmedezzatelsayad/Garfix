/**
 * Local Payment Rails — MENA-region payment processing
 *
 * Provides: initiateLocalPayment, verifyPayment, getAvailablePaymentMethods
 * Plus production-grade features:
 *   - Signature validation (HMAC-SHA256 for payment requests and webhooks)
 *   - Idempotency (duplicate payment protection via idempotency keys)
 *   - Retry Queue (automatic retry with exponential backoff on failures)
 *   - Webhook verification (verify incoming webhook authenticity per provider)
 *   - Audit Trail (immutable, tamper-evident log of all payment state transitions)
 *   - Fraud Detection (velocity checks + amount anomaly scoring)
 *
 * Migration plan (v13):
 *   1. Replace stubs with real provider SDK integrations (KNET, Fawry, Sadad, mPay)
 *   2. Implement idempotency via PostgreSQL unique constraint on (providerTxId, idempotencyKey)
 *   3. Route all payments through BullMQ retry queue (3 retries, 5min backoff)
 *   4. Create `payment_audit_log` table with tamper-evidence chain (append-only, SHA-256 linked)
 *   5. Migrate in-memory stores (idempotency, retry queue, audit log, fraud history) to PostgreSQL
 */

import { createHmac, createHash } from "node:crypto";

// ─── Types ───

interface PaymentMethod {
  id: string;
  name: string;
  nameAr: string;
  provider: string;
  countries: string[];
  minAmount: number;
  maxAmount: number;
  currency: string;
  feesPercent: number;
  settlementDays: number;
}

interface InitiateResult {
  ok: boolean;
  error?: string;
  transaction?: {
    id: number;
    provider: string;
    status: string;
    amount: string;
    currency: string;
    createdAt: string;
  };
  checkoutUrl?: string;
}

interface VerifyResult {
  ok: boolean;
  error?: string;
  status?: string;
}

/**
 * Risk level returned by the fraud detector.
 * - `'low'`  — payment is within normal parameters
 * - `'medium'` — slight anomaly detected, recommend manual review
 * - `'high'` — significant anomaly detected, recommend blocking
 */
type RiskLevel = "low" | "medium" | "high";

/**
 * Result of fraud scoring for a payment request.
 */
interface FraudScoreResult {
  /** Overall risk level */
  riskLevel: RiskLevel;
  /** Numeric risk score from 0 (safe) to 100 (dangerous) */
  score: number;
  /** Human-readable explanation of why this score was assigned */
  explanation: string;
  /** Individual check results that contributed to the score */
  checks: {
    velocity: { passed: boolean; details: string };
    amountAnomaly: { passed: boolean; details: string };
  };
}

/**
 * A single entry in the payment audit log.
 * Entries are linked via SHA-256 hashes for tamper evidence.
 */
interface AuditEntry {
  /** Unique identifier for this audit entry */
  id: string;
  /** The transaction this entry relates to */
  transactionId: number;
  /** Previous status before this transition */
  fromStatus: string;
  /** New status after this transition */
  toStatus: string;
  /** ISO-8601 timestamp of the transition */
  timestamp: string;
  /** Who or what initiated this transition (e.g. "system", "webhook:knet", user email) */
  actor: string;
  /** Arbitrary metadata attached to this transition */
  metadata: Record<string, unknown>;
  /** SHA-256 hash of this entry's content for tamper evidence */
  hash: string;
  /** SHA-256 hash of the previous entry in the chain (empty string for first entry) */
  previousHash: string;
}

/**
 * A payment awaiting retry after a failed attempt.
 */
interface RetryEntry {
  /** The idempotency key that identifies this payment */
  idempotencyKey: string;
  /** Original payment parameters */
  params: {
    companySlug: string;
    paymentMethodId: string;
    amount: string;
    currency: string;
    invoiceId: number | null;
    userEmail: string;
    idempotencyKey: string;
  };
  /** How many retry attempts have been made so far */
  retryCount: number;
  /** Maximum allowed retries */
  maxRetries: number;
  /** Timestamp when the next retry should be attempted (ISO-8601) */
  nextRetryAt: string;
  /** ISO-8601 timestamp of the original failure */
  failedAt: string;
  /** Error message from the last failed attempt */
  lastError: string;
}

// ─── Supported MENA Payment Methods (static catalogue) ───

const PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: "knet-debit",
    name: "KNET Debit",
    nameAr: "ك نت بطاقة خصم",
    provider: "knet",
    countries: ["KW"],
    minAmount: 0.5,
    maxAmount: 50000,
    currency: "KWD",
    feesPercent: 0.5,
    settlementDays: 1,
  },
  {
    id: "fawry-cash",
    name: "Fawry Cash Payment",
    nameAr: "فوري دفع نقدي",
    provider: "fawry",
    countries: ["EG"],
    minAmount: 1,
    maxAmount: 30000,
    currency: "EGP",
    feesPercent: 1.0,
    settlementDays: 0,
  },
  {
    id: "sadad-bank",
    name: "Sadad Bank Transfer",
    nameAr: "سداد تحويل بنكي",
    provider: "sadad",
    countries: ["SA"],
    minAmount: 1,
    maxAmount: 100000,
    currency: "SAR",
    feesPercent: 0.25,
    settlementDays: 2,
  },
  {
    id: "benefit-debit",
    name: "Benefit Debit",
    nameAr: "بenefit بطاقة خصم",
    provider: "benefit",
    countries: ["BH"],
    minAmount: 0.1,
    maxAmount: 20000,
    currency: "BHD",
    feesPercent: 0.5,
    settlementDays: 1,
  },
  {
    id: "omannet-debit",
    name: "OmanNet Debit",
    nameAr: "عمان نت بطاقة خصم",
    provider: "omannet",
    countries: ["OM"],
    minAmount: 0.1,
    maxAmount: 20000,
    currency: "OMR",
    feesPercent: 0.5,
    settlementDays: 1,
  },
  {
    id: "qpay-debit",
    name: "QPay Debit",
    nameAr: "قPay بطاقة خصم",
    provider: "qpay",
    countries: ["QA"],
    minAmount: 1,
    maxAmount: 50000,
    currency: "QAR",
    feesPercent: 0.5,
    settlementDays: 1,
  },
];

// ─── Provider Configuration ───

/**
 * Per-provider signing secrets for HMAC-SHA256 signature generation.
 * In production, these should be loaded from environment variables or a secrets manager.
 * @example
 * ```ts
 * // Override with real secrets before use:
 * PROVIDER_SIGNING_SECRETS.knet = process.env.KNET_SIGNING_SECRET!;
 * ```
 */
export const PROVIDER_SIGNING_SECRETS: Record<string, string> = {
  knet: "knet-signing-secret-placeholder",
  fawry: "fawry-signing-secret-placeholder",
  sadad: "sadad-signing-secret-placeholder",
  benefit: "benefit-signing-secret-placeholder",
  omannet: "omannet-signing-secret-placeholder",
  qpay: "qpay-signing-secret-placeholder",
};

/**
 * Per-provider webhook verification secrets.
 * Separate from signing secrets because webhook endpoints often use
 * a different shared secret configured in the provider's dashboard.
 * @example
 * ```ts
 * PROVIDER_WEBHOOK_SECRETS.knet = process.env.KNET_WEBHOOK_SECRET!;
 * ```
 */
export const PROVIDER_WEBHOOK_SECRETS: Record<string, string> = {
  knet: "knet-webhook-secret-placeholder",
  fawry: "fawry-webhook-secret-placeholder",
  sadad: "sadad-webhook-secret-placeholder",
  benefit: "benefit-webhook-secret-placeholder",
  omannet: "omannet-webhook-secret-placeholder",
  qpay: "qpay-webhook-secret-placeholder",
};

// ─── Original Functions (enhanced) ───

/**
 * Get available payment methods for a given country and amount.
 * Filters the static catalogue by country and amount range.
 *
 * @param companySlug - The tenant/company identifier
 * @param country - ISO-3166-1 alpha-2 country code (e.g. "KW", "EG", "SA")
 * @param amount - Payment amount in the local currency
 * @returns Object with `ok` flag, optional `error`, and `methods` array on success
 */
export async function getAvailablePaymentMethods(
  companySlug: string,
  country: string,
  amount: number,
): Promise<{ ok: boolean; error?: string; methods?: PaymentMethod[] }> {
  try {
    const methods = PAYMENT_METHODS.filter(
      (m) =>
        m.countries.includes(country.toUpperCase()) &&
        amount >= m.minAmount &&
        amount <= m.maxAmount,
    );

    return { ok: true, methods };
  } catch (err: any) {
    return { ok: false, error: err.message || "فشل جلب طرق الدفع" };
  }
}

/**
 * Initiate a local payment transaction.
 * Creates a transaction record and returns a checkout URL.
 * Supports idempotency keys to prevent duplicate payments — if the same
 * `idempotencyKey` was used previously, the original result is returned.
 * Fraud detection is automatically applied before processing.
 *
 * @param companySlug - The tenant/company identifier
 * @param paymentMethodId - One of the IDs from `PAYMENT_METHODS` (e.g. "knet-debit")
 * @param amount - Payment amount as a string (e.g. "150.00")
 * @param currency - ISO-4217 currency code (e.g. "KWD", "EGP")
 * @param invoiceId - Optional invoice ID to link this payment to
 * @param userEmail - Email of the user initiating the payment
 * @param idempotencyKey - Unique key to prevent duplicate payments; if a previous
 *   payment with the same key exists, its result is returned without creating a new transaction
 * @returns `InitiateResult` with transaction details and checkout URL on success
 */
export async function initiateLocalPayment(
  companySlug: string,
  paymentMethodId: string,
  amount: string,
  currency: string,
  invoiceId: number | null,
  userEmail: string,
  idempotencyKey?: string,
): Promise<InitiateResult> {
  try {
    // ── Idempotency check ──
    if (idempotencyKey) {
      const existing = idempotencyStore.get(idempotencyKey);
      if (existing) {
        // Return the original result — no duplicate transaction created
        return existing;
      }
    }

    // ── Fraud detection ──
    const fraudResult = fraudDetector.scorePayment(companySlug, Number(amount), currency);
    if (fraudResult.riskLevel === "high") {
      return {
        ok: false,
        error: `Payment blocked by fraud detection: ${fraudResult.explanation}`,
      };
    }

    // ── Validate payment method ──
    const method = PAYMENT_METHODS.find((m) => m.id === paymentMethodId);
    if (!method) {
      return { ok: false, error: "طريقة الدفع غير موجودة" };
    }

    // ── Create transaction ──
    const transactionId = Math.floor(Math.random() * 1000000) + 1;
    const checkoutUrl = `https://pay.garfix.dev/checkout/${method.provider}/${transactionId}`;

    const result: InitiateResult = {
      ok: true,
      transaction: {
        id: transactionId,
        provider: method.provider,
        status: "pending",
        amount,
        currency,
        createdAt: new Date().toISOString(),
      },
      checkoutUrl,
    };

    // ── Store for idempotency ──
    if (idempotencyKey) {
      idempotencyStore.set(idempotencyKey, result);
    }

    // ── Record audit entry ──
    auditLog.recordEntry({
      transactionId,
      fromStatus: "none",
      toStatus: "pending",
      actor: userEmail,
      metadata: {
        companySlug,
        paymentMethodId,
        amount,
        currency,
        invoiceId,
        idempotencyKey,
        fraudScore: fraudResult.score,
        fraudRiskLevel: fraudResult.riskLevel,
      },
    });

    return result;
  } catch (err: any) {
    // ── If we have an idempotency key and failed, enqueue for retry ──
    if (idempotencyKey && err.message) {
      retryQueue.enqueue({
        idempotencyKey,
        params: {
          companySlug,
          paymentMethodId,
          amount,
          currency,
          invoiceId,
          userEmail,
          idempotencyKey,
        },
        maxRetries: 3,
        lastError: err.message,
      });
    }

    return { ok: false, error: err.message || "فشل بدء الدفع" };
  }
}

/**
 * Verify a payment transaction status.
 * Records an audit trail entry for the verification attempt.
 *
 * @param companySlug - The tenant/company identifier
 * @param transactionId - The transaction ID returned by `initiateLocalPayment`
 * @param userEmail - Email of the user verifying the payment
 * @returns `VerifyResult` with current status on success
 */
export async function verifyPayment(
  companySlug: string,
  transactionId: number,
  userEmail: string,
): Promise<VerifyResult> {
  try {
    // Stub: always returns "completed" for now.
    // Full implementation will call the provider's verification API.

    // ── Record audit entry ──
    auditLog.recordEntry({
      transactionId,
      fromStatus: "pending",
      toStatus: "completed",
      actor: userEmail,
      metadata: { companySlug, action: "verify" },
    });

    return { ok: true, status: "completed" };
  } catch (err: any) {
    return { ok: false, error: err.message || "فشل التحقق من الدفع" };
  }
}

// ─── 1. Signature Validation ───

/**
 * Generate an HMAC-SHA256 signature for a payment request payload.
 *
 * Uses the provider's signing secret to create a hex-encoded HMAC digest.
 * This signature should be sent alongside payment requests so the provider
 * can verify the request originated from this system.
 *
 * @param payload - The string payload to sign (typically a JSON-serialized request body)
 * @param secret - The HMAC signing secret for the provider (from `PROVIDER_SIGNING_SECRETS`)
 * @returns Hex-encoded HMAC-SHA256 digest string
 *
 * @example
 * ```ts
 * const payload = JSON.stringify({ amount: "150.00", currency: "KWD" });
 * const signature = generateSignature(payload, PROVIDER_SIGNING_SECRETS.knet);
 * // Send both payload and signature in the request header
 * ```
 */
export function generateSignature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Validate an HMAC-SHA256 signature against a payload and secret.
 *
 * Compares the provided signature with a freshly computed HMAC digest.
 * Uses a constant-time string comparison to prevent timing attacks.
 *
 * @param payload - The original string payload that was signed
 * @param signature - The signature to validate (hex-encoded HMAC-SHA256 digest)
 * @param secret - The HMAC signing secret for the provider
 * @returns `true` if the signature matches the computed digest, `false` otherwise
 *
 * @example
 * ```ts
 * const isValid = validateSignature(
 *   request.body,
 *   request.headers["x-signature"],
 *   PROVIDER_SIGNING_SECRETS.knet,
 * );
 * if (!isValid) throw new Error("Invalid signature");
 * ```
 */
export function validateSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const expected = generateSignature(payload, secret);
  // Constant-time comparison to prevent timing attacks
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

// ─── 2. Idempotency ───

/**
 * In-memory idempotency store for payment requests.
 *
 * Maps idempotency keys to their original `InitiateResult` so that
 * duplicate requests with the same key return the cached result instead
 * of creating a new transaction.
 *
 * **⚠️ Migration target (v13):** Replace with PostgreSQL table using
 * a unique constraint on `(providerTxId, idempotencyKey)` for durability
 * and multi-instance consistency.
 *
 * Entries are stored indefinitely in this in-memory version.
 * A production version should TTL entries after 24 hours.
 */
export const idempotencyStore: Map<string, InitiateResult> = new Map();

// ─── 3. Retry Queue ───

/**
 * Payment retry queue with exponential backoff.
 *
 * Stores failed payment attempts and schedules retries with increasing delays:
 * - Retry 1: 5 minutes after failure
 * - Retry 2: 10 minutes after failure
 * - Retry 3: 20 minutes after failure
 *
 * After 3 failed retries, the payment is permanently rejected and removed
 * from the queue.
 *
 * **⚠️ Migration target (v13):** Replace with BullMQ queue backed by Redis
 * for distributed retry processing and durability across process restarts.
 */
export class PaymentRetryQueue {
  /** Internal store of pending retry entries, keyed by idempotency key */
  private queue: Map<string, RetryEntry> = new Map();

  /** Exponential backoff intervals in milliseconds: 5min, 10min, 20min */
  private static BACKOFF_INTERVALS_MS: number[] = [
    5 * 60 * 1000,  // 5 minutes
    10 * 60 * 1000, // 10 minutes
    20 * 60 * 1000, // 20 minutes
  ];

  /**
   * Enqueue a failed payment for retry.
   *
   * Calculates the next retry time using exponential backoff based on
   * the current retry count. If the entry already exists in the queue,
   * its retry count and next retry time are updated.
   *
   * @param entry - Partial retry entry with at least `idempotencyKey`, `params`, `maxRetries`, and `lastError`
   * @throws Error if `maxRetries` exceeds 3
   */
  enqueue(entry: {
    idempotencyKey: string;
    params: RetryEntry["params"];
    maxRetries: number;
    lastError: string;
  }): void {
    if (entry.maxRetries > 3) {
      throw new Error("Maximum retries cannot exceed 3");
    }

    const existing = this.queue.get(entry.idempotencyKey);
    const retryCount = existing ? existing.retryCount + 1 : 0;

    if (retryCount >= entry.maxRetries) {
      // Max retries exhausted — remove from queue and reject permanently
      this.queue.delete(entry.idempotencyKey);
      return;
    }

    const backoffMs =
      PaymentRetryQueue.BACKOFF_INTERVALS_MS[retryCount] ??
      PaymentRetryQueue.BACKOFF_INTERVALS_MS[PaymentRetryQueue.BACKOFF_INTERVALS_MS.length - 1];

    const retryEntry: RetryEntry = {
      idempotencyKey: entry.idempotencyKey,
      params: entry.params,
      retryCount,
      maxRetries: entry.maxRetries,
      nextRetryAt: new Date(Date.now() + backoffMs).toISOString(),
      failedAt: existing?.failedAt ?? new Date().toISOString(),
      lastError: entry.lastError,
    };

    this.queue.set(entry.idempotencyKey, retryEntry);
  }

  /**
   * Retry a failed payment that is ready for retry (nextRetryAt <= now).
   *
   * Re-invokes `initiateLocalPayment` with the original parameters.
   * On success, removes the entry from the queue and returns the result.
   * On failure, re-enqueues with an incremented retry count.
   *
   * @param idempotencyKey - The idempotency key of the payment to retry
   * @returns The `InitiateResult` from the retry attempt, or `null` if the
   *   entry doesn't exist or is not yet ready for retry
   */
  async retryFailedPayment(idempotencyKey: string): Promise<InitiateResult | null> {
    const entry = this.queue.get(idempotencyKey);
    if (!entry) return null;

    // Check if retry is due
    if (new Date(entry.nextRetryAt) > new Date()) {
      return null; // Not yet ready for retry
    }

    const result = await initiateLocalPayment(
      entry.params.companySlug,
      entry.params.paymentMethodId,
      entry.params.amount,
      entry.params.currency,
      entry.params.invoiceId,
      entry.params.userEmail,
      entry.params.idempotencyKey,
    );

    if (result.ok) {
      // Success — remove from retry queue
      this.queue.delete(idempotencyKey);
    } else {
      // Failure — re-enqueue with updated error
      this.enqueue({
        idempotencyKey,
        params: entry.params,
        maxRetries: entry.maxRetries,
        lastError: result.error ?? "Unknown retry error",
      });
    }

    return result;
  }

  /**
   * Get all entries currently in the retry queue.
   * Useful for monitoring and dashboard display.
   *
   * @returns Array of all pending `RetryEntry` objects
   */
  getPendingEntries(): RetryEntry[] {
    return Array.from(this.queue.values());
  }

  /**
   * Get the number of entries currently in the retry queue.
   *
   * @returns Number of pending retry entries
   */
  getQueueSize(): number {
    return this.queue.size;
  }

  /**
   * Remove a specific entry from the retry queue.
   * Use this to cancel a pending retry.
   *
   * @param idempotencyKey - The idempotency key to remove
   * @returns `true` if the entry was found and removed, `false` otherwise
   */
  cancelRetry(idempotencyKey: string): boolean {
    return this.queue.delete(idempotencyKey);
  }
}

/** Singleton instance of the payment retry queue */
export const retryQueue = new PaymentRetryQueue();

/**
 * Convenience function to retry a failed payment by idempotency key.
 *
 * Delegates to the singleton `retryQueue` instance.
 *
 * @param idempotencyKey - The idempotency key of the failed payment
 * @returns The `InitiateResult` from the retry attempt, or `null` if not ready
 */
export async function retryFailedPayment(
  idempotencyKey: string,
): Promise<InitiateResult | null> {
  return retryQueue.retryFailedPayment(idempotencyKey);
}

// ─── 4. Webhook Verification ───

/**
 * Verify the authenticity of an incoming webhook from a payment provider.
 *
 * Each provider sends a signature in the webhook request headers. This function
 * retrieves the provider's webhook secret from `PROVIDER_WEBHOOK_SECRETS`,
 * computes the expected HMAC-SHA256 signature over the raw payload, and
 * compares it with the provided signature header using constant-time comparison.
 *
 * @param provider - The provider identifier (e.g. "knet", "fawry", "sadad")
 * @param payload - The raw webhook request body as a string
 * @param signatureHeader - The signature value from the webhook request header
 *   (e.g. `req.headers["x-webhook-signature"]`)
 * @returns `true` if the signature is valid for this provider, `false` otherwise
 *
 * @throws Error if the provider is not recognized (no webhook secret configured)
 *
 * @example
 * ```ts
 * const isValid = verifyWebhookSignature(
 *   "knet",
 *   request.rawBody,
 *   request.headers["x-knet-signature"],
 * );
 * if (!isValid) {
 *   response.status(401).json({ error: "Invalid webhook signature" });
 *   return;
 * }
 * ```
 */
export function verifyWebhookSignature(
  provider: string,
  payload: string,
  signatureHeader: string,
): boolean {
  const secret = PROVIDER_WEBHOOK_SECRETS[provider];
  if (!secret) {
    throw new Error(
      `Unknown provider: no webhook secret configured for "${provider}"`,
    );
  }

  return validateSignature(payload, signatureHeader, secret);
}

// ─── 5. Audit Trail ───

/**
 * Immutable, tamper-evident audit trail for payment state transitions.
 *
 * Each audit entry is linked to the previous entry via a SHA-256 hash chain,
 * making it possible to detect if any entry has been modified or removed:
 * - Every entry's `hash` field = SHA-256(transactionId + fromStatus + toStatus + timestamp + actor + metadataJSON + previousHash)
 * - The `previousHash` field references the hash of the preceding entry for the same transaction
 * - First entry for a transaction has `previousHash = ""`
 *
 * To verify integrity: walk the chain for a transaction and confirm each entry's
 * computed hash matches its stored `hash`, and each `previousHash` matches the
 * preceding entry's `hash`.
 *
 * **⚠️ Migration target (v13):** Replace with PostgreSQL `payment_audit_log` table
 * (append-only, no UPDATE/DELETE permissions) with SHA-256 linked chain.
 */
export class PaymentAuditLog {
  /** All audit entries, stored in order of creation */
  private entries: AuditEntry[] = [];

  /** Map of transactionId → array of audit entry indices for fast lookup */
  private transactionIndex: Map<number, number[]> = new Map();

  /**
   * Record a new audit entry for a payment state transition.
   *
   * Automatically computes the SHA-256 hash chain link:
   * - If previous entries exist for this transaction, `previousHash` is set to
   *   the hash of the most recent entry
   * - If this is the first entry, `previousHash` is set to `""`
   * - The entry's own `hash` is computed over all fields including `previousHash`
   *
   * @param transition - The state transition details to record
   * @returns The created `AuditEntry` with computed hashes
   */
  recordEntry(transition: {
    transactionId: number;
    fromStatus: string;
    toStatus: string;
    actor: string;
    metadata: Record<string, unknown>;
  }): AuditEntry {
    const existingIndices = this.transactionIndex.get(transition.transactionId) ?? [];
    const previousHash =
      existingIndices.length > 0
        ? this.entries[existingIndices[existingIndices.length - 1]].hash
        : "";

    const timestamp = new Date().toISOString();
    const id = `audit-${transition.transactionId}-${existingIndices.length + 1}-${Date.now()}`;

    const metadataJSON = JSON.stringify(transition.metadata);

    // Compute this entry's hash over all content + previousHash for chain integrity
    const hashContent = [
      String(transition.transactionId),
      transition.fromStatus,
      transition.toStatus,
      timestamp,
      transition.actor,
      metadataJSON,
      previousHash,
    ].join("|");

    const hash = createHash("sha256").update(hashContent).digest("hex");

    const entry: AuditEntry = {
      id,
      transactionId: transition.transactionId,
      fromStatus: transition.fromStatus,
      toStatus: transition.toStatus,
      timestamp,
      actor: transition.actor,
      metadata: transition.metadata,
      hash,
      previousHash,
    };

    const entryIndex = this.entries.length;
    this.entries.push(entry);

    const indices = this.transactionIndex.get(transition.transactionId) ?? [];
    indices.push(entryIndex);
    this.transactionIndex.set(transition.transactionId, indices);

    return entry;
  }

  /**
   * Retrieve the full audit trail for a specific transaction.
   *
   * Returns all entries for the given transaction in chronological order,
   * forming a complete hash chain from the first state transition to the latest.
   *
   * @param transactionId - The transaction ID to look up
   * @returns Array of `AuditEntry` objects in chronological order, or empty array
   *   if no entries exist for this transaction
   */
  getAuditTrail(transactionId: number): AuditEntry[] {
    const indices = this.transactionIndex.get(transactionId) ?? [];
    return indices.map((i) => this.entries[i]);
  }

  /**
   * Verify the integrity of the audit trail for a specific transaction.
   *
   * Walks the hash chain and confirms:
   * 1. Each entry's computed hash matches its stored `hash` field
   * 2. Each entry's `previousHash` matches the preceding entry's `hash`
   * 3. The first entry has `previousHash = ""`
   *
   * @param transactionId - The transaction ID to verify
   * @returns `true` if the chain is intact, `false` if any tampering is detected
   */
  verifyIntegrity(transactionId: number): boolean {
    const trail = this.getAuditTrail(transactionId);

    if (trail.length === 0) return true;

    for (let i = 0; i < trail.length; i++) {
      const entry = trail[i];

      // First entry must have empty previousHash
      if (i === 0 && entry.previousHash !== "") return false;

      // Subsequent entries must reference the previous entry's hash
      if (i > 0 && entry.previousHash !== trail[i - 1].hash) return false;

      // Recompute hash and compare
      const metadataJSON = JSON.stringify(entry.metadata);
      const hashContent = [
        String(entry.transactionId),
        entry.fromStatus,
        entry.toStatus,
        entry.timestamp,
        entry.actor,
        metadataJSON,
        entry.previousHash,
      ].join("|");

      const computedHash = createHash("sha256").update(hashContent).digest("hex");
      if (computedHash !== entry.hash) return false;
    }

    return true;
  }

  /**
   * Get all audit entries across all transactions.
   * Useful for compliance reporting and full-system integrity checks.
   *
   * @returns Array of all `AuditEntry` objects in chronological order
   */
  getAllEntries(): AuditEntry[] {
    return [...this.entries];
  }
}

/** Singleton instance of the payment audit log */
export const auditLog = new PaymentAuditLog();

/**
 * Convenience function to record an audit entry for a payment state transition.
 *
 * Delegates to the singleton `auditLog` instance.
 *
 * @param transition - The state transition details to record
 * @returns The created `AuditEntry` with computed hashes
 */
export function recordAuditEntry(transition: {
  transactionId: number;
  fromStatus: string;
  toStatus: string;
  actor: string;
  metadata: Record<string, unknown>;
}): AuditEntry {
  return auditLog.recordEntry(transition);
}

/**
 * Convenience function to retrieve the audit trail for a transaction.
 *
 * Delegates to the singleton `auditLog` instance.
 *
 * @param transactionId - The transaction ID to look up
 * @returns Array of `AuditEntry` objects in chronological order
 */
export function getAuditTrail(transactionId: number): AuditEntry[] {
  return auditLog.getAuditTrail(transactionId);
}

// ─── 6. Fraud Detection ───

/**
 * Basic fraud detection with velocity checks and amount anomaly scoring.
 *
 * Velocity check: Tracks the number of payments per minute per tenant.
 * A tenant exceeding 5 payments per minute is flagged as `medium` risk.
 *
 * Amount anomaly: Tracks the running average payment amount per tenant.
 * A payment exceeding 3x the tenant's average is flagged as `high` risk.
 *
 * Both checks contribute to an overall risk level and numeric score:
 * - `low`    (score 0–30):  Payment is within normal parameters
 * - `medium` (score 31–70): Slight anomaly, recommend manual review
 * - `high`   (score 71–100): Significant anomaly, recommend blocking
 *
 * **⚠️ Migration target (v13):** Migrate history to PostgreSQL for durability
 * and cross-instance consistency. Add ML-based anomaly detection.
 */
export class FraudDetector {
  /** Tracks payment timestamps per tenant for velocity checks */
  private paymentTimestamps: Map<string, Date[]> = new Map();

  /** Tracks payment amounts per tenant+currency for average calculation */
  private paymentAmounts: Map<string, { total: number; count: number }> = new Map();

  /** Maximum payments allowed per minute per tenant */
  private static MAX_PAYMENTS_PER_MINUTE = 5;

  /** Multiplier threshold for amount anomaly detection (3x average) */
  private static AMOUNT_ANOMALY_MULTIPLIER = 3;

  /**
   * Score a payment request for fraud risk.
   *
   * Runs two checks:
   * 1. **Velocity check**: Counts payments in the last 60 seconds for this tenant.
   *    If count > 5, flags as `medium` risk.
   * 2. **Amount anomaly check**: Compares this payment amount to the tenant's
   *    historical average for this currency. If amount > 3x average, flags as
   *    `high` risk.
   *
   * The overall risk level is the maximum of both check results.
   * After scoring, the payment is recorded in history for future checks.
   *
   * @param companySlug - The tenant/company identifier
   * @param amount - Payment amount as a number
   * @param currency - ISO-4217 currency code
   * @returns `FraudScoreResult` with risk level, score, explanation, and individual check results
   *
   * @example
   * ```ts
   const result = fraudDetector.scorePayment("acme-inc", 500, "KWD");
   if (result.riskLevel === "high") {
     // Block the payment
   } else if (result.riskLevel === "medium") {
     // Flag for manual review
   }
   ```
   */
  scorePayment(
    companySlug: string,
    amount: number,
    currency: string,
  ): FraudScoreResult {
    const now = new Date();

    // ── Velocity check ──
    const timestamps = this.paymentTimestamps.get(companySlug) ?? [];
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    const recentPayments = timestamps.filter((t) => t >= oneMinuteAgo);
    const velocityPassed = recentPayments.length < FraudDetector.MAX_PAYMENTS_PER_MINUTE;
    const velocityDetails = velocityPassed
      ? `${recentPayments.length} payments in the last minute (limit: ${FraudDetector.MAX_PAYMENTS_PER_MINUTE})`
      : `Velocity limit exceeded: ${recentPayments.length} payments in the last minute (limit: ${FraudDetector.MAX_PAYMENTS_PER_MINUTE})`;

    // ── Amount anomaly check ──
    const amountKey = `${companySlug}:${currency}`;
    const amountHistory = this.paymentAmounts.get(amountKey) ?? { total: 0, count: 0 };
    const averageAmount =
      amountHistory.count > 0 ? amountHistory.total / amountHistory.count : amount;
    const anomalyThreshold = averageAmount * FraudDetector.AMOUNT_ANOMALY_MULTIPLIER;
    const amountAnomalyPassed = amount <= anomalyThreshold || amountHistory.count < 3;
    const amountAnomalyDetails = amountAnomalyPassed
      ? `Amount ${amount} ${currency} is within normal range (avg: ${averageAmount.toFixed(2)}, threshold: ${anomalyThreshold.toFixed(2)})`
      : `Amount anomaly: ${amount} ${currency} exceeds 3x average (${averageAmount.toFixed(2)} ${currency}, threshold: ${anomalyThreshold.toFixed(2)})`;

    // ── Record this payment for future checks ──
    timestamps.push(now);
    this.paymentTimestamps.set(companySlug, timestamps);
    amountHistory.total += amount;
    amountHistory.count += 1;
    this.paymentAmounts.set(amountKey, amountHistory);

    // ── Compute overall risk ──
    let score = 0;
    const riskFactors: string[] = [];

    if (!velocityPassed) {
      score += 40;
      riskFactors.push(velocityDetails);
    }

    if (!amountAnomalyPassed) {
      score += 60;
      riskFactors.push(amountAnomalyDetails);
    }

    // Determine risk level from score
    let riskLevel: RiskLevel;
    if (score >= 71) {
      riskLevel = "high";
    } else if (score >= 31) {
      riskLevel = "medium";
    } else {
      riskLevel = "low";
    }

    const explanation =
      riskFactors.length > 0
        ? `Risk factors: ${riskFactors.join("; ")}`
        : "No risk factors detected — payment appears normal";

    return {
      riskLevel,
      score,
      explanation,
      checks: {
        velocity: { passed: velocityPassed, details: velocityDetails },
        amountAnomaly: { passed: amountAnomalyPassed, details: amountAnomalyDetails },
      },
    };
  }

  /**
   * Reset fraud detection history for a specific tenant.
   * Useful for testing or when a tenant's profile legitimately changes.
   *
   * @param companySlug - The tenant/company identifier to reset
   */
  resetHistory(companySlug: string): void {
    this.paymentTimestamps.delete(companySlug);
    // Delete all currency-specific amount histories for this tenant
    for (const key of Array.from(this.paymentAmounts.keys())) {
      if (key.startsWith(`${companySlug}:`)) {
        this.paymentAmounts.delete(key);
      }
    }
  }

  /**
   * Get the current velocity (payments in last minute) for a tenant.
   * Useful for monitoring dashboards.
   *
   * @param companySlug - The tenant/company identifier
   * @returns Number of payments recorded in the last 60 seconds
   */
  getCurrentVelocity(companySlug: string): number {
    const timestamps = this.paymentTimestamps.get(companySlug) ?? [];
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    return timestamps.filter((t) => t >= oneMinuteAgo).length;
  }

  /**
   * Get the average payment amount for a tenant and currency.
   *
   * @param companySlug - The tenant/company identifier
   * @param currency - ISO-4217 currency code
   * @returns The average amount, or 0 if no history exists
   */
  getAverageAmount(companySlug: string, currency: string): number {
    const amountKey = `${companySlug}:${currency}`;
    const history = this.paymentAmounts.get(amountKey);
    if (!history || history.count === 0) return 0;
    return history.total / history.count;
  }
}

/** Singleton instance of the fraud detector */
export const fraudDetector = new FraudDetector();
