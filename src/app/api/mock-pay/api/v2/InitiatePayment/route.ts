/**
 * MOCK PAYMENT GATEWAY (DEV/TEST ONLY) — MyFatoorah-compatible path
 * /api/mock-pay/api/v2/InitiatePayment
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
