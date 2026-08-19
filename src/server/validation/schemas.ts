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
