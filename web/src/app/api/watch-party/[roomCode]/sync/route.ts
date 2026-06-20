import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getWatchParty } from "@/lib/watch-party";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }

  const { roomCode } = await params;
  const party = await getWatchParty(roomCode.toUpperCase());
  if (!party) {
    return NextResponse.json({ error: "Room not found or expired" }, { status: 404 });
  }

  if (party.hostId !== user.id) {
    return NextResponse.json({ error: "Only the host can sync" }, { status: 403 });
  }

  let body: { timestamp?: unknown; isPlaying?: unknown; audioType?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const timestamp = Number(body.timestamp);
  const isPlaying = Boolean(body.isPlaying);
  if (!Number.isFinite(timestamp)) {
    return NextResponse.json({ error: "timestamp is required" }, { status: 400 });
  }

  const data: { hostTimestamp: number; isPlaying: boolean; audioType?: string } = {
    hostTimestamp: timestamp,
    isPlaying,
  };
  if (typeof body.audioType === "string") {
    data.audioType = body.audioType;
  }

  await db.watchParty.update({
    where: { id: party.id },
    data,
  });

  return NextResponse.json({ ok: true });
}
