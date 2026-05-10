import { cookies } from "next/headers";

const AUTH_COOKIE = "site-auth";
const SESSION_COOKIE = "session-id";

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
