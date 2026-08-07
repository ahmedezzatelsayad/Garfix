/**
 * /login — Server component wrapper.
 * Renders the static HTML shell, with a client form component for interactions.
 * This avoids hydration issues on Vercel.
 */
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return <LoginForm />;
}
