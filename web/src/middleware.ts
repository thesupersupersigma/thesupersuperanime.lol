import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── Static / Next internals — always pass through ──────────────────────────
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

  // ── Proxy routes — token IS the auth, no cookie needed ─────────────────────
  if (pathname.startsWith("/api/proxy")) {
    return NextResponse.next();
  }

  // ── Cron routes — auth via Bearer token, not cookies ──────────────────────
  if (pathname.startsWith("/api/cron")) {
    const authHeader = req.headers.get("authorization") ?? "";
    const expectedToken = process.env.CRON_SECRET;
    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // ── Admin login page — excluded from admin auth ────────────────────────────
  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  // ── Admin routes — check admin-auth cookie ─────────────────────────────────
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    // Must also pass the main site-auth check first
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

  // ── Main site login page — excluded from site auth ─────────────────────────
  if (pathname === "/login") {
    return NextResponse.next();
  }

  // ── All other routes — check site-auth cookie ──────────────────────────────
  const siteAuth = req.cookies.get("site-auth");
  if (!siteAuth || siteAuth.value !== process.env.SITE_PASSWORD) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
