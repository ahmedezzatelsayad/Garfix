"use client";

import { useState, useEffect } from "react";
import { useBrand } from "@/context/BrandContext";
import { ClientList } from "./ClientList";
import { ClientForm } from "./ClientForm";
import { ImportCSVDialog } from "./ImportCSVDialog";
import { ClientProfile } from "./ClientProfile";
import type { Client } from "./types";
import { Users, UserCheck, TrendingUp, Star, Sparkles } from "lucide-react";

export function ClientsView() {
  const { activeCompany } = useBrand();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [showImport, setShowImport] = useState(false);

  // KPI Stats (will be populated by ClientList via callback or context)
  const [kpiStats, setKpiStats] = useState({
    totalClients: 0,
    activeClients: 0,
    newThisMonth: 0,
    vipClients: 0,
  });

  // Listen for quick-action events from the Command Palette (e.g. "عميل جديد")
  useEffect(() => {
    const onQuickAction = (e: Event) => {
      const detail = (e as CustomEvent).detail as { type?: string } | undefined;
      if (detail?.type === "new-client") {
        setEditing(null);
        setShowForm(true);
      }
    };
    window.addEventListener("garfix:quick-action", onQuickAction as EventListener);
    return () => window.removeEventListener("garfix:quick-action", onQuickAction as EventListener);
  }, []);

  if (!activeCompany) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center text-muted-foreground">
          <Users size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg font-semibold">اختر شركة أولاً</p>
          <p className="text-sm mt-1">يرجى اختيار شركة لعرض العملاء</p>
        </div>
      </div>
    );
  }

  // If a client is selected, show profile
  if (selectedClientId) {
    return <ClientProfile clientId={selectedClientId} onBack={() => setSelectedClientId(null)} />;
  }

  // If showing the form (create or edit), render it instead of the list
  if (showForm || editing) {
    return (
      <ClientForm
        companySlug={activeCompany.slug}
        client={editing}
        onClose={() => { setShowForm(false); setEditing(null); }}
      />
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* ── KPI Cards Section (DS v4.0) ─────────────────────────────────── */}
      <div className="grid-kpi">
        {/* Total Clients KPI */}
        <div className="kpi-card">
          <div className="flex items-start justify-between">
            <div>
              <div className="kpi-value">{kpiStats.totalClients}</div>
              <div className="kpi-label">إجمالي العملاء</div>
            </div>
            <div className="kpi-icon bg-primary/10 text-primary">
              <Users size={20} />
            </div>
          </div>
          <div className="sparkline-container mt-3">
            <div className="flex items-end gap-1 h-8">
              {[40, 65, 45, 80, 55, 90, 70].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 bg-primary/20 rounded-sm min-w-[4px] transition-all duration-300 hover:bg-primary/40"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Active Clients KPI - Gold for VIP/Active */}
        <div className="kpi-card-gold">
          <div className="flex items-start justify-between">
            <div>
              <div className="kpi-value">{kpiStats.activeClients}</div>
              <div className="kpi-label">العملاء النشطين</div>
            </div>
            <div className="kpi-icon bg-[#d4a574]/10 text-[#d4a574]">
              <UserCheck size={20} />
            </div>
          </div>
          <div className="kpi-badge mt-2">
            <Star size={12} />
            <span>عملاء مميزون</span>
          </div>
        </div>

        {/* New This Month KPI */}
        <div className="kpi-card">
          <div className="flex items-start justify-between">
            <div>
              <div className="kpi-value">{kpiStats.newThisMonth}</div>
              <div className="kpi-label">جدد هذا الشهر</div>
            </div>
            <div className="kpi-icon bg-emerald-500/10 text-emerald-500">
              <TrendingUp size={20} />
            </div>
          </div>
          <div className="sparkline-container mt-3">
            <div className="flex items-end gap-1 h-8">
              {[30, 50, 40, 70, 60, 85, 95].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 bg-emerald-500/20 rounded-sm min-w-[4px] transition-all duration-300 hover:bg-emerald-500/40"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* VIP Clients KPI - AI Powered */}
        <div className="kpi-card kpi-card-ai">
          <div className="flex items-start justify-between">
            <div>
              <div className="kpi-value">{kpiStats.vipClients}</div>
              <div className="kpi-label">عملاء VIP</div>
            </div>
            <div className="kpi-icon bg-gradient-to-br from-[#d4a574]/20 to-[#d4a574]/5 text-[#d4a574]">
              <Sparkles size={20} />
            </div>
          </div>
          <div className="ai-badge mt-2">
            <Sparkles size={10} />
            <span>تحليل ذكي</span>
          </div>
        </div>
      </div>

      {/* ── Main Content ────────────────────────────────────────────────── */}
      <ClientList
        companySlug={activeCompany.slug}
        onSelectClient={setSelectedClientId}
        onAddNew={() => { setEditing(null); setShowForm(true); }}
        onEdit={(client) => { setEditing(client); setShowForm(true); }}
        onImport={() => setShowImport(true)}
        onKpiStatsUpdate={setKpiStats}
      />
      <ImportCSVDialog
        companySlug={activeCompany.slug}
        open={showImport}
        onClose={() => setShowImport(false)}
      />
    </div>
  );
}

export default ClientsView;
