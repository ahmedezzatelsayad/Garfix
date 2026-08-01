export default function Loading() {
  return (
    <div
      className="min-h-dvh flex items-center justify-center bg-background text-muted-foreground"
      dir="rtl"
    >
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-sm">جارٍ التحميل…</p>
      </div>
    </div>
  );
}
