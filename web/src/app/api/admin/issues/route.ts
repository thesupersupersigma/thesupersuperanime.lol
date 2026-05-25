import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Auth handled by middleware — only reachable with valid admin-auth cookie

export async function GET(req: NextRequest) {
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
