import { NextRequest, NextResponse } from "next/server";
import { getSessionId, getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

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
    const body = await req.json();
    const { animeId, episodeId, progress, duration } = body;

    if (!animeId || !episodeId) {
      return NextResponse.json({ error: "animeId and episodeId are required" }, { status: 400 });
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
          update: { progress: progress ?? 0, duration: duration ?? 0 },
          create: {
            userId: user.id,
            sessionId,
            animeId: Number(animeId),
            episodeId: String(episodeId),
            progress: progress ?? 0,
            duration: duration ?? 0,
          },
        })
      : await db.watchHistory.upsert({
          where: { sessionId_episodeId: { sessionId, episodeId: String(episodeId) } },
          update: { progress: progress ?? 0, duration: duration ?? 0 },
          create: {
            sessionId,
            animeId: Number(animeId),
            episodeId: String(episodeId),
            progress: progress ?? 0,
            duration: duration ?? 0,
          },
        });

    return NextResponse.json({ record });
  } catch (error) {
    console.error("Failed to save progress:", error);
    return NextResponse.json({ error: "Failed to save progress" }, { status: 500 });
  }
}