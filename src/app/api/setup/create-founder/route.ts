/**
 * POST /api/setup/create-founder
 * Body: {
 *   databaseUrl: string,         // passed from step 2 (so we don't rely on .env)
 *   founderEmail: string,
 *   founderPassword: string,
 *   founderName: string,
 *   companyName: string,
 *   companySlug: string,
 *   companyCurrency?: string,    // default "KWD"
 *   companyVatNumber?: string,
 * }
 *
 * Creates:
 *   1. The founder's company row
 *   2. The founder's AppUser row (role: "admin", emailVerified: true)
 *   3. A CompanyMembership linking the two
 *
 * Returns the founder's uid + company slug.
 *
 * This route does NOT issue a session — the founder will log in via /login
 * after the wizard completes. Keeping session issuance separate avoids
 * complications with JWT signing during setup (NEXTAUTH_SECRET may not be
 * set yet).
 */

import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@/lib/auth";
import {
  isSetupComplete,
  setupAlreadyCompleteResponse,
  appendPoolParams,
} from "@/lib/setup/setup-config";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  if (isSetupComplete()) return setupAlreadyCompleteResponse();

  let body: {
    databaseUrl?: string;
    founderEmail?: string;
    founderPassword?: string;
    founderName?: string;
    companyName?: string;
    companySlug?: string;
    companyCurrency?: string;
    companyVatNumber?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate
  const email = (body.founderEmail || "").trim().toLowerCase();
  const password = body.founderPassword || "";
  const name = (body.founderName || "").trim();
  const companyName = (body.companyName || "").trim();
  const companySlug = (body.companySlug || "").trim().toLowerCase();
  const currency = (body.companyCurrency || "KWD").trim().toUpperCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ ok: false, error: "A valid founder email is required" }, { status: 400 });
  }
  if (password.length < 10) {
    return Response.json({ ok: false, error: "Founder password must be at least 10 characters" }, { status: 400 });
  }
  if (!name) return Response.json({ ok: false, error: "Founder name is required" }, { status: 400 });
  if (!companyName) return Response.json({ ok: false, error: "Company name is required" }, { status: 400 });
  if (!companySlug || !/^[a-z0-9-]+$/.test(companySlug)) {
    return Response.json({ ok: false, error: "Company slug must be lowercase letters, numbers, and dashes only" }, { status: 400 });
  }
  if (!body.databaseUrl) {
    return Response.json({ ok: false, error: "Database URL is required (run /api/setup/run-migrations first)" }, { status: 400 });
  }

  const datasourceUrl = appendPoolParams(body.databaseUrl, 5);
  let prisma: PrismaClient | null = null;

  try {
    prisma = new PrismaClient({ datasourceUrl, log: ["error"] });

    // 1. Create company
    const company = await prisma.company.upsert({
      where: { slug: companySlug },
      update: {
        name: companyName,
        currency,
        vatNumber: body.companyVatNumber || null,
      },
      create: {
        name: companyName,
        slug: companySlug,
        currency,
        vatNumber: body.companyVatNumber || null,
        currencyDecimalPlaces: 3, // KWD/BHD default; founder can change later
      },
    });

    // 2. Create founder user
    const passwordHash = await hashPassword(password);
    const founder = await prisma.appUser.upsert({
      where: { email },
      update: {
        passwordHash,
        displayName: name,
        role: "admin",
        companies: JSON.stringify([company.slug]),
        emailVerified: true,
      },
      create: {
        email,
        passwordHash,
        displayName: name,
        role: "admin",
        companies: JSON.stringify([company.slug]),
        emailVerified: true,
      },
    });

    // 3. Create CompanyMembership (Phase 4 P3 relation)
    try {
      await prisma.companyMembership.upsert({
        where: {
          userUid_companySlug: { userUid: founder.uid, companySlug: company.slug },
        },
        update: { role: "admin" },
        create: {
          userUid: founder.uid,
          companySlug: company.slug,
          role: "admin",
        },
      });
    } catch (err) {
      // CompanyMembership might not exist as a model or have a different
      // unique constraint. Log and continue — the founder can still log in
      // via the JSON `companies` column on AppUser.
      console.warn("[setup] CompanyMembership creation failed (non-fatal):", (err as Error).message);
    }

    return Response.json({
      ok: true,
      founderUid: founder.uid,
      founderEmail: founder.email,
      companySlug: company.slug,
      companyName: company.name,
    });
  } catch (err) {
    return Response.json(
      { ok: false, error: `Failed to create founder: ${(err as Error).message}` },
      { status: 500 },
    );
  } finally {
    if (prisma) {
      try { await prisma.$disconnect(); } catch { /* swallow */ }
    }
  }
}
