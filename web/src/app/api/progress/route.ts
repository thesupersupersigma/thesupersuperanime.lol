import { NextRequest, NextResponse } from "next/server";
import { getSessionId, getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/core";
import { syncToAniList } from "@/lib/anilist-sync";
import { checkAndGrantBadges } from "@/lib/badge-engine";

export async function GET() {
  try {
    const sessionId = await getSessionId();
    const user = await getCurrentUser();

    const history = await db.watchHistory.findMany({
      where: user ? { userId: user.id } : { sessionId },
      orderBy: { updatedAt: "desc" },
      // Fetch enough rows so that after per-anime deduplication we still have
      // plenty of results. The DB already returns them newest-first, so the
      // first occurrence of each animeId is the most-recently-watched episode.
      take: 200,
    });

    // Deduplicate: keep only the latest entry per anime (DB rows are already
    // ordered by updatedAt desc, so the first hit for each animeId wins).
    const seen = new Set<number>();
    const deduped = history.filter((h) => {
      if (seen.has(h.animeId)) return false;
      seen.add(h.animeId);
      return true;
    });

    return NextResponse.json({ history: deduped });
  } catch (error) {
    console.error("Failed to fetch watch history:", error);
    return NextResponse.json({ error: "Failed to fetch watch history" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const sessionId = await getSessionId();
    const user = await getCurrentUser();

    // Rate limit: max 10 progress saves per minute per session
    const rateLimitKey = user ? `progress:user:${user.id}` : `progress:session:${sessionId}`;
    if (!checkRateLimit(rateLimitKey, 10, 60_000)) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }

    const body = await req.json();
    const { animeId, episodeId, progress, duration } = body;

    if (!animeId || !episodeId) {
      return NextResponse.json({ error: "animeId and episodeId are required" }, { status: 400 });
    }

    // --- Anti-cheat: fetch previous progress to validate the delta ---
    // progress is stored in seconds (the player sends Math.floor of currentTime),
    // so the delta is already in seconds — no conversion needed.
    const existing = user
      ? await db.watchHistory.findUnique({
          where: { userId_episodeId: { userId: user.id, episodeId: String(episodeId) } },
          select: { progress: true },
        })
      : await db.watchHistory.findUnique({
          where: { sessionId_episodeId: { sessionId, episodeId: String(episodeId) } },
          select: { progress: true },
        });

    const prevProgress = existing?.progress ?? 0;
    const newProgress = progress ?? 0;
    const deltaSeconds = newProgress - prevProgress;

    // Valid: forward playback between 1 s and 60 s (normal save interval).
    // Skips, scrubs backward, or huge jumps don't count toward watch time.
    const validDelta = deltaSeconds >= 1 && deltaSeconds <= 60;
    let watchedSecondsIncrement = validDelta ? Math.floor(deltaSeconds) : 0;

    // Cap: never let a single episode accumulate more seconds than its duration.
    // This prevents looping an episode to farm watch time.
    if (watchedSecondsIncrement > 0 && duration && duration > 0) {
      const currentWatchedSeconds = existing
        ? await db.watchHistory.findUnique({
            where: user
              ? { userId_episodeId: { userId: user.id, episodeId: String(episodeId) } }
              : { sessionId_episodeId: { sessionId, episodeId: String(episodeId) } },
            select: { watchedSeconds: true },
          }).then(r => r?.watchedSeconds ?? 0)
        : 0;
      const remainingAllowance = Math.max(0, duration - currentWatchedSeconds);
      watchedSecondsIncrement = Math.min(watchedSecondsIncrement, remainingAllowance);
    }

    // If logged in, upsert by userId. Otherwise by sessionId.
    if (user) {
      // A guest record for the same session+episode may exist (watched before logging in).
      // It has userId=null, so the userId_episodeId unique index won't match it, but its
      // sessionId_episodeId index conflicts with the create side of the upsert below.
      // Delete it first so the upsert can proceed without a P2002 error.
      await db.watchHistory.deleteMany({
        where: { sessionId, episodeId: String(episodeId), userId: null },
      });
    }

    const record = user
      ? await db.watchHistory.upsert({
          where: { userId_episodeId: { userId: user.id, episodeId: String(episodeId) } },
          update: {
            progress: newProgress,
            duration: duration ?? 0,
            watchedSeconds: { increment: watchedSecondsIncrement },
          },
          create: {
            userId: user.id,
            sessionId,
            animeId: Number(animeId),
            episodeId: String(episodeId),
            progress: newProgress,
            duration: duration ?? 0,
            watchedSeconds: 0,
          },
        })
      : await db.watchHistory.upsert({
          where: { sessionId_episodeId: { sessionId, episodeId: String(episodeId) } },
          update: {
            progress: newProgress,
            duration: duration ?? 0,
            watchedSeconds: { increment: watchedSecondsIncrement },
          },
          create: {
            sessionId,
            animeId: Number(animeId),
            episodeId: String(episodeId),
            progress: newProgress,
            duration: duration ?? 0,
            watchedSeconds: 0,
          },
        });

    if (user && user.anilistToken && duration && duration > 0 && newProgress >= duration * 0.9) {
      void syncToAniList(user.id, Number(animeId), "Completed");
    }

    // Fire-and-forget: re-evaluate milestone badges off the back of this save.
    // Never block or fail the response on badge errors.
    if (user) {
      void checkAndGrantBadges(user.id).catch(console.error);
    }

    return NextResponse.json({ record });
  } catch (error) {
    console.error("Failed to save progress:", error);
    return NextResponse.json({ error: "Failed to save progress" }, { status: 500 });
  }
}