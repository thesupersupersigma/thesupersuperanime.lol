import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { importFromAniList } from "@/lib/anilist-sync";

export async function POST(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== process.env.ANILIST_SYNC_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await db.user.findMany({
    where: { anilistToken: { not: null } },
    select: { id: true },
  });

  const errors: { userId: string; error: string }[] = [];

  for (const user of users) {
    try {
      await importFromAniList(user.id);
    } catch (err) {
      errors.push({ userId: user.id, error: String(err) });
    }
  }

  return NextResponse.json({ synced: users.length, errors });
}
