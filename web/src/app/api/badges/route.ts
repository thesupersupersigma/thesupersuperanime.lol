import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Public — returns the badges a given user has earned, rarest first.
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const userBadges = await db.userBadge.findMany({
    where: { userId },
    include: { badge: true },
    orderBy: [
      { badge: { rarityOrder: "desc" } },
      { grantedAt: "asc" },
    ],
  });

  const badges = userBadges.map(ub => ({
    slug: ub.badge.slug,
    name: ub.badge.name,
    description: ub.badge.description,
    icon: ub.badge.icon,
    rarity: ub.badge.rarity,
    rarityOrder: ub.badge.rarityOrder,
    grantedAt: ub.grantedAt,
    context: ub.context,
  }));

  return NextResponse.json(badges);
}
