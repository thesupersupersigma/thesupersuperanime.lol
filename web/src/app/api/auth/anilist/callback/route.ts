import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const state = searchParams.get("state");

  if (error || !code) {
    return NextResponse.redirect(new URL("/account?tab=settings&error=cancelled", req.url));
  }

  let userId: string | null = null;
  try {
    if (state) {
      const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
      userId = decoded.userId ?? null;
    }
  } catch {
    return NextResponse.redirect(new URL("/account?tab=settings&error=server", req.url));
  }

  if (!userId) {
    return NextResponse.redirect(new URL("/account?tab=settings&error=no_session", req.url));
  }

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.redirect(new URL("/account?tab=settings&error=no_session", req.url));
  }

  const clientId = process.env.ANILIST_CLIENT_ID!;
  const clientSecret = process.env.ANILIST_CLIENT_SECRET!;
  const cleanBaseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "http://localhost:3000";
  const redirectUri = `${cleanBaseUrl}/api/auth/anilist/callback`;

  try {
    // Exchange code for token
    const tokenRes = await fetch("https://anilist.co/api/v2/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      }),
    });

    if (!tokenRes.ok) {
      console.error("[AniList] Token exchange failed:", await tokenRes.text());
      return NextResponse.redirect(new URL("/account?tab=settings&error=token", req.url));
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // Fetch AniList user info
    const viewerRes = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ query: "query { Viewer { id name } }" }),
    });

    if (!viewerRes.ok) {
      return NextResponse.redirect(new URL("/account?tab=settings&error=user", req.url));
    }

    const viewerData = await viewerRes.json();
    const anilistId = viewerData.data?.Viewer?.id;
    const anilistUsername = viewerData.data?.Viewer?.name;

    // Save to DB
    await db.user.update({
      where: { id: userId },
      data: { anilistId, anilistUsername, anilistToken: accessToken },
    });

    return NextResponse.redirect(new URL("/account?tab=settings&anilist=linked", req.url));
  } catch (err) {
    console.error("[AniList OAuth]", err);
    return NextResponse.redirect(new URL("/account?tab=settings&error=server", req.url));
  }
}
