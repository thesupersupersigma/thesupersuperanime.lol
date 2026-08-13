/**
 * Edge-verifiable signing for the `user-session` cookie.
 *
 * The proxy (src/proxy.ts) runs on the Edge runtime and cannot reach Postgres,
 * so its gate used to accept the mere *presence* of a `user-session` cookie:
 *
 *     const userId = req.cookies.get("user-session")?.value;
 *     if (!userId) { ...block... }
 *
 * Any truthy value walked past it — `document.cookie = "user-session=x"` was
 * enough. `getCurrentUser()` correctly rejects a forged token, but nothing on
 * that path ever called it, and neither server-side backstop fires for an
 * *anonymous* forgery: the (site) layout only redirects when `user !== null`,
 * and DiscordGateCheck bails silently on the 401.
 *
 * Signing the token gives the Edge something it can actually check without a
 * DB round-trip. The cookie becomes:
 *
 *     <opaque token>.<hex HMAC-SHA256 of the token>
 *
 * The signature proves the token was minted by this server; the DB lookup in
 * `getCurrentUser()` still decides whether the session is real and unexpired.
 * The signature is NOT a substitute for that — it's a cheap pre-filter that
 * makes the middleware gate meaningful.
 *
 * Uses Web Crypto rather than node:crypto so the exact same code runs in the
 * Edge middleware and in Node route handlers.
 */

const SEPARATOR = ".";

/** Cached CryptoKey per secret — importKey on every request would be wasteful. */
const keyCache = new Map<string, Promise<CryptoKey>>();

function getSecret(): string | null {
  // TOKEN_SECRET is the fallback so this works without provisioning a new
  // variable; set SESSION_COOKIE_SECRET to give sessions their own key.
  return process.env.SESSION_COOKIE_SECRET || process.env.TOKEN_SECRET || null;
}

function getKey(secret: string): Promise<CryptoKey> {
  let key = keyCache.get(secret);
  if (!key) {
    key = crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
    keyCache.set(secret, key);
  }
  return key;
}

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

function fromHex(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0) return null;
  if (!/^[0-9a-f]+$/i.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Split a cookie value into its token and signature.
 *
 * Splits on the LAST separator so a token that somehow contains one still
 * round-trips. Returns null when the value isn't in signed form at all — which
 * includes every cookie minted before this change, so those are rejected rather
 * than grandfathered (grandfathering would leave the bypass wide open).
 */
export function splitSessionCookie(value: string): { token: string; signature: string } | null {
  const idx = value.lastIndexOf(SEPARATOR);
  if (idx <= 0 || idx === value.length - 1) return null;
  return { token: value.slice(0, idx), signature: value.slice(idx + 1) };
}

/** `<token>.<hex signature>` for a freshly minted session token. */
export async function signSessionToken(token: string): Promise<string> {
  const secret = getSecret();
  if (!secret) {
    throw new Error("SESSION_COOKIE_SECRET/TOKEN_SECRET is not set — cannot sign session cookie");
  }
  const key = await getKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token));
  return `${token}${SEPARATOR}${toHex(sig)}`;
}

/**
 * Verify a cookie value and return the opaque token it carries, or null.
 *
 * Fails closed: an unset secret returns null (and logs), because a gate that
 * fails open on misconfiguration is the bug this module exists to fix.
 */
export async function verifySessionCookie(value: string | undefined | null): Promise<string | null> {
  if (!value) return null;

  const secret = getSecret();
  if (!secret) {
    console.error("[session-cookie] no SESSION_COOKIE_SECRET/TOKEN_SECRET — rejecting all sessions");
    return null;
  }

  const parts = splitSessionCookie(value);
  if (!parts) return null;

  const sigBytes = fromHex(parts.signature);
  if (!sigBytes) return null;

  try {
    const key = await getKey(secret);
    // subtle.verify does the constant-time comparison for us.
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes as unknown as BufferSource,
      new TextEncoder().encode(parts.token),
    );
    return ok ? parts.token : null;
  } catch {
    return null;
  }
}
