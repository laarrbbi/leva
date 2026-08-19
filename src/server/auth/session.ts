import 'server-only';

import { cookies } from 'next/headers';

import { COOKIES, DEV_COOKIES, TTL } from '@/lib/constants';
import { isProduction } from '@/lib/env';
import { getDb } from '@/server/db/client';
import { hashIp, hashToken, randomToken, safeEqual } from '@/server/security/hash';
import { getClientIp, getUserAgent } from '@/server/security/request';

export interface AuthenticatedUser {
  readonly id: number;
  readonly email: string;
  readonly displayName: string;
  readonly role: 'owner' | 'manager';
}

export interface ActiveSession {
  readonly id: number;
  readonly user: AuthenticatedUser;
  readonly csrfToken: string;
}

/**
 * `__Host-` is the strongest cookie prefix the platform offers: the browser
 * refuses the cookie unless it is Secure, Path=/ and has no Domain attribute,
 * which makes it impossible for a sibling subdomain to set or overwrite it.
 * It requires HTTPS, so plain names are used on a local HTTP dev server.
 */
const NAMES = isProduction ? COOKIES : DEV_COOKIES;

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: isProduction,
    // `lax` still sends the cookie on a top-level GET back from an external
    // site, which keeps the admin login redirect working, while blocking the
    // cross-site POSTs that CSRF depends on.
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

/** Issues a fresh session. Always call after a successful credential check — never reuse an id. */
export async function createSession(userId: number): Promise<{ csrfToken: string }> {
  const db = getDb();
  const token = randomToken();
  const csrfToken = randomToken();
  const expiresAt = new Date(Date.now() + TTL.sessionAbsolute * 1000).toISOString();

  const ipHash = hashIp(await getClientIp());
  const ua = (await getUserAgent())?.slice(0, 200) ?? null;

  db.prepare(
    `INSERT INTO sessions (user_id, token_hash, csrf_hash, ip_hash, user_agent, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(userId, hashToken(token), hashToken(csrfToken), ipHash, ua, expiresAt);

  const jar = await cookies();
  jar.set(NAMES.session, token, cookieOptions(TTL.sessionAbsolute));
  // Readable by client script on purpose: this is the double-submit half of the
  // CSRF pair. It is worthless without the HttpOnly session cookie beside it.
  jar.set(NAMES.csrf, csrfToken, { ...cookieOptions(TTL.sessionAbsolute), httpOnly: false });

  return { csrfToken };
}

interface SessionRow {
  id: number;
  user_id: number;
  csrf_hash: string;
  last_seen_at: string;
  expires_at: string;
  revoked_at: string | null;
  email: string;
  display_name: string;
  role: 'owner' | 'manager';
  is_active: number;
}

/**
 * Resolves the current session, enforcing both an idle and an absolute timeout.
 * Returns null for anything that is not a live session; callers must not be
 * able to distinguish "expired", "revoked" and "never existed".
 */
export async function getSession(): Promise<ActiveSession | null> {
  const jar = await cookies();
  const token = jar.get(NAMES.session)?.value;
  const csrfToken = jar.get(NAMES.csrf)?.value;
  if (!token || !csrfToken) return null;

  const db = getDb();
  const row = db
    .prepare(
      `SELECT s.id, s.user_id, s.csrf_hash, s.last_seen_at, s.expires_at, s.revoked_at,
              u.email, u.display_name, u.role, u.is_active
         FROM sessions s
         JOIN admin_users u ON u.id = s.user_id
        WHERE s.token_hash = ?`,
    )
    .get(hashToken(token)) as SessionRow | undefined;

  if (!row) return null;
  if (row.revoked_at) return null;
  if (!row.is_active) return null;

  const now = Date.now();
  if (new Date(row.expires_at).getTime() <= now) return null;
  if (now - new Date(row.last_seen_at).getTime() > TTL.sessionIdle * 1000) {
    db.prepare("UPDATE sessions SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").run(
      row.id,
    );
    return null;
  }

  // The CSRF cookie must belong to *this* session, not a stale one.
  if (!safeEqual(hashToken(csrfToken), row.csrf_hash)) return null;

  db.prepare(
    "UPDATE sessions SET last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
  ).run(row.id);

  return {
    id: row.id,
    csrfToken,
    user: {
      id: row.user_id,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
    },
  };
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(NAMES.session)?.value;

  if (token) {
    getDb()
      .prepare(
        "UPDATE sessions SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE token_hash = ?",
      )
      .run(hashToken(token));
  }

  jar.delete(NAMES.session);
  jar.delete(NAMES.csrf);
}

/** Revokes every session of a user — used after a password change. */
export function revokeAllSessions(userId: number): void {
  getDb()
    .prepare(
      `UPDATE sessions
          SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE user_id = ? AND revoked_at IS NULL`,
    )
    .run(userId);
}

/** Housekeeping: drop rows for sessions that can no longer be used. */
export function pruneExpiredSessions(): void {
  getDb()
    .prepare(
      `DELETE FROM sessions
        WHERE expires_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           OR (revoked_at IS NOT NULL AND revoked_at < datetime('now', '-30 days'))`,
    )
    .run();
}
