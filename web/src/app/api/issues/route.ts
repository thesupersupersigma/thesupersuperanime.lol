import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

const VALID_TYPES = [
  "Video not playing",
  "Missing episode",
  "Wrong subtitles",
  "Site bug",
  "Other",
] as const;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { type, description, animeInfo } = body;

  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: "Invalid issue type" }, { status: 400 });
  }
  if (!description?.trim()) {
    return NextResponse.json({ error: "Description is required" }, { status: 400 });
  }
  if (description.trim().length > 2000) {
    return NextResponse.json({ error: "Description too long (max 2000 chars)" }, { status: 400 });
  }

  // Attach to logged-in user if one exists — anonymous submissions are fine too
  const user = await getCurrentUser();

  const issue = await db.issue.create({
    data: {
      type,
      description: description.trim(),
      animeInfo: animeInfo?.trim() || null,
      userId: user?.id ?? null,
    },
  });

  return NextResponse.json({ ok: true, id: issue.id });
}
