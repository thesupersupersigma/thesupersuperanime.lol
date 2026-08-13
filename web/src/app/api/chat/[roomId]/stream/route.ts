import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { CHAT_USER_SELECT, isValidRoomId } from "@/lib/chat";
import { errorInfo } from "@/lib/log-error";

export const dynamic = "force-dynamic";

// Cap concurrent SSE connections so unbounded DB-polling streams can't be used
// to exhaust connections/DB load. New connections past the cap get a 503.
const MAX_CONNECTIONS = 300;
let activeConnections = 0;

// SSE stream for a chat room. Sends the last 50 messages on connect, then
// polls every 1.5s and pushes only NEW messages (delta) to keep it lean.
// Public, no auth (modeled on /api/announcement/stream + watch-party stream).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  if (!isValidRoomId(roomId)) {
    return new Response("Invalid room", { status: 400 });
  }

  if (activeConnections >= MAX_CONNECTIONS) {
    return new Response("Too many connections", { status: 503 });
  }
  activeConnections++;

  let closed = false;
  const timers: ReturnType<typeof setInterval>[] = [];

  // Decrement at most once, whether we close via cancel() or an internal error.
  const release = () => {
    if (closed) return;
    closed = true;
    activeConnections--;
  };

  /**
   * Stop polling AND end the stream. Previously the poll's catch only did
   * `clearInterval(interval)`: the connection stayed open and the 25s keepalive
   * kept firing, so EventSource never saw an error and never reconnected — the
   * client sat on a healthy-looking socket that would never deliver another
   * message. Ending the stream is what lets the browser reconnect.
   */
  const shutdown = (controller: ReadableStreamDefaultController, err?: unknown) => {
    if (closed) return;
    for (const t of timers) clearInterval(t);
    release();
    try {
      if (err) controller.error(err);
      else controller.close();
    } catch {
      // Already errored/closed by the runtime — nothing to do.
    }
  };

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
        } catch {}
      };

      try {
        // Newest message timestamp we've already delivered. Initialized to now
        // so the poll never re-sends the initial backlog below.
        let lastSeenAt = new Date();

        // Send the last 50 messages immediately, in chronological order.
        // This sat outside any try: a throw here errors the stream WITHOUT
        // invoking cancel(), so release() never ran and the slot leaked. A few
        // clients reconnecting through a DB blip could pin all 300 until redeploy.
        const recent = await db.chatMessage.findMany({
          where: { roomId, deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 50,
          include: { user: { select: CHAT_USER_SELECT } },
        });
        send({ type: "messages", messages: recent.reverse() });

        // Poll for messages newer than lastSeenAt and push only the delta.
        const interval = setInterval(async () => {
          if (closed) { clearInterval(interval); return; }
          try {
            const fresh = await db.chatMessage.findMany({
              where: { roomId, deletedAt: null, createdAt: { gt: lastSeenAt } },
              orderBy: { createdAt: "asc" },
              include: { user: { select: CHAT_USER_SELECT } },
            });
            if (fresh.length > 0) {
              lastSeenAt = fresh[fresh.length - 1].createdAt;
              send({ type: "messages", messages: fresh });
            }
          } catch (err) {
            console.error("[sse] poll failed, terminating stream", {
              route: "/api/chat/[roomId]/stream",
              roomId,
              ...errorInfo(err),
            });
            shutdown(controller, err);
          }
        }, 1500);
        timers.push(interval);

        // Keepalive ping every 25 seconds to prevent connection timeout.
        const ping = setInterval(() => {
          if (closed) { clearInterval(ping); return; }
          send({ type: "ping" });
        }, 25_000);
        timers.push(ping);
      } catch (err) {
        console.error("[sse/chat] start() failed, releasing slot", {
          roomId,
          active: activeConnections,
          ...errorInfo(err),
        });
        shutdown(controller, err);
      }
    },
    cancel() {
      for (const t of timers) clearInterval(t);
      release();
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
