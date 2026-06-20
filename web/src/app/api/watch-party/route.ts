import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createWatchParty } from "@/lib/watch-party";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to start a watch party" }, { status: 401 });
  }

  let body: { animeId?: unknown; episodeNum?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const animeId = Number(body.animeId);
  const episodeNum = Number(body.episodeNum);
  if (!Number.isFinite(animeId) || !Number.isFinite(episodeNum)) {
    return NextResponse.json({ error: "animeId and episodeNum are required" }, { status: 400 });
  }

  const party = await createWatchParty(animeId, episodeNum, user.id);
  console.log(`[watch-party] created room ${party.roomCode} by user ${user.id} for ${animeId}/${episodeNum}`);

  return NextResponse.json({
    roomCode: party.roomCode,
    animeId: party.animeId,
    episodeNum: party.episodeNum,
  });
}
