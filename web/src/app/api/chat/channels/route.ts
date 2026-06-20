import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { ensureDefaultChannels } from "@/lib/chat";

export const dynamic = "force-dynamic";

// GET — list all channels (public). Seeds the defaults if none exist yet.
export async function GET() {
  const channels = await ensureDefaultChannels();
  return NextResponse.json({ channels });
}

// POST — create a channel (admin only).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.discordId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { name?: unknown; description?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim().toLowerCase() : "";
  const description =
    typeof body.description === "string" && body.description.trim()
      ? body.description.trim()
      : null;

  if (name.length < 1 || name.length > 32 || !/^[a-z0-9-]+$/.test(name)) {
    return NextResponse.json(
      { error: "Channel name must be 1–32 chars: lowercase letters, numbers, hyphens" },
      { status: 400 },
    );
  }

  const existing = await db.chatChannel.findFirst({ where: { name } });
  if (existing) {
    return NextResponse.json({ error: "A channel with that name already exists" }, { status: 409 });
  }

  const top = await db.chatChannel.findFirst({ orderBy: { position: "desc" } });
  const position = (top?.position ?? -1) + 1;

  const channel = await db.chatChannel.create({
    data: { name, description, position },
  });
  console.log(`[chat] admin ${user!.id} created channel ${channel.id} (#${name})`);

  return NextResponse.json({ channel });
}

// DELETE — delete a channel (admin only). Soft-deletes its messages first.
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.discordId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { channelId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const channelId = typeof body.channelId === "string" ? body.channelId : "";
  if (!channelId) {
    return NextResponse.json({ error: "channelId is required" }, { status: 400 });
  }

  const channel = await db.chatChannel.findUnique({ where: { id: channelId } });
  if (!channel) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  // Refuse to delete the last remaining channel.
  const count = await db.chatChannel.count();
  if (count <= 1) {
    return NextResponse.json({ error: "Cannot delete the last channel" }, { status: 400 });
  }

  // Soft-delete the channel's messages (roomId = "channel-{id}"), then drop it.
  await db.chatMessage.updateMany({
    where: { roomId: `channel-${channelId}`, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  await db.chatChannel.delete({ where: { id: channelId } });
  console.log(`[chat] admin ${user!.id} deleted channel ${channelId}`);

  return NextResponse.json({ ok: true });
}
