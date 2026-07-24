"use client";

import { useEffect, useState, useCallback } from "react";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import { Plug, Activity, Settings, Save } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconBtn } from "./shared-helpers";

/**
 * Admin P2 — Integrations tab.
 * Wires the previously-orphaned /api/platform-admin/integrations
 * (GET/PATCH) endpoints into a founder-facing UI. Lists each
 * integration (WhatsApp, MyFatoorah, Meta Ads) with its connection
 * status + a "Configure" button that opens a Dialog with the
 * integration's requiredFields form. Save calls PATCH with
 * { type, credentials }. Disconnect calls PATCH with { type, disconnect: true }.
 *
 * Note: the backend stores credentials encrypted via cryptoVault and
 * only exposes which fields are set (boolean) — never the raw values.
 * So the form fields start empty on every open; saving overwrites them.
 */
export function IntegrationsTab() {
  const [integrations, setIntegrations] = useState<Array<{
    type: string;
    name: string;
    description: string;
    requiredFields: Array<{ key: string; label: string; type: "text" | "password" }>;
    hasCredentials: boolean;
    credentialsLastUpdatedAt: string | null;
    isRegistered: boolean;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [configuringType, setConfiguringType] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch("/api/platform-admin/integrations");
      const d = await res.json();
      if (res.ok) setIntegrations(d.integrations || []);
      else toast.error(d.error || "تعذّر التحميل");
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const disconnect = async (type: string) => {
    if (!confirm(`قطع اتصال التكامل "${type}"؟ ستحذف بيانات الاعتماد المشفّرة.`)) return;
    try {
      const res = await authedFetch("/api/platform-admin/integrations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, disconnect: true }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      toast.success("تم قطع الاتصال");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    }
  };

  if (loading) return <div className="p-6 md:p-12 text-center text-[var(--muted-foreground)]">جارٍ التحميل…</div>;

  const configuring = integrations.find((i) => i.type === configuringType) || null;

  return (
    <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] overflow-hidden">
      <div className="px-4 py-3 border-b border-b-[var(--border)] flex justify-between items-center flex-wrap gap-2">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <Plug className="text-emerald-500" size={16} />
          التكاملات ({integrations.length})
        </h3>
        <IconBtn color="#10b981" aria-label="تحديث التكاملات" onClick={load}><Activity size={14} /> تحديث</IconBtn>
      </div>

      {integrations.length === 0 ? (
        <div className="p-4 md:p-8 text-center text-[var(--muted-foreground)]">لا توجد تكاملات مسجّلة</div>
      ) : (
        <div className="flex flex-col">
          {integrations.map((it) => (
            <div className="px-4 py-3.5 border-b border-b-[var(--border)] flex items-center justify-between gap-3 flex-wrap" key={it.type}>
              <div className="flex flex-col gap-[3px] flex-[1_1_240px] min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-extrabold">{it.name}</span>
                  <code className="font-mono text-[10px] rounded bg-[var(--muted)] text-[var(--muted-foreground)] px-1.5 py-px">{it.type}</code>
                </div>
                <div className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">{it.description}</div>
                <div className="text-[10px] text-[var(--muted-foreground)] mt-0.5">
                  {it.hasCredentials ? (
                    <>
                      <span className="text-emerald-500 font-bold">● مُهيّأ</span>
                      {it.credentialsLastUpdatedAt && <> • آخر تحديث: {new Date(it.credentialsLastUpdatedAt).toLocaleString("ar-EG")}</>}
                    </>
                  ) : (
                    <span className="text-gray-400 font-bold">○ غير مُهيّأ</span>
                  )}
                  {!it.isRegistered && <span className="text-red-500 mr-2"> • غير مسجّل</span>}
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <Switch
                  checked={it.hasCredentials}
                  onCheckedChange={(checked) => {
                    if (checked) setConfiguringType(it.type);
                    else disconnect(it.type);
                  }}
                  aria-label={`تفعيل ${it.name}`}
                />
                <IconBtn color="#10b981" aria-label="إعدادات" className="!w-auto !px-2.5 !py-1"
                  onClick={() => setConfiguringType(it.type)}
                  title="إعدادات"
                >
                  <Settings size={12} /> إعدادات
                </IconBtn>
              </div>
            </div>
          ))}
        </div>
      )}

      {configuring && (
        <IntegrationConfigDialog
          integration={configuring}
          onClose={() => setConfiguringType(null)}
          onSaved={() => { setConfiguringType(null); load(); }}
        />
      )}
    </div>
  );
}

function IntegrationConfigDialog({
  integration, onClose, onSaved,
}: {
  integration: {
    type: string; name: string;
    requiredFields: Array<{ key: string; label: string; type: "text" | "password" }>;
  };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    // Validate required fields
    const missing = integration.requiredFields
      .filter((f) => !values[f.key] || values[f.key].trim() === "")
      .map((f) => f.label);
    if (missing.length > 0) { toast.error(`حقول ناقصة: ${missing.join("، ")}`); return; }
    setSaving(true);
    try {
      const res = await authedFetch("/api/platform-admin/integrations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: integration.type, credentials: values }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      toast.success("تم حفظ بيانات الاعتماد (مشفّرة)");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plug size={16} /> {integration.name}
          </DialogTitle>
          <DialogDescription>
            أدخل بيانات الاعتماد. تُخزَّن مشفّرة — لا يمكن استرجاعها بعد الحفظ.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {integration.requiredFields.map((f) => (
            <div key={f.key}>
              <Label htmlFor={`int-${f.key}`} className="block text-[11px] font-bold text-[var(--muted-foreground)] mb-1">
                {f.label} <code className="font-mono text-[10px]">{f.key}</code>
              </Label>
              <Input
                id={`int-${f.key}`}
                type={f.type === "password" ? "password" : "text"}
                value={values[f.key] || ""}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                dir="ltr"
                placeholder={f.type === "password" ? "••••••••" : ""}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <button
            onClick={submit}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4.5 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] border-none font-inherit text-xs font-bold" /* TAILWINDBREAK: dynamic cursor/opacity */ style={{ cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}
          >
            <Save size={14} /> {saving ? "جارٍ…" : "حفظ"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
