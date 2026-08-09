"use client";
import { VERCEL_ESCAPE_HELPER_JS } from "@/lib/vercel-html-utils";
import Link from "next/link";

export default function VercelSettings() {
  return (
    <div className="min-h-screen bg-[#0b1220] text-white" dir="rtl">
      <header className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center"><span className="text-white font-black text-sm">G</span></div>
          <span className="font-bold">GarfiX EOS</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/dashboard" className="text-white/60 hover:text-white">لوحة التحكم</Link>
          <Link href="/invoices" className="text-white/60 hover:text-white">الفواتير</Link>
          <Link href="/clients" className="text-white/60 hover:text-white">العملاء</Link>
          <button id="logout-btn" className="text-red-400 hover:text-red-300">خروج</button>
        </div>
      </header>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold mb-6">الإعدادات</h1>
        <div id="loading" className="flex items-center justify-center py-20"><div className="h-8 w-8 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin"></div></div>
        <div id="content" className="hidden space-y-6">
          <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
            <h2 className="font-bold mb-4">معلومات الشركة</h2>
            <div id="company-info" className="space-y-3"></div>
          </div>
          <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
            <h2 className="font-bold mb-4">الفوترة الإلكترونية</h2>
            <div id="einvoice-status" className="space-y-2"></div>
          </div>
          <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
            <h2 className="font-bold mb-4">روابط سريعة</h2>
            <div className="grid grid-cols-2 gap-3">
              <Link href="/founder-panel/mission-control" className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-bold text-center hover:border-emerald-500/40">🎯 لوحة المؤسس</Link>
              <Link href="/founder-panel/e-invoicing" className="p-3 rounded-lg bg-white/[0.05] border border-white/[0.1] text-sm font-bold text-center hover:border-emerald-500/30">🧾 الفوترة الإلكترونية</Link>
              <Link href="/founder-panel/finops" className="p-3 rounded-lg bg-white/[0.05] border border-white/[0.1] text-sm font-bold text-center hover:border-emerald-500/30">📊 التقارير</Link>
              <Link href="/founder-panel/integrations" className="p-3 rounded-lg bg-white/[0.05] border border-white/[0.1] text-sm font-bold text-center hover:border-emerald-500/30">🔌 التكاملات</Link>
            </div>
          </div>
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: VERCEL_ESCAPE_HELPER_JS + `
        (async function() {
          try {
            var res = await fetch('/api/auth/me', { credentials: 'include' });
            if (!res.ok) { window.location.href = '/login?returnTo=' + encodeURIComponent(window.location.pathname); return; }
            var user = await res.json();
            document.getElementById('loading').className = 'hidden';
            document.getElementById('content').className = 'space-y-6';

            var companies = user.companies || [];
            document.getElementById('company-info').innerHTML =
              '<div class="flex justify-between"><span class="text-sm text-white/60">الإيميل</span><span class="text-sm">'+__esc(user.email)+'</span></div>' +
              '<div class="flex justify-between"><span class="text-sm text-white/60">الاسم</span><span class="text-sm">'+__esc(user.displayName||'---')+'</span></div>' +
              '<div class="flex justify-between"><span class="text-sm text-white/60">الدور</span><span class="text-sm">'+__esc(user.role)+'</span></div>' +
              '<div class="flex justify-between"><span class="text-sm text-white/60">الشركة</span><span class="text-sm">'+__esc(companies[0]||'---')+'</span></div>' +
              '<div class="flex justify-between"><span class="text-sm text-white/60">المؤسس</span><span class="text-sm '+(user.isFounder?'text-emerald-400':'text-white/40')+'">'+(user.isFounder?'نعم':'لا')+'</span></div>';

            document.getElementById('einvoice-status').innerHTML =
              '<div class="flex items-center justify-between p-3 rounded-lg bg-white/[0.02]"><span class="text-sm">ZATCA (السعودية)</span><span class="text-xs text-amber-400">يحتاج إعداد</span></div>' +
              '<div class="flex items-center justify-between p-3 rounded-lg bg-white/[0.02]"><span class="text-sm">ETA (مصر)</span><span class="text-xs text-amber-400">يحتاج إعداد</span></div>' +
              '<div class="flex items-center justify-between p-3 rounded-lg bg-white/[0.02]"><span class="text-sm">Peppol (الإمارات)</span><span class="text-xs text-amber-400">يحتاج إعداد</span></div>';
          } catch(err) { window.location.href = '/login?returnTo=' + encodeURIComponent(window.location.pathname); }
        })();
        document.getElementById('logout-btn').addEventListener('click', async function() {
          await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(()=>{});
          window.location.href = '/login?returnTo=' + encodeURIComponent(window.location.pathname);
        });
      `}} />
    </div>
  );
}
