import { Globe, Handshake, ArrowRight, CheckCircle } from "lucide-react";
import { FooterPageLayout } from "@/components/garfix/FooterPageLayout";
import Link from "next/link";

const PARTNER_TYPES = [
  {
    icon: "🏢",
    title: "شركاء التكامل",
    desc: "شركات البرمجيات وأنظمة ERP وCRMs التي تتكامل مع GARFIX لتوفير حلول شاملة للعملاء المشتركين. نوفر واجهات برمجة تطبيقات مفتوحة وموثقة وSDKs بلغات متعددة لتسهيل التكامل.",
    benefits: ["وصول لآلاف العملاء المحتملين", "دعم فني مخصص للتكامل", "تسويق مشترك للشراكة", "تدريب معتمد لفريقك"],
  },
  {
    icon: "💼",
    title: "شركاء المبيعات",
    desc: "مكاتب المحاسبة وشركات الاستشارات ومقدمي الخدمات المحترفين الذين يروجون لـ GARFIX لعملائهم. نقدم عمولات تنافسية وأدوات تسويقية جاهزة ودعم مخصص لشركائنا.",
    benefits: ["عمولات تنافسية تصل لـ 25%", "أدوات تسويقية جاهزة", "حساب تجريبي مخصص للعروض", "دعم مخصص للشركاء"],
  },
  {
    icon: "🎓",
    title: "شركاء التدريب",
    desc: "مراكز التدريب والمعاهد التعليمية التي تقدم دورات معتمدة على GARFIX. نوفر منهجية تدريب شاملة وشهادات معتمدة ومواد تدريبية محدّثة باستمرار.",
    benefits: ["منهجية تدريب معتمدة", "شهادات GARFIX الرسمية", "مواد تدريبية محدّثة", "خصومات للطلاب والمؤسسات"],
  },
  {
    icon: "🛠️",
    title: "شركاء التطوير",
    desc: "مطورو البرمجيات المستقلون وشركات التطوير الذين يبنون حلولاً مخصصة فوق منصة GARFIX. نوفر بيئة تطوير متكاملة ووصول مبكر للميزات الجديدة.",
    benefits: ["وصول مبكر للميزات الجديدة", "API documentation شامل", "مجتمع مطورين نشط", "دعم تقني مباشر"],
  },
];

const PARTNER_STATS = [
  { value: "+50", label: "شريك في المنطقة" },
  { value: "+5000", label: "عميل مشترك" },
  { value: "8", label: "دول خليجية" },
  { value: "25%", label: "عمولة قصوى" },
];

export default function PartnersPage() {
  return (
    <FooterPageLayout
      title="برنامج الشركاء"
      subtitle="انضم لشبكة شركاء GARFIX وساهم في تحويل الأعمال في منطقة الشرق الأوسط"
      icon={<Globe size={28} />}
    >
      <div className="space-y-10 text-white/80 text-[15px] leading-[1.9]">
        {/* إحصائيات */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {PARTNER_STATS.map((stat) => (
            <div
              key={stat.label}
              className="p-5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-center"
            >
              <div className="text-[32px] font-black text-[#fbbf24]">{stat.value}</div>
              <div className="text-xs text-white/60 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* نبذة */}
        <section>
          <h2 className="text-xl font-extrabold text-white mb-3">لماذا تشارك مع GARFIX؟</h2>
          <p>
            GARFIX هي المنصة الرائدة لإدارة الأعمال السحابية في منطقة الشرق الأوسط وشمال أفريقيا.
            مع نمو متسارع يضم آلاف الشركات في 8 دول خليجية، نبحث عن شركاء يشاركوننا رؤيتنا
            في تمكين الأعمال من التحول الرقمي. برنامج الشركاء مصمم ليكون علاقة مربحة للطرفين،
            حيث نقدم لك الأدوات والموارد والدعم اللازم لتنمية أعمالك معنا.
          </p>
        </section>

        {/* أنواع الشراكة */}
        <section>
          <h2 className="text-xl font-extrabold text-white mb-5">أنواع الشراكة</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {PARTNER_TYPES.map((partner) => (
              <div
                key={partner.title}
                className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-6"
              >
                <div className="text-[36px] mb-3">{partner.icon}</div>
                <h3 className="font-extrabold text-white text-lg mb-2">{partner.title}</h3>
                <p className="text-white/60 text-[13px] leading-relaxed mb-4">{partner.desc}</p>
                <ul className="space-y-1.5">
                  {partner.benefits.map((b) => (
                    <li key={b} className="flex items-center gap-2 text-[13px] text-white/70">
                      <CheckCircle size={14} className="text-[#a78bfa] shrink-0" />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* عملية الشراكة */}
        <section>
          <h2 className="text-xl font-extrabold text-white mb-5">كيف تبدأ الشراكة</h2>
          <div className="space-y-4">
            {[
              { step: "1", title: "قدّم طلب الشراكة", desc: "أخبرنا عن شركتك ونوع الشراكة المطلوبة وخبراتك في السوق" },
              { step: "2", title: "مراجعة ومقابلة", desc: "يراجع فريق الشراكات طلبك ويحدد موعد مقابلة لمناقشة التفاصيل" },
              { step: "3", title: "التأهيل والتدريب", desc: "تحصل على تدريب معتمد على المنصة والمنهجيات وإجراءات الشراكة" },
              { step: "4", title: "إطلاق الشراكة", desc: "توقيع اتفاقية الشراكة واستلام الأدوات التسويقية والبدء في التعاون" },
            ].map((item) => (
              <div key={item.step} className="flex gap-4 bg-white/[0.03] rounded-xl p-5 border border-white/[0.06]">
                <div className="w-10 h-10 rounded-full bg-[linear-gradient(135deg,#7c3aed,#a78bfa)] flex items-center justify-center text-white font-bold text-sm shrink-0">
                  {item.step}
                </div>
                <div>
                  <div className="font-bold text-white text-sm mb-0.5">{item.title}</div>
                  <div className="text-white/60 text-[13px]">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div className="bg-[rgba(124,58,237,0.08)] border border-[rgba(124,58,237,0.2)] rounded-xl p-8 text-center">
          <Handshake size={36} className="text-[#c4b5fd] mx-auto mb-4" />
          <h3 className="font-extrabold text-white text-lg mb-2">هل أنت مستعد للشراكة؟</h3>
          <p className="text-white/60 text-sm mb-5 max-w-[500px] mx-auto">
            تواصل معنا اليوم واستكشف فرص الشراكة التي تناسب أعمالك
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[linear-gradient(135deg,#7c3aed,#a78bfa)] text-white font-bold text-sm no-underline transition-all hover:shadow-[0_4px_12px_rgba(124,58,237,0.3)]"
          >
            تقدم بطلب الشراكة
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </FooterPageLayout>
  );
}
