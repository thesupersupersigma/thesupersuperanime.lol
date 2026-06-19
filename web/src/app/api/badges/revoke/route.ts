import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { userIsBadgeAdmin, userIsBadgeOwner } from "@/lib/badge-engine";

export const dynamic = "force-dynamic";

// Admin/owner only — remove a badge from a user. Admins can only revoke
// admin-grantable badges; owners can revoke anything.
export async function DELETE(req: NextRequest) {
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

  // Owners can revoke any badge; admins only admin-grantable ones.
  if (!isOwner && badge.grantedBy !== "admin") {
    return NextResponse.json({ error: "You cannot revoke this badge" }, { status: 403 });
  }

  await db.userBadge.deleteMany({
    where: { userId, badgeSlug, context: typeof context === "string" ? context : null },
  });

  return NextResponse.json({ success: true });
}
