import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { CHAT_USER_SELECT } from "@/lib/chat";

export const dynamic = "force-dynamic";

// GET — users who have sent a chat message in the last 5 minutes across any
// channel. A lightweight presence proxy (we don't track real connections).
export async function GET() {
  const since = new Date(Date.now() - 5 * 60 * 1000);
  const recent = await db.chatMessage.findMany({
    where: { createdAt: { gte: since }, deletedAt: null },
    select: { userId: true, user: { select: CHAT_USER_SELECT } },
    distinct: ["userId"],
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ users: recent.map((r) => r.user) });
}
