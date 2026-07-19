"use client";

import { useState, useEffect } from "react";
import { useBrand, type CompanyInfo } from "@/context/BrandContext";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import { Save, Building2, FileText, Palette, Type, LayoutTemplate, Stamp, CreditCard, ImageIcon, Plus, Pencil, Trash2, X } from "lucide-react";
import { GULF_COUNTRIES, getCountryConfig, isVatApplicable } from "@/lib/gulfConfig";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";

// ─── Individual Invoice Template type (matches DB row from /api/invoice-templates GET) ───
interface InvoiceTemplateRow {
  id: number;
  companySlug: string;
  name: string;
  isDefault: boolean;
  layoutType: string;
  primaryColor: string;
  fontFamily: string;
  logoPosition: string;
  showTaxNumber: boolean;
  showQrCode: boolean;
  showBankDetails: boolean;
  footerText?: string | null;
  termsAndConditions?: string | null;
  paperSize: string;
  createdAt: string;
}

const LAYOUT_TYPES = [
  { id: "classic", label: "كلاسيكي" },
  { id: "modern", label: "عصري" },
  { id: "minimal", label: "بسيط" },
  { id: "thermal", label: "حراري" },
] as const;

const PAPER_SIZES = [
  { id: "A4", label: "A4" },
  { id: "Thermal80mm", label: "حراري 80mm" },
] as const;

const LOGO_POSITIONS = [
  { id: "right", label: "يمين" },
  { id: "left", label: "يسار" },
  { id: "center", label: "وسط" },
] as const;

// ─── Template preview card descriptions ────────────────────────────────────────
const TEMPLATES = [
  { id: "classic", label: "كلاسيكي", desc: "تصميم تقليدي بإطار أنيق", icon: "📄" },
  { id: "modern", label: "عصري", desc: "تصميم حديث ونظيف", icon: "✨" },
  { id: "minimal", label: "بسيط", desc: "تصميم بسيط بدون زخارف", icon: "◻️" },
  { id: "arabic-rtl", label: "عربي RTL", desc: "تصميم مُحسّن للعربية", icon: "🔤" },
] as const;

const FONTS = [
  { id: "Noto Sans SC", label: "Noto Sans SC" },
  { id: "Cairo", label: "Cairo" },
  { id: "Tajawal", label: "Tajawal" },
  { id: "IBM Plex Sans Arabic", label: "IBM Plex Sans Arabic" },
  { id: "Almarai", label: "Almarai" },
] as const;

const INVOICE_TYPE_OPTIONS = [
  { id: "sales", label: "فاتورة مبيعات" },
  { id: "purchase", label: "فاتورة مشتريات" },
  { id: "quote", label: "عرض سعر" },
] as const;

interface TemplateSettingsForm {
  templateId: string;
  primaryColor: string;
  fontFamily: string;
  fontSize: number;
  showLogo: boolean;
  logoPosition: string;
  showPaymentInfo: boolean;
  showStamp: boolean;
  invoiceTypes: string[];
}

const defaultTemplateSettings: TemplateSettingsForm = {
  templateId: "modern",
  primaryColor: "#7C3AED",
  fontFamily: "Noto Sans SC",
  fontSize: 12,
  showLogo: true,
  logoPosition: "right",
  showPaymentInfo: true,
  showStamp: false,
  invoiceTypes: ["sales", "purchase", "quote"],
};

interface SettingsViewProps {
  activeCompany: CompanyInfo | null;
  onUpdated: () => void;
}

export function SettingsView({ activeCompany, onUpdated }: SettingsViewProps) {
  const [form, setForm] = useState({
    name: "", nameAr: "", emoji: "", color: "#7c3aed",
    phone: "", email: "", address: "", vatNumber: "",
    commercialRegistration: "",
    currency: "KWD", country: "KW", defaultTaxRate: "0",
    openrouterModel: "anthropic/claude-3.5-haiku",
    weekendDays: "[5,6]", ramadanHours: false,
  });
  const [saving, setSaving] = useState(false);

  // ─── PDF Template Settings state ──────────────────────────────────────
  const [templateForm, setTemplateForm] = useState<TemplateSettingsForm>(defaultTemplateSettings);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateLoaded, setTemplateLoaded] = useState(false);

  // ─── Individual Invoice Templates list state (Item 1: edit/delete) ────
  const [templates, setTemplates] = useState<InvoiceTemplateRow[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<InvoiceTemplateRow | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<InvoiceTemplateRow | null>(null);
  const [editForm, setEditForm] = useState<{
    name: string; layoutType: string; primaryColor: string; fontFamily: string;
    logoPosition: string; paperSize: string; isDefault: boolean;
    showTaxNumber: boolean; showQrCode: boolean; showBankDetails: boolean;
    footerText: string; termsAndConditions: string;
  }>({
    name: "", layoutType: "classic", primaryColor: "#7c3aed", fontFamily: "Cairo",
    logoPosition: "right", paperSize: "A4", isDefault: false,
    showTaxNumber: true, showQrCode: false, showBankDetails: false,
    footerText: "", termsAndConditions: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [creatingNew, setCreatingNew] = useState(false);

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
      setTemplateLoaded(false);
    }
  }

  // ─── Fetch template settings when company changes ─────────────────────
  useEffect(() => {
    if (!activeCompany) return;
    let cancelled = false;
    authedFetch(`/api/invoice-templates?companySlug=${activeCompany.slug}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data.templates)) {
          setTemplates(data.templates);
        }
        if (data.templateSettings) {
          const s = data.templateSettings;
          setTemplateForm({
            templateId: s.templateId || "modern",
            primaryColor: s.primaryColor || "#7C3AED",
            fontFamily: s.fontFamily || "Noto Sans SC",
            fontSize: s.fontSize || 12,
            showLogo: s.showLogo ?? true,
            logoPosition: s.logoPosition || "right",
            showPaymentInfo: s.showPaymentInfo ?? true,
            showStamp: s.showStamp ?? false,
            invoiceTypes: s.invoiceTypes ? s.invoiceTypes.split(",").filter(Boolean) : ["sales", "purchase", "quote"],
          });
        } else {
          setTemplateForm(defaultTemplateSettings);
        }
        setTemplateLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setTemplateForm(defaultTemplateSettings);
          setTemplates([]);
          setTemplateLoaded(true);
        }
      });
    return () => { cancelled = true; };
  }, [activeCompany]);

  if (!activeCompany) {
    return <div style={{ padding: "48px", textAlign: "center", color: "var(--muted-foreground)" }}>اختر شركة أولاً</div>;
  }

  const save = async () => {
    setSaving(true);
    try {
      const res = await authedFetch(`/api/companies/${activeCompany.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      toast.success("تم حفظ الإعدادات");
      onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setSaving(false);
    }
  };

  // ─── Save template settings ──────────────────────────────────────────
  const saveTemplateSettings = async () => {
    setSavingTemplate(true);
    try {
      const res = await authedFetch("/api/invoice-templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companySlug: activeCompany.slug,
          ...templateForm,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "فشل الحفظ");
      }
      toast.success("تم حفظ إعدادات القالب");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setSavingTemplate(false);
    }
  };

  // ─── Toggle invoice type in the multi-select ─────────────────────────
  const toggleInvoiceType = (typeId: string) => {
    setTemplateForm((prev) => {
      const exists = prev.invoiceTypes.includes(typeId);
      const next = exists
        ? prev.invoiceTypes.filter((t) => t !== typeId)
        : [...prev.invoiceTypes, typeId];
      return { ...prev, invoiceTypes: next };
    });
  };

  // ─── Item 1: Individual Invoice Templates (create / edit / delete) ────
  const reloadTemplates = async () => {
    try {
      const res = await authedFetch(`/api/invoice-templates?companySlug=${activeCompany.slug}`);
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.templates)) setTemplates(data.templates);
    } catch { /* silent */ }
  };

  const openEditDialog = (t: InvoiceTemplateRow) => {
    setCreatingNew(false);
    setEditingTemplate(t);
    setEditForm({
      name: t.name || "",
      layoutType: t.layoutType || "classic",
      primaryColor: t.primaryColor || "#7c3aed",
      fontFamily: t.fontFamily || "Cairo",
      logoPosition: t.logoPosition || "right",
      paperSize: t.paperSize || "A4",
      isDefault: !!t.isDefault,
      showTaxNumber: t.showTaxNumber ?? true,
      showQrCode: t.showQrCode ?? false,
      showBankDetails: t.showBankDetails ?? false,
      footerText: t.footerText || "",
      termsAndConditions: t.termsAndConditions || "",
    });
  };

  const openCreateDialog = () => {
    setCreatingNew(true);
    setEditingTemplate(null);
    setEditForm({
      name: "", layoutType: "classic", primaryColor: "#7c3aed", fontFamily: "Cairo",
      logoPosition: "right", paperSize: "A4", isDefault: false,
      showTaxNumber: true, showQrCode: false, showBankDetails: false,
      footerText: "", termsAndConditions: "",
    });
  };

  const submitEdit = async () => {
    if (!editForm.name.trim()) { toast.error("الاسم مطلوب"); return; }
    setSavingEdit(true);
    try {
      const url = creatingNew
        ? "/api/invoice-templates"
        : `/api/invoice-templates/${editingTemplate!.id}`;
      const method = creatingNew ? "POST" : "PATCH";
      const body: Record<string, unknown> = {
        companySlug: activeCompany.slug,
        name: editForm.name.trim(),
        layoutType: editForm.layoutType,
        primaryColor: editForm.primaryColor,
        fontFamily: editForm.fontFamily,
        logoPosition: editForm.logoPosition,
        paperSize: editForm.paperSize,
        isDefault: editForm.isDefault,
        showTaxNumber: editForm.showTaxNumber,
        showQrCode: editForm.showQrCode,
        showBankDetails: editForm.showBankDetails,
        footerText: editForm.footerText || null,
        termsAndConditions: editForm.termsAndConditions || null,
      };
      const res = await authedFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "فشل الحفظ");
      }
      toast.success(creatingNew ? "تم إنشاء القالب" : "تم تحديث القالب");
      setEditingTemplate(null);
      setCreatingNew(false);
      await reloadTemplates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setSavingEdit(false);
    }
  };

  const confirmDelete = async () => {
    if (!deletingTemplate) return;
    setDeleting(true);
    try {
      const res = await authedFetch(
        `/api/invoice-templates/${deletingTemplate.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "فشل الحذف");
      }
      toast.success("تم حذف القالب");
      setDeletingTemplate(null);
      await reloadTemplates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setDeleting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 12px", borderRadius: "8px",
    background: "var(--background)", border: "1px solid var(--border)",
    color: "var(--foreground)", fontFamily: "inherit", fontSize: "13px", outline: "none",
  };
  const labelStyle: React.CSSProperties = { display: "block", fontSize: "11px", fontWeight: 600, color: "var(--muted-foreground)", marginBottom: "4px" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 800, display: "flex", alignItems: "center", gap: "8px" }}>
            <Building2 size={20} /> إعدادات الشركة
          </h1>
          <p style={{ fontSize: "13px", color: "var(--muted-foreground)" }}>{activeCompany.nameAr || activeCompany.name}</p>
        </div>
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

      {/* ═══════════════════════════════════════════════════════════════════
          PDF Template Settings Section
          ═══════════════════════════════════════════════════════════════════ */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText size={18} className="text-primary" />
            إعدادات قوالب PDF
          </CardTitle>
          <CardDescription>
            خصّص مظهر الفواتير وعروض الأسعار المطبوعة كـ PDF
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!templateLoaded ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              جارٍ التحميل...
            </div>
          ) : (
            <>
              {/* ── Template selector ─────────────────────────────────── */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <LayoutTemplate size={14} /> اختر القالب
                </Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTemplateForm((p) => ({ ...p, templateId: t.id }))}
                      className={`relative flex flex-col items-center gap-1.5 rounded-xl border-2 p-4 transition-all cursor-pointer text-center ${
                        templateForm.templateId === t.id
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border hover:border-primary/40 hover:bg-muted/50"
                      }`}
                    >
                      <span className="text-2xl">{t.icon}</span>
                      <span className="text-sm font-bold">{t.label}</span>
                      <span className="text-[10px] text-muted-foreground leading-tight">{t.desc}</span>
                      {templateForm.templateId === t.id && (
                        <span className="absolute top-1.5 left-1.5 h-2 w-2 rounded-full bg-primary" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Color + Font row ──────────────────────────────────── */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Primary color */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <Palette size={14} /> اللون الرئيسي
                  </Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={templateForm.primaryColor}
                      onChange={(e) => setTemplateForm((p) => ({ ...p, primaryColor: e.target.value }))}
                      className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-border bg-background p-0.5"
                    />
                    <input
                      type="text"
                      value={templateForm.primaryColor}
                      onChange={(e) => setTemplateForm((p) => ({ ...p, primaryColor: e.target.value }))}
                      className="h-9 flex-1 rounded-md border border-border bg-background px-3 text-sm font-mono"
                      dir="ltr"
                      maxLength={7}
                    />
                  </div>
                </div>

                {/* Font family */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <Type size={14} /> نوع الخط
                  </Label>
                  <Select
                    value={templateForm.fontFamily}
                    onValueChange={(v) => setTemplateForm((p) => ({ ...p, fontFamily: v }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FONTS.map((f) => (
                        <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Font size */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground">
                    حجم الخط ({templateForm.fontSize}px)
                  </Label>
                  <input
                    type="range"
                    min={8}
                    max={24}
                    step={1}
                    value={templateForm.fontSize}
                    onChange={(e) => setTemplateForm((p) => ({ ...p, fontSize: Number(e.target.value) }))}
                    className="w-full accent-primary"
                  />
                </div>
              </div>

              {/* ── Toggle switches ───────────────────────────────────── */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Show Logo */}
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <Label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground cursor-pointer">
                    <ImageIcon size={14} /> إظهار الشعار
                  </Label>
                  <Switch
                    checked={templateForm.showLogo}
                    onCheckedChange={(v) => setTemplateForm((p) => ({ ...p, showLogo: v }))}
                  />
                </div>

                {/* Show Payment Info */}
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <Label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground cursor-pointer">
                    <CreditCard size={14} /> معلومات الدفع
                  </Label>
                  <Switch
                    checked={templateForm.showPaymentInfo}
                    onCheckedChange={(v) => setTemplateForm((p) => ({ ...p, showPaymentInfo: v }))}
                  />
                </div>

                {/* Show Stamp */}
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <Label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground cursor-pointer">
                    <Stamp size={14} /> إظهار الختم
                  </Label>
                  <Switch
                    checked={templateForm.showStamp}
                    onCheckedChange={(v) => setTemplateForm((p) => ({ ...p, showStamp: v }))}
                  />
                </div>
              </div>

              {/* ── Logo position ─────────────────────────────────────── */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">موضع الشعار</Label>
                <div className="flex gap-2">
                  {(["right", "center", "left"] as const).map((pos) => {
                    const labels: Record<string, string> = { right: "يمين", center: "وسط", left: "يسار" };
                    return (
                      <button
                        key={pos}
                        type="button"
                        onClick={() => setTemplateForm((p) => ({ ...p, logoPosition: pos }))}
                        className={`flex-1 rounded-lg border-2 py-2 text-sm font-medium transition-all cursor-pointer ${
                          templateForm.logoPosition === pos
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border hover:border-primary/40"
                        }`}
                      >
                        {labels[pos]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Invoice types multi-select ─────────────────────────── */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground">أنواع الفواتير المطبّق عليها القالب</Label>
                <div className="flex flex-wrap gap-3">
                  {INVOICE_TYPE_OPTIONS.map((opt) => (
                    <label
                      key={opt.id}
                      className="flex items-center gap-2 cursor-pointer rounded-lg border border-border px-3 py-2 transition-all hover:bg-muted/50 has-[button[data-state=checked]]:border-primary has-[button[data-state=checked]]:bg-primary/5"
                    >
                      <Checkbox
                        checked={templateForm.invoiceTypes.includes(opt.id)}
                        onCheckedChange={() => toggleInvoiceType(opt.id)}
                      />
                      <span className="text-sm">{opt.label}</span>
                    </label>
                  ))}
                </div>
                {templateForm.invoiceTypes.length === 0 && (
                  <p className="text-xs text-destructive">يجب اختيار نوع فاتورة واحد على الأقل</p>
                )}
              </div>

              {/* ── Save button ───────────────────────────────────────── */}
              <div className="flex justify-end pt-2">
                <Button
                  onClick={saveTemplateSettings}
                  disabled={savingTemplate || templateForm.invoiceTypes.length === 0}
                  className="gap-2"
                >
                  <Save size={14} />
                  {savingTemplate ? "جارٍ الحفظ…" : "حفظ إعدادات القالب"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════════════════════
          Item 1: Individual Invoice Templates Manager (list / create / edit / delete)
          Calls PATCH /api/invoice-templates/[id] and DELETE /api/invoice-templates/[id]
          ═══════════════════════════════════════════════════════════════════ */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center gap-3 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <LayoutTemplate size={18} className="text-primary" />
                إدارة القوالب الفردية
              </CardTitle>
              <CardDescription>
                قوالب الفواتير المسجّلة في قاعدة البيانات — تعديل وحذف كل قالب على حدة
              </CardDescription>
            </div>
            <Button onClick={openCreateDialog} size="sm" className="gap-1.5">
              <Plus size={14} /> قالب جديد
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!templateLoaded ? (
            <div className="py-8 text-center text-muted-foreground text-sm">جارٍ التحميل…</div>
          ) : templates.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
              <FileText size={28} className="opacity-30" />
              <div>لا توجد قوالب فردية بعد — أنشئ أول قالب.</div>
            </div>
          ) : (
            <div className="overflow-x-auto garfix-scroll">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted">
                    <th className="text-start px-3 py-2.5 text-[11px] font-semibold text-muted-foreground">الاسم</th>
                    <th className="text-start px-3 py-2.5 text-[11px] font-semibold text-muted-foreground">التصميم</th>
                    <th className="text-start px-3 py-2.5 text-[11px] font-semibold text-muted-foreground">اللون</th>
                    <th className="text-start px-3 py-2.5 text-[11px] font-semibold text-muted-foreground">الخط</th>
                    <th className="text-start px-3 py-2.5 text-[11px] font-semibold text-muted-foreground">الحجم</th>
                    <th className="text-start px-3 py-2.5 text-[11px] font-semibold text-muted-foreground">افتراضي</th>
                    <th className="text-start px-3 py-2.5 text-[11px] font-semibold text-muted-foreground">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((t) => (
                    <tr key={t.id} className="border-b border-border hover:bg-muted/40">
                      <td className="px-3 py-2.5 font-bold">{t.name}</td>
                      <td className="px-3 py-2.5">{LAYOUT_TYPES.find((l) => l.id === t.layoutType)?.label || t.layoutType}</td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="inline-block w-4 h-4 rounded-full border border-border" style={{ background: t.primaryColor }} />
                          <span className="font-mono text-[11px]" dir="ltr">{t.primaryColor}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs">{t.fontFamily}</td>
                      <td className="px-3 py-2.5 text-xs">{t.paperSize}</td>
                      <td className="px-3 py-2.5">
                        {t.isDefault ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: "#10b98120", color: "#10b981" }}>
                            افتراضي
                          </span>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => openEditDialog(t)}
                            title="تعديل"
                            className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-border hover:bg-primary/10 hover:border-primary/40 transition-colors cursor-pointer"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => setDeletingTemplate(t)}
                            title="حذف"
                            className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-border hover:bg-destructive/10 hover:border-destructive/40 hover:text-destructive transition-colors cursor-pointer"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Edit / Create dialog ──────────────────────────────────────── */}
      <Dialog open={!!editingTemplate || creatingNew} onOpenChange={(o) => { if (!o) { setEditingTemplate(null); setCreatingNew(false); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto garfix-scroll">
          <DialogHeader>
            <DialogTitle>{creatingNew ? "إنشاء قالب جديد" : "تعديل القالب"}</DialogTitle>
            <DialogDescription>
              {creatingNew ? "أدخل بيانات القالب الجديد." : `تعديل القالب "${editingTemplate?.name}"`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            <div className="sm:col-span-2">
              <Label className="text-xs font-semibold text-muted-foreground">اسم القالب</Label>
              <input
                value={editForm.name}
                onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="مثال: قالب الفاتورة الرسمية"
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">نوع التصميم</Label>
              <Select value={editForm.layoutType} onValueChange={(v) => setEditForm((p) => ({ ...p, layoutType: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LAYOUT_TYPES.map((l) => <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">حجم الورق</Label>
              <Select value={editForm.paperSize} onValueChange={(v) => setEditForm((p) => ({ ...p, paperSize: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAPER_SIZES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">اللون الرئيسي</Label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={editForm.primaryColor}
                  onChange={(e) => setEditForm((p) => ({ ...p, primaryColor: e.target.value }))}
                  className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-border p-0.5"
                />
                <input
                  type="text"
                  value={editForm.primaryColor}
                  onChange={(e) => setEditForm((p) => ({ ...p, primaryColor: e.target.value }))}
                  className="h-9 flex-1 rounded-md border border-border bg-background px-3 text-sm font-mono"
                  dir="ltr"
                  maxLength={7}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">نوع الخط</Label>
              <Select value={editForm.fontFamily} onValueChange={(v) => setEditForm((p) => ({ ...p, fontFamily: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FONTS.map((f) => <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">موضع الشعار</Label>
              <Select value={editForm.logoPosition} onValueChange={(v) => setEditForm((p) => ({ ...p, logoPosition: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LOGO_POSITIONS.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 flex flex-wrap gap-3 pt-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Switch checked={editForm.isDefault} onCheckedChange={(v) => setEditForm((p) => ({ ...p, isDefault: v }))} />
                <span>افتراضي</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Switch checked={editForm.showTaxNumber} onCheckedChange={(v) => setEditForm((p) => ({ ...p, showTaxNumber: v }))} />
                <span>إظهار الرقم الضريبي</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Switch checked={editForm.showQrCode} onCheckedChange={(v) => setEditForm((p) => ({ ...p, showQrCode: v }))} />
                <span>إظهار QR</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Switch checked={editForm.showBankDetails} onCheckedChange={(v) => setEditForm((p) => ({ ...p, showBankDetails: v }))} />
                <span>إظهار بيانات البنك</span>
              </label>
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs font-semibold text-muted-foreground">نص التذييل (اختياري)</Label>
              <textarea
                value={editForm.footerText}
                onChange={(e) => setEditForm((p) => ({ ...p, footerText: e.target.value }))}
                rows={2}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs font-semibold text-muted-foreground">الشروط والأحكام (اختياري)</Label>
              <textarea
                value={editForm.termsAndConditions}
                onChange={(e) => setEditForm((p) => ({ ...p, termsAndConditions: e.target.value }))}
                rows={3}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditingTemplate(null); setCreatingNew(false); }} disabled={savingEdit}>
              إلغاء
            </Button>
            <Button onClick={submitEdit} disabled={savingEdit || !editForm.name.trim()} className="gap-1.5">
              {savingEdit ? "جارٍ الحفظ…" : (creatingNew ? "إنشاء" : "حفظ التعديلات")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete confirmation ───────────────────────────────────────── */}
      <AlertDialog open={!!deletingTemplate} onOpenChange={(o) => { if (!o) setDeletingTemplate(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف القالب "{deletingTemplate?.name}"؟ لا يمكن التراجع عن هذا الإجراء.
              {deletingTemplate?.isDefault && (
                <span className="block mt-2 text-destructive font-semibold">
                  هذا قالب افتراضي — يجب تعيين قالب آخر كافتراضي أولاً إذا كان هو القالب الوحيد.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "جارٍ الحذف…" : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", padding: "20px" }}>
      <h3 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "14px" }}>{title}</h3>
      {children}
    </div>
  );
}

export default SettingsView;
