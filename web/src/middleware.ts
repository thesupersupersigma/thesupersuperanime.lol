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

  // ── Proxy routes — token IS the auth ───────────────────────────────────
  if (pathname.startsWith("/api/proxy")) {
    return NextResponse.next();
  }

  // ── Discord OAuth callback — must be public ─────────────────────────────
  if (pathname.startsWith("/api/auth/discord")) {
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

  // ── Admin routes ────────────────────────────────────────────────────────
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    const siteAuth = req.cookies.get("site-auth");
    if (!siteAuth || siteAuth.value !== process.env.SITE_PASSWORD) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/login", req.url));
    }
    const adminAuth = req.cookies.get("admin-auth");
    if (!adminAuth || adminAuth.value !== process.env.ADMIN_PASSWORD) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/admin/login", req.url));
    }
    return NextResponse.next();
  }

  // ── Main site login page ────────────────────────────────────────────────
  if (pathname === "/login") {
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

  // ── Discord link gate — logged-in users must have Discord linked ────────
  // Exempt: account page itself, auth APIs, and api/auth/me
  const exemptFromDiscordGate =
    pathname === "/account" ||
    pathname.startsWith("/account/") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/import") ||
    pathname === "/api/auth/me";

  if (!exemptFromDiscordGate) {
    const userId = req.cookies.get("user-session")?.value;
    // Only gate logged-in users — guests (no user-session cookie) pass through
    if (userId) {
      const discordLinked = req.cookies.get("discord-linked")?.value;
      if (!discordLinked || discordLinked !== "1") {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json(
            { error: "Discord account required", code: "DISCORD_REQUIRED" },
            { status: 403 }
          );
        }
        // 👉 Commented out to prevent conflicting with nav.tsx client-side redirects
        return NextResponse.redirect(new URL("/account/link-discord", req.url));
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};