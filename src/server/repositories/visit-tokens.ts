import 'server-only';

import { TTL } from '@/lib/constants';
import { getDb } from '@/server/db/client';
import { hashToken, randomToken } from '@/server/security/hash';
import type { Source } from '@/types/domain';

export interface VisitToken {
  id: number;
  staffId: number | null;
  source: Source;
}

/**
 * A scan credential.
 *
 * Minted server-side when the kiosk page renders and burned on submit, so the
 * public feedback endpoint is not something an attacker can simply POST to in a
 * loop. Only the digest is stored: a leaked database yields no spendable tokens.
 */
export function issueVisitToken(input: {
  staffId: number | null;
  source: Source;
  ipHash: string | null;
}): string {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + TTL.visitToken * 1000).toISOString();

  getDb()
    .prepare(
      `INSERT INTO visit_tokens (token_hash, staff_id, source, ip_hash, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(hashToken(token), input.staffId, input.source, input.ipHash, expiresAt);

  return token;
}

/**
 * Atomically marks a token used and returns what it was minted for.
 *
 * The `used_at IS NULL` guard is inside the UPDATE, so two concurrent
 * submissions of the same token race in SQLite and exactly one wins. Doing the
 * check as a separate SELECT would leave a window for a double submission.
 */
export function redeemVisitToken(token: string): VisitToken | null {
  const row = getDb()
    .prepare(
      `UPDATE visit_tokens
          SET used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE token_hash = ?
          AND used_at IS NULL
          AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        RETURNING id, staff_id, source`,
    )
    .get(hashToken(token)) as { id: number; staff_id: number | null; source: Source } | undefined;

  if (!row) return null;
  return { id: row.id, staffId: row.staff_id, source: row.source };
}

/** Housekeeping: tokens are useless once expired. */
export function pruneVisitTokens(): number {
  const info = getDb()
    .prepare(
      `DELETE FROM visit_tokens
        WHERE expires_at < datetime('now', '-1 day')`,
    )
    .run();
  return info.changes;
}
