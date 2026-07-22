import { HelpCircle, Search, MessageCircle, BookOpen, Settings, CreditCard, Users, BarChart3, Shield, Zap } from "lucide-react";
import { FooterPageLayout } from "@/components/garfix/FooterPageLayout";
import Link from "next/link";

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
      <div className="space-y-10 text-white/80 text-[15px] leading-[1.9]">
        {/* بحث سريع */}
        <div className="bg-[rgba(124,58,237,0.08)] border border-[rgba(124,58,237,0.2)] rounded-xl p-6 text-center">
          <div className="flex items-center gap-3 max-w-[500px] mx-auto bg-white/[0.05] border border-white/[0.1] rounded-lg px-4 py-3">
            <Search size={18} className="text-white/40" />
            <input
              type="text"
              placeholder="ابحث في مركز المساعدة..."
              className="bg-transparent border-none outline-none text-white text-sm flex-1 placeholder:text-white/30"
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
              className="flex flex-col items-center gap-2 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] text-white/70 hover:text-white hover:bg-white/[0.06] transition-all no-underline"
            >
              <div className="text-[#c4b5fd]">{link.icon}</div>
              <span className="text-xs font-bold">{link.label}</span>
            </Link>
          ))}
        </div>

        {/* أقسام المساعدة */}
        <div id="getting-started">
          <h2 className="text-xl font-extrabold text-white mb-5">أقسام المساعدة</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {HELP_CATEGORIES.map((cat) => (
              <div
                key={cat.title}
                className="bg-white/[0.03] rounded-xl p-5 border border-white/[0.06]"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-[rgba(124,58,237,0.15)] flex items-center justify-center text-[#c4b5fd]">
                    {cat.icon}
                  </div>
                  <h3 className="font-extrabold text-white text-sm">{cat.title}</h3>
                </div>
                <div className="space-y-2.5">
                  {cat.articles.map((article) => (
                    <div
                      key={article.title}
                      className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] cursor-pointer hover:bg-white/[0.05] transition-all"
                    >
                      <div className="text-white/90 text-sm font-bold mb-0.5">{article.title}</div>
                      <div className="text-white/50 text-[12px]">{article.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* الأسئلة الشائعة */}
        <div>
          <h2 className="text-xl font-extrabold text-white mb-5">أسئلة شائعة</h2>
          <div className="space-y-3">
            {FAQ_ITEMS.map((faq) => (
              <details
                key={faq.q}
                className="p-4 px-5 rounded-lg bg-white/[0.03] border border-white/[0.06] cursor-pointer"
              >
                <summary className="text-[14px] font-bold text-white outline-none">{faq.q}</summary>
                <p className="text-[13px] text-white/70 leading-relaxed mt-2.5">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>

        {/* التواصل */}
        <div className="bg-[rgba(124,58,237,0.08)] border border-[rgba(124,58,237,0.2)] rounded-xl p-8 text-center">
          <h3 className="font-extrabold text-white text-lg mb-2">لم تجد إجابتك؟</h3>
          <p className="text-white/60 text-sm mb-4">
            فريق الدعم الفني متاح على مدار الساعة لمساعدتك
          </p>
          <Link
            href="/contact"
            className="inline-block px-6 py-3 rounded-lg bg-[linear-gradient(135deg,#7c3aed,#a78bfa)] text-white font-bold text-sm no-underline transition-all hover:shadow-[0_4px_12px_rgba(124,58,237,0.3)]"
          >
            تواصل مع الدعم
          </Link>
        </div>
      </div>
    </FooterPageLayout>
  );
}
