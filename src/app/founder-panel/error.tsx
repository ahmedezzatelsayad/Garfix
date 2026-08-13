"use client";
import { useEffect } from "react";
import { logger } from "@/lib/logger";

export default function FounderPanelError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("[founder-panel] page error", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <div className="min-h-dvh flex items-center justify-center bg-[#0b1220] p-6" dir="rtl">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="mx-auto h-16 w-16 rounded-full bg-red-500/20 flex items-center justify-center">
          <span className="text-2xl">⚠️</span>
        </div>
        <h2 className="text-xl font-bold text-foreground">خطأ في لوحة المؤسس</h2>
        <p className="text-sm text-muted-foreground">{error.message || "تعذّر تحميل لوحة المؤسس"}</p>
        <button
          onClick={reset}
          className="rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2.5 text-sm font-bold transition-all"
        >
          إعادة المحاولة
        </button>
      </div>
    </div>
  );
}
