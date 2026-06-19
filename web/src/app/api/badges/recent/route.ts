import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Auth-only — badges the signed-in user earned in the last 5 minutes. The
// BadgeToastProvider polls this to surface in-site "Badge Earned!" toasts.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const recent = await db.userBadge.findMany({
    where: {
      userId: user.id,
      grantedAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
    },
    include: { badge: true },
    orderBy: { grantedAt: "desc" },
  });

  return NextResponse.json(
    recent.map((ub) => ({
      id: ub.id,
      grantedAt: ub.grantedAt,
      context: ub.context,
      badge: {
        slug: ub.badge.slug,
        name: ub.badge.name,
        icon: ub.badge.icon,
        rarity: ub.badge.rarity,
      },
    })),
  );
}
