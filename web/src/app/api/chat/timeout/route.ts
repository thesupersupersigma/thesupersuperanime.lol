import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MAX_DURATION_MINUTES = 10080; // 7 days

// POST — admin timeout a user from chat for `durationMinutes`.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.discordId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { userId?: unknown; durationMinutes?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId : "";
  const durationMinutes =
    typeof body.durationMinutes === "number" ? body.durationMinutes : NaN;
  const reason = typeof body.reason === "string" ? body.reason : null;

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return NextResponse.json({ error: "durationMinutes must be positive" }, { status: 400 });
  }

  const minutes = Math.min(durationMinutes, MAX_DURATION_MINUTES);
  const expiresAt = new Date(Date.now() + minutes * 60_000);

  await db.chatTimeout.upsert({
    where: { userId },
    create: { userId, expiresAt, reason },
    update: { expiresAt, reason },
  });
  console.log(`[chat] admin ${user!.id} timed out user ${userId} for ${minutes}m`);

  return NextResponse.json({ ok: true, expiresAt });
}

// DELETE — admin remove a user's timeout.
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.discordId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { userId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId : "";
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  await db.chatTimeout.deleteMany({ where: { userId } });
  console.log(`[chat] admin ${user!.id} cleared timeout for user ${userId}`);

  return NextResponse.json({ ok: true });
}
