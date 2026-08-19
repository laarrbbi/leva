import 'server-only';

import { getDb } from '@/server/db/client';

export interface RateLimitRule {
  /** Namespace so two features never share a counter. */
  readonly name: string;
  /** Maximum hits allowed inside one window. */
  readonly limit: number;
  /** Window length in seconds. */
  readonly windowSeconds: number;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  /** Unix seconds at which the current window rolls over. */
  readonly resetAt: number;
}

/**
 * Rate limits applied across the app.
 *
 * Each protects a different resource, so each gets its own budget:
 *  - `feedback`   — the only unauthenticated write. Generous enough for a queue
 *                   of customers behind one shop NAT, tight enough to make
 *                   scripted ballot-stuffing pointless.
 *  - `visitToken` — caps how fast tokens can be minted, so an attacker cannot
 *                   farm a pile of them and spend them later.
 *  - `login`      — online password guessing, per IP. Complements the per-account
 *                   lockout, which stops distributed guessing at one account.
 *  - `adminWrite` — blast-radius cap on a hijacked admin session.
 */
export const RULES = {
  feedback: { name: 'feedback', limit: 20, windowSeconds: 60 * 10 },
  visitToken: { name: 'visit-token', limit: 60, windowSeconds: 60 * 10 },
  login: { name: 'login', limit: 10, windowSeconds: 60 * 15 },
  googleClick: { name: 'google-click', limit: 30, windowSeconds: 60 * 10 },
  adminWrite: { name: 'admin-write', limit: 120, windowSeconds: 60 * 5 },
} as const satisfies Record<string, RateLimitRule>;

/**
 * Fixed-window counter.
 *
 * A fixed window can allow up to 2x the limit across a window boundary. That is
 * an accepted trade for a single atomic UPSERT and no background sweeper on the
 * hot path — the limits here are sized for abuse prevention, not billing.
 */
export function consume(rule: RateLimitRule, identifier: string): RateLimitResult {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % rule.windowSeconds);
  const bucketKey = `${rule.name}:${identifier}`;

  const row = db
    .prepare(
      `INSERT INTO rate_limits (bucket_key, window_start, hits)
       VALUES (?, ?, 1)
       ON CONFLICT (bucket_key, window_start)
       DO UPDATE SET hits = hits + 1
       RETURNING hits`,
    )
    .get(bucketKey, windowStart) as { hits: number };

  // Opportunistic cleanup: ~1 request in 200 pays for pruning dead windows.
  if (Math.random() < 0.005) {
    db.prepare('DELETE FROM rate_limits WHERE window_start < ?').run(now - rule.windowSeconds * 4);
  }

  return {
    allowed: row.hits <= rule.limit,
    remaining: Math.max(0, rule.limit - row.hits),
    resetAt: windowStart + rule.windowSeconds,
  };
}

/** Identifier used when the client address is unknown — all such clients share one budget. */
export const ANONYMOUS_BUCKET = 'unknown';
