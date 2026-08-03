/**
 * Web Vitals Monitoring — Performance Tracking
 *
 * ════════════════════════════════════════════════════════════════════════
 * مراقبة مقاييس أداء الويب الأساسية (Core Web Vitals)
 * 
 * يتتبع:
 * - CLS (Cumulative Layout Shift): استقرار التصميم البصري
 * - FID (First Input Delay): استجابة التفاعل
 * - FCP (First Contentful Paint): أول محتوى مرئي
 * - LCP (Largest Contentful Paint): أكبر محتوى مرئي
 * - TTFB (Time to First Byte): وقت الاستجابة الأولي
 * - INP (Interaction to Next Paint): استجابة التفاعل (بديل FID)
 * 
 * الاستخدام:
 * ```tsx
 * import { reportWebVitals } from '@/lib/web-vitals'
 * 
 * // في layout.tsx أو _app.tsx
 * reportWebVitals(console.log)
 * // أو
 * reportWebVitals(sendToAnalytics)
 * ```
 * ════════════════════════════════════════════════════════════════════════
 */

// Types for web-vitals library
interface Metric {
  /** اسم المقياس (e.g., "LCP", "FID", "CLS", etc.) */
  name: string;
  /** القيمة الرقمية (بالمللي ثانية أو كسر) */
  value: number;
  /** معرف فريد للعينة */
  id: string;
  /** نوع التنقل */
  navigationType?: string;
  /** توقيت بدء المقياس */
  startTime?: number;
  /** معلومات إضافية خاصة بكل مقياس */
  entries?: PerformanceEntry[];
  /** تصنيف المقياس ("good" | "needs-improvement" | "poor") */
  rating?: string;
  /** عنوان URL للصفحة (لتعدد الصفحات) */
  attribution?: Record<string, unknown>;
  /** إصدار مكتبة web-vitals */
  metricVersion?: number;
}

type ReportCallback = (metric: Metric) => void;

// ════════════════════════════════════════════════════════════════════════
// THRESHOLDS — عتبات تقييم الأداء
// ════════════════════════════════════════════════════════════════════════

export const VITAL_THRESHOLDS: Record<string, { good: number; poor: number }> = {
  // LCP: should occur within 2.5s of when the page first starts loading
  LCP: { good: 2500, poor: 4000 },
  // FID: should occur within 100ms of interaction
  FID: { good: 100, poor: 300 },
  // INP: should occur within 200ms of interaction (replaces FID in 2024)
  INP: { good: 200, poor: 500 },
  // CLS: should be less than 0.1
  CLS: { good: 0.1, poor: 0.25 },
  // FCP: should occur within 1.8s
  FCP: { good: 1800, poor: 3000},
  // TTFB: should occur within 800ms
  TTFB: { good: 800, poor: 1800 },
};

// ════════════════════════════════════════════════════════════════════════
// RATING HELPER — تصنيف المقياس
// ════════════════════════════════════════════════════════════════════════

function getRating(metricName: string, value: number): string {
  const threshold = VITAL_THRESHOLDS[metricName];
  if (!threshold) return "unknown";
  
  if (value <= threshold.good) return "good";
  if (value <= threshold.poor) return "needs-improvement";
  return "poor";
}

// ════════════════════════════════════════════════════════════════════════
// ARABIC LABELS — تسميات عربية للمقاييس
// ════════════════════════════════════════════════════════════════════════

const ARABIC_LABELS: Record<string, string> = {
  LCP: "أكبر رسمة محتوى",
  FID: "تأخير الإدخال الأول",
  INP: "التفاعل إلى الرسمة التالية",
  CLS: "التحول التراكمي للتخطيط",
  FCP: "أول رسمة محتوى",
  TTFB: "وقت البايت الأول",
};

const RATING_LABELS: Record<string, string> = {
  good: "ممتاز ✓",
  "needs-improvement": "يحتاج تحسين ⚠",
  poor: "ضعيف ✗",
  unknown: "غير معروف ?",
};

// ════════════════════════════════════════════════════════════════════════
// CORE FUNCTION — تفعيل المراقبة
// ════════════════════════════════════════════════════════════════════════

/**
 * تفعيل مراقبة Core Web Vitals
 * 
 * @param onPerfEntry دالة رد الاتصال لكل مقياس
 * @param options خيارات إضافية
 * @param options.reportAll سواء الإبلاغ عن جميع المقاييس أم فقط الأساسية
 * @param options.logToConsole طباعة النتائج في وحدة التحكم
 */
export function reportWebVitals(
  onPerfEntry?: ReportCallback,
  options?: {
    reportAll?: boolean;
    logToConsole?: boolean;
  }
): void {
  // Skip during SSR and in non-browser environments
  if (typeof document === "undefined") return;

  const { reportAll = false, logToConsole = true } = options ?? {};

  /**
   * المعالج الرئيسي للمقاييس
   * يضيف التصنيف والبيانات الإضافية قبل الإرسال
   */
  const handleMetric = (metric: Metric): void => {
    // Add rating to the metric object
    const rating = getRating(metric.name, metric.value);
    const enhancedMetric = {
      ...metric,
      rating,
      url: typeof window !== "undefined" ? window.location.href : undefined,
      timestamp: Date.now(),
    };

    // Log to console in development or when enabled
    if (logToConsole || process.env.NODE_ENV === "development") {
      const label = ARABIC_LABELS[metric.name] || metric.name;
      const ratingLabel = RATING_LABELS[rating] || rating;
      const unit = ["CLS"].includes(metric.name) ? "" : "ms";
      
      console.log(
        `%c[Web Vital]%c ${label}: %c${metric.value}${unit} %c${ratingLabel}`,
        "color: #8b5cf6; font-weight: bold;",
        "color: #6b7280;",
        `color: ${rating === "good" ? "#10b981" : rating === "needs-improvement" ? "#f59e0b" : "#ef4444"}; font-weight: bold;`,
        `color: ${rating === "good" ? "#10b981" : rating === "needs-improvement" ? "#f59e0b" : "#ef4444"};`,
        "color: #9ca3af;"
      );
    }

    // Call the user's callback
    onPerfEntry?.(enhancedMetric);

    // In production, you can send to your analytics endpoint
    if (process.env.NODE_ENV === "production") {
      sendToAnalytics(enhancedMetric).catch(() => {
        // Silently fail analytics reporting
      });
    }
  };

  // Dynamic import of web-vitals for code splitting
  // This ensures the library is only loaded when needed
  import("web-vitals").then(({ onCLS, onFID, onFCP, onLCP, onTTFB, onINP }) => {
    // Core Web Vitals (always reported)
    onCLS(handleMetric);
    onFID(handleMetric);
    onFCP(handleMetric);
    onLCP(handleMetric);
    onTTFB(handleMetric);

    // Additional metrics (optional)
    if (reportAll) {
      try {
        onINP?.(handleMetric);
      } catch {
        // INP might not be available in older versions
      }
    }
  }).catch(() => {
    console.warn("[Web Vitals] Failed to load web-vitals library");
  });
}

// ════════════════════════════════════════════════════════════════════════
// ANALYTICS SENDING — إرسال البيانات للتحليلات
// ════════════════════════════════════════════════════════════════════════

/**
 * إرسال بيانات الأداء لنقطة نهاية التحليلات
 * 
 * @note عدّل هذه الدالة لتتوافق مع نظام التحليلات الخاص بك
 * (Google Analytics, Mixpanel, PostHog, custom endpoint, etc.)
 */
async function sendToAnalytics(metric: Metric): Promise<void> {
  const ANALYTICS_ENDPOINT = "/api/analytics/vitals";
  
  // Check if beacon API is available (more reliable for page unload)
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    const payload = new Blob(
      [JSON.stringify(metric)],
      { type: "application/json" }
    );
    
    navigator.sendBeacon(ANALYTICS_ENDPOINT, payload);
    return;
  }

  // Fallback to fetch
  try {
    await fetch(ANALYTICS_ENDPOINT, {
      method: "POST",
      body: JSON.stringify(metric),
      headers: { "Content-Type": "application/json" },
      keepalive: true,
    });
  } catch {
    // Silently fail - don't break the app for analytics errors
  }
}

// ════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS — دوال مساعدة
// ════════════════════════════════════════════════════════════════════════

/**
 * الحصول على ملخص الأداء الحالي
 * مفيد لعرض حالة الأداء في لوحة المطور
 */
export function getPerformanceSummary(): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve({ error: "Not available in SSR" });
      return;
    }

    const summary: Record<string, unknown> = {};
    let pending = 5; // CLS, FID, FCP, LCP, TTFB

    const checkComplete = () => {
      pending--;
      if (pending <= 0) {
        resolve(summary);
      }
    };

    import("web-vitals").then(({ onCLS, onFID, onFCP, onLCP, onTTFB }) => {
      onCLS((m) => { summary.CLS = m.value; checkComplete(); });
      onFID((m) => { summary.FID = m.value; checkComplete(); });
      onFCP((m) => { summary.FCP = m.value; checkComplete(); });
      onLCP((m) => { summary.LCP = m.value; checkComplete(); });
      onTTFB((m) => { summary.TTFB = m.value; checkComplete(); });

      // Timeout after 10 seconds
      setTimeout(() => resolve(summary), 10000);
    }).catch(() => resolve({ error: "Failed to load web-vitals" }));
  });
}

/**
 * التحقق مما إذا كان الأداء جيداً بشكل عام
 * مفيد لعرض شارة الأداء في واجهة المستخدم
 */
export function isPerformanceGood(metrics: Partial<Record<string, number>>): boolean {
  const coreMetrics = ["LCP", "FID", "CLS"] as const;
  
  for (const metric of coreMetrics) {
    const value = metrics[metric];
    if (value === undefined) continue;
    
    const threshold = VITAL_THRESHOLDS[metric];
    if (!threshold) continue;
    
    if (value > threshold.poor) return false;
  }
  
  return true;
}

// Default export for convenience
export default reportWebVitals;
