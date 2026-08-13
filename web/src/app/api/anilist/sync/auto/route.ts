import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { importFromAniList } from "@/lib/anilist-sync";
import { safeCompare } from "@/lib/auth";
import { errorInfo } from "@/lib/log-error";

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
      const info = errorInfo(err);
      // The only consumer of `errors` is the response body, and the caller is a
      // bare `curl -X POST` in anilist-sync.yml with no output assertion — so a
      // run where every user failed looked exactly like a clean one.
      console.error("[anilist/sync/auto] user sync failed", { userId: user.id, ...info });
      errors.push({ userId: user.id, error: `${info.errName}: ${info.errMessage}` });
    }
  }

  console.log("[anilist/sync/auto] done", { total: users.length, failed: errors.length });

  // Response shape deliberately unchanged (logging-only pass). Worth revisiting:
  // a run where every user failed still returns 200, so the cron stays green.
  return NextResponse.json({ synced: users.length, errors });
}
