import 'server-only';

import QRCode from 'qrcode';

import { env } from '@/lib/env';
import type { StaffMember, StoreSettings } from '@/types/domain';

export type TagKind = 'review' | 'platform' | 'bay';

export interface Tag {
  kind: TagKind;
  /** Stable key for React lists. */
  id: string;
  title: string;
  subtitle: string;
  /** The exact string written to the NFC tag and encoded in the QR code. */
  url: string;
  /** PNG data URI, rendered server-side so no QR library reaches the browser. */
  qrDataUri: string;
  /** The same destination, marked as an NFC read. Written to the physical tag. */
  nfcUrl: string;
}

/**
 * Error correction level M recovers ~15% of a damaged symbol. A tag stuck to a
 * shop counter gets scratched, smudged and partly covered, and M costs only a
 * slightly denser code than the L default.
 */
const QR_OPTIONS = {
  errorCorrectionLevel: 'M',
  margin: 1,
  width: 512,
  color: { dark: '#141419ff', light: '#ffffffff' },
} as const;

/** `/pedir/p/3` — the address printed under a per-bay poster. */
function orderUrl(options: { bay?: string; source: 'qr' | 'nfc' }): string {
  const path = options.bay ? `/pedir/p/${encodeURIComponent(options.bay)}` : '/pedir';
  const url = new URL(path, env.APP_ORIGIN);
  url.searchParams.set('s', options.source);
  return url.toString();
}

function kioskUrl(slug: string, options: { staffCode?: string; source: 'qr' | 'nfc' }): string {
  const url = new URL(`/r/${encodeURIComponent(slug)}`, env.APP_ORIGIN);
  if (options.staffCode) url.searchParams.set('t', options.staffCode);
  // Lets the dashboard tell a QR scan from an NFC tap without any extra tracking.
  url.searchParams.set('s', options.source);
  return url.toString();
}

export interface TagSet {
  store: Tag;
  people: Tag[];
  /** The ordering entry point — either the built-in menu or an external link. */
  platform: Tag | null;
  /** One poster per parking bay, per the concept document. */
  bays: Tag[];
}

/**
 * Builds every tag the owner can print or write.
 *
 * One counter tag for the review kiosk, one per team member, and — when it is
 * configured — one for the second platform. The per-person tag carries the team
 * member's code, so a rating is bound to the tag that was physically scanned
 * rather than to a choice the client is free to make.
 *
 * The second platform gets its own distinct QR on purpose: it is a different
 * destination for a different moment, and printing one code that tries to serve
 * both would force a menu in between and cost the tap it is meant to save.
 */
export async function buildTags(
  settings: StoreSettings,
  staff: readonly StaffMember[],
): Promise<TagSet> {
  const { slug } = settings;

  const store: Tag = {
    kind: 'review',
    id: 'store',
    title: 'Counter tag',
    subtitle: 'Anyone can use it. The customer picks who served them.',
    url: kioskUrl(slug, { source: 'qr' }),
    nfcUrl: kioskUrl(slug, { source: 'nfc' }),
    qrDataUri: await QRCode.toDataURL(kioskUrl(slug, { source: 'qr' }), QR_OPTIONS),
  };

  const people = await Promise.all(
    staff.map(async (person): Promise<Tag> => {
      const url = kioskUrl(slug, { staffCode: person.code, source: 'qr' });
      return {
        kind: 'review',
        id: person.code,
        title: person.name,
        subtitle: 'Skips the "who helped you?" step.',
        url,
        nfcUrl: kioskUrl(slug, { staffCode: person.code, source: 'nfc' }),
        qrDataUri: await QRCode.toDataURL(url, { ...QR_OPTIONS, width: 384 }),
      };
    }),
  );

  // The ordering tag. When the built-in module is on it points at our own menu;
  // an external link is honoured only as an explicit override, so a store that
  // has not adopted the built-in flow can still print one code.
  const orderingHref =
    settings.pickupEnabled && !settings.pickupUrl ? orderUrl({ source: 'qr' }) : settings.pickupUrl;

  const platform =
    settings.pickupEnabled && orderingHref
      ? ({
          kind: 'platform',
          id: 'platform',
          title: settings.pickupName || 'Pedidos desde el coche',
          subtitle: settings.pickupTagline || 'Su propio código, aparte del de reseñas.',
          url: orderingHref,
          nfcUrl: settings.pickupUrl ? settings.pickupUrl : orderUrl({ source: 'nfc' }),
          qrDataUri: await QRCode.toDataURL(orderingHref, QR_OPTIONS),
        } satisfies Tag)
      : null;

  // A poster per bay. The bay travels in the URL, so an order arrives already
  // saying "Plaza 3" and nobody has to walk the car park looking for a Clio.
  const bays: Tag[] =
    settings.pickupEnabled && !settings.pickupUrl
      ? await Promise.all(
          Array.from({ length: settings.pickupBayCount }, (_, index) => String(index + 1)).map(
            async (bay): Promise<Tag> => {
              const url = orderUrl({ bay, source: 'qr' });
              return {
                kind: 'bay',
                id: `bay-${bay}`,
                title: `Plaza ${bay}`,
                subtitle: 'El pedido llega ya con el número de plaza.',
                url,
                nfcUrl: orderUrl({ bay, source: 'nfc' }),
                qrDataUri: await QRCode.toDataURL(url, { ...QR_OPTIONS, width: 384 }),
              };
            },
          ),
        )
      : [];

  return { store, people, platform, bays };
}
