import { NextRequest, NextResponse } from "next/server";
import { getWatchParty } from "@/lib/watch-party";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> },
) {
  const { roomCode } = await params;
  const party = await getWatchParty(roomCode.toUpperCase());
  if (!party) {
    return NextResponse.json({ error: "Room not found or expired" }, { status: 404 });
  }

  return NextResponse.json({
    roomCode: party.roomCode,
    animeId: party.animeId,
    episodeNum: party.episodeNum,
    hostId: party.hostId,
    hostTimestamp: party.hostTimestamp,
    isPlaying: party.isPlaying,
  });
}
