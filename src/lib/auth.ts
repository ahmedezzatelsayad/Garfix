import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

/**
 * Resolve authentication from the request.
 * Extracts user info from headers or session.
 */
export async function resolveAuth(request: NextRequest): Promise<{
  userId: string
  companyId: string
  role: string
} | null> {
  // In a real app, this would use NextAuth session or JWT verification.
  // For this module, we read from custom headers set by the gateway/auth layer.
  const userId = request.headers.get('x-user-id')
  const companyId = request.headers.get('x-company-id')
  const role = request.headers.get('x-user-role') ?? 'user'

  if (!userId || !companyId) return null

  // Verify user exists and belongs to the company
  const user = await db.user.findUnique({
    where: { id: userId },
  })

  if (!user || (user.companyId && user.companyId !== companyId)) return null

  return { userId, companyId, role }
}

/**
 * Assert that the authenticated user has access to the specified company.
 * Throws a 403 error if the user does not have access.
 */
export function assertCompanyAccess(
  auth: { userId: string; companyId: string; role: string },
  targetCompanyId: string
): void {
  if (auth.companyId !== targetCompanyId && auth.role !== 'admin') {
    throw new Error('Forbidden: You do not have access to this company')
  }
}

/**
 * Require authentication — returns auth or throws an error response.
 */
export async function requireAuth(request: NextRequest): Promise<{
  userId: string
  companyId: string
  role: string
}> {
  const auth = await resolveAuth(request)
  if (!auth) {
    throw new Error('Unauthorized: Authentication required')
  }
  return auth
}
