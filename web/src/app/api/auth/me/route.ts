import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ userId: null }, { status: 401 });
  return NextResponse.json({
    userId: user.id,
    discordLinked: !!user.discordId,
    discordUsername: user.discordUsername ?? null,
    emailVerified: user.emailVerified,
  });
}