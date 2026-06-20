import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST — admin soft-delete a message (keeps the id stable; sets deletedAt).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.discordId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { messageId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const messageId = typeof body.messageId === "string" ? body.messageId : "";
  if (!messageId) {
    return NextResponse.json({ error: "messageId is required" }, { status: 400 });
  }

  await db.chatMessage.update({
    where: { id: messageId },
    data: { deletedAt: new Date() },
  });
  console.log(`[chat] admin ${user!.id} deleted message ${messageId}`);

  return NextResponse.json({ ok: true });
}
