/**
 * Local Payment Rails — MENA-region payment processing stub
 *
 * Provides stubs for: initiateLocalPayment, verifyPayment, getAvailablePaymentMethods
 * These are placeholders until full integration with local payment providers
 * (KNET, Fawry, Sadad, etc.) is implemented.
 *
 * ⚠️ STUB WARNING: This module is NOT production-ready.
 *   Missing features required for production:
 *   - Signature validation (HMAC/Webhook signatures from providers)
 *   - Idempotency (duplicate payment protection via idempotency keys)
 *   - Retry Queue (automatic retry with exponential backoff on failures)
 *   - Webhook verification (verify incoming webhook authenticity)
 *   - Audit Trail (immutable log of all payment state transitions)
 *   - Fraud Detection (basic anomaly scoring + velocity checks)
 *
 * Migration plan (v13):
 *   1. Replace stubs with real provider SDK integrations (KNET, Fawry, Sadad, mPay)
 *   2. Add signature validation per provider specification
 *   3. Implement idempotency via PostgreSQL unique constraint on (providerTxId, idempotencyKey)
 *   4. Route all payments through BullMQ retry queue (3 retries, 5min backoff)
 *   5. Add webhook endpoint with HMAC-SHA256 verification per provider
 *   6. Create `payment_audit_log` table with tamper-evidence chain (append-only, SHA-256 linked)
 *   7. Add fraud scoring: velocity check (max 5 payments/min per tenant), amount anomaly detection
 *   8. All stub functions marked `@deprecated` — will be removed in v13
 */

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

// ─── Functions ───

/**
 * Get available payment methods for a given country and amount.
 * Filters the static catalogue by country and amount range.
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
 * Creates a stub transaction record and returns a mock checkout URL.
 * Full implementation will integrate with the actual payment provider APIs.
 */
export async function initiateLocalPayment(
  companySlug: string,
  paymentMethodId: string,
  amount: string,
  currency: string,
  invoiceId: number | null,
  userEmail: string,
): Promise<InitiateResult> {
  try {
    const method = PAYMENT_METHODS.find((m) => m.id === paymentMethodId);
    if (!method) {
      return { ok: false, error: "طريقة الدفع غير موجودة" };
    }

    // Stub: in production this would call the provider's API and create
    // a real PaymentTransaction via Prisma.
    const transactionId = Math.floor(Math.random() * 1000000) + 1;
    const checkoutUrl = `https://pay.garfix.dev/checkout/${method.provider}/${transactionId}`;

    return {
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
  } catch (err: any) {
    return { ok: false, error: err.message || "فشل بدء الدفع" };
  }
}

/**
 * Verify a payment transaction status.
 * Stub implementation — full version would query the provider and update DB.
 */
export async function verifyPayment(
  companySlug: string,
  transactionId: number,
  userEmail: string,
): Promise<VerifyResult> {
  try {
    // Stub: always returns "completed" for now.
    // Full implementation will call the provider's verification API.
    return { ok: true, status: "completed" };
  } catch (err: any) {
    return { ok: false, error: err.message || "فشل التحقق من الدفع" };
  }
}
