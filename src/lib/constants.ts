/** Hard limits shared by validation, the database schema and the UI. */
export const LIMITS = {
  /** Free-text comment from a customer. */
  commentMaxLength: 500,
  /** Free-text "product I would like to see" wish. */
  wishMaxLength: 120,
  /** How many admin-authored suggestion chips a customer may tap. */
  maxWishesPerFeedback: 5,
  /** Display name of a team member. */
  staffNameMaxLength: 60,
  /** Admin-authored suggestion chip label. */
  suggestionLabelMaxLength: 60,
  /** Store name and marketing copy. */
  storeNameMaxLength: 80,
  copyMaxLength: 240,
  /** Ordering: bounds that keep one order from becoming a denial-of-service. */
  maxOrderLines: 40,
  maxQuantityPerLine: 50,
  bayMaxLength: 24,
  vehicleMaxLength: 60,
  customerNameMaxLength: 40,
  orderNotesMaxLength: 200,

  /** Password policy — length over composition rules (NIST SP 800-63B). */
  passwordMinLength: 12,
  passwordMaxLength: 128,
} as const;

export const RATING = { min: 1, max: 5 } as const;

/** Lifetimes, in seconds. */
export const TTL = {
  /** Idle timeout — a session unused for this long is rejected. */
  sessionIdle: 60 * 60 * 8,
  /** Absolute timeout — a session is rejected this long after login, always. */
  sessionAbsolute: 60 * 60 * 24 * 7,
  /** A scan token is minted on page load and dies shortly after. */
  visitToken: 60 * 30,
  /** How long a failed-login lockout lasts. */
  loginLockout: 60 * 15,
} as const;

/** Cookie names. `__Host-` prefix pins the cookie to the exact origin, no subdomains. */
export const COOKIES = {
  session: '__Host-leva_session',
  csrf: '__Host-leva_csrf',
} as const;

/** Development-mode cookie names — `__Host-` requires Secure, which plain HTTP forbids. */
export const DEV_COOKIES = {
  session: 'leva_session',
  csrf: 'leva_csrf',
} as const;

/**
 * CSRF token transport. Declared here rather than beside the verifier because
 * client components need the field name too, and the verifier module is
 * server-only.
 */
export const CSRF_FIELD = 'csrfToken';
export const CSRF_HEADER = 'x-csrf-token';
