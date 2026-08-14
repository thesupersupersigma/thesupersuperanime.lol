import { NextRequest, NextResponse } from "next/server";
import { getSessionId, getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { syncToAniList } from "@/lib/anilist-sync";
import { checkAndGrantBadges, recordAiringWatch, updateWatchStreak } from "@/lib/badge-engine";
import { ownedSessionId } from "@/lib/owner-session";
import { errorInfo } from "@/lib/log-error";
import { parseProgressInput } from "@/lib/progress-input";

export async function GET(req: NextRequest) {
  try {
    const sessionId = await getSessionId();
    const user = await getCurrentUser();

    // Exact-episode lookup (used by the watch page for resume position).
    // Same response shape as the dedup path — a single-item array — so
    // callers using `.find()` keep working unchanged.
    const episodeId = req.nextUrl.searchParams.get("episodeId");
    if (episodeId) {
      const record = await db.watchHistory.findUnique({
        where: user
          ? { userId_episodeId: { userId: user.id, episodeId } }
          : { sessionId_episodeId: { sessionId, episodeId } },
      });
      return NextResponse.json({ history: record ? [record] : [] });
    }

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
  // Hoisted so the catch can name the row it was writing. Without these the
  // 500 log said nothing about which user/episode failed.
  let userIdForLog: string | null = null;
  let episodeIdForLog: string | null = null;
  let sessionIdForLog: string | null = null;

  try {
    const sessionId = await getSessionId();
    const user = await getCurrentUser();
    sessionIdForLog = sessionId;
    userIdForLog = user?.id ?? null;

    // Rate limit: max 10 progress saves per minute per session
    const rateLimitKey = user ? `progress:user:${user.id}` : `progress:session:${sessionId}`;
    if (!checkRateLimit(rateLimitKey, 10, 60_000)) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }

    const body = await req.json().catch(() => null);

    // episodeId used to be accepted verbatim as an upsert key on a text column
    // with no length cap, so any distinct string minted a leaderboard-counting
    // row. It must now be `<animeId>-<episodeNum>` and agree with animeId.
    const parsed = parseProgressInput(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { animeId, episodeId, progress, duration } = parsed.value;
    episodeIdForLog = episodeId;

    // --- Anti-cheat: fetch previous progress to validate the delta ---
    // progress is stored in seconds (the player sends Math.floor of currentTime),
    // so the delta is already in seconds — no conversion needed.
    const existing = user
      ? await db.watchHistory.findUnique({
          where: { userId_episodeId: { userId: user.id, episodeId } },
          select: { progress: true },
        })
      : await db.watchHistory.findUnique({
          where: { sessionId_episodeId: { sessionId, episodeId } },
          select: { progress: true },
        });

    const prevProgress = existing?.progress ?? 0;
    const newProgress = progress;
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
              ? { userId_episodeId: { userId: user.id, episodeId } }
              : { sessionId_episodeId: { sessionId, episodeId } },
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
        where: { sessionId, episodeId, userId: null },
      });
    }

    const record = user
      ? await db.watchHistory.upsert({
          where: { userId_episodeId: { userId: user.id, episodeId } },
          update: {
            progress: newProgress,
            duration,
            watchedSeconds: { increment: watchedSecondsIncrement },
          },
          create: {
            userId: user.id,
            // Owner-scoped, NOT the browser session id: two accounts sharing one
            // browser would otherwise collide on @@unique([sessionId, episodeId])
            // and the create would P2002 forever. See lib/owner-session.ts.
            sessionId: ownedSessionId(user.id),
            animeId,
            episodeId,
            progress: newProgress,
            duration,
            watchedSeconds: 0,
          },
        })
      : await db.watchHistory.upsert({
          where: { sessionId_episodeId: { sessionId, episodeId } },
          update: {
            progress: newProgress,
            duration,
            watchedSeconds: { increment: watchedSecondsIncrement },
          },
          create: {
            sessionId,
            animeId,
            episodeId,
            progress: newProgress,
            duration,
            watchedSeconds: 0,
          },
        });

    if (user && user.anilistToken && duration && duration > 0 && newProgress >= duration * 0.9) {
      void syncToAniList(user.id, animeId, "Completed");
    }

    // Fire-and-forget: record airing-watch + roll the daily streak before
    // re-evaluating badges. These write the AiringWatch/WatchStreak rows that
    // checkAndGrantBadges reads, and must never block or fail the save.
    if (user) {
      void recordAiringWatch(user.id, animeId);
      void updateWatchStreak(user.id);
    }

    // Re-evaluate milestone badges off the back of this save and surface any
    // newly earned ones so the client can toast them. Badge errors must never
    // fail the progress save, so swallow them to an empty list.
    let newBadges: string[] = [];
    if (user) {
      newBadges = await checkAndGrantBadges(user.id).catch((err) => {
        console.error(err);
        return [];
      });
    }

    return NextResponse.json({ record, newBadges });
  } catch (error) {
    // Include the Prisma error code: a P2002 here is a unique-constraint
    // collision that will repeat on every retry (see lib/owner-session.ts), and
    // it must never be indistinguishable from a transient network blip.
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code)
        : undefined;
    console.error("[api/progress] upsert failed", {
      userId: userIdForLog,
      episodeId: episodeIdForLog,
      sessionId: sessionIdForLog,
      code,
      ...errorInfo(error),
    });
    return NextResponse.json({ error: "Failed to save progress" }, { status: 500 });
  }
}