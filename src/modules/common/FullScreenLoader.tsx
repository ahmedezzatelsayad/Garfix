"use client";

export function FullScreenLoader() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-3 sm:gap-4 p-4 sm:p-0 bg-[linear-gradient(135deg,#0f0a1e_0%,#1e1147_50%,#2d1b69_100%)]"
    >
      <div
        className="w-16 h-16 rounded-2xl bg-[linear-gradient(135deg,#7c3aed,#a78bfa)] flex items-center justify-center text-[32px] font-black text-white shadow-[0_12px_36px_rgba(124,58,237,0.4)] animate-[garfix-pulse-glow_2s_infinite]"
      >
        G
      </div>
      <div className="text-white/70 text-sm font-[var(--font-cairo)]">
        جارٍ التحميل…
      </div>
    </div>
  );
}
