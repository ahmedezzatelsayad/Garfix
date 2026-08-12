/**
 * /clients — Clients page.
 *
 * DEPLOYMENT FIX: Added `dynamic = 'force-dynamic'` to prevent prerender.
 * During `next build`, process.env.VERCEL is undefined, so the server
 * component would call redirect("/") during static generation, causing:
 *   "Cannot read properties of null (reading 'use')" prerender failure.
 *
 * Converted to "use client" with AuthContext for the SPA (AppShell) path.
 */
"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";

export default function ClientsPage() {
  const { user, loading } = useAuth();
  const [clients, setClients] = useState<any[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetch('/api/clients?limit=50', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(data => setClients(data.clients || data.data || []))
      .catch(() => setClients([]))
      .finally(() => setFetching(false));
  }, [user]);

  if (loading || !user) return null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">العملاء</h1>
      </div>
      {fetching ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
        </div>
      ) : clients.length === 0 ? (
        <div className="text-center py-12 text-white/40">لا يوجد عملاء بعد</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map((c: any) => (
            <div key={c.id} className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-emerald-500/20 transition-colors">
              <div className="flex items-center gap-3 mb-2">
                <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 font-bold">
                  {(c.name || c.nameEn || '?').charAt(0)}
                </div>
                <div>
                  <p className="font-bold text-sm">{c.name || c.nameEn || '---'}</p>
                  {c.email && <p className="text-xs text-white/40">{c.email}</p>}
                </div>
              </div>
              {c.phone && <p className="text-xs text-white/60 mb-1">📱 {c.phone}</p>}
              {c.taxId && <p className="text-xs text-white/60">🆔 {c.taxId}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
