/**
 * /loading — Minimal loading state.
 * VERCEL FIX: simplified to avoid any heavy CSS/JS that could cause
 * SSR issues. Just a plain div with a spinner.
 */
export default function Loading() {
  return (
    <div
      className="min-h-dvh flex items-center justify-center bg-background"
      dir="rtl"
    >
      <div className="h-10 w-10 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
    </div>
  );
}
