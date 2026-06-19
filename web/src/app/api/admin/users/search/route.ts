import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { userIsBadgeAdmin, userIsBadgeOwner } from "@/lib/badge-engine";

export const dynamic = "force-dynamic";

// Admin/owner only — fuzzy user lookup for the badge management panel.
export async function GET(req: NextRequest) {
  const caller = await getCurrentUser();
  if (!caller || (!userIsBadgeAdmin(caller) && !userIsBadgeOwner(caller))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json([]);

  // Discord-linked users often have no `username`, so match `discordUsername`
  // too — otherwise they'd be unsearchable here.
  const users = await db.user.findMany({
    where: {
      OR: [
        { username: { contains: q, mode: "insensitive" } },
        { displayName: { contains: q, mode: "insensitive" } },
        { discordUsername: { contains: q, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      discordUsername: true,
      avatarPreset: true,
      discordAvatar: true,
    },
    take: 10,
  });

  return NextResponse.json(users);
}
