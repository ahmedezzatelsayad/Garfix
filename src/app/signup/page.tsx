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

  // Success screen — shown after the API returns 200
  if (success) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
        <header className="px-6 py-5">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <span className="font-bold text-lg">GarfiX EOS</span>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center px-4 py-8">
          <Card className="w-full max-w-md shadow-lg">
            <CardHeader className="space-y-2 text-center">
              <div className="mx-auto h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <CardTitle className="text-2xl">Account request received</CardTitle>
              <CardDescription>
                If this email isn&apos;t already registered, your account has been
                created. You&apos;ll be redirected to the sign-in page shortly.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                type="button"
                className="w-full"
                onClick={() => router.push("/login")}
              >
                Continue to sign in
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <header className="px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <span className="font-bold text-lg">GarfiX EOS</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="space-y-2 text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <UserPlus className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-2xl">Create your GarfiX account</CardTitle>
            <CardDescription>
              Start managing invoices, accounting, HR, and more — all in one place.
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
                <Label htmlFor="displayName">Full name</Label>
                <Input
                  id="displayName"
                  type="text"
                  autoComplete="name"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Ahmed Garfi"
                  disabled={submitting}
                  autoFocus
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
                />
                {/* Password strength meter */}
                {password.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex gap-1">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className={`h-1.5 flex-1 rounded-full transition-colors ${
                            i < pwdScore
                              ? pwdScore <= 2
                                ? "bg-red-500"
                                : pwdScore === 3
                                ? "bg-amber-500"
                                : "bg-emerald-500"
                              : "bg-muted"
                          }`}
                        />
                      ))}
                    </div>
                    <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <li className={pwdChecks.length ? "text-emerald-600 dark:text-emerald-400" : ""}>
                        {pwdChecks.length ? "✓" : "•"} 10+ characters
                      </li>
                      <li className={pwdChecks.upper ? "text-emerald-600 dark:text-emerald-400" : ""}>
                        {pwdChecks.upper ? "✓" : "•"} Uppercase letter
                      </li>
                      <li className={pwdChecks.lower ? "text-emerald-600 dark:text-emerald-400" : ""}>
                        {pwdChecks.lower ? "✓" : "•"} Lowercase letter
                      </li>
                      <li className={pwdChecks.digit ? "text-emerald-600 dark:text-emerald-400" : ""}>
                        {pwdChecks.digit ? "✓" : "•"} Number
                      </li>
                      <li className={pwdChecks.symbol ? "text-emerald-600 dark:text-emerald-400" : ""}>
                        {pwdChecks.symbol ? "✓" : "•"} Special character
                      </li>
                    </ul>
                  </div>
                )}
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-3">
              <Button
                type="submit"
                className="w-full"
                disabled={submitting || !email || !password || !displayName}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating account…
                  </>
                ) : (
                  "Create account"
                )}
              </Button>

              <p className="text-sm text-muted-foreground text-center">
                Already have an account?{" "}
                <Link href="/login" className="font-medium text-primary underline hover:opacity-80">
                  Sign in
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

      <footer className="px-6 py-4 text-center text-xs text-muted-foreground">
        GarfiX EOS — AI-Native Business Platform
      </footer>
    </div>
  );
}
