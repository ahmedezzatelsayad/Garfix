// GarfiX DS v4.0 Enhanced — Company Settings Form
// Features: .focus-ring inputs, .active-press buttons, emerald accents, validation states
"use client";

import { useState } from "react";
import { type CompanyInfo } from "@/context/BrandContext";
import { useUpdateSettings } from "@/hooks/queries";
import { toast } from "sonner";
import { 
  Save, 
  X, 
  ChevronDown, 
  ChevronUp,
  CheckCircle2,
  AlertCircle,
  AlertTriangle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GULF_COUNTRIES, getCountryConfig, isVatApplicable } from "@/lib/gulfConfig";

// ─── Collapsible Section Component (DS v4.0) ──────────────────────────

interface CollapsibleSectionProps {
  title: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  validationState?: "none" | "success" | "error" | "warning";
}

function CollapsibleSection({ 
  title, 
  icon, 
  defaultOpen = true, 
  children,
  validationState = "none"
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const validationStyles = {
    none: "",
    success: "border-emerald-500/30 bg-emerald-500/5",
    error: "border-destructive/30 bg-destructive/5",
    warning: "border-amber-500/30 bg-amber-500/5",
  };

  const validationIcons = {
    none: null,
    success: <CheckCircle2 size={14} className="text-emerald-500" />,
    error: <AlertCircle size={14} className="text-destructive" />,
    warning: <AlertTriangle size={14} className="text-amber-500" />,
  };

  return (
    <div className={cn(
      "bg-card rounded-xl border border-border overflow-hidden transition-all duration-250 ease-out hover-lift",
      validationStyles[validationState]
    )}>
      {/* Header with emerald left border accent */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-3 sm:py-3.5",
          "bg-gradient-to-r from-primary/5 to-transparent",
          "hover:from-primary/8 transition-colors duration-120 cursor-pointer",
          "focus-ring rounded-none active-press"
        )}
      >
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 rounded-full bg-primary" />
          <div className="flex items-center gap-2">
            {icon && <span className="text-primary">{icon}</span>}
            <h3 className="text-sm sm:text-[15px] font-bold text-foreground">{title}</h3>
            {validationIcons[validationState]}
          </div>
        </div>
        <span className={cn(
          "text-muted-foreground transition-transform duration-200",
          isOpen && "rotate-180"
        )}>
          <ChevronDown size={18} />
        </span>
      </button>

      {/* Content */}
      <div className={cn(
        "overflow-hidden transition-all duration-250 ease-out",
        isOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
      )}>
        <div className="px-4 sm:px-5 pb-4 sm:pb-5 pt-2">
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface CompanySettingsFormProps {
  activeCompany: CompanyInfo | null;
  onUpdated: () => void;
}

// ─── Input Field Component (DS v4.0) ─────────────────────────────────────

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  dir?: string;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  success?: boolean;
  warning?: boolean;
  className?: string;
}

function FormField({
  label,
  value,
  onChange,
  dir,
  type = "text",
  placeholder,
  disabled = false,
  error,
  success = false,
  warning = false,
  className
}: FieldProps) {
  const [touched, setTouched] = useState(false);
  
  const borderState = error && touched
    ? "border-destructive focus:border-destructive"
    : success && touched
    ? "border-emerald-500 focus:border-emerald-500"
    : warning
    ? "border-amber-500 focus:border-amber-500"
    : "border-border focus:border-primary";

  return (
    <div className={cn("space-y-1", className)}>
      <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setTouched(true)}
        dir={dir}
        disabled={disabled}
        placeholder={placeholder}
        className={cn(
          "w-full py-2.5 px-3.5 rounded-lg bg-background text-foreground font-inherit text-sm",
          "outline-none transition-all duration-120 ease-out",
          "focus-ring",
          borderState,
          disabled && "opacity-50 cursor-not-allowed bg-muted",
          !disabled && "hover:border-primary/40"
        )}
      />
      {/* Validation message */}
      {error && touched && (
        <p className="flex items-center gap-1 text-[11px] text-destructive mt-1">
          <AlertCircle size={10} />
          {error}
        </p>
      )}
      {success && !error && touched && (
        <p className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 mt-1">
          <CheckCircle2 size={10} />
          صحيح
        </p>
      )}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export function CompanySettingsForm({ activeCompany, onUpdated }: CompanySettingsFormProps) {
  const [form, setForm] = useState({
    name: "", nameAr: "", emoji: "", color: "#047857",
    phone: "", email: "", address: "", vatNumber: "",
    commercialRegistration: "",
    currency: "KWD", country: "KW", defaultTaxRate: "0",
    openrouterModel: "anthropic/claude-3.5-haiku",
    weekendDays: "[5,6]", ramadanHours: false,
  });

  // Sync form when activeCompany changes (render-time adjustment, no cascading render).
  const [prevCompany, setPrevCompany] = useState(activeCompany);
  if (activeCompany !== prevCompany) {
    setPrevCompany(activeCompany);
    if (activeCompany) {
      const countryConfig = getCountryConfig(activeCompany.country);
      setForm({
        name: activeCompany.name || "",
        nameAr: activeCompany.nameAr || "",
        emoji: activeCompany.emoji || "🏢",
        color: activeCompany.color || "#047857",
        phone: activeCompany.phone || "",
        email: activeCompany.email || "",
        address: activeCompany.address || "",
        vatNumber: activeCompany.vatNumber || "",
        commercialRegistration: "",
        currency: activeCompany.currency || countryConfig?.currency || "KWD",
        country: activeCompany.country || "KW",
        defaultTaxRate: activeCompany.defaultTaxRate || countryConfig?.defaultTaxRate || "0",
        openrouterModel: "anthropic/claude-3.5-haiku",
        weekendDays: "[5,6]", ramadanHours: false,
      });
    }
  }

  const updateSettings = useUpdateSettings();

  // Validate form before save
  const validateForm = (): boolean => {
    if (!form.name.trim()) {
      toast.error("اسم الشركة (إنجليزي) مطلوب");
      return false;
    }
    if (!form.nameAr.trim()) {
      toast.error("اسم الشركة (عربي) مطلوب");
      return false;
    }
    return true;
  };

  const save = async () => {
    if (!validateForm()) return;
    
    try {
      await updateSettings.mutateAsync({ slug: activeCompany!.slug, ...form });
      toast.success("تم حفظ الإعدادات بنجاح");
      onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ في حفظ الإعدادات");
    }
  };

  const saving = updateSettings.isPending;

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ═══ Action Buttons Row ═══ */}
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => {
            // Reset form logic could go here
            toast.info("تم إلغاء التغييرات");
          }}
          className={cn(
            "inline-flex items-center gap-1.5 py-2.5 px-5 rounded-lg",
            "bg-transparent border border-border text-muted-foreground",
            "font-inherit text-sm font-semibold",
            "hover:bg-muted hover:text-foreground hover:border-primary/30",
            "transition-all duration-150 ease-out cursor-pointer",
            "focus-ring active-press"
          )}
        >
          <X size={14} />
          إلغاء
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className={cn(
            "inline-flex items-center gap-2 py-2.5 px-6 rounded-lg",
            "gradient-primary text-white border-none",
            "font-inherit text-sm font-bold shadow-brand-sm",
            "hover:gradient-primary-hover hover:shadow-brand-md",
            "transition-all duration-150 ease-out cursor-pointer",
            "focus-ring active-press",
            saving && "opacity-70 cursor-not-allowed"
          )}
        >
          {saving ? (
            <>
              <span className="state-loading-spinner !w-4 !h-4 !border-2" />
              جارٍ الحفظ…
            </>
          ) : (
            <>
              <Save size={16} />
              حفظ الإعدادات
            </>
          )}
        </button>
      </div>

      {/* ═══ Branding Section ═══ */}
      <CollapsibleSection 
        title="الهوية والعلامة التجارية" 
        defaultOpen={true}
        validationState={form.name && form.nameAr ? "success" : "none"}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
          <FormField
            label="الاسم (إنجليزي)"
            value={form.name}
            onChange={(v) => setForm({ ...form, name: v })}
            dir="ltr"
            error={!form.name ? "مطلوب" : undefined}
            success={!!form.name}
            placeholder="Company Name"
          />
          <FormField
            label="الاسم (عربي)"
            value={form.nameAr}
            onChange={(v) => setForm({ ...form, nameAr: v })}
            error={!form.nameAr ? "مطلوب" : undefined}
            success={!!form.nameAr}
            placeholder="اسم الشركة"
          />
          <FormField
            label="الإيموجي"
            value={form.emoji}
            onChange={(v) => setForm({ ...form, emoji: v })}
            className="text-center"
          />
          <div className="space-y-1">
            <label className="block text-[11px] font-semibold text-muted-foreground mb-1">اللون الرئيسي</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="w-12 h-10 rounded-lg border border-border bg-background cursor-pointer focus-ring transition-all duration-120"
              />
              <input
                type="text"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="flex-1 py-2.5 px-3.5 rounded-lg bg-background border border-border text-sm font-mono focus-ring transition-all duration-120"
                dir="ltr"
                maxLength={7}
              />
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* ═══ Contact Information Section ═══ */}
      <CollapsibleSection 
        title="معلومات الاتصال"
        defaultOpen={true}
        icon={<span>📞</span>}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
          <FormField
            label="الهاتف"
            value={form.phone}
            onChange={(v) => setForm({ ...form, phone: v })}
            dir="ltr"
            placeholder="+965 XXXX XXXX"
            success={!!form.phone}
          />
          <FormField
            label="البريد الإلكتروني"
            value={form.email}
            onChange={(v) => setForm({ ...form, email: v })}
            dir="ltr"
            type="email"
            placeholder="email@company.com"
            success={!!form.email}
          />
          <FormField
            label="العنوان"
            value={form.address}
            onChange={(v) => setForm({ ...form, address: v })}
            placeholder="العنوان الكامل"
            success={!!form.address}
          />
          <FormField
            label="السجل التجاري"
            value={form.commercialRegistration}
            onChange={(v) => setForm({ ...form, commercialRegistration: v })}
            dir="ltr"
            placeholder="CR رقم السجل التجاري"
          />
          <FormField
            label={
              <span className="flex items-center gap-1.5">
                الرقم الضريبي (VAT)
                {!isVatApplicable(form.country) && (
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-normal">
                    (غير مطبق)
                  </span>
                )}
              </span>
            }
            value={form.vatNumber}
            onChange={(v) => setForm({ ...form, vatNumber: v })}
            dir="ltr"
            disabled={!isVatApplicable(form.country)}
            placeholder={isVatApplicable(form.country) ? "VAT رقم" : "غير مطلوب"}
            warning={isVatApplicable(form.country) && !form.vatNumber}
          />
        </div>
      </CollapsibleSection>

      {/* ═══ Financial & Tax Section (Gulf-aware) ═══ */}
      <CollapsibleSection 
        title="الإعدادات المالية والضريبية"
        icon={<span>💰</span>}
        validationState={!isVatApplicable(form.country) ? "warning" : "none"}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
          <div className="space-y-1">
            <label className="block text-[11px] font-semibold text-muted-foreground mb-1">الدولة</label>
            <select
              value={form.country}
              onChange={(e) => {
                const code = e.target.value;
                const config = getCountryConfig(code);
                setForm({
                  ...form,
                  country: code,
                  currency: config?.currency || form.currency,
                  defaultTaxRate: config?.defaultTaxRate || "0",
                });
              }}
              className={cn(
                "w-full py-2.5 px-3.5 rounded-lg bg-background border border-border",
                "text-foreground font-inherit text-sm outline-none cursor-pointer",
                "focus-ring transition-all duration-120",
                "hover:border-primary/40"
              )}
            >
              {GULF_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>{c.nameAr} ({c.code})</option>
              ))}
            </select>
          </div>
          <FormField
            label="العملة"
            value={form.currency}
            onChange={(v) => setForm({ ...form, currency: v })}
            dir="ltr"
          />
          <FormField
            label={
              <span className="flex items-center gap-1.5">
                نسبة الضريبة الافتراضية (%)
                {!isVatApplicable(form.country) && (
                  <span className="text-[10px] text-muted-foreground font-normal">(غير مطبق)</span>
                )}
              </span>
            }
            value={form.defaultTaxRate}
            onChange={(v) => setForm({ ...form, defaultTaxRate: v })}
            type="number"
            dir="ltr"
            disabled={!isVatApplicable(form.country)}
          />
        </div>
        
        {/* VAT Info Banner */}
        {!isVatApplicable(form.country) && (
          <div className="mt-4 flex items-start gap-3 p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs sm:text-[13px] text-amber-700 dark:text-amber-400">
              ℹ️ {getCountryConfig(form.country)?.nameAr} لا تطبق ضريبة القيمة المضافة حالياً. تم تعطيل حقل الضريبة تلقائياً.
            </p>
          </div>
        )}
      </CollapsibleSection>

      {/* ═══ Working Hours Section (Gulf-aware) ═══ */}
      <CollapsibleSection 
        title="إعدادات أيام العمل"
        icon={<span>📅</span>}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
          <div className="space-y-1">
            <label className="block text-[11px] font-semibold text-muted-foreground mb-1">عطلة نهاية الأسبوع</label>
            <select
              value={form.weekendDays}
              onChange={(e) => setForm({ ...form, weekendDays: e.target.value })}
              className={cn(
                "w-full py-2.5 px-3.5 rounded-lg bg-background border border-border",
                "text-foreground font-inherit text-sm outline-none cursor-pointer",
                "focus-ring transition-all duration-120",
                "hover:border-primary/40"
              )}
            >
              <option value="[5,6]">الجمعة + السبت (الخليج)</option>
              <option value="[0,6]">الأحد + السبت</option>
              <option value="[5]">الجمعة فقط</option>
              <option value="[6]">السبت فقط</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] font-semibold text-muted-foreground mb-1">ساعات عمل رمضان</label>
            <select
              value={form.ramadanHours ? "true" : "false"}
              onChange={(e) => setForm({ ...form, ramadanHours: e.target.value === "true" })}
              className={cn(
                "w-full py-2.5 px-3.5 rounded-lg bg-background border border-border",
                "text-foreground font-inherit text-sm outline-none cursor-pointer",
                "focus-ring transition-all duration-120",
                "hover:border-primary/40"
              )}
            >
              <option value="false">لا (ساعات عادية)</option>
              <option value="true">نعم (ساعات مخفضة قانونياً)</option>
            </select>
          </div>
        </div>
      </CollapsibleSection>

      {/* ═══ AI Settings Section ═══ */}
      <CollapsibleSection 
        title="إعدادات الذكاء الاصطناعي"
        icon={<span>🤖</span>}
        defaultOpen={false}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
          <FormField
            label="نموذج OpenRouter"
            value={form.openrouterModel}
            onChange={(v) => setForm({ ...form, openrouterModel: v })}
            dir="ltr"
            placeholder="anthropic/claude-3.5-haiku"
          />
        </div>
        <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/10">
          <span className="ai-badge">AI</span>
          <p className="text-xs text-muted-foreground">
            يتم استخدام هذا النموذج لإنشاء المحتوى الذكي في الفواتير
          </p>
        </div>
      </CollapsibleSection>
    </div>
  );
}
