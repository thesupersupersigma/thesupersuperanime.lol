import { NextRequest, NextResponse } from "next/server";

/**
 * Constant-time string comparison usable on the Edge runtime (no Node crypto).
 * Iterates over the longer string's length so timing doesn't leak where the
 * strings diverge; only returns true when lengths match AND nothing mismatched.
 */
function timingSafeEqualString(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let mismatch = a.length === b.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return mismatch === 0;
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── Static / Next internals ─────────────────────────────────────────────
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/.well-known") ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname === "/llms.txt" ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".ico")
  ) {
    return NextResponse.next();
  }

  // ── Always public — no auth checks at all ──────────────────────────────
  if (
    pathname.startsWith("/api/proxy") ||
    pathname.startsWith("/api/subtitle-proxy") ||
    pathname.startsWith("/api/auth/discord") ||
    pathname === "/api/auth/me" ||
    pathname === "/login" ||
    pathname.startsWith("/api/announcement") ||
    pathname.startsWith("/api/watch-party") ||
    pathname.startsWith("/api/chat") ||
    pathname.startsWith("/api/changelog") ||
    pathname === "/api/status" ||
    pathname === "/api/webhooks/github" ||
    pathname === "/api/discord/interactions" ||
    pathname === "/api/anilist/sync/auto"
  ) {
    return NextResponse.next();
  }

  // ── Cron routes ─────────────────────────────────────────────────────────
  if (pathname.startsWith("/api/cron")) {
    const authHeader = req.headers.get("authorization") ?? "";
    const expectedToken = process.env.CRON_SECRET;
    if (!expectedToken || !timingSafeEqualString(authHeader, `Bearer ${expectedToken}`)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // ── Site-wide password lock ─────────────────────────────────────────────
  // SITE_PASSWORD_GATE=off bypasses the check entirely (default: on)
  const sitePasswordGateEnabled = process.env.SITE_PASSWORD_GATE !== "off";
  if (sitePasswordGateEnabled) {
    const siteAuth = req.cookies.get("site-auth");
    if (
      !siteAuth ||
      !process.env.SITE_PASSWORD ||
      !timingSafeEqualString(siteAuth.value, process.env.SITE_PASSWORD)
    ) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  // ── Discord link gate ───────────────────────────────────────────────────
  // DISCORD_GATE=off skips the gate entirely (default: on)
  // MASTER_GATE=off allows unauthenticated browsing within the discord gate
  //   (when DISCORD_GATE=on but MASTER_GATE=off, anonymous users pass through).
  // Logged-in users always pass the middleware here — Discord/email verification
  // is enforced server-side by the (site) layout + DiscordGateCheck (both DB-based).
  const discordGateEnabled = process.env.DISCORD_GATE !== "off";
  const masterGateEnabled = process.env.MASTER_GATE !== "off";

  if (discordGateEnabled) {
    const exemptFromDiscordGate =
      pathname === "/account" ||
      pathname.startsWith("/account/") ||
      pathname.startsWith("/api/auth") ||
      pathname.startsWith("/api/import") ||
      pathname.startsWith("/api/watchlist") ||
      pathname.startsWith("/api/progress") ||
      pathname === "/leaderboard" ||
      pathname === "/status" ||
      pathname === "/api/auth/me" ||
      pathname.startsWith("/user/");

    if (!exemptFromDiscordGate) {
      const userId = req.cookies.get("user-session")?.value;

      if (!userId) {
        // No session — block unless MASTER_GATE=off allows anonymous browsing
        if (masterGateEnabled) {
          if (pathname.startsWith("/api/")) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
          }
          return NextResponse.redirect(new URL("/account", req.url));
        }
        // MASTER_GATE=off: anonymous user passes through without discord check
      }
      // Logged-in users pass through here. Discord/email verification is enforced
      // server-side by the (site) layout + DiscordGateCheck (both DB-based).
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};