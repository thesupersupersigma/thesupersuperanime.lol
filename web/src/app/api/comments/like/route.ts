import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const { commentId } = await req.json();
  if (!commentId) return NextResponse.json({ error: "commentId required" }, { status: 400 });

  // Toggle like
  const existing = await db.commentLike.findUnique({
    where: { commentId_userId: { commentId, userId: user.id } },
  });

  if (existing) {
    await db.commentLike.delete({
      where: { commentId_userId: { commentId, userId: user.id } },
    });
    return NextResponse.json({ liked: false });
  }

  await db.commentLike.create({
    data: { commentId, userId: user.id },
  });

  return NextResponse.json({ liked: true });
}