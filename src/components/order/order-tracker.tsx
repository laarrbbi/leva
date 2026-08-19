'use client';

import { useEffect, useState } from 'react';

import { cn } from '@/lib/cn';
import { formatClock, formatMoney } from '@/lib/format';
import type { OrderStatus, OrderTracking } from '@/types/domain';

const STEPS: Array<{ status: OrderStatus; label: string }> = [
  { status: 'new', label: 'Recibido' },
  { status: 'preparing', label: 'En preparación' },
  { status: 'ready', label: '¡Vamos hacia tu coche!' },
];

const ORDER: OrderStatus[] = ['pending_payment', 'new', 'preparing', 'ready', 'delivered'];

const HEADLINE: Record<OrderStatus, { emoji: string; title: string; sub: (m: number) => string }> = {
  pending_payment: {
    emoji: '⏳',
    title: 'Esperando el pago',
    sub: () => 'En cuanto se confirme, empezamos.',
  },
  new: {
    emoji: '📝',
    title: 'Hemos recibido tu pedido',
    sub: (m) => `Unos ${m} minutos · quédate en tu coche`,
  },
  preparing: {
    emoji: '👨‍🍳',
    title: 'Preparando tu pedido',
    sub: (m) => `Unos ${m} minutos · quédate en tu coche`,
  },
  ready: {
    emoji: '🏃',
    title: '¡Vamos hacia tu coche!',
    sub: () => 'Salimos ahora mismo con tu bolsa.',
  },
  delivered: { emoji: '✅', title: 'Entregado', sub: () => '¡Gracias y hasta la próxima!' },
  cancelled: {
    emoji: '⚠️',
    title: 'Pedido cancelado',
    sub: () => 'Si no esperabas esto, pregunta en el mostrador.',
  },
};

/**
 * Live order tracking.
 *
 * This screen exists for one reason: it is what makes waiting in a car
 * tolerable. A customer who cannot see progress assumes they have been
 * forgotten and comes inside — which defeats the entire product.
 */
export function OrderTracker({ initial }: { initial: OrderTracking }) {
  const [order, setOrder] = useState(initial);

  useEffect(() => {
    // Finished orders never change again, so no connection is opened at all.
    if (initial.status === 'delivered' || initial.status === 'cancelled') return;

    const source = new EventSource(`/api/pedidos/${initial.publicToken}/stream`);

    source.onmessage = (event) => {
      try {
        setOrder(JSON.parse(event.data as string) as OrderTracking);
      } catch {
        // A malformed frame is not worth tearing the page down for; the next
        // tick carries the full state again.
      }
    };

    // EventSource reconnects on its own, so an error handler only needs to stop
    // retrying once the order is finished — which the server does by closing.
    return () => source.close();
  }, [initial.publicToken, initial.status]);

  const headline = HEADLINE[order.status];
  const currentIndex = ORDER.indexOf(order.status);
  const cancelled = order.status === 'cancelled';

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <span className="type-heading">Pedido #{order.dailyNumber}</span>
        {order.bay ? (
          <span className="rounded-pill bg-brand-soft px-3 py-1.5 text-[0.75rem] font-semibold uppercase tracking-[0.06em] text-brand">
            Plaza {order.bay}
          </span>
        ) : null}
      </div>

      <section
        className={cn(
          'rounded-card p-6 text-center ring-1',
          cancelled ? 'bg-critical-soft ring-critical/30' : 'bg-surface ring-line/60',
        )}
      >
        {/*
          `key` remounts the block on every status change so the enter animation
          replays — the movement is what tells a glancing customer that
          something happened, without them having to read.
        */}
        <div key={order.status} className="step-enter">
          <p aria-hidden className="text-4xl">
            {headline.emoji}
          </p>
          <h1 className="type-title mt-3 text-balance">{headline.title}</h1>
          <p className="type-body mt-1 text-pretty text-ink-muted">
            {headline.sub(order.prepMinutes)}
          </p>
        </div>
      </section>

      {!cancelled ? (
        <ol className="flex flex-col gap-0 rounded-card bg-surface p-4 ring-1 ring-line/60">
          {STEPS.map((step, index) => {
            const stepIndex = ORDER.indexOf(step.status);
            const done = currentIndex >= stepIndex;
            const at =
              step.status === 'new'
                ? order.createdAt
                : step.status === 'preparing'
                  ? order.acceptedAt
                  : order.readyAt;

            return (
              <li key={step.status} className="flex items-center gap-3 py-2.5">
                <span
                  aria-hidden
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.75rem] font-bold',
                    // Colour alone never carries the state: a tick appears too.
                    done ? 'bg-positive text-white' : 'bg-surface-sunken text-ink-subtle',
                    'transition-colors duration-pop ease-out-strong',
                  )}
                >
                  {done ? '✓' : index + 1}
                </span>
                <span className={cn('type-body flex-1', !done && 'text-ink-subtle')}>
                  {step.label}
                </span>
                <span className="type-caption type-numeric shrink-0">{formatClock(at)}</span>
              </li>
            );
          })}
        </ol>
      ) : null}

      <section className="flex items-center justify-between rounded-card bg-surface p-4 ring-1 ring-line/60">
        <div>
          <p className="type-caption font-medium">
            {order.paymentStatus === 'due' ? 'Pagas al recibirlo' : 'Pagado'}
          </p>
          <p className="type-caption text-ink-subtle">
            {order.paymentStatus === 'due' ? 'Con datáfono, en tu coche' : 'Nada que pagar'}
          </p>
        </div>
        <span className="type-numeric text-xl font-semibold">
          {formatMoney(order.totalCents, order.currency)}
        </span>
      </section>

      <p className="type-caption text-center text-pretty text-ink-subtle">
        Guarda esta página. Se actualiza sola mientras esperas.
      </p>
    </div>
  );
}
