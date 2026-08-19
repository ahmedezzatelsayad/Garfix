/**
 * RecoveryCodesBanner.tsx — SEC-07 / Phase 0 T3
 *
 * Banner displayed in /settings for admin/founder accounts that haven't
 * regenerated their MFA recovery codes after the 128-bit entropy upgrade.
 *
 * The banner checks the user's MFA recovery codes format:
 *   - Old format (32-bit, 8 hex chars): XXXX-XXXX → show banner
 *   - New format (128-bit, 32 hex chars): XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX → hide banner
 *
 * Also checks a `recoveryCodesRegeneratedAt` timestamp if present.
 */

"use client";

import { useState, useEffect } from "react";
import { ShieldAlert, X, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface RecoveryCodesBannerState {
  show: boolean;
  loading: boolean;
  lastRegeneratedAt: string | null;
}

export function RecoveryCodesBanner() {
  const [state, setState] = useState<RecoveryCodesBannerState>({
    show: false,
    loading: true,
    lastRegeneratedAt: null,
  });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkRecoveryCodes() {
      try {
        // Call the MFA status endpoint to check if recovery codes need regeneration
        const res = await fetch("/api/auth/mfa/status", {
          method: "GET",
          credentials: "same-origin",
        });
        if (!res.ok) {
          setState({ show: false, loading: false, lastRegeneratedAt: null });
          return;
        }
        const data = await res.json();
        if (cancelled) return;

        // Show banner if:
        //   - User has MFA enabled
        //   - Recovery codes exist
        //   - Recovery codes are in the OLD format (32-bit, 8 hex chars per code)
        //   - OR recoveryCodesRegeneratedAt is null (never regenerated post-upgrade)
        const needsRegen = data.mfaEnabled === true &&
          data.recoveryCodesCount > 0 &&
          (data.recoveryCodesNeedRegeneration === true ||
           (data.recoveryCodesRegeneratedAt === null && data.isAdmin === true));

        setState({
          show: needsRegen,
          loading: false,
          lastRegeneratedAt: data.recoveryCodesRegeneratedAt ?? null,
        });
      } catch {
        if (!cancelled) {
          setState({ show: false, loading: false, lastRegeneratedAt: null });
        }
      }
    }

    checkRecoveryCodes();
    return () => { cancelled = true; };
  }, []);

  if (state.loading || !state.show || dismissed) {
    return null;
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        "relative rounded-xl border border-amber-500/30 bg-cardmber-500/10 p-4 sm:p-5",
        "flex items-start gap-3 sm:gap-4",
      )}
    >
      <div className="flex-shrink-0 p-2 rounded-lg bg-cardmber-500/20">
        <ShieldAlert className="text-amber-600 dark:text-amber-400" size={20} />
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200 mb-1">
          إجراء أمني مطلوب: إعادة توليد رموز الاستعادة
        </h3>
        <p className="text-xs sm:text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
          تم ترقية نظام المصادقة الثنائية (MFA) لاستخدام رموز استعادة أقوى
          (128-bit بدلاً من 32-bit). يجب عليك إعادة توليد رموز الاستعادة الخاصة
          بك لضمان أمان حسابك. الرموز القديمة ستصبح غير صالحة بعد التوليد.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href="/settings#mfa"
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold",
              "bg-cardmber-600 hover:bg-cardmber-700 text-white transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2",
            )}
          >
            <RefreshCw size={14} />
            إعادة توليد الرموز
          </a>
          <button
            onClick={() => setDismissed(true)}
            className={cn(
              "inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold",
              "bg-transparent hover:bg-cardmber-500/10 text-amber-700 dark:text-amber-300 transition-colors",
            )}
            aria-label="إغلاق التنبيه"
          >
            <X size={14} />
            لاحقاً
          </button>
        </div>
      </div>
    </div>
  );
}
