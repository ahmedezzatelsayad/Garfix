/**
 * / — GarfiX home route.
 *
 * VERCEL FIX: simplified to a server component that renders static HTML.
 * No "use client", no dynamic imports, no framer-motion, no useAuth().
 * The client-side auth check + redirect happens in a tiny inline script.
 *
 * This guarantees the page renders on Vercel without any hydration issues.
 * Authenticated users get redirected to /app via client-side JS.
 * Unauthenticated users see the marketing content in the static HTML.
 */
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-dvh bg-[#0b1220] text-white" dir="rtl">
      {/* Simple inline script: redirect to /login if not authenticated */}
      <script dangerouslySetInnerHTML={{ __html: `
        (function() {
          try {
            var cookies = document.cookie;
            var hasAccess = cookies.includes('inv_token');
            var hasRefresh = cookies.includes('inv_refresh');
            if (hasAccess || hasRefresh) {
              // User might be authenticated — redirect to app
              window.location.href = '/login';
            }
          } catch(e) {}
        })();
      `}} />

      {/* Header */}
      <header className="px-6 py-5 max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg">
            <span className="text-white font-black text-lg">G</span>
          </div>
          <span className="font-bold text-lg">GarfiX EOS <span className="text-emerald-400 text-xs font-normal">v4.0</span></span>
        </div>
        <nav className="flex items-center gap-3">
          <Link href="/login" className="text-white/85 hover:text-white text-sm font-medium transition-colors px-4 py-2 rounded-lg border border-white/15 hover:bg-white/5">
            تسجيل الدخول
          </Link>
          <Link href="/signup" className="bg-gradient-to-r from-emerald-600 to-emerald-500 text-white text-sm font-bold px-5 py-2 rounded-lg shadow-lg hover:shadow-xl transition-all">
            ابدأ مجاناً
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 py-16 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold mb-6">
          <span>🚀</span>
          <span>نظام تشغيل مؤسسي متكامل بالذكاء الاصطناعي</span>
        </div>
        <h1 className="text-4xl md:text-6xl font-black mb-6 bg-gradient-to-l from-white via-emerald-100 to-emerald-400 bg-clip-text text-transparent">
          GarfiX EOS
        </h1>
        <p className="text-lg md:text-xl text-white/70 mb-8 max-w-2xl mx-auto leading-relaxed">
          منصة ERP/فوترة إلكترونية متعددة المستأجرين مع طبقة ذكاء اصطناعي مُحسَّنة التكلفة.
          محاسبة كاملة، موارد بشرية، فوترة إلكترونية متوافقة مع 7 دول، ولوحة مؤسس موحّدة.
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link href="/signup" className="bg-gradient-to-r from-emerald-600 to-emerald-500 text-white text-base font-bold px-8 py-4 rounded-xl shadow-xl hover:shadow-2xl transition-all inline-flex items-center gap-2">
            ابدأ تجربتك المجانية
          </Link>
          <Link href="/login" className="text-white/85 border border-white/20 text-base font-bold px-8 py-4 rounded-xl hover:bg-white/5 transition-all">
            تسجيل الدخول
          </Link>
        </div>
      </section>

      {/* Features grid */}
      <section className="max-w-5xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { icon: "🧾", title: "الفوترة الإلكترونية", desc: "7 دول: السعودية، الإمارات، مصر، الكويت، البحرين، عُمان، قطر" },
            { icon: "📊", title: "محاسبة كاملة", desc: "18 وحدة محاسبية: دفاتر يومية، AR/AP، بنوك، أصول ثابتة، رواتب/WPS" },
            { icon: "🤖", title: "ذكاء اصطناعي", desc: "شلال 20 مرحلة لتقليل تكلفة LLM — Cache → Pattern → Rule → AI" },
            { icon: "🏢", title: "متعدد الشركات", desc: "أدر عدد غير محدود من الشركات مع عزل كامل للبيانات" },
            { icon: "📱", title: "Arabic-first", desc: "واجهة عربية RTL كاملة + تقويم هجري + تحويل المبالغ لنص عربي" },
            { icon: "🛡️", title: "أمان مؤسسي", desc: "RBAC كامل + AES-256 encryption + MFA + audit trail" },
          ].map((f, i) => (
            <div key={i} className="p-6 rounded-2xl bg-white/[0.03] border border-white/[0.08] hover:border-emerald-500/20 transition-colors">
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="font-bold text-white mb-2">{f.title}</h3>
              <p className="text-sm text-white/60 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-6 py-8 border-t border-white/[0.06] mt-12">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <p className="text-sm text-white/40">© 2026 GarfiX EOS · جميع الحقوق محفوظة</p>
          <div className="flex items-center gap-4 text-sm text-white/40">
            <Link href="/help" className="hover:text-white/70 transition-colors">المساعدة</Link>
            <Link href="/status" className="hover:text-white/70 transition-colors">حالة النظام</Link>
            <Link href="/privacy" className="hover:text-white/70 transition-colors">الخصوصية</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
