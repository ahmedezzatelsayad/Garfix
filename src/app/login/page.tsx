/**
 * /login — Login page.
 *
 * AWS/Docker: full React login form with AuthContext.
 * Vercel: pure HTML form with inline JS (no hydration needed).
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
import { VercelLoginForm } from "./VercelLoginForm";

export default function LoginPage() {
  if (process.env.VERCEL === "1") {
    return <VercelLoginForm />;
  }
  return <LoginForm />;
}
