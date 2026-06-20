import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { sendChangelogPost } from "@/lib/discord";

export const dynamic = "force-dynamic";

// GET — public, list changelog entries.
export async function GET() {
  const entries = await db.changelog.findMany({
    orderBy: { publishedAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ entries });
}

// POST — admin only. Creates a changelog entry and posts it to Discord.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.discordId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { version?: unknown; title?: unknown; body?: unknown; major?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const version = typeof body.version === "string" ? body.version.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const content = typeof body.body === "string" ? body.body.trim() : "";
  const major = body.major === true;

  if (!version || !title || !content) {
    return NextResponse.json({ error: "version, title, and body are required" }, { status: 400 });
  }

  const entry = await db.changelog.create({
    data: { version, title, body: content, major },
  });

  console.log(`[changelog] published ${version} — ${title}`);

  void sendChangelogPost(
    entry.version,
    entry.title,
    entry.body,
    entry.major,
    "https://www.thesupersuperanime.lol/updates"
  ).catch((err) => console.error("[changelog] sendChangelogPost error:", err));

  return NextResponse.json({ entry });
}

// DELETE — admin only.
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

  await db.changelog.delete({ where: { id } });
  console.log(`[changelog] deleted entry ${id}`);

  return NextResponse.json({ ok: true });
}
