import { NextRequest, NextResponse } from "next/server";

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
    pathname === "/api/discord/interactions"
  ) {
    return NextResponse.next();
  }

  // ── Cron routes ─────────────────────────────────────────────────────────
  if (pathname.startsWith("/api/cron")) {
    const authHeader = req.headers.get("authorization") ?? "";
    const expectedToken = process.env.CRON_SECRET;
    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // ── Site-wide password lock ─────────────────────────────────────────────
  // SITE_PASSWORD_GATE=off bypasses the check entirely (default: on)
  const sitePasswordGateEnabled = process.env.SITE_PASSWORD_GATE !== "off";
  if (sitePasswordGateEnabled) {
    const siteAuth = req.cookies.get("site-auth");
    if (!siteAuth || siteAuth.value !== process.env.SITE_PASSWORD) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  // ── Discord link gate ───────────────────────────────────────────────────
  // DISCORD_GATE=off skips the gate entirely (default: on)
  // MASTER_GATE=off allows unauthenticated browsing within the discord gate
  //   (when DISCORD_GATE=on but MASTER_GATE=off, anonymous users pass through;
  //    logged-in users still need discord/email verification)
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
      pathname === "/api/auth/me" ||
      pathname.startsWith("/user/");

    if (!exemptFromDiscordGate) {
      const userId = req.cookies.get("user-session")?.value;

      if (!userId) {
        // 1. No session — block unless MASTER_GATE=off allows anonymous browsing
        if (masterGateEnabled) {
          if (pathname.startsWith("/api/")) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
          }
          return NextResponse.redirect(new URL("/account", req.url));
        }
        // MASTER_GATE=off: anonymous user passes through without discord check
      } else {
        // 2. Logged-in users pass the gate with EITHER a linked Discord account
        //    OR a verified email. Both are mirrored into cookies because this
        //    middleware runs on the Edge and cannot query the database.
        const discordLinked = req.cookies.get("discord-linked")?.value === "1";
        const emailVerified = req.cookies.get("email-verified")?.value === "1";
        if (!discordLinked && !emailVerified) {
          if (pathname.startsWith("/api/")) {
            return NextResponse.json(
              { error: "Verification required", code: "VERIFICATION_REQUIRED" },
              { status: 403 }
            );
          }
          return NextResponse.redirect(new URL("/account/link-discord", req.url));
        }
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};