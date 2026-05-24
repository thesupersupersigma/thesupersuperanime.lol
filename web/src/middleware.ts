import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── Static / Next internals ─────────────────────────────────────────────
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
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
    pathname.startsWith("/api/auth/discord") ||
    pathname === "/api/auth/me" ||
    pathname === "/login"
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

  // ── Admin login page ────────────────────────────────────────────────────
  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  // ── Site-wide password lock ─────────────────────────────────────────────
  const siteAuth = req.cookies.get("site-auth");
  if (!siteAuth || siteAuth.value !== process.env.SITE_PASSWORD) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // ── Admin routes (after site auth passes) ──────────────────────────────
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    const adminAuth = req.cookies.get("admin-auth");
    if (!adminAuth || adminAuth.value !== process.env.ADMIN_PASSWORD) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/admin/login", req.url));
    }
    return NextResponse.next();
  }

  // ── Discord link gate ───────────────────────────────────────────────────
  const exemptFromDiscordGate =
    pathname === "/account" ||
    pathname.startsWith("/account/") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/import") ||
    pathname.startsWith("/api/watchlist") ||
    pathname.startsWith("/api/progress") ||
    pathname === "/leaderboard" ||
    pathname === "/api/auth/me";

  if (!exemptFromDiscordGate) {
    const userId = req.cookies.get("user-session")?.value;

    // 1. If they have NO account/session, kick them to the login page
    if (!userId) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/account", req.url));
    }

    // 2. If they ARE logged in, but haven't linked Discord, kick to the link page
    const discordLinked = req.cookies.get("discord-linked")?.value;
    if (!discordLinked || discordLinked !== "1") {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "Discord account required", code: "DISCORD_REQUIRED" },
          { status: 403 }
        );
      }
      return NextResponse.redirect(new URL("/account/link-discord", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};