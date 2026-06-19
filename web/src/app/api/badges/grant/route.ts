import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { grantBadge, userIsBadgeAdmin, userIsBadgeOwner } from "@/lib/badge-engine";

// Admin/owner only — manually grant a badge to a user.
export async function POST(req: NextRequest) {
  const caller = await getCurrentUser();
  if (!caller) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }

  const isOwner = userIsBadgeOwner(caller);
  const isAdminUser = userIsBadgeAdmin(caller);
  if (!isOwner && !isAdminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const userId = body?.userId;
  const badgeSlug = body?.badgeSlug;
  const context = body?.context;
  if (typeof userId !== "string" || typeof badgeSlug !== "string") {
    return NextResponse.json({ error: "userId and badgeSlug are required" }, { status: 400 });
  }

  const badge = await db.badge.findUnique({
    where: { slug: badgeSlug },
    select: { grantedBy: true },
  });
  if (!badge) {
    return NextResponse.json({ error: "Badge not found" }, { status: 404 });
  }

  // Owners can grant any badge; admins can only grant admin-grantable ones.
  if (!isOwner && badge.grantedBy !== "admin") {
    return NextResponse.json({ error: "You cannot grant this badge" }, { status: 403 });
  }

  const granted = await grantBadge(
    userId,
    badgeSlug,
    typeof context === "string" ? context : undefined,
  );
  return NextResponse.json({ success: true, granted });
}
