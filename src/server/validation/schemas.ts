import { z } from 'zod';

import { LIMITS, RATING } from '@/lib/constants';

/**
 * Every value that crosses a trust boundary is parsed here before it reaches a
 * service. Parsing (not merely validating) means the rest of the codebase works
 * with narrowed, trimmed, correctly typed data and never re-checks it.
 */

/** Control characters: invisible in the admin UI, but they corrupt logs and CSV exports. */
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/g;

/** Collapses whitespace and strips control characters that break layout or logs. */
const cleanText = (max: number) =>
  z
    .string()
    .transform((s) => s.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim())
    .pipe(z.string().max(max));

const rating = z.coerce.number().int().min(RATING.min).max(RATING.max);

/**
 * Checkbox coercion.
 *
 * `z.coerce.boolean()` is `Boolean(value)`, so the *string* `"false"` becomes
 * `true` — which would silently flip every toggle the admin turned off. Match
 * the shapes HTML forms and JSON actually produce instead.
 */
const checkbox = z.preprocess(
  (v) => v === true || v === 'true' || v === 'on' || v === '1' || v === 1,
  z.boolean(),
);

const slug = z
  .string()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens only');

// ---------------------------------------------------------------------------
// Public: customer feedback
// ---------------------------------------------------------------------------

export const feedbackInputSchema = z.object({
  visitToken: z.string().min(20).max(200),
  storeRating: rating,
  staffCode: z.string().max(40).optional().nullable(),
  staffRating: rating.optional().nullable(),
  comment: cleanText(LIMITS.commentMaxLength).optional().nullable(),
  /** Ids of admin-authored chips the customer tapped. */
  suggestionIds: z
    .array(z.coerce.number().int().positive())
    .max(LIMITS.maxWishesPerFeedback)
    .default([]),
  /** One free-text wish typed by the customer. */
  customWish: cleanText(LIMITS.wishMaxLength).optional().nullable(),
  source: z.enum(['qr', 'nfc', 'link']).default('qr'),
  /**
   * Honeypot. A real customer never sees this field, so any value at all means
   * a bot filled the form in. Named to look attractive to naive scrapers.
   */
  website: z.string().max(200).optional().nullable(),
  /** Milliseconds the form was on screen. Sub-second submissions are automated. */
  elapsedMs: z.coerce
    .number()
    .int()
    .min(0)
    .max(1000 * 60 * 60 * 6)
    .optional(),
});

export type FeedbackInput = z.infer<typeof feedbackInputSchema>;

// ---------------------------------------------------------------------------
// Admin: authentication
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
  email: z.string().email().max(200).toLowerCase().trim(),
  password: z.string().min(1).max(LIMITS.passwordMaxLength),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(LIMITS.passwordMaxLength),
    newPassword: z
      .string()
      .min(LIMITS.passwordMinLength, `Use at least ${LIMITS.passwordMinLength} characters`)
      .max(LIMITS.passwordMaxLength),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'The two new passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    message: 'Choose a password you have not used here before',
    path: ['newPassword'],
  });

// ---------------------------------------------------------------------------
// Admin: store settings
// ---------------------------------------------------------------------------

/**
 * Google review links are the one place an admin can inject a URL that every
 * customer will be sent to. An open field here would turn the kiosk into a
 * phishing redirector the moment an admin account is compromised, so only
 * Google's own review endpoints are accepted.
 */
const GOOGLE_REVIEW_HOSTS = new Set([
  'search.google.com',
  'www.google.com',
  'google.com',
  'g.page',
  'maps.google.com',
  'maps.app.goo.gl',
]);

export const googleReviewUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine((value) => {
    if (value === '') return true;
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return false;
    }
    return url.protocol === 'https:' && GOOGLE_REVIEW_HOSTS.has(url.hostname.toLowerCase());
  }, 'Must be an https link on a Google domain (for example https://g.page/r/xxxx/review)');

/**
 * The second-platform link (for Levadura Madre: "Pedidos desde el coche").
 *
 * Unlike the Google field this cannot be host-allowlisted — it points at
 * whatever ordering platform the store uses. It is still constrained to https,
 * which rules out `javascript:`, `data:` and `file:` payloads, and every change
 * to it is written to the audit log precisely because it is an outbound link
 * a compromised admin would want to repoint.
 */
export const platformUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine((value) => {
    if (value === '') return true;
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Must be a full https link, for example https://pedidos.tu-tienda.com');

export const settingsSchema = z.object({
  slug,
  storeName: cleanText(LIMITS.storeNameMaxLength).pipe(z.string().min(1, 'Required')),
  welcomeHeadline: cleanText(LIMITS.copyMaxLength).pipe(z.string().min(1, 'Required')),
  welcomeSubline: cleanText(LIMITS.copyMaxLength),
  thanksHeadline: cleanText(LIMITS.copyMaxLength).pipe(z.string().min(1, 'Required')),
  thanksSubline: cleanText(LIMITS.copyMaxLength),
  googleReviewUrl: googleReviewUrlSchema,
  googlePlaceId: cleanText(120),
  askForStaffRating: checkbox,
  askForWishes: checkbox,
  askForComment: checkbox,

  pickupEnabled: checkbox,
  pickupName: cleanText(LIMITS.storeNameMaxLength),
  pickupTagline: cleanText(LIMITS.copyMaxLength),
  pickupUrl: platformUrlSchema,
  pickupAcceptingOrders: checkbox,
  // Shown to the customer as "unos N minutos". Bounded so a typo cannot promise
  // a wait of zero or of a day and a half.
  pickupPrepMinutes: z.coerce.number().int().min(1).max(120),
  // How many per-bay QR posters the Tags page generates.
  pickupBayCount: z.coerce.number().int().min(0).max(40),
  pickupCurrency: z.enum(['EUR', 'USD', 'GBP']),
  pickupClosedMessage: cleanText(LIMITS.copyMaxLength),
});

// ---------------------------------------------------------------------------
// Admin: team and suggestions
// ---------------------------------------------------------------------------

export const ACCENTS = ['indigo', 'amber', 'emerald', 'rose', 'sky', 'violet'] as const;
export type Accent = (typeof ACCENTS)[number];

export const staffSchema = z.object({
  name: cleanText(LIMITS.staffNameMaxLength).pipe(z.string().min(1, 'Required')),
  accent: z.enum(ACCENTS).default('indigo'),
  isActive: checkbox,
});

export const suggestionSchema = z.object({
  label: cleanText(LIMITS.suggestionLabelMaxLength).pipe(z.string().min(1, 'Required')),
  isActive: checkbox,
});

export const idSchema = z.coerce.number().int().positive();

// ---------------------------------------------------------------------------
// "Pedidos desde el coche" — ordering
// ---------------------------------------------------------------------------

/**
 * What the browser is allowed to say about an order.
 *
 * Note what is absent: no prices, no product names, no total. The client sends
 * ids and quantities; every currency figure is re-derived from the products
 * table. A customer with devtools open cannot buy the cheesecake for 1 cent.
 */
export const orderLineSchema = z.object({
  productId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().min(1).max(LIMITS.maxQuantityPerLine),
});

export const orderInputSchema = z.object({
  lines: z.array(orderLineSchema).min(1).max(LIMITS.maxOrderLines),

  /** Parking bay from the QR poster. Free text so "3", "B2" and "junto a la puerta" all work. */
  bay: cleanText(LIMITS.bayMaxLength).optional().nullable(),
  /** How the staff will recognise the car. The one field that must not be empty. */
  vehicle: cleanText(LIMITS.vehicleMaxLength).pipe(z.string().min(2, 'Describe tu coche')),
  customerName: cleanText(LIMITS.customerNameMaxLength).pipe(z.string().min(1, 'Escribe tu nombre')),
  /** Optional, and only used to call if something is wrong with the order. */
  phone: cleanText(32).optional().nullable(),
  notes: cleanText(LIMITS.orderNotesMaxLength).optional().nullable(),

  // Fase 1 collects at the car. 'online' is accepted by the schema so the
  // Stripe phase does not need a schema change, and rejected by the service
  // until payments are wired.
  paymentMethod: z.enum(['terminal', 'online']).default('terminal'),
  source: z.enum(['qr', 'nfc', 'link']).default('qr'),

  /** Honeypot — see feedbackInputSchema. */
  website: z.string().max(200).optional().nullable(),
  elapsedMs: z.coerce.number().int().min(0).max(1000 * 60 * 60 * 6).optional(),
});

export type OrderInput = z.infer<typeof orderInputSchema>;

/** A price typed as "4,20" or "4.20" becomes 420 cents. Never a float. */
export const priceInputSchema = z
  .string()
  .trim()
  .regex(/^\d{1,5}([.,]\d{1,2})?$/, 'Escribe un precio como 4,20')
  .transform((value) => {
    const [whole, fraction = ''] = value.replace(',', '.').split('.');
    return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  });

export const categorySchema = z.object({
  name: cleanText(60).pipe(z.string().min(1, 'Requerido')),
  isActive: checkbox,
});

export const productSchema = z.object({
  categoryId: z.coerce.number().int().positive(),
  name: cleanText(80).pipe(z.string().min(1, 'Requerido')),
  description: cleanText(160),
  priceCents: priceInputSchema,
  /** A single emoji stands in for a photo until object storage exists. */
  emoji: cleanText(8),
  imageUrl: platformUrlSchema,
  isActive: checkbox,
});

export const orderTransitionSchema = z.object({
  orderId: idSchema,
  from: z.enum(['pending_payment', 'new', 'preparing', 'ready', 'delivered', 'cancelled']),
  to: z.enum(['pending_payment', 'new', 'preparing', 'ready', 'delivered', 'cancelled']),
});

/** A service date as YYYY-MM-DD. Used for the daily close. */
export const serviceDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida');
