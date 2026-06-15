import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ userId: null }, { status: 401 });
  return NextResponse.json({
    userId: user.id,
    discordLinked: !!user.discordId,
    discordUsername: user.discordUsername ?? null,
    anilistUsername: user.anilistUsername ?? null,
    emailVerified: user.emailVerified,
    // Expose gate status so client components (Nav, DiscordGateCheck) can
    // respect DISCORD_GATE=off without needing a NEXT_PUBLIC_ variable.
    gateEnabled: process.env.DISCORD_GATE !== "off",
  });
}