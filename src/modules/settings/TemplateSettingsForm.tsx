// GarfiX DS v4.0 Enhanced — Template Settings Form
// Features: .hover-lift cards, .focus-ring inputs, .active-press buttons, emerald accents
"use client";

import { useState } from "react";
import { useInvoiceTemplates, useUpdateSettings } from "@/hooks/queries";
import { toast } from "sonner";
import { 
  Save, 
  FileText, 
  Palette, 
  Type, 
  LayoutTemplate, 
  Stamp, 
  CreditCard, 
  ImageIcon,
  Loader2,
  CheckCircle2
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  type TemplateSettingsForm,
  defaultTemplateSettings,
  TEMPLATES,
  FONTS,
  INVOICE_TYPE_OPTIONS,
} from "./types";

// ─── Props ──────────────────────────────────────────────────────────────────

interface TemplateSettingsFormProps {
  companySlug: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function TemplateSettingsForm({ companySlug }: TemplateSettingsFormProps) {
  const { data, isLoading } = useInvoiceTemplates(companySlug);
  const updateSettings = useUpdateSettings();

  const [templateForm, setTemplateForm] = useState<TemplateSettingsForm>(defaultTemplateSettings);

  // Sync template form when query data arrives or companySlug changes (render-time adjustment, no cascading render).
  const [prevSyncKey, setPrevSyncKey] = useState<{ slug: string; dataRef: unknown } | null>(null);
  const syncKey = data ? { slug: companySlug, dataRef: data } : null;
  if (syncKey !== prevSyncKey) {
    setPrevSyncKey(syncKey);
    if (data?.templateSettings) {
      const s = data.templateSettings as Record<string, unknown>;
      setTemplateForm({
        templateId: (s.templateId as string) || "modern",
        primaryColor: (s.primaryColor as string) || "#047857",
        fontFamily: (s.fontFamily as string) || "Noto Sans SC",
        fontSize: (s.fontSize as number) || 12,
        showLogo: (s.showLogo as boolean) ?? true,
        logoPosition: (s.logoPosition as string) || "right",
        showPaymentInfo: (s.showPaymentInfo as boolean) ?? true,
        showStamp: (s.showStamp as boolean) ?? false,
        invoiceTypes: s.invoiceTypes
          ? (s.invoiceTypes as string).split(",").filter(Boolean)
          : ["sales", "purchase", "quote"],
      });
    } else if (data) {
      setTemplateForm(defaultTemplateSettings);
    }
  }

  const saveTemplateSettings = async () => {
    try {
      await updateSettings.mutateAsync({
        slug: companySlug,
        ...templateForm,
      } as Parameters<typeof updateSettings.mutateAsync>[0]);
      toast.success("تم حفظ إعدادات القالب بنجاح");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ في حفظ الإعدادات");
    }
  };

  const toggleInvoiceType = (typeId: string) => {
    setTemplateForm((prev) => {
      const exists = prev.invoiceTypes.includes(typeId);
      const next = exists
        ? prev.invoiceTypes.filter((t) => t !== typeId)
        : [...prev.invoiceTypes, typeId];
      return { ...prev, invoiceTypes: next };
    });
  };

  const savingTemplate = updateSettings.isPending;

  return (
    <div className="space-y-6">
      {/* Loading State */}
      {isLoading ? (
        <div className="state-loading min-h-[300px]">
          <div className="state-loading-spinner" />
          <p className="text-sm text-muted-foreground">جارٍ تحميل إعدادات القالب...</p>
        </div>
      ) : (
        <>
          {/* ══════════════════════════════════════════════════════════
              SECTION 1: Template Selector Grid (.hover-lift cards)
             ══════════════════════════════════════════════════════════ */}
          <section className="space-y-3">
            <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-2">
              <LayoutTemplate size={14} className="text-primary" />
              اختر قالب PDF
            </Label>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              {TEMPLATES.map((t) => {
                const isSelected = templateForm.templateId === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTemplateForm((p) => ({ ...p, templateId: t.id }))}
                    className={cn(
                      "relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 sm:p-5",
                      "transition-all duration-120 ease-out cursor-pointer text-center",
                      "hover-lift focus-ring active-press",
                      isSelected
                        ? "border-primary bg-primary/8 shadow-brand-sm"
                        : "border-border hover:border-primary/50 hover:bg-primary/[0.03]"
                    )}
                  >
                    {/* Selected indicator dot */}
                    {isSelected && (
                      <span className="absolute top-2 start-2 w-3 h-3 rounded-full bg-primary shadow-brand-xs animate-pulse-slow" />
                    )}
                    
                    {/* Template icon */}
                    <span className={cn(
                      "text-3xl transition-transform duration-120",
                      isSelected && "scale-110"
                    )}>
                      {t.icon}
                    </span>
                    
                    {/* Template name */}
                    <span className={cn(
                      "text-sm font-bold",
                      isSelected ? "text-primary" : "text-foreground"
                    )}>
                      {t.label}
                    </span>
                    
                    {/* Template description */}
                    <span className="text-[10px] text-muted-foreground leading-tight">
                      {t.desc}
                    </span>

                    {/* Selected checkmark */}
                    {isSelected && (
                      <CheckCircle2 size={16} className="text-primary absolute bottom-2 end-2" />
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* ══════════════════════════════════════════════════════════
              SECTION 2: Color + Font Settings Row
             ══════════════════════════════════════════════════════════ */}
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
            {/* Primary color picker */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Palette size={14} className="text-primary" />
                اللون الرئيسي
              </Label>
              <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:border-primary/30 transition-colors duration-120">
                <input
                  type="color"
                  value={templateForm.primaryColor}
                  onChange={(e) => setTemplateForm((p) => ({ ...p, primaryColor: e.target.value }))}
                  className="w-11 h-11 shrink-0 cursor-pointer rounded-lg border-2 border-border bg-background p-0.5 focus-ring transition-all duration-120 hover:border-primary/40"
                />
                <div className="flex-1 space-y-1">
                  <input
                    type="text"
                    value={templateForm.primaryColor}
                    onChange={(e) => setTemplateForm((p) => ({ ...p, primaryColor: e.target.value }))}
                    className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm font-mono focus-ring transition-all duration-120"
                    dir="ltr"
                    maxLength={7}
                  />
                  <div 
                    className="h-2 rounded-full border border-border"
                    style={{ background: templateForm.primaryColor }}
                  />
                </div>
              </div>
            </div>

            {/* Font family selector */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Type size={14} className="text-primary" />
                نوع الخط
              </Label>
              <Select
                value={templateForm.fontFamily}
                onValueChange={(v) => setTemplateForm((p) => ({ ...p, fontFamily: v }))}
              >
                <SelectTrigger className="w-full focus-ring transition-all duration-120 hover:border-primary/40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONTS.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Font size slider */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                حجم الخط
                <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[11px] font-bold ms-auto">
                  {templateForm.fontSize}px
                </span>
              </Label>
              <div className="p-3 rounded-lg border border-border bg-card">
                <input
                  type="range"
                  min={8}
                  max={24}
                  step={1}
                  value={templateForm.fontSize}
                  onChange={(e) => setTemplateForm((p) => ({ ...p, fontSize: Number(e.target.value) }))}
                  className="w-full accent-primary h-2 cursor-pointer"
                />
                <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
                  <span>8px</span>
                  <span>24px</span>
                </div>
              </div>
            </div>
          </section>

          {/* ══════════════════════════════════════════════════════════
              SECTION 3: Toggle Switches Grid
             ══════════════════════════════════════════════════════════ */}
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            {/* Show Logo Toggle */}
            <div className={cn(
              "flex items-center justify-between rounded-xl border p-4",
              "transition-all duration-120 ease-out hover-lift",
              templateForm.showLogo 
                ? "border-primary/30 bg-primary/[0.03]" 
                : "border-border bg-card hover:border-primary/20"
            )}>
              <Label className="flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer">
                <ImageIcon size={16} className={cn(templateForm.showLogo ? "text-primary" : "text-muted-foreground")} />
                <span>إظهار الشعار</span>
              </Label>
              <Switch
                checked={templateForm.showLogo}
                onCheckedChange={(v) => setTemplateForm((p) => ({ ...p, showLogo: v }))}
                className="data-[state=checked]:bg-primary"
              />
            </div>

            {/* Show Payment Info Toggle */}
            <div className={cn(
              "flex items-center justify-between rounded-xl border p-4",
              "transition-all duration-120 ease-out hover-lift",
              templateForm.showPaymentInfo 
                ? "border-primary/30 bg-primary/[0.03]" 
                : "border-border bg-card hover:border-primary/20"
            )}>
              <Label className="flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer">
                <CreditCard size={16} className={cn(templateForm.showPaymentInfo ? "text-primary" : "text-muted-foreground")} />
                <span>معلومات الدفع</span>
              </Label>
              <Switch
                checked={templateForm.showPaymentInfo}
                onCheckedChange={(v) => setTemplateForm((p) => ({ ...p, showPaymentInfo: v }))}
                className="data-[state=checked]:bg-primary"
              />
            </div>

            {/* Show Stamp Toggle */}
            <div className={cn(
              "flex items-center justify-between rounded-xl border p-4",
              "transition-all duration-120 ease-out hover-lift",
              templateForm.showStamp 
                ? "border-primary/30 bg-primary/[0.03]" 
                : "border-border bg-card hover:border-primary/20"
            )}>
              <Label className="flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer">
                <Stamp size={16} className={cn(templateForm.showStamp ? "text-primary" : "text-muted-foreground")} />
                <span>إظهار الختم</span>
              </Label>
              <Switch
                checked={templateForm.showStamp}
                onCheckedChange={(v) => setTemplateForm((p) => ({ ...p, showStamp: v }))}
                className="data-[state=checked]:bg-primary"
              />
            </div>
          </section>

          {/* ══════════════════════════════════════════════════════════
              SECTION 4: Logo Position Selector
             ══════════════════════════════════════════════════════════ */}
          <section className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground">موضع الشعار</Label>
            <div className="flex gap-3">
              {(["right", "center", "left"] as const).map((pos) => {
                const labels: Record<string, string> = { right: "يمين", center: "وسط", left: "يسار" };
                const isSelected = templateForm.logoPosition === pos;
                return (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => setTemplateForm((p) => ({ ...p, logoPosition: pos }))}
                    className={cn(
                      "flex-1 py-3 px-4 rounded-xl text-sm font-semibold",
                      "transition-all duration-120 ease-out cursor-pointer",
                      "focus-ring active-press hover-lift",
                      isSelected
                        ? "bg-primary text-primary-foreground shadow-brand-sm border border-primary"
                        : "bg-card border border-border text-foreground hover:border-primary/40 hover:bg-primary/[0.03]"
                    )}
                  >
                    {labels[pos]}
                  </button>
                );
              })}
            </div>
          </section>

          {/* ══════════════════════════════════════════════════════════
              SECTION 5: Invoice Types Multi-select (emerald checkboxes)
             ══════════════════════════════════════════════════════════ */}
          <section className="space-y-3">
            <Label className="text-xs font-semibold text-muted-foreground">
              أنواع الفواتير المطبّق عليها القالب
            </Label>
            <div className="flex flex-wrap gap-3">
              {INVOICE_TYPE_OPTIONS.map((opt) => {
                const isSelected = templateForm.invoiceTypes.includes(opt.id);
                return (
                  <label
                    key={opt.id}
                    className={cn(
                      "flex items-center gap-2.5 cursor-pointer rounded-xl px-4 py-2.5",
                      "border-2 transition-all duration-120 ease-out hover-lift",
                      "focus-within:ring-2 focus-within:ring-primary/30",
                      isSelected
                        ? "border-primary bg-primary/[0.05] shadow-brand-xs"
                        : "border-border bg-card hover:border-primary/30 hover:bg-primary/[0.02]"
                    )}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleInvoiceType(opt.id)}
                      className="data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-white"
                    />
                    <span className={cn(
                      "text-sm font-medium",
                      isSelected ? "text-primary" : "text-foreground"
                    )}>
                      {opt.label}
                    </span>
                    {isSelected && (
                      <CheckCircle2 size={14} className="text-primary" />
                    )}
                  </label>
                );
              })}
            </div>
            
            {/* Validation warning */}
            {templateForm.invoiceTypes.length === 0 && (
              <div className="flex items-center gap-2 mt-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <span className="text-destructive text-xs font-semibold">
                  ⚠️ يجب اختيار نوع فاتورة واحد على الأقل
                </span>
              </div>
            )}
          </section>

          {/* ══════════════════════════════════════════════════════════
              SECTION 6: Save Button (DS v4.0 - Primary Emerald)
             ══════════════════════════════════════════════════════════ */}
          <div className="flex justify-end pt-4 border-t border-border">
            <Button
              onClick={saveTemplateSettings}
              disabled={savingTemplate || templateForm.invoiceTypes.length === 0}
              className={cn(
                "gap-2 py-2.5 px-6 rounded-xl font-bold",
                "gradient-primary text-white shadow-brand-sm",
                "hover:gradient-primary-hover hover:shadow-brand-md",
                "transition-all duration-150 ease-out",
                "focus-ring active-press"
              )}
            >
              {savingTemplate ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  جارٍ الحفظ…
                </>
              ) : (
                <>
                  <Save size={16} />
                  حفظ إعدادات القالب
                </>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
