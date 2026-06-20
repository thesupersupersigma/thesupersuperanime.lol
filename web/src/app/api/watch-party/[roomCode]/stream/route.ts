import { NextRequest } from "next/server";
import { getWatchParty } from "@/lib/watch-party";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> },
) {
  const { roomCode } = await params;
  const code = roomCode.toUpperCase();

  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
        } catch {}
      };

      const buildState = (party: NonNullable<Awaited<ReturnType<typeof getWatchParty>>>) => ({
        roomCode: party.roomCode,
        animeId: party.animeId,
        episodeNum: party.episodeNum,
        hostTimestamp: party.hostTimestamp,
        isPlaying: party.isPlaying,
        audioType: party.audioType,
        hostId: party.hostId,
      });

      // Send current state immediately on connect.
      const initial = await getWatchParty(code);
      if (!initial) {
        send({ error: "expired" });
        closed = true;
        try { controller.close(); } catch {}
        return;
      }
      send(buildState(initial));
      let lastUpdatedAt = initial.updatedAt.getTime();

      // Poll DB every 500ms and push changes (matches the host's push rate).
      const interval = setInterval(async () => {
        if (closed) { clearInterval(interval); return; }
        try {
          const party = await getWatchParty(code);
          if (!party) {
            send({ error: "expired" });
            closed = true;
            clearInterval(interval);
            try { controller.close(); } catch {}
            return;
          }
          const updatedAt = party.updatedAt.getTime();
          if (updatedAt !== lastUpdatedAt) {
            lastUpdatedAt = updatedAt;
            send(buildState(party));
          }
        } catch {
          clearInterval(interval);
        }
      }, 500);

      // Keepalive ping every 25 seconds to prevent connection timeout.
      const ping = setInterval(() => {
        if (closed) { clearInterval(ping); return; }
        try { controller.enqueue(": ping\n\n"); } catch {}
      }, 25_000);
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
