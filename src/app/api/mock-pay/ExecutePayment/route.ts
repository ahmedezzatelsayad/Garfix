/**
 * MOCK PAYMENT GATEWAY (DEV/TEST ONLY)
 * يحاكي MyFatoorah ExecutePayment — يرجع PaymentURL لصفحة الدفع الوهمية
 * (mock-checkout) التي توجّه للـ callback الحقيقي بالحالة المطلوبة.
 */
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const amount = body.InvoiceValue ?? 10;
  const invoiceId = Math.floor(100000 + Math.random() * 900000);
  const origin = new URL(req.url).origin;
  return NextResponse.json({
    IsSuccess: true,
    Data: {
      InvoiceId: invoiceId,
      InvoiceValue: amount,
      PaymentURL: `${origin}/mock-checkout?invoiceId=${invoiceId}&amount=${amount}`,
    },
  });
}
