import { NextResponse } from 'next/server';

import { env } from '@/lib/env';
import { getClientIp, isSameOrigin } from '@/server/security/request';
import { placeOrder } from '@/server/services/order-service';
import { orderInputSchema } from '@/server/validation/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** An order with forty lines and a note is comfortably under this. */
const MAX_BODY_BYTES = 16 * 1024;

/**
 * Creates an order.
 *
 * The request may name products and quantities. It may not name prices — the
 * total in the response and in the database is computed from the products
 * table, so a modified client can change what it orders but never what it owes.
 *
 * The response carries only the tracking URL. Nothing about other orders, the
 * queue length, or the shop's takings crosses back to a customer's phone.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!(await isSameOrigin())) {
    return NextResponse.json({ message: 'Petición rechazada.' }, { status: 403 });
  }

  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ message: 'El pedido es demasiado largo.' }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ message: 'Petición rechazada.' }, { status: 400 });
  }

  const parsed = orderInputSchema.safeParse(payload);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { message: first?.message ?? 'Revisa los datos del pedido.' },
      { status: 400 },
    );
  }

  const result = placeOrder({ data: parsed.data, ip: await getClientIp() });

  if (!result.ok) {
    switch (result.reason) {
      case 'rate_limited':
        return NextResponse.json(
          { message: 'Demasiados pedidos desde esta conexión. Inténtalo en unos minutos.' },
          { status: 429, headers: { 'retry-after': '600' } },
        );
      case 'closed':
        return NextResponse.json(
          { message: 'Ahora mismo no estamos aceptando pedidos.' },
          { status: 409 },
        );
      case 'unavailable':
        return NextResponse.json(
          {
            message: `Se ha agotado: ${(result.unavailable ?? []).join(', ')}. Quítalo del pedido y vuelve a enviarlo.`,
          },
          { status: 409 },
        );
      case 'payment_unavailable':
        return NextResponse.json(
          { message: 'El pago con tarjeta todavía no está disponible.' },
          { status: 409 },
        );
      default:
        return NextResponse.json({ message: 'Petición rechazada.' }, { status: 400 });
    }
  }

  const trackingUrl = new URL(`/pedido/${result.order.publicToken}`, env.APP_ORIGIN).toString();

  return NextResponse.json(
    {
      trackingUrl,
      dailyNumber: result.order.dailyNumber,
      totalCents: result.order.totalCents,
    },
    { status: 201 },
  );
}
