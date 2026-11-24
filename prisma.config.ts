import { defineConfig } from 'prisma/config'

// Prisma 7 doesn't read .env itself; Node can (no file in Docker, where compose passes env).
try {
  process.loadEnvFile()
} catch {}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // `prisma generate` needs no database; migrate commands read DATABASE_URL
  datasource: { url: process.env.DATABASE_URL ?? '' },
})
