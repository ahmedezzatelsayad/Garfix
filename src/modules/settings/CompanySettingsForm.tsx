// Responsive: sm/md/lg breakpoints added
"use client";

import { useState } from "react";
import { type CompanyInfo } from "@/context/BrandContext";
import { useUpdateSettings } from "@/hooks/queries";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { GULF_COUNTRIES, getCountryConfig, isVatApplicable } from "@/lib/gulfConfig";

// ─── Section helper ─────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-[14px] border border-border p-4 sm:p-5">
      <h3 className="text-sm sm:text-[15px] font-bold mb-3 sm:mb-[14px]">{title}</h3>
      {children}
    </div>
  );
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface CompanySettingsFormProps {
  activeCompany: CompanyInfo | null;
  onUpdated: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function CompanySettingsForm({ activeCompany, onUpdated }: CompanySettingsFormProps) {
  const [form, setForm] = useState({
    name: "", nameAr: "", emoji: "", color: "#7c3aed",
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
        color: activeCompany.color || "#7c3aed",
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

  const save = async () => {
    try {
      await updateSettings.mutateAsync({ slug: activeCompany!.slug, ...form });
      toast.success("تم حفظ الإعدادات");
      onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    }
  };

  const saving = updateSettings.isPending;

  const inputClass = "w-full py-2 sm:py-[8px] px-3 sm:px-[12px] rounded-[8px] bg-background border border-border text-foreground font-inherit text-sm sm:text-[13px] outline-none";
  const labelClass = "block text-[11px] font-semibold text-muted-foreground mb-1";

  return (
    <>
      {/* Save button row */}
      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className={cn("inline-flex items-center gap-1.5 sm:gap-[6px] py-2 sm:py-[10px] px-4 sm:px-[18px] rounded-[10px] bg-primary text-primary-foreground border-none font-inherit text-sm sm:text-[13px] font-bold", saving && "opacity-70 cursor-not-allowed")}
        >
          <Save size={14} /> {saving ? "جارٍ الحفظ…" : "حفظ"}
        </button>
      </div>

      {/* Branding */}
      <Section title="الهوية">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3 sm:gap-[12px]">
          <div><label className={labelClass}>الاسم (إنجليزي)</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} dir="ltr" /></div>
          <div><label className={labelClass}>الاسم (عربي)</label><input value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} className={inputClass} /></div>
          <div><label className={labelClass}>الإيموجي</label><input value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} className={`${inputClass} text-center text-lg`} /></div>
          <div><label className={labelClass}>اللون</label><input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="w-full h-9 rounded-[8px] border border-border bg-background cursor-pointer" /></div>
        </div>
      </Section>

      {/* Contact */}
      <Section title="معلومات الاتصال">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3 sm:gap-[12px]">
          <div><label className={labelClass}>الهاتف</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputClass} dir="ltr" /></div>
          <div><label className={labelClass}>البريد</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} dir="ltr" /></div>
          <div><label className={labelClass}>العنوان</label><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputClass} /></div>
          <div>
            <label className={labelClass}>السجل التجاري</label>
            <input value={form.commercialRegistration} onChange={(e) => setForm({ ...form, commercialRegistration: e.target.value })} className={inputClass} dir="ltr" placeholder="CR رقم السجل التجاري" />
          </div>
          <div>
            <label className={labelClass}>
              الرقم الضريبي {isVatApplicable(form.country) ? "" : "(غير مطبق في الكويت)"}
            </label>
            <input
              value={form.vatNumber}
              onChange={(e) => setForm({ ...form, vatNumber: e.target.value })}
              className={cn(inputClass, isVatApplicable(form.country) ? "" : "opacity-50")}
              dir="ltr"
              disabled={!isVatApplicable(form.country)}
              placeholder={isVatApplicable(form.country) ? "VAT رقم" : "غير مطلوب"}
            />
          </div>
        </div>
      </Section>

      {/* Financial — Gulf-aware */}
      <Section title="الإعدادات المالية والضريبية">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3 sm:gap-[12px]">
          <div>
            <label className={labelClass}>الدولة</label>
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
              className={inputClass}
            >
              {GULF_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>{c.nameAr} ({c.code})</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>العملة</label>
            <input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className={inputClass} dir="ltr" />
          </div>
          <div>
            <label className={labelClass}>
              نسبة الضريبة الافتراضية (%)
              {!isVatApplicable(form.country) && (
                <span className="text-muted-foreground text-[10px] mr-1.5">
                  (غير مطبق)
                </span>
              )}
            </label>
            <input
              type="number"
              value={form.defaultTaxRate}
              onChange={(e) => setForm({ ...form, defaultTaxRate: e.target.value })}
              className={cn(inputClass, isVatApplicable(form.country) ? "" : "opacity-50")}
              dir="ltr"
              disabled={!isVatApplicable(form.country)}
            />
          </div>
        </div>
        {!isVatApplicable(form.country) && (
          <div className="mt-2.5 p-2.5 sm:p-[10px_14px] rounded-[8px] bg-accent text-xs sm:text-[12px] text-accent-foreground">
            ℹ️ {getCountryConfig(form.country)?.nameAr} لا تطبق ضريبة القيمة المضافة حالياً. تم تعطيل حقل الضريبة.
          </div>
        )}
      </Section>

      {/* Working Hours — Gulf-aware */}
      <Section title="إعدادات أيام العمل">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3 sm:gap-[12px]">
          <div>
            <label className={labelClass}>عطلة نهاية الأسبوع</label>
            <select
              value={form.weekendDays}
              onChange={(e) => setForm({ ...form, weekendDays: e.target.value })}
              className={inputClass}
            >
              <option value="[5,6]">الجمعة + السبت (الخليج)</option>
              <option value="[0,6]">الأحد + السبت</option>
              <option value="[5]">الجمعة فقط</option>
              <option value="[6]">السبت فقط</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>ساعات عمل رمضان</label>
            <select
              value={form.ramadanHours ? "true" : "false"}
              onChange={(e) => setForm({ ...form, ramadanHours: e.target.value === "true" })}
              className={inputClass}
            >
              <option value="false">لا (ساعات عادية)</option>
              <option value="true">نعم (ساعات مخفضة قانونياً)</option>
            </select>
          </div>
        </div>
      </Section>

      {/* AI */}
      <Section title="إعدادات الذكاء الاصطناعي">
        <div><label className={labelClass}>نموذج OpenRouter</label><input value={form.openrouterModel} onChange={(e) => setForm({ ...form, openrouterModel: e.target.value })} className={inputClass} dir="ltr" /></div>
      </Section>
    </>
  );
}
