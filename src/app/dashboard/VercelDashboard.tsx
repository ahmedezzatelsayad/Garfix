/**
 * VercelDashboard — Pure HTML dashboard for Vercel.
 */
"use client";

import { VERCEL_ESCAPE_HELPER_JS } from "@/lib/vercel-html-utils";
import Link from "next/link";

export default function VercelDashboard() {
  return (
    <div className="min-h-screen bg-[#0b1220] text-white" dir="rtl">
      <header className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center">
            <span className="text-white font-black text-sm">G</span>
          </div>
          <span className="font-bold">GarfiX EOS</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/" className="text-white/60 hover:text-white">الرئيسية</Link>
          <button id="logout-btn" className="text-red-400 hover:text-red-300">خروج</button>
        </div>
      </header>

      <div id="loading" className="flex items-center justify-center py-20">
        <div className="h-8 w-8 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin"></div>
      </div>

      <div id="content" className="hidden max-w-6xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-1" id="welcome">أهلاً!</h1>
          <p className="text-sm text-white/50" id="company-info"></p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
            <p className="text-xs text-white/40 mb-1">الفواتير</p>
            <p className="text-2xl font-bold text-emerald-400" id="stat-invoices">-</p>
          </div>
          <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
            <p className="text-xs text-white/40 mb-1">العملاء</p>
            <p className="text-2xl font-bold text-blue-400" id="stat-clients">-</p>
          </div>
          <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
            <p className="text-xs text-white/40 mb-1">المنتجات</p>
            <p className="text-2xl font-bold text-amber-400" id="stat-products">-</p>
          </div>
          <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
            <p className="text-xs text-white/40 mb-1">الإيراد</p>
            <p className="text-2xl font-bold text-purple-400" id="stat-revenue">-</p>
          </div>
        </div>

        <h2 className="text-lg font-bold mb-4">إجراءات سريعة</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <a href="/founder-panel/mission-control" className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 hover:border-emerald-500/40 transition-all text-center">
            <div className="text-2xl mb-1">🎯</div>
            <div className="text-xs font-bold text-emerald-400">لوحة المؤسس</div>
          </a>
          <a href="/founder-panel/e-invoicing" className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-emerald-500/30 transition-all text-center">
            <div className="text-2xl mb-1">🧾</div>
            <div className="text-xs font-bold">الفوترة الإلكترونية</div>
          </a>
          <a href="/founder-panel/finops" className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-emerald-500/30 transition-all text-center">
            <div className="text-2xl mb-1">📊</div>
            <div className="text-xs font-bold">التقارير المالية</div>
          </a>
          <a href="/founder-panel/integrations" className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-emerald-500/30 transition-all text-center">
            <div className="text-2xl mb-1">🔌</div>
            <div className="text-xs font-bold">التكاملات</div>
          </a>
        </div>

        <h2 className="text-lg font-bold mb-4">آخر الفواتير</h2>
        <div id="invoices-list" className="space-y-2">
          <p className="text-sm text-white/40">جارٍ التحميل...</p>
        </div>
      </div>

      <script dangerouslySetInnerHTML={{ __html: VERCEL_ESCAPE_HELPER_JS + `
        (async function() {
          try {
            var res = await fetch('/api/auth/me', { credentials: 'include' });
            if (!res.ok) { window.location.href = '/login?returnTo=' + encodeURIComponent(window.location.pathname); return; }
            var user = await res.json();

            document.getElementById('welcome').textContent = 'أهلاً ' + (user.displayName || user.email) + '!';
            var companies = user.companies || [];
            document.getElementById('company-info').textContent = companies.length > 0
              ? 'الشركة: ' + companies[0] : 'لا توجد شركة مفعّلة';

            document.getElementById('loading').className = 'hidden';
            document.getElementById('content').className = 'max-w-6xl mx-auto px-6 py-8';

            try {
              var statsRes = await fetch('/api/dashboard/stats', { credentials: 'include' });
              if (statsRes.ok) {
                var stats = await statsRes.json();
                document.getElementById('stat-invoices').textContent = stats.totalInvoices || 0;
                document.getElementById('stat-clients').textContent = stats.totalClients || 0;
                document.getElementById('stat-products').textContent = stats.totalProducts || 0;
                document.getElementById('stat-revenue').textContent = (stats.monthlyRevenue || 0) + ' ' + (stats.currency || 'SAR');
              }
            } catch(e) {}

            try {
              var invRes = await fetch('/api/invoices?limit=5', { credentials: 'include' });
              if (invRes.ok) {
                var invData = await invRes.json();
                var invoices = invData.invoices || invData.data || [];
                if (invoices.length > 0) {
                  var html = invoices.map(function(inv) {
                    var num = __esc(inv.invoiceNumber || ('#' + inv.id));
                    var client = __esc(inv.clientName || '---');
                    var total = __esc(inv.total || 0);
                    var status = __esc(inv.status || 'draft');
                    var statusColor = status === 'paid' ? 'text-emerald-400' : status === 'sent' ? 'text-blue-400' : 'text-white/40';
                    return '<div class="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">' +
                      '<div class="flex items-center gap-3"><span class="font-mono text-sm">' + num + '</span>' +
                      '<span class="text-sm text-white/60">' + client + '</span></div>' +
                      '<div class="flex items-center gap-4"><span class="text-sm font-bold">' + total + '</span>' +
                      '<span class="text-xs ' + statusColor + '">' + status + '</span></div></div>';
                  }).join('');
                  // [SAFE] innerHTML: all dynamic values escaped via __esc()
                  document.getElementById('invoices-list').innerHTML = html;
                } else {
                  // [SAFE] innerHTML: static HTML — no dynamic/user data
                  document.getElementById('invoices-list').innerHTML = '<p class="text-sm text-white/40">لا توجد فواتير بعد</p>';
                }
              }
            } catch(e) {
              // [SAFE] innerHTML: static HTML — no dynamic/user data
              document.getElementById('invoices-list').innerHTML = '<p class="text-sm text-white/40">تعذر تحميل الفواتير</p>';
            }
          } catch(err) {
            window.location.href = '/login?returnTo=' + encodeURIComponent(window.location.pathname);
          }
        })();

        document.getElementById('logout-btn').addEventListener('click', async function() {
          await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(()=>{});
          window.location.href = '/login?returnTo=' + encodeURIComponent(window.location.pathname);
        });
      `}} />
    </div>
  );
}
