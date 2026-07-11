import { NextRequest, NextResponse } from "next/server";
import { getWatchParty } from "@/lib/watch-party";
import { getClientIp } from "@/lib/request-ip";

export const dynamic = "force-dynamic";

// ── In-memory rate limiting for room-code lookups ───────────────────────────
// Same pattern as the auth-actions limiter: per-key attempt timestamps, pruned
// on each check. Best-effort (per server instance) — raises the cost of
// brute-forcing room codes without needing to be airtight.
const rateLimitMap = new Map<string, number[]>();

function isRateLimited(key: string, maxAttempts: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (rateLimitMap.get(key) ?? []).filter(ts => now - ts < windowMs);
  if (recent.length >= maxAttempts) {
    rateLimitMap.set(key, recent);
    return true;
  }
  recent.push(now);
  rateLimitMap.set(key, recent);
  return false;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> },
) {
  const ip = getClientIp(req);
  if (isRateLimited(ip, 20, 60 * 1000)) {
    return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }

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
    audioType: party.audioType,
  });
}
