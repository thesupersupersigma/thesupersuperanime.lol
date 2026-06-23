import { NextResponse } from "next/server";
import { getStatusSnapshot } from "@/lib/status";

export const dynamic = "force-dynamic";

/**
 * GET /api/status — public. Returns a READ-ONLY uptime snapshot from persisted
 * data (no live pings, no DB writes). The live checks run via the cron only, so
 * hammering this endpoint can't amplify load or pollute uptime history.
 */
export async function GET() {
  try {
    const result = await getStatusSnapshot();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/status]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
