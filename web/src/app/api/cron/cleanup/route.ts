import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * POST /api/cron/cleanup — deletes expired SourceToken records
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 * (handled by middleware — this route only runs if the token is valid)
 */
export async function POST(_req: NextRequest) {
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago

  try {
    const { count } = await db.sourceToken.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    });

    return NextResponse.json({ ok: true, deleted: count });
  } catch (err) {
    console.error("[/api/cron/cleanup]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
