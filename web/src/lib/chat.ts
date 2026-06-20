/**
 * Shared chat helpers used by the chat API routes.
 *
 * Server-only: this imports the Prisma client, so do NOT import it from a
 * client component (the chat client components talk to the API routes instead).
 */
import { db } from "./db";
import type { ChatChannel } from "@prisma/client";

// The user fields the chat UI needs to render an avatar + display name.
// Mirrors the select used for comments.
export const CHAT_USER_SELECT = {
  id: true,
  discordUsername: true,
  discordAvatar: true,
  username: true,
  displayName: true,
  avatarPreset: true,
} as const;

/**
 * Chat rooms are one of:
 *   - "global"          — the legacy single global room
 *   - "anime-{animeId}" — per-anime room (numeric id)
 *   - "channel-{id}"    — a ChatChannel room (cuid-ish id)
 * Reject anything else so callers can't spray messages into arbitrary rooms.
 */
export function isValidRoomId(roomId: string): boolean {
  return (
    roomId === "global" ||
    /^anime-\d+$/.test(roomId) ||
    /^channel-[a-z0-9]+$/i.test(roomId)
  );
}

/**
 * Returns all chat channels ordered by position, seeding three defaults the
 * first time (when no channels exist yet).
 */
export async function ensureDefaultChannels(): Promise<ChatChannel[]> {
  const count = await db.chatChannel.count();
  if (count === 0) {
    await db.chatChannel.createMany({
      data: [
        { name: "general", description: "General chat", position: 0 },
        { name: "anime-discussion", description: "Talk about anime", position: 1 },
        { name: "off-topic", description: "Everything else", position: 2 },
      ],
    });
  }
  return db.chatChannel.findMany({ orderBy: { position: "asc" } });
}
