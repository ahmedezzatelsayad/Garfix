"use client";
import { VERCEL_ESCAPE_HELPER_JS } from "@/lib/vercel-html-utils";
import Link from "next/link";

export default function VercelClients() {
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
          <Link href="/settings" className="text-white/60 hover:text-white">الإعدادات</Link>
          <button id="logout-btn" className="text-red-400 hover:text-red-300">خروج</button>
        </div>
      </header>
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">العملاء</h1>
          <button id="new-client-btn" className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-500 text-white text-sm font-bold hover:shadow-lg transition-all">+ عميل جديد</button>
        </div>
        <div id="loading" className="flex items-center justify-center py-20"><div className="h-8 w-8 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin"></div></div>
        <div id="content" className="hidden">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="clients-grid"></div>
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: VERCEL_ESCAPE_HELPER_JS + `
        (async function() {
          try {
            var res = await fetch('/api/auth/me', { credentials: 'include' });
            if (!res.ok) { window.location.href = '/login?returnTo=' + encodeURIComponent(window.location.pathname); return; }
            document.getElementById('loading').className = 'hidden';
            document.getElementById('content').className = 'block';
            var cliRes = await fetch('/api/clients?limit=50', { credentials: 'include' });
            if (cliRes.ok) {
              var data = await cliRes.json();
              var clients = data.clients || data.data || [];
              if (clients.length === 0) {
                // [SAFE] innerHTML: static HTML — no dynamic/user data
                document.getElementById('clients-grid').innerHTML = '<div class="col-span-full text-center py-12 text-white/40">لا يوجد عملاء بعد</div>';
              } else {
                var html = clients.map(function(c) {
                  var name = __esc(c.name || c.nameEn || '---');
                  var email = __esc(c.email || '');
                  var phone = __esc(c.phone || '');
                  var taxId = __esc(c.taxId || '');
                  return '<div class="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-emerald-500/20 transition-colors">' +
                    '<div class="flex items-center gap-3 mb-2"><div class="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 font-bold">'+name.charAt(0)+'</div>' +
                    '<div><p class="font-bold text-sm">'+name+'</p>'+(email?'<p class="text-xs text-white/40">'+email+'</p>':'')+'</div></div>' +
                    (phone?'<p class="text-xs text-white/60 mb-1">📱 '+phone+'</p>':'') +
                    (taxId?'<p class="text-xs text-white/60">🆔 '+taxId+'</p>':'') +
                    '</div>';
                }).join('');
                // [SAFE] innerHTML: all dynamic values escaped via __esc()
                document.getElementById('clients-grid').innerHTML = html;
              }
            }
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
