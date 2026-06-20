import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

// POST /api/follow — toggle follow on a target user.
// Body: { followingId: string }. Requires auth. Cannot follow yourself.
export async function POST(req: NextRequest) {
  try {
    const viewer = await getCurrentUser();
    if (!viewer) {
      return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
    }

    const { followingId } = await req.json();
    if (!followingId || typeof followingId !== "string") {
      return NextResponse.json({ error: "followingId is required" }, { status: 400 });
    }

    if (followingId === viewer.id) {
      return NextResponse.json({ error: "You cannot follow yourself" }, { status: 400 });
    }

    const existing = await db.follow.findUnique({
      where: { followerId_followingId: { followerId: viewer.id, followingId } },
    });

    if (existing) {
      await db.follow.delete({ where: { id: existing.id } });
      return NextResponse.json({ following: false });
    }

    // Guard against following a user that doesn't exist
    const target = await db.user.findUnique({ where: { id: followingId }, select: { id: true } });
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await db.follow.create({ data: { followerId: viewer.id, followingId } });
    return NextResponse.json({ following: true });
  } catch (error) {
    console.error("Failed to toggle follow:", error);
    return NextResponse.json({ error: "Failed to toggle follow" }, { status: 500 });
  }
}

// GET /api/follow?userId=xxx — follower/following counts + whether the viewer follows the user.
export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const viewer = await getCurrentUser();

    const [followersCount, followingCount, isFollowing] = await Promise.all([
      db.follow.count({ where: { followingId: userId } }),
      db.follow.count({ where: { followerId: userId } }),
      viewer
        ? db.follow
            .findUnique({
              where: { followerId_followingId: { followerId: viewer.id, followingId: userId } },
            })
            .then(Boolean)
        : Promise.resolve(false),
    ]);

    return NextResponse.json({ followersCount, followingCount, isFollowing });
  } catch (error) {
    console.error("Failed to fetch follow info:", error);
    return NextResponse.json({ error: "Failed to fetch follow info" }, { status: 500 });
  }
}
