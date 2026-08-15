"use client";

/**
 * /setup — Founder Setup Wizard
 *
 * Multi-step installer that runs on first boot, before DATABASE_URL or any
 * integration env vars are configured. Pattern mirrors OpenCart / Laravel:
 *
 *   Step 1: Welcome + system requirements check
 *   Step 2: Database configuration (host, port, db, user, password)
 *   Step 3: Run migrations (calls /api/setup/run-migrations)
 *   Step 4: Create founder account + company
 *   Step 5: Optional integrations (Stripe, OpenRouter, WhatsApp, etc.)
 *   Step 6: Confirmation + auto-disable installer
 *
 * The wizard is gated by /api/setup/status — if setupComplete=true, the
 * middleware redirects /setup → / and the page never renders.
 */

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, CheckCircle2, XCircle, Database, User, Settings, Sparkles, ArrowRight, ArrowLeft, ShieldCheck } from "lucide-react";

type Step = 1 | 2 | 3 | 4 | 5 | 6;

interface DbConfig {
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
}

interface FounderConfig {
  founderEmail: string;
  founderPassword: string;
  founderPasswordConfirm: string;
  founderName: string;
  companyName: string;
  companySlug: string;
  companyCurrency: string;
  companyVatNumber: string;
}

interface Integrations {
  OPENROUTER_API_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  WHATSAPP_BUSINESS_NUMBER: string;
  WHATSAPP_ACCESS_TOKEN: string;
  REDIS_URL: string;
  SMTP_URL: string;
}

const DEFAULT_DB: DbConfig = {
  host: "localhost",
  port: "5432",
  database: "garfix",
  user: "garfix",
  password: "",
  ssl: false,
};

const DEFAULT_FOUNDER: FounderConfig = {
  founderEmail: "",
  founderPassword: "",
  founderPasswordConfirm: "",
  founderName: "",
  companyName: "",
  companySlug: "",
  companyCurrency: "KWD",
  companyVatNumber: "",
};

const DEFAULT_INTEGRATIONS: Integrations = {
  OPENROUTER_API_KEY: "",
  STRIPE_SECRET_KEY: "",
  STRIPE_WEBHOOK_SECRET: "",
  WHATSAPP_BUSINESS_NUMBER: "",
  WHATSAPP_ACCESS_TOKEN: "",
  REDIS_URL: "redis://localhost:6379",
  SMTP_URL: "",
};

// ─── Helper: build slug from company name ────────────────────────────────
function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);
}

// ─── Helper: call API ────────────────────────────────────────────────────
async function callApi(path: string, body: unknown): Promise<{ ok: boolean; error?: string; [k: string]: unknown }> {
  // Get CSRF token from cookie
  const csrfCookie = document.cookie
    .split("; ")
    .find((c) => c.startsWith("inv_csrf="))
    ?.split("=")[1];

  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfCookie || "",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ ok: false, error: "Invalid JSON response" }));
  return data;
}

// ─── Component ───────────────────────────────────────────────────────────
export default function SetupWizard() {
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dbConfig, setDbConfig] = useState<DbConfig>(DEFAULT_DB);
  const [founderConfig, setFounderConfig] = useState<FounderConfig>(DEFAULT_FOUNDER);
  const [integrations, setIntegrations] = useState<Integrations>(DEFAULT_INTEGRATIONS);
  const [dbTestResult, setDbTestResult] = useState<{ serverVersion?: string; database?: string; currentUser?: string } | null>(null);
  const [migrationOutput, setMigrationOutput] = useState<string>("");
   
  const [_founderResult, setFounderResult] = useState<{ founderEmail: string; companySlug: string } | null>(null);
  const [setupComplete, setSetupComplete] = useState(false);
  const router = useRouter();

  // Auto-slug company name (derived state, not an effect)
  const effectiveCompanySlug = useMemo(
    () => founderConfig.companySlug || slugify(founderConfig.companyName),
    [founderConfig.companySlug, founderConfig.companyName],
  );

  // ─── Step 2: Test DB ─────────────────────────────────────────────────
  const testDb = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDbTestResult(null);
    const res = await callApi("/api/setup/test-db", dbConfig);
    setLoading(false);
    if (res.ok) {
      setDbTestResult({
        serverVersion: res.serverVersion as string,
        database: res.database as string,
        currentUser: res.currentUser as string,
      });
    } else {
      setError(res.error || "Database connection failed");
    }
  }, [dbConfig]);

  // ─── Step 3: Run migrations ──────────────────────────────────────────
  const runMigrations = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMigrationOutput("");
    const res = await callApi("/api/setup/run-migrations", dbConfig);
    setLoading(false);
    if (res.ok) {
      setMigrationOutput((res.output as string) || "(no output)");
      setStep(4);
    } else {
      setError(res.error || "Migration failed");
      setMigrationOutput((res.error as string) || "");
    }
  }, [dbConfig]);

  // ─── Step 4: Create founder ─────────────────────────────────────────
  const createFounder = useCallback(async () => {
    if (founderConfig.founderPassword !== founderConfig.founderPasswordConfirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    setError(null);
    const datasourceUrl = `postgresql://${encodeURIComponent(dbConfig.user)}:${encodeURIComponent(dbConfig.password)}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database}${dbConfig.ssl ? "?sslmode=require" : ""}`;
    const res = await callApi("/api/setup/create-founder", {
      databaseUrl: datasourceUrl,
      founderEmail: founderConfig.founderEmail,
      founderPassword: founderConfig.founderPassword,
      founderName: founderConfig.founderName,
      companyName: founderConfig.companyName,
      companySlug: effectiveCompanySlug,
      companyCurrency: founderConfig.companyCurrency,
      companyVatNumber: founderConfig.companyVatNumber,
    });
    setLoading(false);
    if (res.ok) {
      setFounderResult({
        founderEmail: res.founderEmail as string,
        companySlug: res.companySlug as string,
      });
      setStep(5);
    } else {
      setError(res.error || "Failed to create founder account");
    }
  }, [dbConfig, founderConfig, effectiveCompanySlug]);

  // ─── Step 5: Save integrations ──────────────────────────────────────
  const saveIntegrations = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await callApi("/api/setup/save-integrations", { integrations });
    setLoading(false);
    if (res.ok) {
      setStep(6);
    } else {
      setError(res.error || "Failed to save integrations");
    }
  }, [integrations]);

  // ─── Step 6: Complete ───────────────────────────────────────────────
  const completeSetup = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await callApi("/api/setup/complete", {
      founderEmail: founderConfig.founderEmail,
    });
    setLoading(false);
    if (res.ok) {
      setSetupComplete(true);
    } else {
      setError(res.error || "Failed to complete setup");
    }
  }, [founderConfig.founderEmail]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="size-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-2xl">G</div>
            <span className="text-2xl font-bold tracking-tight">GarfiX</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Founder Setup Wizard</h1>
          <p className="text-muted-foreground mt-2">Configure your GarfiX installation in 6 simple steps</p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-between mb-8 px-2">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="flex items-center">
              <div className={`size-9 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                n < step ? "bg-emerald-500 text-white" :
                n === step ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900" :
                "bg-slate-200 dark:bg-slate-800 text-slate-500"
              }`}>
                {n < step ? <CheckCircle2 className="size-5" /> : n}
              </div>
              {n < 6 && <div className={`w-8 h-0.5 mx-1 ${n < step ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-800"}`} />}
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <Alert variant="destructive" className="mb-4">
            <XCircle className="size-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Step 1: Welcome */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Sparkles className="size-5" /> Welcome</CardTitle>
              <CardDescription>Let&apos;s get your GarfiX installation ready</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-muted p-4 text-sm space-y-2">
                <p className="font-medium">This wizard will guide you through:</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Database connection configuration</li>
                  <li>Running schema migrations</li>
                  <li>Creating your founder (admin) account</li>
                  <li>Setting up optional integrations (Stripe, OpenRouter, WhatsApp)</li>
                  <li>Securing the installer (auto-deletes itself when done)</li>
                </ul>
              </div>
              <div className="rounded-lg border p-4 text-sm space-y-2">
                <p className="font-medium flex items-center gap-2"><ShieldCheck className="size-4 text-emerald-500" /> Security notice</p>
                <p className="text-muted-foreground">
                  After setup completes, this installer page is automatically disabled and the route files are deleted from disk.
                  This prevents anyone from re-running the wizard to overwrite your founder account.
                </p>
              </div>
              <div className="flex justify-end">
                <Button onClick={() => setStep(2)} size="lg">
                  Get Started <ArrowRight className="size-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Database */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Database className="size-5" /> Database Configuration</CardTitle>
              <CardDescription>Enter your PostgreSQL connection details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="db-host">Host</Label>
                  <Input id="db-host" value={dbConfig.host} onChange={(e) => setDbConfig({ ...dbConfig, host: e.target.value })} placeholder="localhost or db.example.com" />
                </div>
                <div>
                  <Label htmlFor="db-port">Port</Label>
                  <Input id="db-port" value={dbConfig.port} onChange={(e) => setDbConfig({ ...dbConfig, port: e.target.value })} placeholder="5432" />
                </div>
              </div>
              <div>
                <Label htmlFor="db-name">Database Name</Label>
                <Input id="db-name" value={dbConfig.database} onChange={(e) => setDbConfig({ ...dbConfig, database: e.target.value })} placeholder="garfix" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="db-user">Username</Label>
                  <Input id="db-user" value={dbConfig.user} onChange={(e) => setDbConfig({ ...dbConfig, user: e.target.value })} placeholder="garfix" />
                </div>
                <div>
                  <Label htmlFor="db-pass">Password</Label>
                  <Input id="db-pass" type="password" value={dbConfig.password} onChange={(e) => setDbConfig({ ...dbConfig, password: e.target.value })} placeholder="••••••••" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="db-ssl" checked={dbConfig.ssl} onCheckedChange={(c) => setDbConfig({ ...dbConfig, ssl: c === true })} />
                <Label htmlFor="db-ssl" className="text-sm font-normal cursor-pointer">Use SSL (required for managed Postgres like RDS, Supabase, Neon)</Label>
              </div>

              {dbTestResult && (
                <Alert>
                  <CheckCircle2 className="size-4 text-emerald-500" />
                  <AlertTitle>Connection successful</AlertTitle>
                  <AlertDescription className="text-xs">
                    <div>Server: {dbTestResult.serverVersion}</div>
                    <div>Database: {dbTestResult.database}</div>
                    <div>User: {dbTestResult.currentUser}</div>
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="size-4 mr-2" /> Back</Button>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={testDb} disabled={loading || !dbConfig.host || !dbConfig.database || !dbConfig.user}>
                    {loading ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
                    Test Connection
                  </Button>
                  <Button onClick={() => setStep(3)} disabled={!dbTestResult}>
                    Continue <ArrowRight className="size-4 ml-2" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Run Migrations */}
        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Database className="size-5" /> Run Migrations</CardTitle>
              <CardDescription>Create all database tables (this may take 30-60 seconds on first run)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <ShieldCheck className="size-4" />
                <AlertTitle>Ready to migrate</AlertTitle>
                <AlertDescription>
                  Connecting to <code className="text-xs bg-muted px-1 rounded">{dbConfig.host}:{dbConfig.port}/{dbConfig.database}</code> as <code className="text-xs bg-muted px-1 rounded">{dbConfig.user}</code>.
                  We&apos;ll write this to <code className="text-xs bg-muted px-1 rounded">.env</code> and run <code className="text-xs bg-muted px-1 rounded">prisma migrate deploy</code>.
                </AlertDescription>
              </Alert>

              {migrationOutput && (
                <div>
                  <Label>Migration output</Label>
                  <pre className="mt-1 max-h-64 overflow-auto rounded-md bg-slate-950 text-slate-100 p-3 text-xs font-mono whitespace-pre-wrap break-all">
                    {migrationOutput}
                  </pre>
                </div>
              )}

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="size-4 mr-2" /> Back</Button>
                <Button onClick={runMigrations} disabled={loading}>
                  {loading ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Database className="size-4 mr-2" />}
                  {loading ? "Running migrations..." : "Run Migrations"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Founder Account */}
        {step === 4 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><User className="size-5" /> Create Founder Account</CardTitle>
              <CardDescription>This account will have full admin privileges</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="f-name">Founder Name</Label>
                  <Input id="f-name" value={founderConfig.founderName} onChange={(e) => setFounderConfig({ ...founderConfig, founderName: e.target.value })} placeholder="Ahmed Ezzat" />
                </div>
                <div>
                  <Label htmlFor="f-email">Email</Label>
                  <Input id="f-email" type="email" value={founderConfig.founderEmail} onChange={(e) => setFounderConfig({ ...founderConfig, founderEmail: e.target.value })} placeholder="founder@example.com" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="f-pass">Password <span className="text-xs text-muted-foreground">(min 10 chars)</span></Label>
                  <Input id="f-pass" type="password" value={founderConfig.founderPassword} onChange={(e) => setFounderConfig({ ...founderConfig, founderPassword: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="f-pass2">Confirm Password</Label>
                  <Input id="f-pass2" type="password" value={founderConfig.founderPasswordConfirm} onChange={(e) => setFounderConfig({ ...founderConfig, founderPasswordConfirm: e.target.value })} />
                </div>
              </div>
              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-3">Company Details</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="c-name">Company Name</Label>
                    <Input id="c-name" value={founderConfig.companyName} onChange={(e) => setFounderConfig({ ...founderConfig, companyName: e.target.value })} placeholder="GarfiX Trading Co." />
                  </div>
                  <div>
                    <Label htmlFor="c-slug">Slug</Label>
                    <Input id="c-slug" value={founderConfig.companySlug} onChange={(e) => setFounderConfig({ ...founderConfig, companySlug: slugify(e.target.value) })} placeholder="garfix-trading" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <Label htmlFor="c-cur">Currency</Label>
                    <Input id="c-cur" value={founderConfig.companyCurrency} onChange={(e) => setFounderConfig({ ...founderConfig, companyCurrency: e.target.value.toUpperCase() })} placeholder="KWD" maxLength={3} />
                  </div>
                  <div>
                    <Label htmlFor="c-vat">VAT Number <span className="text-xs text-muted-foreground">(optional)</span></Label>
                    <Input id="c-vat" value={founderConfig.companyVatNumber} onChange={(e) => setFounderConfig({ ...founderConfig, companyVatNumber: e.target.value })} />
                  </div>
                </div>
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(3)}><ArrowLeft className="size-4 mr-2" /> Back</Button>
                <Button
                  onClick={createFounder}
                  disabled={loading || !founderConfig.founderEmail || !founderConfig.founderPassword || !founderConfig.founderName || !founderConfig.companyName || !founderConfig.companySlug}
                >
                  {loading ? <Loader2 className="size-4 mr-2 animate-spin" /> : <User className="size-4 mr-2" />}
                  Create Account
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 5: Integrations */}
        {step === 5 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Settings className="size-5" /> Optional Integrations</CardTitle>
              <CardDescription>Configure third-party services. All fields are optional — you can add them later in Settings.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="i-openrouter">OpenRouter API Key <Badge variant="secondary" className="ml-2">AI</Badge></Label>
                <Input id="i-openrouter" type="password" value={integrations.OPENROUTER_API_KEY} onChange={(e) => setIntegrations({ ...integrations, OPENROUTER_API_KEY: e.target.value })} placeholder="sk-or-v1-..." />
                <p className="text-xs text-muted-foreground mt-1">Used for AI-powered invoice parsing, chat assistant, and benchmarking.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="i-stripe">Stripe Secret Key</Label>
                  <Input id="i-stripe" type="password" value={integrations.STRIPE_SECRET_KEY} onChange={(e) => setIntegrations({ ...integrations, STRIPE_SECRET_KEY: e.target.value })} placeholder="sk_live_..." />
                </div>
                <div>
                  <Label htmlFor="i-stripe-w">Stripe Webhook Secret</Label>
                  <Input id="i-stripe-w" type="password" value={integrations.STRIPE_WEBHOOK_SECRET} onChange={(e) => setIntegrations({ ...integrations, STRIPE_WEBHOOK_SECRET: e.target.value })} placeholder="whsec_..." />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="i-wa-num">WhatsApp Business Number</Label>
                  <Input id="i-wa-num" value={integrations.WHATSAPP_BUSINESS_NUMBER} onChange={(e) => setIntegrations({ ...integrations, WHATSAPP_BUSINESS_NUMBER: e.target.value })} placeholder="+965..." />
                </div>
                <div>
                  <Label htmlFor="i-wa-tok">WhatsApp Access Token</Label>
                  <Input id="i-wa-tok" type="password" value={integrations.WHATSAPP_ACCESS_TOKEN} onChange={(e) => setIntegrations({ ...integrations, WHATSAPP_ACCESS_TOKEN: e.target.value })} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="i-redis">Redis/Valkey URL</Label>
                  <Input id="i-redis" value={integrations.REDIS_URL} onChange={(e) => setIntegrations({ ...integrations, REDIS_URL: e.target.value })} placeholder="redis://localhost:6379" />
                </div>
                <div>
                  <Label htmlFor="i-smtp">SMTP URL <span className="text-xs text-muted-foreground">(optional)</span></Label>
                  <Input id="i-smtp" value={integrations.SMTP_URL} onChange={(e) => setIntegrations({ ...integrations, SMTP_URL: e.target.value })} placeholder="smtp://user:pass@smtp.example.com:587" />
                </div>
              </div>

              <Alert>
                <ShieldCheck className="size-4" />
                <AlertDescription>
                  A secure <code className="text-xs">NEXTAUTH_SECRET</code> and <code className="text-xs">PAYMENTS_ENC_KEY</code> will be auto-generated and written to <code className="text-xs">.env</code> if you don&apos;t provide them.
                </AlertDescription>
              </Alert>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(4)}><ArrowLeft className="size-4 mr-2" /> Back</Button>
                <Button onClick={saveIntegrations} disabled={loading}>
                  {loading ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
                  Save & Continue <ArrowRight className="size-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 6: Confirmation */}
        {step === 6 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><CheckCircle2 className="size-5 text-emerald-500" /> Setup Complete</CardTitle>
              <CardDescription>Your GarfiX installation is ready</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {setupComplete ? (
                <>
                  <Alert>
                    <CheckCircle2 className="size-4 text-emerald-500" />
                    <AlertTitle>Installation finished</AlertTitle>
                    <AlertDescription>
                      The setup wizard has been disabled and the installer files have been deleted from disk.
                      You can now log in with your founder credentials.
                    </AlertDescription>
                  </Alert>

                  <div className="rounded-lg border p-4 space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Founder email:</span><code className="font-mono">{founderConfig.founderEmail}</code></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Company:</span><code className="font-mono">{founderConfig.companyName} ({founderConfig.companySlug})</code></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Database:</span><code className="font-mono">{dbConfig.host}:{dbConfig.port}/{dbConfig.database}</code></div>
                  </div>

                  <div className="flex justify-end">
                    <Button size="lg" onClick={() => router.push("/login")}>
                      Go to Login <ArrowRight className="size-4 ml-2" />
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-lg border p-4 space-y-3 text-sm">
                    <p className="font-medium">Review your configuration:</p>
                    <div className="space-y-1">
                      <div className="flex justify-between"><span className="text-muted-foreground">Founder:</span><span>{founderConfig.founderName} &lt;{founderConfig.founderEmail}&gt;</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Company:</span><span>{founderConfig.companyName} ({founderConfig.companySlug})</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Database:</span><span>{dbConfig.host}:{dbConfig.port}/{dbConfig.database}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Integrations:</span><span>{Object.values(integrations).filter(Boolean).length} configured</span></div>
                    </div>
                  </div>

                  <Alert>
                    <ShieldCheck className="size-4" />
                    <AlertTitle>Final step</AlertTitle>
                    <AlertDescription>
                      Clicking &quot;Finish &amp; Disable Installer&quot; will:
                      <ol className="list-decimal list-inside mt-1 space-y-0.5 text-xs">
                        <li>Write a <code>.setup-complete</code> marker file</li>
                        <li>Set <code>SETUP_COMPLETE=true</code> in <code>.env</code></li>
                        <li>Delete the <code>/setup</code> page + <code>/api/setup/*</code> routes from disk</li>
                      </ol>
                    </AlertDescription>
                  </Alert>

                  <div className="flex justify-between">
                    <Button variant="outline" onClick={() => setStep(5)}><ArrowLeft className="size-4 mr-2" /> Back</Button>
                    <Button size="lg" onClick={completeSetup} disabled={loading}>
                      {loading ? <Loader2 className="size-4 mr-2 animate-spin" /> : <ShieldCheck className="size-4 mr-2" />}
                      Finish & Disable Installer
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          GarfiX Installer v1 · {new Date().getFullYear()} · This page will self-destruct after setup
        </p>
      </div>
    </div>
  );
}
