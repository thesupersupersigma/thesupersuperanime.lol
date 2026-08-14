/**
 * M21 — WatchStreak and AiringWatch declared no User relation, so Postgres had
 * no foreign key and Prisma emitted no onDelete. `db.user.delete()` in
 * deleteAccountAction is preceded by the comment "Cascade deletes handle
 * related records via Prisma schema onDelete: Cascade" — which was simply not
 * true for these two. badge-engine upserts both on every watch event, so any
 * active user had them, and they survived account deletion pointing at a
 * userId that no longer existed. A "delete my data" gap as much as a
 * correctness one.
 *
 * Runs inside an always-rolled-back transaction against the real database, so
 * it exercises the real FK rather than Prisma's model of it.
 *
 *   npm run test:db
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient, Prisma } from "@prisma/client";

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "DATABASE_URL not set — run with `npm run test:db`";

let db: PrismaClient;

class Rollback extends Error {}

async function inRolledBackTx<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  let result!: T;
  try {
    await db.$transaction(
      async (tx) => {
        result = await fn(tx);
        throw new Rollback();
      },
      { timeout: 30_000, maxWait: 15_000 },
    );
  } catch (err) {
    if (!(err instanceof Rollback)) throw err;
  }
  return result;
}

before(() => {
  if (!DATABASE_URL) return;
  db = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
});

after(async () => {
  await db?.$disconnect();
});

test("deleting an account removes its WatchStreak and AiringWatch rows", { skip }, async () => {
  const outcome = await inRolledBackTx(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: `m21-test-${Math.random().toString(36).slice(2)}@invalid.test`,
        passwordHash: "not-a-real-hash",
      },
      select: { id: true },
    });

    await tx.watchStreak.create({
      data: { userId: user.id, currentStreak: 3, longestStreak: 7, lastWatchDate: new Date() },
    });
    await tx.airingWatch.createMany({
      data: [
        { userId: user.id, animeId: 5114 },
        { userId: user.id, animeId: 21 },
      ],
    });

    const before = {
      streak: await tx.watchStreak.count({ where: { userId: user.id } }),
      airing: await tx.airingWatch.count({ where: { userId: user.id } }),
    };

    // Exactly what deleteAccountAction does.
    await tx.user.delete({ where: { id: user.id } });

    const after = {
      streak: await tx.watchStreak.count({ where: { userId: user.id } }),
      airing: await tx.airingWatch.count({ where: { userId: user.id } }),
    };

    return { before, after };
  });

  assert.deepEqual(outcome.before, { streak: 1, airing: 2 }, "fixture should have been created");
  assert.deepEqual(
    outcome.after,
    { streak: 0, airing: 0 },
    "both must cascade — before the FK existed these rows survived as orphans",
  );
});

test("REGRESSION GUARD: the FK exists with ON DELETE CASCADE", { skip }, async () => {
  // If someone regenerates the schema without the relation, db push silently
  // drops the constraint and the test above starts passing only by accident of
  // Prisma-side behaviour. Assert the constraint itself.
  const rows = await db.$queryRaw<{ table_name: string; delete_rule: string }[]>`
    SELECT tc.table_name, rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name IN ('WatchStreak', 'AiringWatch')
  `;

  const byTable = new Map(rows.map((r) => [r.table_name, r.delete_rule]));
  assert.equal(byTable.get("WatchStreak"), "CASCADE", "WatchStreak needs an ON DELETE CASCADE FK");
  assert.equal(byTable.get("AiringWatch"), "CASCADE", "AiringWatch needs an ON DELETE CASCADE FK");
});

test("no orphans are present", { skip }, async () => {
  // Both would have been impossible to create once the FK exists; this catches
  // pre-existing rows if the constraint is ever dropped and re-added.
  const orphanStreaks = await db.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM "WatchStreak" ws
    LEFT JOIN "User" u ON u.id = ws."userId" WHERE u.id IS NULL`;
  const orphanAiring = await db.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM "AiringWatch" aw
    LEFT JOIN "User" u ON u.id = aw."userId" WHERE u.id IS NULL`;

  assert.equal(orphanStreaks[0].n, 0);
  assert.equal(orphanAiring[0].n, 0);
});
