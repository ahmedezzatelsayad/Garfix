import { NextRequest, NextResponse } from 'next/server'

/**
 * Middleware for the GarfiX accounting module.
 * This file handles request-level middleware (rate limiting, CORS, etc.)
 * 
 * NOTE: `resolveAuth` and `assertCompanyAccess` are NOT exported here.
 * They are located in `@/lib/auth` — do NOT import them from this file.
 */

export function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-id, x-company-id, x-user-role',
  }
}

export function handleCors(request: NextRequest): NextResponse | null {
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: corsHeaders() })
  }
  return null
}
