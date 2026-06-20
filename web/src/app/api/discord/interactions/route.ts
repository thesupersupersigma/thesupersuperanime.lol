import { NextRequest } from "next/server";
import nacl from "tweetnacl";
import { createWatchParty } from "@/lib/watch-party";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Discord interaction types
const PING = 1;
const APPLICATION_COMMAND = 2;
// Discord response types
const PONG = 1;
const CHANNEL_MESSAGE_WITH_SOURCE = 4;

export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-signature-ed25519") ?? "";
  const timestamp = req.headers.get("x-signature-timestamp") ?? "";
  const body = await req.text();

  // ── Signature verification (Discord rejects unverified endpoints) ─────────
  const publicKey = process.env.DISCORD_PUBLIC_KEY ?? "";
  let isValid = false;
  try {
    isValid = nacl.sign.detached.verify(
      Buffer.from(timestamp + body),
      Buffer.from(signature, "hex"),
      Buffer.from(publicKey, "hex"),
    );
  } catch {
    isValid = false;
  }
  if (!isValid) {
    console.log("[discord-interactions] invalid signature");
    return new Response("Invalid signature", { status: 401 });
  }

  const payload = JSON.parse(body);

  // ── PING — required for endpoint verification ─────────────────────────────
  if (payload.type === PING) {
    return Response.json({ type: PONG });
  }

  // ── Slash command ─────────────────────────────────────────────────────────
  if (payload.type === APPLICATION_COMMAND && payload.data?.name === "watchparty") {
    const options: { name: string; value: number }[] = payload.data.options ?? [];
    const animeId = Number(options.find(o => o.name === "anime_id")?.value);
    const episodeNum = Number(options.find(o => o.name === "episode")?.value);

    if (!Number.isFinite(animeId) || !Number.isFinite(episodeNum)) {
      return Response.json({
        type: CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: "Please provide a valid anime ID and episode number." },
      });
    }

    // If the Discord user who ran the command has linked their site account,
    // make them the host so they're recognized when they open the join link.
    // (payload.member.user.id in a guild, payload.user.id in a DM.)
    const discordUserId = payload.member?.user?.id ?? payload.user?.id ?? null;
    let hostId: string | undefined;
    if (discordUserId) {
      const siteUser = await db.user.findFirst({
        where: { discordId: discordUserId },
        select: { id: true },
      });
      hostId = siteUser?.id ?? undefined;
      console.log(`[discord-interactions] discord user ${discordUserId} → host ${hostId ?? "(unlinked)"}`);
    }

    const room = await createWatchParty(animeId, episodeNum, hostId);
    const joinUrl = `https://www.thesupersuperanime.lol/watch/${animeId}/${episodeNum}?party=${room.roomCode}`;
    console.log(`[discord-interactions] created watch party ${room.roomCode} for ${animeId}/${episodeNum}`);

    return Response.json({
      type: CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: `🎬 Watch party created!\n\n**Room:** \`${room.roomCode}\`\n**Join:** ${joinUrl}\n\nRoom expires in 6 hours.`,
      },
    });
  }

  return Response.json({
    type: CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content: "Unknown command." },
  });
}
