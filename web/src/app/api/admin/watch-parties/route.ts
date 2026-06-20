import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET — list active (non-expired) watch parties.
export async function GET() {
  const user = await getCurrentUser();
  if (!isAdmin(user?.discordId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parties = await db.watchParty.findMany({
    where: { expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      host: { select: { id: true, discordUsername: true, username: true, email: true } },
    },
  });

  return NextResponse.json({ parties });
}

// DELETE — delete a watch party by id.
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.discordId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  await db.watchParty.delete({ where: { id } });
  console.log(`[admin] deleted watch party ${id}`);

  return NextResponse.json({ ok: true });
}
