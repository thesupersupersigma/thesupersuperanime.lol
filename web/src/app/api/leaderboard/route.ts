import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { LeaderboardEntry } from "@/app/leaderboard/page";

export const dynamic = "force-dynamic";

type Timeframe = "daily" | "weekly" | "monthly" | "alltime";

/**
 * Returns the inclusive lower bound for WatchHistory.updatedAt for the given
 * timeframe, or null for "alltime" (no date filter).
 */
function getStartDate(timeframe: Timeframe): Date | null {
  const now = new Date();
  switch (timeframe) {
    case "daily":
      // Last 24 hours.
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case "weekly": {
      // Monday 00:00 UTC of the current week.
      const daysSinceMonday = (now.getUTCDay() + 6) % 7; // Sun=0 → 6, Mon=1 → 0
      return new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday)
      );
    }
    case "monthly":
      // First day of the current UTC month.
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    case "alltime":
    default:
      return null;
  }
}

export async function GET(req: NextRequest) {
  const param = req.nextUrl.searchParams.get("timeframe");
  const timeframe: Timeframe =
    param === "daily" || param === "weekly" || param === "monthly" || param === "alltime"
      ? param
      : "alltime";

  const startDate = getStartDate(timeframe);

  // Aggregate watch history by user, scoped to the selected timeframe.
  const history = await db.watchHistory.groupBy({
    by: ["userId"],
    where: {
      userId: { not: null },
      ...(startDate ? { updatedAt: { gte: startDate } } : {}),
    },
    _count: { episodeId: true },
    _sum: { watchedSeconds: true },
    orderBy: { _count: { episodeId: "desc" } },
    take: 50,
  });

  // Get completed shows per user
  const completedCounts = await db.watchlist.groupBy({
    by: ["userId"],
    where: { userId: { not: null }, status: "Completed" },
    _count: { animeId: true },
  });

  const completedMap = new Map(
    completedCounts.map(c => [c.userId, c._count.animeId])
  );

  // Fetch user details
  const userIds = history
    .map(h => h.userId)
    .filter(Boolean) as string[];

  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      discordUsername: true,
      discordAvatar: true,
      username: true,
      displayName: true,
      avatarPreset: true,
    },
  });

  const userMap = new Map(users.map(u => [u.id, u]));

  const entries: LeaderboardEntry[] = history
    .filter(h => {
      if (!h.userId || !userMap.has(h.userId!)) return false;
      const u = userMap.get(h.userId!)!;
      return !!(u.username || u.displayName || u.discordUsername);
    })
    .map(h => {
      const user = userMap.get(h.userId!)!;
      return {
        userId: h.userId!,
        discordUsername: user.discordUsername,
        discordAvatar: user.discordAvatar,
        username: user.username,
        displayName: user.displayName,
        avatarPreset: user.avatarPreset,
        episodesWatched: h._count.episodeId,
        showsCompleted: completedMap.get(h.userId!) ?? 0,
        minutesWatched: Math.floor((h._sum.watchedSeconds ?? 0) / 60),
      };
    });

  return NextResponse.json(entries);
}
