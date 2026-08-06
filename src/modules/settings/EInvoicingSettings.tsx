/**
 * ═════════════════════════════════════════════════════════════
 * EInvoicingSettings.tsx — إعدادات الفوترة الإلكترونية
 *
 * واجهة العميل لإعداد الفوترة الإلكترونية حسب دولته:
 * - السعودية: إدخال OTP + الرقم الضريبي → طلب CSID + CCD
 * - مصر: إدخال API token
 * - الإمارات: ربط Peppol
 * - الكويت/البحرين/عُمان: معلومات استعداد
 * ═════════════════════════════════════════════════════════════
 */
"use client";

import { useState, useEffect } from "react";
import { useBrand } from "@/context/BrandContext";
import { toast } from "sonner";
import {
  ShieldCheck, Loader2, CheckCircle2, XCircle, FileText,
  KeyRound, Building2, AlertCircle, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ZatcaCertStatus {
  hasCsid: boolean;
  hasCcd: boolean;
  csidExpiry?: string;
  ccdExpiry?: string;
  status: "not_started" | "csid_only" | "fully_configured" | "expired";
}

export function EInvoicingSettings() {
  const { activeCompany } = useBrand();
  const companySlug = activeCompany?.slug || "";
  const country = activeCompany?.country || "";

  const [loading, setLoading] = useState(false);
  const [certStatus, setCertStatus] = useState<ZatcaCertStatus | null>(null);

  // ZATCA onboarding form
  const [vatNumber, setVatNumber] = useState(activeCompany?.vatNumber || "");
  const [otp, setOtp] = useState("");
  const [etaToken, setEtaToken] = useState("");
  const [onboardingStep, setOnboardingStep] = useState<"idle" | "requesting_csid" | "requesting_ccd" | "done">("idle");

  useEffect(() => {
    // Load existing cert status
    loadCertStatus();
  }, [companySlug]);

  const loadCertStatus = async () => {
    try {
      const res = await fetch(`/api/e-invoicing/zatca/status?companySlug=${companySlug}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setCertStatus(data);
      }
    } catch {
      // Status endpoint may not exist yet — that's OK
    }
  };

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
          productionMode: false, // simulation first
          nameAr: activeCompany?.nameAr,
          nameEn: activeCompany?.name,
        }),
      });

      const csidData = await csidRes.json();

      if (!csidRes.ok || !csidData.success) {
        throw new Error(csidData.error || "فشل طلب CSID من ZATCA");
      }

      toast.success("✅ تم الحصول على شهادة CSID بنجاح");
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

      toast.success("✅ تم الحصول على شهادة CCD — الفوترة الإلكترونية جاهزة!");
      setOnboardingStep("done");
      await loadCertStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الإعداد");
      setOnboardingStep("idle");
    } finally {
      setLoading(false);
    }
  };

  const handleEtaSave = async () => {
    if (!etaToken) {
      toast.error("API token مطلوب");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/platform-admin/integrations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type: "eta_egypt",
          credentials: { api_token: etaToken },
        }),
      });

      if (res.ok) {
        toast.success("✅ تم حفظ رمز ETA — الفوترة الإلكترونية جاهزة!");
      } else {
        throw new Error("فشل الحفظ");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الحفظ");
    } finally {
      setLoading(false);
    }
  };

  // ─── Render by country ─────────────────────────────────────

  if (country === "SA") {
    return (
      <div className="space-y-6">
        <ZatcaPanel
          vatNumber={vatNumber}
          setVatNumber={setVatNumber}
          otp={otp}
          setOtp={setOtp}
          loading={loading}
          onboardingStep={onboardingStep}
          certStatus={certStatus}
          onOnboard={handleZatcaOnboard}
          onRefresh={loadCertStatus}
        />
      </div>
    );
  }

  if (country === "EG") {
    return (
      <EtaPanel
        etaToken={etaToken}
        setEtaToken={setEtaToken}
        loading={loading}
        onSave={handleEtaSave}
      />
    );
  }

  // Other countries — informational
  return <ComingSoonPanel country={country} />;
}

// ─── ZATCA Panel ──────────────────────────────────────────────

function ZatcaPanel({
  vatNumber, setVatNumber, otp, setOtp,
  loading, onboardingStep, certStatus, onOnboard, onRefresh,
}: {
  vatNumber: string;
  setVatNumber: (v: string) => void;
  otp: string;
  setOtp: (v: string) => void;
  loading: boolean;
  onboardingStep: string;
  certStatus: ZatcaCertStatus | null;
  onOnboard: () => void;
  onRefresh: () => void;
}) {
  const isConfigured = certStatus?.status === "fully_configured";

  return (
    <div className="space-y-4">
      {/* Status banner */}
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
            {isConfigured ? "الفوترة الإلكترونية مفعّلة (ZATCA Phase 2)" : "الفوترة الإلكترونية غير مفعّلة"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isConfigured
              ? `شهادة CCD نشطة حتى ${certStatus?.ccdExpiry || "غير محدد"}`
              : "أدخل الرقم الضريبي و OTP من بوابة ZATCA لتفعيل الفوترة"}
          </p>
        </div>
        <button onClick={onRefresh} className="p-2 rounded-lg hover:bg-muted transition-colors" title="تحديث">
          <RefreshCw size={16} className="text-muted-foreground" />
        </button>
      </div>

      {/* Onboarding form */}
      {!isConfigured && (
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck size={18} className="text-emerald-500" />
            <h3 className="font-bold">إعداد ZATCA Phase 2</h3>
          </div>

          {/* Step 1: Instructions */}
          <div className="bg-muted/30 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-bold text-foreground">📋 الخطوات:</p>
            <p>1. سجّل الدخول في <a href="https://fatoora.zatca.gov.sa" target="_blank" rel="noopener" className="text-emerald-500 underline">بوابة فاتورة</a></p>
            <p>2. من قسم "إنشاء شهادة الامتثال" احصل على OTP</p>
            <p>3. أدخل OTP + الرقم الضريبي هنا واضغط "تفعيل"</p>
          </div>

          {/* VAT number */}
          <div>
            <label className="text-sm font-medium block mb-1.5">الرقم الضريبي (VAT)</label>
            <div className="relative">
              <Building2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={vatNumber}
                onChange={(e) => setVatNumber(e.target.value)}
                placeholder="300000000000003"
                className="w-full pr-10 pl-3 py-2.5 rounded-lg bg-background border border-border text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                dir="ltr"
              />
            </div>
          </div>

          {/* OTP */}
          <div>
            <label className="text-sm font-medium block mb-1.5">رمز OTP من بوابة ZATCA</label>
            <div className="relative">
              <KeyRound size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="123456"
                className="w-full pr-10 pl-3 py-2.5 rounded-lg bg-background border border-border text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all font-mono"
                dir="ltr"
              />
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={onOnboard}
            disabled={loading || !vatNumber || !otp}
            className={cn(
              "w-full py-3 rounded-lg font-bold text-sm transition-all min-h-[44px] flex items-center justify-center gap-2",
              "bg-gradient-to-r from-emerald-600 to-emerald-500 text-white",
              "hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {onboardingStep === "requesting_csid" ? "جاري طلب CSID..." : "جاري طلب CCD..."}
              </>
            ) : (
              <>
                <ShieldCheck size={16} />
                تفعيل الفوترة الإلكترونية
              </>
            )}
          </button>
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
        </div>
      )}
    </div>
  );
}

// ─── ETA Panel (Egypt) ────────────────────────────────────────

function EtaPanel({
  etaToken, setEtaToken, loading, onSave,
}: {
  etaToken: string;
  setEtaToken: (v: string) => void;
  loading: boolean;
  onSave: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center gap-3">
        <AlertCircle className="text-amber-500 flex-shrink-0" size={24} />
        <div>
          <p className="font-bold text-sm">الفوترة الإلكترونية المصرية (ETA)</p>
          <p className="text-xs text-muted-foreground mt-0.5">أدخل رمز API من بوابة ETA لتفعيل الإرسال</p>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border p-5 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck size={18} className="text-emerald-500" />
          <h3 className="font-bold">إعداد ETA</h3>
        </div>

        <div className="bg-muted/30 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-bold text-foreground">📋 الخطوات:</p>
          <p>1. سجّل في <a href="https://invoicing.eta.gov.eg" target="_blank" rel="noopener" className="text-emerald-500 underline">بوابة ETA</a></p>
          <p>2. من الإعدادات، احصل على API token</p>
          <p>3. أدخله هنا واضغط "حفظ"</p>
        </div>

        <div>
          <label className="text-sm font-medium block mb-1.5">ETA API Token</label>
          <textarea
            value={etaToken}
            onChange={(e) => setEtaToken(e.target.value)}
            placeholder="eyJhbGciOiJSUzI1NiIs..."
            rows={3}
            className="w-full px-3 py-2.5 rounded-lg bg-background border border-border text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all font-mono"
            dir="ltr"
          />
        </div>

        <button
          onClick={onSave}
          disabled={loading || !etaToken}
          className="w-full py-3 rounded-lg font-bold text-sm bg-gradient-to-r from-emerald-600 to-emerald-500 text-white hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all min-h-[44px] flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
          حفظ وتفعيل
        </button>
      </div>
    </div>
  );
}

// ─── Coming Soon Panel ────────────────────────────────────────

function ComingSoonPanel({ country }: { country: string }) {
  const countryNames: Record<string, string> = {
    AE: "الإمارات (FTA — Peppol)",
    KW: "الكويت (Decree 10/2026)",
    BH: "البحرين (NBR)",
    OM: "عُمان (Tax Authority)",
    QA: "قطر",
  };

  return (
    <div className="bg-card rounded-xl border border-border p-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
        <FileText size={28} className="text-muted-foreground" />
      </div>
      <h3 className="font-bold text-lg mb-1">{countryNames[country] || "الفوترة الإلكترونية"}</h3>
      <p className="text-sm text-muted-foreground max-w-sm mx-auto">
        {country === "AE" && "الفوترة الإلكترونية في الإمارات تتطلب ربط عبر شبكة Peppol. التحقق من صحة الفواتير جاهز، الإرسال يحتاج إعداد Access Point خارجي."}
        {country === "KW" && "مرسوم 10/2026 في الكويت لسه ما اتفعلّش بالكامل. التحقق من صحة الفواتير جاهز ومتجدد مع التحديثات."}
        {country === "BH" && "هيئة البحرين للإيرادات لسه ما نشرت API endpoints. التحقق من صحة الفواتير جاهز."}
        {country === "OM" && "هيئة الضرائب العمانية لسه ما نشرت API endpoints. التحقق من صحة الفواتير جاهز."}
        {country === "QA" && "قطر لا تطلب الفوترة الإلكترونية حالياً."}
        {!country && "اختر دولة الشركة من الإعدادات العامة لعرض متطلبات الفوترة الإلكترونية."}
      </p>
    </div>
  );
}

// ─── Certificate Card ─────────────────────────────────────────

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
