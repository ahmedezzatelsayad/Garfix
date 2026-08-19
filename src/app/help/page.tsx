// FE-04 FIX (Audit v2 · Phase 1) — text-foreground/40 → text-muted-foreground (WCAG AAA
// large-text contrast ≥4.5:1 on #0b1220 navy background).

import { HelpCircle, Search, MessageCircle, BookOpen, Settings, CreditCard, Users, BarChart3, Shield, Zap } from "lucide-react";
import { FooterPageLayout } from "@/components/garfix/FooterPageLayout";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "مركز المساعدة · GarfiX",
  description: "مركز المساعدة لمنصة GarfiX EOS — دليل البدء، إدارة الفواتير والعملاء، التقارير المالية، الأمان، ومساعد الذكاء الاصطناعي.",
};

const HELP_CATEGORIES = [
  {
    icon: <Settings size={22} />,
    title: "البدء مع GARFIX",
    articles: [
      { title: "كيفية إنشاء حساب جديد", desc: "خطوات التسجيل وإعداد حسابك الأول" },
      { title: "إعداد الشركة الأولى", desc: "إنشاء ملف الشركة وإدخال البيانات الأساسية" },
      { title: "دليل الإعداد المبدئي", desc: "معالج الإعداد خطوة بخطوة" },
    ],
  },
  {
    icon: <CreditCard size={22} />,
    title: "الفواتير والمدفوعات",
    articles: [
      { title: "إنشاء فاتورة جديدة", desc: "كيفية إنشاء وإرسال فواتير احترافية" },
      { title: "تتبع المدفوعات", desc: "متابعة حالة المدفوعات والمبالغ المستحقة" },
      { title: "الضرائب والخصومات", desc: "إعداد الضرائب وتطبيق الخصومات" },
    ],
  },
  {
    icon: <Users size={22} />,
    title: "العملاء والموردون",
    articles: [
      { title: "إدارة قاعدة العملاء", desc: "إضافة وتصنيف العملاء وتتبع تاريخهم" },
      { title: "إدارة الموردين", desc: "تسجيل الموردين وتتبع المشتريات" },
      { title: "استيراد البيانات", desc: "استيراد العملاء والمنتجات من ملفات Excel" },
    ],
  },
  {
    icon: <BarChart3 size={22} />,
    title: "التقارير والمحاسبة",
    articles: [
      { title: "لوحة التحكم المالية", desc: "فهم المؤشرات والرسوم البيانية" },
      { title: "دليل الحسابات", desc: "إعداد واستخدام دليل الحسابات الهرمي" },
      { title: "تقارير الأداء", desc: "إنشاء وتصدير تقارير الأعمال" },
    ],
  },
  {
    icon: <Shield size={22} />,
    title: "الأمان والصلاحيات",
    articles: [
      { title: "إدارة صلاحيات المستخدمين", desc: "تعيين الأدوار والصلاحيات بدقة" },
      { title: "سجل التدقيق", desc: "تتبع جميع العمليات والتغييرات" },
      { title: "تشفير البيانات", desc: "كيف نحمي بياناتك بأعلى المعايير" },
    ],
  },
  {
    icon: <Zap size={22} />,
    title: "مساعد الذكاء الاصطناعي",
    articles: [
      { title: "البدء مع المساعد الذكي", desc: "كيفية تفعيل واستخدام المساعد" },
      { title: "الأوامر الصوتية والنصية", desc: "قائمة الأوامر المدعومة" },
      { title: "إدخال الفواتير بالذكاء الاصطناعي", desc: "تحويل الصور والنصوص لفواتير" },
    ],
  },
];

const FAQ_ITEMS = [
  { q: "كيف أبدأ استخدام GARFIX؟", a: "سجّل حساباً مجانياً وابدأ التجربة لمدة 30 يوماً. معالج الإعداد سيُرشدك خطوة بخطوة لإعداد شركتك وإدخال بياناتك الأولى." },
  { q: "هل يمكنني إدارة أكثر من شركة؟", a: "نعم، يمكنك إضافة عدد غير محدود من الشركات من حساب واحد. كل شركة معزولة تماماً ببياناتها وإعداداتها الخاصة." },
  { q: "كيف أضيف مستخدمين جدد لشركتي؟", a: "من إعدادات الشركة، انتقل إلى قسم الفريق ثم أضف مستخدمين جدد مع تعيين الأدوار والصلاحيات المناسبة لكل مستخدم." },
  { q: "هل بياناتي آمنة؟", a: "نعم — جميع البيانات مشفرة بـ AES-256-GCM وكلمات المرور بـ bcrypt. كل شركة معزولة منطقياً عن غيرها مع نسخ احتياطية يومية مشفرة." },
  { q: "كيف أصدر فاتورة؟", a: "من قائمة الفواتير، اضغط على 'فاتورة جديدة'. أدخل بيانات العميل والمنتجات، ثم أرسلها عبر البريد الإلكتروني أو الواتساب أو حمّلها كملف PDF." },
  { q: "هل GARFIX يدعم العملات والضرائب الخليجية؟", a: "نعم، المنصة مُحسّنة لأسواق الخليج العربي وتدعم العملات المحلية والضرائب (السعودية 15%، الإمارات 5%، الكويت بدون ضريبة...) ومكافأة نهاية الخدمة." },
];

export default function HelpPage() {
  return (
    <FooterPageLayout
      title="مركز المساعدة"
      subtitle="ابحث عن إجابات لأسئلتك وتعرّف على كيفية استخدام جميع ميزات GARFIX"
      icon={<HelpCircle size={28} />}
    >
      <div className="space-y-10 text-foreground/80 text-[15px] leading-[1.9]">
        {/* بحث سريع */}
        <div className="glass-strong bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-6 text-center shadow-brand-md">
          <div className="flex items-center gap-3 max-w-[500px] mx-auto bg-muted border border-border rounded-lg px-4 py-3">
            <Search size={18} className="text-muted-foreground" />
            <input
              type="text"
              placeholder="ابحث في مركز المساعدة..."
              className="bg-transparent border-none outline-none text-foreground text-sm flex-1 placeholder:text-muted-foreground/40"
              dir="rtl"
            />
          </div>
        </div>

        {/* روابط سريعة */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: <BookOpen size={18} />, label: "دليل البدء", href: "#getting-started" },
            { icon: <MessageCircle size={18} />, label: "تواصل معنا", href: "/contact" },
            { icon: <Shield size={18} />, label: "الأمان", href: "/privacy" },
            { icon: <CreditCard size={18} />, label: "الاشتراكات", href: "/terms" },
          ].map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="flex flex-col items-center gap-2 p-4 rounded-xl glass border border-emerald-500/20 text-muted-foreground/90 hover:text-emerald-600 dark:hover:text-emerald-300 hover:bg-emerald-500/10 transition-all duration-120 hover-lift no-underline shadow-brand-sm"
            >
              <div className="text-emerald-500 dark:text-emerald-400">{link.icon}</div>
              <span className="text-xs font-bold">{link.label}</span>
            </Link>
          ))}
        </div>

        {/* أقسام المساعدة */}
        <div id="getting-started">
          <h2 className="text-xl font-extrabold text-foreground mb-5">أقسام المساعدة</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {HELP_CATEGORIES.map((cat) => (
              <div
                key={cat.title}
                className="glass rounded-xl p-5 border border-emerald-500/10 hover-lift duration-120 transition-all shadow-brand-sm"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-500 dark:text-emerald-400">
                    {cat.icon}
                  </div>
                  <h3 className="font-extrabold text-foreground text-sm">{cat.title}</h3>
                </div>
                <div className="space-y-2.5">
                  {cat.articles.map((article) => (
                    <div
                      key={article.title}
                      className="p-3 rounded-lg bg-muted/50 border border-emerald-500/10 cursor-pointer hover:bg-emerald-500/10 transition-all duration-120"
                    >
                      <div className="text-foreground/90 text-sm font-bold mb-0.5">{article.title}</div>
                      <div className="text-muted-foreground/70 text-[12px]">{article.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* الأسئلة الشائعة */}
        <div>
          <h2 className="text-xl font-extrabold text-foreground mb-5">أسئلة شائعة</h2>
          <div className="space-y-3">
            {FAQ_ITEMS.map((faq) => (
              <details
                key={faq.q}
                className="p-4 px-5 rounded-lg glass border border-emerald-500/10 cursor-pointer hover-lift duration-120 transition-all"
              >
                <summary className="text-[14px] font-bold text-foreground outline-none">{faq.q}</summary>
                <p className="text-[13px] text-muted-foreground/90 leading-relaxed mt-2.5">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>

        {/* التواصل */}
        <div className="glass-strong bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-8 text-center shadow-brand-md">
          {/* FE-13 FIX (Audit v2 · Phase 3): this CTA heading was h3 while the
              surrounding sections ("أقسام المساعدة", "أسئلة شائعة") are h2.
              Screen-reader users navigating by heading level would land here
              with no h2 ancestor above, signaling a broken document outline.
              Promoted to h2 to keep the hierarchy h1 → h2 → h3 consistent. */}
          <h2 className="font-extrabold text-foreground text-lg mb-2">لم تجد إجابتك؟</h2>
          <p className="text-muted-foreground text-sm mb-4">
            فريق الدعم الفني متاح على مدار الساعة لمساعدتك
          </p>
          <Link
            href="/contact"
            className="inline-block px-6 py-3 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 text-foreground font-bold text-sm no-underline transition-all hover:shadow-brand-md active-press duration-150 shadow-brand-sm"
          >
            تواصل مع الدعم
          </Link>
        </div>
      </div>
    </FooterPageLayout>
  );
}
