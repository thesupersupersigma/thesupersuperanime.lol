import { NextRequest, NextResponse } from "next/server";
import { runStatusChecks } from "@/lib/status";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/status-check — runs the same checks as /api/status on a 5-minute
 * GitHub Actions schedule so the public status page has continuous uptime history
 * even when nobody is viewing it.
 *
 * Auth: Authorization: Bearer <CRON_SECRET> (re-checked here; proxy.ts also gates
 * every /api/cron/* route with the same secret).
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runStatusChecks();
    return NextResponse.json({
      checked: result.services.length,
      incidents: result.incidents,
    });
  } catch (err) {
    console.error("[/api/cron/status-check]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
