/**
 * /login — Login page.
 *
 * AWS/Docker: full React login form with AuthContext.
 * Vercel: pure HTML form with inline JS (no hydration needed).
 */
import { LoginForm } from "./LoginForm";
import { VercelLoginForm } from "./VercelLoginForm";

export default function LoginPage() {
  if (process.env.VERCEL === "1") {
    return <VercelLoginForm />;
  }
  return <LoginForm />;
}
