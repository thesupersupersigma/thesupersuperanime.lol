import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAnimeById, getDisplayTitle, type AnilistMedia } from "@/lib/anilist";
import {
  sendStreakAtRiskEmail,
  sendLeaderboardPassedEmail,
  sendNewEpisodeEmail,
  sendCompletionNudgeEmail,
} from "@/lib/resend";
import { sendNewEpisodeChannelPost } from "@/lib/discord";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/streak-emails — sends Duolingo-style nudge emails.
 *
 * Auth: Authorization: Bearer <CRON_SECRET> (checked in-route, same secret
 * proxy.ts already requires for every /api/cron/* route).
 *
 * Runs four independent nudge passes: streak-at-risk, leaderboard rank drop,
 * new episode dropped, and near-completion. Each email send is fire-and-forget
 * so one failure can't abort the rest of the batch.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Shared AniList cache so steps C and D never fetch the same anime twice.
  const animeCache = new Map<number, AnilistMedia | null>();
  async function getCachedAnime(animeId: number): Promise<AnilistMedia | null> {
    if (!animeCache.has(animeId)) {
      animeCache.set(animeId, await getAnimeById(animeId));
    }
    return animeCache.get(animeId) ?? null;
  }

  // ── A) Streak at risk ──────────────────────────────────────────────────
  let streakEmails = 0;
  {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    const candidateStreaks = await db.watchStreak.findMany({
      where: { currentStreak: { gte: 2 } },
    });
    const dueStreaks = candidateStreaks.filter(
      (s) => s.lastWatchDate && s.lastWatchDate.toISOString().split("T")[0] === yesterdayStr
    );

    const streakUsers = await db.user.findMany({
      where: {
        id: { in: dueStreaks.map((s) => s.userId) },
        emailVerified: true,
        emailNotifStreak: true,
      },
      select: { id: true, email: true },
    });
    const streakByUserId = new Map(dueStreaks.map((s) => [s.userId, s.currentStreak]));

    for (const u of streakUsers) {
      const streakDays = streakByUserId.get(u.id);
      if (!streakDays) continue;
      streakEmails++;
      void sendStreakAtRiskEmail(u.email, streakDays).catch((err) =>
        console.error("[cron/streak-emails] streak email failed:", err)
      );
    }
    console.log(`[cron/streak-emails] streak-at-risk: ${streakEmails} emails`);
  }

  // ── B) Leaderboard rank change ─────────────────────────────────────────
  let rankEmails = 0;
  {
    const history = await db.watchHistory.groupBy({
      by: ["userId"],
      where: { userId: { not: null } },
      _count: { episodeId: true },
      orderBy: { _count: { episodeId: "desc" } },
    });

    const rankings = history
      .filter((h) => h.userId)
      .map((h, idx) => ({ userId: h.userId as string, rank: idx + 1 }));

    const rankUsers = await db.user.findMany({
      where: { id: { in: rankings.map((r) => r.userId) } },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        emailNotifRanked: true,
        lastKnownLeaderboardRank: true,
        username: true,
        displayName: true,
        discordUsername: true,
      },
    });
    const rankUserMap = new Map(rankUsers.map((u) => [u.id, u]));

    for (const { userId, rank: newRank } of rankings) {
      const u = rankUserMap.get(userId);
      if (!u) continue;
      const oldRank = u.lastKnownLeaderboardRank;
      if (oldRank != null && newRank > oldRank && u.emailVerified && u.emailNotifRanked) {
        const passer = rankings[oldRank - 1];
        const passerUser = passer ? rankUserMap.get(passer.userId) : null;
        const passerName =
          passerUser?.displayName ?? passerUser?.username ?? passerUser?.discordUsername ?? "Someone";
        rankEmails++;
        void sendLeaderboardPassedEmail(u.email, passerName, newRank).catch((err) =>
          console.error("[cron/streak-emails] rank email failed:", err)
        );
      }
    }

    await Promise.all(
      rankings.map(({ userId, rank }) =>
        db.user.update({ where: { id: userId }, data: { lastKnownLeaderboardRank: rank } })
      )
    );
    console.log(`[cron/streak-emails] leaderboard-passed: ${rankEmails} emails`);
  }

  // ── C) New episode dropped ─────────────────────────────────────────────
  let newEpEmails = 0;
  {
    const watchingEntries = await db.watchlist.findMany({
      where: { status: "Watching", userId: { not: null } },
    });

    const uniqueAnimeIds = [...new Set(watchingEntries.map((w) => w.animeId))];
    await Promise.all(uniqueAnimeIds.map((id) => getCachedAnime(id)));

    const watchingUserIds = [...new Set(watchingEntries.map((w) => w.userId).filter(Boolean))] as string[];
    const watchingUsers = await db.user.findMany({
      where: { id: { in: watchingUserIds } },
      select: { id: true, email: true, emailVerified: true, emailNotifNewEpisode: true },
    });
    const watchingUserMap = new Map(watchingUsers.map((u) => [u.id, u]));
    const updatedAnimeIds = new Set<number>();

    for (const entry of watchingEntries) {
      const userId = entry.userId;
      if (!userId) continue;

      const anime = animeCache.get(entry.animeId);
      if (!anime?.nextAiringEpisode) continue;

      const latestAired = anime.nextAiringEpisode.episode - 1;
      if (latestAired <= 0) continue;
      if (entry.lastNotifiedEpisode != null && latestAired <= entry.lastNotifiedEpisode) continue;

      // NULL means "we have never notified this row", NOT "this user has seen
      // nothing". Nothing else in the codebase ever writes lastNotifiedEpisode
      // (grep: this file is the only reader and the only writer) and the column
      // has no default, so EVERY freshly-added Watching entry arrived here as
      // NULL and fell straight through — the user got a "New Episode!" email
      // for an episode that may have aired weeks before they added the show,
      // and that first-time bump also re-added the anime to updatedAnimeIds,
      // duplicating the PUBLIC #new-episodes post for an episode already
      // announced. It repeated for every user who newly started the show.
      //
      // Treat the first sighting as a baseline: record where they are and send
      // nothing. Genuine new episodes notify normally from the next run on.
      const isBaseline = entry.lastNotifiedEpisode == null;

      await db.watchlist.update({
        where: { id: entry.id },
        data: { lastNotifiedEpisode: latestAired },
      });

      if (isBaseline) {
        console.log("[cron/streak-emails] baselined new watching entry", {
          userId, animeId: entry.animeId, lastNotifiedEpisode: latestAired,
        });
        continue;
      }

      updatedAnimeIds.add(entry.animeId);

      const user = watchingUserMap.get(userId);
      if (!user || !user.emailVerified || !user.emailNotifNewEpisode) continue;

      newEpEmails++;
      void sendNewEpisodeEmail(user.email, getDisplayTitle(anime.title), latestAired, entry.animeId).catch(
        (err) => console.error("[cron/streak-emails] new episode email failed:", err)
      );
    }

    for (const animeId of updatedAnimeIds) {
      const anime = animeCache.get(animeId);
      if (!anime?.nextAiringEpisode) continue;
      const latestAired = anime.nextAiringEpisode.episode - 1;
      void sendNewEpisodeChannelPost(
        getDisplayTitle(anime.title),
        latestAired,
        animeId,
        anime.coverImage.large
      ).catch((err) => console.error("[cron/streak-emails] new episode Discord post failed:", err));
    }
    console.log(`[cron/streak-emails] new-episode: ${newEpEmails} emails`);
  }

  // ── D) Completion nudge ────────────────────────────────────────────────
  let completionEmails = 0;
  {
    const watchHistoryGroups = await db.watchHistory.groupBy({
      by: ["userId", "animeId"],
      where: { userId: { not: null } },
      _count: { episodeId: true },
    });

    const completionAnimeIds = [...new Set(watchHistoryGroups.map((g) => g.animeId))];
    await Promise.all(completionAnimeIds.map((id) => getCachedAnime(id)));

    const completionUserIds = [
      ...new Set(watchHistoryGroups.map((g) => g.userId).filter(Boolean)),
    ] as string[];
    const completionUsers = await db.user.findMany({
      where: { id: { in: completionUserIds } },
      select: { id: true, email: true, emailVerified: true, emailNotifCompletion: true },
    });
    const completionUserMap = new Map(completionUsers.map((u) => [u.id, u]));

    const completionWatchlist = await db.watchlist.findMany({
      where: {
        userId: { in: completionUserIds },
        animeId: { in: completionAnimeIds },
        status: "Watching",
        completionNudgeSent: false,
      },
    });
    const completionWatchlistMap = new Map(
      completionWatchlist.map((w) => [`${w.userId}:${w.animeId}`, w])
    );

    for (const group of watchHistoryGroups) {
      const userId = group.userId;
      if (!userId) continue;

      const watchlistEntry = completionWatchlistMap.get(`${userId}:${group.animeId}`);
      if (!watchlistEntry) continue;

      const anime = animeCache.get(group.animeId);
      if (!anime?.episodes || anime.episodes <= 0) continue;

      const episodesWatched = group._count.episodeId;
      const episodesLeft = anime.episodes - episodesWatched;
      if (episodesLeft < 1 || episodesLeft > 3) continue;

      const user = completionUserMap.get(userId);
      if (!user || !user.emailVerified || !user.emailNotifCompletion) continue;

      await db.watchlist.update({
        where: { id: watchlistEntry.id },
        data: { completionNudgeSent: true },
      });

      completionEmails++;
      void sendCompletionNudgeEmail(user.email, getDisplayTitle(anime.title), episodesLeft, group.animeId).catch(
        (err) => console.error("[cron/streak-emails] completion email failed:", err)
      );
    }
    console.log(`[cron/streak-emails] completion-nudge: ${completionEmails} emails`);
  }

  return NextResponse.json({
    streakEmails,
    rankEmails,
    newEpEmails,
    completionEmails,
  });
}
