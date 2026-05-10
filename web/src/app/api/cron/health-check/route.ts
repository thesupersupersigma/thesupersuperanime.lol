import { NextRequest, NextResponse } from "next/server";
import { runAllProviderChecks } from "@/lib/health-check";

/**
 * POST /api/cron/health-check — GitHub Actions cron endpoint
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 * (handled by middleware — this route only runs if the token is valid)
 */
export async function POST(_req: NextRequest) {
  const startedAt = Date.now();

  try {
    const results = await runAllProviderChecks();
    const elapsed = Date.now() - startedAt;

    const healthy = results.filter((r) => r.status === "healthy").length;
    const degraded = results.filter((r) => r.status === "degraded").length;
    const broken = results.filter((r) => r.status === "broken").length;

    return NextResponse.json({
      ok: true,
      elapsedMs: elapsed,
      summary: { healthy, degraded, broken, total: results.length },
      results,
    });
  } catch (err) {
    console.error("[/api/cron/health-check]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
