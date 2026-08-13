import { NextRequest } from "next/server";
import { getWatchParty } from "@/lib/watch-party";
import { errorInfo } from "@/lib/log-error";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> },
) {
  const { roomCode } = await params;
  const code = roomCode.toUpperCase();

  let closed = false;
  const timers: ReturnType<typeof setInterval>[] = [];

  /**
   * Stop polling AND end the stream. The old poll catch only cleared the
   * interval, leaving the socket open with the keepalive still firing — a guest
   * silently stopped receiving host updates while the UI kept showing the green
   * "Syncing" dot, and EventSource never reconnected because it never errored.
   */
  const shutdown = (controller: ReadableStreamDefaultController, err?: unknown) => {
    if (closed) return;
    closed = true;
    for (const t of timers) clearInterval(t);
    try {
      if (err) controller.error(err);
      else controller.close();
    } catch {}
  };

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

      try {
        // Send current state immediately on connect. Previously unguarded: a DB
        // error here errored the stream without ever running cancel().
        const initial = await getWatchParty(code);
        if (!initial) {
          send({ error: "expired" });
          shutdown(controller);
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
              shutdown(controller);
              return;
            }
            const updatedAt = party.updatedAt.getTime();
            if (updatedAt !== lastUpdatedAt) {
              lastUpdatedAt = updatedAt;
              send(buildState(party));
            }
          } catch (err) {
            console.error("[sse] poll failed, terminating stream", {
              route: "/api/watch-party/[roomCode]/stream",
              roomCode: code,
              ...errorInfo(err),
            });
            shutdown(controller, err);
          }
        }, 500);
        timers.push(interval);

        // Keepalive ping every 25 seconds to prevent connection timeout.
        const ping = setInterval(() => {
          if (closed) { clearInterval(ping); return; }
          try { controller.enqueue(": ping\n\n"); } catch {}
        }, 25_000);
        timers.push(ping);
      } catch (err) {
        console.error("[sse/watch-party] start() failed", {
          roomCode: code,
          ...errorInfo(err),
        });
        shutdown(controller, err);
      }
    },
    cancel() {
      closed = true;
      for (const t of timers) clearInterval(t);
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
