import { dbTyped as db } from "@/lib/db";

/**
 * Resolve a Company.id (cuid) from its slug.
 *
 * Used by accounting routes that previously wrote `companyId: "0"` as a
 * placeholder, violating the FK constraint to Company.id.
 *
 * Throws if the company is not found — callers should catch and return 400.
 */
export async function resolveCompanyId(slug: string): Promise<string> {
  const company = await db.company.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!company) {
    throw new Error(`Company not found for slug: ${slug}`);
  }
  return company.id;
}

/**
 * Resolve company id with a fallback — returns "default" if slug is empty.
 * Useful for setup-wizard or platform-wide routes where slug may not be set yet.
 */
export async function resolveCompanyIdOrDefault(slug: string | null | undefined): Promise<string> {
  if (!slug) return "default";
  try {
    return await resolveCompanyId(slug);
  } catch {
    return "default";
  }
}
