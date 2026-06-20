/**
 * Shared chat helpers used by the chat API routes.
 */

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
 * Chat rooms are either the single global room or one per anime
 * ("anime-{animeId}"). Reject anything else so callers can't spray
 * messages into arbitrary room ids.
 */
export function isValidRoomId(roomId: string): boolean {
  return roomId === "global" || /^anime-\d+$/.test(roomId);
}
