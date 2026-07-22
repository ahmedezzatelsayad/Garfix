"use client";

import { useState } from "react";
import { type CompanyInfo } from "@/context/BrandContext";
import { useUpdateSettings } from "@/hooks/queries";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { GULF_COUNTRIES, getCountryConfig, isVatApplicable } from "@/lib/gulfConfig";

// ─── Section helper ─────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", padding: "20px" }}>
      <h3 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "14px" }}>{title}</h3>
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

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 12px", borderRadius: "8px",
    background: "var(--background)", border: "1px solid var(--border)",
    color: "var(--foreground)", fontFamily: "inherit", fontSize: "13px", outline: "none",
  };
  const labelStyle: React.CSSProperties = { display: "block", fontSize: "11px", fontWeight: 600, color: "var(--muted-foreground)", marginBottom: "4px" };

  return (
    <>
      {/* Save button row */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={save}
          disabled={saving}
          style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            padding: "10px 18px", borderRadius: "10px",
            background: "var(--primary)", color: "var(--primary-foreground)",
            border: "none", fontFamily: "inherit", fontSize: "13px", fontWeight: 700,
            cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1,
          }}
        >
          <Save size={14} /> {saving ? "جارٍ الحفظ…" : "حفظ"}
        </button>
      </div>

      {/* Branding */}
      <Section title="الهوية">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
          <div><label style={labelStyle}>الاسم (إنجليزي)</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} dir="ltr" /></div>
          <div><label style={labelStyle}>الاسم (عربي)</label><input value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} style={inputStyle} /></div>
          <div><label style={labelStyle}>الإيموجي</label><input value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} style={{ ...inputStyle, textAlign: "center", fontSize: "18px" }} /></div>
          <div><label style={labelStyle}>اللون</label><input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} style={{ width: "100%", height: "36px", padding: "2px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--background)", cursor: "pointer" }} /></div>
        </div>
      </Section>

      {/* Contact */}
      <Section title="معلومات الاتصال">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
          <div><label style={labelStyle}>الهاتف</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={inputStyle} dir="ltr" /></div>
          <div><label style={labelStyle}>البريد</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inputStyle} dir="ltr" /></div>
          <div><label style={labelStyle}>العنوان</label><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} style={inputStyle} /></div>
          <div>
            <label style={labelStyle}>السجل التجاري</label>
            <input value={form.commercialRegistration} onChange={(e) => setForm({ ...form, commercialRegistration: e.target.value })} style={inputStyle} dir="ltr" placeholder="CR رقم السجل التجاري" />
          </div>
          <div>
            <label style={labelStyle}>
              الرقم الضريبي {isVatApplicable(form.country) ? "" : "(غير مطبق في الكويت)"}
            </label>
            <input
              value={form.vatNumber}
              onChange={(e) => setForm({ ...form, vatNumber: e.target.value })}
              style={{ ...inputStyle, opacity: isVatApplicable(form.country) ? 1 : 0.5 }}
              dir="ltr"
              disabled={!isVatApplicable(form.country)}
              placeholder={isVatApplicable(form.country) ? "VAT رقم" : "غير مطلوب"}
            />
          </div>
        </div>
      </Section>

      {/* Financial — Gulf-aware */}
      <Section title="الإعدادات المالية والضريبية">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
          <div>
            <label style={labelStyle}>الدولة</label>
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
              style={inputStyle}
            >
              {GULF_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>{c.nameAr} ({c.code})</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>العملة</label>
            <input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} style={inputStyle} dir="ltr" />
          </div>
          <div>
            <label style={labelStyle}>
              نسبة الضريبة الافتراضية (%)
              {!isVatApplicable(form.country) && (
                <span style={{ color: "var(--muted-foreground)", fontSize: "10px", marginRight: "6px" }}>
                  (غير مطبق)
                </span>
              )}
            </label>
            <input
              type="number"
              value={form.defaultTaxRate}
              onChange={(e) => setForm({ ...form, defaultTaxRate: e.target.value })}
              style={{ ...inputStyle, opacity: isVatApplicable(form.country) ? 1 : 0.5 }}
              dir="ltr"
              disabled={!isVatApplicable(form.country)}
            />
          </div>
        </div>
        {!isVatApplicable(form.country) && (
          <div style={{ marginTop: "10px", padding: "10px 14px", borderRadius: "8px", background: "var(--accent)", fontSize: "12px", color: "var(--accent-foreground)" }}>
            ℹ️ {getCountryConfig(form.country)?.nameAr} لا تطبق ضريبة القيمة المضافة حالياً. تم تعطيل حقل الضريبة.
          </div>
        )}
      </Section>

      {/* Working Hours — Gulf-aware */}
      <Section title="إعدادات أيام العمل">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
          <div>
            <label style={labelStyle}>عطلة نهاية الأسبوع</label>
            <select
              value={form.weekendDays}
              onChange={(e) => setForm({ ...form, weekendDays: e.target.value })}
              style={inputStyle}
            >
              <option value="[5,6]">الجمعة + السبت (الخليج)</option>
              <option value="[0,6]">الأحد + السبت</option>
              <option value="[5]">الجمعة فقط</option>
              <option value="[6]">السبت فقط</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>ساعات عمل رمضان</label>
            <select
              value={form.ramadanHours ? "true" : "false"}
              onChange={(e) => setForm({ ...form, ramadanHours: e.target.value === "true" })}
              style={inputStyle}
            >
              <option value="false">لا (ساعات عادية)</option>
              <option value="true">نعم (ساعات مخفضة قانونياً)</option>
            </select>
          </div>
        </div>
      </Section>

      {/* AI */}
      <Section title="إعدادات الذكاء الاصطناعي">
        <div><label style={labelStyle}>نموذج OpenRouter</label><input value={form.openrouterModel} onChange={(e) => setForm({ ...form, openrouterModel: e.target.value })} style={inputStyle} dir="ltr" /></div>
      </Section>
    </>
  );
}
