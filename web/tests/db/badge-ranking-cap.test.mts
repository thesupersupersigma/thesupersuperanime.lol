/**
 * M9 — the leaderboard-badge ranking groupBy was uncapped.
 *
 * It ran a full aggregation + sort over every row in WatchHistory, awaited on
 * the /api/progress response path, which the player hits roughly every 10s of
 * playback per viewer. Capping it at 10 is only safe if it produces the SAME
 * badge outcomes, because `rank` is read exclusively by:
 *
 *     if (rank >= 1 && rank <= 10) toGrant.push("leaderboard-top10");
 *     if (rank >= 1 && rank <= 3)  toGrant.push("leaderboard-top3");
 *     if (rank === 1)              toGrant.push("leaderboard-number1");
 *
 * This runs both queries against the real database, READ-ONLY (no writes, no
 * transaction needed), and asserts every user's badge outcome is identical.
 *
 *   npm run test:db
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "DATABASE_URL not set — run with `npm run test:db`";

let db: PrismaClient;

before(() => {
  if (!DATABASE_URL) return;
  db = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
});

after(async () => {
  await db?.$disconnect();
});

/** Exactly the badge-engine computation: index in the ordering, 0 = unranked. */
function rankOf(ranking: { userId: string | null }[], userId: string): number {
  const i = ranking.findIndex((r) => r.userId === userId);
  return i === -1 ? 0 : i + 1;
}

function badgesFor(rank: number): string[] {
  const out: string[] = [];
  if (rank >= 1 && rank <= 10) out.push("leaderboard-top10");
  if (rank >= 1 && rank <= 3) out.push("leaderboard-top3");
  if (rank === 1) out.push("leaderboard-number1");
  return out;
}

test("take:10 produces identical leaderboard badges for every real user", { skip }, async () => {
  // Written out twice rather than sharing an args object: Prisma's groupBy
  // types require a mutable `by` array, so `as const` on a shared literal
  // doesn't typecheck.
  const uncapped = await db.watchHistory.groupBy({
    by: ["userId"],
    where: { userId: { not: null } },
    _count: { episodeId: true },
    orderBy: { _count: { episodeId: "desc" } },
  });
  const capped = await db.watchHistory.groupBy({
    by: ["userId"],
    where: { userId: { not: null } },
    _count: { episodeId: true },
    orderBy: { _count: { episodeId: "desc" } },
    take: 10,
  });

  assert.ok(uncapped.length > 0, "no watch history to compare against");
  assert.ok(capped.length <= 10);

  const everyUser = uncapped.map((r) => r.userId).filter((id): id is string => id !== null);
  for (const userId of everyUser) {
    assert.deepEqual(
      badgesFor(rankOf(capped, userId)),
      badgesFor(rankOf(uncapped, userId)),
      `badge outcome differs for user ${userId}`,
    );
  }

  // And the cap really is doing something when there are more than 10 users.
  if (uncapped.length > 10) {
    assert.ok(capped.length < uncapped.length, "cap should have trimmed the result set");
  }
});

test("the cap only changes outcomes for ranks the badges don't read", { skip }, async () => {
  // Synthetic, so it holds regardless of how many users the live DB has.
  const ranking = Array.from({ length: 50 }, (_, i) => ({ userId: `u${i + 1}` }));
  const capped = ranking.slice(0, 10);

  for (let i = 0; i < ranking.length; i++) {
    const userId = `u${i + 1}`;
    const full = rankOf(ranking, userId);
    const cut = rankOf(capped, userId);
    assert.deepEqual(badgesFor(cut), badgesFor(full), `rank ${full}`);
    if (full <= 10) assert.equal(cut, full, "top-10 ranks must survive the cap exactly");
    else assert.equal(cut, 0, "beyond the cap reads as unranked, which grants nothing");
  }
});
