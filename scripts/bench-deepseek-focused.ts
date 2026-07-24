/**
 * bench-deepseek-focused.ts
 *
 * Focused benchmark to prove OpenRouter + DeepSeek works end-to-end through
 * the actual API routes (/api/ai/chat + /api/ai/invoice-brain/extract).
 *
 * Runs a SMALL number of calls (4 chat + 1 invoice-brain) to stay within
 * the OpenRouter account's limited remaining credit budget.
 */
import { randomUUID } from "node:crypto";

const BASE = "http://localhost:3000";
const TEST_EMAIL = `ds-${Date.now()}@garfix-bench.app`;
const TEST_PASSWORD = "Bench-Test-1234!";
const COMPANY_SLUG = `ds-co-${Date.now().toString().slice(-8)}`;

interface CookieJar { all: string }

async function register(): Promise<CookieJar> {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, displayName: "DS Bench" }),
  });
  const setCookie = res.headers.get("set-cookie") || "";
  return { all: setCookie.split(",").map(c => c.split(";")[0]).join("; ") };
}

async function login(): Promise<CookieJar> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  const setCookie = res.headers.get("set-cookie") || "";
  return { all: setCookie.split(",").map(c => c.split(";")[0]).join("; ") };
}

async function chat(cookies: CookieJar, message: string): Promise<{ reply: string; meta?: { provider?: string; model?: string; tokensIn?: number; tokensOut?: number; processingMs?: number }; status: number; ms: number }> {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/ai/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookies.all },
    body: JSON.stringify({ messages: [{ role: "user", content: message }], companySlug: COMPANY_SLUG }),
  });
  const ms = Date.now() - t0;
  const body = await res.json();
  return { reply: body.reply || "", meta: body.meta, status: res.status, ms };
}

async function invoiceBrainExtract(cookies: CookieJar, rawText: string): Promise<{ source?: string; ms: number; status: number; meta?: unknown }> {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/ai/invoice-brain/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookies.all },
    body: JSON.stringify({ rawText, companySlug: COMPANY_SLUG }),
  });
  const ms = Date.now() - t0;
  const body = await res.json();
  return { source: body.meta?.source, ms, status: res.status, meta: body.meta };
}

async function main() {
  console.log("=== DeepSeek Focused Benchmark ===");
  console.log(`Email: ${TEST_EMAIL}`);
  console.log(`Company: ${COMPANY_SLUG}\n`);

  // 1. Register + login
  console.log("1. Registering test user...");
  await register();
  let cookies = await login();
  console.log("   ✓ Logged in\n");

  // 2. Grant admin + create company via DB
  console.log("2. Creating benchmark company...");
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const user = await prisma.appUser.findUnique({ where: { email: TEST_EMAIL } });
  if (!user) throw new Error("user not found");

  await prisma.appUser.update({
    where: { uid: user.uid },
    data: {
      role: "admin",
      permissions: JSON.stringify({}),
      companies: JSON.stringify([COMPANY_SLUG]),
      emailVerified: true,
    },
  });

  await prisma.company.upsert({
    where: { slug: COMPANY_SLUG },
    update: {},
    create: {
      slug: COMPANY_SLUG,
      name: "شركة DeepSeek",
      nameAr: "شركة DeepSeek",
      plan: "starter",
      subscriptionStatus: "trialing",
      country: "KW",
      currency: "KWD",
      defaultTaxRate: "0",
      email: "ds@test.app",
    },
  });

  // Seed 1 client + 1 invoice for context
  const client = await prisma.client.create({
    data: { name: "عميل DeepSeek الأول", phone: "+965 5555 0001", email: "ds1@bench.app", companySlug: COMPANY_SLUG, address: "الكويت" },
  });
  await prisma.invoice.create({
    data: {
      companySlug: COMPANY_SLUG,
      invoiceNumber: `INV-DS-001`,
      clientName: client.name,
      clientPhone: client.phone,
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      status: "sent",
      lineItems: JSON.stringify([{ description: "خدمة DeepSeek", qty: "2", price: "50.000" }]),
      subtotal: "100.000",
      taxRate: "0", taxAmount: "0", total: "100.000",
      shipping: "0", discount: "0", paid: "0", version: 0,
    },
  });
  console.log("   ✓ Company + client + invoice seeded\n");

  // Re-login to refresh session
  cookies = await login();

  // 3. Run 4 chat commands (spaced to avoid rate limit)
  console.log("3. Running 4 chat commands through /api/ai/chat...\n");
  const commands = [
    "كم عدد العملاء لدي؟",
    "كم عدد الفواتير؟",
    "ما هو إجمالي الإيرادات؟",
    "من أنت؟",
  ];

  const chatResults: Array<{ cmd: string; status: number; ms: number; provider?: string; model?: string; tokensIn?: number; tokensOut?: number; replyPreview: string }> = [];
  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];
    process.stdout.write(`   [${i + 1}/${commands.length}] "${cmd}"... `);
    if (i > 0) await new Promise(r => setTimeout(r, 7000)); // 7s gap = under 10/min limit
    const result = await chat(cookies, cmd);
    const provider = result.meta?.model?.includes("deepseek") ? "openrouter/deepseek" :
                     result.meta?.model === "z-ai-glm" ? "z-ai (fallback)" : result.meta?.model || "?";
    console.log(`${result.ms}ms [${provider}] tok=${result.meta?.tokensIn || 0}/${result.meta?.tokensOut || 0}`);
    chatResults.push({
      cmd,
      status: result.status,
      ms: result.ms,
      provider,
      model: result.meta?.model,
      tokensIn: result.meta?.tokensIn,
      tokensOut: result.meta?.tokensOut,
      replyPreview: result.reply.slice(0, 80).replace(/\n/g, " "),
    });
  }

  // 4. Run 1 invoice-brain extraction with a NEW format (triggers AI)
  console.log("\n4. Running invoice-brain extraction (NEW format → AI path)...\n");
  const newFormat = `Customer: DeepSeek Test
Address: Kuwait - Hawalli
Price: 85
Currency: KWD
Discount: 5
Tax: 0
Total: 80
Notes: urgent delivery`;
  process.stdout.write("   [1/1] Extracting... ");
  const brain = await invoiceBrainExtract(cookies, newFormat);
  console.log(`${brain.ms}ms source=${brain.source}`);

  // 5. Check ai_usage_logs for DeepSeek entries
  console.log("\n5. Checking ai_usage_logs for DeepSeek entries...\n");
  const logs = await prisma.aIUsageLog.findMany({
    where: { companySlug: COMPANY_SLUG },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  console.log(`   Found ${logs.length} rows for ${COMPANY_SLUG}:`);
  for (const log of logs) {
    const isDeepSeek = log.model?.includes("deepseek");
    console.log(
      `   ${isDeepSeek ? "🌟" : "  "} id=${log.id} ep=${log.endpoint.padEnd(15)} ` +
      `${log.provider}/${log.model} tok=${log.tokensIn}/${log.tokensOut} ` +
      `cost=$${log.estimatedCost} ms=${log.processingMs} ok=${log.success}`,
    );
  }

  const deepseekCount = logs.filter(l => l.model?.includes("deepseek")).length;
  const zaiCount = logs.filter(l => l.model === "z-ai-glm").length;
  console.log(`\n   DeepSeek calls: ${deepseekCount}`);
  console.log(`   z-ai fallback:  ${zaiCount}`);

  // 6. Summary
  console.log("\n" + "=".repeat(70));
  console.log("=== SUMMARY ===");
  console.log("=".repeat(70));
  console.log("\n--- Chat Commands ---");
  console.log("N | Cmd | HTTP | Ms | Provider | TokIn | TokOut | Reply");
  console.log("-".repeat(100));
  for (const r of chatResults) {
    console.log(`${chatResults.indexOf(r) + 1} | ${r.cmd.slice(0, 25).padEnd(25)} | ${r.status} | ${String(r.ms).padStart(5)} | ${(r.provider || "?").padEnd(20)} | ${String(r.tokensIn || 0).padStart(5)} | ${String(r.tokensOut || 0).padStart(6)} | ${r.replyPreview}`);
  }

  console.log("\n--- Invoice-Brain ---");
  console.log(`  NEW format: ${brain.ms}ms source=${brain.source}`);

  console.log("\n--- ai_usage_logs (proof) ---");
  for (const log of logs.slice(0, 6)) {
    console.log(`  id=${log.id} ${log.endpoint} ${log.provider}/${log.model} tok=${log.tokensIn}/${log.tokensOut} cost=$${log.estimatedCost} ms=${log.processingMs} ok=${log.success} at=${log.createdAt.toISOString()}`);
  }

  console.log(`\n--- Verdict ---`);
  if (deepseekCount > 0) {
    console.log(`  ✅ DeepSeek is ACTIVE — ${deepseekCount} call(s) used provider=openrouter model=deepseek/deepseek-chat`);
  } else {
    console.log(`  ⚠️  No DeepSeek calls succeeded — all fell back to z-ai (likely OpenRouter credit limit)`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error("FAILED:", e); process.exit(1); });

// Make this file a module to avoid global scope collisions
export {};
