import { cookies } from "next/headers";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { db } from "./db";
export { getUserAvatar, getUserDisplayName } from "./user-utils";

const AUTH_COOKIE = "site-auth";
const SESSION_COOKIE = "session-id";
const USER_SESSION_COOKIE = "user-session"; // The new cookie for logged-in users

// ==========================================
// 1. SITE-WIDE DMCA LOCK & GUEST SESSIONS
// ==========================================

/**
 * Verify password and set auth cookie
 */
export async function setAuthCookie(password: string): Promise<boolean> {
  if (password !== process.env.SITE_PASSWORD) {
    return false;
  }

  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE, password, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  // Also ensure session cookie exists
  await getSessionId();

  return true;
}

/**
 * Get or create a session ID for per-browser tracking
 */
export async function getSessionId(): Promise<string> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(SESSION_COOKIE);

  if (existing?.value) {
    return existing.value;
  }

  // Generate a random session ID
  const sessionId = generateId();
  cookieStore.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });

  return sessionId;
}

/**
 * Check if the current request is authenticated
 */
export async function verifyAuth(): Promise<boolean> {
  const cookieStore = await cookies();
  const auth = cookieStore.get(AUTH_COOKIE);
  return auth?.value === process.env.SITE_PASSWORD;
}

/**
 * Generate a random ID (cuid-like)
 */
function generateId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  const randomPart2 = Math.random().toString(36).substring(2, 10);
  return `s${timestamp}${randomPart}${randomPart2}`;
}

// ==========================================
// 2. PERSONAL USER ACCOUNTS (NEW)
// ==========================================

/**
 * Secure Password Hashing
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derivedKey}`;
}

/**
 * Verify a login attempt
 */
export function verifyPassword(password: string, hash: string): boolean {
  const [salt, key] = hash.split(":");
  const keyBuffer = Buffer.from(key, "hex");
  const derivedKey = scryptSync(password, salt, 64);
  return timingSafeEqual(keyBuffer, derivedKey);
}

// ==========================================
// 3. DISCORD-BASED ADMIN ALLOWLIST
// ==========================================

/**
 * Build the list of allowed admin Discord IDs from env vars.
 * Pattern: ADMIN_1, ADMIN_2, ADMIN_3, ... (stops at the first missing index).
 */
function getAdminDiscordIds(): string[] {
  const ids: string[] = [];
  let i = 1;
  while (true) {
    const val = process.env[`ADMIN_${i}`];
    if (!val) break;
    ids.push(val.trim());
    i++;
  }
  return ids;
}

/**
 * Returns true if the given Discord ID appears in the ADMIN_n env var allowlist.
 */
export function isAdmin(discordId: string | null | undefined): boolean {
  if (!discordId) return false;
  return getAdminDiscordIds().includes(discordId);
}

/**
 * Returns the currently logged-in user, or null if not authenticated.
 *
 * Use this in API routes that require a user action (comments, votes,
 * watchlist mutations, issue submissions). When it returns null, respond with:
 *   return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
 *
 * This is a semantic alias for getCurrentUser() — same query, different name
 * to make auth-required routes self-documenting.
 */
export async function requireAuth() {
  return getCurrentUser();
}

/**
 * Get the currently logged-in user from the database.
 *
 * Includes `needsEmailVerification: true` when the user signed up with
 * email+password but hasn't verified yet (has a pending token).
 * Users who linked Discord are considered verified for gate purposes.
 * Pre-feature users (emailVerifyToken === null) are grandfathered through.
 */
export async function getCurrentUser() {
  const cookieStore = await cookies();
  const userId = cookieStore.get(USER_SESSION_COOKIE)?.value;
  if (!userId) return null;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      createdAt: true,
      discordId: true,          // needed for the gate check
      discordUsername: true,    // needed for comments/leaderboard later
      discordAvatar: true,      // needed for comments/leaderboard later
      emailVerified: true,      // needed for email verification gate
      emailVerifyToken: true,   // null = old/already-verified user; non-null = pending
      username: true,           // custom username for email-only users
      displayName: true,        // custom display name for email-only users
      avatarPreset: true,       // 1-14 preset avatar for email-only users
      anilistId: true,
      anilistUsername: true,
      anilistToken: true,
      emailNotifStreak: true,
      emailNotifRanked: true,
      emailNotifNewEpisode: true,
      emailNotifCompletion: true,
    },
  });

  if (!user) return null;

  return {
    ...user,
    // Only block users who are actively in the new verification flow.
    // Conditions (all must be true):
    //   1. logged in (guaranteed — we only reach this line if user != null)
    //   2. email not yet verified
    //   3. an actual token string is stored (typeof guards against both null AND
    //      undefined, which rules out pre-feature users who have no token)
    //   4. no Discord linked (Discord-linked users are considered verified)
    needsEmailVerification:
      user.emailVerified === false &&
      typeof user.emailVerifyToken === "string" &&
      user.discordId === null,
  };
}