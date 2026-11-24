// Only for `pnpm auth:schema` (Better Auth's CLI writes its tables into prisma/schema.prisma). Every login method is
// switched on here so the CLI sees every table; the values are dummies and never used.
import { createAuth } from '../src/server/auth'

Object.assign(process.env, {
  DATABASE_URL: 'postgres://cli@localhost/cli',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  AUTH_EMAIL_ALLOW_UNVERIFIED: 'true',
})
export const auth = createAuth()
