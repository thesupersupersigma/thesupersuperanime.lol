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
      take: 50,
    });

    return NextResponse.json({ history });
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