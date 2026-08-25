"use client";

/**
 * MOCK CHECKOUT (DEV/TEST ONLY)
 * صفحة دفع وهمية تحاكي بوابة MyFatoorah — توجّه للـ callback الحقيقي
 * بمعرّف دفع يبدأ بـ ok_ (نجاح) أو fail_ (فشل) ليكتمل مسار الاشتراك.
 */
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";

function MockCheckoutInner() {
  const params = useSearchParams();
  const router = useRouter();
  const invoiceId = params.get("invoiceId") || "0";
  const amount = params.get("amount") || "0";

  const finish = (status: "ok" | "fail") => {
    router.push(
      `/api/saas/payments/callback?paymentId=${status}_${invoiceId}`
    );
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[#0f172a] flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
        <div className="w-16 h-16 mx-auto rounded-full bg-[#047857]/10 flex items-center justify-center text-3xl mb-4">💳</div>
        <h1 className="text-xl font-black text-[#111] mb-1">بوابة الدفع (تجريبية)</h1>
        <p className="text-sm text-[#666] mb-6">Mock Payment Gateway — لاختبار مسار الاشتراك فقط</p>

        <div className="bg-[#f8fafc] rounded-xl p-4 mb-6 text-sm">
          <div className="flex justify-between py-1"><span className="text-[#666]">رقم الفاتورة</span><span className="font-mono font-bold">#{invoiceId}</span></div>
          <div className="flex justify-between py-1"><span className="text-[#666]">المبلغ</span><span className="font-black text-[#047857]">{amount} AED</span></div>
        </div>

        <button
          onClick={() => finish("ok")}
          className="w-full py-3 rounded-xl bg-[#047857] text-white font-bold text-sm mb-2 hover:bg-[#065f46] transition-colors"
        >
          ✓ محاكاة دفع ناجح
        </button>
        <button
          onClick={() => finish("fail")}
          className="w-full py-3 rounded-xl bg-white border border-[#e5e7eb] text-[#666] font-bold text-sm hover:bg-[#f8fafc] transition-colors"
        >
          ✕ محاكاة فشل الدفع
        </button>
      </div>
    </div>
  );
}

export default function MockCheckoutPage() {
  return (
    <Suspense fallback={null}>
      <MockCheckoutInner />
    </Suspense>
  );
}
