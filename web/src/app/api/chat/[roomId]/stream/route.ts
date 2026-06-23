import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { CHAT_USER_SELECT, isValidRoomId } from "@/lib/chat";

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
  // Decrement at most once, whether we close via cancel() or an internal error.
  const release = () => {
    if (closed) return;
    closed = true;
    activeConnections--;
  };

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
        } catch {}
      };

      // Newest message timestamp we've already delivered. Initialized to now
      // so the poll never re-sends the initial backlog below.
      let lastSeenAt = new Date();

      // Send the last 50 messages immediately, in chronological order.
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
        } catch {
          clearInterval(interval);
        }
      }, 1500);

      // Keepalive ping every 25 seconds to prevent connection timeout.
      const ping = setInterval(() => {
        if (closed) { clearInterval(ping); return; }
        send({ type: "ping" });
      }, 25_000);
    },
    cancel() {
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
