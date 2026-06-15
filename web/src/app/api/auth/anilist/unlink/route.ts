import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  await db.user.update({
    where: { id: user.id },
    data: { anilistId: null, anilistUsername: null, anilistToken: null },
  });

  return NextResponse.json({ success: true });
}
