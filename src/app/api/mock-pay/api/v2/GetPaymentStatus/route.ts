/**
 * MOCK PAYMENT GATEWAY (DEV/TEST ONLY) — MyFatoorah-compatible path
 * /api/mock-pay/api/v2/GetPaymentStatus
 */
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const paymentId = String(body.Key ?? "");
  const isPaid = paymentId.startsWith("ok_");
  const invoiceId = paymentId.replace(/^ok_|^fail_/, "");
  return NextResponse.json({
    IsSuccess: true,
    Data: {
      InvoiceId: invoiceId,
      InvoiceStatus: isPaid ? "Paid" : "Failed",
      InvoiceAmount: 10,
      PaymentId: paymentId,
    },
  });
}
