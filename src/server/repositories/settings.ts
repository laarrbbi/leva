import 'server-only';

import { getDb } from '@/server/db/client';
import type { StoreSettings } from '@/types/domain';

interface SettingsRow {
  slug: string;
  store_name: string;
  welcome_headline: string;
  welcome_subline: string;
  thanks_headline: string;
  thanks_subline: string;
  google_review_url: string | null;
  google_place_id: string | null;
  ask_for_staff_rating: number;
  ask_for_wishes: number;
  ask_for_comment: number;
  pickup_enabled: number;
  pickup_name: string;
  pickup_tagline: string;
  pickup_url: string | null;
  pickup_accepting_orders: number;
  pickup_prep_minutes: number;
  pickup_bay_count: number;
  pickup_currency: string;
  pickup_closed_message: string;
}

const FALLBACK: StoreSettings = {
  slug: 'my-store',
  storeName: 'My Store',
  welcomeHeadline: 'How was your visit?',
  welcomeSubline: 'It takes about 20 seconds.',
  thanksHeadline: 'Thank you!',
  thanksSubline: 'Your feedback goes straight to the owner.',
  googleReviewUrl: null,
  googlePlaceId: null,
  askForStaffRating: true,
  askForWishes: true,
  askForComment: true,
  pickupEnabled: false,
  pickupName: 'Pedidos desde el coche',
  pickupTagline: 'Pide sin bajarte del coche.',
  pickupUrl: null,
  pickupAcceptingOrders: true,
  pickupPrepMinutes: 5,
  pickupBayCount: 6,
  pickupCurrency: 'EUR',
  pickupClosedMessage:
    'Ahora mismo no estamos aceptando pedidos. Te esperamos en el mostrador.',
};

function toDomain(row: SettingsRow): StoreSettings {
  return {
    slug: row.slug,
    storeName: row.store_name,
    welcomeHeadline: row.welcome_headline,
    welcomeSubline: row.welcome_subline,
    thanksHeadline: row.thanks_headline,
    thanksSubline: row.thanks_subline,
    googleReviewUrl: row.google_review_url,
    googlePlaceId: row.google_place_id,
    askForStaffRating: row.ask_for_staff_rating === 1,
    askForWishes: row.ask_for_wishes === 1,
    askForComment: row.ask_for_comment === 1,
    pickupEnabled: row.pickup_enabled === 1,
    pickupName: row.pickup_name,
    pickupTagline: row.pickup_tagline,
    pickupUrl: row.pickup_url,
    pickupAcceptingOrders: row.pickup_accepting_orders === 1,
    pickupPrepMinutes: row.pickup_prep_minutes,
    pickupBayCount: row.pickup_bay_count,
    pickupCurrency: row.pickup_currency,
    pickupClosedMessage: row.pickup_closed_message,
  };
}

const SELECT = `SELECT slug, store_name, welcome_headline, welcome_subline, thanks_headline,
                       thanks_subline, google_review_url, google_place_id,
                       ask_for_staff_rating, ask_for_wishes, ask_for_comment,
                       pickup_enabled, pickup_name, pickup_tagline, pickup_url,
                       pickup_accepting_orders, pickup_prep_minutes, pickup_bay_count,
                       pickup_currency, pickup_closed_message
                  FROM store_settings WHERE id = 1`;

/** Never throws: an unseeded database renders sensible placeholder copy. */
export function getSettings(): StoreSettings {
  const row = getDb().prepare(SELECT).get() as SettingsRow | undefined;
  return row ? toDomain(row) : FALLBACK;
}

export function findSettingsBySlug(slug: string): StoreSettings | null {
  const row = getDb()
    .prepare(`${SELECT.replace('WHERE id = 1', 'WHERE slug = ?')}`)
    .get(slug) as SettingsRow | undefined;
  return row ? toDomain(row) : null;
}

export function upsertSettings(input: StoreSettings): void {
  getDb()
    .prepare(
      `INSERT INTO store_settings (
         id, slug, store_name, welcome_headline, welcome_subline, thanks_headline,
         thanks_subline, google_review_url, google_place_id,
         ask_for_staff_rating, ask_for_wishes, ask_for_comment,
         pickup_enabled, pickup_name, pickup_tagline, pickup_url,
         pickup_accepting_orders, pickup_prep_minutes, pickup_bay_count,
         pickup_currency, pickup_closed_message, updated_at
       ) VALUES (1, @slug, @storeName, @welcomeHeadline, @welcomeSubline, @thanksHeadline,
                 @thanksSubline, @googleReviewUrl, @googlePlaceId,
                 @askForStaffRating, @askForWishes, @askForComment,
                 @pickupEnabled, @pickupName, @pickupTagline, @pickupUrl,
                 @pickupAcceptingOrders, @pickupPrepMinutes, @pickupBayCount,
                 @pickupCurrency, @pickupClosedMessage,
                 strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       ON CONFLICT (id) DO UPDATE SET
         slug = excluded.slug,
         store_name = excluded.store_name,
         welcome_headline = excluded.welcome_headline,
         welcome_subline = excluded.welcome_subline,
         thanks_headline = excluded.thanks_headline,
         thanks_subline = excluded.thanks_subline,
         google_review_url = excluded.google_review_url,
         google_place_id = excluded.google_place_id,
         ask_for_staff_rating = excluded.ask_for_staff_rating,
         ask_for_wishes = excluded.ask_for_wishes,
         ask_for_comment = excluded.ask_for_comment,
         pickup_enabled = excluded.pickup_enabled,
         pickup_name = excluded.pickup_name,
         pickup_tagline = excluded.pickup_tagline,
         pickup_url = excluded.pickup_url,
         pickup_accepting_orders = excluded.pickup_accepting_orders,
         pickup_prep_minutes = excluded.pickup_prep_minutes,
         pickup_bay_count = excluded.pickup_bay_count,
         pickup_currency = excluded.pickup_currency,
         pickup_closed_message = excluded.pickup_closed_message,
         updated_at = excluded.updated_at`,
    )
    .run({
      slug: input.slug,
      storeName: input.storeName,
      welcomeHeadline: input.welcomeHeadline,
      welcomeSubline: input.welcomeSubline,
      thanksHeadline: input.thanksHeadline,
      thanksSubline: input.thanksSubline,
      googleReviewUrl: input.googleReviewUrl || null,
      googlePlaceId: input.googlePlaceId || null,
      askForStaffRating: input.askForStaffRating ? 1 : 0,
      askForWishes: input.askForWishes ? 1 : 0,
      askForComment: input.askForComment ? 1 : 0,
      pickupEnabled: input.pickupEnabled ? 1 : 0,
      pickupName: input.pickupName,
      pickupTagline: input.pickupTagline,
      pickupUrl: input.pickupUrl || null,
      pickupAcceptingOrders: input.pickupAcceptingOrders ? 1 : 0,
      pickupPrepMinutes: input.pickupPrepMinutes,
      pickupBayCount: input.pickupBayCount,
      pickupCurrency: input.pickupCurrency,
      pickupClosedMessage: input.pickupClosedMessage,
    });
}

/**
 * Flips only the "are we taking orders right now?" switch.
 *
 * Separate from `upsertSettings` because the counter hits it mid-rush, and
 * making a pause depend on a valid full settings form would mean the button
 * fails exactly when it is needed most.
 */
export function setAcceptingOrders(accepting: boolean): void {
  getDb()
    .prepare(
      `UPDATE store_settings
          SET pickup_accepting_orders = ?,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = 1`,
    )
    .run(accepting ? 1 : 0);
}
