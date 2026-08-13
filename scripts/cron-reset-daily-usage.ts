/**
 * cron-reset-daily-usage.ts — AI-06 FIX (Audit v2 · Phase 2)
 *
 * Resets `ApiKeyPool.usedToday` to 0 for every key in the pool at midnight
 * (server local time) so the per-key `dailyLimit` cap can be re-enforced
 * the next day.
 *
 * Why this is needed:
 *   - `ApiKeyPool.dailyLimit` (Int, default 1000) caps how many requests a
 *     single key can issue per day.
 *   - `ApiKeyPool.usedToday` (BigInt, default 0) is incremented on every
 *     successful call via `recordKeyUse()` in `src/lib/ai/key-pool.ts`.
 *   - AI-06 fix in `pickPoolKey()` enforces `usedToday >= dailyLimit` and
 *     skips exhausted keys. Without a daily reset, every key would hit its
 *     cap once and the pool would be permanently unusable.
 *   - The schema also has a `resetAt DateTime?` column to record when the
 *     counter was last reset — we update it on every run for observability.
 *
 * Deployment:
 *   Schedule via system cron (crontab) or external scheduler (Render Cron,
 *   Vercel Cron, GitHub Actions, k8s CronJob). Examples:
 *
 *   # System crontab — midnight server time daily
 *   0 0 * * *  cd /home/z/my-project && bun run scripts/cron-reset-daily-usage.ts >> /var/log/garfix-cron.log 2>&1
 *
 *   # bun (preferred — reuses Prisma client + tsconfig path aliases)
 *   bun run scripts/cron-reset-daily-usage.ts
 *
 *   # node + tsx fallback (no bun runtime)
 *   bunx tsx scripts/cron-reset-daily-usage.ts
 *
 * Exit codes:
 *   0 — success (or no keys to reset)
 *   1 — failure (DB error, etc.) — surface to the cron scheduler so it
 *       can alert the on-call founder.
 *
 * Environment:
 *   Reads the same DATABASE_URL the Next.js app uses (via Prisma). No
 *   additional configuration is required.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main(): Promise<void> {
  const startedAt = new Date();
  console.log(`[cron-reset-daily-usage] starting at ${startedAt.toISOString()}`);

  // Reset every key (regardless of status — even revoked/exhausted keys
  // get their counter zeroed so a future re-enable starts from 0). We
  // update `usedToday` AND `resetAt` in a single statement so the
  // observability column reflects the last reset timestamp.
  const result = await db.apiKeyPool.updateMany({
    where: {
      // Only reset keys that have a non-zero counter — skips a no-op
      // write for keys that were never used today (saves DB load on
      // large pools). Keys with usedToday = 0 are already "reset".
      usedToday: { gt: BigInt(0) },
    },
    data: {
      usedToday: BigInt(0),
      resetAt: startedAt,
    },
  });

  console.log(
    `[cron-reset-daily-usage] reset usedToday → 0 for ${result.count} key(s)`,
  );
  console.log(
    `[cron-reset-daily-usage] done at ${new Date().toISOString()}`,
  );
}

main()
  .catch((err) => {
    console.error("[cron-reset-daily-usage] FAILED:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
