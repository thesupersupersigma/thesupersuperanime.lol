import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { CHAT_USER_SELECT, isValidRoomId } from "@/lib/chat";

export const dynamic = "force-dynamic";

// GET — fetch the 50 most recent (non-deleted) messages for a room, in
// chronological order. Public, no auth (guests can read).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  if (!isValidRoomId(roomId)) {
    return NextResponse.json({ error: "Invalid room" }, { status: 400 });
  }

  // Grab the newest 50, then reverse so the client renders oldest → newest.
  const recent = await db.chatMessage.findMany({
    where: { roomId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { user: { select: CHAT_USER_SELECT } },
  });

  return NextResponse.json({ messages: recent.reverse() });
}

// POST — send a message. Requires a logged-in user and respects timeouts.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  if (!isValidRoomId(roomId)) {
    return NextResponse.json({ error: "Invalid room" }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to chat" }, { status: 401 });
  }

  // Server-side timeout enforcement — the client UI is only feedback.
  const timeout = await db.chatTimeout.findUnique({ where: { userId: user.id } });
  if (timeout && timeout.expiresAt > new Date()) {
    return NextResponse.json(
      { error: "You are timed out", expiresAt: timeout.expiresAt },
      { status: 403 },
    );
  }

  let body: { content?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ error: "Message cannot be empty" }, { status: 400 });
  }
  if (content.length > 500) {
    return NextResponse.json({ error: "Message too long (max 500)" }, { status: 400 });
  }

  const message = await db.chatMessage.create({
    data: { roomId, userId: user.id, content },
    include: { user: { select: CHAT_USER_SELECT } },
  });

  return NextResponse.json({ message });
}
