-- Phase 4 P3: CompanyMembership join table (replaces AppUser.companies JSON string).
-- This table is the proper relational approach to multi-tenant membership.
-- The JSON column (AppUser.companies) stays for backward compatibility until
-- all code is migrated to use CompanyMembership queries.

CREATE TABLE IF NOT EXISTS "company_memberships" (
    "id" TEXT NOT NULL,
    "userUid" TEXT NOT NULL,
    "companySlug" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'employee',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "company_memberships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "company_memberships_userUid_companySlug_key" ON "company_memberships"("userUid", "companySlug");
CREATE INDEX IF NOT EXISTS "company_memberships_companySlug_idx" ON "company_memberships"("companySlug");
CREATE INDEX IF NOT EXISTS "company_memberships_userUid_idx" ON "company_memberships"("userUid");

-- Foreign keys
ALTER TABLE "company_memberships" ADD CONSTRAINT "company_memberships_userUid_fkey"
  FOREIGN KEY ("userUid") REFERENCES "app_users"("uid") ON DELETE CASCADE;
ALTER TABLE "company_memberships" ADD CONSTRAINT "company_memberships_companySlug_fkey"
  FOREIGN KEY ("companySlug") REFERENCES "companies"("slug") ON DELETE RESTRICT;

-- Backfill from AppUser.companies JSON column (best-effort — may need manual
-- verification for edge cases like malformed JSON).
-- This is a one-time migration; subsequent membership changes go through the app.
INSERT INTO "company_memberships" ("id", "userUid", "companySlug", "role", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  uid,
  elem::text,
  CASE WHEN role = 'admin' THEN 'admin' ELSE 'employee' END,
  NOW(),
  NOW()
FROM "app_users",
  jsonb_array_elements_text(CASE
    WHEN companies ~ '^\[.*\]$' THEN companies::jsonb
    ELSE '[]'::jsonb
  END) AS elem
WHERE companies IS NOT NULL AND companies != '[]'
ON CONFLICT ("userUid", "companySlug") DO NOTHING;
