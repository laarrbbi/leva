import { notFound } from 'next/navigation';

import { OrderFlow } from '@/components/order/order-flow';
import { LIMITS } from '@/lib/constants';
import { getMenu } from '@/server/repositories/menu';
import { getSettings } from '@/server/repositories/settings';
import type { Source } from '@/types/domain';

/**
 * Shared shell for both ordering entry points (generic QR and per-bay QR).
 *
 * A server component: the menu, prices and availability are read here and sent
 * down as data. The browser never queries the database and never learns a price
 * it was not shown.
 */
export async function OrderPage({
  bay,
  searchParams,
}: {
  bay: string | null;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const settings = getSettings();

  // The module is a feature the owner turns on. Off means the route does not
  // exist, rather than a page explaining a feature they have not bought into.
  if (!settings.pickupEnabled) notFound();

  const rawSource = searchParams.s;
  const source: Source =
    rawSource === 'nfc' ? 'nfc' : rawSource === 'link' ? 'link' : 'qr';

  // Bays come off a printed poster, so they are display text — but they are
  // still attacker-supplied. Trim to a sane length and drop anything that is
  // not a plausible bay label before it reaches a screen or the database.
  const safeBay =
    bay && /^[\p{L}\p{N} .\-/]{1,24}$/u.test(bay) ? bay.slice(0, LIMITS.bayMaxLength) : null;

  const menu = getMenu();

  const pickup = {
    enabled: settings.pickupEnabled,
    name: settings.pickupName,
    tagline: settings.pickupTagline,
    acceptingOrders: settings.pickupAcceptingOrders,
    prepMinutes: settings.pickupPrepMinutes,
    bayCount: settings.pickupBayCount,
    currency: settings.pickupCurrency,
    closedMessage: settings.pickupClosedMessage,
  };

  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 py-6">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="type-caption font-semibold uppercase tracking-[0.1em] text-ink-subtle">
            {settings.storeName}
          </p>
          <h1 className="type-title mt-0.5 truncate">{pickup.name}</h1>
        </div>

        {safeBay ? (
          <span className="shrink-0 rounded-pill bg-brand-soft px-3 py-1.5 text-[0.75rem] font-semibold uppercase tracking-[0.06em] text-brand">
            Plaza {safeBay}
          </span>
        ) : null}
      </header>

      <OrderFlow
        menu={menu}
        pickup={pickup}
        storeName={settings.storeName}
        bay={safeBay}
        source={source}
      />
    </main>
  );
}
