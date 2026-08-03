/**
 * /loading — GarfiX Global Loading State (DS v4.0 Enhanced)
 *
 * Enhanced loading experience with:
 * - Animated progress bar
 * - Skeleton loading states
 * - Brand-consistent dark emerald theme
 * - Smooth micro-animations
 */
export default function Loading() {
  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-center bg-[#0b1220] text-muted-foreground p-6"
      dir="rtl"
    >
      {/* Main Loading Container */}
      <div className="flex flex-col items-center gap-6 max-w-xs w-full">
        
        {/* ── Animated Logo ── */}
        <div className="relative">
          {/* Outer rotating ring */}
          <div className="h-16 w-16 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
          
          {/* Inner pulsing core */}
          <div className="absolute inset-2 rounded-full bg-gradient-to-br from-emerald-500/20 to-emerald-700/20 flex items-center justify-center">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-brand-md animate-pulse-slow">
              <svg 
                className="h-4 w-4 text-white" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>
        </div>

        {/* ── Progress Bar ── */}
        <div className="w-full space-y-2">
          <div className="h-1.5 w-full rounded-full bg-[#1f2937] overflow-hidden">
            <div 
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 animate-progress"
              style={{
                animation: 'progress 2s ease-in-out infinite',
                width: '60%'
              }}
            />
          </div>
        </div>

        {/* ── Loading Text with Dots Animation ── */}
        <div className="text-center space-y-2">
          <p className="text-sm font-medium text-emerald-400/90 tracking-wide">
            جارٍ التحميل
            <span className="inline-flex gap-0.5 mr-1">
              <span className="animate-bounce-slow" style={{ animationDelay: '0ms' }}>.</span>
              <span className="animate-bounce-slow" style={{ animationDelay: '150ms' }}>.</span>
              <span className="animate-bounce-slow" style={{ animationDelay: '300ms' }}>.</span>
            </span>
          </p>
          <p className="text-xs text-muted-foreground/60">
            GarfiX EOS v4.0
          </p>
        </div>

        {/* ── Skeleton Cards Preview ── */}
        <div className="w-full space-y-3 pt-4">
          {/* Skeleton Card 1 */}
          <div className="h-20 rounded-xl bg-[#111827] border border-emerald-500/10 p-4 space-y-2 animate-pulse-slow">
            <div className="h-3 w-1/3 rounded bg-emerald-500/10" />
            <div className="h-2 w-2/3 rounded bg-muted-foreground/10" />
          </div>
          
          {/* Skeleton Card 2 */}
          <div className="h-16 rounded-lg bg-[#111827] border border-emerald-500/10 p-3 flex items-center gap-3 animate-pulse-slow" style={{ animationDelay: '200ms' }}>
            <div className="h-8 w-8 rounded-lg bg-emerald-500/10" />
            <div className="flex-1 space-y-1.5">
              <div className="h-2 w-1/2 rounded bg-muted-foreground/10" />
              <div className="h-2 w-1/3 rounded bg-muted-foreground/5" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Inline Keyframes for Animations ── */}
      <style jsx>{`
        @keyframes progress {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(0%); }
          100% { transform: translateX(350%); }
        }
        
        @keyframes bounce-slow {
          0%, 100% { opacity: 0.3; transform: translateY(0); }
          50% { opacity: 1; transform: translateY(-4px); }
        }
        
        @keyframes pulse-slow {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        
        .animate-progress {
          animation: progress 2s ease-in-out infinite;
        }
        
        .animate-bounce-slow {
          animation: bounce-slow 1s ease-in-out infinite;
        }
        
        .animate-pulse-slow {
          animation: pulse-slow 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
