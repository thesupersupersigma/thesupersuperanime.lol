import { db } from "@/lib/db";
import { errorInfo } from "@/lib/log-error";

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
  const timers: ReturnType<typeof setInterval>[] = [];

  // Decrement at most once, whether we close via cancel() or an internal error.
  const release = () => {
    if (closed) return;
    closed = true;
    activeConnections--;
  };

  /**
   * Stop polling AND end the stream. The old poll catch only cleared the
   * interval: the socket stayed open and the keepalive kept firing, so
   * EventSource never errored and never reconnected.
   */
  const shutdown = (controller: ReadableStreamDefaultController, err?: unknown) => {
    if (closed) return;
    for (const t of timers) clearInterval(t);
    release();
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

      try {
        // Send current announcement immediately on connect. This sat outside
        // any try: a throw errored the stream without invoking cancel(), so the
        // slot leaked toward MAX_CONNECTIONS and stayed leaked until redeploy.
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
          } catch (err) {
            console.error("[sse] poll failed, terminating stream", {
              route: "/api/announcement/stream",
              ...errorInfo(err),
            });
            shutdown(controller, err);
          }
        }, 10_000);
        timers.push(interval);

        // Keepalive ping every 25 seconds to prevent connection timeout
        const ping = setInterval(() => {
          if (closed) { clearInterval(ping); return; }
          try { controller.enqueue(": ping\n\n"); } catch {}
        }, 25_000);
        timers.push(ping);
      } catch (err) {
        console.error("[sse/announcement] start() failed, releasing slot", {
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
