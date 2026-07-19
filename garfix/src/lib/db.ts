import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// SEC-004 FIX: Only log queries in development, never in production
const isDev = process.env.NODE_ENV !== 'production';

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isDev ? ['query', 'warn', 'error'] : ['warn', 'error'],
  })

if (isDev) globalForPrisma.prisma = db