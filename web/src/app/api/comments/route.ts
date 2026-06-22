import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireCompleteProfile } from "@/lib/auth";
import { db } from "@/lib/db";

// Simple in-memory rate limit — 1 comment per 30s per user
const rateLimitMap = new Map<string, number>();

export async function GET(req: NextRequest) {
    const animeId = req.nextUrl.searchParams.get("animeId");
    if (!animeId) return NextResponse.json({ error: "animeId required" }, { status: 400 });
    const episodeId = req.nextUrl.searchParams.get("episodeId") ?? null;

    const comments = await db.comment.findMany({
        where: {
            animeId: Number(animeId),
            episodeId: episodeId,
            parentId: null,       // top-level only
            // Keep a comment if it's live, OR it's a tombstone that still has
            // at least one non-deleted reply (so reply threads aren't lost).
            OR: [
                { deletedAt: null },
                { deletedAt: { not: null }, replies: { some: { deletedAt: null } } },
            ],
        },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
            user: {
                select: {
                    id: true,
                    discordUsername: true,
                    discordAvatar: true,
                    username: true,
                    displayName: true,
                    avatarPreset: true,
                },
            },
            likes: { select: { userId: true } },
            replies: {
                where: { deletedAt: null },
                orderBy: { createdAt: "asc" },
                include: {
                    user: {
                        select: {
                            id: true,
                            discordUsername: true,
                            discordAvatar: true,
                            username: true,
                            displayName: true,
                            avatarPreset: true,
                        },
                    },
                    likes: { select: { userId: true } },
                },
            },
        },
    });

    // Never leak a deleted comment's original content/author — blank it into a
    // tombstone shape. Replies are already filtered to non-deleted above.
    const sanitized = comments.map((c) => {
        if (c.deletedAt) {
            return { ...c, content: "", user: null, likes: [], isSpoiler: false, deleted: true };
        }
        return { ...c, deleted: false };
    });

    return NextResponse.json({ comments: sanitized });
}

export async function POST(req: NextRequest) {
  const user = await requireAuth();

  // Added !user.id to ensure TypeScript knows both the user and the ID exist
  if (!user || !user.id) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }
  if (!(await requireCompleteProfile())) {
    return NextResponse.json(
      { error: "Finish setting up your profile to continue" },
      { status: 403 },
    );
  }

  // Rate limit
  const last = rateLimitMap.get(user.id);
  if (last && Date.now() - last < 30_000) {
    return NextResponse.json({ error: "Slow down — 1 comment per 30 seconds" }, { status: 429 });
  }

  const { animeId, episodeId, content, isSpoiler, parentId } = await req.json();

  if (!animeId || !content?.trim()) {
    return NextResponse.json({ error: "animeId and content required" }, { status: 400 });
  }

  if (episodeId !== undefined && episodeId !== null && typeof episodeId !== "string") {
    return NextResponse.json({ error: "episodeId must be a string or null" }, { status: 400 });
  }

  if (content.trim().length > 1000) {
    return NextResponse.json({ error: "Comment too long (max 1000 chars)" }, { status: 400 });
  }

  // If replying, verify parent exists and belongs to same anime + episode
  if (parentId) {
    const parent = await db.comment.findUnique({ where: { id: parentId } });
    if (!parent || parent.animeId !== Number(animeId) || parent.episodeId !== (episodeId ?? null) || parent.parentId !== null) {
      return NextResponse.json({ error: "Invalid parent comment" }, { status: 400 });
    }
  }

  const comment = await db.comment.create({
    data: {
      animeId: Number(animeId),
      episodeId: episodeId ?? null,
      userId: user.id,
      content: content.trim(),
      isSpoiler: isSpoiler ?? false,
      parentId: parentId ?? null,
    },
    include: {
      user: {
        select: {
          id: true,
          discordUsername: true,
          discordAvatar: true,
          username: true,
          displayName: true,
          avatarPreset: true,
        },
      },
      likes: { select: { userId: true } },
    },
  });

  // New comments never have replies, add empty array for consistent shape
  const commentWithReplies = { ...comment, replies: [] };

  // The exclamation mark (user!.id) overrides any lingering TS doubts
  rateLimitMap.set(user!.id, Date.now());

  return NextResponse.json({ comment: commentWithReplies });
}

export async function DELETE(req: NextRequest) {
    const user = await requireAuth();
    if (!user) return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });

    const { commentId } = await req.json();
    if (!commentId) return NextResponse.json({ error: "commentId required" }, { status: 400 });

    const comment = await db.comment.findUnique({ where: { id: commentId } });
    if (!comment || comment.userId !== user.id) {
        return NextResponse.json({ error: "Not your comment" }, { status: 403 });
    }

    await db.comment.update({
        where: { id: commentId },
        data: { deletedAt: new Date() },
    });

    return NextResponse.json({ success: true });
}