import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const announcement = await db.announcement.findFirst({
    where: { active: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ announcement: announcement ?? null });
}
