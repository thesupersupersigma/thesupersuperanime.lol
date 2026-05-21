import { NextRequest, NextResponse } from "next/server";
import { getSessionId, getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

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
    const sessionId = await getSessionId();
    const user = await getCurrentUser();
    const { animeId } = await req.json();

    if (!animeId) {
      return NextResponse.json({ error: "animeId is required" }, { status: 400 });
    }

    const entry = user
      ? await db.watchlist.upsert({
          where: { userId_animeId: { userId: user.id, animeId: Number(animeId) } },
          update: {},
          create: { userId: user.id, sessionId, animeId: Number(animeId) },
        })
      : await db.watchlist.upsert({
          where: { sessionId_animeId: { sessionId, animeId: Number(animeId) } },
          update: {},
          create: { sessionId, animeId: Number(animeId) },
        });

    return NextResponse.json({ entry });
  } catch (error) {
    console.error("Failed to add to watchlist:", error);
    return NextResponse.json({ error: "Failed to add to watchlist" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const sessionId = await getSessionId();
    const user = await getCurrentUser();
    const { animeId } = await req.json();

    if (!animeId) {
      return NextResponse.json({ error: "animeId is required" }, { status: 400 });
    }

    await db.watchlist.deleteMany({
      where: user
        ? { userId: user.id, animeId: Number(animeId) }
        : { sessionId, animeId: Number(animeId) },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to remove from watchlist:", error);
    return NextResponse.json({ error: "Failed to remove from watchlist" }, { status: 500 });
  }
}