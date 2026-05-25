import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isAdmin } from "@/lib/auth";

/** GET /api/admin/status — get current status of all providers */
export async function GET() {
  const user = await getCurrentUser();
  if (!isAdmin(user?.discordId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const statuses = await db.providerStatus.findMany({
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ statuses });
  } catch (err) {
    console.error("[/api/admin/status]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
