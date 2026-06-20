import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isAdmin } from "@/lib/auth";
import { getAnimeById } from "@/lib/anilist";
import { sendBadgeAnnouncementPost } from "@/lib/discord";

/**
 * Badge slugs notable enough to announce in the public #badges Discord channel.
 */
const NOTABLE_BADGE_SLUGS = new Set([
  "episodes-100", "episodes-500", "episodes-1000",
  "watchtime-100h", "watchtime-500h",
  "completed-10", "completed-50",
  "leaderboard-top10", "leaderboard-top3", "leaderboard-number1",
  "streak-30", "streak-100",
  "airing-10", "airing-25",
  "weekly-champion", "season-champion",
]);

/**
 * Badge auto-grant engine.
 *
 * `grantBadge` is the low-level "give this user this badge" primitive. The
 * higher-level `checkAndGrantBadges` recomputes a user's stats and grants every
 * milestone badge they newly qualify for. `grantAdminBadges` handles the
 * env-driven admin/owner badges and is meant to be called on login.
 */

/**
 * Anyone whose account was created before this date qualifies for the "og-member"
 * badge — the early-adopter window.
 */
const OG_CUTOFF_DATE = new Date("2026-07-01T00:00:00Z");

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Best-effort Discord DM when a user earns a badge. Never throws and never
 * blocks the grant — fire-and-forget. No-ops unless `DISCORD_BOT_TOKEN` is set
 * and the user has a linked Discord account.
 */
async function sendBadgeDM(
  userId: string,
  badge: { name: string; description: string; icon: string },
): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return;

  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { discordId: true, username: true, discordUsername: true },
    });
    if (!user?.discordId) return;

    // Open (or reuse) a DM channel with the recipient.
    const dmRes = await fetch("https://discord.com/api/v10/users/@me/channels", {
      method: "POST",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ recipient_id: user.discordId }),
    });
    if (!dmRes.ok) return;

    const channel = await dmRes.json();
    const channelId = channel?.id;
    if (!channelId) return;

    const profileName = user.username ?? user.discordUsername;
    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `🏅 You earned a new badge on thesupersuperanime.lol!\n\n**${badge.icon} ${badge.name}**\n${badge.description}\n\nhttps://www.thesupersuperanime.lol/user/${profileName}`,
      }),
    });
  } catch {
    // Swallow everything — a DM failure must never affect the grant.
  }
}

/**
 * Best-effort Discord channel post for notable badge grants. Never throws and
 * never blocks the grant — fire-and-forget. No-ops if the badge isn't notable
 * or the user has no username/discordUsername to build a profile link from.
 */
async function sendBadgeAnnouncement(
  userId: string,
  badge: { slug: string; name: string; description: string; icon: string },
): Promise<void> {
  if (!NOTABLE_BADGE_SLUGS.has(badge.slug)) return;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { discordId: true, username: true, displayName: true, discordUsername: true },
  });
  if (!user) return;

  const profileName = user.username ?? user.discordUsername;
  if (!profileName) return;

  const displayName = user.displayName ?? user.username ?? user.discordUsername ?? "Someone";
  const profileUrl = `https://www.thesupersuperanime.lol/user/${profileName}`;

  await sendBadgeAnnouncementPost(displayName, badge.name, badge.icon, badge.description, profileUrl);
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
    select: { slug: true, stackable: true, name: true, description: true, icon: true },
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
    // Fire-and-forget Discord DM + channel announcement — never blocks or fails the grant.
    void sendBadgeDM(userId, badge).catch(() => {});
    void sendBadgeAnnouncement(userId, badge).catch(() => {});
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) return false;
    throw error;
  }
}

/**
 * Recompute a user's stats and grant every auto badge they now qualify for.
 *
 * Covers badges derivable from stored stats: watch milestones, watch time,
 * completions, community activity, all-time leaderboard placement, OG status,
 * airing-watcher counts (from AiringWatch), streaks (from WatchStreak), and
 * genre completion (from GenreCache). The AiringWatch/WatchStreak/GenreCache
 * rows themselves are populated by their own write paths (progress/watchlist
 * routes); referral badges are granted by their own dedicated flow.
 *
 * @returns the slugs of badges that were newly granted by this call.
 */
export async function checkAndGrantBadges(userId: string): Promise<string[]> {
  const [
    watchAgg,
    completedCount,
    commentCount,
    likeCount,
    genreVoteCount,
    user,
    ranking,
    airingWatchCount,
    streak,
    completedAnime,
  ] = await Promise.all([
    db.watchHistory.aggregate({
      where: { userId },
      _count: { episodeId: true },
      _sum: { watchedSeconds: true },
    }),
    db.watchlist.count({ where: { userId, status: "Completed" } }),
    db.comment.count({ where: { userId } }),
    db.commentLike.count({ where: { comment: { userId } } }),
    db.genreVote.count({ where: { userId } }),
    db.user.findUnique({ where: { id: userId }, select: { discordId: true, createdAt: true } }),
    // Same aggregation the /api/leaderboard all-time tab uses, without the
    // top-50 cap, so we can locate this user's rank in the full ordering.
    db.watchHistory.groupBy({
      by: ["userId"],
      where: { userId: { not: null } },
      _count: { episodeId: true },
      orderBy: { _count: { episodeId: "desc" } },
    }),
    db.airingWatch.count({ where: { userId } }),
    db.watchStreak.findUnique({ where: { userId } }),
    db.watchlist.findMany({ where: { userId, status: "Completed" }, select: { animeId: true } }),
  ]);

  const episodes = watchAgg._count.episodeId;
  const minutes = Math.floor((watchAgg._sum.watchedSeconds ?? 0) / 60);
  const hasDiscord = !!user?.discordId;
  const rankIndex = ranking.findIndex(r => r.userId === userId);
  const rank = rankIndex === -1 ? 0 : rankIndex + 1; // 0 = unranked
  const longestStreak = streak?.longestStreak ?? 0;

  const toGrant: string[] = [];

  // Episodes watched
  if (episodes >= 1) toGrant.push("first-episode");
  if (episodes >= 10) toGrant.push("episodes-10");
  if (episodes >= 50) toGrant.push("episodes-50");
  if (episodes >= 100) toGrant.push("episodes-100");
  if (episodes >= 500) toGrant.push("episodes-500");
  if (episodes >= 1000) toGrant.push("episodes-1000");

  // Watch time (stored in minutes; thresholds are in hours)
  if (minutes >= 1 * 60) toGrant.push("watchtime-1h");
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

  // OG member — account created before the early-adopter cutoff
  if (user?.createdAt && user.createdAt < OG_CUTOFF_DATE) toGrant.push("og-member");

  // All-time leaderboard placement
  if (rank >= 1 && rank <= 10) toGrant.push("leaderboard-top10");
  if (rank >= 1 && rank <= 3) toGrant.push("leaderboard-top3");
  if (rank === 1) toGrant.push("leaderboard-number1");

  // Airing watcher — watched anime while they were still releasing
  if (airingWatchCount >= 1) toGrant.push("airing-1");
  if (airingWatchCount >= 5) toGrant.push("airing-5");
  if (airingWatchCount >= 10) toGrant.push("airing-10");
  if (airingWatchCount >= 25) toGrant.push("airing-25");

  // Daily watch streaks (longest ever reached)
  if (longestStreak >= 7) toGrant.push("streak-7");
  if (longestStreak >= 30) toGrant.push("streak-30");
  if (longestStreak >= 100) toGrant.push("streak-100");

  const results = await Promise.all(
    toGrant.map(async slug => ({ slug, granted: await grantBadge(userId, slug) })),
  );

  // Genre badges — completing 10+ anime of a genre. These aren't pre-seeded
  // (too many possible genres), so the Badge row is upserted on the fly before
  // granting.
  const genreGranted = await grantGenreBadges(userId, completedAnime.map(c => c.animeId));

  return [...results.filter(r => r.granted).map(r => r.slug), ...genreGranted];
}

/**
 * Tally completed-anime genres from the GenreCache and grant a `genre-{slug}`
 * badge for every genre the user has completed 10 or more of. The Badge row is
 * created on demand since the genre set is open-ended.
 *
 * @returns the genre badge slugs newly granted by this call.
 */
async function grantGenreBadges(userId: string, completedAnimeIds: number[]): Promise<string[]> {
  if (completedAnimeIds.length === 0) return [];

  const caches = await db.genreCache.findMany({
    where: { animeId: { in: completedAnimeIds } },
    select: { genres: true },
  });

  const counts = new Map<string, number>();
  for (const cache of caches) {
    for (const genre of cache.genres) {
      counts.set(genre, (counts.get(genre) ?? 0) + 1);
    }
  }

  const granted: string[] = [];
  for (const [genre, count] of counts) {
    if (count < 10) continue;
    const genreSlug = `genre-${genre.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
    await db.badge.upsert({
      where: { slug: genreSlug },
      create: {
        slug: genreSlug,
        name: `${genre} Fan`,
        description: `Completed 10+ ${genre} anime`,
        icon: "🎭",
        rarity: "rare",
        rarityOrder: 1,
        grantedBy: "auto",
        stackable: false,
      },
      update: {},
    });
    if (await grantBadge(userId, genreSlug)) granted.push(genreSlug);
  }

  return granted;
}

/**
 * Record that a user watched an anime while it was still airing, feeding the
 * airing-watcher badges. No-ops unless AniList reports the anime as RELEASING.
 * Best-effort — never throws.
 */
export async function recordAiringWatch(userId: string, animeId: number): Promise<void> {
  try {
    const anime = await getAnimeById(animeId);
    if (anime?.status !== "RELEASING") return;
    await db.airingWatch.upsert({
      where: { userId_animeId: { userId, animeId } },
      create: { userId, animeId },
      update: {},
    });
  } catch (error) {
    console.error("recordAiringWatch failed:", error);
  }
}

/**
 * Roll the user's daily watch streak forward for "today" (UTC). Idempotent
 * within a calendar day. Consecutive days increment the streak; a gap resets it
 * to 1. `longestStreak` only ever grows. Best-effort — never throws.
 */
export async function updateWatchStreak(userId: string): Promise<void> {
  try {
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const existing = await db.watchStreak.findUnique({ where: { userId } });
    const lastDate = existing?.lastWatchDate
      ? existing.lastWatchDate.toISOString().split("T")[0]
      : null;

    // Already counted a watch today — nothing to do.
    if (lastDate === today) return;

    const currentStreak = lastDate === yesterday ? (existing?.currentStreak ?? 0) + 1 : 1;
    const longestStreak = Math.max(existing?.longestStreak ?? 0, currentStreak);

    await db.watchStreak.upsert({
      where: { userId },
      create: { userId, currentStreak, longestStreak, lastWatchDate: now },
      update: { currentStreak, longestStreak, lastWatchDate: now },
    });
  } catch (error) {
    console.error("updateWatchStreak failed:", error);
  }
}

/**
 * Cache an anime's AniList genres once a user completes it, so genre badge
 * tallies don't have to hit AniList synchronously. No-ops if already cached.
 * Best-effort — never throws.
 */
export async function cacheGenresForAnime(animeId: number): Promise<void> {
  try {
    const existing = await db.genreCache.findUnique({
      where: { animeId },
      select: { animeId: true },
    });
    if (existing) return;

    const anime = await getAnimeById(animeId);
    if (!anime?.genres?.length) return;

    await db.genreCache.upsert({
      where: { animeId },
      create: { animeId, genres: anime.genres },
      update: { genres: anime.genres },
    });
  } catch (error) {
    console.error("cacheGenresForAnime failed:", error);
  }
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
