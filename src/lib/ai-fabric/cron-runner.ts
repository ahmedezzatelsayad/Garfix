/**
 * cron-runner.ts — Periodic job runner for AI Fabric maintenance tasks.
 *
 * In production, these should be wired to a real cron system (BullMQ repeatable
 * jobs, node-cron, or Vercel Cron). This module provides the functions and
 * a manual trigger for development/testing.
 */

import { logger } from "@/lib/logger";

// Phase 4: Worker scaling
import { scaleWorkers } from "./worker-scaler";
// Phase 11: Learning engine promotion
import { promoteCandidates } from "./learning-engine";
// Phase 14: AI Score computation
import { computeAndSaveScore } from "./ai-score";
// Phase 8: Profit snapshots
import { saveProfitSnapshot } from "./profit-engine";

interface CronJobResult {
  job: string;
  success: boolean;
  durationMs: number;
  error?: string;
  details?: string;
}

/** Run all scheduled AI Fabric maintenance jobs. */
export async function runAllCronJobs(): Promise<CronJobResult[]> {
  const results: CronJobResult[] = [];
  const companies = await getActiveCompanies();

  for (const company of companies) {
    // AI Score
    results.push(await safeRun("ai-score", async () => {
      const score = await computeAndSaveScore(company.slug);
      return `Score: ${score.score}`;
    }));

    // Profit snapshot (daily period: today 00:00 → now)
    results.push(await safeRun("profit-snapshots", async () => {
      const now = new Date();
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      await saveProfitSnapshot(company.slug, dayStart, now);
      return `Snapshot saved for ${company.slug}`;
    }));
  }

  // Worker scaling (platform-wide, no company arg)
  results.push(await safeRun("worker-scaling", async () => {
    await scaleWorkers();
    return "Worker scaling complete";
  }));

  // Learning engine promotion (platform-wide)
  results.push(await safeRun("learning-engine-promotion", async () => {
    const result = await promoteCandidates();
    return `Promoted ${result.promoted}, rejected ${result.rejected}`;
  }));

  const successCount = results.filter((r) => r.success).length;
  logger.info(`[cron-runner] Completed: ${successCount}/${results.length} jobs succeeded`);

  return results;
}

async function safeRun(job: string, fn: () => Promise<string>): Promise<CronJobResult> {
  const t0 = Date.now();
  try {
    const details = await fn();
    return { job, success: true, durationMs: Date.now() - t0, details };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[cron-runner] ${job} failed`, { err: msg });
    return { job, success: false, durationMs: Date.now() - t0, error: msg };
  }
}

async function getActiveCompanies(): Promise<Array<{ slug: string }>> {
  try {
    const { db } = await import("@/lib/db");
    return db.company.findMany({
      select: { slug: true },
    });
  } catch {
    return [];
  }
}

/** Run a single named cron job. */
export async function runSingleJob(jobName: string): Promise<CronJobResult> {
  const jobs: Record<string, () => Promise<string>> = {
    "learning-engine-promotion": async () => {
      const result = await promoteCandidates();
      return `Promoted ${result.promoted}, rejected ${result.rejected}`;
    },
    "worker-scaling": async () => {
      await scaleWorkers();
      return "Worker scaling complete";
    },
  };

  const fn = jobs[jobName];
  if (!fn) {
    return { job: jobName, success: false, durationMs: 0, error: `Unknown job: ${jobName}` };
  }

  return safeRun(jobName, fn);
}