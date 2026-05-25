import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isAdmin } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.discordId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const status = req.nextUrl.searchParams.get("status"); // "open" | "resolved" | null = all

  const issues = await db.issue.findMany({
    where: status ? { status } : undefined,
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    take: 200,
    include: {
      user: {
        select: { discordUsername: true, email: true },
      },
    },
  });

  return NextResponse.json({ issues });
}
