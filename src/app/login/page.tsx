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
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      {/* Header — minimal, no nav, just the logo */}
      <header className="px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <span className="font-bold text-lg">GarfiX EOS</span>
        </div>
      </header>

      {/* Centered login card */}
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="space-y-2 text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-2xl">Sign in to GarfiX</CardTitle>
            <CardDescription>
              Enter your credentials to access the accounting dashboard.
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
                />
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-3">
              <Button
                type="submit"
                className="w-full"
                disabled={submitting || !email || !password}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>

              <p className="text-sm text-muted-foreground text-center">
                Don&apos;t have an account?{" "}
                <Link href="/signup" className="font-medium text-primary underline hover:opacity-80">
                  Create one
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

      <footer className="px-6 py-4 text-center text-xs text-muted-foreground">
        GarfiX EOS — AI-Native Business Platform
      </footer>
    </div>
  );
}
