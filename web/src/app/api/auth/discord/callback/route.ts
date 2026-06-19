import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { grantBadge } from "@/lib/badge-engine";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const state = searchParams.get("state");

  if (error || !code) {
    return NextResponse.redirect(new URL("/account/link-discord?error=cancelled", req.url));
  }

  // Decode userId from state — no cookie needed
  let userId: string | null = null;
  try {
    if (state) {
      const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
      userId = decoded.userId ?? null;
    }
  } catch {
    return NextResponse.redirect(new URL("/account/link-discord?error=server", req.url));
  }

  if (!userId) {
    return NextResponse.redirect(new URL("/account/link-discord?error=no_session", req.url));
  }

  // Verify user actually exists in DB
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.redirect(new URL("/account/link-discord?error=no_session", req.url));
  }

  const clientId = process.env.DISCORD_CLIENT_ID!;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET!;
  const botToken = process.env.DISCORD_BOT_TOKEN!;
  const guildId = process.env.DISCORD_GUILD_ID!;
  const cleanBaseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "http://localhost:3000";
  const bypassSecret = process.env.VERCEL_BYPASS_SECRET ?? "";
  const redirectUri = bypassSecret
    ? `${cleanBaseUrl}/api/auth/discord/callback?x-vercel-protection-bypass=${bypassSecret}&x-vercel-set-bypass-cookie=true`
    : `${cleanBaseUrl}/api/auth/discord/callback`;
  try {
    // 1. Exchange code for access token
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      console.error("[Discord] Token exchange failed:", await tokenRes.text());
      return NextResponse.redirect(new URL("/account/link-discord?error=token", req.url));
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // 2. Fetch Discord user info
    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userRes.ok) {
      return NextResponse.redirect(new URL("/account/link-discord?error=user", req.url));
    }

    const discordUser = await userRes.json();
    const avatarUrl = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : `https://cdn.discordapp.com/embed/avatars/${parseInt(discordUser.discriminator || "0") % 5}.png`;

    // 3. Save Discord info to user
    await db.user.update({
      where: { id: userId },
      data: {
        discordId: discordUser.id,
        discordUsername: discordUser.username,
        discordAvatar: avatarUrl,
      },
    });

    // Grant the "verified" badge immediately on link (fire-and-forget) rather
    // than waiting for the next watch-progress badge sweep.
    void grantBadge(userId, "verified").catch(console.error);

    // 4. Auto-join user to Discord server
    try {
      await fetch(`https://discord.com/api/guilds/${guildId}/members/${discordUser.id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ access_token: accessToken }),
      });
    } catch (joinErr) {
      // Don't fail the whole flow if server join fails
      console.error("[Discord] Server join failed:", joinErr);
    }

    // 5. Fire webhook alert (non-blocking)
    void (async () => {
      const webhookUrl = process.env.DISCORD_ALERT_WEBHOOK_URL;
      if (!webhookUrl) return;

      try {
        const dmUserId = process.env.DISCORD_ALERT_USER_ID;
        const dmMention = dmUserId ? `<@${dmUserId}>` : null;

        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(dmMention ? { content: dmMention } : {}),
            embeds: [
              {
                title: "New Discord Link",
                color: 0x57f287, // Discord green
                thumbnail: { url: avatarUrl },
                fields: [
                  {
                    name: "Username",
                    value: discordUser.username,
                    inline: true,
                  },
                  {
                    name: "Account Created",
                    value: `<t:${Math.floor(user.createdAt.getTime() / 1000)}:D>`,
                    inline: true,
                  },
                ],
                timestamp: new Date().toISOString(),
              },
            ],
          }),
        });
      } catch (webhookErr) {
        console.error("[Discord] Alert webhook failed:", webhookErr);
      }
    })();

    // 6. Set discord-linked cookie and redirect home
    const response = NextResponse.redirect(new URL("/", req.url));
    response.cookies.set("discord-linked", "1", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });

    return response;
  } catch (err) {
    console.error("[Discord OAuth]", err);
    return NextResponse.redirect(new URL("/account/link-discord?error=server", req.url));
  }
}