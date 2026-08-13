/**
 * /login — Login page.
 *
 * AWS/Docker/Vercel: full React login form with AuthContext.
 *
 * // FE-05 FIX (Audit v2 · Phase 1) — Vercel escape-hatch (VercelLoginForm)
 * deleted; the React LoginForm works on every deployment target.
 *
 * DEPLOYMENT FIX: force-dynamic prevents prerender failure.
 */
import type { Metadata } from "next";

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "تسجيل الدخول · GarfiX",
  description: "تسجيل الدخول إلى منصة GarfiX EOS — الوصول إلى لوحة التحكم وإدارة أعمالك السحابية بأمان.",
};

import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return <LoginForm />;
}
