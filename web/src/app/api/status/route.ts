import { NextResponse } from "next/server";
import { runStatusChecks } from "@/lib/status";

export const dynamic = "force-dynamic";

/** GET /api/status — public. Live-pings all services and returns uptime status. */
export async function GET() {
  try {
    const result = await runStatusChecks();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/status]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
