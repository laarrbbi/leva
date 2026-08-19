'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { cn } from '@/lib/cn';
import { CSRF_FIELD } from '@/lib/constants';
import { formatMoney, formatWaiting } from '@/lib/format';
import { IDLE } from '@/server/actions/types';
import {
  markPaidAction,
  setAcceptingOrdersAction,
  transitionOrderAction,
} from '@/server/actions/order-actions';
import type { Order, OrderStatus } from '@/types/domain';

const COLUMNS: Array<{
  status: Extract<OrderStatus, 'new' | 'preparing' | 'ready'>;
  title: string;
  next: OrderStatus;
  cta: string;
}> = [
  { status: 'new', title: 'Nuevos', next: 'preparing', cta: 'Aceptar → preparación' },
  { status: 'preparing', title: 'En preparación', next: 'ready', cta: 'Listo → salgo al coche' },
  { status: 'ready', title: 'Para entregar', next: 'delivered', cta: 'Entregado ✓' },
];

/**
 * The kitchen display, modelled on hospitality KDS screens: columns by state,
 * big cards, one tap to advance.
 *
 * It runs on a tablet that nobody is looking at most of the time, so a new
 * order has to announce itself — the bell below is not decoration, it is the
 * entire notification system.
 */
export function OrderBoard({
  initialOrders,
  acceptingOrders,
  currency,
  csrfToken,
}: {
  initialOrders: Order[];
  acceptingOrders: boolean;
  currency: string;
  csrfToken: string;
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [connected, setConnected] = useState(true);
  const [soundOn, setSoundOn] = useState(true);

  // Track which ids we have already announced, so a reconnect (which re-sends
  // the whole board) does not ring the bell for every order in the queue.
  const seen = useRef(new Set(initialOrders.map((order) => order.id)));
  const ready = useRef(false);

  useEffect(() => {
    const source = new EventSource('/api/panel/pedidos/stream');

    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);

    source.onmessage = (event) => {
      try {
        const { orders: next } = JSON.parse(event.data as string) as { orders: Order[] };
        const fresh = next.filter((order) => !seen.current.has(order.id));
        for (const order of next) seen.current.add(order.id);

        // Skip the very first frame: it is the state that was already on screen.
        if (ready.current && fresh.length > 0) ring();
        ready.current = true;

        setOrders(next);
        setConnected(true);
      } catch {
        // Malformed frame; the next tick carries the whole board again.
      }
    };

    return () => source.close();
  }, []);

  const ring = () => {
    if (!soundOn) return;
    playBell();
  };

  const byStatus = (status: OrderStatus) => orders.filter((order) => order.status === status);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cn(
            'inline-flex items-center gap-2 rounded-pill px-3 py-1.5 text-[0.8125rem] font-semibold',
            acceptingOrders ? 'bg-positive-soft text-positive' : 'bg-caution-soft text-caution',
          )}
        >
          <span
            aria-hidden
            className={cn(
              'h-2 w-2 rounded-full',
              acceptingOrders ? 'bg-positive' : 'bg-caution',
            )}
          />
          {acceptingOrders ? 'Abierto' : 'Pedidos en pausa'}
        </span>

        <PauseForm csrfToken={csrfToken} accepting={acceptingOrders} />

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => {
            const next = !soundOn;
            setSoundOn(next);
            // Play on enable: this doubles as the browser gesture that unlocks
            // audio, so the first real order is actually audible.
            if (next) playBell();
          }}
          className="pressable rounded-pill bg-surface px-3 py-1.5 text-[0.8125rem] font-medium ring-1 ring-line"
        >
          {soundOn ? '🔔 Sonido activado' : '🔕 Sonido apagado'}
        </button>

        {!connected ? (
          <span className="type-caption rounded-pill bg-critical-soft px-3 py-1.5 font-semibold text-critical">
            Sin conexión — reconectando
          </span>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((column) => {
          const cards = byStatus(column.status);
          return (
            <section key={column.status} className="flex flex-col gap-3">
              <h2 className="type-heading flex items-baseline gap-2">
                {column.title}
                <span className="type-numeric text-ink-subtle">{cards.length}</span>
              </h2>

              {cards.length === 0 ? (
                <p className="type-caption rounded-card border border-dashed border-line px-4 py-8 text-center">
                  Nada por ahora
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {cards.map((order) => (
                    <li key={order.id}>
                      <OrderCard
                        order={order}
                        nextStatus={column.next}
                        cta={column.cta}
                        currency={currency}
                        csrfToken={csrfToken}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function OrderCard({
  order,
  nextStatus,
  cta,
  currency,
  csrfToken,
}: {
  order: Order;
  nextStatus: OrderStatus;
  cta: string;
  currency: string;
  csrfToken: string;
}) {
  const owes = order.paymentStatus === 'due';

  return (
    <article className="flex flex-col gap-3 rounded-card bg-surface p-4 shadow-[var(--shadow-card)] ring-1 ring-line/60">
      <header className="flex items-start justify-between gap-2">
        <div>
          <p className="type-heading">
            #{order.dailyNumber}
            {order.bay ? <span className="text-ink-muted"> · Plaza {order.bay}</span> : null}
          </p>
          <p className="type-caption">
            {order.vehicle} · {order.customerName} · {formatWaiting(order.createdAt)}
          </p>
        </div>

        {/*
          The single most important pixel on this screen: amber means walk out
          with the card reader, green means the bag is all they need.
        */}
        <span
          className={cn(
            'shrink-0 rounded-pill px-2.5 py-1 text-[0.6875rem] font-bold uppercase tracking-[0.06em]',
            owes ? 'bg-caution-soft text-caution' : 'bg-positive-soft text-positive',
          )}
        >
          {owes ? `Cobrar ${formatMoney(order.totalCents, currency)}` : 'Pagado'}
        </span>
      </header>

      <ul className="flex flex-col gap-1">
        {order.items.map((item) => (
          <li key={item.id} className="type-body">
            <span className="type-numeric font-semibold">{item.quantity} ×</span> {item.name}
          </li>
        ))}
      </ul>

      {order.notes ? (
        <p className="type-caption rounded-field bg-surface-sunken px-3 py-2">{order.notes}</p>
      ) : null}

      <div className="flex flex-col gap-2">
        {/* Collection is its own button so the bag and the money never get confused. */}
        {owes && order.status === 'ready' ? (
          <ActionForm action={markPaidAction} csrfToken={csrfToken}>
            <input type="hidden" name="orderId" value={order.id} />
            <BoardButton tone="caution">
              Cobrado {formatMoney(order.totalCents, currency)}
            </BoardButton>
          </ActionForm>
        ) : null}

        <ActionForm action={transitionOrderAction} csrfToken={csrfToken}>
          <input type="hidden" name="orderId" value={order.id} />
          <input type="hidden" name="from" value={order.status} />
          <input type="hidden" name="to" value={nextStatus} />
          <BoardButton tone="primary">{cta}</BoardButton>
        </ActionForm>

        <ActionForm action={transitionOrderAction} csrfToken={csrfToken}>
          <input type="hidden" name="orderId" value={order.id} />
          <input type="hidden" name="from" value={order.status} />
          <input type="hidden" name="to" value="cancelled" />
          <CancelButton dailyNumber={order.dailyNumber} />
        </ActionForm>
      </div>
    </article>
  );
}

function ActionForm({
  action,
  csrfToken,
  children,
}: {
  action: (state: typeof IDLE, formData: FormData) => Promise<typeof IDLE>;
  csrfToken: string;
  children: React.ReactNode;
}) {
  const [, formAction] = useActionState(action, IDLE);
  return (
    <form action={formAction}>
      <input type="hidden" name={CSRF_FIELD} value={csrfToken} />
      {children}
    </form>
  );
}

/** Board buttons are deliberately tall: they are pressed with flour on a finger. */
function BoardButton({
  tone,
  children,
}: {
  tone: 'primary' | 'caution';
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        'pressable h-12 w-full rounded-field text-[0.9375rem] font-semibold',
        'transition-[background-color,transform] duration-press ease-out-strong',
        'disabled:opacity-50',
        tone === 'primary' ? 'bg-brand text-white' : 'bg-caution-soft text-caution',
      )}
    >
      {pending ? 'Un momento…' : children}
    </button>
  );
}

function CancelButton({ dailyNumber }: { dailyNumber: number }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(event) => {
        // Cancelling is irreversible and loses a paying customer — one of the
        // few places a confirmation genuinely earns its interruption.
        if (!window.confirm(`¿Cancelar el pedido #${dailyNumber}?`)) event.preventDefault();
      }}
      className="pressable h-9 w-full rounded-field text-[0.8125rem] font-medium text-ink-subtle transition-colors duration-hover ease-out-strong hover:bg-critical-soft hover:text-critical"
    >
      Cancelar pedido
    </button>
  );
}

function PauseForm({ csrfToken, accepting }: { csrfToken: string; accepting: boolean }) {
  const [, formAction] = useActionState(setAcceptingOrdersAction, IDLE);

  return (
    <form action={formAction}>
      <input type="hidden" name={CSRF_FIELD} value={csrfToken} />
      <input type="hidden" name="accepting" value={accepting ? 'false' : 'true'} />
      <button
        type="submit"
        className="pressable rounded-pill bg-surface px-3 py-1.5 text-[0.8125rem] font-medium ring-1 ring-line"
      >
        {accepting ? 'Pausar pedidos' : 'Reanudar pedidos'}
      </button>
    </form>
  );
}

/**
 * The bell.
 *
 * Synthesised with the Web Audio API rather than shipped as an audio file: no
 * asset to load, nothing for the CSP to allow, and it works the instant the
 * tablet has been touched once. Two short tones, because one is easy to miss
 * across a bakery.
 */
function playBell(): void {
  try {
    const AudioCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;

    const ctx = new AudioCtor();
    const now = ctx.currentTime;

    for (const [index, frequency] of [880, 1320].entries()) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + index * 0.18;

      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;

      // A quick attack and an exponential tail reads as a chime; a flat
      // envelope reads as an alarm, which is not what a bakery wants all day.
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);

      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.4);
    }

    setTimeout(() => void ctx.close(), 1200);
  } catch {
    // Audio is a nicety; the board still works in silence.
  }
}
