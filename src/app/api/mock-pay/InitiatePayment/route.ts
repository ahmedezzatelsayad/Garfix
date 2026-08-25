/**
 * MOCK PAYMENT GATEWAY (DEV/TEST ONLY)
 * يحاكي MyFatoorah InitiatePayment — لمسار اختبار الاشتراك الكامل
 * بدون مفاتيح حقيقية. لا يُستخدم في الإنتاج (BASE_URL يوجه إليه فقط
 * من إعداد integration تجريبي).
 */
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  return NextResponse.json({
    IsSuccess: true,
    Data: {
      PaymentMethods: [
        { PaymentMethodId: 2, PaymentMethodCode: "VISA", Code: "VISA", PaymentMethodAr: "فيزا" },
        { PaymentMethodId: 1, PaymentMethodCode: "MADA", Code: "MADA", PaymentMethodAr: "مدى" },
      ],
    },
  });
}
