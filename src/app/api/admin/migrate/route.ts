/**
 * /api/admin/migrate — تشغيل migrations مؤمّنًا بـ METRICS_TOKEN.
 *
 * HOTFIX P0 (إنتاج): بيئة بناء Vercel لا تستطيع الوصول لقاعدة الإنتاج،
 * فلا تُطبَّق migrations من البناء — وحالة الفشل السابقة في _prisma_migrations
 * كانت تقفل deploy بالكامل ويتعطل تسجيل الدخول (500).
 *
 * هذه النقطة تُنفّذ prisma migrate deploy من الـ runtime (حيث القاعدة متاحة)
 * عند نداء واحد من المؤسس بعد النشر:
 *   curl -X POST https://<host>/api/admin/migrate -H "x-metrics-token: ..."
 * - محمية بـ METRICS_TOKEN (fail-closed: 503 لو غير مضبوط)
 * - rate-limited، ولا تُنفّذ شيئًا إذا كانت الحالة سليمة أصلًا.
 */
import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { logger } from "@/lib/logger";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

const execFileAsync = promisify(execFile);

export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = async (req: NextRequest) => {
  const rl = await rateLimitResponse(req, "admin-migrate", { ...LIMITS.API_WRITE, maxAttempts: 5 });
  if (rl) return rl;

  // SEC: نفس توكن القياس السري (fail-closed)
  const token = process.env.METRICS_TOKEN;
  const provided = req.headers.get("x-metrics-token");
  if (!token || !provided || provided !== token) {
    return NextResponse.json({ error: "Service Unavailable: token not configured" }, { status: 503 });
  }

  try {
    // npx prisma CLI متاح داخل تتبع ملفات Vercel (serverless).
    // HOTFIX: بعض عمليات النشر لا تُمرر متغيرات env الحساسة للعملية الفرعية
    // رغم توفرها في process.env — نبنيها صراحة مع fallback منطقي.
    const env = { ...process.env } as NodeJS.ProcessEnv;
    // Vercel لا يمرر دائمًا كل المتغيرات للعمليات الفرعية — نحقن الصريحين:
    const dbUrl = process.env.DATABASE_URL || env.DATABASE_URL;
    const directUrl = process.env.DATABASE_DIRECT_URL || env.DATABASE_DIRECT_URL || dbUrl;
    if (!dbUrl) throw new Error("DATABASE_URL not available in runtime env");
    if (dbUrl) env.DATABASE_URL = dbUrl;
    if (directUrl) env.DATABASE_DIRECT_URL = directUrl;
    const { stdout, stderr } = await execFileAsync(
      process.env.VERCEL ? "node_modules/.bin/prisma" : "npx",
      process.env.VERCEL
        ? ["migrate", "deploy", "--schema", "prisma/schema.prisma"]
        : ["prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"],
      { timeout: 55_000, env, maxBuffer: 4 * 1024 * 1024, cwd: process.cwd() },
    );
    logger.info("[admin/migrate] migrate deploy completed", { tail: stdout.slice(-200) });
    return NextResponse.json({
      ok: true,
      output: stdout.split("\n").slice(-8),
      stderr: stderr ? stderr.split("\n").slice(-3) : [],
    });
  } catch (err) {
    logger.error("[admin/migrate] failed", { err: err instanceof Error ? err.message : String(err) });
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message.slice(0, 300) : "migrate failed",
      },
      { status: 500 },
    );
  }
};
