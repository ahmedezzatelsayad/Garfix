"use client";
import { VERCEL_ESCAPE_HELPER_JS } from "@/lib/vercel-html-utils";
import Link from "next/link";

export default function VercelInvoices() {
  return (
    <div className="min-h-screen bg-[#0b1220] text-white" dir="rtl">
      <header className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center"><span className="text-white font-black text-sm">G</span></div>
          <span className="font-bold">GarfiX EOS</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/dashboard" className="text-white/60 hover:text-white">لوحة التحكم</Link>
          <Link href="/clients" className="text-white/60 hover:text-white">العملاء</Link>
          <Link href="/settings" className="text-white/60 hover:text-white">الإعدادات</Link>
          <button id="logout-btn" className="text-red-400 hover:text-red-300">خروج</button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">الفواتير</h1>
          <button id="new-invoice-btn" className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-500 text-white text-sm font-bold hover:shadow-lg transition-all">+ فاتورة جديدة</button>
        </div>

        <div id="loading" className="flex items-center justify-center py-20"><div className="h-8 w-8 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin"></div></div>

        <div id="content" className="hidden">
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]"><p className="text-xs text-white/40 mb-1">الإجمالي</p><p className="text-xl font-bold" id="stat-total">0</p></div>
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]"><p className="text-xs text-white/40 mb-1">مدفوعة</p><p className="text-xl font-bold text-emerald-400" id="stat-paid">0</p></div>
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]"><p className="text-xs text-white/40 mb-1">معلقة</p><p className="text-xl font-bold text-amber-400" id="stat-pending">0</p></div>
          </div>
          <div id="invoices-table" className="space-y-2"></div>
        </div>
      </div>

      <script dangerouslySetInnerHTML={{ __html: VERCEL_ESCAPE_HELPER_JS + `
        (async function() {
          try {
            var res = await fetch('/api/auth/me', { credentials: 'include' });
            if (!res.ok) { window.location.href = '/login'; return; }

            document.getElementById('loading').className = 'hidden';
            document.getElementById('content').className = 'block';

            var invRes = await fetch('/api/invoices?limit=50', { credentials: 'include' });
            if (invRes.ok) {
              var data = await invRes.json();
              var invoices = data.invoices || data.data || [];
              document.getElementById('stat-total').textContent = invoices.length;
              document.getElementById('stat-paid').textContent = invoices.filter(function(i){return i.status==='paid'}).length;
              document.getElementById('stat-pending').textContent = invoices.filter(function(i){return i.status==='sent'||i.status==='draft'}).length;

              if (invoices.length === 0) {
                document.getElementById('invoices-table').innerHTML = '<div class="text-center py-12 text-white/40">لا توجد فواتير بعد. اضغط "فاتورة جديدة" لإنشاء أول فاتورة.</div>';
              } else {
                var html = invoices.map(function(inv) {
                  var num = inv.invoiceNumber || '#'+inv.id;
                  var client = inv.clientName || '---';
                  var total = inv.total || 0;
                  var status = inv.status || 'draft';
                  var date = inv.issueDate ? new Date(inv.issueDate).toLocaleDateString('ar-EG') : '';
                  var statusColor = status==='paid' ? 'bg-emerald-500/15 text-emerald-400' : status==='sent' ? 'bg-blue-500/15 text-blue-400' : 'bg-white/[0.06] text-white/40';
                  return '<div class="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] hover:border-emerald-500/20 transition-colors">' +
                    '<div class="flex items-center gap-4"><span class="font-mono text-sm text-emerald-400">'+num+'</span>' +
                    '<span class="text-sm text-white/80">'+client+'</span><span class="text-xs text-white/40">'+date+'</span></div>' +
                    '<div class="flex items-center gap-4"><span class="text-sm font-bold">'+total+'</span>' +
                    '<span class="text-xs px-2 py-0.5 rounded-full '+statusColor+'">'+status+'</span></div></div>';
                }).join('');
                document.getElementById('invoices-table').innerHTML = html;
              }
            }
          } catch(err) { window.location.href = '/login'; }
        })();
        document.getElementById('logout-btn').addEventListener('click', async function() {
          await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(()=>{});
          window.location.href = '/login';
        });
        document.getElementById('new-invoice-btn').addEventListener('click', function() {
          alert('إنشاء فاتورة جديدة — يتطلب AppShell (متاح على AWS/Docker)');
        });
      `}} />
    </div>
  );
}
