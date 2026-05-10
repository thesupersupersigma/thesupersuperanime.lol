import { NextResponse } from "next/server";
import { runAllProviderChecks } from "@/lib/health-check";

/** POST /api/admin/check — run health check on all providers */
export async function POST() {
  try {
    const results = await runAllProviderChecks();
    return NextResponse.json({ results });
  } catch (err) {
    console.error("[/api/admin/check]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
