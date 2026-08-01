"use client";

/**
 * OnboardingScreen — first-run experience.
 *
 * Shown inside AppShell when an authenticated user has zero companies.
 * This is the typical state right after signup: the founder account
 * exists but no Company has been created yet, so the dashboard has
 * nothing to show.
 *
 * Lets the user create their first company in a single form (name +
 * slug + currency + tax rate). After success, BrandContext's
 * refreshCompanies() fires and AppShell swaps to the real dashboard.
 */

import { useState, FormEvent } from "react";
import { useAuth } from "@/context/AuthContext";
import { useBrand } from "@/context/BrandContext";
import { authedFetch } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardDescription, CardFooter,
  CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Building2, Loader2, Sparkles, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const CURRENCIES = [
  { code: "SAR", label: "ريال سعودي (SAR)" },
  { code: "AED", label: "درهم إماراتي (AED)" },
  { code: "EGP", label: "جنيه مصري (EGP)" },
  { code: "KWD", label: "دينار كويتي (KWD)" },
  { code: "QAR", label: "ريال قطري (QAR)" },
  { code: "BHD", label: "دينار بحريني (BHD)" },
  { code: "OMR", label: "ريال عماني (OMR)" },
  { code: "JOD", label: "دينار أردني (JOD)" },
  { code: "USD", label: "دولار أمريكي (USD)" },
  { code: "EUR", label: "يورو (EUR)" },
];

function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^\w\u0600-\u06FF\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

export function OnboardingScreen() {
  const { user } = useAuth();
  const { refreshCompanies } = useBrand();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [currency, setCurrency] = useState("SAR");
  const [taxRate, setTaxRate] = useState("15");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleNameChange = (v: string) => {
    setName(v);
    if (!slug || slug === slugify(name)) {
      setSlug(slugify(v));
    }
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await authedFetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug || slugify(name),
          currency,
          defaultTaxRate: taxRate,
          emoji: "🏢",
          color: "#7c3aed",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || data?.message || "Failed to create company");
      }
      setSuccess(true);
      toast.success("تم إنشاء شركتك بنجاح");
      // Refresh companies list — AppShell will auto-route to dashboard
      await refreshCompanies();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create company";
      setError(msg);
      setSubmitting(false);
    }
  }

  // Success state — brief confirmation before AppShell re-renders
  if (success) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <CardTitle className="text-xl">تم إنشاء شركتك!</CardTitle>
            <CardDescription>
              جارٍ تحميل لوحة التحكم…
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center p-4 sm:p-6 md:p-8">
      <Card className="w-full max-w-lg shadow-lg">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-[linear-gradient(135deg,#7c3aed,#a78bfa)] flex items-center justify-center shadow-[0_8px_24px_rgba(124,58,237,0.4)]">
            <Sparkles className="h-7 w-7 text-white" />
          </div>
          <CardTitle className="text-2xl">
            أهلاً {user?.displayName || user?.email}!
          </CardTitle>
          <CardDescription className="text-[13px]">
            لتبدأ استخدام GarfiX، أنشئ شركتك الأولى. ستتمكن لاحقاً من إضافة
            فواتير وعملاء وحسابات وكل ما يخص أعمالك.
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
              >
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span className="break-words">{error}</span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="company-name">اسم الشركة</Label>
              <div className="relative">
                <Building2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="company-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="مثال: شركة الأفق للتجارة"
                  disabled={submitting}
                  autoFocus
                  className="pr-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="company-slug">المعرّف (slug)</Label>
              <Input
                id="company-slug"
                type="text"
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                placeholder="my-company"
                disabled={submitting}
                dir="ltr"
                className="text-left font-mono text-[13px]"
              />
              <p className="text-[11px] text-muted-foreground">
                أحرف إنجليزية صغيرة وأرقام و- فقط. يُستخدم في الروابط.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="currency">العملة</Label>
                <Select value={currency} onValueChange={setCurrency} disabled={submitting}>
                  <SelectTrigger id="currency">
                    <SelectValue placeholder="اختر العملة" />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tax-rate">نسبة الضريبة الافتراضية (%)</Label>
                <Input
                  id="tax-rate"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                  disabled={submitting}
                  dir="ltr"
                  className="text-left font-mono"
                />
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-3">
            <Button
              type="submit"
              className="w-full"
              disabled={submitting || !name || !slug}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  جارٍ الإنشاء…
                </>
              ) : (
                "إنشاء الشركة وبدء الاستخدام"
              )}
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">
              تقدر تعدّل كل البيانات دي بعدين من صفحة الإعدادات.
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

export default OnboardingScreen;
