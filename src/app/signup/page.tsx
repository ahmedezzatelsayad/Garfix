/**
 * /signup — GarfiX registration page.
 *
 * Public route. Collects email + display name + password, POSTs to
 * /api/auth/register (which has anti-enumeration behavior — always returns
 * 200 with a generic "verification email sent" message).
 *
 * After a successful registration, the user is redirected to /login so they
 * can sign in with their new credentials. We don't auto-login because the
 * server's register endpoint deliberately doesn't return a session (it's
 * designed for email-verification flows).
 *
 * Styling mirrors /login so the public auth flows feel consistent.
 */
"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertTriangle, BarChart3, CheckCircle2, Loader2, UserPlus } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Already-authenticated? Bounce to dashboard.
  useEffect(() => {
    if (!loading && user) {
      router.replace("/");
    }
  }, [loading, user, router]);

  // Live password-strength hints
  const pwdChecks = {
    length: password.length >= 10,
    lower: /[a-z]/.test(password),
    upper: /[A-Z]/.test(password),
    digit: /\d/.test(password),
    symbol: /[^a-zA-Z\d]/.test(password),
  };
  const pwdScore = Object.values(pwdChecks).filter(Boolean).length;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: email.trim(),
          password,
          displayName: displayName.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      // Anti-enumeration: server returns 200 with a generic message regardless
      // of whether the account was actually created. We surface the same
      // message in both cases so the user can't probe which emails exist.
      if (!res.ok) {
        throw new Error(data?.error || data?.message || "Registration failed");
      }
      setSuccess(true);
      // Wait 2s so the user sees the success message, then send to /login
      setTimeout(() => router.push("/login"), 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Registration failed";
      setError(msg);
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  if (user) return null;

  // Success screen — shown after the API returns 200 — DS v4.0 Celebration
  if (success) {
    return (
      <div className="min-h-screen flex flex-col bg-[#0b1220]" dir="rtl">
        <header className="px-6 py-5">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-brand-sm">
              <BarChart3 className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-lg text-foreground">GarfiX EOS <span className="text-emerald-400 text-xs font-normal">v4.0</span></span>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center px-4 py-8">
          <Card className="w-full max-w-md kpi-card-gold shadow-brand-xl border-emerald-500/20">
            <CardHeader className="space-y-2 text-center">
              <div className="mx-auto h-16 w-16 rounded-full bg-gradient-to-br from-[#d4a574] to-[#c9956a] flex items-center justify-center shadow-gold-sm animate-pulse">
                <CheckCircle2 className="h-8 w-8 text-white" />
              </div>
              <CardTitle className="text-2xl text-foreground">تم استلام طلبك بنجاح!</CardTitle>
              <CardDescription className="text-muted-foreground">
                إذا لم يكن البريد مسجلاً مسبقاً، تم إنشاء حسابك.
                <br />سيتم تحويلك لتسجيل الدخول خلال ثوانٍ...
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                type="button"
                className="w-full bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white shadow-brand-md active-press duration-150 transition-all"
                onClick={() => router.push("/login")}
              >
                الانتقال لتسجيل الدخول →
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0b1220]" dir="rtl">
      {/* Header — DS v4.0 Emerald Branding */}
      <header className="px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-brand-sm">
            <BarChart3 className="h-5 w-5 text-white" />
          </div>
          <span className="font-bold text-lg text-foreground">GarfiX EOS <span className="text-emerald-400 text-xs font-normal">v4.0</span></span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md shadow-brand-xl glass-strong border-emerald-500/20">
          <CardHeader className="space-y-2 text-center">
            <div className="mx-auto h-14 w-14 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-brand-md">
              <UserPlus className="h-7 w-7 text-white" />
            </div>
            <CardTitle className="text-2xl text-foreground">إنشاء حساب GarfiX جديد</CardTitle>
            <CardDescription className="text-muted-foreground">
              ابدأ إدارة فواتيرك ومحاسبتك والموارد البشرية — كل شيء في مكان واحد
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400 glass"
                >
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span className="break-words">{error}</span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="displayName">Full name</Label>
                <Input
                  id="displayName"
                  type="text"
                  autoComplete="name"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="أحمد جارفيكس"
                  disabled={submitting}
                  autoFocus
                  className="focus-ring transition-all duration-150"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  disabled={submitting}
                  className="focus-ring transition-all duration-150"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  className="focus-ring transition-all duration-150"
                />
                {/* Password strength meter */}
                {password.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex gap-1">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className={`h-1.5 flex-1 rounded-full transition-colors duration-200 ${
                            i < pwdScore
                              ? pwdScore <= 2
                                ? "bg-red-500"
                                : pwdScore === 3
                                ? "bg-[#d4a574]"
                                : "bg-emerald-500"
                              : "bg-muted-foreground/20"
                          }`}
                        />
                      ))}
                    </div>
                    <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <li className={pwdChecks.length ? "text-emerald-400 font-medium" : ""}>
                        {pwdChecks.length ? "✓" : "•"} 10+ حرف
                      </li>
                      <li className={pwdChecks.upper ? "text-emerald-400 font-medium" : ""}>
                        {pwdChecks.upper ? "✓" : "•"} حرف كبير
                      </li>
                      <li className={pwdChecks.lower ? "text-emerald-400 font-medium" : ""}>
                        {pwdChecks.lower ? "✓" : "•"} حرف صغير
                      </li>
                      <li className={pwdChecks.digit ? "text-emerald-400 font-medium" : ""}>
                        {pwdChecks.digit ? "✓" : "•"} رقم
                      </li>
                      <li className={pwdChecks.symbol ? "text-emerald-400 font-medium" : ""}>
                        {pwdChecks.symbol ? "✓" : "•"} رمز خاص
                      </li>
                    </ul>
                  </div>
                )}
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-3">
              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white shadow-brand-md active-press duration-150 transition-all"
                disabled={submitting || !email || !password || !displayName}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    جارٍ إنشاء الحساب…
                  </>
                ) : (
                  "إنشاء الحساب"
                )}
              </Button>

              <p className="text-sm text-muted-foreground text-center">
                لديك حساب بالفعل؟{" "}
                <Link href="/login" className="font-medium text-emerald-400 hover:text-emerald-300 underline transition-colors duration-120 hover-lift">
                  تسجيل الدخول
                </Link>
              </p>

              <p className="text-xs text-muted-foreground text-center">
                By creating an account you agree to our{" "}
                <Link href="/terms" className="underline hover:text-foreground">
                  Terms
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="underline hover:text-foreground">
                  Privacy Policy
                </Link>
                .
              </p>
            </CardFooter>
          </form>
        </Card>
      </main>

      <footer className="px-6 py-4 text-center text-xs text-muted-foreground border-t border-emerald-500/20">
        GarfiX EOS v4.0 — AI-Native Business Platform &middot; <span className="text-emerald-500">Powered by Emerald</span>
      </footer>
    </div>
  );
}
