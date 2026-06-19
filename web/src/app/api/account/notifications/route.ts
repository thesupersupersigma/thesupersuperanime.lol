import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

const ALLOWED_FIELDS = [
  "emailNotifStreak",
  "emailNotifRanked",
  "emailNotifNewEpisode",
  "emailNotifCompletion",
] as const;
type AllowedField = (typeof ALLOWED_FIELDS)[number];

export async function PATCH(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
    }

    const { field, value } = await req.json();

    if (!ALLOWED_FIELDS.includes(field) || typeof value !== "boolean") {
      return NextResponse.json({ error: "Invalid field or value" }, { status: 400 });
    }

    await db.user.update({
      where: { id: user.id },
      data: { [field as AllowedField]: value },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update notification preference:", error);
    return NextResponse.json({ error: "Failed to update preference" }, { status: 500 });
  }
}
