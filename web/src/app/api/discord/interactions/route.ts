import { NextRequest } from "next/server";
import nacl from "tweetnacl";
import { createWatchParty, getWatchParty } from "@/lib/watch-party";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Discord interaction types
const PING = 1;
const APPLICATION_COMMAND = 2;
const MESSAGE_COMPONENT = 3;
const MODAL_SUBMIT = 5;
// Discord response types
const PONG = 1;
const CHANNEL_MESSAGE_WITH_SOURCE = 4;
const MODAL = 9;
// Ephemeral message flag — only the invoking user sees the response.
const EPHEMERAL = 64;

const SITE = "https://www.thesupersuperanime.lol";

/** Ephemeral text response (only visible to the user who ran the command). */
function ephemeral(content: string) {
  return Response.json({
    type: CHANNEL_MESSAGE_WITH_SOURCE,
    data: { flags: EPHEMERAL, content },
  });
}

interface AnilistMedia {
  id: number;
  title: { romaji?: string | null; english?: string | null };
  episodes: number | null;
  status: string | null;
  seasonYear: number | null;
}

/** Search AniList for the top 5 anime matching `search`. */
async function searchAnilist(search: string): Promise<AnilistMedia[]> {
  const query = `
    query ($search: String) {
      Page(perPage: 5) {
        media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
          id
          title { romaji english }
          episodes
          status
          seasonYear
        }
      }
    }`;
  try {
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, variables: { search } }),
    });
    if (!res.ok) {
      console.log(`[discord-interactions] AniList search failed: ${res.status}`);
      return [];
    }
    const json = await res.json();
    return json?.data?.Page?.media ?? [];
  } catch (err) {
    console.log("[discord-interactions] AniList search error:", err);
    return [];
  }
}

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

  // ── Slash commands ─────────────────────────────────────────────────────────
  if (payload.type === APPLICATION_COMMAND) {
    const options: { name: string; value: string }[] = payload.data?.options ?? [];

    // /watchparty anime:<name> → search AniList and show a select menu.
    if (payload.data?.name === "watchparty") {
      const search = String(options.find(o => o.name === "anime")?.value ?? "").trim();
      if (!search) {
        return ephemeral("Please provide an anime name to search for.");
      }

      console.log(`[discord-interactions] /watchparty search "${search}"`);
      const results = await searchAnilist(search);
      if (results.length === 0) {
        return ephemeral(`No anime found for **${search}**. Try a different name.`);
      }

      const selectOptions = results.map(m => {
        const label = (m.title.english ?? m.title.romaji ?? `Anime ${m.id}`).slice(0, 100);
        const epPart = m.episodes ? `${m.episodes} episodes` : "Ongoing";
        const description = (m.seasonYear ? `${m.seasonYear} · ${epPart}` : epPart).slice(0, 100);
        return { label, value: String(m.id), description };
      });

      return Response.json({
        type: CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          flags: EPHEMERAL,
          content: "Select an anime:",
          components: [
            {
              type: 1, // ACTION_ROW
              components: [
                {
                  type: 3, // STRING_SELECT
                  custom_id: "watchparty_anime_select",
                  placeholder: "Choose an anime...",
                  options: selectOptions,
                },
              ],
            },
          ],
        },
      });
    }

    // /watchparty-join code:<code|link> → resolve and return the join link.
    if (payload.data?.name === "watchparty-join") {
      const raw = String(options.find(o => o.name === "code")?.value ?? "").trim();
      let roomCode = raw;
      if (roomCode.includes("party=")) {
        const match = roomCode.match(/party=([^&\s]+)/);
        if (match) roomCode = match[1];
      }
      roomCode = roomCode.toUpperCase().trim();

      console.log(`[discord-interactions] /watchparty-join "${raw}" → code ${roomCode}`);
      const room = await getWatchParty(roomCode);
      if (!room) {
        return ephemeral(`Room \`${roomCode}\` not found or has expired.`);
      }

      const joinUrl = `${SITE}/watch/${room.animeId}/${room.episodeNum}?party=${room.roomCode}`;
      return ephemeral(
        `🎬 **Watch Party Room ${room.roomCode}**\n**Join:** ${joinUrl}`,
      );
    }
  }

  // ── Anime selected → show the episode-number modal ─────────────────────────
  if (payload.type === MESSAGE_COMPONENT && payload.data?.custom_id === "watchparty_anime_select") {
    const animeId = payload.data.values?.[0];
    console.log(`[discord-interactions] anime selected: ${animeId}`);
    return Response.json({
      type: MODAL,
      data: {
        custom_id: `watchparty_episode_modal_${animeId}`,
        title: "Enter Episode Number",
        components: [
          {
            type: 1, // ACTION_ROW
            components: [
              {
                type: 4, // TEXT_INPUT
                custom_id: "episode_number",
                label: "Episode number",
                style: 1, // SHORT
                min_length: 1,
                max_length: 4,
                placeholder: "e.g. 1",
                required: true,
              },
            ],
          },
        ],
      },
    });
  }

  // ── Modal submitted → create the watch party ───────────────────────────────
  if (
    payload.type === MODAL_SUBMIT &&
    typeof payload.data?.custom_id === "string" &&
    payload.data.custom_id.startsWith("watchparty_episode_modal_")
  ) {
    const animeId = Number(payload.data.custom_id.replace("watchparty_episode_modal_", ""));
    const episodeRaw = payload.data.components?.[0]?.components?.[0]?.value;
    const episodeNum = Number(episodeRaw);

    if (!Number.isFinite(animeId) || !Number.isFinite(episodeNum) || episodeNum < 1) {
      return ephemeral("Please provide a valid episode number.");
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
    const joinUrl = `${SITE}/watch/${animeId}/${episodeNum}?party=${room.roomCode}`;
    console.log(`[discord-interactions] created watch party ${room.roomCode} for ${animeId}/${episodeNum}`);

    return ephemeral(
      `🎬 Watch party created!\n\n**Room:** \`${room.roomCode}\`\n**Join:** ${joinUrl}\n\nRoom expires in 6 hours.`,
    );
  }

  return ephemeral("Unknown command.");
}
