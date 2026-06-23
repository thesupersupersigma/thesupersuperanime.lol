import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Cap concurrent SSE connections so unbounded DB-polling streams can't be used
// to exhaust connections/DB load. New connections past the cap get a 503.
const MAX_CONNECTIONS = 300;
let activeConnections = 0;

export async function GET() {
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

      // Send current announcement immediately on connect
      const current = await db.announcement.findFirst({
        where: { active: true },
        orderBy: { createdAt: "desc" },
      });
      send({ announcement: current ?? null });

      // Poll DB every 10 seconds and push changes
      const interval = setInterval(async () => {
        if (closed) { clearInterval(interval); return; }
        try {
          const announcement = await db.announcement.findFirst({
            where: { active: true },
            orderBy: { createdAt: "desc" },
          });
          send({ announcement: announcement ?? null });
        } catch {
          clearInterval(interval);
        }
      }, 10_000);

      // Keepalive ping every 25 seconds to prevent connection timeout
      const ping = setInterval(() => {
        if (closed) { clearInterval(ping); return; }
        try { controller.enqueue(": ping\n\n"); } catch {}
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
