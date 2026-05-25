import { NextResponse } from "next/server";
import { runAllProviderChecks } from "@/lib/health-check";
import { getCurrentUser, isAdmin } from "@/lib/auth";

/** POST /api/admin/check — run health check on all providers */
export async function POST() {
  const user = await getCurrentUser();
  if (!isAdmin(user?.discordId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const results = await runAllProviderChecks();
    return NextResponse.json({ results });
  } catch (err) {
    console.error("[/api/admin/check]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
