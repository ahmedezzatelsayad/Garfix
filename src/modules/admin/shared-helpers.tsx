/**
 * Small reusable UI primitives shared across PlatformAdminPanel and
 * its extracted sub-components. Extracted here so tabs/drawers can
 * import them without circular dependency on PlatformAdminPanel.
 */

export function IconBtn({ color, children, ...props }: { color: string; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-transparent border border-[var(--border)] cursor-pointer p-0" /* TAILWINDBREAK: dynamic color */ style={{ color }} {...props}>{children}</button>;
}

export function KpiCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="p-3 sm:p-4 rounded-2xl bg-[var(--card)] border border-[var(--border)]">
      <div className="text-[11px] text-[var(--muted-foreground)] font-semibold mb-1.5">{label}</div>
      <div className="text-[22px] font-black" /* TAILWINDBREAK: dynamic color */ style={{ color }}>{value}</div>
    </div>
  );
}
