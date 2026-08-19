import { findOrderByToken, orderVersion } from '@/server/repositories/orders';
import { getSettings } from '@/server/repositories/settings';
import { hashIp } from '@/server/security/hash';
import { ANONYMOUS_BUCKET, RULES, consume } from '@/server/security/rate-limit';
import { getClientIp } from '@/server/security/request';
import type { OrderTracking } from '@/types/domain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** How often the server re-reads the order. */
const POLL_MS = 2000;
/** A comment line every 20 s keeps proxies from closing an idle stream. */
const HEARTBEAT_MS = 20_000;
/** Streams are cheap but not free; a phone left on a dashboard should not hold one all day. */
const MAX_LIFETIME_MS = 30 * 60_000;

/**
 * Live order status for the customer.
 *
 * Server-Sent Events rather than polling from the browser: the page is open on
 * a phone in a car, often on mobile data, and one held connection costs far
 * less battery and signal than a request every two seconds. SSE also
 * reconnects on its own, which `fetch` polling has to reimplement.
 *
 * The server polls SQLite and pushes only when something actually changed —
 * `orderVersion()` is a cheap fingerprint, so an idle order costs one tiny
 * query per tick and no traffic at all.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await context.params;

  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) {
    return new Response(null, { status: 404 });
  }

  const ipHash = hashIp(await getClientIp());
  if (!consume(RULES.orderTracking, ipHash ?? ANONYMOUS_BUCKET).allowed) {
    return new Response(null, { status: 429 });
  }

  if (!findOrderByToken(token)) {
    return new Response(null, { status: 404 });
  }

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let lifetime: ReturnType<typeof setTimeout> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let lastVersion = '';
      let closed = false;

      const stop = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        clearInterval(heartbeat);
        clearTimeout(lifetime);
        try {
          controller.close();
        } catch {
          // Already closed by the client disconnecting; nothing to do.
        }
      };

      const send = (payload: OrderTracking) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      const tick = () => {
        if (closed) return;
        try {
          const version = orderVersion(token);
          if (version === lastVersion) return;
          lastVersion = version;

          const order = findOrderByToken(token);
          if (!order) return stop();

          send(toTracking(order));

          // A delivered or cancelled order will never change again; holding the
          // connection open after that is pure waste.
          if (order.status === 'delivered' || order.status === 'cancelled') stop();
        } catch {
          stop();
        }
      };

      tick();
      timer = setInterval(tick, POLL_MS);
      heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(': keep-alive\n\n'));
      }, HEARTBEAT_MS);
      lifetime = setTimeout(stop, MAX_LIFETIME_MS);

      request.signal.addEventListener('abort', stop);
    },
    cancel() {
      clearInterval(timer);
      clearInterval(heartbeat);
      clearTimeout(lifetime);
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      connection: 'keep-alive',
      // Tells nginx not to buffer the stream into uselessness.
      'x-accel-buffering': 'no',
    },
  });
}

/** Strips the order down to what the customer's page needs, and no more. */
function toTracking(order: NonNullable<ReturnType<typeof findOrderByToken>>): OrderTracking {
  return {
    publicToken: order.publicToken,
    dailyNumber: order.dailyNumber,
    status: order.status,
    bay: order.bay,
    totalCents: order.totalCents,
    currency: order.currency,
    paymentStatus: order.paymentStatus,
    createdAt: order.createdAt,
    acceptedAt: order.acceptedAt,
    readyAt: order.readyAt,
    deliveredAt: order.deliveredAt,
    prepMinutes: getSettings().pickupPrepMinutes,
  };
}
