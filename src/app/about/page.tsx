"use client";

/**
 * /about — صفحة من نحن (موقع خارجي متعدد الصفحات).
 * الرؤية والرسالة والقيم ورحلة المنتج ودعوة للتواصل.
 */

import Link from "next/link";
import {
  Target, Eye, HeartHandshake, ShieldCheck, Rocket,
  ArrowLeft, MapPin, Lightbulb, Users, Gauge,
} from "lucide-react";
import { PublicSiteHeader } from "@/components/site/PublicSiteHeader";
import { ProfessionalFooter } from "@/components/garfix/ProfessionalFooter";

const VALUES = [
  {
    icon: <Lightbulb size={22} />,
    title: "البساطة أولاً",
    desc: "نؤمن أن أدوات المحاسبة لا يجب أن تكون معقدة. كل شاشة في GarfiX مصممة لتنجز مهمتك في أقل عدد من الخطوات، بلغة عربية أصيلة وليست ترجمة حرفية.",
  },
  {
    icon: <ShieldCheck size={22} />,
    title: "الثقة والأمان",
    desc: "بياناتك المالية أمانة. عزل على مستوى قاعدة البيانات، تشفير AES-256، مصادقة ثنائية، وسجل تدقيق لكل إجراء — هذه ليست خيارات إضافية بل أساس المنصة.",
  },
  {
    icon: <Gauge size={22} />,
    title: "أداء المؤسسات",
    desc: "بنية تحتية بمستوى الشركات الكبرى: فهارس مركبة، معاملات ذرّية، طوابير مهام، ومراقبة لحظية — حتى تعمل المنصة بسلاسة مع آلاف الفواتير.",
  },
  {
    icon: <HeartHandshake size={22} />,
    title: "قرب من عملائنا",
    desc: "نبني المنتج مع مستخدمينا لا لهم. كل ملاحظة تصلنا تتحول إلى تحسين حقيقي، والدعم بالعربية بشرط أساسي في فريقنا وليس ميزة إضافية.",
  },
];

const MILESTONES = [
  { year: "البداية", title: "من ورشة صغيرة في الكويت", desc: "بدأت الفكرة من مالك مؤسسة صغيرة قضى سنوات يعاني من تعقيد أنظمة المحاسبة الأجنبية وضعف دعمها للعربية والفوترة الخليجية." },
  { year: "التحول", title: "منصة سحابية بمواصفات مؤسسية", desc: "بنينا المنصة من الصفر على بنية Multi-tenant مع عزل بيانات صارم ومعاملات مالية ذرّية تحفظ توازن كل قيد." },
  { year: "الذكاء", title: "GarfiX AI في كل مكان", desc: "لم نُلحق الذكاء الاصطناعي كإضافة تسويقية — بل جعلناه طبقة تشغيلية: إدخال مجمنّ، مطابقة منتجات متعلمة، ووكلاء ينفذون لا يجيبون فقط." },
  { year: "اليوم", title: "+20 دولة عربية وخليجية", desc: "دعم هيئات الفوترة الإلكترونية في السعودية ومصر والإمارات والبحرين وعُمان، ومتطلبات المرسوم الكويتي 10/2026." },
];

export default function AboutPage() {
  return (
    <div dir="rtl" className="min-h-dvh bg-background text-foreground">
      <PublicSiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden py-16 md:py-20 px-[5%] text-center">
        <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(4,120,87,0.07),transparent_55%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(4,120,87,0.14),transparent_55%)] pointer-events-none" />
        <div className="relative max-w-[760px] mx-auto">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 dark:text-emerald-400 mb-5">
            <Rocket size={26} />
          </div>
          <h1 className="text-[clamp(28px,5vw,46px)] font-black mb-4 leading-tight">
            نبني منصة تليق
            <span className="landing-section-title"> بأصحاب الأعمال العرب</span>
          </h1>
          <p className="text-muted-foreground text-base md:text-lg leading-relaxed">
            GarfiX منصة سحابية لإدارة الفواتير والمحاسبة والمخزون والموارد البشرية،
            صُنعت في الكويت بخبرة ميدانية من ورش ومؤسسات ومتاجر حقيقية.
          </p>
        </div>
      </section>

      {/* Vision & Mission */}
      <section className="px-[5%] pb-6 max-w-[1000px] mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="landing-card rounded-2xl p-7">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 dark:text-emerald-400 flex items-center justify-center mb-4">
            <Eye size={22} />
          </div>
          <h2 className="text-lg font-black mb-3 text-foreground">رؤيتنا</h2>
          <p className="text-[13.5px] text-muted-foreground leading-relaxed">
            عالم يدير فيه كل صاحب عمل عربي أعماله بأدوات عالمية المستوى بلغته وبعملته
            وبأنظمة دولته — دون أن يدفع ثمن تعقيد الأنظمة الأجنبية أو ضعف البدائل المحلية.
          </p>
        </div>
        <div className="landing-card rounded-2xl p-7">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 dark:text-emerald-400 flex items-center justify-center mb-4">
            <Target size={22} />
          </div>
          <h2 className="text-lg font-black mb-3 text-foreground">مهمتنا</h2>
          <p className="text-[13.5px] text-muted-foreground leading-relaxed">
            تقديم منظومة أعمال متكاملة تجعل الفاتورة الأولى والقائمة المالية الأخيرة
            بنفس السهولة — مع ذكاء اصطناعي يقلّل العمل اليدوي ٨٠٪ وتكامل تنظيمي مع
            هيئات الفوترة الإلكترونية في المنطقة.
          </p>
        </div>
      </section>

      {/* Values */}
      <section className="px-[5%] py-14 max-w-[1000px] mx-auto">
        <h2 className="text-xl md:text-2xl font-black mb-8 text-center">قيمنا التي لا نساوم عليها</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {VALUES.map((v) => (
            <div key={v.title} className="landing-card rounded-xl p-6 hover-lift">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-emerald-500 dark:text-emerald-400">{v.icon}</span>
                <h3 className="text-[15px] font-extrabold text-foreground">{v.title}</h3>
              </div>
              <p className="text-[13px] text-muted-foreground leading-relaxed">{v.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Journey */}
      <section className="px-[5%] pb-14 max-w-[860px] mx-auto">
        <h2 className="text-xl md:text-2xl font-black mb-8 text-center">رحلتنا</h2>
        <div className="relative border-r-2 border-emerald-500/25 pr-6 mr-3 flex flex-col gap-8">
          {MILESTONES.map((m) => (
            <div key={m.title} className="relative">
              <span className="absolute -right-[33px] top-1 w-4 h-4 rounded-full bg-[linear-gradient(135deg,#047857,#10b981)] border-[3px] border-background shadow" />
              <div className="text-[11px] font-extrabold text-emerald-600 dark:text-emerald-400 tracking-wide mb-1">{m.year}</div>
              <h3 className="text-[15px] font-extrabold text-foreground mb-1.5">{m.title}</h3>
              <p className="text-[13px] text-muted-foreground leading-relaxed">{m.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-[5%] pb-16 max-w-[860px] mx-auto">
        <div className="rounded-2xl bg-[linear-gradient(135deg,rgba(4,120,87,0.12),rgba(16,185,129,0.07))] dark:bg-[linear-gradient(135deg,rgba(4,120,87,0.28),rgba(16,185,129,0.12))] border border-emerald-500/25 p-8 md:p-10 text-center">
          <MapPin size={30} className="text-emerald-500 dark:text-emerald-400 mx-auto mb-4" />
          <h2 className="text-lg md:text-xl font-black mb-3 text-foreground">عنابينا في الكويت — وفريقنا في كل مكان</h2>
          <p className="text-muted-foreground text-sm md:text-[15px] max-w-[560px] mx-auto mb-6 leading-relaxed">
            سواء كنت صاحب مؤسسة صغيرة تبدأ رحلتك، أو مديراً مالياً يبحث عن منظومة موثوقة —
            يسعدنا أن نسمع منك.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/contact" className="inline-flex items-center gap-2 bg-[linear-gradient(135deg,#047857,#10b981)] text-white border-none rounded-lg px-7 py-3 text-[13px] font-extrabold no-underline active-press">
              تواصل معنا <ArrowLeft size={15} />
            </Link>
            <Link href="/features" className="inline-flex items-center gap-2 bg-transparent text-foreground border border-border rounded-lg px-7 py-3 text-[13px] font-bold no-underline hover:bg-muted">
              <Users size={15} /> استعرض المميزات
            </Link>
          </div>
        </div>
      </section>

      <ProfessionalFooter variant="landing" />
    </div>
  );
}
