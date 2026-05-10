import { NextRequest, NextResponse } from "next/server";
import { getSessionId } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/progress — Get watch history for current session
 */
export async function GET() {
  try {
    const sessionId = await getSessionId();

    const history = await db.watchHistory.findMany({
      where: { sessionId },
      orderBy: { updatedAt: "desc" },
      take: 20,
    });

    return NextResponse.json({ history });
  } catch (error) {
    console.error("Failed to fetch watch history:", error);
    return NextResponse.json(
      { error: "Failed to fetch watch history" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/progress — Upsert watch progress
 */
export async function POST(req: NextRequest) {
  try {
    const sessionId = await getSessionId();
    const body = await req.json();

    const { animeId, episodeId, progress, duration } = body;

    if (!animeId || !episodeId) {
      return NextResponse.json(
        { error: "animeId and episodeId are required" },
        { status: 400 }
      );
    }

    const record = await db.watchHistory.upsert({
      where: {
        sessionId_episodeId: {
          sessionId,
          episodeId: String(episodeId),
        },
      },
      update: {
        progress: progress ?? 0,
        duration: duration ?? 0,
      },
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
    return NextResponse.json(
      { error: "Failed to save progress" },
      { status: 500 }
    );
  }
}
