import { dbTyped as db } from "@/lib/db";
import { logger } from "@/lib/logger";

const FALLBACK_PROMPTS: Record<string, string> = {
  "garfix-persona": "أنت جارفيكس، مساعد ذكاء اصطناعي متخصص في ERP والفوترة الإلكترونية للشرق الأوسط.",
  "invoice-extract": "أنت محرك استخلاص بيانات فواتير. اقرأ النص وارجع JSON فقط.",
  "smart-parse": "أنت محلل فواتير ذكي. حلل النص وأرجع JSON بالمنتجات المطابقة.",
  "vision-parse": "أنت محلل فواتير بالصور. استخرج البيانات وأرجع JSON فقط.",
  "agent-accounting": "أنت وكيل محاسبة متخصص. اتبع معايير IFRS.",
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { content: string; version: number; fetchedAt: number }>();

export function invalidatePromptCache(name?: string): void {
  if (name) cache.delete(name); else cache.clear();
}

export async function getPrompt(name: string): Promise<string> {
  const cached = cache.get(name);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.content;
  try {
    const row = await db.promptTemplate.findFirst({
      where: { name, active: true },
      orderBy: { version: "desc" },
      select: { content: true, version: true },
    });
    if (row?.content) {
      cache.set(name, { content: row.content, version: row.version, fetchedAt: Date.now() });
      return row.content;
    }
  } catch (dbErr) {
    logger.warn("[promptTemplate] DB fetch failed, using fallback", { name, err: dbErr instanceof Error ? dbErr.message : String(dbErr) });
  }
  const fallback = FALLBACK_PROMPTS[name];
  if (fallback) {
    cache.set(name, { content: fallback, version: 0, fetchedAt: Date.now() });
    return fallback;
  }
  throw new Error(`[promptTemplate] no prompt found for name "${name}"`);
}

export async function getPromptWithVersion(name: string): Promise<{ content: string; version: number }> {
  const cached = cache.get(name);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return { content: cached.content, version: cached.version };
  try {
    const row = await db.promptTemplate.findFirst({
      where: { name, active: true },
      orderBy: { version: "desc" },
      select: { content: true, version: true },
    });
    if (row?.content) {
      cache.set(name, { content: row.content, version: row.version, fetchedAt: Date.now() });
      return { content: row.content, version: row.version };
    }
  } catch {}
  const fallback = FALLBACK_PROMPTS[name];
  if (fallback) {
    cache.set(name, { content: fallback, version: 0, fetchedAt: Date.now() });
    return { content: fallback, version: 0 };
  }
  throw new Error(`[promptTemplate] no prompt found for name "${name}"`);
}

export async function listPromptNames(): Promise<string[]> {
  try {
    const rows = await db.promptTemplate.findMany({ where: { active: true }, select: { name: true }, distinct: ["name"], orderBy: { name: "asc" } });
    return rows.map((r) => r.name);
  } catch {
    return Object.keys(FALLBACK_PROMPTS);
  }
}
