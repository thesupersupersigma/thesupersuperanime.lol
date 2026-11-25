// `prisma migrate deploy` without the Prisma CLI (which costs ~230 MB in the image). Applies prisma/migrations/*
// in order and keeps the same `_prisma_migrations` table, rows and checksums Prisma writes, so you can switch back to
// the Prisma CLI at any time (it sees these migrations as applied). Usage: DATABASE_URL=… node migrate.mjs <dir>
import { createHash, randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// Prisma's own advisory lock key, so this runner and the Prisma CLI never migrate at the same time
const LOCK = 72707369

const TABLE = `CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" VARCHAR(36) PRIMARY KEY NOT NULL,
  "checksum" VARCHAR(64) NOT NULL,
  "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL,
  "logs" TEXT,
  "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
)`

export const checksum = (sql) => createHash('sha256').update(sql).digest('hex')

/**
 * What `migrate deploy` would do, from the local migration names and the table's rows: stop on a failed migration
 * (started, never finished, not rolled back), else apply every local one that has no finished row, in name order.
 */
export function plan(local, rows) {
  const failed = rows.find((r) => !r.finished_at && !r.rolled_back_at)
  if (failed) return { failed: failed.migration_name, pending: [] }
  const done = new Set(rows.filter((r) => r.finished_at && !r.rolled_back_at).map((r) => r.migration_name))
  return { failed: null, pending: [...local].sort().filter((m) => !done.has(m)) }
}

export async function migrate(databaseUrl, dir, log = console.log) {
  const { default: pg } = await import('pg')
  const db = new pg.Client({ connectionString: databaseUrl })
  await db.connect()
  try {
    await db.query('SELECT pg_advisory_lock($1)', [LOCK])
    await db.query(TABLE)
    const local = (await readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name)
    const { rows } = await db.query('SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"')
    const { failed, pending } = plan(local, rows)
    if (failed)
      throw new Error(
        `migration "${failed}" failed earlier and was never finished. Fix the database by hand, then mark it ` +
          'rolled back (UPDATE "_prisma_migrations" SET rolled_back_at = now() WHERE migration_name = …) or applied.',
      )
    if (!pending.length) return log('migrate: no pending migrations')
    for (const name of pending) {
      const sql = await readFile(join(dir, name, 'migration.sql'))
      const id = randomUUID()
      await db.query('INSERT INTO "_prisma_migrations" (id, checksum, migration_name) VALUES ($1, $2, $3)', [
        id,
        checksum(sql),
        name,
      ])
      try {
        // one multi-statement simple query runs as one implicit transaction in Postgres, as Prisma's does
        await db.query(sql.toString('utf8'))
      } catch (e) {
        await db.query('UPDATE "_prisma_migrations" SET logs = $2 WHERE id = $1', [id, String(e?.message ?? e)])
        throw new Error(`migration "${name}" failed: ${e?.message ?? e}`)
      }
      await db.query(
        'UPDATE "_prisma_migrations" SET finished_at = now(), applied_steps_count = applied_steps_count + 1 WHERE id = $1',
        [id],
      )
      log(`migrate: applied ${name}`)
    }
  } finally {
    await db.end() // also releases the advisory lock
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('migrate: DATABASE_URL is not set')
    process.exit(1)
  }
  migrate(url, process.argv[2] ?? 'prisma/migrations').catch((e) => {
    console.error(`migrate: ${e.message}`)
    process.exit(1)
  })
}
