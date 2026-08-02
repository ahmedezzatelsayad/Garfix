// GarfiX DS v4.0 Enhanced — Settings View
// Features: Navigation tabs, KPI summary, emerald accents, motion system
"use client";

import { useState } from "react";
import { useBrand, type CompanyInfo } from "@/context/BrandContext";
import { CompanySettingsForm } from "./CompanySettingsForm";
import { TemplateSettingsForm } from "./TemplateSettingsForm";
import { TemplateListManager } from "./TemplateListManager";
import { 
  Building2, 
  Settings as SettingsIcon, 
  FileText, 
  CreditCard, 
  Bell, 
  Plug,
  Clock,
  LayoutGrid,
  CheckCircle2
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SettingsViewProps {
  activeCompany: CompanyInfo | null;
  onUpdated: () => void;
}

// ─── Tab Configuration ──────────────────────────────────────────────────

type SettingsTab = "general" | "templates" | "billing" | "notifications" | "integrations";

const SETTINGS_TABS: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: "general", label: "عام", icon: SettingsIcon },
  { id: "templates", label: "القوالب", icon: FileText },
  { id: "billing", label: "الفواتير", icon: CreditCard },
  { id: "notifications", label: "الإشعارات", icon: Bell },
  { id: "integrations", label: "التكاملات", icon: Plug },
];

// ─── Component ──────────────────────────────────────────────────────────

export function SettingsView({ activeCompany, onUpdated }: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  if (!activeCompany) {
    return (
      <div className="state-empty min-h-[400px]">
        <Building2 className="text-emerald-600 dark:text-emerald-400" />
        <h3>لم يتم اختيار شركة</h3>
        <p>يرجى اختيار شركة من القائمة الجانبية للوصول إلى الإعدادات</p>
      </div>
    );
  }

  // Calculate completion percentage for KPI
  const completionPercent = calculateCompletion(activeCompany);

  return (
    <div className="flex flex-col gap-4 sm:gap-6 animate-fade-in">
      {/* ═══════════════════════════════════════════════════════════════
          SECTION 1: Settings Header with Breadcrumb
         ═══════════════════════════════════════════════════════════════ */}
      <header className="flex flex-col gap-3">
        {/* Breadcrumb navigation */}
        <nav className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
          <span className="hover:text-primary transition-colors duration-120 cursor-pointer">الرئيسية</span>
          <span className="text-border">/</span>
          <span className="text-primary font-medium">الإعدادات</span>
          <span className="text-border">/</span>
          <span className="font-semibold text-foreground">{activeCompany.nameAr || activeCompany.name}</span>
        </nav>

        {/* Title row */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 border border-primary/20">
            <Building2 size={24} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-foreground flex items-center gap-2">
              إعدادات الشركة
            </h1>
            <p className="text-[13px] text-muted-foreground flex items-center gap-1.5">
              <span>{activeCompany.nameAr || activeCompany.name}</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
                <CheckCircle2 size={10} />
                نشط
              </span>
            </p>
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 2: Navigation Tabs (DS v4.0 - 120ms hover transition)
         ═══════════════════════════════════════════════════════════════ */}
      <nav className="flex gap-1 p-1 bg-muted/50 rounded-xl border border-border overflow-x-auto garfix-scroll" role="tablist">
        {SETTINGS_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap",
                "transition-all duration-120 ease-out cursor-pointer",
                "focus-ring",
                isActive
                  ? "bg-primary text-primary-foreground shadow-brand-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-background hover:shadow-brand-xs"
              )}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 3: KPI Summary Cards (.kpi-card)
         ═══════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
        {/* Last Updated Card */}
        <div className="kpi-card hover-lift">
          <div className="flex items-start justify-between">
            <div>
              <p className="kpi-label">آخر تحديث</p>
              <p className="kpi-value text-lg">{formatLastUpdate(activeCompany.updatedAt)}</p>
            </div>
            <div className="p-2.5 rounded-lg bg-primary/10">
              <Clock size={20} className="text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
          <div className="kpi-trend up">
            <span>↑</span>
            <span>محدث</span>
          </div>
        </div>

        {/* Template Count Card */}
        <div className="kpi-card hover-lift">
          <div className="flex items-start justify-between">
            <div>
              <p className="kpi-label">القوالب المتاحة</p>
              <p className="kpi-value text-lg">4</p>
            </div>
            <div className="p-2.5 rounded-lg bg-primary/10">
              <LayoutGrid size={20} className="text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
          <div className="kpi-trend up">
            <span>✓</span>
            <span>جاهز للاستخدام</span>
          </div>
        </div>

        {/* Completion Percentage Card (Gold for premium feel) */}
        <div className="kpi-card-gold hover-lift sm:col-span-2 lg:col-span-1">
          <div className="flex items-start justify-between">
            <div>
              <p className="kpi-label">اكتمال الملف الشخصي</p>
              <p className="kpi-value text-lg">{completionPercent}%</p>
            </div>
            <div className="p-2.5 rounded-lg bg-gold-muted">
              <CheckCircle2 size={20} className="text-gold" />
            </div>
          </div>
          {/* Progress bar */}
          <div className="progress-emerald mt-3">
            <div 
              className="progress-bar" 
              style={{ width: `${completionPercent}%` }}
              role="progressbar"
              aria-valuenow={completionPercent}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          <div className="kpi-badge mt-2">
            ✦ {completionPercent === 100 ? 'مكتمل' : 'يحتاج تحديث'}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 4: Tab Content Panels
         ═══════════════════════════════════════════════════════════════ */}
      <main 
        className="transition-all duration-220 ease-out"
        role="tabpanel"
        key={activeTab}
      >
        {activeTab === "general" && (
          <div className="space-y-4 sm:space-y-6 animate-fade-in">
            <SectionCard title="إعدادات الشركة الأساسية" icon={<Building2 size={18} />}>
              <CompanySettingsForm activeCompany={activeCompany} onUpdated={onUpdated} />
            </SectionCard>
          </div>
        )}

        {activeTab === "templates" && (
          <div className="space-y-4 sm:space-y-6 animate-fade-in">
            <SectionCard title="إعدادات قوالب PDF" icon={<FileText size={18} />}>
              <TemplateSettingsForm companySlug={activeCompany.slug} />
            </SectionCard>
            <SectionCard title="إدارة القوالب الفردية" icon={<LayoutGrid size={18} />}>
              <TemplateListManager companySlug={activeCompany.slug} />
            </SectionCard>
          </div>
        )}

        {(activeTab === "billing" || activeTab === "notifications" || activeTab === "integrations") && (
          <div className="state-empty min-h-[300px]">
            <SettingsIcon className="text-emerald-600 dark:text-emerald-400" />
            <h3>قريباً</h3>
            <p>هذا القسم قيد التطوير وسيكون متاحاً قريباً</p>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Helper Components ─────────────────────────────────────────────────

function SectionCard({ 
  title, 
  icon, 
  children 
}: { 
  title: string; 
  icon: React.ReactNode; 
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden hover-lift shadow-hover">
      {/* Emerald left border accent header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
        <div className="w-1 h-8 rounded-full bg-primary" />
        <span className="text-primary">{icon}</span>
        <h2 className="text-base sm:text-lg font-bold text-foreground">{title}</h2>
      </div>
      <div className="p-4 sm:p-5">
        {children}
      </div>
    </div>
  );
}

// ─── Utility Functions ──────────────────────────────────────────────────

function calculateCompletion(company: CompanyInfo): number {
  let filled = 0;
  let total = 8;
  
  if (company.name) filled++;
  if (company.nameAr) filled++;
  if (company.phone) filled++;
  if (company.email) filled++;
  if (company.address) filled++;
  if (company.vatNumber) filled++;
  if (company.country) filled++;
  if (company.currency) filled++;
  
  return Math.round((filled / total) * 100);
}

function formatLastUpdate(dateStr?: string): string {
  if (!dateStr) return "غير محدد";
  
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "اليوم";
    if (diffDays === 1) return "أمس";
    if (diffDays < 7) return `منذ ${diffDays} أيام`;
    if (diffDays < 30) return `منذ ${Math.floor(diffDays / 7)} أسابيع`;
    return date.toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' });
  } catch {
    return "غير محدد";
  }
}

export default SettingsView;
