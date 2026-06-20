import { db } from "@/lib/db";
import type { WatchParty } from "@prisma/client";

const ROOM_CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const ROOM_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

/** Generate a random 6-char uppercase alphanumeric room code, e.g. "AB12CD". */
export function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

/**
 * Create a new WatchParty room. Generates a unique roomCode and sets
 * expiresAt to 6 hours from now. Retries with a fresh code on the (rare)
 * unique-constraint collision.
 */
export async function createWatchParty(
  animeId: number,
  episodeNum: number,
  hostId?: string,
): Promise<WatchParty> {
  const expiresAt = new Date(Date.now() + ROOM_TTL_MS);

  // Retry a few times in case of a roomCode collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const roomCode = generateRoomCode();
    try {
      return await db.watchParty.create({
        data: { roomCode, animeId, episodeNum, hostId: hostId ?? null, expiresAt },
      });
    } catch (err) {
      // P2002 = unique constraint violation on roomCode — retry with a new code.
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code?: string }).code === "P2002"
      ) {
        console.log(`[watch-party] roomCode collision on attempt ${attempt + 1}, retrying`);
        continue;
      }
      throw err;
    }
  }
  throw new Error("Failed to generate a unique room code after multiple attempts");
}

/**
 * Fetch a WatchParty by roomCode. Returns null if not found or if the room
 * has expired (expiresAt < now).
 */
export async function getWatchParty(roomCode: string): Promise<WatchParty | null> {
  const party = await db.watchParty.findUnique({ where: { roomCode } });
  if (!party) return null;
  if (party.expiresAt < new Date()) return null;
  return party;
}
