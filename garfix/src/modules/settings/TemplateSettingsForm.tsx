"use client";

import { useState } from "react";
import { useInvoiceTemplates, useUpdateSettings } from "@/hooks/queries";
import { toast } from "sonner";
import { Save, FileText, Palette, Type, LayoutTemplate, Stamp, CreditCard, ImageIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
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
        primaryColor: (s.primaryColor as string) || "#7C3AED",
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
      toast.success("تم حفظ إعدادات القالب");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
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
        {isLoading ? (
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
  );
}
