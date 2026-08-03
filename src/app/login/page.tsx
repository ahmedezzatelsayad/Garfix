/**
 * /login — GarfiX login page.
 *
 * This is the public auth entry-point. Unauthenticated users hitting any
 * protected page are redirected here by the AppShell / page-level guards.
 *
 * Flow:
 *   1. User enters email + password.
 *   2. AuthContext.login() POSTs to /api/auth/login (public route, no CSRF).
 *   3. Server sets httpOnly access + refresh cookies, returns user profile.
 *   4. AuthContext refreshes `user` state → on success, redirect to "/"
 *      (which now correctly renders <AppShell /> for authed users, defaulting
 *      to the accounting dashboard).
 *
 * If the user is already authenticated (e.g. opened /login in a second tab),
 * they are auto-redirected to the dashboard.
 *
 * Public route — middleware.ts:isPublicRoute() includes "/api/auth/login"
 * but NOT the page itself. The page is a static RSC shell with no auth
 * requirement; it's the API endpoint that matters.
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
import { AlertTriangle, BarChart3, Loader2, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Already-authenticated? Bounce to dashboard. ──────────────────────────
  useEffect(() => {
    if (!loading && user) {
      router.replace("/");
    }
  }, [loading, user, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      // On success, the useEffect above will fire (user becomes non-null)
      // and redirect to "/". Push once explicitly as a fallback.
      router.push("/");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Login failed";
      setError(msg);
      setSubmitting(false);
    }
  }

  // While AuthContext is still resolving the session, show a neutral loader
  // so we don't flash the login form to already-authed users.
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

  // If we're authed, the redirect is already in-flight; render nothing.
  if (user) return null;

  return (
    <div className="min-h-screen flex flex-col bg-[#0b1220]" dir="rtl">
      {/* Header — minimal, no nav, just the logo — DS v4.0 Emerald Branding */}
      <header className="px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-brand-sm">
            <BarChart3 className="h-5 w-5 text-white" />
          </div>
          <span className="font-bold text-lg text-foreground">GarfiX EOS <span className="text-emerald-400 text-xs font-normal">v4.0</span></span>
        </div>
      </header>

      {/* Centered login card */}
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md shadow-brand-xl glass-strong border-emerald-500/20">
          {/* ── DS v4.0 Enhanced Onboarding Header ── */}
          <CardHeader className="space-y-3 text-center pb-2">
            {/* Animated Logo with Pulse */}
            <div className="mx-auto relative">
              <div className="h-16 w-16 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-brand-lg animate-pulse-slow">
                <ShieldCheck className="h-8 w-8 text-white" />
              </div>
              <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-[#d4a574] flex items-center justify-center shadow-gold-sm">
                <span className="text-[10px] font-bold text-white">4</span>
              </div>
            </div>
            
            {/* Welcome Message with Step Indicator */}
            <div className="space-y-1.5">
              <CardTitle className="text-2xl text-foreground font-extrabold">مرحباً بعودتك! 👋</CardTitle>
              <CardDescription className="text-muted-foreground text-sm leading-relaxed">
                سجّل دخولك للوصول إلى لوحة التحكم
              </CardDescription>
            </div>
            
            {/* Progress Steps - Visual Onboarding Cue */}
            <div className="flex items-center justify-center gap-1.5 pt-1">
              <div className="h-1.5 w-8 rounded-full bg-emerald-500 shadow-sm" />
              <div className="h-1.5 w-4 rounded-full bg-muted-foreground/20" />
              <div className="h-1.5 w-4 rounded-full bg-muted-foreground/20" />
            </div>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {/* ── Enhanced Error Message with Solution Hint ── */}
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400 glass-strong shadow-brand-sm animate-shake duration-300"
                >
                  <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0 text-red-400" />
                  <div className="flex-1 space-y-1">
                    <p className="font-medium text-red-300">{error}</p>
                    <p className="text-xs text-red-400/70">
                      💡 تأكد من كتابة البريد الإلكتروني وكلمة المرور بشكل صحيح
                    </p>
                  </div>
                </div>
              )}

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
                  autoFocus
                  className="focus-ring transition-all duration-150"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  className="focus-ring transition-all duration-150"
                />
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-3">
              {/* ── Enhanced CTA Button with Micro-interaction ── */}
              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white shadow-brand-md hover:shadow-brand-lg active:scale-[0.98] duration-150 transition-all text-base py-6 rounded-xl font-bold tracking-wide hover-lift"
                disabled={submitting || !email || !password}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-5 w-5 ml-2 animate-spin" />
                    <span>جارٍ تسجيل الدخول…</span>
                  </>
                ) : (
                  <span>تسجيل الدخول →</span>
                )}
              </Button>

              {/* ── Enhanced Signup Link with Visual Cue ── */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-muted-foreground/20" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-3 text-muted-foreground">أو</span>
                </div>
              </div>
              
              <p className="text-sm text-muted-foreground text-center">
                مستخدم جديد؟{" "}
                <Link href="/signup" className="font-semibold text-emerald-400 hover:text-emerald-300 underline decoration-2 underline-offset-4 transition-all duration-150 hover:text-emerald-200 hover-lift inline-flex items-center gap-1 group">
                  إنشاء حساب مجاني
                  <span className="group-hover:-translate-x-1 transition-transform duration-150">←</span>
                </Link>
              </p>

              <p className="text-xs text-muted-foreground text-center">
                By signing in you agree to our{" "}
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
