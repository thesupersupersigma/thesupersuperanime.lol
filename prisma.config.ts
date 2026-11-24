import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // `prisma generate` needs no database; migrate commands read DATABASE_URL
  datasource: { url: process.env.DATABASE_URL ?? '' },
})
