import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isAdmin } from "@/lib/auth";

/**
 * Badge auto-grant engine.
 *
 * `grantBadge` is the low-level "give this user this badge" primitive. The
 * higher-level `checkAndGrantBadges` recomputes a user's stats and grants every
 * milestone badge they newly qualify for. `grantAdminBadges` handles the
 * env-driven admin/owner badges and is meant to be called on login.
 */

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Grant a badge to a user.
 *
 * Non-stackable badges are granted at most once — if the user already holds it,
 * this is a no-op returning `false`. Stackable badges skip the pre-check and
 * always attempt a fresh create. The unique-constraint catch is the backstop in
 * either case (e.g. two concurrent grants racing).
 *
 * @returns `true` if a new UserBadge row was created, `false` otherwise.
 */
export async function grantBadge(userId: string, slug: string, context?: string): Promise<boolean> {
  const badge = await db.badge.findUnique({
    where: { slug },
    select: { slug: true, stackable: true },
  });
  if (!badge) return false;

  if (!badge.stackable) {
    const existing = await db.userBadge.findFirst({
      where: { userId, badgeSlug: slug, context: context ?? null },
      select: { id: true },
    });
    if (existing) return false;
  }

  try {
    await db.userBadge.create({
      data: { userId, badgeSlug: slug, context: context ?? null },
    });
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) return false;
    throw error;
  }
}

/**
 * Recompute a user's stats and grant every auto badge they now qualify for.
 *
 * Only covers badges derivable from aggregate stats (watch milestones, watch
 * time, completions, community activity, all-time leaderboard placement).
 * Airing/streak/referral/og badges are granted by their own dedicated flows.
 *
 * @returns the slugs of badges that were newly granted by this call.
 */
export async function checkAndGrantBadges(userId: string): Promise<string[]> {
  const [watchAgg, completedCount, commentCount, likeCount, genreVoteCount, user, ranking] =
    await Promise.all([
      db.watchHistory.aggregate({
        where: { userId },
        _count: { episodeId: true },
        _sum: { watchedSeconds: true },
      }),
      db.watchlist.count({ where: { userId, status: "Completed" } }),
      db.comment.count({ where: { userId } }),
      db.commentLike.count({ where: { comment: { userId } } }),
      db.genreVote.count({ where: { userId } }),
      db.user.findUnique({ where: { id: userId }, select: { discordId: true } }),
      // Same aggregation the /api/leaderboard all-time tab uses, without the
      // top-50 cap, so we can locate this user's rank in the full ordering.
      db.watchHistory.groupBy({
        by: ["userId"],
        where: { userId: { not: null } },
        _count: { episodeId: true },
        orderBy: { _count: { episodeId: "desc" } },
      }),
    ]);

  const episodes = watchAgg._count.episodeId;
  const minutes = Math.floor((watchAgg._sum.watchedSeconds ?? 0) / 60);
  const hasDiscord = !!user?.discordId;
  const rankIndex = ranking.findIndex(r => r.userId === userId);
  const rank = rankIndex === -1 ? 0 : rankIndex + 1; // 0 = unranked

  const toGrant: string[] = [];

  // Episodes watched
  if (episodes >= 1) toGrant.push("first-episode");
  if (episodes >= 10) toGrant.push("episodes-10");
  if (episodes >= 50) toGrant.push("episodes-50");
  if (episodes >= 100) toGrant.push("episodes-100");
  if (episodes >= 500) toGrant.push("episodes-500");
  if (episodes >= 1000) toGrant.push("episodes-1000");

  // Watch time (stored in minutes; thresholds are in hours)
  if (minutes >= 10 * 60) toGrant.push("watchtime-10h");
  if (minutes >= 50 * 60) toGrant.push("watchtime-50h");
  if (minutes >= 100 * 60) toGrant.push("watchtime-100h");
  if (minutes >= 500 * 60) toGrant.push("watchtime-500h");

  // Completed anime
  if (completedCount >= 1) toGrant.push("completed-1");
  if (completedCount >= 10) toGrant.push("completed-10");
  if (completedCount >= 50) toGrant.push("completed-50");

  // Comments posted
  if (commentCount >= 1) toGrant.push("first-comment");
  if (commentCount >= 10) toGrant.push("comments-10");
  if (commentCount >= 50) toGrant.push("comments-50");

  // Likes received on own comments
  if (likeCount >= 10) toGrant.push("comment-likes-10");

  // Genre votes
  if (genreVoteCount >= 10) toGrant.push("genre-voter");

  // Discord linked
  if (hasDiscord) toGrant.push("verified");

  // All-time leaderboard placement
  if (rank >= 1 && rank <= 10) toGrant.push("leaderboard-top10");
  if (rank >= 1 && rank <= 3) toGrant.push("leaderboard-top3");
  if (rank === 1) toGrant.push("leaderboard-number1");

  const results = await Promise.all(
    toGrant.map(async slug => ({ slug, granted: await grantBadge(userId, slug) })),
  );
  return results.filter(r => r.granted).map(r => r.slug);
}

/** True if the user's Discord ID matches `OWNER_DISCORD_ID`. */
export function userIsBadgeOwner(user: { discordId: string | null }): boolean {
  const ownerDiscordId = process.env.OWNER_DISCORD_ID;
  return !!ownerDiscordId && user.discordId === ownerDiscordId;
}

/** True if the user's Discord ID appears in the `ADMIN_n` env var allowlist. */
export function userIsBadgeAdmin(user: { discordId: string | null }): boolean {
  return isAdmin(user.discordId);
}

/**
 * Grant the admin/owner badges driven by `ADMIN_n` / `OWNER_DISCORD_ID`.
 * Intended to be called on login so role badges stay in sync. Owner
 * supersedes admin — an owner only gets the "owner" badge, not "admin" too.
 */
export async function grantAdminBadges(userId: string): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, discordId: true, email: true },
  });
  if (!user) return;

  if (userIsBadgeOwner(user)) {
    await grantBadge(userId, "owner");
  } else if (userIsBadgeAdmin(user)) {
    await grantBadge(userId, "admin");
  }
}
