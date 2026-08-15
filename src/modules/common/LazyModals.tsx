/**
 * Dynamic Modal Components — Code Splitting for Heavy Modals
 *
 * ════════════════════════════════════════════════════════════════════════
 * مكونات Modals محمّلة ديناميكياً لتقليل حجم الحزمة الأولية
 * 
 * هذه المكونات الثقيلة تُحمّل فقط عند الحاجة (عند فتح الـ Modal)
 * مما يسرّع التحميل الأولي للتطبيق.
 * 
 * يتضمن:
 * - LazyReviewQueueModal: قائمة مراجعة التطابقات (ثقيلة)
 * 
 * الاستخدام:
 * ```tsx
 * import { LazyReviewQueueModal } from '@/modules/common/LazyModals'
 * 
 * {showModal && (
 *   <LazyReviewQueueModal
 *     companySlug={slug}
 *     onClose={() => setShowModal(false)}
 *   />
 * )}
 * ```
 * ════════════════════════════════════════════════════════════════════════
 */

import { lazy, Suspense, type ComponentType } from "react";
import { Loader2 } from "lucide-react";

// ════════════════════════════════════════════════════════════════════════
// LOADING STATES — حالات التحميل للـ Modals
// ════════════════════════════════════════════════════════════════════════

/** Simple loading state for modals */
function ModalLoading() {
  return (
    <div
      className="fixed inset-0 bg-black/60 z-[340] flex items-center justify-center p-5"
      role="status"
      aria-label="جارٍ تحميل النافذة"
    >
      <div className="bg-card text-card-foreground rounded-[14px] border border-border w-full max-w-[95vw] md:max-w-[680px] min-h-[200px] flex flex-col items-center justify-center gap-3 shadow-brand-lg glass-strong">
        <Loader2 className="size-8 animate-spin text-emerald-400 animate-pulse" />
        <span className="text-sm text-muted-foreground">جارٍ التحميل...</span>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// LAZY REVIEW QUEUE MODAL — قائمة مراجعة التطابقات
// ════════════════════════════════════════════════════════════════════════

/**
 * Props for ReviewQueueModal - re-exported for type safety
 */
export interface ReviewQueueModalProps {
  companySlug: string | null;
  onClose: () => void;
}

// Dynamically import the heavy ReviewQueueModal
const ReviewQueueModal = lazy(() =>
  import(
    /* webpackChunkName: "review-queue-modal" */
    "./ReviewQueueModal"
  ).then((module) => ({ default: module.ReviewQueueModal }))
);

/**
 * Lazy-loaded version of ReviewQueueModal
 * Only loads the modal code when it's actually shown
 */
export const LazyReviewQueueModal: ComponentType<ReviewQueueModalProps> = (props) => {
  return (
    <Suspense fallback={<ModalLoading />}>
      <ReviewQueueModal {...props} />
    </Suspense>
  );
};

// ════════════════════════════════════════════════════════════════════════
// PRELOAD FUNCTION — للتحميل المسبق عند Hover على الزر
// ════════════════════════════════════════════════════════════════════════

/**
 * Preload the ReviewQueueModal chunk
 * Call this when user hovers over the trigger button
 */
export function preloadReviewQueueModal(): void {
  // Using void to intentionally ignore the promise
  void import(
    /* webpackChunkName: "review-queue-modal" */
    "./ReviewQueueModal"
  );
}

// ════════════════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════════════════

const LazyModals = {
  LazyReviewQueueModal,
  preloadReviewQueueModal,
};

export default LazyModals;
