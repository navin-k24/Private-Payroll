export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();
  let cleanupStream: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      let timeout: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        if (heartbeat) clearInterval(heartbeat);
        if (timeout) clearTimeout(timeout);
        heartbeat = null;
        timeout = null;
        controller.close();
      };
      cleanupStream = cleanup;

      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
      }, 15000);
      timeout = setTimeout(cleanup, 30000);
    },
    cancel() {
      cleanupStream?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
