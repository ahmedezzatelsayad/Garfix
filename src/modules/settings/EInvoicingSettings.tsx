/**
 * ═════════════════════════════════════════════════════════════
 * EInvoicingSettings.tsx — إعدادات الفوترة الإلكترونية
 *
 * واجهة العميل لإعداد الفوترة الإلكترونية حسب دولته:
 * - السعودية (SA): إدخال OTP + الرقم الضريبي → طلب CSID + CCD
 * - مصر (EG): إدخال ETA API Token (JWT) + اختبار الاتصال
 * - الإمارات (AE): ربط Peppol Access Point (URL + Client ID/Secret + Participant ID)
 * - الكويت (KW): ربط بوابة وزارة المالية (مرسوم 10/2026) + اختيار المرحلة
 * - البحرين (BH): ربط هيئة الإيرادات (API Key + VAT)
 * - عُمان (OM): ربط هيئة الضرائب (Client Credentials)
 * - قطر (QA): ربط اختياري عبر Peppol (غير إلزامي)
 *
 * كل دولة (باستثناء السعودية التي تستخدم ZATCA flow خاص):
 * - تخزّن بيانات الاعتماد عبر /api/platform-admin/integrations (مشفّرة)
 * - تختبر الاتصال عبر /api/platform-admin/integrations/test
 * ═════════════════════════════════════════════════════════════
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import { useBrand } from "@/context/BrandContext";
import { toast } from "sonner";
import {
  ShieldCheck, Loader2, CheckCircle2, XCircle, FileText,
  KeyRound, Building2, AlertCircle, RefreshCw, Wifi, Globe2,
  Link2, MapPin, Copy, Webhook, Send,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────

interface ZatcaCertStatus {
  hasCsid: boolean;
  hasCcd: boolean;
  csidExpiry?: string;
  ccdExpiry?: string;
  status: "not_started" | "csid_only" | "fully_configured" | "expired";
}

type IntegrationTypeKey =
  | "einvoice_eg"
  | "einvoice_ae"
  | "einvoice_kw"
  | "einvoice_bh"
  | "einvoice_om"
  | "einvoice_qa";

interface IntegrationStatus {
  type: IntegrationTypeKey;
  hasCredentials: boolean;
  credentialsLastUpdatedAt: string | null;
}

// ─── Main Component ────────────────────────────────────────────

export function EInvoicingSettings() {
  const { activeCompany } = useBrand();
  const companySlug = activeCompany?.slug || "";
  const country = activeCompany?.country || "";

  if (country === "SA") {
    return <ZatcaSettings companySlug={companySlug} vatNumberDefault={activeCompany?.vatNumber || ""} nameAr={activeCompany?.nameAr} nameEn={activeCompany?.name} />;
  }

  const countryToIntegrationType: Record<string, IntegrationTypeKey> = {
    EG: "einvoice_eg",
    AE: "einvoice_ae",
    KW: "einvoice_kw",
    BH: "einvoice_bh",
    OM: "einvoice_om",
    QA: "einvoice_qa",
  };

  const integrationType = countryToIntegrationType[country];
  if (!integrationType) {
    return <ComingSoonPanel country={country} />;
  }

  return (
    <CountryEInvoiceSettings
      country={country}
      integrationType={integrationType}
      vatNumberDefault={activeCompany?.vatNumber || ""}
      companySlug={companySlug}
    />
  );
}

// ─── ZATCA (Saudi Arabia) ──────────────────────────────────────
// (unchanged from previous commit — uses the dedicated /api/e-invoicing/zatca/* flow)

function ZatcaSettings({
  companySlug, vatNumberDefault, nameAr, nameEn,
}: {
  companySlug: string;
  vatNumberDefault: string;
  nameAr?: string | null;
  nameEn?: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [certStatus, setCertStatus] = useState<ZatcaCertStatus | null>(null);
  const [vatNumber, setVatNumber] = useState(vatNumberDefault);
  const [otp, setOtp] = useState("");
  const [onboardingStep, setOnboardingStep] = useState<"idle" | "requesting_csid" | "requesting_ccd" | "done">("idle");

  const loadCertStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/e-invoicing/zatca/status?companySlug=${companySlug}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setCertStatus(data);
      }
    } catch {
      // Status endpoint may not exist yet — that's OK
    }
  }, [companySlug]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetching on mount
    loadCertStatus();
  }, [loadCertStatus]);

  const handleZatcaOnboard = async () => {
    if (!vatNumber || !otp) {
      toast.error("الرقم الضريبي و OTP مطلوبان");
      return;
    }

    setLoading(true);
    setOnboardingStep("requesting_csid");

    try {
      // Step 1: Request CSID
      const csidRes = await fetch("/api/e-invoicing/zatca/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          companySlug,
          vatTrn: vatNumber,
          otp,
          productionMode: false,
          nameAr,
          nameEn,
        }),
      });

      const csidData = await csidRes.json();

      if (!csidRes.ok || !csidData.success) {
        throw new Error(csidData.error || "فشل طلب CSID من ZATCA");
      }

      toast.success("تم الحصول على شهادة CSID بنجاح");
      setOnboardingStep("requesting_ccd");

      // Step 2: Request CCD
      const ccdRes = await fetch("/api/e-invoicing/zatca/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          companySlug,
          step: "ccd",
          csidSerialNumber: csidData.csid?.serialNumber,
          vatTrn: vatNumber,
          productionMode: false,
        }),
      });

      const ccdData = await ccdRes.json();

      if (!ccdRes.ok || !ccdData.success) {
        throw new Error(ccdData.error || "فشل طلب CCD من ZATCA");
      }

      toast.success("تم الحصول على شهادة CCD — الفوترة الإلكترونية جاهزة!");
      setOnboardingStep("done");
      await loadCertStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الإعداد");
      setOnboardingStep("idle");
    } finally {
      setLoading(false);
    }
  };

  const isConfigured = certStatus?.status === "fully_configured";

  return (
    <div className="space-y-4">
      {/* Status banner */}
      <StatusBanner
        isConfigured={isConfigured}
        configuredText="الفوترة الإلكترونية مفعّلة (ZATCA Phase 2)"
        configuredSubtext={isConfigured && certStatus?.ccdExpiry ? `شهادة CCD نشطة حتى ${certStatus.ccdExpiry}` : "الشهادات نشطة"}
        notConfiguredText="الفوترة الإلكترونية غير مفعّلة"
        notConfiguredSubtext="أدخل الرقم الضريبي و OTP من بوابة ZATCA لتفعيل الفوترة"
        onRefresh={loadCertStatus}
      />

      {/* Onboarding form */}
      {!isConfigured && (
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <PanelHeader icon={<ShieldCheck size={18} className="text-emerald-500" />} title="إعداد ZATCA Phase 2" />

          <InstructionsBlock
            steps={[
              <>
                سجّل الدخول في{" "}
                <a href="https://fatoora.zatca.gov.sa" target="_blank" rel="noopener" className="text-emerald-500 underline">
                  بوابة فاتورة
                </a>
              </>,
              <>من قسم "إنشاء شهادة الامتثال" احصل على OTP</>,
              <>أدخل OTP + الرقم الضريبي هنا واضغط "تفعيل"</>,
            ]}
          />

          <TextField
            label="الرقم الضريبي (VAT)"
            icon={<Building2 size={16} />}
            value={vatNumber}
            onChange={setVatNumber}
            placeholder="300000000000003"
            dir="ltr"
          />

          <TextField
            label="رمز OTP من بوابة ZATCA"
            icon={<KeyRound size={16} />}
            value={otp}
            onChange={setOtp}
            placeholder="123456"
            dir="ltr"
            mono
          />

          <SubmitButton
            onClick={handleZatcaOnboard}
            disabled={loading || !vatNumber || !otp}
            loading={loading}
            loadingText={onboardingStep === "requesting_csid" ? "جاري طلب CSID..." : "جاري طلب CCD..."}
            icon={<ShieldCheck size={16} />}
            label="تفعيل الفوترة الإلكترونية"
          />

          <WebhookUrlHelper country="SA" />
        </div>
      )}

      {/* Certificate info */}
      {isConfigured && certStatus && (
        <div className="bg-card rounded-xl border border-border p-5 space-y-3">
          <h3 className="font-bold flex items-center gap-2">
            <FileText size={18} className="text-emerald-500" />
            الشهادات
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <CertCard title="CSID" subtitle="شهادة الامتثال" expiry={certStatus.csidExpiry} active={certStatus.hasCsid} />
            <CertCard title="CCD" subtitle="شهادة التوقيع" expiry={certStatus.ccdExpiry} active={certStatus.hasCcd} />
          </div>
          <WebhookUrlHelper country="SA" />
        </div>
      )}
    </div>
  );
}

// ─── Country E-Invoice Settings (EG / AE / KW / BH / OM / QA) ───

function CountryEInvoiceSettings({
  country, integrationType, vatNumberDefault, companySlug,
}: {
  country: string;
  integrationType: IntegrationTypeKey;
  vatNumberDefault: string;
  companySlug: string;
}) {
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Form state — kept generic, keyed by field name
  const [form, setForm] = useState<Record<string, string>>({});

  // Each country's field definitions
  const fields = getCountryFields(country);
  const countryMeta = COUNTRY_META[country];

  // Load existing status + prefill
  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/platform-admin/integrations", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      const found = (data.integrations as IntegrationStatus[]).find((i) => i.type === integrationType) || null;
      setStatus(found);
    } catch {
      // ignore
    }
  }, [integrationType]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetching on mount
    loadStatus();
    // Prefill VAT number from active company
    if (vatNumberDefault && fields.some((f) => f.key === "vat_number")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- prefill form from prop
      setForm((prev) => ({ ...prev, vat_number: vatNumberDefault }));
    }
  }, [loadStatus]);

  const handleSave = async () => {
    // Validate required fields
    for (const f of fields) {
      if (f.required && !form[f.key]?.trim()) {
        toast.error(`الحقل مطلوب: ${f.label}`);
        return;
      }
    }

    setLoading(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/platform-admin/integrations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type: integrationType,
          credentials: form,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "فشل الحفظ");
      }

      toast.success("تم حفظ بيانات الاعتماد بنجاح");
      await loadStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الحفظ");
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/platform-admin/integrations/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type: integrationType }),
      });

      const data = await res.json();
      if (data.success) {
        setTestResult({ ok: true, message: data.data?.details || "الاتصال ناجح" });
        toast.success("الاتصال ناجح");
      } else {
        setTestResult({ ok: false, message: data.data?.error || data.error || "فشل الاتصال" });
        toast.error(data.data?.error || "فشل الاتصال");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "فشل الاتصال";
      setTestResult({ ok: false, message: msg });
      toast.error(msg);
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("هل أنت متأكد من إلغاء ربط الفوترة الإلكترونية؟")) return;
    setLoading(true);
    try {
      const res = await fetch("/api/platform-admin/integrations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type: integrationType, disconnect: true }),
      });
      if (!res.ok) throw new Error("فشل الإلغاء");
      toast.success("تم إلغاء الربط");
      setForm({});
      setStatus(null);
      setTestResult(null);
      await loadStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الإلغاء");
    } finally {
      setLoading(false);
    }
  };

  const isConfigured = !!status?.hasCredentials;

  return (
    <div className="space-y-4">
      {/* Status banner */}
      <StatusBanner
        isConfigured={isConfigured}
        configuredText={countryMeta.configuredText}
        configuredSubtext={
          status?.credentialsLastUpdatedAt
            ? `آخر تحديث: ${new Date(status.credentialsLastUpdatedAt).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}`
            : "البيانات محفوظة (مشفّرة)"
        }
        notConfiguredText={countryMeta.notConfiguredText}
        notConfiguredSubtext={countryMeta.notConfiguredSubtext}
        onRefresh={loadStatus}
      />

      {/* Country-specific header */}
      <div className="bg-card rounded-xl border border-border p-5 space-y-4">
        <PanelHeader
          icon={<Globe2 size={18} className="text-emerald-500" />}
          title={countryMeta.title}
          subtitle={countryMeta.subtitle}
        />

        {/* Regulatory context */}
        {countryMeta.regulatoryNote && (
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3 text-xs text-muted-foreground leading-relaxed">
            <MapPin size={12} className="inline ml-1 text-emerald-500" />
            {countryMeta.regulatoryNote}
          </div>
        )}

        {/* Instructions */}
        <InstructionsBlock steps={countryMeta.steps} />

        {/* Form fields */}
        <div className="space-y-3">
          {fields.map((f) => (
            <FormField
              key={f.key}
              field={f}
              value={form[f.key] || ""}
              onChange={(v) => setForm((prev) => ({ ...prev, [f.key]: v }))}
            />
          ))}
        </div>

        {/* Webhook URL helper */}
        <WebhookUrlHelper country={country} companySlug={companySlug} />

        {/* Test result */}
        {testResult && (
          <div
            className={cn(
              "rounded-lg p-3 text-sm flex items-start gap-2 border",
              testResult.ok
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                : "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400"
            )}
          >
            {testResult.ok ? (
              <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />
            ) : (
              <XCircle size={16} className="flex-shrink-0 mt-0.5" />
            )}
            <span className="leading-relaxed">{testResult.message}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-1">
          <SubmitButton
            onClick={handleSave}
            disabled={loading || testing}
            loading={loading}
            loadingText="جاري الحفظ..."
            icon={<ShieldCheck size={16} />}
            label="حفظ البيانات"
            className="flex-1 min-w-[140px]"
          />

          <button
            onClick={handleTest}
            disabled={!isConfigured || testing || loading}
            className={cn(
              "flex-1 min-w-[140px] py-3 rounded-lg font-bold text-sm transition-all min-h-[44px] flex items-center justify-center gap-2",
              "bg-background border border-border hover:bg-muted",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {testing ? <Loader2 size={16} className="animate-spin" /> : <Wifi size={16} />}
            اختبار الاتصال
          </button>

          {isConfigured && (
            <button
              onClick={handleDisconnect}
              disabled={loading || testing}
              className="py-3 px-4 rounded-lg font-bold text-sm transition-all min-h-[44px] flex items-center justify-center gap-2 bg-red-500/10 border border-red-500/30 text-red-600 hover:bg-red-500/20 disabled:opacity-50"
              title="إلغاء الربط"
            >
              <Link2 size={16} className="rotate-45" />
              إلغاء الربط
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Country metadata ─────────────────────────────────────────

const COUNTRY_META: Record<string, {
  title: string;
  subtitle: string;
  configuredText: string;
  notConfiguredText: string;
  notConfiguredSubtext: string;
  regulatoryNote?: string;
  steps: React.ReactNode[];
}> = {
  EG: {
    title: "إعداد ETA — هيئة الضرائب المصرية",
    subtitle: "ربط بوابة ETA لإرسال الفواتير الإلكترونية",
    configuredText: "الفوترة الإلكترونية مفعّلة (ETA)",
    notConfiguredText: "الفوترة الإلكترونية غير مفعّلة",
    notConfiguredSubtext: "أدخل رمز API من بوابة ETA لتفعيل الإرسال",
    regulatoryNote: "مصر: القانون 8/2022 يلزم جميع المكلّفين بإرسال الفواتير الإلكترونية عبر بوابة ETA. الفواتير غير المُرسلة لا تُعتبر صالحة ضريبياً.",
    steps: [
      <>
        سجّل في{" "}
        <a href="https://invoicing.eta.gov.eg" target="_blank" rel="noopener" className="text-emerald-500 underline">
          بوابة ETA
        </a>{" "}
        وفعّل حساب المكلّف
      </>,
      <>من الإعدادات → API Tokens → احصل على API Token (JWT)</>,
      <>الصق الرمز هنا، احفظ، ثم اختبر الاتصال</>,
    ],
  },
  AE: {
    title: "إعداد FTA — الإمارات (Peppol)",
    subtitle: "ربط Access Point معتمد لشبكة Peppol",
    configuredText: "الفوترة الإلكترونية مفعّلة (Peppol)",
    notConfiguredText: "الفوترة الإلكترونية غير مفعّلة",
    notConfiguredSubtext: "أدخل بيانات الاعتماد من Access Point المعتمد لديك",
    regulatoryNote: "الإمارات: المرسوم الاتحادي 28/2024 يتبنّى معيار Peppol BIS 3.0. لا تتصل الهيئة مباشرةً — يجب التعاقد مع Access Point معتمد (مثل Kloud Portal، Comarch، Tradeshift).",
    steps: [
      <>تعاقد مع Access Point معتمد من FTA (Kloud، Comarch، Tradeshift...)</>,
      <>من بوابة الـ AP، احصل على Client ID و Client Secret و Access Point URL</>,
      <>سجّل معرّف المشارك Peppol (عادةً 0195:TRN)</>,
      <>أدخل البيانات هنا، احفظ، ثم اختبر الاتصال</>,
    ],
  },
  KW: {
    title: "إعداد بوابة الكويت — مرسوم 10/2026",
    subtitle: "ربط وزارة المالية الكويتية للفوترة الإلكترونية",
    configuredText: "الفوترة الإلكترونية مفعّلة (الكويت)",
    notConfiguredText: "الفوترة الإلكترونية غير مفعّلة",
    notConfiguredSubtext: "أدخل بيانات الاعتماد من بوابة وزارة المالية",
    regulatoryNote: "الكويت: مرسوم 10/2026 يطبّق على 3 مراحل — Phase 1 (تطوعي 2026-Q1)، Phase 2 (كبار المكلّفين 2026-Q3)، Phase 3 (جميع المكلّفين 2027-Q1). اختر المرحلة المناسبة لشركتك.",
    steps: [
      <>
        سجّل في{" "}
        <a href="https://e-invoice.mof.kw" target="_blank" rel="noopener" className="text-emerald-500 underline">
          بوابة الفوترة الإلكترونية
        </a>{" "}
        بوزارة المالية
      </>,
      <>من صفحة API، احصل على Client ID و Client Secret</>,
      <>اختر المرحلة المناسبة لشركتك (Phase 1/2/3)</>,
      <>أدخل البيانات هنا، احفظ، ثم اختبر الاتصال</>,
    ],
  },
  BH: {
    title: "إعداد NBR — هيئة الإيرادات البحرينية",
    subtitle: "ربط بوابة NBR لإرسال الفواتير الإلكترونية",
    configuredText: "الفوترة الإلكترونية مفعّلة (البحرين)",
    notConfiguredText: "الفوترة الإلكترونية غير مفعّلة",
    notConfiguredSubtext: "أدخل رقم التسجيل الضريبي و API Key من بوابة NBR",
    regulatoryNote: "البحرين: قرارات هيئة الإيرادات 25/2024 و 36/2025 تُلزم المكلّفين بإصدار فواتير إلكترونية متوافقة وتقديمها عبر API الرسمي. الضريبة الحالية 10%.",
    steps: [
      <>
        سجّل في{" "}
        <a href="https://www.nbr.gov.bh" target="_blank" rel="noopener" className="text-emerald-500 underline">
          بوابة NBR
        </a>
      </>,
      <>فعّل API Access واحصل على API Key</>,
      <>أدخل VAT Number (BH + 13 رقم) و API Key هنا</>,
      <>احفظ، ثم اختبر الاتصال</>,
    ],
  },
  OM: {
    title: "إعداد TA — هيئة الضرائب العمانية",
    subtitle: "ربط بوابة TA للفوترة الإلكترونية",
    configuredText: "الفوترة الإلكترونية مفعّلة (عُمان)",
    notConfiguredText: "الفوترة الإلكترونية غير مفعّلة",
    notConfiguredSubtext: "أدخل بيانات الاعتماد من بوابة هيئة الضرائب",
    regulatoryNote: "عُمان: هيئة الضرائب أعلنت إطار الفوترة الإلكترونية في 2024، ويُطبّق على 3 مراحل حتى 2027. الضريبة 5%. API Clearance متاح للمكلّفين المسجّلين.",
    steps: [
      <>
        سجّل في{" "}
        <a href="https://www.taxoman.gov.om" target="_blank" rel="noopener" className="text-emerald-500 underline">
          بوابة هيئة الضرائب
        </a>
      </>,
      <>فعّل API Access واحصل على Client ID و Client Secret</>,
      <>أدخل API Base URL وبيانات الاعتماد هنا</>,
      <>احفظ، ثم اختبر الاتصال</>,
    ],
  },
  QA: {
    title: "إعداد GTA — قطر (اختياري)",
    subtitle: "ربط Peppol Access Point (قطر لا تُلزم الفوترة الإلكترونية حالياً)",
    configuredText: "ربط Peppol مفعّل (قطر)",
    notConfiguredText: "ربط Peppol غير مفعّل",
    notConfiguredSubtext: "قطر لا تطلب الفوترة الإلكترونية إلزامياً — هذا الربط اختياري",
    regulatoryNote: "قطر: الهيئة العامة للضرائب نشرت إرشادات طوعية متوافقة مع Peppol BIS 3.0. لا يوجد حالياً API إلزامي. هذا الربط للشركات التي ترغب في الإرسال الطوعي.",
    steps: [
      <>تعاقد مع Access Point معتمد (Peppol)</>,
      <>احصل على Client ID و Client Secret و Access Point URL</>,
      <>سجّل معرّف المشارك Peppol</>,
      <>أدخل البيانات هنا، احفظ، ثم اختبر الاتصال</>,
    ],
  },
};

// ─── Field definitions per country ────────────────────────────

interface FieldDef {
  key: string;
  label: string;
  type: "text" | "password";
  placeholder?: string;
  required?: boolean;
  hint?: string;
  select?: string[];
}

function getCountryFields(country: string): FieldDef[] {
  switch (country) {
    case "EG":
      return [
        { key: "api_token", label: "ETA API Token (JWT)", type: "password", placeholder: "eyJhbGciOiJSUzI1NiIs...", required: true, hint: "رمز JWT طويل من بوابة ETA → Settings → API Tokens" },
        {
          key: "environment",
          label: "البيئة",
          type: "text",
          required: true,
          select: ["preprod", "production"],
          hint: "preprod للتجربة، production للإنتاج",
        },
      ];

    case "AE":
      return [
        { key: "access_point_url", label: "Access Point URL", type: "text", placeholder: "https://ap.kloudportal.com/api/v1", required: true },
        { key: "ap_client_id", label: "AP Client ID", type: "text", required: true },
        { key: "ap_client_secret", label: "AP Client Secret", type: "password", required: true },
        { key: "peppol_id", label: "Peppol Participant ID", type: "text", placeholder: "0195:300000000000003", required: true, hint: "عادةً 0195: متبوعاً بالرقم الضريبي" },
      ];

    case "KW":
      return [
        { key: "api_base_url", label: "API Base URL", type: "text", placeholder: "https://api.e-invoice.mof.kw", required: true },
        { key: "client_id", label: "Client ID", type: "text", required: true },
        { key: "client_secret", label: "Client Secret", type: "password", required: true },
        {
          key: "phase",
          label: "المرحلة",
          type: "text",
          required: true,
          select: ["phase_1", "phase_2", "phase_3"],
          hint: "phase_1 (تطوعي) / phase_2 (كبار المكلّفين) / phase_3 (الجميع)",
        },
      ];

    case "BH":
      return [
        { key: "api_base_url", label: "API Base URL", type: "text", placeholder: "https://api.nbr.gov.bh", required: true },
        { key: "vat_number", label: "VAT Number (BH + 13 رقم)", type: "text", placeholder: "BH00000000000000", required: true },
        { key: "api_key", label: "NBR API Key", type: "password", required: true },
      ];

    case "OM":
      return [
        { key: "api_base_url", label: "API Base URL", type: "text", placeholder: "https://api.taxoman.gov.om", required: true },
        { key: "client_id", label: "Client ID", type: "text", required: true },
        { key: "client_secret", label: "Client Secret", type: "password", required: true },
        { key: "vat_number", label: "VAT Number (OM + 13 رقم)", type: "text", placeholder: "OM0000000000000", hint: "اختياري — يُستخدم للتحقق الإضافي" },
      ];

    case "QA":
      return [
        { key: "access_point_url", label: "Access Point URL", type: "text", placeholder: "https://ap.example.com/api/v1", required: true },
        { key: "ap_client_id", label: "AP Client ID", type: "text", required: true },
        { key: "ap_client_secret", label: "AP Client Secret", type: "password", required: true },
        { key: "peppol_id", label: "Peppol Participant ID", type: "text", placeholder: "0195:QA300000000000003", required: true },
      ];

    default:
      return [];
  }
}

// ─── Reusable UI primitives ───────────────────────────────────

function StatusBanner({
  isConfigured, configuredText, configuredSubtext,
  notConfiguredText, notConfiguredSubtext, onRefresh,
}: {
  isConfigured: boolean;
  configuredText: string;
  configuredSubtext: string;
  notConfiguredText: string;
  notConfiguredSubtext: string;
  onRefresh: () => void;
}) {
  return (
    <div className={cn(
      "p-4 rounded-xl border flex items-center gap-3",
      isConfigured
        ? "bg-emerald-500/10 border-emerald-500/30"
        : "bg-amber-500/10 border-amber-500/30"
    )}>
      {isConfigured ? (
        <CheckCircle2 className="text-emerald-500 flex-shrink-0" size={24} />
      ) : (
        <AlertCircle className="text-amber-500 flex-shrink-0" size={24} />
      )}
      <div className="flex-1">
        <p className="font-bold text-sm">
          {isConfigured ? configuredText : notConfiguredText}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {isConfigured ? configuredSubtext : notConfiguredSubtext}
        </p>
      </div>
      <button onClick={onRefresh} className="p-2 rounded-lg hover:bg-muted transition-colors" title="تحديث">
        <RefreshCw size={16} className="text-muted-foreground" />
      </button>
    </div>
  );
}

function PanelHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-2 mb-1">
      {icon}
      <div>
        <h3 className="font-bold">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function InstructionsBlock({ steps }: { steps: React.ReactNode[] }) {
  return (
    <div className="bg-muted/30 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
      <p className="font-bold text-foreground mb-1">الخطوات:</p>
      {steps.map((s, i) => (
        <p key={i}>
          <span className="text-emerald-500 font-bold ml-1">{i + 1}.</span>
          {s}
        </p>
      ))}
    </div>
  );
}

function TextField({
  label, icon, value, onChange, placeholder, dir, mono,
}: {
  label: string;
  icon?: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  dir?: "ltr" | "rtl";
  mono?: boolean;
}) {
  return (
    <div>
      <label className="text-sm font-medium block mb-1.5">{label}</label>
      <div className="relative">
        {icon && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {icon}
          </span>
        )}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          dir={dir}
          className={cn(
            "w-full py-2.5 rounded-lg bg-background border border-border text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all",
            icon ? "pr-10 pl-3" : "px-3",
            mono && "font-mono"
          )}
        />
      </div>
    </div>
  );
}

function FormField({
  field, value, onChange,
}: {
  field: FieldDef;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-sm font-medium block mb-1.5">
        {field.label}
        {field.required && <span className="text-red-500 mr-1">*</span>}
      </label>

      {field.select ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg bg-background border border-border text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
        >
          <option value="">— اختر —</option>
          {field.select.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      ) : (
        <input
          type={field.type === "password" ? "password" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          dir={field.type === "password" || (field.placeholder && /[a-z0-9]/i.test(field.placeholder)) ? "ltr" : "rtl"}
          className={cn(
            "w-full px-3 py-2.5 rounded-lg bg-background border border-border text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all",
            field.type === "password" && "font-mono"
          )}
        />
      )}

      {field.hint && (
        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{field.hint}</p>
      )}
    </div>
  );
}

function SubmitButton({
  onClick, disabled, loading, loadingText, icon, label, className,
}: {
  onClick: () => void;
  disabled: boolean;
  loading: boolean;
  loadingText: string;
  icon: React.ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full py-3 rounded-lg font-bold text-sm transition-all min-h-[44px] flex items-center justify-center gap-2",
        "bg-gradient-to-r from-emerald-600 to-emerald-500 text-white",
        "hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
    >
      {loading ? (
        <>
          <Loader2 size={16} className="animate-spin" />
          {loadingText}
        </>
      ) : (
        <>
          {icon}
          {label}
        </>
      )}
    </button>
  );
}

// ─── Webhook URL Helper (per-country) ──────────────────────────

const WEBHOOK_CONFIG: Record<string, { path: string; header: string; encoding: "hex" | "base64"; secretSource: string }> = {
  SA: { path: "/api/e-invoicing/webhooks/zatca", header: "X-ZATCA-Signature", encoding: "base64", secretSource: "CSID secret (من شهادة ZATCA)" },
  EG: { path: "/api/e-invoicing/webhooks/eta", header: "X-Signature", encoding: "hex", secretSource: "ETA API Token (نفس الـ JWT)" },
  AE: { path: "/api/e-invoicing/webhooks/uae", header: "X-AP-Signature", encoding: "hex", secretSource: "AP Client Secret" },
  KW: { path: "/api/e-invoicing/webhooks/kw", header: "X-MoF-Signature", encoding: "hex", secretSource: "Client Secret (من بوابة MoF)" },
  BH: { path: "/api/e-invoicing/webhooks/bh", header: "X-NBR-Signature", encoding: "hex", secretSource: "NBR API Key" },
  OM: { path: "/api/e-invoicing/webhooks/om", header: "X-TA-Signature", encoding: "hex", secretSource: "Client Secret (من بوابة TA)" },
  QA: { path: "/api/e-invoicing/webhooks/qa", header: "X-AP-Signature", encoding: "hex", secretSource: "AP Client Secret" },
};

function WebhookUrlHelper({ country, companySlug }: { country: string; companySlug?: string }) {
  const cfg = WEBHOOK_CONFIG[country];
  const [origin, setOrigin] = useState<string>("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
    details?: { receiptId?: string; latencyMs?: number; status?: number };
  } | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time window.location read on mount
      setOrigin(window.location.origin);
    }
  }, []);

  if (!cfg) return null;

  const fullUrl = origin ? `${origin}${cfg.path}` : cfg.path;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      toast.success("تم نسخ رابط الـ webhook");
    } catch {
      toast.error("فشل النسخ — انسخ يدوياً");
    }
  };

  const handleTestSend = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/e-invoicing/test-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ country, companySlug }), // FIX #21 (MEDIUM): include companySlug so test receipt is recorded under the correct company
      });
      const data = await res.json();

      if (data.ok) {
        const receipt = data.receipt;
        const msg = receipt
          ? `تم الإرسال بنجاح — الإيصال ${receipt.id.slice(0, 8)}… مسجّل (sigValid: ${receipt.signatureValid ? "true" : "false"})`
          : `تم الإرسال بنجاح (HTTP ${data.status}) لكن لم يُسجّل إيصال بعد`;
        setTestResult({
          ok: true,
          message: msg,
          details: {
            receiptId: receipt?.id,
            latencyMs: data.latencyMs,
            status: data.status,
          },
        });
        toast.success("تم إرسال الـ webhook التجريبي بنجاح");
      } else {
        const errMsg = data.error || `HTTP ${data.status}`;
        setTestResult({ ok: false, message: errMsg });
        toast.error(errMsg);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "فشل الاتصال";
      setTestResult({ ok: false, message: msg });
      toast.error(msg);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Webhook size={14} className="text-blue-500 flex-shrink-0" />
        <p className="text-sm font-bold text-blue-600 dark:text-blue-400">
          رابط استقبال الـ Webhook (للتسجيل في بوابة الهيئة)
        </p>
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        بعد حفظ بيانات الاعتماد، سجّل هذا الرابط في بوابة الهيئة الضريبية ليتم إرسال إشعارات حالة الفاتورة (قبول / رفض / إلغاء) تلقائياً إلى GarfiX.
      </p>

      {/* URL + copy + test buttons */}
      <div className="flex items-stretch gap-2">
        <code
          className="flex-1 px-3 py-2 rounded-lg bg-background border border-border text-[11px] font-mono break-all"
          dir="ltr"
        >
          {fullUrl}
        </code>
        <button
          onClick={handleCopy}
          className="px-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors flex items-center justify-center"
          title="نسخ الرابط"
        >
          <Copy size={14} />
        </button>
        <button
          onClick={handleTestSend}
          disabled={testing}
          className="px-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          title="إرسال payload تجريبي موقّع إلى هذا الـ webhook"
        >
          {testing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </div>

      {/* Test result */}
      {testResult && (
        <div
          className={cn(
            "rounded-md p-2.5 text-[11px] flex items-start gap-2 border leading-relaxed",
            testResult.ok
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
              : "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400"
          )}
        >
          {testResult.ok ? (
            <CheckCircle2 size={13} className="flex-shrink-0 mt-0.5" />
          ) : (
            <XCircle size={13} className="flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <p>{testResult.message}</p>
            {testResult.details && (
              <p className="text-[10px] opacity-70 mt-0.5">
                HTTP {testResult.details.status} · {testResult.details.latencyMs}ms
                {testResult.details.receiptId && ` · receipt: ${testResult.details.receiptId.slice(0, 12)}…`}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Signature info */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
        <div className="bg-muted/30 rounded-md p-2">
          <p className="text-muted-foreground mb-0.5">Header التوقيع</p>
          <p className="font-mono text-foreground" dir="ltr">{cfg.header}</p>
        </div>
        <div className="bg-muted/30 rounded-md p-2">
          <p className="text-muted-foreground mb-0.5">خوارزمية التوقيع</p>
          <p className="font-mono text-foreground" dir="ltr">HMAC-SHA256 ({cfg.encoding})</p>
        </div>
        <div className="bg-muted/30 rounded-md p-2">
          <p className="text-muted-foreground mb-0.5">المفتاح السري</p>
          <p className="text-foreground">{cfg.secretSource}</p>
        </div>
      </div>

      <div className="bg-amber-500/5 border border-amber-500/15 rounded-md p-2 text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
        <AlertCircle size={11} className="inline ml-1" />
        تأكد أن الـ URL متاح من خارج الشبكة (public internet). في بيئة الإنتاج، استخدم HTTPS فقط. زر الإرسال 🟢 بيستخدم payload تجريبي موقّع للتأكد من الـ pipeline.
      </div>
    </div>
  );
}

// ─── Coming Soon Panel (truly unsupported countries) ───────────

function ComingSoonPanel({ country }: { country: string }) {
  const countryNames: Record<string, string> = {
    JO: "الأردن",
    LB: "لبنان",
    IQ: "العراق",
    YE: "اليمن",
    SY: "سوريا",
    PS: "فلسطين",
  };

  return (
    <div className="bg-card rounded-xl border border-border p-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
        <FileText size={28} className="text-muted-foreground" />
      </div>
      <h3 className="font-bold text-lg mb-1">{countryNames[country] || "الفوترة الإلكترونية"}</h3>
      <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
        {country
          ? "هذه الدولة لا تطلب الفوترة الإلكترونية إلزامياً حالياً. التوافق مع المعايير المحلية قيد التطوير — تواصل مع الدعم للحصول على تحديثات."
          : "اختر دولة الشركة من الإعدادات العامة لعرض متطلبات الفوترة الإلكترونية."}
      </p>
    </div>
  );
}

// ─── Certificate Card (ZATCA only) ────────────────────────────

function CertCard({ title, subtitle, expiry, active }: {
  title: string;
  subtitle: string;
  expiry?: string;
  active: boolean;
}) {
  return (
    <div className={cn(
      "p-3 rounded-lg border flex items-center gap-2",
      active ? "bg-emerald-500/10 border-emerald-500/30" : "bg-muted/30 border-border"
    )}>
      {active ? (
        <CheckCircle2 size={18} className="text-emerald-500 flex-shrink-0" />
      ) : (
        <XCircle size={18} className="text-muted-foreground flex-shrink-0" />
      )}
      <div className="min-w-0">
        <p className="text-xs font-bold">{title}</p>
        <p className="text-[10px] text-muted-foreground">{subtitle}</p>
        {expiry && <p className="text-[10px] text-emerald-500">تنتهي: {expiry}</p>}
      </div>
    </div>
  );
}
