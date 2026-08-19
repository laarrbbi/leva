import { activeOrdersVersion, listActiveOrders } from '@/server/repositories/orders';
import { getSession } from '@/server/auth/session';
import type { Order } from '@/types/domain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const POLL_MS = 1500;
const HEARTBEAT_MS = 20_000;

/**
 * The counter tablet's live feed.
 *
 * Authenticated: this stream carries customer names, phone numbers and vehicle
 * descriptions, so it is gated by the same session check as every other admin
 * surface. An unauthenticated caller gets 401 and no hint that orders exist.
 *
 * The tablet is left on all day, so there is no lifetime cap here — unlike the
 * customer stream, an open connection is the desired steady state.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return new Response(null, { status: 401 });

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let lastVersion = '';
      let closed = false;

      const stop = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // The client is already gone.
        }
      };

      const tick = () => {
        if (closed) return;
        try {
          const version = activeOrdersVersion();
          if (version === lastVersion) return;
          lastVersion = version;

          const orders: Order[] = listActiveOrders();
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ orders })}\n\n`));
        } catch {
          stop();
        }
      };

      tick();
      timer = setInterval(tick, POLL_MS);
      heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(': keep-alive\n\n'));
      }, HEARTBEAT_MS);

      request.signal.addEventListener('abort', stop);
    },
    cancel() {
      clearInterval(timer);
      clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}
