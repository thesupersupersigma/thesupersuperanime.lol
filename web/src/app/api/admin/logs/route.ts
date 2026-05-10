import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/** GET /api/admin/logs — get recent provider logs (last 50)
 *  Query params:
 *    ?providerId=gogoanime  — filter to one provider
 *    ?level=error           — filter to one log level
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const providerId = searchParams.get("providerId") ?? undefined;
  const level = searchParams.get("level") ?? undefined;

  try {
    const logs = await db.providerLog.findMany({
      where: {
        ...(providerId ? { providerId } : {}),
        ...(level ? { level } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ logs });
  } catch (err) {
    console.error("[/api/admin/logs]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
