import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { userIsBadgeAdmin, userIsBadgeOwner } from "@/lib/badge-engine";

export const dynamic = "force-dynamic";

// Admin/owner only — the full badge catalogue, rarest first. Used to populate
// the grant dropdown in the admin badge panel.
export async function GET() {
  const caller = await getCurrentUser();
  if (!caller || (!userIsBadgeAdmin(caller) && !userIsBadgeOwner(caller))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const badges = await db.badge.findMany({ orderBy: { rarityOrder: "desc" } });
  return NextResponse.json(badges);
}
