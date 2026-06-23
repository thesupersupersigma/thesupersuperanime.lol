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
 * Returns the currently logged-in user only if their profile is complete,
 * otherwise null.
 *
 * Use this in API routes/actions that should be blocked until a user has a
 * public identity (chat, comments). A profile is "complete" when the user has
 * EITHER a linked Discord (discordId) OR a custom username set. When it returns
 * null, distinguish the two cases at the call site:
 *   - getCurrentUser() === null  → not logged in → respond 401
 *   - logged in but incomplete    → respond 403 ("finish setting up profile")
 */
export async function requireCompleteProfile() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!user.discordId && !user.username) return null;
  return user;
}

/**
 * Returns the currently logged-in user only if their account is verified,
 * otherwise null.
 *
 * Use this in API routes/actions that should be blocked until a user has
 * proven ownership of an identity (chat, comments, social writes). An account
 * is "verified" when the user has EITHER a linked Discord (discordId) OR a
 * verified email (emailVerified). When it returns null, distinguish the two
 * cases at the call site:
 *   - getCurrentUser() === null  → not logged in → respond 401
 *   - logged in but unverified    → respond 403 ("verify email or link Discord")
 */
export async function requireVerified() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.discordId === null && user.emailVerified !== true) return null;
  return user;
}

// Session cookie lifetime — 30 days, matching the original user-session cookie.
const USER_SESSION_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * Create a new server-side session for the given user and set the
 * USER_SESSION_COOKIE to the opaque session token (NOT the user id).
 *
 * The cookie keeps the exact same options used everywhere else for
 * "user-session" so nothing downstream (proxy presence check, etc.) changes.
 */
export async function createUserSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + USER_SESSION_MAX_AGE * 1000);
  await db.session.create({ data: { token, userId, expiresAt } });

  const cookieStore = await cookies();
  cookieStore.set(USER_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: USER_SESSION_MAX_AGE,
  });

  return token;
}

/**
 * Destroy the current session: delete the Session row for the cookie's token
 * (if any) and clear the USER_SESSION_COOKIE.
 */
export async function destroyUserSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(USER_SESSION_COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { token } });
  }
  cookieStore.delete(USER_SESSION_COOKIE);
}

/**
 * Invalidate every session belonging to a user (e.g. after a password reset),
 * so any existing or stolen session token stops working.
 */
export async function destroyAllUserSessions(userId: string): Promise<void> {
  await db.session.deleteMany({ where: { userId } });
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
  const token = cookieStore.get(USER_SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { token },
    include: {
      user: {
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
          profilePrivate: true,
        },
      },
    },
  });

  if (!session || session.expiresAt < new Date()) return null;

  const user = session.user;

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