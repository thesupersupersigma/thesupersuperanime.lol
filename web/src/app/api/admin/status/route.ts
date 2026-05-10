import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/** GET /api/admin/status — get current status of all providers */
export async function GET() {
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
