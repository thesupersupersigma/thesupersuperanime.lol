import { NextRequest, NextResponse } from "next/server";
import { getSessionId } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * POST /api/watchlist — Add anime to watchlist
 */
export async function POST(req: NextRequest) {
  try {
    const sessionId = await getSessionId();
    const { animeId } = await req.json();

    if (!animeId) {
      return NextResponse.json(
        { error: "animeId is required" },
        { status: 400 }
      );
    }

    const entry = await db.watchlist.upsert({
      where: {
        sessionId_animeId: {
          sessionId,
          animeId: Number(animeId),
        },
      },
      update: {},
      create: {
        sessionId,
        animeId: Number(animeId),
      },
    });

    return NextResponse.json({ entry });
  } catch (error) {
    console.error("Failed to add to watchlist:", error);
    return NextResponse.json(
      { error: "Failed to add to watchlist" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/watchlist — Remove anime from watchlist
 */
export async function DELETE(req: NextRequest) {
  try {
    const sessionId = await getSessionId();
    const { animeId } = await req.json();

    if (!animeId) {
      return NextResponse.json(
        { error: "animeId is required" },
        { status: 400 }
      );
    }

    await db.watchlist.deleteMany({
      where: {
        sessionId,
        animeId: Number(animeId),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to remove from watchlist:", error);
    return NextResponse.json(
      { error: "Failed to remove from watchlist" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/watchlist — Get watchlist for current session
 */
export async function GET() {
  try {
    const sessionId = await getSessionId();

    const entries = await db.watchlist.findMany({
      where: { sessionId },
      orderBy: { addedAt: "desc" },
    });

    return NextResponse.json({ entries });
  } catch (error) {
    console.error("Failed to fetch watchlist:", error);
    return NextResponse.json(
      { error: "Failed to fetch watchlist" },
      { status: 500 }
    );
  }
}
