import { NextRequest, NextResponse } from "next/server";
import { getSessionId, getCurrentUser, requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { syncToAniList } from "@/lib/anilist-sync";
import { cacheGenresForAnime } from "@/lib/badge-engine";
import { ownedSessionId } from "@/lib/owner-session";

export async function GET() {
  try {
    const sessionId = await getSessionId();
    const user = await getCurrentUser();

    const entries = await db.watchlist.findMany({
      where: user ? { userId: user.id } : { sessionId },
      orderBy: { addedAt: "desc" },
    });

    return NextResponse.json({ entries });
  } catch (error) {
    console.error("Failed to fetch watchlist:", error);
    return NextResponse.json({ error: "Failed to fetch watchlist" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    if (!user) {
      return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
    }

    const { animeId } = await req.json();

    if (!animeId) {
      return NextResponse.json({ error: "animeId is required" }, { status: 400 });
    }

    const entry = await db.watchlist.upsert({
      where: { userId_animeId: { userId: user.id, animeId: Number(animeId) } },
      update: {},
      // Owner-scoped session id, not the browser's: @@unique([sessionId, animeId])
      // would otherwise collide for a second account on the same browser and the
      // create would P2002. See lib/owner-session.ts.
      create: { userId: user.id, sessionId: ownedSessionId(user.id), animeId: Number(animeId) },
    });

    return NextResponse.json({ entry });
  } catch (error) {
    console.error("Failed to add to watchlist:", error);
    return NextResponse.json({ error: "Failed to add to watchlist" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuth();
    if (!user) {
      return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
    }

    const { animeId } = await req.json();

    if (!animeId) {
      return NextResponse.json({ error: "animeId is required" }, { status: 400 });
    }

    await db.watchlist.deleteMany({
      where: { userId: user.id, animeId: Number(animeId) },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to remove from watchlist:", error);
    return NextResponse.json({ error: "Failed to remove from watchlist" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuth();
    if (!user) {
      return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
    }

    const { animeId, status } = await req.json();

    const validStatuses = ["Planning", "Watching", "Completed", "Paused", "Dropped"];
    if (!animeId || !status || !validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid animeId or status" }, { status: 400 });
    }

    const entry = await db.watchlist.updateMany({
      where: { userId: user.id, animeId: Number(animeId) },
      data: { status },
    });

    if (user.anilistToken) {
      void syncToAniList(user.id, Number(animeId), status);
    }

    // Fire-and-forget: cache this anime's genres on completion so the genre
    // badge tally can run without hitting AniList synchronously.
    if (status === "Completed") {
      void cacheGenresForAnime(Number(animeId));
    }

    return NextResponse.json({ success: true, entry });
  } catch (error) {
    console.error("Failed to update watchlist status:", error);
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
  }
}