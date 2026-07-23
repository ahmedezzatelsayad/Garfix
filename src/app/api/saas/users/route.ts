/**
 * /api/saas/users
 * GET — list users (founder: all; admin: scoped to companies they manage)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth, hasUnrestrictedScope } from "@/lib/auth";
import { isFounderEmail } from "@/lib/founder";
import { withErrorHandler, parseJsonField } from "@/lib/api";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { hashPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { apiError, parseJsonBody } from "@/lib/api";

const CreateUserSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1),
  password: z.string().min(8),
  role: z.enum(["admin", "editor", "employee", "viewer"]).default("employee"),
  companies: z.array(z.string()).default([]),
  permissions: z.record(z.string(), z.number()).default({}),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = result.user;

  // Only admins / founder can list users
  if (user.role !== "admin" && !isFounderEmail(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let users;
  if (isFounderEmail(user.email)) {
    users = await db.user.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  } else {
    // Admin: list users that share at least one company
    users = await db.user.findMany({
      where: { companies: { contains: user.companies[0] || "____" } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  return NextResponse.json({
    users: users.map((u) => ({
      uid: u.uid,
      email: u.email,
      displayName: u.displayName,
      role: u.role,
      companies: parseJsonField<string[]>(u.companies, []),
      permissions: parseJsonField<Record<string, number>>(u.permissions, {}),
      emailVerified: u.emailVerified,
      isFounder: isFounderEmail(u.email),
      createdAt: u.createdAt,
    })),
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (result.user.role !== "admin" && !isFounderEmail(result.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await parseJsonBody(req);
  const parsed = CreateUserSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  // SEC-H1C4 (Cycle 4): close mass-assignment / cross-tenant privilege escalation.
  // A tenant admin could previously create a new user with an arbitrary `companies`
  // array — granting admin access to any company in the platform, including ones
  // they don't manage. Now we require that every slug in data.companies is in the
  // caller's own companies list (founder bypasses).
  const caller = result.user;
  const callerIsFounder = isFounderEmail(caller.email);
  if (!callerIsFounder && data.companies.length > 0) {
    const callerCompanies = new Set(caller.companies || []);
    const illegal = data.companies.filter((slug) => !callerCompanies.has(slug));
    if (illegal.length > 0) {
      await logAudit({
        userEmail: caller.email, userUid: caller.uid,
        action: "create_denied", entity: "user",
        details: { reason: "cross_tenant_company_assignment", attemptedSlugs: illegal },
      });
      return apiError("لا يمكنك إضافة مستخدم إلى شركة لا تديرها", 403);
    }
  }
  // Non-founder admins cannot create new admins/founders — only the founder
  // can grant admin role. Tenant admins may still create editor/employee/viewer.
  if (!callerIsFounder && data.role === "admin") {
    return apiError("لا يمكن للمدير العادي إنشاء حسابات مديرين — تواصل مع المؤسس", 403);
  }

  const existing = await db.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (existing) return apiError("هذا البريد مسجّل مسبقاً", 409);

  const passwordHash = await hashPassword(data.password);
  const uid = randomUUID();
  const user = await db.user.create({
    data: {
      uid, email: data.email.toLowerCase(), passwordHash,
      displayName: data.displayName, role: data.role,
      companies: JSON.stringify(data.companies),
      permissions: JSON.stringify(data.permissions),
      emailVerified: true,
    },
  });

  await logAudit({
    userEmail: result.user.email, userUid: result.user.uid,
    action: "create", entity: "user", entityId: user.uid,
    details: { newEmail: user.email, role: user.role },
  });

  return NextResponse.json({ ok: true, user: { uid: user.uid, email: user.email, displayName: user.displayName, role: user.role } });
});
