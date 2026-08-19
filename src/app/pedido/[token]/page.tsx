import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { OrderTracker } from '@/components/order/order-tracker';
import { findOrderByToken } from '@/server/repositories/orders';
import { getSettings } from '@/server/repositories/settings';

export const dynamic = 'force-dynamic';

/**
 * The tracking URL is the customer's whole "account", so it must never be
 * indexed, previewed, or handed to a referrer.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function TrackOrderPage({ params }: PageProps) {
  const { token } = await params;

  // Shape-check before touching the database: a token is 24 random bytes
  // base64url-encoded, so anything else is a probe, not a customer.
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) notFound();

  const order = findOrderByToken(token);
  if (!order) notFound();

  const settings = getSettings();

  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 py-6">
      <header className="text-center">
        <p className="type-caption font-semibold uppercase tracking-[0.1em] text-ink-subtle">
          {settings.storeName}
        </p>
      </header>

      <OrderTracker
        initial={{
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
          prepMinutes: settings.pickupPrepMinutes,
        }}
      />

      <section className="rounded-card bg-surface p-4 ring-1 ring-line/60">
        <h2 className="type-caption font-semibold uppercase tracking-[0.06em] text-ink-subtle">
          Tu pedido
        </h2>
        <ul className="mt-2 flex flex-col divide-y divide-line/60">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-baseline justify-between gap-3 py-2">
              <span className="type-body">
                <span className="type-numeric font-semibold">{item.quantity}×</span> {item.name}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
