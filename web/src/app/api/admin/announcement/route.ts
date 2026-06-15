import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.discordId)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { message, type, action } = body as {
    message?: string;
    type?: string;
    action: "publish" | "clear";
  };

  if (action === "clear") {
    await db.announcement.updateMany({
      where: { active: true },
      data: { active: false },
    });
    return NextResponse.json({ ok: true });
  }

  if (!message?.trim()) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }

  // Deactivate any existing active announcements
  await db.announcement.updateMany({
    where: { active: true },
    data: { active: false },
  });

  const announcement = await db.announcement.create({
    data: {
      message: message.trim(),
      type: type ?? "info",
      active: true,
    },
  });

  return NextResponse.json({ ok: true, announcement });
}
