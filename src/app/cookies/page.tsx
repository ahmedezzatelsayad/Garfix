"use client";

import { useState } from "react";
import { Shield } from "lucide-react";
import { FooterPageLayout } from "@/components/garfix/FooterPageLayout";

const COOKIE_CATEGORIES = [
  {
    id: "essential",
    title: "ملفات تعريف الارتباط الأساسية",
    description: "ضرورية لتشغيل المنصة بشكل صحيح. لا يمكن تعطيلها لأنها تؤثر في الوظائف الأساسية مثل تسجيل الدخول والأمان وإدارة الجلسات. تشمل ملفات تعريف الارتباط الخاصة بالمصادقة وتوازن الحمل وتفضيلات اللغة.",
    required: true,
  },
  {
    id: "functional",
    title: "ملفات تعريف الارتباط الوظيفية",
    description: "تتيح وظائف محسّنة مثل تذكر تفضيلاتك واختياراتك السابقة وتخصيص واجهة المستخدم. تساعد في تقديم تجربة استخدام مُحسّنة دون التأثير على الأداء الأساسي للمنصة.",
    required: false,
  },
  {
    id: "analytics",
    title: "ملفات تعريف الارتباط التحليلية",
    description: "تساعدنا في فهم كيفية تفاعل الزوار مع المنصة من خلال جمع معلومات مجمعة وغير محددة شخصياً. نستخدم هذه البيانات حصرياً لتحسين أداء المنصة وتجربة المستخدم وتطوير ميزات جديدة.",
    required: false,
  },
  {
    id: "marketing",
    title: "ملفات تعريف الارتباط التسويقية",
    description: "قد تُستخدم لتتبع زياراتك عبر المنصة لعرض محتوى وإعلانات ذات صلة. عادةً لا نجمع بيانات تسويقية إلا بموافقتك الصريحة. يمكنك تعطيل هذا النوع دون التأثير على تجربتك الأساسية.",
    required: false,
  },
];

export default function CookiesPage() {
  const [preferences, setPreferences] = useState<Record<string, boolean>>({
    essential: true,
    functional: true,
    analytics: true,
    marketing: false,
  });

  const toggleCookie = (id: string) => {
    if (id === "essential") return;
    setPreferences((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const acceptAll = () => {
    setPreferences({ essential: true, functional: true, analytics: true, marketing: true });
  };

  const savePreferences = () => {
    // In a real app, this would save to localStorage or a cookie
    if (typeof window !== "undefined") {
      localStorage.setItem("garfix-cookie-preferences", JSON.stringify(preferences));
    }
  };

  return (
    <FooterPageLayout
      title="إدارة ملفات تعريف الارتباط"
      subtitle="تحكّم في أنواع ملفات تعريف الارتباط المستخدمة على منصة GARFIX"
      icon={<Shield size={28} />}
      lastUpdated="يوليو 2025"
    >
      <div className="space-y-8 text-white/80 text-[15px] leading-[1.9]">
        <section>
          <h2 className="text-xl font-extrabold text-white mb-3">ما هي ملفات تعريف الارتباط؟</h2>
          <p>
            ملفات تعريف الارتباط (Cookies) هي ملفات نصية صغيرة تُخزّن على جهازك عند زيارة موقع إلكتروني.
            تُستخدم هذه الملفات لتمكين وظائف أساسية وتحسين تجربتك وتقديم محتوى مخصص. في GARFIX،
            نستخدم ملفات تعريف الارتباط بمسؤولية وشفافية كاملة، ونمنحك التحكم الكامل في تفضيلاتك.
            يمكنك تعديل تفضيلاتك في أي وقت دون التأثير على قدرتك على استخدام المنصة.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-extrabold text-white mb-3">أنواع ملفات تعريف الارتباط</h2>
          <div className="space-y-4">
            {COOKIE_CATEGORIES.map((cat) => (
              <div
                key={cat.id}
                className="bg-white/[0.03] rounded-xl p-5 border border-white/[0.06] flex gap-4 items-start"
              >
                <button
                  onClick={() => toggleCookie(cat.id)}
                  className={`mt-1 w-10 h-6 rounded-full shrink-0 transition-all relative ${
                    preferences[cat.id]
                      ? "bg-[linear-gradient(135deg,#7c3aed,#a78bfa)]"
                      : "bg-white/10"
                  } ${cat.required ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
                  disabled={cat.required}
                  aria-label={`تفعيل ${cat.title}`}
                >
                  <div
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                      preferences[cat.id] ? "start-[18px]" : "start-[2px]"
                    }`}
                  />
                </button>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-white text-sm">{cat.title}</h3>
                    {cat.required && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[rgba(124,58,237,0.2)] text-[#c4b5fd] font-bold">
                        مطلوبة
                      </span>
                    )}
                  </div>
                  <p className="text-white/60 text-[13px] leading-relaxed">{cat.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-extrabold text-white mb-3">ملفات تعريف الارتباط التي نستخدمها</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-right py-3 px-3 text-white/90 font-bold">الاسم</th>
                  <th className="text-right py-3 px-3 text-white/90 font-bold">النوع</th>
                  <th className="text-right py-3 px-3 text-white/90 font-bold">الغرض</th>
                  <th className="text-right py-3 px-3 text-white/90 font-bold">المدة</th>
                </tr>
              </thead>
              <tbody className="text-white/60">
                <tr className="border-b border-white/[0.04]">
                  <td className="py-2.5 px-3 font-mono text-xs">garfix_session</td>
                  <td className="py-2.5 px-3">أساسي</td>
                  <td className="py-2.5 px-3">إدارة جلسة المستخدم والمصادقة</td>
                  <td className="py-2.5 px-3">جلسة واحدة</td>
                </tr>
                <tr className="border-b border-white/[0.04]">
                  <td className="py-2.5 px-3 font-mono text-xs">garfix_token</td>
                  <td className="py-2.5 px-3">أساسي</td>
                  <td className="py-2.5 px-3">رمز المصادقة للوصول الآمن</td>
                  <td className="py-2.5 px-3">7 أيام</td>
                </tr>
                <tr className="border-b border-white/[0.04]">
                  <td className="py-2.5 px-3 font-mono text-xs">garfix_lang</td>
                  <td className="py-2.5 px-3">وظيفي</td>
                  <td className="py-2.5 px-3">تذكر لغة الواجهة المفضلة</td>
                  <td className="py-2.5 px-3">سنة واحدة</td>
                </tr>
                <tr className="border-b border-white/[0.04]">
                  <td className="py-2.5 px-3 font-mono text-xs">garfix_theme</td>
                  <td className="py-2.5 px-3">وظيفي</td>
                  <td className="py-2.5 px-3">تذكر تفضيل المظهر (فاتح/داكن)</td>
                  <td className="py-2.5 px-3">سنة واحدة</td>
                </tr>
                <tr className="border-b border-white/[0.04]">
                  <td className="py-2.5 px-3 font-mono text-xs">_ga</td>
                  <td className="py-2.5 px-3">تحليلي</td>
                  <td className="py-2.5 px-3">تحليلات Google Analytics المجمعة</td>
                  <td className="py-2.5 px-3">سنتان</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-extrabold text-white mb-3">كيفية التحكم في ملفات تعريف الارتباط</h2>
          <p>
            يمكنك التحكم في ملفات تعريف الارتباط بعدة طرق: استخدام أداة التفضيلات أعلاه لتخصيص
            أنواع ملفات تعريف الارتباط المسموح بها، أو تعديل إعدادات المتصفح لحظر أو حذف ملفات
            تعريف الارتباط. يرجى ملاحظة أن تعطيل ملفات تعريف الارتباط الأساسية قد يؤثر على
            وظائف المنصة بشكل كبير. يمكنك أيضاً حذف ملفات تعريف الارتباط الموجودة من إعدادات
            المتصفح في أي وقت.
          </p>
        </section>

        {/* أزرار التحكم */}
        <div className="flex flex-wrap gap-3 pt-4 border-t border-white/[0.08]">
          <button
            onClick={acceptAll}
            className="px-6 py-3 rounded-lg bg-[linear-gradient(135deg,#7c3aed,#a78bfa)] text-white font-bold text-sm cursor-pointer transition-all hover:shadow-[0_4px_12px_rgba(124,58,237,0.3)]"
          >
            قبول الكل
          </button>
          <button
            onClick={savePreferences}
            className="px-6 py-3 rounded-lg bg-white/10 text-white font-bold text-sm cursor-pointer transition-all hover:bg-white/15"
          >
            حفظ التفضيلات
          </button>
        </div>
      </div>
    </FooterPageLayout>
  );
}
