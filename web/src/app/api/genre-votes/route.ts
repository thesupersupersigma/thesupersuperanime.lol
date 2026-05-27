import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";

// POST /api/genre-votes  — cast a vote (idempotent: ignore duplicate)
export async function POST(req: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const animeId = Number(body?.animeId);
  const genre = typeof body?.genre === "string" ? body.genre.trim() : "";

  if (!animeId || !genre) {
    return NextResponse.json({ error: "animeId and genre are required" }, { status: 400 });
  }

  // upsert-style: createMany with skipDuplicates
  await db.genreVote.upsert({
    where: { userId_animeId_genre: { userId: user.id, animeId, genre } },
    create: { userId: user.id, animeId, genre },
    update: {}, // already exists — no-op
  });

  const voteCount = await db.genreVote.count({ where: { animeId, genre } });
  return NextResponse.json({ ok: true, voteCount });
}

// DELETE /api/genre-votes  — remove a vote
export async function DELETE(req: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const animeId = Number(body?.animeId);
  const genre = typeof body?.genre === "string" ? body.genre.trim() : "";

  if (!animeId || !genre) {
    return NextResponse.json({ error: "animeId and genre are required" }, { status: 400 });
  }

  await db.genreVote.deleteMany({
    where: { userId: user.id, animeId, genre },
  });

  const voteCount = await db.genreVote.count({ where: { animeId, genre } });
  return NextResponse.json({ ok: true, voteCount });
}
