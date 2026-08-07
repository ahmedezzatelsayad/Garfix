/**
 * LoginForm — Client component for the login page.
 * Handles form state, auth, and redirect.
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
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from "@/components/ui/card";
import { AlertTriangle, BarChart3, Loader2, ShieldCheck } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const { user, loading, login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      router.push("/");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Login failed";
      setError(msg);
      setSubmitting(false);
    }
  }

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
        <Card className="w-full max-w-md shadow-brand-xl glass-strong border-emerald-500/20">
          <CardHeader className="space-y-3 text-center pb-2">
            <div className="mx-auto relative">
              <div className="h-16 w-16 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-brand-md">
                <ShieldCheck className="h-8 w-8 text-white" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold text-foreground">مرحباً بعودتك! 👋</CardTitle>
            <CardDescription className="text-muted-foreground">
              سجّل دخولك للوصول إلى لوحة التحكم
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm">
                  <AlertTriangle size={16} />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@garfix.com"
                  required
                  dir="ltr"
                  className="bg-background"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  dir="ltr"
                  className="bg-background"
                />
              </div>

              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white font-bold min-h-[44px]"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin ml-2" />
                    جارٍ التسجيل...
                  </>
                ) : (
                  <>تسجيل الدخول →</>
                )}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground text-center">
              أو مستخدم جديد؟{" "}
              <Link href="/signup" className="text-emerald-500 hover:text-emerald-400 font-medium">
                إنشاء حساب مجاني ←
              </Link>
            </p>
            <p className="text-[10px] text-muted-foreground/50 text-center">
              By signing in you agree to our Terms and Privacy Policy.
            </p>
          </CardFooter>
        </Card>
      </main>

      <footer className="px-6 py-4 border-t border-white/[0.06]">
        <p className="text-center text-xs text-muted-foreground/50">
          GarfiX EOS v4.0 — AI-Native Business Platform · Powered by Emerald
        </p>
      </footer>
    </div>
  );
}
