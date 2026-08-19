import 'server-only';

import QRCode from 'qrcode';

import { env } from '@/lib/env';
import type { StaffMember, StoreSettings } from '@/types/domain';

export type TagKind = 'review' | 'platform';

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
  /** Present only when the owner enabled a second platform and gave it a link. */
  platform: Tag | null;
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

  const platform =
    settings.pickupEnabled && settings.pickupUrl
      ? ({
          kind: 'platform',
          id: 'platform',
          title: settings.pickupName || 'Second platform',
          subtitle: settings.pickupTagline || 'Its own tag, printed separately.',
          url: settings.pickupUrl,
          // An external destination we do not control, so there is no source
          // marker to add — the URL is written exactly as the owner entered it.
          nfcUrl: settings.pickupUrl,
          qrDataUri: await QRCode.toDataURL(settings.pickupUrl, QR_OPTIONS),
        } satisfies Tag)
      : null;

  return { store, people, platform };
}
