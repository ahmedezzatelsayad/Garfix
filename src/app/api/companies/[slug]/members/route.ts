/**
 * /api/companies/[slug]/members
 * GET  — list all users who are members of the given company
 * POST — add an existing user to this company (by email lookup), or create
 *        a new user with email + role + permissions, then attach to company
 *
 * Permission: settings_access (admin/founder implicitly pass)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { hashPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { isFounderEmail } from "@/lib/founder";
import { randomUUID, randomBytes } from "node:crypto";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody, parseJsonField } from "@/lib/api";

type RouteParams = { params: Promise<{ slug: string }> };

const InviteSchema = z.object({
  email: z.string().email("بريد إلكتروني غير صالح"),
  role: z.enum(["admin", "editor", "employee", "viewer"]).default("employee"),
  permissions: z.record(z.string(), z.number()).default({}),
  displayName: z.string().min(1, "الاسم مطلوب عند إنشاء مستخدم جديد").optional(),
});

/** Safely parse a user's companies JSON array. */
function readCompanies(raw: string | null | undefined): string[] {
  const arr = parseJsonField<unknown>(raw, []);
  return Array.isArray(arr) ? arr.filter((s): s is string => typeof s === "string") : [];
}

/** Safely parse a user's permissions JSON map. */
function readPerms(raw: string | null | undefined): Record<string, number> {
  const obj = parseJsonField<unknown>(raw, {});
  return obj && typeof obj === "object" ? (obj as Record<string, number>) : {};
}

export const GET = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { slug } = await params;
  const access = await requirePermissionForCompany(req, "settings_access", slug);
  if ("error" in access) return access.error;

  // SQLite has no native JSON query — use a substring filter then validate in JS.
  const candidates = await db.user.findMany({
    where: { companies: { contains: slug } },
    orderBy: { createdAt: "desc" },
  });

  const members = candidates
    .map((u) => ({
      uid: u.uid,
      email: u.email,
      displayName: u.displayName,
      role: u.role,
      companies: readCompanies(u.companies),
      permissions: readPerms(u.permissions),
      isFounder: isFounderEmail(u.email),
      createdAt: u.createdAt,
    }))
    .filter((m) => m.companies.includes(slug));

  return NextResponse.json({ members, companySlug: slug });
});

export const POST = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { slug } = await params;
  const access = await requirePermissionForCompany(req, "settings_access", slug);
  if ("error" in access) return access.error;
  const admin = access.user;

  const body = await parseJsonBody(req);
  const parsed = InviteSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  }
  const data = parsed.data;
  const email = data.email.toLowerCase();

  const existing = await db.user.findUnique({ where: { email } });

  let user: { uid: string; email: string; displayName: string; role: string; companies: string; permissions: string };
  let temporaryPassword: string | null = null;
  let created = false;

  if (existing) {
    // Attach company to existing user
    const companies = readCompanies(existing.companies);
    if (!companies.includes(slug)) companies.push(slug);

    // Merge provided permissions into existing ones
    const perms = readPerms(existing.permissions);
    if (data.permissions && Object.keys(data.permissions).length > 0) {
      Object.assign(perms, data.permissions);
    }

    user = await db.user.update({
      where: { uid: existing.uid },
      data: {
        companies: JSON.stringify(companies),
        permissions: JSON.stringify(perms),
        role: data.role, // update role if provided
      },
      select: { uid: true, email: true, displayName: true, role: true, companies: true, permissions: true },
    });
  } else {
    // Create a new user. Generate a random temporary password — admin shares it,
    // and the user is expected to use forgot-password flow to set their own.
    if (!data.displayName) {
      return apiError("الاسم مطلوب عند إنشاء مستخدم جديد", 400);
    }
    temporaryPassword = randomBytes(8).toString("hex");
    const passwordHash = await hashPassword(temporaryPassword);
    const uid = randomUUID();
    const perms = data.permissions || {};
    created = true;

    user = await db.user.create({
      data: {
        uid,
        email,
        passwordHash,
        displayName: data.displayName,
        role: data.role,
        companies: JSON.stringify([slug]),
        permissions: JSON.stringify(perms),
        emailVerified: false,
      },
      select: { uid: true, email: true, displayName: true, role: true, companies: true, permissions: true },
    });
  }

  await logAudit({
    userEmail: admin.email,
    userUid: admin.uid,
    action: created ? "team_member_invite" : "team_member_add",
    entity: "company_member",
    entityId: user.uid,
    companySlug: slug,
    details: {
      targetEmail: user.email,
      targetRole: user.role,
      created,
    },
  });

  return NextResponse.json({
    ok: true,
    member: {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      companies: readCompanies(user.companies),
      permissions: readPerms(user.permissions),
      isFounder: isFounderEmail(user.email),
    },
    temporaryPassword,
    created,
  });
});
