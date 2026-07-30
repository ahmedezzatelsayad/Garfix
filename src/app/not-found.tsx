import Link from "next/link";

export default function NotFound() {
  return (
    <div
      className="min-h-dvh flex items-center justify-center bg-background text-foreground p-6"
      dir="rtl"
    >
      <div className="max-w-md w-full text-center space-y-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 text-primary font-extrabold text-2xl">
          G
        </div>
        <div className="space-y-2">
          <h1 className="text-4xl font-extrabold">404</h1>
          <p className="text-muted-foreground text-sm">
            الصفحة التي تبحث عنها غير موجودة أو تم نقلها.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            العودة للرئيسية
          </Link>
          <Link
            href="/help"
            className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-bold text-foreground hover:bg-accent transition-colors"
          >
            مركز المساعدة
          </Link>
        </div>
      </div>
    </div>
  );
}
