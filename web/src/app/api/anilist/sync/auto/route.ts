import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { importFromAniList } from "@/lib/anilist-sync";
import { safeCompare } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  const expected = process.env.ANILIST_SYNC_SECRET;
  if (!secret || !expected || !safeCompare(secret, expected)) {
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
