"use client";

/**
 * /features — صفحة المميزات الكاملة (موقع خارجي متعدد الصفحات).
 *
 * تنظيم المميزات في 6 مجموعات وظيفية تغطي كل وحدات المنصة الـ 18:
 * الفوترة والفوترة الإلكترونية، المحاسبة، الذكاء الاصطناعي، المخزون
 * والمشتريات، الموارد البشرية، والأتمتة والتقارير والأمان.
 */

import Link from "next/link";
import {
  FileText, Calculator, BrainCircuit, Boxes, UserCog,
  ShieldCheck, ArrowLeft, Check, Globe, Bot,
  Receipt, Landmark, Sparkles, Workflow,
} from "lucide-react";
import { PublicSiteHeader } from "@/components/site/PublicSiteHeader";
import { ProfessionalFooter } from "@/components/garfix/ProfessionalFooter";

const FEATURE_GROUPS = [
  {
    icon: <FileText size={22} />,
    title: "الفوترة والفوترة الإلكترونية",
    accent: "from-emerald-500 to-teal-600",
    items: [
      { name: "فواتير احترافية", desc: "إنشاء فواتير بأقاليم متعددة (عصري/كلاسيكي/مبسط) مع شعارك وألوانك." },
      { name: "فوترة إلكترونية معتمدة", desc: "تكامل مباشر مع ZATCA (السعودية)، ETA (مصر)، FTA (الإمارات)، NBR (البحرين)." },
      { name: "فاتورة QR وTLV", desc: "توليد رمز QR متوافق مع المتطلبات التنظيمية تلقائياً لكل فاتورة." },
      { name: "فواتير متكررة ودفعات جزئية", desc: "جدولة فواتير دورية وتسجيل دفعات جزئية مع تتبع الأرصدة." },
      { name: "عروض أسعار", desc: "حوّل عرض السعر إلى فاتورة بضغطة واحدة." },
      { name: "متعدد العملات", desc: "عملة شركة مستقلة لكل شركة مع منازل عشرية صحيحة (KWD=3 وغيرها=2)." },
    ],
  },
  {
    icon: <Calculator size={22} />,
    title: "المحاسبة المتكاملة",
    accent: "from-amber-500 to-orange-600",
    items: [
      { name: "شجرة حسابات ذكية", desc: "قوالب جاهزة لكل نوع نشاط (تجاري/خدمي/صناعي) تتولد تلقائياً عند الإعداد." },
      { name: "قيود يومية تلقائية", desc: "كل فاتورة أو سند يولّد قيده المحاسبي المتوازن تلقائياً." },
      { name: "ميزان المراجعة والقوائم", desc: "ميزان مراجعة، قائمة الدخل، المركز المالي لحظياً." },
      { name: "إقفال السنة المالية", desc: "فترات مالية محكمة تمنع التعديل بعد الإقفال." },
      { name: "أصول ثابتة وإهلاك", desc: "سجل أصول مع إهلاك خطي/متناقص واحتساب تلقائي شهري." },
      { name: "بنوك وذمم", desc: "تسوية بنكية، ذمم مدينة/دائنة، وخطابات اعتماد." },
    ],
  },
  {
    icon: <BrainCircuit size={22} />,
    title: "الذكاء الاصطناعي (GarfiX AI)",
    accent: "from-violet-500 to-purple-600",
    items: [
      { name: "إدخال مجمع بالذكاء", desc: "الصق نص طلبات واتساب أو ارفع صورة فاتورة — يستخرج الطلبات وينشئ الفواتير." },
      { name: "مساعد محادثة ينفّذ", desc: "مساعد يفهم أوامرك وينفذها فعلياً: أنشئ فاتورة، سجّل دفعة، اعرض مديونية عميل." },
      { name: "مطابقة منتجات متعلمة", desc: "محرك تعلم آلي يطابق أسماء المنتجات بالكتالوج ويتحسن مع الاستخدام." },
      { name: "وكلاء متخصصون", desc: "وكيل محاسبة ووكيل مبيعات ووكيل مخزون — كلٌ في نطاقه." },
      { name: "تعلّم القوالب", desc: "يحفظ قالب كل مورد ويستخرج فواتيره لاحقاً بدون استدعاءات AI مدفوعة." },
      { name: "خصوصية أولاً", desc: "إخفاء بيانات شخصية (PII Redaction) قبل أي استدعاء خارجي." },
    ],
  },
  {
    icon: <Boxes size={22} />,
    title: "المخزون والمشتريات",
    accent: "from-blue-500 to-cyan-600",
    items: [
      { name: "مستودعات متعددة", desc: "فروع ومستودعات منفصلة مع تحويلات بينها وسجل حركة كامل." },
      { name: "منع البيع الزائد", desc: "حجز الكميات لحظياً وطابور مراجعة لأي صنف تجاوز المتاح." },
      { name: "تكلفة المخزون", desc: "متوسط مرجح/FIFO مع تقييم مخزون لحظي." },
      { name: "فواتير مشتريات", desc: "تسجيل مشتريات الموردين وربطها بالحسابات والمخزون." },
      { name: "كتالوج منتجات", desc: "باركود، وحدات، أسعار بيع وشراء، وحد أدنى للتنبيه." },
      { name: "تنبيهات نقص", desc: "إشعارات عند هبوط المخزون تحت الحد الأدنى." },
    ],
  },
  {
    icon: <UserCog size={22} />,
    title: "الموارد البشرية",
    accent: "from-rose-500 to-pink-600",
    items: [
      { name: "ملفات موظفين", desc: "بيانات كاملة، عقود، ووثائق مع صلاحيات وصول محكمة." },
      { name: "حضور وانصراف", desc: "تسجيل يومي وإجازات مع أرصدة." },
      { name: "رواتب وبدلات", desc: "مسير رواتب بعملة الشركة مع بدلات وخصومات ومكافآت." },
      { name: "عمولات مبيعات", desc: "احتساب عمولات تلقائي من الفواتير المحصلة." },
      { name: "تقييم أداء", desc: "مؤشرات KPI دورية لكل موظف." },
      { name: "مكافأة نهاية الخدمة", desc: "حاسبة مكافأة وفق أنظمة دول الخليج." },
    ],
  },
  {
    icon: <Workflow size={22} />,
    title: "الأتمتة والتقارير والأمان",
    accent: "from-slate-500 to-slate-700",
    items: [
      { name: "قواعد أتمتة", desc: "شروط وأحداث: فاتورة متأخرة؟ أرسل تذكيراً واتساب تلقائياً." },
      { name: "تقارير لحظية", desc: "إيرادات، أرباح، تدفق نقدي، وأفضل العملاء مع رسوم بيانية." },
      { name: "أدوار وصلاحيات دقيقة", desc: "تحكم لكل مستخدم في كل إجراء مع سجل تدقيق كامل." },
      { name: "عزل بيانات الشركات", desc: "RLB على مستوى قاعدة البيانات + فحوصات عزل مستمرة." },
      { name: "تشفير ومصادقة ثنائية", desc: "AES-256-GCM ومصادقة TOTP مع رموز استرجاع." },
      { name: "PWA يعمل أوفلاين", desc: "ثبّته كتطبيق على موبايلك ويعمل حتى بدون اتصال." },
    ],
  },
];

const HIGHLIGHT_STATS = [
  { icon: <Globe size={18} />, value: "+20", label: "دولة مدعومة" },
  { icon: <Receipt size={18} />, value: "6", label: "هيئات فوترة إلكترونية" },
  { icon: <Bot size={18} />, value: "18", label: "وحدة متكاملة" },
  { icon: <ShieldCheck size={18} />, value: "AAA", label: "توافق WCAG للألوان" },
];

export default function FeaturesPage() {
  return (
    <div dir="rtl" className="min-h-dvh bg-background text-foreground">
      <PublicSiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden py-16 md:py-20 px-[5%] text-center">
        <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(4,120,87,0.07),transparent_55%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(4,120,87,0.14),transparent_55%)] pointer-events-none" />
        <div className="relative max-w-[760px] mx-auto">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 dark:text-emerald-400 mb-5">
            <Sparkles size={26} />
          </div>
          <h1 className="text-[clamp(28px,5vw,46px)] font-black mb-4 leading-tight">
            كل ما تحتاجه إدارة أعمالك
            <span className="landing-section-title"> في منصة واحدة</span>
          </h1>
          <p className="text-muted-foreground text-base md:text-lg leading-relaxed mb-8">
            من الفاتورة الأولى حتى القوائم المالية — 18 وحدة متكاملة تعمل معاً بسلاسة،
            مدعومة بالذكاء الاصطناعي، ومصممة للشركات العربية أولاً.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 bg-[linear-gradient(135deg,#047857,#10b981)] text-white border-none rounded-lg px-7 py-3 text-sm font-extrabold no-underline shadow-[0_10px_28px_rgba(4,120,87,0.4)] hover:shadow-[0_14px_36px_rgba(4,120,87,0.5)] active-press"
            >
              ابدأ تجربة 30 يوماً مجاناً <ArrowLeft size={16} />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 bg-transparent text-foreground border border-border rounded-lg px-7 py-3 text-sm font-bold no-underline hover:bg-muted"
            >
              استعرض الأسعار
            </Link>
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <section className="px-[5%] pb-6">
        <div className="max-w-[900px] mx-auto grid grid-cols-2 md:grid-cols-4 gap-3">
          {HIGHLIGHT_STATS.map((s) => (
            <div key={s.label} className="landing-card rounded-xl p-4 flex flex-col items-center gap-1.5 text-center">
              <span className="text-emerald-500 dark:text-emerald-400">{s.icon}</span>
              <span className="text-xl font-black text-foreground">{s.value}</span>
              <span className="text-[11px] text-muted-foreground font-semibold">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Feature groups */}
      <main className="px-[5%] py-10 md:py-14 max-w-[1200px] mx-auto">
        {FEATURE_GROUPS.map((group) => (
          <section key={group.title} className="mb-14 last:mb-0">
            <div className="flex items-center gap-3 mb-6">
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${group.accent} text-white flex items-center justify-center shadow-sm`}>
                {group.icon}
              </div>
              <div>
                <h2 className="text-xl md:text-2xl font-black text-foreground">{group.title}</h2>
                <div className={`h-1 w-16 rounded-full bg-gradient-to-l ${group.accent} mt-1`} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {group.items.map((item) => (
                <div key={item.name} className="landing-card rounded-xl p-5 hover-lift">
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 text-emerald-500 dark:text-emerald-400 shrink-0">
                      <Check size={16} />
                    </span>
                    <div>
                      <h3 className="text-[14.5px] font-extrabold text-foreground mb-1">{item.name}</h3>
                      <p className="text-[12.5px] text-muted-foreground leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}

        {/* Bottom CTA */}
        <section className="mt-4 rounded-2xl bg-[linear-gradient(135deg,rgba(4,120,87,0.12),rgba(16,185,129,0.07))] dark:bg-[linear-gradient(135deg,rgba(4,120,87,0.28),rgba(16,185,129,0.12))] border border-emerald-500/25 p-8 md:p-12 text-center">
          <Landmark size={34} className="text-emerald-500 dark:text-emerald-400 mx-auto mb-4" />
          <h2 className="text-xl md:text-2xl font-black mb-3 text-foreground">جاهز تنقل أعمالك لمستوى آخر؟</h2>
          <p className="text-muted-foreground text-sm md:text-base max-w-[520px] mx-auto mb-6 leading-relaxed">
            أنشئ شركتك في أقل من 5 دقائق — معالج إعداد ذكي يجهز لك شجرة الحسابات والعملة والقالب والضريبة حسب دولتك.
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 bg-[linear-gradient(135deg,#047857,#10b981)] text-white border-none rounded-lg px-8 py-3.5 text-sm font-extrabold no-underline shadow-[0_10px_28px_rgba(4,120,87,0.4)] active-press"
          >
            ابدأ الآن مجاناً <ArrowLeft size={16} />
          </Link>
        </section>
      </main>

      <ProfessionalFooter variant="landing" />
    </div>
  );
}
