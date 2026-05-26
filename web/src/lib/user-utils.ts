/**
 * Pure user-display helpers — no server-only imports so these are safe
 * to import from both Server Components and Client Components.
 */

export interface AvatarUser {
  discordAvatar?: string | null;
  avatarPreset?: number | null;
}

export interface DisplayNameUser {
  discordUsername?: string | null;
  displayName?: string | null;
  username?: string | null;
  email?: string | null;
}

/**
 * Returns the best avatar URL for a user.
 * Priority: Discord CDN avatar → /avatars/PP_N.png preset → /avatars/PP_1.png fallback
 */
export function getUserAvatar(user: AvatarUser): string {
  if (user.discordAvatar) return user.discordAvatar;
  if (user.avatarPreset != null) return `/avatars/PP_${user.avatarPreset}.png`;
  return "/avatars/PP_1.png";
}

/**
 * Returns the best display name for a user.
 * Priority: discordUsername → displayName → username → email-prefix → "Anonymous"
 */
export function getUserDisplayName(user: DisplayNameUser): string {
  if (user.discordUsername) return user.discordUsername;
  if (user.displayName) return user.displayName;
  if (user.username) return user.username;
  if (user.email) return user.email.split("@")[0];
  return "Anonymous";
}
