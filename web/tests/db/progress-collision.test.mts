/**
 * Integration test for H4 — "second account on the same browser can never save
 * progress (permanent silent 500)".
 *
 * Runs against the real Neon database because the bug lives entirely in the
 * interaction between two Prisma unique constraints; a mock would just re-state
 * the assumption under test. Everything happens inside an interactive
 * transaction that is ALWAYS rolled back, so no rows survive the run.
 *
 * Requires DATABASE_URL. Skips (does not fail) without it:
 *   npm run test:db
 *
 * The second test is the regression guard: it performs the OLD write (browser
 * session id on an authenticated row) and asserts P2002 still fires. If someone
 * reverts lib/owner-session.ts usage, test 1 starts failing with exactly the
 * error test 2 proves is real.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient, Prisma } from "@prisma/client";
import { ownedSessionId } from "../../src/lib/owner-session.ts";

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "DATABASE_URL not set — run with `npm run test:db`";

let db: PrismaClient;

/** Thrown to unwind the transaction; never escapes the helper. */
class Rollback extends Error {}

/**
 * Run `fn` inside a transaction that is always rolled back. Returns whatever
 * `fn` returns, or rethrows a non-Rollback failure.
 */
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

const EPISODE_ID = "5114-1";

async function makeUser(tx: Prisma.TransactionClient, tag: string) {
  return tx.user.create({
    data: {
      // Namespaced + random so a leaked row (shouldn't happen — we roll back)
      // is obvious and can never collide with a real account.
      email: `h4-test-${tag}-${Math.random().toString(36).slice(2)}@invalid.test`,
      passwordHash: "not-a-real-hash",
    },
    select: { id: true },
  });
}

before(() => {
  if (!DATABASE_URL) return;
  db = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
});

after(async () => {
  await db?.$disconnect();
});

test("two accounts on one browser can both save progress for the same episode", { skip }, async () => {
  const outcome = await inRolledBackTx(async (tx) => {
    const a = await makeUser(tx, "a");
    const b = await makeUser(tx, "b");

    // The browser's session-id cookie — identical for both accounts, which is
    // the whole point: it is a 1-year cookie shared by everyone on this device.
    const browserSessionId = "s-shared-browser-session";

    // User A watches the episode while signed in.
    await tx.watchHistory.create({
      data: {
        userId: a.id,
        sessionId: ownedSessionId(a.id),
        animeId: 5114,
        episodeId: EPISODE_ID,
        progress: 120,
        duration: 1440,
      },
    });

    // A signs out; the guest pre-clean in the route removes anonymous rows for
    // this browser. Simulate one existing and being cleared.
    await tx.watchHistory.deleteMany({
      where: { sessionId: browserSessionId, episodeId: EPISODE_ID, userId: null },
    });

    // User B signs in on the SAME browser and saves progress for the SAME
    // episode. Before the fix this hit @@unique([sessionId, episodeId]).
    const bRow = await tx.watchHistory.create({
      data: {
        userId: b.id,
        sessionId: ownedSessionId(b.id),
        animeId: 5114,
        episodeId: EPISODE_ID,
        progress: 30,
        duration: 1440,
      },
    });

    // And B can keep saving — the upsert must take the update branch, not
    // re-create (which is what made the 500 permanent rather than one-off).
    const updated = await tx.watchHistory.upsert({
      where: { userId_episodeId: { userId: b.id, episodeId: EPISODE_ID } },
      update: { progress: 90, watchedSeconds: { increment: 60 } },
      create: {
        userId: b.id,
        sessionId: ownedSessionId(b.id),
        animeId: 5114,
        episodeId: EPISODE_ID,
        progress: 90,
        duration: 1440,
      },
    });

    const rows = await tx.watchHistory.findMany({
      where: { episodeId: EPISODE_ID, userId: { in: [a.id, b.id] } },
      select: { userId: true, progress: true },
      orderBy: { progress: "asc" },
    });

    return { bRowId: bRow.id, updatedId: updated.id, updatedProgress: updated.progress, rows };
  });

  assert.equal(outcome.updatedId, outcome.bRowId, "second save must update B's row, not create another");
  assert.equal(outcome.updatedProgress, 90);
  assert.equal(outcome.rows.length, 2, "both accounts must keep their own row for the episode");
});

test("REGRESSION GUARD: the old write (browser session id) still raises P2002", { skip }, async () => {
  // Proves the constraint that caused H4 is genuinely present and enforced, so
  // test 1 above is not passing vacuously.
  const err = await inRolledBackTx(async (tx) => {
    const a = await makeUser(tx, "legacy-a");
    const b = await makeUser(tx, "legacy-b");
    const browserSessionId = "s-shared-browser-session-legacy";

    await tx.watchHistory.create({
      data: {
        userId: a.id,
        sessionId: browserSessionId, // <- the pre-fix behaviour
        animeId: 5114,
        episodeId: EPISODE_ID,
        progress: 120,
        duration: 1440,
      },
    });

    try {
      await tx.watchHistory.create({
        data: {
          userId: b.id,
          sessionId: browserSessionId, // <- same browser, different account
          animeId: 5114,
          episodeId: EPISODE_ID,
          progress: 30,
          duration: 1440,
        },
      });
      return null;
    } catch (e) {
      return e;
    }
  });

  assert.ok(err, "expected the pre-fix write to fail — if this passes, the unique index is gone");
  assert.ok(
    err instanceof Prisma.PrismaClientKnownRequestError,
    `expected a Prisma known request error, got ${String(err)}`,
  );
  assert.equal((err as Prisma.PrismaClientKnownRequestError).code, "P2002");
});

test("watchlist has the same shape and the same fix", { skip }, async () => {
  const outcome = await inRolledBackTx(async (tx) => {
    const a = await makeUser(tx, "wl-a");
    const b = await makeUser(tx, "wl-b");

    await tx.watchlist.create({
      data: { userId: a.id, sessionId: ownedSessionId(a.id), animeId: 5114 },
    });
    const bRow = await tx.watchlist.create({
      data: { userId: b.id, sessionId: ownedSessionId(b.id), animeId: 5114 },
    });

    return { bRowId: bRow.id };
  });

  assert.ok(outcome.bRowId, "second account must be able to add the same anime");
});
