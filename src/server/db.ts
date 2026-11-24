import 'server-only'
import { PrismaPg } from '@prisma/adapter-pg'
import { getConfig } from '@/config'
import { PrismaClient } from '@/generated/prisma/client'

const g = globalThis as { prisma?: PrismaClient }

/** One client per process (dev hot reload re-runs this module); created on first use so builds need no env. */
export const getDb = (): PrismaClient =>
  (g.prisma ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: getConfig().databaseUrl }) }))
